// Unit tests for bridge/platforms.mjs (researcher mode's platform retrievers) and the
// JSON / headers additions to bridge/net.mjs. No network: every fetch is a fake. `npm test`
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { gzipSync, deflateSync, brotliCompressSync } from 'node:zlib'
import {
  API_PLATFORMS, PLATFORM_INFO, cleanText, fetchJson, itemFromPage, parseArxiv, platformOf, resetBudgets,
  searchArxiv, searchGithub, searchHackerNews, searchStackOverflow, searchTerms, signalScore, siteQuery,
} from '../bridge/platforms.mjs'
import * as net from '../bridge/net.mjs'

beforeEach(() => resetBudgets())

/** A fake fetcher: the first route whose key is in the URL answers; every call is recorded. */
function fake(routes) {
  const calls = []
  const fn = async (url, opts) => {
    calls.push({ url, opts })
    for (const [key, reply] of Object.entries(routes)) {
      if (url.includes(key)) return typeof reply === 'function' ? reply(url, opts) : structuredClone(reply)
    }
    throw Object.assign(new Error('upstream said 404'), { status: 404, upstream: 404 })
  }
  fn.calls = calls
  return fn
}

const httpError = (status, extra = {}) =>
  Object.assign(new Error(`upstream said ${status}`), { status: status === 404 ? 404 : 502, upstream: status, ...extra })

const ITEM_KEYS = ['platform', 'url', 'title', 'kind', 'signals', 'signal', 'text', 'via']
function assertItem(item) {
  for (const key of ITEM_KEYS) assert.ok(key in item, `item has ${key}`)
  assert.ok(Object.hasOwn(PLATFORM_INFO, item.platform))
  assert.ok(['repo', 'issue', 'question', 'answer', 'post', 'thread', 'story', 'paper', 'page'].includes(item.kind))
  assert.ok(['api', 'page', 'search'].includes(item.via))
  assert.equal(typeof item.text, 'string')
  assert.ok(item.text.length <= 8000)
  if ('published' in item) assert.match(item.published, /^\d{4}-\d{2}-\d{2}T/)
  const s = signalScore(item)
  assert.ok(s >= 0 && s <= 1)
}

// ---------------------------------------------------------------------------
// Platforms
// ---------------------------------------------------------------------------

test('PLATFORM_INFO and API_PLATFORMS: the agreed keys, labels and domains', () => {
  assert.deepEqual(Object.keys(PLATFORM_INFO), ['reddit', 'quora', 'github', 'stackoverflow', 'hackernews', 'arxiv', 'web'])
  assert.equal(PLATFORM_INFO.stackoverflow.label, 'Stack Overflow')
  assert.deepEqual(PLATFORM_INFO.stackoverflow.domains, ['stackoverflow.com', 'stackexchange.com', 'superuser.com', 'serverfault.com', 'askubuntu.com'])
  assert.deepEqual(PLATFORM_INFO.web.domains, [])
  assert.deepEqual([...API_PLATFORMS], ['github', 'stackoverflow', 'hackernews', 'arxiv'])
})

test('platformOf: hosts and their subdomains, everything else is web', () => {
  assert.equal(platformOf('https://www.reddit.com/r/rust/comments/abc/x/'), 'reddit')
  assert.equal(platformOf('https://old.reddit.com/r/x'), 'reddit')
  assert.equal(platformOf('https://www.quora.com/What-is-X'), 'quora')
  assert.equal(platformOf('https://github.com/a/b'), 'github')
  assert.equal(platformOf('https://gist.github.com/a/1'), 'github')
  assert.equal(platformOf('https://unix.stackexchange.com/questions/1'), 'stackoverflow')
  assert.equal(platformOf('https://superuser.com/q/1'), 'stackoverflow')
  assert.equal(platformOf('https://news.ycombinator.com/item?id=1'), 'hackernews')
  assert.equal(platformOf('https://export.arxiv.org/abs/2101.00001'), 'arxiv')
  assert.equal(platformOf('https://GITHUB.COM./a/b'), 'github')
  // Look-alikes are not the platform.
  assert.equal(platformOf('https://notgithub.com/a'), 'web')
  assert.equal(platformOf('https://github.com.evil.example/a'), 'web')
  assert.equal(platformOf('https://ycombinator.com/'), 'web')
  assert.equal(platformOf('https://example.com/'), 'web')
  assert.equal(platformOf('not a url'), 'web')
  assert.equal(platformOf(''), 'web')
  assert.equal(platformOf(null), 'web')
})

test('siteQuery: a site: filter for search-only platforms, none for web', () => {
  assert.equal(siteQuery('  rust  async ', 'reddit'), 'rust async site:reddit.com')
  assert.equal(siteQuery('x', 'quora'), 'x site:quora.com')
  assert.match(siteQuery('x', 'stackoverflow'), /^x site:stackoverflow\.com OR site:stackexchange\.com OR /)
  assert.equal(siteQuery('x', 'web'), 'x')
  assert.equal(siteQuery('x', 'nope'), 'x')
})

