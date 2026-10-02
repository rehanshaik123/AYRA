/**
 * Who is allowed to talk to this bridge.
 *
 * A WebSocket handshake is not subject to the same-origin policy: the browser
 * sends it on behalf of whatever page asked, no preflight stands in the way,
 * and the page reads every byte that comes back. Without a check here, any tab
 * the user happens to have open could open a socket to ws://localhost:8787,
 * drive the agent with every MCP server on this machine, and read back every
 * token and panel. The Origin header is the only thing that separates our own
 * dev server from someone else's page, so it is checked explicitly.
 *
 * A missing Origin means a non-browser client — curl, a script, a native app.
 * That is also exactly what local malware looks like, so it is refused on the
 * socket unless AYRA_ALLOW_NO_ORIGIN=1 says otherwise.
 */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * Vite takes the next free port when 5173 is busy and `vite preview` starts at
 * 4173, so the dev ranges are allowed rather than two exact numbers. Anything
 * else — including localhost on a port some other app is serving — has to be
 * named in AYRA_ALLOWED_ORIGINS.
 */
const isDevPort = (port) =>
  (port >= 5173 && port <= 5199) || (port >= 4173 && port <= 4199)

/**
 * @param {{ extraOrigins?: string, allowNoOrigin?: boolean }} options
 *   extraOrigins — comma-separated origins to accept besides local dev ones
 * @returns {{ allowed: (origin?: string) => boolean, extra: Set<string>, allowNoOrigin: boolean }}
 */
export function createOriginCheck({ extraOrigins = '', allowNoOrigin = false } = {}) {
  const extra = new Set(
    extraOrigins
      .split(',')
      .map((s) => s.trim().replace(/\/+$/, ''))
      .filter(Boolean),
  )

  function allowed(origin) {
    if (!origin) return allowNoOrigin
    if (extra.has(origin.replace(/\/+$/, ''))) return true
    let url
    try {
      url = new URL(origin)
    } catch {
      return false
    }
    if (url.protocol !== 'http:') return false
    if (!LOCAL_HOSTS.has(url.hostname)) return false
    return isDevPort(Number(url.port))
  }

  return { allowed, extra, allowNoOrigin }
}
