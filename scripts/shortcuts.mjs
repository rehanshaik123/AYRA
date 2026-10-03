/**
 * Desktop shortcuts for the owner — `npm run shortcuts`.
 *
 *   AYRA            one click: starts AYRA if needed and opens her app window
 *   Chrome (AYRA)   the owner's Chrome from now on: the profile AYRA can drive
 *
 * Windows does not let a program pin to the taskbar; the owner right-clicks each
 * shortcut → "Pin to taskbar". `--startup` also puts AYRA in the Startup folder,
 * so she starts with Windows (the owner's choice, not the default).
 */

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { chromeArgs, chromePath } from '../bridge/browser.mjs'

if (process.platform !== 'win32') {
  console.log('Shortcuts are for Windows; on this system run `npm start` and open http://localhost:5173.')
  process.exit(0)
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const chrome = chromePath()
if (!chrome) {
  console.error('Chrome is not installed — install it first, then run this again.')
  process.exit(1)
}

/** A command-line argument as Windows expects it: quoted when it has spaces. */
const quote = (a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)
const psString = (s) => `'${String(s).replace(/'/g, "''")}'`

const shortcuts = [
  {
    name: 'AYRA',
    target: process.execPath,
    args: quote(join(ROOT, 'scripts', 'open.mjs')),
    // Minimised: the launcher's own console should not flash up.
    style: 7,
    icon: `${chrome},0`,
  },
  {
    name: 'Chrome (AYRA)',
    target: chrome,
    args: chromeArgs().map(quote).join(' '),
    style: 1,
    icon: `${chrome},0`,
  },
]

const folders = ["[Environment]::GetFolderPath('Desktop')"]
if (process.argv.includes('--startup')) folders.push("[Environment]::GetFolderPath('Startup')")

const script = [
  '$shell = New-Object -ComObject WScript.Shell',
  ...folders.flatMap((folder) =>
    shortcuts
      .filter((s) => folder.includes('Desktop') || s.name === 'AYRA')
      .map((s) =>
        [
          `$l = $shell.CreateShortcut((Join-Path (${folder}) ${psString(`${s.name}.lnk`)}))`,
          `$l.TargetPath = ${psString(s.target)}`,
          `$l.Arguments = ${psString(s.args)}`,
          `$l.WorkingDirectory = ${psString(ROOT)}`,
          `$l.IconLocation = ${psString(s.icon)}`,
          `$l.WindowStyle = ${s.style}`,
          '$l.Save()',
          `Write-Output ('  made ' + (Join-Path (${folder}) ${psString(`${s.name}.lnk`)}))`,
        ].join('; '),
      ),
  ),
].join('\n')

const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8' })
process.stdout.write(result.stdout)
if (result.status !== 0) {
  console.error(result.stderr)
  process.exit(1)
}
console.log('\nRight-click each shortcut on the Desktop → "Pin to taskbar".')
