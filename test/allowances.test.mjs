// Unit tests for bridge/allowances.mjs and "Always allow here" in approvals.mjs and rules.mjs. `npm test`
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ALLOWABLE, createAllowances, describe, siteOf } from '../bridge/allowances.mjs'
import { createApprovals } from '../bridge/approvals.mjs'
import { formatRules, rulesTools } from '../bridge/rules.mjs'
import { ASK, createGate } from '../bridge/gate.mjs'

/** A state store in memory, standing in for data/state.json. */
const memory = () => {
  const data = {}
  return { get: (k) => data[k], set: (k, v) => (data[k] = v) }
}

const LINKEDIN = { kind: 'site', where: 'linkedin.com' }

test('only sending or posting can be allowed ahead, and only somewhere named', () => {
  assert.deepEqual([...ALLOWABLE], [ASK.send])
  const a = createAllowances({ store: memory(), key: 'test-key' })
  assert.equal(a.add({ reason: ASK.money, scope: { kind: 'site', where: 'amazon.in' } }), false)
  assert.equal(a.add({ reason: ASK.delete, scope: { kind: 'app', where: 'explorer' } }), false)
  assert.equal(a.add({ reason: ASK.security, scope: LINKEDIN }), false)
  assert.equal(a.add({ reason: ASK.send }), false)
  assert.equal(a.add({ reason: ASK.send, scope: { kind: 'everywhere', where: '*' } }), false)
  assert.deepEqual(a.list(), [])
})

test('an allowance covers its exact place only — no subdomains, look-alikes or other kinds of ask', () => {
  const a = createAllowances({ store: memory(), key: 'test-key' })
  assert.equal(a.add({ reason: ASK.send, scope: LINKEDIN }), true)
  assert.equal(a.allows({ reason: ASK.send, scope: LINKEDIN }), true)
  assert.equal(a.allows({ reason: ASK.send, scope: { kind: 'site', where: 'in.linkedin.com' } }), false)
  assert.equal(a.allows({ reason: ASK.send, scope: { kind: 'site', where: 'evil-linkedin.com' } }), false)
  assert.equal(a.allows({ reason: ASK.send, scope: { kind: 'site', where: 'linkedin.com.evil.io' } }), false)
  assert.equal(a.allows({ reason: ASK.send, scope: { kind: 'app', where: 'linkedin.com' } }), false)
  assert.equal(a.allows({ reason: ASK.money, scope: LINKEDIN }), false)
  assert.equal(siteOf('https://www.LinkedIn.com/feed/'), 'www.linkedin.com')
  assert.equal(describe(a.list()[0]), 'send or post on linkedin.com')
})

test('taken back by number or by place', () => {
  const a = createAllowances({ store: memory(), key: 'test-key' })
  a.add({ reason: ASK.send, scope: LINKEDIN })
  a.add({ reason: ASK.send, scope: { kind: 'app', where: 'Teams' } })
  assert.equal(a.list()[1].where, 'teams')
  assert.equal(a.remove('teams').where, 'teams')
  assert.equal(a.remove(1).where, 'linkedin.com')
  assert.equal(a.remove(1), null)
  assert.equal(a.allows({ reason: ASK.send, scope: LINKEDIN }), false)
})

function hub(allowances) {
  const events = []
  const logged = []
  const approvals = createApprovals({ audit: { log: (e) => logged.push(e) }, allowances, timeoutMs: 5000 })
  approvals.subscribe((e) => events.push(e))
  return { approvals, events, logged }
}

test('"Always" is offered only where it can apply, and a yes with it is remembered', async () => {
  const allowances = createAllowances({ store: memory(), key: 'test-key' })
  const { approvals, events, logged } = hub(allowances)

  const money = approvals.ask({ channel: 'hud', tool: 'browser_click', reason: ASK.money, detail: 'Buy', scope: { kind: 'site', where: 'amazon.in' } })
  assert.equal(events.at(-1).always, '')
  approvals.answer(events.at(-1).id, true, 'hud', true)
  assert.equal(await money, true)
  assert.equal(allowances.list().length, 0, 'money is never remembered')

  const post = approvals.ask({ channel: 'telegram', tool: 'browser_click', reason: ASK.send, detail: 'Post', scope: LINKEDIN })
  assert.equal(events.at(-1).always, 'Always on linkedin.com')
  approvals.answer(events.at(-1).id, true, 'telegram', true)
  assert.equal(await post, true)
  assert.equal(events.at(-1).always, true)
  assert.equal(allowances.list().length, 1)
  assert.ok(logged.some((e) => e.type === 'allowance' && e.where === 'linkedin.com'))

  // Next time: no card, no question.
  const count = events.length
  assert.equal(await approvals.ask({ channel: 'hud', tool: 'browser_click', reason: ASK.send, detail: 'Post', scope: LINKEDIN }), true)
  assert.equal(events.length, count)
  assert.ok(logged.some((e) => e.by === 'allowance'))
})

