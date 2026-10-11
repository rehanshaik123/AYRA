// Unit tests for bridge/sources.mjs — where an answer came from, on screen. `npm test`
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTurnCards, normaliseUrl, searchSources, sourcesCard, titleFromUrl } from '../bridge/sources.mjs'

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

test('one spelling per page: host, www, https, slash, fragment and utm tags', () => {
  const want = 'https://goodreturns.in/gold-rates/hyderabad.html'
  for (const url of [
    'https://www.goodreturns.in/gold-rates/hyderabad.html',
    'http://goodreturns.in/gold-rates/hyderabad.html/',
    'https://WWW.GoodReturns.in/gold-rates/hyderabad.html#today',
    'https://goodreturns.in/gold-rates/hyderabad.html?utm_source=x&utm_medium=y',
    '  https://goodreturns.in/gold-rates/hyderabad.html  ',
  ]) {
    assert.equal(normaliseUrl(url), want, url)
  }
  // Real query parameters are part of the page; only the tracking goes.
  assert.equal(normaliseUrl('https://x.com/a?id=7&utm_campaign=z'), 'https://x.com/a?id=7')
  assert.notEqual(normaliseUrl('https://x.com/a?id=7'), normaliseUrl('https://x.com/a?id=8'))
  assert.equal(normaliseUrl('https://x.com/'), 'https://x.com')
  for (const bad of ['javascript:alert(1)', 'ftp://x.com/a', 'not a url', '', null, undefined]) {
    assert.equal(normaliseUrl(bad), '', String(bad))
  }
})

test('a page known only by its address is titled from its path, else its site', () => {
  assert.equal(titleFromUrl('https://www.goodreturns.in/gold-rates/hyderabad-gold-rate.html'), 'hyderabad gold rate')
  assert.equal(titleFromUrl('https://www.bbc.com/news/12345678'), 'bbc.com')
  assert.equal(titleFromUrl('https://example.com/'), 'example.com')
})

test('the sources card is a list of real links: structured, no HTML, five at most', () => {
  const links = Array.from({ length: 8 }, (_, i) => ({
    title: i === 0 ? '<img src=x onerror=alert(1)>' : `Story ${i}`,
    url: `https://www.site${i}.com/a`,
  }))
  const card = sourcesCard({ links }, 'src-a1')
  assert.deepEqual(Object.keys(card).sort(), ['hold', 'id', 'kind', 'links', 'size', 'title'])
  assert.equal(card.id, 'src-a1')
  assert.equal(card.title, 'SOURCES')
  assert.equal(card.kind, 'sources')
  assert.equal(card.size, 'compact')
  assert.equal(card.hold, 'turn')
  assert.equal(card.html, undefined)
  assert.equal(card.links.length, 5)
  // A title is text for the face to render as text, never markup.
  assert.deepEqual(card.links[0], { title: '<img src=x onerror=alert(1)>', url: 'https://www.site0.com/a', domain: 'site0.com' })
})

test('the card keeps web links only, one per page, and titles a bare link from its path', () => {
  const card = sourcesCard({
    links: [
      { title: 'Gold today', url: 'https://www.goodreturns.in/gold-rates/' },
      { title: 'Same page', url: 'http://goodreturns.in/gold-rates#x' },
      { title: 'Bad', url: 'javascript:alert(1)' },
      { url: 'https://www.livemint.com/market/gold-price-today' },
      { title: 'Line\nbreaks\tand   space', url: 'https://x.com/a' },
    ],
  })
  assert.match(card.id, /^s/)
  assert.deepEqual(card.links.map((l) => l.title), ['Gold today', 'gold price today', 'Line breaks and space'])
  assert.deepEqual(card.links.map((l) => l.domain), ['goodreturns.in', 'livemint.com', 'x.com'])
  assert.deepEqual(sourcesCard({}).links, [])
})

// ---------------------------------------------------------------------------
// A turn's cards
// ---------------------------------------------------------------------------

