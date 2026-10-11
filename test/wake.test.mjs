// Unit tests for src/lib/wake.ts — the "Hey AYRA" phrase. `npm test`
// (TypeScript is loaded through tsx; see the test script in package.json.)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { WAKE, BARE_NAME, LEADING_NAME, afterWake } from '../src/lib/wake.ts'

test('the name and its common mishearings wake AYRA', () => {
  for (const [said, rest] of [
    ['hey ayra', ''],
    ['Hey, Ayra.', ''],
    ['Ayra what is the weather', 'what is the weather'],
    ['hey aira, open my mail', 'open my mail'],
    ['ok eyra set a reminder', 'set a reminder'],
    ['heyra play music', 'play music'],
  ]) {
    assert.equal(WAKE.test(said), true, said)
    assert.equal(afterWake(said), rest, said)
  }
})

test('ordinary words only count after a greeting', () => {
  assert.equal(WAKE.test('hey ira what time is it'), true)
  assert.equal(WAKE.test('hey era'), true)
  for (const said of [
    'the era of AI is here',
    'Ira said hello to me',
    'play the aria from the opera',
    'take the air out',
  ]) {
    assert.equal(WAKE.test(said), false, said)
  }
})

test("possessives don't wake it", () => {
  assert.equal(WAKE.test("ayra's settings are fine"), false)
})

test('a bare name is not a question; a leading name is stripped', () => {
  assert.equal(BARE_NAME.test('hey ayra'), true)
  assert.equal(BARE_NAME.test('Ayra.'), true)
  assert.equal(BARE_NAME.test('ayra what time'), false)
  assert.equal('Ayra, what time is it'.replace(LEADING_NAME, ''), 'what time is it')
})

test('hands-free: spoken TO her counts, a sentence ABOUT someone with her name does not', async () => {
  const { addressed } = await import('../src/lib/wake.ts')
  for (const said of [
    'AYRA.',
    'Hey AYRA, what time is it?',
    'AYRA, open Notepad for me.',
    'AYRA open notepad',
    'AYRA what is the weather',
    'AYRA is it going to rain today',
    'okay so, AYRA, check the gold price',
    'hey aira went to the market?',
  ]) {
    assert.equal(addressed(said), true, said)
  }
  for (const said of [
    'AYRA went to the market yesterday.',
    'Ayra said she would call back',
    'aira was at the party',
    'the weather is nice',
  ]) {
    assert.equal(addressed(said), false, said)
  }
})
