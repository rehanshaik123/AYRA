// Unit tests for bridge/jobs.mjs — background jobs, their budget and their reports. `npm test`
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createJobs, jobBrief, jobsTools, report } from '../bridge/jobs.mjs'
import { createGate } from '../bridge/gate.mjs'

/** A fake brain conversation the test drives by hand. */
function rig(options = {}) {
  const told = []
  const convo = { asked: [], interrupted: 0, closed: 0 }
  let emit = null
  const jobs = createJobs({
    open: (h) => {
      emit = h.emit
      return {
        ask: (text, id) => convo.asked.push({ text, id }),
        interrupt: () => convo.interrupted++,
        close: () => convo.closed++,
      }
    },
    tell: (t) => told.push(t),
    ...options,
  })
  return { jobs, told, convo, emit: (e) => emit(e) }
}

test('a job starts in its own conversation, is told the whole brief, and reports when done', () => {
  const { jobs, told, convo, emit } = rig()
  const r = jobs.start('find three laptops under 50,000 on amazon.in and flipkart.com')
  assert.equal(r.ok, true)
  assert.match(told[0], /Started a background job: find three laptops/)
  assert.equal(convo.asked[0].id, r.id)
  assert.equal(convo.asked[0].text, jobBrief('find three laptops under 50,000 on amazon.in and flipkart.com'))
  emit({ type: 'tool', name: 'mcp__ayra_browser__browser_open', ask: r.id })
  emit({ type: 'tool', name: 'mcp__ayra_browser__browser_read', ask: r.id })
  assert.match(jobs.status(), /2 steps; now: browser read/)
  emit({ type: 'done', text: 'Found three: …', ask: r.id })
  assert.match(told.at(-1), /^✅ Job done: find three laptops/)
  assert.match(told.at(-1), /2 steps/)
  assert.equal(jobs.running(), null)
  assert.match(jobs.status(), /The last one \(done\)/)
})

test('one at a time, and nothing to do is refused', () => {
  const { jobs } = rig()
  assert.equal(jobs.start('').ok, false)
  assert.equal(jobs.start('job one').ok, true)
  const second = jobs.start('job two')
  assert.equal(second.ok, false)
  assert.match(second.reason, /already running: "job one"/)
})

test('past its step budget a job is stopped and says so', () => {
  const { jobs, told, convo, emit } = rig({ limits: { minutes: 30, steps: 3 } })
  const { id } = jobs.start('a long one')
  for (let i = 0; i < 4; i++) emit({ type: 'tool', name: 'mcp__ayra_apps__apps_click', ask: id })
  assert.equal(convo.interrupted, 1)
  assert.match(told.at(-1), /^⏹️ Job stopped at its limit/)
  assert.match(told.at(-1), /Stopped after 3 steps/)
  // A late "done" from the stopped conversation changes nothing.
  emit({ type: 'done', text: 'late', ask: id })
  assert.equal(told.filter((t) => /Job/.test(t)).length, 1)
})

test('the kill switch stops a job; events from other turns are ignored', () => {
  const { jobs, told, convo, emit } = rig()
  const { id } = jobs.start('something')
  emit({ type: 'tool', name: 'x', ask: 'someone-else' })
  assert.match(jobs.status(), /0 steps/)
  jobs.interrupt()
  assert.equal(convo.interrupted, 1)
  assert.match(told.at(-1), /^⏹️ Job stopped: something/)
  assert.match(told.at(-1), /Stopped by the kill switch/)
  assert.equal(jobs.stop(), false)
  void id
})

test('progress notes while it runs', async () => {
  const { jobs, told } = rig({ progressMs: 30 })
  jobs.start('slow job')
  await new Promise((r) => setTimeout(r, 80))
  assert.ok(told.some((t) => /^⏳ Still on it: slow job/.test(t)))
  jobs.stop()
})

test('starting a job is offered only with writes on; the gate classifies the server', () => {
  const jobs = createJobs({ open: () => ({ ask() {}, interrupt() {}, close() {} }), tell() {} })
  assert.deepEqual(jobsTools({ jobs, allowWrites: false }).map((t) => t.name), ['jobs_status', 'jobs_stop'])
  assert.deepEqual(jobsTools({ jobs, allowWrites: true }).map((t) => t.name), ['jobs_status', 'jobs_stop', 'jobs_start'])
  const gate = createGate({ allowWrites: true, laptop: true, connectors: [], everConnected: [] })
  assert.equal(gate.decide('mcp__ayra_jobs__jobs_start'), true)
  assert.match(report({ outcome: 'error', task: 't', minutes: 1, steps: 0, text: '' }), /^⚠️ Job failed/)
})
