# CLAUDE.md — AYRA

The rulebook for every session on this repo. It loads automatically; don't re-read it.
**Next, read "▶ Continue here" in [PROGRESS.md](PROGRESS.md), then only the [PLAN.md](PLAN.md)
section for the task in hand.** When a phase starts, also read PLAN.md's **Vision** (why) and
**Target architecture** (how). These three files are the only docs; keep it that way (plus a short
README for GitHub).

## 1. What AYRA is

- Rehan's (the owner's) **personal central system**: it knows and remembers them, cares about their
  goals, takes their commands, routes each job, and runs specialist agents added one at a time.
- **Today (Phase 5, light AYRA with hands):** one bridge on the laptop (`bridge/server.mjs`) — the
  brain, the HUD's WebSocket, live hearing and Telegram. The face is an avatar with the ElevenLabs
  voice Lily. Her tools: **web search and pages, the HUD display, PowerShell and the laptop's files**
  — plus her own Chrome and the Windows apps; four kinds of action wait for the owner's Approve.
  She starts with Windows in the tray (AYRA.exe) and the laptop stays on as her home; no cloud
  until the owner has the budget.
- **Target:** two homes, one AYRA. **AYRA Core** in the cloud, always on (brain, one conversation,
  memory, Telegram, gate, guardian, audit, scheduler, agents). **AYRA Desk** on the laptop while
  it's on (HUD + voice, AYRA's own Chrome, files, PC control), dialling out to the core over
  Tailscale.
- Built on [adewaskar/jarvis](https://github.com/adewaskar/jarvis) (MIT). The brain is Claude Code
  run headless through the Claude Agent SDK on the owner's own Pro login — no API key.

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
6. **Speed is a feature.** The owner wants no lag: measure time to first word and to the full answer
   whenever a change touches a turn, and say the numbers in the demo.
7. **Git** as in §8 — organised commits, never random pushes.

## 4. Commands

Laptop, today (Windows — PowerShell or Git Bash):

```
npm install            # once, after cloning
npm start              # daily use, light: builds the face if needed, one process → open http://localhost:5173
npm run start:dev      # working on the face: bridge + Vite dev server (hot reload)
npm run shortcuts      # builds AYRA.exe (tray, starts with Windows, hotkey) + Desktop/Start/Startup shortcuts
npm run icon           # redraws desktop/ayra.ico from public/favicon.svg (only after changing the icon)
npm run bridge         # brain only                       npm run dev   # face only (Vite)
npm run build          # type-check + production build (must pass)
npm run lint           # oxlint (must stay at 0 warnings)
npm run setup          # preflight: login, SDK binary, identity, ElevenLabs key
npm run smoke          # one real end-to-end turn; needs a running bridge
npm run bench          # times five standard questions (first word, done); needs a running bridge
npm run bridge:test    # a test copy of the bridge: port 8788, Telegram off
npm test               # unit tests (gate, wake phrase, identity, avatar, …)
```

- A test bridge must not read the owner's Telegram bot: `npm run bridge:test` (port 8788, Telegram
  off; Claude Code may run it here — `.claude/settings.local.json`), then
  `AYRA_BRIDGE_PORT=8788 npm run smoke` (or `npm run bench`; add `AYRA_RESUME_HOURS=0` to the
  bridge for a fresh conversation). To look at the face against a Telegram-off bridge on
  :8787, `preview_start` the `face` entry in `.claude/launch.json` (port 5181).
- The Claude app's preview pane blocks the microphone — voice needs a real Chrome/Edge window. Its
  Terminal panel can't run commands on this laptop; start AYRA for the owner in a minimized
  `cmd /c title AYRA & npm start` window instead.

Planned — they arrive with their phase; don't call them working before they exist:
`npm run core` (Phase 9) · `npm run desk` (Phase 10; `npm start` becomes desk + face) ·
`deploy/setup.sh`, `deploy/update.sh` (Phase 9).

