# PLAN.md — AYRA roadmap

What the owner wants (**Vision**), how it fits together (**Target architecture**), and the build
order from the first commit to the last agent. Rules are in [CLAUDE.md](CLAUDE.md); the log is in
[PROGRESS.md](PROGRESS.md).

**Every phase runs the same way:** intent check (restate the goal in 3–5 bullets, settle the open
points, wait for "go") → tasks, each done when its **Check** passes (tick `[x]` + one PROGRESS.md
line) → a short demo the owner can try from the phone → merge after the owner's OK. 🧑 = the owner
does this step; they get click-by-click instructions when it comes up.

**Where we are:** Phase 4 — Clean interface. 4.1–4.3 done (avatar, cleanup, docs); next 4.4 Speed.

---

## Vision

From the owner's interview (2026-10-02/03). The full answers, word for word, are in git:
`git show 70dcb46:docs/VISION.md`. **Status:** a draft the owner hasn't formally approved; the
guesses at the end are AYRA's and wait for the owner's word.

> "I want to build an intelligent central system which cares about my needs and wants and is
> personalized especially for me — and then incrementally add specific models/agents for specific
> tasks as we go."

- **The central system first:** one AYRA that knows the owner, remembers them, cares about what
  they need, takes their commands and gets them done, reachable from anywhere. Then **agents, one
  at a time**, which AYRA starts, watches and judges ("monitor, and not do dangerous stuff").
- **Main purpose:** take the owner's daily laptop work off their hands, and turn the hours saved
  into skills.
- **Who:** a third-year B.Tech student with a fixed college day and gym sessions; wants a stipend
  internship, then a high-paying job. "Jack of all trades, master of none… I want to become someone
  irreplaceable." Learns mostly from YouTube. Uses AYRA "whenever I can, all the time", on Android.
- **Two homes, one AYRA:** laptop on → voice + HUD at the desk, the phone, and laptop-only abilities
  (her own Chrome, files, PC control). Laptop off → the phone still works (mail, calendar, Drive,
  reminders, memory, research, morning brief) on an always-on brain in the cloud. She knows whether
  the laptop is on, routes each job, and queues laptop jobs while it's off. One memory, one
  conversation.
- **Hands with a guardian (2026-10-03):** "I want AYRA to take control of everything in my laptop,
  with a main AYRA guardrail over it checking if it's doing anything I don't like."
- **Apps:** "connect all possible apps and websites which can be accessed via MCP and APIs". Top
  three: LinkedIn, WhatsApp, Notion. Notion is AYRA's notebook and the agents' memory.
- **No lag:** a real product the owner can use all day without waiting on it.
- **Budget:** Claude Pro (no API key); cloud ₹500–2,000 a month. ElevenLabs free plan, voice Lily.

