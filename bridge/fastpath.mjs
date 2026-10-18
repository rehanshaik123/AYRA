/**
 * The fast path: commands that need no thinking, done in code.
 *
 * The owner, 2026-10-12: "AYRA is performing with much latency … let her work
 * fastest at opening things". "Open YouTube" through the brain is a model turn
 * to choose the tool (~2–3 s), the tool itself, and a second turn to say so —
 * five to ten seconds for something a person does in one. These few shapes of
 * command are recognised here instead and done at once, with a short line
 * spoken back (~0.3 s to the first word):
 *
 *   open / launch / start <app>     her Windows apps worker (Start menu)
 *   open <site> | <domain>          a new tab in her Chrome
 *   open <folder>                   File Explorer (Downloads, Documents, …)
 *   pause / play / next / previous  the music (Windows media controls)
 *
 * Deliberately narrow. The whole utterance must be the command — "open YouTube
 * and find lo-fi" or "open the file I downloaded yesterday" still go to the
 * brain — and a name the Start menu doesn't know falls through to it as well,
 * having cost a few milliseconds. Nothing here is on the owner's ask-first
 * list (opening and playing are not spending, sending or deleting), and it
 * runs only when laptop control is on (AYRA_ALLOW_WRITES).
 *
 * The brain is told afterwards what was done (`note`), so "close it again"
 * still means something on the next turn.
 */

import { spawn } from 'node:child_process'
import { IDENTITY } from './identity.mjs'

const escape = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const NAMES = [IDENTITY.name.toLowerCase(), ...IDENTITY.wake.names].map(escape).join('|')
const WEAK = IDENTITY.wake.prefixedOnly.map(escape).join('|')

/** Her name in front ("Hey AYRA, open Spotify"), politeness, and the full stop at the end. */
const LEAD = new RegExp(`^(?:(?:hey|hi|ok|okay|yo)[\\s,]+)?(?:(?:${NAMES})|(?:(?:hey|hi|ok|okay|yo)[\\s,]+(?:${WEAK})))\\b[\\s,.:!-]*`, 'i')
const POLITE_FRONT = /^(?:(?:can|could|would|will) you\s+|please\s+|kindly\s+|just\s+|quickly\s+)+/i
const POLITE_BACK = /(?:\s+(?:please|for me|now|right now|quickly|thanks|thank you))+$/i

// Not "run": "run diagnostics" is not a request to open the Memory Diagnostic.
const OPEN = /^(?:open(?: up)?|launch|start(?: up)?|fire up|bring up|pull up|go to|take me to)\s+(.+)$/i

/**
 * Sites opened as sites. Names that are also desktop apps (Spotify, WhatsApp,
 * Telegram, Netflix…) are left out on purpose: the installed app is tried
 * first through the Start menu, and the site only when it is not there.
 */
export const SITES = {
  youtube: ['YouTube', 'https://www.youtube.com/'],
  'you tube': ['YouTube', 'https://www.youtube.com/'],
  'youtube music': ['YouTube Music', 'https://music.youtube.com/'],
  gmail: ['Gmail', 'https://mail.google.com/'],
  'my email': ['Gmail', 'https://mail.google.com/'],
  'my mail': ['Gmail', 'https://mail.google.com/'],
  google: ['Google', 'https://www.google.com/'],
  'google drive': ['Google Drive', 'https://drive.google.com/'],
  'google docs': ['Google Docs', 'https://docs.google.com/'],
  'google sheets': ['Google Sheets', 'https://sheets.google.com/'],
  'google calendar': ['Google Calendar', 'https://calendar.google.com/'],
  'my calendar': ['Google Calendar', 'https://calendar.google.com/'],
  'google maps': ['Google Maps', 'https://maps.google.com/'],
  maps: ['Google Maps', 'https://maps.google.com/'],
  github: ['GitHub', 'https://github.com/'],
  'git hub': ['GitHub', 'https://github.com/'],
  chatgpt: ['ChatGPT', 'https://chatgpt.com/'],
  'chat gpt': ['ChatGPT', 'https://chatgpt.com/'],
  claude: ['Claude', 'https://claude.ai/'],
  linkedin: ['LinkedIn', 'https://www.linkedin.com/'],
  'linked in': ['LinkedIn', 'https://www.linkedin.com/'],
  twitter: ['X', 'https://x.com/'],
  reddit: ['Reddit', 'https://www.reddit.com/'],
  quora: ['Quora', 'https://www.quora.com/'],
  'stack overflow': ['Stack Overflow', 'https://stackoverflow.com/'],
  stackoverflow: ['Stack Overflow', 'https://stackoverflow.com/'],
  wikipedia: ['Wikipedia', 'https://en.wikipedia.org/'],
  amazon: ['Amazon', 'https://www.amazon.in/'],
  flipkart: ['Flipkart', 'https://www.flipkart.com/'],
  instagram: ['Instagram', 'https://www.instagram.com/'],
  facebook: ['Facebook', 'https://www.facebook.com/'],
  'hacker news': ['Hacker News', 'https://news.ycombinator.com/'],
}

