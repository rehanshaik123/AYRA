// Unit tests for gate.review() — full laptop control, with four things that ask
// the owner first (Phase 5, the owner's answer "a"). `npm test`
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ASK, createGate, riskOfCommand, riskOfPath, riskOfPageAction } from '../bridge/gate.mjs'

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
