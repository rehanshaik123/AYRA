/**
 * AYRA's identity, as the face sees it.
 *
 * The same config/identity.json the bridge reads, so the two halves can never
 * disagree about the name, the wake words, the honorific or the language.
 * Change identity there, never by hard-coding it in a component.
 */

import identity from '../config/identity.json'

export type Identity = {
  name: string
  wordmark: string
  /** The line under the wordmark on the HUD. */
  tagline: string
  /** How AYRA addresses the owner — "sir", "boss", a name. Empty for none. */
  honorific: string
  /** BCP-47 tag for speech recognition and the preferred voice, e.g. en-IN. */
  language: string
  /** IANA time zone the owner lives in, e.g. Asia/Kolkata. */
  timezone: string
  /** elevenLabsId: the premium voice, used whenever an ElevenLabs key is set. */
  voice: { gender: 'female' | 'male'; prefer: string[]; elevenLabsId?: string }
  wake: { names: string[]; prefixedOnly: string[] }
}

export const IDENTITY = identity as Identity

/** ", sir" when an honorific is configured, "" when not — for line endings. */
export const withHonorific = (line: string): string => {
  const h = IDENTITY.honorific.trim()
  if (!h) return line
  // Attach before the final punctuation: "Working on it." -> "Working on it, sir."
  const m = /^(.*?)([.?!]*)$/.exec(line)!
  return `${m[1]}, ${h}${m[2] || '.'}`
}
