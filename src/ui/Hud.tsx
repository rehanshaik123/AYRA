import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useStore, accentFor, type Phase } from '../store'
import { Suggestions } from './Suggestions'
import { BladeSweep, Blades } from './Blades'
import { IDENTITY } from '../identity'

const statusText: Record<Phase, string> = {
  offline: 'OFFLINE',
  boot: 'INITIALISING',
  dormant: `STANDBY — SAY “HEY ${IDENTITY.name.toUpperCase()}”`,
  waking: 'ONLINE',
  listening: 'LISTENING',
  thinking: 'PROCESSING',
  tooling: 'ACCESSING SYSTEMS',
  speaking: 'RESPONDING',
}

function Corner({ at }: { at: 'tl' | 'tr' | 'bl' | 'br' }) {
  return <div className={`corner corner-${at}`} />
}

/* ------------------------------------------------------------------ decode */

/**
 * The glyphs the ghost is drawn from. Uppercase, digits and rules only: the
 * point is that the unresolved text reads as *machine*, so lowercase letters
 * and anything with a descender are left out — they look like badly rendered
 * words rather than an unfinished decode.
 */
const GLYPHS = '/\\|<>[]{}=+*#%&$0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'

/** Characters of noise shown ahead of the resolved text. */
const GHOST = 22
/** Repaint interval for the scramble. ~24fps is plenty for glyph noise. */
const FRAME_MS = 42
/** Floor on the resolve rate, characters per second. */
const MIN_RATE = 110
/** The frontier is never allowed to trail the streamed text by longer. */
const MAX_LAG_MS = 420

function scramble(s: string, seed: number) {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    // Whitespace is left alone so word shapes and line breaks hold still while
    // the glyphs underneath churn.
    if (c === ' ' || c === '\n' || c === '\t') {
      out += c
      continue
    }
    out += GLYPHS[(seed * 7919 + i * 104729 + c.charCodeAt(0)) % GLYPHS.length]
  }
  return out
}

/**
 * JARVIS's lines, arriving the way a computer would produce them.
 *
 * The hard part is not the effect, it is that the text underneath is *live*.
 * The store appends a token at a time, so this component re-renders dozens of
 * times a second with a slightly longer string, and the naive implementation —
 * scramble the whole thing, resolve it over N milliseconds — restarts the
 * animation on every token and never finishes decoding anything.
 *
 * So the frontier is a ref and only ever moves forward. Everything behind it
 * has settled and is plain text that will never animate again; a short window
 * ahead of it is noise; the rest is present in the DOM but invisible, which
 * keeps the line wrapping identical to the finished paragraph and means the
 * accessibility tree always holds the real sentence. The rate scales with how
 * far behind the frontier has fallen, so a single token drips and a 300
 * character burst clears inside MAX_LAG_MS — the decode must never be the
 * reason the transcript trails the voice.
 *
 * The rAF loop repaints on a 42ms gate rather than every frame, and stops dead
 * the moment the frontier catches up.
 */
function DecodeText({ text }: { text: string }) {
  const reduced = useReducedMotion()
  const settled = useRef(0)
  const raf = useRef(0)
  const latest = useRef(text)
  const [tick, bump] = useState(0)

  useEffect(() => {
    // The running loop reads the length through this ref rather than through
    // its own closure, so a token landing mid-sweep simply extends the target
    // instead of leaving the loop chasing a length that is already stale.
    latest.current = text

    if (reduced) {
      settled.current = text.length
      return
    }
    if (raf.current || settled.current >= text.length) return

    let prev = performance.now()
    let painted = 0

    const step = (now: number) => {
      // Clamped so a backgrounded tab does not resolve the whole answer in one
      // enormous frame the moment it comes back.
      const dt = Math.min(now - prev, 120) / 1000
      prev = now

      const target = latest.current.length
      const rate = Math.max(MIN_RATE, (target - settled.current) / (MAX_LAG_MS / 1000))
      settled.current = Math.min(target, settled.current + rate * dt)

      if (now - painted >= FRAME_MS) {
        painted = now
        bump((n) => n + 1)
      }

      if (settled.current < latest.current.length) {
        raf.current = requestAnimationFrame(step)
      } else {
        raf.current = 0
        bump((n) => n + 1)
      }
    }
    raf.current = requestAnimationFrame(step)
  }, [text, reduced])

  useEffect(
    () => () => {
      if (raf.current) cancelAnimationFrame(raf.current)
      raf.current = 0
    },
    [],
  )

  const n = Math.floor(settled.current)
  if (reduced || n >= text.length) return <>{text}</>

  return (
    <>
      {text.slice(0, n)}
      <span className="decode-ghost">{scramble(text.slice(n, n + GHOST), tick)}</span>
      <span className="decode-veil">{text.slice(n + GHOST)}</span>
    </>
  )
}

/* ------------------------------------------------------------------- meter */

