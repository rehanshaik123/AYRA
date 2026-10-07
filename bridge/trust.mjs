/**
 * How much to believe a web page, and whether a quote is really in it.
 *
 * The research agent (research.mjs) reads the open web and has to answer two
 * questions about everything it reads, and neither should be left to a model:
 *
 *   1. How far can this source be trusted before reading a word of it? A
 *      government statistics page and an anonymous blog are not equal
 *      witnesses, and the answer's confidence has to say so. classifySource
 *      and scoreSource give every source a prior from what it IS (its
 *      domain), adjusted by what we learn when it is read (a date, injection
 *      text).
 *   2. Did the extractor really find that in the page, or did it make it up?
 *      verifyQuote checks every quote against the page text the extractor was
 *      given. A claim whose quote is not there is dropped — a model cannot
 *      launder its own memory into "evidence".
 *
 * Plus the sentence-level prompt-injection scan for web text (scanInjection),
 * the arithmetic that turns sources into confidence, and the question
 * normaliser behind the saved-research cache.
 *
 * Pure: no I/O, no clock unless given one, no model. Deliberately blunt and
 * deterministic, so a judge can read the rules and the tests can pin them.
 */

// ---------------------------------------------------------------------------
// Domains
// ---------------------------------------------------------------------------

/**
 * Two-level public suffixes — enough of the Public Suffix List for the sites a
 * research question meets. Without them 'news.bbc.co.uk' would count as the
 * domain 'co.uk', and every British site would look like the same source.
 */
const TWO_LEVEL = new Set([
  'co.uk', 'ac.uk', 'gov.uk', 'org.uk', 'net.uk', 'nhs.uk', 'ltd.uk', 'plc.uk', 'police.uk', 'sch.uk', 'me.uk',
  'co.in', 'gov.in', 'ac.in', 'nic.in', 'edu.in', 'res.in', 'org.in', 'net.in', 'firm.in', 'gen.in', 'ind.in',
  'com.au', 'gov.au', 'edu.au', 'org.au', 'net.au',
  'co.jp', 'ac.jp', 'go.jp', 'or.jp', 'ne.jp',
  'com.br', 'gov.br', 'org.br', 'edu.br',
  'co.za', 'gov.za', 'ac.za', 'org.za',
  'co.nz', 'govt.nz', 'ac.nz', 'org.nz',
  'com.sg', 'gov.sg', 'edu.sg', 'org.sg',
  'com.cn', 'gov.cn', 'edu.cn', 'org.cn',
  'com.hk', 'gov.hk', 'edu.hk', 'org.hk',
  'com.my', 'gov.my', 'edu.my',
  'co.kr', 'go.kr', 'ac.kr', 'or.kr',
  'com.mx', 'gob.mx', 'edu.mx',
  'com.ar', 'gob.ar', 'edu.ar',
  'com.tr', 'gov.tr', 'edu.tr',
  'com.pk', 'gov.pk', 'edu.pk',
  'com.ng', 'gov.ng', 'edu.ng',
  'co.ke', 'go.ke', 'ac.ke',
  'com.eg', 'gov.eg', 'edu.eg',
  'com.sa', 'gov.sa', 'edu.sa',
  'com.bd', 'gov.bd', 'ac.bd',
  'co.id', 'go.id', 'ac.id',
  'com.ph', 'gov.ph', 'edu.ph',
  'co.il', 'gov.il', 'ac.il',
  'com.tw', 'gov.tw', 'edu.tw',
  'ac.ae', 'gov.ae', 'co.ae',
  'com.np', 'gov.np', 'edu.np',
  'com.lk', 'gov.lk', 'ac.lk',
  'gc.ca', 'qc.ca', 'on.ca',
  'europa.eu',
])

const hostOf = (url) => {
  try {
    return new URL(String(url)).hostname.toLowerCase().replace(/\.$/, '')
  } catch {
    return ''
  }
}

/** 'news.bbc.co.uk' → 'bbc.co.uk', 'www.who.int' → 'who.int'. IP literals stay as they are. */
export function registrableDomain(hostname) {
  const host = String(hostname ?? '').toLowerCase().trim().replace(/\.$/, '').replace(/^www\d*\./, '')
  if (!host) return ''
  if (/^[\d.]+$/.test(host) || host.includes(':') || host.startsWith('[')) return host
  const labels = host.split('.')
  if (labels.length <= 2) return host
  const lastTwo = labels.slice(-2).join('.')
  return TWO_LEVEL.has(lastTwo) ? labels.slice(-3).join('.') : lastTwo
}

