// Unit tests for src/lib/research.ts — what the research progress card and an
// answer's data and sources cards show. `npm test`
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  STAGES,
  activityLine,
  changeTone,
  cleanData,
  cleanLinks,
  dataFoot,
  domainOf,
  elapsed,
  isWebUrl,
  liveElapsed,
  partActive,
  partCounts,
  partStateLabel,
  pct,
  rankLabel,
  reviewLine,
  savedAgo,
  statusPill,
  withDefaults,
} from '../src/lib/research.ts'

/** A state the way bridge/research.mjs sends it, mid-run. */
const running = () => ({
  id: 'rs-abc-1',
  question: 'compare iPhone 17 and Pixel 10 for camera, battery and price',
  status: 'running',
  mode: 'live',
  startedAt: 1_000,
  ms: 12_000,
  rank: { score: 8, level: 'complex', parts: 4, reasons: ['comparison', 'several parts'] },
  stages: [
    { key: 'rank', label: 'Rank', state: 'done', ms: 1 },
    { key: 'split', label: 'Split', state: 'done', ms: 2400, note: '4 parts' },
    { key: 'agents', label: 'Agents', state: 'run' },
    { key: 'review', label: 'Review', state: 'wait' },
  ],
  parts: [
    { i: 1, title: 'Camera', question: 'Which camera is better?', state: 'report', found: 9, read: 3, findings: 4 },
    { i: 2, title: 'Battery life', question: 'Battery?', state: 'search', found: 6, read: 0, findings: 0 },
    { i: 3, title: 'Price', question: 'Price?', state: 'done', found: 8, read: 1, findings: 1 },
    { i: 4, title: 'Software', question: 'Updates?', state: 'fail', found: 0, read: 0, findings: 0, error: 'no readable pages' },
  ],
  review: null,
  stats: { calls: 6, found: 23, read: 7, findings: 5, quotes: 6, dropped: 1, injections: 0 },
  answer: { text: '', confidence: null, label: null },
  data: null,
  sources: [],
  facts: [],
  gaps: [],
})

test('withDefaults: a real running state comes through as sent', () => {
  const r = withDefaults(running())
  assert.equal(r.id, 'rs-abc-1')
  assert.equal(r.status, 'running')
  assert.deepEqual(r.rank, { score: 8, level: 'complex', parts: 4, reasons: ['comparison', 'several parts'] })
  assert.deepEqual(r.stages.map((s) => [s.key, s.state]), [['rank', 'done'], ['split', 'done'], ['agents', 'run'], ['review', 'wait']])
  assert.equal(r.stages[1].note, '4 parts')
  assert.equal(r.stages[1].ms, 2400)
  assert.equal(r.parts.length, 4)
  assert.deepEqual(r.parts[3], { i: 4, title: 'Software', question: 'Updates?', state: 'fail', found: 0, read: 0, findings: 0, error: 'no readable pages' })
  assert.equal(r.review, null)
  assert.equal(r.stats.calls, 6)
  assert.equal(r.data, null)
})

