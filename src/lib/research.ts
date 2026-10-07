/**
 * The research board's data — the state object the bridge's research engine
 * (bridge/research.mjs) sends inside a `kind: 'research'` blade — and the small
 * pure helpers the board (src/ui/Research.tsx) renders it with.
 *
 * The types mirror the engine's object field for field. They are a protocol
 * between the bridge and the face, so change both sides together or not at all.
 *
 * Everything in here is pure on purpose: the board is the centrepiece of a live
 * demo, and every decision about what it shows can be tested without a browser
 * (test/research-face.test.mjs).
 */

export type ResearchStageKey = 'plan' | 'search' | 'read' | 'extract' | 'verify' | 'answer'

export type ResearchStage = {
  key: ResearchStageKey
  /** 'Plan' | 'Search' | 'Read' | 'Extract' | 'Cross-check' | 'Answer' */
  label: string
  state: 'wait' | 'run' | 'done' | 'fail' | 'skip'
  /** Duration once done or failed. */
  ms?: number
  /** '3 sub-questions', '24 found · 7 picked', '6 of 7 read', … */
  note?: string
}

export type ResearchSourceKind =
  'gov' | 'academic' | 'reference' | 'news' | 'org' | 'company' | 'blog' | 'forum' | 'social' | 'web'

export type ResearchSource = {
  /** 1..N once selected; 0 while only "found" during the search stage. */
  n: number
  title: string
  url: string
  /** 'who.int', 'bbc.co.uk' — the hostname without www. */
  domain: string
  kind: ResearchSourceKind
  /** 0..1 */
  trust: number
  /** Short reasons: ['government site', 'dated 2026-03-02', 'injection text removed']. */
  why: string[]
  state: 'found' | 'reading' | 'read' | 'failed' | 'skipped'
  /** ISO date (YYYY-MM-DD) when known. */
  published?: string
  /** Injection text was found in the page and removed. */
  injection?: boolean
  /** Verified claims taken from it. */
  claims: number
  /** Indexes (0-based) of the sub-questions it came from. */
  subq: number[]
  /** Short, for failed: 'blocked (403)', 'no readable text', 'timed out'. */
  error?: string
}

export type ResearchFact = {
  /** 'f1', 'f2', … */
  id: string
  text: string
  status: 'corroborated' | 'single' | 'disputed'
  /** 0..1 */
  confidence: number
  /** Source n's that support it. */
  support: number[]
  /** Source n's that contradict it. */
  contradict: number[]
  note?: string
}

export type Research = {
  /** 'rs-<base36 time>-<seq>' — also the blade's id. */
  id: string
  question: string
  status: 'running' | 'done' | 'failed' | 'stopped'
  mode: 'live' | 'cache' | 'offline'
  /** Epoch ms, for the live timer. */
  startedAt: number
  /** Elapsed so far, or the total once finished. */
  ms: number
  /** ISO, for cache and offline. */
  cachedAt?: string
  depth: 'quick' | 'standard' | 'deep'
  /** Always all six, in order. */
  stages: ResearchStage[]
  plan: { intent: string; subquestions: string[] } | null
  /** During search: found candidates (n 0). From ranking on: the selected ones, numbered. */
  sources: ResearchSource[]
  stats: {
    /** Unique links found. */
    found: number
    /** Pages read successfully. */
    read: number
    /** Quotes checked. */
    quotes: number
    /** Quotes found in the page. */
    verified: number
    /** Claims dropped: the quote was not in the page. */
    dropped: number
    /** Sources with injection text removed. */
    injections: number
    /** Claude calls made. */
    calls: number
  }
  facts: ResearchFact[]
  /** What could not be established. */
  gaps: string[]
  answer: { text: string; confidence: number | null; label: 'High' | 'Medium' | 'Low' | null }
  error?: string
  /** The SDK's API-equivalent figure (Pro login: not billed). */
  costUsd?: number
}

export type Tone = 'green' | 'amber' | 'red' | 'dim'

/* ----------------------------------------------------------------- defaults */

/** The six stages, in order, with the labels the board falls back to. */
export const STAGES: ReadonlyArray<readonly [ResearchStageKey, string]> = [
  ['plan', 'Plan'],
  ['search', 'Search'],
  ['read', 'Read'],
  ['extract', 'Extract'],
  ['verify', 'Cross-check'],
  ['answer', 'Answer'],
]

const KINDS: ReadonlySet<string> = new Set([
  'gov', 'academic', 'reference', 'news', 'org', 'company', 'blog', 'forum', 'social', 'web',
])
const STAGE_STATES: ReadonlySet<string> = new Set(['wait', 'run', 'done', 'fail', 'skip'])
const SOURCE_STATES: ReadonlySet<string> = new Set(['found', 'reading', 'read', 'failed', 'skipped'])
const FACT_STATES: ReadonlySet<string> = new Set(['corroborated', 'single', 'disputed'])

