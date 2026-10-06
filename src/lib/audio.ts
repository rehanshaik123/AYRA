/**
 * The one shared microphone stream. Opening the mic more than once causes
 * Chrome to drop the earlier stream, so everything that needs audio goes
 * through here.
 *
 * There is no analyser here any more: the voice level comes from the
 * listening worklet (listen.ts), which measures it on the audio thread anyway —
 * a second analyser read on every animation frame was pure cost.
 */

let stream: MediaStream | null = null

/** Hand the microphone back: the browser's "in use" light goes out. */
export function releaseMic() {
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
}

export async function getMic(): Promise<MediaStream> {
  if (stream) return stream
  stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  })
  return stream
}
