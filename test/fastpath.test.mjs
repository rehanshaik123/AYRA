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
    'open my last email',
    'start a timer for ten minutes',
    'run diagnostics',
    'what is the weather',
    'open a new tab',
    'open it',
    'tell me about Spotify',
  ]) assert.equal(parseFast(text), null, text)
})

test('what the review caught: conversation words, files and folders that are not folders', () => {
  for (const text of ['next one', 'next', 'continue', 'skip this', 'start the video', 'launch my music', 'open music',
    'open report.pdf', 'open node.js', 'open readme.md', 'open budget.xlsx']) {
    assert.equal(parseFast(text), null, text)
  }
  assert.equal(parseFast('open my music folder').folder, 'Music')
  assert.equal(parseFast('pause').action, 'pause')
  assert.equal(parseFast('open github.com/rehanshaik123').url, 'https://github.com/rehanshaik123')
})

test('music commands', () => {
  assert.equal(parseFast('pause the music').action, 'pause')
  assert.equal(parseFast('Hey AYRA, play music').action, 'play')
  assert.equal(parseFast('next song').action, 'next')
  assert.equal(parseFast('skip this song').action, 'next')
  assert.equal(parseFast('previous track').action, 'prev')
  assert.deepEqual(parseFast('play despacito'), { kind: 'youtube', query: 'despacito' })
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
  assert.equal((await runFast(parseFast('open notepad'), h)).said, 'Opened.')
  assert.equal((await runFast(parseFast('open youtube'), h)).said, 'Opened.')
  assert.equal((await runFast(parseFast('next song'), h)).said, 'Next.')
  assert.deepEqual(h.did, [['app', 'notepad'], ['site', 'https://www.youtube.com/'], ['media', 'next']])
})

test('an app that is not installed opens its site, else falls to the brain', async () => {
  const missing = async () => {
    throw new Error("No app called 'x'")
  }
  const h = hands({ openApp: missing })
  const r = await runFast(parseFast('open spotify'), h)
  assert.equal(r.said, 'Opened.')
  assert.deepEqual(h.did, [['site', 'https://open.spotify.com/']])
  assert.equal(await runFast(parseFast('open notepad'), hands({ openApp: missing })), null)
})

test('nothing to pause → she says so; nothing to play → the brain (it can open a player)', async () => {
  const h = hands({ media: { command: async () => false } })
  assert.equal((await runFast(parseFast('pause the music'), h)).said, 'Nothing is playing right now.')
  assert.equal((await runFast(parseFast('next song'), h)).said, 'Nothing is playing right now.')
  assert.equal(await runFast(parseFast('play music'), h), null)
})

test('the note tells the brain what was done', () => {
  assert.equal(noteFor([]), '')
  assert.match(noteFor(['opened the Notepad app']), /^\[Done just now without you.*Notepad.*\]\n$/)
})

test('the new shapes: stop, volume, play, search, close, several at once (2026-10-18)', () => {
  assert.deepEqual(parseFast('stop it'), { kind: 'media', action: 'pause', said: 'Paused.', soft: true })
  assert.deepEqual(parseFast('make it louder'), { kind: 'volume', action: 'up' })
  assert.deepEqual(parseFast('turn the volume down'), { kind: 'volume', action: 'down' })
  assert.deepEqual(parseFast('mute'), { kind: 'volume', action: 'mute' })
  assert.deepEqual(parseFast('play me believer'), { kind: 'youtube', query: 'believer' })
  assert.deepEqual(parseFast('hey open Spotify and play me teenage dirtbag'), { kind: 'spotify', query: 'teenage dirtbag' })
  assert.deepEqual(parseFast('open YouTube and play lofi'), { kind: 'youtube', query: 'lofi' })
  assert.equal(parseFast('search lofi beats on YouTube').url, 'https://www.youtube.com/results?search_query=lofi%20beats')
  assert.equal(parseFast('look up gold price on google').url, 'https://www.google.com/search?q=gold%20price')
  assert.deepEqual(parseFast('close notepad'), { kind: 'close', name: 'notepad' })
  assert.equal(parseFast('open the browser and open YouTube').name, 'YouTube')
  assert.equal(parseFast('open GitHub and LinkedIn').steps.length, 2)
  // Not for the fast path.
  for (const t of ['close chrome', 'close the tab', 'close everything', 'play it', 'open notepad and write me a poem']) {
    assert.equal(parseFast(t), null, t)
  }
})

test('runFast: the new hands, and the brain when they can\'t', async () => {
  const did = []
  const h = {
    openApp: async (n) => (did.push(['app', n]), { app: n }),
    openFolder: async () => {},
    openSite: async (u) => void did.push(['site', u]),
    media: { command: async (a) => (did.push(['media', a]), a === 'pause') },
    volume: async (a) => (did.push(['volume', a]), true),
    youtube: async (q) => (did.push(['youtube', q]), { title: 'Believer' }),
    spotify: async (q) => (did.push(['spotify', q]), { played: false }),
    closeApp: async (n) => (did.push(['close', n]), { app: 'Notepad', waiting: false }),
  }
  assert.equal((await runFast(parseFast('play believer'), h)).said, 'Playing.')
  assert.equal((await runFast(parseFast('volume up'), h)).said, 'Done.')
  assert.equal((await runFast(parseFast('close notepad'), h)).said, 'Closed.')
  assert.equal((await runFast(parseFast('play teenage dirtbag on spotify'), h)).said, 'Opened.')
  assert.equal((await runFast(parseFast('open GitHub and LinkedIn'), h)).said, 'Opened.')
  assert.equal((await runFast(parseFast('stop it'), h)).said, 'Paused.')
  // "Stop it" with nothing playing, "play some music" with nothing to resume: the brain.
  const quiet = { ...h, media: { command: async () => false } }
  assert.equal(await runFast(parseFast('stop it'), quiet), null)
  assert.equal(await runFast(parseFast('play some music'), quiet), null)
  // A close that asks a question first says so.
  const asking = { ...h, closeApp: async () => ({ app: 'Notepad', waiting: true }) }
  assert.equal((await runFast(parseFast('close notepad'), asking)).said, 'Notepad is asking something before it closes.')
})

test('"prepare notes on this video": the note writer straight away, for whole commands only', async () => {
  for (const [said, what] of [
    ['Hey AYRA, prepare overall notes of this video', 'video'],
    ['make notes on this video please', 'video'],
    ['notes of this video', 'video'],
    ['create detailed notes for this lecture', 'video'],
    ['take notes on this article', 'page'],
    ['make a note of this page', 'page'],
    ['give me study notes on the whole video', 'video'],
  ]) {
    const intent = parseFast(said)
    assert.equal(intent?.kind, 'notes', said)
    assert.equal(intent.what, what, said)
  }
  // More than the command, or a different command: the brain's.
  for (const said of ['make notes on this video and send them to Priya', 'note this which is on screen', 'what are my notes on this video', 'open my notes']) {
    assert.notEqual(parseFast(said)?.kind, 'notes', said)
  }
  const asked = []
  const hands = { notes: async (what, words) => (asked.push([what, words]), 'Saved ml/gd.md: how networks learn') }
  const did = await runFast(parseFast('prepare overall notes of this video'), hands)
  assert.equal(did.said, 'Saved.')
  assert.match(did.note, /notes on the video in front of them — Saved ml\/gd\.md/)
  assert.deepEqual(asked, [['video', 'prepare overall notes of this video']])
  // Anything but a clean save goes to the brain to explain.
  assert.equal(await runFast(parseFast('notes of this video'), { notes: async () => null }), null)
  assert.equal(await runFast(parseFast('notes of this video'), {}), null)
})
