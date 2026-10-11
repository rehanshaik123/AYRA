import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTagFilter, parseCard, stripTags } from '../bridge/datatag.mjs'

const run = (deltas) => {
  const cards = []
  const f = createTagFilter((json) => cards.push(json))
  let spoken = ''
  for (const d of deltas) spoken += f.push(d)
  spoken += f.end()
  return { spoken, cards }
}

test('the spoken words pass, the tag goes to the card', () => {
  const r = run(['Gold is ₹1,23,450 per ten grams today, boss. ', '<data>{"title":"GOLD"}</data>'])
  assert.equal(r.spoken, 'Gold is ₹1,23,450 per ten grams today, boss. ')
  assert.deepEqual(r.cards, ['{"title":"GOLD"}'])
})

test('a tag split across deltas, in every place', () => {
  const full = 'It is 29 degrees. <data>{"title":"WEATHER","headline":{"label":"Now","value":"29°C"}}</data>'
  for (let size = 1; size <= 9; size++) {
    const parts = []
    for (let i = 0; i < full.length; i += size) parts.push(full.slice(i, i + size))
    const r = run(parts)
    assert.equal(r.spoken, 'It is 29 degrees. ', `size ${size}`)
    assert.equal(r.cards.length, 1)
    assert.ok(parseCard(r.cards[0]).headline.value === '29°C')
  }
})

test('a held "<" that never became a tag is still spoken', () => {
  assert.equal(run(['x < y and 3 <', ' 4.']).spoken, 'x < y and 3 < 4.')
  assert.equal(run(['the end <da']).spoken, 'the end <da')
})

test('words after the tag are spoken; an unclosed tag never is', () => {
  assert.equal(run(['A. <data>{}</data> B.']).spoken, 'A.  B.')
  const r = run(['A. <data>{"title":"X"'])
  assert.equal(r.spoken, 'A. ')
  assert.deepEqual(r.cards, [])
})

test('stripTags cleans the done text and the transcript', () => {
  assert.equal(stripTags('Gold is up. <data>{"a":1}</data>'), 'Gold is up.')
  assert.equal(stripTags('Gold is up. <data>{"a":1'), 'Gold is up.')
  assert.equal(stripTags('No card.'), 'No card.')
})

test('parseCard takes an object, also inside a code fence', () => {
  assert.deepEqual(parseCard('{"title":"X"}'), { title: 'X' })
  assert.deepEqual(parseCard('```json\n{"title":"X"}\n```'), { title: 'X' })
  assert.equal(parseCard('[1]'), null)
  assert.equal(parseCard('nope'), null)
})
