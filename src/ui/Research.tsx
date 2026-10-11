import { useEffect, useMemo, useState } from 'react'
import {
  activityLine,
  elapsed,
  liveElapsed,
  partActive,
  partCounts,
  partStateLabel,
  rankLabel,
  reviewLine,
  statusPill,
  withDefaults,
  type Research,
} from '../lib/research'

/**
 * The research progress card — a small card in the dock while one run of the
 * research agent (bridge/research.mjs) is going: the rank, the three or four
 * agents working on their parts of the question, and the reviewer. It is not
 * the result; the data and sources cards are, and they take this card's place
 * when they arrive.
 *
 * It arrives as a `kind: 'research'` blade and is replaced in place on every
 * update (same blade id), so this is a pure function of the state object plus
 * the clock.
 *
 * The question and the part titles came from a model that read the open web,
 * so everything is rendered as React text. There is no innerHTML anywhere in
 * this file, and none should ever be added.
 */
export function ResearchProgress({ research }: { research: Research }) {
  const r = useMemo(() => withDefaults(research), [research])
  const pill = statusPill(r)
  const rank = rankLabel(r.rank)
  const doing = r.parts.length ? '' : activityLine(r)

  return (
    <div className="rs-progress">
      <div className="rs-top">
        <span className={`rs-pill rs-t-${pill.tone}${pill.pulse ? ' rs-pulse' : ''}`}>
          <i aria-hidden="true" />
          {pill.text}
        </span>
        {rank && <span className="rs-rank">{rank}</span>}
      </div>
      <p className="rs-q" title={r.question}>
        {r.question || 'Research'}
      </p>
      {r.rank && r.rank.reasons.length > 0 && <p className="rs-why">{r.rank.reasons.join(' · ')}</p>}

      {r.parts.length > 0 ? (
        <ol className="rs-parts" aria-label="Agents">
          {r.parts.map((p) => (
            <li key={p.i} className={`rs-part rs-ps-${p.state}`}>
              <span className="rs-pi">{p.i}</span>
              <span className="rs-pt" title={p.question}>
                {p.title || p.question || `Part ${p.i}`}
              </span>
              <span className="rs-chip">
                {partActive(p.state) && <span className="rs-spin" aria-hidden="true" />}
                {partStateLabel(p.state)}
              </span>
              <span className="rs-pc">{p.state === 'fail' && p.error ? p.error : partCounts(p)}</span>
            </li>
          ))}
        </ol>
      ) : (
        doing && (
          <p className="rs-doing">
            <span className="rs-spin" aria-hidden="true" />
            {doing}
          </p>
        )
      )}

      <p className="rs-review">{reviewLine(r)}</p>

      {r.status === 'failed' && (
        <p className="rs-alert rs-t-red" role="alert">
          {r.error || 'The research could not finish.'}
        </p>
      )}
      {r.status === 'stopped' && (
        <p className="rs-alert rs-t-amber">{r.error || 'Stopped before the answer was finished.'}</p>
      )}

      <p className="rs-foot">
        <Elapsed status={r.status} mode={r.mode} startedAt={r.startedAt} ms={r.ms} />
        {' · '}
        {r.stats.calls} Claude {r.stats.calls === 1 ? 'call' : 'calls'}
      </p>
    </div>
  )
}

/**
 * The clock, on its own so its ticks redraw a few characters and not the card.
 * The interval exists only while a live run is going.
 */
function Elapsed(r: Pick<Research, 'status' | 'mode' | 'startedAt' | 'ms'>) {
  const ticking = r.status === 'running' && r.mode === 'live'
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!ticking) return
    const timer = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(timer)
  }, [ticking])
  return <>{elapsed(liveElapsed(r, now))}</>
}