/** Does `host` equal `domain` or sit under it? */
const under = (host, domain) => host === domain || host.endsWith(`.${domain}`)
const anyUnder = (host, list) => list.some((d) => under(host, d))

const INTERGOVERNMENTAL = ['who.int', 'un.org', 'worldbank.org', 'imf.org', 'oecd.org', 'europa.eu', 'unesco.org', 'unicef.org', 'wto.org', 'ilo.org', 'fao.org']
const RESEARCH_INDEXES = ['ncbi.nlm.nih.gov', 'pubmed.gov', 'europepmc.org', 'cochranelibrary.com', 'cochrane.org']
const JOURNALS = [
  'nature.com', 'science.org', 'thelancet.com', 'nejm.org', 'bmj.com', 'sciencedirect.com', 'springer.com',
  'wiley.com', 'jamanetwork.com', 'cell.com', 'plos.org', 'ieee.org', 'acm.org', 'pnas.org', 'oup.com',
  'cambridge.org', 'tandfonline.com', 'sagepub.com', 'frontiersin.org', 'annualreviews.org', 'jstor.org',
  'ahajournals.org', 'acpjournals.org', 'karger.com', 'mdpi.com', 'biomedcentral.com',
]
const PREPRINTS = ['arxiv.org', 'biorxiv.org', 'medrxiv.org', 'ssrn.com', 'researchsquare.com', 'preprints.org']
const WIRES = ['reuters.com', 'apnews.com', 'afp.com', 'pti.in']
const NEWS = [
  'bbc.co.uk', 'bbc.com', 'npr.org', 'theguardian.com', 'nytimes.com', 'washingtonpost.com', 'ft.com',
  'economist.com', 'wsj.com', 'bloomberg.com', 'aljazeera.com', 'thehindu.com', 'indianexpress.com',
  'hindustantimes.com', 'ndtv.com', 'timesofindia.indiatimes.com', 'livemint.com', 'cnn.com', 'cnbc.com',
  'scientificamerican.com', 'newscientist.com', 'theverge.com', 'arstechnica.com', 'wired.com',
  'techcrunch.com', 'statnews.com', 'axios.com', 'politico.com', 'theatlantic.com', 'nbcnews.com',
  'cbsnews.com', 'abcnews.go.com', 'usatoday.com', 'latimes.com', 'theprint.in', 'scroll.in',
  'business-standard.com', 'economictimes.indiatimes.com', 'dw.com', 'france24.com',
]
const REFERENCE = { 'wikipedia.org': 0.7, 'britannica.com': 0.8 }
const MEDICAL = ['mayoclinic.org', 'clevelandclinic.org', 'hopkinsmedicine.org']
const BLOG_HOSTS = ['medium.com', 'substack.com', 'blogspot.com', 'wordpress.com', 'hashnode.dev', 'hashnode.com', 'dev.to', 'tumblr.com', 'ghost.io']
const FORUMS = ['reddit.com', 'quora.com', 'stackexchange.com', 'stackoverflow.com', 'news.ycombinator.com', 'answers.microsoft.com']
const SOCIAL = ['x.com', 'twitter.com', 'facebook.com', 'instagram.com', 'tiktok.com', 'youtube.com', 'youtu.be', 'threads.net', 'linkedin.com', 'pinterest.com']
/** Pages written to rank, not to inform. */
const CONTENT_FARMS = ['answers.com', 'ehow.com', 'wikihow.com', 'reference.com', 'ask.com', 'hubpages.com', 'ezinearticles.com', 'chacha.com']

/** Government hostnames: .gov, .gov.xx, .gouv.xx, .gob.xx, .go.xx, .govt.nz, .gc.ca, .nic.in, .mil. */
const GOV_HOST = /(^|\.)(gov|mil)(\.[a-z]{2})?$|(^|\.)(gouv|gob|go|govt)\.[a-z]{2}$|(^|\.)gc\.ca$|(^|\.)nic\.in$/
const ACADEMIC_HOST = /(^|\.)edu(\.[a-z]{2})?$|(^|\.)ac\.[a-z]{2}$/

