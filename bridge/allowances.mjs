/**
 * Standing allowances — "Always allow here" (the owner's answer 1a, 2026-10-05).
 *
 * Of the four kinds of action that ask the owner first, only sending or posting
 * can be allowed ahead of time, and only for one website or one app at a time:
 * "post on linkedin.com", "send in Teams". Spending money, deleting for good and
 * passwords or security settings always ask (CLAUDE.md §7).
 *
 * An allowance is made only by the owner's own button — on the Approve card or
 * in Telegram — never by AYRA. Her tools can list allowances and take them back,
 * not add them, so a web page that talks her into something cannot also talk
 * her into allowing it next time.
 *
 * Kept in data/state.json under `allowances`.
 */

import { ASK } from './gate.mjs'
import { createStore } from './state.mjs'

/** The asks that can be allowed ahead of time. */
export const ALLOWABLE = new Set([ASK.send])

/** The website a page belongs to, as an allowance names it: "linkedin.com". */
export function siteOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** "on linkedin.com" / "in teams" — how the owner reads an allowance's place. */
export const placeOf = (scope) => `${scope.kind === 'site' ? 'on' : 'in'} ${scope.where}`

/** One allowance as a line: "send or post on linkedin.com". */
export const describe = (a) => `send or post ${placeOf(a)}`

const valid = (scope) =>
  scope && (scope.kind === 'site' || scope.kind === 'app') && typeof scope.where === 'string' && scope.where.trim() !== ''

/** @param {{ store?: { get: Function, set: Function } }} [options] tests pass their own store */
export function createAllowances({ store = createStore() } = {}) {
  const read = () => {
    const list = store.get('allowances')
    return Array.isArray(list) ? list.filter(valid) : []
  }
  const write = (list) => store.set('allowances', list)

  // A site allowance covers its subdomains ("linkedin.com" → "in.linkedin.com"),
  // never the other way round, and never a look-alike ("evil-linkedin.com").
  const covers = (a, scope) =>
    a.kind === scope.kind &&
    (a.where === scope.where || (a.kind === 'site' && scope.where.endsWith(`.${a.where}`)))

  const allows = ({ reason, scope } = {}) =>
    ALLOWABLE.has(reason) && valid(scope) && read().some((a) => a.reason === reason && covers(a, scope))

  return {
    /** Can this go ahead without asking? */
    allows,

    /** Whether an ask could be allowed ahead — and so gets the third button. */
    allowable: ({ reason, scope } = {}) => ALLOWABLE.has(reason) && valid(scope),

    /** Only the owner's button calls this (approvals.mjs). True if it is (now) allowed. */
    add({ reason, scope } = {}) {
      if (!ALLOWABLE.has(reason) || !valid(scope)) return false
      if (allows({ reason, scope })) return true
      const where = scope.where.trim().toLowerCase()
      write([...read(), { kind: scope.kind, where, reason, at: new Date().toISOString() }])
      return true
    },

    /**
     * Take one back, by its number in `list()` (1-based) or by its place
     * ("linkedin.com", "teams"). Returns what was removed, or null.
     */
    remove(which) {
      const list = read()
      const n = Number(which)
      const at = Number.isInteger(n) && n >= 1 && n <= list.length
        ? n - 1
        : list.findIndex((a) => a.where === String(which ?? '').trim().toLowerCase().replace(/^www\./, ''))
      if (at < 0) return null
      const [gone] = list.splice(at, 1)
      write(list)
      return gone
    },

    list: read,
  }
}
