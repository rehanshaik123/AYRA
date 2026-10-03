// Unit tests for bridge/face.mjs — the built face, served by the bridge. `npm test`
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join, resolve, sep } from 'node:path'
import { facePath } from '../bridge/face.mjs'

const root = resolve('dist')

test('the page and its files resolve inside the folder', () => {
  assert.equal(facePath(root, '/'), join(root, 'index.html'))
  assert.equal(facePath(root, '/listen-worklet.js'), join(root, 'listen-worklet.js'))
  assert.equal(facePath(root, '/assets/index-abc.js?v=1'), join(root, 'assets', 'index-abc.js'))
})

test('nothing outside the folder is ever served', () => {
  for (const url of [
    '/../package.json',
    '/..%2f..%2f.env.local',
    '/%2e%2e/%2e%2e/Windows/win.ini',
    '/assets/../../bridge/server.mjs',
    '/..\\..\\.env.local',
  ]) {
    const file = facePath(root, url)
    assert.ok(file === null || file.startsWith(root + sep), `${url} -> ${file}`)
  }
  assert.equal(facePath(root, '/%E0%A4%A'), null, 'malformed escapes are refused')
})
