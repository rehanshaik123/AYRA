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

/** Said as soon as the first tool fires, before any answer exists. */
const WORKING = [
  h('On it!'),
  'Ooh, digging in.',
  'Looking now!',
  'Hunting it down.',
  'Pulling it up.',
  'Okay, searching!',
  'Give me two seconds.',
]

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
 * Naming the task is warmer than a generic acknowledgement and shows the
 * integration off on camera. Still participial, still under five words.
 *
 * MCP tool names are `mcp__<server>__<tool>`, and the two halves say different
 * things: the server is who is being asked, the tool is what is being asked
 * for. Matching one flat substring against the whole string gets both wrong —
 * `mcp__playwright__browser_click` announced a web search because "browse"
 * appeared earlier in the table than "browser", `Get-Report` looked like a code
 * repository, `Get-Events` like a calendar entry, and "highlight" like a lamp.
 *
 * So: split the name, match the halves separately, order the table so the
 * specific beats the general, and put word boundaries on the short words that
 * hide inside longer ones. Either half matching is enough — the server is the
 * better signal when a name gives one, but plenty of them don't.
 */
type Rule = {
  /** Matched against the server segment, if there is one. */
  server?: RegExp
  /** Matched against the tool segment, or the whole name for a built-in. */
  tool?: RegExp
  lines: string[]
}

const FOOTAGE = ['Rolling the footage!', 'Cutting it together.']

const BY_TOOL: Rule[] = [
  // Video sits above image because higgsfield and palmier both do either, so
  // the verb in the tool name is the only thing separating them — a rule on the
  // server alone would send every generate_video to "Rendering."
  { tool: /video|footage|\bclip\b|\breel\b|talking_head/, lines: FOOTAGE },
  {
    server: /higgsfield|openrouter-image|dalle|flux|midjourney/,
    tool: /image|photo|thumbnail|render|upscale|seedream/,
    lines: ['Ooh, making something pretty.', 'Painting it now!'],
  },
  // The editors, once the two rules that read the verb have had their turn.
  { server: /palmier|heygen|runway|descript/, lines: FOOTAGE },
  {
    server: /playwright|puppeteer|browserbase|chrome/,
    tool: /\bbrowser\b|navigate/,
    lines: ['Opening the browser!', 'Heading there now.'],
  },
  {
    server: /android|\badb\b|simulator/,
    tool: /\bdevice\b|\bapk\b|\bphone\b/,
    lines: ['Poking your phone.', 'Reaching your phone!'],
  },
  {
    server: /gmail|\bmail\b/,
    tool: /gmail|\bmail\b|email|inbox/,
    lines: ['Peeking at your inbox.', 'Checking your mail!'],
  },
  // Calendar keys off "calendar" alone. "event" used to live here, which is how
  // a Mixpanel event query came out as "Checking your calendar."
  {
    tool: /calendar|\bdiary\b|\bmeeting\b/,
    lines: ['Checking your calendar!', 'Looking at your day.'],
  },
  {
    server: /elevenlabs|openai-tts/,
    tool: /speech|\bvoice\b|\btts\b|text_to_sound/,
    lines: ['Warming up my voice.', h('On it!')],
  },
  {
    server: /spotify|sonos/,
    tool: /\bplay\b|\bmusic\b|playlist|\btrack\b/,
    lines: ['Queuing it up!', 'Ooh, good choice.'],
  },
  {
    server: /^home|homeassistant|\bhue\b|\bhass\b/,
    tool: /\blights?\b|thermostat|\bdimmer\b/,
    lines: ['Adjusting it now!', h('On it!')],
  },
  {
    server: /github|linear|jira|sentry/,
    tool: /\brepo\b|repository|\bissues?\b|pull_request|\bcommit\b/,
    lines: ['Checking the repo.', 'Looking at the tracker!'],
  },
  // Also where the anonymously named analytics servers land — theirs are bare
  // UUIDs, so only the tool half says anything: Get-Report, Get-Events,
  // Run-Query. "report" is safe from the repository rule above because that one
  // is bounded.
  {
    server: /mixpanel|clarity|posthog|amplitude/,
    tool: /analytic|\bmetrics?\b|\breports?\b|\bevents?\b|cohort|funnel|dashboard|\bquery\b/,
    lines: ['Crunching the numbers!', 'Pulling the figures.'],
  },
  {
    server: /\bexa\b|serper|serpapi|perplexity|tavily|brave/,
    tool: /search|\bweb\b|\bfetch\b|crawl|research/,
    lines: ['Searching!', 'Ooh, looking it up.'],
  },
]

const pickers = BY_TOOL.map((r) => ({ ...r, pick: makePicker(r.lines) }))

/**
 * `mcp__<server>__<tool>`, split on the first separator so tool names keep
 * their own underscores (`browser_click`, `text_to_speech`). A built-in like
 * WebSearch or Bash has no server half.
 *
 * The second form matters more than it looks: the bridge client prettifies
 * names for the HUD badge before handing them on, so what actually arrives
 * here is `higgsfield · generate image`. Parsing only the raw form meant every
 * rule below silently missed and every tool got the generic line.
 */
function split(toolName: string): { server: string; tool: string } {
  const raw = /^mcp__(.+?)__(.+)$/.exec(toolName)
  if (raw) return { server: raw[1].toLowerCase(), tool: raw[2].toLowerCase() }

  const pretty = toolName.split(' · ')
  if (pretty.length === 2) {
    return { server: pretty[0].toLowerCase(), tool: pretty[1].toLowerCase() }
  }

  return { server: '', tool: toolName.toLowerCase() }
}

/** A phrase suited to the tool that just fired. */
export function forTool(toolName: string): string {
  const { server, tool } = split(toolName)
  for (const r of pickers) {
    const hit =
      (r.server !== undefined && server !== '' && r.server.test(server)) ||
      (r.tool !== undefined && r.tool.test(tool))
    if (hit) return r.pick()
  }
  // Read, Bash, Grep and anything unrecognised: better a neutral line than a
  // confident wrong one.
  return working()
}
