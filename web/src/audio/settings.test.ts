import { afterEach, expect, test, vi } from 'vitest'
import { gain, idle, type Binding, type Sources } from '../bind'
import { SYN_BIND, synClock } from '../fx/syn'
import { boundStep } from '../gl/post'
import { KNOBS } from './drums'
import { PRESETS, type Band, type Genre, type PresetId } from './presets'
import { activePreset, bandKey, createSettings, parseSettings, toggleAnalysis, workletBands, type AudioSettings, type CustomBand } from './settings'

const KEY = 'vjw.audio'
const DEFAULTS: AudioSettings = { v: 1, auto: true, pick: null, sens: {}, mute: [], custom: [], analyser: 'ours' }
type NewBand = Omit<CustomBand, 'id'>
const BAND: NewBand = { name: 'sub', lo: 40, hi: 60, gain: 1, gate: 0.2, attack: 0.01, release: 0.2 }
const stored = (i = 0, over: Partial<CustomBand> = {}): CustomBand => ({ ...BAND, id: `u:00000${i}`, ...over })

/** localStorage over a Map: what a reload keeps. */
function storage(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init))
  return { m, kv: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) } }
}

afterEach(() => vi.restoreAllMocks())

// --- presets (design C3) ---

const inWindow = (b: Band | null, bpm: number) => !!b && bpm >= b[0] && bpm <= b[1]

test('default has no tempo window', () => expect(PRESETS.default.bpm).toBeNull())

test.each<[PresetId, number[], number[]]>([
  ['dnb', [160, 174, 182, 185], [87, 116, 140, 159, 186]], // 174 reads 174, not its half (87) nor the 2/3 peak (116)
  ['dubstep', [135, 140, 150], [70, 128, 134, 151, 174]],
  ['techno', [118, 124, 128, 135], [100, 117, 136, 140, 174]],
])('%s: the bpm window holds its tempos and not the half, the neighbours or the other genres', (id, inside, outside) => {
  for (const t of inside) expect(inWindow(PRESETS[id].bpm, t), `${t} inside`).toBe(true)
  for (const t of outside) expect(inWindow(PRESETS[id].bpm, t), `${t} outside`).toBe(false)
})

test('the C3 table: bands, auto-style maps and classifier prototypes', () => {
  const BASE = { kick: [40, 150], snare: [1000, 5000], hats: [7000, 16000], sub: [30, 60], reese: [60, 250], wobble: [150, 1500] }
  expect(Object.keys(PRESETS)).toEqual(['default', 'dnb', 'dubstep', 'psy', 'techno', 'house'])
  for (const id of ['default', 'dnb', 'psy', 'techno', 'house'] as const) expect(PRESETS[id].bands, id).toEqual(BASE)
  expect(PRESETS.dubstep.bands).toEqual({ ...BASE, reese: [70, 350] }) // only dubstep's reese is wider
  expect(PRESETS.default.map).toEqual({})
  expect(PRESETS.dnb.map).toEqual({ onset: 'kick', treb: 'hats' }) // the bass class binds reese (design ruling 2026-11-05)
  expect(PRESETS.dubstep.map).toEqual({ reese: 'wobble', onset: 'snare', treb: 'hats' })
  expect(PRESETS.techno.map).toEqual({ onset: 'kick', treb: 'hats' })
  expect(PRESETS.default.proto).toBeUndefined()
  expect(PRESETS.dnb.proto?.kickPerBeat).toBe(0.5)
  expect(PRESETS.dubstep.proto?.kickPerBeat).toBeGreaterThanOrEqual(0.25)
  expect(PRESETS.dubstep.proto?.kickPerBeat).toBeLessThanOrEqual(0.5)
  expect(PRESETS.techno.proto?.kickPerBeat).toBe(1)
})

// --- parseSettings: the trust boundary ---

test('parseSettings: anything but version 1 settings gives the defaults', () => {
  for (const x of [undefined, null, 7, 'x', [], {}, { auto: false }, { v: 2, auto: false, pick: 'dnb' }, { v: '1', auto: false }]) {
    expect(parseSettings(x), JSON.stringify(x)).toEqual(DEFAULTS)
  }
})

