# AYRA — Architecture

How AYRA's two homes work together. Decided 2026-10-02 at the owner's request ("decide carefully and
implement the best architecture"); facts about Anthropic's terms and prices were checked that day
(sources at the end). Goals come from [VISION.md](VISION.md); the build order is in
[PLAN.md](../PLAN.md).

## The picture

```
 PHONE  (Telegram: text, voice notes, Approve buttons)
   │
   │  Telegram's servers — the core polls them,
   │  so nothing anywhere has an open port
   ▼
 AYRA CORE — small cloud server, always on
   • brain: Claude Code (Agent SDK) on your Pro login
   • one conversation + memory + jobs and laptop queue
   • gate, Approve buttons, audit log, scheduler, agents
   • cloud tools: Gmail, Calendar, Drive, Notion, web
   │
   │  desk link: WebSocket inside Tailscale
   │  (the laptop dials out; token + heartbeat)
   ▼
 AYRA DESK — the laptop, only while it's on
   • HUD + voice on localhost:5173
   • your Chrome, files, PC control, camera
   • runs the desk tools the core asks for
```

**One brain, in the cloud.** The laptop stops being where AYRA lives and becomes AYRA's hands at the
desk. That is what makes "one memory and one conversation, whichever side answers" true by design —
and it takes the Claude process off the laptop, which is what crashed on 2 October (out of memory).

## Options considered

| | How it works | ₹ / month | Good | Bad |
|---|---|---|---|---|
| **A. Cloud core + laptop desk** ✅ chosen | One brain in the cloud. The laptop connects when it's on and lends its abilities. | ≈ ₹1,050 server (₹620 on the cheaper host) + ₹0 Claude | One memory and one conversation for free. Laptop off = AYRA still works. Laptop gets lighter. Only one place can read Telegram. | Laptop features need the internet link. One server to keep alive (it restarts itself and reports its own health). |
| **B. Two brains with hand-off** | The laptop runs the brain while on; the cloud takes over when it's off; they sync. | same server | Desk keeps working if the cloud is down. | Two of everything: Claude sessions can't move between machines, memory needs two-way sync, both may answer Telegram, two logins burning one Pro limit. |
| **C. Laptop brain + cloud mailbox** | The cloud only holds messages and reminders while the laptop is off — no AI there. | ₹0–200 | Cheapest. | Fails "laptop off: she still works" — no answers, research or mail until the laptop wakes. |

**How the cloud brain logs in to Claude:**

| Login | ₹ / month | claude.ai connectors (Gmail, Calendar, Drive, Notion…) | Verdict |
|---|---|---|---|
| **Your Pro login: `claude` → `/login` on the server** ✅ | ₹0 extra | Yes | Chosen. Allowed for ordinary, single-user use. Renew when Claude Code warns it is expiring. |
| One-year token (`claude setup-token`) | ₹0 extra | **No** — model requests only | Fallback only: we would have to build our own Google and Notion connections. |
| API key, pay per use | ≈ ₹2,500–8,000 at the expected use (estimate) | No | Over budget. Required if AYRA ever serves anyone else — one setting (`ANTHROPIC_API_KEY`), same code. |

## The six decisions

### 1. Where the always-on brain runs, and how it logs in

- **Server:** DigitalOcean, Bangalore region, Basic Droplet 1 vCPU / 2 GB / 50 GB, **$12 ≈ ₹1,050 a
  month**, plus a 2 GB swap file. India region, simple sign-up, hourly billing. Cheaper alternative:
  Hetzner CX23 (2 vCPU / 4 GB, €5.99 ≈ ₹620, EU region, stricter sign-up checks). Rejected: Oracle
  Always Free — idle machines get reclaimed and its free limits were halved in 2026. DigitalOcean's
  student credit ended on 1 August 2026.
- **Setup:** Ubuntu 24.04 LTS, Node 24 LTS, a non-root `ayra` user, AYRA cloned from GitHub, a
  `systemd` service `ayra-core` (restarts on crash, memory cap), automatic security updates, a
  firewall with every inbound port closed. Script and steps in `deploy/` (Phase 4).
- **Claude login:** the owner runs `claude` → `/login` once on the server, over SSH (Anthropic's own
  sign-in; the browser gives a code to paste). Claude Code stores the login itself; AYRA's code
  never reads, copies or forwards it. When the login nears expiry, the core sends a Telegram alert
  with two-minute renewal steps.
- **Terms (checked):** subscription login "is designed to support ordinary use of Claude Code and
  other native Anthropic applications", and Pro/Max limits "assume ordinary, individual usage of
  Claude Code and the Agent SDK". It may never route anyone else's requests, and sign-in must go
  through Anthropic's own flow. AYRA is personal and single-user, so this fits. **Limits are shared
  with the owner's own claude.ai and Claude Code use** (including building AYRA), so the core meters
  usage and caps background work.
- **Models:** the main conversation stays on `claude-opus-5-5`, effort `medium`. Each agent's model
  is chosen at its intent check (cheaper models for background work save Pro limits).

### 2. How the laptop connects, and how the cloud knows it's online

- **Tailscale** (free Personal plan) puts the server, the laptop and later the phone on one private
  network. The server exposes nothing to the internet; even SSH goes through Tailscale.
- **The desk dials out** to the core's link port (bound to the Tailscale address only) and opens a
  WebSocket. Its first message carries `AYRA_LINK_TOKEN` (a random secret in both machines'
  settings); anything else is dropped. Tailscale's access rules allow only the laptop to reach that
  port. The laptop opens no ports.
- **Hello:** desk version, which desk tools it has, whether the HUD and Chrome are connected.
- **Presence:** heartbeat every 15 s; offline after 45 s of silence; the desk reconnects with
  back-off (1 s → 30 s). A laptop going to sleep shows as offline within a minute. Every change is
  logged, and `/status` on Telegram shows it.
- **The HUD** keeps talking to the desk on localhost (same origin check, same CSP); the desk relays
  to the core. Nothing new is exposed.

### 3. How each job is routed

Every tool has a fixed home, so AYRA's tool list never changes between turns (that keeps prompt
caching working):

