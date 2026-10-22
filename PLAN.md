# PLAN.md — AYRA roadmap

What the owner wants (**Vision**), how it fits together (**Target architecture**), and the build
order from the first commit to the last agent. Rules are in [CLAUDE.md](CLAUDE.md); the log is in
[PROGRESS.md](PROGRESS.md).

**Every phase runs the same way:** intent check (restate the goal in 3–5 bullets, settle the open
points, wait for "go") → tasks, each done when its **Check** passes (tick `[x]` + one PROGRESS.md
line) → a short demo the owner can try from the phone → merge after the owner's OK. 🧑 = the owner
does this step; they get click-by-click instructions when it comes up.

**Where we are:** Phase 5 — Light AYRA with hands on the laptop. Done: live hearing, the ask-first
rules, light mode, Approve + kill switch, shell and files, her Chrome, Windows apps, always ready
(tray app, starts with Windows, hotkey). Next: the owner's setup and demo (5.8), then Phase 6 —
autonomy.

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

## Phase 4 — Clean interface · branch `phase-4-clean` ✅ (owner, 2026-10-04: "working very well")

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
- [x] 4.4 Speed — no lag. `npm run bench` times five standard questions. Cut: web tools loaded up
      front (no ToolSearch hop), effort `low` (Opus 5.5 kept — Sonnet 5.5 measured no faster), the
      bridge puts search sources on screen itself the moment a search returns (`sources.mjs`, no
      card for the model to write), boot 9.2 s → 2.4 s.
      Check ✓: chat first word 1.6 s, date 0.9 s, quick search 8.9 s (sources on screen 7.1 s), read
      a page 5.1 s; "put it on screen" 16.1 s — Opus still draws its own card when asked outright.
- [x] 4.5 Hearing in English: Scribe was guessing Hindi and writing "Hey AYRA" in Devanagari, so on
      standby she ignored everything. Check ✓: a spoken clip comes back as English and wakes her.
- [x] 4.7 🧑 Owner test in Chrome: "working very well and efficient… no stucking and stopping".
- Moved on: 4.4b a faster search API (a new account) → Later · 4.6 the two QA leftovers → 5.9.

## Phase 5 — Light AYRA with hands on the laptop · branch `phase-5-hands` ← current

**Goal:** AYRA runs light on the owner's laptop and works like a second pair of hands: her own
Chrome (the one the owner browses in), files, apps and PowerShell — doing everything herself except
four things she asks about first.

**Why:** the owner, 2026-10-03/04: "I want the ayra to take control of everything in my laptop with a
main AYRA guardrail over it", "I wanna automate everything I do… an intelligent working version of
me", and "keep ayra very light so that I can use her in my laptop" — no cloud budget for now.

**Intent check:** done (2026-10-03/04). Full control, answer "a": everything runs except spending
money, sending or posting as the owner, deleting for good, passwords and security settings — those
ask (Approve on the HUD, by voice, or on Telegram); a kill switch (Esc, "AYRA, stop", `/stop`). Light
first ("1 yes"); one Chrome for both, her window is the owner's daily Chrome ("2a"); the brain sleeps
after 10 idle minutes ("3 yes"). Claude Code may run AYRA's tests here ("allow it"). The app and site
lists come in later phases.

**🧑 Owner steps:** Windows microphone access for desktop apps · pin "AYRA" and "Chrome (AYRA)" to
the taskbar · allow the microphone once in her window · sign in to "Chrome (AYRA)" once (Google sync
brings bookmarks and saved passwords) · the trusted-sites list for microphone and camera · try Approve
and the kill switch · for always-on: plugged in, closing the lid does nothing, never sleep.

- [x] 5.1 Live hearing: speech detected on the audio thread (works with her tab in the background),
      words streamed from ElevenLabs Scribe Realtime, a minute of conversation without the wake word,
      browser fallback when ElevenLabs refuses. Check ✓: virtual-mic test — question 0.9 s after the
      speaker stops, answer starts 2.5 s; the owner: "answers quickly, no stucking".
- [x] 5.2 The ask-first rules: `gate.review()` — allow / deny / ask per call, from fast rules over
      commands, file paths and page actions. Check ✓: 8 tests, 72/72.
- [x] 5.3 Light: `npm start` serves the built face from the bridge (one 85 MB process, no dev server;
      `npm run start:dev` for face work), the brain sleeps after 10 idle minutes and the face wakes it
      the moment speech starts, the HUD no longer re-renders per voice level, a "still" switch (L), and
      the bridge listens on the laptop only (it was reachable from the Wi-Fi). Check ✓: brain 204 MB
      awake → 0 asleep; first answer after a nap 3.2 s with the pre-wake (3.4 s awake); voice loop on
      the production build: question 0.87 s, answer 2.4 s. Her app window moves to 5.6 (one Chrome).
