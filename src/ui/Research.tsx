import {
  Component,
  Fragment,
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { useStore } from '../store'
import {
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
  type AnswerBlock,
  type Research,
  type ResearchFact,
  type ResearchSource,
  type ResearchStage,
} from '../lib/research'

/**
 * The research board — the live view of one run of the research agent
 * (bridge/research.mjs): the plan, the search, the pages read, the quoted
 * evidence, the cross-check and the cited answer, as it happens.
 *
 * It arrives as a `kind: 'research'` blade and is replaced in place on every
 * update (same blade id), so this component is a pure function of the state
 * object plus two bits of local state: which source the pointer is on, and the
 * clock.
 *
 * Everything on it came off the open web — titles, domains, quotes, the answer
 * built from them — so all of it is rendered as React text. There is no
 * innerHTML anywhere in this file, and none should ever be added.
 */
export function ResearchBoard({ research }: { research: Research }) {
  return (
    <Guard stamp={research}>
      <MotionConfig reducedMotion="user">
        <Board raw={research} />
      </MotionConfig>
    </Guard>
  )
}

/* -------------------------------------------------------------- the board */

/** Citations anywhere on the board share one highlight and one way to open a source. */
type Cites = {
  hot: number | null
  setHot: (n: number | null) => void
  openN: (n: number) => void
  known: ReadonlySet<number>
}
const CiteCtx = createContext<Cites>({ hot: null, setHot: () => {}, openN: () => {}, known: new Set() })

function Board({ raw }: { raw: Research }) {
  const r = useMemo(() => withDefaults(raw), [raw])
  const [hot, setHot] = useState<number | null>(null)
  const rid = r.id

  /**
   * A source opens as a reader card, full screen — the board is usually full
   * screen itself, and a card opened behind it would be invisible. Closing the
   * card comes back to the board (Blades.tsx), which is why its id carries
   * the research id.
   */
  const open = useCallback(
    (s: ResearchSource, i: number) => {
      if (!isWebUrl(s.url)) return
      const id = `rd-${rid}-${s.n || `c${i}`}`
      const st = useStore.getState()
      st.pushBlade({
        id,
        title: (s.domain || 'source').toUpperCase(),
        kind: 'article',
        url: s.url,
        mode: 'reader',
        size: 'tall',
        hold: 'turn',
      })
      st.expandBlade(id)
    },
    [rid],
  )

  const byN = useMemo(() => new Map(r.sources.filter((s) => s.n > 0).map((s) => [s.n, s])), [r.sources])
  const openN = useCallback(
    (n: number) => {
      const s = byN.get(n)
      if (s) open(s, 0)
    },
    [byN, open],
  )
  const cites = useMemo<Cites>(
    () => ({ hot, setHot, openN, known: new Set(byN.keys()) }),
    [hot, openN, byN],
  )

  return (
    <CiteCtx.Provider value={cites}>
      <div className="rs">
        <div className="rs-in">
          <Header r={r} />
          <Pipeline stages={r.stages} />
          {r.plan && <Plan plan={r.plan} />}
          <div className="rs-cols">
            <Sources r={r} hot={hot} setHot={setHot} open={open} />
            <Findings r={r} />
          </div>
          <Footer r={r} />
        </div>
      </div>
    </CiteCtx.Provider>
  )
}

/* ------------------------------------------------------------------ header */

function Header({ r }: { r: Research }) {
  const pill = statusPill(r)
  const saved = r.mode !== 'live' ? savedWhen(r.cachedAt) : ''
  return (
    <header className="rs-top">
      <div className="rs-top-l">
        <div className="rs-kicker">
          <span className="rs-label">Research agent</span>
          <span className={`rs-pill rs-t-${pill.tone}${pill.pulse ? ' rs-pulse' : ''}`}>
            <i aria-hidden="true" />
            {pill.text}
          </span>
          <span className="rs-tag">{r.depth}</span>
          {saved && <span className="rs-saved">saved {saved}</span>}
        </div>
        <h2 className="rs-q">{r.question || 'Research'}</h2>
      </div>
      <div className="rs-top-r">
        <div className="rs-clock">
          <span className="rs-label">{r.status === 'running' ? 'Elapsed' : 'Total'}</span>
          <span className="rs-clock-v">
            <Elapsed status={r.status} mode={r.mode} startedAt={r.startedAt} ms={r.ms} />
          </span>
        </div>
        <AnimatePresence>
          {r.answer.label && <Gauge key="gauge" value={r.answer.confidence} label={r.answer.label} />}
        </AnimatePresence>
      </div>
    </header>
  )
}

/**
 * The clock, on its own so its ten ticks a second redraw a few characters and
 * not the board. The interval exists only while a live run is going.
 */
function Elapsed(r: Pick<Research, 'status' | 'mode' | 'startedAt' | 'ms'>) {
  const ticking = r.status === 'running' && r.mode === 'live'
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!ticking) return
    const timer = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(timer)
  }, [ticking])
  return <>{elapsed(liveElapsed(r, now))}</>
}

