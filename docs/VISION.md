# AYRA — Vision

> **Status: DRAFT — not approved.** The redesign brief ([REDESIGN.md](REDESIGN.md), Step 2) asks for
> the owner's word "approved"; it hasn't been given yet. Every answer so far is recorded word for word
> at the end, with the questions still open. Until approval, treat the summary below as Claude's
> reading of those answers.

The owner's goals in their own words (quotes lightly edited for spelling), from the interview on
2026-10-02–03. This is the *why* behind [PLAN.md](../PLAN.md) and [ARCHITECTURE.md](ARCHITECTURE.md).
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

---

## Every answer so far, word for word

Typed by the owner (spelling unedited). Claude's question is in italics before each batch.

**From the very first message (2026-10-01):** "i want to build my own jarvis system which i can
effortlessly perform my tasks anytime even when im in my college or functions or anywhere i want it
to perform high level automations and intelligent tasks"

**Personality and voice (2026-10-02):** "i want this agent to be excited and i want it to little
roast flirt me at the perfect time" · "yess add little more flirty" · call me "boss" · voice: chose
Lily (option D) · Telegram: "yes add emojis" · "yes thats me" (the "Starboy" account).

**Always-on (2026-10-02):** "does this live in my computer only? So if I close my computer, what
happens? … I want to build a Jarvis-like system which I have to use … hassle-free … is it possible
for me to use the IRA by giving it command and close the laptop and mobile?"

**Round 1** — *about you · your laptop tasks · how often and how long · apps and sites · top 3*
> 1)im a btech student who wants to gain skills in a scheduled college day and gym sessions and wants to get the high paying job as soon as possible
> im in third year and i wanna crack a internship with stipend
> 2) i wanna do multiple tasks which takes hours of my time and i wanna automate this all
> a) a research agent which goes through all sources and give me best and relevent real life practical answer
> b) an individual agents for skills like dsa, aiml and full stack . which tracks my progress independent to each other and make a milestone and help me mastery in each field . these agents should write the plan and progress.md like files in notion pages to keep the memory .
> c)an general agent which take care of the small things like doing stuff like writing a message and send and all the small stuff in the mcp server connected apps
> d) so basically i want a major high priority agent as central system so it have to take my command and it have to render the relevent agents according to my work and moniter its performance and evaluate its result status
> 3)everyday
> 4)i wanna connect all possible apps and website which can be accessed via mcp and apis
> 5) linkedin , whatsapp and notion

**Round 2** — *time spent now · level and what "mastered" means · daily routine · research questions · LinkedIn / WhatsApp / Notion*
> 1) i dedicate all my time for me to use this and skill up myself for me to get high paying job
> 2)i am a jack of all trades and master of none. i have vast knowledge but no expertise so i wanna become someone irreplacable with the talent i have. i learn majorly from youtube and wherever i can find good content
> 3)yeah it have to be a personal mentor of the particular skill with very good memory of whats my status and progress in this field
> 4)i ask all the innovational things and unique ideas i get in my brain so i wanna know whether its solution already exists for not . and all kind of stuff
> 5)in linked in i want the ayra to post my achievements automatics and do everything
> in whatsapp i want it to send messages on my behalf and i want it to noticy the urgent one which needs replies and my involvement
> in notion ayra can do whatever it want
> so for all the connectors/apps i give full access to ayra to do whatever intelligently
> i want the central ayra system to monitor and dont do dangerous stuff

**Round 3** — *phone and schedule · alone (A) / tell after (B) / ask first (C) · urgent WhatsApp · LinkedIn order · mentors' level test*
> 1) android ,ill use ayra whenever i can during the all the time
> 2)A
> 5)yes

(3 and 4 not answered.)

**Round 4** — *"A for everything" — sure? · budget and Claude plan · cut or delay · where to chat with AYRA*
> 1) we can design each agents later when we add agents to the central brain system AYRA
> 2)i am on the claude pro plan and for the cloud session i can do between 500-2000
> 4) i want to use it from easiest accessable option possible for both laptop on condition and laptop off condition

(3 not answered.)

**Correction after the first VISION draft (2026-10-03):**
> hey i indeed wanna build the agent for skills and linkedin and research agent but thats not it you saying like its just for that
> the matter here is i wanna build a intelligent central system which cares about my needs and wants and it is personalized expecially for me and then incrementally add specific models/agents for specific tasks as we go
> so main thing is i want you to redesign this project claude.md and plan.md and progress.md to follow this specification.
> i dont want to mess up everything that has been build soo far now
> i want to follow this rules from now on
> i want you to decide carefully and implement the best architecture for two versions
> 1) which i have access to laptop and its on
> 2) when the laptop is off and i just have mobile to access ayra
> so redesign claude progress plan markdown files by keep the work done till now untouched/change if needed

**After the redesign (2026-10-03):**
> yeah push this files to the github repos existing claude.md plan.md and progressmd and every doc file you specified about our new design/workflow and also be a professional software testing eval engineer and test all the functionalities in the phase 0 to 3 and give me brief of what works and what not and why not working

> do those moves and lets proceed to next and if the 3d reactor interface is being heavy on my laptop then create a cute interface where orihime from bleach acts as ayra with her in the middle and she do gestures and act when i use this . after building it , run test everything and after that letme evaluate myself .

## Questions still open

1. **Approve this vision** — the word "approved", or what to change.
2. **The guesses above** — urgent WhatsApp, LinkedIn order, what counts as an achievement, DSA as
   the first mentor, check-in times, the "Later" list (Round 3 Q3–Q4 and Round 4 Q3 went unanswered).
3. **Hours saved** — the per-agent estimates are Claude's; the owner gave no numbers ("all my time").
4. **Permissions** — "A" for everything, or "A with four exceptions" (paying, deleting, sharing
   private data, actions requested by content)? Deferred by the owner to each agent's intent check.
5. **The avatar face** — the owner's verdict after evaluating it in Chrome.
6. **GitHub visibility** — the repo is public and holds personal details (this file, the owner's
   Telegram ID in PROGRESS.md) and the fan-art avatar. Make it private, or keep it public?
7. **Phase 4 intent check** — confirm the restated goal; host (DigitalOcean Bangalore ≈ ₹1,050/month,
   Claude's pick, or Hetzner ≈ ₹620); a free Tailscale account; the idea-check answer format
   (short on Telegram with "more?" by default); three real ideas to test with.
8. **Chrome on sites AYRA hasn't visited** — pre-approve sites in the Claude extension, or have AYRA
   ask on the phone? (QA finding #1, decided at Phase 5.)
