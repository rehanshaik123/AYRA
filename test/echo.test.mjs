import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import {
  FRAME_MS,
  LAG_MAX_MS,
  correlate,
  createSpeakerMeter,
  judgeBurst,
  louderThanSpeakers,
  micEnvelope,
  resample,
} from '../bridge/echo.mjs'

// --- synthetic sound -------------------------------------------------------

/** A seeded random source, so every run hears the same room. */
function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Speech-like loudness: syllables of 100–240 ms with gaps of 40–120 ms, one value per 20 ms. */
function speech(seed, ms, lo = 0.05, hi = 0.3) {
  const r = rng(seed)
  const env = []
  while (env.length * FRAME_MS < ms) {
    const len = 5 + Math.floor(r() * 8)
    const top = lo + r() * (hi - lo)
    for (let i = 0; i < len; i++) env.push(top * Math.sin((Math.PI * (i + 0.5)) / len))
    const gap = 2 + Math.floor(r() * 5)
    for (let i = 0; i < gap; i++) env.push(0)
  }
  return env.slice(0, Math.round(ms / FRAME_MS))
}
const quiet = (ms) => new Array(Math.round(ms / FRAME_MS)).fill(0)

/** Loudness → 16 kHz PCM16 bytes: a 300 Hz tone per 20 ms frame (exactly 6 cycles, so its RMS is exact) over a little room noise. */
function pcmOf(env, seed = 9, room = 0.001) {
  const r = rng(seed)
  const per = 320
  const buf = Buffer.alloc(env.length * per * 2)
  for (let f = 0; f < env.length; f++) {
    for (let i = 0; i < per; i++) {
      const x = env[f] * Math.SQRT2 * Math.sin((2 * Math.PI * 300 * i) / 16000) + (r() * 2 - 1) * room * 1.7
      buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x * 32767))), 2 * (f * per + i))
    }
  }
  return buf
}

/** What the meter would have said: a sample every ~16 ms (sometimes late) of `level(t)`, up to `until`. */
function meterSamples(level, from, until, seed = 3) {
  const r = rng(seed)
  const out = []
  for (let t = from; t < until; t += r() < 0.05 ? 31 : 16) out.push([t, Math.min(1, Math.max(0, level(t) * (0.9 + r() * 0.2)))])
  return out
}

/** A loudness curve laid out on the clock: `parts` back to back, ending at `end`. */
function timeline(end, ...parts) {
  const env = parts.flat()
  const start = end - env.length * FRAME_MS
  return { env, start, at: (t) => (t < start || t >= end ? 0 : env[Math.floor((t - start) / FRAME_MS)]) }
}

const T = 1_800_000_000_000 // when the burst arrived (epoch ms)

/**
 * The scene every speaker test starts from: a video's voice from the speakers.
 * The burst the face sent is a phrase that began after a pause — 400 ms quiet,
 * 1.2 s of speech, 760 ms quiet — and it ended 0.8 s before it arrived.
 */
function videoScene(lagMs = 800) {
  const burstEnd = T - lagMs
  const phrase = [quiet(400), speech(2, 1200), quiet(760)]
  const before = timeline(burstEnd - 2360, speech(1, 8000))
  const during = timeline(burstEnd, ...phrase)
  const after = timeline(T + 2000, speech(3, lagMs + 2000))
  const level = (t) => (t < during.start ? before.at(t) : t < burstEnd ? during.at(t) : after.at(t))
  // The microphone hears a quieter copy of the same sound.
  const mic = during.env.map((v) => v * 0.25)
  return { level, mic }
}

// --- the pure helpers ------------------------------------------------------

