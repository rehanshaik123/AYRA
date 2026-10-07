// Unit tests for src/lib/research.ts — what the research board shows. `npm test`
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  STAGES,
  activity,
  answerBlocks,
  confidenceTone,
  costLine,
  elapsed,
  isWebUrl,
  kindLabel,
  liveElapsed,
  metrics,
  pct,
  rowKeys,
  savedWhen,
  splitCitations,
  statusLabel,
  statusPill,
  statusTone,
  trustTone,
  withDefaults,
} from '../src/lib/research.ts'

test('splitCitations: single, grouped and back-to-back citations', () => {
  assert.deepEqual(splitCitations('Water boils at 100 °C [3].'), [
    { text: 'Water boils at 100 °C' },
    { cite: 3 },
    { text: '.' },
  ])
  assert.deepEqual(splitCitations('Both agree [2, 5] on it'), [
    { text: 'Both agree' },
    { cite: 2 },
    { cite: 5 },
    { text: ' on it' },
  ])
  assert.deepEqual(splitCitations('Rates fell [2][4].'), [
    { text: 'Rates fell' },
    { cite: 2 },
    { cite: 4 },
    { text: '.' },
  ])
})

test('splitCitations: ranges, repeats, and brackets that are not citations', () => {
  assert.deepEqual(splitCitations('x [2-4]'), [{ text: 'x' }, { cite: 2 }, { cite: 3 }, { cite: 4 }])
  assert.deepEqual(splitCitations('x [1–2]'), [{ text: 'x' }, { cite: 1 }, { cite: 2 }])
  assert.deepEqual(splitCitations('x [3, 3]'), [{ text: 'x' }, { cite: 3 }])
  // A wide "range" is two citations, not a wall of chips.
  assert.deepEqual(splitCitations('x [1-40]'), [{ text: 'x' }, { cite: 1 }, { cite: 40 }])
  assert.deepEqual(splitCitations('In [2024] it rose'), [{ text: 'In [2024] it rose' }])
  assert.deepEqual(splitCitations('[sic] and [a]'), [{ text: '[sic] and [a]' }])
  assert.deepEqual(splitCitations('zero [0] is not a source'), [{ text: 'zero [0] is not a source' }])
  assert.deepEqual(splitCitations('[1] first'), [{ cite: 1 }, { text: ' first' }])
  assert.deepEqual(splitCitations(''), [])
  assert.deepEqual(splitCitations('no citations'), [{ text: 'no citations' }])
})

test('answerBlocks: paragraphs, bullets, and no stray Markdown', () => {
  assert.deepEqual(answerBlocks('Yes, mostly [1].\n\n- First point [2]\n- **Second** point\n## Heading\nEnd'), [
    { kind: 'p', text: 'Yes, mostly [1].' },
    { kind: 'li', text: 'First point [2]' },
    { kind: 'li', text: 'Second point' },
    { kind: 'p', text: 'Heading' },
    { kind: 'p', text: 'End' },
  ])
  assert.deepEqual(answerBlocks(''), [])
  // Mid-stream, a lone dash is not yet a bullet.
  assert.deepEqual(answerBlocks('Para\n-'), [{ kind: 'p', text: 'Para' }, { kind: 'p', text: '-' }])
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

test('tones and labels', () => {
  assert.equal(confidenceTone('High'), 'green')
  assert.equal(confidenceTone('Medium'), 'amber')
  assert.equal(confidenceTone('Low'), 'red')
  assert.equal(confidenceTone(null), 'dim')
  assert.equal(trustTone(0.9), 'green')
  assert.equal(trustTone(0.6), 'amber')
  assert.equal(trustTone(0.25), 'red')
  assert.equal(statusTone('corroborated'), 'green')
  assert.equal(statusTone('single'), 'amber')
  assert.equal(statusTone('disputed'), 'red')
  assert.equal(statusLabel({ status: 'corroborated', support: [1, 3, 5] }), 'Corroborated · 3 sources')
  assert.equal(statusLabel({ status: 'corroborated', support: [2, 2] }), 'Corroborated')
  assert.equal(statusLabel({ status: 'single', support: [4] }), 'Single source')
  assert.equal(statusLabel({ status: 'disputed', support: [1, 2] }), 'Disputed')
  assert.equal(kindLabel('gov'), 'Government')
  assert.equal(kindLabel('org'), 'Organisation')
  assert.equal(kindLabel('nonsense'), 'Web')
})

test('statusPill: failure outranks mode outranks progress', () => {
  assert.deepEqual(statusPill({ status: 'running', mode: 'live' }), { text: 'LIVE', tone: 'accent', pulse: true })
  assert.deepEqual(statusPill({ status: 'done', mode: 'live' }), { text: 'DONE', tone: 'green', pulse: false })
  assert.equal(statusPill({ status: 'done', mode: 'cache' }).text, 'SAVED')
  assert.equal(statusPill({ status: 'running', mode: 'cache' }).pulse, true)
  assert.equal(statusPill({ status: 'done', mode: 'offline' }).text, 'OFFLINE')
  assert.equal(statusPill({ status: 'stopped', mode: 'live' }).text, 'STOPPED')
  assert.equal(statusPill({ status: 'failed', mode: 'offline' }).text, 'FAILED')
})

test('activity names the running stage, and nothing once finished', () => {
  const stages = withDefaults({}).stages
  assert.equal(activity({ status: 'running', stages }), 'Planning the research…')
  const reading = stages.map((s) =>
    s.key === 'plan' || s.key === 'search' ? { ...s, state: 'done' } : s.key === 'read' ? { ...s, state: 'run' } : s,
  )
  assert.equal(activity({ status: 'running', stages: reading }), 'Reading the sources…')
  assert.equal(activity({ status: 'done', stages: reading }), '')
})

test('rowKeys: one stable key per row, even for a repeated link', () => {
  assert.deepEqual(
    rowKeys([{ url: 'https://a.org', title: 'A' }, { url: 'https://b.org', title: 'B' }, { url: 'https://a.org', title: 'A2' }, { url: '', title: '' }]),
    ['https://a.org', 'https://b.org', 'https://a.org#1', 'row-3'],
  )
})

test('isWebUrl lets only web pages through', () => {
  assert.equal(isWebUrl('https://who.int/news'), true)
  assert.equal(isWebUrl('http://example.com'), true)
  assert.equal(isWebUrl('javascript:alert(1)'), false)
  assert.equal(isWebUrl('file:///C:/secret.txt'), false)
  assert.equal(isWebUrl('https://'), false)
  assert.equal(isWebUrl(''), false)
})

test('metrics and costLine', () => {
  const r = withDefaults({
    stats: { found: 24, read: 6, quotes: 17, verified: 14, dropped: 3, injections: 1, calls: 8 },
    sources: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ n, url: `https://s${n}.org`, state: 'read' })),
  })
  assert.deepEqual(
    metrics(r).map((m) => [m.label, m.value]),
    [
      ['quotes checked', '17'],
      ['verified', '14'],
      ['dropped', '3'],
      ['injections removed', '1'],
      ['sources read', '6/7'],
      ['Claude calls', '8'],
    ],
  )
  assert.equal(metrics(r)[2].hint, 'not in the source')
  assert.equal(metrics(r)[3].tone, 'red')
  assert.equal(costLine(0.2149), 'API-equivalent $0.21 — not billed on Pro')
  assert.equal(costLine(undefined), '')
  assert.equal(costLine(0), '')
})

