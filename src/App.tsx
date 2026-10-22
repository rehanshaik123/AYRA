import { useEffect, useRef } from 'react'
import { Avatar } from './ui/Avatar'
import { Hud } from './ui/Hud'
import { Boot } from './ui/Boot'
import { Diagnostics } from './ui/Diagnostics'
import { useStore, MODE_KEY, modeLine, parseMode, type Hearing, type Mode, type Phase } from './store'
import { startVoice, type Voice, type VoiceMode } from './lib/voice'
import { createSpeaker, cycleVoice, currentVoiceName, prefetchLines } from './lib/tts'
import * as sfx from './lib/sfx'
import { forTool, attention, COMMON_LINES } from './lib/fillers'
import {
  ask,
  warmBridge,
  warmBrain,
  interrupt,
  watchServers,
  watchBlades,
  watchApprovals,
  answerApproval,
  haltAll,
  watchConnection,
  watchHearing,
  watchTalk,
  media,
  reportHearing,
  reportFace,
  bridgeServers,
} from './lib/bridge'
import { inputLevel } from './lib/listen'
import { glance, sameGlance, type Glance } from './lib/glance'
import { caps, probeCapabilities } from './lib/capabilities'
import { BARE_NAME, LEADING_NAME, addressed, afterWake, followUpCommand, followUpVerdict, onlyName } from './lib/wake'
import { withHonorific } from './identity'

/**
 * The conversation.
 *
 * This used to be a sequential loop — greet, await a capture, await an answer,
 * repeat — with the microphone opened and closed around each step. That shape
 * cannot be interrupted: while it is awaiting the answer, nothing is listening,
 * so there is no way for the user to get a word in.
 *
 * It is an event machine now. The voice loop runs continuously and pushes
 * events at us; every one of them is legal in every phase. Saying anything at
 * all stops him talking, and whatever you say next becomes the new turn.
 */

/** How long to wait for someone to start speaking after he wakes. Generous:
 *  people say his name and *then* think about what they wanted. */
const AWAIT_SPEECH_MS = 14000

/**
 * Push-to-talk (the owner, 2026-10-06): "she keeps listening, which is not
 * necessary… only listen when I press the space bar once and stop when I hit it
 * twice" — and an open microphone heard the videos playing in other tabs and
 * answered them. So: Space once listens, Space again sends, two quick presses
 * stop everything. No wake word, no follow-up window, no voice barge-in.
 */
const DOUBLE_TAP_MS = 400

/** Once the owner is talking, the "nobody spoke" timeout gives way to this ceiling. */
const LONGEST_TURN_MS = 60000

/**
 * A pause sends a turn by itself; a Space pressed this soon after is the owner
 * meaning "send" a moment late — not an interruption of what they just asked.
 */
const SEND_GRACE_MS = 1500

/**
 * Hands-free (the owner, 2026-10-11: "build another feature where she listens
 * and waits for me to command again when I'm actively working… design it so
 * she starts listening if I say AYRA from anywhere"). Space stays as it is; W
 * (or Ctrl+Alt+W / the tray from any app) switches hands-free on: an offline
 * spotter listens for her name (bridge/wake.mjs), she answers, and then keeps
 * listening this long for a follow-up without her name before going back to
 * waiting for it. Short on purpose: a video playing nearby can't hold her.
 */
/**
 * After every answer she listens this long for more, and a sentence counts only
 * when it starts with "OK" (or her name). The owner, 2026-10-18: "wait for 1
 * min after finishing the task"; 2026-10-22: "her name needed 2–3 times… keep
 * listening and react only when I say a sentence starting with ok", 2 minutes.
 * Whatever was playing stays paused until these minutes end (their choice), and
 * a sentence that came from the laptop's speakers — a video's "okay, so…" —
 * never counts (bridge/listen.mjs, the speaker meter).
 */
const FOLLOW_UP_MS = 120_000

/**
 * Said in those minutes without "OK": shown (her window and the bubble) rather
 * than dropped in silence — the owner, 2026-10-20: "for the second command she
 * keeps listening and doesn't respond".
 */
const FOLLOW_HINT = 'Start with "OK", or press Space'
const FOLLOW_HINT_MS = 4000

