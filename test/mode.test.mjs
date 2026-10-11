// Unit tests for researcher mode on the face (src/store.ts): the R key's
// remembered mode, what she says as it changes, the ask frame each mode sends,
// and the finished RESEARCHER board staying on screen. `npm test`
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  useStore,
  askFrame,
  bladeLife,
  modeLine,
  parseMode,
  MODE_KEY,
  LONG_MS,
  RESEARCH_DONE_MS,
} from '../src/store.ts'

beforeEach(() => {
  useStore.setState({ mode: 'normal' })
})

test('the mode starts normal and only "research" turns researcher mode on', () => {
  assert.equal(MODE_KEY, 'ayra.mode')
  assert.equal(useStore.getState().mode, 'normal')
  assert.equal(parseMode('research'), 'research')
  for (const saved of ['normal', null, undefined, '', 'RESEARCH', 'deep', 1, {}]) assert.equal(parseMode(saved), 'normal')
})

test('setMode switches the mode, and nonsense is normal', () => {
  const st = () => useStore.getState()
  st().setMode('research')
  assert.equal(st().mode, 'research')
  st().setMode('normal')
  assert.equal(st().mode, 'normal')
  st().setMode('research')
  st().setMode('banana')
  assert.equal(st().mode, 'normal')
})

test('what she says never has her name in it', () => {
  assert.equal(modeLine('research'), "Researcher mode. Ask me anything and I'll dig through Reddit, Quora, GitHub and the rest.")
  assert.equal(modeLine('normal'), 'Back to normal mode.')
  for (const line of [modeLine('research'), modeLine('normal')]) assert.doesNotMatch(line, /ayra/i)
})

test('a normal question goes out exactly as before; researcher mode names itself', () => {
  assert.equal(JSON.stringify(askFrame('gold price', 'a3')), '{"type":"ask","text":"gold price","id":"a3"}')
  assert.equal(JSON.stringify(askFrame('gold price', 'a3', 'normal')), '{"type":"ask","text":"gold price","id":"a3"}')
  assert.deepEqual(askFrame('best self-hosted git', 'a4', 'research'), { type: 'ask', text: 'best self-hosted git', id: 'a4', mode: 'research' })
})

test('a finished RESEARCHER board stays; an ordinary progress card still goes at once', () => {
  const blade = (life) => ({
    id: 'rs-1',
    title: 'RESEARCHER',
    kind: 'research',
    research: { id: 'rs-1', status: 'done', variant: 'deep' },
    size: 'wide',
    hold: 'turn',
    ...(life ? { life } : {}),
  })
  assert.equal(bladeLife(blade('long')), LONG_MS)
  assert.equal(bladeLife(blade()), RESEARCH_DONE_MS)
  assert.equal(bladeLife({ ...blade('long'), research: { id: 'rs-1', status: 'running' } }), null)
})

test('a RESEARCHER board update is replaced in place and keeps its focus', () => {
  useStore.setState({ blades: [], focusedBlade: null, expandedBlade: null, gone: new Set() })
  const board = (status) => ({
    id: 'rs-2',
    title: 'RESEARCHER',
    kind: 'research',
    research: { id: 'rs-2', status, variant: 'deep' },
    size: 'wide',
    hold: 'turn',
    ...(status === 'done' ? { life: 'long' } : {}),
  })
  const st = useStore.getState
  st().pushBlade(board('running'))
  st().pushBlade({ id: 'src-a1', title: 'SOURCES', kind: 'sources', links: [], size: 'compact', hold: 'turn' })
  st().focusBlade('src-a1')
  st().pushBlade(board('done'))
  assert.deepEqual(st().blades.map((b) => b.id), ['rs-2', 'src-a1'])
  assert.equal(st().blades[0].life, 'long')
  assert.equal(st().focusedBlade, 'src-a1')
})
