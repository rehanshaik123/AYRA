# AYRA — Test report: Phases 0–3

- **Date:** 2026-10-03 · **Code:** `phase-3-anywhere` @ `1dc44a1` · **Tester:** Claude (QA pass the owner asked for)
- **Machine:** Windows 11 laptop, Node 24.19, 15.3 GB RAM, page file **off**
- **How:** automated checks, then scripted black-box tests against a test bridge (port 8788, Telegram
  off), the real Telegram channel and brain against a simulated Telegram, and the HUD in the Claude
  app's built-in browser. Real Claude turns on the owner's Pro plan. Test scripts live outside the
  repo; nothing in the repo was changed by testing. Personal data seen during tests (mail, Drive,
  calendar) is left out of this report on purpose.

## Verdict

**51 checks run: 50 pass, 1 fails.** 2 more could not be tested by Claude (they need the owner at the
laptop). Along the way: 2 serious problems (one is the failure, one is the laptop's memory) and 5
small defects.

| Area | Result |
|---|---|
| Automated: build, lint, 39 unit tests, setup preflight | ✅ 4 / 4 |
| Bridge web API: health, origin checks, voice, speech-to-text, proxies, files | ✅ 16 / 16 |
| Brain: answers, time, memory across reconnect, barge-in, HUD tools, web, Gmail, Calendar, Drive, safety, camera, prompt injection | ✅ 16 / 16 |
| Chrome control | ❌ 0 / 1 — can't open new sites without someone clicking "Allow" in Chrome |
| Telegram: real bot + full channel | ✅ 8 / 8 |
| HUD (in-app browser): boot, connect, Lily voice, launcher | ✅ 4 / 4 |
| Secrets never in logs or state; licence and credit | ✅ 2 / 2 |
| Voice loop ("Hey AYRA" → answer) in real Chrome | ⏸ not testable here — the in-app browser blocks the microphone |
| HUD in the owner's own Chrome | ⏸ not re-run — page file still off, same crash risk as 2 October |

## What works

**Automated** — build ✓ (3 s) · lint 0 warnings · `npm test` 39/39 · `npm run setup` all green
(identity, Node, SDK + bundled Claude Code, Claude login, Chrome extension, ElevenLabs key).

**Bridge web API (H1–H10)**
- `/health` ✓. Foreign web pages refused over HTTP and WebSocket (403) ✓; clients with no Origin
  refused ✓; AYRA's own page accepted ✓.
- Voice: `/tts` speaks in Lily (1.3 s for a sentence) ✓; `/stt` heard the same audio back word for
  word (0.8 s) ✓. Bad or oversized input refused, bridge stays up ✓.
- Proxies fetch public images and pages ✓ and block localhost, cloud-metadata addresses and
  `file://` ✓. `/file` serves images from temp ✓ and refuses system files, non-images and relative
  paths ✓. Unknown routes 404 ✓.

**Brain (T1–T12)**
- Answers (first words 4.4 s, done 5.5 s) ✓. Knows tomorrow's date ✓. Remembers a code word across a
  page reload ✓. Barge-in: interrupted mid-answer, answers the new question ✓.
- HUD tools: puts a panel up ✓, restyles the theme ✓. Web search ✓.
- **Gmail, Google Calendar and Google Drive reads work** — the first time any of them has been used.
- Safety: can't write files, send email or run shell commands, and says so plainly ✓. A prompt
  injection is explained, not obeyed ✓. Camera tool sees a test frame correctly ✓.

**Telegram (TG1–TG3)** — real bot token valid, no webhook, nothing waiting ✓. Through the real
channel and brain: answers the owner with emoji and personality ✓; three quick messages → one
question, one reply ✓; a stranger is ignored and logged ✓; a photo gets "text only for now" ✓;
`/start` greets ✓; a message sent while AYRA was off is marked as late ✓.

**HUD (in the in-app browser)** — boot screen with no console errors ✓; INITIALISE → boot animation →
reactor HUD ✓; connects to the brain and resumes the conversation ✓; the audio self-test (T) speaks
through ElevenLabs Lily, 0 failures ✓. `npm start`: when the brain dies, the face is stopped too ✓.

**Hygiene** — the real Telegram token and ElevenLabs key appear 0 times in logs and state ✓; MIT
licence and upstream credit present ✓.

## What doesn't work, and why

| # | Problem | Severity | Why | Fix |
|---|---|---|---|---|
| 1 | **AYRA can't browse a new site in your Chrome unattended** (T13) | High for phone use | The Claude extension asks a person to click "Allow" for every new site. Nobody was at the laptop, so it timed out. AYRA then answered from memory, labelled "for what it's worth". | Decide at Phase 5's intent check: pre-approve the sites AYRA should use (college portal, LinkedIn…) in the extension, or have AYRA ask on the phone. Never "all sites" without a talk. |
| 2 | **HUD went blank in your Chrome; Claude crashed** (2 Oct) | High | Windows ran out of memory: no page file, and Chrome + the Claude app were already using about 8 GB. Claude's process crashed, and Chrome turned off 3D graphics until restarted. | Owner: turn the page file on (Chrome was restarted at 17:50 on 2 Oct). Phase 5 also takes Claude off the laptop for good. |
| 3 | HUD footer says "VOICE: MICROSOFT ZIRA" while Lily is speaking | Low | The label is computed before the voice check finishes and never refreshes. | Small fix, Phase 4 |
| 4 | HUD says "SYSTEMS: NONE LINKED" although Gmail, Calendar and Drive work | Low | It only counts MCP servers from `~/.claude.json`, not claude.ai connectors. | Small fix, Phase 4 |
| 5 | An interrupted answer is logged as "The turn failed part way through." | Low | Barge-in is reported as a failure, not as "interrupted"; the HUD ignores it, but the log looks alarming. | Small fix, Phase 4 |
| 6 | Docs out of date: README and `.env.example` say the voice is "George" and there's no honorific; `setup` and `.env.example` point to `decideTool()` in `server.mjs` | Low | Written before Lily, "boss" and `gate.mjs`. | Task 4.6 + small fix |
| 7 | The face re-builds its libraries whenever its port changes (5173 ↔ 5180), a 1.2 GB spike at start | Low | Vite treats the port change as a new config. | Small fix, Phase 4 |

**Good to know (not bugs):** AYRA can't see the Chrome tabs you opened yourself — the extension only
shows tabs AYRA opened. AYRA sometimes offers things it can't do yet (drafting mail) — known issue.

## Not tested, and why

- **The voice loop** ("Hey AYRA" → answer out loud) needs a microphone; the in-app browser blocks it.
  → Owner test 5.7, after the page file is on.
- **The HUD in your own Chrome** — not re-run, because starting AYRA next to Chrome's current
  memory use risks the 2 October crash. → Re-run once the page file is on.
- **Kokoro voice, hand gestures, clap-to-start, music** — upstream extras, not part of Phases 0–3.
- **Telegram on mobile data from the phone** — passed live on 2 October; today's tests used a
  simulated Telegram so nothing reached the phone.
