// Unit tests for bridge/approvals.mjs — the owner's Approve and the kill switch. `npm test`
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createApprovals } from '../bridge/approvals.mjs'

const rig = (options = {}) => {
  const logged = []
  const events = []
  const approvals = createApprovals({ audit: { log: (e) => logged.push(e) }, ...options })
  approvals.subscribe((e) => events.push(e))
  return { approvals, logged, events }
}
const asked = { channel: 'hud', tool: 'PowerShell', reason: 'deletes something for good', detail: 'Remove-Item old.zip' }

test('an ask is announced and waits for the answer', async () => {
  const { approvals, events } = rig()
  const answer = approvals.ask(asked)
  assert.equal(events[0].type, 'approve')
  assert.equal(events[0].reason, asked.reason)
  assert.equal(events[0].detail, 'Remove-Item old.zip')
  assert.equal(approvals.pending().length, 1)
  assert.equal(approvals.answer(events[0].id, true, 'hud'), true)
  assert.equal(await answer, true)
  assert.deepEqual(events.at(-1), { type: 'approved', id: events[0].id, ok: true, by: 'hud', always: false })
  assert.equal(approvals.pending().length, 0)
})

test('no means no; the first answer wins', async () => {
  const { approvals, events } = rig()
  const answer = approvals.ask(asked)
  const id = events[0].id
  assert.equal(approvals.answer(id, false, 'telegram'), true)
  assert.equal(approvals.answer(id, true, 'hud'), false, 'a second answer changes nothing')
  assert.equal(await answer, false)
})

test('only an explicit true approves', async () => {
  const { approvals, events } = rig()
  const answer = approvals.ask(asked)
  approvals.answer(events[0].id, 'yes')
  assert.equal(await answer, false)
})

test('no answer in time is a no', async () => {
  const { approvals, events } = rig({ timeoutMs: 30 })
  assert.equal(await approvals.ask(asked), false)
  assert.equal(events.at(-1).by, 'timeout')
})

test('the kill switch says no to everything waiting', async () => {
  const { approvals, events, logged } = rig()
  const a = approvals.ask(asked)
  const b = approvals.ask({ ...asked, reason: 'spends money' })
  assert.equal(approvals.halt('telegram'), 2)
  assert.deepEqual(await Promise.all([a, b]), [false, false])
  assert.equal(events.at(-1).type, 'halt')
  assert.equal(approvals.pending().length, 0)
  assert.ok(logged.some((e) => e.type === 'halt' && e.declined === 2))
})

test('the audit log records who answered and why it was asked, never the detail', async () => {
  const { approvals, events, logged } = rig()
  const answer = approvals.ask(asked)
  approvals.answer(events[0].id, true, 'hud')
  await answer
  const entry = logged.find((e) => e.type === 'approval')
  assert.deepEqual(entry, { type: 'approval', channel: 'hud', tool: 'PowerShell', reason: asked.reason, ok: true, by: 'hud' })
  assert.ok(!JSON.stringify(logged).includes('Remove-Item'))
})