- [x] 5.4 Approve and the kill switch: `bridge/approvals.mjs` (6 tests); a Yes/No card on the HUD (Y/N
      keys, or say "yes"/"no" — her own voice asks), Yes/No buttons on Telegram (5 tests), 2 minutes
      without an answer = no; Esc / `/stop` decline everything waiting and stop every turn. Check ✓:
      a delete asked, No kept the file, Yes deleted it; the kill switch declined a waiting Approve and
      stopped a 30 s task at 5 s ("Stopped."); the audit log records each.
- [x] 5.5 Shell and files: PowerShell, Read/Glob/Grep/Write/Edit, writes on (`AYRA_ALLOW_WRITES=0`
      turns it off); every call reviewed by the gate. A conversation saved under other tools or
      instructions is not resumed — she kept saying "the laptop isn't connected" from an old session.
      Check ✓: "which programs use the most memory" answered via PowerShell; a file created; a delete
      asked first.
- [x] 5.6 Her Chrome: `bridge/browser.mjs` (`ayra_browser`, puppeteer-core) attaches to "Chrome
      (AYRA)" — its own profile, port 9222 on 127.0.0.1 — and starts it if needed: tabs, open, read
      (text + numbered pressables), click, type, press, scroll, back, close, screenshot to a blade, site
      permissions (trusted sites at once, others ask). Every click / submit / Enter is checked with the
      element's real label. `npm run shortcuts` makes "AYRA" (one click: start + app window, mic granted)
      and "Chrome (AYRA)". Check ✓: opened and read example.com, closed the tab; a "Buy now" click asked
      ("spends money") and No left it unclicked. The owner's own portal waits for their sign-in (5.8).
- [x] 5.7 Windows apps: `bridge/apps.mjs` (`ayra_apps`) + `bridge/apps.ps1`, Windows' own UI
      Automation through one PowerShell worker (starts on first use, closes after 5 idle minutes, no
      new dependency): list, read (text + numbered controls), open by Start-menu name, focus, click
      (several in one go), type, press keys, close; each action reports what changed. Ask-first:
      `gate.riskOfAppAction` (the four kinds, plus security windows and switches, Enter-to-send,
      Shift+Delete). Secrets: a call naming `.env*` (not `.env.example`), Claude's credentials, `.ssh`
      or Chrome's password store is refused outright, a window showing one is not read, and key-shaped
      text is blanked in window and page reads. Check ✓: Calculator 12×7 = 84 by its buttons (20 s),
      Bluetooth state from Settings (18 s), Downloads in File Explorer (19 s), a two-line note in a new
      Notepad tab beside the owner's `.env.local` tab, which stayed unread (21 s); Windows Security asked
      first and No left it unclicked. Bench before/after the same evening: no measurable change.
- [ ] 5.8 🧑 Setup and demo: the owner's steps above, then a live run at the desk and from the phone.
- [x] 5.9 Leftovers: an interrupted answer is "Stopped." and logged as `interrupted`, not a failure;
      no Vite re-optimising in daily use (gone with 5.3).
- [x] 5.10 Always ready (the owner's "2a" and "4a", 2026-10-05): AYRA.exe (`desktop/ayra.cs`), a tray
      app built by `npm run shortcuts` with the C# compiler that ships with Windows — starts with
      Windows, keeps the bridge running in the background with no console window (restarts it if it
      stops, output in `data/logs/console.log`), opens her window from the tray, the Desktop, the Start
      menu or the taskbar, and Ctrl+Alt+A brings her forward and starts a turn. Her window sits under
      AYRA's own taskbar icon; her own icon (`public/favicon.svg` → `desktop/ayra.ico`). Built into
      `desktop/bin/`. Reviewed from three angles; the 14 confirmed findings fixed — the big ones: stopping
      her no longer kills her Chrome, the tray never inherits a shell's settings, her own window and
      Approve card are out of reach of her tools, and changing her own code or settings asks.
      Check ✓: built and installed; the bridge started hidden; a shortcut click opened her window with
      AYRA's taskbar id; the hotkey brought it to the front and her page got exactly one Space → LISTENING;
      a quit stopped her in ~1 s with Chrome untouched; she came back from the Startup shortcut.
- [x] 5.11 The owner's feedback after setup (2026-10-06), decided overnight on their behalf:
      push-to-talk — Space listens, Space again sends, Space Space stops; no wake word, no follow-up
      window, no voice barge-in, the microphone handed back 30 s after a turn (an open mic heard videos
      in other tabs and answered them). The conversation on its own dark panel (white text took on her
      colours). Cards docked on the right, as tall as what they hold, closing by themselves after 40 s
      (hover holds them, Keep keeps them), and she steps aside while one is open.
      Check ✓: a fake microphone looping "What is two plus two?" — ignored for 8 s on standby, one Space
      → one turn ("Four, boss") → standby, 9 s more of the loop ignored; Space Space stopped a turn.

## Phase 6 — Autonomy on the laptop · branch `phase-6-autonomy`

**Goal:** AYRA does whole jobs on her own — asked at the desk or from the phone, with the laptop's
lid closed — and stops only for the four ask-first things; sending and posting can be allowed ahead
of time, site by site.

**Why:** the owner, 2026-10-05: "I'm building AYRA so that I can do 99 percent things I do… maximum
permissions and authority… even with laptop shut and within phone if I say go to the x website and do
some task… it has to just perform it." Answers: 1a (keep the four asks, add "Always allow here" for
sending/posting) · 2a (the laptop is her always-on home for now) · 3b (the cloud waits for budget) ·
4a (app window + tray + hotkey — done in 5.10).

