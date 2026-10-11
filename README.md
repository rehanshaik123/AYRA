# A.Y.R.A.

**AYRA** is a personal assistant for one person. Press **Space** at the laptop and talk, or message
her on Telegram: she answers out loud in her ElevenLabs voice, searches the web, works in the owner's
own Chrome and Windows apps, runs PowerShell and handles files — and asks first before spending
money, sending or posting as the owner, deleting for good, or touching passwords and security
settings. The face is an animated avatar; the brain is **Claude Code run headless through the Claude
Agent SDK** on the owner's own Claude login, so there's no API key.

Long tasks can run in the background as jobs that report on Telegram, she can show you any tab or
window as a picture, and the owner can let her send or post on a chosen site without asking ("Always").
Memory, more apps and agents come one at a time: see [PLAN.md](PLAN.md). The rules for working on
this repo are in [CLAUDE.md](CLAUDE.md), and the build log is in [PROGRESS.md](PROGRESS.md).

## Run it

Needs Windows 10/11 (Linux and macOS paths are kept working), Node.js 20+, a Claude login (the
desktop app or `claude` CLI, signed in once) and Chrome or Edge in a real window.

```bash
npm install
npm run setup     # checks the machine, changes nothing
npm start         # brain + face → open http://localhost:5173, click INITIALISE, press Space
npm run shortcuts # Windows: AYRA.exe in the tray — starts with Windows, Ctrl+Alt+A to talk
```

Optional settings go in `.env.local` (template: `.env.example`): `ELEVENLABS_API_KEY` for the voice
and transcription (otherwise the browser's own speech is used), and the Telegram bot token and owner
ID. In the HUD: **Space** to talk, **Space** again to send, **Space Space** or **Esc** to stop,
**D** diagnostics, **T** an audio test.

## Research agent

Every question is ranked in code first (`bridge/triage.mjs`, no model call). Only a clearly complex
one — a comparison, several parts, "research …", "fact-check …", pros and cons, a contested or
high-stakes decision — goes to her research agent; anything else gets one quick web search. While a
run works a small progress card shows the rank, the agents and the reviewer; at the end two cards
appear, the data that answers the question and the sources it used, and she says the verdict in a
sentence or two. On Telegram you get the report as text with its numbered sources.

Code, not a model, runs the four stages; each model step is a one-shot Claude agent with one narrow
job (at most ten Claude calls a run):

1. **Rank** — the depth score decides 3 or 4 parts; a simple question is refused at no cost.
2. **Split** — the question becomes 3–4 parts that don't overlap, each with a search query.
3. **Agents** — all parts at once: a searcher per part, then code reads its pages safely (ranked
   by trust, at most two per site, scanned for prompt injection), then a reporter writes findings,
   each with a word-for-word quote; a quote that isn't really on the page is dropped.
4. **Review** — scores the findings, removes duplicates and off-topic ones, checks them against
   the question, and writes a cited answer with a confidence; every figure on the data card is
   copied from a checked finding and found on its page.

The agents that read web pages have no tools, so text planted in a page can't make them act. Every
report is saved in `data/research/`: the same question within 12 hours replays it, and without a
connection she falls back to the closest saved report, marked offline.

```bash
npm run research -- "Compare iPhone 17 and Pixel 10 for camera, battery and price"
npm run research -- "question" --fresh   # --fresh skips the saved report
```

`AYRA_RESEARCH_MODEL` (default `claude-sonnet-5-5`) sets the model for the workers; the review and
the answer use `AYRA_MODEL`.

## Credits & licence

MIT — see [LICENSE](LICENSE). Based on [JARVIS by Aditya Dewaskar](https://github.com/adewaskar/jarvis).
The avatar is fan art of Orihime Inoue (Bleach), made for personal use only.
