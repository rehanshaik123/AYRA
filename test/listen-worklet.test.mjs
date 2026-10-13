// Unit tests for public/listen-worklet.js — AYRA's ears on the audio thread. `npm test`
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ListenCore, OUT_RATE } from '../public/listen-worklet.js'

const RATE = 48000

/** Feed `ms` of audio in 128-sample blocks, the way an AudioWorklet does. */
function feed(core, ms, sample) {
  const events = []
  const total = Math.round((RATE * ms) / 1000)
  for (let i = 0; i < total; i += 128) {
    const block = new Float32Array(Math.min(128, total - i))
    for (let j = 0; j < block.length; j++) block[j] = sample(i + j)
    events.push(...core.push(block))
  }
  return events
}

let seed = 1
const noise = (amp) => () => {
  seed = (seed * 16807) % 2147483647
  return ((seed / 2147483647) * 2 - 1) * amp
}
const voice = (amp) => (n) => Math.sin((2 * Math.PI * 220 * n) / RATE) * amp + noise(0.002)()

const kinds = (events) => events.map((e) => e.type).filter((t) => t !== 'level' && t !== 'audio')
const samples = (events) => events.filter((e) => e.type === 'audio').reduce((n, e) => n + e.pcm.length, 0)

test('a quiet room is not speech', () => {
  const core = new ListenCore(RATE)
  assert.deepEqual(kinds(feed(core, 3000, noise(0.003))), [])
})

test('speech starts, streams with its pre-roll, and ends after the silence', () => {
  const core = new ListenCore(RATE)
  feed(core, 2000, noise(0.003)) // the floor settles on the room
  const during = feed(core, 1000, voice(0.2))
  assert.deepEqual(kinds(during), ['start'])
  const after = feed(core, 1000, noise(0.003))
  assert.deepEqual(kinds(after), ['end'])
  const sent = samples([...during, ...after])
  // ~400 ms pre-roll + ~880 ms after confirmation + ~600 ms of tail, at 16 kHz
  assert.ok(sent > OUT_RATE * 1.5 && sent < OUT_RATE * 2.2, `sent ${sent} samples`)
  assert.ok(during.filter((e) => e.type === 'audio').length >= 5, 'streamed in pieces, not at the end')
})

test('a click is not speech', () => {
  const core = new ListenCore(RATE)
  feed(core, 2000, noise(0.003))
  assert.deepEqual(kinds(feed(core, 60, voice(0.3))), [])
  assert.deepEqual(kinds(feed(core, 1000, noise(0.003))), [])
})

test('while AYRA speaks the bar is raised, but a real interruption still gets through', () => {
  const core = new ListenCore(RATE)
  feed(core, 2000, noise(0.003))
  core.guard = true
  assert.deepEqual(kinds(feed(core, 800, voice(0.012))), [], 'faint leak ignored')
  feed(core, 800, noise(0.003))
  assert.deepEqual(kinds(feed(core, 800, voice(0.2))), ['start'], 'the owner talking over her')
})

test('the level reaches the page about 25 times a second', () => {
  const core = new ListenCore(RATE)
  const levels = feed(core, 1000, noise(0.003)).filter((e) => e.type === 'level')
  assert.ok(levels.length >= 24 && levels.length <= 26, `${levels.length} levels`)
})

test('other sample rates come out at 16 kHz too', () => {
  const core = new ListenCore(44100)
  let n = 0
  for (let i = 0; i < 44100; i += 128) {
    const block = new Float32Array(Math.min(128, 44100 - i)).fill(0)
    core.push(block)
    n += block.length
  }
  assert.ok(Math.abs(core.t - 1000) <= 20, `1 s of input is ${core.t} ms of steps`)
})

test('push-to-talk: unarmed, a voice is never confirmed and nothing is sent', () => {
  const core = new ListenCore(RATE)
  feed(core, 2000, noise(0.003))
  core.arm(false)
  const heard = feed(core, 1500, voice(0.2))
  assert.deepEqual(kinds(heard), [])
  assert.equal(samples(heard), 0)
  core.arm(true)
  assert.deepEqual(kinds(feed(core, 800, voice(0.2))), ['start'])
})

test('disarming mid-sentence closes it as dropped (so it is committed and thrown away), then nothing more', () => {
  const core = new ListenCore(RATE)
  feed(core, 2000, noise(0.003))
  feed(core, 600, voice(0.2))
  const closed = core.arm(false)
  assert.deepEqual(kinds(closed), ['end'])
  assert.equal(closed.find((e) => e.type === 'end').dropped, true)
  const rest = feed(core, 1500, voice(0.2))
  assert.deepEqual(kinds(rest), [])
  assert.equal(samples(rest), 0)
  assert.deepEqual(kinds(new ListenCore(RATE).arm(false)), [], 'nothing to close when silent')
})

test('after a send nothing new starts until push-to-talk opens again', () => {
  const core = new ListenCore(RATE)
  feed(core, 2000, noise(0.003))
  feed(core, 800, voice(0.2))
  core.finish()
  assert.deepEqual(kinds(feed(core, 1000, voice(0.2))), [], 'a video talking on is not a new segment')
  core.arm(true)
  assert.deepEqual(kinds(feed(core, 800, voice(0.2))), ['start'])
})

