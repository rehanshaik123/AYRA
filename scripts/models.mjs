/**
 * Downloads the offline wake-word model for hands-free mode (bridge/wake.mjs).
 *
 *   npm run models
 *
 * sherpa-onnx's English keyword spotter (k2-fsa, Apache-2.0), 17.6 MB from the
 * project's own GitHub releases, unpacked into data/models/ (gitignored). Only
 * the int8 model files and the token list are kept. Safe to run again: it does
 * nothing when the model is already there.
 */

import { mkdirSync, rmSync, readdirSync, createWriteStream, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { MODEL_DIR, MODEL_FILES, MODEL_URL, modelReady } from '../bridge/wake.mjs'

if (modelReady()) {
  console.log(`[models] the wake-word model is already in ${MODEL_DIR}`)
  process.exit(0)
}

const parent = dirname(MODEL_DIR)
mkdirSync(parent, { recursive: true })
const archive = join(parent, 'kws.tar.bz2')

console.log(`[models] downloading ${MODEL_URL}`)
const res = await fetch(MODEL_URL)
if (!res.ok || !res.body) {
  console.error(`[models] download failed: HTTP ${res.status}`)
  process.exit(1)
}
await pipeline(Readable.fromWeb(res.body), createWriteStream(archive))

// tar ships with Windows 10+ and every Linux; it reads bzip2 itself. Run inside
// the folder with a relative name: GNU tar (Git Bash) reads "E:\…" as a host.
const tar = spawnSync('tar', ['-xjf', 'kws.tar.bz2'], { cwd: parent, stdio: 'inherit' })
rmSync(archive, { force: true })
if (tar.status !== 0 || !existsSync(MODEL_DIR)) {
  console.error('[models] could not unpack the archive (is `tar` on the PATH?)')
  process.exit(1)
}

// Keep what the spotter loads; the full-precision copies and the samples are unused.
const keep = new Set(Object.values(MODEL_FILES))
for (const name of readdirSync(MODEL_DIR)) {
  if (!keep.has(name)) rmSync(join(MODEL_DIR, name), { recursive: true, force: true })
}

if (!modelReady()) {
  console.error('[models] the archive did not contain the expected files')
  process.exit(1)
}
console.log(`[models] ready: ${MODEL_DIR}`)
