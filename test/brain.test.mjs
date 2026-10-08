// Unit tests for bridge/brain.mjs — the turn record, the depth line and the web results it passes on. `npm test`
// No Claude here: a fake session stands in for the SDK's query().
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RESULT_TEXT_MAX, createBrain, resultText, webResultEvent } from '../bridge/brain.mjs'
import { rankQuery } from '../bridge/triage.mjs'

const gate = { builtins: [], disallowed: [], decide: () => true, review: () => ({ verdict: 'allow' }) }
const store = { get: () => null, set() {}, delete() {} }

/**
 * A fake SDK session: init, then for each question it receives, that turn's
 * scripted messages and a successful result. Records every message sent in.
 */
function rig(turns = []) {
  const sent = []
  const events = []
  const logged = []
  let waiters = []
  const run = ({ prompt }) => {
    async function* session() {
      yield { type: 'system', subtype: 'init', session_id: 's1', mcp_servers: [] }
      let i = 0
      for await (const user of prompt) {
        sent.push(user.message.content)
        for (const m of turns[i] ?? []) yield m
        i++
        yield { type: 'result', subtype: 'success', is_error: false, result: `answer ${i}`, session_id: 's1', total_cost_usd: 0 }
      }
    }
    const it = session()
    it.interrupt = async () => {}
    it.close = () => {}
    return it
  }
  const brain = createBrain({
    model: 'test', effort: 'low', gate, mcpServers: {}, store, sleepMinutes: 0, run,
    audit: { log: (e) => logged.push(e) },
  })
  const conversation = brain.open({
    systemPrompt: 'test',
    emit: (e) => {
      events.push(e)
      if (e.type === 'done' || e.type === 'error') {
        const ready = waiters
        waiters = []
        for (const w of ready) w(e)
      }
    },
  })
  const done = () => new Promise((resolve) => waiters.push(resolve))
  return { conversation, sent, events, logged, done }
}

test('turn(): null before the first question, then the question being answered in the owner\'s words', async () => {
  const r = rig()
  assert.equal(r.conversation.turn(), null)
  const rank = rankQuery('research the impact of AI on jobs in India')
  const finished = r.done()
  r.conversation.ask('research the impact of AI on jobs in India', 'a1', { rank })
  await finished
  assert.deepEqual(r.conversation.turn(), { ask: 'a1', rank, text: 'research the impact of AI on jobs in India' })
  // A job asks with its brief; meta.text keeps the owner's words for turn().
  const next = r.done()
  r.conversation.ask('[Background job]\nDo this: open notepad', 'job1', { text: 'open notepad' })
  await next
  assert.deepEqual(r.conversation.turn(), { ask: 'job1', rank: null, text: 'open notepad' })
  r.conversation.close()
})

test('the depth line goes in front of a complex question only, the stamp unchanged', async () => {
  const r = rig()
  let finished = r.done()
  r.conversation.ask('compare iPhone 17 and Pixel 10 for camera, battery and price', 'a1', {
    rank: rankQuery('compare iPhone 17 and Pixel 10 for camera, battery and price'),
  })
  await finished
  finished = r.done()
  r.conversation.ask('gold price today', 'a2', { rank: rankQuery('gold price today') })
  await finished
  finished = r.done()
  r.conversation.ask('why is the sky blue', 'a3', { rank: rankQuery('why is the sky blue') })
  await finished
  finished = r.done()
  r.conversation.ask('no rank at all', 'a4')
  await finished
  assert.match(r.sent[0], /^\[Depth 8\/10 · complex: comparison, several parts · use the research tool\]\n\[Now: [^\]]+\]\ncompare iPhone 17/)
  assert.match(r.sent[1], /^\[Now: [^\]]+\]\ngold price today$/)
  assert.match(r.sent[2], /^\[Now: [^\]]+\]\nwhy is the sky blue$/)
  assert.match(r.sent[3], /^\[Now: [^\]]+\]\nno rank at all$/)
  // The audit line says how deep it was ranked, never more than the question.
  const questions = r.logged.filter((e) => e.type === 'question')
  assert.equal(questions[0].level, 'complex')
  assert.equal(questions[0].depth, 8)
  assert.equal(questions[3].depth, undefined)
  r.conversation.close()
})

const fetchTurn = [
  { type: 'stream_event', event: { type: 'content_block_start', content_block: { type: 'tool_use', id: 't1', name: 'WebFetch', input: {} } } },
  { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'WebFetch', input: { url: 'https://example.com/gold', prompt: 'the price' } }] } },
  {
    type: 'user',
    message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'Gold is ₹1,23,450 for 10 g today.' }] },
    tool_use_result: { url: 'https://example.com/gold', code: 200, codeText: 'OK', result: 'Gold is ₹1,23,450 for 10 g today.', bytes: 900, durationMs: 40 },
  },
]

