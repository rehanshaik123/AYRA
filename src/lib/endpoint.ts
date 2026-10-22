import { IDENTITY } from '../identity'

/**
 * When the owner has finished speaking — read from the words themselves.
 *
 * The voice-activity detector is an energy gate, and energy is a fact about the
 * room rather than about the sentence. It ends a segment after a fixed quiet
 * gap, so "what's the weather in — " *pause* " — London" is two segments. The
 * assembler in voice.ts holds transcripts and asks this module how long to keep
 * waiting for more: 0 means the thought is complete, send it now.
 *
 * Pure, so it can be tested (test/endpoint.test.mjs). Moved out of voice.ts on
 * 2026-10-20, when the voice test (npm run voicetest) caught "What is twelve
 * times … eleven?" being sent as "What is 12 times?": a realtime transcriber
 * puts a full stop or a question mark on every pause, and a question mark was
 * taken as the end however the sentence stopped.
 */

/**
 * Ending on one of these means the sentence is not over, whatever the silence
 * says. Function words only: they are closed-class, so the list is complete in
 * a way a content-word list could never be, and none of them is a plausible
 * last word of a real request.
 */
export const CONTINUES =
  /\b(and|or|but|so|because|since|if|when|while|that|which|who|whose|to|of|in|on|at|by|for|with|from|about|into|onto|over|under|between|through|the|a|an|my|your|his|her|its|our|their|is|are|was|were|be|been|do|does|did|have|has|had|can|could|would|should|will|shall|might|must|like|than|then|as|very|really|just|some|any|all|both|either|neither)$/i

/**
 * Words no sentence ends on — even one the transcriber closed with a question
 * mark. Narrower than CONTINUES on purpose: a question may well end on a
 * preposition ("what is it for?", "who are you talking to?"), but never on an
 * article, a possessive, a joining word or a sum's operator ("what is twelve
 * times?").
 */
export const NEVER_LAST =
  /^(the|a|an|my|your|our|their|and|or|but|because|if|than|times|plus|minus|divided|multiplied|versus|vs)$/i

/** Trailing punctuation a transcriber emits mid-thought. */
export const TRAILS = /[,;:–—\-+*/=&]$/

/**
 * Short words that must always cut through, even when they collide with what
 * she happens to be saying. Suppressing "stop" because she just said "stop"
 * would be the single most infuriating failure the voice loop could have. Also
 * the one- and two-word commands that are complete on their own.
 */
export const OVERRIDE = new RegExp(
  `\\b(stop|wait|cancel|enough|quiet|hold on|shut up|never ?mind|forget it|no|${IDENTITY.wake.names.join('|')})\\b`,
  'i',
)

/**
 * A quiet gap this long with a finished-looking sentence ends the turn.
 *
 * By the time a transcript reaches the assembler the detector has already sat
 * through its silence and the transcriber has taken its own few hundred
 * milliseconds. It was 250 ms; the owner's log (2026-10-18) showed commands
 * cut in the middle — "hey close the Tab with", "calculate me something so
 * 2:30 + 1000 +" — people pause to think mid-command. Space (or Alt+Space,
 * or a click on her figure) still sends at once.
 */
export const SETTLE_MS = 600
/**
 * After a full stop the transcriber added. Not 0: a realtime transcriber puts
 * a full stop on every pause, mid-thought included ("Open YouTube." … "and play
 * lo-fi"). A question mark or an exclamation is taken as the end.
 */
export const STOP_MS = 500
/** ...and this long when the sentence is plainly unfinished ("…the tab with"). */
export const CONTINUE_MS = 2500
/**
 * Nothing is held longer than this in total. A ceiling rather than a timer:
 * without it, someone who ends every clause on "and" could hold a turn open
 * for ever, and the assistant would look like it had stopped listening.
 */
export const MAX_HOLD_MS = 9000

/** The last word, without the punctuation a transcriber hangs on it. */
const lastWord = (words: string[]) => words[words.length - 1].replace(/[.,!?;:"'”’)\]]+$/, '')

/**
 * How long to keep waiting, given what has been said so far.
 * 0 means "this is a complete thought, send it now".
 */
export function holdFor(text: string): number {
  const t = text.trim()
  const words = t.split(/\s+/).filter(Boolean)
  if (!words.length) return CONTINUE_MS
  // "OK." on its own is how a command starts in the minutes after an answer
  // (wake.ts LEADING_OK): the transcriber's full stop on the pause after it
  // must not send it without the command.
  if (/^(?:okay|okey|ok|o\.\s?k)[\s,.!?]*$/i.test(t)) return CONTINUE_MS
  // Stopped on a word no sentence ends on: more is coming, whatever the
  // punctuation says ("What is 12 times?" is a pause, not a question).
  if (NEVER_LAST.test(lastWord(words))) return CONTINUE_MS
  // A question or an exclamation is the speaker telling us they are done.
  if (/[!?]["'”’)\]]?$/.test(t)) return 0
  if (TRAILS.test(t)) return CONTINUE_MS
  if (CONTINUES.test(lastWord(words))) return CONTINUE_MS
  // A full stop the transcriber put on a pause: a short wait for a next clause.
  if (/[.]["'”’)\]]?$/.test(t)) return STOP_MS
  // One or two words is usually the start of something, not the whole of it —
  // except for the short commands that genuinely are complete.
  if (words.length <= 2 && !OVERRIDE.test(t)) return CONTINUE_MS
  return SETTLE_MS
}
