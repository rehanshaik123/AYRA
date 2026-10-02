/**
 * The Telegram channel — AYRA from the owner's phone, anywhere.
 *
 * Long polling: the bridge asks Telegram for new messages (getUpdates waits up
 * to fifty seconds for one), so nothing on this laptop is opened to the
 * internet — no port forwarding, no public URL — and it works behind any
 * college Wi-Fi or mobile network that can reach Telegram.
 *
 * Owner-only: Telegram stamps every message with the sender's numeric id, and
 * anything not from AYRA_TELEGRAM_OWNER_ID in a private chat is ignored and
 * logged. A bot's username is public; this check is the lock.
 *
 * It is one conversation on the shared brain (channel 'telegram', resumed
 * across restarts like the HUD's), with the text persona and no HUD tools —
 * there is no screen or camera on this side.
 */

import { localTime } from './context.mjs'

const API = 'https://api.telegram.org'

/** Telegram refuses messages longer than this. */
const MAX_MESSAGE = 4096

/** Telegram's "typing…" lasts five seconds; refresh it just before it lapses. */
const TYPING_EVERY_MS = 4_500

/** A message older than this was sent while AYRA was offline. */
const STALE_SECONDS = 120

/** Splits a reply into Telegram-sized pieces, breaking at paragraphs or lines when it can. */
export function chunk(text, size = MAX_MESSAGE) {
  const pieces = []
  let rest = String(text ?? '').trim()
  while (rest.length > size) {
    const window = rest.slice(0, size)
    const cut = Math.max(window.lastIndexOf('\n\n'), window.lastIndexOf('\n'), window.lastIndexOf(' '))
    const at = cut > size / 2 ? cut : size
    pieces.push(rest.slice(0, at).trim())
    rest = rest.slice(at).trim()
  }
  if (rest) pieces.push(rest)
  return pieces
}

/** True only for a message the owner sent in a private chat with the bot. */
export const fromOwner = (message, ownerId) =>
  message?.chat?.type === 'private' &&
  message?.from?.id !== undefined &&
  String(message.from.id) === String(ownerId)

/**
 * @param {{ token: string, ownerId: string, brain: ReturnType<import('./brain.mjs').createBrain>,
 *           systemPrompt: string, servers?: Record<string, object>,
 *           audit: ReturnType<import('./audit.mjs').createAudit>,
 *           request?: (method: string, body?: object, timeoutMs?: number) => Promise<any> }} options
 *   request — how Bot API calls are made; tests pass a fake, the bridge uses the real API
 */