test('withDefaults: an empty or hostile object still renders', () => {
  const r = withDefaults(null)
  assert.equal(r.status, 'running')
  assert.equal(r.mode, 'live')
  assert.equal(r.rank, null)
  assert.deepEqual(r.stages.map((s) => s.key), STAGES.map(([k]) => k))
  assert.deepEqual(r.stages.map((s) => s.label), ['Rank', 'Split', 'Agents', 'Review'])
  assert.ok(r.stages.every((s) => s.state === 'wait'))
  assert.deepEqual(r.parts, [])
  assert.equal(r.review, null)
  assert.deepEqual(r.sources, [])
  assert.deepEqual(r.facts, [])
  assert.deepEqual(r.answer, { text: '', confidence: null, label: null })
  assert.equal(r.data, null)
  assert.equal(r.stats.calls, 0)

  const odd = withDefaults({
    question: { toString: () => 'what?' },
    status: 'exploded',
    mode: 'tape',
    rank: { score: 42, level: 'complex', parts: 'four', reasons: 'not a list' },
    stages: [{ key: 'review', state: 'run', label: 'Review' }, { key: 'split', state: 'done', ms: 900 }, { key: 'bogus', state: 'run' }],
    parts: [{ title: { bad: true }, state: 'dancing', found: -3, read: 2.6, findings: 'x' }, null],
    review: { findings: 14, kept: '6', duplicates: 3 },
    stats: { calls: Infinity, read: -1 },
    sources: [{ n: 2, title: 7, url: 'https://www.who.int/x', kind: 'alien', trust: 7, used: 'yes' }],
    facts: [{ text: 'f', status: 'maybe', support: [1, 'two', 0, 3], contradict: null, confidence: -1, relevance: 99 }],
    answer: { text: 'ok', confidence: 'high', label: 'Very' },
    gaps: ['a', '', 3],
  })
  assert.equal(odd.question, 'what?')
  assert.equal(odd.status, 'running')
  assert.equal(odd.mode, 'live')
  assert.deepEqual(odd.rank, { score: 10, level: 'complex', parts: 0, reasons: [] })
  // Unknown stage keys are dropped; the four stay, in order.
  assert.equal(odd.stages.length, 4)
  assert.equal(odd.stages[1].state, 'done')
  assert.equal(odd.stages[1].label, 'Split')
  assert.equal(odd.stages[3].state, 'run')
  assert.equal(odd.stages[0].state, 'wait')
  // Unknown part states are 'wait'; numbers are counts; a missing index is the position.
  assert.equal(odd.parts.length, 2)
  assert.equal(odd.parts[0].i, 1)
  assert.equal(odd.parts[0].state, 'wait')
  assert.equal(typeof odd.parts[0].title, 'string')
  assert.equal(odd.parts[0].found, 0)
  assert.equal(odd.parts[0].read, 3)
  assert.equal(odd.parts[0].findings, 0)
  assert.equal(odd.parts[1].i, 2)
  assert.deepEqual(odd.review, { findings: 14, kept: 0, duplicates: 3, offTopic: 0, weak: 0 })
  assert.equal(odd.stats.calls, 0)
  assert.equal(odd.stats.read, 0)
  const s = odd.sources[0]
  assert.equal(s.title, '7')
  assert.equal(s.domain, 'who.int')
  assert.equal(s.kind, 'web')
  assert.equal(s.trust, 1)
  assert.equal(s.used, false)
  const f = odd.facts[0]
  assert.equal(f.id, 'f1')
  assert.equal(f.status, 'single')
  assert.deepEqual(f.support, [1, 3])
  assert.deepEqual(f.contradict, [])
  assert.equal(f.confidence, 0)
  assert.equal(f.relevance, 10)
  assert.deepEqual(odd.answer, { text: 'ok', confidence: null, label: null })
  assert.deepEqual(odd.gaps, ['a', '3'])

  // A rank with a level the face does not know is no rank at all.
  assert.equal(withDefaults({ rank: { score: 5, level: 'epic' } }).rank, null)
  // An object whose toString throws is nothing, not a crash.
  assert.equal(withDefaults({ question: Object.create(null) }).question, '')
})

test('withDefaults clips what the web wrote', () => {
  const r = withDefaults({ question: 'q'.repeat(5000), error: 'e'.repeat(900), parts: [{ title: 't'.repeat(300) }] })
  assert.ok(r.question.length <= 400)
  assert.ok(r.question.endsWith('…'))
  assert.ok((r.error ?? '').length <= 240)
  assert.ok(r.parts[0].title.length <= 60)
  assert.equal(withDefaults({ parts: Array.from({ length: 12 }, () => ({})) }).parts.length, 6)
})