test('searchTerms: stopwords out, tech names whole, capped, never empty for real words', () => {
  assert.deepEqual(searchTerms('What is the best way to fine-tune Llama on a single GPU?'), ['fine-tune', 'llama', 'single', 'gpu'])
  assert.deepEqual(searchTerms('C++ vs C# for game dev'), ['c++', 'c#', 'game', 'dev'])
  assert.deepEqual(searchTerms('How do I use Node.js streams with .NET?'), ['node.js', 'streams', '.net'])
  assert.deepEqual(searchTerms('facebook/react hooks'), ['facebook/react', 'hooks'])
  assert.deepEqual(searchTerms('a b c d e f g h', 3), ['b', 'c', 'd'])
  assert.deepEqual(searchTerms('what is it'), ['what', 'is', 'it'])
  assert.deepEqual(searchTerms('rust rust RUST'), ['rust'])
  assert.deepEqual(searchTerms('  ?!  '), [])
  assert.deepEqual(searchTerms(null), [])
})

// ---------------------------------------------------------------------------
// cleanText
// ---------------------------------------------------------------------------

test('cleanText: HTML to plain text — scripts gone, blocks become lines, entities decoded once', () => {
  const html =
    '<p>Hello <b>world</b> &amp; friends</p><script>alert(1)</script><style>p{}</style>' +
    '<ul><li>one</li><li>two</li></ul><pre><code>if (a &lt; b &amp;&amp; c) {}</code></pre><!-- secret --><br>end&nbsp;&#8212;&#x2713;'
  const out = cleanText(html)
  assert.ok(!/alert|p\{\}|secret|<b>|<p>/.test(out), out)
  assert.match(out, /^Hello world & friends$/m)
  assert.match(out, /^- one$/m)
  assert.match(out, /^- two$/m)
  // The escaped code sample survives as code text, not stripped as a tag.
  assert.match(out, /if \(a < b && c\) \{\}/)
  assert.match(out, /end —✓$/)
  // Decoded once: an escaped entity stays an entity.
  assert.equal(cleanText('&amp;lt;'), '&lt;')
})

