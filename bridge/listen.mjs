/**
 * Live hearing — the face streams the microphone here, and this streams it on
 * to ElevenLabs Scribe v2 Realtime and hands the words back as they are heard.
 *
 * Why it replaced upload-and-transcribe (2026-10-03, the owner's live test):
 * each spoken clip was recorded whole, uploaded, then transcribed — about a
 * second after the speaker stopped, every time — and the detector that decided
 * when to record ran on the page's animation clock, which Chrome pauses for a
 * tab that is not in front. Streaming fixes the first: partial words arrive
 * while the owner is still talking and the final text about 150 ms after they
 * stop. The face's AudioWorklet fixes the second.
 *
 * The relay sits in the bridge rather than the browser talking to ElevenLabs
 * directly, so the key never reaches the page and the page CSP stays closed.
 *
 * Face → bridge, on the `/listen` socket:
 *   binary            16 kHz mono PCM, 16-bit little-endian
 *   {type:'commit'}   the speaker stopped: finalise what was sent
 *   {type:'warm'}     she is about to listen: open the session now (≈0.5 s)
 *   {type:'follow', on}   the minutes after an answer begin / end: words then
 *                     are checked against the laptop's speakers (`judge`)
 * Bridge → face:
 *   {type:'partial', text}   words so far — for the caption
 *   {type:'final', text}     the finished segment — empty when the speaker
 *                            meter says it came out of the laptop's own speakers
 *   {type:'error', code, message}   e.g. quota_exceeded: the face falls back
 *
 * The upstream session opens on `warm` or on the first audio, whichever comes
 * first, and closes after IDLE_MS without any (ElevenLabs also closes an idle
 * session itself after about 15 s), so a quiet room costs next to nothing.
 * Audio sent before the session is ready is held and flushed in order —
 * measured, the session starts about 0.55 s after the request.
 */

export const SAMPLE_RATE = 16000
const UPSTREAM = 'wss://api.elevenlabs.io/v1/speech-to-text/realtime'
/** Close the upstream session after this long with no speech. */
const IDLE_MS = 20_000
/** A segment's audio kept for the speaker check: its last 5 s (the meter compares 4). */
const KEEP_BYTES = SAMPLE_RATE * 2 * 5
/** A committed segment whose words haven't come back in this long has lost them. */
const STALE_MS = 15_000
/** ElevenLabs' own error message types — any of these is reported to the face. */
const ERRORS = new Set([
  'error', 'auth_error', 'quota_exceeded', 'rate_limited', 'resource_exhausted',
  'session_time_limit_exceeded', 'input_error', 'chunk_size_exceeded',
  'insufficient_audio_activity', 'transcriber_error', 'unaccepted_terms',
  'commit_throttled', 'queue_overflow',
])

/** The upstream URL for a language and the words to listen out for. */
export function upstreamUrl({ language = 'en', keyterms = [] } = {}) {
  const q = new URLSearchParams({
    model_id: 'scribe_v2_realtime',
    audio_format: `pcm_${SAMPLE_RATE}`,
    language_code: language,
    // Ending a segment is the face's call: its detector already decides that
    // for barge-in, so one decision rather than two that can disagree.
    commit_strategy: 'manual',
  })
  for (const k of keyterms) q.append('keyterms', k)
  return `${UPSTREAM}?${q}`
}

/** One audio chunk in ElevenLabs' message shape. */
export const audioMessage = (pcm, commit = false) => ({
  message_type: 'input_audio_chunk',
  audio_base_64: pcm.length ? Buffer.from(pcm).toString('base64') : '',
  commit,
  sample_rate: SAMPLE_RATE,
})

/**
 * Relay one face connection.
 *
 * @param {{ send: (data: string) => void, on: Function, readyState: number, OPEN: number }} client
 * @param {{ key: string, language?: string, keyterms?: string[],
 *           connect?: (url: string, key: string) => any, log?: (msg: string) => void,
 *           judge?: (pcm: Uint8Array, arrivedAt: number) => { fromSpeakers: boolean, corr?: number } | null,
 *           record?: (entry: object) => void, now?: () => number }} options
 *   connect — opens the upstream socket; injected so tests can fake it
 *   judge   — the speaker meter (echo.mjs `judge`): did this segment come out of
 *             the laptop's own speakers? Such a segment reaches the face as an
 *             empty final — a video saying "okay, so…" in the minutes after an
 *             answer is not the owner (2026-10-22). Fails open, like the meter.
 *   record  — a line in the audit log for each segment dropped that way
 */
