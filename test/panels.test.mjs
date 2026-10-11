// Unit tests for bridge/panels.mjs — the HUD's tools, show_data above all. `npm test`
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DATA_LIMITS, checkData, displayTools } from '../bridge/panels.mjs'
import { createTurnCards } from '../bridge/sources.mjs'
import { cleanData, cleanLinks } from '../src/lib/research.ts'

const GOLD = [
  { title: 'Gold Rate Today in Hyderabad', url: 'https://www.goodreturns.in/gold-rates/hyderabad.html' },
  { title: 'Gold price today', url: 'https://www.livemint.com/market/gold-price-today' },
  { title: 'Gold rates — Hyderabad', url: 'https://www.bankbazaar.com/gold-rate-hyderabad.html' },
  { title: 'Gold Price India', url: 'https://www.moneycontrol.com/commodity/gold-price.html' },
]
const RESULTS = 'Web search results for query: "gold price hyderabad"\n' +
  '24 carat gold in Hyderabad is ₹1,23,450 per 10 grams today, up 0.8% from yesterday. 22 carat: ₹1,13,160.'

/** The HUD in a test: its tools, the blades they sent and the turn they belong to. */
function hud({ ask = 'a1', search = true } = {}) {
  const sent = []
  let current = { ask, rank: null, text: "what's the price of gold" }
  const cards = createTurnCards({ send: (b) => sent.push(b), turn: () => current })
  if (search) cards.observe({ type: 'sources', query: 'gold price hyderabad', links: GOLD, text: RESULTS, ask })
  const tools = displayTools((b) => sent.push(b), { cards })
  const call = async (name, args) => tools.find((t) => t.name === name).handler(args, {})
  return { sent, cards, call, next: (id) => { current = { ask: id, rank: null, text: 'next' } } }
}

const text = (result) => result.content[0].text

const GOLD_DATA = {
  title: 'GOLD PRICE · HYDERABAD',
  headline: { label: '24K gold', value: '₹1,23,450', unit: 'per 10 g', asOf: '8 Oct', change: '+0.8%' },
  rows: [{ label: '22K gold', value: '₹1,13,160', unit: 'per 10 g' }],
  sources: ['http://goodreturns.in/gold-rates/hyderabad.html/', 'https://www.livemint.com/market/gold-price-today?utm_source=x'],
}

test('the HUD has its four tools', () => {
  const tools = displayTools(() => {})
  assert.deepEqual(tools.map((t) => t.name), ['display', 'blade', 'probe_url', 'show_data'])
  // `anim` and `accent` were never used by the face; they are gone.
  const display = tools[0]
  assert.equal(display.inputSchema.anim, undefined)
  assert.equal(display.inputSchema.accent, undefined)
  // A web answer is not a panel: the old search-results card and the
  // read-then-panel advice are out of its instructions.
  assert.ok(!display.description.includes('Search results:'))
  assert.ok(!/crawl it, then panel/.test(display.description))
  assert.ok(display.description.includes('show_data'))
})

test('show_data: the data card, then the sources card narrowed to the URLs used', async () => {
  const { sent, call } = hud()
  const result = await call('show_data', GOLD_DATA)
  assert.equal(result.isError, undefined)
  assert.equal(text(result), 'Shown. Say nothing more.')
  assert.equal(sent.length, 2)
  assert.deepEqual(sent[0], {
    id: 'd-a1',
    title: 'GOLD PRICE · HYDERABAD',
    kind: 'data',
    data: {
      title: 'GOLD PRICE · HYDERABAD',
      headline: { label: '24K gold', value: '₹1,23,450', unit: 'per 10 g', asOf: '8 Oct', change: '+0.8%' },
      rows: [{ label: '22K gold', value: '₹1,13,160', unit: 'per 10 g' }],
    },
    size: 'compact',
    hold: 'turn',
  })
  assert.equal(sent[1].id, 'src-a1')
  assert.equal(sent[1].kind, 'sources')
  // Matched after normalising, in the order given, as the search spelled them.
  assert.deepEqual(sent[1].links.map((l) => l.url), [GOLD[0].url, GOLD[1].url])
  // The face (src/lib/research.ts) reads both cards exactly as they were sent.
  assert.deepEqual(cleanData(sent[0].data), sent[0].data)
  assert.deepEqual(cleanLinks(sent[1].links), sent[1].links)
})

