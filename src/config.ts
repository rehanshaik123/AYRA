/**
 * AYRA configuration (the face). Identity itself lives in config/identity.json.
 *
 * Read from Vite env vars (.env.local). Only VITE_* values reach the browser,
 * so nothing secret belongs here — the bridge holds every key.
 */

/**
 * Vite inlines a blank `.env` entry as an empty string, not as undefined, so
 * `??` never falls through to the default. Treat whitespace-only as unset.
 */
function str(raw: unknown): string | undefined {
  const value = typeof raw === 'string' ? raw.trim() : ''
  return value === '' ? undefined : value
}

/**
 * Where the bridge lives. Derived once here rather than in each of the places
 * that talk to it, so moving off the default port is a single edit. `wss://`
 * maps to `https://` on its own, which is why this is a prefix swap rather than
 * a hardcoded scheme.
 */
export const BRIDGE_WS_URL = str(import.meta.env.VITE_BRIDGE_URL) ?? 'ws://localhost:8787'
export const BRIDGE_HTTP_URL = BRIDGE_WS_URL.replace(/^ws/, 'http')
