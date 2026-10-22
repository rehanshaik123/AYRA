import { readFileSync } from 'node:fs'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * index.html is static, so it cannot import config/identity.json the way the
 * components do. This fills its %AYRA_*% placeholders at serve and build time
 * so the tab title follows the identity file like everything else — and points
 * the page's security policy at the bridge the face is built for: it named
 * port 8787 only, so a face built for a test bridge (VITE_BRIDGE_URL on 8788)
 * could open its socket but not reach /health, /tts or /stt (2026-10-20).
 */
function identityHtml(bridgePort: string): Plugin {
  return {
    name: 'ayra-identity-html',
    transformIndexHtml(html) {
      const identity = JSON.parse(readFileSync('config/identity.json', 'utf8'))
      return html
        .replaceAll('%AYRA_WORDMARK%', identity.wordmark)
        .replaceAll('localhost:8787', `localhost:${bridgePort}`)
        .replaceAll('127.0.0.1:8787', `127.0.0.1:${bridgePort}`)
    },
  }
}

/** The bridge's port, from VITE_BRIDGE_URL (the same value src/config.ts reads). */
function bridgePort(mode: string): string {
  const url = loadEnv(mode, process.cwd(), 'VITE_').VITE_BRIDGE_URL?.trim()
  try {
    return (url && new URL(url.replace(/^ws/, 'http')).port) || '8787'
  } catch {
    return '8787'
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), identityHtml(bridgePort(mode))],
  server: {
    // Honour PORT so a second instance can run alongside the first. The bridge
    // only accepts sockets from localhost:5173-5199, so stay inside that range
    // or set AYRA_ALLOWED_ORIGINS to match.
    port: Number(process.env.PORT) || 5173,
  },
}))
