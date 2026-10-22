// Unit test for src/lib/clause.ts FIRST_CLAUSE — her first words spoken before their sentence ends.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FIRST_CLAUSE } from '../src/lib/clause.ts'

test('the first clause of three words or more is spoken at once', () => {
  const first = (s) => FIRST_CLAUSE.exec(s)?.[0] ?? null
  assert.equal(first('Ooh, good one: the Moon is drifting away'), 'Ooh, good one:')
  assert.equal(first('Sure thing — opening it now'), 'Sure thing —')
  assert.equal(first('Air molecules scatter blue light, which is why'), 'Air molecules scatter blue light,')
  // Too short, no break yet, or a number.
  assert.equal(first('Paris, boss'), null)
  assert.equal(first('The Moon drifts about three point eight centimetres'), null)
  assert.equal(first('It costs about 1,000 rupees'), null)
})
