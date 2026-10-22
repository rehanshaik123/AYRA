/**
 * npm run voicetest — AYRA heard and answered for real, and timed.
 *
 * Nothing is mocked but the microphone: a test copy of the bridge (port 8788,
 * Telegram off, a fresh conversation), her face built for it and served on
 * 5182, and a Chrome of its own whose microphone plays recorded sentences on
 * cue. The worklet, live hearing (ElevenLabs Scribe), the assembler, the
 * brain and her voice all run as they do for the owner.
 *
 * For every line it measures, from the moment the speech ended:
 *   commit — the face decided the speaking was over and closed the segment
 *   final  — the transcriber's words came back
 *   ask    — the question left for the brain
 *   text   — her first words arrived
 *   voice  — her voice started playing (the number that matters)
 *   done   — the answer was complete
 * and checks the outcome (answered, or ignored when it should be).
 *
 *   npm run voicetest                 all lines
 *   npm run voicetest -- --only 1,3   some of them
 *   npm run voicetest -- --show       a visible window instead of headless
 *
 * Costs: a few hundred ElevenLabs characters the first time (clips are kept in
 * data/voicetest/clips), a few minutes of live hearing, one Claude turn per
 * answered line. Never touches the owner's music: the page's media frames are
 * dropped. Results: data/voicetest/<time>.json.
 */

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, createWriteStream } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { env } from '../bridge/identity.mjs'
import { serveFace } from '../bridge/face.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'data', 'voicetest')
const CLIPS = join(OUT, 'clips')
const DIST = join(OUT, 'dist')
const BRIDGE_PORT = 8788
const FACE_PORT = 5182
const BRIDGE = `http://127.0.0.1:${BRIDGE_PORT}`
const FACE = `http://localhost:${FACE_PORT}/`
/** Not Lily (her own voice): a different speaker, as the owner is. */
const SPEAKER = 'EXAVITQu4vr4xnSDxMaL'

/**
 * The lines, in order. `how` is how she is listening when it is said:
 *   start  — the window she opens by herself when her window opens
 *   follow — the two minutes after an answer, where only "OK …" (or "AYRA …") counts
 *   space  — Space pressed first
 * `parts` builds one clip from pieces with pauses between them (ms), the way
 * people stop to think in the middle of a command.
 */
const LINES = [
  { how: 'start', parts: ["What's two plus two?"], expect: 'answer' },
  { how: 'follow', parts: ['OK, what is the capital of France?'], expect: 'answer' },
  { how: 'follow', parts: ['Ayra what is three times three?'], expect: 'answer' },
  { how: 'follow', parts: ['What time is it?'], expect: 'ignored' },
  // "OK", a breath, then the command (2026-10-22): one turn, not a lost "OK".
  { how: 'follow', parts: ['Okay.', 1200, 'what is seven plus one?'], expect: 'answer', whole: /seven|7/i },
  { how: 'space', parts: ['What is twelve times', 1300, 'eleven?'], expect: 'answer', whole: /eleven|11/i },
  { how: 'space', parts: ['Tell me one short fact about the moon.'], expect: 'answer' },
  { how: 'follow', parts: ['Okay, how many legs does a spider have?'], expect: 'answer' },
  // The owner says her name "eye-ra"; a transcriber may write Ira or Aira.
  { how: 'follow', parts: ['Eye-ra, what is five plus five?'], expect: 'answer' },
  // A thinking pause in the middle; nothing here may act on the laptop.
  { how: 'space', parts: ['Tell me the capital of', 1500, 'Japan.'], expect: 'answer', whole: /japan/i },
]

const args = process.argv.slice(2)
const only = args.includes('--only') ? new Set(args[args.indexOf('--only') + 1].split(',').map(Number)) : null
const show = args.includes('--show')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

// -- clips --------------------------------------------------------------------