export function startTelegram({ token, ownerId, brain, systemPrompt, servers = {}, audit, request }) {
  const call = request ?? botApi

  async function botApi(method, body, timeoutMs = 15_000) {
    const res = await fetch(`${API}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(timeoutMs),
    })
    const data = await res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }))
    if (!data.ok) {
      const err = new Error(data.description ?? `HTTP ${res.status}`)
      err.code = data.error_code ?? res.status
      throw err
    }
    return data.result
  }

  /**
   * Send a reply, as light Markdown when Telegram accepts it. A stray * or _
   * the model wrote makes Telegram refuse the whole message as unparseable,
   * so a refusal is retried as plain text rather than lost.
   */
  async function reply(chatId, text) {
    for (const piece of chunk(text)) {
      const message = { chat_id: chatId, text: piece, link_preview_options: { is_disabled: true } }
      try {
        await call('sendMessage', { ...message, parse_mode: 'Markdown' })
      } catch (err) {
        if (err.code !== 400) throw err
        await call('sendMessage', message)
      }
    }
  }

  const typing = (chatId) => void call('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {})

  /**
   * One question at a time.
   *
   * The brain tags everything it streams with the most recent question's id,
   * which is right for the HUD — a new question there means the old one was
   * interrupted. On a phone it is not: people send three messages in a row,
   * and asking all three at once left two of them waiting for ever with
   * "typing…" running. So messages that arrive while AYRA is answering wait
   * here, and every message waiting is sent together as the next question —
   * the way a person reads a burst of texts and replies once.
   */
  const waiting = []
  let turn = null // { id, chatId, text, typing }

  function next() {
    if (turn || !waiting.length) return
    const batch = waiting.splice(0)
    const last = batch[batch.length - 1]
    const id = `tg-${last.messageId}`
    typing(last.chatId)
    turn = { id, chatId: last.chatId, text: '', typing: setInterval(() => typing(last.chatId), TYPING_EVERY_MS) }
    ensureConversation().ask(batch.map((m) => m.text).join('\n'), id)
  }

  function finish(text) {
    if (!turn) return
    const { chatId, typing: timer } = turn
    clearInterval(timer)
    turn = null
    reply(chatId, text).catch((err) => console.warn(`[ayra] telegram reply failed: ${err.message}`))
    next()
  }

  const emit = (event) => {
    if (!turn || event.ask !== turn.id) return
    if (event.type === 'text') turn.text += event.delta
    if (event.type === 'done') finish((event.text || turn.text).trim() || 'Hmm, I came up empty on that one.')
    if (event.type === 'error') finish(event.message)
  }

  let conversation = null
  const ensureConversation = () =>
    (conversation ??= brain.open({
      channel: 'telegram',
      resume: true,
      systemPrompt,
      servers,
      emit,
      // The session died: whatever was still waiting gets an answer, and the
      // next message opens a fresh conversation.
      onEnd: () => {
        conversation = null
        finish('I lost my train of thought there. Ask me again?')
      },
    }))

  async function handle(message) {
    if (!fromOwner(message, ownerId)) {
      audit.log({ type: 'telegram_ignored', from: message?.from?.id ?? null, chat: message?.chat?.type ?? null })
      return
    }
    const chatId = message.chat.id
    let text = message.text?.trim()
    if (!text) {
      await reply(chatId, 'I can only read text messages for now. Voice notes are coming soon!')
      return
    }
    if (text === '/start') text = 'Hi!'
    // Answered late because the laptop was off or asleep: say so, so "remind
    // me in five minutes" isn't taken as five minutes from now.
    const age = Date.now() / 1000 - message.date
    if (age > STALE_SECONDS) {
      text = `[Sent at ${localTime(new Date(message.date * 1000))}, while you were offline]\n${text}`
    }
    // Queued, not asked: the poll loop calls next() once the whole batch of
    // updates is in, so a burst of messages becomes one question.
    waiting.push({ chatId, messageId: message.message_id, text })
  }

  let stopped = false
  let offset = 0

  async function poll() {
    let backoff = 1_000
    while (!stopped) {
      try {
        const updates = await call('getUpdates', { offset, timeout: 50, allowed_updates: ['message'] }, 65_000)
        backoff = 1_000
        for (const update of updates) {
          offset = update.update_id + 1
          if (update.message) {
            await handle(update.message).catch((err) => console.warn(`[ayra] telegram message failed: ${err.message}`))
          }
        }
        next()
      } catch (err) {
        if (err.code === 401 || err.code === 404) {
          console.error('[ayra] telegram: the bot token was rejected — check AYRA_TELEGRAM_TOKEN in .env.local')
          return
        }
        console.warn(
          err.code === 409
            ? '[ayra] telegram: another copy of AYRA is reading this bot — is a second bridge running?'
            : `[ayra] telegram: connection problem (${err.message}); retrying in ${backoff / 1000}s`,
        )
        await new Promise((resolve) => setTimeout(resolve, backoff))
        backoff = Math.min(backoff * 2, 30_000)
      }
    }
  }

  void (async () => {
    try {
      const me = await call('getMe')
      console.log(`[ayra] telegram: @${me.username} is listening — answering only the owner`)
    } catch (err) {
      console.error(`[ayra] telegram unavailable: ${err.message}`)
      return
    }
    await poll()
  })()

  return {
    stop() {
      stopped = true
      conversation?.close()
    },
  }
}
