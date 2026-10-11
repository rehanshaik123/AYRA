// Unit tests for the blade half of src/store.ts — which cards are on screen,
// in what order, and for how long. `npm test`
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  useStore,
  bladeIsCurrent,
  bladeLife,
  dockOrder,
  MAX_BLADES,
  TURN_MS,
  LONG_MS,
  RESEARCH_DONE_MS,
} from '../src/store.ts'

const st = () => useStore.getState()
const ids = () => st().blades.map((b) => b.id)

const card = (id, extra = {}) => ({ id, title: id.toUpperCase(), kind: 'markup', html: '<p>x</p>', size: 'compact', hold: 'turn', ...extra })
const progress = (id, status = 'running') => card(id, { kind: 'research', title: 'RESEARCH', research: { id, status } })
const data = (id, extra = {}) =>
  card(id, { kind: 'data', data: { title: 'GOLD', headline: { label: 'Gold', value: '₹1,23,450' }, rows: [] }, ...extra })
const sources = (id, extra = {}) =>
  card(id, { kind: 'sources', title: 'SOURCES', links: [{ title: 'A', url: 'https://a.example', domain: 'a.example' }], ...extra })

beforeEach(() => {
  useStore.setState({ blades: [], focusedBlade: null, expandedBlade: null, gone: new Set() })
})

test('a new id is appended and focused', () => {
  st().pushBlade(card('a'))
  st().pushBlade(card('b'))
  assert.deepEqual(ids(), ['a', 'b'])
  assert.equal(st().focusedBlade, 'b')
})

test('an update to an id on screen is replaced in place, and does not steal focus', () => {
  st().pushBlade(progress('rs-1'))
  st().pushBlade(card('b'))
  st().focusBlade('b')
  st().keepBlade('rs-1', true)
  st().pushBlade({ ...progress('rs-1'), title: 'RESEARCH 2' })
  assert.deepEqual(ids(), ['rs-1', 'b'])
  assert.equal(st().blades[0].title, 'RESEARCH 2')
  assert.equal(st().focusedBlade, 'b')
  // The owner's Keep survives the bridge's update, which never carries it.
  assert.equal(st().blades[0].kept, true)
})

test('replaces closes the progress card in the same update, and keeps it closed', () => {
  st().pushBlade(progress('rs-1'))
  st().expandBlade('rs-1')
  st().pushBlade(data('d-a3', { replaces: 'rs-1' }))
  assert.deepEqual(ids(), ['d-a3'])
  assert.equal(st().expandedBlade, null)
  st().pushBlade(sources('src-a3'))
  // The engine's last progress frame ("done") arrives after its results: ignored.
  st().pushBlade(progress('rs-1', 'done'))
  assert.deepEqual(ids(), ['d-a3', 'src-a3'])
  assert.ok(st().gone.has('rs-1'))
})

test('replaces on an in-place update closes too; replacing yourself does nothing', () => {
  st().pushBlade(progress('rs-1'))
  st().pushBlade(sources('src-a3'))
  st().pushBlade(sources('src-a3', { replaces: 'rs-1' }))
  assert.deepEqual(ids(), ['src-a3'])
  st().pushBlade(data('d-1', { replaces: 'd-1' }))
  assert.deepEqual(ids(), ['src-a3', 'd-1'])
})

test('a new data or sources card closes the older ones of its kind, unless kept', () => {
  st().pushBlade(data('d-a1'))
  st().pushBlade(sources('src-a1'))
  st().pushBlade(data('d-a2'))
  st().keepBlade('d-a2', true)
  st().pushBlade(card('m'))
  st().pushBlade(data('d-a3'))
  assert.deepEqual(ids(), ['src-a1', 'd-a2', 'm', 'd-a3'])
  st().pushBlade(sources('src-a3'))
  assert.deepEqual(ids(), ['d-a2', 'm', 'd-a3', 'src-a3'])
  // Closed means closed: a late frame for one of them does not bring it back.
  st().pushBlade(data('d-a1'))
  assert.ok(!ids().includes('d-a1'))
})

test('closed by X or cleared with the turn: a late frame for it is ignored', () => {
  st().pushBlade(card('a'))
  st().pushBlade(card('s', { hold: 'sticky' }))
  st().pushBlade(card('k'))
  st().keepBlade('k', true)
  st().closeBlade('a')
  st().pushBlade(card('a'))
  assert.deepEqual(ids(), ['s', 'k'])

  st().pushBlade(card('t'))
  st().clearBlades()
  assert.deepEqual(ids(), ['s', 'k'])
  st().pushBlade(card('t'))
  assert.deepEqual(ids(), ['s', 'k'])
  assert.ok(st().gone.has('t'))
  // What survived the clear is not gone: its updates still land.
  st().pushBlade({ ...card('s', { hold: 'sticky' }), title: 'S2' })
  assert.equal(st().blades.find((b) => b.id === 's').title, 'S2')
})