test('"Always" with a no, or on an ask that never offered it, remembers nothing', async () => {
  const allowances = createAllowances({ store: memory(), key: 'test-key' })
  const { approvals, events } = hub(allowances)
  const no = approvals.ask({ channel: 'hud', tool: 'x', reason: ASK.send, scope: LINKEDIN })
  approvals.answer(events.at(-1).id, false, 'hud', true)
  assert.equal(await no, false)
  const shell = approvals.ask({ channel: 'hud', tool: 'PowerShell', reason: ASK.send, detail: 'curl -d …' })
  assert.equal(events.at(-1).always, '')
  approvals.answer(events.at(-1).id, true, 'hud', true)
  assert.equal(await shell, true)
  assert.deepEqual(allowances.list(), [])
})

test('her rules tools can list and take back, and there is no way to add', async () => {
  const allowances = createAllowances({ store: memory(), key: 'test-key' })
  allowances.add({ reason: ASK.send, scope: LINKEDIN })
  const tools = rulesTools({ allowances })
  assert.deepEqual(tools.map((t) => t.name), ['rules_list', 'rules_forget'])
  const listed = await tools[0].handler({})
  assert.match(listed.content[0].text, /1\. send or post on linkedin\.com/)
  const forgot = await tools[1].handler({ which: 'linkedin.com' })
  assert.match(forgot.content[0].text, /Taken back/)
  assert.match(formatRules(allowances.list()), /Nothing is allowed ahead of time yet/)
  const gate = createGate({ allowWrites: true, laptop: true, connectors: [], everConnected: [] })
  assert.equal(gate.decide('mcp__ayra_rules__rules_list'), true)
  assert.deepEqual(gate.review('mcp__ayra_rules__rules_forget', { which: 1 }), { verdict: 'allow' })
})

test('an allowance written into the state file by anything but the button is ignored', () => {
  const store = memory()
  const a = createAllowances({ store, key: 'test-key' })
  a.add({ reason: ASK.send, scope: LINKEDIN })
  // Someone edits the file: a forged entry, and a real one altered to a new place.
  const list = store.get('allowances')
  store.set('allowances', [
    ...list,
    { kind: 'site', where: 'evil.com', reason: ASK.send, at: new Date().toISOString(), mac: 'nope' },
    { ...list[0], where: 'mail.google.com' },
  ])
  assert.deepEqual(a.list().map((x) => x.where), ['linkedin.com'])
  assert.equal(a.allows({ reason: ASK.send, scope: { kind: 'site', where: 'evil.com' } }), false)
  // Another key (another laptop, or a guess) trusts none of them.
  assert.deepEqual(createAllowances({ store, key: 'other' }).list(), [])
})

test('a stopped job\'s waiting asks can be declined, so a late yes does nothing', async () => {
  const approvals = createApprovals({ timeoutMs: 5000 })
  const job = approvals.ask({ channel: 'job', tool: 'x', reason: ASK.send })
  const hud = approvals.ask({ channel: 'hud', tool: 'y', reason: ASK.send })
  assert.equal(approvals.cancel((r) => r.channel === 'job'), 1)
  assert.equal(await job, false)
  assert.equal(approvals.pending().length, 1)
  approvals.halt()
  assert.equal(await hud, false)
})

test('approval ids differ between runs, so an old button finds nothing', () => {
  const a = createApprovals({ timeoutMs: 5000 })
  const b = createApprovals({ timeoutMs: 5000 })
  const ids = []
  a.subscribe((e) => e.type === 'approve' && ids.push(e.id))
  b.subscribe((e) => e.type === 'approve' && ids.push(e.id))
  a.ask({ channel: 'hud', tool: 't', reason: ASK.send })
  b.ask({ channel: 'hud', tool: 't', reason: ASK.send })
  assert.notEqual(ids[0], ids[1])
  assert.match(ids[0], /^ap1-[0-9a-f]{6}$/)
  a.halt()
  b.halt()
})