test('cleanData: figures as strings, clipped, nothing invented', () => {
  const d = cleanData({
    title: 'GOLD PRICE · INDIA',
    headline: { label: 'Gold, 24 carat, 10 g', value: '₹1,23,450', unit: 'INR', asOf: '8 Oct 2026', change: '+0.4%', n: 2, extra: 'x' },
    rows: [
      { label: '22 carat', value: '₹1,13,160', n: 2 },
      { label: 'Silver, 1 kg', value: 1_52_000, unit: 'INR', note: 'Delhi', n: 3.5 },
      { label: '', value: '' },
      { label: { toString: () => 'MCX' }, value: '₹1,22,980' },
    ],
    note: 'Prices include 3% GST.',
  })
  assert.deepEqual(d, {
    title: 'GOLD PRICE · INDIA',
    headline: { label: 'Gold, 24 carat, 10 g', value: '₹1,23,450', unit: 'INR', asOf: '8 Oct 2026', change: '+0.4%', n: 2 },
    rows: [
      { label: '22 carat', value: '₹1,13,160', n: 2 },
      { label: 'Silver, 1 kg', value: '152000', unit: 'INR', note: 'Delhi' },
      { label: 'MCX', value: '₹1,22,980' },
    ],
    note: 'Prices include 3% GST.',
  })
})

test('cleanData: a headline needs a value; nothing at all is null; rows stop at eight', () => {
  assert.equal(cleanData(null), null)
  assert.equal(cleanData('gold'), null)
  assert.equal(cleanData({ title: 'X', headline: null, rows: [] }), null)
  const noValue = cleanData({ headline: { label: 'Price' }, rows: [{ label: 'a', value: '1' }] })
  assert.equal(noValue.headline, null)
  assert.equal(noValue.rows.length, 1)
  // The review found no figures: the answer's first sentence and nothing else.
  assert.deepEqual(cleanData({ title: 'ANSWER', headline: null, rows: [], note: 'Mostly yes [2].' }), {
    title: 'ANSWER',
    headline: null,
    rows: [],
    note: 'Mostly yes [2].',
  })
  const many = cleanData({ headline: null, rows: Array.from({ length: 20 }, (_, i) => ({ label: `r${i}`, value: String(i) })) })
  assert.equal(many.rows.length, 8)
  const long = cleanData({
    headline: { label: 'l'.repeat(500), value: '9'.repeat(500), unit: 'u'.repeat(99), change: 'c'.repeat(99) },
    rows: 'nope',
  })
  assert.ok(long.headline.label.length <= 60)
  assert.ok(long.headline.value.length <= 40)
  assert.ok(long.headline.unit.length <= 20)
  assert.ok(long.headline.change.length <= 40)
  assert.deepEqual(long.rows, [])
  // What the bridge sends at its own limits arrives whole.
  const atLimit = { label: 'Gold', value: '9'.repeat(40), unit: 'u'.repeat(20), asOf: 'a'.repeat(40), change: 'c'.repeat(40) }
  assert.deepEqual(cleanData({ title: 'X', headline: atLimit, rows: [] }).headline, atLimit)
})

test('cleanLinks: five at most, repeats dropped, domain filled in', () => {
  const links = cleanLinks([
    { n: 1, title: 'Gold rate today', url: 'https://www.goodreturns.in/gold-rates/', domain: 'goodreturns.in' },
    { n: 2, title: 'MCX', url: 'https://www.mcxindia.com/market-data' },
    { n: 3, title: 'dup', url: 'https://www.goodreturns.in/gold-rates/' },
    'https://economictimes.indiatimes.com/markets/gold',
    { title: 'Not a page', url: 'javascript:alert(1)' },
    { title: { evil: true }, url: { href: 'x' } },
    { title: '', url: '' },
    { n: 0, title: 'Sixth', url: 'https://six.example' },
    { title: 'Seventh', url: 'https://seven.example' },
  ])
  assert.equal(links.length, 5)
  assert.deepEqual(links[0], { n: 1, title: 'Gold rate today', url: 'https://www.goodreturns.in/gold-rates/', domain: 'goodreturns.in' })
  assert.equal(links[1].domain, 'mcxindia.com')
  assert.deepEqual(links[2], { title: '', url: 'https://economictimes.indiatimes.com/markets/gold', domain: 'economictimes.indiatimes.com' })
  // Kept, so the card can show it — as words, never as a link (isWebUrl).
  assert.equal(links[3].url, 'javascript:alert(1)')
  assert.equal(links[3].domain, '')
  assert.equal(isWebUrl(links[3].url), false)
  assert.equal(typeof links[4].title, 'string')
  assert.deepEqual(cleanLinks('nope'), [])
  assert.deepEqual(cleanLinks(null), [])
  assert.equal(cleanLinks([{ url: 'https://a.example', title: 't'.repeat(900) }])[0].title.length <= 200, true)
})

