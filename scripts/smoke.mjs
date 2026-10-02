/**
 * Smoke test for the brain.
 *
 * Talks to a running bridge exactly the way the face does — same socket, same
 * Origin header, same message shapes — asks one question, and reports whether
 * a real answer came back. It is the quickest proof that the whole chain works:
 * the bridge is up, the Agent SDK can spawn Claude Code, and the owner's login
 * is accepted.
 *
 *   npm run smoke                      (the bridge must already be running)
 *   npm run smoke -- "what time is it" (ask something else)
 *
 * Exits 0 on a non-empty answer, 1 on anything else. Each run is one real turn,
 * so it spends a little of the owner's Claude usage — run it once per check,
 * not in a loop.
 */

import WebSocket from 'ws'

const PORT = Number(process.env.AYRA_BRIDGE_PORT ?? 8787)
const TIMEOUT_MS = 180_000
const question =
  process.argv.slice(2).join(' ').trim() ||
  'This is an automated systems check. Reply with exactly one word: online'

const fail = (why) => {
  console.error(`[smoke] FAIL — ${why}`)
  process.exit(1)
}

// 1. Health, over plain HTTP. Distinguishes "bridge not running" from
//    "bridge running but the brain is broken", which need different fixes.
try {
  const res = await fetch(`http://localhost:${PORT}/health`, {
    headers: { origin: 'http://localhost:5173' },
  })
  const body = await res.json()
  console.log(`[smoke] /health → ${JSON.stringify(body)}`)
  if (!body.ok) fail('/health did not report ok')
} catch (err) {
  fail(`bridge not reachable on port ${PORT} (${err.message}) — start it with npm run bridge`)
}

// 2. One turn over the socket.
const started = Date.now()
const ws = new WebSocket(`ws://localhost:${PORT}`, {
  origin: 'http://localhost:5173',
})
const askId = `smoke-${started.toString(36)}`
let text = ''
const tools = []

const timer = setTimeout(() => {
  ws.terminate()
  fail(`no answer within ${TIMEOUT_MS / 1000}s`)
}, TIMEOUT_MS)

ws.on('error', (err) => fail(`socket error: ${err.message}`))

ws.on('message', (raw) => {
  let msg
  try {
    msg = JSON.parse(raw.toString())
  } catch {
    return
  }
  if (msg.type === 'ready' && !ws.asked) {
    ws.asked = true
    console.log(`[smoke] connected · ${msg.servers?.length ?? 0} MCP servers listed`)
    console.log(`[smoke] asking: ${question}`)
    ws.send(JSON.stringify({ type: 'ask', id: askId, text: question }))
    return
  }
  // Only frames tagged with our id belong to this turn.
  if (msg.ask !== undefined && msg.ask !== askId) return
  if (msg.type === 'text') text += msg.delta
  if (msg.type === 'tool') tools.push(msg.name)
  if (msg.type === 'error') {
    clearTimeout(timer)
    ws.close()
    fail(`bridge reported: ${msg.message}`)
  }
  if (msg.type === 'done') {
    clearTimeout(timer)
    ws.close()
    const answer = (msg.text || text).trim()
    const secs = ((Date.now() - started) / 1000).toFixed(1)
    if (tools.length) console.log(`[smoke] tools used: ${tools.join(', ')}`)
    console.log(`[smoke] answer (${secs}s): ${answer || '(empty)'}`)
    if (!answer) fail('the turn finished with an empty answer')
    // A bridge that predates the is_error check delivers API failures as an
    // ordinary answer; never let that count as a pass.
    if (/^API Error\b/i.test(answer)) fail('the answer is an API error, not a reply')
    console.log('[smoke] PASS')
    process.exit(0)
  }
})