type Loose = Record<string, unknown>
const rec = (x: unknown): Loose => (x && typeof x === 'object' ? (x as Loose) : {})
const num = (x: unknown, or = 0): number => (typeof x === 'number' && Number.isFinite(x) ? x : or)
const str = (x: unknown): string => (typeof x === 'string' ? x : x == null ? '' : String(x))
const opt = (x: unknown): string | undefined => (typeof x === 'string' && x ? x : undefined)
const list = (x: unknown): unknown[] => (Array.isArray(x) ? x : [])
const pick = <T extends string>(x: unknown, allowed: ReadonlySet<string>, or: T): T =>
  typeof x === 'string' && allowed.has(x) ? (x as T) : or

/**
 * A board state that is safe to render, whatever arrived.
 *
 * The object comes over a socket from another process. A React render that
 * throws takes the whole interface down with it, and an object where a string
 * was expected does exactly that — so every field is coerced to its type here,
 * once, and the board never has to wonder.
 */
export function withDefaults(raw: unknown): Research {
  const r = rec(raw)
  const stats = rec(r.stats)
  const answer = rec(r.answer)
  const plan = r.plan ? rec(r.plan) : null
  const stages = list(r.stages).map(rec)
  const label = answer.label === 'High' || answer.label === 'Medium' || answer.label === 'Low' ? answer.label : null
  const confidence = typeof answer.confidence === 'number' && Number.isFinite(answer.confidence)
    ? answer.confidence
    : null

  return {
    id: str(r.id),
    question: str(r.question),
    status: pick(r.status, new Set(['running', 'done', 'failed', 'stopped']), 'running'),
    mode: pick(r.mode, new Set(['live', 'cache', 'offline']), 'live'),
    startedAt: num(r.startedAt),
    ms: Math.max(0, num(r.ms)),
    cachedAt: opt(r.cachedAt),
    depth: pick(r.depth, new Set(['quick', 'standard', 'deep']), 'standard'),
    // Always the six, in pipeline order, whatever order or subset arrived.
    stages: STAGES.map(([key, fallback]) => {
      const s = stages.find((x) => x.key === key) ?? {}
      return {
        key,
        label: str(s.label) || fallback,
        state: pick(s.state, STAGE_STATES, 'wait'),
        ms: typeof s.ms === 'number' && Number.isFinite(s.ms) ? s.ms : undefined,
        note: opt(s.note),
      }
    }),
    plan: plan
      ? { intent: str(plan.intent), subquestions: list(plan.subquestions).map(str).filter(Boolean) }
      : null,
    sources: list(r.sources).map((x) => {
      const s = rec(x)
      return {
        n: Math.max(0, Math.round(num(s.n))),
        title: str(s.title),
        url: str(s.url),
        domain: str(s.domain),
        kind: pick(s.kind, KINDS, 'web'),
        trust: clamp01(num(s.trust)),
        why: list(s.why).map(str).filter(Boolean),
        state: pick(s.state, SOURCE_STATES, 'found'),
        published: opt(s.published),
        injection: s.injection === true,
        claims: Math.max(0, num(s.claims)),
        subq: list(s.subq).filter((i): i is number => typeof i === 'number' && Number.isInteger(i) && i >= 0),
        error: opt(s.error),
      }
    }),
    stats: {
      found: num(stats.found),
      read: num(stats.read),
      quotes: num(stats.quotes),
      verified: num(stats.verified),
      dropped: num(stats.dropped),
      injections: num(stats.injections),
      calls: num(stats.calls),
    },
    facts: list(r.facts).map((x, i) => {
      const f = rec(x)
      const ns = (v: unknown) => list(v).filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0)
      return {
        id: str(f.id) || `f${i + 1}`,
        text: str(f.text),
        status: pick(f.status, FACT_STATES, 'single'),
        confidence: clamp01(num(f.confidence)),
        support: ns(f.support),
        contradict: ns(f.contradict),
        note: opt(f.note),
      }
    }),
    gaps: list(r.gaps).map(str).filter(Boolean),
    answer: { text: str(answer.text), confidence, label },
    error: opt(r.error),
    costUsd: typeof r.costUsd === 'number' && Number.isFinite(r.costUsd) ? r.costUsd : undefined,
  }
}

/* ---------------------------------------------------------------- citations */

export type CitePart = { text: string } | { cite: number }

