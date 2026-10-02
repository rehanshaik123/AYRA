// Unit tests for bridge/state.mjs — data/state.json. `npm test`
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStore } from '../bridge/state.mjs'

const fresh = () => {
  const dir = mkdtempSync(join(tmpdir(), 'ayra-state-'))
  return { dir, file: join(dir, 'nested', 'state.json') }
}

test('set, get and delete round-trip through the file', () => {
  const { dir, file } = fresh()
  const store = createStore(file)
  assert.equal(store.get('session.hud'), undefined)
  store.set('session.hud', { id: 'abc', updatedAt: '2026-10-02T00:00:00Z' })
  assert.deepEqual(createStore(file).get('session.hud'), { id: 'abc', updatedAt: '2026-10-02T00:00:00Z' })
  store.delete('session.hud')
  assert.equal(store.get('session.hud'), undefined)
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), {})
  rmSync(dir, { recursive: true })
})

test('a corrupt file reads as empty instead of crashing', () => {
  const { dir, file } = fresh()
  const store = createStore(file)
  store.set('x', 1)
  writeFileSync(file, '{ not json')
  assert.equal(store.get('x'), undefined)
  store.set('y', 2)
  assert.equal(store.get('y'), 2)
  rmSync(dir, { recursive: true })
})