const RING = 2 * Math.PI * 30

function Gauge({ value, label }: { value: number | null; label: 'High' | 'Medium' | 'Low' }) {
  const v = typeof value === 'number' ? Math.min(1, Math.max(0, value)) : 0
  return (
    <motion.div
      className={`rs-gauge rs-t-${confidenceTone(label)}`}
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 220, damping: 22 }}
      role="img"
      aria-label={`Confidence ${label}, ${pct(value)}`}
    >
      <span className="rs-ring">
        <svg viewBox="0 0 72 72" aria-hidden="true">
          <circle className="rs-ring-track" cx="36" cy="36" r="30" />
          <motion.circle
            className="rs-ring-fill"
            cx="36"
            cy="36"
            r="30"
            strokeDasharray={RING}
            initial={{ strokeDashoffset: RING }}
            animate={{ strokeDashoffset: RING * (1 - v) }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
          />
        </svg>
        <b className="rs-ring-pct">{pct(value)}</b>
      </span>
      <span className="rs-gauge-words">
        <span className="rs-label">Confidence</span>
        <span className="rs-gauge-label">{label}</span>
      </span>
    </motion.div>
  )
}

/* ---------------------------------------------------------------- pipeline */

const NODE: Partial<Record<ResearchStage['state'], string>> = { done: '✓', fail: '✕', skip: '–' }

function Pipeline({ stages }: { stages: ResearchStage[] }) {
  return (
    <ol className="rs-pipe" aria-label="Pipeline">
      {stages.map((s, i) => (
        <li key={s.key} className={`rs-stage rs-s-${s.state}`}>
          <span className="rs-node" aria-hidden="true">
            {NODE[s.state] ?? i + 1}
          </span>
          <span className="rs-stage-name">{s.label}</span>
          <span className="rs-stage-ms">
            {s.ms !== undefined ? elapsed(s.ms) : s.state === 'run' ? 'working' : s.state === 'skip' ? 'skipped' : ''}
          </span>
          {/* Keyed on the words so a new note fades in rather than snapping. */}
          <span key={s.note ?? ''} className="rs-stage-note">
            {s.note ?? ''}
          </span>
        </li>
      ))}
    </ol>
  )
}

function Plan({ plan }: { plan: NonNullable<Research['plan']> }) {
  if (!plan.intent && !plan.subquestions.length) return null
  return (
    <div className="rs-plan">
      <div className="rs-plan-head">
        <span className="rs-label">Plan</span>
        {plan.intent && <span className="rs-intent">{plan.intent}</span>}
      </div>
      {plan.subquestions.length > 0 && (
        <ol className="rs-subqs">
          {plan.subquestions.map((q, i) => (
            <motion.li
              key={`${i}-${q}`}
              title={q}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.08 }}
            >
              <b>Q{i + 1}</b>
              <span>{q}</span>
            </motion.li>
          ))}
        </ol>
      )}
    </div>
  )
}

/* ----------------------------------------------------------------- sources */

