# AYRA — Vision

The owner's goals in their own words (quotes lightly edited for spelling), from the interview on
2026-10-02. This is the *why* behind [PLAN.md](../PLAN.md) and [ARCHITECTURE.md](ARCHITECTURE.md).
When a plan and this file disagree, this file wins until the owner changes it.

## The heart of it

> "I want to build an intelligent central system which cares about my needs and wants and is
> personalized especially for me — and then incrementally add specific models/agents for specific
> tasks as we go."

So AYRA is built in this order:

1. **The central system first.** One AYRA that knows me, remembers me, cares about what I need,
   takes my commands and gets them done — reachable from anywhere.
2. **Agents after, one at a time.** Each agent is a specialist the central AYRA starts, watches and
   judges: "it has to take my command, render [start] the relevant agents according to my work,
   monitor their performance and evaluate their result status" — and "monitor, and not do
   dangerous stuff".

Her main purpose: **take my daily laptop work off my hands**, and turn the hours saved into skills.

## Who AYRA works for

- "I'm a B.Tech student", third year, with "a scheduled college day and gym sessions".
- "I want to get a high-paying job as soon as possible" — first step: "crack an internship with
  stipend".
- "I am a jack of all trades and master of none. I have vast knowledge but no expertise, so I want
  to become someone irreplaceable with the talent I have."
- Learns "majorly from YouTube and wherever I can find good content".
- "I dedicate all my time to using this and skilling myself up." Uses AYRA "whenever I can, all
  the time", from an Android phone.

## Two versions, one AYRA

- **Laptop ON:** I use her at my desk (voice + HUD) or from my phone, and she can use laptop-only
  abilities: PC control, files on the laptop, my Chrome.
- **Laptop OFF:** I message her from my phone and she still works — mail, calendar, Drive,
  reminders, memory, research, morning brief — on an always-on brain in the cloud.
- She works out by herself whether the laptop is online and sends each job to the right place. If
  a job needs the laptop and it's off, she tells me and queues it for when it's back.
- **One memory and one conversation**, whichever side answers.
- Reach her through "the easiest accessible option possible, for both laptop on and laptop off".

## What the central system must do

- **Know me:** my goals, schedule (college, gym), preferences and progress — remembered across days,
  devices and channels.
- **Care:** notice what I need, nudge me at the right time, celebrate wins, never nag.
- **Get things done:** understand a command, pick the right tool or agent, do it, report back.
- **Stay safe:** watch every agent and block dangerous actions.
- **Apps:** "connect all possible apps and websites which can be accessed via MCP and APIs". Top
  three: **LinkedIn, WhatsApp, Notion**. In Notion "AYRA can do whatever it wants" — it is her
  notebook and the agents' memory.

## The first agents to add — ranked by hours saved

These come *after* the central system, one at a time, each designed at its own intent check
("we can design each agent later, when we add agents to the central brain"). Hours are AYRA's
estimates; the owner said this work takes "hours of my time", "every day".

| # | Agent | In my words | Done looks like | Needs the laptop? | Hours saved / week (est.) |
|---|---|---|---|---|---|
| 1 | **Skill mentors** — DSA, AI/ML, Full Stack | "Individual agents for skills like DSA, AI/ML and Full Stack, which track my progress independently of each other, make milestones and help me master each field." "A personal mentor of the particular skill, with very good memory of my status and progress." "These agents should write plan and progress.md-like files in Notion pages to keep the memory." | A level test first, milestones set with me, daily tasks, checks what I actually did, adjusts the plan, weekly report — all kept in Notion | No | 6–10 |
| 2 | **Research agent** | "Goes through all sources and gives me the best, relevant, real-life practical answer." "I ask about all the innovative things and unique ideas I get, so I want to know whether a solution already exists or not — and all kinds of stuff." | A short verdict on my phone (does it exist, who built it, how mine could differ, next step) plus a full Notion page with sources | No | 4–6 |
| 3 | **General helper** | "Takes care of the small things, like writing a message and sending it, and all the small stuff in the MCP-connected apps." WhatsApp: "send messages on my behalf, and notify me of the urgent ones which need replies and my involvement." | Message written and sent; urgent WhatsApp messages flagged to me with a draft reply | WhatsApp: depends on the route (ARCHITECTURE.md) | 3–5 |
| 4 | **LinkedIn** | "Post my achievements automatically, and do everything." | Achievements posted on my profile; internships found and tracked | Posting: no. The rest: depends on the route | 2–3 |

## Permissions

- "For all the connectors and apps, I give full access to AYRA to do whatever, intelligently."
- "I want the central AYRA system to monitor, and not do dangerous stuff."
- Each agent's intent check settles what it may do alone and what needs my Approve tap. Until an
  agent's rules are set, CLAUDE.md's safety rules hold: nothing sends, deletes, pays or posts
  without my OK.

## Budget and accounts

- Claude **Pro** plan. Cloud budget: **₹500–2,000 a month** (server, plus Claude usage if the cloud
  needs an API key).
- Android phone · Telegram bot @Ayra_rehan_bot · ElevenLabs free plan (voice Lily) · Gmail,
  Google Calendar and Drive connected on claude.ai · Notion (to be connected).

## Later, not dropped

AYRA's suggestion, since the owner didn't choose — correct it: desk voice + HUD polish, HUD on the
phone, custom "Hey AYRA" wake word, visuals, camera and hand gestures, PC control. Voice notes on
Telegram stay in, because they are the fastest way to talk to AYRA on the go.

## AYRA's guesses — correct anything wrong

- **Urgent WhatsApp** = family, close friends, messages that mention me directly, and college
  groups talking about exams, deadlines, assignments or anything "urgent".
- **LinkedIn order:** 1 post achievements · 2 find internships · 3 track applications ·
  4 improve my profile · 5 message recruiters · 6 comment on posts.
- **Achievements worth posting:** finished projects, certificates, hackathons, skill milestones.
- **First mentor:** DSA, because most stipend internships start with a DSA test; then Full Stack
  (projects to show), then AI/ML.
- **Check-ins:** no fixed times; AYRA is there all day. A short morning plan and a night review
  are offered, never forced.