test('closing lets go of focus and full screen', () => {
  st().pushBlade(card('a'))
  st().expandBlade('a')
  st().closeBlade('a')
  assert.equal(st().focusedBlade, null)
  assert.equal(st().expandedBlade, null)
})

test('a frame that is not a blade is ignored', () => {
  st().pushBlade(null)
  st().pushBlade({ title: 'no id' })
  st().pushBlade({ id: 7 })
  assert.deepEqual(ids(), [])
})

test('the cap of six takes the oldest — never a kept card or a running research card', () => {
  st().pushBlade(progress('rs-1'))
  st().pushBlade(card('k'))
  st().keepBlade('k', true)
  for (const id of ['c1', 'c2', 'c3', 'c4']) st().pushBlade(card(id))
  assert.equal(ids().length, MAX_BLADES)
  st().pushBlade(card('c5'))
  assert.deepEqual(ids(), ['rs-1', 'k', 'c2', 'c3', 'c4', 'c5'])
  st().pushBlade(card('c6'))
  assert.deepEqual(ids(), ['rs-1', 'k', 'c3', 'c4', 'c5', 'c6'])
  // Evicted is closed: it does not come back.
  st().pushBlade(card('c1'))
  assert.ok(!ids().includes('c1'))

  // A finished research card is fair game.
  st().pushBlade(progress('rs-1', 'done'))
  st().pushBlade(card('c7'))
  assert.ok(!ids().includes('rs-1'))
  assert.equal(ids().length, MAX_BLADES)
})

test('the cap gives way when nothing may be taken', () => {
  for (let i = 0; i < MAX_BLADES; i++) {
    st().pushBlade(card(`k${i}`))
    st().keepBlade(`k${i}`, true)
  }
  st().pushBlade(card('new'))
  assert.equal(ids().length, MAX_BLADES + 1)
  assert.equal(st().focusedBlade, 'new')
})

test('dockOrder: research, then data, then sources, then the rest, newest first within a kind', () => {
  const blades = [card('m1'), sources('s1'), data('d1'), progress('rs'), card('m2'), data('d2')]
  const { visible, hidden } = dockOrder(blades)
  assert.deepEqual(visible.map((b) => b.id), ['rs', 'd2', 'd1'])
  assert.deepEqual(hidden.map((b) => b.id), ['s1', 'm2', 'm1'])
  assert.deepEqual(dockOrder([sources('s'), data('d')]).visible.map((b) => b.id), ['d', 's'])
  assert.deepEqual(dockOrder([]), { visible: [], hidden: [] })
  assert.equal(dockOrder(blades, 6).hidden.length, 0)
})

test('bladeLife: pages never close, a running run waits, a finished one goes at once', () => {
  assert.equal(bladeLife(card('a', { kind: 'article', url: 'https://x' })), null)
  assert.equal(bladeLife(card('v', { kind: 'video' })), null)
  assert.equal(bladeLife(card('e', { kind: 'embed' })), null)
  assert.equal(bladeLife(progress('rs')), null)
  assert.equal(bladeLife(progress('rs', 'done')), RESEARCH_DONE_MS)
  assert.equal(bladeLife(progress('rs', 'failed')), TURN_MS)
  assert.equal(bladeLife(progress('rs', 'stopped')), TURN_MS)
  assert.equal(bladeLife(data('d')), TURN_MS)
  assert.equal(bladeLife(data('d', { life: 'long' })), LONG_MS)
  assert.equal(bladeLife(sources('s', { hold: 'sticky' })), LONG_MS)
  assert.equal(bladeLife(card('m')), TURN_MS)
})

test('bladeIsCurrent: a card from a turn already talked over is stale', () => {
  assert.equal(bladeIsCurrent('a3', 'a3'), true)
  assert.equal(bladeIsCurrent('a2', 'a3'), false)
  assert.equal(bladeIsCurrent('a1', null), false)
  // Unstamped frames are nobody's turn in particular.
  assert.equal(bladeIsCurrent(undefined, 'a3'), true)
  assert.equal(bladeIsCurrent(null, null), true)
  assert.equal(bladeIsCurrent('', 'a3'), true)
  assert.equal(bladeIsCurrent(7, 'a3'), true)
})
