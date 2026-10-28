import type { QualityMode } from './quality'

// Engine → UI snapshot for useSyncExternalStore (design S1). Fields may be added later, never renamed.
export interface UiSnapshot {
  devices: { id: string; label: string }[]
  source: { kind: 'device'; id: string } | { kind: 'file'; name: string } | null
  needsStart: boolean
  sceneName: string
  bpm: number
  confident: boolean
  hold: boolean
  recording: boolean
  quality: QualityMode
  scale: number
  drops: number
  compiling: string | null // 'compiling 7/41' while Start compiles every program (plan S2.5), null when done
  debug: { l: number; r: number; settings: MediaTrackSettings | null } | null // ?debug only: input RMS per channel, 10 Hz
  // ?debug only, 4×/s: |grid − onset| (ms) over the last 64 onsets on the grid, s from the first onset after bpm 0 to
  // confident, and the confidence itself (S5.4, the Q4 metrics on the rig)
  debugSync: { med: number; p95: number; toConfident: number | null; confidence: number } | null
}

let snap: UiSnapshot = {
  devices: [], source: null, needsStart: true, sceneName: '', bpm: 0, confident: false,
  hold: false, recording: false, quality: '60-adaptive', scale: 1, drops: 0, compiling: null, debug: null, debugSync: null,
}
const subs = new Set<() => void>()

export const store = {
  subscribe(cb: () => void): () => void {
    subs.add(cb)
    return () => subs.delete(cb)
  },
  getSnapshot: (): UiSnapshot => snap,
  /** Replaces the snapshot object only if a value changed (cached-snapshot rule). */
  patch(p: Partial<UiSnapshot>): void {
    if (Object.entries(p).every(([k, v]) => Object.is(snap[k as keyof UiSnapshot], v))) return
    snap = { ...snap, ...p }
    subs.forEach((cb) => cb())
  },
}

/** The saved input device, only if it is still in the list. */
export const pickSaved = (devices: UiSnapshot['devices'], savedId: string | null) => devices.find((d) => d.id === savedId)
