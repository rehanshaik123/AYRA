import { useEffect, useRef, useState, type ReactNode } from 'react'
import './avatar.css'
import { useStore, accentFor } from '../store'
import { type Look, poseFor, mouthOpen, nextBlinkMs, poseOverride, LOOKS, OOPS_FOR_MS, type Pose } from '../lib/avatar'

/**
 * AYRA's avatar face — the light alternative to the 3D reactor (F switches).
 *
 * A chibi girl drawn in the style of Orihime Inoue from Bleach, at the owner's
 * request: long orange hair, blue flower hairpins, the beige school blazer with
 * a red bow. Fan art for the owner's personal use — replace it before any public
 * or commercial use, like the upstream audio tracks.
 *
 * Why it is cheap: one static SVG. What she is doing lives in a single
 * `data-pose` attribute and CSS does the rest — showing the right arm, eyes and
 * mouth, and animating them with transforms. The only per-frame work is two CSS
 * variables (voice level for the halo, mouth opening for lip-sync), written
 * straight onto the element from a store subscription, so React doesn't
 * re-render sixty times a second. No WebGL, no canvas.
 */

type P = readonly [number, number]

/** A tapered sleeve from the bottom of the frame to the wrist, bulging a little at the elbow. */
function sleeve(base: P, wrist: P, wb = 50, ww = 27): string {
  const dx = wrist[0] - base[0]
  const dy = wrist[1] - base[1]
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const at = (q: P, s: number) => `${(q[0] + nx * s).toFixed(1)},${(q[1] + ny * s).toFixed(1)}`
  const mid: P = [base[0] + dx * 0.5, base[1] + dy * 0.5]
  const bulge = (wb + ww) / 4 + 4
  return `M${at(base, wb / 2)} Q${at(mid, bulge)} ${at(wrist, ww / 2)} L${at(wrist, -ww / 2)} Q${at(mid, -bulge)} ${at(base, -wb / 2)} Z`
}

/** The white shirt cuff showing at the end of the sleeve. */
function cuff(base: P, wrist: P, ww = 27): string {
  const dx = wrist[0] - base[0]
  const dy = wrist[1] - base[1]
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const nx = -uy
  const ny = ux
  const h = ww / 2 + 1.5
  const back: P = [wrist[0] - ux * 9, wrist[1] - uy * 9]
  const pt = (q: P, s: number) => `${(q[0] + nx * s).toFixed(1)},${(q[1] + ny * s).toFixed(1)}`
  return `M${pt(back, h)} L${pt(wrist, h - 1)} L${pt(wrist, -h + 1)} L${pt(back, -h)} Z`
}

/** Hands in local coordinates: the wrist at 0,0, fingers pointing up. */
const HANDS: Record<'open' | 'point' | 'fist', ReactNode> = {
  open: (
    <>
      <path className="av-skin" d="M-11.5,2 C-14.5,-10 -15.5,-26 -10.5,-36 C-6,-45 6,-45 10.5,-36 C15.5,-26 14.5,-10 11.5,2 Z" />
      <path className="av-skin" d="M-11,-12 C-19,-14 -24,-23 -20,-27 C-16,-30 -12,-24 -9.5,-19 Z" />
      <path className="av-line" d="M-4,-41 L-4,-29 M3,-42 L3,-29 M9,-37 L8.5,-28" />
    </>
  ),
  point: (
    <>
      <path className="av-skin" d="M2,-20 C0.5,-29 0.5,-40 4,-45 C7,-48 11,-46 11,-41 C11,-33 10,-26 9,-20 Z" />
      <path className="av-skin" d="M-11,2 C-14,-6 -14,-18 -9,-22 C-4,-25 9,-25 12,-20 C15,-12 14,-4 11,2 Z" />
      <path className="av-line" d="M-6,-21 C-7,-15 -7,-10 -5,-6 M0,-22 C-1,-16 -1,-10 0,-6" />
    </>
  ),
  fist: (
    <>
      <path className="av-skin" d="M-11,2 C-14,-6 -14,-18 -9,-22 C-4,-25 9,-25 12,-20 C15,-12 14,-4 11,2 Z" />
      <path className="av-line" d="M-6,-21 C-7,-15 -7,-10 -5,-6 M0,-22 C-1,-16 -1,-10 0,-6 M6,-21 C5,-15 5,-10 6,-6" />
    </>
  ),
}