test('micEnvelope: RMS per 20 ms, counted back from the end of the burst', () => {
  const env = micEnvelope(pcmOf([0, 0.1, 0.2], 1, 0))
  assert.equal(env.length, 3)
  assert.ok(env[0] < 0.001)
  assert.ok(Math.abs(env[1] - 0.1) < 0.002)
  assert.ok(Math.abs(env[2] - 0.2) < 0.002)
  // A part-frame at the START is dropped, so the last frame stays the last 20 ms.
  const ragged = Buffer.concat([Buffer.alloc(100), pcmOf([0.2], 1, 0)])
  const env2 = micEnvelope(ragged)
  assert.equal(env2.length, 1)
  assert.ok(Math.abs(env2[0] - 0.2) < 0.002)
  // A Buffer at an odd offset (ws can hand one over) and an Int16Array read the same.
  const odd = Buffer.alloc(641)
  pcmOf([0.2], 1, 0).copy(odd, 1)
  assert.ok(Math.abs(micEnvelope(odd.subarray(1))[0] - 0.2) < 0.002)
  const ints = new Int16Array(320).fill(3277)
  assert.ok(Math.abs(micEnvelope(ints)[0] - 0.1) < 0.001)
})

test('resample: the loudest sample in each step, the nearest one in a short gap, unknown in a long one', () => {
  const samples = [
    [0, 0.1],
    [10, 0.3],
    [35, 0.2],
    [70, 0.5],
    [200, 0.9],
  ]
  const g = resample(samples, 0, 160)
  assert.equal(g.length, 8)
  assert.equal(g[0], 0.3) // 0 and 10: the louder
  assert.equal(g[1], 0.2)
  assert.equal(g[2], 0.2) // 40–60 is empty: 35 is nearer its middle than 70
  assert.equal(g[3], 0.5)
  assert.equal(g[4], 0.5) // 80–100: 70 is just one step from its middle
  assert.ok(Number.isNaN(g[5])) // 100–120: nothing within 20 ms
  assert.ok(Number.isNaN(g[7]))
})

test('correlate: Pearson on log loudness; unknowns skipped; flat is 0', () => {
  const a = [0.01, 0.1, 0.3, 0.05, 0.2, 0.02]
  assert.ok(correlate(a, a) > 0.999)
  assert.ok(correlate(a, a.map((v) => v * 0.2)) > 0.97) // a quieter copy is the same curve
  assert.ok(correlate(a, a.map((v) => 0.31 - v)) < -0.5)
  assert.equal(correlate(a, a.map(() => 0.2)), 0)
  assert.ok(correlate([...a, 0.5], [...a, NaN]) > 0.999)
  assert.equal(correlate([0.1, 0.2], [0.1, 0.2]), 0)
})

// --- the verdict -----------------------------------------------------------

test('a video voice from the speakers, heard 0.8 s later: from the speakers', () => {
  const { level, mic } = videoScene(800)
  const v = judgeBurst(micEnvelope(pcmOf(mic)), meterSamples(level, T - 12_000, T - 30), T)
  assert.equal(v.fromSpeakers, true, JSON.stringify(v))
  assert.ok(v.corr >= 0.8, `corr ${v.corr}`)
  assert.ok(Math.abs(v.lagMs - 800) <= 40, `lag ${v.lagMs}`)
  assert.equal(v.why, 'speakers')
})

test('any lag in the window is found: a short one (wired speakers) and a long one (a busy page)', () => {
  for (const lag of [60, 300, 1500]) {
    const { level, mic } = videoScene(lag)
    const v = judgeBurst(micEnvelope(pcmOf(mic)), meterSamples(level, T - 12_000, T - 30), T)
    assert.equal(v.fromSpeakers, true, `lag ${lag}: ${JSON.stringify(v)}`)
    assert.ok(Math.abs(v.lagMs - lag) <= 40, `lag ${lag}: found ${v.lagMs}`)
  }
})

test('the owner speaking over music: a different curve, so it is the owner', () => {
  const music = (t) => 0.25 + 0.12 * Math.sin((2 * Math.PI * 2 * (t - T)) / 1000)
  const owner = [quiet(400), speech(4, 1200, 0.1, 0.3), quiet(760)].flat()
  // The music reaches the microphone too, much quieter than the owner.
  const end = T - 300
  const start = end - owner.length * FRAME_MS
  const mic = owner.map((v, i) => v + 0.02 * music(start + i * FRAME_MS))
  const v = judgeBurst(micEnvelope(pcmOf(mic)), meterSamples(music, T - 12_000, T - 30), T)
  assert.equal(v.fromSpeakers, false, JSON.stringify(v))
  assert.ok(v.active >= 0.5) // the speakers WERE playing…
  assert.equal(v.why, 'a different sound') // …just not this
})

