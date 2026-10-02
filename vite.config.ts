import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * index.html is static, so it cannot import config/identity.json the way the
 * components do. This fills its %AYRA_*% placeholders at serve and build time
 * so the tab title follows the identity file like everything else.
 */
function identityHtml(): Plugin {
  return {
    name: 'ayra-identity-html',
    transformIndexHtml(html) {
      const identity = JSON.parse(readFileSync('config/identity.json', 'utf8'))
      return html.replaceAll('%AYRA_WORDMARK%', identity.wordmark)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), identityHtml()],
  server: {
    // Honour PORT so a second instance can run alongside the first. The bridge
    // only accepts sockets from localhost:5173-5199, so stay inside that range
    // or set AYRA_ALLOWED_ORIGINS to match.
    port: Number(process.env.PORT) || 5173,
  },
  optimizeDeps: {
    // kokoro-js pulls in `phonemizer`, which carries espeak-ng as inline WASM.
    // Vite's dependency pre-bundler rewrites that initialisation and the
    // language table ends up empty — the symptom is
    // `Invalid language identifier: "en". Should be one of: .` at generate()
    // time, long after the model has loaded successfully. Serving these
    // untouched fixes it.
    exclude: ['kokoro-js', 'phonemizer', '@huggingface/transformers'],
  },
})