test('cleanText: Markdown loses its syntax but keeps its words', () => {
  const md = [
    '# Title',
    '[![build](https://img.shields.io/x.svg)](https://ci.example) ![logo](logo.png)',
    'See [the docs](https://example.com/docs "Docs") and [ref][1].',
    '',
    '**Bold** and __strong__ and `inline <Suspense>` code.',
    '> quoted',
    '',
    '| a | b |',
    '|---|:-:|',
    '| 1 | 2 |',
    '',
    '```js',
    'const el = <div>hi</div>',
    '```',
    '---',
    '[1]: https://example.com/ref',
  ].join('\n')
  const out = cleanText(md)
  assert.ok(!/[#*`]|\]\(|\[\]|https:\/\/img|logo\.png|example\.com\/ref|\|---/.test(out), out)
  assert.match(out, /^Title$/m)
  assert.match(out, /See the docs and ref\./)
  assert.match(out, /Bold and strong and inline <Suspense> code\./)
  assert.match(out, /^quoted$/m)
  assert.match(out, /const el = <div>hi<\/div>/)
})

test('cleanText: invisible and control characters go; whitespace tidied; capped at a word', () => {
  assert.equal(cleanText('a\u200Bb\u202Ec\uFEFFd\u0007e'), 'abcd e')
  assert.equal(cleanText('  x \t\t y \n\n\n\n z  '), 'x y\n\nz')
  const long = 'word '.repeat(5000)
  const out = cleanText(long, 100)
  assert.ok(out.length <= 100)
  assert.match(out, /word…$/)
  assert.equal(cleanText('abc', 8000), 'abc')
  assert.equal(cleanText(null), '')
  assert.equal(cleanText(undefined), '')
  assert.ok(cleanText('x'.repeat(20_000)).length <= 8000)
})

// ---------------------------------------------------------------------------
// GitHub
// ---------------------------------------------------------------------------

const GH_REPOS = {
  total_count: 2,
  items: [
    {
      full_name: 'acme/vecdb', html_url: 'https://github.com/acme/vecdb', description: 'A fast <vector> DB',
      stargazers_count: 12345, forks_count: 678, language: 'Rust', topics: ['vector', 'database'],
      pushed_at: '2026-10-01T00:00:00Z', owner: { login: 'acme' },
    },
    {
      full_name: 'solo/tiny', html_url: 'https://github.com/solo/tiny', description: null,
      stargazers_count: 3, forks_count: 0, pushed_at: '2019-01-01T00:00:00Z', owner: { login: 'solo' }, archived: true,
    },
    { full_name: '../../evil', html_url: 'https://github.com/x' },
  ],
}
const GH_ISSUES = {
  items: [
    {
      html_url: 'https://github.com/acme/vecdb/issues/42', number: 42, title: '<Suspense> breaks the index',
      body: '## Repro\n\n```js\nconst x = <A/>\n```\n**Expected** it works', comments: 17, state: 'closed',
      reactions: { total_count: 30 }, user: { login: 'bob' }, created_at: '2026-09-01T10:00:00Z',
      repository_url: 'https://api.github.com/repos/acme/vecdb',
    },
    { html_url: 'https://evil.example/x', title: 'not github' },
  ],
}

test('searchGithub: repositories (+ README) and issues parsed into Items, through the right endpoints', async () => {
  const fetchJson = fake({ '/search/repositories': GH_REPOS, '/search/issues': GH_ISSUES })
  const fetchText = fake({ '/repos/acme/vecdb/readme': { text: '# VecDB\n\n[![ci](b.svg)](ci) Fast **vectors**.' } })
  const items = await searchGithub('What is the best vector database?', { fetchJson, fetchText, limit: 5, readmes: 3 })

  assert.equal(fetchJson.calls.length, 2)
  const [repoCall, issueCall] = fetchJson.calls
  const repoUrl = new URL(repoCall.url)
  assert.equal(repoUrl.origin + repoUrl.pathname, 'https://api.github.com/search/repositories')
  assert.equal(repoUrl.searchParams.get('q'), 'vector database in:name,description,topics')
  assert.equal(repoUrl.searchParams.get('per_page'), '5')
  assert.equal(new URL(issueCall.url).searchParams.get('q'), 'vector database is:issue comments:>1')
  assert.match(repoCall.opts.headers['user-agent'], /\S/)
  assert.equal(repoCall.opts.headers.accept, 'application/vnd.github+json')
  // READMEs: only valid repo names, raw accept header.
  assert.deepEqual(fetchText.calls.map((c) => c.url), ['https://api.github.com/repos/acme/vecdb/readme', 'https://api.github.com/repos/solo/tiny/readme'])
  assert.equal(fetchText.calls[0].opts.headers.accept, 'application/vnd.github.raw')

  assert.equal(items.length, 3)
  items.forEach(assertItem)
  const [repo, tiny, issue] = items
  assert.equal(repo.kind, 'repo')
  assert.equal(repo.platform, 'github')
  assert.equal(repo.via, 'api')
  assert.equal(repo.url, 'https://github.com/acme/vecdb')
  // A plain-text description keeps its angle brackets.
  assert.equal(repo.title, 'acme/vecdb — A fast <vector> DB')
  assert.equal(repo.author, 'acme')
  assert.equal(repo.published, '2026-10-01T00:00:00.000Z')
  assert.deepEqual(repo.signals, { stars: 12345, forks: 678 })
  assert.match(repo.signal, /^12k stars · 678 forks · Rust · updated 2026-10-01$/)
  assert.match(repo.text, /Topics: vector, database/)
  assert.match(repo.text, /README:\nVecDB\n\nFast vectors\./)
  assert.equal(tiny.title, 'solo/tiny')
  assert.match(tiny.signal, /archived/)
  assert.equal(issue.kind, 'issue')
  assert.equal(issue.title, 'acme/vecdb#42: <Suspense> breaks the index')
  assert.equal(issue.author, 'bob')
  assert.deepEqual(issue.signals, { comments: 17, score: 30 })
  assert.equal(issue.signal, '30 reactions · 17 comments · closed')
  assert.match(issue.text, /^Repro\n\nconst x = <A\/>\n\nExpected it works$/)
})

test('searchGithub: readmes limit respected, a README failure leaves the description', async () => {
  const fetchJson = fake({ '/search/repositories': GH_REPOS, '/search/issues': { items: [] } })
  const fetchText = fake({ '/readme': () => Promise.reject(httpError(404)) })
  const items = await searchGithub('vector db', { fetchJson, fetchText, readmes: 1 })
  assert.equal(fetchText.calls.length, 1)
  assert.equal(items[0].text, 'A fast <vector> DB\nTopics: vector, database\nLanguage: Rust')
  const none = fake({})
  await searchGithub('vector db', { fetchJson, fetchText: none, readmes: 0 })
  assert.equal(none.calls.length, 0)
})

test('searchGithub: one search failing returns the other; both failing throws', async () => {
  const half = fake({ '/search/repositories': () => Promise.reject(httpError(500)), '/search/issues': GH_ISSUES })
  const items = await searchGithub('vector db', { fetchJson: half, fetchText: fake({}) })
  assert.deepEqual(items.map((i) => i.kind), ['issue'])
  const dead = fake({ '/search/': () => Promise.reject(httpError(500)) })
  await assert.rejects(searchGithub('vector db', { fetchJson: dead, fetchText: fake({}) }), /upstream said 500/)
  // Nothing searchable: no request at all.
  const idle = fake({})
  assert.deepEqual(await searchGithub('   ', { fetchJson: idle }), [])
  assert.equal(idle.calls.length, 0)
})

test('searchGithub: the search budget (8 a minute) refuses at once without calling the API', async () => {
  const fetchJson = fake({ '/search/repositories': { items: [] }, '/search/issues': { items: [] } })
  for (let i = 0; i < 4; i++) await searchGithub('x', { fetchJson, fetchText: fake({}) })
  assert.equal(fetchJson.calls.length, 8)
  await assert.rejects(searchGithub('x', { fetchJson, fetchText: fake({}) }), (err) => err.code === 'RATE_LIMITED' && err.api === 'github-search')
  assert.equal(fetchJson.calls.length, 8)
})

test('searchGithub: a 403 rate limit pauses GitHub search for as long as it asked', async () => {
  const limited = fake({ '/search/': () => Promise.reject(httpError(403, { retryAfterMs: 30_000 })) })
  await assert.rejects(searchGithub('x', { fetchJson: limited, fetchText: fake({}) }), /upstream said 403/)
  const ok = fake({ '/search/': { items: [] } })
  await assert.rejects(searchGithub('x', { fetchJson: ok, fetchText: fake({}) }), (err) => {
    assert.equal(err.code, 'RATE_LIMITED')
    assert.ok(err.retryInMs > 0 && err.retryInMs <= 30_000)
    return true
  })
  assert.equal(ok.calls.length, 0)
})

// ---------------------------------------------------------------------------
// Stack Overflow
// ---------------------------------------------------------------------------

const SE_SEARCH = {
  items: [
    {
      question_id: 11, title: 'Why is &quot;x&quot; slow?', link: 'https://stackoverflow.com/questions/11/why-is-x-slow',
      score: 250, answer_count: 4, accepted_answer_id: 101, view_count: 120000, tags: ['python', 'performance'],
      owner: { display_name: 'Ann &amp; Co' }, creation_date: 1700000000, body: '<p>My <code>x</code> is slow &amp; sad.</p>',
    },
    {
      question_id: 12, title: 'Unanswered', link: 'https://stackoverflow.com/questions/12/u', score: 0, answer_count: 0,
      creation_date: 1700000000, body: '<p>?</p>',
    },
    { question_id: 13, title: 'Bad link', link: 'https://evil.example/q/13' },
  ],
  quota_remaining: 290,
}
const SE_ANSWERS = {
  items: [
    { answer_id: 102, question_id: 11, score: 300, is_accepted: false, body: '<p>Use <b>y</b>.</p>', owner: { display_name: 'Top' }, creation_date: 1700001000 },
    { answer_id: 101, question_id: 11, score: 90, is_accepted: true, body: '<p>Accepted.</p>', owner: { display_name: 'Acc' }, creation_date: 1700000500 },
    { answer_id: 103, question_id: 11, score: 5, is_accepted: false, body: '<p>Meh.</p>', creation_date: 1700002000 },
  ],
  quota_remaining: 289,
}

test('searchStackOverflow: questions with their top answers, titles decoded, signals right', async () => {
  const fetchJson = fake({ '/search/advanced': SE_SEARCH, '/answers': SE_ANSWERS })
  const items = await searchStackOverflow('why is python slow', { fetchJson, limit: 5, answers: 2 })

  const search = new URL(fetchJson.calls[0].url)
  assert.equal(search.origin + search.pathname, 'https://api.stackexchange.com/2.3/search/advanced')
  for (const [k, v] of Object.entries({ order: 'desc', sort: 'relevance', site: 'stackoverflow', filter: 'withbody', pagesize: '5', q: 'python slow' })) {
    assert.equal(search.searchParams.get(k), v, k)
  }
  // Only the answered question's answers are asked for, by votes.
  const answers = new URL(fetchJson.calls[1].url)
  assert.equal(answers.pathname, '/2.3/questions/11/answers')
  assert.equal(answers.searchParams.get('sort'), 'votes')
  assert.equal(answers.searchParams.get('filter'), 'withbody')

  items.forEach(assertItem)
  assert.deepEqual(items.map((i) => i.kind), ['question', 'answer', 'answer', 'question'])
  const [q, a1, a2, q2] = items
  assert.equal(q.title, 'Why is "x" slow?')
  assert.equal(q.author, 'Ann & Co')
  assert.equal(q.published, '2023-11-14T22:13:20.000Z')
  assert.deepEqual(q.signals, { score: 250, answers: 4, accepted: true })
  assert.equal(q.signal, '250 votes · 4 answers · has an accepted answer · 120k views')
  assert.match(q.text, /^My x is slow & sad\.\n\nTags: python, performance$/)
  assert.equal(a1.url, 'https://stackoverflow.com/a/102')
  assert.equal(a1.title, 'Answer: Why is "x" slow?')
  assert.deepEqual(a1.signals, { score: 300, accepted: false })
  assert.equal(a1.text, 'Use y.')
  assert.equal(a2.url, 'https://stackoverflow.com/a/101')
  assert.equal(a2.signal, '90 votes · accepted answer')
  assert.equal(q2.title, 'Unanswered')
})

test('searchStackOverflow: no answered questions means no answers call; answers failure keeps questions', async () => {
  const only = fake({ '/search/advanced': { items: [SE_SEARCH.items[1]] } })
  assert.equal((await searchStackOverflow('x', { fetchJson: only })).length, 1)
  assert.equal(only.calls.length, 1)
  const broken = fake({ '/search/advanced': SE_SEARCH, '/answers': () => Promise.reject(httpError(500)) })
  assert.deepEqual((await searchStackOverflow('x', { fetchJson: broken })).map((i) => i.kind), ['question', 'question'])
})

test('searchStackOverflow: backoff and throttle errors are obeyed', async () => {
  const backoff = fake({ '/search/advanced': { ...SE_SEARCH, backoff: 10 }, '/answers': SE_ANSWERS })
  const items = await searchStackOverflow('x', { fetchJson: backoff })
  // The answers call waited out the backoff by not happening.
  assert.equal(backoff.calls.length, 1)
  assert.equal(items.length, 2)
  await assert.rejects(searchStackOverflow('x', { fetchJson: backoff }), (err) => err.code === 'RATE_LIMITED')

  resetBudgets()
  const throttled = fake({
    '/search/advanced': () =>
      Promise.reject(httpError(400, { body: { error_id: 502, error_name: 'throttle_violation', error_message: 'too many requests from this IP, more requests available in 120 seconds' } })),
  })
  await assert.rejects(searchStackOverflow('x', { fetchJson: throttled }), /upstream said 400/)
  await assert.rejects(searchStackOverflow('x', { fetchJson: throttled }), (err) => err.code === 'RATE_LIMITED' && err.retryInMs <= 120_000)
  assert.equal(throttled.calls.length, 1)
})

// ---------------------------------------------------------------------------
// Hacker News
// ---------------------------------------------------------------------------

const HN_SEARCH = {
  hits: [
    { objectID: '100', title: 'Show HN: VecDB', url: 'https://vecdb.example/', author: 'pg', points: 812, num_comments: 3, created_at: '2025-05-01T12:00:00.000Z' },
    { objectID: '200', title: 'Ask HN: Which vector DB?', author: 'q', points: 40, num_comments: 2, created_at_i: 1700000000, story_text: '<p>Asking &amp; wondering</p>' },
    { objectID: '300', title: 'No comments', url: 'javascript:alert(1)', points: 1, num_comments: 0, created_at: '2025-01-01T00:00:00.000Z' },
    { objectID: 'nope', title: 'bad id' },
  ],
}
const HN_ITEM = {
  id: 100,
  children: [
    { id: 1, author: 'quiet', text: '<p>One reply</p>', children: [{ id: 11, text: 'x', children: [] }] },
    { id: 2, author: 'deleted', text: null, children: [{ id: 21, children: [] }, { id: 22, children: [] }, { id: 23, children: [] }] },
    { id: 3, author: 'busy', text: 'Lots of &quot;replies&quot;', children: [{ id: 31, children: [{ id: 32, children: [] }] }, { id: 33, children: [] }] },
  ],
}

test('searchHackerNews: stories with their most-discussed comments folded in', async () => {
  const fetchJson = fake({ '/search?': HN_SEARCH, '/items/100': HN_ITEM, '/items/200': { children: [] } })
  const items = await searchHackerNews('vector database', { fetchJson, comments: 1 })

  const search = new URL(fetchJson.calls[0].url)
  assert.equal(search.origin + search.pathname, 'https://hn.algolia.com/api/v1/search')
  assert.equal(search.searchParams.get('query'), 'vector database')
  assert.equal(search.searchParams.get('tags'), 'story')
  assert.equal(search.searchParams.get('hitsPerPage'), '5')
  // comments: 1 → only the first discussed story's thread.
  assert.deepEqual(fetchJson.calls.slice(1).map((c) => c.url), ['https://hn.algolia.com/api/v1/items/100'])

  items.forEach(assertItem)
  assert.equal(items.length, 3)
  const [show, ask, quiet] = items
  assert.equal(show.url, 'https://news.ycombinator.com/item?id=100')
  assert.equal(show.kind, 'story')
  assert.deepEqual(show.signals, { score: 812, comments: 3 })
  assert.equal(show.signal, '812 points · 3 comments')
  // Most replies first; deleted comments skipped.
  assert.equal(show.text, 'Links to: https://vecdb.example/\n\nTop comments:\n\nbusy: Lots of "replies"\n\nquiet: One reply')
  assert.equal(ask.text, 'Asking & wondering')
  assert.equal(ask.published, '2023-11-14T22:13:20.000Z')
  // A non-http link is not passed on.
  assert.equal(quiet.text, '')
})

test('searchHackerNews: a thread that will not load leaves the story; the search failing throws', async () => {
  const fetchJson = fake({ '/search?': HN_SEARCH, '/items/': () => Promise.reject(httpError(413)) })
  const items = await searchHackerNews('x', { fetchJson, comments: 2 })
  assert.equal(fetchJson.calls.length, 3)
  assert.equal(items[0].text, 'Links to: https://vecdb.example/')
  await assert.rejects(searchHackerNews('x', { fetchJson: fake({}) }), /404/)
})

// ---------------------------------------------------------------------------
// arXiv
// ---------------------------------------------------------------------------

const atom = (entries) => `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">
  <title type="html">ArXiv Query: search_query=all:x</title>
  ${entries.join('\n')}
</feed>`
const ENTRY_A = `<entry>
    <id>http://arxiv.org/abs/2303.16780v2</id>
    <published>2023-03-25T23:56:23Z</published>
    <title>Thistle: A Vector
      Database in Rust &amp; More</title>
    <summary>  We present Thistle, where a &lt; b holds.
    </summary>
    <author><name>Brad Windsor</name></author>
    <author><name>Kevin Choi</name></author>
    <author><name>Third Person</name></author>
    <author><name>Fourth Person</name></author>
    <arxiv:journal_ref>VLDB 2024</arxiv:journal_ref>
    <link href="http://arxiv.org/abs/2303.16780v2" rel="alternate" type="text/html"/>
    <arxiv:primary_category xmlns:arxiv="http://arxiv.org/schemas/atom" term="cs.IR" scheme="http://arxiv.org/schemas/atom"/>
  </entry>`
const ENTRY_B = `<entry>
    <id>http://arxiv.org/abs/hep-th/9901001v1</id>
    <published>1999-01-01T00:00:00Z</published>
    <title>Old style id</title>
    <summary>Strings.</summary>
    <author><name>Solo</name></author>
  </entry>`

test('parseArxiv: Atom entries as papers — https abs URL without version, authors, journal, entities once', () => {
  const [a, b] = parseArxiv(atom([ENTRY_A, ENTRY_B]))
  assertItem(a)
  assert.equal(a.url, 'https://arxiv.org/abs/2303.16780')
  assert.equal(a.title, 'Thistle: A Vector Database in Rust & More')
  assert.equal(a.author, 'Brad Windsor, Kevin Choi, Third Person et al.')
  assert.equal(a.published, '2023-03-25T23:56:23.000Z')
  assert.equal(a.kind, 'paper')
  assert.deepEqual(a.signals, { accepted: true })
  assert.equal(a.signal, 'published: VLDB 2024 · cs.IR · 4 authors')
  assert.equal(a.text, 'We present Thistle, where a < b holds.\n\nJournal: VLDB 2024')
  assert.equal(b.url, 'https://arxiv.org/abs/hep-th/9901001')
  assert.equal(b.signal, 'preprint · 1 author')
  assert.deepEqual(parseArxiv(atom([])), [])
  assert.deepEqual(parseArxiv(''), [])
  const error = '<entry><id>http://arxiv.org/api/errors#incorrect_id_format</id><title>Error</title><summary>incorrect id format</summary></entry>'
  assert.throws(() => parseArxiv(atom([error])), /arXiv refused the query: incorrect id format/)
})

test('searchArxiv: every word required first, alternatives once if that finds nothing', async () => {
  let n = 0
  const fetchText = fake({ 'export.arxiv.org/api/query': () => ({ text: atom(n++ === 0 ? [] : [ENTRY_A]) }) })
  const items = await searchArxiv('How do vector databases scale?', { fetchText, spacingMs: 0 })
  assert.equal(fetchText.calls.length, 2)
  const first = new URL(fetchText.calls[0].url)
  assert.equal(first.origin + first.pathname, 'https://export.arxiv.org/api/query')
  assert.equal(first.searchParams.get('search_query'), 'all:vector AND all:databases AND all:scale')
  assert.equal(first.searchParams.get('sortBy'), 'relevance')
  assert.equal(first.searchParams.get('max_results'), '5')
  assert.equal(new URL(fetchText.calls[1].url).searchParams.get('search_query'), 'all:vector OR all:databases OR all:scale')
  assert.equal(fetchText.calls[0].opts.accept, 'application/atom+xml')
  assert.equal(items.length, 1)

  const once = fake({ 'export.arxiv.org': { text: atom([ENTRY_A, ENTRY_B]) } })
  assert.equal((await searchArxiv('vector', { fetchText: once, limit: 1, spacingMs: 0 })).length, 1)
  assert.equal(once.calls.length, 1)
})

test('searchArxiv: requests are spaced (arXiv asks for one every 3 seconds)', async () => {
  const fetchText = fake({ 'export.arxiv.org': { text: atom([ENTRY_A]) } })
  const started = Date.now()
  await Promise.all([searchArxiv('a', { fetchText, spacingMs: 150 }), searchArxiv('b', { fetchText, spacingMs: 150 })])
  assert.ok(Date.now() - started >= 140, 'the second call waited for its slot')
  assert.equal(fetchText.calls.length, 2)
})

test('searches honour an abort signal', async () => {
  const ctl = new AbortController()
  ctl.abort()
  await assert.rejects(searchHackerNews('x', { fetchJson: fake({ '/search?': HN_SEARCH }), signal: ctl.signal }), { name: 'AbortError' })
  const slow = new AbortController()
  const never = () => new Promise(() => {})
  const pending = searchStackOverflow('x', { fetchJson: never, signal: slow.signal })
  slow.abort()
  await assert.rejects(pending, { name: 'AbortError' })
})

// ---------------------------------------------------------------------------
// itemFromPage
// ---------------------------------------------------------------------------

test('itemFromPage: platform and kind from the URL, via kept, optional fields left out', () => {
  const kind = (url) => itemFromPage({ url, title: 't', text: 'x' }).kind
  assert.equal(kind('https://www.reddit.com/r/rust/comments/abc/title/'), 'thread')
  assert.equal(kind('https://www.reddit.com/r/rust/'), 'page')
  assert.equal(kind('https://www.quora.com/What-is-Rust'), 'question')
  assert.equal(kind('https://www.quora.com/What-is-Rust/answer/Jane-Doe'), 'answer')
  assert.equal(kind('https://www.quora.com/profile/Jane'), 'page')
  assert.equal(kind('https://github.com/a/b'), 'repo')
  assert.equal(kind('https://github.com/a/b/issues/3'), 'issue')
  assert.equal(kind('https://github.com/a/b/discussions/9'), 'issue')
  assert.equal(kind('https://github.com/a/b/blob/main/x.md'), 'page')
  assert.equal(kind('https://stackoverflow.com/questions/1/x'), 'question')
  assert.equal(kind('https://stackoverflow.com/a/5'), 'answer')
  assert.equal(kind('https://news.ycombinator.com/item?id=1'), 'story')
  assert.equal(kind('https://arxiv.org/abs/2101.00001'), 'paper')
  assert.equal(kind('https://example.com/post'), 'page')

  const item = itemFromPage(
    { url: 'https://www.reddit.com/r/x/comments/1/y/', title: 'Rust &amp; me', text: 'Plain text with a <div> in it.\u200B', signals: { score: '42', bogus: 1 } },
    'nonsense',
    'search',
  )
  assertItem(item)
  assert.equal(item.platform, 'reddit')
  assert.equal(item.via, 'search')
  assert.equal(item.title, 'Rust &amp; me')
  // Plain text keeps its '<div>'; invisible characters still go.
  assert.equal(item.text, 'Plain text with a <div> in it.')
  assert.deepEqual(item.signals, { score: 42 })
  assert.ok(!('author' in item) && !('published' in item))

  const html = itemFromPage({ url: 'https://example.com/a', title: 'T', text: '<p>Para <b>one</b></p><p>two</p>', author: 'Jo', published: '2024-05-01' }, 'web')
  assert.equal(html.text, 'Para one\n\ntwo')
  assert.equal(html.author, 'Jo')
  assert.equal(html.published, '2024-05-01T00:00:00.000Z')
  assert.equal(html.via, 'page')
  assert.equal(html.signal, '')
  assert.equal(itemFromPage({ url: 'https://example.com/', text: 'x'.repeat(20_000) }, 'web', 'weird').via, 'page')
  assert.equal(itemFromPage({ url: 'https://example.com/', text: 'x'.repeat(20_000) }).text.length <= 8000, true)
  // A known platform key given by the caller wins over the URL.
  assert.equal(itemFromPage({ url: 'https://example.com/x' }, 'quora').platform, 'quora')
  assert.equal(itemFromPage({ url: 'https://example.com/x' }).title, 'https://example.com/x')
})

// ---------------------------------------------------------------------------
// signalScore
// ---------------------------------------------------------------------------

test('signalScore: more votes, stars and points score higher; accepted beats not; unknown is neutral', () => {
  const s = (kind, signals) => signalScore({ kind, signals })
  assert.ok(s('repo', { stars: 50_000, forks: 5_000 }) > s('repo', { stars: 500, forks: 20 }))
  assert.ok(s('repo', { stars: 500, forks: 20 }) > s('repo', { stars: 3, forks: 0 }))
  assert.equal(s('repo', { stars: 50_000, forks: 5_000 }), 1)
  assert.ok(s('answer', { score: 120, accepted: true }) > s('answer', { score: 120, accepted: false }))
  assert.ok(s('answer', { score: 120, accepted: false }) > s('answer', { score: 3, accepted: false }))
  assert.equal(s('answer', { score: -5, accepted: false }), 0)
  assert.ok(s('question', { score: 250, answers: 4, accepted: true }) > s('question', { score: 2, answers: 0, accepted: false }))
  assert.ok(s('story', { score: 900, comments: 400 }) > s('story', { score: 12, comments: 1 }))
  assert.ok(s('issue', { comments: 80, score: 50 }) > s('issue', { comments: 1, score: 0 }))
  assert.ok(s('paper', { accepted: true }) > s('paper', {}))
  assert.equal(s('paper', {}), 0.5)
  // No counts at all: unknown, not bad.
  assert.equal(s('thread', {}), 0.3)
  assert.equal(s('page', {}), 0.3)
  assert.ok(s('thread', { score: 3000, comments: 500 }) > s('thread', {}))
  for (const bad of [null, undefined, {}, { kind: 'repo', signals: null }, { kind: 'answer', signals: { score: 'lots' } }]) {
    const x = signalScore(bad)
    assert.ok(x >= 0 && x <= 1, String(x))
  }
})

// ---------------------------------------------------------------------------
// net.mjs: headers option, JSON reading
// ---------------------------------------------------------------------------

test('net.textRequestHeaders: defaults unchanged without headers; headers merge over them case-insensitively', () => {
  const old = {
    'user-agent': net.PROXY_UA,
    accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
    'accept-language': 'en-GB,en;q=0.9',
    'accept-encoding': 'identity',
  }
  assert.deepEqual(net.textRequestHeaders(), old)
  assert.deepEqual(net.textRequestHeaders({}), old)
  assert.deepEqual(net.textRequestHeaders({ accept: 'text/plain' }), { ...old, accept: 'text/plain' })
  const merged = net.textRequestHeaders({ accept: 'text/plain', headers: { 'User-Agent': 'bot/1', Accept: 'application/x', 'X-Extra': 'y', 'accept-language': null } })
  assert.deepEqual(merged, { ...old, 'user-agent': 'bot/1', accept: 'application/x', 'x-extra': 'y' })
  // fetchText cannot decompress, so a caller cannot ask for gzip.
  assert.equal(net.textRequestHeaders({ headers: { 'Accept-Encoding': 'gzip' } })['accept-encoding'], 'identity')
  assert.deepEqual(net.mergeHeaders({ a: '1' }, undefined), { a: '1' })
})

test('net.fetchText and fetchJson: the SSRF gate still comes first, with or without headers', async () => {
  await assert.rejects(net.fetchText('http://127.0.0.1:8787/health', { maxBytes: 10, timeoutMs: 100 }), { status: 403 })
  await assert.rejects(net.fetchText('http://localhost/', { maxBytes: 10, timeoutMs: 100, headers: { 'x-a': 'b' } }), { status: 403 })
  await assert.rejects(fetchJson('http://169.254.169.254/latest/meta-data'), { status: 403 })
  await assert.rejects(fetchJson('file:///etc/passwd'), { status: 400 })
  const ctl = new AbortController()
  ctl.abort()
  await assert.rejects(fetchJson('https://api.github.com/', { signal: ctl.signal }), { name: 'AbortError' })
  assert.equal(fetchJson, net.fetchJson)
})

test('net.decodeBody: gzip, deflate (wrapped or raw), br, identity — with the output cap', () => {
  const json = Buffer.from(JSON.stringify({ ok: true, list: [1, 2, 3] }))
  assert.deepEqual(net.decodeBody(gzipSync(json), 'gzip'), json)
  assert.deepEqual(net.decodeBody(deflateSync(json), 'deflate'), json)
  assert.deepEqual(net.decodeBody(brotliCompressSync(json), 'br'), json)
  assert.deepEqual(net.decodeBody(json, undefined), json)
  assert.deepEqual(net.decodeBody(json, 'identity'), json)
  const bomb = gzipSync(Buffer.alloc(1_000_000, 0x20))
  assert.throws(() => net.decodeBody(bomb, 'gzip', 10_000), { status: 413 })
  assert.throws(() => net.decodeBody(Buffer.from('not gzip'), 'gzip'), { status: 502 })
  assert.throws(() => net.decodeBody(json, 'zstd'), { status: 502 })
})

const response = (status, body, headers = {}) => Object.assign(Readable.from([Buffer.from(body)]), { statusCode: status, headers })

test('net.readJsonResponse: parses 2xx (gzipped too), explains errors, refuses non-JSON and oversize', async () => {
  assert.deepEqual(await net.readJsonResponse(response(200, '{"a":1}')), { a: 1 })
  assert.deepEqual(await net.readJsonResponse(response(200, '\uFEFF[1]')), [1])
  const gz = Object.assign(Readable.from([gzipSync('{"items":[]}')]), { statusCode: 200, headers: { 'content-encoding': 'gzip' } })
  assert.deepEqual(await net.readJsonResponse(gz), { items: [] })
  assert.equal(await net.readJsonResponse(response(204, '')), null)
  await assert.rejects(net.readJsonResponse(response(200, '<html>')), { status: 502, message: 'not JSON' })
  await assert.rejects(net.readJsonResponse(response(200, '{"a":"' + 'x'.repeat(100) + '"}'), { maxBytes: 50 }), { status: 413 })

  const reset = Math.floor(Date.now() / 1000) + 60
  await assert.rejects(
    net.readJsonResponse(response(403, '{"message":"API rate limit exceeded"}', { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) })),
    (err) => {
      assert.equal(err.status, 502)
      assert.equal(err.upstream, 403)
      assert.ok(err.retryAfterMs > 50_000 && err.retryAfterMs <= 60_000)
      assert.deepEqual(err.body, { message: 'API rate limit exceeded' })
      return true
    },
  )
  await assert.rejects(net.readJsonResponse(response(429, 'slow down', { 'retry-after': '7' })), (err) => err.upstream === 429 && err.retryAfterMs === 7000 && err.body === null)
  await assert.rejects(net.readJsonResponse(response(404, '{}')), { status: 404, upstream: 404 })
})