test('the owner starting to speak just as a video voice resumes: still the owner', () => {
  // The hard case: both rise out of the same pause, so the burst's overall
  // shape matches; only the syllables tell them apart.
  const burstEnd = T - 500
  const video = timeline(burstEnd + 3000, quiet(400), speech(5, 4960))
  const owner = [quiet(400), speech(6, 1200, 0.15, 0.3), quiet(760)].flat()
  const start = burstEnd - owner.length * FRAME_MS
  const mic = owner.map((v, i) => v + 0.25 * video.at(start + i * FRAME_MS))
  const v = judgeBurst(micEnvelope(pcmOf(mic)), meterSamples(video.at, T - 12_000, T - 30), T)
  assert.equal(v.fromSpeakers, false, JSON.stringify(v))
})

test('the owner talking over a video, the curves half-matching: the owner (much louder than the speakers explain)', () => {
  // The video's voice reaches the microphone and so does the owner, loud and
  // close, in their own syllables — the 2026-10-13 drops at 0.52 and 0.64.
  const burstEnd = T - 600
  const video = timeline(burstEnd + 3000, speech(7, 6000, 0.1, 0.3))
  const owner = [quiet(300), speech(8, 1400, 0.3, 0.6), quiet(760)].flat()
  const start = burstEnd - owner.length * FRAME_MS
  const mic = owner.map((v, i) => v + 0.2 * video.at(start + i * FRAME_MS))
  const v = judgeBurst(micEnvelope(pcmOf(mic)), meterSamples(video.at, T - 12_000, T - 30), T)
  assert.equal(v.fromSpeakers, false, JSON.stringify(v))
})

test('louderThanSpeakers: a quieter copy is explained; loud extra steps are not', () => {
  const spk = speech(9, 1200, 0.05, 0.3).map((v) => v + 0.01)
  assert.ok(louderThanSpeakers(spk.map((v) => v * 0.2), spk) < 0.05)
  const mic = spk.map((v, i) => (i % 3 === 0 ? v * 0.2 + 0.4 : v * 0.2))
  assert.ok(louderThanSpeakers(mic, spk) >= 0.3)
  assert.equal(louderThanSpeakers([0.1], [0.1]), 0)
})

test('the speakers silent: the owner', () => {
  const owner = [quiet(400), speech(7, 1200), quiet(760)].flat()
  const v = judgeBurst(micEnvelope(pcmOf(owner)), meterSamples(() => 0, T - 12_000, T - 30), T)
  assert.equal(v.fromSpeakers, false)
  assert.equal(v.why, 'speakers quiet')
  assert.equal(v.active, 0)
})

test('fails open: no numbers, a gap in them, or too little speech to tell', () => {
  const { level, mic } = videoScene(800)
  const env = micEnvelope(pcmOf(mic))
  assert.equal(judgeBurst(env, [], T).why, 'no speaker data')
  // The meter stalled two seconds before the burst and never caught up.
  const stalled = meterSamples(level, T - 12_000, T - LAG_MAX_MS - 2400)
  assert.equal(judgeBurst(env, stalled, T).fromSpeakers, false)
  const blip = [quiet(400), [0.2, 0.2, 0.2, 0.2], quiet(760)].flat()
  assert.equal(judgeBurst(micEnvelope(pcmOf(blip)), meterSamples(level, T - 12_000, T), T).why, 'too little speech to tell')
  assert.equal(judgeBurst([], meterSamples(level, T - 12_000, T), T).fromSpeakers, false)
})

// --- the meter process -----------------------------------------------------

function fakeMeter() {
  const spawned = []
  const spawnMeter = () => {
    const p = new EventEmitter()
    p.stdout = new EventEmitter()
    p.stdout.setEncoding = () => {}
    p.stderr = new EventEmitter()
    p.stderr.setEncoding = () => {}
    p.stdin = new EventEmitter()
    p.stdin.ended = false
    p.stdin.end = () => (p.stdin.ended = true)
    p.killed = false
    p.kill = () => (p.killed = true)
    spawned.push(p)
    return p
  }
  return { spawned, spawnMeter }
}

