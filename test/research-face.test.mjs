// Unit tests for src/lib/research.ts — what the research progress card and an
// answer's data and sources cards show. `npm test`
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEEP_STAGES,
  RANKED_DOCKED,
  STAGES,
  activityLine,
  changeTone,
  citeUrl,
  cleanData,
  cleanLinks,
  cleanRanked,
  confidenceLine,
  confidenceTone,
  dataFoot,
  domainOf,
  elapsed,
  isWebUrl,
  laneCounts,
  liveElapsed,
  partActive,
  partCounts,
  partStateLabel,
  pct,
  platformInfo,
  platformOf,
  rankLabel,
  rankedView,
  reviewLine,
  savedAgo,
  scoreOf,
  scoreTone,
  scoreWidth,
  splitCites,
  stageSub,
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

/* ------------------------------------------------------- researcher mode */

/** A researcher-mode state the way bridge/deep.mjs sends it, finished. */
const deepDone = () => ({
  id: 'rs-deep-1',
  variant: 'deep',
  question: 'best way to self-host a git server for a small team',
  status: 'done',
  mode: 'live',
  startedAt: 1_000,
  ms: 64_200,
  rank: { score: 10, level: 'complex', parts: 7, reasons: ['researcher mode'] },
  reasoning: { intent: 'Pick a self-hosted git server', kind: 'comparison', criteria: ['easy upkeep', 'CI built in', ''] },
  stages: [
    { key: 'reason', label: 'Reason', state: 'done', ms: 2100 },
    { key: 'platforms', label: 'Platforms', state: 'done', ms: 41_000, note: '7 platforms' },
    { key: 'rank', label: 'Rank', state: 'done', ms: 9000 },
    { key: 'final', label: 'Final', state: 'done', ms: 12_000 },
  ],
  parts: [
    { i: 1, title: 'Reddit', platform: 'reddit', question: 'gitea vs gitlab · self-host git', state: 'done', found: 14, read: 5, findings: 6 },
    { i: 2, title: 'Quora', platform: 'quora', question: 'self-host git', state: 'fail', found: 0, read: 0, findings: 0, error: 'nothing readable' },
    { i: 3, title: 'GitHub', platform: 'GitHub', question: 'gitea', state: 'done', found: 9, read: 4, findings: 5 },
    { i: 4, title: 'Stack Overflow', platform: 'stackoverflow', state: 'done', found: 6, read: 2, findings: 1 },
    { i: 5, title: 'Hacker News', platform: 'hackernews', state: 'done', found: 7, read: 3, findings: 2 },
    { i: 6, title: 'arXiv', platform: 'arxiv', state: 'done', found: 0, read: 0, findings: 0 },
    { i: 7, title: 'Web', platform: 'web', state: 'done', found: 10, read: 4, findings: 3 },
  ],
  ranked: [
    { n: 1, title: 'Gitea vs GitLab for 5 people', url: 'https://www.reddit.com/r/selfhosted/x', domain: 'reddit.com', platform: 'reddit', score: 91.6, relevance: 9.24, signal: '412 upvotes · Mar 2025', summary: 'Gitea is lighter; GitLab brings CI.' },
    { n: 2, title: 'go-gitea/gitea', url: 'https://github.com/go-gitea/gitea', platform: 'github', score: 88, relevance: 9, signal: '46k stars · Oct 2026', summary: 'Painless self-hosted git.' },
    { n: 3, title: 'dup', url: 'https://github.com/go-gitea/gitea', platform: 'github', score: 50 },
    { n: 4, title: 'Not a page', url: 'javascript:alert(1)', platform: 'myspace', score: 140, relevance: -2 },
    { title: '', url: '' },
  ],
  sources: [
    { n: 1, title: 'Gitea vs GitLab', url: 'https://www.reddit.com/r/selfhosted/x', kind: 'forum', trust: 0.6, used: true, platform: 'reddit', score: 92 },
    { n: 2, title: 'gitea', url: 'https://github.com/go-gitea/gitea', kind: 'company', trust: 0.7, used: true, platform: 'github', score: 88 },
  ],
  answer: { text: 'Gitea for a small team [1][2]; GitLab if you want CI built in [1, 2].', confidence: 0.82, label: 'High' },
  spoken: 'Gitea, unless you need CI built in.',
  review: null,
  stats: { calls: 11, found: 46, read: 18, findings: 17, quotes: 0, dropped: 0, injections: 0 },
  data: null,
  facts: [],
  gaps: ['pricing of GitLab tiers'],
})

