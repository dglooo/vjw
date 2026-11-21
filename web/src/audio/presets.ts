// The genre presets (design C3), code data: the user tunes `sens` and adds custom bands instead of editing these. Pure.
// The tempo range is applied by tempo.ts and the bands by the worklet (plan S3.x); the `proto` rows feed style.ts (S4.1).
import { KNOBS, type Knobs } from './drums'

export type Genre = 'dnb' | 'dubstep' | 'techno'
export type PresetId = 'default' | Genre | 'psy' | 'house' // psy, house: hand picks only (no `proto`, never classified)
export type Band = readonly [lo: number, hi: number] // Hz for a frequency band, BPM for `bpm`
export interface Preset {
  name: string
  bpm: Band | null // null = today's fold [90, 180), prior 128
  bands: Record<'kick' | 'snare' | 'hats' | 'sub' | 'reese' | 'wobble', Band>
  sens: Readonly<Record<string, number>> // missing = 1
  map: Readonly<Record<string, string>> // built-in source -> new source while Auto-style is on
  proto?: { kickPerBeat: number; hatsPerBeat: number; wobble: number; bass: number } // classifier (genres only)
  knobs: Knobs // the worklet's drum knobs (drums.ts): floors, snare threshold, kick trigger and its follower
  cuts?: false // a deep bass cut doesn't arm a drop below DnB tempo (cutsOn → arrange.ts `cuts`, drop v2 (2)); missing = it does
  low?: 'sub' // the arrangement's `low` (app.ts) reads the sub band alone; missing = sub + reese
}

const BANDS: Preset['bands'] = { kick: [40, 150], snare: [1000, 5000], hats: [7000, 16000], sub: [30, 60], reese: [60, 250], wobble: [150, 1500] }

/** The running grid's one-step octave bridge into a band (plan S3.2): `double` when twice the grid lies inside,
 *  `halve` when half of it does, else `none`. Inclusive bounds: a grid sitting exactly on `lo` or `hi` is inside and
 *  stays. A move that would land outside the band too stays (T2, dsp_detector_2026-11-16: 116 → 232 under techno):
 *  the range-folded reading relocks the grid. */
const inside = (bpm: number, [lo, hi]: Band) => bpm >= lo && bpm <= hi
export const snapOctave = (bpm: number, band: Band): 'double' | 'halve' | 'none' =>
  inside(bpm, band) ? 'none' : inside(2 * bpm, band) ? 'double' : inside(bpm / 2, band) ? 'halve' : 'none'

/** The arrangement's `cuts` (arrange.ts): the preset's, or on while a sure grid (confidence ≥ 0.3, styleIn's gate)
 *  runs at DnB's band floor (160 BPM) or faster, so a cuts-off pick on DnB keeps the 2–3 s pre-drop cuts its drops come
 *  through (Psytrance on 6 DnB tracks: 5/17 → 6/17 drops). Not from 150: fx_psy150's grid reads 150.00–150.18, and on
 *  those tracks > 150 adds 2 false drops for no hit. ⚠️ Techno's and House's bands lock DnB at 116 BPM (⅔), so under those
 *  picks this never fires (scratchpad/drops). */
export const cutsOn = (p: Preset, bpm: number, confidence: number) => p.cuts !== false || (confidence >= 0.3 && bpm >= PRESETS.dnb.bpm![0])

// The 4/4 family (dsp_genre_melodic §4): one knob set for psytrance, techno and house; only the tempo tells them apart, and
// their real ranges overlap, so the classifier keeps one 4/4 class (techno) and Psytrance / House are hand picks. kick
// minGap 0.3 s = one kick per beat region at 118–150 BPM: house's off-beat bass read as kicks (P .56–.62 → 1.00 on the
// fixtures). No cut drops: a 1-bar fill (1.66–1.82 s) passes cutMin as a deep cut, and its refractory delayed or swallowed
// the real drop. low = sub: a break's pad plays in the reese band (60–250 Hz) and held sub + reese at ≈ .65 G, over
// `sparse` .6, so no real drop fired; the sub band falls 15–60× there. ⚠️ Synthetic fixtures only: no real psy/techno/house
// track was measured, and a break over a sub drone never reads sparse.
const FOUR: Omit<Preset, 'name' | 'bpm'> = { bands: { ...BANDS }, sens: {}, map: { onset: 'kick', treb: 'hats' }, knobs: { ...KNOBS, minGap: 0.3 }, cuts: false, low: 'sub' }

// `sens` is all 1 everywhere for now (tuned on the fixtures and the user's tracks), so it stays empty.
// ponytail: C3 fixes only kicks/beat per genre; the other `proto` numbers are starting values for S4.1 to tune on the fixtures.
export const PRESETS: Readonly<Record<PresetId, Preset>> = {
  default: { name: 'Default', bpm: null, bands: { ...BANDS }, sens: {}, map: {}, knobs: KNOBS },
  dnb: {
    name: 'Drum & Bass',
    bpm: [160, 185],
    bands: { ...BANDS },
    sens: {},
    map: { onset: 'kick', treb: 'hats' },
    proto: { kickPerBeat: 0.5, hatsPerBeat: 2, wobble: 0.25, bass: 0.7 },
    knobs: KNOBS,
  },
  dubstep: {
    name: 'Dubstep / bass',
    bpm: [135, 150],
    bands: { ...BANDS, reese: [70, 350] },
    sens: {},
    map: { reese: 'wobble', onset: 'snare', treb: 'hats' }, // the bass class binds reese (design ruling 2026-11-05)
    proto: { kickPerBeat: 0.35, hatsPerBeat: 1, wobble: 0.8, bass: 0.7 },
    // growls flood the snare band: Rumble 7.3 snares a bar at floor 40, 2.4 at 80; no floor fixes it (R .29 / P .26 at
    // 80, R .54 / P .12 at 40: dsp_kick_snare_misses §4.3), so Dubstep keeps 80/100
    knobs: { ...KNOBS, floors: { snare: 80, hats: 100 } },
    cuts: false, // its bass stops are its groove: Rumble's 108–110 s cut would fire ≈ 110, and its refractory swallow 117.0
  },
  // [135, 150] as Dubstep's: it breaks house 118, so it's safe only as a hand pick (dsp_genre_melodic §4)
  psy: { ...FOUR, name: 'Psytrance', bpm: [135, 150] },
  techno: { ...FOUR, name: 'Techno', bpm: [118, 135], proto: { kickPerBeat: 1, hatsPerBeat: 2, wobble: 0.1, bass: 0.4 } },
  house: { ...FOUR, name: 'House', bpm: [118, 130] },
}