| Home | Tools |
|---|---|
| **Cloud only** | Gmail, Calendar, Drive, Notion, web search/fetch, memory, reminders, jobs, Telegram, notify, agents |
| **Laptop only** | your Chrome (signed-in sites: LinkedIn, college portal), files on the laptop, PC control, camera, HUD display |
| **Either** | public web pages — the cloud by default; the laptop's Chrome only when a login is needed |

- A desk tool call while the laptop is **online** is forwarded over the link and its result comes
  back.
- While it's **offline**, the call returns `LAPTOP_OFFLINE` at once. AYRA tells the owner and offers
  to queue it. A queued job is saved, runs by itself when the laptop reconnects, and its result
  goes to Telegram. Jobs expire after 7 days; `/jobs` lists and cancels them.
- Every question carries a stamp like `[Laptop: online]` or `[Laptop: offline since 14:05]`, next
  to the existing time stamp, so AYRA plans the right way first instead of failing.

### 4. Where memory, state and logs live, and how both sides stay in sync

- **One source of truth: the core's `data/` folder on the server.**
  - `ayra.db` (SQLite, through Node's built-in `node:sqlite`): owner profile, memories, jobs and the
    laptop queue, reminders and routines, agents and their results, presence history, usage meter.
  - `logs/YYYY-MM-DD.jsonl`: today's audit log format, now covering desk tool runs too.
  - Claude's own session history, kept by Claude Code on the server.
- **Notion** is the readable side: mentors' plans and progress, research reports, an "AYRA notebook".
  AYRA writes it and the owner can edit it; the database keeps the page links. Notion is never the
  only copy of something AYRA needs to work.
- **The laptop keeps no memory of its own**, so there is nothing to sync two ways. The desk sends
  its tool results and logs to the core.
- **One conversation:** one main Claude session for every channel. Each message is tagged
  (`[via HUD voice]`, `[via Telegram]`), and one persona carries the style rules for each channel —
  spoken and short on the HUD, text with emoji on Telegram. Agents run in their own sessions and
  report back into the main conversation and to the phone.
- **Backups:** a nightly encrypted copy of `data/`, pulled to the laptop when it's online (plus
  Drive later).
- **Move-in:** today's laptop `data/` (state and logs) is copied to the server once.

### 5. Only one place reads the Telegram bot

- **By construction:** only the core role starts the Telegram channel. The desk role has no code path
  that polls.
- **By configuration:** from the day the core goes live, the laptop runs with `AYRA_TELEGRAM=off`; any
  test copy of the core does too (as today).
- **Telegram is the lock:** it allows one reader per bot and answers a second with `409 Conflict`.
  AYRA treats a 409 as "someone else is reading my bot" and alerts the owner.

### 6. Secrets and safety rules in the cloud

- **Secrets:** on the server, one settings file readable only by the `ayra` user (loaded by
  `systemd`); on the laptop, `.env.local` as today. Never in git, logs, prompts or the browser. If a
  secret leaks: rotate the link token, Telegram token or ElevenLabs key (steps in `deploy/`).
- **The gate** (`bridge/gate.mjs`) runs in the core and decides every tool call, cloud and desk
  alike. Desk tools get explicit entries and tests like everything else. The desk also keeps its own
  writes switch, so a compromised core link can't click or type in Chrome unless the laptop allows
  it.
- **Approve buttons** live in the core: an effectful action pauses and the owner gets Telegram buttons
  saying exactly what will happen; no answer in 2 minutes = deny; the HUD can show the same prompt.
  Until an agent's own rules are set: reading is free; sending, deleting, paying, posting and
  sharing need Approve. Anything suggested by content AYRA read (mail, web, messages) always needs
  Approve.
- **The audit log** in the core records every question, tool call, gate decision, approval, job and
  presence change. `/log` on Telegram summarises today.
- **The server** has no public ports, SSH only through Tailscale, a non-root user, `systemd`
  sandboxing and automatic security updates.

