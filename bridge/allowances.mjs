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
 * An allowance names one exact address ("www.linkedin.com" — never all of
 * google.com, which would take in Gmail and Drive) or one program that is not a
 * browser or a host for other apps, and covers only a click on a plainly
 * sending button (SEND_WORDS) — never an Enter or a generic Submit.
 *
 * Kept in data/state.json under `allowances`, each one signed with a key in
 * data/allowance.key — a file the gate refuses to her tools — so an entry
 * written into the state file by anything but the owner's button is ignored.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { ASK } from './gate.mjs'
import { STATE_FILE, createStore } from './state.mjs'

/** The asks that can be allowed ahead of time. */
export const ALLOWABLE = new Set([ASK.send])

/** Buttons that plainly send or post — the only clicks an allowance covers. */
export const SEND_WORDS = /\b(?:send|post|reply|comment|tweet|publish|share|message)\b/i

/** The key that signs allowances, made on first use. */
export const KEY_FILE = join(dirname(STATE_FILE), 'allowance.key')
function loadKey(file = KEY_FILE) {
  if (existsSync(file)) return readFileSync(file, 'utf8').trim()
  const key = randomBytes(32).toString('hex')
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, key, { mode: 0o600 })
  return key
}

/** The website a page belongs to, as an allowance names it: its exact address. */
export function siteOf(url) {
  try {
    return new URL(url).hostname.toLowerCase()
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

/**
 * @param {{ store?: { get: Function, set: Function }, key?: string }} [options]
 *   tests pass their own store and key
 */
export function createAllowances({ store = createStore(), key = null } = {}) {
  let secret = key
  const sign = (a) =>
    createHmac('sha256', (secret ??= loadKey())).update(`${a.kind}|${a.where}|${a.reason}|${a.at}`).digest('hex')
  const signed = (a) => {
    const want = Buffer.from(sign(a))
    const got = Buffer.from(String(a.mac ?? ''))
    return got.length === want.length && timingSafeEqual(got, want)
  }
  const read = () => {
    const list = store.get('allowances')
    return Array.isArray(list) ? list.filter((a) => valid(a) && signed(a)) : []
  }
  const write = (list) => store.set('allowances', list)

  // The exact place only: an allowance for one address says nothing about its
  // neighbours.
  const covers = (a, scope) => a.kind === scope.kind && a.where === scope.where.trim().toLowerCase()

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
      const entry = { kind: scope.kind, where: scope.where.trim().toLowerCase(), reason, at: new Date().toISOString() }
      write([...read(), { ...entry, mac: sign(entry) }])
      return true
    },

    /**
     * Take one back, by its number in `list()` (1-based) or by its place
     * ("www.linkedin.com", "linkedin.com", "teams"). Returns what was removed, or null.
     */
    remove(which) {
      const list = read()
      const n = Number(which)
      const name = String(which ?? '').trim().toLowerCase()
      const at = Number.isInteger(n) && n >= 1 && n <= list.length
        ? n - 1
        : list.findIndex((a) => a.where === name || a.where === `www.${name}` || `www.${a.where}` === name)
      if (at < 0) return null
      const [gone] = list.splice(at, 1)
      write(list)
      return gone
    },

    list: read,
  }
}
