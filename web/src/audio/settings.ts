// The audio settings (design C7), pure: the preset pick, Auto-style, the user's gain and mute per source and up to 8 custom
// bands, kept as JSON under localStorage `vjw.audio`. The browser side is one seam (`Kv`, as in library.ts), so the logic
// runs in Vitest without a browser. `parseSettings` is the trust boundary for whatever was stored.
import type { BandSpec } from './bands'
import type { Drum, Knobs } from './drums'
import { PRESETS, type Band, type Genre, type PresetId } from './presets'

/** `id` is `u:` + 6 random hex chars: the band's binding source id, fixed for life (a rename only changes `name`). */
export interface CustomBand { id: string; name: string; lo: number; hi: number; gain: number; gate: number; attack: number; release: number }
// pick: a preset chosen by hand (null = follow the detected genre); sens: the user's gain per source id, 0..2, missing = 1;
// mute: the source ids that read 0 (bind.ts gain() applies both, in every scene); analyser: the detection the syn_* inputs
// follow, ours or the donor-style core (plan_audio_donor_mode S1.4; app.ts ramps src.donorMix toward it), or 'vs3': the
// vs3 scenes hear through the vs3 core (audio/vs3.ts), every other scene as ours, or 'off' (user 2026-11-21): the
// analysis runs on, the visuals hear a steady idle signal and every bound input sits at its stored value (app.ts, bind.ts
// IDLE, post.ts boundStep); resume: the mode Off turned off, which toggleAnalysis turns back on; bpm: the manual BPM lock
// (sync.ts setManual, user 2026-11-20), missing = auto; sensitivity: the kick/snare detectors' Low or High (user
// 2026-11-21, workletBands SENSITIVITY), missing = Mid: the preset's knobs as tuned
export interface AudioSettings { v: 1; auto: boolean; pick: PresetId | null; sens: Record<string, number>; mute: string[]; custom: CustomBand[]; analyser: Mode | 'off'; resume?: Mode; bpm?: number; sensitivity?: 'low' | 'high' }
type Mode = 'ours' | 'donor' | 'vs3'
type Kv = Pick<Storage, 'getItem' | 'setItem'>
type Obj = Record<string, unknown>

const KEY = 'vjw.audio'
const MAX_BANDS = 8 // bounds the audio-thread cost of the band bank
export const BPM_RANGE = [40, 300] as const // a manual BPM clamps into this ([ and ] too)
const NAME_MAX = 24
const ID = /^u:\w{1,24}$/
const TOP = 0.45 // a band's top edge stays below this share of the sample rate
// ponytail: `createSettings` has no AudioContext yet, so 48 kHz; pass ctx.sampleRate if rates below 44.1 kHz ever matter.
const RATE = 48_000
// A stored band is checked against the highest rate a browser runs at, so a session at a lower rate never drops it; addBand
// accepts no more than that either, so a later patch (which re-checks every band) never drops one it let in.
const MAX_RATE = 96_000
// gain, gate (the UI says threshold), attack and release run from 0 up to their max
const LIMITS = [['gain', 'gain', 4], ['gate', 'threshold', 1], ['attack', 'attack (s)', 2], ['release', 'release (s)', 2]] as const

const defaults = (): AudioSettings => ({ v: 1, auto: true, pick: null, sens: {}, mute: [], custom: [], analyser: 'ours' })
const isMode = (x: unknown): x is Mode => x === 'ours' || x === 'donor' || x === 'vs3'
const isAnalyser = (x: unknown): x is AudioSettings['analyser'] => isMode(x) || x === 'off'
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x)
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const within = (x: unknown, lo: number, hi: number): x is number => finite(x) && x >= lo && x <= hi
/** A band with only the known fields. */
const band = (id: string, b: Omit<CustomBand, 'id'>): CustomBand => ({ id, name: b.name, lo: b.lo, hi: b.hi, gain: b.gain, gate: b.gate, attack: b.attack, release: b.release })

