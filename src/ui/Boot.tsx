import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useStore } from '../store'
import { IDENTITY } from '../identity'

/**
 * The start-up sequence, about two seconds long — it covers the bridge
 * connecting and the voice engines being probed, and no more. (The upstream
 * version ran nine seconds through a suit schematic and an arc reactor; the
 * owner wants no lag, so those beats went.)
 *
 * Two beats, cyan on black:
 *   1. an angular status bar — "INITIATING SYSTEM" — over a scrolling boot log,
 *      with a segmented bar filling left to right;
 *   2. concentric reticle rings assembling inward until the wordmark resolves
 *      at the centre.
 *
 * One full-frame overlay driven by a small stage clock, so the timing is
 * legible in one place. Everything is SVG and CSS — no images to load, nothing
 * that can arrive late and stall the first beat. App owns the hand-off
 * (BOOT_MS in App.tsx); this only paces what is on screen.
 */

/** When the rings take over from the status bar, in ms from power-on. */
const T = { rings: 800 }

const LOG = [
  'MOUNT F:/BACKUP/GHOST (HIDDEN)',
  'EXTEND SYSTEM MEMORY .......... OK',
  'TELEMETRY / COMP CLIMATION',
  'REMOVE SYSTEM CONFIGURATION',
  'CHECKSUM ...................... OK',
  'RUN SYSTEM TOOL',
]

type Stage = 'bar' | 'rings'

export function Boot() {
  const phase = useStore((s) => s.phase)
  const reduced = useReducedMotion()
  const [t, setT] = useState(0)

  // A single clock: elapsed milliseconds since the boot phase began. Every
  // stage reads from it, so nothing can drift out of step with anything else.
  //
  // Driven by setInterval over wall-clock time, NOT requestAnimationFrame —
  // rAF is throttled to a crawl (and paused outright) whenever the tab is not
  // the focused one, which froze the sequence on its first beat. An interval
  // reading Date.now advances by real elapsed time whatever the browser does
  // with its frame budget: throttling can cost smoothness, never correctness.
  useEffect(() => {
    if (phase !== 'boot') {
      setT(0)
      return
    }
    const start = Date.now()
    setT(0)
    const id = setInterval(() => setT(Date.now() - start), 50)
    return () => clearInterval(id)
  }, [phase])

  if (phase !== 'boot') return null

  const stage: Stage = t >= T.rings ? 'rings' : 'bar'

  const logShown = Math.min(LOG.length, Math.floor((t / T.rings) * (LOG.length + 1)))
  const barPct = Math.min(1, t / (T.rings - 300))

  return (
    <AnimatePresence>
      <motion.div
        className="boot"
        initial={{ opacity: 1 }}
        exit={{ opacity: 0, filter: 'blur(10px)' }}
        transition={{ duration: 0.8 }}
      >
        {/* ---- beat 1: the status bar, dimming once its work is done ---- */}
        <div className={`boot-bar ${stage !== 'bar' ? 'boot-bar-dim' : ''}`}>
          <div className="boot-bar-frame">
            <span className="boot-bar-title">
              INITIATING SYSTEM 1<span className="boot-dots">…</span>
              <span className="boot-cursor" />
            </span>
            <div className="boot-seg">
              {Array.from({ length: 22 }, (_, i) => (
                <span
                  key={i}
                  className="boot-seg-cell"
                  data-on={i / 22 < barPct ? '1' : '0'}
                />
              ))}
            </div>
          </div>
          <div className="boot-log">
            {LOG.slice(0, logShown).map((l) => (
              <div key={l} className="boot-log-line">
                {l}
              </div>
            ))}
          </div>
        </div>

        {/* ---- beat 2: the centre stage ---- */}
        <div className="boot-stage">
          {stage === 'rings' && <Rings reduced={!!reduced} />}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

/* ------------------------------------------------------------------ beat 2 */

/** Concentric reticle rings drawing inward, with the name resolving last. */
function Rings({ reduced }: { reduced: boolean }) {
  const ease = 'easeOut'
  const ring = (r: number, delay: number, dash: string, w = 1) => (
    <motion.circle
      cx="0"
      cy="0"
      r={r}
      className="boot-ring"
      strokeDasharray={dash}
      strokeWidth={w}
      initial={reduced ? { opacity: 1 } : { opacity: 0, rotate: -40, scale: 1.15 }}
      animate={{ opacity: 1, rotate: 0, scale: 1 }}
      transition={{ duration: 0.7, delay, ease }}
    />
  )
  return (
    <svg className="boot-rings" viewBox="-160 -160 320 320">
      <g>
        {ring(150, 0.0, '3 6')}
        {ring(128, 0.08, '40 8 12 8', 1.4)}
        {ring(104, 0.16, '2 4')}
        {ring(84, 0.24, '30 6 6 6', 1.6)}
        {ring(60, 0.34, '1 3')}
      </g>
      <motion.text
        x="0"
        y="6"
        className="boot-name"
        initial={reduced ? { opacity: 1 } : { opacity: 0, letterSpacing: '1.4em' }}
        animate={{ opacity: 1, letterSpacing: '0.42em' }}
        transition={{ duration: 0.7, delay: 0.5, ease }}
      >
        {IDENTITY.wordmark.replace(/\.$/, '')}
      </motion.text>
    </svg>
  )
}
