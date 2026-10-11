import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bare, noteFor, parseFast, runFast } from '../bridge/fastpath.mjs'

test('bare strips her name, politeness and the full stop', () => {
  assert.equal(bare('Hey AYRA, open Spotify.'), 'open Spotify')
  assert.equal(bare('Aira can you please open youtube for me'), 'open youtube')
  assert.equal(bare('hey ira, pause the music'), 'pause the music')
  assert.equal(bare('Open Notepad please'), 'Open Notepad')
})

test('sites, domains and folders', () => {
  assert.deepEqual(parseFast('open YouTube'), { kind: 'site', name: 'YouTube', url: 'https://www.youtube.com/' })
  assert.deepEqual(parseFast('Hey AYRA, go to github.com'), { kind: 'site', name: 'github.com', url: 'https://github.com/' })
  assert.equal(parseFast('open my downloads').kind, 'folder')
  assert.equal(parseFast('open the Documents folder').folder, 'Documents')
  assert.equal(parseFast('take me to gmail').url, 'https://mail.google.com/')
})

test('apps by name, with a web fallback for the ones that live on both', () => {
  assert.deepEqual(parseFast('open notepad'), { kind: 'app', name: 'notepad' })
  assert.deepEqual(parseFast('launch Visual Studio Code'), { kind: 'app', name: 'Visual Studio Code' })
  const spotify = parseFast('open spotify')
  assert.equal(spotify.kind, 'app')
  assert.equal(spotify.site.url, 'https://open.spotify.com/')
})

test('anything that needs thinking goes to the brain', () => {
  for (const text of [
    'open the file I downloaded yesterday',
    'open youtube and play lofi',
    'open my last email',
    'start a timer for ten minutes',
    'run diagnostics',
    'what is the weather',
    'open a new tab',
    'open it',
    'tell me about Spotify',
  ]) assert.equal(parseFast(text), null, text)
})

test('music commands', () => {
  assert.equal(parseFast('pause the music').action, 'pause')
  assert.equal(parseFast('Hey AYRA, play music').action, 'play')
  assert.equal(parseFast('next song').action, 'next')
  assert.equal(parseFast('skip this song').action, 'next')
  assert.equal(parseFast('previous track').action, 'prev')
  assert.equal(parseFast('play despacito'), null)
})

const hands = (over = {}) => {
  const did = []
  return {
    did,
    openApp: async (name) => (did.push(['app', name]), { app: name[0].toUpperCase() + name.slice(1) }),
    openFolder: async (f) => void did.push(['folder', f]),
    openSite: async (u) => void did.push(['site', u]),
    media: { command: async (a) => (did.push(['media', a]), true) },
    ...over,
  }
}

test('runFast does it and says one short line', async () => {
  const h = hands()
  assert.equal((await runFast(parseFast('open notepad'), h)).said, 'Opening Notepad.')
  assert.equal((await runFast(parseFast('open youtube'), h)).said, 'Opening YouTube.')
  assert.equal((await runFast(parseFast('next song'), h)).said, 'Next track.')
  assert.deepEqual(h.did, [['app', 'notepad'], ['site', 'https://www.youtube.com/'], ['media', 'next']])
})

test('an app that is not installed opens its site, else falls to the brain', async () => {
  const missing = async () => {
    throw new Error("No app called 'x'")
  }
  const h = hands({ openApp: missing })
  const r = await runFast(parseFast('open spotify'), h)
  assert.equal(r.said, 'Opening Spotify.')
  assert.deepEqual(h.did, [['site', 'https://open.spotify.com/']])
  assert.equal(await runFast(parseFast('open notepad'), hands({ openApp: missing })), null)
})

test('nothing to pause → the brain explains', async () => {
  const h = hands({ media: { command: async () => false } })
  assert.equal(await runFast(parseFast('pause the music'), h), null)
})

test('the note tells the brain what was done', () => {
  assert.equal(noteFor([]), '')
  assert.match(noteFor(['opened the Notepad app']), /^\[Done just now without you.*Notepad.*\]\n$/)
})