/**
 * What kind of source a URL is, and the trust it starts with.
 *
 * @returns {{ domain: string, kind: 'gov'|'academic'|'reference'|'news'|'org'|'company'|'blog'|'forum'|'social'|'web',
 *             base: number, label: string }}
 *   domain — the hostname minus www. (what the board shows)
 *   base   — prior trust, 0..1
 *   label  — the reason in a few words ('government site')
 */
export function classifySource(url) {
  const host = hostOf(url)
  const domain = host.replace(/^www\d*\./, '')
  const path = (() => {
    try {
      return new URL(String(url)).pathname.toLowerCase()
    } catch {
      return ''
    }
  })()
  const is = (kind, base, label) => ({ domain, kind, base, label })

  if (!host) return is('web', 0.5, 'website')
  // A university's sign-in proxy in front of a journal: it looks academic and never opens.
  if (/(^|[.-])(lib|ez)proxy[.-]|\.idm\.oclc\.org$/.test(host)) return is('web', 0.3, 'library proxy (sign-in)')
  // Before the forum rule: answers.com is a content farm, not a community.
  if (anyUnder(host, CONTENT_FARMS)) return is('web', 0.3, 'content farm')
  // Before the gov rule: PubMed lives on nih.gov but is an index of papers.
  if (anyUnder(host, RESEARCH_INDEXES)) return is('academic', 0.88, 'research index')
  if (anyUnder(host, MEDICAL)) return is('org', 0.75, 'medical centre')
  if (under(host, 'nhs.uk')) return is('gov', 0.9, 'government health service')
  if (GOV_HOST.test(host)) return is('gov', 0.9, 'government site')
  if (host.endsWith('.int') || anyUnder(host, INTERGOVERNMENTAL)) return is('gov', 0.9, 'intergovernmental body')
  if (anyUnder(host, PREPRINTS)) return is('academic', 0.7, 'preprint (not peer-reviewed)')
  if (anyUnder(host, JOURNALS)) return is('academic', 0.88, 'scientific journal')
  if (ACADEMIC_HOST.test(host)) return is('academic', 0.88, 'university')
  for (const [ref, base] of Object.entries(REFERENCE)) {
    if (under(host, ref)) return is('reference', base, ref === 'wikipedia.org' ? 'encyclopedia (open-edited)' : 'encyclopedia')
  }
  if (anyUnder(host, WIRES)) return is('news', 0.82, 'news wire')
  if (anyUnder(host, NEWS)) return is('news', 0.78, 'major news outlet')
  if (anyUnder(host, BLOG_HOSTS) || (under(host, 'linkedin.com') && path.startsWith('/pulse'))) {
    return is('blog', 0.42, 'blog platform')
  }
  if (anyUnder(host, FORUMS) || /^answers\./.test(host)) return is('forum', 0.4, 'forum')
  if (anyUnder(host, SOCIAL)) return is('social', 0.25, 'social media')
  // A company talking about itself: useful for what it says it does, not for judging it.
  if (/^(investors?|ir|newsroom|press|about)\./.test(host)) return is('company', 0.55, "company's own site")
  if (host.endsWith('.org')) return is('org', 0.6, 'organisation')
  return is('web', 0.5, 'website')
}

const DAY = 86_400_000
const round2 = (x) => Math.round(x * 100) / 100
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x))

/** 'YYYY-MM-DD…' → epoch ms, or NaN. */
const dateMs = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''))
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN
}

/**
 * A source's trust once it has been read.
 *
 * @param {{ url: string, published?: string, injection?: boolean, timeSensitive?: boolean, now?: number | Date }} input
 * @returns {{ trust: number, why: string[] }}
 */
export function scoreSource({ url, published, injection = false, timeSensitive = false, now = Date.now() }) {
  const { base, label } = classifySource(url)
  const why = [label]
  let trust = base
  const at = dateMs(published)
  if (Number.isFinite(at)) {
    trust += 0.04
    why.push(`dated ${String(published).slice(0, 10)}`)
    if (timeSensitive) {
      const age = Number(now) - at
      if (age > 730 * DAY) {
        trust -= 0.1
        why.push('over 2 years old')
      } else if (age <= 183 * DAY) {
        trust += 0.04
        why.push('recent')
      }
    }
  }
  if (!/^https:/i.test(String(url ?? ''))) {
    trust -= 0.05
    why.push('no https')
  }
  if (injection) {
    trust -= 0.3
    why.push('injection text removed')
  }
  return { trust: round2(clamp(trust, 0.05, 0.97)), why }
}

