# PLAN.md — AYRA roadmap

Work top to bottom. A task is done when its **Check** passes; then tick it `[x]` and add one line to
[PROGRESS.md](PROGRESS.md). 🧑 = needs the owner (stop and give step-by-step instructions).
Rules for how to work are in [CLAUDE.md](CLAUDE.md).

---

## Phase 0 — Setup ✅

- [x] 0.1 Clone adewaskar/jarvis into `E:\jarvis`; rename its remote to `upstream`.
- [x] 0.2 Install dependencies (`npm ci`); record baseline build ✓ and lint (2 upstream warnings).
- [x] 0.3 Baseline brain test: upstream bridge answers through the owner's Claude login on Windows.

## Phase 1 — Foundation (AYRA identity + Windows) · branch `phase-1-foundation` ✅

Goal: AYRA runs on this laptop under its own name, Windows-correct, verified, pushed to GitHub.

- [x] 1.1 Identity in one file — `config/identity.json` + loaders `bridge/identity.mjs`, `src/identity.ts`.
- [x] 1.2 AYRA persona prompt — `bridge/persona.mjs`; honorific optional (none by default).
- [x] 1.3 Wake phrase "Hey AYRA" + common mishearings — `src/lib/wake.ts`; speech recognition in en-IN.
      Check: 17/17 sample transcripts behave (incl. "the era of AI" not waking).
- [x] 1.4 Rebrand: HUD text, boot wordmark, tab title, tool servers `ayra_*`, `[ayra]` logs, `AYRA_*`
      settings, package name.
- [x] 1.5 Windows: Chrome control over the named pipe, `npm run bridge:writes` via `--writes`, bridge
      loads `.env.local`, no `/tmp`, Claude config path normalised.
- [x] 1.6 Voice by identity: female, en-IN → en-GB → en-US, Edge "Natural" voices first; Kokoro female
      voices; honorific-aware filler lines.
- [x] 1.7 Scripts: Windows-aware `npm run setup`; `npm run smoke` end-to-end test.
- [x] 1.8 Project docs: CLAUDE.md (rules), PLAN.md (this roadmap), PROGRESS.md (log + resume point).
- [x] 1.9 Update Claude Agent SDK 0.3.220 → 0.3.287 — its bundled Claude Code (2.1.220) is too old for
      `claude-opus-5-5`. Check: `npm run smoke` passes on `claude-opus-5-5`.
- [x] 1.10 Errors are errors: the bridge honours the SDK's `is_error` (never speaks "API Error…" as an
      answer); smoke fails on error answers. Check: a bad model name → smoke FAIL, clean spoken line.
- [x] 1.11 README for AYRA (what it is, quick start, what each file is for) + `.env.example` with
      `AYRA_*` settings.
- [x] 1.12 Cleanup: honorific-aware error lines (`src/lib/bridge.ts`, `src/lib/anthropic.ts`); stale
      `JARVIS_*` comments; smoke reads `.env.local`.
- [x] 1.13 Verify: build, lint 0 warnings, setup green, smoke on `claude-opus-5-5`, face loads as A.Y.R.A.
- [x] 1.14 Git: organised commits on `phase-1-foundation`; bring in the owner's initial GitHub commit
      (no force-push); merge to `main`; push.
- [ ] 1.15 🧑 Owner test in a real Chrome/Edge window: say "Hey AYRA", ask something, judge the voice
      (press V to cycle voices). Doesn't block Phase 2.

## Phase 2 — Core brain & safety · branch `phase-2-core` ✅

Goal: one reusable brain for every channel, safe defaults for the owner's connected accounts, the
conversation survives reloads, an audit trail, and automated tests.

- [x] 2.1 Connector policy. The brain inherits 10 claude.ai connectors (Gmail, Calendar, Drive, Figma,
      Canva, Lucid, draw.io, Beautiful.ai, Wispr Flow, Claude Docs). Keep Gmail/Calendar/Drive reads;
      keep the rest out of AYRA's sessions; deny every effectful connector tool even with writes on
      until confirmations exist (3.3). Debug mode logs the tool names AYRA sees.
      Check: unit test on `decideTool` + smoke.
- [x] 2.2 Extract `bridge/brain.mjs` (session creation, gate, persona per channel) from `server.mjs`;
      the WebSocket becomes one channel adapter. Check: smoke passes, behaviour unchanged.
- [x] 2.3 Time & locale on every turn (local date, time, weekday in IST) without breaking prompt
      caching. Check: "what is tomorrow's date?" is right.
- [x] 2.4 Conversation survives a page reload: resume the SDK session (id kept in `data/state.json`).
      Check: reload, AYRA remembers the previous question.
- [x] 2.5 Audit log `data/logs/YYYY-MM-DD.jsonl`: turns, tools, allow/deny decisions, errors — no secrets.
- [x] 2.6 Tests: `npm test` (node:test) for `decideTool`, wake phrase, identity, origin checks; added to
      the Definition of Done.

## Phase 3 — AYRA Anywhere (phone access) · branch `phase-3-anywhere`

Goal: reach AYRA from the phone on any network, safely, while the laptop is at home.

