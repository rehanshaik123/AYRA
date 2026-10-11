/**
 * Her name, heard on the laptop: the wake word for hands-free mode.
 *
 * The owner, 2026-10-11: "when I was working with other apps, if I have to use
 * AYRA I have to come all the way back here — design it so she starts listening
 * if I say AYRA from anywhere." Space (push-to-talk) stays; this is the second
 * way in.
 *
 * Why it runs here and not in the cloud: waiting for a name means listening all
 * the time, and streaming every minute of the room to ElevenLabs is what used up
 * the last account's credits (videos included). So while hands-free is on, the
 * face streams its microphone to the bridge's `/wake` socket — loopback only —
 * and this module spots the name with sherpa-onnx (Apache-2.0, k2-fsa), a small
 * offline keyword spotter (3.3M parameters, ~5% of one core). Nothing leaves the
 * laptop until it hears the name; then the face sends the moment around it to
 * ElevenLabs as an ordinary turn, and the words that come back must contain the
 * name (wake.ts) — a second check that throws out look-alikes such as "Ira".
 *
 * Measured 2026-10-11 on test clips: the tuned spellings caught 6 of 6 ("AYRA",
 * "Hey AYRA, what time is it?", "AYRA, open Notepad for me", the name mid-
 * sentence) with one false alarm, "Ira went to the market" — which the second
 * check rejects. "era", "aria", "area", "error", "higher" and a stretch of
 * YouTube-style chatter never woke it. Spellings generated mechanically from
 * the identity names did worse (4 of 6): the spotter hears sounds, and "AYRA"
 * is said "eye-ra". So the spellings are tuned by hand and live in
 * config/identity.json (`wake.spotter`), with the rest of her name.
 *
 * Protocol on `/wake` (face ↔ bridge):
 *   face → bridge  binary 16 kHz mono Int16 PCM, continuously while hands-free is on
 *   bridge → face  { type: 'ready' } · { type: 'wake', at } · { type: 'error', code, message }
 *                  (code: 'no_model' — run `npm run models`; 'no_engine' — the npm package failed to load)
 */

import { createRequire } from 'node:module'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

export const SAMPLE_RATE = 16000
export const MODEL_NAME = 'sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01'
export const MODEL_URL =
  `https://github.com/k2-fsa/sherpa-onnx/releases/download/kws-models/${MODEL_NAME}.tar.bz2`
export const MODEL_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'models', MODEL_NAME)

/** The int8 files: a quarter of the size, the same results on the test clips. */
export const MODEL_FILES = {
  encoder: 'encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx',
  decoder: 'decoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx',
  joiner: 'joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx',
  tokens: 'tokens.txt',
}

/**
 * How sure the spotter must be (lower = more eager) and how strongly the
 * spellings are favoured. Tuned 2026-10-11: 0.1 / 1.0 caught every test clip;
 * a higher boost, oddly, missed more.
 */
export const WAKE_THRESHOLD = 0.1
export const WAKE_BOOST = 1.0
/** One "AYRA" is often spotted twice in a row (the name, then "hey" + name). */
export const DEBOUNCE_MS = 1500

/** All model files are on disk. */
export const modelReady = (dir = MODEL_DIR) =>
  Object.values(MODEL_FILES).every((f) => existsSync(join(dir, f)))

/**
 * The spotter's keyword lines from the tuned spellings.
 *
 * A spelling is a run of the model's own word pieces ("▁I RA"); one that uses a
 * piece the model doesn't know would make the spotter refuse to start, so it is
 * left out and reported instead.
 *
 * @param {string[]} spellings
 * @param {Set<string>} vocab — the model's pieces (tokens.txt)
 * @returns {{ lines: string[], skipped: string[] }}
 */
export function keywordLines(spellings, vocab, { threshold = WAKE_THRESHOLD, boost = WAKE_BOOST, label = 'NAME' } = {}) {
  const lines = []
  const skipped = []
  const tag = String(label).toUpperCase().replace(/[^A-Z0-9]+/g, '_') || 'NAME'
  for (const raw of spellings) {
    const pieces = String(raw).trim().split(/\s+/).filter(Boolean)
    if (!pieces.length || !pieces.every((p) => vocab.has(p))) {
      skipped.push(String(raw))
      continue
    }
    const line = `${pieces.join(' ')} :${boost} #${threshold} @${tag}`
    if (!lines.includes(line)) lines.push(line)
  }
  return { lines, skipped }
}

/** The word pieces in a model's tokens.txt ("▁HE 47" per line). */
export const readVocab = (dir = MODEL_DIR) =>
  new Set(
    readFileSync(join(dir, MODEL_FILES.tokens), 'utf8')
      .split('\n')
      .map((l) => l.split(' ')[0])
      .filter(Boolean),
  )

