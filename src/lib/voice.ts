import { getMic, releaseMic } from './audio'
import { speakingNow, speakingSince } from './tts'
import { startListening, type Listener } from './listen'
import { caps } from './capabilities'
import { WAKE, afterWake } from './wake'
import { IDENTITY } from '../identity'

/**
 * The voice loop.
 *
 * One recogniser, running for the life of the page. It is never torn down for
 * a turn, and that single fact is most of what separates this from a kiosk:
 * the microphone is still open while JARVIS is talking, so you can cut him off
 * the way you would cut off a person.
 *
 * The obvious design — one recogniser hunting for the wake word, a second one
 * capturing the command, stopping the first to start the second because the
 * browser only hands out one at a time — is what this replaces. It works, but
 * nothing is listening during an answer, so barge-in is impossible, and every
 * restart leaves a quarter-second of deafness that eats whole wake words.
 *
 * Keeping the mic open costs one thing: JARVIS hears himself through the
 * speakers. That is handled here in text rather than in acoustics — see
 * `isEcho` — because the browser gives SpeechRecognition its own capture and
 * won't let us put a canceller in front of it.
 */

export type VoiceMode =
  /** Powered down. Only his name matters. */
  | 'wake'
  /** He is expecting you to speak. Everything is a command. */
  | 'command'
  /** He is thinking or talking. Anything you say is an interruption. */
  | 'guard'
  /** Something is playing that must not be transcribed at all. */
  | 'deaf'

export type VoiceHandlers = {
  /** Read fresh on every result, so the app never has to re-subscribe. */
  mode: () => VoiceMode
  /** Fired on his name, from a partial — waiting for endpointing feels slow.
   *  `trailing` is whatever followed it, so "Jarvis, what's the weather" is
   *  one breath rather than two turns. */
  onWake: (trailing: string) => void
  /** The user has genuinely started talking. This is the barge-in trigger. */
  onSpeechStart: () => void
  /** Any speech at all, whatever the mode — time to wake a sleeping brain. */
  onHearing?: () => void
  /** Live transcript, for the caption under the reactor. */
  onPartial: (text: string) => void
  /** A complete, endpointed utterance. */
  onUtterance: (text: string) => void
  /** The recogniser is unusable. Distinct from the user saying nothing. */
  onError: (message: string) => void
}

export type Voice = {
  stop: () => void
  /** True while a recogniser is actually running. */
  live: () => boolean
  /**
   * Push-to-talk (the owner, 2026-10-06: "only listen when I press the space
   * bar"): open the microphone for one turn. Nothing is heard — or sent
   * anywhere — until this is called.
   */
  open: () => void | Promise<void>
  /** The owner has finished: send what was said now, without waiting for quiet. */
  send: () => void
  /** Stop listening; the microphone itself is handed back after RELEASE_MS. */
  close: () => void
}

/**
 * The microphone is kept this long after a turn, so a quick follow-up starts
 * instantly, then handed back — the browser's "in use" light goes out.
 */
const RELEASE_MS = 30000
/** After Space-to-send, the words come back within a second; never wait longer than this. */
const SEND_WAIT_MS = 3000

// ---------------------------------------------------------------------------
// Endpointing
// ---------------------------------------------------------------------------

/** One utterance often produces several partials containing the name. */
const WAKE_DEBOUNCE = 1500

// The wake phrase itself — "Hey AYRA" and its mishearings — lives in wake.ts,
// built from config/identity.json, so this loop and App agree on it.

// ---------------------------------------------------------------------------
// Assembling one utterance out of several segments
// ---------------------------------------------------------------------------

/**
 * Why this exists.
 *
 * The voice-activity detector is an energy gate, and energy is a fact about the
 * room rather than about the sentence. It ends a segment after a fixed quiet
 * gap, so "what's the weather in — " *pause* " — London" is two segments, two
 * transcripts and, before this, two turns: the first one asking the model a
 * truncated question, the second arriving as a bare noun with no question left
 * to attach it to. People pause. They pause to think of the word, to look at
 * something, mid-list, before the important part. An assistant that treats the
 * first gap as the end of the thought is one you have to talk to carefully, and
 * having to talk carefully is the whole failure.
 *
 * So the segment is no longer the turn. Transcripts accumulate here, and the
 * turn fires only when the text looks finished AND the room has gone quiet.
 *
 * Crucially this costs nothing in the common case. A complete sentence with no
 * one speaking fires immediately — `holdFor` returns 0 — so the latency of an
 * ordinary question is exactly what it was. The waiting only happens when there
 * is a reason to wait.
 */

