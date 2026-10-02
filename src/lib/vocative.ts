/**
 * Setting the honorific off with a comma before it is spoken.
 *
 * speechSynthesis ignores SSML, so punctuation is the only prosody control it
 * has, and the small beat a comma buys before "boss" in "On it, boss" is most
 * of what makes it sound like being addressed. Models usually write the comma;
 * this catches the times they don't.
 *
 * Only a vocative counts: the word must end the sentence or the line, and must
 * not follow a determiner or possessive. "Sir Isaac Newton" and "ask your
 * boss" are left alone — "boss", unlike "sir", is an ordinary noun as well.
 */

const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Words that make what follows an ordinary noun rather than a form of address. */
const NOT_BEFORE = 'a|an|the|your|my|his|her|their|our|its|this|that|like'

/** `text` with a comma before each vocative use of `honorific`. */
export function setOffHonorific(text: string, honorific: string): string {
  const h = honorific.trim()
  if (!h) return text
  const vocative = new RegExp(
    `([^,\\s])(?<!\\b(?:${NOT_BEFORE}))\\s+(${escape(h)})(\\s*[.,!?;:]|\\s*$)`,
    'gi',
  )
  return text.replace(vocative, '$1, $2$3')
}
