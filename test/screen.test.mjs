// Unit tests for bridge/screen.mjs — which window "note this, on my screen" pictures. `npm test`
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createScreenCapture } from '../bridge/screen.mjs'

const TAB = { jpeg: Buffer.from('tab'), url: 'https://www.youtube.com/watch?v=x', title: 'GD - YouTube', at: 12, said: 'hi' }

function setup({ front, words = 'plain words', tab = 'GD - YouTube', windows = true } = {}) {
  const calls = []
  const appsCall = async (op, args) => {
    calls.push(op)
    if (op === 'front') {
      if (front instanceof Error) throw front
      return { window: front }
    }
    if (op === 'read') return { items: [{ text: words }] }
    if (op === 'shot') return { jpeg: Buffer.from('win').toString('base64'), window: { title: front.title, app: front.app } }
    throw new Error(`unexpected ${op} ${JSON.stringify(args)}`)
  }
  const capture = createScreenCapture({ windows, appsCall, captureFront: async () => TAB, frontTitle: async () => tab })
  return { capture, calls }
}

test('her Chrome in front: the tab, just the player for a video', async () => {
  const { capture } = setup({ front: { id: 1, title: 'GD - YouTube - Google Chrome', app: 'chrome' } })
  assert.equal(await capture(), TAB)
})

test('her own window in front (Space pressed in it): the tab behind it', async () => {
  const { capture, calls } = setup({ front: { id: 2, title: 'A.Y.R.A.', app: 'chrome' }, tab: 'Something else' })
  assert.equal(await capture(), TAB)
  assert.deepEqual(calls, ['front'])
})

test('another app in front: that window, through the apps worker', async () => {
  const { capture, calls } = setup({ front: { id: 3, title: 'lecture.pdf - Adobe Acrobat', app: 'Acrobat' } })
  const shot = await capture()
  assert.equal(shot.jpeg.toString(), 'win')
  assert.equal(shot.title, 'lecture.pdf - Adobe Acrobat')
  assert.equal(shot.at, null)
  assert.deepEqual(calls, ['front', 'read', 'shot'])
})

test('another Chrome window (not her tab) is pictured as a window', async () => {
  const { capture } = setup({ front: { id: 4, title: 'Bank - Google Chrome', app: 'chrome' }, tab: 'GD - YouTube' })
  assert.equal((await capture()).jpeg.toString(), 'win')
})

test('a window of secrets is never pictured', async () => {
  await assert.rejects(setup({ front: { id: 5, title: '.env.local - Notepad', app: 'notepad' } }).capture(), /keys or passwords/)
  await assert.rejects(
    setup({ front: { id: 6, title: 'Untitled - Notepad', app: 'notepad' }, words: 'key sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789ABCD' }).capture(),
    /key or a password/,
  )
})

test('no apps worker, or it fails: her Chrome\'s tab', async () => {
  assert.equal(await setup({ windows: false }).capture(), TAB)
  assert.equal(await setup({ front: new Error('worker down') }).capture(), TAB)
})

test('a YouTube video showing in her Chrome wins over another app in front, unless they named the window', async () => {
  const front = { id: 7, title: 'notes.md - Visual Studio Code', app: 'Code' }
  const calls = []
  const make = (inView) => createScreenCapture({
    windows: true,
    appsCall: async (op) => {
      calls.push(op)
      if (op === 'front') return { window: front }
      if (op === 'read') return { items: [] }
      if (op === 'shot') return { jpeg: Buffer.from('win').toString('base64'), window: front }
    },
    captureFront: async (o) => ({ ...TAB, prefer: o?.prefer ?? null }),
    frontTitle: async () => 'GD - YouTube',
    videoInView: async () => inView,
  })
  assert.equal((await make(true)()).prefer, 'video')
  assert.equal((await make(true)({ prefer: 'window' })).jpeg.toString(), 'win')
  assert.equal((await make(false)()).jpeg.toString(), 'win')
  assert.equal((await make(false)({ prefer: 'video' })).prefer, 'video')
})