test('parseSettings: an invalid field falls back alone, the valid ones stay', () => {
  const x = { v: 1, auto: 'yes', pick: 'techno', sens: { kick: 5, snare: -1, hats: 0.5, sub: 'x', reese: NaN, wobble: null }, custom: 'no' }
  expect(parseSettings(x)).toEqual({ v: 1, auto: true, pick: 'techno', sens: { kick: 2, snare: 0, hats: 0.5 }, mute: [], custom: [], analyser: 'ours' })
  expect(parseSettings({ v: 1, auto: false, pick: 'jazz', sens: [1, 2] })).toEqual({ ...DEFAULTS, auto: false })
})

test('T4a: parseSettings: an analyser missing, foo or 2 reads ours; the other stored fields stay, v is 1', () => {
  const x = { v: 1, auto: false, pick: 'dnb', sens: { kick: 1.5 }, mute: ['bass'], custom: [stored(1)] }
  for (const r of [x, { ...x, analyser: 'foo' }, { ...x, analyser: 2 }]) expect(parseSettings(r), JSON.stringify(r)).toEqual({ ...x, analyser: 'ours' })
  expect(parseSettings({ ...x, analyser: 'donor' })).toEqual({ ...x, analyser: 'donor' })
})

test('vs3: patch({ analyser: vs3 }) comes back after a reload; a stored vs3 parses as vs3', () => {
  const { m, kv } = storage()
  createSettings(kv).patch({ analyser: 'vs3' })
  expect(createSettings(kv).get().analyser).toBe('vs3')
  expect(JSON.parse(m.get(KEY) ?? 'null').analyser).toBe('vs3')
  expect(parseSettings({ ...DEFAULTS, analyser: 'vs3' })).toEqual({ ...DEFAULTS, analyser: 'vs3' })
})

test('analysis off (user 2026-11-21): the sources read the idle signal, a bound input its stored value (a ⚡ one 0), syn_Time runs at .5 / s; a reload keeps Off, A turns the mode before back on', () => {
  const { kv } = storage()
  const a = createSettings(kv)
  a.patch({ analyser: 'donor' })
  a.patch(toggleAnalysis(a.get())) // A: off
  const s = createSettings(kv) // a reload
  expect(s.get()).toEqual({ ...DEFAULTS, analyser: 'off', resume: 'donor' })
  const src: Sources = { bass: 0.8, kick: 1, beat: 12.5, donorMix: 1 }
  expect(gain(src, s.get())).toMatchObject({ bass: 0.5, band7: 0.5, subBody: 0.5, syn_BassLevel: 0.5, kick: 0, beat: 0, donorMix: 0 }) // levels mid, hits / counts / the mix 0
  const b: Binding = { source: 'kick', amount: 1, attack: 0, release: 0, min: 0.6, max: 2 } // edit.ts MUSIC_TIME's range on `speed`
  expect(boundStep({ b, state: { y: 0 }, rest: 1 }, src, 0, [], 1 / 60, 0, true)).toBe(1) // its slider's 1, not min .6
  expect(boundStep({ b, state: { y: 0 }, rest: 1, flash: { prev: 0, blocked: false } }, src, 0, [], 1 / 60, 0, true)).toBe(0)
  // a SYN level's stored value is a placeholder 0: it reads its binding's idle value (live.ts), so syn_Time, ∫ syn_Level
  // dt (fx/syn.ts SYN, as parseSyn compiles it), advances .5 per second
  const level = boundStep({ b: SYN_BIND.syn_Level, state: { y: 0 }, rest: idle(SYN_BIND.syn_Level) }, src, 0, [], 1 / 60, 0, true)
  expect(synClock(0, { u: 'syn_Time', rate: [[['syn_Level', -1]]] }, { syn_Level: level }, 2, 0)).toBe(1)
  expect(idle(SYN_BIND.syn_BassHits)).toBe(0) // a hit stays 0
  s.patch(toggleAnalysis(s.get())) // A: back on
  expect(s.get().analyser).toBe('donor')
  expect(gain({ bass: 0.8 }, s.get())).toEqual({ bass: 0.8 })
  expect(boundStep({ b, state: { y: 0 }, rest: 1 }, { kick: 1 }, 0, [], 1 / 60, 0, false)).toBe(2) // the binding again
  s.patch({ analyser: 'vs3' })
  s.patch({ analyser: 'off' }) // the select's Off
  s.patch({ analyser: 'off' }) // twice: still back to vs3
  expect(toggleAnalysis(s.get())).toEqual({ analyser: 'vs3' })
  expect(parseSettings({ v: 1, analyser: 'off', resume: 'off' })).toEqual({ ...DEFAULTS, analyser: 'off' }) // a resume is a mode
  expect(toggleAnalysis(parseSettings({ v: 1, analyser: 'off' }))).toEqual({ analyser: 'ours' }) // none stored: ours
})