/** Why a band is not acceptable (a message for the form), or null. `b` is typed-in or stored data, so every field is checked. */
function bandError(b: Obj, top: number): string | null {
  const { name, lo, hi } = b
  if (typeof name !== 'string' || name.length < 1 || name.length > NAME_MAX) return `name: 1 to ${NAME_MAX} characters`
  if (!within(lo, 20, top)) return `from: 20 to ${Math.floor(top)} Hz`
  if (!within(hi, 0, top)) return `to: at most ${Math.floor(top)} Hz`
  if (hi / lo < 1.1) return 'to: at least 1.1 × from' // a division: 1.1 * 50 is 55.00000000000001, so 50-55 Hz would fail
  for (const [k, label, max] of LIMITS) if (!within(b[k], 0, max)) return `${label}: 0 to ${max}`
  return null
}

/** Settings from whatever was stored. A non-object or another version gives the defaults; any other invalid field falls
 *  back to its default, and an invalid, repeated or ninth band is dropped. Returns a fresh object. */
export function parseSettings(x: unknown): AudioSettings {
  const s = defaults()
  if (!isObj(x) || x.v !== 1) return s
  if (typeof x.auto === 'boolean') s.auto = x.auto
  if (typeof x.pick === 'string' && Object.hasOwn(PRESETS, x.pick)) s.pick = x.pick as PresetId
  if (isObj(x.sens)) for (const [k, v] of Object.entries(x.sens)) if (finite(v)) s.sens[k] = Math.min(2, Math.max(0, v))
  if (Array.isArray(x.mute)) s.mute = [...new Set(x.mute.filter((k): k is string => typeof k === 'string'))]
  if (isAnalyser(x.analyser)) s.analyser = x.analyser
  if (isMode(x.resume)) s.resume = x.resume
  if (finite(x.bpm) && x.bpm > 0) s.bpm = Math.min(BPM_RANGE[1], Math.max(BPM_RANGE[0], x.bpm))
  if (x.sensitivity === 'low' || x.sensitivity === 'high') s.sensitivity = x.sensitivity // 'mid' or junk: Mid, no field
  for (const c of Array.isArray(x.custom) ? x.custom : []) {
    if (s.custom.length >= MAX_BANDS) break
    if (isObj(c) && typeof c.id === 'string' && ID.test(c.id) && !bandError(c, TOP * MAX_RATE) && !s.custom.some((b) => b.id === c.id)) {
      s.custom.push(band(c.id, c as unknown as CustomBand))
    }
  }
  return s
}

export function createSettings(kv: Kv, sampleRate = RATE) {
  let state = defaults()
  try {
    state = parseSettings(JSON.parse(kv.getItem(KEY) ?? 'null'))
  } catch {
    // no localStorage, or a corrupt value: the defaults
  }
  const subs = new Set<() => void>()
  /** Puts `next` in force, stored and announced. A refused write (storage full or blocked) keeps it for this session. */
  const commit = (next: AudioSettings) => {
    state = next
    try {
      kv.setItem(KEY, JSON.stringify(next))
    } catch {
      // this session keeps its settings
    }
    subs.forEach((cb) => cb())
  }

  return {
    /** The settings in force: a snapshot, replaced (never edited) by every change, so it can feed `useSyncExternalStore`. */
    get: () => state,
    /** Changes the named fields (`sens` and `mute` are replaced as a whole) and re-checks the result, so a slider's NaN or a
     *  bad pick is repaired. An invalid `analyser` keeps the mode in force (plan S1.4 T4c), not the default. A turn to
     *  'off' keeps the mode it turns off as `resume`. */
    patch: (p: Partial<Pick<AudioSettings, 'auto' | 'pick' | 'sens' | 'mute' | 'analyser' | 'bpm' | 'sensitivity'>>) => {
      const analyser = isAnalyser(p.analyser) ? p.analyser : state.analyser
      commit(parseSettings({ ...state, ...p, analyser, resume: isMode(state.analyser) && analyser === 'off' ? state.analyser : state.resume }))
    },
    /** Adds a custom band under a new id. Returns an error message, or null once added (the band is `get().custom.at(-1)`). */
    addBand(b: Omit<CustomBand, 'id'>): string | null {
      const err = state.custom.length >= MAX_BANDS ? `at most ${MAX_BANDS} custom bands` : bandError(b, TOP * Math.min(sampleRate, MAX_RATE))
      if (err) return err
      let id: string
      do id = `u:${crypto.randomUUID().slice(0, 6)}`
      while (state.custom.some((c) => c.id === id))
      commit({ ...state, custom: [...state.custom, band(id, b)] })
      return null
    },
    removeBand: (id: string) => commit({ ...state, custom: state.custom.filter((c) => c.id !== id) }),
    onChange(cb: () => void) {
      subs.add(cb)
      return () => subs.delete(cb)
    },
  }
}