test('pct and elapsed', () => {
  assert.equal(pct(0.82), '82%')
  assert.equal(pct(0), '0%')
  assert.equal(pct(1.4), '100%')
  assert.equal(pct(null), '—')
  assert.equal(pct(undefined), '—')
  assert.equal(pct(Number.NaN), '—')
  assert.equal(elapsed(52_300), '52.3 s')
  assert.equal(elapsed(0), '0.0 s')
  assert.equal(elapsed(59_940), '59.9 s')
  assert.equal(elapsed(64_200), '1 m 04 s')
  assert.equal(elapsed(-5), '0.0 s')
  assert.equal(elapsed(Number.NaN), '0.0 s')
})

test('liveElapsed ticks only for a live run, and distrusts a strange clock', () => {
  const now = 1_000_000
  assert.equal(liveElapsed({ status: 'running', mode: 'live', startedAt: now - 12_000, ms: 10_000 }, now), 12_000)
  assert.equal(liveElapsed({ status: 'done', mode: 'live', startedAt: now - 99_000, ms: 52_300 }, now), 52_300)
  assert.equal(liveElapsed({ status: 'running', mode: 'cache', startedAt: now - 9e6, ms: 40_000 }, now), 40_000)
  assert.equal(liveElapsed({ status: 'running', mode: 'live', startedAt: now + 5_000, ms: 800 }, now), 800)
  assert.equal(liveElapsed({ status: 'running', mode: 'live', startedAt: 0, ms: 800 }, now + 4e6), 800)
})

test('rankLabel', () => {
  assert.equal(rankLabel({ score: 8, level: 'complex', parts: 4, reasons: [] }), 'COMPLEX · 8/10')
  assert.equal(rankLabel({ score: 4, level: 'moderate', parts: 3, reasons: [] }), 'MODERATE · 4/10')
  assert.equal(rankLabel(null), '')
})

test('part rows: state words, spinner, counts', () => {
  assert.deepEqual(
    ['wait', 'search', 'read', 'report', 'done', 'fail'].map(partStateLabel),
    ['waiting', 'searching', 'reading', 'reporting', 'done', 'failed'],
  )
  assert.deepEqual(['wait', 'search', 'read', 'report', 'done', 'fail'].map(partActive), [false, true, true, true, false, false])
  const [camera, battery, price, software] = withDefaults(running()).parts
  assert.equal(partCounts(camera), '3 sources · 4 findings')
  assert.equal(partCounts(battery), '6 found')
  assert.equal(partCounts(price), '1 source · 1 finding')
  assert.equal(partCounts(software), '0 sources · 0 findings')
  assert.equal(partCounts({ state: 'wait', found: 0, read: 0, findings: 0 }), '')
  assert.equal(partCounts({ state: 'search', found: 0, read: 0, findings: 0 }), '')
})

test('reviewLine: the verdict, or what the reviewer is doing', () => {
  const r = withDefaults(running())
  assert.equal(reviewLine(r), 'Reviewer: waiting')
  const reviewing = withDefaults({ ...running(), stages: [{ key: 'review', state: 'run' }] })
  assert.equal(reviewLine(reviewing), 'Reviewer: scoring the findings…')
  const done = withDefaults({ ...running(), review: { findings: 14, kept: 6, duplicates: 3, offTopic: 2, weak: 0 } })
  assert.equal(reviewLine(done), 'Reviewer: 14 findings → 6 kept · 3 duplicates · 2 off-topic')
  const one = withDefaults({ ...running(), review: { findings: 1, kept: 1, duplicates: 1, offTopic: 0, weak: 2 } })
  assert.equal(reviewLine(one), 'Reviewer: 1 finding → 1 kept · 1 duplicate · 2 weak')
  assert.equal(reviewLine(withDefaults({ stages: [{ key: 'review', state: 'skip' }] })), 'Reviewer: skipped')
  assert.match(reviewLine(withDefaults({ stages: [{ key: 'review', state: 'fail' }] })), /^Reviewer: unavailable/)
})