/** Int16 PCM bytes → the float samples the spotter takes. */
export function toFloat(bytes) {
  const n = Math.floor(bytes.byteLength / 2)
  const view = new DataView(bytes.buffer, bytes.byteOffset, n * 2)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = view.getInt16(i * 2, true) / 32768
  return out
}

const require = createRequire(import.meta.url)

/**
 * The spotter, loaded once and shared: one model, a stream per listening face.
 * Loaded lazily, so a bridge that never goes hands-free (or a Linux server)
 * never touches the native package.
 *
 * @param {{ dir?: string, spellings: string[], label?: string, threshold?: number,
 *           load?: () => any, log?: (msg: string) => void }} options
 * @returns {{ stream: () => { accept: (pcm: Uint8Array) => boolean, close: () => void } }}
 */
export function createSpotter({ dir = MODEL_DIR, spellings, label, threshold = WAKE_THRESHOLD, load, log = () => {} }) {
  if (!modelReady(dir)) {
    const err = new Error('the wake-word model is not downloaded — run `npm run models`')
    err.code = 'no_model'
    throw err
  }
  let sherpa
  try {
    sherpa = (load ?? (() => require('sherpa-onnx-node')))()
  } catch (cause) {
    const err = new Error(`the wake-word engine did not load (${cause?.message ?? cause})`)
    err.code = 'no_engine'
    throw err
  }
  const { lines, skipped } = keywordLines(spellings, readVocab(dir), { threshold, label })
  if (skipped.length) log(`[ayra] wake: spellings the model can't use, skipped: ${skipped.join(' · ')}`)
  if (!lines.length) {
    const err = new Error('no usable wake-word spellings (config/identity.json wake.spotter)')
    err.code = 'no_model'
    throw err
  }
  // The spotter reads its keywords from a file; a fresh one per start, in the
  // temp folder, so nothing stale is ever picked up.
  const keywordsFile = join(tmpdir(), `ayra-wake-${process.pid}.txt`)
  writeFileSync(keywordsFile, `${lines.join('\n')}\n`)
  const kws = new sherpa.KeywordSpotter({
    featConfig: { sampleRate: SAMPLE_RATE, featureDim: 80 },
    modelConfig: {
      transducer: {
        encoder: join(dir, MODEL_FILES.encoder),
        decoder: join(dir, MODEL_FILES.decoder),
        joiner: join(dir, MODEL_FILES.joiner),
      },
      tokens: join(dir, MODEL_FILES.tokens),
      numThreads: 1,
      provider: 'cpu',
      debug: 0,
    },
    keywordsFile,
  })

  return {
    stream() {
      const s = kws.createStream()
      return {
        /** Feed audio; true when the name was just spotted. */
        accept(pcm) {
          s.acceptWaveform({ sampleRate: SAMPLE_RATE, samples: toFloat(pcm) })
          let hit = false
          while (kws.isReady(s)) {
            kws.decode(s)
            if (kws.getResult(s).keyword) {
              hit = true
              // Start afresh, or the same words would be reported again.
              kws.reset(s)
            }
          }
          return hit
        },
        close() {
          /* the addon frees the stream when it is collected */
        },
      }
    },
  }
}

/**
 * One face's `/wake` connection: audio in, "wake" out.
 *
 * @param {{ send: (data: string) => void, on: Function, close: () => void, readyState: number, OPEN: number }} client
 * @param {{ spotter: () => ReturnType<typeof createSpotter>, now?: () => number, log?: (msg: string) => void }} options
 *   spotter — returns the shared spotter, or throws (with err.code) when it can't run
 */
export function relayWake(client, { spotter, now = Date.now, log = () => {} }) {
  const toFace = (msg) => {
    if (client.readyState === client.OPEN) client.send(JSON.stringify(msg))
  }
  let stream
  try {
    stream = spotter().stream()
  } catch (err) {
    log(`[ayra] wake: ${err.message}`)
    toFace({ type: 'error', code: err.code ?? 'no_engine', message: err.message })
    client.close()
    return { close: () => {} }
  }
  toFace({ type: 'ready' })
  let last = -Infinity
  client.on('message', (data, isBinary) => {
    if (!isBinary) return
    let hit = false
    try {
      hit = stream.accept(data)
    } catch (err) {
      log(`[ayra] wake: ${err?.message ?? err}`)
      return
    }
    if (!hit) return
    const t = now()
    if (t - last < DEBOUNCE_MS) return
    last = t
    toFace({ type: 'wake', at: t })
  })
  client.on('close', () => stream.close())
  return { close: () => stream.close() }
}
