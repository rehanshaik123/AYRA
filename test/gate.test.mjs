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
  assert.ok(writes.builtins.includes('PowerShell') && writes.builtins.includes('Write'))
})

test('AYRA is given the web and nothing on the laptop', () => {
  assert.deepEqual(readOnly.builtins, ['WebFetch', 'WebSearch', 'ToolSearch'])
  for (const tool of ['Read', 'Glob', 'Grep', 'Bash', 'PowerShell']) {
    assert.ok(!readOnly.builtins.includes(tool), tool)
  }
})

test("AYRA's display is always allowed; removed servers get no free pass", () => {
  assert.equal(readOnly.decide('mcp__ayra__display'), true)
  assert.equal(readOnly.decide('mcp__ayra__blade'), true)
  // Chrome, camera and interface control were removed. A server reusing one of
  // those names now falls to the ordinary verb rules like any other.
  assert.equal(readOnly.decide('mcp__ayra_chrome__chrome_navigate'), false)
  assert.equal(readOnly.decide('mcp__ayra_ui__ui_theme'), false)
  assert.equal(readOnly.decide('mcp__ayra_eyes__look'), false)
})

test("AYRA's own tools are allowed by name, and only by name", () => {
  const named = [
    'mcp__ayra__display',
    'mcp__ayra__blade',
    'mcp__ayra__probe_url',
    'mcp__ayra__show_data',
    'mcp__ayra_research__research',
    'mcp__ayra_research__recent_research',
  ]
  for (const gate of [readOnly, writes]) {
    for (const tool of named) assert.equal(gate.decide(tool), true, tool)
  }
  assert.deepEqual(readOnly.review('mcp__ayra__show_data', { title: 'GOLD', headline: { label: 'a', value: '1' } }), { verdict: 'allow' })
  // A tool on those servers that is not on the list gets no free pass: it falls
  // to the default rules like any other server's (with writes off, refused).
  for (const tool of ['mcp__ayra__run_script', 'mcp__ayra__ui_theme', 'mcp__ayra_research__delete_reports']) {
    assert.equal(readOnly.decide(tool), false, tool)
  }
  // The default rules still apply in full: a read verb reads, an effectful one needs writes.
  assert.equal(readOnly.decide('mcp__ayra_research__list_reports'), true)
  assert.equal(writes.decide('mcp__ayra_research__delete_reports'), true)
})

test('the research agent only reads, so it is allowed with writes off', () => {
  for (const gate of [readOnly, writes]) {
    assert.equal(gate.decide('mcp__ayra_research__research'), true)
    assert.equal(gate.decide('mcp__ayra_research__recent_research'), true)
    assert.deepEqual(gate.review('mcp__ayra_research__research', { question: 'Is coffee good for you?' }), { verdict: 'allow' })
  }
  // A look-alike name gets no free pass.
  assert.equal(readOnly.decide('mcp__ayra_researcher__delete_report'), false)
})

test('researcher mode (deep_research) only searches and reads, so it is allowed with writes off', () => {
  for (const gate of [readOnly, writes]) {
    assert.equal(gate.decide('mcp__ayra_research__deep_research'), true)
    assert.deepEqual(gate.review('mcp__ayra_research__deep_research', { question: 'Best local LLM for coding?' }), { verdict: 'allow' })
  }
  // Only on its own server, and only by its exact name.
  assert.equal(readOnly.decide('mcp__ayra__deep_research'), false)
  assert.equal(readOnly.decide('mcp__ayra_research__deep_research_delete'), false)
})

test('other MCP servers: read verbs pass, effectful verbs need writes', () => {
  assert.equal(readOnly.decide('mcp__android__list_devices'), true)
  assert.equal(readOnly.decide('mcp__android__install_apk'), false)
  assert.equal(writes.decide('mcp__android__install_apk'), true)
  assert.equal(readOnly.decide('mcp__twilio__make_outbound_call'), false)
  assert.equal(readOnly.decide('mcp__openrouter__send-message'), true)
})

test('the notes server: reading always, saving and changing only with writes, nothing unnamed', () => {
  for (const t of ['notes_search', 'notes_read']) {
    assert.equal(readOnly.decide(`mcp__ayra_notes__${t}`), true, t)
    assert.equal(writes.decide(`mcp__ayra_notes__${t}`), true, t)
  }
  for (const t of ['notes_capture', 'notes_save', 'notes_add', 'notes_edit', 'notes_picture', 'notes_open']) {
    assert.equal(readOnly.decide(`mcp__ayra_notes__${t}`), false, t)
    assert.equal(writes.decide(`mcp__ayra_notes__${t}`), true, t)
    // None of them deletes or sends, so none waits for Approve.
    assert.deepEqual(writes.review(`mcp__ayra_notes__${t}`, { note: 'ml/x.md' }), { verdict: 'allow' }, t)
  }
  // A tool added later and not named in the gate is refused, writes or not.
  assert.equal(writes.decide('mcp__ayra_notes__notes_delete'), false)
  assert.equal(writes.decide('mcp__ayra_notes__notes_list'), false)
})
