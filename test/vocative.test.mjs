// Unit tests for src/lib/vocative.ts — the comma before the honorific. `npm test`
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setOffHonorific } from '../src/lib/vocative.ts'

test('a vocative honorific gets its comma', () => {
  assert.equal(setOffHonorific('On it boss!', 'boss'), 'On it, boss!')
  assert.equal(setOffHonorific('Nice work boss', 'boss'), 'Nice work, boss')
  assert.equal(setOffHonorific('Done, boss.', 'boss'), 'Done, boss.')
})

test('the same word as an ordinary noun is left alone', () => {
  for (const line of ['Ask your boss.', 'You are the boss!', 'Walking in like a boss.', 'Tell my boss, please.']) {
    assert.equal(setOffHonorific(line, 'boss'), line, line)
  }
  assert.equal(setOffHonorific('Sir Isaac Newton said so.', 'sir'), 'Sir Isaac Newton said so.')
})

test('no honorific, no change', () => {
  assert.equal(setOffHonorific('On it boss!', ''), 'On it boss!')
})