/**
 * A citation group and the whitespace before it: `[3]`, `[2, 5]`, `[2-4]`.
 * One to three digits only, so a year in brackets ("[2024]") stays prose.
 */
const CITE = /\s*\[(\d{1,3}(?:\s*[,–-]\s*\d{1,3})*)\]/g

/** The source numbers in one bracket group, in order, without repeats. */
function citeNumbers(group: string): number[] {
  const out: number[] = []
  const add = (n: number) => {
    if (Number.isInteger(n) && n > 0 && !out.includes(n)) out.push(n)
  }
  for (const part of group.split(',')) {
    const [a, b] = part.split(/[–-]/).map((s) => Number(s.trim()))
    if (b === undefined) add(a)
    // A short range is a range; anything wider is two citations, not a list
    // of forty chips.
    else if (b >= a && b - a <= 9) for (let n = a; n <= b; n++) add(n)
    else {
      add(a)
      add(b)
    }
  }
  return out
}

/**
 * Answer text cut into prose and citations, for chips the owner can point at.
 *
 * The space before a citation goes with it: the chip sits against the word it
 * supports, the way a superscript does, rather than floating a gap away.
 */
export function splitCitations(text: string): CitePart[] {
  const out: CitePart[] = []
  const push = (t: string) => {
    if (!t) return
    const last = out[out.length - 1]
    if (last && 'text' in last) last.text += t
    else out.push({ text: t })
  }
  const src = String(text ?? '')
  let at = 0
  for (const m of src.matchAll(CITE)) {
    const ns = citeNumbers(m[1])
    if (!ns.length) continue
    push(src.slice(at, m.index))
    for (const n of ns) out.push({ cite: n })
    at = (m.index ?? 0) + m[0].length
  }
  push(src.slice(at))
  return out
}

export type AnswerBlock = { kind: 'p' | 'li'; text: string }

/**
 * The answer as paragraphs and bullets. The synthesiser is asked for plain
 * text with "- " bullets; stray Markdown emphasis and heading marks are
 * dropped rather than shown as asterisks.
 */
export function answerBlocks(text: string): AnswerBlock[] {
  const out: AnswerBlock[] = []
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.replace(/\*\*|__/g, '').replace(/^\s*#{1,6}\s+/, '').trim()
    if (!line) continue
    const bullet = /^[-•*]\s+(.+)$/.exec(line)
    out.push(bullet ? { kind: 'li', text: bullet[1] } : { kind: 'p', text: line })
  }
  return out
}

/* ------------------------------------------------------------------ figures */

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x))
}

/** 0.82 → '82%'; anything that is not a number → '—'. */
export function pct(x: number | null | undefined): string {
  if (typeof x !== 'number' || !Number.isFinite(x)) return '—'
  return `${Math.round(clamp01(x) * 100)}%`
}

/** 52300 → '52.3 s'; past a minute, '1 m 04 s'. */
export function elapsed(ms: number): string {
  const tenths = Math.max(0, Math.round((Number.isFinite(ms) ? ms : 0) / 100))
  if (tenths < 600) return `${(tenths / 10).toFixed(1)} s`
  const s = Math.floor(tenths / 10)
  return `${Math.floor(s / 60)} m ${String(s % 60).padStart(2, '0')} s`
}

/**
 * What the timer shows. It ticks from `startedAt` only while a live run is
 * going; a finished, cached or offline report shows its recorded time. A start
 * time from a clock that disagrees with this one (negative, or hours ago) is
 * not believed — the recorded figure is shown instead of nonsense.
 */
export function liveElapsed(
  r: Pick<Research, 'status' | 'mode' | 'startedAt' | 'ms'>,
  now: number,
): number {
  const recorded = Math.max(0, Number.isFinite(r.ms) ? r.ms : 0)
  if (r.status !== 'running' || r.mode !== 'live') return recorded
  const since = now - r.startedAt
  if (!Number.isFinite(since) || since < 0 || since > 3_600_000) return recorded
  return Math.max(recorded, since)
}

/* -------------------------------------------------------------------- words */

export function confidenceTone(label: Research['answer']['label']): Tone {
  if (label === 'High') return 'green'
  if (label === 'Medium') return 'amber'
  if (label === 'Low') return 'red'
  return 'dim'
}

/** Same thresholds as the engine's labels, applied to a source's trust. */
export function trustTone(trust: number): Exclude<Tone, 'dim'> {
  if (trust >= 0.75) return 'green'
  if (trust >= 0.5) return 'amber'
  return 'red'
}

export function statusTone(status: ResearchFact['status']): Exclude<Tone, 'dim'> {
  if (status === 'corroborated') return 'green'
  if (status === 'disputed') return 'red'
  return 'amber'
}