test('savedWhen gives a date, or nothing for a bad one', () => {
  assert.notEqual(savedWhen('2026-10-07T09:12:00Z'), '')
  assert.match(savedWhen('2026-10-07T09:12:00Z'), /Oct/)
  assert.equal(savedWhen('not a date'), '')
  assert.equal(savedWhen(undefined), '')
})

test('withDefaults: an empty or hostile object still renders', () => {
  const r = withDefaults(null)
  assert.equal(r.status, 'running')
  assert.equal(r.mode, 'live')
  assert.deepEqual(r.stages.map((s) => s.key), STAGES.map(([k]) => k))
  assert.ok(r.stages.every((s) => s.state === 'wait'))
  assert.deepEqual(r.sources, [])
  assert.deepEqual(r.facts, [])
  assert.deepEqual(r.answer, { text: '', confidence: null, label: null })
  assert.equal(r.stats.calls, 0)

  const odd = withDefaults({
    question: { toString: () => 'what?' },
    status: 'exploded',
    stages: [{ key: 'verify', state: 'run', label: 'Cross-check' }, { key: 'plan', state: 'done', ms: 900 }, { key: 'bogus' }],
    sources: [{ n: 2, title: { bad: true }, kind: 'alien', trust: 7, why: 'not a list', state: '??', subq: [0, -1, 'x', 2] }],
    facts: [{ text: 'f', status: 'maybe', support: [1, 'two', 0, 3], contradict: null, confidence: -1 }],
    answer: { text: 'ok', confidence: 'high', label: 'Very' },
  })
  assert.equal(odd.question, 'what?')
  assert.equal(odd.status, 'running')
  assert.equal(odd.stages[0].state, 'done')
  assert.equal(odd.stages[0].ms, 900)
  assert.equal(odd.stages[0].label, 'Plan')
  assert.equal(odd.stages[4].state, 'run')
  assert.equal(odd.stages.length, 6)
  const s = odd.sources[0]
  assert.equal(typeof s.title, 'string')
  assert.equal(s.kind, 'web')
  assert.equal(s.trust, 1)
  assert.deepEqual(s.why, [])
  assert.equal(s.state, 'found')
  assert.deepEqual(s.subq, [0, 2])
  const f = odd.facts[0]
  assert.equal(f.id, 'f1')
  assert.equal(f.status, 'single')
  assert.deepEqual(f.support, [1, 3])
  assert.deepEqual(f.contradict, [])
  assert.equal(f.confidence, 0)
  assert.deepEqual(odd.answer, { text: 'ok', confidence: null, label: null })
})