function Sources({
  r,
  hot,
  setHot,
  open,
}: {
  r: Research
  hot: number | null
  setHot: (n: number | null) => void
  open: (s: ResearchSource, i: number) => void
}) {
  const selected = r.sources.filter((s) => s.n > 0).length
  const found = Math.max(r.stats.found, r.sources.length)
  const keys = useMemo(() => rowKeys(r.sources), [r.sources])
  const sub = selected ? `${selected} picked · ${found} found` : found ? `${found} found` : ''
  return (
    <section className="rs-col rs-srcs" aria-label="Sources">
      <h3 className="rs-h">
        <span>Sources</span>
        {sub && <span className="rs-h-sub">{sub}</span>}
      </h3>
      {r.sources.length ? (
        <ul className="rs-list">
          {r.sources.map((s, i) => (
            <SourceRow
              key={keys[i]}
              s={s}
              i={i}
              hot={hot !== null && s.n === hot}
              setHot={setHot}
              open={open}
            />
          ))}
        </ul>
      ) : (
        <p className="rs-empty">{r.status === 'running' ? 'Looking for sources…' : 'No sources were found.'}</p>
      )}
    </section>
  )
}

type RowProps = {
  s: ResearchSource
  i: number
  hot: boolean
  setHot: (n: number | null) => void
  open: (s: ResearchSource, i: number) => void
}

/**
 * One source. Every update from the bridge is a fresh object, so the row
 * compares what it shows rather than which object it was given — otherwise all
 * of them redraw five times a second while nothing about them has changed.
 */
const SourceRow = memo(
  function SourceRow({ s, i, hot, setHot, open }: RowProps) {
    const web = isWebUrl(s.url)
    const enter = () => setHot(s.n > 0 ? s.n : null)
    const leave = () => setHot(null)
    return (
      <motion.li
        className={
          `rs-src rs-src-${s.state}` + (hot ? ' rs-hot' : '') + (s.injection ? ' rs-inj' : '')
        }
        initial={{ opacity: 0, x: -14 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.35, delay: Math.min(i, 12) * 0.035, ease: 'easeOut' }}
      >
        <button
          type="button"
          className="rs-src-btn"
          disabled={!web}
          title={web ? `${s.url}\nOpen this page` : undefined}
          onClick={(e) => {
            // Space is her talk key; a button left focused would also take it.
            e.currentTarget.blur()
            open(s, i)
          }}
          onMouseEnter={enter}
          onMouseLeave={leave}
          onFocus={enter}
          onBlur={leave}
        >
          <span className="rs-n">{s.n > 0 ? s.n : '·'}</span>
          <span className="rs-src-main">
            <span className="rs-src-title">{s.title || s.domain || s.url}</span>
            <span className="rs-src-meta">
              <span className="rs-domain">{s.domain}</span>
              <span className={`rs-kind rs-kind-${s.kind}`}>{kindLabel(s.kind)}</span>
              {s.published && <span className="rs-date">{s.published}</span>}
              {s.subq.length > 0 && <span className="rs-subq">{s.subq.map((q) => `Q${q + 1}`).join(' ')}</span>}
            </span>
            <span className="rs-trust">
              <span className={`rs-bar rs-t-${trustTone(s.trust)}`}>
                <i style={{ width: pct(s.trust) }} />
              </span>
              <span className="rs-trust-n">trust {pct(s.trust)}</span>
              {s.injection && <span className="rs-badge rs-t-red">⚠ injection removed</span>}
              {s.why.length > 0 && <span className="rs-why">{s.why.join(' · ')}</span>}
            </span>
            {s.state === 'failed' && <span className="rs-src-err">{s.error || 'could not be read'}</span>}
          </span>
          <span className="rs-src-side">
            <StateMark state={s.state} />
            {s.claims > 0 && (
              <span className="rs-claims">
                <b>{s.claims}</b> {s.claims === 1 ? 'claim' : 'claims'}
              </span>
            )}
          </span>
        </button>
      </motion.li>
    )
  },
  (a, b) =>
    a.hot === b.hot &&
    a.i === b.i &&
    a.open === b.open &&
    a.setHot === b.setHot &&
    JSON.stringify(a.s) === JSON.stringify(b.s),
)

