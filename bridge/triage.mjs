/**
 * How deep a question goes, decided in code before any model sees it.
 *
 * The owner, 2026-10-07: simple questions ("price of gold", the weather, a
 * definition) must not start the multi-agent research, because "it will burn
 * my tokens". They chose "only clearly complex" for research: comparisons,
 * several parts in one question, an explicit ask to research or analyse, pros
 * and cons, contested or high-stakes questions. Everything else is answered
 * with one quick web search, or from what she knows.
 *
 * So every question is ranked from the OWNER'S own words (the channel calls
 * rankQuery, not the model) with blunt weighted rules: a model asked "is this
 * complex?" costs a call on every turn, and the simple path must add none.
 * Ranking is a handful of regular expressions, microseconds per question.
 *
 * Pure: no I/O, no clock, no model. The labelled table in test/triage.test.mjs
 * pins every rule; tune the weights there, not by feel.
 */

/** Score at or above this is complex: the research tool runs. */
export const COMPLEX_AT = 6
/** 3..5 is moderate (one web search, perhaps two); below is simple. */
export const MODERATE_AT = 3

/** Lower case, one kind of apostrophe and quote, single spaces. */
const tidy = (text) =>
  String(text ?? '')
    .toLowerCase()
    .replace(/[‘’‚‛′`´]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐‑‒–—―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()

// ---------------------------------------------------------------------------
// What pushes a question deeper
// ---------------------------------------------------------------------------

/**
 * An explicit ask for depth. On its own it ranks complex: "research it" after
 * she has offered is the owner choosing research, however short.
 */
const RESEARCH = /\b(research(ing)?|deep[- ]?dive|fact[- ]?check(ing)?|analy[sz](e|es|ed|ing)|analysis|investigate|investigation|in[- ]depth)\b/
/** Asking to compare, in words that can mean nothing else. */
const COMPARE = /\b(compare[ds]?|comparing|comparison|contrast|differences? between|differ from|better than|worse than|stack up|head[- ]to[- ]head)\b/
/** "A vs B": a comparison, unless it is a lookup (a score, two prices). */
const VERSUS = /\b(vs|versus)\b/
const DECISION = /\b(should (i|we)|shall i|is it worth|worth (it|buying|the money)|which (one )?(is|would be|'s) better|which should (i|we)|choose between|decide between|pick between|recommend)\b/
/** Two options inside a decision: "gold or index funds". */
const OPTIONS = /\b\w+ or \w+/
const STAKES = /\b(invest\w*|stocks?|shares|mutual funds?|index funds?|retirement|pension|loans?|mortgage|insurance|tax(es)?|salary|surgery|medicines?|medication|drugs?|dosage|treatment|diagnos\w*|symptoms?|cancer|diabetes|heart|pregnan\w*|weight loss|diet|legal|lawsuit|lawyer|visa|immigration|property|house)\b/
const CONTESTED = /\b(is it true|is it a myth|true or false|myths?|debunk\w*|really (true|works?|helps?)|evidence (for|that|on|behind|say)|scientific consensus|controversial|contested|conspiracy)\b/
const PROS = /\b(pros and cons|pros & cons|advantages and disadvantages|benefits and (risks|drawbacks|downsides)|trade-?offs?|strengths and weaknesses|merits)\b/
const IMPACT = /\b(impacts?|effects? (of|on)|affect(s|ed|ing)?|consequences|implications|influence of|role of|causes of)\b/
const TREND = /\b(since (19|20)\d\d|over the (last|past|next) (few |several |\d+ )?(years?|decades?|months?)|(next|last|past) \d+ (years?|decades?)|over time|trends?|changed|changing|evolution|evolved|history of|growth of|how has|outlook|projections?|long[- ]term)\b/
/** Two questions in one: "…, and how has it changed?". */
const CLAUSE = /, (and|also|plus) (how|why|what|when|where|which|who|is|are|does|do|did|has|have|can|should)\b|\b(and|also) (how|why|what) (has|have|is|are|does|do|did|will|would|should|can)\b/
/** A list of aspects: "for camera, battery and price". */
const ASPECTS = /\b(for|on|in terms of|across|regarding) [\w' -]+, [\w' -]+,? and [\w' -]+/
const HOWTO = /\bhow (do|can|should) (i|we)\b|\bhow to\b|\bsteps to\b|\bguide to\b/
const EXPLAIN = /^why\b|^how come\b|^how (does|do|did) |\bhow (does|do|did|can|could) .+ work\b|\bexplain\b|\bwhat causes\b|\bwhat'?s the reason\b/
const NEWS = /\b(latest|recent|current) (news|developments|updates|happenings)\b|\bnews (about|on|from|regarding)\b|\bwhat'?s (happening|going on) (with|in)\b|\bheadlines\b/
const RECOMMEND = /\b(best|top \d+|top[- ]rated)\b/

// ---------------------------------------------------------------------------
// What says it is simple
// ---------------------------------------------------------------------------

/**
 * Words that look something up. Joined by "and" or "vs" they are still
 * lookups — "gold vs silver price today", "India vs Australia score" — unless
 * a decision or an analysis word appears.
 */
const LOOKUP = /\b(price|prices|priced|cost of|rates?|weather|forecast|temperature|rain|score|scores|scorecard|live|match|results?|time|convert|conversion|exchange|launch date|release date|usd|eur|inr|gbp|jpy|aed|dollars?|rupees?|euros?|pounds?)\b/
const DEFINE = /^(define|definition of|meaning of|what does .{1,40} mean|what is the meaning of)\b/
const SHORT_FACT = /^(who|what|when|where|which)('s| is| are| was| were| did)\b/
const ARITHMETIC = /\d\s*(\+|-|\*|\/|x|times|plus|minus|divided by|multiplied by)\s*\d/
/** Something to do on the laptop, not something to find out. */
const COMMAND = /^(open|close|launch|start|stop|play|pause|resume|skip|type|click|press|scroll|minimi[sz]e|maximi[sz]e|mute|unmute|turn (on|off|up|down)|volume|set (a |an )?(timer|alarm|reminder)|remind me|take a screenshot|screenshot|go to|navigate to|shut ?down|restart|lock)\b/
const SMALL_TALK = /^(hi+|hey+|hello|yo+|sup|hola|namaste|good (morning|afternoon|evening|night)|thanks|thank you|thx|ok(ay)?|cool|nice|lol|lmao|haha\w*|bye|gn|gm)\b|\b(how are you|how'?re you|how'?s it going|how'?s your day|what'?s up|what is up|wassup|i'?m (so )?bored|miss you|love you)\b/

/**
 * @param {string} text — the owner's own words
 * @returns {{ score: number, level: 'simple'|'moderate'|'complex', parts: 0|3|4, reasons: string[] }}
 *   score   — 0..10, an integer
 *   parts   — how many research agents a complex question gets (3, or 4 at 8+)
 *   reasons — short plain phrases, for the hint and the progress card
 */
export function rankQuery(text) {
  const t = tidy(text)
  const words = t ? t.split(' ').length : 0
  const reasons = []
  let score = 0
  const add = (points, reason) => {
    score += points
    if (!reasons.includes(reason)) reasons.push(reason)
  }

  const research = RESEARCH.test(t)
  const compare = COMPARE.test(t)
  const decision = DECISION.test(t)
  const contested = CONTESTED.test(t)
  const pros = PROS.test(t)
  const impact = IMPACT.test(t)
  const trend = TREND.test(t)
  const howto = HOWTO.test(t)
  const explain = !howto && EXPLAIN.test(t) && !SMALL_TALK.test(t)
  const news = NEWS.test(t)
  const recommend = RECOMMEND.test(t)
  // Anything that asks for more than a looked-up value.
  const analytic = research || compare || decision || contested || pros || impact || trend || howto || explain || news || recommend
  const lookup = LOOKUP.test(t)

  if (research) add(6, 'asks for research')
  if (compare) add(6, 'comparison')
  // "A vs B" alone is a comparison; "A vs B score" is one fact.
  if (VERSUS.test(t) && !(lookup && !analytic)) add(5, 'comparison')
  if (decision) {
    add(4, 'decision')
    if (OPTIONS.test(t)) add(2, 'comparison')
  }
  if (pros) add(6, 'pros and cons')
  if (contested) add(5, 'contested claim')
  if (impact) add(3, 'impact')
  if (trend) add(2, 'trend over time')
  if (STAKES.test(t) && analytic) add(2, 'high stakes')
  if ((t.match(/\?/g)?.length ?? 0) >= 2 || CLAUSE.test(t) || ASPECTS.test(t)) add(2, 'several parts')
  if (howto) add(3, 'how-to')
  else if (explain) add(3, 'explanation')
  if (news) add(3, 'news roundup')
  if (recommend) add(3, 'recommendation')
  // Never more than a point: a long way of asking for the weather is still the weather.
  if (words > 25) add(1, 'long question')

  // Why it is simple. Only when nothing above asked for more — except a
  // command, which is something to do, whatever words ride along with it.
  if (COMMAND.test(t)) add(-4, 'laptop command')
  if (!analytic) {
    if (SMALL_TALK.test(t)) add(-3, 'small talk')
    if (DEFINE.test(t)) add(-2, 'definition')
    if (ARITHMETIC.test(t)) add(-2, 'arithmetic')
    if (lookup) add(-2, 'single fact')
    else if (SHORT_FACT.test(t) && words <= 8) add(-1, 'single fact')
  }

  score = Math.max(0, Math.min(10, Math.round(score)))
  const level = score >= COMPLEX_AT ? 'complex' : score >= MODERATE_AT ? 'moderate' : 'simple'
  const parts = level !== 'complex' ? 0 : score >= 8 ? 4 : 3
  return { score, level, parts, reasons }
}

/**
 * The one line the brain puts before a complex question, so the model knows
 * the ranker chose research for it. Empty for anything else: a simple question
 * goes to the model exactly as it always has.
 */
export function depthHint(rank) {
  if (rank?.level !== 'complex') return ''
  const reasons = Array.isArray(rank.reasons) ? rank.reasons : []
  return `[Depth ${rank.score}/10 · complex: ${reasons.join(', ')} · use the research tool]`
}