test('the manual BPM lock: patch({ bpm: 174 }) comes back after a reload, undefined clears it; junk reads auto, a far BPM clamps', () => {
  const { kv } = storage()
  createSettings(kv).patch({ bpm: 174 })
  expect(createSettings(kv).get().bpm).toBe(174)
  createSettings(kv).patch({ bpm: undefined })
  expect(createSettings(kv).get()).toEqual(DEFAULTS)
  for (const bpm of [0, -5, NaN, '174', null]) expect(parseSettings({ v: 1, bpm }).bpm, String(bpm)).toBeUndefined()
  expect([1, 1740].map((bpm) => parseSettings({ v: 1, bpm }).bpm)).toEqual([40, 300])
})

test('sensitivity (user 2026-11-21): patch({ sensitivity: high }) comes back after a reload, undefined is Mid (no field); a stored mid or junk reads Mid', () => {
  const { kv } = storage()
  createSettings(kv).patch({ sensitivity: 'high' })
  expect(createSettings(kv).get().sensitivity).toBe('high')
  createSettings(kv).patch({ sensitivity: undefined })
  expect(createSettings(kv).get()).toEqual(DEFAULTS)
  expect(['low', 'high'].map((sensitivity) => parseSettings({ v: 1, sensitivity }).sensitivity)).toEqual(['low', 'high'])
  for (const sensitivity of ['mid', 'HIGH', 0.87, null, {}]) expect(parseSettings({ v: 1, sensitivity }), String(sensitivity)).toEqual(DEFAULTS)
})

test('parseSettings: mute keeps the string ids once each; anything else falls back to none', () => {
  expect(parseSettings({ v: 1, mute: ['bass', 'sub', 'bass', 5, null, 'u:ab12cd'] }).mute).toEqual(['bass', 'sub', 'u:ab12cd'])
  for (const mute of ['bass', { bass: true }, null]) expect(parseSettings({ v: 1, mute }).mute, String(mute)).toEqual([])
})

test('parseSettings: a pick must be one of the presets', () => {
  for (const pick of ['jazz', 'constructor', '__proto__', 'toString', '', 5, {}]) expect(parseSettings({ v: 1, pick }).pick, String(pick)).toBeNull()
  for (const pick of Object.keys(PRESETS)) expect(parseSettings({ v: 1, pick }).pick).toBe(pick)
})

test('parseSettings: stored bands are checked one by one, a band never repeats and the ninth is dropped', () => {
  const ok = [stored(1), stored(2)]
  const junk: unknown[] = [
    stored(3, { id: 'kick' }), // would shadow a built-in source
    stored(3, { id: 'u:' }),
    stored(3, { name: '' }),
    stored(3, { lo: 50, hi: 50 }),
    stored(3, { gain: 5 }),
    stored(3, { hi: 44_000 }), // above 0.45 x 96 kHz
    stored(1, { name: 'again' }), // an id already taken
    'band',
    null,
    [],
  ]
  expect(parseSettings({ v: 1, custom: [ok[0], ...junk, ok[1]] }).custom).toEqual(ok)
  expect(parseSettings({ v: 1, custom: [{ ...ok[0], extra: 1 }] }).custom).toEqual([ok[0]]) // unknown keys dropped
  const twelve = Array.from({ length: 12 }, (_, i) => stored(i))
  expect(parseSettings({ v: 1, custom: twelve }).custom).toEqual(twelve.slice(0, 8)) // the first eight
})

// --- createSettings ---

