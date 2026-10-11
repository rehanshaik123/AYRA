import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { CLIP_MS, SAMPLE_RATE, relayWake, toWav } from '../bridge/wake.mjs'
import { createMedia } from '../bridge/media.mjs'

function fakeClient() {
  const c = new EventEmitter()
  c.OPEN = 1
  c.readyState = 1
  c.sent = []
  c.closed = false
  c.send = (d) => c.sent.push(JSON.parse(d))
  c.close = () => {
    c.closed = true
  }
  return c
}
const flush = () => new Promise((r) => setImmediate(r))

test('a burst becomes words for the face; silence is not reported', async () => {
  const client = fakeClient()
  const said = ['Hey, Aira.', '']
  relayWake(client, { key: 'k', transcribe: async () => said.shift() })
  client.emit('message', Buffer.alloc(32000), true)
  client.emit('message', Buffer.alloc(32000), true)
  client.emit('message', Buffer.from('{"x":1}'), false)
  await flush()
  assert.deepEqual(client.sent, [{ type: 'ready' }, { type: 'heard', text: 'Hey, Aira.' }])
})

test('never more than CLIP_MS of audio goes for a check, whatever the face sends', async () => {
  const client = fakeClient()
  const lengths = []
  relayWake(client, { key: 'k', transcribe: async (pcm) => (lengths.push(pcm.length), '') })
  client.emit('message', Buffer.alloc(SAMPLE_RATE * 2 * 10), true)
  await flush()
  assert.deepEqual(lengths, [(SAMPLE_RATE * 2 * CLIP_MS) / 1000])
})

test('the hourly cap: checks stop, the face hears once, and they resume after the hour', async () => {
  const client = fakeClient()
  let t = 0
  let calls = 0
  const checks = []
  relayWake(client, { key: 'k', perHour: 2, checks, now: () => t, transcribe: async () => (calls++, 'hi') })
  for (let i = 0; i < 4; i++) client.emit('message', Buffer.alloc(100), true)
  await flush()
  assert.equal(calls, 2)
  assert.deepEqual(client.sent.filter((m) => m.type === 'error').map((m) => m.code), ['limit'])
  t = 3_600_001
  client.emit('message', Buffer.alloc(100), true)
  await flush()
  assert.equal(calls, 3)
})

test('a burst from the speakers: no check, not counted, nothing for the face, one log line', async () => {
  const client = fakeClient()
  const heard = []
  const judged = []
  const logs = []
  const checks = []
  const owner = Buffer.alloc(3200, 1)
  const video = Buffer.alloc(3200, 2)
  const speakers = {
    judge: (pcm, at) => {
      judged.push(at)
      return pcm[0] === 2
        ? { fromSpeakers: true, corr: 0.823, active: 0.9, why: 'speakers' }
        : { fromSpeakers: false, corr: 0.1, active: 0.9, why: 'a different sound' }
    },
  }
  relayWake(client, {
    key: 'k',
    perHour: 1,
    checks,
    now: () => 1_800_000_000_000,
    log: (m) => logs.push(m),
    speakers,
    transcribe: async (pcm) => (heard.push(pcm[0]), 'Hey AYRA'),
  })
  client.emit('message', video, true)
  client.emit('message', video, true)
  // The cap is one an hour: the owner still gets theirs after two speaker bursts.
  client.emit('message', owner, true)
  await flush()
  assert.deepEqual(heard, [1])
  assert.equal(checks.length, 1)
  assert.deepEqual(judged, [1_800_000_000_000, 1_800_000_000_000, 1_800_000_000_000])
  assert.deepEqual(client.sent, [{ type: 'ready' }, { type: 'heard', text: 'Hey AYRA' }])
  assert.equal(logs.length, 2)
  assert.match(logs[0], /^\[ayra\] wake: that burst came from the speakers \(corr 0\.82\) — ignored$/)
})

test('a speaker judge that fails, or has no verdict, never costs the owner a check', async () => {
  const client = fakeClient()
  let calls = 0
  const broken = () => {
    throw new Error('meter broke')
  }
  const verdicts = [broken, () => undefined, () => ({ fromSpeakers: false, corr: 0, why: 'no meter' })]
  relayWake(client, {
    key: 'k',
    speakers: { judge: () => verdicts.shift()() },
    transcribe: async () => (calls++, ''),
  })
  for (let i = 0; i < 3; i++) client.emit('message', Buffer.alloc(3200), true)
  await flush()
  assert.equal(calls, 3)
})

test('without the ElevenLabs key, hands-free says so and closes', () => {
  const client = fakeClient()
  relayWake(client, { key: null })
  assert.equal(client.sent[0].code, 'no_key')
  assert.equal(client.closed, true)
})

test('a burst is wrapped as a 16 kHz mono WAV', () => {
  const wav = toWav(new Uint8Array(320))
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF')
  assert.equal(wav.readUInt32LE(24), SAMPLE_RATE)
  assert.equal(wav.length, 44 + 320)
})

test('music: only what was playing is paused, and only that is resumed, in order', async () => {
  const calls = []
  const media = createMedia({
    enabled: true,
    run: async (action, ids = []) => {
      calls.push([action, ids])
      return action === 'pause' ? ['Spotify.exe'] : ids
    },
  })
  await media.resume() // nothing paused yet: nothing to do
  void media.pause()
  void media.pause()
  await media.resume()
  await media.resume()
  assert.deepEqual(calls, [['pause', []], ['pause', []], ['resume', ['Spotify.exe']]])
})

test('music control does nothing off Windows', async () => {
  const calls = []
  const media = createMedia({ enabled: false, run: async (a) => (calls.push(a), []) })
  await media.pause()
  await media.resume()
  assert.deepEqual(calls, [])
})