/** A follow-up that only ends the conversation — no question for the model. */
// Not "stop": with the music playing again in the minute after an answer,
// "AYRA, stop" means the music — the bridge's fast path pauses it.
const DISMISS = /^(that'?s (all|it)|thanks?|thank you|nothing|no thanks|never ?mind|bye|okay,? thanks?)[\s.!]*$/i

/** Push-to-talk or hands-free, remembered per browser. */
const HEARING_KEY = 'ayra.hearing'
const savedHearing = (): Hearing => {
  try {
    return localStorage.getItem(HEARING_KEY) === 'hands-free' ? 'hands-free' : 'push'
  } catch {
    return 'push'
  }
}

/** Normal or researcher mode (R), remembered per browser the same way. */
const savedMode = (): Mode => {
  try {
    return parseMode(localStorage.getItem(MODE_KEY))
  } catch {
    return 'normal'
  }
}

/** How long the boot sequence (Boot.tsx) stays up. The bridge connecting and
 *  the voice probe run under it, not after it; the old nine seconds were pure
 *  wait, and since 2026-10-20 she listens the moment it ends. */
const BOOT_MS = 1800
/** The bubble's report: at most this often while words stream (lib/glance.ts). */
const GLANCE_MS = 150

/** A spoken answer to an Approve card. Hindi yes/no too — the owner's own words. */
const SAID_YES = /^(yes|yeah|yep|yup|sure|ok(ay)?|go ahead|do it|allow( it)?|approve(d)?|confirm(ed)?|haan|ha)\b/i
const SAID_NO = /^(no|nope|nah|don'?t|do not|cancel|stop|deny|decline|nahi|na)\b/i

/** "Still" mode (the L key): no animation, no level pump. Remembered per browser. */
const STILL_KEY = 'ayra.still'
const still = () => document.documentElement.dataset.still === '1'
function setStill(on: boolean) {
  document.documentElement.dataset.still = on ? '1' : '0'
  try {
    localStorage.setItem(STILL_KEY, on ? '1' : '0')
  } catch {
    /* not remembered this time, nothing worse */
  }
}
try {
  setStill(localStorage.getItem(STILL_KEY) === '1')
} catch {
  setStill(false)
}

/** crypto.randomUUID needs a secure context, which a LAN address over plain
 *  http is not. Not worth failing a whole turn over an id. */
const newId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `id${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`

// BARE_NAME and LEADING_NAME come from wake.ts — the same mishearings the voice
// loop wakes on, so a turn that woke on "Aira" never sends that word on to the
// model as a question.

export default function App() {
  const store = useStore
  const speaker = useRef<ReturnType<typeof createSpeaker> | null>(null)
  const voice = useRef<Voice | null>(null)

  /**
   * Monotonic turn counter. Every await in a turn checks it on the way out:
   * if it has moved, that turn was superseded by a barge-in and must not touch
   * the phase, the speaker, or the busy state on its way to the floor.
   */
  const turn = useRef(0)
  const booting = useRef(false)
  /** When Space was last pressed, for the double press that stops everything. */
  const lastSpace = useRef(0)
  /**
   * The phase to go back to after listening, when a turn is still in flight —
   * the owner opened the mic to answer its Approve card. Standby would abandon
   * the answer that is waiting on that card.
   */
  const resumeTo = useRef<Phase | null>(null)
  /** When the last turn was sent (performance.now()), for SEND_GRACE_MS. */
  const sentAt = useRef(0)
  /** Speech has begun in this listening window (the ceiling is set once). */
  const heard = useRef(false)
  /** This listening window was opened by the spotter hearing her name. */
  const wokeByName = useRef(false)
  /** This listening window is the hands-free follow-up after an answer. */
  const followUp = useRef(false)
  /** When the minute after an answer ends (Date.now() ms). */
  const followUntil = useRef(0)
  /**
   * Music paused for listening (the owner, 2026-10-11: she was answering
   * Spotify's lyrics). Resumed only once she is really back on standby — a
   * follow-up window right after an answer keeps it paused.
   */
  const mediaPaused = useRef(false)
  const mediaTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** `again`: pause whatever plays now even if she already holds something paused —
   *  the owner may have pressed play in the minutes after an answer. */
  const pauseMedia = (again = false) => {
    if (mediaTimer.current) clearTimeout(mediaTimer.current)
    mediaTimer.current = null
    if (mediaPaused.current && !again) return
    mediaPaused.current = true
    media('pause')
  }
  const resumeMediaSoon = () => {
    if (!mediaPaused.current || mediaTimer.current) return
    mediaTimer.current = setTimeout(() => {
      mediaTimer.current = null
      // Back on standby only: in the minutes after an answer it stays paused
      // (the owner, 2026-10-22), and resumes when they end.
      if (store.getState().phase !== 'dormant' || followUp.current) return
      mediaPaused.current = false
      media('resume')
    }, 800)
  }
  /** Space — or the tray's talk hotkey from any app — one press. */
  const press = useRef<() => void>(() => {})
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // -- helpers --------------------------------------------------------------

  const clearIdle = () => {
    if (idleTimer.current) clearTimeout(idleTimer.current)
    idleTimer.current = null
  }

  const silence = () => {
    speaker.current?.cancel()
    speaker.current = null
  }

  const goDormant = () => {
    clearIdle()
    silence()
    resumeTo.current = null
    wokeByName.current = false
    followUp.current = false
    voice.current?.follow(false)
    voice.current?.close()
    turn.current++
    const s = store.getState()
    s.setCaption('')
    s.setActiveTool(null)
    s.setFollowing(false)
    sfx.duck(false)
    s.setPhase('dormant')
    resumeMediaSoon()
  }

  /** Open the mic and wait. `window` is how long before she gives up.
   *  `from: 'name'` — the spotter heard her name: listening starts from just
   *  before it (the microphone is already open), with no cue to wait for. */
  const listen = (window: number, from: 'press' | 'name' | 'follow' = 'press') => {
    clearIdle()
    heard.current = false
    const s = store.getState()
    s.setCaption('')
    s.setPhase('listening')
    s.setFollowing(from === 'follow')
    // The bridge checks words against the speakers only in those minutes.
    voice.current?.follow(from === 'follow')
    // The minutes after an answer: quiet — no cue, whatever she paused stays
    // paused, and the brain wakes only if she is really spoken to.
    if (from === 'follow') {
      void voice.current?.open()
      idleTimer.current = setTimeout(stopListening, window)
      return
    }
    pauseMedia()
    // Wake a napping brain now, not when speech is first heard: its ~3.7 s
    // start-up then overlaps the whole question (free when it is awake).
    warmBrain()
    if (from === 'name') {
      voice.current?.wake()
    } else {
      // The cue once the microphone is really open: a cold start takes a moment,
      // and words said before the cue would be lost.
      void Promise.resolve(voice.current?.open()).then(() => {
        if (store.getState().phase === 'listening') sfx.play('listen')
      })
    }
    idleTimer.current = setTimeout(stopListening, window)
  }

  /** Listening ends without a new turn: standby — or back to the turn that is
   *  still waiting on an Approve card. */
  const stopListening = () => {
    clearIdle()
    voice.current?.close()
    const back = resumeTo.current
    resumeTo.current = null
    if (!back) return goDormant()
    store.getState().setCaption('')
    store.getState().setPhase(back)
  }

  // -- one turn -------------------------------------------------------------

  const respond = async (said: string): Promise<void> => {
    const mine = ++turn.current
    const stale = () => mine !== turn.current
    resumeTo.current = null
    sentAt.current = performance.now()

    clearIdle()
    const s = store.getState()
    // Last turn's blades go now, before the new answer starts putting its own
    // up. Anything the model marked sticky survives.
    s.clearBlades()
    s.setCaption('')
    s.pushTurn({ id: newId(), role: 'user', text: said })
    s.setPhase('thinking')

    const spk = createSpeaker()
    speaker.current = spk
    sfx.duck(true)

    const turnId = newId()
    let started = false
    let shown = false
    let filled = false

    try {
      // Researcher mode is read as the question goes out: R pressed mid-answer
      // changes the next question, never the one in flight.
      await ask(said, {
        onText: (delta, quiet) => {
          if (stale()) return
          if (!shown) {
            shown = true
            store.getState().pushTurn({ id: turnId, role: 'assistant', text: '', said: '' })
          }
          // Quiet words (details, a task's answer past its first lines) go in
          // her log only; she speaks the rest (bridge/spoken.mjs).
          if (!quiet && !started) {
            started = true
            store.getState().setPhase('speaking')
            // The answer arriving is what ends the tool phase — a timer would
            // clear the readout while a slow tool was still running.
            store.getState().setActiveTool(null)
          }
          store.getState().appendToLastTurn(delta, !quiet)
          if (!quiet) spk.push(delta)
        },
        onTool: (name) => {
          if (stale()) return
          // Only claim the tooling phase while he has nothing to say yet.
          // Setting it unconditionally pinned the machine in 'tooling' for the
          // rest of any answer that called a tool after it started talking,
          // which also broke the avatar's lip-sync for the remainder.
          if (!started) store.getState().setPhase('tooling')
          store.getState().setActiveTool(name)
          sfx.play('tool')
          // Say something the moment work starts — a tool can take ten seconds
          // and silence that long reads as a crash. Once per turn only; a
          // chain of five tools shouldn't produce five apologies.
          if (!filled && !started) {
            filled = true
            spk.say(forTool(name))
          }
        },
      }, store.getState().mode)

      if (stale()) return

      await spk.end()
      if (stale()) return
      sfx.play('done')
    } catch (err) {
      if (stale()) return
      console.error(err)
      sfx.play('error')
      store
        .getState()
        .setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      if (!stale()) {
        speaker.current = null
        sfx.duck(false)
        store.getState().setActiveTool(null)
        goDormant()
        // Two minutes more, for "OK, …" (the owner, 2026-10-22).
        followUp.current = true
        followUntil.current = Date.now() + FOLLOW_UP_MS
        listen(FOLLOW_UP_MS, 'follow')
      }
    }
  }

  // -- the owner's Approve ---------------------------------------------------

  /** Answer an Approve card; the bridge tells every screen it is settled. */
  const answer = (id: string, ok: boolean, always = false) => {
    // The mic was opened to answer this card: the answer is in, so it closes.
    if (resumeTo.current && store.getState().phase === 'listening') stopListening()
    answerApproval(id, ok, always)
    store.getState().removeApproval(id)
    sfx.play(ok ? 'done' : 'error')
  }

  /** The kill switch: everything waiting declined, everything running stopped. */
  const halt = () => {
    haltAll()
    store.getState().clearApprovals()
    if (store.getState().phase !== 'offline') goDormant()
  }

  // -- voice events ---------------------------------------------------------

  /** What the voice loop should do with what it hears, derived from phase. */
  const mode = (): VoiceMode => {
    // Waiting on the owner's yes: whatever they say is the answer, never an
    // interruption that would cancel the very action being asked about.
    // Push-to-talk: words count only while Space has her listening — never a
    // wake word, never a video in another tab talking over her answer.
    switch (store.getState().phase) {
      case 'waking':
      case 'listening':
        return 'command'
      default:
        return 'deaf'
    }
  }

  const onWake = (trailing: string) => {
    const phase = store.getState().phase
    if (phase === 'offline' || phase === 'boot') return

    store.getState().setError(null)
    sfx.play('wake')

    // "Jarvis, what's happening in AI this week" in one breath. Waiting for a
    // greeting he didn't need is the most common way an assistant wastes time.
    if (trailing) {
      void respond(trailing)
      return
    }

    store.getState().setPhase('waking')

    // Answer to his name. Deliberately NOT awaited any more: the microphone is
    // already open and the echo filter knows his voice, so the user can talk
    // straight over the greeting instead of waiting it out.
    const greeting = createSpeaker()
    speaker.current = greeting
    greeting.say(attention())
    void greeting.end()

    listen(AWAIT_SPEECH_MS)
  }

  /**
   * Someone started talking. This is the whole point of the rewrite: he stops,
   * immediately, whatever he was doing.
   */
  const onSpeechStart = () => {
    clearIdle()
    const phase = store.getState().phase
    if (phase === 'offline' || phase === 'boot' || phase === 'dormant') return
    // Answering an Approve card is not a barge-in.
    if (store.getState().approvals.length) return

    const wasBusy =
      phase === 'thinking' || phase === 'tooling' || phase === 'speaking'

    silence()
    if (wasBusy) {
      // Abandon the answer in flight. The turn counter moves in respond()'s
      // replacement; bumping it here covers the case where nothing replaces it.
      turn.current++
      interrupt()
      store.getState().setActiveTool(null)
      sfx.duck(false)
    }
    store.getState().setPhase('listening')
  }

  const onUtterance = (text: string) => {
    const phase = store.getState().phase
    if (phase === 'offline' || phase === 'boot' || phase === 'dormant') return
    // One press, one turn: the microphone closes as soon as the words are in.
    voice.current?.close()
    const woke = wokeByName.current
    const following = followUp.current
    wokeByName.current = false
    followUp.current = false

    // Woken by the offline spotter: the words must be spoken TO her — her name
    // as a greeting or followed by a request — the second check, which throws
    // out look-alikes and sentences about someone else ("Ira went to the market").
    if (woke && !addressed(text)) {
      stopListening()
      return
    }

    // The minutes after an answer: only "OK …" (or "AYRA …") counts. The TV,
    // other people and noise are ignored, and the minutes go on. Checked BEFORE
    // the Approve card below: a lyric's "yeah" must never answer one — in those
    // minutes only "OK, yes" does (the review, 2026-10-18).
    const verdict = following ? followUpVerdict(text) : null
    if (verdict === 'ignore') {
      const left = followUntil.current - Date.now()
      if (left > 1500) {
        followUp.current = true
        listen(left, 'follow')
        // Words, not a cough: say how to reach her, for a few seconds.
        if (text.trim().split(/\s+/).length >= 2) {
          store.getState().setCaption(FOLLOW_HINT)
          window.setTimeout(() => {
            if (store.getState().caption === FOLLOW_HINT) store.getState().setCaption('')
          }, FOLLOW_HINT_MS)
        }
      } else goDormant()
      return
    }

    // A spoken answer to the oldest Approve card. Anything else is ignored
    // while one is waiting — it must be a clear yes or no.
    const waiting = store.getState().approvals[0]
    if (waiting) {
      // Without the "OK" in front: SAID_YES takes a bare "okay", so "OK, open
      // Notepad" would otherwise approve the card.
      const said = (following ? followUpCommand(text) : text.replace(LEADING_NAME, '')).trim()
      if (SAID_YES.test(said)) answer(waiting.id, true)
      else if (SAID_NO.test(said)) answer(waiting.id, false)
      stopListening()
      return
    }
    // Just her name in that minute: "Yes?", and she listens for the rest.
    if (verdict === 'name') {
      const line = createSpeaker()
      line.say('Yes?')
      void line.end()
      listen(AWAIT_SPEECH_MS)
      return
    }

    // People keep using his name as a vocative once they're already talking to
    // him. Strip it rather than sending "jarvis" to the model as a question —
    // said twice too ("AYRA. AYRA.", the owner's hands-free test, 2026-10-11).
    if (BARE_NAME.test(text) || onlyName(text)) {
      listen(AWAIT_SPEECH_MS)
      return
    }
    // Woken mid-sentence ("okay so, AYRA, check the gold price"): the command
    // is what follows her name.
    const said = (woke ? afterWake(text) : following ? followUpCommand(text) : text.replace(LEADING_NAME, '')).trim()
    // "That's all" after an answer: she goes back to standby.
    if (following && DISMISS.test(said)) {
      goDormant()
      return
    }
    if (!said) {
      listen(AWAIT_SPEECH_MS)
      return
    }
    // A command in those minutes: if the owner pressed play again meanwhile,
    // that pauses too while she answers, as a press would.
    if (following) pauseMedia(true)

    void respond(said)
  }

  /** Speech has begun: wake a sleeping brain, and don't time out mid-sentence. */
  const onHearing = () => {
    warmBrain()
    if (store.getState().phase !== 'listening' || heard.current) return
    heard.current = true
    clearIdle()
    idleTimer.current = setTimeout(stopListening, LONGEST_TURN_MS)
  }

  /**
   * Hands-free: the offline spotter heard her name — from any app, her window
   * needn't be in front. She listens from just before the name, so "AYRA, open
   * Notepad" in one breath is one turn.
   */
  const onWakeWord = () => {
    const st = store.getState()
    if (st.hearing !== 'hands-free') return
    const phase = st.phase
    // Already listening — or speaking, when it may be her own voice saying her
    // name: then only Space or Esc interrupt her.
    if (phase === 'offline' || phase === 'boot' || phase === 'listening' || phase === 'waking' || phase === 'speaking') return
    st.setError(null)
    const busy = phase === 'thinking' || phase === 'tooling'
    if (busy && st.approvals.length) resumeTo.current = phase
    else if (busy) onSpeechStart()
    wokeByName.current = true
    sfx.play('wake')
    listen(AWAIT_SPEECH_MS, 'name')
  }

  /** Push-to-talk or hands-free (W, the tray, Ctrl+Alt+W). */
  const setHearing = async (want: Hearing, say = true) => {
    const v = voice.current
    if (!v) return
    // Switched off in the bridge (the owner, 2026-10-18: Space in her window,
    // Alt+Space everywhere else): push-to-talk, and W says so.
    if (want === 'hands-free' && !caps().handsFree) {
      await v.handsFree(false)
      store.getState().setHearing('push')
      reportHearing('push')
      try {
        localStorage.setItem(HEARING_KEY, 'push')
      } catch {
        /* not remembered this time */
      }
      if (say) {
        const line = createSpeaker()
        line.say(withHonorific('Hands-free is switched off. Press Space here, or Alt Space from any app.'))
        void line.end()
      }
      return
    }
    const ok = await v.handsFree(want === 'hands-free')
    const st = store.getState()
    const mode: Hearing = want === 'hands-free' && ok ? 'hands-free' : 'push'
    if (want === 'hands-free' && !ok) {
      st.setError('Hands-free needs live hearing (an ElevenLabs key); push-to-talk stays on.')
    }
    st.setHearing(mode)
    reportHearing(mode)
    try {
      localStorage.setItem(HEARING_KEY, mode)
    } catch {
      /* not remembered this time */
    }
    if (!say || mode !== want) return
    // Never her name in these lines: the spotter would hear her say it.
    const line = createSpeaker()
    line.say(
      withHonorific(
        mode === 'hands-free'
          ? 'Hands-free. Just say my name when you need me.'
          : 'Push to talk. Press Space when you need me.',
      ),
    )
    void line.end()
  }

  /**
   * Normal or researcher mode (R). Only which agent answers the next question
   * changes — how she listens, the keys and the Approve rules stay as they are.
   */
  const setMode = (want: Mode, say = true) => {
    const st = store.getState()
    st.setMode(want)
    try {
      localStorage.setItem(MODE_KEY, want)
    } catch {
      /* not remembered this time */
    }
    // Before power-on the browser will not play a sound; the HUD shows it anyway.
    if (!say || st.phase === 'offline' || st.phase === 'boot') return
    // modeLine never says her name: the spotter would hear her say it.
    const line = createSpeaker()
    line.say(withHonorific(modeLine(want)))
    void line.end()
  }

  const onPartial = (text: string) => {
    // In the minute after an answer, words that aren't for her stay off screen.
    if (followUp.current && followUpVerdict(text) === 'ignore') return
    store.getState().setCaption(text)
  }

  const onVoiceError = (message: string) => {
    store.getState().setError(message)
  }

  // -- power on -------------------------------------------------------------

  const powerOn = async () => {
    // Opening her window and a Space pressed while she is still offline can
    // both land here, and the phase only moves after the first await — so
    // without this she would boot twice, arming two voice loops.
    if (booting.current) return
    booting.current = true

    try {
      await ignite()
    } catch (err) {
      // The guard must not outlive a failed boot. The microphone prompt can be
      // dismissed, the bridge unreachable at the wrong moment — and with the
      // flag still latched Space was dead for the rest of the page,
      // recoverable only by reloading. Reset it so Space simply tries again.
      booting.current = false
      console.error('[ayra] power-up failed:', err)
      store.getState().setPhase('offline')
      store
        .getState()
        .setError(
          err instanceof Error
            ? `Power-up failed: ${err.message} Press Space to try again.`
            : 'Power-up failed. Press Space to try again.',
        )
    }
  }

  const ignite = async () => {
    const s = store.getState()

    // No click needed any more (the owner, 2026-10-20: "remove click to
    // initialise… when opening AYRA let her come and listen"): her window is
    // started with --autoplay-policy=no-user-gesture-required (npm run
    // shortcuts). In a plain browser tab the first key or click unlocks sound.
    await sfx.unlockAudio()
    sfx.play('boot')

    s.setPhase('boot')

    watchServers((servers) => store.getState().setConnected(servers))
    watchBlades((blade) => store.getState().pushBlade(blade))

    // Approve cards. Spoken as well as shown: the owner may be across the room.
    watchApprovals((event) => {
      const st = store.getState()
      if (event.type === 'approve') {
        st.addApproval(event.approval)
        const ask = createSpeaker()
        ask.say(withHonorific(`Quick check: this ${event.approval.reason}. Yes or no?`))
        void ask.end()
      } else if (event.type === 'approved') {
        st.removeApproval(event.id)
      } else if (event.type === 'halt') {
        st.clearApprovals()
        silence()
      }
    })

    // In bridge mode the conversation lives in the agent session, which is tied
    // to the socket — so a drop silently wipes his memory while the transcript
    // on screen still shows it. Better to say so than to let him quietly forget.
    watchConnection((state) => {
      // A restarted bridge has forgotten how she listens; the tray asks it.
      if (state !== 'lost') reportHearing(store.getState().hearing)
      if (state === 'lost') {
        store.getState().setError('Bridge connection lost — reconnecting.')
      } else if (state === 'reconnected') {
        store
          .getState()
          .setError('Bridge reconnected. The previous conversation was not kept.')
      }
    })
    const warming = warmBridge().catch((err: Error) => s.setError(err.message))

    // The start-up sequence in Boot.tsx lands the wordmark while the bridge
    // connects and the bridge is asked which speech engines exist — so the
    // first turn already uses ElevenLabs when a key is present and the browser
    // fallback when it is not. All three at once: she is up when the slowest is.
    await Promise.all([new Promise((r) => setTimeout(r, BOOT_MS)), warming, probeCapabilities()])
    store.getState().setConnected(bridgeServers())
    // Again, now that the engines are known: set before the probe, the label named
    // the browser's voice while every sentence was spoken by ElevenLabs.
    store.getState().setVoice(currentVoiceName())

    // One voice loop, started once, running until the page closes.
    voice.current = await startVoice({
      mode,
      onWake,
      onSpeechStart,
      onHearing,
      onPartial,
      onUtterance,
      onError: onVoiceError,
      onWakeWord,
      onHandsFreeError: (message) => {
        store.getState().setError(message)
        void setHearing('push', false)
      },
    })

    store.getState().setPhase('dormant')
    // Her everyday lines ready to play at once — from the browser's cache when
    // an earlier visit kept them (tts.ts), in the background either way.
    void prefetchLines(COMMON_LINES)
    // How she listened last time, without announcing it.
    watchHearing((mode) => void setHearing(mode))
    watchTalk(() => press.current())
    if (savedHearing() === 'hands-free') void setHearing('hands-free', false)
    else reportHearing('push')
    // Her window is open because the owner opened it: she is listening.
    listen(AWAIT_SPEECH_MS)
  }

  // -- level pump + keys ----------------------------------------------------

  // The bubble on top of every app (AYRA.exe): her phase and one line, sent to
  // the bridge when they change — at most every 150 ms while words stream.
  useEffect(() => {
    let sent: Glance | null = null
    let timer = 0
    const report = () => {
      timer = 0
      const st = store.getState()
      const g = glance(st, st.following ? 'follow' : wokeByName.current ? 'name' : 'press')
      if (sameGlance(sent, g)) return
      sent = g
      reportFace(g)
    }
    const unsubscribe = store.subscribe(() => {
      if (!timer) timer = window.setTimeout(report, GLANCE_MS)
    })
    // Again on reconnect, so a restarted bridge knows at once.
    const ping = window.setInterval(() => {
      sent = null
      report()
    }, 10_000)
    return () => {
      unsubscribe()
      window.clearTimeout(timer)
      window.clearInterval(ping)
    }
    // `store` is the store's own hook — the same object for the life of the page.
  }, [store])

  useEffect(() => {
    let raf = 0
    // Researcher mode as it was left, without announcing it.
    setMode(savedMode(), false)

    /**
     * The voice level, for her mouth and the SIGNAL meter.
     *
     * Light on purpose (task 5.3): only while she listens or speaks, rounded to
     * steps the eye can tell apart, and written only when it changes — on
     * standby, or with the room quiet, this does no work at all. Animation
     * frames also stop by themselves while her window is hidden or minimised.
     */
    const pump = () => {
      raf = requestAnimationFrame(pump)
      const st = store.getState()
      let lvl = 0
      if (!still()) {
        // While speaking, follow AYRA's own output rather than the mic, so her
        // mouth follows her voice instead of reacting to room noise.
        if (st.phase === 'speaking' && speaker.current) lvl = speaker.current.level()
        else if (st.phase === 'listening' || st.phase === 'waking') lvl = inputLevel()
      }
      lvl = Math.round(lvl * 20) / 20
      if (lvl !== st.level) st.setLevel(lvl)
    }
    pump()

    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return

      // V auditions the next British voice installed on this machine. Which
      // ones exist varies per Mac, so hearing them beats trusting a ranking.
      // Bare V only — ⌘V and ⌃V are paste, and swallowing those was rude.
      if (
        e.key === 'v' &&
        !e.repeat &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        e.preventDefault()
        const name = cycleVoice()
        store.getState().setVoice(name)
        silence()
        const demo = createSpeaker()
        speaker.current = demo
        demo.say(`Voice set to ${name.replace(/\(.*?\)/g, '').trim()}. ${withHonorific('At your service.')}`)
        void demo.end()
        return
      }

      // T speaks a fixed line, bypassing the wake word, the recogniser and the
      // model entirely. When "I can't hear him" is the report, this is the one
      // keypress that separates a broken voice engine from a broken voice loop
      // — and it prints the verdict rather than making you infer it.
      if (e.key === 't' && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        silence()
        const t = createSpeaker()
        speaker.current = t
        t.say(withHonorific('Audio test. If you can hear this, speech output is working.'))
        void t.end().then(() => {
          const d = (window as unknown as Record<string, Record<string, unknown>>).__tts
          console.info('[ayra] audio test →', d)
          if (d && d.started === 0 && d.rescued === 0) {
            store.getState().setError(
              `No sound produced. engine=${d.engine} voice=${d.voice} error=${d.lastError || 'none'}`,
            )
          }
        })
        return
      }

      // W: hands-free on or off — her name from anywhere, or Space each time.
      if (e.key === 'w' && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        void setHearing(store.getState().hearing === 'hands-free' ? 'push' : 'hands-free')
        return
      }

      // L holds her still: every animation paused, the level pump idle — for
      // when the laptop is busy. Remembered across reloads.
      if (e.key === 'l' && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setStill(!still())
        return
      }

      // R: researcher mode on or off — every question then goes to the
      // researcher (sub-agents over Reddit, Quora, GitHub and the rest), or back
      // to her as she always is. Bare R only (Caps Lock or not): Ctrl+R is the
      // browser's reload.
      if (e.key.toLowerCase() === 'r' && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        e.preventDefault()
        setMode(store.getState().mode === 'research' ? 'normal' : 'research')
        return
      }

      // Y / N answer the oldest Approve card; A is "yes, and always here".
      const waiting = store.getState().approvals[0]
      const key = e.key.toLowerCase()
      const always = key === 'a' && Boolean(waiting?.always)
      if (waiting && (key === 'y' || key === 'n' || always) && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        answer(waiting.id, key !== 'n', always)
        return
      }

      // Escape is the kill switch: it stands her down, declines everything
      // waiting for an Approve and stops every answer in flight.
      if (e.key === 'Escape') {
        e.preventDefault()
        halt()
        return
      }

      // Push-to-talk. Each press acts at once (no waiting to see if a second
      // one follows), and a second press within DOUBLE_TAP_MS stops everything —
      // whatever the first one began included.
      if (e.code !== 'Space' || e.repeat) return
      e.preventDefault()
      press.current()
    }

    press.current = () => {
      const phase = store.getState().phase
      const now = performance.now()
      const double = now - lastSpace.current < DOUBLE_TAP_MS
      lastSpace.current = double ? 0 : now
      if (double && phase !== 'offline' && phase !== 'boot') {
        halt()
        return
      }

      if (phase === 'offline') {
        void powerOn()
      } else if (phase === 'boot') {
        /* ignore — the boot sequence owns the phase until it finishes */
      } else if (phase === 'listening' && store.getState().following) {
        // A press in the quiet minute after an answer: she listens properly
        // now, the chime and all, and no name is needed. What the minute had
        // half-heard (a lyric, the TV) is thrown away first, so it can't
        // become the owner's command.
        followUp.current = false
        voice.current?.close()
        listen(AWAIT_SPEECH_MS)
      } else if (phase === 'listening' || phase === 'waking') {
        // Finished talking: send it now rather than waiting for quiet — which,
        // with a video playing nearby, might never come.
        voice.current?.send()
      } else {
        const busy = phase === 'thinking' || phase === 'tooling' || phase === 'speaking'
        // "Send", pressed just after a pause had already sent it.
        if (busy && now - sentAt.current < SEND_GRACE_MS) return
        store.getState().setError(null)
        if (busy && store.getState().approvals.length) {
          // Opening the mic to answer the card: the turn waits on it, so it
          // carries on afterwards rather than being stopped.
          resumeTo.current = phase
        } else if (busy) {
          // Mid-answer: stop whatever she is doing and listen.
          onSpeechStart()
        }
        listen(AWAIT_SPEECH_MS)
      }
    }
    window.addEventListener('keydown', onKey)

    // In a plain browser tab sound waits for a first gesture: the first key or
    // click unlocks it (her own window doesn't need this — see ignite).
    const unlock = () => void sfx.unlockAudio()
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })

    // She starts by herself — no INITIALISE to click any more.
    void powerOn()

    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey)
      clearIdle()
      voice.current?.stop()
      speaker.current?.cancel()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <Avatar />
      <Hud />
      <Boot />
      <Diagnostics />
    </>
  )
}