test('activityLine names the running stage, and nothing once finished', () => {
  assert.equal(activityLine(withDefaults({ status: 'running' })), 'Ranking the question…')
  const splitting = withDefaults({ stages: [{ key: 'rank', state: 'done' }, { key: 'split', state: 'run' }] })
  assert.equal(activityLine(splitting), 'Splitting the question…')
  const noted = withDefaults({ stages: [{ key: 'rank', state: 'done' }, { key: 'split', state: 'run', note: 'into 4 parts' }] })
  assert.equal(activityLine(noted), 'into 4 parts')
  assert.equal(activityLine(withDefaults({ status: 'done' })), '')
})

test('statusPill: failure outranks mode outranks progress', () => {
  assert.deepEqual(statusPill({ status: 'running', mode: 'live' }), { text: 'LIVE', tone: 'accent', pulse: true })
  assert.deepEqual(statusPill({ status: 'done', mode: 'live' }), { text: 'DONE', tone: 'green', pulse: false })
  assert.equal(statusPill({ status: 'done', mode: 'cache' }).text, 'SAVED')
  assert.equal(statusPill({ status: 'running', mode: 'cache' }).pulse, true)
  assert.equal(statusPill({ status: 'done', mode: 'offline' }).text, 'OFFLINE')
  assert.equal(statusPill({ status: 'stopped', mode: 'live' }).text, 'STOPPED')
  assert.equal(statusPill({ status: 'failed', mode: 'offline' }).text, 'FAILED')
  assert.equal(statusPill({ status: 'skipped', mode: 'live' }).text, 'SKIPPED')
})

test('isWebUrl and domainOf let only web pages through', () => {
  assert.equal(isWebUrl('https://who.int/news'), true)
  assert.equal(isWebUrl('http://example.com'), true)
  assert.equal(isWebUrl('javascript:alert(1)'), false)
  assert.equal(isWebUrl('file:///C:/secret.txt'), false)
  assert.equal(isWebUrl('https://'), false)
  assert.equal(isWebUrl(''), false)
  assert.equal(domainOf('https://www.WHO.int/news?x=1'), 'who.int')
  assert.equal(domainOf('javascript:alert(1)'), '')
  assert.equal(domainOf('not a url'), '')
})

test('savedAgo and dataFoot: how old a replayed answer is, and how sure', () => {
  const now = Date.parse('2026-10-08T12:00:00Z')
  assert.equal(savedAgo('2026-10-08T07:00:00Z', now), 'saved 5 h ago')
  assert.equal(savedAgo('2026-10-08T11:59:30Z', now), 'saved just now')
  assert.equal(savedAgo('2026-10-08T11:48:00Z', now), 'saved 12 min ago')
  assert.equal(savedAgo('2026-10-03T12:00:00Z', now), 'saved 5 d ago')
  assert.equal(savedAgo('not a date', now), '')
  assert.equal(savedAgo(undefined, now), '')

  assert.equal(dataFoot({ confidence: 'High (82%)', mode: 'live' }, now), 'Confidence High (82%)')
  assert.equal(dataFoot({ confidence: 'High (82%)', mode: 'cache', savedAt: '2026-10-08T07:00:00Z' }, now), 'Confidence High (82%) · saved 5 h ago')
  assert.equal(dataFoot({ mode: 'offline', savedAt: '2026-10-08T07:00:00Z' }, now), 'offline · saved 5 h ago')
  assert.equal(dataFoot({ mode: 'cache' }, now), 'saved earlier')
  assert.equal(dataFoot({}, now), '')
  assert.equal(dataFoot({ confidence: { evil: true } }, now), '')
  assert.ok(dataFoot({ confidence: 'x'.repeat(500) }, now).length < 60)
})

test('changeTone', () => {
  assert.equal(changeTone('+0.4%'), 'up')
  assert.equal(changeTone('▲ 120'), 'up')
  assert.equal(changeTone('−340'), 'down')
  assert.equal(changeTone('-1.2%'), 'down')
  assert.equal(changeTone('flat'), '')
  assert.equal(changeTone(undefined), '')
})
