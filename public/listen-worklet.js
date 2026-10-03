/**
 * AYRA's ears, on the audio thread.
 *
 * Voice-activity detection and 16 kHz PCM for live transcription, in an
 * AudioWorklet. It replaced src/lib/vad.ts, which measured the microphone from
 * a requestAnimationFrame loop — and Chrome pauses that loop for any tab that
 * is not in front, so AYRA went deaf the moment the owner looked at another
 * window and only "woke up" when they came back and pressed Space (the owner's
 * live test, 2026-10-03). The audio thread is never throttled.
 *
 * The detector is the same one vad.ts had: a running-mean noise floor, a
 * trigger ratio above it, a hysteresis release, a raised bar while AYRA is
 * speaking, and a short confirmation so a knock is not speech. What changed is
 * what it hands back: not a recorded file but a stream — the last PRE_ROLL_MS
 * of audio the moment speech is confirmed (so the first syllable is never
 * lost), then every SEND_MS of speech as it happens, then `end`.
 *
 * Messages to the page (port):
 *   { type: 'start' }              speech confirmed — the barge-in trigger
 *   { type: 'audio', pcm }         Int16Array, 16 kHz mono
 *   { type: 'end', ms }            quiet for SILENCE_MS — the segment is over
 *   { type: 'level', v, energy, floor, threshold, speaking }  ~25 times a second
 * Messages from the page: { guard: boolean }
 *
 * ListenCore holds all of it and knows nothing about Web Audio, so it is tested
 * in Node (test/listen-worklet.test.mjs).
 */

export const OUT_RATE = 16000
/** One detector step: 20 ms at 16 kHz. */
const WINDOW = 320
const STEP_MS = 20

/** How far above the noise floor speech must rise (a ratio — the floor tracks the room). */
const TRIGGER_OVER_FLOOR = 2.6
/** While AYRA speaks, demand this much more, so her own voice leaking past echo cancellation is ignored. */
const GUARD_BOOST = 2.4
/** Falling below trigger × this ends the speech; hysteresis keeps a dip mid-word from cutting it. */
const RELEASE_RATIO = 0.6
/** Sustained energy for this long confirms speech rather than a knock or click. */
const START_MS = 120
/** Quiet this long ends the segment. Whether the thought is over is decided on the words, in voice.ts. */
const SILENCE_MS = 600
/** Nobody speaks one segment this long; end it and transcribe what there is. */
const MAX_MS = 20000
/** Audio kept from before the confirmation, so the first syllable reaches the transcriber. */
const PRE_ROLL_MS = 400
/** Speech is sent in pieces this long. */
const SEND_MS = 100
/** How often the level goes to the page. */
const LEVEL_MS = 40
/** The floor adapts slowly upward (a fan spinning up) and quickly downward (a door closing). */
const FLOOR_UP = 0.0008
const FLOOR_DOWN = 0.02

export class ListenCore {
  /** @param {number} inRate the AudioContext's sample rate */
  constructor(inRate) {
    this.ratio = inRate / OUT_RATE
    this.pos = 0
    this.acc = 0
    this.accN = 0
    this.win = new Float32Array(WINDOW)
    this.winLen = 0
    this.t = 0
    this.floor = 0.01
    this.smooth = 0
    this.threshold = 0
    this.guard = false
    this.armedAt = -1
    this.speaking = false
    this.startedAt = 0
    this.lastLoud = 0
    this.lastLevel = -LEVEL_MS
    this.preRoll = []
    this.pending = []
    this.events = []
  }

  /** Feed one block of microphone samples; returns what happened. */
  push(samples) {
    this.events = []
    for (let i = 0; i < samples.length; i++) {
      // Box-filter decimation: average the input samples that fall in each
      // output sample. Crude next to a proper resampler and plenty for speech.
      this.acc += samples[i]
      this.accN++
      this.pos += 1
      if (this.pos >= this.ratio) {
        this.pos -= this.ratio
        this.win[this.winLen++] = this.acc / this.accN
        this.acc = 0
        this.accN = 0
        if (this.winLen === WINDOW) {
          this.step()
          this.winLen = 0
        }
      }
    }
    return this.events
  }