## 5. Map — what each file is for

| Path | Purpose |
|---|---|
| `PLAN.md` · `PROGRESS.md` | Vision, target architecture and every phase · the log, findings, known issues, "▶ Continue here" |
| `config/identity.json` | **Who AYRA is**: name, wordmark, tagline, honorific, language, timezone, voice, wake words. The only place identity is set. |
| `bridge/server.mjs` | Today's all-in-one bridge: HTTP + WebSocket on :8787 (the HUD channel), `/health`, ElevenLabs `/tts` `/stt`, the `/img` `/media` `/page` proxies for blades, Telegram start-up, banner. Splits into core + desk (Phases 9–10). |
| `bridge/brain.mjs` | **The brain**, channel-independent: `createBrain().open({ systemPrompt, servers, emit })` → one Claude session with `ask / interrupt / close`; emits `ready text tool done error` |
| `bridge/gate.mjs` | **The safety gate**: `createGate()` → `decide(tool)` / `review(tool, input)`, the ask-first rules for commands, paths, pages and apps, files of secrets (refused) and `redactSecrets`, connector policy. Tested in `test/gate*.test.mjs` |
| `bridge/audit.mjs` · `bridge/state.mjs` | Audit log `data/logs/YYYY-MM-DD.jsonl` (never tool inputs or secrets) · `data/state.json`, small state that survives restarts |
| `bridge/identity.mjs` | Loads identity + `.env.local`; `env('X')` reads `AYRA_X` |
| `bridge/persona.mjs` · `bridge/context.mjs` | AYRA's personality: `SYSTEM_PROMPT` (voice + HUD) and `TEXT_PROMPT` (Telegram), one character, plus what she can do today · the "[Now: …]" local-time stamp |
| `bridge/telegram.mjs` | Telegram channel: long polling, owner-only, one question at a time, text persona, Approve buttons, `/stop` |
| `bridge/browser.mjs` | Tool server `ayra_browser`: her Chrome — "Chrome (AYRA)" over the DevTools protocol (port 9222); clicks and submits checked with the real label |
| `bridge/apps.mjs` · `bridge/apps.ps1` | Tool server `ayra_apps`: her Windows apps through UI Automation · the PowerShell worker behind it (ASCII only) |
| `bridge/approvals.mjs` | The owner's Approve: holds each "ask" until the first answer (HUD, voice, Telegram) or 2 min → no; `halt()` is the kill switch |
| `bridge/listen.mjs` | Live hearing: relays the face's microphone stream (`/listen` socket) to ElevenLabs Scribe Realtime and the words back |
| `bridge/face.mjs` | Serves the built face (`dist/`) on 127.0.0.1:5173 in daily use — no dev server |
| `bridge/panels.mjs` · `bridge/sources.mjs` | Tool server `ayra`: `display`, `blade`, `probe_url` — what appears on the HUD · a web search's links turned into a card by the bridge, no model in the way |
| `bridge/origin.mjs` · `bridge/net.mjs` · `bridge/page.mjs` | Which pages may talk to the bridge · SSRF-safe outbound fetching (use for EVERY server-side fetch) · web pages for blades |
| `src/App.tsx` · `src/identity.ts` · `src/config.ts` | The face's conductor (boot, phases, voice loop, turns) · identity for the face · the bridge address |
| `src/lib/bridge.ts` · `capabilities.ts` | WebSocket client to the bridge · `/health` probe (is ElevenLabs there?) |
| `src/lib/wake.ts` · `voice.ts` · `listen.ts` · `audio.ts` | "Hey AYRA" phrase · the voice loop (wake, conversation, barge-in, echo, browser fallback) · live hearing to the bridge · mic analyser |
| `public/listen-worklet.js` | AYRA's ears on the audio thread: speech detection + 16 kHz PCM, never throttled in a background tab |
| `src/lib/tts.ts` · `fillers.ts` · `vocative.ts` · `sfx.ts` | Speaking (ElevenLabs, browser voice as fallback) · short "On it!" lines · the comma before "boss" · synthesised interface beeps |
| `src/ui/Avatar.tsx` · `src/ui/avatar.css` · `src/lib/avatar.ts` | **The avatar face**: the SVG character · her poses and animations · which pose for which phase, lip-sync, blinking |
| `src/ui/Hud.tsx` · `Blades.tsx` · `sanitise.ts` | The HUD chrome and transcript · the blades (the one surface for results) · the sanitiser for model-written HTML |
| `src/ui/Boot.tsx` · `Ignition.tsx` · `Diagnostics.tsx` · `Suggestions.tsx` | Start-up sequence · INITIALISE button · diagnostics (D) · rotating example questions |
| `src/store.ts` · `src/index.css` | App state · all styles incl. the `.hud-*` design system blades use |
| `scripts/start.mjs` · `setup.mjs` · `smoke.mjs` · `bench.mjs` · `bridge-copy.mjs` | `npm start` launcher · `npm run setup` preflight · `npm run smoke` end-to-end test · `npm run bench` speed table · `npm run bridge:test` |
| `desktop/ayra.cs` · `desktop/ayra.ico` | **AYRA.exe**, the tray app: starts with Windows, keeps the bridge running hidden, opens her window, Ctrl+Alt+A to talk · her icon. C# 5 (the compiler that ships with Windows) |
| `scripts/shortcuts.mjs` · `icon.mjs` | `npm run shortcuts`: builds AYRA.exe into `desktop/bin/` (gitignored) with `ayra.ini`, makes the shortcuts · `npm run icon` |
| `test/*.test.mjs` | Unit tests, run by `npm test` |
| `index.html` · `vite.config.ts` | Page shell + strict CSP · dev server, `%AYRA_WORDMARK%` title |
| `data/` | AYRA's runtime data (logs, state; later memory) — gitignored, never committed |