**Intent check — settled overnight on the owner's behalf (2026-10-07, "I give you the freedom"; for
review):** nothing is allowed ahead of time until the owner presses "Always" on a real ask — no list
made up front · "Always" covers sending/posting only, on one website or in one app; never money,
deleting for good or passwords, and never a PowerShell command (too broad to allow ahead) · AYRA can
list and take back allowances, never add one · a background job (6.2) gets at most 30 minutes and
60 tool steps, reports the result with a screenshot rather than every step, and an unanswered ask is
still a no after 2 minutes.

**🧑 Owner steps:** laptop plugged in; Control Panel → Power Options → "Choose what closing the lid
does" → Plugged in: Do nothing; sleep when plugged in: Never; Settings → Accounts → Sign-in options →
"Use my sign-in info to automatically finish updating" (so she restarts after updates); sign in to
everyday sites in "Chrome (AYRA)".

- [x] 6.1 "Always allow here": a third choice on the Approve card (A) and on Telegram — sending or
      posting on this site / in this app goes ahead from now on; never for money, passwords or deleting
      for good. `bridge/allowances.mjs` (kept in `data/state.json`), `bridge/rules.mjs` (`ayra_rules`:
      rules_list, rules_forget — no add), Telegram `/rules` and `/forget N`.
      Check ✓: a "Post" on example.com asked with "Always on example.com", answered Always; the next
      "Post" went ahead without asking; taken back afterwards. Found on the way: with the laptop idle
      (display off) Chrome dropped her mouse clicks without a word — clicks are now checked and, if
      dropped, pressed from inside the page (both Posts landed exactly once).
- [x] 6.2 Background jobs (`bridge/jobs.mjs`, `ayra_jobs`: jobs_start — writes on only — jobs_status,
      jobs_stop): "go to X and do Y, then Z" runs to the end in its own conversation, one at a time, 30
      minutes / 60 steps at most; started, every 3 minutes and finished on Telegram, with a screenshot
      when it ends on a site or in an app; `/jobs`, `/stop`. Check ✓ (test copy): a two-site task asked
      "in the background" was handed off in 7.9 s, answered "6 × 7" meanwhile in 3 s, and the job finished
      both sites in 4 steps (~25 s), closing its tabs. The owner's phone check is in 6.5.
- [x] 6.3 "Show me": browser_screenshot and the new apps_screenshot (PrintWindow — works behind other
      windows and with the display off) go on the HUD, or to the owner's phone when asked on Telegram;
      a window of secrets is never pictured. Check ✓: Calculator pictured in 0.35 s, display off.
- [x] 6.4 Through the day: Telegram keeps retrying a dead network (also at sign-in) and its long poll
      gives up on a dead connection after 65 s; "I'm back" on Telegram after 15+ minutes off or asleep
      (`bridge/presence.mjs`); sleep when plugged in is Never (checked). Still to see live: a Wi-Fi drop
      and a restart (6.5).
- [ ] 6.5 🧑 Demo: jobs from the phone with the lid closed.

## Research agent · branch `research-agent` (redesigned 2026-10-08 to the owner's spec)

**Goal (the owner):** "rank my queries" — simple ones get one quick search (no extra tokens); a
clearly complex one is split into 3–4 parts, one sub-agent per part searches and reports, a reviewer
scores, removes duplicates and checks relevance to the original question. On screen: exactly two
result cards — a **data card** (the figure itself: "price of gold" shows a number) and a **sources
card** (only the sources used, clickable) — on every web answer, research or not; a small progress
card while research runs.

**Architecture:** `bridge/triage.mjs` ranks the owner's own words in code (0–10, no model call);
only *complex* questions carry a depth line to the brain and are admitted by the `research` tool.
`bridge/research.mjs`: rank → split (planner) → per part, all at once: search agent → pages read in
code (net.mjs, injection scan) → report agent (exact quotes) → review (main model: relevance,
duplicates, data) → code checks every figure against the page (`trust.mjs` numbersIn /
supportsNumbers, sameFact). At most 10 Claude calls, 180 s. Ordinary web answers: `show_data`
(panels.mjs) after she speaks, numbers checked against the search results; the bridge emits the one
sources card per turn (sources.mjs).

