// Unit tests for bridge/triage.mjs — how deep each question goes, and the brain's depth line. `npm test`
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { COMPLEX_AT, MODERATE_AT, depthHint, rankQuery } from '../bridge/triage.mjs'
import { jobBrief } from '../bridge/jobs.mjs'
import { composeMessage } from '../bridge/brain.mjs'

/** A rambling way of asking for the weather: long, but still one fact. */
const RAMBLE =
  'hey ayra so I was thinking about going out later this evening with a few friends from college and ' +
  'I am honestly not sure what to wear so could you tell me what the weather is going to be like in ' +
  'Hyderabad tonight and whether it will rain'

/** Three texts in a row on Telegram, joined the way the channel joins a burst. */
const BURST = "hey ayra\nhow's your day going\nlol I'm so bored"

/** The labelled table the weights were tuned on. Every row must pass. */
const TABLE = {
  simple: [
    "what's the price of gold",
    'gold price today',
    'weather in Hyderabad tomorrow',
    'who is the CEO of Google',
    'define photosynthesis',
    'convert 100 dollars to rupees',
    'what time is it in London',
    'India vs Australia score',
    'open notepad',
    'play some music on youtube',
    'what is 12 times 7',
    'hi ayra how are you',
    'gold vs silver price today',
    'weather in Delhi and Mumbai',
    'USD and EUR to INR',
    'iPhone 17 price and launch date',
    RAMBLE,
    jobBrief('open notepad and type hello'),
    BURST,
  ],
  moderate: [
    'why is the sky blue',
    'how does a credit score work',
    'latest news about Tesla',
    'best laptops under 50000',
    'how do I make cold brew coffee',
  ],
  complex: [
    'research the impact of AI on jobs in India',
    'compare iPhone 17 and Pixel 10 for camera, battery and price',
    'should I invest in gold or index funds for the next 5 years',
    'what are the pros and cons of electric cars in India, and how has adoption changed since 2020?',
    'give me an in-depth analysis of the semiconductor supply chain',
    'is it true that intermittent fasting is better than calorie counting for weight loss?',
    'fact-check: drinking coffee causes dehydration',
    'yes, research that',
    'research it',
    'do a deep dive on this',
  ],
}

for (const [level, rows] of Object.entries(TABLE)) {
  test(`the labelled table: ${level}`, () => {
    for (const row of rows) {
      const rank = rankQuery(row)
      assert.equal(rank.level, level, `"${row.slice(0, 60)}" ranked ${rank.level} ${rank.score} (${rank.reasons.join(', ')})`)
    }
  })
}

/**
 * HELD OUT: written before the weights were tuned and never used to tune them,
 * so it says how the rules do on questions they were not fitted to. At least 7
 * must pass.
 *
 * First run, 2026-10-07: 11 of 11 as labelled, no misses. (Should one appear
 * later, record it here rather than tuning it away.)
 */
const HELD_OUT = [
  ['bitcoin price right now', 'simple'],
  ['who won the IPL final yesterday', 'simple'],
  ['set a timer for 10 minutes', 'simple'],
  ['what are the side effects of paracetamol', 'moderate'],
  ['compare the economic policies of India and China over the last decade and their impact on growth', 'complex'],
  ['how do vaccines work', 'moderate'],
  ['should I learn Rust or Go for backend jobs', 'complex'],
  ["analyse Tesla's last four quarterly results", 'complex'],
  ["what's the population of Japan", 'simple'],
  ['tell me a joke', 'simple'],
  ['is coffee good or bad for your heart? what does the evidence say', 'complex'],
]

test('held out: at least 7 rows rank as labelled', () => {
  const misses = HELD_OUT.filter(([q, level]) => rankQuery(q).level !== level)
  assert.ok(HELD_OUT.length >= 8)
  assert.ok(
    HELD_OUT.length - misses.length >= 7,
    `misses: ${misses.map(([q, l]) => `"${q}" (${l}, got ${rankQuery(q).level} ${rankQuery(q).score})`).join('; ')}`,
  )
})

test('a sports "X vs Y" score, match or live is one fact, not a comparison', () => {
  for (const q of ['India vs Australia score', 'India vs Pakistan match', 'RCB vs CSK live']) {
    const rank = rankQuery(q)
    assert.equal(rank.level, 'simple', q)
    assert.ok(!rank.reasons.includes('comparison'), q)
  }
})