Planned, with their phase: `jobs.mjs` (6) · `db.mjs`, `memory.mjs` (8) · `core.mjs`, `deploy/`
(9) · `link.mjs`, `desk.mjs` (10) · `notify.mjs`, `scheduler.mjs` (11) · `agents/<name>/` (12).

Live hearing (`/listen` WebSocket): face sends 16 kHz PCM (binary), `commit`, `warm`; bridge sends
`partial {text}`, `final {text}`, `error {code,message}` — see `bridge/listen.mjs`.

Face ↔ brain protocol (WebSocket): face sends `ask {id,text}`, `interrupt`, `warm` (speech began:
wake a sleeping brain), `approval {id,ok}`, `halt`; brain sends `approve {id,reason,detail,tool}`,
`approved {id,ok,by}`, `halt {by}`,
`ready {servers}`, `text {delta}`, `tool {name}`, `done {text}`, `error {message}`, `blade` — turn
frames carry `ask: <id>`. Inside the bridge the brain also emits `sources {query, links}`, which the
HUD channel turns into a `blade`. Change both sides together or not at all. The core ↔ desk link protocol
will live in `bridge/link.mjs` (Phase 10), and the same rule applies.

## 6. Configuration

- **Identity:** `config/identity.json` only. Never hard-code the name, wake words or honorific.
- **Settings and secrets:** `.env.local` on the laptop (gitignored; template `.env.example`); on the
  server, one settings file readable only by the `ayra` user. The bridge reads `AYRA_*` (`MODEL`
  default `claude-opus-5-5`, `EFFORT` `low`, `BRIDGE_PORT` 8787, `ALLOWED_ORIGINS`,
  `ALLOW_NO_ORIGIN`, `VOICE_ID`, `DEBUG`, `RESUME_HOURS` — default 6, `SLEEP_MINUTES` — the brain
  naps after this long idle, default 10, `FACE_PORT` 5173, `SERVE_FACE`, `ALLOW_WRITES` — `0` turns
  laptop control off, `CHROME_PORT` 9222, `CHROME_PATH`, `HOTKEY` — AYRA.exe's, default `ctrl+alt+a`, `TRUSTED_SITES` — sites she may grant mic /
  camera herself, `TELEGRAM_TOKEN`,
  `TELEGRAM_OWNER_ID`, `TELEGRAM` — `off` disables it, `CONNECTORS` — default `none`) plus
  `ELEVENLABS_API_KEY`. Writes are off in code (`ALLOW_WRITES = false` in server.mjs) until the
  laptop-hands phase. The bridge sets `ENABLE_TOOL_SEARCH=false` for Claude Code (tools load up
  front; measured faster).
  Planned: `AYRA_ROLE` (`core` | `desk`), `AYRA_CORE_URL`, `AYRA_LINK_TOKEN`, `AYRA_DATA_DIR`.
