// Unit tests for bridge/origin.mjs — which pages may talk to the bridge. `npm test`
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createOriginCheck } from '../bridge/origin.mjs'

const check = createOriginCheck()

test('local dev pages are allowed', () => {
  for (const origin of [
    'http://localhost:5173', 'http://localhost:5180', 'http://127.0.0.1:5199',
    'http://[::1]:5173', 'http://localhost:4173',
  ]) {
    assert.equal(check.allowed(origin), true, origin)
  }
})

test('everything else is refused', () => {
  for (const origin of [
    'https://evil.example', 'http://localhost:3000', 'http://localhost:8080',
    'https://localhost:5173', 'http://192.168.1.5:5173', 'not a url', 'null',
  ]) {
    assert.equal(check.allowed(origin), false, origin)
  }
})

test('no Origin header is refused unless allowed explicitly', () => {
  assert.equal(check.allowed(undefined), false)
  assert.equal(createOriginCheck({ allowNoOrigin: true }).allowed(undefined), true)
})

test('extra origins are accepted exactly, trailing slash or not', () => {
  const extra = createOriginCheck({ extraOrigins: 'https://ayra.example.ts.net/, http://localhost:9000' })
  assert.equal(extra.allowed('https://ayra.example.ts.net'), true)
  assert.equal(extra.allowed('http://localhost:9000'), true)
  assert.equal(extra.allowed('https://other.example.ts.net'), false)
  assert.equal(extra.extra.size, 2)
})