test('withDefaults: researcher mode comes through with its own stages, lanes and ranking', () => {
  const r = withDefaults(deepDone())
  assert.equal(r.variant, 'deep')
  assert.deepEqual(r.stages.map((s) => s.key), DEEP_STAGES.map(([k]) => k))
  assert.deepEqual(r.stages.map((s) => s.label), ['Reason', 'Platforms', 'Rank', 'Final'])
  assert.equal(r.stages[1].note, '7 platforms')
  assert.equal(r.rank.parts, 7)
  assert.deepEqual(r.reasoning, { intent: 'Pick a self-hosted git server', kind: 'comparison', criteria: ['easy upkeep', 'CI built in'] })
  // All seven lanes — an ordinary run stops at six parts.
  assert.equal(r.parts.length, 7)
  assert.deepEqual(r.parts.map((p) => p.platform), ['reddit', 'quora', 'github', 'stackoverflow', 'hackernews', 'arxiv', 'web'])
  assert.equal(r.parts[1].error, 'nothing readable')
  // Repeats and empties dropped; an unknown platform is the web; scores clamped.
  assert.equal(r.ranked.length, 3)
  assert.deepEqual(r.ranked[0], {
    n: 1,
    title: 'Gitea vs GitLab for 5 people',
    url: 'https://www.reddit.com/r/selfhosted/x',
    domain: 'reddit.com',
    platform: 'reddit',
    score: 92,
    relevance: 9.2,
    signal: '412 upvotes · Mar 2025',
    summary: 'Gitea is lighter; GitLab brings CI.',
  })
  assert.equal(r.ranked[1].domain, 'github.com')
  assert.equal(r.ranked[2].platform, 'web')
  assert.equal(r.ranked[2].score, 100)
  assert.equal(r.ranked[2].relevance, 0)
  assert.equal(r.ranked[2].signal, '')
  assert.equal(r.sources[0].platform, 'reddit')
  assert.equal(r.sources[0].score, 92)
  assert.equal(r.spoken, 'Gitea, unless you need CI built in.')
})

test('withDefaults: an ordinary run keeps exactly its old shape', () => {
  const r = withDefaults(running())
  for (const k of ['variant', 'reasoning', 'ranked', 'spoken']) assert.equal(k in r, false, k)
  assert.equal('platform' in r.parts[0], false)
  assert.deepEqual(r.stages.map((s) => s.key), ['rank', 'split', 'agents', 'review'])
  // Researcher-mode stage keys mean nothing on an ordinary run.
  const mixed = withDefaults({ stages: [{ key: 'reason', state: 'run' }, { key: 'rank', state: 'done' }] })
  assert.deepEqual(mixed.stages.map((s) => [s.key, s.state]), [['rank', 'done'], ['split', 'wait'], ['agents', 'wait'], ['review', 'wait']])
  // A hostile deep state still renders.
  const odd = withDefaults({ variant: 'deep', reasoning: 'think', ranked: 'lots', parts: Array.from({ length: 20 }, () => ({})) })
  assert.equal(odd.reasoning, null)
  assert.deepEqual(odd.ranked, [])
  assert.equal(odd.parts.length, 8)
  assert.ok(odd.parts.every((p) => p.platform === 'web'))
  assert.ok(odd.stages.every((s) => s.state === 'wait'))
  assert.equal(withDefaults({ variant: 'deep', reasoning: { intent: '', criteria: [] } }).reasoning, null)
})