export function relayListening(client, { key, language, keyterms, connect, log = () => {}, judge = null, record = () => {}, now = Date.now }) {
  let upstream = null
  let ready = false
  let held = [] // messages waiting for the upstream session to start
  let idle = null
  // The audio of the segment being spoken (its last few seconds — all the meter
  // compares), and each committed segment's audio waiting for its words.
  let segment = []
  let segmentBytes = 0
  let lastAudioAt = 0
  let waiting = []
  let following = false

  const toFace = (msg) => {
    if (client.readyState === client.OPEN) client.send(JSON.stringify(msg))
  }

  const closeUpstream = () => {
    if (idle) clearTimeout(idle)
    idle = null
    const u = upstream
    upstream = null
    ready = false
    held = []
    try {
      u?.close()
    } catch {
      /* already gone */
    }
  }

  const touch = () => {
    if (idle) clearTimeout(idle)
    idle = setTimeout(closeUpstream, IDLE_MS)
    idle.unref?.()
  }

  const open = () => {
    const u = connect(upstreamUrl({ language, keyterms }), key)
    upstream = u
    u.on('message', (raw) => {
      if (u !== upstream) return
      let m
      try {
        m = JSON.parse(raw.toString())
      } catch {
        return
      }
      const type = m.message_type
      if (type === 'session_started') {
        ready = true
        for (const msg of held) u.send(JSON.stringify(msg))
        held = []
      } else if (type === 'partial_transcript') {
        if (m.text) toFace({ type: 'partial', text: m.text })
      } else if (type === 'committed_transcript' || type === 'committed_transcript_with_timestamps') {
        const text = m.text ?? ''
        const audio = nextCommitted()
        const v = text.trim() && audio?.check ? judged(audio) : null
        if (v?.fromSpeakers) {
          log(`[ayra] listen: "${text.slice(0, 60)}" came from the speakers (corr ${Number(v.corr ?? 0).toFixed(2)}) — not the owner`)
          try {
            record({ kind: 'segment', result: 'speakers', words: text.split(/\s+/).length, corr: v.corr })
          } catch {
            /* the log is for tuning, never in the way */
          }
          toFace({ type: 'final', text: '' })
        } else toFace({ type: 'final', text })
      } else if (ERRORS.has(type) || m.error) {
        // A commit that comes back with no words takes its audio with it.
        if (type === 'insufficient_audio_activity') nextCommitted()
        const message = String(m.error ?? m.message ?? type)
        log(`[ayra] listen: ElevenLabs ${type}: ${message}`)
        toFace({ type: 'error', code: type, message })
        // An auth or quota failure will not cure itself mid-session.
        if (type !== 'insufficient_audio_activity' && type !== 'commit_throttled') closeUpstream()
      }
    })
    u.on('close', () => {
      if (u === upstream) {
        upstream = null
        ready = false
        held = []
      }
    })
    u.on('error', (err) => {
      if (u !== upstream) return
      log(`[ayra] listen: upstream failed — ${err?.message ?? err}`)
      toFace({ type: 'error', code: 'unavailable', message: String(err?.message ?? err) })
      closeUpstream()
    })
  }

  const forward = (msg) => {
    if (!upstream) open()
    touch()
    if (ready) upstream.send(JSON.stringify(msg))
    else held.push(msg)
  }

  /** The audio of the oldest committed segment still waiting for its words (stale ones dropped). */
  const nextCommitted = () => {
    while (waiting.length && now() - waiting[0].at > STALE_MS) waiting.shift()
    return waiting.shift() ?? null
  }

  /** The meter's verdict, or null: any doubt or error and the words are the owner's. */
  const judged = ({ pcm, at }) => {
    try {
      return judge?.(pcm, at) ?? null
    } catch {
      return null
    }
  }

  client.on('message', (data, isBinary) => {
    if (isBinary) {
      if (judge) {
        segment.push(Buffer.from(data))
        segmentBytes += data.length
        lastAudioAt = now()
        // Only the last few seconds are ever compared.
        while (segmentBytes > KEEP_BYTES && segment.length > 1) segmentBytes -= segment.shift().length
      }
      forward(audioMessage(data))
      return
    }
    let msg
    try {
      msg = JSON.parse(data.toString())
    } catch {
      return
    }
    // The minutes after an answer (the face says when): only then are words
    // checked against the speakers. Over her own voice, the owner interrupting
    // her must never be taken for it.
    if (msg.type === 'follow') following = Boolean(msg.on)
    // One entry per commit that will come back with words, in order — checked
    // or not — so each transcript meets its own audio.
    if (msg.type === 'commit' && judge && upstream) {
      waiting.push({ pcm: Buffer.concat(segment), at: lastAudioAt, check: following && segmentBytes > 0 })
      if (waiting.length > 4) waiting.shift()
      segment = []
      segmentBytes = 0
    }
    // A commit with nothing sent has nothing to finalise.
    if (msg.type === 'commit' && upstream) forward(audioMessage(new Uint8Array(0), true))
    if (msg.type === 'warm' && !upstream) {
      open()
      touch()
    }
  })
  client.on('close', closeUpstream)

  return { close: closeUpstream }
}
