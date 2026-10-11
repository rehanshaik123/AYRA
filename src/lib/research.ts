/**
 * The research agent's state — the object the bridge's research engine
 * (bridge/research.mjs) sends inside a `kind: 'research'` blade — and the two
 * result cards every web answer ends with: `data` (the figures) and `sources`
 * (the links used). Plus the small pure helpers the cards render them with
 * (src/ui/Research.tsx, src/ui/Blades.tsx).
 *
 * The types mirror the engine's object field for field. They are a protocol
 * between the bridge and the face, so change both sides together or not at all.
 *
 * Everything in here is pure on purpose: every decision about what a card shows
 * can be tested without a browser (test/research-face.test.mjs).
 */

export type ResearchLevel = 'simple' | 'moderate' | 'complex'

/** The ranker's verdict on the question (bridge/triage.mjs). */
export type ResearchRank = {
  /** 0..10 */
  score: number
  level: ResearchLevel
  /** How many parts the question is split into: 0, 3 or 4. */
  parts: number
  /** Short plain phrases: 'comparison', 'several parts', … */
  reasons: string[]
}

export type ResearchStageKey = 'rank' | 'split' | 'agents' | 'review'

export type ResearchStage = {
  key: ResearchStageKey
  /** 'Rank' | 'Split' | 'Agents' | 'Review' */
  label: string
  state: 'wait' | 'run' | 'done' | 'fail' | 'skip'
  note?: string
  /** Duration once done or failed. */
  ms?: number
}

export type PartState = 'wait' | 'search' | 'read' | 'report' | 'done' | 'fail'

/** One sub-agent: a part of the question, searched, read and reported on. */
export type ResearchPart = {
  /** 1-based. */
  i: number
  /** 2–4 words. */
  title: string
  question: string
  state: PartState
  /** Links its search found. */
  found: number
  /** Pages read for it. */
  read: number
  /** Quoted findings that survived the quote check. */
  findings: number
  error?: string
}

/** What the reviewer did with the findings. */
export type ResearchReview = {
  findings: number
  kept: number
  duplicates: number
  offTopic: number
  weak: number
}

export type ResearchSourceKind =
  'gov' | 'academic' | 'reference' | 'news' | 'org' | 'company' | 'blog' | 'forum' | 'social' | 'web'

export type ResearchSource = {
  n: number
  title: string
  url: string
  /** 'who.int' — the hostname without www. */
  domain: string
  kind: ResearchSourceKind
  /** 0..1 */
  trust: number
  /** Cited by the answer, a kept fact or a figure. */
  used: boolean
}

export type ResearchFact = {
  id: string
  text: string
  status: 'corroborated' | 'single' | 'disputed'
  /** 0..1 */
  confidence: number
  support: number[]
  contradict: number[]
  /** 0..10, the reviewer's score against the question. */
  relevance: number
}

/** The figure a data card leads with. `value` is a display string: "₹1,23,450", "6.2%", "Yes". */
export type DataHeadline = {
  label: string
  value: string
  unit?: string
  asOf?: string
  change?: string
  /** The source number it came from. */
  n?: number
}

export type DataRow = {
  label: string
  value: string
  unit?: string
  note?: string
  n?: number
}

/** A data card's content: the clear figures that answer the question. */
export type DataCard = {
  title: string
  headline: DataHeadline | null
  rows: DataRow[]
  note?: string
}

/** One link on a sources card. */
export type BladeLink = {
  n?: number
  title: string
  url: string
  domain: string
}

