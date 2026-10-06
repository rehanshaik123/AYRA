/**
 * AYRA local bridge (forked from the JARVIS bridge, adewaskar/jarvis).
 *
 * Runs the Claude Agent SDK — Claude Code as a library — and exposes one turn
 * of conversation over a WebSocket. The browser stays the face and the voice;
 * this process is the brain and the hands.
 *
 * No API key: it authenticates exactly the way `claude` does, off the owner's
 * existing login. AYRA's tools today are web search, reading web pages and the
 * HUD's display; everything else arrives one tool at a time (PLAN.md).
 *
 *   node bridge/server.mjs
 */

// First, so .env.local is loaded before anything below reads the environment.
import { IDENTITY, env } from './identity.mjs'
import { SYSTEM_PROMPT, TEXT_PROMPT } from './persona.mjs'
import { createGate } from './gate.mjs'
import { WebSocket, WebSocketServer } from 'ws'
import { createBrain } from './brain.mjs'
import { createOriginCheck } from './origin.mjs'
import { createAudit } from './audit.mjs'
import { startTelegram } from './telegram.mjs'
import { displayServer } from './panels.mjs'
import { sourcesCard } from './sources.mjs'
import { relayListening } from './listen.mjs'
import { serveFace } from './face.mjs'
import { createApprovals } from './approvals.mjs'
import { createAllowances } from './allowances.mjs'
import { rulesServer } from './rules.mjs'
import { watchPresence } from './presence.mjs'
import { createStore } from './state.mjs'
import { browserServer } from './browser.mjs'
import { appsServer } from './apps.mjs'
import { homedir } from 'node:os'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openRemote, proxyError, vetTarget, PROXY_UA } from './net.mjs'
import { renderPage } from './page.mjs'

const PORT = Number(env('BRIDGE_PORT', 8787))

/**
 * A crash here takes the whole assistant down mid-sentence, and most of what
 * can reject is out of our hands — a socket dying under a write, an upstream
 * fetch aborting. Log it and keep serving; the turn that failed will surface
 * its own error to the browser.
 */
process.on('unhandledRejection', (err) => {
  console.error('[ayra] unhandled rejection:', err)
})

/** Who may talk to this bridge — local dev pages by default; see origin.mjs. */
const ORIGINS = createOriginCheck({
  extraOrigins: env('ALLOWED_ORIGINS', ''),
  allowNoOrigin: env('ALLOW_NO_ORIGIN') === '1',
})

/**
 * Laptop control is on — the owner's decision (2026-10-03, answer "a"): AYRA
 * runs PowerShell and edits files herself, every call reviewed by the gate, and
 * the four things the owner chose (spending money, sending as them, deleting for
 * good, passwords and security) wait for their Approve. AYRA_ALLOW_WRITES=0
 * turns it off for this process — reading only, like before Phase 5.
 */
const ALLOW_WRITES = env('ALLOW_WRITES', '1') !== '0'
/** Her Windows apps work through UI Automation, which only Windows has. */
const WINDOWS = process.platform === 'win32'

/**
 * The orchestrator model. Override with AYRA_MODEL to trade quality for pace
 * — claude-sonnet-5-5 is noticeably snappier, and lighter on the plan's usage
 * limits, if Opus feels slow.
 */
const MODEL = env('MODEL', 'claude-opus-5-5')

/**
 * How hard the model thinks before answering.
 *
 * 'low', measured (PROGRESS.md, task 4.4): on a search question 'medium' spent
 * about four and a half seconds thinking before it said a word, and the answers
 * were no better for a spoken reply of two sentences. The owner wants no lag,
 * so the default is the fastest setting that still answers well; raise it with
 * AYRA_EFFORT when a task genuinely needs the depth.
 */
const EFFORT = env('EFFORT', 'low')

/**
 * Every tool loaded up front, none deferred behind ToolSearch.
 *
 * Claude Code defers built-ins like WebSearch and WebFetch behind a search step
 * to save context on big tool lists. AYRA's list is five tools, so the saving
 * is nothing and the cost is a whole extra model round trip — measured at 1–3
 * seconds — before her first search of a conversation. The SDK hands this
 * process's environment to Claude Code, so setting it here is enough.
 */