function Arm({ name, active, base, wrist, angle, hand, children }: {
  name: string; active: boolean; base: P; wrist: P; angle: number; hand: keyof typeof HANDS; children?: ReactNode
}) {
  return (
    <g className={`av-arm av-arm-${name}${active ? ' on' : ''}`}>
      <path className="av-sleeve" d={sleeve(base, wrist)} />
      <path className="av-cuff" d={cuff(base, wrist)} />
      <g transform={`translate(${wrist[0]} ${wrist[1]}) rotate(${angle})`}>
        <g className="av-hand">{HANDS[hand]}</g>
      </g>
      {children}
    </g>
  )
}

/** One open eye. `side` is -1 for the eye on the viewer's left, 1 for the right. */
function Eye({ cx, cy, side }: { cx: number; cy: number; side: 1 | -1 }) {
  const o = side // the outer corner is on this side
  return (
    <g className="av-eye" style={{ transformOrigin: `${cx}px ${cy + 4}px` }}>
      <ellipse cx={cx} cy={cy + 3} rx={18.5} ry={21} fill="#fff" />
      <g className="av-iris">
        <ellipse cx={cx} cy={cy + 5} rx={14.5} ry={18.5} fill="url(#av-iris)" />
        <ellipse cx={cx} cy={cy + 7} rx={6.8} ry={9.5} fill="#2a120a" />
        <circle className="av-shine" cx={cx - 5 * o} cy={cy - 3} r={5.6} fill="#fff" />
        <circle cx={cx + 5 * o} cy={cy + 13} r={2.4} fill="#fff" opacity={0.9} />
      </g>
      <path
        className="av-lash"
        d={`M${cx - 20 * o},${cy - 3} Q${cx - 4 * o},${cy - 27} ${cx + 21 * o},${cy - 8} L${cx + 26 * o},${cy - 14} Q${cx + 23 * o},${cy - 3} ${cx + 19 * o},${cy} Q${cx - 2 * o},${cy - 21} ${cx - 18 * o},${cy + 1} Z`}
      />
      <path className="av-lower" d={`M${cx - 11 * o},${cy + 24.5} Q${cx},${cy + 27} ${cx + 12 * o},${cy + 23}`} />
    </g>
  )
}

/** A four-pointed twinkle. */
const Sparkle = ({ x, y, s = 1, d = 0 }: { x: number; y: number; s?: number; d?: number }) => (
  <path
    className="av-sparkle"
    style={{ animationDelay: `${d}s`, transformOrigin: `${x}px ${y}px` }}
    d={`M${x},${y - 9 * s} Q${x + 1.5 * s},${y - 1.5 * s} ${x + 9 * s},${y} Q${x + 1.5 * s},${y + 1.5 * s} ${x},${y + 9 * s} Q${x - 1.5 * s},${y + 1.5 * s} ${x - 9 * s},${y} Q${x - 1.5 * s},${y - 1.5 * s} ${x},${y - 9 * s} Z`}
  />
)

/** Her flower hairpin: six blue petals. */
function Hairpin({ x, y }: { x: number; y: number }) {
  return (
    <g className="av-pin" style={{ transformOrigin: `${x}px ${y}px` }}>
      <circle className="av-pin-glow" cx={x} cy={y} r={24} fill="url(#av-glow)" />
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <ellipse key={a} cx={x} cy={y - 7.5} rx={4.6} ry={7.2} transform={`rotate(${a} ${x} ${y})`} className="av-petal" />
      ))}
      <circle cx={x} cy={y} r={3.6} fill="#eafaff" />
    </g>
  )
}