export type Research = {
  /** 'rs-<base36 time>-<seq>' — also the progress card's blade id. */
  id: string
  question: string
  status: 'running' | 'done' | 'failed' | 'stopped' | 'skipped'
  mode: 'live' | 'cache' | 'offline'
  /** Epoch ms, for the live timer. */
  startedAt: number
  /** Elapsed so far, or the total once finished. */
  ms: number
  /** The SDK's API-equivalent figure (Pro login: not billed). */
  costUsd?: number
  error?: string
  /** ISO, for cache and offline. */
  cachedAt?: string
  /** Null only when the bridge sent none worth showing. */
  rank: ResearchRank | null
  /** Always the four, in order. */
  stages: ResearchStage[]
  parts: ResearchPart[]
  review: ResearchReview | null
  stats: {
    /** Claude calls made. */
    calls: number
    found: number
    read: number
    findings: number
    quotes: number
    /** Findings dropped: quote not in the page, or a figure that did not check out. */
    dropped: number
    injections: number
  }
  answer: { text: string; confidence: number | null; label: 'High' | 'Medium' | 'Low' | null }
  data: DataCard | null
  sources: ResearchSource[]
  facts: ResearchFact[]
  gaps: string[]
}

export type Tone = 'green' | 'amber' | 'red' | 'dim'

/* ----------------------------------------------------------------- coercion */

/** The four stages, in order, with the labels the card falls back to. */
export const STAGES: ReadonlyArray<readonly [ResearchStageKey, string]> = [
  ['rank', 'Rank'],
  ['split', 'Split'],
  ['agents', 'Agents'],
  ['review', 'Review'],
]

const STATUSES: ReadonlySet<string> = new Set(['running', 'done', 'failed', 'stopped', 'skipped'])
const MODES: ReadonlySet<string> = new Set(['live', 'cache', 'offline'])
const LEVELS: ReadonlySet<string> = new Set(['simple', 'moderate', 'complex'])
const STAGE_STATES: ReadonlySet<string> = new Set(['wait', 'run', 'done', 'fail', 'skip'])
const PART_STATES: ReadonlySet<string> = new Set(['wait', 'search', 'read', 'report', 'done', 'fail'])
const FACT_STATES: ReadonlySet<string> = new Set(['corroborated', 'single', 'disputed'])
const KINDS: ReadonlySet<string> = new Set([
  'gov', 'academic', 'reference', 'news', 'org', 'company', 'blog', 'forum', 'social', 'web',
])

type Loose = Record<string, unknown>
const rec = (x: unknown): Loose => (x && typeof x === 'object' ? (x as Loose) : {})
const num = (x: unknown, or = 0): number => (typeof x === 'number' && Number.isFinite(x) ? x : or)
const list = (x: unknown): unknown[] => (Array.isArray(x) ? x : [])
const pick = <T extends string>(x: unknown, allowed: ReadonlySet<string>, or: T): T =>
  typeof x === 'string' && allowed.has(x) ? (x as T) : or
/** A count: a whole number, never negative. */
const count = (x: unknown): number => Math.max(0, Math.round(num(x)))
/** A source number: a positive whole number, or nothing. */
const sourceN = (x: unknown): number | undefined =>
  typeof x === 'number' && Number.isInteger(x) && x > 0 && x < 1000 ? x : undefined

/**
 * Anything as a string. An object whose toString throws (or is missing, as on
 * a null-prototype object) is nothing rather than a crash.
 */
function str(x: unknown): string {
  if (typeof x === 'string') return x
  if (x == null) return ''
  try {
    return String(x)
  } catch {
    return ''
  }
}

/** One line of at most `max` characters, cut with an ellipsis. */
function clip(x: unknown, max: number): string {
  const s = str(x).replace(/\s+/g, ' ').trim()
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s
}

/** Like clip, but absent when empty — for the optional fields. */
function optClip(x: unknown, max: number): string | undefined {
  return clip(x, max) || undefined
}

/**
 * A research state that is safe to render, whatever arrived.
 *
 * The object comes over a socket from another process. A React render that
 * throws takes the whole interface down with it, and an object where a string
 * was expected does exactly that — so every field is coerced to its type here,
 * once, and clipped, and the card never has to wonder.
 */
