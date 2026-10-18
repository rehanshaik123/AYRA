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
 *   the cap         for a task (anything that isn't a question), only the first
 *                   sentence is spoken — "Done.", "Opened.", or one line about a
 *                   problem; the rest goes to her log, silently (the owner,
 *                   2026-10-18: "only say yes, done, opened, created, and a small
 *                   message if there is some trouble")
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
/** …or this many characters, whichever comes first (one very long sentence). */
export const TASK_CHARS = 320

const QUESTION =
  /^(?:what|what's|whats|why|how|how's|who|who's|whom|whose|when|where|which|is|are|am|was|were|do|does|did|can|could|should|would|will|shall|may|might|have|has|had|explain|tell me|describe|teach me|walk me through|compare|define|what if|find|search|look up|look for|check|research|summari[sz]e|analy[sz]e|list|show me|give me|recommend|suggest|translate|calculate|convert)\b/i

/**
 * A task's report that is more than "done": something went wrong, is missing,
 * waits on the owner, or asks them something. Said as she wrote it.
 */
const TROUBLE =
  /\b(?:can't|cannot|couldn't|could not|unable|failed|fail|error|didn't|did not|wasn't|isn't|aren't|won't|doesn't|does not|not found|no such|need|needs|approve|approval|permission|blocked|which|should i|do you want|want me to|problem|sorry|instead|but|already|missing|denied|declined|waiting|careful|warning)\b/i

/** The one word for a task done, by what the owner asked for. */
const ACKS = [
  [/^(?:create|make|add|new|write|draft|generate|build|set up|setup)\b/i, 'Created.'],
  [/^(?:open|launch|start|run|show|bring up|pull up|go to)\b/i, 'Opened.'],
  [/^(?:send|email|mail|message|text|post|reply|forward|share)\b/i, 'Sent.'],
  [/^(?:save|download|export|backup|back up)\b/i, 'Saved.'],
  [/^(?:delete|remove|trash|clear|empty|uninstall)\b/i, 'Deleted.'],
  [/^(?:close|quit|exit|kill|end)\b/i, 'Closed.'],
  [/^(?:play|resume)\b/i, 'Playing.'],
  [/^(?:pause|stop)\b/i, 'Stopped.'],
]

/** What she says when a task is done: "Created.", "Opened.", … or "Done." */
export function ackFor(command) {
  const said = bare(command)
  for (const [re, word] of ACKS) if (re.test(said)) return word
  return 'Done.'
}

/**
 * Is this, in the owner's own words, a question — or a request to explain?
 * Anything else is a task, and she reports on it in a line.
 */
export function isQuestion(words) {
  const said = bare(words)
  // "Can you open Notepad?" is a task said politely; "can you explain it?" is a
  // question. bare() has already dropped the "can you" (and her name before it).
  if (/^(?:\S+[\s,]+){0,2}(?:can|could|would|will) you\b/i.test(String(words ?? '').trim())) return QUESTION.test(said)
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
 * @param {{ question?: boolean, command?: string }} [options]
 *   question — the owner asked, so nothing is capped
 *   command  — the owner's words, for the one word a task is answered with
 * @returns {{ push: (delta: string) => { text: string, quiet: boolean }[], end: () => { text: string, quiet: boolean }[] }}
 */
export function createSpokenFilter({ question = false, command = '' } = {}) {
  let held = ''
  let inMore = false
  /** A task's first sentence, held until it ends so it can be judged whole. */
  let first = ''
  let decided = false

  /**
   * A question's words are all spoken. A task's first sentence is held until it
   * ends, then judged: trouble, a question back, or already a word or three —
   * said as written; anything else — "I made the ayra-test folder in your
   * Documents." — becomes the one word ("Created.") with the sentence itself
   * in her log. After it, everything goes to the log, unsaid.
   */
  const say = (text, out) => {
    if (!text) return
    if (question) {
      out.push({ text, quiet: false })
      return
    }
    if (decided) {
      quietRest(text, out)
      return
    }
    first += text
    ENDS.lastIndex = 0
    const m = ENDS.exec(first)
    const cut = m ? m.index + m[0].length : first.length > TASK_CHARS ? TASK_CHARS : -1
    if (cut < 0) return
    decide(first.slice(0, cut), out)
    const rest = first.slice(cut)
    first = ''
    if (rest) quietRest(rest, out)
  }

  const decide = (sentence, out) => {
    decided = true
    const t = sentence.trim()
    if (!t) return
    const words = t.split(/\s+/).length
    if (TROUBLE.test(t) || /\?["'”’)\]]?$/.test(t) || words <= 3) {
      out.push({ text: sentence, quiet: false })
      return
    }
    out.push({ text: `${ackFor(command)} `, quiet: false })
    out.push({ text: sentence, quiet: true })
  }

  /** Past the cap: shown in her log, never said — not even that there is more. */
  const quietRest = (text, out) => {
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
      // A task's only sentence, never ended with a full stop and a space.
      if (!question && !decided && first) {
        decide(first, out)
        first = ''
      }
      inMore = false
      return out.map(({ text, quiet }) => ({ text, quiet }))
    },
  }
}
