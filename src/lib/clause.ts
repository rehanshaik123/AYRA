/**
 * The first clause of an answer, when it is at least three words and ends on a
 * comma, colon, semicolon or dash ("Ooh, good one: …"). The speaker (tts.ts)
 * says it at once rather than with the rest of its sentence: the voice test
 * (npm run voicetest, 2026-10-20) measured 1.2 s between her first words
 * arriving and her voice starting when the first sentence was long.
 *
 * The first break that qualifies, not the last (lazy); "1,000" is not a clause
 * (no space after the comma). Its own file so it can be tested without a
 * browser (test/tts-clause.test.mjs).
 */
export const FIRST_CLAUSE = /^\s*(?:\S+\s+){2,}?\S*?[,:;—–](?=\s)/
