// Unit tests for bridge/browser.mjs — the parts that decide what her Chrome may do. `npm test`
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { captionLines, captionText, captionsNear, chromeArgs, isTrusted, pickTrack, safeUrl, videoId, videoReport, PROFILE_DIR, DEBUG_PORT } from '../bridge/browser.mjs'

test('only web pages can be opened', () => {
  assert.equal(safeUrl('https://github.com/x'), 'https://github.com/x')
  assert.equal(safeUrl('github.com'), 'https://github.com/')
  assert.equal(safeUrl('http://localhost:5173'), 'http://localhost:5173/')
  for (const bad of ['file:///C:/Windows/win.ini', 'chrome://settings/passwords', 'javascript:alert(1)', 'data:text/html,hi', '']) {
    assert.equal(safeUrl(bad), null, bad)
  }
})

test('trusted sites match exactly or as a parent domain, never by suffix trickery', () => {
  const sites = ['localhost', 'meet.google.com']
  assert.equal(isTrusted('http://localhost:5173', sites), true)
  assert.equal(isTrusted('https://meet.google.com', sites), true)
  assert.equal(isTrusted('https://x.meet.google.com', sites), true)
  assert.equal(isTrusted('https://evilmeet.google.com', sites), false)
  assert.equal(isTrusted('https://meet.google.com.evil.io', sites), false)
  assert.equal(isTrusted('not a url', sites), false)
})

test('"Chrome (AYRA)" runs its own profile with remote control on the agreed port', () => {
  const args = chromeArgs(['--app=http://localhost:5173'])
  assert.ok(args.includes(`--user-data-dir=${PROFILE_DIR}`))
  assert.ok(args.includes(`--remote-debugging-port=${DEBUG_PORT}`))
  assert.ok(args.includes('--app=http://localhost:5173'))
  assert.ok(PROFILE_DIR.endsWith('Chrome'))
})

test('a YouTube address gives its video id; anything else gives none', () => {
  assert.equal(videoId('https://www.youtube.com/watch?v=IHZwWFHWa-w&t=5s'), 'IHZwWFHWa-w')
  assert.equal(videoId('https://youtu.be/IHZwWFHWa-w'), 'IHZwWFHWa-w')
  assert.equal(videoId('https://m.youtube.com/watch?v=abc'), 'abc')
  assert.equal(videoId('https://www.youtube.com/shorts/abc'), 'abc')
  assert.equal(videoId('https://www.youtube.com/results?search_query=x'), '')
  assert.equal(videoId('https://notyoutube.com/watch?v=abc'), '')
  assert.equal(videoId('nonsense'), '')
})

test('captions: the owner\'s language by a person first, then YouTube\'s, then English, then the video\'s own', () => {
  const t = (lang, kind = '') => ({ lang, kind })
  assert.deepEqual(pickTrack([t('en', 'asr'), t('en'), t('hi')], 'en-IN'), t('en'))
  assert.deepEqual(pickTrack([t('en-GB'), t('fr')], 'en-IN'), t('en-GB'))
  assert.deepEqual(pickTrack([t('hi', 'asr')], 'en-IN'), t('hi', 'asr'))
  assert.deepEqual(pickTrack([t('de'), t('hi', 'asr')], 'en-IN'), t('hi', 'asr'))
  assert.equal(pickTrack([], 'en-IN'), null)
})

test('YouTube\'s captions become timed lines, then paragraphs with times', () => {
  const lines = captionLines({ events: [
    { tStartMs: 4180, segs: [{ utf8: 'Last video I laid out' }, { utf8: ' the structure' }] },
    { tStartMs: 5000 },
    { tStartMs: 9000, segs: [{ utf8: '[Music]' }] },
    { tStartMs: 36000, segs: [{ utf8: 'of a\nneural network.' }] },
  ] })
  assert.deepEqual(lines, [{ at: 4, text: 'Last video I laid out the structure' }, { at: 36, text: 'of a neural network.' }])
  assert.equal(captionText(lines), '[0:04] Last video I laid out the structure\n[0:36] of a neural network.')
  assert.match(captionText(lines, 30, 50), /go on past 0:36/)
  assert.equal(captionsNear([{ at: 10, text: 'a' }, { at: 40, text: 'b' }, { at: 60, text: 'c' }], 50), 'b c')
})

test('a video as she reads it: header, where the owner is, captions, description — no secrets', () => {
  const report = videoReport({
    title: 'GD', author: '3b1b', seconds: 1260, url: 'https://www.youtube.com/watch?v=x', at: 125,
    track: { lang: 'en', kind: 'asr', name: 'English (auto-generated)' }, tracks: [{}],
    lines: [{ at: 0, text: 'hello' }], description: 'key sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789ABCD',
  })
  assert.match(report, /^Video: GD — 3b1b \(21:00\) · https:\/\/www\.youtube\.com\/watch\?v=x\nThe owner is at 2:05\./)
  assert.match(report, /made by YouTube — expect misheard words/)
  assert.doesNotMatch(report, /sk-ant-api03-abcdefghijklmnop/)
  assert.match(videoReport({ title: 'S', url: 'u', at: 0, tracks: [], lines: null, description: '' }), /has no captions/)
})