- [x] R.1 Engine: rank / split / agents / review, limits, kill switch, cache + offline, audit.
- [x] R.2 Trust: source kinds and trust, injection scan, quote check, number check, duplicate check.
- [x] R.3 Face: progress card, data card, sources card (clickable), docked column, stale cards dropped.
- [x] R.4 Wiring: triage on HUD / Telegram / jobs, explicit gate names, `show_data`, persona.
- [x] R.5 CLI + tests: `npm run research -- "question"`; 301 tests.
- [x] R.6 Live check (2026-10-11): gold price → data card ₹1,51,420 / 10 g + 2 sources, no research;
      iPhone 17 vs Pixel 10 → complex 8/10, 4 agents + reviewer, 10 calls, 53 s, 40 % confidence.
- [ ] R.7 Page reading: many sites refuse the bridge's fetch (1 of 9 pages read on two parts) —
      read the blocked ones through her Chrome, or prefer sources that allow reading.
- [x] R.8 Ordinary answers: she sometimes draws the data card before speaking (17.9 s to the first
      word on the gold price); measure with `npm run bench`, nudge or restructure.
- [ ] R.9 The adversarial review the usage limit cut off; the owner's OK to merge.

## Hybrid hearing · branch `research-agent` (2026-10-11)

**Goal (the owner):** keep Space (it works well), and add a way to talk while working in other
apps: say "AYRA" from anywhere, she listens, answers and waits for the next command — and she must
not answer Spotify or videos playing out loud.

**Architecture:** while hands-free is on, the face's speech detector sends only a short burst (≤ 2.5 s)
of speech that began after a quiet moment, and nothing while the room stays busy (music, video), to
the bridge's `/wake` socket; ElevenLabs Scribe, with her name as a key term, says what was said, and
`wake.ts` decides if it was her name spoken to her (capped at 120 checks an hour). Then the turn
starts from where that burst began. After an answer she listens 15 s for a follow-up. Whatever is
playing pauses while she listens and resumes after (Windows media controls, `media.mjs`). W,
Ctrl+Alt+W or the tray menu switch hands-free; Ctrl+Alt+Space is Space from any app (tray `/talk`).
First tried fully offline (sherpa-onnx keyword spotting, a 20M streaming recogniser, Whisper tiny):
all caught test voices but none caught the owner's own "Hey Aira" — dropped.

- [x] H.1 Name check: `bridge/wake.mjs` (bursts → Scribe + key term, hourly cap), worklet bursts and busy-room gate.
- [x] H.2 Face: `listen.ts`, `voice.ts` handsFree / wake from the burst, App follow-up, name-only = just listen.
- [x] H.3 Switches: W, the tray menu and Ctrl+Alt+W (`/hearing`), Ctrl+Alt+Space (`/talk`), the HUD status line.
- [x] H.4 Music pauses while she listens (`media.mjs` / `media.ps1`).
- [x] H.5 The owner's own recorded "Hey Aira" (fake microphone, real face and bridge): woke on the first
      one, listened for the command, back to standby; Spotify's lyrics come back as "[background music]".
- [ ] H.6 🧑 Live, in the room: say "AYRA" from another app with and without music playing.

## Overnight work · branch `researcher-mode` (2026-10-12, built on `research-agent`)

**Goal (the owner, 2026-10-12):** researcher mode on R — reason over the question, sub-agents search
Reddit, Quora, GitHub and other high-relevance platforms, the results scored for relevance, a
finalised answer — with normal AYRA kept as it is; AYRA faster at opening and clicking, with full
control of the laptop; she must not answer sound from Chrome or other apps; less latency everywhere.
The owner was asleep and asked for the recommended decisions, reported in the morning.

- [x] O.1 Researcher mode: `deep.mjs` (a planner at high effort → one lane per platform → rank → a
      final cited answer), `platforms.mjs` (GitHub, Stack Exchange, Hacker News and arXiv through
      their public APIs; Quora and the web through WebSearch limited by allowed_domains); the face's R
      key, RESEARCHER badge and board (lanes, ranked results with 0–100 scores). Live: 65 s, 9 calls.
- [ ] O.1b 🧑 Reddit: Anthropic's web search refuses reddit.com, so the lane says so. Searching it needs
      Reddit's own API — a free "script" app on the owner's Reddit account.
- [x] O.2 Sound from the laptop's speakers is not the owner: `meter.ps1` + `echo.mjs` drop a hands-free
      burst that matches what the speakers played. Live, real microphone: "Hey AYRA" from a laptop app,
      from another Chrome and the owner's own recording through the speakers all woke her before, none after.
- [x] O.3 Fast path (`fastpath.mjs`): open an app, a site or a folder, and pause/play/next/previous,
      done in code — 1.0–1.9 s instead of ~7 s through the brain.
- [x] O.4 Latency (the audit of 2026-10-12): the data card as a `<data>` tag after the spoken answer
      (R.8), a keep-alive ElevenLabs socket, quicker browser clicks that hand back the page, TTS one
      sentence ahead, no 6 s stall after a cough, a one-breath "Hey AYRA, …" ends sooner, the brain
      woken on the press, no claude.ai connectors started, filler lines cached, the apps worker warm.
