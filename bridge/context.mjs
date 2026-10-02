/**
 * What AYRA should know about "now" on every turn.
 *
 * The model has no clock. Without this, "remind me tomorrow", "what's on
 * today" and "how long until Friday" are all guesses. The stamp rides on each
 * user message rather than the system prompt on purpose: the system prompt
 * is the cached prefix of every request, and a value that changes every
 * minute there would invalidate the cache on every single turn.
 */

import { IDENTITY } from './identity.mjs'

/**
 * "Friday, 2 October 2026, 14:05 (Asia/Kolkata)" — the owner's local time,
 * in the time zone set in config/identity.json.
 */
export function localTime(now = new Date(), timeZone = IDENTITY.timezone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  )
  return `${parts.weekday}, ${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute} (${timeZone})`
}

/** "2026-10-02" — the owner's local calendar date, for day-named files. */
export function localDate(now = new Date(), timeZone = IDENTITY.timezone) {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** The line put in front of every question. The persona knows not to read it out. */
export const stamp = (text, now = new Date()) => `[Now: ${localTime(now)}]\n${text}`
