/**
 * "Note this, on my screen" — a picture of whatever the owner is looking at,
 * for their notes (notes.mjs `notes_picture`).
 *
 * The owner learns "anywhere" (2026-10-22): a YouTube video in her Chrome most
 * often — "when I'm watching any YouTube video, if I tell her to note this
 * which is on screen, she has to take a look and screenshot it" — but also a
 * PDF, an editor, any app. So:
 *   - her Chrome in front, or her own window (they pressed Space in it, so the
 *     thing they mean is behind it): the tab in front, over the DevTools
 *     protocol — just the player for a video, with the moment and the words
 *     said then
 *   - another app in front while a YouTube video is showing in her Chrome
 *     (notes or an editor beside the video): the video
 *   - otherwise that window, through the apps worker (PrintWindow), with the
 *     same checks as apps_screenshot — never a window of secrets
 * `prefer` settles it when the owner named it: 'video', or 'window' ("this PDF").
 * Talking from another app (Alt+Space, the bubble) leaves that app in front.
 */

import { isOwnWindow, redactSecrets, touchesSecrets } from './gate.mjs'

/** "Gradient descent - YouTube - Google Chrome" → "Gradient descent - YouTube". */
const tabTitleOf = (windowTitle) => String(windowTitle ?? '').replace(/\s+[-–]\s+Google Chrome$/, '').trim()

/**
 * @param {{ windows: boolean,
 *           appsCall: (op: string, args?: object) => Promise<any>,
 *           captureFront: (options?: { prefer?: 'video' }) => Promise<{ jpeg: Buffer, url: string, title: string, at: number | null, said?: string }>,
 *           frontTitle: () => Promise<string>,
 *           videoInView?: () => Promise<boolean> }} deps
 */
export function createScreenCapture({ windows, appsCall, captureFront, frontTitle, videoInView = async () => false }) {
  /** Whether a Chrome window in front is showing her Chrome's front tab. */
  const isHerChrome = async (title) => {
    const tab = await frontTitle().catch(() => null)
    return tab != null && tabTitleOf(title).startsWith(tab.trim().slice(0, 60))
  }

  /** The window in front, pictured through the apps worker — never one of secrets. */
  const pictureWindow = async (front) => {
    if (touchesSecrets(front.title)) throw new Error('That window shows a file of keys or passwords; it is not pictured.')
    const seen = await appsCall('read', { window: String(front.id) }).catch(() => null)
    const words = (seen?.items ?? []).map((i) => i.text ?? `${i.name ?? ''} ${i.value ?? ''}`).join('\n')
    if (seen && redactSecrets(words) !== words) throw new Error('That window shows something like a key or a password, so it is not pictured.')
    const { jpeg, window: w } = await appsCall('shot', { window: String(front.id) })
    return { jpeg: Buffer.from(jpeg, 'base64'), url: '', title: `${w?.title ?? front.title}`, app: w?.app ?? front.app, at: null, said: '' }
  }

  return async function captureScreen({ prefer } = {}) {
    if (prefer === 'video') return captureFront({ prefer: 'video' })
    if (!windows) return captureFront()
    const front = (await appsCall('front').catch(() => null))?.window
    // Nothing known in front, her own window, or her Chrome: the tab in front.
    if (!front || isOwnWindow(front.title)) return captureFront()
    if (/^chrome$/i.test(front.app) && (await isHerChrome(front.title))) return captureFront()
    if (prefer !== 'window' && (await videoInView().catch(() => false))) return captureFront({ prefer: 'video' })
    return pictureWindow(front)
  }
}
