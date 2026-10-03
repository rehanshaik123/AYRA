// Unit tests for bridge/sources.mjs — search results onto the screen. `npm test`
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { searchSources, sourcesCard } from '../bridge/sources.mjs'

const TEXT = [
  'Web search results for query: "Hyderabad weather today"',
  '',
  'Links: [{"title":"Weather Today for Hyderabad","url":"https://www.accuweather.com/en/in/hyderabad"},' +
    '{"title":"Hyderabad, TG Weather Forecast","url":"https://www.msn.com/en-in/weather"}]',
  '',
  'Based on the search results, ...',
].join('\n')

test('links come from the structured result first', () => {
  const s = searchSources(
    { query: 'q', results: [{ content: [{ title: 'A', url: 'https://a.com/1' }] }] },
    TEXT,
  )
  assert.deepEqual(s, { query: 'q', links: [{ title: 'A', url: 'https://a.com/1' }] })
})

test('and from the Links line when there is no structured result', () => {
  const s = searchSources(undefined, [{ type: 'text', text: TEXT }])
  assert.equal(s.query, 'Hyderabad weather today')
  assert.equal(s.links.length, 2)
  assert.equal(s.links[1].url, 'https://www.msn.com/en-in/weather')
})

test('junk, duplicates and non-web links are dropped; nothing usable is null', () => {
  const s = searchSources({
    query: 'q',
    results: [{ content: [
      { title: 'ok', url: 'https://x.com' },
      { title: 'dup', url: 'https://x.com' },
      { title: 'bad', url: 'javascript:alert(1)' },
      { title: '', url: 'https://y.com' },
    ] }],
  })
  assert.deepEqual(s.links, [{ title: 'ok', url: 'https://x.com' }])
  assert.equal(searchSources({ query: 'q', results: [] }, 'no links here'), null)
})

test('the card escapes titles, tags each row with its site and stays short', () => {
  const links = Array.from({ length: 8 }, (_, i) => ({
    title: i === 0 ? '<img src=x onerror=alert(1)>' : `Story ${i}`,
    url: `https://www.site${i}.com/a`,
  }))
  const card = sourcesCard({ query: 'ai news', links })
  assert.equal(card.kind, 'markup')
  assert.equal(card.title, 'AI NEWS')
  assert.ok(!card.html.includes('<img'))
  assert.ok(card.html.includes('&lt;img'))
  assert.ok(card.html.includes('site0.com'))
  assert.equal(card.html.match(/class="hud-row"/g).length, 5)
})