- [ ] 3.0 Personality & voice (owner's request): excited and warm; a little playful roasting and
      flirting at the right moments (kind, PG, never during bad news or stress; "AYRA, be serious"
      turns it off); ElevenLabs voice `si0svtk05vPEuvwAW93c`. 🧑 needs the owner's ElevenLabs API key
      and approval of sample replies before merging.
- [ ] 3.1 🧑 Owner creates a Telegram bot with @BotFather and finds their Telegram user ID; both go into
      `.env.local` (`AYRA_TELEGRAM_TOKEN`, `AYRA_TELEGRAM_OWNER_ID`).
- [ ] 3.2 Telegram channel `bridge/telegram.mjs`: long polling (no open ports), owner-only, text in/out,
      Markdown persona variant. Check: message from the phone on mobile data → answer.
- [ ] 3.3 Confirmations: effectful tools pause and ask on Telegram with Approve / Deny buttons; no answer
      in 2 minutes = deny. Check: "send an email to …" asks first; Deny cancels.
- [ ] 3.4 Voice notes → text (decision Q5), replies as text.
- [ ] 3.5 `notify()` — push a message to the owner's phone (used by reminders, watchers, health).
- [ ] 3.6 🧑 Always-on: start at login (Task Scheduler), restart on crash, power settings (plugged in =
      never sleep, lid closed = do nothing), `/status` command.
- [ ] 3.7 🧑 HUD on the phone: Tailscale on laptop + phone, `tailscale serve` HTTPS, pairing token,
      CSP and allowed origins updated.

## Phase 4 — Memory · branch `phase-4-memory`

- [ ] 4.1 `bridge/memory.mjs` + tools `remember`, `recall`, `forget`, `list`; files in `data/memory/`;
      every write logged.
- [ ] 4.2 Owner profile `data/memory/profile.md`, loaded into every session (stable, cache-friendly).
- [ ] 4.3 🧑 College context: timetable, subjects, exam and assignment deadlines (owner provides once).
- [ ] 4.4 Daily journal: end-of-day summary of what AYRA did and learned.
- [ ] 4.5 Privacy: "forget X", export, a memory viewer blade.

## Phase 5 — Automations · branch `phase-5-automations`

- [ ] 5.1 Scheduler `bridge/scheduler.mjs`: one-shot reminders + recurring routines (cron), persisted in
      `data/routines.json`, results via `notify()`. Check: "remind me at 6 pm to call home" fires on the phone.
- [ ] 5.2 Manage routines by voice/text ("every weekday at 7:30 brief me").
- [ ] 5.3 Morning brief: weather, today's classes, deadlines, calendar, important mail.
- [ ] 5.4 Watchers: check a page or feed periodically; notify on change (e.g. results published).
- [ ] 5.5 Automated runs are read-only by default; effectful steps need the owner's Approve (3.3).

## Phase 6 — Integrations & PC control · branch `phase-6-integrations`

- [ ] 6.1 Gmail / Calendar / Drive through the claude.ai connectors: reads (summaries, agenda, find
      files) → drafts → sending only behind Approve.
- [ ] 6.2 Windows PC control `bridge/pc.mjs`: open apps/URLs, volume/media, lock, screenshot,
      battery/network status; effectful ones gated.
- [ ] 6.3 Files: find a file on the laptop and send it to the phone.
- [ ] 6.4 Optional: Android phone (adb), WhatsApp (official route only, or owner-accepted risk), GitHub,
      Spotify.

## Phase 7 — Hardening & polish · branch `phase-7-polish`

- [ ] 7.1 Usage tracking per day; warning near plan limits.
- [ ] 7.2 Kill switch: "AYRA, stand down" / Telegram `/stop` disables every effectful tool.
- [ ] 7.3 Voice: ElevenLabs voice choice; a custom "AYRA" wake word (Porcupine keyword) instead of the
      speech-based one.
- [ ] 7.4 AYRA visual identity (colours, logo); replace upstream audio tracks with cleared ones.
- [ ] 7.5 Encrypted backups of `data/` to an owner-chosen place.
- [ ] 7.6 Security review of the whole system before writes are ever on by default.

---

## Open decisions (owner)

| ID | Question | Default until answered |
|---|---|---|
| Q1 | How should AYRA address you? | ✅ "boss" (owner, 2026-10-02) |
| Q2 | AYRA's voice? | ✅ ElevenLabs `si0svtk05vPEuvwAW93c`; excited, a little flirty (owner, 2026-10-02) |
| Q3 | Model: Opus 5.5 (smartest) or Sonnet 5.5 (faster, lighter on plan limits)? | `claude-opus-5-5`, effort `medium` |
| Q4 | Telegram as the first phone channel? | yes |
| Q5 | Voice-note transcription: ElevenLabs (free tier, account needed) or local Whisper (free, slower)? | decide at 3.4 |
| Q6 | OK to keep the laptop awake and plugged in while you're out? | decide at 3.6 |
| Q7 | Which connectors may AYRA use? | Gmail, Calendar, Drive (read); others off (2.1) |

## Risks

| Risk | Mitigation |
|---|---|
| Laptop asleep, off or offline while away | 3.6 always-on + `/status`; later, a dedicated always-on machine |
| Prompt injection from web pages or mail | Default-deny gate, Approve buttons (3.3), audit log (2.5) |
| Remote access abused | Telegram owner-ID allowlist, Tailscale only, pairing token, no public ports |
| Claude plan limits | Effort tuning, Sonnet option (Q3), usage tracking (7.1) |
| Chrome extension pipe is a private interface | Soft failures, WebFetch fallback, SDK pinned by lockfile |
| Upstream audio rights | Replace before any public use (7.4) |
