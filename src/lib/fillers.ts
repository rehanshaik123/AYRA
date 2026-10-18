/**
 * Filler speech.
 *
 * A tool call can take ten seconds, and silence that long reads as a crash. So
 * AYRA says something the instant work starts — then goes quiet until there is
 * an answer. One acknowledgement, no progress chatter.
 *
 * The lines carry AYRA's character — excited, warm, quick — the same voice as
 * the persona in bridge/persona.mjs:
 *
 *   - Short and bright: "On it!", "Ooh, digging in." Never "let me check".
 *   - Eager is fine; padding is not. Every line is a few words at most,
 *     because the answer is what they are waiting for.
 *   - No roasting or flirting here: a filler fires on every tool call, and a
 *     tease that repeats on schedule stops being charming. The persona keeps
 *     those for the right moment.
 *   - The owner's name or title (config/identity.json, empty for none) goes
 *     at the end, and only sometimes. `h()` attaches it when one is
 *     configured and leaves the line bare when not.
 */

import { IDENTITY, withHonorific as h } from '../identity'

const HONORIFIC = IDENTITY.honorific.trim()

/**
 * Said as soon as the first tool fires, before any answer exists. One word now:
 * the owner, 2026-10-18 — "only say yes, done, opened, created". The playful
 * lines ("Ooh, digging in.", "Hunting it down.") were exactly the chatter they
 * asked to lose.
 */
const WORKING = ['Yes.']

/** Acknowledging an order where no tool is involved. */
const ACKNOWLEDGE = [
  h('You got it!'),
  'Done and done.',
  'Ooh, okay!',
  'Consider it handled.',
  h('On it!'),
]

/** Answering to the name, before the user has said what they want. */
const ATTENTION = [
  h('Hey!'),
  // Just their name, bright, when there is a name to say: "Rehan!"
  ...(HONORIFIC ? [`${HONORIFIC[0].toUpperCase()}${HONORIFIC.slice(1)}!`] : []),
  "I'm here!",
  'Hi! What do you need?',
  'Listening!',
]

/**
 * Avoids repeating the same phrase twice running, which is what makes canned
 * lines sound canned. Keeps one slot of history per pool.
 */
function makePicker(pool: string[]) {
  let last = -1
  return () => {
    if (pool.length < 2) return pool[0] ?? ''
    let i = last
    while (i === last) i = Math.floor(Math.random() * pool.length)
    last = i
    return pool[i]
  }
}

export const working = makePicker(WORKING)
export const acknowledge = makePicker(ACKNOWLEDGE)
export const attention = makePicker(ATTENTION)

/**
 * The lines most often said while the owner waits — on a tool, on her name —
 * for the speaker to synthesise once after boot (tts.ts prefetchLines), so
 * they play at once instead of after a round trip.
 */
export const COMMON_LINES: readonly string[] = [...new Set([...WORKING, ...ATTENTION, ...ACKNOWLEDGE])]

/** What she says when a tool starts: the one word, whatever the tool. */
export function forTool(toolName: string): string {
  void toolName
  return working()
}