**First agents, ranked by hours saved** (AYRA's estimates; each designed at its own intent check):

| # | Agent | In the owner's words | Laptop? | Hours / week |
|---|---|---|---|---|
| 1 | Skill mentors — DSA, AI/ML, Full Stack | "a personal mentor of the particular skill, with very good memory of my status and progress", plans and progress kept in Notion | No | 6–10 |
| 2 | Research | "goes through all sources and gives me the best, relevant, real-life practical answer" — does my idea already exist? | No | 4–6 |
| 3 | General helper | "takes care of the small things, like writing a message and sending it"; flags urgent WhatsApp | Depends | 3–5 |
| 4 | LinkedIn | "post my achievements automatically, and do everything" | Posting: no | 2–3 |

**Permissions:** "full access to AYRA to do whatever, intelligently" — and "the central AYRA must
monitor, and not do dangerous stuff". Until an agent's or tool's rules are set at its intent
check, CLAUDE.md §7 holds: nothing sends, deletes, pays or posts without the owner's OK.

**AYRA's guesses — still open:** urgent WhatsApp = family, close friends, direct mentions, college
groups on exams/deadlines · LinkedIn order: post achievements → find internships → track
applications → profile → recruiters → comments · first mentor: DSA (internship tests start there),
then Full Stack, then AI/ML · check-ins: a short morning plan and night review, offered, never forced.

---

## Target architecture

Decided 2026-10-02 at the owner's request; Anthropic's terms and prices checked that day.

```
 PHONE  (Telegram: text, voice notes, Approve buttons)
   │  Telegram's servers — the core polls them, so nothing has an open port
   ▼
 AYRA CORE — small cloud server, always on
   • brain: Claude Code (Agent SDK) on the owner's Pro login
   • one conversation + memory + jobs and the laptop queue
   • gate, guardian, Approve buttons, audit log, scheduler, agents
   • cloud tools: Gmail, Calendar, Drive, Notion, web
   │  desk link: WebSocket inside Tailscale (the laptop dials out; token + heartbeat)
   ▼
 AYRA DESK — the laptop, only while it's on
   • HUD + voice on localhost
   • AYRA's own Chrome, files, PC control
   • runs the desk tools the core asks for
```

1. **Brain in the cloud** — DigitalOcean Bangalore 1 vCPU / 2 GB ≈ ₹1,050/month (or Hetzner ≈ ₹620),
   Ubuntu 24.04, Node 24, non-root `ayra` user, `systemd` service, firewall closed. Claude login:
   the owner runs `claude` → `/login` on the server. Allowed for ordinary single-user use; Pro
   limits are shared with the owner's own Claude use, so AYRA meters usage and caps background work.
   Rejected: two brains with hand-off (two of everything, two-way sync), laptop brain + cloud mailbox
   (fails "laptop off"), a one-year token (no claude.ai connectors), an API key (over budget).
2. **Laptop connects out** over Tailscale (free); token on hello; heartbeat every 15 s, offline after
   45 s. The laptop opens no ports; the HUD stays on localhost.
3. **Routing** — every tool has a fixed home. Cloud: mail, calendar, Drive, Notion, web, memory,
   reminders, jobs, agents. Laptop: AYRA's Chrome (signed-in sites), files, PC control, HUD. Laptop
   off → `LAPTOP_OFFLINE`, AYRA says so and offers to queue (7-day expiry, `/jobs`). Each question
   carries a `[Laptop: online/offline]` stamp.
4. **One source of truth:** the core's `data/` — `ayra.db` (SQLite via `node:sqlite`), audit logs,
   Claude's session history. Notion is the readable side, never the only copy. The laptop keeps no
   memory of its own. Nightly encrypted backup to the laptop.
5. **One Telegram reader:** only the core polls; the laptop runs with `AYRA_TELEGRAM=off`; a `409`
   from Telegram alerts the owner.
6. **Safety carries over:** secrets in one settings file on the server; the gate decides every tool,
   cloud and desk; the guardian checks every laptop action; Approve buttons for anything that sends,
   deletes, pays, posts or shares; the desk keeps its own writes switch; audit log of everything.

**Code evolves, it doesn't restart:** `brain.mjs` → the core's brain · `gate.mjs` → single authority,
gains "ask" · `telegram.mjs` → core only · `server.mjs` → split into `core.mjs` and `desk.mjs` ·
new: `link.mjs`, `db.mjs`, `memory.mjs`, `jobs.mjs`, `approvals.mjs`, `guardian.mjs`,
`scheduler.mjs`, `notify.mjs`, `agents/`, `deploy/`.

**Cost:** ≈ ₹620–1,050 a month (server only; Claude, Tailscale, Telegram, Notion free plan,
ElevenLabs free tier all ₹0).

Sources (checked 2026-10-02): Claude Code legal and compliance · Claude Code authentication · Pro/Max
usage with Claude Code (support.claude.com 11145838) · DigitalOcean Droplet pricing · Hetzner 2026
prices · Oracle Always Free cuts (InfoQ, 2026-07) · Tailscale pricing · LinkedIn "Share on LinkedIn"
API (`w_member_social`).

---

## Done

**Phase 0 — Setup** ✅
- [x] 0.1 Clone adewaskar/jarvis into `E:\jarvis`; its remote renamed `upstream`.
- [x] 0.2 Install dependencies; baseline build ✓, lint (2 upstream warnings).
- [x] 0.3 The upstream bridge answers through the owner's Claude login on Windows.

**Phase 1 — Foundation (AYRA identity + Windows)** ✅ on `main`
- [x] 1.1–1.14 Identity in one file, persona, "Hey AYRA" (en-IN), rebrand, Windows fixes, voice by
      identity, setup + smoke scripts, the three docs, SDK 0.3.287, errors are errors, README,
      cleanup, verified end to end, pushed.

**Phase 2 — Core brain & safety** ✅ on `main`
- [x] 2.1–2.6 Connector policy in `gate.mjs`, one reusable brain (`brain.mjs`), local time on every
      question, conversation survives a reload, audit log, `npm test`.

**Phase 3 — Phone via Telegram** ✅ on `main`
- [x] 3.0 Personality (excited, warm, a little roasting and flirting, "boss") and the voice Lily.
- [x] 3.1 🧑 Bot @Ayra_rehan_bot; owner-only.
- [x] 3.2 `bridge/telegram.mjs` (long polling, batching, emoji).

---

## Phase 4 — Clean interface · branch `phase-4-clean` ← current

**Goal:** one central AYRA that is fast and dependable: the avatar, the ElevenLabs voice and web
search, at the desk (HUD) and from the phone (Telegram, while the laptop is on). Nothing else yet.

**Why:** the owner, 2026-10-03: "first build an interface which only does the basic thing like web
search … to have an interface ready first, and then add tools/MCP and memory and agents" — and "a
real product which I can use without any lag".

**Intent check:** done 2026-10-03 (avatar only · results as cards on screen · browser voice when
ElevenLabs runs out · Telegram web-only too · short README · interview kept in git · this becomes
Phase 4 · repo stays public).

- [x] 4.1 The avatar face (owner's request): Orihime-style SVG character, nine poses, lip-sync,
      blinking; ~60% less CPU than the 3D reactor.
      Check: every phase shows its pose; owner evaluated it in Chrome.
- [x] 4.2 Clean codebase: the 3D reactor, camera and hand gestures, Chrome control, interface
      effects, music, clap-to-start, Kokoro, direct mode and unused packages removed; AYRA's tools
      are WebSearch, WebFetch and the HUD display; writes off; connectors off by default.
      Check: build ✓, lint 0, `npm test` 47/47, smoke ✓, a real search turn puts cards on screen,
      the face loads with no errors.
- [x] 4.3 Docs merged into CLAUDE.md, PLAN.md, PROGRESS.md and a short README.
      Check: no other `.md` files left in the repo.
- [ ] 4.4 Speed — no lag. Measure five standard questions (chat, date, search, search + page,
      Telegram) for time to first word and to the full answer; then cut: web tools loaded up front
      (no ToolSearch hop, measured 3.4 s), boot sequence 9 s → about 2 s, the session warmed before
      the first question, and the model/effort choice shown to the owner with numbers (Opus 5.5 vs
      Sonnet 5.5). Today: a chat answer 6.9 s, a search turn 35 s.
      Check: a before/after table; first spoken word ≤ 3 s for chat; a search answer starts ≤ 12 s.
- [ ] 4.5 A voice that never goes silent or deaf: when ElevenLabs refuses (free credits used up, key
      wrong), speaking switches to the browser voice and hearing to the browser's recogniser for the
      rest of the session, with one note on screen.
      Check: with a broken key AYRA still hears "Hey AYRA" and answers out loud.
- [ ] 4.6 Small fixes left from the QA pass: an interrupted answer is logged as "interrupted", not
      "failed"; Vite stops re-optimising when the port changes (a 1.2 GB spike).
      Check: each re-tested and gone.
- [ ] 4.7 🧑 Owner test in a real Chrome window: "Hey AYRA" → a web question → spoken answer and
      cards; a Telegram question from the phone.
      Check: the owner's OK → merge to `main`.

**Demo:** at the desk, ask three web questions by voice; from the phone, one on Telegram.

## Phase 5 — Apps, one at a time · branch `phase-5-apps`

**Goal:** AYRA reads Gmail, Google Calendar and Google Drive again, then Notion — each added as its
own small step, so the owner sees exactly what each one adds.

**Why:** "then I wanna add tools/MCP…". These connectors already worked in Phase 2 (QA: reads ✓),
so they are the cheapest real wins, and they set the pattern every later tool follows.

**Intent check — settle:** the order · read-only until Approve exists (Phase 7) · what AYRA may do in
Notion ("whatever it wants" — in its own pages, or everywhere?).

**🧑 Owner steps:** connect Notion in claude.ai (a new integration).

- [ ] 5.1 The "add a tool" recipe, written into CLAUDE.md: gate entry + test, one persona line, the
      HUD's SYSTEMS rail, a PROGRESS line, a demo question.
      Check: 5.2 follows it step by step.
- [ ] 5.2 Gmail (read). Check: "anything important in my inbox today?" answered with cards.
- [ ] 5.3 Google Calendar (read). Check: "what's on tomorrow?" is right.
- [ ] 5.4 Google Drive (read). Check: "find my resume" opens the right file's details.
- [ ] 5.5 🧑 Notion — AYRA's notebook, with the rules agreed at the intent check.
      Check: AYRA writes a test note and finds it again.

## Phase 6 — Knows me: memory · branch `phase-6-memory`

**Goal:** AYRA remembers what matters about the owner — goals, schedule, people, preferences,
progress — across days and channels, and uses it without being reminded.

**Why:** "an intelligent central system which cares about my needs and wants and is personalized
especially for me."

**Intent check — settle:** what she remembers by herself vs only when told · what is off-limits ·
the profile's shape · Notion's role.

**🧑 Owner steps:** approve the first profile · give the timetable, gym times and deadlines once.

- [ ] 6.1 `bridge/memory.mjs` + `bridge/db.mjs`: remember / recall / forget / list on SQLite
      (`data/ayra.db`); every write audited. Check: tell a fact on Telegram, ask about it a day later
      on the HUD.
- [ ] 6.2 🧑 The owner profile in every session (stable, so it stays cached). Check: answers use it
      unprompted.
- [ ] 6.3 🧑 Timetable, gym, exam and assignment deadlines, kept current. Check: "what's next today?"
      is right.
- [ ] 6.4 Nightly reflection: the day's conversations become memory updates, sent as a short digest
      the owner can veto. Check: a vetoed item is gone.
- [ ] 6.5 Privacy controls: "forget X", export, `/memory`, a HUD view. Check: a forgotten item can't
      be recalled.
- [ ] 6.6 Nightly encrypted backup of `data/`. Check: a restore test on a copy.

## Phase 7 — Hands on the laptop, with a guardian · branch `phase-7-hands`

**Goal:** AYRA can use the laptop — her own Chrome, files, apps, keyboard and mouse — while the main
AYRA checks every action through a guardian and asks the owner before anything risky.

**Why:** the owner, 2026-10-03: "I want AYRA to take control of everything in my laptop, with a main
AYRA guardrail over it checking if it's doing anything I don't like." The Claude Chrome extension
couldn't do this: it needs a person to click "Allow" for every new site (QA #1).

**Proposed design — settled at the intent check:**
- **Hands:** AYRA's own Chrome profile, driven directly (Playwright over the DevTools protocol), so
  there is no extension and no per-site prompt; the owner signs it in once to the sites AYRA may
  use. Files only in folders the owner lists. Windows apps through UI Automation, keyboard and mouse.
- **Guardian — three locks on every action, in order:** (1) the gate's fixed rules — things AYRA never
  does (pay, enter passwords, change security settings, delete for good); (2) a separate, fast Claude
  model that reads the owner's request, the action and the owner's "things I don't like" list, and
  answers allow / block / ask; (3) the owner's Approve tap — HUD or phone — for anything that sends,
  posts, buys, deletes or can't be undone.
- **Always:** a visible "AYRA is driving" banner, a kill switch (Esc, "AYRA, stop", `/stop`), the
  audit log with a screenshot per action, and nothing read on a page or in a message can trigger an
  action by itself.

**Intent check — settle:** the first apps and sites · the "don't like" list · what may run without
Approve · which accounts AYRA's Chrome may sign into · writes on for the laptop only.

**🧑 Owner steps:** sign AYRA's Chrome into the agreed sites · write the first "don't like" list ·
test from the desk and the phone.

- [ ] 7.1 Approve / Deny on the HUD and on Telegram (`bridge/approvals.mjs`), 2 minutes without an
      answer = deny; kill switch. Check: "email X" asks first; Deny cancels; `/stop` refuses the next
      action; the audit log shows all three.
- [ ] 7.2 The guardian (`bridge/guardian.mjs`) with the owner's rules list; tested on tricky cases —
      a prompt injection on a page, a disguised delete, an off-topic purchase. Check: every tricky
      case blocked or asked; ordinary actions pass without slowing AYRA down noticeably.
- [ ] 7.3 AYRA's Chrome (`bridge/browser.mjs`): open, read, click, type, screenshot to a blade.
      Check: the college portal opened and read with nobody at the laptop.
- [ ] 7.4 Files: find, open, read, move inside the allowed folders; delete always asks. Check: "find
      my resume and show it" works; a delete waits for Approve.
- [ ] 7.5 PC control: open apps, type, click, read the screen. Check: three real tasks the owner picks.
- [ ] 7.6 Security review of hands, guardian and approvals before writes go on. Check: every finding
      fixed or accepted by the owner.

## Phase 8 — Always-on core: laptop off · branch `phase-8-core`

**Goal:** with the laptop shut, the owner messages AYRA on Telegram and she does a real daily task —
checks whether an idea already exists and replies with a verdict and sources.

**Why:** "Laptop off: I message her from my phone and she still works."

**Intent check — settle:** the host (DigitalOcean ≈ ₹1,050, my pick, or Hetzner ≈ ₹620) and paying
for it · a free Tailscale account · what a good idea-check answer looks like · three real ideas.

**🧑 Owner steps:** create the hosting account and server (paid) · install Tailscale on the laptop
and phone · log in to Claude on the server (`claude` → `/login`) · Telegram off on the laptop at
cut-over.

- [ ] 8.1 `deploy/`: setup script and steps — `ayra` user, Node 24, 2 GB swap, closed firewall,
      Tailscale, automatic updates, `systemd` service `ayra-core`. Check: restarts after a forced
      crash; no public listening ports.
- [ ] 8.2 🧑 Claude login on the server; connectors arrive. Check: smoke passes on the server.
- [ ] 8.3 `bridge/core.mjs` + `npm run core`: Telegram, brain, gate, audit, memory — no HUD; the
      laptop stops reading Telegram; a `409` alerts the owner. Check: laptop shut → Telegram answers.
- [ ] 8.4 The idea check: a verdict, 3–5 real sources, how the owner's idea could differ, a next
      step. Check: three real ideas answered with the laptop shut; the owner rates each.
- [ ] 8.5 `/status` (uptime, Claude login, today's usage, laptop online?) and an alert before the
      login expires. Check: `/status` shows the truth.
- [ ] 8.6 Move in: the laptop's `data/` copied to the server. Check: memory and `/log` work there.

## Phase 9 — Two homes, one AYRA · branch `phase-9-desk`

**Goal:** the laptop joins the cloud AYRA as her hands: same conversation and memory; laptop jobs
go to the laptop when it's on and are queued when it's off.

**Intent check — settle:** which laptop jobs may be queued · how long a queued job may wait · HUD
and Telegram as one shared conversation.

- [ ] 9.1 `bridge/link.mjs`: token, hello, heartbeat, tool calls, reconnect. Check: unit tests; cut
      the network → offline within 45 s → back by itself.
- [ ] 9.2 `bridge/desk.mjs` + `npm run desk`: the HUD socket and Phase 7's hands, served over the
      link; no Claude process on the laptop. Check: a HUD question answered by the cloud core.
- [ ] 9.3 Routing + `[Laptop: …]` stamp + `LAPTOP_OFFLINE`. Check: a laptop job works when on; when
      off AYRA says so first.
- [ ] 9.4 The laptop queue (`bridge/jobs.mjs`): runs on reconnect, result to Telegram, 7-day expiry,
      `/jobs`. Check: queue a job, open the laptop, the result arrives on the phone.
- [ ] 9.5 One conversation for HUD and Telegram, one persona with per-channel style. Check: ask on
      the HUD, continue on Telegram — she remembers.
- [ ] 9.6 🧑 The desk starts at login and restarts on crash. Check: online within a minute of a reboot.

## Phase 10 — Speaks first · branch `phase-10-proactive`

**Goal:** reminders, nudges and routines; voice notes; usage under control.

**Intent check — settle:** quiet hours · reminder style · what the morning plan and night review
contain.

- [ ] 10.1 `notify()` with quiet hours. Check: a test alert arrives; nothing in quiet hours.
- [ ] 10.2 Scheduler: reminders and routines in SQLite, managed by text. Check: "remind me at 6 pm
      to call home" fires on the phone.
- [ ] 10.3 Morning plan and night review, offered, never forced. Check: a week of real use.
- [ ] 10.4 Voice notes → text (ElevenLabs Scribe). Check: a Hinglish voice note is understood.
- [ ] 10.5 Usage meter: today's usage in `/status`, a cap for background work, a warning near the
      limits. Check: the cap pauses a background job, never the chat.

## Phase 11 — Agents: the framework and the first agent · branch `phase-11-agents`

**Goal:** the central AYRA starts, watches and judges agents; the first agent is live.

**Intent check — settle:** which agent first (guess: the DSA mentor) · its "done" · what it may do
alone vs with Approve · its schedule · its Notion pages.

- [ ] 11.1 Agent registry (`agents/<name>/`) and job runner: own sessions, statuses, `/jobs`.
- [ ] 11.2 Monitoring and evaluation: checked against "done", the owner's 👍/👎, a score per agent,
      a weekly report.
- [ ] 11.3 The first agent. Check: its own "done" checks.
- [ ] 11.4 The research agent, deep version, growing out of Phase 8's idea check.

## Phase 12 onwards — more agents, one per phase

Ranked by hours saved; each with its own intent check, terms check and demo: AI/ML and Full-stack
mentors · general helper (messages and small tasks; Gmail drafts and sends behind Approve) ·
LinkedIn (posting through the official API; anything beyond it decided with the risk written down)
· WhatsApp (no official API for personal accounts — options and ban risk decided at its intent
check) · watchers · files to the phone.

## Later — polish

- HUD on the phone over Tailscale.
- Custom "Hey AYRA" wake word and voice upgrades.
- Visual identity; background music and sound with cleared rights.
- Camera, hand gestures, the 3D reactor, clap-to-start, Kokoro: removed 2026-10-03. The code is in
  git at `70dcb46` (e.g. `git checkout 70dcb46 -- src/scene`) if any of it is wanted back.

---

## Old plan → new plan

| Old | New | Why |
|---|---|---|
| 4.1–4.6 Always-on core | Phase 8 | The owner asked for a clean interface first; the cloud moves after apps, memory and hands |
| 4.7 QA small fixes | 4.6 (#5, #7); #3, #4, #6 done in 4.1–4.3 | — |
| 4.8 Avatar face | 4.1 ✅ | — |
| 5.1–5.7 Two homes | Phase 9 (5.7 voice test → 4.7) | Same design; laptop hands are built first, in Phase 7 |
| 6.1–6.5, 6.7 Memory | Phase 6 | Same; Notion (6.6) moves to 5.5 |
| 7.1 Approvals, 7.6 kill switch | 7.1 | Needed before AYRA gets hands |
| 7.2–7.5, 7.7 | Phase 10 | Reminders, notify, morning plan, voice notes, usage meter |
| 7.8 Security review | 7.6 | Before writes go on |
| 8.1–8.4 Agents | Phase 11 | Same |
| 9+ PC control | Phase 7, with the guardian | The owner's new ask |
| Later: camera, gestures, music, clap | Removed, recoverable from git | The owner's cleanup |

Nothing the owner asked for is dropped.

## Decisions

| ID | Question | Status |
|---|---|---|
| Q1 | How should AYRA address you? | ✅ "boss" (2026-10-02) |
| Q2 | AYRA's voice? | ✅ ElevenLabs Lily `pFZP5JQG7iQjIQuC4Bku`; excited, a little flirty |
| Q3 | Model? | `claude-opus-5-5`, effort `medium` today; revisited with numbers in 4.4 (speed) |
| Q4 | Telegram as the phone channel? | ✅ @Ayra_rehan_bot, account "Starboy" |
| Q5 | Voice-note transcription? | ✅ ElevenLabs Scribe |
| Q6 | Keep the laptop awake while out? | ✅ No — the cloud core will be always on |
| Q7 | Which connectors? | Off since 2026-10-03; back one at a time in Phase 5 |
| Q8 | Clean interface (2026-10-03) | ✅ avatar only · cards on screen · browser voice as fallback · Telegram web-only · short README · interview in git · Phase 4 · repo public |
| D1 | Cloud host | Open — Phase 8 intent check (costs money) |
| D2 | Tailscale account | Open — Phase 8 |
| D3 | What each tool and agent may do alone | Open — at each intent check |
| D4 | LinkedIn beyond posting, WhatsApp | Open — at their intent checks, risks written down |
| D5 | Guardian rules and hands scope | Open — Phase 7 intent check |

## Risks

| Risk | What we do |
|---|---|
| Lag makes AYRA tiring to use | 4.4 measures every turn type; speed is part of each phase's demo |
| Pro limits shared with the owner's own Claude use | Usage meter, a cap for background work, cheaper models for agents and the guardian |
| AYRA does something on the laptop the owner didn't want | Gate + guardian + Approve + kill switch + audit with screenshots (Phase 7) |
| Prompt injection (pages, mail, messages) | Content never triggers an action; the guardian and Approve sit in front of every effect |
| ElevenLabs free credits run out | Browser voice and recogniser take over (4.5) |
| Claude login expires on the server | Early warning on Telegram + renewal steps (8.5) |
| Anthropic's terms change | Switch to an API key with one setting; terms checked at every phase demo |
| LinkedIn / WhatsApp automation breaks their terms | Official routes first; anything else only with the owner's OK and the risk written down |
