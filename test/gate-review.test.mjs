// Unit tests for gate.review() — full laptop control, with four things that ask
// the owner first (Phase 5, the owner's answer "a"). `npm test`
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import {
  ASK, OWN_DIRS, SECRETS, createGate, isOwnPage, isOwnPath, isOwnWindow, redactSecrets, riskOfAppAction,
  riskOfCommand, riskOfPath, riskOfPageAction, touchesSecrets,
} from '../bridge/gate.mjs'

const laptop = createGate({ allowWrites: true, laptop: true, connectors: [], everConnected: [] })
const readOnly = createGate({ allowWrites: false, connectors: [], everConnected: [] })

test('with the laptop on, AYRA gets the shell and the files', () => {
  assert.deepEqual(laptop.builtins, [
    'WebFetch', 'WebSearch', 'ToolSearch', 'Read', 'Glob', 'Grep', 'PowerShell', 'Write', 'Edit',
  ])
})

test('everyday commands just run', () => {
  for (const c of [
    'Start-Process chrome', 'Stop-Process -Name notepad', 'Get-ChildItem $HOME\\Downloads',
    'Get-Date -Format yyyy-MM-dd', 'Move-Item a.txt b.txt', 'Set-Volume 30',
    'Invoke-RestMethod https://api.github.com', 'curl https://example.com',
    'Get-Process | Sort-Object CPU -Descending | Select-Object -First 5',
  ]) {
    assert.equal(riskOfCommand(c), null, c)
    assert.deepEqual(laptop.review('PowerShell', { command: c }), { verdict: 'allow' }, c)
  }
})

test('deleting for good asks', () => {
  for (const c of [
    'Remove-Item C:\\Users\\me\\x -Recurse -Force', 'Get-ChildItem *.tmp | rm', 'del notes.txt',
    'rmdir /s /q build', 'Clear-RecycleBin -Force', 'format D: /q', 'Format-Volume -DriveLetter D',
  ]) {
    assert.equal(riskOfCommand(c), ASK.delete, c)
  }
  const r = laptop.review('PowerShell', { command: 'Remove-Item old.zip' })
  assert.equal(r.verdict, 'ask')
  assert.equal(r.reason, ASK.delete)
  assert.equal(r.detail, 'Remove-Item old.zip')
})

test('passwords and security settings ask', () => {
  for (const c of [
    'Set-MpPreference -DisableRealtimeMonitoring $true', 'netsh advfirewall set allprofiles state off',
    'net user admin hunter2', 'reg add HKLM\\Software\\X /v Y /d 1', 'Set-ExecutionPolicy Unrestricted',
    'cmdkey /list', 'Stop-Service WinDefend', 'icacls C:\\data /grant Everyone:F',
  ]) {
    assert.equal(riskOfCommand(c), ASK.security, c)
  }
})

test('sending from the shell asks', () => {
  for (const c of [
    'Send-MailMessage -To a@b.com -Subject hi',
    'Invoke-RestMethod -Uri https://x.com/api -Method Post -Body $b',
    'curl -X POST https://x.com -d @data.json',
    'curl.exe --data "a=1" https://x.com',
  ]) {
    assert.equal(riskOfCommand(c), ASK.send, c)
  }
})

test("system files ask; the owner's own files do not", () => {
  assert.equal(riskOfPath('C:\\Windows\\System32\\drivers\\etc\\hosts'), ASK.security)
  assert.equal(riskOfPath('C:\\Program Files\\App\\config.ini'), ASK.security)
  assert.equal(riskOfPath('C:\\Users\\REHAN\\.ssh\\id_ed25519'), ASK.security)
  assert.equal(riskOfPath('C:\\Users\\REHAN\\Documents\\notes.md'), null)
  assert.equal(laptop.review('Write', { file_path: 'C:\\Users\\REHAN\\Desktop\\todo.txt' }).verdict, 'allow')
  assert.equal(laptop.review('Edit', { file_path: 'C:\\ProgramData\\x.json' }).verdict, 'ask')
})

test('on a web page: buying, sending, deleting and passwords ask; browsing does not', () => {
  assert.equal(riskOfPageAction({ action: 'click', label: 'Place your order' }), ASK.money)
  assert.equal(riskOfPageAction({ action: 'click', label: 'Buy now' }), ASK.money)
  assert.equal(riskOfPageAction({ action: 'click', label: 'Send' }), ASK.send)
  assert.equal(riskOfPageAction({ action: 'click', label: 'Post' }), ASK.send)
  assert.equal(riskOfPageAction({ action: 'click', label: 'Connect' }), ASK.send)
  assert.equal(riskOfPageAction({ action: 'click', label: 'Delete account' }), ASK.delete)
  assert.equal(riskOfPageAction({ action: 'type', field: 'password' }), ASK.security)
  assert.equal(
    riskOfPageAction({ action: 'click', label: 'Next', url: 'https://myaccount.google.com/security' }),
    ASK.security,
  )
  assert.equal(riskOfPageAction({ action: 'enter', field: 'text' }), ASK.send, 'Enter in a message box sends')
  for (const a of [
    { action: 'click', label: 'Images' },
    { action: 'click', label: 'Next page' },
    { action: 'type', label: 'Search', field: 'search' },
    { action: 'enter', field: 'search' },
    { action: 'click', label: 'Add to cart' },
    { action: 'click', label: 'Sign in' },
  ]) {
    assert.equal(riskOfPageAction(a), null, JSON.stringify(a))
  }
})