test('a name, a score or a yes/no has no figure to check', async () => {
  const { sent, call } = hud()
  const result = await call('show_data', {
    title: 'MATCH', headline: { label: 'Winner', value: 'India' }, sources: [GOLD[0].url],
  })
  assert.equal(text(result), 'Shown. Say nothing more.')
  assert.deepEqual(sent[0].data, { title: 'MATCH', headline: { label: 'Winner', value: 'India' }, rows: [] })
})

test('refused: no headline and no rows', async () => {
  const { sent, call } = hud()
  for (const args of [
    { title: 'X', sources: [GOLD[0].url] },
    { title: 'X', headline: null, rows: [] },
    { title: 'X', headline: { label: 'a', value: '  ' }, rows: [{ label: '', value: '5' }] },
  ]) {
    const r = await call('show_data', args)
    assert.equal(r.isError, true, JSON.stringify(args))
  }
  assert.deepEqual(sent, [])
})

test('refused: no search or page this turn', async () => {
  const { sent, call } = hud({ search: false })
  const r = await call('show_data', { title: 'GOLD', headline: { label: 'Gold', value: 'India' } })
  assert.equal(r.isError, true)
  assert.equal(text(r), 'No sources this turn: just say the answer.')
  assert.deepEqual(sent, [])
})

test('refused: a figure the results never gave', async () => {
  const { sent, call } = hud()
  const r = await call('show_data', {
    ...GOLD_DATA,
    headline: { label: '24K gold', value: '₹1,32,540', unit: 'per 10 g' },
  })
  assert.equal(r.isError, true)
  assert.equal(text(r), '"₹1,32,540" is not in the search results — use the figure as the results give it.')
  // A row and a change are checked too.
  const row = await call('show_data', { ...GOLD_DATA, rows: [{ label: '18K', value: '₹92,500' }] })
  assert.equal(text(row), '"₹92,500" is not in the search results — use the figure as the results give it.')
  const change = await call('show_data', { ...GOLD_DATA, headline: { ...GOLD_DATA.headline, change: '+1.4%' } })
  assert.equal(change.isError, true)
  assert.deepEqual(sent, [])
})

test('a figure she calculated or converted is shown when the note says so', async () => {
  for (const note of ['Converted at ₹83.5 to the dollar', 'Calculated from the 24K rate', 'computed: 10 g × rate']) {
    const { sent, call } = hud()
    const r = await call('show_data', {
      title: 'GOLD IN USD', headline: { label: '24K gold', value: '$1,478', unit: 'per 10 g' }, note,
      sources: [GOLD[0].url],
    })
    assert.equal(text(r), 'Shown. Say nothing more.', note)
    assert.equal(sent[0].data.note, note)
  }
  // Any other note is no licence for a figure the results never gave.
  const { call } = hud()
  const r = await call('show_data', {
    title: 'GOLD IN USD', headline: { label: '24K gold', value: '$1,478' }, note: 'Approximate', sources: [GOLD[0].url],
  })
  assert.equal(r.isError, true)
})

test('a page read counts: its text is checked and its URL can be named', async () => {
  const { sent, cards, call } = hud({ search: false })
  cards.observe({ type: 'fetched', url: 'https://www.rbi.org.in/rates', text: 'Reference rate: 1 USD = ₹83.52', ask: 'a1' })
  const r = await call('show_data', {
    title: 'USD · INR', headline: { label: 'RBI reference rate', value: '₹83.52' }, sources: ['https://rbi.org.in/rates/'],
  })
  assert.equal(text(r), 'Shown. Say nothing more.')
  assert.deepEqual(sent[1].links.map((l) => l.url), ['https://www.rbi.org.in/rates'])
})

test('unknown URLs are ignored; none known → the top three of the last search', async () => {
  const { sent, call } = hud()
  await call('show_data', { ...GOLD_DATA, sources: ['https://made-up.example/gold', 'not a url'] })
  assert.deepEqual(sent[1].links.map((l) => l.url), GOLD.slice(0, 3).map((l) => l.url))
})

