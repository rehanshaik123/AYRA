/**
 * Where an answer came from, on screen, with no model in the way.
 *
 * Measured (PROGRESS.md, task 4.4): after a web search the model spent about
 * five seconds composing a card's HTML and taking one more round trip, and
 * every one of those seconds was silence. The search tool already hands back
 * the titles and links, so the bridge builds the sources card itself.
 *
 * It is no longer shown the moment a search returns: that put up every link
 * the search found, used or not, and a second card arrived late on top of it
 * (the owner's redesign, 2026-10-08). Each HUD turn now keeps what its web
 * tools brought back, and the sources card goes up once — right after the
 * answer's data card (show_data, panels.mjs) with only the sources she used,
 * or at the end of the turn when no data card was drawn.
 *
 *   searchSources(...)   — the links out of a WebSearch result (brain.mjs)
 *   normaliseUrl(...)    — one spelling per page, so URLs can be matched
 *   sourcesCard(...)     — links as the structured SOURCES blade
 *   createTurnCards(...) — one HUD connection's per-turn record and its cards
 *                          (server.mjs; show_data reads and draws through it)
 */

/** Links on a card. A heads-up display, not a results page. */
const MAX_ROWS = 5
/** Links on a turn's own sources card: the few she used, not all she found. */
export const TURN_SOURCES = 3
/** Result texts kept per turn for show_data's number check; each is clipped by brain.mjs. */
const MAX_TEXTS = 40

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

/**
 * One spelling per page, for matching a URL the model names against the ones
 * the search gave: lower-case host without `www.`, https, no fragment, no
 * trailing slash, no `utm_*` tracking. The model copies URLs loosely — it drops
 * the slash, keeps the campaign tags — and the card must still find them.
 * '' for anything that is not a web address.
 */
export function normaliseUrl(url) {
  let u
  try {
    u = new URL(String(url ?? '').trim())
  } catch {
    return ''
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return ''
  const host = u.hostname.toLowerCase().replace(/^www\./, '')
  if (!host) return ''
  const params = [...u.searchParams].filter(([key]) => !/^utm_/i.test(key))
  const query = params.length ? `?${new URLSearchParams(params)}` : ''
  const port = u.port ? `:${u.port}` : ''
  return `https://${host}${port}${u.pathname.replace(/\/+$/, '')}${query}`
}

/** `https://www.reuters.com/x` -> `reuters.com` — the tag a source is known by. */
export const domainOf = (url) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** One line of text off the open web: no control characters, no runs of space, a sane length. */
const line = (s, max) => {
  const t = String(s ?? '').replace(/\p{Cc}+/gu, ' ').replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}

/**
 * A title for a page known only by its address (a WebFetch has none): the last
 * part of its path in words — `/gold-rate-today` reads "gold rate today" —
 * else its site.
 */
export function titleFromUrl(url) {
  try {
    const u = new URL(url)
    const last = u.pathname.split('/').filter(Boolean).pop() ?? ''
    let words = last
    try {
      words = decodeURIComponent(last)
    } catch {
      // A broken escape: the raw segment still reads well enough.
    }
    words = words.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[-_+]+/g, ' ').trim()
    // An id, a hash or a date is not a title.
    return /[a-z]{3}/i.test(words) ? line(words, 120) : domainOf(url)
  } catch {
    return ''
  }
}

let seq = 0

/**
 * The SOURCES blade: a list of real links, which the face renders as links
 * (React text, no HTML). Web addresses only, one per page, five at most.
 *
 * @param {{ links?: { title?: string, url: string }[] }} what
 * @param {string} [id] — the turn's card id (`src-<ask>`), so a later send replaces it in place
 */
export function sourcesCard({ links } = {}, id = `s${Date.now().toString(36)}-${(seq++).toString(36)}`) {
  const seen = new Set()
  const out = []
  for (const l of Array.isArray(links) ? links : []) {
    const url = typeof l?.url === 'string' ? l.url.trim() : ''
    const key = normaliseUrl(url)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push({ title: line(l.title, 160) || titleFromUrl(url), url, domain: domainOf(url) })
    if (out.length === MAX_ROWS) break
  }
  return { id, title: 'SOURCES', kind: 'sources', links: out, size: 'compact', hold: 'turn' }
}

/**
 * One HUD connection's cards, turn by turn.
 *
 * Keeps what the turn's web tools brought back — every search's links in
 * order, the pages read, and the result text, which show_data checks each
 * figure against — and makes sure a turn gets at most one data card and one
 * sources card, whichever path draws them: show_data, the research tool, or
 * the end of the turn.
 *
 * A turn is the brain's `turn()` (brain.mjs): a new question is a new object,
 * so the record starts afresh without anyone having to say so. Card ids are
 * `d-<ask>` and `src-<ask>`, or a per-turn counter when the ask has no id.
 *
 * @param {{ send: (blade: object) => void, turn?: () => ({ ask?: string | null } | null) }} options
 *   send — puts one blade on the HUD (server.mjs tags it with the turn's ask)
 *   turn — the question being answered: conversation.turn()
 */
