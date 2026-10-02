// Unit tests for bridge/gate.mjs — what AYRA may run. `npm test`
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGate } from '../bridge/gate.mjs'

const ACCOUNT = [
  'claude.ai Gmail', 'claude.ai Google Calendar', 'claude.ai Google Drive',
  'claude.ai Figma', 'claude.ai draw.io', 'claude.ai Beautiful.ai',
]
const readOnly = createGate({ allowWrites: false, everConnected: ACCOUNT })
const writes = createGate({ allowWrites: true, everConnected: ACCOUNT })

test('allowed connectors may read', () => {
  for (const tool of [
    'mcp__claude_ai_Gmail__search_threads',
    'mcp__claude_ai_Gmail__get_message',
    'mcp__claude_ai_Google_Calendar__list_events',
    'mcp__claude_ai_Google_Calendar__suggest_time',
    'mcp__claude_ai_Google_Drive__read_file_content',
  ]) {
    assert.equal(readOnly.decide(tool), true, tool)
  }
})

test('connector actions are denied even with writes on', () => {
  for (const tool of [
    'mcp__claude_ai_Gmail__send_message',
    'mcp__claude_ai_Gmail__reply',
    'mcp__claude_ai_Gmail__forward',
    'mcp__claude_ai_Gmail__trash_thread',
    'mcp__claude_ai_Google_Calendar__create_event',
    'mcp__claude_ai_Google_Drive__share_file',
    'mcp__claude_ai_Google_Drive__download_file_content',
  ]) {
    assert.equal(readOnly.decide(tool), false, tool)
    assert.equal(writes.decide(tool), false, tool)
  }
})

test('connectors not on the list are denied and removed from the session', () => {
  assert.equal(readOnly.decide('mcp__claude_ai_Figma__get_screenshot'), false)
  assert.deepEqual(readOnly.disallowed, [
    'mcp__claude_ai_Figma', 'mcp__claude_ai_draw_io', 'mcp__claude_ai_Beautiful_ai',
  ])
  assert.deepEqual(readOnly.excludedConnectors, ['Figma', 'draw.io', 'Beautiful.ai'])
})

test('an empty connector list allows none', () => {
  const none = createGate({ allowWrites: false, connectors: [], everConnected: ACCOUNT })
  assert.equal(none.decide('mcp__claude_ai_Gmail__search_threads'), false)
  assert.equal(none.disallowed.length, ACCOUNT.length)
})

test('built-in tools: reads always, shells and edits only with writes', () => {
  for (const tool of ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'ToolSearch']) {
    assert.equal(readOnly.decide(tool), true, tool)
  }
  for (const tool of ['Bash', 'PowerShell', 'Write', 'Edit', 'Artifact', 'SendMessage', 'CronCreate']) {
    assert.equal(readOnly.decide(tool), false, tool)
  }
  assert.equal(writes.decide('PowerShell'), true)
  assert.deepEqual(readOnly.builtins, ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'ToolSearch'])
  assert.ok(writes.builtins.includes('PowerShell') && writes.builtins.includes('Write'))
})

test("AYRA's own tool servers are always allowed", () => {
  for (const tool of [
    'mcp__ayra__display', 'mcp__ayra_ui__ui_theme',
    'mcp__ayra_chrome__chrome_navigate', 'mcp__ayra_eyes__look',
  ]) {
    assert.equal(readOnly.decide(tool), true, tool)
  }
})

test('other MCP servers: read verbs pass, effectful verbs need writes', () => {
  assert.equal(readOnly.decide('mcp__android__list_devices'), true)
  assert.equal(readOnly.decide('mcp__android__install_apk'), false)
  assert.equal(writes.decide('mcp__android__install_apk'), true)
  assert.equal(readOnly.decide('mcp__twilio__make_outbound_call'), false)
  assert.equal(readOnly.decide('mcp__openrouter__send-message'), true)
})
