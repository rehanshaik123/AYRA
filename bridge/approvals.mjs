/**
 * The owner's Approve — the one place an "ask" from the gate waits for a yes.
 *
 * AYRA runs everything on the laptop herself except the four things the owner
 * chose to be asked about (gate.mjs ASK). When one of those comes up, the call
 * stops here until the owner answers on whichever screen is nearest — the
 * HUD's card, a spoken "yes", or the Telegram buttons; the first answer wins and
 * the others are told. No answer in two minutes is a no: an action nobody
 * approved never runs. The kill switch (`halt`) says no to everything waiting.
 *
 * Events to subscribers (HUD sockets, Telegram):
 *   { type: 'approve', id, channel, tool, reason, detail, at }  — please answer
 *   { type: 'approved', id, ok, by }                            — answered (or timed out)
 *   { type: 'halt', by }                                        — the kill switch
 *
 * The audit log gets who answered what and why it was asked, never the detail:
 * a command line can carry anything.
 */

/** How long an action waits for the owner before it is declined. */
export const APPROVAL_TIMEOUT_MS = 120_000

/**
 * @param {{ timeoutMs?: number, audit?: { log: (e: object) => void } }} [options]
 */
export function createApprovals({ timeoutMs = APPROVAL_TIMEOUT_MS, audit } = {}) {
  const waiting = new Map() // id -> { request, resolve, timer }
  const listeners = new Set()
  let seq = 0

  const tell = (event) => {
    for (const fn of listeners) {
      try {
        fn(event)
      } catch (err) {
        console.warn(`[ayra] approvals: a listener failed — ${err?.message ?? err}`)
      }
    }
  }

  const settle = (id, ok, by) => {
    const entry = waiting.get(id)
    if (!entry) return false
    waiting.delete(id)
    clearTimeout(entry.timer)
    const { request } = entry
    audit?.log({ type: 'approval', channel: request.channel, tool: request.tool, reason: request.reason, ok, by })
    console.log(`[ayra] approval ${id}: ${ok ? 'yes' : 'no'} (${by}) — ${request.reason}`)
    tell({ type: 'approved', id, ok, by })
    entry.resolve(ok)
    return true
  }

  return {
    /**
     * Ask the owner. Resolves true only on an explicit yes.
     * @param {{ channel: string, tool: string, reason: string, detail?: string }} what
     */
    ask({ channel, tool, reason, detail = '' }) {
      const id = `ap${++seq}`
      const request = { id, channel, tool, reason, detail: String(detail ?? '').slice(0, 400), at: Date.now() }
      return new Promise((resolve) => {
        const timer = setTimeout(() => settle(id, false, 'timeout'), timeoutMs)
        timer.unref?.()
        waiting.set(id, { request, resolve, timer })
        tell({ type: 'approve', ...request })
      })
    },

    /** The owner's answer. False if it was already answered or never asked. */
    answer(id, ok, by = 'owner') {
      return settle(id, ok === true, by)
    },

    /** The kill switch: no to everything waiting. Returns how many were waiting. */
    halt(by = 'owner') {
      const ids = [...waiting.keys()]
      for (const id of ids) settle(id, false, `halt:${by}`)
      audit?.log({ type: 'halt', by, declined: ids.length })
      tell({ type: 'halt', by })
      return ids.length
    },

    /** What is waiting right now, oldest first — for a screen that just connected. */
    pending() {
      return [...waiting.values()].map((e) => e.request)
    },

    /** Hear every event; returns the way to stop hearing them. */
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
}