export function withDefaults(raw: unknown): Research {
  const r = rec(raw)
  const stats = rec(r.stats)
  const answer = rec(r.answer)
  const stages = list(r.stages).map(rec)
  const label = answer.label === 'High' || answer.label === 'Medium' || answer.label === 'Low' ? answer.label : null
  const confidence = typeof answer.confidence === 'number' && Number.isFinite(answer.confidence)
    ? clamp01(answer.confidence)
    : null

  return {
    id: clip(r.id, 80),
    question: clip(r.question, 400),
    status: pick(r.status, STATUSES, 'running'),
    mode: pick(r.mode, MODES, 'live'),
    startedAt: num(r.startedAt),
    ms: Math.max(0, num(r.ms)),
    costUsd: typeof r.costUsd === 'number' && Number.isFinite(r.costUsd) ? r.costUsd : undefined,
    error: optClip(r.error, 240),
    cachedAt: optClip(r.cachedAt, 40),
    rank: cleanRank(r.rank),
    // Always the four, in pipeline order, whatever order or subset arrived;
    // a stage the face does not know is dropped.
    stages: STAGES.map(([key, fallback]) => {
      const s = stages.find((x) => x.key === key) ?? {}
      return {
        key,
        label: clip(s.label, 24) || fallback,
        state: pick(s.state, STAGE_STATES, 'wait'),
        note: optClip(s.note, 120),
        ms: typeof s.ms === 'number' && Number.isFinite(s.ms) && s.ms >= 0 ? s.ms : undefined,
      }
    }),
    parts: list(r.parts).slice(0, 6).map((x, k) => {
      const p = rec(x)
      return {
        i: sourceN(p.i) ?? k + 1,
        title: clip(p.title, 60),
        question: clip(p.question, 300),
        state: pick(p.state, PART_STATES, 'wait'),
        found: count(p.found),
        read: count(p.read),
        findings: count(p.findings),
        error: optClip(p.error, 120),
      }
    }),
    review: r.review && typeof r.review === 'object'
      ? (() => {
          const v = rec(r.review)
          return {
            findings: count(v.findings),
            kept: count(v.kept),
            duplicates: count(v.duplicates),
            offTopic: count(v.offTopic),
            weak: count(v.weak),
          }
        })()
      : null,
    stats: {
      calls: count(stats.calls),
      found: count(stats.found),
      read: count(stats.read),
      findings: count(stats.findings),
      quotes: count(stats.quotes),
      dropped: count(stats.dropped),
      injections: count(stats.injections),
    },
    answer: { text: str(answer.text).slice(0, 4000), confidence, label },
    data: cleanData(r.data),
    sources: list(r.sources).slice(0, 40).map((x) => {
      const s = rec(x)
      const url = clip(s.url, 2000)
      return {
        n: count(s.n),
        title: clip(s.title, 200),
        url,
        domain: clip(s.domain, 120) || domainOf(url),
        kind: pick(s.kind, KINDS, 'web'),
        trust: clamp01(num(s.trust)),
        used: s.used === true,
      }
    }),
    facts: list(r.facts).slice(0, 20).map((x, i) => {
      const f = rec(x)
      const ns = (v: unknown) => list(v).map(sourceN).filter((n): n is number => n !== undefined)
      return {
        id: clip(f.id, 20) || `f${i + 1}`,
        text: clip(f.text, 400),
        status: pick(f.status, FACT_STATES, 'single'),
        confidence: clamp01(num(f.confidence)),
        support: ns(f.support),
        contradict: ns(f.contradict),
        relevance: Math.min(10, count(f.relevance)),
      }
    }),
    gaps: list(r.gaps).map((g) => clip(g, 200)).filter(Boolean).slice(0, 8),
  }
}

function cleanRank(raw: unknown): ResearchRank | null {
  const k = rec(raw)
  if (typeof k.level !== 'string' || !LEVELS.has(k.level)) return null
  return {
    score: Math.min(10, count(k.score)),
    level: k.level as ResearchLevel,
    parts: Math.min(6, count(k.parts)),
    reasons: list(k.reasons).map((s) => clip(s, 40)).filter(Boolean).slice(0, 6),
  }
}

/**
 * A data card's content, safe to render: every field a clipped string, at most
 * eight rows, a headline only when it has a value. Null when nothing is left to
 * show — no headline, no rows and no note.
 */