/** Apps that also live on the web: the app if installed, else this site. */
const APP_OR_SITE = {
  spotify: ['Spotify', 'https://open.spotify.com/'],
  whatsapp: ['WhatsApp', 'https://web.whatsapp.com/'],
  'whats app': ['WhatsApp', 'https://web.whatsapp.com/'],
  telegram: ['Telegram', 'https://web.telegram.org/'],
  netflix: ['Netflix', 'https://www.netflix.com/'],
  discord: ['Discord', 'https://discord.com/app'],
  notion: ['Notion', 'https://www.notion.so/'],
  slack: ['Slack', 'https://app.slack.com/'],
}

/** Folders by the names people say. */
const FOLDERS = {
  downloads: 'Downloads', download: 'Downloads', documents: 'Documents', document: 'Documents',
  desktop: 'Desktop', pictures: 'Pictures', picture: 'Pictures', photos: 'Pictures',
  music: 'Music', videos: 'Videos', video: 'Videos', home: 'home',
}
const FOLDER = /^(?:my |the )?(downloads?|documents?|desktop|pictures?|photos|music|videos?|home)(?: folder)?$/i

/**
 * Words that mean the target is not a plain name: "the file I downloaded",
 * "my last email", "a new tab", "it". Those need the brain.
 */
const NOT_A_NAME =
  /\b(?:the|my|a|an|this|that|these|those|it|them|last|latest|recent|new|file|files|folder|document|email|mail|message|messages|tab|window|page|link|video|song|playlist|and|then|with|in|on|for|to|from|about|which|where|what|who|how|why|something|anything|everything)\b/i

/** A domain said as such: "youtube.com", "news.ycombinator.com". */
const DOMAIN = /^(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,})(\/\S*)?$/i

/**
 * Only with a music word: "next one", "continue" or "stop" alone mean
 * something else in a conversation (the next headline, carry on, stop
 * talking) — the review found Spotify skipping on "next one" (2026-10-12).
 * "Pause" alone is the one exception: it is not said to her otherwise.
 */
const MEDIA = [
  [/^pause$|^(?:pause|stop)(?: the| my)? (?:music|song|track|spotify|playback|audio)$/i, 'pause', 'Paused.'],
  [/^(?:play|resume|unpause|continue)(?: the| my)? (?:music|song|track|spotify|playback)$/i, 'play', 'Playing.'],
  [/^(?:next|skip)(?: the| this)? (?:song|track)$/i, 'next', 'Next.'],
  [/^(?:previous|go back a|last) (?:song|track)$/i, 'prev', 'Previous.'],
]

/** "open report.pdf" is a file, not a website called report.pdf. */
const FILE_EXT = /\.(?:pdf|txt|md|js|ts|mjs|py|java|c|cpp|cs|docx?|xlsx?|pptx?|csv|json|xml|html?|png|jpe?g|gif|svg|exe|msi|zip|rar|7z|mp3|mp4|mkv|wav|log|ini|bat|ps1)$/i