test('empty or corrupt storage gives the defaults', () => {
  expect(createSettings(storage().kv).get()).toEqual(DEFAULTS)
  for (const raw of ['{nope', '', '[]', 'null', '7', '"x"', '{"v":2,"auto":false}']) expect(createSettings(storage({ [KEY]: raw }).kv).get(), raw).toEqual(DEFAULTS)
  const blocked = { getItem: () => { throw new Error('denied') }, setItem: () => undefined }
  expect(createSettings(blocked).get()).toEqual(DEFAULTS)
})

test('without localStorage the session still works', () => {
  const s = createSettings(undefined as never) // Node has none: globalThis.localStorage is undefined
  s.patch({ auto: false })
  expect(s.addBand(BAND)).toBeNull()
  expect(s.get().auto).toBe(false)
  expect(s.get().custom).toHaveLength(1)
})

test('a refused write keeps the settings for the session and still announces', () => {
  const full = { getItem: () => null, setItem: () => { throw new DOMException('full', 'QuotaExceededError') } }
  const s = createSettings(full)
  const on = vi.fn()
  s.onChange(on)
  s.patch({ auto: false })
  expect(s.get().auto).toBe(false)
  expect(on).toHaveBeenCalledOnce()
})

test('round trip: every field comes back after a reload, as JSON under vjw.audio', () => {
  const { m, kv } = storage()
  const a = createSettings(kv)
  a.patch({ auto: false, pick: 'dubstep', sens: { kick: 1.5, wobble: 0.5 }, mute: ['bass', 'sub'] })
  expect(a.addBand(BAND)).toBeNull()
  expect(a.addBand({ ...BAND, name: 'air', lo: 8000, hi: 12000, gain: 4, gate: 1, attack: 2, release: 0 })).toBeNull()
  const [b0, b1] = a.get().custom
  expect(createSettings(kv).get()).toEqual({
    v: 1,
    auto: false,
    pick: 'dubstep',
    sens: { kick: 1.5, wobble: 0.5 },
    mute: ['bass', 'sub'],
    custom: [
      { ...BAND, id: b0.id },
      { name: 'air', lo: 8000, hi: 12000, gain: 4, gate: 1, attack: 2, release: 0, id: b1.id },
    ],
    analyser: 'ours',
  })
  expect(JSON.parse(m.get(KEY) ?? 'null')).toEqual(a.get())
})

test('T4b: patch({ analyser: donor }) comes back after a reload, as JSON under vjw.audio', () => {
  const { m, kv } = storage()
  createSettings(kv).patch({ analyser: 'donor' })
  expect(createSettings(kv).get().analyser).toBe('donor')
  expect(JSON.parse(m.get(KEY) ?? 'null').analyser).toBe('donor')
})

test('T4c: a patch with an invalid analyser keeps the mode in force, not the default; x is never stored', () => {
  const { m, kv } = storage()
  const s = createSettings(kv)
  s.patch({ analyser: 'donor' })
  s.patch({ analyser: 'x' as never })
  expect(s.get().analyser).toBe('donor')
  expect(JSON.parse(m.get(KEY) ?? 'null').analyser).toBe('donor')
  expect(m.get(KEY)).not.toContain('"x"')
  s.patch({ auto: false }) // a patch without analyser keeps it too
  expect(createSettings(kv).get()).toMatchObject({ auto: false, analyser: 'donor' })
})

test('patch: changes the named fields, re-checks them, replaces sens as a whole, leaves the bands', () => {
  const { kv } = storage()
  const s = createSettings(kv)
  s.addBand(BAND)
  const bands = s.get().custom
  s.patch({ pick: 'dnb', sens: { kick: 9, hats: NaN } })
  expect(s.get()).toEqual({ v: 1, auto: true, pick: 'dnb', sens: { kick: 2 }, mute: [], custom: bands, analyser: 'ours' }) // clamped, NaN dropped
  s.patch({ sens: { snare: 0.5 } })
  expect(s.get().sens).toEqual({ snare: 0.5 }) // not merged: the caller spreads get().sens
  s.patch({ pick: null, auto: false })
  expect(s.get()).toMatchObject({ pick: null, auto: false })
  s.patch({ pick: 'jazz' as PresetId })
  expect(s.get().pick).toBeNull() // a bad pick is repaired, not stored
  expect(createSettings(kv).get()).toEqual(s.get())
})

