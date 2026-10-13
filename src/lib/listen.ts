import { BRIDGE_WS_URL } from '../config'

/**
 * Live hearing, page side.
 *
 * The microphone runs through an AudioWorklet (public/listen-worklet.js) that
 * detects speech on the audio thread — never throttled, whichever tab is in
 * front — and streams 16 kHz PCM to the bridge's `/listen` socket, which relays
 * it to ElevenLabs Scribe Realtime (bridge/listen.mjs). Words come back while
 * the owner is still talking; the finished text about a third of a second
 * after they stop.
 *
 * Hands-free (2026-10-11) adds a second path: while it is on, the worklet
 * sends short bursts of speech that began after a quiet moment to the bridge's
 * `/wake` socket, which has ElevenLabs say what was said (bridge/wake.mjs).
 * The room itself is never streamed, and nothing is sent while music or a
 * video keeps the room busy.
 */

export type ListenHandlers = {
  /** Speech confirmed — the barge-in trigger. */
  onStart: () => void
  /** Speech over; the final words follow shortly. `empty`: finished with nothing said;
   *  `dropped`: cut off by push-to-talk closing — its words are to be thrown away. */
  onEnd: (empty?: boolean, dropped?: boolean) => void
  /** Words so far, while the owner is still talking. */
  onPartial: (text: string) => void
  /** The finished words of one segment (may be empty). */
  onFinal: (text: string) => void
  /** 0..1 microphone level. */
  onLevel: (v: number) => void
  /** Live hearing cannot work: `code` is ElevenLabs' (quota_exceeded, auth_error…)
   *  or 'unavailable' / 'no_key' / 'capture'. */
  onError: (code: string, message: string) => void
  /** Hands-free: what was said in a burst — is it her name? (wake.ts decides) */
  onHeard?: (text: string) => void
  /** Hands-free cannot work, or is resting: 'no_key', 'limit' (the hourly cap), 'unavailable'. */
  onWakeError?: (code: string, message: string) => void
}

export type Listener = {
  stop: () => void
  /** Raise the trigger bar while AYRA speaks. */
  setGuard: (on: boolean) => void
  /** She is about to listen: open the transcription session now. */
  warm: () => void
  /** Push-to-talk: hear speech (true) or nothing at all (false). */
  arm: (on: boolean) => void
  /** End the segment now — the owner pressed Space to send. */
  finish: () => void
  /** Hands-free: send bursts of speech for a name check (true) or stop (false). */
  stream: (on: boolean) => void
  /**
   * Her name was heard: start a segment from where that burst began.
   * `quietEnd`: the burst already held a command, so the segment may end as
   * soon as the room is quiet (not SILENCE_MS after this moment).
   */
  armFromCandidate: (quietEnd?: boolean) => void
  /** A line for the hearing log (bridge/wake.mjs): a skipped burst, or what a burst's words were taken for. */
  note: (entry: { event: 'skip' | 'decision'; why?: string; text?: string; woke?: boolean }) => void
  live: () => boolean
  meter: () => { energy: number; floor: number; threshold: number; speaking: boolean }
}

/** The microphone level the worklet last reported, 0..1 — for the face. */
let level = 0
export const inputLevel = () => level

/** Socket re-dial delays; the bridge restarting is the usual reason for a drop. */
const RECONNECT_MS = [300, 1000, 2000, 4000, 8000]
/** Audio held while the socket is down: a few seconds, so one sentence survives a re-dial. */
const MAX_HELD = 60

