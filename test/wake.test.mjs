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

test('her name alone, however often, is not a question', async () => {
  const { onlyName } = await import('../src/lib/wake.ts')
  for (const said of ['AYRA. AYRA.', 'Hey, Aira. Aira.', 'ayra']) assert.equal(onlyName(said), true, said)
  for (const said of ['AYRA, what time is it', 'hello', '']) assert.equal(onlyName(said), false, said)
})

test('the minute after an answer: only a sentence that starts with her name is for her', async () => {
  const { followUpVerdict } = await import('../src/lib/wake.ts')
  for (const t of ['AYRA, open notepad', 'Hey AYRA, what time is it?', 'Aira create a folder called notes', 'okay AYRA, close it']) {
    assert.equal(followUpVerdict(t), 'command', t)
  }
  for (const t of ['AYRA', 'Hey, AYRA.', 'AYRA. AYRA.']) assert.equal(followUpVerdict(t), 'name', t)
  for (const t of ['open notepad', 'and then I told him AYRA was busy', 'the weather today is sunny', '[background noise]', 'Ira went to the market']) {
    assert.equal(followUpVerdict(t), 'ignore', t)
  }
})

test('in the minute after an answer, "Ira, …" and "Arya, …" are her name too (2026-10-20)', async () => {
  const { followUpVerdict, followUpCommand } = await import('../src/lib/wake.ts')
  for (const [t, rest] of [
    ['Ira, open Notepad.', 'open Notepad.'],
    ['Arya, what is five plus five?', 'what is five plus five?'],
    ['Era. Close the tab.', 'Close the tab.'],
    ['AYRA, what time is it?', 'what time is it?'],
  ]) {
    assert.equal(followUpVerdict(t), 'command', t)
    assert.equal(followUpCommand(t), rest, t)
  }
  assert.equal(followUpVerdict('Ira.'), 'name')
  // No comma after it: a sentence about someone, or "the era of".
  for (const t of ['Ira went home early', 'Era of AI is here', 'Aria is a nice song']) assert.equal(followUpVerdict(t), 'ignore', t)
})