/**
 * The SIGNAL meter, painting itself.
 *
 * It used to read the level through the HUD, which re-rendered the whole HUD —
 * transcript, rails, badges — on every change, up to sixty times a second while
 * the microphone heard anything. Now only these two elements change, written
 * directly, the way the avatar's mouth is.
 */
function Meter() {
  const fill = useRef<HTMLDivElement>(null)
  const pct = useRef<HTMLDivElement>(null)
  useEffect(
    () =>
      useStore.subscribe((s, prev) => {
        if (s.level === prev.level) return
        if (fill.current) fill.current.style.height = `${s.level * 100}%`
        if (pct.current) pct.current.textContent = `${(s.level * 100).toFixed(0).padStart(3, '0')}%`
      }),
    [],
  )
  return (
    <>
      <div className="meter">
        <div className="meter-fill" ref={fill} style={{ height: '0%' }} />
      </div>
      <div className="rail-item mono" ref={pct}>
        000%
      </div>
    </>
  )
}

/* --------------------------------------------------------------------- hud */

export function Hud() {
  const phase = useStore((s) => s.phase)
  const caption = useStore((s) => s.caption)
  const turns = useStore((s) => s.turns)
  const activeTool = useStore((s) => s.activeTool)
  const connected = useStore((s) => s.connected)
  const error = useStore((s) => s.error)
  const voice = useStore((s) => s.voice)

  // One variable on the root carries the phase colour into every .hud-* rule.
  const colour = accentFor(phase)

  return (
    <div className="hud" style={{ ['--accent' as string]: colour }}>
      {/* First in the tree on purpose. Everything after it is positioned with
          `z-index: auto`, so paint order is document order and the sweep stays
          behind the transcript and the panels without a z-index war. */}
      <BladeSweep />

      <Corner at="tl" />
      <Corner at="tr" />
      <Corner at="bl" />
      <Corner at="br" />

      <header className="hud-top">
        <div className="brand">
          <span className="brand-mark">{IDENTITY.wordmark}</span>
          <span className="brand-sub">{IDENTITY.tagline}</span>
        </div>

        <div className="status">
          <span className="dot" />
          <span className="status-text">{statusText[phase]}</span>
        </div>
      </header>

      {/* Left rail: which integrations are live */}
      <aside className="rail rail-left">
        <div className="rail-title">SYSTEMS</div>
        {connected.map((c) => (
          <div key={c} className="rail-item">
            <span className="tick" />
            {c}
          </div>
        ))}
        <div className="rail-item">
          <span className="tick" />
          Web
        </div>
      </aside>

      {/* Right rail: live telemetry, mostly for flavour */}
      <aside className="rail rail-right">
        <div className="rail-title">SIGNAL</div>
        <Meter />
      </aside>

      <AnimatePresence>
        {activeTool && (
          <motion.div
            className="tool-badge"
            // Anchored to the TOP of the frame, not the middle. The old home was
            // viewport-centre plus a fixed drop, which on a tall or square
            // window landed the headline straight on top of the bottom
            // transcript — two elements pinned to different edges of the screen
            // were always going to meet somewhere. Up here it sits in its own
            // band with the rest of the status chrome and can never collide with
            // the log. Framer owns `transform` on an animated element, so the
            // centring (x: -50%) lives in these props, not the stylesheet.
            initial={{ opacity: 0, x: '-50%', y: -8, filter: 'blur(6px)' }}
            animate={{ opacity: 1, x: '-50%', y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, x: '-50%', y: -8, filter: 'blur(6px)' }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
          >
            <span className="tool-kicker">
              <span className="spinner" />
              accessing
            </span>
            <span className="tool-name">{activeTool.replace(/[_-]/g, ' ')}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Conversation log — last few turns, fading upward */}
      <div className="log">
        <AnimatePresence initial={false}>
          {turns.slice(-4).map((t) => (
            <motion.div
              key={t.id}
              className={`log-line log-${t.role}`}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            >
              <span className="log-who">{t.role === 'user' ? 'YOU' : IDENTITY.name}</span>
              {/* Only the assistant's half decodes. What the user said was
                  never transmitted from anywhere — dressing it up as machine
                  output would be a lie about where the words came from. */}
              <span className="log-text">
                {t.role === 'assistant' ? <DecodeText text={t.text} /> : t.text}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {caption && (
          <motion.div
            className="caption"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {caption}
          </motion.div>
        )}
      </AnimatePresence>

      {/* The one surface: everything AYRA shows lands here. */}
      <Blades />

      <Suggestions />

      {error && <div className="error">{error}</div>}

      <footer className="hud-bottom">
        <span className="hint">
          say <b>“hey {IDENTITY.name.toLowerCase()}”</b> · <kbd>Space</kbd> to talk · <kbd>L</kbd> still
          {voice && (
            <>
              {' · '}
              <kbd>V</kbd> voice: {voice.replace(/\(.*?\)/g, '').trim()}
            </>
          )}
        </span>
      </footer>
    </div>
  )
}