/** The command as said, without her name, politeness or end punctuation. */
export function bare(text) {
  return String(text ?? '')
    .trim()
    .replace(LEAD, '')
    // "Hey, open Spotify" — a greeting without her name is still not the command.
    .replace(/^(?:hey|hi|ok|okay|yo|so|now)[\s,]+/i, '')
    .replace(/[\s.!?]+$/, '')
    .replace(POLITE_FRONT, '')
    .replace(POLITE_BACK, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * "Stop it", "pause": stop the music — only when something IS playing (else
 * the words go to the brain; they may mean something else).
 */
const SOFT_STOP = /^(?:stop|stop it|stop that|stop this|pause it|pause that|pause this)$/i

/** "volume up", "louder", "mute" — the laptop's volume keys. */
const VOLUME = [
  [/^(?:(?:turn|put) )?(?:the )?volume up$|^(?:turn it |make it )?louder$|^increase (?:the )?volume$/i, 'up'],
  [/^(?:(?:turn|put) )?(?:the )?volume down$|^(?:turn it |make it )?(?:quieter|softer)$|^(?:decrease|lower|reduce) (?:the )?volume$/i, 'down'],
  [/^(?:mute|unmute)(?: it| the (?:sound|audio|volume|laptop))?$/i, 'mute'],
]

/** "play X", "play me X on Spotify". */
const PLAY = /^(?:play|put on)\s+(?:me\s+)?(.+?)(?:\s+(?:on|in|from)\s+(youtube|you tube|spotify))?$/i
/** Not a song: "play some music" resumes what was playing, or goes to the brain. */
const GENERIC_PLAY = /^(?:(?:some|any|a|the|my)\s+)?(?:music|songs?|tracks?|something|anything|playlist|mix|beats)(?:\s+for me)?$/i

/** "close Notepad". Never a browser, File Explorer or her: those go to the brain. */
const CLOSE = /^(?:close|quit|exit)\s+(?:the\s+)?(.+?)(?:\s+(?:app|application|window))?$/i
const NOT_CLOSED = /^(?:chrome|google chrome|browser|the browser|edge|firefox|brave|explorer|file explorer|files|ayra|it|this|that|everything|all|tab|tabs|this tab|the tab|window|windows|laptop|computer|pc)$/i

/** "search X on YouTube", "open X on YouTube", "look up X on Google". */
const SEARCH_ON = /^(?:search(?: for)?|find|look up|look for|open|show me)\s+(.+?)\s+(?:on|in)\s+(youtube|you tube|google)$/i

/** "open GitHub and LinkedIn", "open Spotify and play Shape of You". */
const AND = /\s+(?:and then|then|and|,)\s+/i

/**
 * What the owner asked for, if it is one of the fast shapes; null otherwise.
 *
 * @returns {{ kind: 'site', name: string, url: string }
 *   | { kind: 'folder', name: string, folder: string }
 *   | { kind: 'app', name: string, site?: { name: string, url: string } }
 *   | { kind: 'media', action: 'pause'|'play'|'next'|'prev', said: string, soft?: boolean }
 *   | { kind: 'volume', action: 'up'|'down'|'mute' }
 *   | { kind: 'youtube', query: string } | { kind: 'spotify', query: string }
 *   | { kind: 'close', name: string }
 *   | { kind: 'many', steps: object[] } | null}
 */
export function parseFast(text) {
  const said = bare(text)
  if (!said || said.length > 90) return null
  const one = parseOne(said)
  if (one) return one
  // Several things in one breath: each part must be a fast shape on its own;
  // a part without a verb borrows the first part's ("open GitHub and LinkedIn").
  const parts = said.split(AND).filter(Boolean)
  if (parts.length < 2 || parts.length > 3) return null
  const verb = /^(open(?: up)?|launch|start|play|close)\b/i.exec(parts[0])?.[1]
  if (!verb) return null
  let steps = []
  for (const p of parts) {
    const step = parseOne(/^(?:open|launch|start|play|close|put on|go to|take me to|search|find|look up)\b/i.test(p) ? p : `${verb} ${p}`)
    if (!step || step.kind === 'many' || step.soft) return null
    steps.push(step)
  }
  // "Open Spotify and play X": X plays on Spotify, which opens it anyway.
  if (steps.some((x) => x.kind === 'app' && /^spotify$/i.test(x.name))) {
    steps = steps.filter((x) => !(x.kind === 'app' && /^spotify$/i.test(x.name))).map((x) => (x.kind === 'youtube' ? { kind: 'spotify', query: x.query } : x))
  }
  // "Open YouTube and play lofi": the video's own tab is enough.
  if (steps.some((x) => x.kind === 'youtube')) steps = steps.filter((x) => !(x.kind === 'site' && x.name === 'YouTube'))
  // "Open the browser and open YouTube": YouTube opens in her Chrome anyway — no spare Google tab.
  if (steps.length > 1 && steps.some((x) => x.kind === 'site' && x.name !== 'Chrome')) steps = steps.filter((x) => !(x.kind === 'site' && x.name === 'Chrome'))
  return steps.length === 1 ? steps[0] : { kind: 'many', steps }
}

/** One command, or null. */
function parseOne(said) {
  for (const [re, action, line] of MEDIA) if (re.test(said)) return { kind: 'media', action, said: line }
  if (SOFT_STOP.test(said)) return { kind: 'media', action: 'pause', said: 'Paused.', soft: true }
  for (const [re, action] of VOLUME) if (re.test(said)) return { kind: 'volume', action }

  const p = PLAY.exec(said)
  if (p) {
    const query = p[1].trim()
    if (GENERIC_PLAY.test(query)) return /spotify/i.test(p[2] ?? '') ? null : { kind: 'media', action: 'play', said: 'Playing.', soft: true }
    if (query.length < 2 || /^(?:it|that|this|the music|music)$/i.test(query)) return null
    return /spotify/i.test(p[2] ?? '') ? { kind: 'spotify', query } : { kind: 'youtube', query }
  }

  // "search lofi beats on YouTube", "look up the weather on Google": the results page, at once.
  const q = SEARCH_ON.exec(said)
  if (q) {
    const query = q[1].trim()
    const youtube = /you\s?tube/i.test(q[2])
    return {
      kind: 'site',
      name: youtube ? 'YouTube' : 'Google',
      url: youtube ? `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}` : `https://www.google.com/search?q=${encodeURIComponent(query)}`,
    }
  }

  const c = CLOSE.exec(said)
  if (c) {
    const name = c[1].trim()
    if (NOT_CLOSED.test(name) || name.split(' ').length > 3 || !/^[\p{L}\p{N} .+&'-]+$/u.test(name)) return null
    return { kind: 'close', name }
  }

  const m = OPEN.exec(said)
  if (!m) return null
  return openTarget(m[1], said)
}

/** What "open <target>" means: a folder, a site, an app — or null for the brain. */
function openTarget(raw, said) {
  const target = raw.trim().replace(/\s+(?:app|application|website|site|for me)$/i, '').trim()
  const key = target.toLowerCase()

  // A folder only when "opened" or gone to — "start the video" is not the
  // Videos folder — and music or videos only when called a folder.
  const folder = FOLDER.exec(key)
  if (folder) {
    const f = FOLDERS[folder[1].toLowerCase()]
    const opened = /^(?:open|go to|take me to)\b/i.test(said)
    if (!opened || ((f === 'Music' || f === 'Videos') && !/\bfolder$/.test(key))) return null
    return { kind: 'folder', name: f === 'home' ? 'your home folder' : `your ${f}`, folder: f }
  }
  if (SITES[key]) return { kind: 'site', name: SITES[key][0], url: SITES[key][1] }
  const d = DOMAIN.exec(target)
  if (d && !/\s/.test(target)) {
    if (!d[2] && FILE_EXT.test(d[1])) return null
    return { kind: 'site', name: d[1].replace(/^www\./i, ''), url: `https://${d[1]}${d[2] ?? '/'}` }
  }
  if (APP_OR_SITE[key]) {
    const [name, url] = APP_OR_SITE[key]
    return { kind: 'app', name, site: { name, url } }
  }
  // "the browser": her Chrome, on a new tab.
  if (/^(?:the )?(?:browser|chrome|google chrome)$/i.test(key)) return { kind: 'site', name: 'Chrome', url: 'https://www.google.com/' }
  // An app by its Start-menu name: one to four plain words.
  const words = target.split(' ')
  if (words.length > 4 || NOT_A_NAME.test(target) || !/^[\p{L}\p{N} .+&'-]+$/u.test(target)) return null
  return { kind: 'app', name: target }
}

/**
 * Do it. Returns what to say and the note for the brain, or null to hand the
 * question to the brain after all (no such app, Chrome not reachable, …).
 *
 * @param {ReturnType<typeof parseFast>} intent
 * @param {{ openApp: (name: string) => Promise<{ app: string }>, openFolder: (folder: string) => Promise<void>,
 *           openSite: (url: string) => Promise<void>, media: { command: (a: string) => Promise<boolean> },
 *           volume?: (a: string) => Promise<boolean>, youtube?: (q: string) => Promise<{ title: string }>,
 *           spotify?: (q: string) => Promise<{ played: boolean }>, closeApp?: (name: string) => Promise<{ app: string, waiting: boolean }> }} hands
 * @returns {Promise<{ said: string, note: string } | null>}
 */
export async function runFast(intent, hands) {
  if (!intent) return null
  try {
    if (intent.kind === 'many') {
      const notes = []
      for (const step of intent.steps) {
        const did = await runFast(step, hands)
        // A step that can't be done fast: the brain does the whole thing.
        if (!did) return notes.length ? { said: 'Done, partly.', note: `${notes.join('; ')} — the rest wasn't done` } : null
        notes.push(did.note)
      }
      const last = intent.steps.at(-1)
      return { said: last.kind === 'youtube' || last.kind === 'spotify' ? 'Playing.' : 'Opened.', note: notes.join('; ') }
    }
    if (intent.kind === 'media') {
      const done = await hands.media.command(intent.action)
      if (done) return { said: intent.said, note: `the music: ${intent.action}` }
      // "Stop it" with nothing playing, "play some music" with nothing to
      // resume: the words may mean something else — the brain's.
      if (intent.soft || intent.action === 'play') return null
      // Nothing playing to pause or skip: say so. Handed to the brain, it once
      // reached for a PowerShell media key that waited two minutes on an
      // Approve nobody was there to give (2026-10-12).
      return { said: 'Nothing is playing right now.', note: `the music: ${intent.action} — nothing was playing` }
    }
    if (intent.kind === 'volume') {
      if (!hands.volume || !(await hands.volume(intent.action))) return null
      return { said: 'Done.', note: `the volume: ${intent.action}` }
    }
    if (intent.kind === 'youtube') {
      if (!hands.youtube) return null
      const { title } = await hands.youtube(intent.query)
      return { said: 'Playing.', note: `playing "${title || intent.query}" on YouTube in her Chrome` }
    }
    if (intent.kind === 'spotify') {
      if (!hands.spotify) return null
      const { played } = await hands.spotify(intent.query)
      return played
        ? { said: 'Playing.', note: `playing "${intent.query}" on Spotify` }
        : { said: 'Opened.', note: `opened Spotify's search for "${intent.query}" — the top result wasn't started` }
    }
    if (intent.kind === 'close') {
      if (!hands.closeApp) return null
      const { app, waiting } = await hands.closeApp(intent.name)
      return waiting
        ? { said: `${app} is asking something before it closes.`, note: `asked ${app} to close; it is waiting on a question` }
        : { said: 'Closed.', note: `closed ${app}` }
    }
    if (intent.kind === 'site') {
      await hands.openSite(intent.url)
      return { said: 'Opened.', note: `opened ${intent.name} (${intent.url}) in a new tab of her Chrome` }
    }
    if (intent.kind === 'folder') {
      await hands.openFolder(intent.folder)
      return { said: 'Opened.', note: `opened ${intent.name} in File Explorer` }
    }
    if (intent.kind === 'app') {
      try {
        const { app } = await hands.openApp(intent.name)
        return { said: 'Opened.', note: `opened the ${app} app` }
      } catch (err) {
        if (!intent.site) throw err
        await hands.openSite(intent.site.url)
        return { said: 'Opened.', note: `opened ${intent.site.name} on the web (${intent.site.url}) — the app isn't installed` }
      }
    }
  } catch {
    return null
  }
  return null
}

/** Known folders as File Explorer names them, so a moved Documents (OneDrive) still opens. */
const SHELL_FOLDERS = {
  Downloads: 'shell:Downloads', Documents: 'shell:Personal', Desktop: 'shell:Desktop', Pictures: 'shell:My Pictures',
  Music: 'shell:My Music', Videos: 'shell:My Video', home: 'shell:Profile',
}

/**
 * The real hands, for the bridge.
 *   appsCall     — the Windows apps worker's call (apps.mjs): 'open' finds the
 *                  app by its Start-menu name, strictly (no "contains" match) and
 *                  without waiting for its window
 *   openInChrome — a new tab in her Chrome (browser.mjs)
 *   media        — createMedia() (media.mjs)
 */
export function createHands({ appsCall, openInChrome, playOnYouTube, media, isOwnWindow = () => false }) {
  return {
    openApp: (name) => appsCall('open', { name, strict: true, wait: false }),
    volume: (action) => media.volume(action),
    youtube: playOnYouTube,
    spotify: async (query) => {
      // Spotify's own search (its spotify: link), then the song itself: a
      // "Play <song>" button when the app shows one, else its row selected and
      // Enter. Measured 2026-10-18: results are readable ~1.8 s after the link.
      // The brain took 49 s for the same, clicking its way through.
      spawn('explorer.exe', [`spotify:search:${query}`], { detached: true, stdio: 'ignore' }).unref()
      const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
      const names = (x) => String(x.name ?? '').toLowerCase()
      const about = (x) => words.length && words.every((w) => names(x).includes(w))
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 400))
        let seen
        try {
          seen = await appsCall('read', { window: 'Spotify' })
        } catch {
          continue
        }
        // Spotify's own window — never a browser tab that happens to say "Spotify".
        if (!/^spotify$/i.test(seen?.window?.app ?? '')) continue
        const items = (seen?.items ?? []).filter((x) => x.ref)
        const button = items.find((x) => /button/i.test(x.type) && /^play /i.test(x.name ?? '') && about(x))
        const row = items.find((x) => /row/i.test(x.type) && about(x))
        if (!button && !row) continue
        if (button) await appsCall('click', { ref: button.ref })
        else {
          await appsCall('click', { ref: row.ref })
          await appsCall('keys', { keys: '{ENTER}', window: String(seen.window.id) })
        }
        // Said "Playing." only when Windows' media controls say Spotify is.
        await new Promise((r) => setTimeout(r, 900))
        return { played: await media.playing(/spotify/i) }
      }
      return { played: false }
    },
    closeApp: async (name) => {
      const { window } = await appsCall('describe', { window: name })
      if (!window || isOwnWindow(window.title)) throw new Error('not a window to close')
      const { window: w, waiting } = await appsCall('close', { window: String(window.id) })
      return { app: w.app || name, waiting }
    },
    openFolder: async (folder) => {
      const where = SHELL_FOLDERS[folder]
      if (!where) throw new Error(`unknown folder ${folder}`)
      spawn('explorer.exe', [where], { detached: true, stdio: 'ignore', windowsHide: false }).unref()
    },
    openSite: openInChrome,
    media,
  }
}

/** The line put in front of the brain's next question, so it knows what happened. */
export const noteFor = (notes) =>
  notes.length ? `[Done just now without you, at the owner's word: ${notes.join('; ')}.]\n` : ''