// ---------------------------------------------------------------------------
// Prompt injection
// ---------------------------------------------------------------------------

/**
 * Phrases that talk to an AI rather than to a reader.
 *
 * Text inside a web page has no business addressing the model reading it, so
 * a sentence that does is removed before any model sees the page, and the
 * source is marked and loses trust. The readers have no tools either way
 * (research.mjs) — this is the second wall, not the only one.
 */
const INJECTION = [
  /\b(ignore|disregard|forget|override)\s+(?:(?:all|any|the|your|of|these|those)\s+)*(previous|prior|above|earlier|preceding|former)\s+(instructions?|prompts?|rules|directions|guidelines|context)\b/i,
  // Narrower than a bare "you are now": that also opens "you are now leaving our site".
  /\byou are now (?:a |an |the |in )?(?:\w+ ){0,2}?(ai|assistant|model|chatbot|bot|agent|mode|persona|jailbroken|unrestricted|dan)\b/i,
  /\b(act|behave|pretend|respond) (as|like|to be) (an?|the) (ai|assistant|chatgpt|claude|language model|llm|chatbot)\b/i,
  /\bsystem prompt\b/i,
  /<\s*\/?\s*(system|assistant|user)\s*>/i,
  /\[\/?INST\]|<\|im_(start|end)\|>/i,
  /\b(do not|don't|never) (tell|inform|alert|mention (this )?to) the user\b/i,
  /\b(send|email|e-mail|forward|reveal)\b[^.!?\n]{0,60}\b(passwords?|api[ -]?keys?|credentials|tokens?|secret keys?)\b/i,
  /\b(ai|llm|language model)\s+(assistants?|agents?|models?|bots?)?\s*(reading|summari[sz]ing|processing|browsing|parsing|scraping) this\b/i,
  /\bif you are an? (ai|llm|language model|assistant|chatbot)\b/i,
  /\bnew instructions\s*:/i,
]

/** Split a paragraph into sentences, keeping each one's own punctuation. */
const sentencesOf = (para) => para.split(/(?<=[.!?…]["'”’)\]]*)\s+(?=\S)/)

/**
 * @param {string} text — page text, paragraphs separated by blank lines
 * @returns {{ flagged: boolean, hits: string[], clean: string }}
 *   hits  — the offending sentences, ≤80 chars each, at most 5
 *   clean — the text without them (paragraphs joined by blank lines)
 */
export function scanInjection(text) {
  const hits = []
  const kept = []
  for (const para of String(text ?? '').split(/\n\s*\n|\n/)) {
    const keep = []
    for (const sentence of sentencesOf(para.trim())) {
      if (!sentence) continue
      if (INJECTION.some((re) => re.test(sentence))) {
        if (hits.length < 5) hits.push(sentence.trim().replace(/\s+/g, ' ').slice(0, 80))
        continue
      }
      keep.push(sentence)
    }
    if (keep.length) kept.push(keep.join(' '))
  }
  return { flagged: hits.length > 0, hits, clean: kept.join('\n\n') }
}

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------

/** Lowercase, one kind of quote and dash, no punctuation, single spaces. */
export function normalise(text) {
  return String(text ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’‚‛′`´]/g, "'")
    .replace(/[“”„‟″«»]/g, '"')
    .replace(/[‐‑‒–—―−]/g, '-')
    // Punctuation becomes a space, not nothing, so "fasting-based" still
    // matches a quote that wrote "fasting based".
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Is this quote really in the text?
 *
 *   exact   — word for word (after normalise)
 *   close   — at least 85 % of its words inside one stretch of the text not
 *             much longer than the quote: a model that dropped a word or
 *             changed "per cent" to "%" still counts; one that stitched
 *             together words from different paragraphs does not
 *   missing — otherwise, or a quote under four words (too short to prove)
 *
 * The close check slides one window over the text's words, counting how many
 * of the quote's words it holds — linear in the text, fast at 8k characters.
 */
export function verifyQuote(quote, text) {
  const q = normalise(quote)
  const words = q ? q.split(' ') : []
  if (words.length < 4) return 'missing'
  const t = normalise(text)
  if (!t) return 'missing'
  if (` ${t} `.includes(` ${q} `)) return 'exact'

  const need = new Map()
  for (const w of words) need.set(w, (need.get(w) ?? 0) + 1)
  const tokens = t.split(' ')
  const size = Math.min(tokens.length, Math.ceil(words.length * 1.3))
  const goal = Math.ceil(words.length * 0.85 - 1e-9)
  const have = new Map()
  let matched = 0
  const add = (w) => {
    const n = need.get(w)
    if (!n) return
    const h = have.get(w) ?? 0
    if (h < n) matched++
    have.set(w, h + 1)
  }
  const drop = (w) => {
    const n = need.get(w)
    if (!n) return
    const h = have.get(w) - 1
    have.set(w, h)
    if (h < n) matched--
  }
  for (let i = 0; i < tokens.length; i++) {
    add(tokens[i])
    if (i >= size) drop(tokens[i - size])
    if (i >= size - 1 && matched >= goal) return 'close'
  }
  return 'missing'
}

// ---------------------------------------------------------------------------
// Confidence
// ---------------------------------------------------------------------------

/** How many different sites these URLs come from. */
export function independent(urls) {
  const set = new Set()
  for (const url of urls ?? []) {
    const d = registrableDomain(hostOf(url))
    if (d) set.add(d)
  }
  return set.size
}

const maxOf = (group) => {
  const list = (Array.isArray(group) ? group : [group]).map(Number).filter(Number.isFinite)
  return list.length ? Math.max(...list) : null
}

/**
 * Confidence in one fact.
 *
 * Inputs are grouped by independent domain — one site saying a thing twice is
 * one witness, so each group counts once, at its best trust. Each witness is
 * an independent chance of being right (noisy-OR, damped by 0.85 so no single
 * source is ever certainty), and the strongest contradiction then takes its
 * share away.
 *
 * @param {number[][]} supportTrusts    — one array of trusts per supporting domain
 * @param {number[][]} contradictTrusts — the same for contradicting domains
 */
export function factConfidence(supportTrusts = [], contradictTrusts = []) {
  let miss = 1
  for (const group of supportTrusts) {
    const t = maxOf(group)
    if (t !== null) miss *= 1 - 0.85 * clamp(t, 0, 1)
  }
  let p = 1 - miss
  const against = contradictTrusts.map(maxOf).filter((t) => t !== null)
  if (against.length) p *= 1 - 0.6 * clamp(Math.max(...against), 0, 1)
  return round2(clamp(p, 0, 0.98))
}

const WEIGHT = { corroborated: 1, single: 0.8, disputed: 0.6 }

/** The answer's confidence: the facts' confidences, discounted for single-source and disputed ones. */
export function overallConfidence(facts) {
  const list = (facts ?? []).filter((f) => Number.isFinite(f?.confidence))
  if (!list.length) return null
  const sum = list.reduce((s, f) => s + f.confidence * (WEIGHT[f.status] ?? 0.8), 0)
  return round2(sum / list.length)
}

/** ≥0.75 High, ≥0.5 Medium, else Low; null when there is nothing to judge. */
export function confidenceLabel(x) {
  if (x === null || x === undefined || !Number.isFinite(Number(x))) return null
  return x >= 0.75 ? 'High' : x >= 0.5 ? 'Medium' : 'Low'
}

// ---------------------------------------------------------------------------
// Same question?
// ---------------------------------------------------------------------------

/**
 * Words that carry no subject. Includes the ways of asking ("research",
 * "find out", "is it true"), so "research X" and "X?" are the same question.
 */
const STOP = new Set(
  ('a an the is are was were be been being am do does did done of in on at to for from by with about as into ' +
    'than then and or but if so nor not no what which who whom whose when where why how this that these those ' +
    'it its i me my we our you your he him his she her they them their there here can could should would will ' +
    'shall may might must any some very really just please tell research find out check whether know let ' +
    'us show give explain fact true false vs versus really s t has have had get got also more most')
    .split(' '),
)

const contentWords = (text) => normalise(text).split(' ').filter((w) => w && !STOP.has(w))

/** Jaccard similarity of two questions' content words, 0..1. */
export function sameQuestion(a, b) {
  const x = new Set(contentWords(a))
  const y = new Set(contentWords(b))
  if (!x.size || !y.size) return 0
  let both = 0
  for (const w of x) if (y.has(w)) both++
  return round2(both / (x.size + y.size - both))
}

/** One key per question however it is phrased: content words, deduplicated and sorted. */
export function questionKey(q) {
  return [...new Set(contentWords(q))].sort().join(' ')
}