test('cleanRanked: twelve at most, in the order the ranker sent them', () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ title: `r${i}`, url: `https://x.example/${i}`, score: i }))
  const out = cleanRanked(many)
  assert.equal(out.length, 12)
  assert.deepEqual(out.map((x) => x.title).slice(0, 3), ['r0', 'r1', 'r2'])
  // A missing number is the position.
  assert.equal(out[4].n, 5)
  assert.deepEqual(cleanRanked(null), [])
  assert.ok(cleanRanked([{ title: 't'.repeat(900), summary: 's'.repeat(900), url: 'https://a.example' }])[0].summary.length <= 240)
})

test('platformOf, platformInfo and scores', () => {
  assert.equal(platformOf('Reddit'), 'reddit')
  assert.equal(platformOf(' stackoverflow '), 'stackoverflow')
  assert.equal(platformOf('medium'), 'web')
  assert.equal(platformOf(''), undefined)
  assert.equal(platformOf(7), undefined)
  assert.deepEqual(platformInfo('github'), { key: 'github', label: 'GitHub', short: 'GitHub', colour: '#c9d4df' })
  assert.equal(platformInfo('hackernews').short, 'HN')
  assert.equal(platformInfo(null).label, 'Web')
  // Every platform has its own colour.
  const colours = ['reddit', 'quora', 'github', 'stackoverflow', 'hackernews', 'arxiv', 'web'].map((p) => platformInfo(p).colour)
  assert.equal(new Set(colours).size, 7)

  assert.equal(scoreOf(87.4), 87)
  assert.equal(scoreOf(-5), 0)
  assert.equal(scoreOf(250), 100)
  assert.equal(scoreOf('90'), undefined)
  assert.equal(scoreOf(Number.NaN), undefined)
  assert.equal(scoreWidth(64), 64)
  assert.equal(scoreWidth('x'), 0)
  assert.equal(scoreWidth(1e9), 100)
  assert.deepEqual([90, 70, 69, 40, 39, undefined].map(scoreTone), ['green', 'green', 'amber', 'amber', 'dim', 'dim'])
})

test('rankedView: five docked, all of them full screen', () => {
  const twelve = Array.from({ length: 12 }, (_, i) => i)
  assert.equal(RANKED_DOCKED, 5)
  assert.deepEqual(rankedView(twelve, false), { rows: [0, 1, 2, 3, 4], more: 7 })
  assert.deepEqual(rankedView(twelve, true), { rows: twelve, more: 0 })
  assert.deepEqual(rankedView([1, 2], false), { rows: [1, 2], more: 0 })
  assert.deepEqual(rankedView(undefined, false), { rows: [], more: 0 })
})

test('laneCounts and stageSub', () => {
  const [reddit, quora] = withDefaults(deepDone()).parts
  assert.equal(laneCounts(reddit), '14 found · 5 read · 6 findings')
  assert.equal(laneCounts(quora), '0 found · 0 read · 0 findings')
  assert.equal(laneCounts({ state: 'search', found: 12, read: 0, findings: 0 }), '12 found')
  assert.equal(laneCounts({ state: 'search', found: 0, read: 0, findings: 0 }), '')
  assert.equal(laneCounts({ state: 'wait', found: 3, read: 0, findings: 0 }), '')
  assert.equal(laneCounts({ state: 'report', found: 4, read: 1, findings: 1 }), '4 found · 1 read · 1 finding')

  assert.equal(stageSub({ state: 'done', note: '7 platforms', ms: 41_000 }), '7 platforms')
  assert.equal(stageSub({ state: 'done', ms: 2100 }), '2.1 s')
  assert.equal(stageSub({ state: 'done' }), 'done')
  assert.equal(stageSub({ state: 'fail' }), 'failed')
  assert.equal(stageSub({ state: 'run' }), 'working…')
  assert.equal(stageSub({ state: 'skip' }), 'skipped')
  assert.equal(stageSub({ state: 'wait' }), '')
})

