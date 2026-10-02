# PROGRESS.md — where AYRA stands

## ▶ Continue here

- **Phase:** 1 — Foundation · branch `phase-1-foundation`
- **Next task:** 1.10 — bridge honours `is_error`; smoke fails on error answers
- **Blockers:** none
- **Waiting on owner:** 1.15 voice test (not blocking) · decisions Q1–Q7 in PLAN.md (none block Phases 1–2)
- **Health:** build ✓ · lint 0 warnings · smoke ✓ on `claude-opus-5-5` (6.1 s)

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
