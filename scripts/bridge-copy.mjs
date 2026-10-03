/**
 * A test copy of the bridge, safe to run next to the owner's AYRA.
 *
 * Not named test-*.mjs on purpose: node --test runs any file named that way,
 * and this one never exits.
 *
 * Port 8788 and Telegram off by default, so it can never read the owner's bot
 * (two readers make Telegram refuse one of them) or take the HUD's port. Any
 * AYRA_* already set wins, e.g. AYRA_RESUME_HOURS=0 for a fresh conversation.
 *
 *   npm run bridge:test
 *   then: AYRA_BRIDGE_PORT=8788 npm run smoke   (or npm run bench)
 */

process.env.AYRA_BRIDGE_PORT ??= '8788'
process.env.AYRA_TELEGRAM ??= 'off'

await import('../bridge/server.mjs')
