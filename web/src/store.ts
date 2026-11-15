import type { Drum } from './audio/drums'
import type { Genre } from './audio/presets'
import type { SceneId } from './doc'
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
  // ?debug only, 10 Hz: input RMS per channel; output underruns so far (null without AudioContext.playbackStats)
  debug: { l: number; r: number; settings: MediaTrackSettings | null; underruns: number | null } | null
  // ?debug only, 4×/s: |grid − onset| (ms) over the last 64 onsets on the grid, s from the first onset after bpm 0 to
  // confident, and the confidence itself (S5.4, the Q4 metrics on the rig); hits drained per drum so far (S1.4)
  debugSync: { med: number; p95: number; toConfident: number | null; confidence: number; hits: Record<Drum, number>; bands: Record<string, number> } | null
  // The effects panel (design E6, contract CP5):
  panel: boolean // open (key E)
  editRev: number // +1 per structural edit: the panel re-renders on it, never per frame
  edited: SceneId // the scene it edits: the current one, the incoming one during a fade
  gpuMs: number | null // that scene's GPU median in ms, 4×/s; null without a GPU timer
  nodeErrors: string[] // that scene's build errors (unknown refs, compile logs, bad bindings)
  style: { detected: Genre | null; confidence: number } // the classifier's pick, 4×/s (S4.3); the badge reads it (S6.2)
  editor: boolean // the editor screen (2b, design S1): key L or the bar button, set through app.ts `setEditor`
  // The camera line (plan_camera S1.4), published by camera.ts: the labelled videoinputs, the pick (null = Off),
  // cam.live / cam.video / cam.error, and camFail: the last pick's failure (its DOMException name), null at the next pick
  cameras: { id: string; label: string }[]
  camera: UiSnapshot['source']
  camLive: boolean
  camVideo: boolean
  camError: string | null
  camFail: string | null
}

let snap: UiSnapshot = {
  devices: [], source: null, needsStart: true, sceneName: '', bpm: 0, confident: false,
  hold: false, recording: false, quality: '60-adaptive', scale: 1, drops: 0, compiling: null, debug: null, debugSync: null,
  panel: false, editRev: 0, edited: '', gpuMs: null, nodeErrors: [], style: { detected: null, confidence: 0 },
  editor: false, cameras: [], camera: null, camLive: false, camVideo: true, camError: null, camFail: null,
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