test('no sources given → the top of the last search; never more than three', async () => {
  const { sent, call } = hud()
  await call('show_data', { ...GOLD_DATA, sources: GOLD.map((l) => l.url) })
  assert.equal(sent[1].links.length, 3)
  const other = hud()
  await other.call('show_data', { ...GOLD_DATA, sources: undefined })
  assert.equal(other.sent[1].links.length, 3)
})

test('refused once research has put its cards up this turn', async () => {
  const { sent, cards, call } = hud()
  cards.research({ id: 'd-a1', kind: 'data', title: 'GOLD' })
  cards.research({ id: 'src-a1', kind: 'sources', title: 'SOURCES', links: [] })
  const r = await call('show_data', GOLD_DATA)
  assert.equal(r.isError, true)
  assert.match(text(r), /research cards are already on screen/)
  assert.equal(sent.length, 2)
})

test('one data card per turn; the next question gets its own', async () => {
  const { sent, cards, call, next } = hud()
  await call('show_data', GOLD_DATA)
  const again = await call('show_data', GOLD_DATA)
  assert.equal(again.isError, undefined)
  assert.equal(text(again), 'Already on screen. Say nothing more.')
  assert.equal(sent.length, 2)
  next('a2')
  cards.observe({ type: 'sources', links: GOLD, text: RESULTS, ask: 'a2' })
  await call('show_data', GOLD_DATA)
  assert.deepEqual(sent.map((b) => b.id), ['d-a1', 'src-a1', 'd-a2', 'src-a2'])
})

test('everything is clipped in code: title, values, rows, note', () => {
  const evidence = { links: GOLD, pages: [], text: RESULTS, data: false, research: false }
  const long = 'x'.repeat(200)
  const verdict = checkData({
    title: 'A VERY LONG TITLE THAT GOES ON AND ON AND ON',
    headline: { label: long, value: 'India, after a long chase that went right down to the wire', asOf: long, unit: long },
    rows: [1, 2, 3, 4, 5].map((i) => ({ label: `Row ${i}`, value: 'Yes' })),
    note: long,
    sources: GOLD.map((l) => l.url),
  }, evidence)
  assert.equal(verdict.ok, true)
  const { data, urls } = verdict
  assert.ok(data.title.length <= DATA_LIMITS.title)
  assert.ok(data.headline.value.length <= DATA_LIMITS.value)
  // Cut at a word, never through a figure.
  assert.equal(data.headline.value, 'India, after a long chase that went…')
  assert.ok(data.headline.label.length <= DATA_LIMITS.label)
  assert.ok(data.headline.asOf.length <= DATA_LIMITS.text)
  // The unit sits beside the figure: the face's own limit, so it is cut once, here.
  assert.ok(data.headline.unit.length <= DATA_LIMITS.unit)
  assert.equal(DATA_LIMITS.unit, 20)
  assert.equal(data.rows.length, DATA_LIMITS.rows)
  assert.ok(data.note.length <= DATA_LIMITS.note)
  assert.equal(urls.length, DATA_LIMITS.sources)
  // No evidence at all is the same as none this turn.
  assert.equal(checkData({ headline: { label: 'a', value: 'b' } }, null).error, 'No sources this turn: just say the answer.')
})

test('without a screen record show_data says there is nothing to show from', async () => {
  const tools = displayTools(() => {})
  const r = await tools.find((t) => t.name === 'show_data').handler({ title: 'X', headline: { label: 'a', value: 'India' } }, {})
  assert.equal(r.isError, true)
})

test('display still draws its markup and refuses an empty body', async () => {
  const sent = []
  const display = displayTools((b) => sent.push(b))[0]
  const ok = await display.handler({ title: 'DOWNLOADS', html: '<div class="hud-rows">two files</div>', slot: 'wide', hold: 'turn' }, {})
  assert.equal(text(ok), 'On screen.')
  assert.equal(sent[0].kind, 'markup')
  assert.equal(sent[0].size, 'wide')
  const empty = await display.handler({ title: 'X', html: '<div></div>' }, {})
  assert.equal(empty.isError, true)
  assert.equal(sent.length, 1)
})