  step() {
    let sum = 0
    const pcm = new Int16Array(WINDOW)
    for (let i = 0; i < WINDOW; i++) {
      const x = this.win[i]
      sum += x * x
      const c = Math.max(-1, Math.min(1, x))
      pcm[i] = c < 0 ? c * 0x8000 : c * 0x7fff
    }
    const energy = Math.sqrt(sum / WINDOW)
    this.smooth += (energy - this.smooth) * 0.5
    this.t += STEP_MS
    const t = this.t

    // Adapt the floor only when this is certainly not speech.
    if (!this.speaking && this.armedAt < 0) {
      const rate = this.smooth > this.floor ? FLOOR_UP : FLOOR_DOWN
      this.floor += (this.smooth - this.floor) * rate
      this.floor = Math.max(this.floor, 0.0015)
    }
    this.threshold = this.floor * TRIGGER_OVER_FLOOR * (this.guard ? GUARD_BOOST : 1)
    const release = this.threshold * RELEASE_RATIO

    if (!this.speaking) {
      this.preRoll.push(pcm)
      if (this.preRoll.length > PRE_ROLL_MS / STEP_MS) this.preRoll.shift()
      // Onset and confirmation read the raw level: the smoothed one carries a
      // sharp tap's tail on for another hundred milliseconds, long enough to
      // pass for speech. The smoothing is for the release, below.
      if (energy > this.threshold) {
        if (this.armedAt < 0) {
          this.armedAt = t
        } else if (t - this.armedAt >= START_MS) {
          this.speaking = true
          this.startedAt = this.armedAt
          this.lastLoud = t
          this.events.push({ type: 'start' })
          this.pending = this.preRoll
          this.preRoll = []
          this.flush()
        }
      } else if (this.armedAt >= 0) {
        // Rose and fell without confirming — a knock, a click, a lip smack.
        this.armedAt = -1
      }
    } else {
      this.pending.push(pcm)
      if (this.smooth > release) this.lastLoud = t
      if (t - this.lastLoud >= SILENCE_MS || t - this.startedAt >= MAX_MS) {
        this.flush()
        this.speaking = false
        this.armedAt = -1
        this.events.push({ type: 'end', ms: t - this.startedAt })
      } else if (this.pending.length * STEP_MS >= SEND_MS) {
        this.flush()
      }
    }

    if (t - this.lastLevel >= LEVEL_MS) {
      this.lastLevel = t
      this.events.push({
        type: 'level',
        v: Math.min(1, this.smooth * 12),
        energy: this.smooth,
        floor: this.floor,
        threshold: this.threshold,
        speaking: this.speaking,
      })
    }
  }

  flush() {
    if (!this.pending.length) return
    const pcm = new Int16Array(this.pending.length * WINDOW)
    this.pending.forEach((w, i) => pcm.set(w, i * WINDOW))
    this.pending = []
    this.events.push({ type: 'audio', pcm })
  }
}

// In the AudioWorklet only — in Node (tests) neither global exists.
if (typeof registerProcessor === 'function' && typeof AudioWorkletProcessor === 'function') {
  class ListenProcessor extends AudioWorkletProcessor {
    constructor() {
      super()
      // `sampleRate` is a global of the AudioWorklet scope.
      this.core = new ListenCore(sampleRate)
      this.port.onmessage = (e) => {
        if (e.data && 'guard' in e.data) this.core.guard = Boolean(e.data.guard)
      }
    }

    process(inputs) {
      const channel = inputs[0]?.[0]
      if (channel) {
        for (const ev of this.core.push(channel)) {
          if (ev.type === 'audio') this.port.postMessage(ev, [ev.pcm.buffer])
          else this.port.postMessage(ev)
        }
      }
      return true
    }
  }
  registerProcessor('ayra-listen', ListenProcessor)
}
