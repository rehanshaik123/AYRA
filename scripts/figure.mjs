/**
 * `npm run figure` — her figure for the bubble on top of every app (AYRA.exe).
 *
 * The owner, 2026-10-18: "change the AYRA icon that pops up on my screen into
 * exactly her figure". The avatar is one SVG whose pose is a `data-pose`
 * attribute (src/ui/Avatar.tsx), so each pose the bubble needs is photographed
 * from the real face — the same drawing, no second copy to keep in step — on a
 * transparent background, into desktop/figure/<name>.png. `npm run shortcuts`
 * puts them beside AYRA.exe. Run again after changing the avatar.
 *
 * Needs AYRA's face running (npm start, or the tray) on 127.0.0.1:5173, and Chrome.
 */

import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'
import { chromePath } from '../bridge/browser.mjs'
import { env } from '../bridge/identity.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'desktop', 'figure')
const FACE = `http://127.0.0.1:${env('FACE_PORT', '5173')}/`

/** The bubble's frames: a pose each, and her mouth open or shut for talking. */
export const FRAMES = [
  ['sleep', 'sleep', 0],
  ['idle', 'idle', 0],
  ['listen', 'listen', 0],
  ['think', 'think', 0],
  ['magic', 'magic', 0],
  ['talk-open', 'talk', 1],
  ['talk-shut', 'talk', 0],
]

const exe = chromePath()
if (!exe) {
  console.error('Chrome is not installed, so her figure cannot be drawn.')
  process.exit(1)
}
mkdirSync(OUT, { recursive: true })
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--no-first-run'] })
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 600, height: 600, deviceScaleFactor: 1 })
  for (const [name, pose, mouth] of FRAMES) {
    try {
      await page.goto(`${FACE}?pose=${pose}`, { waitUntil: 'networkidle0', timeout: 20_000 })
    } catch {
      console.error(`Her face isn't answering on ${FACE} — start AYRA first (npm start), then run this again.`)
      process.exit(1)
    }
    await page.waitForSelector('.avatar-svg', { timeout: 10_000 })
    // Her figure alone: the avatar lifted out of the HUD onto a transparent page,
    // at its natural size, every animation stopped on its resting frame.
    await page.evaluate((m) => {
      const avatar = document.querySelector('.avatar').cloneNode(true)
      avatar.style.setProperty('--mouth', String(m))
      avatar.style.setProperty('--lvl', '0')
      avatar.setAttribute('data-blink', '0')
      document.body.replaceChildren(avatar)
      const style = document.createElement('style')
      style.textContent = `
        html, body { background: transparent !important; margin: 0; }
        html::before, html::after, body::before, body::after { display: none !important; }
        .avatar { position: static !important; width: 400px !important; height: 440px !important; inset: auto !important; transform: none !important; opacity: 1 !important; }
        .avatar-stage, .avatar-figure { position: static !important; width: 400px !important; height: 440px !important; transform: none !important; opacity: 1 !important; }
        .avatar-halo { display: none !important; }
        .avatar *, .avatar *::before, .avatar *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition: none !important; }`
      document.head.append(style)
    }, mouth)
    const svg = await page.$('.avatar-svg')
    await svg.screenshot({ path: join(OUT, `${name}.png`), omitBackground: true })
    console.log(`  drew ${name}`)
  }
} finally {
  await browser.close()
}
console.log(`Her figure is in ${OUT}. Run npm run shortcuts to give it to the bubble.`)