export function cleanData(raw: unknown): DataCard | null {
  if (!raw || typeof raw !== 'object') return null
  const d = rec(raw)
  const h = d.headline && typeof d.headline === 'object' ? rec(d.headline) : null
  const value = h ? clip(h.value, 40) : ''
  const headline: DataHeadline | null = h && value
    ? strip({
        label: clip(h.label, 60),
        value,
        // The bridge's own limits (research.mjs, panels.mjs): a figure it has
        // checked against the page is never cut short here.
        unit: optClip(h.unit, 20),
        asOf: optClip(h.asOf, 40),
        change: optClip(h.change, 40),
        n: sourceN(h.n),
      })
    : null
  const rows = list(d.rows)
    .map((x) => {
      const row = rec(x)
      return strip({
        label: clip(row.label, 60),
        value: clip(row.value, 40),
        unit: optClip(row.unit, 20),
        note: optClip(row.note, 80),
        n: sourceN(row.n),
      })
    })
    .filter((row) => row.label || row.value)
    .slice(0, 8)
  const note = optClip(d.note, 240)
  if (!headline && !rows.length && !note) return null
  return strip({ title: clip(d.title, 40), headline, rows, note })
}

/**
 * A sources card's links, safe to render: strings clipped, the domain filled in
 * from the URL when missing, repeats dropped, at most `max`. A bare URL string
 * is accepted as a link too.
 */
export function cleanLinks(raw: unknown, max = 5): BladeLink[] {
  const out: BladeLink[] = []
  const seen = new Set<string>()
  for (const x of list(raw)) {
    const l = typeof x === 'string' ? { url: x } : rec(x)
    const url = clip(l.url, 2000)
    const title = clip(l.title, 200)
    if (!url && !title) continue
    if (url) {
      if (seen.has(url)) continue
      seen.add(url)
    }
    out.push(strip({ n: sourceN(l.n), title, url, domain: clip(l.domain, 80) || domainOf(url) }))
    if (out.length >= max) break
  }
  return out
}