test('a tool the gate refuses is denied before any review', () => {
  assert.deepEqual(readOnly.review('PowerShell', { command: 'Get-Date' }), { verdict: 'deny' })
})

test("her Chrome is allowed; it asks the owner itself, with the button's real label", () => {
  for (const t of ['browser_open', 'browser_read', 'browser_click', 'browser_type']) {
    assert.equal(laptop.decide(`mcp__ayra_browser__${t}`), true, t)
    assert.deepEqual(laptop.review(`mcp__ayra_browser__${t}`, { ref: 3 }), { verdict: 'allow' }, t)
  }
})

test('her Windows apps are allowed; they ask the owner themselves', () => {
  for (const t of ['apps_list', 'apps_read', 'apps_click', 'apps_press']) {
    assert.equal(laptop.decide(`mcp__ayra_apps__${t}`), true, t)
    assert.deepEqual(laptop.review(`mcp__ayra_apps__${t}`, { ref: 3 }), { verdict: 'allow' }, t)
  }
})

test('an app action asks for the same four things, and anything in a security window', () => {
  const notepad = { window: 'notes.txt - Notepad', app: 'Notepad' }
  for (const [what, reason] of [
    [{ action: 'click', label: 'Delete', ...notepad }, ASK.delete],
    [{ action: 'click', label: 'Buy', window: 'Microsoft Store', app: 'WinStore.App' }, ASK.money],
    [{ action: 'click', label: 'Send', window: 'Mail', app: 'olk' }, ASK.send],
    [{ action: 'click', label: 'Open', window: 'Windows Security', app: 'ApplicationFrameHost' }, ASK.security],
    [{ action: 'click', label: 'Edit', window: 'Registry Editor', app: 'regedit' }, ASK.security],
    [{ action: 'click', label: 'Microphone access', window: 'Settings', app: 'SystemSettings' }, ASK.security],
    [{ action: 'click', label: 'PIN (Windows Hello)', window: 'Settings', app: 'SystemSettings' }, ASK.security],
    [{ action: 'type', field: 'password', label: 'Password', window: 'Sign in', app: 'Teams' }, ASK.security],
    [{ action: 'press', keys: 'enter', field: 'text', label: 'Type a message', window: 'Chat', app: 'Teams' }, ASK.send],
    [{ action: 'press', keys: 'ctrl+enter', field: 'text', window: 'Mail', app: 'olk' }, ASK.send],
    [{ action: 'press', keys: 'alt+s', window: 'Mail', app: 'olk' }, ASK.send],
    [{ action: 'press', keys: 'shift+delete', window: 'Downloads', app: 'explorer' }, ASK.delete],
  ]) {
    assert.equal(riskOfAppAction(what), reason, JSON.stringify(what))
  }
  for (const what of [
    { action: 'click', label: 'Save', ...notepad },
    { action: 'click', label: 'Pin to taskbar', window: 'Start', app: 'StartMenuExperienceHost' },
    { action: 'click', label: 'Seven', window: 'Calculator', app: 'ApplicationFrameHost' },
    { action: 'type', field: 'text', label: 'Text editor', ...notepad },
    { action: 'press', keys: 'ctrl+s', ...notepad },
    { action: 'press', keys: 'shift+enter', field: 'text', window: 'Chat', app: 'Teams' },
    { action: 'press', keys: 'enter', field: 'search', label: 'Search', window: 'File Explorer', app: 'explorer' },
    { action: 'press', keys: 'delete', window: 'Downloads', app: 'explorer' },
  ]) {
    assert.equal(riskOfAppAction(what), null, JSON.stringify(what))
  }
})

test('files of keys and passwords are named wherever they appear; .env.example is not one', () => {
  for (const s of [
    String.raw`E:\jarvis\.env.local`, '.env', 'Get-Content .env.local', "cat '/srv/ayra/.env.production'",
    '.env.local - Notepad', String.raw`C:\Users\R\.claude\.credentials.json`, String.raw`C:\Users\R\.ssh\id_ed25519`,
    String.raw`C:\Users\R\AppData\Local\AYRA\Chrome\Default\Login Data`,
  ]) {
    assert.equal(touchesSecrets(s), true, s)
  }
  for (const s of [String.raw`E:\jarvis\.env.example`, 'Copy .env.example to start', 'my.environment.txt', 'Get-Date', '', undefined]) {
    assert.equal(touchesSecrets(s), false, String(s))
  }
})

