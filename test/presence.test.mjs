// Unit tests for bridge/presence.mjs — "I'm back" after the laptop was off or asleep. `npm test`
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AWAY_MS, howLong, watchPresence } from '../bridge/presence.mjs'

const memory = (data = {}) => ({ get: (k) => data[k], set: (k, v) => (data[k] = v) })
const MIN = 60_000

test('back after being off: one note at start-up, with how long', () => {
  let t = 1_000_000_000
  const notes = []
  const store = memory({ aliveAt: t - 100 * MIN })
  const p = watchPresence({ store, notify: (n) => notes.push(n), now: () => t, every: 1e9 })
  assert.equal(notes.length, 1)
  assert.match(notes[0], /off or restarting for 1 h 40 min/)
  assert.equal(store.get('aliveAt'), t)
  p.stop()
})

test('a quick restart, or the first run ever, says nothing', () => {
  const t = 1_000_000_000
  const notes = []
  watchPresence({ store: memory({ aliveAt: t - 3 * MIN }), notify: (n) => notes.push(n), now: () => t, every: 1e9 }).stop()
  watchPresence({ store: memory(), notify: (n) => notes.push(n), now: () => t, every: 1e9 }).stop()
  assert.deepEqual(notes, [])
})

test('a long gap between ticks is the laptop sleeping; ordinary ticks are silent', () => {
  let t = 1_000_000_000
  const notes = []
  const store = memory()
  const p = watchPresence({ store, notify: (n) => notes.push(n), now: () => t, every: 1e9 })
  t += MIN
  p.tick()
  assert.deepEqual(notes, [])
  t += AWAY_MS + 5 * MIN
  p.tick()
  assert.equal(notes.length, 1)
  assert.match(notes[0], /asleep for 20 min/)
  p.stop()
})

test('durations read naturally', () => {
  assert.equal(howLong(25 * MIN), '25 min')
  assert.equal(howLong(60 * MIN), '1 h')
  assert.equal(howLong(125 * MIN), '2 h 5 min')
})
