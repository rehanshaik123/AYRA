// Unit tests for bridge/audit.mjs — data/logs/YYYY-MM-DD.jsonl. `npm test`
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { clip, createAudit } from '../bridge/audit.mjs'
import { localDate } from '../bridge/context.mjs'

test('events are appended in order, one JSON object per line, in a file per day', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ayra-audit-'))
  const audit = createAudit(dir)
  audit.log({ type: 'question', channel: 'hud', text: 'what time is it' })
  audit.log({ type: 'decision', channel: 'hud', tool: 'WebSearch', allowed: true })
  await audit.flush()

  assert.deepEqual(readdirSync(dir), [`${localDate()}.jsonl`])
  const lines = readFileSync(join(dir, `${localDate()}.jsonl`), 'utf8').trim().split('\n')
  const events = lines.map((l) => JSON.parse(l))
  assert.deepEqual(events.map((e) => e.type), ['question', 'decision'])
  assert.ok(!Number.isNaN(Date.parse(events[0].ts)))
  rmSync(dir, { recursive: true })
})

test('long text is clipped', () => {
  assert.equal(clip('short'), 'short')
  const long = clip('x'.repeat(2000))
  assert.equal(long.length, 501)
  assert.ok(long.endsWith('…'))
})

test('local date is YYYY-MM-DD in the given zone', () => {
  // 20:00 UTC on 1 October is already 2 October in India.
  assert.equal(localDate(new Date('2026-10-01T20:00:00Z'), 'Asia/Kolkata'), '2026-10-02')
  assert.equal(localDate(new Date('2026-10-01T20:00:00Z'), 'Europe/London'), '2026-10-01')
})
