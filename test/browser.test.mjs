// Unit tests for bridge/browser.mjs — the parts that decide what her Chrome may do. `npm test`
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromeArgs, isTrusted, safeUrl, PROFILE_DIR, DEBUG_PORT } from '../bridge/browser.mjs'

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