/** 'Corroborated · 3 sources' / 'Single source' / 'Disputed'. */
export function statusLabel(fact: Pick<ResearchFact, 'status' | 'support'>): string {
  if (fact.status === 'disputed') return 'Disputed'
  if (fact.status === 'single') return 'Single source'
  const k = new Set(fact.support).size
  return k > 1 ? `Corroborated · ${k} sources` : 'Corroborated'
}

const KIND_LABELS: Record<ResearchSourceKind, string> = {
  gov: 'Government',
  academic: 'Academic',
  reference: 'Reference',
  news: 'News',
  org: 'Organisation',
  company: 'Company',
  blog: 'Blog',
  forum: 'Forum',
  social: 'Social',
  web: 'Web',
}

export function kindLabel(kind: ResearchSourceKind): string {
  return KIND_LABELS[kind] ?? 'Web'
}

/**
 * The pill beside the title. What went wrong outranks where the answer came
 * from, which outranks whether it is still going.
 */
export function statusPill(
  r: Pick<Research, 'status' | 'mode'>,
): { text: string; tone: Tone | 'accent'; pulse: boolean } {
  const pulse = r.status === 'running'
  if (r.status === 'failed') return { text: 'FAILED', tone: 'red', pulse }
  if (r.status === 'stopped') return { text: 'STOPPED', tone: 'amber', pulse }
  if (r.mode === 'cache') return { text: 'SAVED', tone: 'accent', pulse }
  if (r.mode === 'offline') return { text: 'OFFLINE', tone: 'amber', pulse }
  if (r.status === 'running') return { text: 'LIVE', tone: 'accent', pulse }
  return { text: 'DONE', tone: 'green', pulse }
}

const DOING: Record<ResearchStageKey, string> = {
  plan: 'Planning the research',
  search: 'Searching the web',
  read: 'Reading the sources',
  extract: 'Pulling out quoted evidence',
  verify: 'Cross-checking the claims',
  answer: 'Writing the answer',
}

/** What the agent is doing right now, in words — '' once it has stopped. */
export function activity(r: Pick<Research, 'status' | 'stages'>): string {
  if (r.status !== 'running') return ''
  const stage = r.stages.find((s) => s.state === 'run') ?? r.stages.find((s) => s.state === 'wait')
  return stage ? `${DOING[stage.key] ?? 'Working'}…` : 'Working…'
}

/**
 * A stable key per source row. The URL is the row's identity across updates —
 * a candidate found during search keeps its row (and its animation) when it is
 * picked and numbered — with a suffix in case the same link arrives twice.
 */
export function rowKeys(sources: Pick<ResearchSource, 'url' | 'title'>[]): string[] {
  const seen = new Map<string, number>()
  return sources.map((s, i) => {
    const base = s.url || s.title || `row-${i}`
    const k = seen.get(base) ?? 0
    seen.set(base, k + 1)
    return k ? `${base}#${k}` : base
  })
}

/** Only web pages open as a reader card; anything else in a URL field is ignored. */
export function isWebUrl(url: string): boolean {
  return /^https?:\/\/[^\s/]+/i.test(String(url ?? ''))
}

export type Metric = { label: string; value: string; hint?: string; tone?: Tone }

/**
 * The footer — the numbers that show the work: how many quotes were checked
 * against the page they claimed to come from, and what was thrown out.
 */
export function metrics(r: Pick<Research, 'stats' | 'sources'>): Metric[] {
  const s = r.stats
  const selected = r.sources.filter((x) => x.n > 0).length
  return [
    { label: 'quotes checked', value: String(s.quotes) },
    { label: 'verified', value: String(s.verified), tone: s.verified ? 'green' : undefined },
    { label: 'dropped', value: String(s.dropped), hint: 'not in the source', tone: s.dropped ? 'amber' : undefined },
    { label: 'injections removed', value: String(s.injections), tone: s.injections ? 'red' : undefined },
    { label: 'sources read', value: `${s.read}/${selected || s.read}` },
    { label: 'Claude calls', value: String(s.calls) },
  ]
}

/** 'API-equivalent $0.21 — not billed on Pro', or '' when there is no figure. */
export function costLine(costUsd: number | undefined): string {
  if (typeof costUsd !== 'number' || !Number.isFinite(costUsd) || costUsd <= 0) return ''
  return `API-equivalent $${costUsd.toFixed(2)} — not billed on Pro`
}

/** '7 Oct, 09:12' in the laptop's own time — '' when the date will not parse. */
export function savedWhen(iso: string | undefined): string {
  const t = Date.parse(String(iso ?? ''))
  if (!Number.isFinite(t)) return ''
  return new Date(t).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