const searchTurn = [
  { type: 'assistant', message: { content: [{ type: 'tool_use', id: 's1', name: 'WebSearch', input: { query: 'gold price' } }] } },
  {
    type: 'user',
    message: {
      content: [{
        type: 'tool_result',
        tool_use_id: 's1',
        content: 'Web search results for query: "gold price"\n\nLinks: [{"title":"Gold rate today","url":"https://example.com/gold"}]\n\nGold is ₹1,23,450.',
      }],
    },
  },
]

test('a page WebFetch read becomes a fetched event with its URL and text', async () => {
  const r = rig([fetchTurn])
  const finished = r.done()
  r.conversation.ask('gold price', 'a1')
  await finished
  const fetched = r.events.filter((e) => e.type === 'fetched')
  assert.deepEqual(fetched, [{ type: 'fetched', url: 'https://example.com/gold', text: 'Gold is ₹1,23,450 for 10 g today.', ask: 'a1' }])
  r.conversation.close()
})

test('a web search\'s sources event carries the result text too', async () => {
  const r = rig([searchTurn])
  const finished = r.done()
  r.conversation.ask('gold price', 'a1')
  await finished
  const sources = r.events.filter((e) => e.type === 'sources')
  assert.equal(sources.length, 1)
  assert.equal(sources[0].query, 'gold price')
  assert.deepEqual(sources[0].links, [{ title: 'Gold rate today', url: 'https://example.com/gold' }])
  assert.match(sources[0].text, /Gold is ₹1,23,450\.$/)
  assert.equal(sources[0].ask, 'a1')
  r.conversation.close()
})

test('show_data and display light no tool badge; other tools still do', async () => {
  const use = (id, name) => ({ type: 'stream_event', event: { type: 'content_block_start', content_block: { type: 'tool_use', id, name, input: {} } } })
  const r = rig([[use('u1', 'mcp__ayra__show_data'), use('u2', 'mcp__ayra__display'), use('u3', 'mcp__ayra_research__research')]])
  const finished = r.done()
  r.conversation.ask('x', 'a1')
  await finished
  assert.deepEqual(r.events.filter((e) => e.type === 'tool').map((e) => e.name), ['mcp__ayra_research__research'])
  r.conversation.close()
})

test('webResultEvent: failures, other hosts and other tools pass nothing on', () => {
  const block = (content, extra = {}) => ({ type: 'tool_result', tool_use_id: 'x', content, ...extra })
  const input = { url: 'https://example.com/a', prompt: 'p' }
  assert.equal(webResultEvent({ name: 'WebFetch', input, block: block('Refused', { is_error: true }) }), null)
  assert.equal(webResultEvent({ name: 'WebFetch', input, block: block('Not found'), structured: { code: 404, url: input.url } }), null)
  // A redirect to another host comes back as a message, not the page.
  assert.equal(webResultEvent({ name: 'WebFetch', input, block: block('REDIRECT DETECTED'), structured: { code: 301, url: input.url } }), null)
  assert.equal(webResultEvent({ name: 'WebFetch', input: { url: 'file:///etc/passwd' }, block: block('x') }), null)
  assert.equal(webResultEvent({ name: 'Read', input, block: block('x') }), null)
  assert.equal(webResultEvent({ name: 'WebSearch', block: block('no links here') }), null)
  // Without a recorded input, the structured result's URL is used.
  assert.deepEqual(
    webResultEvent({ name: 'WebFetch', block: block([{ type: 'text', text: 'page' }]), structured: { code: 200, url: 'https://example.com/b' } }),
    { type: 'fetched', url: 'https://example.com/b', text: 'page' },
  )
  // The input URL wins: it is what the model will name again.
  assert.equal(
    webResultEvent({ name: 'WebFetch', input, block: block('page'), structured: { code: 200, url: 'https://example.com/other' } }).url,
    'https://example.com/a',
  )
})

test('resultText: strings and blocks, clipped to 20 000 characters', () => {
  assert.equal(resultText('plain'), 'plain')
  assert.equal(resultText([{ type: 'text', text: 'a' }, { type: 'image' }, { type: 'text', text: 'b' }]), 'a\nb')
  assert.equal(resultText(undefined), '')
  assert.equal(RESULT_TEXT_MAX, 20_000)
  assert.equal(resultText('x'.repeat(25_000)).length, 20_000)
})
