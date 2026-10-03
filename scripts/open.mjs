/**
 * One click to AYRA: what the "AYRA" desktop shortcut runs.
 *
 * Starts AYRA (`npm start`, minimised, in a window titled AYRA) unless she is
 * already running, waits for her face, then opens it as a small app window —
 * no tabs, no toolbar — inside "Chrome (AYRA)", the owner's Chrome, where she
 * grants her own page the microphone. Closing the app window leaves her running
 * (Telegram keeps working); closing the AYRA window stops her.
 */

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { chromeArgs, chromePath } from '../bridge/browser.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FACE = 'http://localhost:5173'

const up = async (url) => {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(800) })).ok
  } catch {
    return false
  }
}

if (!(await up(`${FACE}/`))) {
  // `start /min` gives her a minimised console of her own, titled AYRA, that
  // outlives this launcher.
  spawn('cmd.exe', ['/c', 'start "AYRA" /min cmd /c "title AYRA & npm start"'], {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
    windowsVerbatimArguments: true,
  }).unref()
  // The first start after a change builds the face, so allow a while.
  for (let i = 0; i < 180 && !(await up(`${FACE}/`)); i++) await new Promise((r) => setTimeout(r, 500))
}

const chrome = chromePath()
if (!chrome) {
  console.error('Chrome is not installed — open http://localhost:5173 in any browser instead.')
  process.exit(1)
}
spawn(chrome, chromeArgs([`--app=${FACE}`, '--window-size=960,720']), { detached: true, stdio: 'ignore' }).unref()