/** Optional fields that came out empty are left off, not set to undefined. */
function strip<T extends object>(o: T): T {
  for (const k of Object.keys(o) as Array<keyof T>) if (o[k] === undefined) delete o[k]
  return o
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

/** '1 source', '3 findings'. */
function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/* -------------------------------------------------------------------- words */

/** The rank badge: 'COMPLEX · 8/10', or '' when the bridge sent no rank. */
export function rankLabel(rank: ResearchRank | null): string {
  if (!rank) return ''
  return `${rank.level.toUpperCase()} · ${rank.score}/10`
}

const PART_WORDS: Record<PartState, string> = {
  wait: 'waiting',
  search: 'searching',
  read: 'reading',
  report: 'reporting',
  done: 'done',
  fail: 'failed',
}

/** A part's state chip, in words. */
export function partStateLabel(state: PartState): string {
  return PART_WORDS[state] ?? 'waiting'
}

/** A part is at work — its chip carries a spinner. */
export function partActive(state: PartState): boolean {
  return state === 'search' || state === 'read' || state === 'report'
}

/** '3 sources · 5 findings' once reading starts; '12 found' while searching; '' before. */
export function partCounts(p: Pick<ResearchPart, 'state' | 'found' | 'read' | 'findings'>): string {
  if (p.state === 'wait') return ''
  if (p.state === 'search') return p.found ? `${p.found} found` : ''
  return `${plural(p.read, 'source')} · ${plural(p.findings, 'finding')}`
}

/**
 * The reviewer's row: 'Reviewer: 14 findings → 6 kept · 3 duplicates · 2 off-topic',
 * or what it is doing until it has a verdict.
 */
export function reviewLine(r: Pick<Research, 'review' | 'stages'>): string {
  const v = r.review
  if (v) {
    const bits = [`${v.kept} kept`]
    if (v.duplicates) bits.push(plural(v.duplicates, 'duplicate'))
    if (v.offTopic) bits.push(`${v.offTopic} off-topic`)
    if (v.weak) bits.push(`${v.weak} weak`)
    return `Reviewer: ${plural(v.findings, 'finding')} → ${bits.join(' · ')}`
  }
  const state = r.stages.find((s) => s.key === 'review')?.state
  if (state === 'run') return 'Reviewer: scoring the findings…'
  if (state === 'skip') return 'Reviewer: skipped'
  if (state === 'fail') return 'Reviewer: unavailable, facts taken from the findings'
  return 'Reviewer: waiting'
}

const DOING: Record<ResearchStageKey, string> = {
  rank: 'Ranking the question',
  split: 'Splitting the question',
  agents: 'Agents at work',
  review: 'Reviewing the findings',
}

/** What the run is doing right now, in words — '' once it has stopped. */
export function activityLine(r: Pick<Research, 'status' | 'stages'>): string {
  if (r.status !== 'running') return ''
  const stage = r.stages.find((s) => s.state === 'run') ?? r.stages.find((s) => s.state === 'wait')
  if (!stage) return 'Working…'
  return stage.note || `${DOING[stage.key] ?? 'Working'}…`
}

/**
 * The pill beside the rank. What went wrong outranks where the answer came
 * from, which outranks whether it is still going.
 */
export function statusPill(
  r: Pick<Research, 'status' | 'mode'>,
): { text: string; tone: Tone | 'accent'; pulse: boolean } {
  const pulse = r.status === 'running'
  if (r.status === 'failed') return { text: 'FAILED', tone: 'red', pulse }
  if (r.status === 'stopped') return { text: 'STOPPED', tone: 'amber', pulse }
  if (r.status === 'skipped') return { text: 'SKIPPED', tone: 'dim', pulse }
  if (r.mode === 'cache') return { text: 'SAVED', tone: 'accent', pulse }
  if (r.mode === 'offline') return { text: 'OFFLINE', tone: 'amber', pulse }
  if (r.status === 'running') return { text: 'LIVE', tone: 'accent', pulse }
  return { text: 'DONE', tone: 'green', pulse }
}

/** Only web pages become links; anything else in a URL field is shown as text. */
export function isWebUrl(url: string): boolean {
  return /^https?:\/\/[^\s/]+/i.test(String(url ?? ''))
}

/** 'https://www.who.int/news' → 'who.int'; '' for anything that is not a web URL. */
export function domainOf(url: string): string {
  if (!isWebUrl(url)) return ''
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** 'saved 5 h ago' — '' when the date will not parse. */
export function savedAgo(iso: string | undefined, now: number): string {
  const t = Date.parse(String(iso ?? ''))
  if (!Number.isFinite(t)) return ''
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 60) return 'saved just now'
  if (s < 3600) return `saved ${Math.floor(s / 60)} min ago`
  if (s < 48 * 3600) return `saved ${Math.floor(s / 3600)} h ago`
  return `saved ${Math.floor(s / 86400)} d ago`
}

/**
 * A data card's footer: the confidence, and for a replayed or offline answer
 * how old it is — 'Confidence High (82%) · saved 5 h ago'. '' when neither.
 */
export function dataFoot(
  b: { confidence?: unknown; mode?: unknown; savedAt?: unknown },
  now: number,
): string {
  const bits: string[] = []
  const confidence = typeof b.confidence === 'string' ? clip(b.confidence, 40) : ''
  if (confidence) bits.push(`Confidence ${confidence}`)
  if (b.mode === 'cache' || b.mode === 'offline') {
    const ago = savedAgo(str(b.savedAt), now) || 'saved earlier'
    bits.push(b.mode === 'offline' ? `offline · ${ago}` : ago)
  }
  return bits.join(' · ')
}

/** Which way a change points: '+1.2%' up, '−340' down, anything else neither. */
export function changeTone(change: string | undefined): 'up' | 'down' | '' {
  const s = String(change ?? '').trim()
  if (/^[+▲↑]/.test(s)) return 'up'
  if (/^[-−–▼↓]/.test(s)) return 'down'
  return ''
}