- The face reads only `VITE_BRIDGE_URL` — only `VITE_*` values reach the browser, so never put a
  secret in one.
- AYRA's own sessions never load this file: the bridge runs with `settingSources: []`.

## 7. Non-negotiable project rules

**Safety (runtime)**
- Laptop control is on by the owner's decision (2026-10-03, answer "a"): AYRA acts on the laptop
  herself, and exactly four kinds of action wait for the owner's Approve (HUD card, voice, Telegram;
  2 minutes = no) — spending money, sending or posting as the owner, deleting for good, passwords and
  security settings (`gate.mjs` `ASK`). Changing that list, or adding a category that runs without
  asking, needs the owner. The kill switch (Esc, `/stop`) must always work. `AYRA_ALLOW_WRITES=0`
  turns writes off. Agents get their own rules at their intent check.
- The gate in `bridge/gate.mjs` (`decide()`) is the single authority for every tool, cloud and desk
  alike. Classify every new tool there explicitly and add a test in `test/gate.test.mjs`; no
  blanket allows.
- Keep `settingSources: []` and `permissionMode: 'default'`; never `bypassPermissions`.
- New tool servers are named `ayra_<area>` and withhold effectful tools at construction unless
  writes are on. The desk keeps its own writes switch.
- Content AYRA reads (web pages, mail, documents, messages, tool output) is untrusted data. It can
  never trigger an action by itself, and any action it suggests needs Approve. Assume prompt
  injection.

**Security**
- No public ports anywhere — the bridge and the face listen on 127.0.0.1 only. The core reaches
  Telegram and Anthropic outbound only; the desk link
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
- Mic only on the owner's request (a camera, if it ever returns, the same). AYRA's data lives in
  `data/` on the owner's server (the source of truth) and on the laptop; it goes to Claude only as
  part of a turn. Notion pages are the owner's. No telemetry or analytics.

**Terms** (checked 2026-10-02 — PLAN.md, Target architecture)
- **Single user.** The Pro login is for ordinary, individual use of Claude Code and the Agent SDK.
  Never let anyone else use AYRA on it or route their requests through it. If AYRA is ever shared
  or commercial, switch to an API key first.
- Sign in only through Anthropic's own flow (`/login`). AYRA's code never reads, copies or forwards
  Claude credentials.
- Pro limits are shared with the owner's own Claude use: meter AYRA's usage and cap background work.
- Keep `LICENSE` and the upstream copyright (MIT); credit adewaskar/jarvis in the README.
- The avatar face is fan art of Orihime Inoue (Bleach), drawn at the owner's request for personal
  use. Keep it out of anything commercial; replace it if the rights holder objects.
- Any music or sound files added later need cleared rights (the upstream tracks were removed).
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

- `origin` = https://github.com/rehanshaik123/AYRA (owner's, public). `upstream` = adewaskar/jarvis —
  fetch only, never push.
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
5. A change to a turn → `npm run bench` before and after, the numbers in PROGRESS.md (§3.6).
6. PLAN.md ticked, one PROGRESS.md line added, "▶ Continue here" updated.