test('get() is one snapshot between changes and a new one after each, the old one untouched', () => {
  const s = createSettings(storage().kv)
  const before = s.get()
  expect(s.get()).toBe(before)
  s.patch({ auto: false })
  expect(s.get()).not.toBe(before)
  expect(before.auto).toBe(true)
})

test('onChange: sees the new state, every change announces, the unsubscribe stops it', () => {
  const s = createSettings(storage().kv)
  const a = vi.fn()
  const b = vi.fn()
  let seen: boolean | undefined
  const offA = s.onChange(a)
  s.onChange(b)
  s.onChange(() => void (seen = s.get().auto))
  s.patch({ auto: false })
  expect(seen).toBe(false)
  s.addBand(BAND)
  s.removeBand(s.get().custom[0].id)
  expect([a, b].map((f) => f.mock.calls.length)).toEqual([3, 3])
  offA()
  offA() // twice is harmless
  s.patch({ auto: true })
  expect([a, b].map((f) => f.mock.calls.length)).toEqual([3, 4])
})

// --- custom bands ---

// [what, a value just inside, a value just outside, the message the outside one gets]
test.each<[string, Partial<NewBand>, Partial<NewBand>, RegExp]>([
  ['from 20 Hz', { lo: 20, hi: 40 }, { lo: 19.99, hi: 40 }, /^from/],
  ['to exactly 1.1 x from', { lo: 50, hi: 55 }, { lo: 50, hi: 54.9 }, /^to: at least/],
  ['to 0.45 x 48 kHz', { lo: 100, hi: 21_600 }, { lo: 100, hi: 21_601 }, /^to: at most/],
  ['gain 0', { gain: 0 }, { gain: -0.01 }, /^gain/],
  ['gain 4', { gain: 4 }, { gain: 4.01 }, /^gain/],
  ['threshold 0', { gate: 0 }, { gate: -0.01 }, /^threshold/],
  ['threshold 1', { gate: 1 }, { gate: 1.01 }, /^threshold/],
  ['attack 0', { attack: 0 }, { attack: -0.01 }, /^attack/],
  ['attack 2 s', { attack: 2 }, { attack: 2.01 }, /^attack/],
  ['release 0', { release: 0 }, { release: -0.01 }, /^release/],
  ['release 2 s', { release: 2 }, { release: 2.01 }, /^release/],
  ['name of 1 character', { name: 'a' }, { name: '' }, /^name/],
  ['name of 24 characters', { name: 'x'.repeat(24) }, { name: 'x'.repeat(25) }, /^name/],
])('addBand bound: %s is accepted, just past it is refused', (_, inside, outside, message) => {
  const good = createSettings(storage().kv)
  expect(good.addBand({ ...BAND, ...inside })).toBeNull()
  expect(good.get().custom).toHaveLength(1)
  const bad = createSettings(storage().kv)
  expect(bad.addBand({ ...BAND, ...outside })).toMatch(message)
  expect(bad.get().custom).toEqual([])
})

test('addBand: a from above the top edge is a from error, whatever the to', () => {
  const s = createSettings(storage().kv)
  for (const lo of [21_601, 30_000]) expect(s.addBand({ ...BAND, lo, hi: lo * 2 }), `lo ${lo}`).toMatch(/^from/)
  expect(s.get().custom).toEqual([])
})

test('addBand: a band whose top edge does not clear its bottom is refused', () => {
  const s = createSettings(storage().kv)
  for (const hi of [100, 99, 50, 0, -5]) expect(s.addBand({ ...BAND, lo: 100, hi }), `hi ${hi}`).toMatch(/^to/)
  expect(s.get().custom).toEqual([])
})

test.each(['lo', 'hi', 'gain', 'gate', 'attack', 'release', 'name'] as const)('addBand: %s must be a real value, not NaN, Infinity or the wrong type', (k) => {
  for (const v of [NaN, Infinity, -Infinity, null, undefined, k === 'name' ? 5 : '5']) {
    const s = createSettings(storage().kv)
    expect(s.addBand({ ...BAND, [k]: v }), `${k}=${String(v)}`).toEqual(expect.any(String))
    expect(s.get().custom).toEqual([])
  }
})