test('reading, searching or changing a secrets file is refused outright, not asked', () => {
  const refused = { verdict: 'deny', reason: SECRETS }
  const env = String.raw`E:\jarvis\.env.local`
  assert.deepEqual(laptop.review('Read', { file_path: env }), refused)
  assert.deepEqual(laptop.review('Grep', { pattern: 'TOKEN', path: env }), refused)
  assert.deepEqual(laptop.review('Edit', { file_path: env }), refused)
  assert.deepEqual(laptop.review('PowerShell', { command: `Get-Content ${env}` }), refused)
  assert.deepEqual(laptop.review('Read', { file_path: String.raw`E:\jarvis\.env.example` }), { verdict: 'allow' })
  assert.deepEqual(laptop.review('Grep', { pattern: 'password', path: String.raw`E:\jarvis\src` }), { verdict: 'allow' })
})

test('key-shaped text is blanked before the model sees it; ordinary text is left alone', () => {
  const s = redactSecrets(
    'ELEVENLABS_API_KEY=sk_0123456789abcdef0123456789abcdef0123456789abcdef\n' +
      'AYRA_TELEGRAM_TOKEN=1234567890:AAH-abcdefghijklmnopqrstuvwxyz0123456\n' +
      'password: hunter2 and ghp_abcdefghijklmnopqrstuvwxyz0123456789',
  )
  assert.doesNotMatch(s, /sk_0123|AAH-abc|hunter2|ghp_abc/)
  assert.match(s, /ELEVENLABS_API_KEY=\[hidden\]/)
  const plain = 'Display is 56. Open the Downloads folder; the key to success is practice.'
  assert.equal(redactSecrets(plain), plain)
})

test('her own code and settings ask before they change; reading them is fine', () => {
  const [repo, home] = OWN_DIRS
  const gateFile = join(repo, 'bridge', 'gate.mjs')
  assert.equal(isOwnPath(gateFile), true)
  assert.equal(isOwnPath(gateFile.replace(/\\/g, '/').toUpperCase()), true)
  assert.equal(isOwnPath(join(home, 'ayra.ini')), true)
  assert.equal(isOwnPath(`${repo}2\\notes.txt`), false)
  assert.equal(riskOfPath(gateFile), ASK.security)
  assert.equal(riskOfPath(String.raw`C:\Users\R\Documents\notes.txt`), null)
  assert.deepEqual(laptop.review('Edit', { file_path: gateFile }), { verdict: 'ask', reason: ASK.security, detail: gateFile })

  for (const c of [
    `Set-Content ${gateFile} 'x'`,
    `Copy-Item C:\\temp\\gate.mjs ${repo}\\bridge\\`,
    `cd ${repo}; git log > ${repo}\\x.txt`,
    `Set-Content "$env:LOCALAPPDATA\\AYRA\\ayra.ini" 'node=evil.exe'`,
    `Copy-Item x.lnk "$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\"`,
    'schtasks /create /tn x /tr calc.exe /sc onlogon',
    'Register-ScheduledTask -TaskName x -Action $a',
  ]) {
    assert.equal(riskOfCommand(c), ASK.security, c)
  }
  for (const c of [
    `Get-Content ${repo}\\README.md 2>$null`,
    `Get-ChildItem ${repo}`,
    `Set-Content ${repo}2\\notes.txt 'x'`,
    'schtasks /query',
    'Get-ScheduledTask',
  ]) {
    assert.equal(riskOfCommand(c), null, c)
  }
})

test("her own face and window are never her tools' to touch", () => {
  for (const url of ['http://localhost:5173/', 'http://127.0.0.1:8787/health', 'http://[::1]:5180/', 'http://localhost:9222/json']) {
    assert.equal(isOwnPage(url), true, url)
  }
  for (const url of ['https://example.com', 'http://localhost:3000', 'http://192.168.1.8:5173/', 'not a url']) {
    assert.equal(isOwnPage(url), false, url)
  }
  assert.equal(isOwnWindow('A.Y.R.A.', 'A.Y.R.A.'), true)
  assert.equal(isOwnWindow('A.Y.R.A. - Google Chrome', 'A.Y.R.A.'), true)
  assert.equal(isOwnWindow('Calculator', 'A.Y.R.A.'), false)
  assert.equal(isOwnWindow('Notes about A.Y.R.A. - Notepad', 'A.Y.R.A.'), false)
})


test('a script that fakes keys or clicks, or drives UI automation, asks first', () => {
  for (const c of [
    "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('y')",
    '(New-Object -ComObject WScript.Shell).SendKeys("y")',
    'Add-Type -AssemblyName UIAutomationClient; [System.Windows.Automation.AutomationElement]::RootElement',
    '[Win32]::keybd_event(0x59, 0, 0, 0)',
  ]) {
    assert.equal(riskOfCommand(c), ASK.security, c)
  }
  for (const c of ['Get-Process | Sort-Object CPU', 'Send-Notification is not a thing', 'Get-Content notes.txt']) {
    assert.equal(riskOfCommand(c), null, c)
  }
})