- [ ] O.5 🧑 Whole-screen control (see the screen as a picture, click and type anywhere): a safety check
      stopped it being built. The owner sets the scope — which apps, which actions run without Approve.
- [ ] O.6 🧑 Live in the room: hands-free with a video playing; R and a real question.

## The bubble and hands-free from evidence · branch `researcher-mode` (2026-10-13)

**Goal (the owner, 2026-10-13):** hands-free works but sometimes doesn't respond or start listening.
Decided with the owner: both — a small AYRA bubble on top of every app (a click is always heard,
the owner's app stays in front), and hands-free fixed from evidence rather than guesses. The talk
hotkey becomes Alt+Space.

- [x] B.1 The bubble (desktop/ayra.cs `Bubble`, `Caption`): always on top, never takes the focus, draggable
      (remembered), a click is Space (`/talk`), double click stops everything, right-click: hands-free, her
      window, hide; glows by phase (cyan standby, blue listening, amber thinking, pink speaking), flashes when
      hands-free hears her name; one caption line (your words grey, hers white, newest words kept); out of the
      way of full-screen apps. State: the face reports `face {phase,text,who,by}` (src/lib/glance.ts), the
      tray polls `GET /face`.
- [x] B.2 The hearing log: every burst (sent or skipped, the speaker verdict, Scribe's words and time) and the
      face's verdict, as "hearing" lines in the day's audit log.
- [x] B.3 Music pause no longer pauses her own window (AYRA.Desk) — it could cut her greeting or reply.
- [x] B.4 Speaker filter: the owner talking over a video is kept (much louder than the speakers explain),
      unless the match is strong (≥ 0.70).
- [x] B.5 Talk hotkey Alt+Space (AYRA_TALK_HOTKEY); AYRA_BUBBLE=off turns the bubble off.
- [x] B.6 Hands-free switched off at the owner's word (2026-10-18: "not working efficiently; Space in her window, Alt+Space elsewhere"): AYRA_HANDSFREE=on brings it back.
- [x] B.7 The bubble is her figure (the owner: "exactly her figure"): scripts/figure.mjs photographs the avatar in each pose (sleep, idle, listen, think, magic, talk open/shut) on a transparent background; the tray shows the pose for her phase, her mouth moving while she talks.
- [x] B.8 A task is answered with one word (the owner, 2026-10-18: "only yes, done, opened, created, and a small
      message if there is trouble"): bridge/spoken.mjs holds a task's first sentence and says "Created." /
      "Opened." / "Sent." / "Done." for it (her sentence goes to the log), unless it reports trouble or asks
      something; the tool filler is just "Yes.", the fast path says "Opened.".
- [x] B.9 The minute after every answer: she keeps listening 60 s, but only a sentence that starts with
      "AYRA" counts (wake.ts followUpVerdict); anything else — TV, people, noise — is ignored and kept off
      screen; just her name → "Yes?"; music isn't held paused; Space / Alt+Space / a click then is a normal turn.
- [x] B.10 Hearing that doesn't cut the owner off: back from the browser recogniser by itself (on the next press
      after 2 min), more patience before a command counts as finished (a full stop on a pause no longer ends it),
      the browser recogniser waits 1.4 s. The new ElevenLabs key checked: voice and hearing allowed.
- [x] B.11 More instant commands (fast path): "stop it" / "pause" when music plays, volume up / down / mute,
      "play X" (YouTube, first result playing), "play X on Spotify" (search + its Play button, confirmed by
      Windows' media controls), "search X on YouTube / Google", "close X", several in one breath.

## Listening and latency, before the hands work · branch `researcher-mode` (2026-10-20)

**Goal (the owner, 2026-10-20):** "after the first command, for the second she keeps listening and
doesn't respond … test her overall, her listening and responding latency, and reduce it as much as
possible … the bubble won't come back … remove INITIALISE: when AYRA opens she should come and
listen … research today's voice agents and pick the pattern that suits AYRA."

- [x] L.1 `npm run voicetest`: her ears to her voice, for real — a test bridge, her built face and a
      Chrome of its own whose microphone plays recorded lines on cue; each line timed from the end of
      speech (segment closed, words back, question sent, first words, voice, done) and checked (answered,
      or ignored when it should be).
- [x] L.2 No INITIALISE: she boots by herself (the boot animation, the bridge and the voice probe at once)
      and listens as soon as she is up; her window plays sound without a click
      (`--autoplay-policy=no-user-gesture-required`).
- [x] L.3 The bubble always comes back: hiding it lasts until AYRA starts again or her window is opened,
      and says how to bring it back.
- [x] L.4 Not cut off mid-command: a question mark the transcriber puts on a pause after "times", "plus",
      "the", "and" … no longer ends the turn (src/lib/endpoint.ts, tested).
- [x] L.5 The minute after an answer: "Ira, …", "Arya, …", "Era, …" at the start count as her name there
      (how "eye-ra" is often written), and something said without her name gets a hint on screen and on
      the bubble ("Start with "AYRA", or press Space") instead of silence.
- [x] L.6 Faster: the segment closes at a 0.3 s pause when the words already read as finished (not 0.7 s);
      her first clause is spoken before its sentence ends. Measured and left alone: the model (Opus,
      Sonnet and Haiku all ~1.5 s to the first word) and thinking (switched off it still shows a ~0.1 s
      block) — the brain's wait is the API's own time to first token, 1.4–4.7 s from call to call.
- [ ] L.7 Decide with the owner (research, 2026-10-20): a semantic end-of-turn model (Smart Turn v3,
      open source, reads the voice's intonation) and preemptive generation (the brain starts on the held
      words, its tools and voice held until the turn is confirmed); and whether the minute after an
      answer keeps "AYRA …" only or gets a short no-name window first.

## Phase 7 — Apps, one at a time · branch `phase-7-apps`

**Goal:** AYRA reads Gmail, Google Calendar and Google Drive again, then Notion — each added as its
own small step, so the owner sees exactly what each one adds.

**Why:** "then I wanna add tools/MCP…". These connectors already worked in Phase 2 (QA: reads ✓),
so they are the cheapest real wins, and they set the pattern every later tool follows.

**Intent check — settle:** the order · what may run without Approve (sending mail asks — Phase 5's
rules) · what AYRA may do in Notion ("whatever it wants" — in its own pages, or everywhere?).

**🧑 Owner steps:** connect Notion in claude.ai (a new integration).

- [ ] 7.1 The "add a tool" recipe, written into CLAUDE.md: gate entry + test, one persona line, the
      HUD's SYSTEMS rail, a PROGRESS line, a demo question.
      Check: 7.2 follows it step by step.
- [ ] 7.2 Gmail. Check: "anything important in my inbox today?" answered with cards.
- [ ] 7.3 Google Calendar. Check: "what's on tomorrow?" is right.
- [ ] 7.4 Google Drive. Check: "find my resume" opens the right file's details.
- [ ] 7.5 🧑 Notion — AYRA's notebook, with the rules agreed at the intent check.
      Check: AYRA writes a test note and finds it again.

## Phase 8 — Knows me: memory, and teach mode · branch `phase-8-memory`

**Goal:** AYRA remembers what matters about the owner — goals, schedule, people, preferences,
progress — and learns the tasks they repeat: shown once, she does them on command or on a schedule.

**Why:** "an intelligent central system which cares about my needs and wants and is personalized
especially for me" · "I wanna automate everything I do".

**Intent check — settle:** what she remembers by herself vs only when told · what is off-limits ·
the profile's shape · Notion's role · the first tasks to teach her.

**🧑 Owner steps:** approve the first profile · give the timetable, gym times and deadlines once ·
teach her the first tasks.

- [ ] 8.1 `bridge/memory.mjs` + `bridge/db.mjs`: remember / recall / forget / list on SQLite
      (`data/ayra.db`); every write audited. Check: tell a fact on Telegram, ask about it a day later
      on the HUD.
- [ ] 8.2 🧑 The owner profile in every session (stable, so it stays cached). Check: answers use it
      unprompted.
- [ ] 8.3 🧑 Timetable, gym, exam and assignment deadlines, kept current. Check: "what's next today?"
      is right.
- [ ] 8.4 Teach mode: "watch me" — AYRA records the steps of a task the owner does once (or is told
      them), saves it as a named routine, and replays it on command. Check: three of the owner's real
      tasks taught and replayed.
- [ ] 8.5 Nightly reflection: the day's conversations become memory updates, sent as a short digest
      the owner can veto. Check: a vetoed item is gone.
- [ ] 8.6 Privacy controls: "forget X", export, `/memory`, a HUD view. Check: a forgotten item can't
      be recalled.
- [ ] 8.7 Nightly encrypted backup of `data/`. Check: a restore test on a copy.

## Phase 9 — Always-on core: laptop off · branch `phase-9-core` — when the owner has the budget

**Goal:** with the laptop shut, the owner messages AYRA on Telegram and she does a real daily task —
checks whether an idea already exists and replies with a verdict and sources.

**Why:** "Laptop off: I message her from my phone and she still works."

**Intent check — settle:** the host (DigitalOcean ≈ ₹1,050, my pick, or Hetzner ≈ ₹620) and paying
for it · a free Tailscale account · what a good idea-check answer looks like · three real ideas.

**🧑 Owner steps:** create the hosting account and server (paid) · install Tailscale on the laptop
and phone · log in to Claude on the server (`claude` → `/login`) · Telegram off on the laptop at
cut-over.

- [ ] 9.1 `deploy/`: setup script and steps — `ayra` user, Node 24, 2 GB swap, closed firewall,
      Tailscale, automatic updates, `systemd` service `ayra-core`. Check: restarts after a forced
      crash; no public listening ports.
- [ ] 9.2 🧑 Claude login on the server; connectors arrive. Check: smoke passes on the server.
- [ ] 9.3 `bridge/core.mjs` + `npm run core`: Telegram, brain, gate, audit, memory — no HUD; the
      laptop stops reading Telegram; a `409` alerts the owner. Check: laptop shut → Telegram answers.
- [ ] 9.4 The idea check: a verdict, 3–5 real sources, how the owner's idea could differ, a next
      step. Check: three real ideas answered with the laptop shut; the owner rates each.
- [ ] 9.5 `/status` (uptime, Claude login, today's usage, laptop online?) and an alert before the
      login expires. Check: `/status` shows the truth.
- [ ] 9.6 Move in: the laptop's `data/` copied to the server. Check: memory and `/log` work there.

## Phase 10 — Two homes, one AYRA · branch `phase-10-desk`

**Goal:** the laptop joins the cloud AYRA as her hands: same conversation and memory; laptop jobs
go to the laptop when it's on and are queued when it's off.

**Intent check — settle:** which laptop jobs may be queued · how long a queued job may wait · HUD
and Telegram as one shared conversation.

- [ ] 10.1 `bridge/link.mjs`: token, hello, heartbeat, tool calls, reconnect. Check: unit tests; cut
      the network → offline within 45 s → back by itself.
- [ ] 10.2 `bridge/desk.mjs` + `npm run desk`: the HUD socket and Phase 5's hands, served over the
      link; no Claude process on the laptop. Check: a HUD question answered by the cloud core.
- [ ] 10.3 Routing + `[Laptop: …]` stamp + `LAPTOP_OFFLINE`. Check: a laptop job works when on; when
      off AYRA says so first.
- [ ] 10.4 The laptop queue (`bridge/jobs.mjs`): runs on reconnect, result to Telegram, 7-day expiry,
      `/jobs`. Check: queue a job, open the laptop, the result arrives on the phone.
- [ ] 10.5 One conversation for HUD and Telegram, one persona with per-channel style. Check: ask on
      the HUD, continue on Telegram — she remembers.
- [ ] 10.6 🧑 The desk starts at login and restarts on crash. Check: online within a minute of a reboot.

## Phase 11 — Talks like a person, and speaks first · branch `phase-11-proactive`

**Goal:** real-time conversation (she starts speaking while still thinking, quicker turn-taking,
natural interruptions); reminders, nudges and routines; voice notes; usage under control.

**Intent check — settle:** quiet hours · reminder style · what the morning plan and night review
contain.

- [ ] 11.0 Real-time conversation: streamed speech both ways, shorter end-of-turn wait, a filler while
      a tool runs that sounds like her, interruption mid-word. Check: the owner says it feels like a
      person.
- [ ] 11.1 `notify()` with quiet hours. Check: a test alert arrives; nothing in quiet hours.
- [ ] 11.2 Scheduler: reminders and routines in SQLite, managed by text. Check: "remind me at 6 pm
      to call home" fires on the phone.
- [ ] 11.3 Morning plan and night review, offered, never forced. Check: a week of real use.
- [ ] 11.4 Voice notes → text (ElevenLabs Scribe). Check: a Hinglish voice note is understood.
- [ ] 11.5 Usage meter: today's usage in `/status`, a cap for background work, a warning near the
      limits. Check: the cap pauses a background job, never the chat.

## Phase 12 — Agents: the framework and the first agent · branch `phase-12-agents`

**Goal:** the central AYRA starts, watches and judges agents; the first agent is live.

**Intent check — settle:** which agent first (guess: the DSA mentor) · its "done" · what it may do
alone vs with Approve · its schedule · its Notion pages.

- [ ] 12.1 Agent registry (`agents/<name>/`) and job runner: own sessions, statuses, `/jobs`.
- [ ] 12.2 Monitoring and evaluation: checked against "done", the owner's 👍/👎, a score per agent,
      a weekly report.
- [ ] 12.3 The first agent. Check: its own "done" checks.
- [ ] 12.4 The research agent, deep version, growing out of Phase 9's idea check.

## Phase 13 onwards — more agents, one per phase

Ranked by hours saved; each with its own intent check, terms check and demo: AI/ML and Full-stack
mentors · general helper (messages and small tasks; Gmail drafts and sends behind Approve) ·
LinkedIn (posting through the official API; anything beyond it decided with the risk written down)
· WhatsApp (no official API for personal accounts — options and ban risk decided at its intent
check) · watchers · files to the phone.

## Later — polish

- A faster web search API (was 4.4b) — a new account and key; saves ~5 s per search.
- HUD on the phone over Tailscale.
- Custom "Hey AYRA" wake word and voice upgrades.
- Visual identity; background music and sound with cleared rights.
- Camera, hand gestures, the 3D reactor, clap-to-start, Kokoro: removed 2026-10-03. The code is in
  git at `70dcb46` (e.g. `git checkout 70dcb46 -- src/scene`) if any of it is wanted back.

---

## Old plan → new plan

| Old | New | Why |
|---|---|---|
| 4.1–4.6 Always-on core | Phase 9 | The owner asked for a clean interface first; the cloud moves after apps, memory and hands |
| 4.7 QA small fixes | 4.6 (#5, #7); #3, #4, #6 done in 4.1–4.3 | — |
| 4.8 Avatar face | 4.1 ✅ | — |
| 5.1–5.7 Two homes | Phase 10 (5.7 voice test → 4.7) | Same design; laptop hands are built first, in Phase 5 |
| 6.1–6.5, 6.7 Memory | Phase 8 | Same; Notion (6.6) moves to 7.5 |
| 7.1 Approvals, 7.6 kill switch | 5.4 ✅ | Needed before AYRA gets hands |
| 7.2–7.5, 7.7 | Phase 11 | Reminders, notify, morning plan, voice notes, usage meter |
| 7.8 Security review | 5.2 ✅, 5.7 ✅ (ask-first rules, secrets guard) | Before writes go on |
| 8.1–8.4 Agents | Phase 12 | Same |
| 9+ PC control | Phase 5, with the ask-first rules | The owner's new ask (2026-10-03) |
| Hands (old Phase 7) | Phase 5 | Full laptop control first; the cloud waits for budget (2026-10-04) |
| Apps, memory (old 5, 6) | Phases 7, 8 | After the hands and autonomy; teach mode added to memory |
| — | Phase 6 Autonomy (new) | The owner, 2026-10-05: AYRA does "99 percent" of what they do, from the phone too, with maximum autonomy |
| Later: camera, gestures, music, clap | Removed, recoverable from git | The owner's cleanup |

Nothing the owner asked for is dropped.

## Decisions

| ID | Question | Status |
|---|---|---|
| Q1 | How should AYRA address you? | ✅ "boss" (2026-10-02) |
| Q2 | AYRA's voice? | ✅ ElevenLabs Lily `pFZP5JQG7iQjIQuC4Bku`; excited, a little flirty |
| Q3 | Model? | ✅ `claude-opus-5-5`, effort `low` (4.4: Sonnet 5.5 measured no faster; `medium` thought ~4.5 s before speaking) |
| Q4 | Telegram as the phone channel? | ✅ @Ayra_rehan_bot, account "Starboy" |
| Q5 | Voice-note transcription? | ✅ ElevenLabs Scribe |
| Q6 | Keep the laptop awake while out? | ✅ Yes for now — plugged in, lid closed (2a, 2026-10-05); the cloud core later |
| Q7 | Which connectors? | Off since 2026-10-03; back one at a time in Phase 5 |
| Q8 | Clean interface (2026-10-03) | ✅ avatar only · cards on screen · browser voice as fallback · Telegram web-only · short README · interview in git · Phase 4 · repo public |
| D2 | Tailscale account | Open — Phase 9 |
| D3 | What each tool and agent may do alone | Open — at each intent check |
| D4 | LinkedIn beyond posting, WhatsApp | Open — at their intent checks, risks written down |
| D5 | Guardian rules and hands scope | ✅ full control; four things ask first (owner, 2026-10-03: "a") |
| D6 | A faster web search provider (4.4b) | Open — a new account (Brave Search free tier, my pick) |
| Q9 | Phase order and pushing | ✅ push `phase-4-clean` ("2a"); then the owner chose hands first, light, no cloud yet (2026-10-04) |
| Q10 | Light AYRA | ✅ light first · one Chrome for both (AYRA's window is the owner's daily Chrome) · brain sleeps after 10 idle min (2026-10-04) |
| D1 | Cloud host | Waiting — no budget yet (3b, 2026-10-05: build on the laptop till then); DigitalOcean Bangalore ≈ ₹1,050 is the pick when there is |
| Q11 | Autonomy and always-on (2026-10-05) | ✅ 1a four asks stay, plus "Always allow here" for sending/posting · 2a the laptop is her always-on home · 3b cloud when there is budget · 4a app window + tray + hotkey |

## Risks

| Risk | What we do |
|---|---|
| Lag makes AYRA tiring to use | 4.4 measures every turn type; speed is part of each phase's demo |
| Pro limits shared with the owner's own Claude use | Usage meter, a cap for background work, cheaper models for agents and the guardian |
| AYRA does something on the laptop the owner didn't want | Gate + guardian + Approve + kill switch + audit with screenshots (Phases 5–6) |
| Prompt injection (pages, mail, messages) | Content never triggers an action; the guardian and Approve sit in front of every effect |
| ElevenLabs free credits run out | Browser voice and recogniser take over (4.5) |
| Claude login expires on the server | Early warning on Telegram + renewal steps (8.5) |
| Anthropic's terms change | Switch to an API key with one setting; terms checked at every phase demo |
| LinkedIn / WhatsApp automation breaks their terms | Official routes first; anything else only with the owner's OK and the risk written down |
