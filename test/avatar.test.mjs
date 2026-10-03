// Unit tests for src/lib/avatar.ts — what the avatar face does when. `npm test`
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  poseFor, mouthOpen, nextBlinkMs, poseOverride, snacking,
  SNACK_AFTER_MS, SNACK_EVERY_MS, SNACK_FOR_MS, POSES, LOOKS,
} from '../src/lib/avatar.ts'

test('every phase has a pose', () => {
  assert.equal(poseFor('offline'), 'sleep')
  assert.equal(poseFor('boot'), 'wave')
  assert.equal(poseFor('dormant'), 'idle')
  assert.equal(poseFor('waking'), 'wave')
  assert.equal(poseFor('listening'), 'listen')
  assert.equal(poseFor('thinking'), 'think')
  assert.equal(poseFor('tooling'), 'magic')
  assert.equal(poseFor('speaking'), 'talk')
})

test('an error is a short reaction, never in the middle of an answer', () => {
  assert.equal(poseFor('dormant', { oops: true }), 'oops')
  assert.equal(poseFor('listening', { oops: true }), 'oops')
  assert.equal(poseFor('speaking', { oops: true }), 'talk')
  assert.equal(poseFor('thinking', { oops: true }), 'think')
})

test('left alone, she snacks a few seconds every minute', () => {
  assert.equal(poseFor('dormant', { idleMs: SNACK_AFTER_MS - 1 }), 'idle')
  assert.equal(poseFor('dormant', { idleMs: SNACK_AFTER_MS }), 'snack')
  assert.equal(snacking(SNACK_AFTER_MS + SNACK_FOR_MS + 1), false)
  assert.equal(snacking(SNACK_AFTER_MS + SNACK_EVERY_MS + 10), true)
  assert.equal(poseFor('thinking', { idleMs: SNACK_AFTER_MS }), 'think')
})

test('the mouth stays shut on silence and opens with loudness, in steps', () => {
  assert.equal(mouthOpen(0), 0)
  assert.equal(mouthOpen(0.02), 0)
  assert.equal(mouthOpen(1), 1)
  assert.ok(mouthOpen(0.2) > 0 && mouthOpen(0.2) < 1)
  for (const l of [0.05, 0.13, 0.27, 0.4]) assert.equal(mouthOpen(l) * 8 % 1, 0)
  assert.ok(mouthOpen(0.3) >= mouthOpen(0.2))
})

test('blinks come every 2.4–6 s', () => {
  assert.equal(nextBlinkMs(0), 2400)
  assert.equal(nextBlinkMs(1), 6000)
  assert.equal(nextBlinkMs(7), 6000)
})

test('every pose has a complete look, and only talking moves the mouth with the voice', () => {
  for (const p of POSES) {
    const l = LOOKS[p]
    assert.ok(l && l.eyes && l.mouth && Array.isArray(l.arms) && Array.isArray(l.fx), p)
  }
  assert.deepEqual(POSES.filter((p) => LOOKS[p].mouth === 'talk'), ['talk'])
  assert.deepEqual(LOOKS.idle.arms, [])
  assert.ok(LOOKS.wave.arms.includes('wave') && LOOKS.think.arms.includes('think'))
})

test('?pose= previews a known pose only', () => {
  assert.equal(poseOverride('?pose=think'), 'think')
  assert.equal(poseOverride('?pose=dance'), null)
  assert.equal(poseOverride(''), null)
  assert.equal(POSES.length, 9)
})
