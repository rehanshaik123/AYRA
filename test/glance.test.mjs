import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GLANCE_MAX, glance, sameGlance } from '../src/lib/glance.ts'

const turns = [
  { id: '1', role: 'user', text: 'What is the gold price today?' },
  { id: '2', role: 'assistant', text: 'Gold is about one lakh fifty-one thousand rupees per ten grams.' },
]

test('listening: the live words, yours; the level dots are not words; how it began', () => {
  assert.deepEqual(glance({ phase: 'listening', caption: 'open you', turns }, 'name'), { phase: 'listening', text: 'open you', who: 'you', by: 'name' })
  assert.deepEqual(glance({ phase: 'listening', caption: '…', turns }, 'press'), { phase: 'listening', text: '', who: '', by: 'press' })
})

test('thinking: your question; speaking and standby: her answer', () => {
  assert.equal(glance({ phase: 'thinking', caption: '', turns }).text, 'What is the gold price today?')
  assert.equal(glance({ phase: 'thinking', caption: '', turns }).who, 'you')
  const g = glance({ phase: 'speaking', caption: '', turns })
  assert.equal(g.who, 'her')
  assert.match(g.text, /^Gold is about/)
  assert.equal(glance({ phase: 'dormant', caption: '', turns }).who, 'her')
  assert.deepEqual(glance({ phase: 'offline', caption: 'x', turns }), { phase: 'offline', text: '', who: '', by: '' })
})

test('a long answer shows its newest words, on one line', () => {
  const long = { id: '3', role: 'assistant', text: `${'word '.repeat(80)}\nthe end.` }
  const g = glance({ phase: 'speaking', caption: '', turns: [...turns, long] })
  assert.equal(g.text.length, GLANCE_MAX)
  assert.ok(g.text.startsWith('…') && g.text.endsWith('the end.') && !g.text.includes('\n'))
})

test('sameGlance: nothing to send when nothing changed', () => {
  const g = glance({ phase: 'speaking', caption: '', turns })
  assert.equal(sameGlance(null, g), false)
  assert.equal(sameGlance({ ...g }, g), true)
  assert.equal(sameGlance({ ...g, phase: 'dormant' }, g), false)
})