test('addBand: the top edge follows the sample rate, and a stored band survives a lower one', () => {
  const { kv } = storage()
  const at44 = createSettings(kv, 44_100)
  expect(at44.addBand({ ...BAND, lo: 100, hi: 19_845 })).toBeNull()
  expect(at44.addBand({ ...BAND, lo: 100, hi: 19_846 })).toMatch(/^to/)
  const at96 = createSettings(kv, 96_000)
  expect(at96.addBand({ ...BAND, lo: 100, hi: 43_200 })).toBeNull()
  expect(at96.addBand({ ...BAND, lo: 100, hi: 43_201 })).toMatch(/^to/)
  expect(createSettings(kv, 44_100).get().custom).toHaveLength(2) // loaded at 44.1 kHz, nothing dropped
  const at192 = createSettings(kv, 192_000) // capped at the 96 kHz edge, or the next patch would drop what it let in
  expect(at192.addBand({ ...BAND, lo: 100, hi: 43_201 })).toMatch(/^to/)
  expect(at192.addBand({ ...BAND, name: 'top', lo: 100, hi: 43_200 })).toBeNull()
  expect(at192.get().custom).toHaveLength(3)
  at192.patch({ auto: false }) // re-checks every band
  expect(at192.get().custom.at(-1)).toMatchObject({ name: 'top', hi: 43_200 })
  expect(at192.get().custom).toHaveLength(3)
})

test('addBand: eight bands fit, the ninth is refused with nothing stored or announced, a freed slot works again', () => {
  const { m, kv } = storage()
  const s = createSettings(kv)
  for (let i = 0; i < 8; i++) expect(s.addBand({ ...BAND, name: `b${i}` }), `band ${i}`).toBeNull()
  const written = m.get(KEY)
  const on = vi.fn()
  s.onChange(on)
  expect(s.addBand(BAND)).toMatch(/at most 8/)
  expect(s.get().custom).toHaveLength(8)
  expect(m.get(KEY)).toBe(written)
  expect(on).not.toHaveBeenCalled()
  s.removeBand(s.get().custom[3].id)
  expect(s.addBand(BAND)).toBeNull()
  expect(s.get().custom).toHaveLength(8)
})

test('ids: u: and 6 hex chars, distinct, and a removal or a reload leaves the others as they were', () => {
  const { kv } = storage()
  const s = createSettings(kv)
  for (const name of ['a', 'b', 'c']) s.addBand({ ...BAND, name })
  const [a, b, c] = s.get().custom
  for (const x of [a, b, c]) expect(x.id).toMatch(/^u:[0-9a-f]{6}$/)
  expect(new Set([a.id, b.id, c.id]).size).toBe(3)
  s.removeBand(b.id)
  expect(s.get().custom).toEqual([a, c])
  s.removeBand('u:nothere') // an unknown id changes nothing
  s.patch({ auto: false })
  expect(createSettings(kv).get().custom).toEqual([a, c])
})

test('ids: a random id that is already taken is drawn again', () => {
  const uuid = vi.spyOn(crypto, 'randomUUID')
  for (const first of ['aaaaaaaa', 'aaaaaaaa', 'bbbbbbbb']) uuid.mockReturnValueOnce(`${first}-0000-4000-8000-000000000000`)
  const s = createSettings(storage().kv)
  s.addBand(BAND)
  s.addBand(BAND)
  expect(s.get().custom.map((c) => c.id)).toEqual(['u:aaaaaa', 'u:bbbbbb'])
})

test('addBand keeps only the band fields', () => {
  const s = createSettings(storage().kv)
  s.addBand({ ...BAND, id: 'kick', extra: 1 } as NewBand)
  expect(Object.keys(s.get().custom[0]).sort()).toEqual(['attack', 'gain', 'gate', 'hi', 'id', 'lo', 'name', 'release'])
  expect(s.get().custom[0].id).toMatch(/^u:/)
})

// --- activePreset (design C4) ---