/**
 * Ending on one of these means the sentence is not over, whatever the silence
 * says. Function words only: they are closed-class, so the list is complete in
 * a way a content-word list could never be, and none of them is a plausible
 * last word of a real request.
 */
const CONTINUES =
  /\b(and|or|but|so|because|since|if|when|while|that|which|who|whose|to|of|in|on|at|by|for|with|from|about|into|onto|over|under|between|through|the|a|an|my|your|his|her|its|our|their|is|are|was|were|be|been|do|does|did|have|has|had|can|could|would|should|will|shall|might|must|like|than|then|as|very|really|just|some|any|all|both|either|neither)$/i

/** Trailing punctuation a transcriber emits mid-thought. */
const TRAILS = /[,;:–—-]$/

/**
 * A barge-in this soon after he starts a sentence is him, not you.
 *
 * Echo cancellation and the raised guard threshold stop most of his playback
 * reaching the detector, but the attack of the very first syllable is the
 * loudest, least-cancelled thing in the whole answer — it arrives before the
 * canceller has adapted to it. Without this, a long answer could interrupt
 * itself on its own first word, which reads as JARVIS refusing to speak.
 *
 * Kept short deliberately. This is the one window where a genuine interruption
 * is also least likely: the user has not yet heard enough to want to stop him.
 */
const SELF_GUARD_MS = 350

/**
 * A quiet gap this long with a finished-looking sentence ends the turn.
 *
 * Small on purpose: by the time a transcript reaches the assembler the detector
 * has already sat through SILENCE_MS of quiet and the transcriber has taken its
 * own few hundred milliseconds, so roughly a second of real silence has passed
 * already. All this window has to catch is someone drawing breath to add one
 * more clause. Making it generous here is what would make every ordinary
 * question feel slow.
 */
const SETTLE_MS = 250
/** ...and this long when the sentence is plainly unfinished. */
const CONTINUE_MS = 1600
/**
 * Nothing is held longer than this in total. A ceiling rather than a timer:
 * without it, someone who ends every clause on "and" could hold a turn open
 * for ever, and the assistant would look like it had stopped listening.
 */
const MAX_HOLD_MS = 6000

/**
 * How long to keep waiting, given what has been said so far.
 * 0 means "this is a complete thought, send it now".
 */
function holdFor(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return CONTINUE_MS
  // An explicit terminator is the speaker telling us they are done.
  if (/[.!?]$/.test(text)) return 0
  if (TRAILS.test(text.trim())) return CONTINUE_MS
  if (CONTINUES.test(words[words.length - 1])) return CONTINUE_MS
  // One or two words is usually the start of something, not the whole of it —
  // except for the short commands that genuinely are complete.
  if (words.length <= 2 && !OVERRIDE.test(text)) return CONTINUE_MS
  return SETTLE_MS
}

type Assembler = {
  /** Add a transcript. `active` is true if the user is audibly still going. */
  feed: (text: string, active: boolean) => void
  /** Send whatever is held right now, if anything. */
  flush: () => void
  /** Throw away whatever is held — used when he stands down. */
  cancel: () => void
  held: () => string
}

function makeAssembler(h: {
  emit: (text: string) => void
  partial: (text: string) => void
}): Assembler {
  let held = ''
  let timer: ReturnType<typeof setTimeout> | null = null
  let firstAt = 0

  const clear = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }

  const fire = () => {
    clear()
    const text = held.trim()
    held = ''
    firstAt = 0
    if (text) h.emit(text)
  }

  return {
    feed(text, active) {
      if (!text.trim()) return
      held = `${held} ${text}`.replace(/\s+/g, ' ').trim()
      if (!firstAt) firstAt = Date.now()
      // The caption shows the whole thought as it assembles, not just the
      // fragment that happened to arrive last.
      h.partial(held)
      diag.holding = held
      clear()

      // Already talking again. Decide nothing now — the next transcript is
      // part of this same sentence and will bring more of it.
      if (active) {
        timer = setTimeout(fire, MAX_HOLD_MS)
        return
      }

      const wait = Math.min(
        holdFor(held),
        Math.max(0, MAX_HOLD_MS - (Date.now() - firstAt)),
      )
      diag.waitedMs = wait
      if (wait === 0) {
        fire()
        return
      }
      timer = setTimeout(fire, wait)
    },
    flush: fire,
    cancel() {
      clear()
      held = ''
      firstAt = 0
      diag.holding = ''
    },
    held: () => held,
  }
}

