/**
 * What the bubble shows (AYRA.exe, on top of every app): her phase and one
 * line — what she heard, or what she is saying. The face reports it to the
 * bridge (`face` frame), which the bubble polls (GET /face).
 *
 * Pure, so what the bubble says can be tested without a window.
 */

import type { Phase, Turn } from '../store'

export type Glance = {
  phase: Phase
  /** One line, the end of it when long: the bubble shows the newest words. */
  text: string
  /** Whose words: 'you' while listening and thinking, 'her' while she answers. */
  who: '' | 'you' | 'her'
  /** How the listening began: her name (the bubble flashes) or a press. */
  by: '' | 'name' | 'press'
}

/** Longest line handed to the bubble; it shows the tail. */
export const GLANCE_MAX = 160

const tail = (s: string) => {
  const one = s.replace(/\s+/g, ' ').trim()
  return one.length > GLANCE_MAX ? `…${one.slice(-(GLANCE_MAX - 1))}` : one
}

/** The last turn of `role`: for her, what she SAID — her log may hold more (bridge/spoken.mjs). */
const last = (turns: Turn[], role: Turn['role']) => {
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i]
    if (t.role === role) return role === 'assistant' && t.said != null ? t.said : t.text
  }
  return ''
}

export function glance(s: { phase: Phase; caption: string; turns: Turn[] }, by: Glance['by'] = ''): Glance {
  const { phase } = s
  if (phase === 'listening' || phase === 'waking') {
    // The level dots ("…") before words arrive are not words.
    const words = s.caption.replace(/^[\s.…]+$/, '')
    return { phase, text: tail(words), who: words ? 'you' : '', by }
  }
  if (phase === 'thinking' || phase === 'tooling') return { phase, text: tail(last(s.turns, 'user')), who: 'you', by: '' }
  if (phase === 'speaking' || phase === 'dormant') {
    // At standby the last answer stays; the bubble lets it fade.
    const said = tail(last(s.turns, 'assistant'))
    return { phase, text: said, who: said ? 'her' : '', by: '' }
  }
  return { phase, text: '', who: '', by: '' }
}

export const sameGlance = (a: Glance | null, b: Glance) =>
  Boolean(a) && a!.phase === b.phase && a!.text === b.text && a!.who === b.who && a!.by === b.by
