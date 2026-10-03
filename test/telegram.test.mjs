// Unit tests for bridge/telegram.mjs — the parts that decide who and how much. `npm test`
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chunk, fromOwner, startTelegram } from '../bridge/telegram.mjs'
import { SYSTEM_PROMPT, TEXT_PROMPT } from '../bridge/persona.mjs'

const OWNER = '1300190813'

test('only the owner, in a private chat, gets through', () => {
  assert.equal(fromOwner({ chat: { type: 'private' }, from: { id: 1300190813 } }, OWNER), true)
  assert.equal(fromOwner({ chat: { type: 'private' }, from: { id: 42 } }, OWNER), false)
  assert.equal(fromOwner({ chat: { type: 'group' }, from: { id: 1300190813 } }, OWNER), false)
  assert.equal(fromOwner({ chat: { type: 'private' } }, OWNER), false)
  assert.equal(fromOwner(undefined, OWNER), false)
})

test('short replies go as one message', () => {
  assert.deepEqual(chunk('Hey boss!'), ['Hey boss!'])
  assert.deepEqual(chunk('   '), [])
})

test('long replies split under the limit, at line breaks when possible', () => {
  const line = 'x'.repeat(60)
  const long = Array.from({ length: 200 }, () => line).join('\n') // ~12k chars
  const pieces = chunk(long)
  assert.ok(pieces.length >= 3)
  for (const p of pieces) {
    assert.ok(p.length <= 4096)
    assert.ok(/^x+(\nx+)*$/.test(p), 'split only at line breaks')
  }
  assert.equal(pieces.join('\n'), long)
})

/** A fake Telegram + brain: one burst of updates, replies recorded, nothing on the network. */
function harness(updates) {
  const asks = []
  const sent = []
  const logged = []
  let served = false
  const brain = {
    open({ emit }) {
      return {
        ask(text, id) {
          asks.push({ text, id })
          setTimeout(() => emit({ type: 'done', text: `reply ${asks.length}`, ask: id }), 5)
        },
        close() {},
      }
    },
  }
  const request = async (method, body) => {
    if (method === 'getMe') return { username: 'test_bot' }
    if (method === 'sendChatAction') return true
    if (method === 'sendMessage') return sent.push(body)
    if (method === 'getUpdates') {
      if (!served) { served = true; return updates }
      await new Promise((r) => setTimeout(r, 20))
      return []
    }
    throw new Error(`unexpected ${method}`)
  }
  const tg = startTelegram({
    token: 'test', ownerId: OWNER, brain, systemPrompt: 'test', request,
    audit: { log: (e) => logged.push(e) },
  })
  return { asks, sent, logged, stop: () => tg.stop() }
}

const msg = (id, text, from = 1300190813) => ({
  update_id: id,
  message: { message_id: id, date: Math.floor(Date.now() / 1000), chat: { id: 77, type: 'private' }, from: { id: from }, text },
})

test('a burst of messages becomes one question and one reply', async () => {
  const h = harness([msg(1, 'Yooo'), msg(2, 'Hiiiii'), msg(3, 'what is up')])
  await new Promise((r) => setTimeout(r, 120))
  h.stop()
  assert.equal(h.asks.length, 1)
  assert.equal(h.asks[0].text, 'Yooo\nHiiiii\nwhat is up')
  assert.equal(h.sent.length, 1)
  assert.equal(h.sent[0].text, 'reply 1')
  assert.equal(h.sent[0].chat_id, 77)
})

test('strangers are ignored and logged, never asked', async () => {
  const h = harness([msg(1, 'let me in', 42)])
  await new Promise((r) => setTimeout(r, 80))
  h.stop()
  assert.equal(h.asks.length, 0)
  assert.equal(h.sent.length, 0)
  assert.deepEqual(h.logged.map((e) => e.type), ['telegram_ignored'])
})

test('the text persona is for chat, not the HUD', () => {
  assert.ok(TEXT_PROMPT.includes('Telegram'))
  assert.ok(!/\bblade\b/.test(TEXT_PROMPT))
  assert.ok(TEXT_PROMPT.includes('ROASTING AND FLIRTING'))
  assert.ok(TEXT_PROMPT.includes('Always kind and PG'))
})

test('emoji when texting, never when speaking', () => {
  assert.ok(TEXT_PROMPT.includes('EMOJI.'), 'the owner asked for emoji on Telegram')
  assert.ok(!/no emoji/i.test(TEXT_PROMPT))
  assert.ok(/no emoji/i.test(SYSTEM_PROMPT), 'the voice would read them out loud')
})
