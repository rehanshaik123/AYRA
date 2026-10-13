/**
 * How much of her answer is said out loud.
 *
 * The owner, 2026-10-13: "she's dictating each and every word … I don't want
 * her to repeat long stuff. If there are tasks I give her, I only need minimum
 * info of status, progress and anything that needs my attention. Explain in
 * depth only when I ask her questions." Everything she writes still appears in
 * her log on screen; only what is SPOKEN is cut:
 *
 *   <more>…</more>  details she wrote for the screen (steps, lists, figures):
 *                   shown in her log, never spoken
 *   the cap         for a task (anything that isn't a question), at most
 *                   TASK_SENTENCES are spoken; the rest goes to the log and she
 *                   says, once, that it is on screen
 *
 * A question — the owner's words end with "?" or open with what / why / how /
 * explain / tell me … — has no cap: an answer they asked for is theirs to hear.
 *
 * Frames out are `{ text, quiet }`: quiet text is shown, not spoken (the face's
 * `text` frame carries `quiet: true`). Runs on the stream after datatag.mjs.
 */

import { bare } from './fastpath.mjs'

export const MORE_OPEN = '<more>'
export const MORE_CLOSE = '</more>'
/** Spoken sentences for a task before the rest goes to the screen. */
export const TASK_SENTENCES = 2
/** …or this many characters, whichever comes first (one very long sentence). */
export const TASK_CHARS = 320
/** Said once when a task's answer was cut short. */
export const REST_ON_SCREEN = ' The rest is on screen.'

const QUESTION =
  /^(?:what|what's|whats|why|how|how's|who|who's|whom|whose|when|where|which|is|are|am|was|were|do|does|did|can|could|should|would|will|shall|may|might|have|has|had|explain|tell me|describe|teach me|walk me through|compare|define|what if)\b/i

/**
 * Is this, in the owner's own words, a question — or a request to explain?
 * Anything else is a task, and she reports on it in a line.
 */
export function isQuestion(words) {
  const said = bare(words)
  return /\?\s*$/.test(String(words ?? '').trim()) || QUESTION.test(said)
}

/** <more> tags in a finished text: the tags go, their words stay — for the done frame and the log. */
export const unwrapMore = (text) => String(text ?? '').replace(/<\/?more>/g, '')

/** How much of `s`'s end could be the start of `tag`. */
function partialEnd(s, tag) {
  for (let n = Math.min(tag.length - 1, s.length); n > 0; n--) {
    if (tag.startsWith(s.slice(-n))) return n
  }
  return 0
}

/** Sentence ends in spoken text: a full stop, ! or ? (a closing quote allowed) then a space. */
const ENDS = /[.!?]["'”’)\]]?\s/g

/**
 * One turn's text stream, after the data tag is gone.
 *
 * @param {{ question?: boolean }} [options] — question: the owner asked, so nothing is capped
 * @returns {{ push: (delta: string) => { text: string, quiet: boolean }[], end: () => { text: string, quiet: boolean }[] }}
 */
export function createSpokenFilter({ question = false } = {}) {
  let held = ''
  let inMore = false
  let spoken = ''
  let sentences = 0
  let capped = false
  let told = false

  /** Spoken text, unless the task's cap has been reached — then shown only. */
  const say = (text, out) => {
    if (!text) return
    if (capped) {
      quietRest(text, out)
      return
    }
    if (question) {
      out.push({ text, quiet: false })
      return
    }
    // Cut at the end of the TASK_SENTENCES-th sentence, or at TASK_CHARS. The
    // last two spoken characters ride along, so an end split across two
    // deltas ("done." + " Next") is still seen — and never counted twice.
    let cut = -1
    const prev = spoken.slice(-2)
    const scan = prev + text
    ENDS.lastIndex = 0
    let m
    while ((m = ENDS.exec(scan))) {
      const at = m.index + m[0].length - prev.length
      if (at <= 0) continue
      sentences++
      if (sentences >= TASK_SENTENCES) {
        cut = at
        break
      }
    }
    if (cut < 0 && spoken.length + text.length > TASK_CHARS) {
      const room = Math.max(0, TASK_CHARS - spoken.length)
      const space = text.lastIndexOf(' ', room)
      cut = space > 0 ? space + 1 : room
    }
    if (cut < 0) {
      spoken += text
      out.push({ text, quiet: false })
      return
    }
    const head = text.slice(0, cut)
    const rest = text.slice(cut)
    spoken += head
    if (head) out.push({ text: head, quiet: false })
    capped = true
    if (rest) quietRest(rest, out)
  }

  /** The first words past the cap: she says, once, that the rest is on screen. */
  const quietRest = (text, out) => {
    if (!told && text.trim()) {
      told = true
      out.push({ text: REST_ON_SCREEN.trimStart(), quiet: false, note: true })
    }
    out.push({ text, quiet: true })
  }

  return {
    push(delta) {
      let s = held + String(delta ?? '')
      held = ''
      const out = []
      while (s) {
        if (inMore) {
          const close = s.indexOf(MORE_CLOSE)
          if (close < 0) {
            const keep = partialEnd(s, MORE_CLOSE)
            if (s.length > keep) out.push({ text: s.slice(0, s.length - keep), quiet: true })
            held = s.slice(s.length - keep)
            return out
          }
          if (close > 0) out.push({ text: s.slice(0, close), quiet: true })
          inMore = false
          s = s.slice(close + MORE_CLOSE.length)
          continue
        }
        const open = s.indexOf(MORE_OPEN)
        if (open >= 0) {
          say(s.slice(0, open), out)
          inMore = true
          s = s.slice(open + MORE_OPEN.length)
          continue
        }
        const keep = partialEnd(s, MORE_OPEN)
        say(s.slice(0, s.length - keep), out)
        held = s.slice(s.length - keep)
        break
      }
      // Once the cap has spoken its note, everything after is the screen's.
      return out.map(({ text, quiet }) => ({ text, quiet }))
    },
    end() {
      const out = []
      const rest = held
      held = ''
      if (rest) {
        if (inMore) out.push({ text: rest, quiet: true })
        else say(rest, out)
      }
      inMore = false
      return out.map(({ text, quiet }) => ({ text, quiet }))
    },
  }
}
