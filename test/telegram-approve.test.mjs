// Unit tests for the Approve buttons and /stop on Telegram (bridge/telegram.mjs). `npm test`
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { approveText, parseApproval, startTelegram } from '../bridge/telegram.mjs'
import { createApprovals } from '../bridge/approvals.mjs'

const OWNER = '1300190813'

test('the buttons carry the request id and the answer', () => {
  assert.deepEqual(parseApproval('ap:ap3:y'), { id: 'ap3', ok: true, always: false })
  assert.deepEqual(parseApproval('ap:ap12:n'), { id: 'ap12', ok: false, always: false })
  assert.deepEqual(parseApproval('ap:ap7:a'), { id: 'ap7', ok: true, always: true })
  assert.equal(parseApproval('ap:ap3:maybe'), null)
  assert.equal(parseApproval('something else'), null)
})

test('the request says what would happen and why it asks', () => {
  const text = approveText({ reason: 'deletes something for good', detail: 'Remove-Item C:\\old.zip' })
  assert.ok(text.includes('deletes something for good'))
  assert.ok(text.includes('Remove-Item C:\\old.zip'))
})

/** A fake Telegram that plays `updates` after the Approve request has gone out. */
function harness() {
  const calls = []
  let queue = []
  let halted = 0
  const request = async (method, body) => {
    calls.push({ method, body })
    if (method === 'getMe') return { username: 'test_bot' }
    if (method === 'sendMessage') return { message_id: 900 + calls.length }
    if (method === 'getUpdates') {
      await new Promise((r) => setTimeout(r, 10))
      const out = queue
      queue = []
      return out
    }
    return true
  }
  const approvals = createApprovals()
  const brain = { open: () => ({ ask() {}, close() {}, interrupt() {} }) }
  const tg = startTelegram({
    token: 'test', ownerId: OWNER, brain, systemPrompt: 'test', request,
    audit: { log() {} }, approvals, onHalt: () => halted++,
  })
  return {
    approvals, calls, tg,
    push: (u) => queue.push(u),
    halted: () => halted,
  }
}

const button = (id, data, from = 1300190813) => ({
  update_id: id,
  callback_query: { id: `cb${id}`, from: { id: from }, data },
})

test('an Approve request goes to the owner with Yes / No, and Yes approves', async () => {
  const h = harness()
  const answer = h.approvals.ask({ channel: 'hud', tool: 'PowerShell', reason: 'deletes something for good', detail: 'Remove-Item x' })
  await new Promise((r) => setTimeout(r, 20))
  const sent = h.calls.find((c) => c.method === 'sendMessage')
  assert.equal(String(sent.body.chat_id), OWNER)
  const [yes, no] = sent.body.reply_markup.inline_keyboard[0]
  assert.match(yes.callback_data, /^ap:ap1:y$/)
  assert.match(no.callback_data, /^ap:ap1:n$/)
  h.push(button(1, yes.callback_data))
  assert.equal(await answer, true)
  await new Promise((r) => setTimeout(r, 30))
  const edited = h.calls.find((c) => c.method === 'editMessageText')
  assert.equal(edited.body.text, '✅ Allowed')
  h.tg.stop()
})

test("a stranger's button press is ignored", async () => {
  const h = harness()
  const answer = h.approvals.ask({ channel: 'hud', tool: 'PowerShell', reason: 'spends money', detail: '' })
  await new Promise((r) => setTimeout(r, 20))
  h.push(button(1, 'ap:ap1:y', 42))
  await new Promise((r) => setTimeout(r, 40))
  assert.equal(h.approvals.pending().length, 1, 'still waiting for the owner')
  h.approvals.answer('ap1', false)
  assert.equal(await answer, false)
  h.tg.stop()
})

test('/stop is the kill switch', async () => {
  const h = harness()
  h.push({
    update_id: 5,
    message: { message_id: 5, date: Math.floor(Date.now() / 1000), chat: { id: 77, type: 'private' }, from: { id: 1300190813 }, text: '/stop' },
  })
  await new Promise((r) => setTimeout(r, 60))
  assert.equal(h.halted(), 1)
  h.tg.stop()
})
