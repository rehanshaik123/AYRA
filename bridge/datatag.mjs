/**
 * The data card, written at the end of her answer instead of called as a tool.
 *
 * Why (R.8, measured 2026-10-12): told to speak first and then call
 * `show_data`, the model still drew the card first — the tool call is the
 * first thing it writes, then the card, then a second model turn to say the
 * answer. The weather question's first word came at 14.5 s, 2.6 s after its
 * card. Written as text at the END of the same message — `<data>{…}</data>` —
 * the spoken answer streams first by construction and there is no second
 * turn. This filter sits on the text stream in the bridge: it passes the
 * spoken words through, holds back anything that might be the start of the
 * tag, and hands the tag's JSON to the card instead of to the voice.
 */

export const OPEN = '<data>'
export const CLOSE = '</data>'

/** Any data tag in a finished text, closed or not — for the done frame and the transcript. */
export const stripTags = (text) =>
  String(text ?? '').replace(/<data>[\s\S]*?(?:<\/data>|$)/g, '').replace(/[ \t]+\n/g, '\n').trim()

/** How much of `s`'s end could be the start of `tag` ("<da" for "<data>"). */
function partialEnd(s, tag) {
  for (let n = Math.min(tag.length - 1, s.length); n > 0; n--) {
    if (tag.startsWith(s.slice(-n))) return n
  }
  return 0
}

/**
 * One turn's text stream.
 *
 * @param {(json: string) => void} onCard — the text between the tags, once it closes
 * @returns {{ push: (delta: string) => string, end: () => string }}
 *   push — the part of this delta that may be spoken now
 *   end  — whatever was held back at the end of the turn (never a tag)
 */
export function createTagFilter(onCard) {
  let held = ''
  let inTag = false
  let card = ''

  return {
    push(delta) {
      let s = held + String(delta ?? '')
      held = ''
      let out = ''
      while (s) {
        if (inTag) {
          const close = s.indexOf(CLOSE)
          if (close < 0) {
            // Keep a possible half of "</data>" with the card so it is found next time.
            const keep = partialEnd(s, CLOSE)
            card += s.slice(0, s.length - keep)
            held = s.slice(s.length - keep)
            return out
          }
          card += s.slice(0, close)
          inTag = false
          try {
            onCard(card.trim())
          } catch {
            /* a bad card is the card's problem, never the voice's */
          }
          card = ''
          s = s.slice(close + CLOSE.length)
          continue
        }
        const open = s.indexOf(OPEN)
        if (open >= 0) {
          out += s.slice(0, open)
          inTag = true
          s = s.slice(open + OPEN.length)
          continue
        }
        const keep = partialEnd(s, OPEN)
        out += s.slice(0, s.length - keep)
        held = s.slice(s.length - keep)
        break
      }
      return out
    },
    end() {
      // An unclosed tag is dropped, never spoken; a held "<da" that never became one was words.
      const rest = inTag ? '' : held
      held = ''
      inTag = false
      card = ''
      return rest
    },
  }
}

/** The tag's JSON as show_data's arguments, or null when it isn't an object. */
export function parseCard(json) {
  try {
    const v = JSON.parse(String(json ?? '').replace(/^```(?:json)?\s*|\s*```$/g, ''))
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null
  } catch {
    return null
  }
}