/** One sentence as 16 kHz mono PCM, trimmed of the silence around it. */
async function clip(text) {
  const file = join(CLIPS, `${slug(text)}.pcm`)
  if (existsSync(file)) return readFileSync(file)
  const key = process.env.ELEVENLABS_API_KEY
  if (!key) throw new Error('ELEVENLABS_API_KEY is not set (.env.local) — needed once, to record the test lines.')
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${SPEAKER}?output_format=pcm_16000`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' }),
  })
  if (!res.ok) throw new Error(`recording "${text}" failed: ${res.status} ${(await res.text()).slice(0, 200)}`)
  const raw = Buffer.from(await res.arrayBuffer())
  // Trim to the speech itself (30 ms either side): "speech ended" must mean it.
  const n = raw.length / 2
  let a = 0
  let b = n - 1
  while (a < n && Math.abs(raw.readInt16LE(a * 2)) < 400) a++
  while (b > a && Math.abs(raw.readInt16LE(b * 2)) < 400) b--
  const pcm = raw.subarray(Math.max(0, a - 480) * 2, Math.min(n, b + 480) * 2)
  writeFileSync(file, pcm)
  return pcm
}

/** A line's pieces with their pauses, as one WAV. */
async function wav(parts) {
  const chunks = []
  for (const p of parts) chunks.push(typeof p === 'number' ? Buffer.alloc(Math.round(p * 16) * 2) : await clip(p))
  const pcm = Buffer.concat(chunks)
  const h = Buffer.alloc(44)
  h.write('RIFF', 0)
  h.writeUInt32LE(36 + pcm.length, 4)
  h.write('WAVEfmt ', 8)
  h.writeUInt32LE(16, 16)
  h.writeUInt16LE(1, 20)
  h.writeUInt16LE(1, 22)
  h.writeUInt32LE(16000, 24)
  h.writeUInt32LE(32000, 28)
  h.writeUInt16LE(2, 32)
  h.writeUInt16LE(16, 34)
  h.write('data', 36)
  h.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([h, pcm]).toString('base64')
}

// -- the page's side ------------------------------------------------------------

/**
 * Runs in the page before its own scripts: a microphone that plays what it is
 * given over a faint room hiss, and marks for every step of a turn. Media
 * frames are dropped so the owner's music is never paused by a test.
 */
const PAGE = () => {
  const marks = []
  const mark = (e, d) => marks.push({ e, t: performance.now(), d })
  let ctx = null
  let bus = null
  const room = () => {
    if (ctx) return
    ctx = new AudioContext({ sampleRate: 48000 })
    bus = ctx.createGain()
    const hiss = ctx.createBuffer(1, 48000, 48000)
    const d = hiss.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.003
    const src = ctx.createBufferSource()
    src.buffer = hiss
    src.loop = true
    src.connect(bus)
    src.start()
  }
  navigator.mediaDevices.getUserMedia = async () => {
    room()
    await ctx.resume()
    // A fresh stream each time: the face stops the old one's tracks on release.
    const dest = ctx.createMediaStreamDestination()
    bus.connect(dest)
    mark('mic')
    return dest.stream
  }
  window.__say = async (b64) => {
    room()
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const buf = await ctx.decodeAudioData(bytes.buffer)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(bus)
    mark('speech-start')
    await new Promise((r) => {
      src.onended = r
      src.start()
    })
    mark('speech-end')
  }
  window.__vt = { marks }

  const send = WebSocket.prototype.send
  WebSocket.prototype.send = function (data) {
    if (typeof data === 'string') {
      try {
        const m = JSON.parse(data)
        if (m.type === 'media') return
        mark(`send:${m.type}`, m.text)
      } catch {
        /* not ours */
      }
    }
    return send.call(this, data)
  }
  const Native = window.WebSocket
  window.WebSocket = class extends Native {
    constructor(...a) {
      super(...a)
      this.addEventListener('message', (ev) => {
        if (typeof ev.data !== 'string') return
        try {
          const m = JSON.parse(ev.data)
          if (m.type === 'text') mark(m.quiet ? 'recv:quiet' : 'recv:text', m.delta)
          else if (['partial', 'final', 'done', 'error'].includes(m.type)) mark(`recv:${m.type}`, m.text ?? m.message)
        } catch {
          /* not ours */
        }
      })
    }
  }
  const play = HTMLMediaElement.prototype.play
  HTMLMediaElement.prototype.play = function () {
    this.addEventListener('playing', () => mark('voice'), { once: true })
    return play.call(this)
  }
}

// -- running it ---------------------------------------------------------------

const face = async () => {
  const r = await fetch(`${BRIDGE}/face`, { headers: { 'x-ayra': 'tray' } })
  return r.ok ? r.json() : null
}

async function until(test, ms, what) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const f = await face().catch(() => null)
    if (f && test(f)) return f
    await sleep(80)
  }
  throw new Error(`timed out waiting for ${what}`)
}

async function main() {
  mkdirSync(CLIPS, { recursive: true })
  // Every clip first: a missing key or no credits should stop the run before
  // anything starts.
  const lines = LINES.map((l, i) => ({ ...l, n: i + 1 })).filter((l) => !only || only.has(l.n))
  for (const l of lines) l.wav = await wav(l.parts)

  // --no-build: the face built last time (the code can change meanwhile).
  const reuse = args.includes('--no-build') && existsSync(join(DIST, 'index.html'))
  console.log(reuse ? 'Using the face built last time.' : 'Building her face for the test bridge…')
  const built = reuse ? { status: 0 } : spawnSync(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', DIST, '--emptyOutDir', '--logLevel', 'warn'], {
    cwd: ROOT,
    env: { ...process.env, VITE_BRIDGE_URL: `ws://localhost:${BRIDGE_PORT}` },
    stdio: 'inherit',
  })
  if (built.status !== 0) throw new Error('the face did not build')

  if (await fetch(`${BRIDGE}/health`).then(() => true, () => false)) {
    throw new Error(`something is already on port ${BRIDGE_PORT} — stop the other test bridge first`)
  }
  const log = createWriteStream(join(OUT, 'bridge.log'))
  const bridge = spawn(process.execPath, [join(ROOT, 'scripts/bridge-copy.mjs')], {
    cwd: ROOT,
    env: { ...process.env, AYRA_RESUME_HOURS: '0' },
  })
  bridge.stdout.pipe(log)
  bridge.stderr.pipe(log)
  const stop = []
  stop.push(() => bridge.kill())
  const server = serveFace({ dir: DIST, port: FACE_PORT, log: () => {} })
  stop.push(() => server?.close?.())

  let browser
  try {
    for (let i = 0; i < 60 && !(await fetch(`${BRIDGE}/health`).then((r) => r.ok, () => false)); i++) await sleep(500)

    const { default: puppeteer } = await import('puppeteer-core')
    const chrome = env('CHROME_PATH') || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    browser = await puppeteer.launch({
      executablePath: chrome,
      headless: !show,
      userDataDir: join(OUT, 'chrome'),
      args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio', '--no-first-run', '--window-size=960,720'],
    })
    const page = await browser.newPage()
    // The page's own console, for when a line goes wrong.
    const consoleLog = createWriteStream(join(OUT, 'console.log'))
    page.on('console', (m) => consoleLog.write(`${m.type()} ${m.text()}\n`))
    page.on('pageerror', (e) => consoleLog.write(`pageerror ${e.message}\n`))
    await page.evaluateOnNewDocument(PAGE)
    const loaded = Date.now()
    await page.goto(FACE)
    console.log('Her window is open; waiting for her…')

    // She listens by herself once she is up. A face that still waits for a
    // press (INITIALISE) gets one, and then one more to listen.
    let f = await until((x) => x.phase && x.phase !== 'offline' && x.phase !== 'boot', 4000, 'her to start').catch(() => null)
    const ready = f ? Date.now() - loaded : null
    if (!f) {
      await page.keyboard.press('Space')
      f = await until((x) => x.phase === 'dormant' || x.phase === 'listening', 15000, 'her to start')
    }
    const startup = { ms: ready, listening: f.phase === 'listening', note: f ? '' : 'needed a press' }
    console.log(`Up after ${((Date.now() - loaded) / 1000).toFixed(1)} s · ${f.phase}${f.phase === 'listening' ? ' — listening by herself' : ''}`)

    const results = []
    for (const l of lines) {
      const said = l.parts.filter((p) => typeof p === 'string').join(' … ')
      process.stdout.write(`\n${l.n}. [${l.how}] "${said}" → `)
      try {
        if (l.how === 'start') {
          f = await face()
          if (f.phase !== 'listening') {
            await page.keyboard.press('Space')
            await until((x) => x.phase === 'listening', 5000, 'listening')
          }
        } else if (l.how === 'follow') {
          await until((x) => x.phase === 'listening' && x.by === 'follow', 60000, 'the minute after her answer')
        } else {
          await until((x) => x.phase === 'listening' || x.phase === 'dormant', 60000, 'her to be free')
          await page.keyboard.press('Space')
          await until((x) => x.phase === 'listening' && x.by !== 'follow', 5000, 'listening after Space')
        }
        // As a person would: a beat after she is ready.
        await sleep(700)
        const from = await page.evaluate(() => window.__vt.marks.length)
        await page.evaluate((b64) => window.__say(b64), l.wav)
        if (l.expect === 'answer') {
          await page.waitForFunction((k) => window.__vt.marks.slice(k).some((m) => m.e === 'recv:done' || m.e === 'recv:error'), { timeout: 90000, polling: 100 }, from)
          // Her voice ends; the minute after begins.
          await until((x) => x.phase === 'listening' || x.phase === 'dormant', 60000, 'her to finish speaking').catch(() => null)
        } else {
          await sleep(6000)
        }
        const marks = await page.evaluate((k) => window.__vt.marks.slice(k), from)
        const end = marks.find((m) => m.e === 'speech-end')?.t ?? 0
        const at = (e) => {
          const m = marks.find((x) => x.e === e && x.t >= end - 50)
          return m ? Math.round(m.t - end) : null
        }
        const asks = marks.filter((m) => m.e === 'send:ask')
        const r = {
          n: l.n,
          how: l.how,
          said,
          expect: l.expect,
          heard: marks.filter((m) => m.e === 'recv:final').map((m) => m.d).join(' | '),
          asked: asks.map((m) => m.d).join(' | '),
          commit: at('send:commit'),
          final: at('recv:final'),
          ask: at('send:ask'),
          text: at('recv:text'),
          voice: at('voice'),
          done: at('recv:done'),
          answer: marks.filter((m) => m.e === 'recv:text').map((m) => m.d).join('').trim().slice(0, 160),
        }
        const answered = asks.length > 0
        r.ok = l.expect === 'answer' ? answered && asks.length === 1 && (!l.whole || l.whole.test(r.asked)) : !answered
        results.push(r)
        console.log(`${r.ok ? 'OK' : 'FAIL'} · heard "${r.heard}" · asked "${r.asked}"`)
        if (answered) console.log(`   commit ${r.commit} · final ${r.final} · ask ${r.ask} · first words ${r.text} · voice ${r.voice} · done ${r.done} ms — "${r.answer}"`)
      } catch (err) {
        const marks = await page.evaluate(() => window.__vt.marks.slice(-25).map((m) => `${Math.round(m.t)} ${m.e} ${m.d ?? ''}`.slice(0, 120))).catch(() => [])
        const diag = await page.evaluate(() => JSON.stringify({ voice: window.__voice ?? null, tts: window.__tts ?? null })).catch(() => '')
        results.push({ n: l.n, how: l.how, said, expect: l.expect, ok: false, error: err.message, marks, diag })
        console.log(`FAIL · ${err.message}`)
        if (args.includes('--debug')) console.log(`${marks.join('\n')}\n${diag}`)
      }
    }

    const passed = results.filter((r) => r.ok).length
    const voiced = results.filter((r) => r.voice != null).map((r) => r.voice)
    const median = (xs) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null)
    const summary = { passed, of: results.length, startup, medianVoiceMs: median(voiced), medianAskMs: median(results.filter((r) => r.ask != null).map((r) => r.ask)) }
    console.log(`\n${passed}/${results.length} as expected · speech end → her voice: median ${summary.medianVoiceMs} ms · → question sent: median ${summary.medianAskMs} ms`)
    const file = join(OUT, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
    writeFileSync(file, JSON.stringify({ summary, results }, null, 2))
    console.log(`Saved ${file}`)
    process.exitCode = passed === results.length ? 0 : 1
  } finally {
    await browser?.close().catch(() => {})
    for (const s of stop) s()
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
