/**
 * One warm connection to ElevenLabs for her voice.
 *
 * Measured by the latency audit (2026-10-12): global fetch's pool drops an
 * idle socket after 4 s (ElevenLabs sends no Keep-Alive hint), and a turn's
 * first sentence comes well over 4 s after the last one — so nearly every
 * answer paid a fresh TCP + TLS handshake, 0.15–0.58 s, before a word could be
 * synthesised. A keep-alive https.Agent holds the socket as long as the server
 * allows, and `preconnect` opens one while the owner is still talking or the
 * brain is still thinking, so the first sentence finds it ready.
 */

import https from 'node:https'

export const ELEVEN_HOST = 'api.elevenlabs.io'

const agent = new https.Agent({ keepAlive: true, keepAliveMsecs: 15_000, maxSockets: 4 })

/**
 * A request to ElevenLabs through the warm agent. Resolves with the response
 * as soon as its headers arrive, so a streamed body can be piped on.
 *
 * @param {string} path  e.g. '/v1/text-to-speech/<voice>/stream?…'
 * @param {{ method?: string, headers?: Record<string, string>, body?: string | Buffer, timeoutMs?: number }} [options]
 * @returns {Promise<import('node:http').IncomingMessage>}
 */
export function elevenRequest(path, { method = 'POST', headers = {}, body, timeoutMs = 30_000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request({ host: ELEVEN_HOST, path, method, headers, agent, timeout: timeoutMs }, resolve)
    req.on('timeout', () => req.destroy(new Error('ElevenLabs took too long to answer')))
    req.on('error', reject)
    req.end(body)
  })
}

/** Read a whole (small) response as text — for error bodies. */
export async function readAll(res) {
  let out = ''
  for await (const chunk of res) {
    out += chunk
    if (out.length > 16_384) break
  }
  return out
}

let lastPreconnect = 0

/**
 * Have a socket open before it is needed. Key-less and bodiless (a HEAD of the
 * API root, which answers 404 and costs no credits); at most once every ten
 * seconds, and never an error anyone sees.
 */
export function preconnect(now = Date.now()) {
  if (now - lastPreconnect < 10_000) return
  lastPreconnect = now
  elevenRequest('/', { method: 'HEAD', timeoutMs: 5000 })
    .then((res) => res.resume())
    .catch(() => {})
}
