/**
 * Music manners: whatever is playing pauses while AYRA listens, and exactly that
 * resumes when she's done.
 *
 * The owner, 2026-10-11: "AYRA is still listening to the voice from Spotify in
 * the system app and responding". Chrome's echo cancelling only removes sound
 * Chrome itself plays, so another app's music reaches the microphone in full,
 * and its lyrics became questions. Pausing it is the one fix that always works.
 *
 * Windows only (its media controls, through bridge/media.ps1, ~0.7 s a call);
 * elsewhere it does nothing. Only what was really playing is paused, and only
 * what she paused is resumed — something the owner paused stays paused.
 */

import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'media.ps1')

/** Runs media.ps1 and returns the ids it acted on. */
function runScript(action, ids = []) {
  return new Promise((resolve) => {
    const ps = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, action, ids.join('|')], {
      windowsHide: true,
    })
    let out = ''
    ps.stdout.on('data', (d) => (out += d))
    ps.on('error', () => resolve([]))
    ps.on('close', () => resolve(out.trim().split('|').filter(Boolean)))
  })
}

/**
 * @param {{ run?: (action: string, ids: string[]) => Promise<string[]>, enabled?: boolean, log?: (m: string) => void }} options
 * @returns {{ pause: () => Promise<void>, resume: () => Promise<void> }}
 */
export function createMedia({ run = runScript, enabled = process.platform === 'win32', log = () => {} } = {}) {
  /** What she paused and hasn't resumed yet. */
  let paused = []
  // One call at a time, in order: a resume must never overtake its pause.
  let chain = Promise.resolve()
  const queue = (fn) => (chain = chain.then(fn, fn))

  return {
    pause: () =>
      queue(async () => {
        if (!enabled) return
        const now = await run('pause')
        if (now.length) log(`[ayra] paused for listening: ${now.join(', ')}`)
        paused = [...new Set([...paused, ...now])]
      }),
    resume: () =>
      queue(async () => {
        if (!enabled || !paused.length) return
        const ids = paused
        paused = []
        await run('resume', ids)
      }),
  }
}
