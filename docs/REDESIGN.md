# The redesign brief

The owner's instructions for redesigning how AYRA is planned and run, given on 2026-10-02 and kept
here word for word. Status of each step is at the end.

---

I want to redesign how this project is planned and run. In THIS session you change documentation only.

## Ground rules for this session
- Do not edit, add or delete any code, config, dependency or data file. Only CLAUDE.md, PLAN.md, PROGRESS.md, and new files under docs/.
- You may run read-only checks: npm run build, npm run lint, npm test (and npm run smoke if the bridge starts cleanly). Nothing else.
- Read CLAUDE.md, PLAN.md and PROGRESS.md first, then only the source files you need to confirm what's real. Don't scan the whole repo.
- Work through the 4 steps below. Stop at the end of each step and wait for my reply. Don't skip ahead.
- Don't push anything until I approve the final docs.

## Why
The current docs make me decide everything, so you stop for small things. And the plan is a generic feature list, not built around what I actually need. I trust your engineering judgment: I want you to make the technical decisions, understand my intentions clearly before building anything, and ask my permission at the moments that matter.

## What I want AYRA to become
One assistant, two homes:
- Laptop ON: I can use her at my desk (voice + HUD) or from my phone, and she can use laptop-only abilities: PC control, files on the laptop, my Chrome.
- Laptop OFF: I message her from my phone and she still works (mail, calendar, Drive, reminders, memory, research, morning brief), running on an always-on brain in the cloud.
- She works out by herself whether the laptop is online and sends each job to the right place. If a job needs the laptop and it's off, she tells me and queues it for when it's back.
- One memory and one conversation, whichever side answers.
- Her main purpose: take my daily laptop work off my hands. The exact tasks come from Step 2.

## Step 1: Reality check
Run the checks and confirm what genuinely works today versus what exists only in the docs. Report in plain words, under 15 lines: what works, what's half-done, what's broken, and anything risky.

## Step 2: Understand me (interview)
Ask me questions in batches of 3–5, in plain language, until you could explain my goals back to me. Cover:
- my daily laptop tasks: what they are, how often, how long they take now, which apps or sites
- for each task: what "done" looks like, and whether it needs the laptop
- what AYRA may do alone versus what needs my Approve tap
- my monthly budget in ₹ for the cloud part (server, plus Claude usage if it needs an API key)
- what I'd cut or delay from the current plan
Then write docs/VISION.md: my goals and tasks in my own words, ranked by hours saved. Show it to me and wait for "approved".

## Step 3: Architecture proposal
Propose how the cloud brain and the laptop work together. Build on what exists (brain.mjs, gate.mjs, audit log, Telegram, tests): evolve it, don't restart. Give 2–3 options, each with a rough monthly cost in ₹ and its tradeoffs, plus your recommendation. The proposal must answer:
- where the always-on brain runs, and how it logs in to Claude (check Anthropic's current terms and pricing; don't assume)
- how the laptop connects (it dials out to the cloud, with no open ports on the laptop) and how the cloud knows it's online
- how each job is routed: cloud-only, laptop-only, or either
- where memory, state and logs live, and how both sides stay in sync
- how to make sure only one place reads the Telegram bot at a time
- how secrets and the safety rules (gate, Approve buttons, audit) carry over to the cloud
Include a simple diagram. Wait for my approval, then save it as docs/ARCHITECTURE.md.

## Step 4: Rewrite the docs
CLAUDE.md (it loads every session, so keep it tight):
- Replace rule 0 with this working agreement:
  - You decide: implementation, file structure, libraries (log the reason in PROGRESS.md), naming, task order inside a phase, refactors that keep behaviour, tests, bug fixes.
  - Intent check before each phase: restate what I want from it in 3–5 bullets, ask about anything unclear, and wait for my "go". Never guess what a feature should do; ask.
  - Ask me first: architecture changes, anything that costs money, new accounts or integrations, anything that sends, deletes, pays or posts, exposing anything to a network, AYRA's personality or voice, adding or dropping features.
  - End of each phase: a short demo covering what was built, how I test it from my phone, and what's next. Merge only after my OK.
  - When you ask: batch your questions, give options with your pick first, use plain language.
- Keep the safety, security, privacy, terms, code, git and Definition-of-Done rules unless Step 3 requires changes. Update the file map and commands for the new architecture.
PLAN.md:
- Collapse finished work into a short "Done" section, keeping the ticks.
- Rebuild the remaining phases around docs/VISION.md and docs/ARCHITECTURE.md. The first new phase is a thin slice: one real daily task working from my phone with the laptop OFF.
- Every phase gets: goal, why, tasks with a Check, 🧑 owner steps, and the intent check at its start.
- Move polish (HUD on phone, custom wake word, visuals) to a "Later" section.
- Give me a table of every unfinished old task with keep / change / move / drop and a one-line reason.
PROGRESS.md: keep the log, findings and known issues untouched. Add one line for this redesign and rewrite "▶ Continue here".
Show me a summary of the changes and wait for my approval. Then commit following the git rules. Don't push until I say so.

---

## Status (2026-10-03)

| Step | Status |
|---|---|
| 1 Reality check | ✅ Done 2026-10-02 (under-15-line report). A fuller QA pass followed: `docs/TEST-REPORT.md` (50/51). |
| 2 Interview → VISION.md | ⚠️ Written, revised once after the owner's correction ("a central system first, agents later"), but the owner never said the word **"approved"** — so `docs/VISION.md` is a **DRAFT**. Open questions are listed at its end. |
| 3 Architecture | ✅ The owner skipped the options round: "decide carefully and implement the best architecture for two versions". Claude decided (cloud core + laptop desk over Tailscale, Pro login via `/login` on the server) → `docs/ARCHITECTURE.md`. The owner accepted it implicitly by approving the push below. |
| 4 Rewrite the docs | ✅ CLAUDE.md, PLAN.md, PROGRESS.md rewritten; approved with "push this files to the github repos …" and pushed 2026-10-03 (`f0ccda7`, `1dc44a1`), merged to `main` with Phase 3 (`f195ad1`). |

The redesign is finished; work has moved on to Phase 4 (see "▶ Continue here" in PROGRESS.md).