process.env.ENABLE_TOOL_SEARCH ??= 'false'

/**
 * Every claude.ai connector on the owner's account, as Claude Code itself
 * records them ("claude.ai Gmail", …). The gate uses this to remove the ones
 * AYRA may not use before a session starts — the session's own server list
 * only arrives after the first question, which is too late.
 */
function everConnected() {
  try {
    const cfg = JSON.parse(
      readFileSync(join(homedir(), '.claude.json'), 'utf8'),
    )
    return Array.isArray(cfg.claudeAiMcpEverConnected)
      ? cfg.claudeAiMcpEverConnected
      : []
  } catch {
    return []
  }
}

/**
 * What AYRA may run — the whole policy lives in gate.mjs. AYRA_CONNECTORS
 * lists the claude.ai connectors it may read (comma separated). Default
 * "none": the clean interface is web search only, and each connector comes
 * back as its own step. The rest are removed from the session by the gate.
 */
const CONNECTORS = env('CONNECTORS', 'none')
const GATE = createGate({
  allowWrites: ALLOW_WRITES,
  // The laptop's files and shell (Phase 5); writes add PowerShell and edits.
  laptop: true,
  connectors: CONNECTORS.toLowerCase() === 'none' ? [] : CONNECTORS.split(','),
  everConnected: everConnected(),
})

/**
 * ElevenLabs credentials, borrowed from the MCP server config.
 *
 * If you've set up the elevenlabs MCP server, the key is already on this
 * machine — no reason to make you paste it into a second .env file. The browser
 * never sees it: it POSTs text to /tts here and gets audio back.
 */
function elevenKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY
  try {
    const cfg = JSON.parse(
      readFileSync(join(homedir(), '.claude.json'), 'utf8'),
    )
    return cfg.mcpServers?.elevenlabs?.env?.ELEVENLABS_API_KEY ?? null
  } catch {
    return null
  }
}

// The owner's chosen ElevenLabs voice (config/identity.json); AYRA_VOICE_ID overrides it.
const VOICE_ID = env('VOICE_ID', IDENTITY.voice.elevenLabsId || 'JBFqnCBsd6RMkjVDRZzb')

// ---------------------------------------------------------------------------

/**
 * Remote media, fetched by the bridge instead of by the page.
 *
 * JARVIS used to refuse to show anything he found on the web, and the refusal
 * was not squeamishness — a bare <img src="https://some-cdn/..."> in a panel
 * genuinely did not work. Three reasons, and all three are fixed by moving the
 * fetch to this side of the wire:
 *
 *   1. Hotlink blocking. News sites and image CDNs check Referer and User-Agent
 *      and hand a browser-that-isn't-their-page a 403 or a placeholder. That is
 *      why thumbnails rendered as empty rectangles. A server-side fetch that
 *      looks like an ordinary browser and sends no referrer gets the bytes.
 *   2. Privacy. Panel HTML is authored by a model that has just been reading
 *      untrusted web pages, so a remote URL in it is a prompt-injection beacon:
 *      load it directly and the user's IP, and the fact they asked, go to a host
 *      the page chose. Proxying means the browser only ever talks to localhost
 *      and the page CSP can stay tight.
 *   3. One place to cap size, set timeouts and insist the bytes really are the
 *      media type they claim.
 *
 * The cost is that this process — unlike a browser tab — can reach the user's
 * LAN, their router's admin page, and cloud metadata endpoints. So everything
 * below is an SSRF gate first and a proxy second.
 */

const MAX_IMG_BYTES = 15 * 1024 * 1024
const MAX_MEDIA_BYTES = 200 * 1024 * 1024
const IMG_TIMEOUT_MS = 10_000
const MEDIA_TIMEOUT_MS = 30_000

// The SSRF gate and the guarded outbound clients now live in ./net.mjs, so the
// media proxy below and the page proxy share one implementation of the rules
// rather than two that can drift apart.

/**
 * The shared body of /img and /media.
 *
 * `kinds` is the list of content-type prefixes we are willing to hand back.
 * That check is load-bearing: without it this is an open proxy that will serve
 * an attacker's HTML from the bridge's own origin — the one origin allowed to
 * open the agent socket — which is the same reason IMAGE_TYPES has no .svg.
 */