/** The analysis switch (the A hotkey, a MIDI pad): Off, or back on in the mode Off turned off (ours if none). */
export const toggleAnalysis = (s: AudioSettings): Pick<AudioSettings, 'analyser'> => ({ analyser: s.analyser === 'off' ? (s.resume ?? 'ours') : 'off' })

/** The preset in force (design C4): a hand pick wins, else the on-stage scene's genre (doc.ts, user 2026-11-21), else the
 *  detected genre while Auto is on, else Default. Without `scene`: the top bar's, which app.ts's tempo window and
 *  arrangement keep, so a cut moves neither the beat grid nor the arrangement's input. */
export const activePreset = (s: AudioSettings, detected: Genre | null, scene?: PresetId | null): PresetId => s.pick ?? scene ?? (s.auto ? (detected ?? 'default') : 'default')

/** The C4 state machine (design C4): a picker value, or an Auto-toggle move, becomes the `patch` it applies. Pure: a
 * hand pick locks (auto untouched, the pick wins), "Auto" re-enters Follow (`auto: true, pick: null` — even from Manual,
 * so the dropdown, the checkbox and the active preset all agree), and a toggle-off locks whatever preset is active
 * *now* (the on-stage scene's genre too) — not null. */
export function pickToPatch(kind: 'picker' | 'toggle', value: string | boolean, s: AudioSettings, detected: Genre | null, scene?: PresetId | null): Partial<Pick<AudioSettings, 'auto' | 'pick'>> {
  if (kind === 'picker') return value === 'auto' ? { auto: true, pick: null } : { pick: value as PresetId }
  return value ? { auto: true, pick: null } : { auto: false, pick: activePreset(s, detected, scene) }
}

/** The sensitivity's factor on the active preset's kick and snare thresholds (user 2026-11-21): the snare floor and
 *  threshold and the kick trigger. The kick's slow follower divides by it: a longer one reads a kick higher
 *  (dsp_kick_snare_misses §6: 20 → 40 ms took kick R .65 → .70). The §6 margins: High's .87 is the step that took the
 *  snare threshold 1.5 → 1.3 (R +.05), and it puts the kick trigger at 1.17, between the measured 1.15 (R .88 / P .53)
 *  and 1.20 (R .81 / P .61), both at the old 20 ms follower. Low's 1.15 puts the snare threshold back at 1.5 and the
 *  kick trigger at 1.55 (not measured). */
const SENSITIVITY = { low: 1.15, high: 0.87 } as const

/** The worklet config for the preset in force (`active`, as app.ts's frame resolves it: picked or detected): its drum
 *  bands and knobs (scaled by the sensitivity; Mid sends the preset's own), and the band list: `sub`, `reese`, `wobble`
 *  first (the S2.4 contract — features.ts reads bands 0–2 by position), then the user's bands. Pure: no `rev`, which
 *  app.ts grows per send. */
export function workletBands(s: AudioSettings, active: PresetId): { drums: Record<Drum, Band>; knobs: Knobs; bands: BandSpec[] } {
  const p = PRESETS[active]
  const b = p.bands
  const k = p.knobs
  const f = s.sensitivity && SENSITIVITY[s.sensitivity]
  return {
    drums: { kick: b.kick, snare: b.snare, hats: b.hats },
    knobs: f ? { ...k, floors: { ...k.floors, snare: k.floors.snare * f }, snareThreshold: k.snareThreshold * f, kick: k.kick * f, kickSlow: k.kickSlow / f } : k,
    bands: (['sub', 'reese', 'wobble'] as const).map((id): BandSpec => ({ id, lo: b[id][0], hi: b[id][1] })).concat(s.custom.map((c): BandSpec => ({ id: c.id, lo: c.lo, hi: c.hi }))),
  }
}

/** The config serialized (ids + Hz, drums and knobs too): sent to the worklet only when it really changed. */
export function bandKey(b: { drums: Record<Drum, Band>; knobs: Knobs; bands: BandSpec[] }): string {
  return `${b.drums.kick} ${b.drums.snare} ${b.drums.hats} ${JSON.stringify(b.knobs)} ${b.bands.map((x) => `${x.id}:${x.lo}-${x.hi}`).join(' ')}`
}