/** A HUD screen in a test: the blades it was sent, and a turn that can move on. */
function screen(ask = 'a1') {
  const sent = []
  let current = { ask, rank: null, text: 'q' }
  const cards = createTurnCards({ send: (blade) => sent.push(blade), turn: () => current })
  return { sent, cards, next: (id) => { current = { ask: id, rank: null, text: 'q2' } } }
}

const GOLD = [
  { title: 'Gold Rate Today in Hyderabad', url: 'https://www.goodreturns.in/gold-rates/hyderabad.html' },
  { title: 'Gold price today', url: 'https://www.livemint.com/market/gold-price-today' },
  { title: 'Gold rates — Hyderabad', url: 'https://www.bankbazaar.com/gold-rate-hyderabad.html' },
  { title: 'Gold Price India', url: 'https://www.moneycontrol.com/commodity/gold-price.html' },
]

test('search results and pages read stay with the turn; the face is sent nothing', () => {
  const { sent, cards } = screen()
  assert.equal(cards.observe({ type: 'sources', query: 'gold', links: GOLD, text: 'Gold ₹1,23,450 per 10 g', ask: 'a1' }), true)
  assert.equal(cards.observe({ type: 'fetched', url: 'https://www.livemint.com/market/gold-price-today', text: 'Rs 1,23,450', ask: 'a1' }), true)
  assert.equal(cards.observe({ type: 'text', delta: 'Gold is…', ask: 'a1' }), false)
  assert.deepEqual(sent, [])
  const ev = cards.evidence()
  assert.equal(ev.key, 'a1')
  assert.equal(ev.links.length, 4)
  assert.deepEqual(ev.pages, ['https://www.livemint.com/market/gold-price-today'])
  assert.match(ev.text, /1,23,450 per 10 g/)
  assert.match(ev.text, /Rs 1,23,450/)
  assert.equal(ev.data || ev.sources || ev.research, false)
})

test('at the end of a turn with no data card: the pages read, titled from the search', () => {
  const { sent, cards } = screen()
  cards.observe({ type: 'sources', links: GOLD, text: '', ask: 'a1' })
  cards.observe({ type: 'fetched', url: 'http://livemint.com/market/gold-price-today/', text: '', ask: 'a1' })
  assert.equal(cards.observe({ type: 'done', text: 'Gold is…', ask: 'a1' }), false)
  assert.equal(sent.length, 1)
  assert.equal(sent[0].id, 'src-a1')
  assert.equal(sent[0].kind, 'sources')
  assert.deepEqual(sent[0].links.map((l) => l.title), ['Gold price today'])
})

test('…else the top three of the last search; and never a second sources card', () => {
  const { sent, cards } = screen()
  cards.observe({ type: 'sources', links: [{ title: 'Old', url: 'https://old.com/a' }], ask: 'a1' })
  cards.observe({ type: 'sources', links: GOLD, ask: 'a1' })
  cards.observe({ type: 'done', ask: 'a1' })
  cards.observe({ type: 'done', ask: 'a1' })
  assert.equal(sent.length, 1)
  assert.deepEqual(sent[0].links.map((l) => l.domain), ['goodreturns.in', 'livemint.com', 'bankbazaar.com'])
})

test('a turn with no web results ends with no card', () => {
  const { sent, cards } = screen()
  cards.observe({ type: 'done', ask: 'a1' })
  assert.deepEqual(sent, [])
})

