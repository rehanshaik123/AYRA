import { IDENTITY } from '../identity'

/**
 * The wake phrase — "Hey AYRA" — built from config/identity.json.
 *
 * One module because three places need exactly the same idea of the name: the
 * voice loop listening for it, and App deciding whether an utterance is only a
 * vocative or a command with the name in front. Upstream kept two hand-written
 * copies of the list, and a mishearing added to one but not the other woke the
 * assistant and then sent the misheard name on to the model as a question.
 *
 * The alternates are not padding. A dictation model does not know the name, so
 * a clear "Hey AYRA" comes back as Aira, Eyra, Ira or Era. Better a rare false
 * wake than a name that does not answer. They come in two strengths:
 *
 *   names         — distinctive enough to wake on their own ("Ayra, …").
 *   prefixedOnly  — ordinary words or common names ("era", "aria", "Ira") that
 *                   only count after a greeting, so "the era of AI" or a friend
 *                   called Ira never wakes anything.
 *
 * A comma is allowed after the greeting because server-side transcribers
 * punctuate ("Hey, Ayra."), and the negative lookahead keeps possessives
 * ("Ayra's settings") from waking it.
 */

const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const either = (words: readonly string[]) => words.map(escape).join('|')

const GREETING = '(?:hey|hi|ok|okay|yo)'
const STRONG = either(IDENTITY.wake.names)
const WEAK = either(IDENTITY.wake.prefixedOnly)

/** The name as spoken to the assistant, greeting included when there is one. */
const NAME = WEAK
  ? `(?:${GREETING}?[\\s,]*(?:${STRONG})|${GREETING}[\\s,]*(?:${WEAK}))`
  : `${GREETING}?[\\s,]*(?:${STRONG})`

/** Anywhere in a transcript: the trigger. */
export const WAKE = new RegExp(`\\b${NAME}\\b(?!'s)`, 'i')

/** The whole utterance is only the name — "Ayra", "hey ayra" — nothing asked. */
export const BARE_NAME = new RegExp(`^${NAME}[\\s,.!?]*$`, 'i')

/** The name in front of a real command: "Ayra, what's the weather". */
export const LEADING_NAME = new RegExp(`^${NAME}\\b[\\s,.:!?-]*`, 'i')

/**
 * A sentence ABOUT someone with a name like hers, not TO her: "Ira went to the
 * market yesterday", "AYRA said she'd call". Measured 2026-10-11: the offline
 * spotter woke on that "Ira", and the transcriber — told to spell her name
 * AYRA — wrote "AYRA went to the market yesterday", so a name check alone let
 * it through and she answered a stranger's sentence.
 */
const NARRATIVE =
  /^(?:went|came|said|says|told|tells|was|were|had|has been|lives|lived|works|worked|got|gets|and|or|but|who|whose|whom|which|herself|himself)\b/i

/**
 * Hands-free: the words that came back after the spotter fired are spoken TO
 * her — the bare name, a greeting before it ("hey AYRA"), a pause after it
 * ("AYRA, …"), or a command or question after it — rather than a sentence
 * about someone of that name.
 */
export function addressed(text: string): boolean {
  const m = WAKE.exec(text)
  if (!m) return false
  if (BARE_NAME.test(text.slice(m.index))) return true
  if (/^\s*(?:hey|hi|ok|okay|yo)\b/i.test(m[0])) return true
  if (/^\s*[,.:;!?-]/.test(text.slice(m.index + m[0].length))) return true
  return !NARRATIVE.test(afterWake(text))
}

/** Everything after the wake phrase, which is usually the actual command. */
export function afterWake(text: string): string {
  const m = WAKE.exec(text)
  if (!m) return ''
  return text
    .slice(m.index + m[0].length)
    .replace(/^[\s,.:;!?-]+/, '')
    .trim()
}
