// Unit tests for src/lib/endpoint.ts — when the owner has finished speaking.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { holdFor, CONTINUE_MS, STOP_MS, SETTLE_MS } from '../src/lib/endpoint.ts'

test('a finished question or exclamation goes at once', () => {
  for (const said of ["What's two plus two?", 'How many legs does a spider have?', 'Stop!', 'What is it for?', 'Who are you talking to?']) {
    assert.equal(holdFor(said), 0, said)
  }
})

test('a pause the transcriber marked with a question mark is not the end', () => {
  // The voice test, 2026-10-20: "What is twelve times … eleven?" was sent as
  // "What is 12 times?".
  for (const said of ['What is 12 times?', 'What is five plus?', 'Compare the iPhone versus?', 'Open the?', 'Play my?', 'Is it bigger than?']) {
    assert.equal(holdFor(said), CONTINUE_MS, said)
  }
})

test('a sentence stopped mid-thought waits for the rest', () => {
  for (const said of ['hey close the Tab with', 'calculate me something so 2:30 + 1000 +', 'open YouTube and', 'search for,']) {
    assert.equal(holdFor(said), CONTINUE_MS, said)
  }
})

test('a full stop waits a moment for a next clause; a plain sentence a little longer', () => {
  assert.equal(holdFor('Open YouTube.'), STOP_MS)
  assert.equal(holdFor('tell me one short fact about the moon'), SETTLE_MS)
})

test('one or two words wait, unless they are a complete command', () => {
  assert.equal(holdFor('open'), CONTINUE_MS)
  assert.equal(holdFor('stop'), SETTLE_MS)
  assert.equal(holdFor('never mind'), SETTLE_MS)
})