test('the data card, then the sources card narrowed to the URLs used, in their order', () => {
  const { sent, cards } = screen()
  cards.observe({ type: 'sources', links: GOLD, ask: 'a1' })
  const data = { title: 'GOLD · HYDERABAD', headline: { label: '24K', value: '₹1,23,450', unit: 'per 10 g' }, rows: [] }
  cards.showData(data, [
    'https://bankbazaar.com/gold-rate-hyderabad.html?utm_source=chat',
    'https://not-in-this-turn.example/gold',
    'http://www.goodreturns.in/gold-rates/hyderabad.html#rate',
  ])
  assert.deepEqual(sent.map((b) => `${b.kind}:${b.id}`), ['data:d-a1', 'sources:src-a1'])
  assert.deepEqual(sent[0], { id: 'd-a1', title: 'GOLD · HYDERABAD', kind: 'data', data, size: 'compact', hold: 'turn' })
  // The links as the search gave them, not as the model spelled them.
  assert.deepEqual(sent[1].links.map((l) => l.url), [GOLD[2].url, GOLD[0].url])
  const ev = cards.evidence()
  assert.equal(ev.data && ev.sources, true)
  // The turn's end adds nothing more.
  cards.observe({ type: 'done', ask: 'a1' })
  assert.equal(sent.length, 2)
})

test('no URL matches: the top three of the last search stand in', () => {
  const { sent, cards } = screen()
  cards.observe({ type: 'sources', links: GOLD, ask: 'a1' })
  cards.showData({ title: 'X', headline: { label: 'a', value: '1' }, rows: [] }, ['https://made-up.example/'])
  assert.equal(sent[1].links.length, 3)
  assert.equal(sent[1].links[0].url, GOLD[0].url)
})

test('a page read counts as a source to name, even when no search found it', () => {
  const { sent, cards } = screen()
  cards.observe({ type: 'fetched', url: 'https://www.rbi.org.in/scripts/ReferenceRateArchive.aspx', text: '83.52', ask: 'a1' })
  cards.showData({ title: 'USD/INR', headline: { label: 'Reference rate', value: '83.52' }, rows: [] }, ['https://rbi.org.in/scripts/ReferenceRateArchive.aspx'])
  assert.deepEqual(sent[1].links, [{ title: 'ReferenceRateArchive', url: 'https://www.rbi.org.in/scripts/ReferenceRateArchive.aspx', domain: 'rbi.org.in' }])
})

test("research's result cards pass through and count as the turn's", () => {
  const { sent, cards } = screen()
  cards.observe({ type: 'sources', links: GOLD, ask: 'a1' })
  cards.research({ id: 'r1', kind: 'research', title: 'RESEARCH' })
  assert.equal(cards.evidence().research, false)
  cards.research({ id: 'd-a1', kind: 'data', title: 'GOLD', replaces: 'r1' })
  cards.research({ id: 'src-a1', kind: 'sources', title: 'SOURCES', links: [] })
  cards.observe({ type: 'done', ask: 'a1' })
  assert.deepEqual(sent.map((b) => b.id), ['r1', 'd-a1', 'src-a1'])
  const ev = cards.evidence()
  assert.equal(ev.research && ev.data && ev.sources, true)
})

test('a new question starts afresh; an older turn\'s leftovers are dropped', () => {
  const { sent, cards, next } = screen()
  cards.observe({ type: 'sources', links: GOLD, ask: 'a1' })
  next('a2')
  // A barge-in's leftovers: they say nothing about the new question.
  assert.equal(cards.observe({ type: 'sources', links: [{ title: 'late', url: 'https://late.com/' }], ask: 'a1' }), true)
  assert.equal(cards.observe({ type: 'done', ask: 'a1' }), false)
  assert.deepEqual(sent, [])
  const ev = cards.evidence()
  assert.equal(ev.key, 'a2')
  assert.deepEqual(ev.links, [])
})

test('a turn with no ask id gets a counter for its card ids', () => {
  const sent = []
  let current = { ask: null, rank: null, text: 'q' }
  const cards = createTurnCards({ send: (b) => sent.push(b), turn: () => current })
  cards.observe({ type: 'sources', links: GOLD })
  cards.observe({ type: 'done' })
  current = { ask: null, rank: null, text: 'q2' }
  cards.observe({ type: 'sources', links: GOLD })
  cards.observe({ type: 'done' })
  assert.deepEqual(sent.map((b) => b.id), ['src-t1', 'src-t2'])
})
