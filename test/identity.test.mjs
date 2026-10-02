// Unit tests for config/identity.json and what is built from it. `npm test`
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { IDENTITY, withHonorific } from '../src/identity.ts'
import { SYSTEM_PROMPT } from '../bridge/persona.mjs'

const raw = JSON.parse(readFileSync(new URL('../config/identity.json', import.meta.url), 'utf8'))

test('identity.json has every field, with sane values', () => {
  for (const key of ['name', 'wordmark', 'tagline', 'language', 'timezone']) {
    assert.equal(typeof raw[key], 'string', key)
    assert.ok(raw[key].trim(), `${key} is empty`)
  }
  assert.equal(typeof raw.honorific, 'string')
  assert.ok(['female', 'male'].includes(raw.voice.gender))
  assert.ok(Array.isArray(raw.voice.prefer))
  assert.match(raw.language, /^[a-z]{2}(-[A-Z]{2})?$/)
  // An unknown time zone throws here, long before it could break a stamp.
  assert.doesNotThrow(() => new Intl.DateTimeFormat('en', { timeZone: raw.timezone }))
})

test('wake words are lowercase, unique, and never in both lists', () => {
  const { names, prefixedOnly } = raw.wake
  assert.ok(names.length > 0)
  for (const w of [...names, ...prefixedOnly]) assert.equal(w, w.toLowerCase(), w)
  assert.equal(new Set(names).size, names.length)
  assert.deepEqual(names.filter((w) => prefixedOnly.includes(w)), [])
})

test('the honorific is attached only when one is configured', () => {
  const saved = IDENTITY.honorific
  try {
    IDENTITY.honorific = ''
    assert.equal(withHonorific('Working on it.'), 'Working on it.')
    IDENTITY.honorific = 'sir'
    assert.equal(withHonorific('Working on it.'), 'Working on it, sir.')
    assert.equal(withHonorific('Yes?'), 'Yes, sir?')
  } finally {
    IDENTITY.honorific = saved
  }
})

test('the persona is built from identity', () => {
  assert.ok(SYSTEM_PROMPT.startsWith(`You are ${raw.name},`))
  assert.ok(SYSTEM_PROMPT.includes(raw.timezone))
  assert.ok(SYSTEM_PROMPT.includes('[Now: …]'))
  assert.ok(!SYSTEM_PROMPT.includes('JARVIS'))
  if (!raw.honorific) assert.ok(!/\bsir\b/i.test(SYSTEM_PROMPT))
})
