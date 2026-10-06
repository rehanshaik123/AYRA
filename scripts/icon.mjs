/**
 * AYRA's Windows icon — `npm run icon`.
 *
 * Renders public/favicon.svg (the face's icon) at the sizes Windows uses and
 * packs them into desktop/ayra.ico, the icon of AYRA.exe, its tray icon and its
 * shortcuts. One drawing for all of them, so the taskbar, the tray and the
 * window match. Run it again only when favicon.svg changes; the .ico is kept in
 * git so building the desktop app needs no browser.
 *
 * Chrome draws the SVG (it is already on this laptop for her Chrome), headless
 * and with a throwaway profile — never the owner's.
 */

import puppeteer from 'puppeteer-core'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { chromePath } from '../bridge/browser.mjs'

const SIZES = [16, 20, 24, 32, 40, 48, 64, 256]

/** An .ico holding PNG images — the format Windows has read since Vista. */
export function packIco(pngs) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // 1 = icon
  header.writeUInt16LE(pngs.length, 4)
  const entries = []
  let offset = 6 + 16 * pngs.length
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16)
    e.writeUInt8(size >= 256 ? 0 : size, 0) // 0 means 256
    e.writeUInt8(size >= 256 ? 0 : size, 1)
    e.writeUInt8(0, 2) // no palette
    e.writeUInt8(0, 3)
    e.writeUInt16LE(1, 4) // colour planes
    e.writeUInt16LE(32, 6) // bits per pixel
    e.writeUInt32LE(data.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += data.length
    entries.push(e)
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)])
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())
if (isMain) {
  const svg = readFileSync('public/favicon.svg', 'utf8')
  const executablePath = chromePath()
  if (!executablePath) {
    console.error('Chrome is needed to draw the icon, and it was not found.')
    process.exit(1)
  }
  const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-first-run'] })
  try {
    const page = await browser.newPage()
    const pngs = []
    for (const size of SIZES) {
      await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 })
      const sized = svg.replace('<svg ', `<svg width="${size}" height="${size}" `)
      await page.setContent(`<html><body style="margin:0;background:transparent">${sized}</body></html>`)
      const data = Buffer.from(await page.screenshot({ type: 'png', omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } }))
      pngs.push({ size, data })
    }
    mkdirSync('desktop', { recursive: true })
    writeFileSync('desktop/ayra.ico', packIco(pngs))
    console.log(`made desktop/ayra.ico (${SIZES.join(', ')} px)`)
  } finally {
    await browser.close()
  }
}