test('length alone never reaches complex', () => {
  const padded = Array.from({ length: 200 }, () => 'and then the weather and the time and the score').join(' ')
  assert.ok(rankQuery(padded).score < COMPLEX_AT)
  const words = Array.from({ length: 300 }, (_, i) => `word${i}`).join(' ')
  const rank = rankQuery(words)
  assert.equal(rank.score, 1)
  assert.deepEqual(rank.reasons, ['long question'])
})

test('rank shape: an integer 0..10, a level, parts and plain reasons', () => {
  for (const q of [...TABLE.simple, ...TABLE.moderate, ...TABLE.complex, '', null, undefined, 42]) {
    const r = rankQuery(q)
    assert.ok(Number.isInteger(r.score) && r.score >= 0 && r.score <= 10)
    assert.equal(r.level, r.score >= COMPLEX_AT ? 'complex' : r.score >= MODERATE_AT ? 'moderate' : 'simple')
    assert.ok(Array.isArray(r.reasons) && r.reasons.every((x) => typeof x === 'string' && x.length < 30))
  }
  assert.deepEqual(rankQuery(''), { score: 0, level: 'simple', parts: 0, reasons: [] })
})

test('parts: 4 for complex at 8 and up, 3 for other complex, 0 otherwise', () => {
  const four = rankQuery('research the impact of AI on jobs in India')
  assert.ok(four.score >= 8)
  assert.equal(four.parts, 4)
  const three = rankQuery('research it')
  assert.equal(three.score, 6)
  assert.equal(three.parts, 3)
  assert.equal(rankQuery('why is the sky blue').parts, 0)
  assert.equal(rankQuery('gold price today').parts, 0)
  for (const q of TABLE.complex) {
    const r = rankQuery(q)
    assert.equal(r.parts, r.score >= 8 ? 4 : 3, q)
  }
})

test('reasons say why, in plain words', () => {
  assert.deepEqual(rankQuery('compare iPhone 17 and Pixel 10 for camera, battery and price').reasons, ['comparison', 'several parts'])
  assert.ok(rankQuery("what's the price of gold").reasons.includes('single fact'))
  assert.ok(rankQuery('open notepad').reasons.includes('laptop command'))
  assert.ok(rankQuery('research it').reasons.includes('asks for research'))
  const fasting = rankQuery('should I invest in gold or index funds for the next 5 years')
  for (const r of ['decision', 'comparison', 'trend over time', 'high stakes']) assert.ok(fasting.reasons.includes(r), r)
})

test('a lookup joined by and/vs stays simple unless a decision or analysis word appears', () => {
  assert.equal(rankQuery('gold vs silver price today').level, 'simple')
  assert.equal(rankQuery('should I buy gold or silver at today\'s price').level, 'complex')
  assert.notEqual(rankQuery('compare gold and silver prices over the last 5 years').level, 'simple')
})

test('depthHint: one line for complex questions, nothing for the rest', () => {
  const rank = rankQuery('compare iPhone 17 and Pixel 10 for camera, battery and price')
  assert.equal(depthHint(rank), `[Depth ${rank.score}/10 · complex: comparison, several parts · use the research tool]`)
  assert.equal(depthHint(rankQuery('why is the sky blue')), '')
  assert.equal(depthHint(rankQuery('gold price today')), '')
  assert.equal(depthHint(null), '')
  assert.equal(depthHint(undefined), '')
})

test('the brain adds the depth line only before a complex question, ahead of the time stamp', () => {
  const now = new Date('2026-10-02T08:35:00Z')
  const complex = rankQuery('research the impact of AI on jobs in India')
  const out = composeMessage('research the impact of AI on jobs in India', complex, now)
  assert.match(out, /^\[Depth 9\/10 · complex: asks for research, impact · use the research tool\]\n\[Now: .+\]\nresearch the impact of AI on jobs in India$/)
  // Moderate, simple or unranked: exactly what was sent before ranking existed.
  for (const rank of [rankQuery('why is the sky blue'), rankQuery('gold price today'), null, undefined]) {
    assert.match(composeMessage('a question', rank, now), /^\[Now: [^\]]+\]\na question$/)
  }
})