test('finish ends the segment at once however loud the room, and says when nothing was said', () => {
  const core = new ListenCore(RATE)
  feed(core, 2000, noise(0.003))
  feed(core, 800, voice(0.2)) // still talking (a video that never goes quiet)
  const done = core.finish()
  assert.deepEqual(kinds(done), ['end'])
  assert.equal(done.find((e) => e.type === 'end').empty, undefined)
  const idle = core.finish()
  assert.deepEqual(kinds(idle), ['end'])
  assert.equal(idle[0].empty, true)
})

test('hands-free: a word said after quiet goes for a name check once; the room itself is never sent', () => {
  const core = new ListenCore(RATE)
  core.arm(false)
  core.setStream(true)
  feed(core, 2000, () => noise(0.002)())
  const events = [...feed(core, 800, voice(0.2)), ...feed(core, 1500, () => noise(0.002)())]
  const bursts = events.filter((e) => e.type === 'candidate')
  assert.equal(bursts.length, 1)
  assert.ok(bursts[0].pcm.length >= OUT_RATE * 0.8 && bursts[0].pcm.length <= OUT_RATE * 2.5, String(bursts[0].pcm.length))
  assert.equal(events.filter((e) => e.type === 'audio').length, 0)
})

test('hands-free: a long stretch of speech sends one burst, at most 2.5 s', () => {
  const core = new ListenCore(RATE)
  core.arm(false)
  core.setStream(true)
  feed(core, 2000, () => noise(0.002)())
  const bursts = feed(core, 6000, voice(0.2)).filter((e) => e.type === 'candidate')
  assert.equal(bursts.length, 1)
  assert.equal(bursts[0].pcm.length, (OUT_RATE * 2500) / 1000)
})

test('hands-free: in a busy room (music, a video) nothing goes for a check', () => {
  const core = new ListenCore(RATE)
  core.arm(false)
  core.setStream(true)
  feed(core, 2000, () => noise(0.002)())
  // Music: loud, with short gaps, for twelve seconds.
  for (let i = 0; i < 12; i++) {
    feed(core, 850, voice(0.2))
    feed(core, 150, () => noise(0.002)())
  }
  const after = [...feed(core, 500, () => noise(0.002)()), ...feed(core, 800, voice(0.2))]
  assert.equal(after.filter((e) => e.type === 'candidate').length, 0)
})

test('hands-free: a stretch not sent is told to the hearing log, once, with why and no audio', () => {
  const core = new ListenCore(RATE)
  core.arm(false)
  core.setStream(true)
  feed(core, 2000, () => noise(0.002)())
  // A video with real pauses: each line is its own stretch, and the room soon counts as busy.
  const events = []
  for (let i = 0; i < 10; i++) {
    events.push(...feed(core, 1200, voice(0.2)))
    events.push(...feed(core, 900, () => noise(0.002)()))
  }
  const skips = events.filter((e) => e.type === 'skip')
  assert.ok(skips.length >= 3, `skips ${skips.length}`)
  assert.ok(skips.every((e) => e.why === 'busy room' && !e.pcm))
  // Every stretch is either sent or skipped, never both.
  assert.equal(events.filter((e) => e.type === 'candidate').length + skips.length, 10)
})

test('her name heard: listening starts where the burst began', () => {
  const core = new ListenCore(RATE)
  core.arm(false)
  core.setStream(true)
  feed(core, 2000, () => noise(0.002)())
  feed(core, 800, voice(0.2))
  feed(core, 1500, () => noise(0.002)())
  const woken = core.armFromCandidate()
  assert.deepEqual(woken.map((e) => e.type), ['start', 'audio'])
  const secs = woken[1].pcm.length / OUT_RATE
  assert.ok(secs >= 2.2 && secs <= 3.2, String(secs))
})

test('a burst that held the command ends as soon as the room is quiet (quietEnd)', () => {
  const run = (quietEnd) => {
    const core = new ListenCore(RATE)
    core.arm(false)
    core.setStream(true)
    feed(core, 2000, () => noise(0.002)())
    feed(core, 1500, voice(0.2))
    feed(core, 1500, () => noise(0.002)())
    core.armFromCandidate(quietEnd)
    // How long, in quiet, until the segment ends.
    for (let ms = 20; ms <= 2000; ms += 20) {
      if (feed(core, 20, () => noise(0.002)()).some((e) => e.type === 'end')) return ms
    }
    return Infinity
  }
  const quick = run(true)
  const usual = run(false)
  assert.ok(quick <= 100, `quietEnd ended after ${quick} ms`)
  assert.ok(usual >= 500, `the usual wake still waits (${usual} ms)`)
})

test('while she speaks, nothing goes for a check', () => {
  const core = new ListenCore(RATE)
  core.arm(false)
  core.setStream(true)
  core.guard = true
  feed(core, 2000, () => noise(0.002)())
  assert.equal([...feed(core, 800, voice(0.2)), ...feed(core, 1500, () => noise(0.002)())].filter((e) => e.type === 'candidate').length, 0)
})