// ---------------------------------------------------------------------------
// Hearing himself
// ---------------------------------------------------------------------------

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Short words that must always cut through, even when they collide with what
 * he happens to be saying. Suppressing "stop" because he just said "stop"
 * would be the single most infuriating failure this file could have.
 */
const OVERRIDE = new RegExp(
  `\\b(stop|wait|cancel|enough|quiet|hold on|shut up|never ?mind|forget it|no|${IDENTITY.wake.names.join('|')})\\b`,
  'i',
)

/**
 * Words too common to be evidence of anything.
 *
 * This set is the difference between a usable filter and an infuriating one.
 * "What about the second one?" is a perfectly ordinary follow-up, and every
 * word in it is likely to appear somewhere in the answer it follows — so a
 * naive bag-of-words match suppresses the user's real question as an echo.
 * Only distinctive words count as proof he is hearing himself.
 */
const STOP = new Set(
  ('a an the and or but so of to in on at by for with from is are was were be ' +
    'it its this that these those i you he she we they me him her them my your ' +
    'our their what which who how why when where do does did can could would ' +
    'should will shall not no yes if then than as about into over under out up ' +
    'down one two three first second third now here there just very really got ' +
    'get have has had say said tell me okay ok well right').split(' '),
)

/**
 * Is this the microphone hearing the speakers?
 *
 * Compared as bags of words rather than by string distance: the recogniser
 * mangles its own playback badly enough that a substring match rarely holds,
 * but the *words* survive.
 */
