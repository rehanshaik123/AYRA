# PROGRESS.md — where AYRA stands

## ▶ Continue here

- **Phase:** 3 — AYRA Anywhere · branch `phase-3-anywhere` (Phases 1–2 ✅ on `main`)
- **Next task:** 3.1 🧑 owner creates the Telegram bot + finds their user ID (steps in chat), then 3.2 Telegram channel
- **Blockers:** 3.1 needs the owner (Telegram bot token + user ID)
- **Waiting on owner:** 3.1 Telegram bot · 1.15 voice test · decisions Q1–Q7 (Q5 needed before 3.4, Q6 before 3.6)
- **Health:** build ✓ · lint 0 · `npm test` 27/27 · smoke ✓ on `claude-opus-5-5`

## Log — one line per task (what changed — why)

- 2026-10-01 · 0.1 Cloned adewaskar/jarvis into `E:\jarvis`, remote renamed `upstream` — so nothing can be pushed to the author's repo.
- 2026-10-01 · 0.2 `npm ci`; baseline build ✓, lint 2 upstream warnings — a baseline to tell old problems from new ones.
- 2026-10-01 · 0.3 Upstream bridge answered "Online." in 9.5 s on Windows — proves the owner's Claude login works with no API key.
- 2026-10-01 · 1.1 Added `config/identity.json` + `bridge/identity.mjs` + `src/identity.ts` — one place for name, wake words, honorific, language, voice.
- 2026-10-01 · 1.2 Moved the system prompt into `bridge/persona.mjs`, built from identity — AYRA's personality editable without touching the server.
- 2026-10-01 · 1.3 Added `src/lib/wake.ts` shared by `voice.ts` and `App.tsx`; recognition language en-IN — one wake phrase definition, tuned to the owner's accent.
- 2026-10-01 · 1.4 Renamed UI text, wordmark, title, tool servers (`ayra_*`), logs, `AYRA_*` settings, package — the system is AYRA everywhere the owner or the model sees it.
- 2026-10-01 · 1.5 Chrome via Windows named pipe, `--writes` flag, `.env.local` loading, no `/tmp`, config key fix — upstream was macOS-only in these places.
- 2026-10-01 · 1.6 Voice ranking by identity (Edge Natural / Google / SAPI names), Kokoro female voices, honorific-aware fillers — AYRA's voice matches its identity on Windows.
- 2026-10-01 · 1.7 Rewrote `scripts/setup.mjs` for Windows, added `scripts/smoke.mjs` — a preflight that tells the truth on Windows and a one-command brain test.
- 2026-10-02 · 1.8 Wrote CLAUDE.md, PLAN.md, PROGRESS.md — rules, roadmap and this log so any session can resume without re-reading the repo.
- 2026-10-02 · 1.9 Agent SDK 0.3.220 → 0.3.287 (bundled Claude Code 2.1.287) — the old one rejected `claude-opus-5-5`; smoke now answers "AYRA is online." in 6.1 s.
- 2026-10-02 · 1.10 Bridge treats `is_error` results as errors and smoke rejects "API Error" answers — AYRA would have read raw API errors aloud as answers; verified with a bad model name (clean FAIL) and the real one (PASS 5.8 s).
- 2026-10-02 · 1.11 Rewrote README (setup, controls, settings, safety, "what each file is for") and `.env.example` (`AYRA_*`) — the old ones described JARVIS and settings the bridge no longer reads.
- 2026-10-02 · 1.12 Error lines use the configured honorific, stale `JARVIS_*` comment fixed, smoke reads `.env.local`, `.gitattributes` keeps LF — last hard-coded "sir"s gone; no more CRLF warnings on commits.
- 2026-10-02 · 1.13 Verified via `npm start`: build ✓, lint 0, setup all green, smoke 4.1 s on `claude-opus-5-5`, HUD shows A.Y.R.A. / "SAY HEY AYRA", female voice picked — Phase 1 works end to end on Windows.
- 2026-10-02 · 1.14 Phase 1 merged into `main` (with the owner's GitHub "Initial commit" merged in, no force-push) and pushed to rehanshaik123/AYRA — the project is now on GitHub with a readable history.
- 2026-10-02 · 2.1 New `bridge/gate.mjs` (policy moved out of server.mjs): model gets 6 read built-ins (not 32), Gmail/Calendar/Drive read-only even with writes, 7 other connectors removed (`AYRA_CONNECTORS`), `npm test` 7/7 — the brain had the full Claude Code toolbox and could have sent mail unconfirmed with writes on.
- 2026-10-02 · 2.2 Session logic moved from server.mjs (1249 → 902 lines) into `bridge/brain.mjs` (`createBrain().open()`); WebSocket is now a thin HUD adapter. Verified: plain turn, tool turn, barge-in — Telegram (3.2) can reuse the same brain.
- 2026-10-02 · 2.3 New `bridge/context.mjs` stamps each question "[Now: Friday, 2 October 2026, 14:05 (Asia/Kolkata)]" (not the system prompt, so caching holds); persona told not to read it — AYRA had no clock; "tomorrow" now answers "Saturday, the third of October".
- 2026-10-02 · 2.4 New `bridge/state.mjs` (`data/state.json`); the HUD resumes its last Claude session after a reload if used within `AYRA_RESUME_HOURS` (6); a broken saved session is forgotten with a spoken "could not be restored" — a reload used to wipe the conversation. Verified: code word recalled across reconnects; bogus id → clean error → fresh session.
- 2026-10-02 · 2.5 New `bridge/audit.mjs`: every question, tool run, gate decision, answer, failure and session event → `data/logs/YYYY-MM-DD.jsonl` (owner's local date; text clipped, never tool inputs); `open()` now takes `channel` + `resume` — so "what did AYRA do and why was it allowed?" always has an answer.
- 2026-10-02 · 2.6 Origin check moved to `bridge/origin.mjs`; tests for wake phrase, identity + persona, origin, state, audit, time; `npm test` (tsx loader for .ts) = 27/27 and part of the Definition of Done — the core now has a safety net. Live: foreign page 403 (HTTP + WebSocket), own page 200.
- 2026-10-02 · Phase 2 ✅ merged to `main` and pushed — one reusable brain, connector policy, time awareness, reload-proof conversations, audit log, tests.

## Findings worth remembering

- SDK 0.3.220 bundles Claude Code 2.1.220; `claude-opus-5-5` needs ≥ 2.1.280 → error "API Error: 400 … does not support this model".
- The bridge passed that error to the face as a normal answer (it ignores `is_error`), and smoke reported PASS on it → task 1.10.
- AYRA's brain session inherits 10 claude.ai connectors (Gmail, Google Calendar, Google Drive, Figma, Canva, Lucid, draw.io, Beautiful.ai, Wispr Flow, Claude Docs). Default-deny blocks their effectful tools today; with writes on, mail could be sent unconfirmed → task 2.1.
- Windows Chrome control = named pipe `\\.\pipe\claude-mcp-browser-bridge-<user>`; discovery + connect verified, no tool call sent yet.
- The Claude app's preview pane blocks the microphone — voice must be tested in a real Chrome/Edge window.
- The owner's GitHub repo had one commit ("Initial commit", README `# my_own_jarvis`) with no shared history — merged in, never force-pushed.

## Known issues

- `index.html` CSP hard-codes `localhost:8787` — must change for phone access (3.7).
- `@picovoice/*` packages are installed but unused (wake word is speech-based) — revisit at 7.3.
