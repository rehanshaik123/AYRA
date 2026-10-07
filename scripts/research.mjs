/**
 * The research agent from the command line — the same engine the HUD and
 * Telegram use (bridge/research.mjs), with each stage printed as it happens.
 *
 *   npm run research -- "Is intermittent fasting better than calorie restriction?"
 *   npm run research -- "question" --depth quick|standard|deep
 *   npm run research -- "question" --fresh        (ignore a saved answer from the last 12 hours)
 *
 * Every run is real: it searches the web and uses the owner's Claude plan (up
 * to ten calls). The report is saved to data/research/ like any other, so the
 * board can replay it offline. Ctrl+C stops it. Exits 1 when it fails.
 */

import { env } from '../bridge/identity.mjs'
import { createResearch, DEPTHS, pct, when } from '../bridge/research.mjs'

const args = process.argv.slice(2)
const flag = (name) => args.includes(`--${name}`)
const value = (name) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
const depth = value('depth') ?? 'quick'
const question = args
  .filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--depth')
  .join(' ')
  .trim()

if (!question || !DEPTHS[depth]) {
  console.error('Usage: npm run research -- "your question" [--depth quick|standard|deep] [--fresh]')
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

// Stages as they change: the board's updates arrive throttled, so print transitions, not frames.
const seen = new Map()
function onUpdate(state) {
  for (const s of state.stages) {
    const key = `${s.state}|${s.note ?? ''}`
    if (seen.get(s.key) === key || s.state === 'wait') continue
    seen.set(s.key, key)
    const took = s.state === 'run' ? '' : ` ${pad(secs(s.ms ?? 0), 8)}`
    console.log(`  ${pad(secs(Date.now() - t0), 8)} ${pad(s.label, 12)} ${pad(s.state, 4)}${took}${s.note ? ` ${s.note}` : ''}`)
  }
}

process.once('SIGINT', () => {
  console.log('\n  stopping…')
  research.interrupt()
})

console.log(`\nResearching (${depth}): ${question}\n`)
const state = await research.run(question, { depth, fresh: flag('fresh'), onUpdate })

console.log('')
if (state.status !== 'done') {
  console.log(`${state.status.toUpperCase()}: ${state.error ?? ''}`)
} else {
  if (state.mode !== 'live') console.log(`(${state.mode === 'cache' ? 'Saved' : 'Offline — saved'} research from ${when(state.cachedAt)})\n`)
  console.log(state.answer.text)
  console.log(`\nConfidence: ${state.answer.label ?? '—'}${state.answer.confidence !== null ? ` (${pct(state.answer.confidence)})` : ''}`)
  if (state.facts.length) {
    console.log('\nEvidence:')
    for (const f of state.facts) {
      console.log(`  ${f.id} ${pad(f.status, 12)} ${pct(f.confidence).padStart(4)}  ${f.text} [${f.support.join(', ')}]${f.contradict.length ? ` vs [${f.contradict.join(', ')}]` : ''}`)
    }
  }
  if (state.gaps.length) console.log(`\nNot established:\n${state.gaps.map((g) => `  - ${g}`).join('\n')}`)
}
if (state.sources.length) {
  console.log('\nSources:')
  for (const s of state.sources) {
    const mark = s.state === 'read' ? '✓' : s.state === 'failed' ? '✗' : '·'
    const extra = [s.kind, `trust ${s.trust}`, s.published, s.injection ? 'INJECTION REMOVED' : '', s.state === 'read' ? `${s.claims} claims` : s.error]
      .filter(Boolean)
      .join(' · ')
    console.log(`  ${mark} [${s.n || '·'}] ${s.title}\n        ${s.url}\n        ${extra}`)
  }
}
const st = state.stats
console.log(
  `\nquotes checked ${st.quotes} · verified ${st.verified} · dropped ${st.dropped} · injections removed ${st.injections}` +
    ` · sources read ${st.read}/${state.sources.length} · Claude calls ${st.calls} · ${secs(state.ms)}` +
    (state.costUsd ? ` · API-equivalent $${state.costUsd.toFixed(2)} (not billed on Pro)` : ''),
)
process.exit(state.status === 'done' ? 0 : 1)
