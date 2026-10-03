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
 */

export type ListenHandlers = {
  /** Speech confirmed — the barge-in trigger. */
  onStart: () => void
  /** Speech over; the final words follow shortly. */
  onEnd: () => void
  /** Words so far, while the owner is still talking. */
  onPartial: (text: string) => void
  /** The finished words of one segment (may be empty). */
  onFinal: (text: string) => void
  /** 0..1 microphone level. */
  onLevel: (v: number) => void
  /** Live hearing cannot work: `code` is ElevenLabs' (quota_exceeded, auth_error…)
   *  or 'unavailable' / 'no_key' / 'capture'. */
  onError: (code: string, message: string) => void
}

export type Listener = {
  stop: () => void
  /** Raise the trigger bar while AYRA speaks. */
  setGuard: (on: boolean) => void
  /** She is about to listen: open the transcription session now. */
  warm: () => void
  live: () => boolean
  meter: () => { energy: number; floor: number; threshold: number; speaking: boolean }
}

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

  node.port.onmessage = (e: MessageEvent) => {
    const ev = e.data as { type: string; pcm?: Int16Array; v?: number } & typeof meter
    if (ev.type === 'audio' && ev.pcm) send(ev.pcm.buffer as ArrayBuffer)
    else if (ev.type === 'start') {
      meter.speaking = true
      h.onStart()
    } else if (ev.type === 'end') {
      meter.speaking = false
      send(JSON.stringify({ type: 'commit' }))
      h.onEnd()
    } else if (ev.type === 'level') {
      meter = { energy: ev.energy, floor: ev.floor, threshold: ev.threshold, speaking: ev.speaking }
      h.onLevel(ev.v ?? 0)
    }
  }

  return {
    stop: () => {
      stopped = true
      socket?.close()
      socket = null
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
    live: () => !stopped && ctx.state !== 'closed',
    meter: () => meter,
  }
}
