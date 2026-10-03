# CLAUDE.md — AYRA

The rulebook for every session on this repo. It loads automatically; don't re-read it.
**Next, read the "▶ Continue here" block in [PROGRESS.md](PROGRESS.md), then only the
[PLAN.md](PLAN.md) section for the task in hand.** When a phase starts, also read
[docs/VISION.md](docs/VISION.md) (why) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (how).

## 1. What AYRA is

- Rehan's (the owner's) **personal central system**: it knows and remembers them, cares about their
  goals, takes their commands, routes each job, and runs specialist agents added one at a time.
- **Two homes, one AYRA.** **AYRA Core** runs on a small cloud server, always on: the brain, one
  conversation, memory, Telegram, connectors, scheduler, agents, gate and audit log. **AYRA Desk**
  runs on the laptop while it's on: HUD + voice, Chrome, files, PC control. The desk dials out to
  the core over Tailscale; the core sends it laptop-only jobs, or queues them while it's off.
- Built on [adewaskar/jarvis](https://github.com/adewaskar/jarvis) (MIT). The brain is Claude Code
  run headless through the Claude Agent SDK on the owner's own Pro login — no API key.
- **Today everything still runs on the laptop** (`bridge/server.mjs`). PLAN.md Phase 4 starts the
  move to the cloud.

## 2. Working agreement

- **You decide:** implementation, file structure, libraries (log the reason in PROGRESS.md),
  naming, task order inside a phase, refactors that keep behaviour, tests, bug fixes.
- **Intent check before each phase:** restate what the owner wants from it in 3–5 bullets, ask
  about anything unclear, and wait for their "go". Never guess what a feature should do; ask.
- **Ask the owner first:** architecture changes, anything that costs money, new accounts or
  integrations, anything that sends, deletes, pays or posts, exposing anything to a network,
  AYRA's personality or voice, adding or dropping features.
- **End of each phase:** a short demo — what was built, how to test it from the phone, what's next.
  Merge (and deploy) only after the owner's OK.
- **When you ask:** batch the questions, give options with your pick first, use plain language.

## 3. How to work

1. **Read little.** Only the files the task needs (map in §5). Big files (`bridge/server.mjs`,
   `src/App.tsx`, `src/lib/voice.ts`, `src/lib/tts.ts`, `src/index.css`) by line range around the
   symbol you need. Never re-scan the whole repo.
2. **Track every task.** When a task is done: tick it `[x]` in PLAN.md and add ONE line to
   PROGRESS.md — what changed and why. Keep "▶ Continue here" current.
3. **When something fails: STOP.** Read the error → state the likely cause → list 2–3 fixes →
   pick the best and explain why in two lines → continue. Same issue fails twice → stop and ask.
4. **When the owner must act** (log in, create an account, click in a dashboard, add a setting):
   give (a) exact numbered steps, (b) where to click, (c) what to reply when done. Never assume
   they know the dashboard. Never invent tokens, IDs or passwords.
5. **Short messages.** Report only: done, next, blocker.
6. **Git** as in §8 — organised commits, never random pushes.

## 4. Commands

Laptop, today (Windows — PowerShell or Git Bash):

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

- A second bridge for testing must not read the owner's Telegram bot:
  `AYRA_BRIDGE_PORT=8788 AYRA_TELEGRAM=off node bridge/server.mjs` (Git Bash).
- The Claude app's preview pane blocks the microphone — voice needs a real Chrome/Edge window. Its
  Terminal panel can't run commands on this laptop; start AYRA for the owner in a minimized
  `cmd /c title AYRA & npm start` window instead.

Planned — they arrive with their phase; don't call them working before they exist:

```
npm run core           # Phase 4: the cloud core (on the laptop for development, Telegram off)
npm run desk           # Phase 5: the laptop desk; npm start becomes desk + face
deploy/setup.sh        # Phase 4: one-time server setup, run on the server
deploy/update.sh       # Phase 4: pull main, install, restart the ayra-core service
```

## 5. Map — what each file is for

| Path | Purpose |
|---|---|
| `docs/VISION.md` · `docs/ARCHITECTURE.md` | **Why** (the owner's goals, in their words) · **how** (cloud core + laptop desk, the six decisions) |
| `config/identity.json` | **Who AYRA is**: name, wordmark, tagline, honorific, language, timezone, voice, wake words. The only place identity is set. |
| `bridge/server.mjs` | Today's all-in-one bridge: HTTP + WebSocket on :8787 (the HUD channel), media/page proxies, ElevenLabs `/tts` `/stt`, Telegram start-up, banner. Splits into core + desk (Phases 4–5). |
| `bridge/brain.mjs` | **The brain**, channel-independent: `createBrain().open({ systemPrompt, servers, emit })` → one Claude session with `ask / interrupt / close`; emits `ready text tool done error` |
| `bridge/gate.mjs` | **The safety gate**: `createGate()` → `decide(tool)`, the built-in tool list, connector policy (claude.ai Gmail/Calendar/Drive read-only, others removed). Tested in `test/gate.test.mjs` |
| `bridge/audit.mjs` · `bridge/state.mjs` | Audit log `data/logs/YYYY-MM-DD.jsonl` (never tool inputs or secrets) · `data/state.json`, small state that survives restarts |
| `bridge/identity.mjs` | Loads identity + `.env.local`; `env('X')` reads `AYRA_X` |
| `bridge/persona.mjs` · `bridge/context.mjs` | AYRA's personality: `SYSTEM_PROMPT` (voice + HUD) and `TEXT_PROMPT` (Telegram), one character · the "[Now: …]" local-time stamp on every question |
| `bridge/telegram.mjs` | Telegram channel: long polling, owner-only, one question at a time (a burst of messages = one question), text persona |
| `bridge/panels.mjs` · `bridge/ui.mjs` | Tool servers `ayra` (`display`, `blade`, `probe_url` — what appears on the HUD) · `ayra_ui` (theme, reactor, orbit, effects, reset) |
| `bridge/chrome.mjs` · `bridge/vision.mjs` | Tool servers `ayra_chrome` (the owner's Chrome via the Claude extension, Windows pipe `\\.\pipe\claude-mcp-browser-bridge-<user>`) · `ayra_eyes` (`look` / `watch` through the camera) |
| `bridge/origin.mjs` · `bridge/net.mjs` · `bridge/page.mjs` | Which pages may talk to the bridge · SSRF-safe outbound fetching (use for EVERY server-side fetch) · web pages for blades |
| `src/App.tsx` · `src/identity.ts` · `src/config.ts` | The face's conductor (boot, phases, voice loop, turns) · identity for the face · `VITE_*` settings |
| `src/lib/wake.ts` · `voice.ts` · `vad.ts` | "Hey AYRA" phrase · speech recognition + barge-in · voice-activity detection |
| `src/lib/tts.ts` · `kokoro.ts` · `fillers.ts` · `vocative.ts` | Speaking + voice choice · optional neural voice · short "On it!" lines · the comma before "boss" |
| `src/lib/bridge.ts` · `brain.ts` · `capabilities.ts` · `anthropic.ts` | WebSocket client · bridge vs direct mode · `/health` probe · direct mode (not used by default) |
| `src/lib/hands.ts` · `camera.ts` · `clap.ts` · `audio.ts` · `music.ts` · `sfx.ts` | Hand gestures · camera · clap-to-start · mic analyser · music · sound effects |
| `src/ui/*` · `src/scene/*` · `src/store.ts` · `src/index.css` | HUD, blades, boot, sanitiser (`sanitise.ts`), diagnostics (D) · Three.js reactor · app state · all styles incl. `.hud-*` |
| `scripts/start.mjs` · `setup.mjs` · `smoke.mjs` | `npm start` launcher · `npm run setup` preflight · `npm run smoke` end-to-end test |
| `test/*.test.mjs` | Unit tests, run by `npm test` |
| `index.html` · `vite.config.ts` | Page shell + strict CSP · dev server, `%AYRA_WORDMARK%` title |
| `data/` | AYRA's runtime data (memory, logs, state) — gitignored, never committed |

Planned (ARCHITECTURE.md "What changes in the code"):

| Path | Purpose | Phase |
|---|---|---|
| `bridge/core.mjs` | Cloud core entry: Telegram, brain, link server, jobs, scheduler — no HUD | 4 |
| `deploy/` | Server setup and update scripts, `systemd` unit, owner steps | 4 |
| `bridge/link.mjs` · `bridge/desk.mjs` | Core ↔ desk protocol (token, hello, heartbeat, tool calls) · laptop desk entry: HUD socket + desk tools | 5 |
| `bridge/jobs.mjs` · `bridge/db.mjs` | Jobs and the laptop queue · SQLite `data/ayra.db` (`node:sqlite`) | 5 |
| `bridge/memory.mjs` | `remember / recall / forget`, owner profile | 6 |
| `bridge/approvals.mjs` · `notify.mjs` · `scheduler.mjs` | Approve/Deny buttons · messages to the phone · reminders and routines | 7 |
| `agents/<name>/` | One folder per agent: purpose, "done", prompt, model, tools, permissions, schedule | 8 |

Face ↔ brain protocol (WebSocket): face sends `ask {id,text}`, `interrupt`, `reply {id}`; brain sends
`ready {servers}`, `text {delta}`, `tool {name}`, `done {text}`, `error {message}`, `panel`, `blade`,
`ui {op,args}` — turn frames carry `ask: <id>`. Change both sides together or not at all. The
core ↔ desk link protocol is defined in `bridge/link.mjs` (Phase 5), and the same rule applies.

## 6. Configuration

- **Identity:** `config/identity.json` only. Never hard-code the name, wake words or honorific.
- **Settings and secrets:** `.env.local` on the laptop (gitignored; template `.env.example`); on the
  server, one settings file readable only by the `ayra` user. The bridge reads `AYRA_*` (`MODEL`
  default `claude-opus-5-5`, `EFFORT` `medium`, `BRIDGE_PORT` 8787, `ALLOW_WRITES`, `ALLOWED_ORIGINS`,
  `ALLOW_NO_ORIGIN`, `FILE_ROOTS`, `VOICE_ID`, `DEBUG`, `RESUME_HOURS` — default 6,
  `TELEGRAM_TOKEN`, `TELEGRAM_OWNER_ID`, `TELEGRAM` — `off` disables it, `CONNECTORS` — default
  `Gmail,Google Calendar,Google Drive`, or `none`) plus `ELEVENLABS_API_KEY`.
  Planned: `AYRA_ROLE` (`core` | `desk`), `AYRA_CORE_URL`, `AYRA_LINK_TOKEN`, `AYRA_DATA_DIR`.
- The face reads `VITE_*` — only `VITE_*` values reach the browser, so never put a secret in one.
- AYRA's own sessions never load this file: the bridge runs with `settingSources: []`.

## 7. Non-negotiable project rules

**Safety (runtime)**
- Read-only by default. Sending, deleting, paying, posting, sharing, shell, file writes and device
  control need writes enabled — and, once Approve buttons exist (Phase 7), the owner's Approve.
  Per-agent exceptions only as agreed at that agent's intent check. Never make writes the default.
- The gate in `bridge/gate.mjs` (`decide()`) is the single authority for every tool, cloud and desk
  alike. Classify every new tool there explicitly and add a test in `test/gate.test.mjs`; no
  blanket allows.
- Keep `settingSources: []` and `permissionMode: 'default'`; never `bypassPermissions`.
- New tool servers are named `ayra_<area>` and withhold effectful tools at construction unless
  writes are on (pattern: `chromeServer({ allowWrites })`). The desk keeps its own writes switch.
- Content AYRA reads (web pages, mail, documents, messages, tool output) is untrusted data. It can
  never trigger an action by itself, and any action it suggests needs Approve. Assume prompt
  injection.

**Security**
- No public ports anywhere. The core reaches Telegram and Anthropic outbound only; the desk link
  runs inside Tailscale and needs `AYRA_LINK_TOKEN`; the HUD and face stay on localhost with the
  Origin check. Exposing anything else to a network needs the owner's OK.
- The server: non-root `ayra` user, SSH only through Tailscale, firewall closed, automatic security
  updates, `systemd` sandboxing.
- Server-side fetches go through `bridge/net.mjs`. Model-authored HTML only through
  `src/ui/sanitise.ts`. Keep the CSP in `index.html` strict.
- Secrets live only in `.env.local`, the server's settings file or the OS environment: never
  committed, logged, printed, put in a prompt or sent to the browser. New dependencies need a
  reason in PROGRESS.md and go through the lockfile.

**Privacy**
- Camera and mic only on the owner's request. AYRA's data lives in `data/` on the owner's server
  (the source of truth) and on the laptop; it goes to Claude only as part of a turn. Notion pages
  are the owner's. No telemetry or analytics.

**Terms** (checked 2026-10-02 — docs/ARCHITECTURE.md, decision 1)
- **Single user.** The Pro login is for ordinary, individual use of Claude Code and the Agent SDK.
  Never let anyone else use AYRA on it or route their requests through it. If AYRA is ever shared
  or commercial, switch to an API key first.
- Sign in only through Anthropic's own flow (`/login`). AYRA's code never reads, copies or forwards
  Claude credentials.
- Pro limits are shared with the owner's own Claude use: meter AYRA's usage and cap background work.
- Keep `LICENSE` and the upstream copyright (MIT); credit adewaskar/jarvis in the README.
- `public/audio/` tracks came with the upstream demo — clear the rights or replace them before any
  public or commercial use.
- Official APIs first, and respect each service's terms. Unofficial automation (WhatsApp Web,
  scraping portals, LinkedIn browsing) only with the owner's explicit OK and the risk noted in
  PROGRESS.md.

**Code**
- Match the surrounding style: ESM, 2-space indent, single quotes, no semicolons, comments that
  explain *why*. TypeScript in `src/`.
- Comments mentioning JARVIS describe the upstream design — don't mass-edit them. New code and every
  user-facing string say AYRA, via identity.
- The laptop is Windows and the server is Linux: keep both working (`process.platform`,
  `node:path`, `os.tmpdir()`, never a hard-coded `/tmp`).

## 8. Git & GitHub

- `origin` = https://github.com/rehanshaik123/AYRA (owner's). `upstream` = adewaskar/jarvis — fetch
  only, never push.
- One branch per phase: `phase-<n>-<name>`. One commit per task or per area, message
  `<area>: <what> — <why>` with area ∈ `docs config bridge face scripts deps fix test deploy`, so
  anyone reading the history can tell what each file is for.
- Phase done (demo given, owner's OK) → merge into `main` with `--no-ff` ("Phase N — <name>"), push
  `main` and the phase branch. Never force-push, never rewrite pushed history.
- Deploy to the server only from `main`, after the owner's OK.
- Never commit `.env.local`, any `.env*` except `.env.example`, `data/`, or secrets.

## 9. Definition of Done (every task)

1. `npm run build` passes and `npm run lint` shows 0 warnings.
2. Bridge or core code changed → start a local copy (Telegram off) and `npm run smoke` passes;
   after a deploy, `/status` from the phone.
3. UI changed → the face loads; voice/mic changes are marked "needs owner check in Chrome".
4. `npm test` passes, and new logic gets a test in `test/` (node:test; `.ts` files load through tsx).
5. PLAN.md ticked, one PROGRESS.md line added, "▶ Continue here" updated.
