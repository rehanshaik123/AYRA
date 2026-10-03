/**
 * Search results straight onto the screen, with no model in the way.
 *
 * Measured (PROGRESS.md, task 4.4): after a web search the model spent about
 * five seconds composing a card's HTML and taking one more round trip, and
 * every one of those seconds was silence — it drew the card before it spoke.
 * The search tool already hands back the titles and links, so the bridge turns
 * them into the card itself the moment the search returns, and the model only
 * has to say the answer.
 *
 *   searchSources(...) — the links out of a WebSearch result (brain.mjs)
 *   sourcesCard(...)   — those links as a blade for the HUD (server.mjs)
 */

/** Rows on the card. A heads-up display, not a results page. */
const MAX_ROWS = 5

/**
 * The query and links from a WebSearch result.
 *
 * Prefers the structured result the SDK attaches (`tool_use_result`), and falls
 * back to the `Links: [...]` line in the text the model sees, so a change in
 * either shape still finds them. Returns null when there is nothing to show.
 *
 * @param {unknown} structured — the SDK's tool_use_result, if any
 * @param {unknown} content    — the tool_result content (string or blocks)
 * @returns {{ query: string, links: { title: string, url: string }[] } | null}
 */
export function searchSources(structured, content) {
  let query = ''
  let links = []

  if (structured && typeof structured === 'object') {
    query = typeof structured.query === 'string' ? structured.query : ''
    for (const r of Array.isArray(structured.results) ? structured.results : []) {
      if (Array.isArray(r?.content)) links.push(...r.content)
    }
  }

  if (!links.length) {
    const text = typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content.map((b) => (typeof b?.text === 'string' ? b.text : '')).join('\n')
        : ''
    query ||= /Web search results for query: "([^"]*)"/.exec(text)?.[1] ?? ''
    const line = /^Links: (\[.*\])$/m.exec(text)?.[1]
    if (line) {
      try {
        links = JSON.parse(line)
      } catch {
        links = []
      }
    }
  }

  const seen = new Set()
  const clean = []
  for (const l of links) {
    const url = typeof l?.url === 'string' ? l.url.trim() : ''
    const title = typeof l?.title === 'string' ? l.title.replace(/\s+/g, ' ').trim() : ''
    if (!/^https?:\/\//i.test(url) || !title || seen.has(url)) continue
    seen.add(url)
    clean.push({ title, url })
  }
  return clean.length ? { query, links: clean } : null
}

const escape = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

/** `https://www.reuters.com/x` -> `reuters.com` — the tag a source is known by. */
const site = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

let seq = 0

/**
 * A blade listing the sources, in the HUD's own design system.
 *
 * Titles come off the open web, so they are escaped here and sanitised again in
 * the browser — the same treatment as any markup the model writes.
 */
export function sourcesCard({ query, links }) {
  const rows = links
    .slice(0, MAX_ROWS)
    .map(
      (l, i) =>
        `<div class="hud-row"><span class="hud-idx">${String(i + 1).padStart(2, '0')}</span>` +
        `<span class="hud-main"><span class="hud-label">${escape(l.title)}</span></span>` +
        `<span class="hud-tag">${escape(site(l.url))}</span></div>`,
    )
    .join('')
  const title = query ? query.toUpperCase().slice(0, 40) : 'SOURCES'
  return {
    id: `s${Date.now().toString(36)}-${(seq++).toString(36)}`,
    title,
    kind: 'markup',
    html: `<div class="hud-rows">${rows}</div>`,
    size: 'compact',
    hold: 'turn',
  }
}