test('activityLine in researcher mode', () => {
  const at = (stages) => activityLine(withDefaults({ variant: 'deep', status: 'running', stages }))
  assert.equal(at([]), 'Reasoning over the question…')
  assert.equal(at([{ key: 'reason', state: 'done' }, { key: 'platforms', state: 'run' }]), 'Searching the platforms…')
  assert.equal(at([{ key: 'reason', state: 'done' }, { key: 'platforms', state: 'done' }, { key: 'rank', state: 'run' }]), 'Ranking the results…')
  assert.equal(at([{ key: 'reason', state: 'done' }, { key: 'platforms', state: 'done' }, { key: 'rank', state: 'done' }, { key: 'final', state: 'run' }]), 'Writing the answer…')
  // The ordinary run's rank stage still ranks the question.
  assert.equal(activityLine(withDefaults({ status: 'running' })), 'Ranking the question…')
})

test('confidenceLine and confidenceTone', () => {
  assert.equal(confidenceLine({ label: 'High', confidence: 0.82 }), 'Confidence High · 82%')
  assert.equal(confidenceLine({ label: null, confidence: 0.4 }), 'Confidence 40%')
  assert.equal(confidenceLine({ label: 'Low', confidence: null }), 'Confidence Low')
  assert.equal(confidenceLine({ label: null, confidence: null }), '')
  assert.deepEqual(['High', 'Medium', 'Low', null].map(confidenceTone), ['green', 'amber', 'red', 'dim'])
})

test('splitCites: citations become numbers, every other bracket stays text', () => {
  assert.deepEqual(splitCites('Gitea for a small team [1][2]; GitLab for CI [1, 2].'), ['Gitea for a small team ', 1, 2, '; GitLab for CI ', 1, 2, '.'])
  assert.deepEqual(splitCites('In [2024] the [docs] said [sic] [0] and [7]'), ['In [2024] the [docs] said [sic] [0] and ', 7])
  assert.deepEqual(splitCites('[3] first'), [3, ' first'])
  assert.deepEqual(splitCites('no citations'), ['no citations'])
  assert.deepEqual(splitCites(''), [])
  assert.deepEqual(splitCites(null), [])
  assert.deepEqual(splitCites({ evil: true }).every((x) => typeof x === 'string'), true)
})

test('citeUrl: a citation links to its source, and only to a web page', () => {
  const r = withDefaults(deepDone())
  assert.equal(citeUrl(r, 1), 'https://www.reddit.com/r/selfhosted/x')
  assert.equal(citeUrl(r, 2), 'https://github.com/go-gitea/gitea')
  // Not among the sources: the ranked list is asked; a javascript: address is no link.
  assert.equal(citeUrl(r, 4), '')
  assert.equal(citeUrl(r, 9), '')
  assert.equal(citeUrl({ sources: [], ranked: [{ n: 5, url: 'https://five.example' }] }, 5), 'https://five.example')
})

test('cleanLinks: researcher mode adds a platform and a score; an ordinary link is unchanged', () => {
  const [a, b, c] = cleanLinks([
    { n: 1, title: 'Gitea vs GitLab', url: 'https://www.reddit.com/r/x', domain: 'reddit.com', platform: 'reddit', score: 91.6 },
    { n: 2, title: 'gitea', url: 'https://github.com/go-gitea/gitea', platform: 'Kickstarter', score: 'high' },
    { n: 3, title: 'plain', url: 'https://plain.example' },
  ], 8)
  assert.deepEqual(a, { n: 1, title: 'Gitea vs GitLab', url: 'https://www.reddit.com/r/x', domain: 'reddit.com', platform: 'reddit', score: 92 })
  assert.equal(b.platform, 'web')
  assert.equal('score' in b, false)
  assert.deepEqual(c, { n: 3, title: 'plain', url: 'https://plain.example', domain: 'plain.example' })
  const eight = cleanLinks(Array.from({ length: 12 }, (_, i) => ({ url: `https://s${i}.example` })), 8)
  assert.equal(eight.length, 8)
})
