# A.Y.R.A.

**AYRA** is a personal assistant for one person. Say **"Hey AYRA"** at the laptop, or message her on
Telegram: she answers out loud in her ElevenLabs voice, searches the web, and puts the results on
screen as cards. The face is an animated avatar; the brain is **Claude Code run headless through the
Claude Agent SDK** on the owner's own Claude login, so there's no API key.

Today AYRA does web search only. Apps, memory, laptop control and agents come back one at a time:
see [PLAN.md](PLAN.md). The rules for working on this repo are in [CLAUDE.md](CLAUDE.md), and the
build log is in [PROGRESS.md](PROGRESS.md).

## Run it

Needs Windows 10/11 (Linux and macOS paths are kept working), Node.js 20+, a Claude login (the
desktop app or `claude` CLI, signed in once) and Chrome or Edge in a real window.

```bash
npm install
npm run setup     # checks the machine, changes nothing
npm start         # brain + face → open http://localhost:5173, click INITIALISE, say "Hey AYRA"
```

Optional settings go in `.env.local` (template: `.env.example`): `ELEVENLABS_API_KEY` for the voice
and transcription (otherwise the browser's own speech is used), and the Telegram bot token and owner
ID. In the HUD, **Space** talks without the wake word, **D** opens diagnostics and **T** runs an
audio test.

## Credits & licence

MIT — see [LICENSE](LICENSE). Based on [JARVIS by Aditya Dewaskar](https://github.com/adewaskar/jarvis).
The avatar is fan art of Orihime Inoue (Bleach), made for personal use only.
