# A.Y.R.A.

**AYRA** is a personal voice assistant with a holographic interface. Say **"Hey AYRA"** and it wakes,
listens, answers out loud, shows things on screen, and works through real tools — web search, your
own Chrome, the camera, and the accounts you connect.

The face is a web page (React + Vite + Three.js). The brain is **Claude Code run headless through the
Claude Agent SDK**, using your own Claude login — no API key, no extra bill.

AYRA is built on [adewaskar/jarvis](https://github.com/adewaskar/jarvis) (MIT) and extended for
Windows, its own identity, and a roadmap toward phone access, memory and automations — see
[PLAN.md](PLAN.md).

---

## Requirements

- **Windows 10/11** (primary; macOS and Linux paths are kept working)
- **Node.js 20+** — <https://nodejs.org>
- **A Claude login** — sign in to the Claude desktop app or the `claude` CLI once. The bridge reuses
  that login; the Agent SDK brings its own Claude Code, so `claude` doesn't need to be on your PATH.
- **Google Chrome or Microsoft Edge**, in a real window (embedded preview panes block the microphone)
- Optional: the **Claude in Chrome** extension, so AYRA can use your signed-in browser
- Optional: an **ElevenLabs API key** for a premium voice and transcription

## Quick start

```bash
npm install
npm run setup     # checks your machine and says what's missing (changes nothing)
npm start         # starts the brain and the face together
```

Open the URL it prints (http://localhost:5173) in **Chrome or Edge**, click **INITIALISE**, allow the
microphone, and say **"Hey AYRA"**.

To check the brain alone, with `npm start` (or `npm run bridge`) running in another terminal:

```bash
npm run smoke     # sends one question and prints AYRA's answer
```

## Controls

| Key / phrase | Does |
|---|---|
| "Hey AYRA" | Wake it (common mishearings like "Aira" or "Eyra" work too) |
| Space | Talk without the wake word |
| Just speak | Interrupt mid-answer |
| V | Cycle the voice |
| Escape | Stand down |
| D | Diagnostics panel |
| T | One-line audio self-test |
| G | Hand-gesture control |

## Configuration

**Identity** — [`config/identity.json`](config/identity.json) decides who AYRA is: name, wordmark,
tagline, how it addresses you (`honorific`, empty by default), language (`en-IN`), time zone, voice
gender, and the wake words. Change it there; nothing else hard-codes the name.

**Settings and secrets** — copy [`.env.example`](.env.example) to `.env.local` and uncomment what you
need. Both halves read it: the bridge takes `AYRA_*` and `ELEVENLABS_API_KEY`; the face takes `VITE_*`.
Only `VITE_*` values ever reach the browser. `.env.local` is gitignored.

| Bridge setting | Default | Effect |
|---|---|---|
| `AYRA_MODEL` | `claude-opus-5-5` | Model (`claude-sonnet-5-5` is faster and lighter on plan limits) |
| `AYRA_EFFORT` | `medium` | Reasoning effort: `low` … `max` |
| `AYRA_BRIDGE_PORT` | `8787` | Port for the brain (HTTP + WebSocket) |
| `AYRA_ALLOW_WRITES` | off | `1` allows effectful tools — see Safety |
| `AYRA_ALLOWED_ORIGINS` | local dev | Extra page origins allowed to connect |
| `AYRA_FILE_ROOTS` | — | Extra folders the `/file` endpoint may serve images from |
| `AYRA_VOICE_ID` | George | ElevenLabs voice id |
| `AYRA_DEBUG` | off | `1` logs every message from the SDK |
| `ELEVENLABS_API_KEY` | — | Premium voice + transcription |

## Safety

- **Read-only by default.** Search, reading and generation run freely; anything that writes files,
  runs a shell, sends, deletes, buys or posts is refused unless you start the brain with
  `npm run bridge:writes`. Read `decideTool()` in `bridge/server.mjs` before you do.
- **Your claude.ai connectors.** If your Claude account has connectors (Gmail, Google Calendar,
  Drive…), AYRA's brain can see them. Reads work; anything that changes something is refused in the
  default mode. A dedicated policy and Approve/Deny confirmations are on the roadmap (PLAN.md 2.1, 3.3).
- **Local only.** The brain and face listen on `localhost` and check the page's origin. Don't expose
  them to a network until the authenticated remote access in PLAN.md Phase 3 exists.
- **Personal use.** AYRA runs on your own Claude login. Don't share it with others on that login; if
  it ever serves other people, switch the bridge to API-key authentication first.

## Project structure — what each file is for

```
config/
  identity.json        Who AYRA is: name, wake words, honorific, language, voice. Edit here.
bridge/                THE BRAIN (Node, port 8787)
  server.mjs           HTTP + WebSocket server; one Claude session per connection;
                       decideTool() = the safety gate; image/video/page proxies; ElevenLabs speech
  persona.mjs          AYRA's personality — the system prompt
  identity.mjs         Loads identity.json and .env.local for the bridge
  panels.mjs           Tools that put things on screen: display, blade, probe_url
  ui.mjs               Tools that restyle the interface: theme, reactor, orbit, effects, reset
  chrome.mjs           Tools that drive your own Chrome through the Claude extension
  vision.mjs           Tools that look through the camera: look, watch
  net.mjs              Safe outbound fetching (blocks requests to private/internal addresses)
  page.mjs             Fetches web pages for reading on a blade
src/                   THE FACE (React + Vite, port 5173)
  App.tsx              The conductor: boot, listening, thinking, speaking, interruptions
  identity.ts          Identity for the face (reads config/identity.json)
  config.ts            Face settings from VITE_* variables
  store.ts             Shared app state
  lib/wake.ts          The "Hey AYRA" phrase and its accepted mishearings
  lib/voice.ts         Speech recognition loop and barge-in
  lib/vad.ts           Detects when you start and stop speaking
  lib/tts.ts           Speaking out loud and choosing the voice
  lib/kokoro.ts        Optional neural voice that runs in the browser
  lib/fillers.ts       Short lines like "Working on it." while tools run
  lib/bridge.ts        WebSocket client that talks to the brain
  lib/brain.ts         Chooses the bridge (default) or direct API mode
  lib/anthropic.ts     Direct mode: the browser calls the Claude API with a key (not used by default)
  lib/capabilities.ts  Asks the brain which voice engines are available
  lib/hands.ts …       Hand tracking, camera, clap-to-start, audio, music, sound effects
  ui/                  HUD, blades (stackable panels), boot animation, diagnostics,
                       sanitise.ts (cleans model-written HTML before it is shown)
  scene/               The 3D reactor, orbits and particles (Three.js)
  index.css            All styles, including the .hud-* classes AYRA designs panels with
scripts/
  start.mjs            npm start — runs brain + face together
  setup.mjs            npm run setup — friendly machine check
  smoke.mjs            npm run smoke — one real test question to the brain
public/                Static files: start-up audio, favicon
index.html             Page shell with a strict Content Security Policy
vite.config.ts         Dev server; fills the page title from identity.json
CLAUDE.md              Rules for AI-assisted development of this repo
PLAN.md                The roadmap, phase by phase, with tick boxes
PROGRESS.md            What has been done, and where to continue
data/                  (created at runtime) AYRA's memory and logs — never committed
```

## How it works

```
  ┌─ browser (the face) ───────────────┐        ┌─ bridge (the brain) ─────────────┐
  │  "Hey AYRA" wake phrase            │        │  Node · bridge/server.mjs        │
  │  voice activity → speech to text   │   ws   │  Claude Agent SDK                │
  │  reactor UI (Three.js + GLSL)      │◄─────► │   = Claude Code, headless        │
  │  text to speech                    │  8787  │  tools: ayra_* + your MCP servers │
  │  heads-up display, blades          │        │  safety gate: decideTool()       │
  └────────────────────────────────────┘        └──────────────────────────────────┘
```

A browser tab can't run local tools, so the bridge does: it runs the Claude Agent SDK, which spawns
the real Claude Code, hands it AYRA's tools plus any MCP servers in `~/.claude.json`, and streams the
answer back sentence by sentence so AYRA starts speaking before the answer is finished.

## Troubleshooting

- **AYRA can't hear me / I can't hear AYRA** — use a real Chrome or Edge window and allow the
  microphone. Press **D** for diagnostics, **T** for an audio test.
- **No answer** — is the brain running? `npm run smoke` says exactly what's wrong.
- **Wake word ignored** — speech recognition is set to `en-IN`; change `language` in
  `config/identity.json` if your English differs, or add the mishearing you get to `wake.names`.
- **"Browser control unavailable"** — open Chrome with the Claude extension enabled.

## Credits & licence

MIT — see [LICENSE](LICENSE). Based on [JARVIS by Aditya Dewaskar](https://github.com/adewaskar/jarvis).
The audio in `public/audio/` ships from the upstream demo; clear its rights (or replace it) before any
public or commercial use.