function StateMark({ state }: { state: ResearchSource['state'] }) {
  if (state === 'reading') return <span className="rs-state rs-state-reading" role="img" aria-label="reading" />
  if (state === 'read') return <span className="rs-state rs-state-read" role="img" aria-label="read">✓</span>
  if (state === 'failed') return <span className="rs-state rs-state-failed" role="img" aria-label="failed">✕</span>
  if (state === 'skipped') return <span className="rs-state rs-state-skipped" role="img" aria-label="skipped">–</span>
  return <span className="rs-state rs-state-found" role="img" aria-label="found">○</span>
}

/* ---------------------------------------------------------------- findings */

function Findings({ r }: { r: Research }) {
  const answering = r.stages.find((s) => s.key === 'answer')?.state === 'run'
  const disputed = r.facts.filter((f) => f.status === 'disputed').length
  return (
    <section className="rs-col rs-find" aria-label="Answer and evidence">
      <h3 className="rs-h">
        <span>Answer</span>
        {answering && <span className="rs-h-sub">writing…</span>}
      </h3>
      {r.status === 'failed' && (
        <div className="rs-alert rs-t-red" role="alert">
          {r.error || 'The research could not finish.'}
        </div>
      )}
      {r.status === 'stopped' && (
        <div className="rs-alert rs-t-amber">{r.error || 'Stopped before the answer was finished.'}</div>
      )}
      <Answer text={r.answer.text} writing={answering} waiting={activity(r)} />

      {r.facts.length > 0 && (
        <>
          <h3 className="rs-h rs-h-gap">
            <span>Evidence</span>
            <span className="rs-h-sub">
              {r.facts.length} {r.facts.length === 1 ? 'fact' : 'facts'}
              {disputed ? ` · ${disputed} disputed` : ''}
            </span>
          </h3>
          <ul className="rs-facts">
            {r.facts.map((f, i) => (
              <FactRow key={f.id} f={f} i={i} />
            ))}
          </ul>
        </>
      )}

      {r.gaps.length > 0 && (
        <>
          <h3 className="rs-h rs-h-gap">
            <span>Gaps</span>
          </h3>
          <ul className="rs-gaps">
            {r.gaps.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

function Answer({ text, writing, waiting }: { text: string; writing: boolean; waiting: string }) {
  const blocks = useMemo(() => answerBlocks(text), [text])

  if (!blocks.length) {
    if (!waiting) return null
    // Something to look at while the evidence is gathered: what she is doing,
    // over the shape of the answer to come.
    return (
      <div className="rs-wait" aria-live="polite">
        <span className="rs-wait-text">
          <span className="rs-spin" aria-hidden="true" />
          {waiting}
        </span>
        <span className="rs-skel" style={{ width: '94%' }} />
        <span className="rs-skel" style={{ width: '81%' }} />
        <span className="rs-skel" style={{ width: '88%' }} />
      </div>
    )
  }

  // Bullets that follow one another belong to one list.
  const groups: Array<AnswerBlock | AnswerBlock[]> = []
  for (const b of blocks) {
    const last = groups[groups.length - 1]
    if (b.kind === 'li' && Array.isArray(last)) last.push(b)
    else groups.push(b.kind === 'li' ? [b] : b)
  }

  return (
    <div className="rs-answer">
      {groups.map((g, i) => {
        const end = writing && i === groups.length - 1
        if (Array.isArray(g)) {
          return (
            <ul key={i}>
              {g.map((b, j) => (
                <li key={j}>
                  <Cited text={b.text} caret={end && j === g.length - 1} />
                </li>
              ))}
            </ul>
          )
        }
        return (
          <p key={i}>
            <Cited text={g.text} caret={end} />
          </p>
        )
      })}
    </div>
  )
}

/** A line of prose with its [n] citations turned into chips. */
function Cited({ text, caret }: { text: string; caret: boolean }) {
  const parts = useMemo(() => splitCitations(text), [text])
  return (
    <>
      {parts.map((p, k) =>
        'cite' in p ? <Cite key={k} n={p.cite} /> : <Fragment key={k}>{p.text}</Fragment>,
      )}
      {caret && <span className="rs-caret" aria-hidden="true" />}
    </>
  )
}

function Cite({ n, against = false }: { n: number; against?: boolean }) {
  const { hot, setHot, openN, known } = useContext(CiteCtx)
  const ok = known.has(n)
  return (
    <button
      type="button"
      className={'rs-cite' + (hot === n ? ' rs-hot' : '') + (against ? ' rs-cite-against' : '') + (ok ? '' : ' rs-cite-x')}
      onMouseEnter={() => setHot(n)}
      onMouseLeave={() => setHot(null)}
      onFocus={() => setHot(n)}
      onBlur={() => setHot(null)}
      onClick={(e) => {
        e.currentTarget.blur()
        openN(n)
      }}
      aria-label={against ? `Contradicted by source ${n}` : `Source ${n}`}
      title={ok ? `Source ${n} — open it` : `Source ${n}`}
    >
      {n}
    </button>
  )
}

function FactRow({ f, i }: { f: ResearchFact; i: number }) {
  const tone = statusTone(f.status)
  return (
    <motion.li
      className={`rs-fact rs-f-${f.status} rs-t-${tone}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(i, 10) * 0.05, ease: 'easeOut' }}
    >
      <div className="rs-fact-head">
        <span className="rs-chip">{statusLabel(f)}</span>
        <span className="rs-fact-conf">
          <span className="rs-bar">
            <i style={{ width: pct(f.confidence) }} />
          </span>
          <b>{pct(f.confidence)}</b>
        </span>
      </div>
      <p className="rs-fact-text">{f.text}</p>
      <div className="rs-fact-srcs">
        {f.support.length > 0 && <span className="rs-mini">from</span>}
        {f.support.map((n) => (
          <Cite key={`s${n}`} n={n} />
        ))}
        {f.contradict.length > 0 && <span className="rs-mini rs-mini-against">against</span>}
        {f.contradict.map((n) => (
          <Cite key={`c${n}`} n={n} against />
        ))}
      </div>
      {f.note && <p className="rs-fact-note">{f.note}</p>}
    </motion.li>
  )
}

/* ------------------------------------------------------------------ footer */

function Footer({ r }: { r: Research }) {
  const cost = costLine(r.costUsd)
  return (
    <footer className="rs-foot">
      {metrics(r).map((m) => (
        <span key={m.label} className={`rs-m${m.tone ? ` rs-t-${m.tone}` : ''}`}>
          {m.label} <b>{m.value}</b>
          {m.hint && <i> ({m.hint})</i>}
        </span>
      ))}
      <span className="rs-m">
        <b>
          <Elapsed status={r.status} mode={r.mode} startedAt={r.startedAt} ms={r.ms} />
        </b>
      </span>
      {cost && <span className="rs-m rs-cost">{cost}</span>}
    </footer>
  )
}

/* ------------------------------------------------------------------- guard */

/**
 * A board that cannot draw must not take the interface down with it — in
 * front of an audience the face going blank is the worst outcome there is. The
 * next update from the bridge gets a fresh chance.
 */
type GuardProps = { stamp: unknown; children: ReactNode }
type GuardState = { failed: boolean; stamp: unknown }

class Guard extends Component<GuardProps, GuardState> {
  state: GuardState = { failed: false, stamp: this.props.stamp }

  static getDerivedStateFromProps(props: GuardProps, state: GuardState): Partial<GuardState> | null {
    return props.stamp === state.stamp ? null : { failed: false, stamp: props.stamp }
  }

  static getDerivedStateFromError(): Partial<GuardState> {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error('[research board]', error)
  }

  render() {
    if (this.state.failed) return <p className="bl-note">The research board could not draw this update.</p>
    return this.props.children
  }
}
