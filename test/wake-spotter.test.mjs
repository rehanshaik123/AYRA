import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DEBOUNCE_MS, createSpotter, keywordLines, relayWake, toFloat } from '../bridge/wake.mjs'
import { IDENTITY } from '../bridge/identity.mjs'

const VOCAB = new Set(['▁A', 'Y', 'RA', '▁I', '▁HE', '▁E', 'I'])

test('spellings become keyword lines; pieces the model lacks are skipped, not fatal', () => {
  const { lines, skipped } = keywordLines(['▁A Y RA', '▁I RA', '▁ZZ RA', '▁A Y RA', '  '], VOCAB, { threshold: 0.1, boost: 1, label: 'AYRA' })
  assert.deepEqual(lines, ['▁A Y RA :1 #0.1 @AYRA', '▁I RA :1 #0.1 @AYRA'])
  assert.deepEqual(skipped, ['▁ZZ RA', '  '])
})

test("the identity's spotter spellings are all made of the model's own pieces", () => {
  // The model is not in the repo, so check the shape: pieces separated by
  // spaces, words starting with ▁ — a typo here would silently drop a spelling.
  assert.ok(Array.isArray(IDENTITY.wake.spotter) && IDENTITY.wake.spotter.length >= 3)
  for (const s of IDENTITY.wake.spotter) {
    assert.match(s, /^▁[A-Z]+( ▁?[A-Z]+)*$/, s)
  }
})

test('Int16 PCM becomes floats in -1..1', () => {
  const pcm = new Int16Array([0, 16384, -32768, 32767])
  const f = toFloat(new Uint8Array(pcm.buffer))
  assert.deepEqual([...f].map((x) => Math.round(x * 1000) / 1000), [0, 0.5, -1, 1])
})

test('without the model, the spotter explains how to get it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ayra-nomodel-'))
  assert.throws(() => createSpotter({ dir, spellings: ['▁I RA'] }), (err) => err.code === 'no_model' && /npm run models/.test(err.message))
})

test('a broken engine is reported as such, not as a missing model', () => {
  // Point at a "model" that exists by making modelReady true is not possible
  // without files; so the engine error is checked through relayWake below.
  const client = fakeClient()
  relayWake(client, { spotter: () => { const e = new Error('the wake-word engine did not load (x)'); e.code = 'no_engine'; throw e } })
  assert.deepEqual(client.sent, [{ type: 'error', code: 'no_engine', message: 'the wake-word engine did not load (x)' }])
  assert.equal(client.closed, true)
})

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

test('audio goes to the spotter; a hit says "wake" once, however often it repeats', () => {
  const client = fakeClient()
  const fed = []
  let hits = [false, true, true, false, true]
  let t = 1000
  relayWake(client, {
    now: () => t,
    spotter: () => ({ stream: () => ({ accept: (pcm) => (fed.push(pcm.length), hits.shift() ?? false), close() {} }) }),
  })
  assert.deepEqual(client.sent, [{ type: 'ready' }])
  const chunk = Buffer.alloc(3200)
  client.emit('message', chunk, true) // no hit
  client.emit('message', chunk, true) // hit → wake
  t += 200
  client.emit('message', chunk, true) // hit again within the debounce → nothing
  client.emit('message', Buffer.from('{"type":"x"}'), false) // text frames are ignored
  client.emit('message', chunk, true) // no hit
  t += DEBOUNCE_MS
  client.emit('message', chunk, true) // a new hit after the debounce → wake
  assert.deepEqual(fed, [3200, 3200, 3200, 3200, 3200])
  assert.deepEqual(client.sent.map((m) => m.type), ['ready', 'wake', 'wake'])
})

test('a spotter error on one chunk does not end the session', () => {
  const client = fakeClient()
  let n = 0
  relayWake(client, {
    spotter: () => ({ stream: () => ({ accept: () => { n++; if (n === 1) throw new Error('bad chunk'); return n === 2 }, close() {} }) }),
  })
  client.emit('message', Buffer.alloc(10), true)
  client.emit('message', Buffer.alloc(10), true)
  assert.deepEqual(client.sent.map((m) => m.type), ['ready', 'wake'])
})
