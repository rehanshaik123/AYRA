import { create } from 'zustand'

export type Phase =
  | 'offline'   // waiting for the click that unlocks audio
  | 'boot'      // startup sequence
  | 'dormant'   // powered down, waiting for the wake word
  | 'waking'    // wake word hit, spin-up animation
  | 'listening' // capturing speech
  | 'thinking'  // model is generating
  | 'tooling'   // an MCP tool is running
  | 'speaking'  // reading the answer back

/**
 * A blade — the one surface AYRA puts things on: search results, an article,
 * a picture, a video. Blades own their own geometry, stack rather than replace
 * each other, and can be pulled forward or thrown full screen by the user.
 */
export type Blade = {
  id: string
  title: string
  kind: 'article' | 'image' | 'gallery' | 'video' | 'embed' | 'markup'
  /** article / image / video / embed. */
  url?: string
  /** gallery. */
  images?: string[]
  /** markup — model-authored HTML, sanitised before it renders. */
  html?: string
  /** article only: the words restyled, or the real page. */
  mode?: 'reader' | 'live'
  size: 'compact' | 'tall' | 'wide' | 'full'
  hold: 'turn' | 'sticky'
}

/** Something AYRA wants to do that the owner chose to be asked about first. */
export type Approval = {
  id: string
  /** What kind of thing it is — "deletes something for good". */
  reason: string
  /** Exactly what would happen — the command, the file, the button. */
  detail: string
  tool: string
  /** "Always on linkedin.com" when it can be allowed ahead of time, else ''. */
  always?: string
}

export type Turn = {
  id: string
  role: 'user' | 'assistant'
  text: string
  /** Tool names invoked while producing this turn, for the HUD readout. */
  tools?: string[]
}

type State = {
  phase: Phase
  /** 0..1 loudness — the mic, or AYRA's own voice while she speaks. */
  level: number
  /** What JARVIS is currently reading aloud or has just said. */
  caption: string
  turns: Turn[]
  activeTool: string | null
  error: string | null
  connected: string[]
  /** Name of the speech-synthesis voice in use, shown in the HUD. */
  voice: string
  /** Blades currently open, newest last — which is also front-most. */
  blades: Blade[]
  /** The blade the user has pulled forward, or null for "the newest one". */
  focusedBlade: string | null
  /** A blade thrown to full screen, or null. */
  expandedBlade: string | null
  /** Actions waiting for the owner's yes, oldest first. */
  approvals: Approval[]

  setVoice: (v: string) => void
  pushBlade: (b: Blade) => void
  closeBlade: (id: string) => void
  clearBlades: () => void
  focusBlade: (id: string | null) => void
  expandBlade: (id: string | null) => void
  addApproval: (a: Approval) => void
  removeApproval: (id: string) => void
  clearApprovals: () => void
  setPhase: (p: Phase) => void
  setLevel: (l: number) => void
  setCaption: (c: string) => void
  setActiveTool: (t: string | null) => void
  setError: (e: string | null) => void
  setConnected: (c: string[]) => void
  pushTurn: (t: Turn) => void
  appendToLastTurn: (text: string) => void
}

export const useStore = create<State>((set) => ({
  phase: 'offline',
  level: 0,
  caption: '',
  turns: [],
  activeTool: null,
  error: null,
  connected: [],
  voice: '',
  blades: [],
  focusedBlade: null,
  expandedBlade: null,
  approvals: [],

  setVoice: (voice) => set({ voice }),
  /**
   * Six is the ceiling, and it is about the stack reading as a stack: past
   * about six the ones at the back are a millimetre of edge each and the depth
   * stops meaning anything. The oldest falls off, which is also the one the
   * user has had longest to look at.
   */
  pushBlade: (blade) =>
    set((s) => {
      const next = [...s.blades.filter((b) => b.id !== blade.id), blade].slice(-6)
      // A new blade comes to the front. Leaving the old focus in place would
      // open something the user asked for and then hide it behind what they
      // were looking at before.
      return { blades: next, focusedBlade: blade.id }
    }),
  closeBlade: (id) =>
    set((s) => ({
      blades: s.blades.filter((b) => b.id !== id),
      focusedBlade: s.focusedBlade === id ? null : s.focusedBlade,
      expandedBlade: s.expandedBlade === id ? null : s.expandedBlade,
    })),
  // 'turn' blades go when the user speaks again,
  // 'sticky' ones stay until something replaces them.
  clearBlades: () =>
    set((s) => {
      const kept = s.blades.filter((b) => b.hold === 'sticky')
      const alive = new Set(kept.map((b) => b.id))
      return {
        blades: kept,
        focusedBlade: s.focusedBlade && alive.has(s.focusedBlade) ? s.focusedBlade : null,
        expandedBlade: s.expandedBlade && alive.has(s.expandedBlade) ? s.expandedBlade : null,
      }
    }),
  focusBlade: (focusedBlade) => set({ focusedBlade }),
  expandBlade: (expandedBlade) => set({ expandedBlade }),
  addApproval: (a) =>
    set((s) => (s.approvals.some((x) => x.id === a.id) ? {} : { approvals: [...s.approvals, a] })),
  removeApproval: (id) => set((s) => ({ approvals: s.approvals.filter((a) => a.id !== id) })),
  clearApprovals: () => set({ approvals: [] }),
  setPhase: (phase) => set({ phase }),
  setLevel: (level) => set({ level }),
  setCaption: (caption) => set({ caption }),
  setActiveTool: (activeTool) => set({ activeTool }),
  setError: (error) => set({ error }),
  setConnected: (connected) => set({ connected }),
  pushTurn: (turn) => set((s) => ({ turns: [...s.turns.slice(-40), turn] })),
  appendToLastTurn: (text) =>
    set((s) => {
      const turns = [...s.turns]
      const last = turns[turns.length - 1]
      if (!last || last.role !== 'assistant') return {}
      turns[turns.length - 1] = { ...last, text: last.text + text }
      return { turns }
    }),
}))

/** Colour identity per phase — shared by the avatar and the HUD. */
export const phaseColor: Record<Phase, string> = {
  offline: '#0d4a4a',
  boot: '#17b3b3',
  dormant: '#12908f',
  waking: '#5cf2ef',
  listening: '#19d8d2',
  thinking: '#f0a93c',
  tooling: '#a97bff',
  speaking: '#3ef2a8',
}

/** What colour the interface is right now. */
export function accentFor(phase: Phase): string {
  return phaseColor[phase]
}

// Handy while dressing the scene for camera: in the dev server you can drive
// the visuals from the console without talking, e.g.
//   __ayra.setPhase('tooling'); __ayra.setLevel(0.8)
if (import.meta.env.DEV) {
  // Not `useStore.getState()` directly: zustand replaces the state object on
  // every set, so a captured snapshot's *actions* keep working while every
  // data field reads forever as it was at module load. `__ayra.phase` said
  // 'offline' no matter what was on screen.
  ;(window as unknown as Record<string, unknown>).__ayra = new Proxy(
    {} as Record<string, unknown>,
    {
      get: (_t, key) => (useStore.getState() as Record<string | symbol, unknown>)[key],
      has: (_t, key) => key in useStore.getState(),
      ownKeys: () => Reflect.ownKeys(useStore.getState()),
      getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
    },
  )
}
