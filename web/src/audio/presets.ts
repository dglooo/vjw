// The genre presets (design C3), code data: the user tunes `sens` and adds custom bands instead of editing these. Pure.
// The tempo range is applied by tempo.ts and the bands by the worklet (plan S3.x); the `proto` rows feed style.ts (S4.1).
export type Genre = 'dnb' | 'dubstep' | 'techno'
export type PresetId = 'default' | Genre
export type Band = readonly [lo: number, hi: number] // Hz for a frequency band, BPM for `bpm`
export interface Preset {
  name: string
  bpm: Band | null // null = today's fold [90, 180), prior 128
  bands: Record<'kick' | 'snare' | 'hats' | 'sub' | 'reese' | 'wobble', Band>
  sens: Readonly<Record<string, number>> // missing = 1
  map: Readonly<Record<string, string>> // built-in source -> new source while Auto-style is on
  proto?: { kickPerBeat: number; hatsPerBeat: number; wobble: number; bass: number } // classifier (genres only)
}

const BANDS: Preset['bands'] = { kick: [40, 150], snare: [1000, 5000], hats: [7000, 16000], sub: [30, 60], reese: [60, 250], wobble: [150, 1500] }

/** The running grid's one-step octave bridge into a band (plan S3.2): `double` below `lo`, `halve` above `hi`, `none`
 *  inside. Inclusive bounds: a grid sitting exactly on `lo` or `hi` is inside and stays. Best effort — the range-folded
 *  reading relocks the grid, so a ⅔-lag reading (116 vs 174) is not walked octave by octave. */
export const snapOctave = (bpm: number, band: Band): 'double' | 'halve' | 'none' =>
  bpm < band[0] ? 'double' : bpm > band[1] ? 'halve' : 'none'

// `sens` is all 1 everywhere for now (tuned on the fixtures and the user's tracks), so it stays empty.
// ponytail: C3 fixes only kicks/beat per genre; the other `proto` numbers are starting values for S4.1 to tune on the fixtures.
export const PRESETS: Readonly<Record<PresetId, Preset>> = {
  default: { name: 'Default', bpm: null, bands: { ...BANDS }, sens: {}, map: {} },
  dnb: {
    name: 'Drum & Bass',
    bpm: [160, 185],
    bands: { ...BANDS },
    sens: {},
    map: { bass: 'reese', onset: 'kick', treb: 'hats' },
    proto: { kickPerBeat: 0.5, hatsPerBeat: 2, wobble: 0.25, bass: 0.7 },
  },
  dubstep: {
    name: 'Dubstep / bass',
    bpm: [135, 150],
    bands: { ...BANDS, reese: [70, 350] },
    sens: {},
    map: { bass: 'wobble', onset: 'snare', treb: 'hats' },
    proto: { kickPerBeat: 0.35, hatsPerBeat: 1, wobble: 0.8, bass: 0.7 },
  },
  techno: {
    name: 'Techno / house',
    bpm: [118, 135],
    bands: { ...BANDS },
    sens: {},
    map: { onset: 'kick', treb: 'hats' },
    proto: { kickPerBeat: 1, hatsPerBeat: 2, wobble: 0.1, bass: 0.4 },
  },
}
