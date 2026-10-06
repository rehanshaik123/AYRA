// Unit tests for scripts/icon.mjs — the .ico that AYRA.exe, its tray icon and shortcuts use. `npm test`
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { packIco } from '../scripts/icon.mjs'

const png = (n) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(n)])

test('the .ico header and directory point at each PNG, 256 written as 0', () => {
  const ico = packIco([{ size: 16, data: png(10) }, { size: 256, data: png(20) }])
  assert.equal(ico.readUInt16LE(2), 1) // an icon
  assert.equal(ico.readUInt16LE(4), 2) // two images
  assert.equal(ico[6], 16)
  assert.equal(ico[6 + 16], 0) // 256 px is stored as 0
  const first = ico.readUInt32LE(6 + 12)
  const second = ico.readUInt32LE(6 + 16 + 12)
  assert.equal(first, 6 + 16 * 2)
  assert.equal(second, first + 14)
  assert.equal(ico.subarray(second, second + 4).toString('hex'), '89504e47')
  assert.equal(ico.length, second + 24)
})

test('the committed icon is a valid .ico with a 256 px image', () => {
  const ico = readFileSync('desktop/ayra.ico')
  const count = ico.readUInt16LE(4)
  assert.ok(count >= 4)
  const sizes = Array.from({ length: count }, (_, i) => ico[6 + 16 * i] || 256)
  assert.ok(sizes.includes(16) && sizes.includes(256), sizes.join(','))
})