async function proxyRemote(req, res, cors, { kinds, maxBytes, timeoutMs, ranged }) {
  const asked = new URL(req.url, 'http://x').searchParams.get('url') ?? ''
  const target = vetTarget(asked)

  const headers = {
    'user-agent': PROXY_UA,
    accept: ranged ? '*/*' : 'image/*,*/*;q=0.8',
    // Identity encoding so the byte cap counts the bytes we actually stream and
    // content-length means what it says. Media is already compressed anyway.
    'accept-encoding': 'identity',
  }
  // Range is the difference between a <video> that seeks and one Safari refuses
  // to play at all, so the browser's request is passed through verbatim.
  if (ranged && typeof req.headers.range === 'string') {
    headers.range = req.headers.range
  }

  const { res: upstream } = await openRemote(target, headers, timeoutMs)
  const status = upstream.statusCode ?? 0

  if (status !== 200 && status !== 206) {
    upstream.resume()
    throw proxyError(status === 404 ? 404 : 502, `upstream said ${status}`)
  }

  const type = String(upstream.headers['content-type'] ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase()
  if (!kinds.some((kind) => type.startsWith(kind))) {
    upstream.resume()
    throw proxyError(415, `not ${kinds.join(' or ')} (got ${type || 'nothing'})`)
  }

  const declared = Number(upstream.headers['content-length'])
  if (Number.isFinite(declared) && declared > maxBytes) {
    upstream.resume()
    throw proxyError(413, 'too large')
  }

  const out = {
    ...cors,
    'content-type': type,
    'x-content-type-options': 'nosniff',
    // Thumbnails get looked at, panelled again, and re-rendered on every HUD
    // repaint; re-fetching from the CDN each time is slow and rude.
    'cache-control': 'private, max-age=600',
  }
  if (Number.isFinite(declared)) out['content-length'] = String(declared)
  if (ranged) {
    // Only claim range support when the origin actually demonstrated it — a
    // 206, or an explicit accept-ranges of its own. Plenty of hosts ignore the
    // Range header and hand back the whole file with a 200; advertising
    // accept-ranges on top of that tells the video element it may seek by
    // issuing byte requests that will never be honoured, and the scrub bar
    // then misbehaves in a way that looks like our bug rather than theirs.
    if (status === 206 || upstream.headers['accept-ranges'] === 'bytes') {
      out['accept-ranges'] = 'bytes'
    }
    if (upstream.headers['content-range']) {
      out['content-range'] = upstream.headers['content-range']
    }
  }
  res.writeHead(status, out)

  // Stream with a running cap. Buffering a 200 MB video into this process
  // would stall the token stream the voice is riding on, and trusting
  // content-length would let a host that lies about it eat the heap.
  let sent = 0
  upstream.on('data', (chunk) => {
    sent += chunk.length
    if (sent > maxBytes) {
      // Headers went out long ago, so a truncated body is the only way left to
      // say no. The player sees a short read; we see this line in the log.
      console.warn(`[ayra] proxy cut ${target.href} at ${maxBytes} bytes`)
      upstream.destroy()
      res.destroy()
      return
    }
    if (!res.write(chunk)) {
      upstream.pause()
      res.once('drain', () => upstream.resume())
    }
  })
  upstream.on('end', () => res.end())
  upstream.on('error', () => res.destroy())
  req.on('close', () => upstream.destroy())
}

// ---------------------------------------------------------------------------

/**
 * CORS, reflected rather than wildcarded.
 *
 * `*` on this origin means any page on the internet can read whatever the
 * bridge serves, so the same allowlist that guards the socket picks the
 * header. A request carrying an Origin we don't know is refused outright —
 * but a request with no Origin at all is served, because an <img src> load
 * (which is how blades fetch pictures) never sends one.
 */
function corsFor(req) {
  const origin = req.headers.origin
  const headers = { vary: 'origin' }
  if (origin) {
    headers['access-control-allow-origin'] = origin
    headers['access-control-allow-headers'] = 'content-type'
  }
  return headers
}

// One HTTP server for both the speech proxy and the WebSocket upgrade.
const http = await import('node:http')

const handleRequest = async (req, res) => {
  const origin = req.headers.origin
  if (origin && !ORIGINS.allowed(origin)) {
    console.warn(`[ayra] refused http request from origin ${origin}`)
    res.writeHead(403, { vary: 'origin' })
    return res.end('forbidden')
  }
  const cors = corsFor(req)

  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors)
    return res.end()
  }

  if (req.method === 'GET' && req.url === '/health') {
    // The browser reads this once at boot to decide which voice engine to use.
    // Both premium paths ride the same ElevenLabs key, so both flags track it:
    // with a key the app transcribes with Scribe and speaks with ElevenLabs;
    // without one it falls back to the browser's own recogniser and voice, so a
    // student with nothing configured still has a working assistant.
    const eleven = Boolean(elevenKey())
    res.writeHead(200, { ...cors, 'content-type': 'application/json' })
    return res.end(JSON.stringify({ ok: true, tts: eleven, stt: eleven }))
  }

  // Remote images, fetched here so the page never talks to the wider web. The
  // renderer rewrites every http(s) <img src> in a panel to this endpoint.
  if (req.method === 'GET' && req.url?.startsWith('/img?')) {
    try {
      await proxyRemote(req, res, cors, {
        kinds: ['image/'],
        maxBytes: MAX_IMG_BYTES,
        timeoutMs: IMG_TIMEOUT_MS,
        ranged: false,
      })
    } catch (err) {
      if (res.headersSent) return res.destroy()
      res.writeHead(err.status ?? 502, cors)
      return res.end(err.message ?? 'proxy failed')
    }
    return
  }

  // The same, for video and audio. Separate from /img because the limits and
  // the Range handling are genuinely different, not because the code is.
  if (req.method === 'GET' && req.url?.startsWith('/media?')) {
    try {
      await proxyRemote(req, res, cors, {
        kinds: ['video/', 'audio/'],
        maxBytes: MAX_MEDIA_BYTES,
        timeoutMs: MEDIA_TIMEOUT_MS,
        ranged: true,
      })
    } catch (err) {
      if (res.headersSent) return res.destroy()
      res.writeHead(err.status ?? 502, cors)
      return res.end(err.message ?? 'proxy failed')
    }
    return
  }

  // A whole web page, fetched here and served from this origin so it can be
  // framed. The publisher's X-Frame-Options and CORS rules are enforced against
  // the browser, and from the browser's point of view this document is ours —
  // so an article that refuses to be embedded anywhere still opens on the
  // display. See page.mjs for what each mode does to the markup.
  //
  // No Origin header arrives on an iframe navigation, so this rides the same
  // path as an <img> load through the check at the top of this handler.
  if (req.method === 'GET' && req.url?.startsWith('/page?')) {
    const asked = new URL(req.url, 'http://x')
    const target = asked.searchParams.get('url') ?? ''
    const mode = asked.searchParams.get('mode') === 'live' ? 'live' : 'reader'
    try {
      const page = await renderPage(target, mode, `http://localhost:${PORT}`)
      res.writeHead(200, { ...cors, ...page.headers })
      return res.end(page.body)
    } catch (err) {
      // Rendered as a page rather than returned as a status, because this lands
      // inside an iframe: a bare 502 body is a blank rectangle on the display,
      // which reads as the interface being broken rather than as the article
      // being unavailable.
      res.writeHead(err.status ?? 502, {
        ...cors,
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
      })
      return res.end(
        `<!doctype html><meta charset="utf-8"><style>
           body{margin:0;padding:26px;background:transparent;color:#7fb6bf;
                font:400 13px/1.6 ui-monospace,monospace}
           b{color:#cfe9ee;font-weight:500;display:block;margin-bottom:6px}
         </style><b>This page could not be opened.</b>${
           String(err?.message ?? 'unknown error').replace(/[<&]/g, '')
         }`,
      )
    }
  }

  if (req.method === 'POST' && req.url === '/tts') {
    const key = elevenKey()
    if (!key) {
      res.writeHead(503, cors)
      return res.end('no elevenlabs key')
    }
    // A spoken line is a few hundred bytes. Anything approaching this is not a
    // sentence, and buffering it unbounded would let one request eat the heap.
    let body = ''
    let overflowed = false
    for await (const chunk of req) {
      body += chunk
      if (body.length > 64 * 1024) {
        overflowed = true
        break
      }
    }
    if (overflowed) {
      req.destroy()
      res.writeHead(400, cors)
      return res.end('body too large')
    }
    // Inside a try: this handler is async with nothing catching its rejection,
    // so a malformed body used to take the entire bridge down with it.
    let text
    try {
      ;({ text } = JSON.parse(body || '{}'))
    } catch {
      res.writeHead(400, cors)
      return res.end('bad json')
    }
    if (!text) {
      res.writeHead(400, cors)
      return res.end('no text')
    }
    try {
      const upstream = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream` +
          // 22kHz mono is half the bytes of 44kHz and indistinguishable through
          // a laptop speaker; optimize_streaming_latency=3 trades a little
          // prosody for a much earlier first byte.
          `?output_format=mp3_22050_32&optimize_streaming_latency=3`,
        {
          method: 'POST',
          headers: { 'xi-api-key': key, 'content-type': 'application/json' },
          body: JSON.stringify({
            text,
            // Flash is the low-latency model — a conversation needs speed more
            // than it needs the last few percent of quality.
            model_id: 'eleven_flash_v2_5',
            voice_settings: {
              stability: 0.4,
              similarity_boost: 0.75,
              speed: 1.05,
            },
          }),
        },
      )
      if (!upstream.ok) {
        res.writeHead(upstream.status, cors)
        return res.end(await upstream.text())
      }

      // Pipe it through rather than buffering. Waiting for the whole file here
      // would throw away everything the streaming endpoint just bought us.
      res.writeHead(200, {
        ...cors,
        'content-type': 'audio/mpeg',
        'cache-control': 'no-cache',
      })
      for await (const chunk of upstream.body) res.write(Buffer.from(chunk))
      return res.end()
    } catch (err) {
      res.writeHead(502, cors)
      return res.end(String(err?.message ?? err))
    }
  }

  // Speech to text. The browser captures one spoken segment as a compressed
  // audio blob and posts the raw bytes here; the bridge hands them to
  // ElevenLabs Scribe and returns the transcript. This is what replaced the
  // browser's own SpeechRecognition — that API dies silently under always-on
  // use, and a server-side transcriber cannot. Detecting that the user is
  // speaking at all is done locally with voice-activity detection, which never
  // touches this endpoint; this is only for the words.
  if (req.method === 'POST' && req.url === '/stt') {
    const key = elevenKey()
    if (!key) {
      res.writeHead(503, cors)
      return res.end('no elevenlabs key')
    }

    const type = req.headers['content-type'] || 'audio/webm'
    const chunks = []
    let size = 0
    let overflowed = false
    // A few seconds of Opus is well under a megabyte; 25 MB is a generous
    // ceiling that still refuses a runaway stream before it eats the heap.
    for await (const chunk of req) {
      chunks.push(chunk)
      size += chunk.length
      if (size > 25 * 1024 * 1024) {
        overflowed = true
        break
      }
    }
    if (overflowed) {
      req.destroy()
      res.writeHead(413, cors)
      return res.end('audio too large')
    }
    // Silence, or a click. Nothing to transcribe, and calling out to the API
    // for it would only add latency to a non-answer.
    if (size < 1200) {
      res.writeHead(200, { ...cors, 'content-type': 'application/json' })
      return res.end(JSON.stringify({ text: '' }))
    }

    try {
      // The filename extension is the only hint Scribe gets about the codec, so
      // derive it from the content-type the MediaRecorder reported rather than
      // hard-coding one.
      const ext = type.includes('ogg')
        ? 'ogg'
        : type.includes('mp4') || type.includes('mpeg')
          ? 'mp4'
          : type.includes('wav')
            ? 'wav'
            : 'webm'
      const form = new FormData()
      form.append('model_id', 'scribe_v1')
      // The owner's language, not a guess per clip. Left to detect it, Scribe
      // heard the owner's accent as Hindi and wrote "Hey AYRA" in Devanagari
      // ("ए आएरा"), which no wake phrase matches — so on standby AYRA silently
      // ignored everything (2026-10-03).
      form.append('language_code', IDENTITY.language.split('-')[0] || 'en')
      form.append(
        'file',
        new Blob([Buffer.concat(chunks)], { type }),
        `speech.${ext}`,
      )

      const upstream = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
        method: 'POST',
        headers: { 'xi-api-key': key },
        body: form,
      })
      if (!upstream.ok) {
        res.writeHead(upstream.status, cors)
        return res.end(await upstream.text())
      }
      const data = await upstream.json()
      res.writeHead(200, { ...cors, 'content-type': 'application/json' })
      return res.end(JSON.stringify({ text: (data.text ?? '').trim() }))
    } catch (err) {
      res.writeHead(502, cors)
      return res.end(String(err?.message ?? err))
    }
  }

  res.writeHead(404, cors)
  res.end()
}

const server = http.createServer((req, res) => {
  // The handler is async, so anything it throws would otherwise become an
  // unhandled rejection and leave the browser waiting on a socket that is
  // never going to answer.
  handleRequest(req, res).catch((err) => {
    console.error('[ayra] request failed:', err)
    if (!res.headersSent) res.writeHead(500)
    res.end()
  })
})

const wss = new WebSocketServer({
  server,
  // The handshake is the only place a page can be turned away, so it happens
  // here rather than after the socket is open. Rejections are logged loudly:
  // the likeliest cause is a dev server on an unexpected port, and a silent
  // 403 would look like the bridge simply isn't running.
  verifyClient: ({ origin, req }, done) => {
    const path = (req.url ?? '/').split('?')[0]
    if (path !== '/' && path !== '/ws' && path !== '/listen') {
      console.warn(`[ayra] rejected websocket on path ${path}`)
      return done(false, 403, 'Forbidden')
    }
    if (!ORIGINS.allowed(origin)) {
      console.warn(
        `[ayra] rejected websocket from origin ${origin ?? '(none)'}` +
          ' — set AYRA_ALLOWED_ORIGINS to permit it',
      )
      return done(false, 403, 'Forbidden')
    }
    done(true)
  },
})
/**
 * Loopback only. Listening on every interface (the old default) let any device
 * on the same Wi-Fi reach the brain — and a forged Origin header is one line in
 * a script, so the origin check alone does not stop that. With laptop control
 * on, that would be remote control of the laptop. Nothing outside it needs in:
 * Telegram is outbound polling, and the face is on this machine.
 */
server.listen(PORT, '127.0.0.1')

/**
 * Daily use: the bridge serves the built face itself (face.mjs), so no dev
 * server runs. `npm start` passes --face; `npm run dev` uses Vite instead.
 */
if (process.argv.includes('--face') || env('SERVE_FACE') === '1') {
  serveFace({
    dir: join(dirname(fileURLToPath(import.meta.url)), '..', 'dist'),
    port: Number(env('FACE_PORT', 5173)),
  })
}

console.log(`[ayra] ${IDENTITY.name} bridge listening on ws://localhost:${PORT}`)
console.log(
  `[ayra] speech ${elevenKey() ? `via ElevenLabs, voice ${VOICE_ID}` : 'using browser fallback voice'}`,
)
console.log(`[ayra] model ${MODEL} · effort ${EFFORT}`)
console.log(
  ALLOW_WRITES
    ? '[ayra] tools: web, the HUD display, the laptop (PowerShell, files, her Chrome, Windows apps) · asks first: money, sending as you, deleting for good, passwords/security'
    : '[ayra] tools: web, the HUD display, reading the laptop\'s files · writes off (AYRA_ALLOW_WRITES=0)',
)
console.log(
  `[ayra] connectors (read-only): ${GATE.allowedConnectors.join(', ') || 'none'}` +
    (GATE.excludedConnectors.length
      ? ` · removed: ${GATE.excludedConnectors.join(', ')}`
      : ''),
)
console.log(
  '[ayra] accepting local dev origins' +
    (ORIGINS.extra.size ? ` plus ${[...ORIGINS.extra].join(', ')}` : '') +
    (ORIGINS.allowNoOrigin ? ' and clients that send no origin' : ''),
)

/**
 * The brain every channel shares — see brain.mjs. Two channels: the HUD's
 * WebSocket below, and Telegram.
 */
// One audit log for every channel, so lines from the HUD and Telegram stay in order.
const AUDIT = createAudit()

/**
 * The owner's Approve, shared by every channel: an ask from any conversation
 * shows on every HUD and on Telegram, and the first answer wins. See approvals.mjs.
 */
/** "Always allow here" — the owner's standing allowances (allowances.mjs). */
const ALLOWANCES = createAllowances()
const APPROVALS = createApprovals({ audit: AUDIT, allowances: ALLOWANCES })

/** Every open conversation, so the kill switch can stop them all at once. */
const CONVERSATIONS = new Set()

/**
 * The kill switch — Esc on the HUD, `/stop` on Telegram. Everything waiting for
 * an Approve is declined and every answer in flight is stopped.
 */
function halt(by) {
  const declined = APPROVALS.halt(by)
  for (const c of CONVERSATIONS) c.interrupt()
  console.log(`[ayra] stopped by ${by}${declined ? ` — ${declined} waiting action(s) declined` : ''}`)
}

const BRAIN = createBrain({
  model: MODEL,
  effort: EFFORT,
  gate: GATE,
  // None of the owner's own MCP servers for now: the clean interface is web
  // search only, and each server comes back as its own step (PLAN.md).
  mcpServers: {},
  audit: AUDIT,
  // How long an idle conversation is worth continuing after a reload.
  resumeHours: Number(env('RESUME_HOURS', 6)),
  // An idle conversation's Claude process closes after this long and wakes on
  // the next question — light on the owner's laptop (the owner's "3 yes").
  sleepMinutes: Number(env('SLEEP_MINUTES', 10)),
  approve: (request) => APPROVALS.ask(request),
})

/**
 * The Telegram channel (PLAN.md 3.2) — on when the bot token and the owner's
 * Telegram id are both set. AYRA_TELEGRAM=off keeps it off for this process,
 * which a second bridge started for testing needs: two processes reading the
 * same bot make Telegram refuse one of them.
 */
const TELEGRAM_TOKEN = env('TELEGRAM_TOKEN')
const TELEGRAM_OWNER = env('TELEGRAM_OWNER_ID')
/** The Telegram channel once started — "show me" pictures go to the phone through it. */
let phone = null
if (env('TELEGRAM', 'on') === 'off') {
  console.log('[ayra] telegram: off for this process (AYRA_TELEGRAM=off)')
} else if (TELEGRAM_TOKEN && TELEGRAM_OWNER) {
  const telegram = startTelegram({
    token: TELEGRAM_TOKEN,
    ownerId: TELEGRAM_OWNER,
    brain: BRAIN,
    systemPrompt: TEXT_PROMPT,
    // No screen on the phone, so no display tool; the laptop's shell and files
    // come with the brain itself, and her Chrome is here too.
    servers: {
      ayra_browser: browserServer({
        allowWrites: ALLOW_WRITES,
        channel: 'telegram',
        approve: (request) => APPROVALS.ask(request),
        sendPhoto: (jpeg, caption) => phone?.photo(jpeg, caption),
      }),
      ...(WINDOWS && {
        ayra_apps: appsServer({
          allowWrites: ALLOW_WRITES,
          channel: 'telegram',
          approve: (request) => APPROVALS.ask(request),
          sendPhoto: (jpeg, caption) => phone?.photo(jpeg, caption),
        }),
      }),
      ayra_rules: rulesServer({ allowances: ALLOWANCES }),
    },
    allowances: ALLOWANCES,
    audit: AUDIT,
    // Approve buttons on the phone, and /stop.
    approvals: APPROVALS,
    onHalt: () => halt('telegram'),
  })
  CONVERSATIONS.add(telegram)
  phone = telegram
  // "I'm back" after the laptop was off or asleep for a while (presence.mjs).
  watchPresence({ store: createStore(), notify: (text) => telegram.notify(text) })
} else if (TELEGRAM_TOKEN) {
  console.log('[ayra] telegram: token set but AYRA_TELEGRAM_OWNER_ID is missing — channel off')
}

/**
 * Live hearing: the face streams the microphone on `/listen` and the bridge
 * relays it to ElevenLabs Scribe Realtime — see listen.mjs. The key stays here.
 */
function listen(socket) {
  const key = elevenKey()
  if (!key) {
    socket.send(JSON.stringify({ type: 'error', code: 'no_key', message: 'no ElevenLabs key' }))
    return socket.close()
  }
  relayListening(socket, {
    key,
    language: IDENTITY.language.split('-')[0] || 'en',
    // Spelled the way AYRA's name should come back, so the wake phrase matches.
    keyterms: [IDENTITY.name],
    connect: (url, k) => new WebSocket(url, { headers: { 'xi-api-key': k } }),
    log: (msg) => console.warn(msg),
  })
}

// The HUD channel: one WebSocket, one conversation.
wss.on('connection', (socket, req) => {
  if ((req.url ?? '/').split('?')[0] === '/listen') return listen(socket)
  console.log('[ayra] client connected')

  const send = (msg) => {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg))
  }

  // The session still names the connectors the gate removed, and the HUD's own
  // display server. Neither is something the owner can use, so the SYSTEMS rail
  // shows only what is really live.
  const removed = new Set(GATE.excludedConnectors.map((n) => `claude.ai ${n}`))
  const emit = (msg) => {
    if (msg.type === 'ready' && Array.isArray(msg.servers)) {
      return send({ ...msg, servers: msg.servers.filter((n) => n !== 'ayra' && !removed.has(n)) })
    }
    // A web search's links go straight onto a blade — see sources.mjs.
    if (msg.type === 'sources') {
      return send({ type: 'blade', blade: sourcesCard(msg), ask: msg.ask })
    }
    send(msg)
  }

  // Answer the HUD straight away rather than making it wait for the agent's
  // first turn. Refined later by the real init message.
  send({ type: 'ready', servers: [] })

  const conversation = BRAIN.open({
    systemPrompt: SYSTEM_PROMPT,
    servers: {
      // The HUD as an in-process server. Its handler closes over this socket,
      // so a `display` call lands on screen directly.
      ayra: displayServer((blade) => send({ type: 'blade', blade })),
      // Her Chrome — the owner's "Chrome (AYRA)" window (browser.mjs).
      ayra_browser: browserServer({
        allowWrites: ALLOW_WRITES,
        channel: 'hud',
        approve: (request) => APPROVALS.ask(request),
        emitBlade: (blade) => send({ type: 'blade', blade }),
      }),
      // Her Windows apps (apps.mjs) — UI Automation, so Windows only.
      ...(WINDOWS && {
        ayra_apps: appsServer({
          allowWrites: ALLOW_WRITES,
          channel: 'hud',
          approve: (request) => APPROVALS.ask(request),
          emitBlade: (blade) => send({ type: 'blade', blade }),
        }),
      }),
      // What she may do without asking (rules.mjs).
      ayra_rules: rulesServer({ allowances: ALLOWANCES }),
    },
    emit,
    // Reloading the page carries on the same conversation (see brain.mjs).
    channel: 'hud',
    resume: true,
    // A dead session can answer nothing more. Leaving the socket open would
    // leave the face believing it has a working brain; closing it makes the
    // face reconnect, which opens a fresh conversation.
    onEnd: () => socket.close(),
  })
  CONVERSATIONS.add(conversation)

  // Every Approve request reaches this screen too, and anything already
  // waiting is shown at once — a reload must not hide a question.
  const unsubscribe = APPROVALS.subscribe((event) => send(event))
  for (const request of APPROVALS.pending()) send({ type: 'approve', ...request })

  socket.on('message', (raw) => {
    let msg
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return
    }

    if (msg.type === 'ask' && typeof msg.text === 'string') {
      conversation.ask(msg.text, typeof msg.id === 'string' ? msg.id : null)
    }

    if (msg.type === 'interrupt') conversation.interrupt()

    // The owner has started speaking: wake a sleeping brain while they talk.
    if (msg.type === 'warm') conversation.warm()

    // The owner's answer to an Approve card, or the kill switch.
    if (msg.type === 'approval' && typeof msg.id === 'string') {
      APPROVALS.answer(msg.id, msg.ok === true, 'hud', msg.always === true)
    }
    if (msg.type === 'halt') halt('hud')
  })

  socket.on('close', () => {
    console.log('[ayra] client disconnected')
    unsubscribe()
    CONVERSATIONS.delete(conversation)
    conversation.close()
  })
})