function isEcho(heard: string, spoken: string): boolean {
  if (!spoken) return false
  if (OVERRIDE.test(heard)) return false

  const all = norm(heard).split(' ').filter(Boolean)
  if (!all.length) return true

  const mine = new Set(norm(spoken).split(' '))
  const content = all.filter((w) => !STOP.has(w))

  // Nothing distinctive was said at all, so there is no strong evidence either
  // way. Demand a total match before discarding it — the cost of dropping a
  // real question is much higher than the cost of one stray echo getting in.
  if (content.length < 2) {
    if (all.length < 2) return false
    return all.every((w) => mine.has(w))
  }

  let hits = 0
  for (const w of content) if (mine.has(w)) hits++
  return hits / content.length >= 0.6
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

/**
 * Live state of the voice loop, published on `window.__voice`.
 *
 * When someone says the wake word and nothing happens there are only a handful
 * of possible causes — the recogniser never started, it started and died, it is
 * running but hearing silence, or it is hearing you and transcribing the name
 * as something else. From outside the page those are indistinguishable, which
 * makes the failure impossible to report and impossible to fix. This tells them
 * apart in one glance.
 */
export const diag = {
  /** Which input engine is running: 'elevenlabs-live' (Scribe Realtime) or 'browser'. */
  engine: 'browser',
  /** Whether the microphone pipeline is live. */
  running: false,
  /** Speech segments captured since load. */
  sessions: 0,
  /** The most recent transcript, whatever the mode. */
  heard: '',
  heardAt: 0,
  /** Last failure — a transcription error, or a capture error. */
  lastError: '',
  /** Times the wake word matched. */
  wakes: 0,
  /** Current mode, as the app last reported it. */
  mode: '',
  /** Why the last transcript was ignored — '' when it was accepted. */
  dropped: '',
  /** Transcripts accepted and passed to the app. */
  accepted: 0,
  /** Text assembled but not yet sent, because the thought looks unfinished. */
  holding: '',
  /** How long the assembler decided to wait before sending, in ms. */
  waitedMs: 0,
  /** Barge-ins suppressed because he had only just started the sentence. */
  selfGuarded: 0,
  /** Transcription failures (network, or the bridge speech proxy). */
  restarts: 0,
  /** Milliseconds the last transcription round-trip took. */
  idleMs: 0,
}

/** Record why a transcript went nowhere. Silence always has a reason; this is
 *  the difference between debugging it and speculating about it. */
function drop(why: string) {
  diag.dropped = why
}

if (typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__voice = diag
}

/**
 * Pick the voice engine and start it.
 *
 * Two engines, chosen by what the bridge reported at boot (see capabilities.ts):
 *   - ElevenLabs available -> voice-activity detection on the audio thread for
 *     instant barge-in, and ElevenLabs Scribe Realtime streaming the words
 *     (listen.ts). The fast path; it falls back to the next one by itself.
 *   - nothing configured -> the browser's own SpeechRecognition, so a student
 *     with no keys still has a working assistant. Less robust, but free and
 *     zero-setup, and guarded by a heartbeat so its silent death is recovered.
 *
 * The microphone is opened once here so a denied permission is reported loudly
 * rather than surfacing later as an unexplained deafness, whichever engine runs.
 */
export async function startVoice(h: VoiceHandlers): Promise<Voice> {
  try {
    await getMic()
  } catch (err) {
    diag.lastError = 'mic'
    h.onError(
      err instanceof DOMException && err.name === 'NotAllowedError'
        ? 'Microphone access denied — voice input is unavailable.'
        : 'No microphone available.',
    )
    return { stop: () => {}, live: () => false, open: () => {}, send: () => {}, close: () => {} }
  }
  diag.engine = caps().stt ? 'elevenlabs-live' : 'browser'
  const v = caps().stt ? await startLiveVoice(h) : startBrowserVoice(h)
  // Asked for at power-on so a refused permission shows at once — then let go
  // until the owner presses Space.
  v.close()
  return v
}

/**
 * Live hearing: speech detected on the audio thread, words streamed from
 * ElevenLabs Scribe Realtime through the bridge (listen.ts, bridge/listen.mjs).
 *
 * If ElevenLabs refuses — free credits used up, a bad key, the service down —
 * it hands over to the browser's own recogniser for the rest of the session and
 * says so once, rather than going deaf (task 4.5).
 */
async function startLiveVoice(h: VoiceHandlers): Promise<Voice> {
  let lastWake = 0
  let listener: Listener | null = null
  let fallback: Voice | null = null
  let lastMode: VoiceMode | '' = ''
  /** A partial has arrived for the segment being spoken — the caption has words. */
  let worded = false
  /** Push-to-talk: listening for a turn right now. */
  let armed = false
  /** Space pressed to send: the next words end the turn at once. */
  let sending = false
  let sendTimer: ReturnType<typeof setTimeout> | null = null
  let releaseTimer: ReturnType<typeof setTimeout> | null = null
  let opening: Promise<Listener | null> | null = null

  /**
   * Transcripts become turns here rather than one-per-segment.
   * See makeAssembler for why.
   */
  const assemble = makeAssembler({
    emit: (text) => {
      diag.dropped = ''
      diag.accepted++
      diag.holding = ''
      h.onUtterance(text)
    },
    partial: (text) => h.onPartial(text),
  })

  /**
   * The finished words of one segment. The mode is read now, not when the
   * speech began: a barge-in flips 'guard' to 'listening' in between, and the
   * words belong to the mode the user is in now.
   */
  const hear = (said: string) => {
    const mode = h.mode()
    if (mode === 'deaf') return
    if (!said) {
      drop('nothing intelligible in the segment')
      return
    }
    // Her own voice, come back through the microphone. The raised guard
    // threshold stops most of it at the door; this catches the rest.
    if (isEcho(said, speakingNow())) {
      drop('echo of his own voice')
      return
    }
    diag.heard = said
    diag.heardAt = Date.now()
    diag.lastError = ''

    if (mode === 'wake') {
      if (WAKE.test(said) && Date.now() - lastWake > WAKE_DEBOUNCE) {
        lastWake = Date.now()
        diag.wakes++
        diag.dropped = ''
        diag.accepted++
        // She is about to listen; have the transcriber ready before they speak.
        listener?.warm()
        h.onWake(afterWake(said))
      } else {
        drop(`heard "${said.slice(-40)}" — not his name`)
      }
      return
    }

    // Space was pressed to send: these words finish the turn, whatever they say.
    if (sending) {
      assemble.feed(said, false)
      finishSend()
      return
    }

    // Not a turn yet — a piece of one. The assembler decides when the thought
    // is finished, reading the words and whether the user is still talking.
    assemble.feed(said, listener?.meter().speaking ?? false)
  }

  const finishSend = () => {
    if (sendTimer) clearTimeout(sendTimer)
    sendTimer = null
    sending = false
    assemble.flush()
  }

  const fallBack = (why: string) => {
    if (fallback) return
    clearInterval(guardPoll)
    listener?.stop()
    listener = null
    assemble.cancel()
    diag.engine = 'browser'
    diag.lastError = why
    h.onError(`Live hearing is unavailable (${why}) — switched to the browser's recogniser.`)
    fallback = startBrowserVoice(h)
    if (armed) void fallback.open()
  }

  const guardPoll = setInterval(() => {
    const mode = h.mode()
    diag.mode = mode
    // Raise the trigger bar exactly while she speaks.
    listener?.setGuard(mode === 'guard')
    // A listening window has opened: get the transcriber ready (≈0.5 s).
    if (mode === 'command' && lastMode !== 'command') listener?.warm()
    lastMode = mode
    // She has stood down — anything half-said belonged to a conversation that
    // is over, and must not open the next one.
    if ((mode === 'wake' || mode === 'deaf') && assemble.held()) assemble.cancel()
  }, 200)

  const handlers: Parameters<typeof startListening>[1] = {
      onStart: () => {
        const mode = h.mode()
        diag.mode = mode
        diag.sessions++
        worded = false
        if (mode === 'deaf') return
        h.onHearing?.()
        // Standing down mid-thought throws the thought away with it.
        if (mode === 'wake') assemble.cancel()
        // The barge-in: the user has started talking over her, and because the
        // guard threshold is high this is a real interruption, not playback.
        if (mode === 'guard') {
          const since = speakingSince()
          if (since && Date.now() - since < SELF_GUARD_MS) {
            diag.selfGuarded++
            return
          }
          h.onSpeechStart()
        }
      },
      // Space pressed with nothing said: send whatever is held, if anything.
      onEnd: (empty) => {
        if (empty && sending) finishSend()
      },
      onPartial: (text) => {
        if (h.mode() !== 'command' || !text.trim()) return
        worded = true
        const carried = assemble.held()
        h.onPartial(carried ? `${carried} ${text}` : text)
      },
      onFinal: (text) => hear(text.trim()),
      onLevel: (v) => {
        // Before the first words arrive, show that she can hear something.
        if (h.mode() !== 'command' || worded || assemble.held()) return
        h.onPartial(v > 0.04 ? '…' : '')
      },
      onError: (code, message) => {
        diag.restarts++
        diag.lastError = `${code}: ${message}`
        // Moments, not failures: a segment with nothing in it, a burst limit.
        if (code === 'insufficient_audio_activity' || code === 'commit_throttled') {
          if (sending) finishSend()
          return
        }
        fallBack(code)
      },
  }

  /** The microphone and its worklet, started on the first Space and kept for RELEASE_MS. */
  const ensure = async (): Promise<Listener | null> => {
    if (listener?.live()) return listener
    opening ??= (async () => {
      try {
        listener = await startListening(await getMic(), handlers)
        // The worklet starts armed; it must not hear anything until asked.
        listener.arm(armed)
      } catch (err) {
        listener = null
        fallBack(`could not start: ${(err as Error)?.message ?? err}`)
      }
      diag.running = Boolean(listener?.live())
      return listener
    })().finally(() => {
      opening = null
    })
    return opening
  }

  const release = () => {
    releaseTimer = null
    if (armed) return
    listener?.stop()
    listener = null
    releaseMic()
    diag.running = false
  }

  return {
    stop: () => {
      clearInterval(guardPoll)
      if (releaseTimer) clearTimeout(releaseTimer)
      assemble.cancel()
      listener?.stop()
      fallback?.stop()
      releaseMic()
      diag.running = false
    },
    live: () => (fallback ? fallback.live() : (listener?.live() ?? false)),
    open: async () => {
      armed = true
      if (releaseTimer) clearTimeout(releaseTimer)
      releaseTimer = null
      if (fallback) return fallback.open()
      const l = await ensure()
      // Closed again while the microphone was still opening.
      if (!armed || !l) return
      l.arm(true)
      l.warm()
    },
    send: () => {
      if (fallback) return fallback.send()
      if (!listener || !armed) {
        assemble.flush()
        return
      }
      sending = true
      if (sendTimer) clearTimeout(sendTimer)
      sendTimer = setTimeout(finishSend, SEND_WAIT_MS)
      listener.finish()
    },
    close: () => {
      armed = false
      sending = false
      if (sendTimer) clearTimeout(sendTimer)
      sendTimer = null
      assemble.cancel()
      if (fallback) return fallback.close()
      listener?.arm(false)
      if (releaseTimer) clearTimeout(releaseTimer)
      releaseTimer = setTimeout(release, RELEASE_MS)
    },
  }
}

/* -------------------------------------------------------------------------- */
/* Browser fallback: SpeechRecognition                                        */
/* -------------------------------------------------------------------------- */

/**
 * The keyless path. Uses the browser's own SpeechRecognition for both detection
 * and transcription, so a student who has configured nothing still gets voice.
 *
 * It is the flakier engine — Chrome throttles it and it can go silent with no
 * event to catch — so a heartbeat watches it and forces a fresh session
 * whenever it stops showing signs of life. That single guard is the difference
 * between "the wake word stopped working halfway through the lesson" and an
 * assistant that keeps listening.
 */
function startBrowserVoice(h: VoiceHandlers): Voice {
  const Ctor =
    (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
  if (!Ctor) {
    h.onError('This browser has no speech recognition — use Chrome or Edge, or add an ElevenLabs key.')
    return { stop: () => {}, live: () => false, open: () => {}, send: () => {}, close: () => {} }
  }

  let stopped = false
  /** Push-to-talk: the recogniser runs only between open() and close(). */
  let armed = false
  let releaseTimer: ReturnType<typeof setTimeout> | null = null
  let running = false
  let rec: any = null
  let settled = ''
  let interim = ''
  let started = false
  let barged = false
  let lastWake = 0
  let lastAlive = Date.now()
  let silenceTimer: ReturnType<typeof setTimeout> | null = null

  /** Same assembly rules as the premium path — a pause is not a full stop. */
  const assemble = makeAssembler({
    emit: (text) => {
      diag.dropped = ''
      diag.accepted++
      diag.holding = ''
      h.onUtterance(text)
    },
    partial: (text) => h.onPartial(text),
  })

  const touch = () => {
    lastAlive = Date.now()
  }

  const clearSilence = () => {
    if (silenceTimer) clearTimeout(silenceTimer)
    silenceTimer = null
  }

  const reset = () => {
    clearSilence()
    settled = ''
    interim = ''
    started = false
    barged = false
  }

  const emit = () => {
    const text = `${settled} ${interim}`.replace(/\s+/g, ' ').trim()
    const mode = h.mode()
    reset()
    if (!text || mode === 'deaf') return
    if (isEcho(text, speakingNow())) {
      drop('echo of his own voice')
      return
    }
    diag.heard = text
    diag.heardAt = Date.now()
    if (mode === 'wake') {
      assemble.cancel()
      if (WAKE.test(text) && Date.now() - lastWake > WAKE_DEBOUNCE) {
        lastWake = Date.now()
        diag.wakes++
        diag.dropped = ''
        diag.accepted++
        h.onWake(afterWake(text))
      } else {
        drop(`heard "${text.slice(-40)}" — not his name`)
      }
      return
    }
    // The recogniser has already endpointed on its own 900ms gap; the assembler
    // decides whether that gap actually ended the thought. `false` because a
    // result only reaches here once the recogniser has gone quiet.
    assemble.feed(text, false)
  }

  const bumpSilence = () => {
    clearSilence()
    // Endpoint on a short quiet gap; the ElevenLabs path tunes this more
    // finely, but a fixed window is plenty for the fallback.
    silenceTimer = setTimeout(emit, 900)
  }

  const onResult = (e: any) => {
    touch()
    const mode = h.mode()
    diag.mode = mode
    if (mode === 'deaf') {
      interim = ''
      return
    }
    let fresh = ''
    interim = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const chunk = e.results[i][0].transcript as string
      if (e.results[i].isFinal) fresh += chunk
      else interim += chunk
    }
    const heard = `${settled}${fresh} ${interim}`.replace(/\s+/g, ' ').trim()
    if (!heard) return
    if (isEcho(`${fresh} ${interim}`, speakingNow())) {
      interim = ''
      return
    }

    if (mode === 'wake') {
      settled += fresh
      if (WAKE.test(heard) && Date.now() - lastWake > WAKE_DEBOUNCE) {
        lastWake = Date.now()
        diag.wakes++
        const trailing = afterWake(heard)
        reset()
        h.onWake(trailing)
      } else if (settled.length > 400) {
        settled = ''
      }
      return
    }

    settled += fresh
    const full = `${settled} ${interim}`.replace(/\s+/g, ' ').trim()
    if (!started || (mode === 'guard' && !barged)) {
      const words = full.split(/\s+/).filter(Boolean).length
      if (mode === 'guard') {
        // An override word cuts through everything below it — "stop" has to
        // work on the first syllable or it is not a stop button.
        if (!OVERRIDE.test(full)) {
          // His own first syllable, same as the premium path. This engine has
          // no energy gate, so without the clock the only defence is the word
          // count below, and a single clear word is exactly what leaks first.
          const since = speakingSince()
          if (since && Date.now() - since < SELF_GUARD_MS) {
            diag.selfGuarded++
            return
          }
          // Two words before this engine believes an interruption. The energy
          // path can be instant because it triggers on loudness the canceller
          // has already had a pass at; here the evidence is a transcript of
          // audio that includes his own playback, and one word of that is not
          // evidence of anything.
          if (words < 2) return
        }
      }
      started = true
      if (mode === 'guard') barged = true
      h.onSpeechStart()
    }
    diag.dropped = ''
    // Show the whole thought, not just the fragment being spoken now — there
    // may be an earlier half of it held by the assembler.
    const carried = assemble.held()
    h.onPartial(carried ? `${carried} ${full}` : full)
    bumpSilence()
  }

  const spin = () => {
    if (stopped || running || !armed) return
    rec = new Ctor()
    rec.continuous = true
    rec.interimResults = true
    // The owner's own English (en-IN by default) — a recogniser tuned to the
    // speaker's accent mishears far less, wake word included.
    rec.lang = IDENTITY.language
    rec.onstart = () => {
      running = true
      diag.running = true
      diag.sessions++
      touch()
    }
    rec.onresult = onResult
    rec.onerror = (ev: any) => {
      diag.lastError = String(ev.error ?? '')
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        stopped = true
        diag.running = false
        h.onError('Microphone access was refused — voice input is unavailable.')
      }
    }
    rec.onend = () => {
      running = false
      diag.running = false
      touch()
      rec = null
      if (!stopped && armed) setTimeout(spin, 80)
    }
    try {
      rec.start()
    } catch {
      running = false
      setTimeout(spin, 250)
    }
  }

  // The heartbeat. If nothing has been heard from the engine for a while it has
  // gone quiet on us — tear it down and build a fresh one.
  const health = setInterval(() => {
    if (stopped || !armed) return
    const idle = Date.now() - lastAlive
    diag.idleMs = idle
    if (idle < 15000) return
    diag.restarts++
    try {
      rec?.abort()
    } catch {
      /* already gone */
    }
    rec = null
    running = false
    diag.running = false
    touch()
    spin()
  }, 5000)

  return {
    stop: () => {
      stopped = true
      clearInterval(health)
      clearSilence()
      assemble.cancel()
      diag.running = false
      try {
        rec?.abort()
      } catch {
        /* noop */
      }
      releaseMic()
    },
    live: () => running,
    open: () => {
      armed = true
      if (releaseTimer) clearTimeout(releaseTimer)
      releaseTimer = null
      touch()
      spin()
    },
    send: () => {
      clearSilence()
      emit()
      assemble.flush()
    },
    close: () => {
      armed = false
      reset()
      assemble.cancel()
      try {
        rec?.abort()
      } catch {
        /* already gone */
      }
      if (releaseTimer) clearTimeout(releaseTimer)
      releaseTimer = setTimeout(releaseMic, RELEASE_MS)
    },
  }
}
