/**
 * The research agent from the command line — the same engine the HUD and
 * Telegram use (bridge/research.mjs), with each part's progress printed as it
 * happens.
 *
 *   npm run research -- "Compare iPhone 17 and Pixel 10 for camera, battery and price"
 *   npm run research -- "question" --fresh        (ignore a saved answer from the last 12 hours)
 *
 * The ranker decides (triage.mjs): a complex question gets 3 or 4 agents; a
 * moderate one runs here with 3 (the owner asked for it by name); a simple one
 * is not researched at all and costs nothing.
 *
 * Every run is real: it searches the web and uses the owner's Claude plan (up
 * to ten calls). The report is saved to data/research/ like any other, so it
 * can be replayed offline. Ctrl+C stops it. Exits 1 when it fails.
 */

import { env } from '../bridge/identity.mjs'
import { admit, createResearch, pct, when } from '../bridge/research.mjs'

const args = process.argv.slice(2)
const fresh = args.includes('--fresh')
const question = args.filter((a) => !a.startsWith('--')).join(' ').trim()

if (!question) {
  console.error('Usage: npm run research -- "your question" [--fresh]')
  process.exit(2)
}

const research = createResearch({
  model: env('MODEL', 'claude-opus-5-5'),
  workerModel: env('RESEARCH_MODEL', 'claude-sonnet-5-5'),
  effort: env('EFFORT', 'low'),
})

const t0 = Date.now()
const secs = (ms) => `${(ms / 1000).toFixed(1)} s`
const pad = (s, n) => String(s).padEnd(n)
const at = () => pad(secs(Date.now() - t0), 8)

// The owner typed it, so the question is also their own words: the same rule the engine applies.
const MIN_PARTS = 3
const { rank, parts } = admit(question, null, MIN_PARTS)
console.log(`\nRank: ${rank.level} ${rank.score}/10${rank.reasons.length ? ` · ${rank.reasons.join(', ')}` : ''}`)
if (!parts) {
  console.log(`Simple question (depth ${rank.score}/10): no research needed`)
  process.exit(0)
}

const PART_WORD = { search: 'searching', read: 'reading', report: 'reporting', done: 'done', fail: 'failed' }

// Changes as they happen: updates arrive throttled, so print transitions, not frames.
const seen = new Map()
const once = (key, value, line) => {
  if (seen.get(key) === value) return
  seen.set(key, value)
  console.log(line)
}
function onUpdate(state) {
  for (const s of state.stages) {
    if (s.key === 'rank' || s.state === 'wait') continue
    const took = s.state === 'run' ? '' : ` ${pad(secs(s.ms ?? 0), 8)}`
    once(`stage:${s.key}`, `${s.state}|${s.note ?? ''}`, `  ${at()} ${pad(s.label, 8)} ${pad(s.state, 4)}${took}${s.note ? ` ${s.note}` : ''}`)
  }
  for (const p of state.parts) {
    if (p.state === 'wait') continue
    const counts = p.state === 'search' ? '' : ` · ${p.found} found · ${p.read} read · ${p.findings} findings`
    once(`part:${p.i}`, p.state, `  ${at()} Part ${p.i}   ${pad(PART_WORD[p.state] ?? p.state, 10)} ${p.title}${counts}${p.error ? ` · ${p.error}` : ''}`)
  }
  if (state.review) {
    const v = state.review
    once('review', JSON.stringify(v), `  ${at()} Reviewer: ${v.findings} findings → ${v.kept} kept · ${v.duplicates} duplicates · ${v.offTopic} off-topic · ${v.weak} weak`)
  }
}

process.once('SIGINT', () => {
  console.log('\n  stopping…')
  research.interrupt()
})

console.log(`Researching with ${parts} agents: ${question}\n`)
const state = await research.run(question, { fresh, onUpdate, minParts: MIN_PARTS })

if (state.status === 'skipped') {
  console.log(`Simple question (depth ${state.rank.score}/10): no research needed`)
  process.exit(0)
}

console.log('')
if (state.status !== 'done') {
  console.log(`${state.status.toUpperCase()}: ${state.error ?? ''}`)
} else {
  if (state.mode !== 'live') console.log(`(${state.mode === 'cache' ? 'Saved' : 'Offline — saved'} research from ${when(state.cachedAt)})\n`)
  const d = state.data
  if (d) {
    const line = (x) =>
      `${x.label}: ${x.value}${x.unit ? ` ${x.unit}` : ''}${x.change ? `, ${x.change}` : ''}${x.asOf ? ` (as of ${x.asOf})` : ''}` +
      `${x.note ? ` — ${x.note}` : ''}${x.n ? ` [${x.n}]` : ''}`
    console.log(d.title)
    if (d.headline) console.log(`  ${line(d.headline)}`)
    for (const row of d.rows) console.log(`  - ${line(row)}`)
    if (d.note) console.log(`  ${d.note}`)
    console.log('')
  }
  console.log(state.answer.text)
  console.log(`\nConfidence: ${state.answer.label ?? '—'}${state.answer.confidence !== null ? ` (${pct(state.answer.confidence)})` : ''}`)
  if (state.gaps.length) console.log(`\nNot established:\n${state.gaps.map((g) => `  - ${g}`).join('\n')}`)
  const used = state.sources.filter((s) => s.used)
  const list = used.length ? used : state.sources
  if (list.length) {
    console.log(`\nSources${used.length ? ' used' : ''}:`)
    for (const s of list) console.log(`  [${s.n}] ${s.title}\n        ${s.url}\n        ${s.kind} · trust ${s.trust}`)
  }
}
const st = state.stats
console.log(
  `\nClaude calls ${st.calls} · ${secs(state.ms)} · ${state.parts.length} agents · sources read ${st.read} of ${st.found} found` +
    ` · findings ${st.findings} · quotes checked ${st.quotes} · dropped ${st.dropped} · injections removed ${st.injections}` +
    (state.costUsd ? ` · API-equivalent $${state.costUsd.toFixed(2)} (not billed on Pro)` : ''),
)
process.exit(state.status === 'done' ? 0 : 1)