export function createTurnCards({ send, turn = () => null }) {
  let count = 0
  let state = null

  /** This turn's record, started afresh when the brain moves on to a new question. */
  const current = () => {
    const t = turn() ?? null
    if (!state || state.turn !== t) {
      state = {
        turn: t,
        key: t?.ask != null && t.ask !== '' ? String(t.ask) : `t${++count}`,
        searches: [],
        pages: [],
        texts: [],
        data: false,
        sources: false,
        research: false,
      }
    }
    return state
  }

  /** An event from an older turn — a barge-in's leftovers — says nothing about this one. */
  const stale = (s, event) => event?.ask != null && s.turn?.ask != null && event.ask !== s.turn.ask

  const keepText = (s, text) => {
    if (typeof text !== 'string' || !text) return
    s.texts.push(text)
    if (s.texts.length > MAX_TEXTS) s.texts.shift()
  }

  /** Every link the turn knows, by normalised URL: search results first, then pages read. */
  const known = (s) => {
    const map = new Map()
    for (const links of s.searches) {
      for (const l of links) {
        const key = normaliseUrl(l.url)
        if (key && !map.has(key)) map.set(key, l)
      }
    }
    for (const p of s.pages) {
      const key = normaliseUrl(p.url)
      if (key && !map.has(key)) map.set(key, { title: titleFromUrl(p.url), url: p.url })
    }
    return map
  }

  /** The pages read, titled from the search that found them when it did. */
  const pagesRead = (s) => {
    const map = known(s)
    return s.pages.map((p) => map.get(normaliseUrl(p.url)) ?? { title: titleFromUrl(p.url), url: p.url })
  }

  /** What to list when nothing better is known: the top of the last search, else the pages read. */
  const fallback = (s) => (s.searches.length ? s.searches.at(-1) : pagesRead(s)).slice(0, TURN_SOURCES)

  const putSources = (s, links) => {
    if (s.sources) return
    const card = sourcesCard({ links: links.slice(0, TURN_SOURCES) }, `src-${s.key}`)
    if (!card.links.length) return
    s.sources = true
    send(card)
  }

  return {
    /**
     * A brain event. `sources` (a search's links and text) and `fetched` (a
     * page read) are kept for the turn and go no further — the face never
     * sees them. `done` puts the sources card up when nothing else did: the
     * pages read, else the top of the last search. Call it before the done
     * frame goes out, so the card still belongs to the turn on the face.
     * @returns {boolean} true when the event was consumed here
     */
    observe(event) {
      const type = event?.type
      if (type !== 'sources' && type !== 'fetched' && type !== 'done') return false
      const s = current()
      if (stale(s, event)) return type !== 'done'
      if (type === 'sources') {
        const links = (Array.isArray(event.links) ? event.links : []).filter((l) => normaliseUrl(l?.url))
        if (links.length) s.searches.push(links)
        keepText(s, event.text)
        return true
      }
      if (type === 'fetched') {
        const url = typeof event.url === 'string' ? event.url.trim() : ''
        if (normaliseUrl(url)) s.pages.push({ url })
        keepText(s, event.text)
        return true
      }
      // done
      if (!s.data && !s.sources && !s.research) {
        putSources(s, s.pages.length ? pagesRead(s) : fallback(s))
      }
      return false
    },

    /**
     * What this turn has to show for itself, for show_data:
     *   links    — every search result, in order
     *   pages    — the URLs of the pages read
     *   text     — the search and page result text, joined
     *   data / sources / research — which cards are already up this turn
     */
    evidence() {
      const s = current()
      return {
        key: s.key,
        links: s.searches.flat(),
        pages: s.pages.map((p) => p.url),
        text: s.texts.join('\n\n'),
        data: s.data,
        sources: s.sources,
        research: s.research,
      }
    },

    /**
     * The answer's data card, then the sources card right after it, narrowed
     * to the URLs she says she used — matched to this turn's search results
     * and pages after normalising. Unknown URLs are ignored; when none match,
     * the top of the last search stands in.
     *
     * @param {{ title: string, headline: object | null, rows: object[], note?: string }} data
     * @param {string[]} urls
     */
    showData(data, urls = []) {
      const s = current()
      send({ id: `d-${s.key}`, title: data.title, kind: 'data', data, size: 'compact', hold: 'turn' })
      s.data = true
      const map = known(s)
      const chosen = []
      for (const u of Array.isArray(urls) ? urls : []) {
        const l = map.get(normaliseUrl(u))
        if (l && !chosen.includes(l)) chosen.push(l)
      }
      putSources(s, chosen.length ? chosen : fallback(s))
    },

    /**
     * A blade from the research tool, passed on. Its result cards (data,
     * sources) count as this turn's, so show_data refuses after them and the
     * end of the turn adds no second sources card.
     */
    research(blade) {
      const s = current()
      if (blade?.kind === 'data') {
        s.data = true
        s.research = true
      }
      if (blade?.kind === 'sources') {
        s.sources = true
        s.research = true
      }
      send(blade)
    },
  }
}
