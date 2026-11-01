// The audio settings (design C7), pure: the preset pick, Auto-style, the user's sensitivity per source and up to 8 custom
// bands, kept as JSON under localStorage `vjw.audio`. The browser side is one seam (`Kv`, as in library.ts), so the logic
// runs in Vitest without a browser. `parseSettings` is the trust boundary for whatever was stored.
import type { BandSpec } from './bands'
import type { Drum } from './drums'
import { PRESETS, type Band, type Genre, type PresetId } from './presets'

/** `id` is `u:` + 6 random hex chars: the band's binding source id, fixed for life (a rename only changes `name`). */
export interface CustomBand { id: string; name: string; lo: number; hi: number; gain: number; gate: number; attack: number; release: number }
// pick: a preset chosen by hand (null = follow the detected genre); sens: the user's factor per source id, 0..2, missing = 1
export interface AudioSettings { v: 1; auto: boolean; pick: PresetId | null; sens: Record<string, number>; custom: CustomBand[] }
type Kv = Pick<Storage, 'getItem' | 'setItem'>
type Obj = Record<string, unknown>

const KEY = 'vjw.audio'
const MAX_BANDS = 8 // bounds the audio-thread cost of the band bank
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

const defaults = (): AudioSettings => ({ v: 1, auto: true, pick: null, sens: {}, custom: [] })
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
    /** Changes the named fields (`sens` is replaced as a whole) and re-checks the result, so a slider's NaN or a bad pick is repaired. */
    patch: (p: Partial<Pick<AudioSettings, 'auto' | 'pick' | 'sens'>>) => commit(parseSettings({ ...state, ...p })),
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

/** The Sources tab's meter groups (S6.1), in order: the fixed ones, plus Custom only when there are bands. Pure: takes
 * a settings snapshot, no store access. */
export const meterGroups = (s: AudioSettings): { title: string; ids: string[] }[] => {
  const g = [
    { title: 'Drums', ids: ['kick', 'snare', 'hats'] },
    { title: 'Bass', ids: ['sub', 'reese', 'wobble'] },
    { title: 'Arrangement', ids: ['build', 'drop'] },
  ]
  if (s.custom.length) g.push({ title: 'Custom', ids: s.custom.map((b) => b.id) })
  return g
}

/** The preset in force (design C4): a hand pick wins, else the detected genre while Auto is on, else Default. */
export const activePreset = (s: AudioSettings, detected: Genre | null): PresetId => s.pick ?? (s.auto ? (detected ?? 'default') : 'default')

/** The C4 state machine (design C4): a picker value, or an Auto-toggle move, becomes the `patch` it applies. Pure: a
 * hand pick locks (auto untouched, the pick wins), "Auto" re-enters Follow (`auto: true, pick: null` — even from Manual,
 * so the dropdown, the checkbox and the active preset all agree), and a toggle-off locks whatever preset is active
 * *now* — not null. */
export function pickToPatch(kind: 'picker' | 'toggle', value: string | boolean, s: AudioSettings, detected: Genre | null): Partial<Pick<AudioSettings, 'auto' | 'pick'>> {
  if (kind === 'picker') return value === 'auto' ? { auto: true, pick: null } : { pick: value as PresetId }
  return value ? { auto: true, pick: null } : { auto: false, pick: activePreset(s, detected) }
}

/** The worklet config's band list for the preset in force: `sub`, `reese`, `wobble` first (the S2.4 contract —
 *  features.ts reads bands 0–2 by position), then the user's bands. Pure: no `rev`, which app.ts grows per send. */
export function workletBands(s: AudioSettings, detected: Genre | null): { drums: Record<Drum, Band>; bands: BandSpec[] } {
  const b = PRESETS[activePreset(s, detected)].bands
  return {
    drums: { kick: b.kick, snare: b.snare, hats: b.hats },
    bands: (['sub', 'reese', 'wobble'] as const).map((id): BandSpec => ({ id, lo: b[id][0], hi: b[id][1] })).concat(s.custom.map((c): BandSpec => ({ id: c.id, lo: c.lo, hi: c.hi }))),
  }
}

/** The band list serialized (ids + Hz, drums too): sent to the worklet only when it really changed. */
export function bandKey(b: { drums: Record<Drum, Band>; bands: BandSpec[] }): string {
  return `${b.drums.kick} ${b.drums.snare} ${b.drums.hats} ${b.bands.map((x) => `${x.id}:${x.lo}-${x.hi}`).join(' ')}`
}
