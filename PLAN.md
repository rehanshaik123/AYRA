# PLAN.md — AYRA roadmap

Built around [docs/VISION.md](docs/VISION.md) (what the owner wants) and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (cloud core + laptop desk). Rules are in
[CLAUDE.md](CLAUDE.md).

**Every phase runs the same way:** intent check (restate the goal in 3–5 bullets, settle the open
points, wait for "go") → tasks, each done when its **Check** passes (tick `[x]` + one PROGRESS.md
line) → a short demo from the phone → merge after the owner's OK. 🧑 = the owner does this step;
they get click-by-click instructions when it comes up.

---

## Done

**Phase 0 — Setup** ✅
- [x] 0.1 Clone adewaskar/jarvis into `E:\jarvis`; its remote renamed `upstream`.
- [x] 0.2 Install dependencies; baseline build ✓, lint (2 upstream warnings).
- [x] 0.3 The upstream bridge answers through the owner's Claude login on Windows.

**Phase 1 — Foundation (AYRA identity + Windows)** ✅ merged to `main`
- [x] 1.1 Identity in one file (`config/identity.json` + loaders).
- [x] 1.2 AYRA persona prompt (`bridge/persona.mjs`).
- [x] 1.3 Wake phrase "Hey AYRA" + mishearings, en-IN.
- [x] 1.4 Rebrand: HUD, wordmark, title, `ayra_*` tool servers, `AYRA_*` settings.
- [x] 1.5 Windows: Chrome named pipe, `--writes`, `.env.local`, no `/tmp`.
- [x] 1.6 Voice chosen by identity (female, en-IN first); Kokoro voices; filler lines.
- [x] 1.7 Windows-aware `npm run setup`; `npm run smoke`.
- [x] 1.8 CLAUDE.md, PLAN.md, PROGRESS.md.
- [x] 1.9 Agent SDK 0.3.287 (its Claude Code supports `claude-opus-5-5`).
- [x] 1.10 Errors are errors (`is_error` honoured; smoke fails on them).
- [x] 1.11 README + `.env.example` for AYRA.
- [x] 1.12 Cleanup: honorific-aware errors, stale comments, LF line endings.
- [x] 1.13 Verified end to end on Windows.
- [x] 1.14 Organised commits, merged to `main`, pushed.

**Phase 2 — Core brain & safety** ✅ merged to `main`
- [x] 2.1 Connector policy: Gmail/Calendar/Drive read-only; 7 other connectors removed.
- [x] 2.2 `bridge/brain.mjs`: one reusable brain; the WebSocket became a channel adapter.
- [x] 2.3 Local date and time on every question (prompt caching kept).
- [x] 2.4 The conversation survives a reload (`data/state.json`).
- [x] 2.5 Audit log `data/logs/YYYY-MM-DD.jsonl`.
- [x] 2.6 `npm test` + tests for gate, wake phrase, identity, origin, state, audit, time.

**Phase 3 — Phone via Telegram** ✅ on `phase-3-anywhere` — 🧑 merge to `main` after the owner's OK
- [x] 3.0 Personality (excited, warm, a little roasting and flirting, calls the owner "boss") and
      the ElevenLabs voice Lily.
- [x] 3.1 🧑 Bot @Ayra_rehan_bot; owner ID saved — only the owner's account gets answers.
- [x] 3.2 Telegram channel `bridge/telegram.mjs` (long polling, owner-only, batching, emoji).

---

## Phase 4 — Always-on core: one real task with the laptop off · branch `phase-4-core`

**Goal:** with the laptop shut, the owner messages AYRA on Telegram and she does one real daily task:
checks whether an idea already exists and replies with a short verdict and sources.

**Why:** it proves the cloud home end to end (server, Claude login, Telegram, web research) before
anything is built on it. Idea checking is the owner's own daily ask ("I want to know whether a
solution already exists or not") and needs no account beyond the server.

**Intent check — settle:** what a good idea-check answer looks like · the host (DigitalOcean
Bangalore ≈ ₹1,050/month, my pick, or Hetzner ≈ ₹620) and paying for it · a Tailscale account
(free) · three real ideas to test with.

**🧑 Owner steps:** create the hosting account and server (paid) · install Tailscale on the laptop
and phone and sign in · log in to Claude on the server (`claude` → `/login`, paste the code) · turn
Telegram off on the laptop at cut-over.

- [ ] 4.1 `deploy/`: server setup script and steps — `ayra` user, Node 24, 2 GB swap, closed
      firewall, Tailscale, automatic security updates, `systemd` service `ayra-core`.
      Check: the service runs and restarts after a forced crash; no public listening ports.
- [ ] 4.2 🧑 Claude on the server through Anthropic's `/login`; the claude.ai connectors arrive.
      Check: `npm run smoke` passes on the server; AYRA reads today's calendar from the server.