test('activePreset: the three states and the corners', () => {
  const at = (auto: boolean, pick: PresetId | null, detected: Genre | null) => activePreset({ ...DEFAULTS, auto, pick }, detected)
  expect(at(true, null, 'dnb')).toBe('dnb') // Follow
  expect(at(true, null, null)).toBe('default')
  expect(at(true, 'techno', 'dnb')).toBe('techno') // Locked
  expect(at(true, 'default', 'dnb')).toBe('default') // Locked on Default is still locked
  expect(at(false, 'dubstep', 'dnb')).toBe('dubstep') // Manual
  expect(at(false, null, 'dnb')).toBe('default') // Auto off, nothing picked: the detection is only a hint
})

test('activePreset: all 40 combinations of auto, pick and detected', () => {
  const picks: (PresetId | null)[] = [null, 'default', 'dnb', 'dubstep', 'techno']
  const genres: (Genre | null)[] = [null, 'dnb', 'dubstep', 'techno']
  for (const auto of [true, false]) {
    for (const pick of picks) {
      for (const detected of genres) {
        const want = pick ?? (auto && detected ? detected : 'default')
        expect(activePreset({ ...DEFAULTS, auto, pick }, detected), `${auto} ${pick} ${detected}`).toBe(want)
      }
    }
  }
})

// --- the worklet config builder (plan S2.5) ---

const cfg = (pick: PresetId | null = null, custom: CustomBand[] = [], over: Partial<AudioSettings> = {}): AudioSettings => ({
  ...DEFAULTS, pick, custom, ...over,
})

test('workletBands: sub, reese, wobble first (the S2.4 order contract), the user bands after, drums = the preset kick/snare/hats', () => {
  const b = workletBands(cfg(null, [stored(1, { lo: 40, hi: 60 })]), 'default')
  expect(b.bands).toEqual([
    { id: 'sub', lo: 30, hi: 60 },
    { id: 'reese', lo: 60, hi: 250 },
    { id: 'wobble', lo: 150, hi: 1500 },
    { id: 'u:000001', lo: 40, hi: 60 },
  ])
  expect(b.drums).toEqual({ kick: [40, 150], snare: [1000, 5000], hats: [7000, 16000] })
})

test('workletBands: a preset switch re-reads the built-in bands (dubstep reese 70-350) and the user bands stay last', () => {
  const b = workletBands(cfg(null, [stored(1, { lo: 40, hi: 60 })]), 'dubstep')
  expect(b.bands[1]).toEqual({ id: 'reese', lo: 70, hi: 350 })
  expect(b.bands.at(-1)).toEqual({ id: 'u:000001', lo: 40, hi: 60 })
  expect(bandKey(workletBands(cfg(), 'dubstep'))).not.toBe(bandKey(workletBands(cfg(), 'default')))
})

test('bandKey: ids and Hz only, so a rename or a sens/auto change is a no-send, and a band or preset change is a send', () => {
  const a = workletBands(cfg(null, [stored(1, { lo: 40, hi: 60, name: 'old' })], { sens: { sub: 2 } }), 'default')
  expect(bandKey(a)).toBe(bandKey(workletBands(cfg(null, [stored(1, { lo: 40, hi: 60, name: 'new' })], { auto: false }), 'default')))
  expect(bandKey(a)).not.toBe(bandKey(workletBands(cfg(null, [stored(1, { lo: 40, hi: 60.1 })]), 'default')))
  expect(bandKey(a)).not.toBe(bandKey(workletBands(cfg(null, []), 'default')))
  expect(bandKey(a)).not.toBe(bandKey(workletBands(cfg(null, [stored(1, { lo: 40, hi: 60 })]), 'dubstep')))
})