const LEFT_EYE = { cx: 163, cy: 190 }
const RIGHT_EYE = { cx: 237, cy: 190 }

export function Avatar() {
  const phase = useStore((s) => s.phase)
  const error = useStore((s) => s.error)
  const accent = useStore((s) => accentFor(s.phase, s.ui))
  const root = useRef<HTMLDivElement>(null)
  const [blink, setBlink] = useState(false)
  const [oops, setOops] = useState(false)
  const [idleMs, setIdleMs] = useState(0)
  const [preview] = useState(() => poseOverride(window.location.search))

  // Voice level → halo and mouth, written straight onto the element: no re-render per frame.
  useEffect(() => {
    const el = root.current
    if (!el) return
    let last = -1
    return useStore.subscribe((s) => {
      const lvl = Math.round(s.level * 20) / 20
      const mouth = s.phase === 'speaking' ? mouthOpen(s.level) : 0
      const key = lvl * 10 + mouth
      if (key === last) return
      last = key
      el.style.setProperty('--lvl', String(lvl))
      el.style.setProperty('--mouth', String(mouth))
    })
  }, [])

  // Blinking, at irregular human intervals.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const loop = () => {
      t = setTimeout(() => {
        setBlink(true)
        t = setTimeout(() => {
          setBlink(false)
          loop()
        }, 140)
      }, nextBlinkMs(Math.random()))
    }
    loop()
    return () => clearTimeout(t)
  }, [])

  // A new error earns a worried look for a few seconds, not for the rest of the session.
  useEffect(() => {
    if (!error) return
    setOops(true)
    const t = setTimeout(() => setOops(false), OOPS_FOR_MS)
    return () => clearTimeout(t)
  }, [error])

  // How long she has been standing by — after a while she gets peckish.
  useEffect(() => {
    if (phase !== 'dormant') {
      setIdleMs(0)
      return
    }
    const since = Date.now()
    const t = setInterval(() => setIdleMs(Date.now() - since), 1000)
    return () => clearInterval(t)
  }, [phase])

  const pose: Pose = preview ?? poseFor(phase, { oops, idleMs })
  const look = LOOKS[pose]
  const on = (yes: boolean) => (yes ? ' on' : '')
  const arm = (name: string) => look.arms.includes(name)
  const fx = (name: string) => `av-fx av-fx-${name}${on(look.fx.includes(name))}`
  const mouth = (name: Look['mouth']) => `av-m av-m-${name}${on(look.mouth === name)}`

  return (
    <div
      ref={root}
      className="avatar"
      data-pose={pose}
      data-blink={blink ? '1' : '0'}
      style={{ ['--av-accent' as string]: accent }}
      aria-hidden="true"
    >
      <div className="avatar-stage">
        <div className="avatar-halo" />
        <div className="avatar-figure">
          <svg className="avatar-svg" viewBox="0 0 400 440">
            <defs>
              <linearGradient id="av-hair" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#f2833c" />
                <stop offset="1" stopColor="#d9561f" />
              </linearGradient>
              <linearGradient id="av-hair-back" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#d65a22" />
                <stop offset="1" stopColor="#a8401a" />
              </linearGradient>
              <linearGradient id="av-iris" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#4a1f10" />
                <stop offset="0.55" stopColor="#8a4424" />
                <stop offset="1" stopColor="#d48a4c" />
              </linearGradient>
              <radialGradient id="av-glow">
                <stop offset="0" stopColor="#bfeeff" stopOpacity="0.95" />
                <stop offset="1" stopColor="#5fc8f5" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="av-orb">
                <stop offset="0" stopColor="#fffbe8" stopOpacity="1" />
                <stop offset="0.35" stopColor="#ffd36e" stopOpacity="0.85" />
                <stop offset="1" stopColor="#ff9a3c" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Behind everything: the long back hair, tilting with the head. */}
            <g className="av-tilt">
              <path
                fill="url(#av-hair-back)"
                d="M86,176 C70,250 64,340 58,440 L342,440 C336,340 330,250 314,176 C304,108 262,60 200,60 C138,60 96,108 86,176 Z"
              />
            </g>

            {/* Neck, blazer, shirt and bow. */}
            <path className="av-skin-plain" d="M185,252 L185,312 Q200,322 215,312 L215,252 Z" />
            <path fill="#f0c3ac" d="M185,262 Q200,282 215,262 L215,276 Q200,292 185,276 Z" />
            <path
              className="av-blazer"
              d="M48,440 C56,372 104,336 158,322 L200,340 L242,322 C296,336 344,372 352,440 Z"
            />
            <path fill="#ffffff" d="M168,312 L200,352 L232,312 L224,306 L200,338 L176,306 Z" />
            <path className="av-seam" d="M158,322 L184,362 L176,440 M242,322 L216,362 L224,440" />
            <g>
              <path fill="#d22b3e" stroke="#9c1427" strokeWidth="1.4" d="M200,333 L178,322 L180,346 Z" />
              <path fill="#d22b3e" stroke="#9c1427" strokeWidth="1.4" d="M200,333 L222,322 L220,346 Z" />
              <path fill="#d22b3e" stroke="#9c1427" strokeWidth="1.2" d="M197,336 L190,360 L198,354 Z M203,336 L210,360 L202,354 Z" />
              <circle cx="200" cy="333.5" r="5.5" fill="#e23b4f" stroke="#9c1427" strokeWidth="1.2" />
            </g>

            {/* The head, tilting as one piece. */}
            <g className="av-tilt av-head">
              <path
                className="av-face"
                d="M118,150 C118,100 155,78 200,78 C245,78 282,100 282,150 C282,204 268,234 240,255 C226,265 213,271 200,271 C187,271 174,265 160,255 C132,234 118,204 118,150 Z"
              />
              <ellipse className="av-blush" cx="150" cy="231" rx="17" ry="8" />
              <ellipse className="av-blush" cx="250" cy="231" rx="17" ry="8" />

              <g className={`av-e-open${on(look.eyes === 'open')}`}>
                <Eye {...LEFT_EYE} side={-1} />
                <Eye {...RIGHT_EYE} side={1} />
              </g>
              <g className={`av-e-happy av-stroke-eye${on(look.eyes === 'happy')}`}>
                <path d="M148,200 Q163,180 178,200" />
                <path d="M222,200 Q237,180 252,200" />
              </g>
              <g className={`av-e-closed av-stroke-eye${on(look.eyes === 'closed')}`}>
                <path d="M148,194 Q163,206 178,194" />
                <path d="M222,194 Q237,206 252,194" />
              </g>

              <path className="av-nose" d="M200,219 Q203,224 199,226" />

              <path className={mouth('smile')} d="M188,243 Q200,253 212,243" />
              <g className={mouth('talk')}>
                <path fill="#8a2b2b" d="M187,242 Q200,239 213,242 Q212,261 200,262 Q188,261 187,242 Z" />
                <path fill="#ec7f80" d="M192,255 Q200,250 208,255 Q200,261 192,255 Z" />
              </g>
              <ellipse className={mouth('o')} cx="203" cy="247" rx="5" ry="6" fill="#8a2b2b" />
              <g className={mouth('grin')}>
                <path fill="#8a2b2b" d="M184,240 Q200,267 216,240 Z" />
                <path fill="#ec7f80" d="M191,252 Q200,247 209,252 Q200,260 191,252 Z" />
              </g>
              <path className={mouth('nom')} d="M190,247 q5,-5 10,0 q5,-5 10,0" />
              <path className={mouth('worried')} d="M189,250 Q200,242 211,250" />
              <path className={mouth('sleep')} d="M195,248 Q200,252 205,248" />

              {/* Hair over the face: bangs, the two long locks that frame it, a shine. */}
              <path
                fill="url(#av-hair)"
                d="M104,180 C96,112 140,54 200,54 C262,54 306,110 296,180 C292,160 286,146 278,136 C282,154 280,166 274,177 C270,150 260,132 246,120 C252,142 248,158 240,169 C236,144 224,124 210,112 C212,132 206,148 196,159 C194,136 186,120 174,110 C168,130 160,144 146,155 C150,139 150,129 146,121 C134,135 124,152 116,172 Z"
              />
              <path
                fill="url(#av-hair)"
                d="M114,124 C98,170 90,240 94,300 C96,332 102,352 112,366 C116,334 117,300 121,262 C125,222 130,184 136,150 Z"
              />
              <path
                fill="url(#av-hair)"
                d="M286,124 C302,170 310,240 306,300 C304,332 298,352 288,366 C284,334 283,300 279,262 C275,222 270,184 264,150 Z"
              />
              <path className="av-shine-hair" d="M140,96 Q200,72 260,96" />
              <path className="av-shine-hair thin" d="M112,200 Q106,250 110,300 M290,200 Q296,250 291,300" />

              <path className="av-brow av-brow-l" d="M146,156 Q162,149 178,155" />
              <path className="av-brow av-brow-r" d="M222,155 Q238,149 254,156" />

              <Hairpin x={134} y={134} />
              <Hairpin x={266} y={134} />

              {/* Little extras that come and go with the pose. */}
              <path className={fx('sweat')} d="M281,146 C275,158 275,166 281,168 C287,166 287,158 281,146 Z" />
              <g className={fx('dots')}>
                <circle cx="292" cy="112" r="4" />
                <circle cx="308" cy="94" r="6" />
                <circle cx="330" cy="76" r="9" />
              </g>
              <g className={fx('zzz')}>
                <text x="276" y="112">z</text>
                <text x="296" y="88">z</text>
                <text x="320" y="62">Z</text>
              </g>
              <g className={fx('ear')}>
                <path d="M338,172 Q348,190 338,208" />
                <path d="M350,162 Q364,190 350,218" />
              </g>
            </g>

            <g className={fx('sparkles')}>
              <Sparkle x={70} y={150} s={1.2} />
              <Sparkle x={334} y={128} s={0.9} d={0.5} />
              <Sparkle x={318} y={260} s={0.7} d={1} />
              <Sparkle x={86} y={286} s={0.8} d={1.4} />
            </g>
            <g className={fx('orb')}>
              <circle cx="200" cy="318" r="34" fill="url(#av-orb)" />
              <circle cx="200" cy="318" r="8" fill="#fffdf2" />
            </g>

            {/* Arms, one set per gesture; CSS shows the one that fits the pose. */}
            <Arm name="wave" active={arm('wave')} base={[52, 440]} wrist={[92, 252]} angle={-12} hand="open" />
            <Arm name="listen" active={arm('listen')} base={[350, 440]} wrist={[316, 240]} angle={16} hand="open" />
            <Arm name="think" active={arm('think')} base={[300, 440]} wrist={[232, 312]} angle={-25} hand="point" />
            <Arm name="talk" active={arm('talk')} base={[346, 440]} wrist={[302, 336]} angle={18} hand="open" />
            <Arm name="magic-l" active={arm('magic-l')} base={[70, 440]} wrist={[130, 372]} angle={-30} hand="open" />
            <Arm name="magic-r" active={arm('magic-r')} base={[330, 440]} wrist={[270, 372]} angle={30} hand="open" />
            <Arm name="snack" active={arm('snack')} base={[300, 440]} wrist={[250, 292]} angle={-40} hand="fist">
              <g className="av-bread" transform="translate(205 251) rotate(-8)">
                <path d="M-34,-6 C-36,-18 -20,-24 0,-22 C22,-24 38,-16 34,-4 C32,8 18,11 0,9 C-20,11 -34,8 -34,-6 Z" />
                <circle cx="-14" cy="-8" r="2.6" />
                <circle cx="4" cy="-12" r="2.2" />
                <circle cx="18" cy="-5" r="2.6" />
                <circle cx="-2" cy="2" r="2" />
              </g>
            </Arm>
          </svg>
        </div>
      </div>
    </div>
  )
}