/** The meter's own words for `samples`: a start line, then `<ms since start> <peak>`, in awkward chunks. */
function speak(proc, samples, base) {
  const text = `start ${base}\n` + samples.map(([t, p]) => `${t - base} ${p.toFixed(3)}\n`).join('')
  for (let i = 0; i < text.length; i += 37) proc.stdout.emit('data', text.slice(i, i + 37))
}

test('the meter end to end: its lines in, a verdict out; stopped, it judges nothing', () => {
  const { spawned, spawnMeter } = fakeMeter()
  const meter = createSpeakerMeter({ spawnMeter, now: () => T })
  const { level, mic } = videoScene(800)
  const pcm = pcmOf(mic)
  assert.equal(meter.judge(pcm, T).why, 'no meter') // not started
  meter.start()
  meter.start() // a second start does not spawn a second meter
  assert.equal(spawned.length, 1)
  assert.equal(meter.running(), false) // no start line yet
  assert.equal(meter.judge(pcm, T).fromSpeakers, false)
  speak(spawned[0], meterSamples(level, T - 12_000, T - 30), T - 20_000)
  assert.equal(meter.running(), true)
  const v = meter.judge(pcm, T)
  assert.equal(v.fromSpeakers, true, JSON.stringify(v))
  meter.stop()
  assert.equal(spawned[0].stdin.ended, true)
  assert.equal(spawned[0].killed, true)
  assert.equal(meter.running(), false)
  assert.equal(meter.judge(pcm, T).fromSpeakers, false)
  spawned[0].emit('exit', 1) // its exit after a stop is not a crash
  assert.equal(spawned.length, 1)
})

test('only the last keepMs of numbers are kept', () => {
  const { spawned, spawnMeter } = fakeMeter()
  const meter = createSpeakerMeter({ spawnMeter, keepMs: 5000 })
  meter.start()
  const { level, mic } = videoScene(800)
  // All the numbers are from long before the burst: the meter is judged as silent-and-gone.
  speak(spawned[0], meterSamples(level, T - 60_000, T - 30), T - 70_000)
  const v = meter.judge(pcmOf(mic), T)
  assert.equal(v.fromSpeakers, true) // the recent ones are still there
  speak(spawned[0], [[T + 10_000, 0]], T - 70_000)
  assert.equal(meter.judge(pcmOf(mic), T).why, 'no speaker data')
})

test('a meter that stops by itself is started again, and given up after repeated quick failures', async () => {
  const { spawned, spawnMeter } = fakeMeter()
  const logs = []
  const meter = createSpeakerMeter({ spawnMeter, restartMs: 1, log: (m) => logs.push(m) })
  meter.start()
  const wait = () => new Promise((r) => setTimeout(r, 15))
  spawned[0].stderr.emit('data', 'Add-Type : the compiler failed\nmore')
  spawned[0].emit('exit', 1)
  await wait()
  assert.equal(spawned.length, 2)
  assert.match(logs[0], /speaker meter stopped \(Add-Type : the compiler failed\) — starting it again/)
  spawned[1].emit('exit', 1)
  await wait()
  spawned[2].emit('exit', 1)
  await wait()
  assert.equal(spawned.length, 3)
  assert.match(logs.at(-1), /keeps stopping .* name checks go on without it/)
  assert.equal(meter.running(), false)
  // A fresh start (hands-free switched on again) tries once more.
  meter.start()
  assert.equal(spawned.length, 4)
  meter.stop()
})

test('without a meter (not Windows), every burst is the owner\'s', () => {
  const meter = createSpeakerMeter({ spawnMeter: null })
  meter.start()
  assert.equal(meter.running(), false)
  const v = meter.judge(pcmOf(videoScene().mic), T)
  assert.deepEqual([v.fromSpeakers, v.why], [false, 'no meter'])
  meter.stop()
})

test('a meter that cannot even be spawned is logged, not thrown', () => {
  const logs = []
  const meter = createSpeakerMeter({
    spawnMeter: () => {
      throw new Error('ENOENT')
    },
    log: (m) => logs.push(m),
  })
  meter.start()
  assert.equal(meter.running(), false)
  assert.match(logs[0], /could not start \(ENOENT\)/)
})