test('workletBands knobs (dsp_kick_snare_misses §6): Dubstep floors 80/100, the 4/4 presets kick minGap 0.3 (G1), Default and DnB the default; under Auto the detected genre, a hand pick wins', () => {
  const DEF = { floors: { snare: 30, hats: 50 }, snareThreshold: 1.3, kick: 1.35, kickSlow: 0.04, minGap: 0.06 }
  const DUB = { ...DEF, floors: { snare: 80, hats: 100 } }
  for (const id of ['default', 'dnb'] as const) expect(workletBands(cfg(), id).knobs, id).toEqual(DEF)
  expect(workletBands(cfg(), 'dubstep').knobs).toEqual(DUB)
  // app.ts sends for activePreset(settings, detected)
  const knobs = (s: AudioSettings, detected: Genre | null) => workletBands(s, activePreset(s, detected)).knobs
  expect([knobs(cfg(), null), knobs(cfg(), 'dubstep'), knobs(cfg(), 'dnb')]).toEqual([DEF, DUB, DEF])
  expect([knobs(cfg('dnb'), 'dubstep'), knobs(cfg('dubstep'), 'dnb'), knobs(cfg(null, [], { auto: false }), 'dubstep')]).toEqual([DEF, DUB, DEF])
  const b = workletBands(cfg(), 'default')
  for (const k of [DUB, { ...DEF, snareThreshold: 1.5 }, { ...DEF, kick: 1.3 }, { ...DEF, kickSlow: 0.02 }, { ...DEF, minGap: 0.3 }]) expect(bandKey({ ...b, knobs: k })).not.toBe(bandKey(b)) // a knobs-only change is a send
})

test('workletBands sensitivity: Mid (no field) sends every preset its own knobs, bit-identical; High lowers and Low raises the kick and snare thresholds by .87 / 1.15, the kick follower the other way, a re-send', () => {
  const DEF = { floors: { snare: 30, hats: 50 }, snareThreshold: 1.3, kick: 1.35, kickSlow: 0.04, minGap: 0.06 } // today's
  expect(workletBands(parseSettings({ v: 1, sensitivity: 'mid' }), 'default').knobs).toEqual(DEF)
  for (const id of Object.keys(PRESETS) as PresetId[]) {
    const mid = workletBands(cfg(), id).knobs
    expect(mid, id).toBe(PRESETS[id].knobs) // the preset's own object: not a number moves
    for (const [level, f] of [['high', 0.87], ['low', 1.15]] as const) {
      const k = workletBands(cfg(null, [], { sensitivity: level }), id).knobs
      const ratio = [k.floors.snare / mid.floors.snare, k.snareThreshold / mid.snareThreshold, k.kick / mid.kick, mid.kickSlow / k.kickSlow]
      for (const r of ratio) expect(r, `${id} ${level}`).toBeCloseTo(f, 12)
      expect([k.floors.hats, k.minGap], `${id} ${level}`).toEqual([mid.floors.hats, mid.minGap]) // the hats and the kick gap stay
      expect(bandKey({ ...workletBands(cfg(), id), knobs: k })).not.toBe(bandKey(workletBands(cfg(), id)))
    }
  }
  const at = (sensitivity?: 'low' | 'high') => workletBands(cfg(null, [], { sensitivity }), 'default').knobs
  expect([at('high').kick, at().kick, at('low').kick]).toEqual([1.35 * 0.87, 1.35, 1.35 * 1.15]) // High < Mid < Low
  expect(at('high').kickSlow).toBeGreaterThan(at('low').kickSlow) // a longer follower reads a kick higher: more kicks
})

test("G1 + G2 (dsp_genre_melodic §4): Psytrance and House are hand picks with Techno's 4/4 knobs (kick minGap 0.3 s, no cut drops, the arrangement's low = sub); the classifier never scores them", () => {
  expect(parseSettings({ v: 1, pick: 'psy' }).pick).toBe('psy')
  expect(workletBands(cfg('house'), 'house').knobs.minGap).toBe(0.3)
  for (const id of ['psy', 'techno', 'house'] as const) {
    expect(PRESETS[id].knobs, id).toEqual({ ...KNOBS, minGap: 0.3 })
    expect(PRESETS[id].cuts, id).toBe(false)
    expect(PRESETS[id].low, id).toBe('sub')
  }
  for (const id of ['default', 'dnb', 'dubstep'] as const) expect(PRESETS[id].low, id).toBeUndefined() // sub + reese
  expect(['psy', 'techno', 'house'].map((id) => PRESETS[id as PresetId].name)).toEqual(['Psytrance', 'Techno', 'House'])
  expect([PRESETS.psy.bpm, PRESETS.house.bpm]).toEqual([[135, 150], [118, 130]])
  expect([PRESETS.psy.proto, PRESETS.house.proto]).toEqual([undefined, undefined])
})