export async function startListening(stream: MediaStream, h: ListenHandlers): Promise<Listener> {
  const ctx = new AudioContext()
  void ctx.resume()
  await ctx.audioWorklet.addModule('/listen-worklet.js')
  const source = ctx.createMediaStreamSource(stream)
  const node = new AudioWorkletNode(ctx, 'ayra-listen', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
  })
  // A node nothing pulls on may not be processed; a muted path to the speakers
  // keeps it running without making a sound.
  const mute = ctx.createGain()
  mute.gain.value = 0
  source.connect(node).connect(mute).connect(ctx.destination)

  let stopped = false
  let socket: WebSocket | null = null
  let attempt = 0
  let held: (ArrayBuffer | string)[] = []
  let meter = { energy: 0, floor: 0, threshold: 0, speaking: false }

  const send = (data: ArrayBuffer | string) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(data)
    else {
      held.push(data)
      if (held.length > MAX_HELD) held.shift()
    }
  }

  const dial = () => {
    if (stopped) return
    const ws = new WebSocket(`${BRIDGE_WS_URL}/listen`)
    ws.binaryType = 'arraybuffer'
    socket = ws
    ws.onopen = () => {
      attempt = 0
      const queue = held
      held = []
      for (const d of queue) ws.send(d)
    }
    ws.onmessage = (e) => {
      let m: { type?: string; text?: string; code?: string; message?: string }
      try {
        m = JSON.parse(String(e.data))
      } catch {
        return
      }
      if (m.type === 'partial') h.onPartial(m.text ?? '')
      else if (m.type === 'final') h.onFinal(m.text ?? '')
      else if (m.type === 'error') h.onError(m.code ?? 'error', m.message ?? '')
    }
    ws.onclose = () => {
      if (socket !== ws || stopped) return
      socket = null
      if (attempt >= RECONNECT_MS.length) {
        h.onError('unavailable', 'cannot reach the bridge for live hearing')
        return
      }
      setTimeout(dial, RECONNECT_MS[attempt++])
    }
  }
  dial()

  // Hands-free: the spotter's socket, open only while the room is streamed.
  let streaming = false
  let wakeSocket: WebSocket | null = null
  let wakeAttempt = 0
  const dialWake = () => {
    if (stopped || !streaming) return
    const ws = new WebSocket(`${BRIDGE_WS_URL}/wake`)
    ws.binaryType = 'arraybuffer'
    wakeSocket = ws
    let refused = false
    ws.onopen = () => {
      wakeAttempt = 0
    }
    ws.onmessage = (e) => {
      let m: { type?: string; code?: string; message?: string }
      try {
        m = JSON.parse(String(e.data))
      } catch {
        return
      }
      if (m.type === 'heard') h.onHeard?.((m as { text?: string }).text ?? '')
      else if (m.type === 'error') {
        // No key won't fix itself by re-dialling; the hourly cap is only a pause.
        if (m.code !== 'limit') refused = true
        h.onWakeError?.(m.code ?? 'error', m.message ?? '')
      }
    }
    ws.onclose = () => {
      if (wakeSocket !== ws) return
      wakeSocket = null
      if (refused || stopped || !streaming) return
      if (wakeAttempt >= RECONNECT_MS.length) {
        h.onWakeError?.('unavailable', 'cannot reach the bridge for hands-free')
        return
      }
      setTimeout(dialWake, RECONNECT_MS[wakeAttempt++])
    }
  }
  const closeWake = () => {
    const ws = wakeSocket
    wakeSocket = null
    ws?.close()
  }

  /** One line for the hearing log, over the hands-free socket when it is up. */
  function note(entry: { event: 'skip' | 'decision'; why?: string; text?: string; woke?: boolean }) {
    if (wakeSocket?.readyState === WebSocket.OPEN) wakeSocket.send(JSON.stringify({ type: 'note', ...entry }))
  }

  node.port.onmessage = (e: MessageEvent) => {
    const ev = e.data as { type: string; pcm?: Int16Array; v?: number } & typeof meter
    if (ev.type === 'candidate' && ev.pcm) {
      // A burst for the name check. Dropped while the socket is down: a name
      // said during a reconnect is lost, but nothing piles up.
      if (wakeSocket?.readyState === WebSocket.OPEN) wakeSocket.send(ev.pcm.buffer as ArrayBuffer)
      else note({ event: 'skip', why: 'hands-free socket down' })
      return
    }
    // A stretch of speech the worklet did not send for a check, and why — for
    // the hearing log (bridge/wake.mjs), never for anything else.
    if (ev.type === 'skip') {
      note({ event: 'skip', why: String((ev as { why?: string }).why ?? '') })
      return
    }
    if (ev.type === 'audio' && ev.pcm) send(ev.pcm.buffer as ArrayBuffer)
    else if (ev.type === 'start') {
      meter.speaking = true
      h.onStart()
    } else if (ev.type === 'end') {
      meter.speaking = false
      // Nothing was said: there is nothing for the transcriber to finish.
      const end = ev as { empty?: boolean; dropped?: boolean }
      if (!end.empty) send(JSON.stringify({ type: 'commit' }))
      h.onEnd(Boolean(end.empty), Boolean(end.dropped))
    } else if (ev.type === 'level') {
      meter = { energy: ev.energy, floor: ev.floor, threshold: ev.threshold, speaking: ev.speaking }
      level = ev.v ?? 0
      h.onLevel(level)
    }
  }

  return {
    stop: () => {
      stopped = true
      level = 0
      socket?.close()
      socket = null
      closeWake()
      try {
        source.disconnect()
        node.disconnect()
        void ctx.close()
      } catch {
        /* already gone */
      }
    },
    setGuard: (on) => node.port.postMessage({ guard: on }),
    warm: () => send(JSON.stringify({ type: 'warm' })),
    arm: (on) => node.port.postMessage({ armed: on }),
    finish: () => node.port.postMessage({ finish: true }),
    stream: (on) => {
      if (on === streaming) return
      streaming = on
      node.port.postMessage({ stream: on })
      if (on) {
        wakeAttempt = 0
        dialWake()
      } else closeWake()
    },
    armFromCandidate: (quietEnd = false) => node.port.postMessage({ armFromCandidate: true, quietEnd }),
    note,
    live: () => !stopped && ctx.state !== 'closed',
    meter: () => meter,
  }
}
