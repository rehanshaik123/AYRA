// Unit tests for bridge/context.mjs — the local time AYRA sees each turn. `npm test`
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { localTime, stamp } from '../bridge/context.mjs'

// 08:35 UTC on 2 October 2026 is 14:05 in India (UTC+5:30).
const NOW = new Date('2026-10-02T08:35:00Z')

test('local time is rendered in the owner time zone', () => {
  assert.equal(localTime(NOW, 'Asia/Kolkata'), 'Friday, 2 October 2026, 14:05 (Asia/Kolkata)')
})

test('a different zone gives a different wall clock', () => {
  assert.equal(localTime(NOW, 'Europe/London'), 'Friday, 2 October 2026, 09:35 (Europe/London)')
})

test('the stamp goes in front of the question, on its own line', () => {
  const out = stamp('what is tomorrow?', NOW)
  assert.match(out, /^\[Now: .+\]\nwhat is tomorrow\?$/)
})