## Central brain and agents

- **The core is the orchestrator.** For each request it uses the profile and memory, then answers
  itself, uses tools, or hands the job to an agent.
- **An agent is a folder** `agents/<name>/`: purpose, what "done" means, prompt, model, tools,
  permissions, schedule, and where its memory lives (usually a Notion page or database). Agents are
  added one at a time, each after its own intent check.
- **Jobs:** `delegate(agent, task)` creates a job (queued → running → waiting for approval → done or
  failed). It runs in its own Claude session so a long job never blocks the chat. When it ends,
  AYRA checks the result against the agent's "done" description, the owner can rate it 👍/👎, and
  each agent gets a score (success rate, time, usage) and a weekly report. One background job at a
  time to start with (Pro limits, 2 GB server).

## Personalisation — "cares about my needs"

- The **owner profile** (goals, schedule, preferences, people) sits in the system prompt — stable, so
  it stays cached.
- **Memory** is recalled for each request and written with `remember` / `forget`.
- A **nightly reflection** turns the day's conversations into memory updates, shown to the owner in
  a short digest they can veto.
- The **scheduler** lets AYRA speak first: reminders, deadline nudges, an optional morning plan and
  night review.

## What changes in the code (evolve, don't restart)

| Today | Becomes |
|---|---|
| `bridge/brain.mjs` | The core's brain: the main conversation, plus agent sessions |
| `bridge/gate.mjs` | Single authority for cloud and desk tools; gains "ask" (Approve) decisions |
| `bridge/audit.mjs`, `state.mjs` | Core; state moves into SQLite behind the same small API |
| `bridge/telegram.mjs` | Core only; gains buttons, voice notes and the 409 alert |
| `bridge/persona.mjs` | One character with per-channel style rules |
| `bridge/server.mjs` | Split into `bridge/core.mjs` (cloud) and `bridge/desk.mjs` (laptop, keeps the HUD socket) |
| `bridge/chrome.mjs`, `panels.mjs`, `ui.mjs`, `vision.mjs` | Desk tools, called by the core over the link |
| `src/` (the face) | Unchanged — it still talks to localhost |
| New | `bridge/link.mjs`, `db.mjs`, `memory.mjs`, `jobs.mjs`, `scheduler.mjs`, `approvals.mjs`, `notify.mjs`, `agents/`, `deploy/` |

For development, the core runs on the laptop too (`npm run core`, Telegram off) and the desk
connects to it on localhost. The same code, a different address.

## Monthly cost

| Item | ₹ / month |
|---|---|
| Cloud server (DigitalOcean Bangalore 2 GB) | ≈ 1,050 — or ≈ 620 on Hetzner |
| Claude | 0 extra (Pro plan, already paid; limits shared) |
| Tailscale, Telegram, Notion (free plan), ElevenLabs (free tier) | 0 |
| **Total** | **≈ 620–1,050** — inside the ₹500–2,000 budget |

## Risks

| Risk | What we do |
|---|---|
| Pro limits shared with the owner's own Claude use | Usage meter, a daily cap for background work, cheaper models for agents |
| Claude login expires on the server | Early warning on Telegram + two-minute renewal steps |
| Anthropic's terms change | Switch to an API key with one setting; check the terms at every phase demo |
| Cloud server down | `systemd` restarts it; the desk shows "core unreachable"; Telegram keeps messages 24 h |
| Prompt injection (mail, web pages) | Default-deny gate, Approve buttons, content can't trigger actions, audit log |
| Link token leaks | Tailscale lets only the laptop reach the port; rotate the token |
| LinkedIn / WhatsApp automation breaks their terms | Official routes first; anything unofficial only with the owner's OK and the risk written down |

## Sources (checked 2026-10-02)

- Claude Code legal and compliance — <https://code.claude.com/docs/en/legal-and-compliance>
- Claude Code authentication (`/login`, `setup-token`, precedence) — <https://code.claude.com/docs/en/authentication>
- Pro/Max usage shared across Claude and Claude Code — <https://support.claude.com/en/articles/11145838-using-claude-code-with-your-pro-or-max-plan>
- API prices: Opus 5.5 $4/$20, Sonnet 5.5 $2/$10, Haiku 4.5 $1/$5 per million tokens; batch −50% (claude-api reference, 2026-09-25)
- DigitalOcean Droplet pricing — <https://www.digitalocean.com/pricing/droplets>
- Hetzner CX23 price after the 2026 increases — <https://northflank.com/blog/hetzner-cloud-server-price-increases>
- Oracle Always Free limits cut, idle reclaim — <https://www.infoq.com/news/2026/07/oracle-cloud-free-tier-limits/>
- DigitalOcean left the GitHub Student Pack — <https://github.com/orgs/community/discussions/201240>
- Tailscale free Personal plan — <https://tailscale.com/pricing>
- LinkedIn self-serve "Share on LinkedIn" (`w_member_social`) — <https://www.blotato.com/blog/linkedin-posting-api>