- [ ] 4.3 `bridge/core.mjs` + `npm run core`: Telegram, brain, gate, audit — no HUD tools. The
      laptop stops reading Telegram (cut-over); a `409` from Telegram alerts the owner.
      Check: laptop shut → Telegram answers; a second reader → an alert, not a silent tug-of-war.
- [ ] 4.4 The idea check: persona and tools tuned so "does this already exist?" returns a verdict,
      3–5 real sources, how the owner's idea could differ, and a next step.
      Check: three of the owner's real ideas answered with the laptop shut; the owner rates each.
- [ ] 4.5 Health: `/status` (uptime, Claude login state, today's usage, laptop online?) and an alert
      before the Claude login expires.
      Check: `/status` from the phone shows the truth.
- [ ] 4.6 Move in: copy the laptop's `data/` (state, logs) to the server; refresh README and
      `.env.example` (voice Lily, "boss", cloud setup).
      Check: `/log` shows today's entries; README matches what's real.
- [ ] 4.7 Small fixes from the QA pass ([docs/TEST-REPORT.md](docs/TEST-REPORT.md) #3–7): the HUD
      voice label, the "systems" count, the interrupt wording, stale `decideTool()` pointers, Vite
      re-optimising on a port change. (#3, the voice label, fixed with 4.8.)
      Check: each defect re-tested and gone.
- [x] 4.8 The avatar face (owner's request, 2026-10-03): the 3D reactor measured heavy (~1.5 CPU
      cores, ~1 GB in Chrome), so AYRA gets an animated character in the middle — Orihime-style
      fan art in SVG, nine poses (sleep, idle, wave, listen, think, magic, talk with lip-sync, oops,
      snack), F switches back to the reactor.
      Check: every phase shows its pose; ~60% less CPU than the reactor; owner evaluates in Chrome.

**Demo:** phone only, laptop shut — check an idea, then `/status`. Until Phase 5 the HUD still runs
its own brain on the laptop, with Telegram off there.

## Phase 5 — Two homes: the laptop joins · branch `phase-5-desk`

**Goal:** when the laptop is on, the same AYRA (same conversation, same memory) uses the laptop's
Chrome, files and HUD; when it's off, she says so and queues the job.

**Why:** "one assistant, two homes — she works out by herself whether the laptop is online and
sends each job to the right place."

**Intent check — settle:** which laptop jobs matter first (open a page in your Chrome, find a file,
…) · how long a queued job may wait · HUD and Telegram as one shared conversation · how AYRA
gets Chrome's per-site permission (pre-approved sites, or asking on the phone — QA finding #1).

**🧑 Owner steps:** turn the Windows page file back on and restart Chrome · let the desk start at
login · voice test in Chrome.

- [ ] 5.1 `bridge/link.mjs`: token, hello, heartbeat, tool calls, reconnect with back-off.
      Check: unit tests; cut the network → offline within 45 s → back online by itself.
- [ ] 5.2 `bridge/desk.mjs` + `npm run desk`: the HUD socket (localhost) and the desk tools, served
      over the link; no Claude process on the laptop; `npm start` = desk + face.
      Check: a HUD question is answered by the cloud core; the laptop uses clearly less memory.
- [ ] 5.3 Routing: the desk tool catalogue in the core, the `[Laptop: online/offline]` stamp, the
      `LAPTOP_OFFLINE` result.
      Check: "open my college portal in Chrome" works when on; when off AYRA says so first.
- [ ] 5.4 The laptop queue on SQLite (`bridge/db.mjs`, `bridge/jobs.mjs`): queued while off, runs on
      reconnect, result to Telegram, 7-day expiry, `/jobs`.
      Check: queue a job, open the laptop, the result arrives on the phone.
- [ ] 5.5 One conversation: a single main session for HUD and Telegram, channel tags, one persona
      with per-channel style.
      Check: ask on the HUD, continue on Telegram — she remembers.
- [ ] 5.6 🧑 The desk starts at login and restarts on crash; page file on.
      Check: after a reboot the desk is online within a minute.
- [ ] 5.7 🧑 Voice test in a real Chrome window (was 1.15).
      Check: "Hey AYRA" wakes her and she answers in Lily's voice.

## Phase 6 — Knows me: memory and personalisation · branch `phase-6-memory`

**Goal:** AYRA remembers what matters about the owner (goals, schedule, people, preferences,
progress) across days, channels and both homes, and uses it without being reminded.

**Why:** "an intelligent central system which cares about my needs and wants and is personalized
especially for me."

**Intent check — settle:** what she remembers by herself vs only when told · what is off-limits ·
the profile's shape · Notion's role (her notebook).

**🧑 Owner steps:** approve the first profile · give the timetable, gym times and deadlines once ·
connect Notion in claude.ai (a new integration).

- [ ] 6.1 `bridge/memory.mjs`: remember / recall / forget / list on SQLite; every write audited.
      Check: tell a fact on Telegram, ask about it a day later on the HUD.
- [ ] 6.2 🧑 The owner profile in every session (stable, so it stays cached).
      Check: answers use it unprompted.
- [ ] 6.3 🧑 College timetable, gym, exam and assignment deadlines, kept current.
      Check: "what's next today?" is right.
- [ ] 6.4 Nightly reflection: the day's conversations become memory updates, sent as a short digest
      the owner can veto.
      Check: the digest arrives; a vetoed item is gone.
- [ ] 6.5 Privacy controls: "forget X", export, view (`/memory`, a HUD blade).
      Check: a forgotten item can't be recalled.
- [ ] 6.6 🧑 Notion connected: an "AYRA notebook" page mirrors the profile and notes.
      Check: the page exists and stays in step.
- [ ] 6.7 Nightly encrypted backup of the core's `data/` to the laptop when it's online (was 7.5).
      Check: a restore test on a copy.

## Phase 7 — Acts and speaks first: approvals, reminders, voice notes · branch `phase-7-actions`

**Goal:** AYRA takes real actions after one Approve tap, messages the owner first, and understands
voice notes.

**Why:** it turns AYRA from an answerer into an assistant, and makes the safety model real before
any agent gets powers.

**Intent check — settle:** which actions she may take at all (each behind Approve) · quiet hours ·
reminder style · what the morning plan and night review contain.

**🧑 Owner steps:** testing only.

- [ ] 7.1 Approve/Deny buttons, `bridge/approvals.mjs` (was 3.3): effectful calls pause with the
      exact details; 2 minutes without an answer = deny; the rules table lives in the gate;
      background runs are read-only by default (was 5.5).
      Check: "email X" asks first; Deny cancels; the audit log shows both.
- [ ] 7.2 `notify()` with quiet hours (was 3.5).
      Check: a test alert arrives; nothing comes during quiet hours.
- [ ] 7.3 Scheduler: reminders and routines in SQLite, managed by text (was 5.1–5.2).
      Check: "remind me at 6 pm to call home" fires on the phone.
- [ ] 7.4 Morning plan and night review, offered, never forced (was 5.3).
      Check: a week of real use; the owner keeps or changes them.
- [ ] 7.5 Voice notes → text with ElevenLabs Scribe (was 3.4).
      Check: a Hinglish voice note is understood and answered.
- [ ] 7.6 Kill switch: `/stop` or "AYRA, stand down" turns off every effectful tool (was 7.2).
      Check: an action after `/stop` is refused.
- [ ] 7.7 Usage meter: today's usage in `/status`, a cap for background work, a warning near the
      limits (was 7.1).
      Check: the cap pauses a background job, never the chat.
- [ ] 7.8 Security review of the core, link, gate and approvals before any agent can act (was 7.6).
      Check: every finding fixed or accepted by the owner.

## Phase 8 — Agents: the framework and the first agent · branch `phase-8-agents`

**Goal:** the central AYRA can start, watch and judge agents, and the first agent is live.

**Why:** "incrementally add specific agents for specific tasks" — with monitoring and evaluation
from day one.

**Intent check — settle:** which agent first (VISION's guess: the DSA mentor) · what "done" means
for it · what it may do alone vs with Approve · its schedule · its Notion pages.

**🧑 Owner steps:** take the mentor's level test · approve its first milestone plan.

- [ ] 8.1 The agent registry (`agents/<name>/`) and the job runner: own sessions, statuses, `/jobs`.
      Check: a test agent runs a job end to end.
- [ ] 8.2 Monitoring and evaluation: checked against "done", the owner's 👍/👎, a score per agent,
      a weekly report.
      Check: the report arrives with real numbers.
- [ ] 8.3 The first agent (the owner's pick at the intent check).
      Check: its own "done" checks, agreed at the intent check.
- [ ] 8.4 The research agent, deep version: a multi-source report plus a Notion page, growing out
      of Phase 4's idea check.
      Check: three reports the owner rates useful.

## Phase 9 onwards — more agents, one per phase

Ranked by VISION's hours saved. Each gets its own intent check, terms check and demo.

- AI/ML mentor and Full-stack mentor, once the first mentor has proved the pattern.
- General helper: messages and small tasks in connected apps; Gmail drafts and sends behind Approve
  (was 6.1).
- LinkedIn: post achievements through the official self-serve "Share on LinkedIn" API. Anything
  beyond posting has no official API, so its route is decided with the risk written down.
- WhatsApp: urgent-message alerts and replies. There is no official API for a personal account; the
  options (for example an Android notification-forwarding app, or unofficial WhatsApp Web automation
  with a ban risk) are decided at its intent check.
- PC control (was 6.2), files to the phone (was 6.3), more apps through claude.ai connectors or MCP
  (was 6.4), watchers (was 5.4).

## Later — polish

- HUD on the phone over Tailscale (was 3.7).
- Custom "Hey AYRA" wake word and voice upgrades (was 7.3).
- Visual identity; replace the upstream audio tracks (was 7.4).
- Camera, hand gestures, music and clap-to-start keep working; no new work on them.

---

## Old tasks → new plan

| Old | Task | Decision | Why |
|---|---|---|---|
| 1.15 | Owner voice test in Chrome | keep → 5.7 | Needs the page file and a Chrome restart first; then a real test |
| 3.3 | Approve / Deny buttons | keep → 7.1 | Same design, now in the core, covering cloud and desk tools |
| 3.4 | Voice notes | keep → 7.5 | ElevenLabs Scribe already works on the free tier, so Q5 is settled |
| 3.5 | `notify()` | keep → 7.2 | Needed for reminders, queued jobs and alerts |
| 3.6 | Always-on laptop | change → 5.6 | The cloud core is the always-on part; the laptop only auto-starts the desk |
| 3.7 | HUD on the phone (Tailscale) | move → Later | Polish; Tailscale itself arrives in Phase 4 |
| 4.1 | Memory tools | change → 6.1 | SQLite in the core instead of files on the laptop |
| 4.2 | Owner profile | keep → 6.2 | The heart of personalisation |
| 4.3 | College context | keep → 6.3 | Same |
| 4.4 | Daily journal | change → 6.4 | Becomes a nightly reflection that updates memory, with a veto |
| 4.5 | Forget / export / viewer | keep → 6.5 | Same |
| 5.1 | Scheduler | keep → 7.3 | Runs in the core, stored in SQLite |
| 5.2 | Routines by text | keep → 7.3 | Merged with the scheduler |
| 5.3 | Morning brief | keep → 7.4 | Offered, never forced (owner's guess check) |
| 5.4 | Watchers | move → Phase 9+ | Becomes an agent |
| 5.5 | Automations read-only by default | keep → 7.1 | Part of the approval rules |
| 6.1 | Gmail / Calendar / Drive flows | change → Phase 9+ | Reading already works; actions go to the general helper agent |
| 6.2 | PC control | move → Phase 9+ | A desk ability, added when an agent or task needs it |
| 6.3 | Files to the phone | move → Phase 9+ | Same |
| 6.4 | adb, WhatsApp, GitHub, Spotify | change → Phase 9+ | WhatsApp and LinkedIn get their own intent checks; others through connectors |
| 7.1 | Usage tracking | keep → 7.7 | More important now: Pro limits are shared with the owner's own use |
| 7.2 | Kill switch | keep → 7.6 | Same |
| 7.3 | Wake word, voice | move → Later | Polish |
| 7.4 | Visual identity, audio tracks | move → Later | Polish; audio rights still needed before public use |
| 7.5 | Encrypted backups | keep → 6.7 | Memory becomes precious in Phase 6 |
| 7.6 | Security review | keep → 7.8 | Before any agent can act |

Nothing is dropped.

## Decisions

| ID | Question | Status |
|---|---|---|
| Q1 | How should AYRA address you? | ✅ "boss" (owner, 2026-10-02) |
| Q2 | AYRA's voice? | ✅ ElevenLabs Lily `pFZP5JQG7iQjIQuC4Bku`; excited, a little flirty (owner, 2026-10-02) |
| Q3 | Model? | ✅ Main conversation stays `claude-opus-5-5`, effort `medium`; each agent's model is chosen at its intent check |
| Q4 | Telegram as the phone channel? | ✅ yes — @Ayra_rehan_bot, account "Starboy" (owner, 2026-10-02) |
| Q5 | Voice-note transcription? | ✅ ElevenLabs Scribe — already works, free tier; local Whisper would be slow on a 2 GB server |
| Q6 | Keep the laptop awake while out? | ✅ No longer needed — the cloud core is always on |
| Q7 | Which connectors? | Gmail, Calendar, Drive (read) now; Notion at 6.6; more as agents need them (each is a new integration → ask) |
| D1 | Cloud host | Open — DigitalOcean Bangalore ≈ ₹1,050 (pick) or Hetzner ≈ ₹620; decided at Phase 4's intent check (costs money) |
| D2 | Tailscale account | Open — free, new account; Phase 4's intent check |
| D3 | What each agent may do alone | Open — at each agent's intent check |
| D4 | LinkedIn beyond posting, WhatsApp | Open — at their intent checks, with the risks written down |

## Risks

The full table is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#risks). The ones to watch first:
Pro limits shared with the owner's own Claude use (usage meter, 7.7), the Claude login expiring on
the server (alert, 4.5), and prompt injection once AYRA can act (gate + Approve, 7.1).
