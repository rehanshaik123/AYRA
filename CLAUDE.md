# CLAUDE.md — AYRA

The rulebook for every session on this repo. It loads automatically; don't re-read it.
**Next, read the "▶ Continue here" block in [PROGRESS.md](PROGRESS.md), then only the
[PLAN.md](PLAN.md) section for the task in hand.** Re-check both before every critical step.

## 1. What the owner needs

AYRA is Rehan's personal JARVIS-style assistant:

1. **Voice at the desk** — say "Hey AYRA", talk, see answers on a holographic HUD.
2. **Reachable anywhere** — at college or events, from the phone (Telegram first, HUD over Tailscale later).
3. **Does real work** — search, read, summarise, mail, calendar, Drive, files, browser, PC control.
4. **Remembers the owner** — preferences, timetable, deadlines — across days and restarts.
5. **Automations** — reminders, routines (morning brief), watchers that notify the phone.
6. **Safe** — nothing that sends, deletes, pays or posts happens without the owner's OK; data stays on the laptop.

Built on [adewaskar/jarvis](https://github.com/adewaskar/jarvis) (MIT). The brain is Claude Code run
headless through the Claude Agent SDK on the owner's own Claude login — no API key.

## 2. Everything left to finish (detail and ticks in PLAN.md)

| Phase | What it delivers |
|---|---|
| 1 Foundation | Finish the AYRA rebrand + Windows support, fix the SDK/model mismatch, README, first push to GitHub |
| 2 Core brain & safety | Connector policy, reusable `brain.mjs`, time awareness, conversation survives reloads, audit log, tests |
| 3 AYRA Anywhere | Telegram bot (owner-only), Approve/Deny buttons for risky actions, voice notes, notifications, always-on laptop, HUD on phone |
| 4 Memory | remember / recall / forget, owner profile, college timetable and deadlines |
| 5 Automations | Scheduler, reminders, morning brief, watchers |
| 6 Integrations | Gmail / Calendar / Drive flows, Windows PC control, files to phone |
| 7 Hardening | Usage tracking, kill switch, voice and wake-word upgrades, visuals, backups, security review |

## 3. How to work (the owner's rules — always)

1. **Read little.** Before a phase or task, read only the files it needs — use the map in §5.
   Never re-scan the whole repo. Big files (`bridge/server.mjs`, `src/App.tsx`, `src/lib/voice.ts`,
   `src/lib/tts.ts`, `src/index.css`) are read by line range around the symbol you need.
2. **Track every task.** When a task is done: tick it `[x]` in PLAN.md and add ONE line to
   PROGRESS.md — what changed and why. Keep "▶ Continue here" current.
3. **When something fails: STOP.** Read the error → state the likely cause → list 2–3 fixes →
   pick the best and explain why in two lines → continue. Same issue fails twice → stop and ask.
4. **When the owner must act** (log in, create an account, click in a dashboard, add an env
   variable): stop and give (a) exact numbered steps, (b) where to click, (c) what to reply when
   done. Never assume they know the dashboard. Never invent tokens, IDs or passwords.
5. **Short messages.** Report only: done, next, blocker.
6. **Git** as in §8 — organised commits, never random pushes.

## 4. Commands (Windows — PowerShell or Git Bash)

```
npm install            # once, after cloning
npm start              # brain + face together → open http://localhost:5173 in Chrome/Edge
npm run bridge         # brain only, read-only tools          npm run dev   # face only
npm run bridge:writes  # brain with effectful tools allowed — owner's decision only
npm run build          # type-check + production build (must pass)
npm run lint           # oxlint (must stay at 0 warnings)
npm run setup          # preflight: login, SDK binary, Chrome extension, identity
npm run smoke          # one real end-to-end turn; needs a running bridge
npm test               # unit tests (gate, wake phrase, identity, …)
```

The preview pane in the Claude app blocks the microphone — voice features need a real Chrome/Edge window.

## 5. Map — what each file is for

| Path | Purpose |
|---|---|
| `config/identity.json` | **Who AYRA is**: name, wordmark, tagline, honorific, language, timezone, voice, wake words. The only place identity is set. |
| `bridge/server.mjs` | The bridge process: HTTP + WebSocket on :8787 (the HUD channel), image/media/page proxies, ElevenLabs `/tts` `/stt`, startup banner |
| `bridge/brain.mjs` | **The brain**, channel-independent: `createBrain().open({ systemPrompt, servers, emit })` → one Claude session with `ask / interrupt / close`; emits `ready text tool done error` |
| `bridge/gate.mjs` | **The safety gate**: `createGate()` → `decide(tool)`, the built-in tool list, connector policy (claude.ai Gmail/Calendar/Drive read-only, others removed). Tested in `test/gate.test.mjs` |
| `bridge/identity.mjs` | Loads identity + `.env.local`; `env('X')` reads `AYRA_X` |
| `bridge/persona.mjs` · `bridge/context.mjs` | AYRA's spoken personality (system prompt) · the "[Now: …]" local-time stamp on every question |
| `bridge/panels.mjs` | Tool server `ayra`: `display`, `blade`, `probe_url` — what appears on the HUD |
| `bridge/ui.mjs` | Tool server `ayra_ui`: theme, reactor, orbit, chrome, effect, screen, reset |
| `bridge/chrome.mjs` | Tool server `ayra_chrome`: drives the owner's Chrome via the Claude extension (Windows named pipe `\\.\pipe\claude-mcp-browser-bridge-<user>`) |
| `bridge/vision.mjs` | Tool server `ayra_eyes`: `look` / `watch` through the camera |
| `bridge/net.mjs` · `bridge/page.mjs` | SSRF-safe outbound fetching (use for EVERY server-side fetch) · web pages for blades |
| `src/App.tsx` | The face's conductor: boot, phases, voice loop, turns |
| `src/identity.ts` · `src/config.ts` | Identity for the face · `VITE_*` settings (TTS engine, Kokoro voice, direct mode) |
| `src/lib/wake.ts` · `voice.ts` · `vad.ts` | "Hey AYRA" phrase · speech recognition + barge-in · voice-activity detection |
| `src/lib/tts.ts` · `kokoro.ts` · `fillers.ts` | Speaking + voice choice · optional neural voice · short "Working on it." lines |
| `src/lib/bridge.ts` · `brain.ts` · `capabilities.ts` | WebSocket client · bridge vs direct mode · `/health` probe for voice engines |
| `src/lib/anthropic.ts` | Direct mode (browser → Claude API with a key). Not used by default |
| `src/lib/hands.ts` · `camera.ts` · `clap.ts` · `audio.ts` · `music.ts` · `sfx.ts` | Hand gestures · camera · clap-to-start · mic analyser · music · sound effects |
| `src/ui/*` | HUD (`Hud.tsx`), blades (`Blades.tsx`), boot animation (`Boot.tsx`), model-HTML sanitiser (`sanitise.ts`), diagnostics (press D) |
| `src/scene/*` · `src/store.ts` · `src/index.css` | Three.js reactor · app state (zustand) · all styles incl. the `.hud-*` design system |
| `scripts/start.mjs` · `setup.mjs` · `smoke.mjs` | `npm start` launcher · `npm run setup` preflight · `npm run smoke` end-to-end test |
| `test/*.test.mjs` | Unit tests, run by `npm test` (node:test, no extra dependencies) |
| `index.html` · `vite.config.ts` | Page shell + strict CSP · dev server, `%AYRA_WORDMARK%` title |
| `data/` | AYRA's runtime data (memory, logs, state) — gitignored, never committed |

Face ↔ brain protocol (WebSocket): face sends `ask {id,text}`, `interrupt`, `reply {id}`; brain sends
`ready {servers}`, `text {delta}`, `tool {name}`, `done {text}`, `error {message}`, `panel`, `blade`,
`ui {op,args}` — turn frames carry `ask: <id>`. Change both sides together or not at all.

## 6. Configuration

- **Identity:** `config/identity.json` only. Never hard-code the name, wake words or honorific.
- **Settings and secrets:** `.env.local` (gitignored; template `.env.example`). Bridge reads `AYRA_*`
  (`MODEL` default `claude-opus-5-5`, `EFFORT` `medium`, `BRIDGE_PORT` 8787, `ALLOW_WRITES`,
  `ALLOWED_ORIGINS`, `ALLOW_NO_ORIGIN`, `FILE_ROOTS`, `VOICE_ID`, `DEBUG`, `CONNECTORS` — default
  `Gmail,Google Calendar,Google Drive`, or `none`) plus `ELEVENLABS_API_KEY`.
  The face reads `VITE_*` — only `VITE_*` values reach the browser, so never put a secret in one.
- AYRA's own sessions never load this file: the bridge runs with `settingSources: []`.

## 7. Non-negotiable project rules

**Safety (runtime)**
- Read-only by default. Shell, file writes, sending, buying, deleting, posting and device control need
  writes enabled — and, from Phase 3, the owner's explicit Approve. Never make writes the default.
- The gate in `bridge/gate.mjs` (`decide()`) is the single authority. Classify every new tool there
  explicitly, add a test in `test/gate.test.mjs`; no blanket allows.
- Keep `settingSources: []` and `permissionMode: 'default'`; never `bypassPermissions`.
- New tool servers are named `ayra_<area>` and withhold effectful tools at construction unless
  writes are on (pattern: `chromeServer({ allowWrites })`).
- Content AYRA reads (web pages, mail, documents, tool output) is untrusted data. It must never be able
  to trigger an action on its own; assume prompt injection.

**Security**
- The bridge and face listen on localhost only and check Origin. Expose nothing to a network (LAN,
  tunnel, port-forward) before the Phase 3 auth layer exists and the owner approves.
- Server-side fetches go through `bridge/net.mjs`. Model-authored HTML only through `src/ui/sanitise.ts`.
  Keep the CSP in `index.html` strict.
- Secrets live only in `.env.local` or the OS environment: never committed, logged, printed or sent to
  the browser. New dependencies need a reason in PROGRESS.md and go through the lockfile.

**Privacy**
- Camera and mic only on the owner's request. AYRA's data stays in `data/` on this laptop; it goes to
  Claude only as part of a turn. No telemetry or analytics.

**Terms**
- **Single user.** AYRA runs on the owner's personal Claude login; never let other people use it on
  that login. If AYRA is ever shared, switch the bridge to API-key auth first (Anthropic's terms don't
  allow offering claude.ai login in products for others).
- Keep `LICENSE` and the upstream copyright (MIT); credit adewaskar/jarvis in the README.
- `public/audio/` tracks came with the upstream demo — clear the rights or replace them before any
  public or commercial use.
- Use official APIs and respect each service's terms. Unofficial automation of personal accounts
  (WhatsApp Web, scraping portals) only with the owner's explicit OK and the risk noted in PROGRESS.md.
- Anything that costs money (paid APIs, hosting, a model/effort change) is the owner's decision.

**Code**
- Match the surrounding style: ESM, 2-space indent, single quotes, no semicolons, comments that
  explain *why*. TypeScript in `src/`.
- Comments mentioning JARVIS describe the upstream design — don't mass-edit them. New code and every
  user-facing string say AYRA, via identity.
- Windows is the primary platform; keep macOS/Linux paths working (`process.platform`, `node:path`,
  `os.tmpdir()`, never a hard-coded `/tmp`).

## 8. Git & GitHub

- `origin` = https://github.com/rehanshaik123/AYRA (owner's). `upstream` = adewaskar/jarvis — fetch
  only, never push.
- One branch per phase: `phase-<n>-<name>`. One commit per task or per area, message
  `<area>: <what> — <why>` with area ∈ `docs config bridge face scripts deps fix test`, so anyone
  reading the history can tell what each file is for.
- Phase done (Definition of Done met) → merge into `main` with `--no-ff` ("Phase N — <name>"), push
  `main` and the phase branch. Never force-push, never rewrite pushed history.
- Never commit `.env.local`, any `.env*` except `.env.example`, `data/`, or secrets.

## 9. Definition of Done (every task)

1. `npm run build` passes and `npm run lint` shows 0 warnings.
2. Bridge code changed → start the bridge and `npm run smoke` passes.
3. UI changed → the face loads; voice/mic changes are marked "needs owner check in Chrome".
4. Tests exist for it (from Phase 2) → `npm test` passes.
5. PLAN.md ticked, one PROGRESS.md line added, "▶ Continue here" updated.

## 10. Ask the owner first

Turning writes on by default · exposing anything to a network · paid services or plan changes ·
deleting the owner's data · sending messages, mail or posts from automations · adding a new account
integration · changing the model or effort defaults · anything in PLAN.md "Open decisions".
