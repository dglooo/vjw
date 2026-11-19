import { describe, expect, test, vi } from 'vitest'
import { createDonor, DONOR_GROUPS } from './audio/donor'
import { BAND_COUNT } from './audio/energy'
import { createFeatures } from './audio/features'
import { PRESETS } from './audio/presets'
import { parseSettings } from './audio/settings'
import { ZERO_SYNC } from './audio/sync'
import { bindable, createRemap, evaluate, gain, level, restyle, sourceGroups, sources, sourcesFor, SOURCE_IDS, type Binding, type Clocked, type Sources } from './bind'
import type { FrameInput } from './frame'
import type { EffectDef } from './fx/types'
import { model } from './scenes/model'
import { particleCount, particles } from './scenes/particles'

vi.mock('./gl/engine', () => ({ fullscreenProgram: () => () => {}, renderTarget: () => ({ fit() {} }), gl: {} })) // I-B3's natives: the engine takes the page's canvas + WebGL at import

const frame = (over: Partial<FrameInput> = {}): FrameInput => ({
  energy: { bands: new Float32Array(BAND_COUNT), level: { bass: 1, mid: 1, treb: 1 }, att: { bass: 1, mid: 1, treb: 1 } },
  onsets: [], lastOnset: null, audioNow: 10, sync: ZERO_SYNC, time: 0, dt: 1 / 60, width: 0, height: 0, ...over,
})
const src = (over: Partial<FrameInput> = {}) => sources(frame(over), {})
const lin = (db: number) => 10 ** (db / 20)
/** Instant (attack and release 0) unless overridden, range 0..1. */
const bind = (over: Partial<Binding> = {}): Binding => ({ source: 'bass', amount: 1, attack: 0, release: 0, min: 0, max: 1, ...over })
const once = (b: Binding, s: Sources) => evaluate(b, s, { y: 0 }, 1 / 60)

describe('sources', () => {
  test('bass, mid and treb are att / 2, clamped to 0..1', () => {
    const s = src({ energy: { ...frame().energy, att: { bass: 2, mid: 1, treb: 0 } } })
    expect([s.bass, s.mid, s.treb]).toEqual([1, 0.5, 0])
    expect(src({ energy: { ...frame().energy, att: { bass: 3, mid: 1, treb: 1 } } }).bass).toBe(1)
  })

  test('bands: a −75…−15 dB window after a +1 dB/band tilt; silence reads 0', () => {
    const bands = new Float32Array(BAND_COUNT)
    bands[0] = lin(-75)
    bands[1] = lin(-46) // −45 after the tilt
    bands[2] = lin(-17) // −15
    bands[10] = lin(-85) // −75
    bands[11] = lin(-26) // −15
    bands[12] = lin(0)
    const s = src({ energy: { ...frame().energy, bands } })
    expect(s.band0).toBeCloseTo(0, 6)
    expect(s.band1).toBeCloseTo(0.5, 6)
    expect(s.band2).toBeCloseTo(1, 6)
    expect(s.band10).toBeCloseTo(0, 6)
    expect(s.band11).toBeCloseTo(1, 6)
    expect(s.band12).toBe(1)
    expect(s.band31).toBe(0) // 0 magnitude
  })

  test('onset: (strength − 1.5) / 2.5, decaying by 1/e every 0.12 s of age; a negative age clamps to 0', () => {
    const at = (age: number, strength = 2.5) => src({ lastOnset: { t: 10 - age, strength } }).onset
    expect(at(0)).toBeCloseTo(0.4, 12)
    expect(at(0.12)).toBeCloseTo(0.4 / Math.E, 12)
    expect(at(-0.05)).toBeCloseTo(0.4, 12)
    expect(at(0, 9)).toBe(1)
    expect(src().onset).toBe(0)
  })

  test('beat, bar and confidence come from the sync, lfo from the time', () => {
    const s = src({ sync: { bpm: 128, beat: 17.25, bar: 4.3, confidence: 0.7 }, time: 12.5 })
    expect([s.beat, s.bar, s.confidence, s.lfo]).toEqual([17.25, 4.3, 0.7, 12.5])
  })

  test('returns `out` itself; with the hit sources, every SOURCE_IDS key filled with a finite number', () => {
    const out: Sources = {}
    expect(sources(frame(), out)).toBe(out)
    createFeatures().fill(out, 1 / 60, parseSettings(null), PRESETS.default)
    out.build = 0.5 // build/drop: app.ts fills these (the arrangement, S5.3), not sources()/fill()
    out.drop = 0.2
    out.energy = 0.5 // P2: the arrangement's too
    out.presence = 0.3 // presence: app.ts fills it (the camera, S1.1), not sources()/fill()
    const g = { beat: 0, bpm: 0, confidence: 0, kick: false, fired: false, build: 0, peakDb: -60, silent: false }
    createDonor(48000, 1024).update(new Float32Array(512).fill(-60), new Float32Array(1024), 1 / 60, g, out) // the donor core: app.ts runs it every frame (S1.4)
    expect(Object.keys(out).sort()).toEqual([...SOURCE_IDS, 'syn_BeatTime', 'syn_BPMTwitcher', 'syn_BPM', 'syn_BPMConfidence', 'syn_PrimeAndBang'].sort()) // + its 5 unlisted keys (PA1)
    expect(SOURCE_IDS).toHaveLength(3 + BAND_COUNT + 5 + 3 + 7 + 3 + 1 + 31) // bass 5 → 7 (subBody, reeseBody: P1), arrangement 2 → 3 (energy: P2), + 31 donor ids (design L109–114)
    for (const k of SOURCE_IDS) expect(Number.isFinite(out[k]), k).toBe(true)
  })
})

describe('sourceGroups (the Scene tab select optgroups, S6.3)', () => {
  const idsOf = (custom: { id: string; name: string }[] = []) => sourceGroups(custom).flatMap((g) => g.ids)

  test('covers every SOURCE_IDS entry exactly once; the band group is the BANDS list', () => {
    const ids = idsOf()
    expect([...ids].sort()).toEqual([...SOURCE_IDS].sort()) // a missing or duplicated id breaks the sorted match
    expect(ids).toHaveLength(SOURCE_IDS.length) // duplicates would survive the sort, so the count pins it
    const bands = sourceGroups().find((g) => g.label === 'band')
    expect(bands?.ids).toEqual(Array.from({ length: BAND_COUNT }, (_, i) => `band${i}`))
  })

  test('T3a: the 5 donor groups are listed after camera, before custom and band: 31 ids, none twice', () => {
    const ids = DONOR_GROUPS.flatMap((g) => g.ids)
    expect(ids).toHaveLength(31)
    expect(new Set(ids).size).toBe(31)
    expect(sourceGroups([{ id: 'u:01ab02', name: '8k' }]).map((g) => g.label)).toEqual(['levels', 'drums', 'bass', 'arrangement', 'timing', 'camera', ...DONOR_GROUPS.map((g) => g.label), 'custom', 'band'])
  })

  test('a non-empty custom adds a custom group, not in the fixed groups', () => {
    const custom = [
      { id: 'u:01ab02', name: '40–60' },
      { id: 'u:03cd04', name: '8k' },
    ]
    const g = sourceGroups(custom)
    expect(g.find((x) => x.label === 'custom')?.ids).toEqual(['u:01ab02', 'u:03cd04'])
    expect([...idsOf(custom)].sort()).toEqual([...SOURCE_IDS, ...custom.map((c) => c.id)].sort())
  })
})

describe('restyle (Auto-style overlay, design C5)', () => {
  const s: Sources = { bass: 0.2, mid: 0.5, onset: 0.1, sub: 0.4, reese: 0.8, kick: 0.9 }
  const at = (from: Record<string, string>, to: Record<string, string>, w: number) => restyle(s, from, to, w, {})

  test('no map is the identity: `out` becomes a copy of the sources, at any w', () => {
    const out: Sources = {}
    expect(restyle(s, {}, {}, 0.5, out)).toBe(out)
    expect(out).toEqual(s)
    expect(out).not.toBe(s)
  })

  test('alias: at w 1 the key reads the mapped source at its own scale; the source and other keys stay', () => {
    expect(at({}, { bass: 'reese' }, 1)).toEqual({ ...s, bass: 0.8 })
    const level = { ...s, bass: 0.6, reese: 0.6 } // equal sources: the fade keeps the level
    for (const w of [0, 0.25, 0.5, 0.75, 1]) expect(restyle(level, {}, { bass: 'reese' }, w, {}).bass).toBeCloseTo(0.6, 12)
  })

  test('a fade between maps at w 0 / 0.5 / 1; a key in one map only falls back to itself in the other', () => {
    const from = { bass: 'sub', mid: 'reese' }
    const to = { bass: 'reese', onset: 'kick' }
    expect(at(from, to, 0)).toEqual({ ...s, bass: 0.4, mid: 0.8 })
    const half = at(from, to, 0.5)
    expect([half.bass, half.mid, half.onset].map((x) => +x.toFixed(12))).toEqual([0.6, 0.65, 0.5])
    expect(at(from, to, 1)).toEqual({ ...s, bass: 0.8, onset: 0.9 })
  })

  test('Auto off is a fade to {}: it starts on the map and ends on the identity', () => {
    expect(at({ bass: 'reese' }, {}, 0)).toEqual({ ...s, bass: 0.8 })
    expect(at({ bass: 'reese' }, {}, 1)).toEqual(s)
  })

  test('a source not filled yet reads 0, never NaN', () => {
    expect(at({}, { bass: 'nope' }, 0).bass).toBe(0.2)
    expect(at({}, { bass: 'nope' }, 1).bass).toBe(0)
    expect(at({ bass: 'nope' }, {}, 1).bass).toBe(0.2) // 0 × NaN would still be NaN
  })

  test('sourcesFor: built-ins read the overlay, every other scene `src`; no overlay, all read `src`', () => {
    const src: Sources = {}
    const styled: Sources = {}
    expect(sourcesFor('builtin:tunnel', src, styled)).toBe(styled)
    expect(sourcesFor('6f1c2a9e-3b4d-4e5f-8a7b-9c0d1e2f3a4b', src, styled)).toBe(src)
    expect(sourcesFor('builtin:tunnel', src, null)).toBe(src)
    expect(sourcesFor('builtin:calibration', src, styled)).toBe(src) // the calibration view: the analyser's own, no remap
  })
})

describe('createRemap (the 2 s crossfade, S4.3)', () => {
  const map = { bass: 'reese' }
  const s: Sources = { bass: 0.2, reese: 0.8 }
  test('a changed target (incl. the first, {} → map) restarts the ramp at 0; 1/2 per s; capped at 1', () => {
    const r = createRemap()
    expect(r.frame(map, 1 / 60)).toEqual([{}, map, 1 / 120]) // {} → map is a change: w starts at 0
    expect(r.frame(map, 1 / 60)[2]).toBeCloseTo(1 / 60, 12) // unchanged: the ramp keeps running
    const [f0, t0] = r.frame({}, 1 / 60) // map → {}: from is the old map
    expect([f0, t0]).toEqual([map, {}])
    expect(r.frame({}, 2)[2]).toBe(1) // 2 s closes it
    expect(r.frame({}, 2)[2]).toBe(1) // capped
  })

  test('w advances by dt/2 per frame; a changed target restarts w at 0; dt 0 holds', () => {
    const r = createRemap()
    r.frame(map, 0)
    expect(r.frame({ onset: 'kick' }, 1)[2]).toBeCloseTo(0.5, 12) // 1 s into a 2 s fade
    expect(r.frame({ onset: 'kick' }, 0)[2]).toBeCloseTo(0.5, 12) // same target, dt 0: holds
    expect(r.frame({ treb: 'hats' }, 0.5)[2]).toBeCloseTo(0.25, 12) // a new map restarts w at 0
    expect(r.frame({}, 1)[2]).toBeCloseTo(0.5, 12) // another change: restarts again
    expect(r.frame({}, 1)[2]).toBe(1)
  })

  test('restyle at the ramp: Auto on follows the map by w, Auto off falls back to the own source', () => {
    const r = createRemap()
    r.frame(map, 2) // the first fade closed: fully on the map
    const [f0, t0, w0] = r.frame(map, 0)
    expect(restyle(s, f0, t0, w0, {}).bass).toBeCloseTo(s.reese, 12)
    r.frame({}, 1) // 1 s into the fade back
    const [f1, t1, w1] = r.frame({}, 0)
    expect(restyle(s, f1, t1, w1, {}).bass).toBeCloseTo((1 - 0.5) * s.reese + 0.5 * s.bass, 12)
  })
})

describe('evaluate', () => {
  test('an unknown source reads 0, so the output is `min`', () => {
    expect(once(bind({ source: 'nope', min: 0.3, max: 0.9 }), { bass: 1 })).toBe(0.3)
    expect(once(bind({ source: 'toString', min: 0.3, max: 0.9 }), {})).toBe(0.3) // not the prototype's
  })

  test('amount scales, then the value clamps to 0..1; the range maps it', () => {
    expect(once(bind({ amount: 2 }), { bass: 0.3 })).toBeCloseTo(0.6, 12)
    expect(once(bind({ amount: 2 }), { bass: 0.7 })).toBe(1)
    expect(once(bind({ amount: -1 }), { bass: 0.7 })).toBe(0)
    expect(once(bind({ min: 2, max: 6 }), { bass: 0.25 })).toBe(3)
    expect(once(bind({ min: 1, max: 0 }), { bass: 0.25 })).toBe(0.75) // min > max inverts
  })

  test('evaluate lerps an inverted range (min > max)', () => {
    const b = bind({ source: 'build', attack: 1, release: 1, min: 0.35, max: 0.15 }) // own/bloom's threshold (G3)
    for (const [build, want] of [[0, 0.35], [0.5, 0.25], [1, 0.15]]) expect(once({ ...b, attack: 0, release: 0 }, { build })).toBeCloseTo(want, 12)
    const state = { y: 0 }
    let v = 0
    for (let i = 0; i < 60; i++) v = evaluate(b, { build: 1 }, state, 1 / 60)
    expect(v).toBeCloseTo(0.35 - 0.2 * (1 - 1 / Math.E), 6) // the one-pole runs on y, then the range maps it down
  })

  test('the one-pole is fps-independent: a fall with release 0.15 lands on the same value at 60 and 30 fps', () => {
    const fall = (fps: number) => {
      const state = { y: 1 }
      let v = 1
      for (let i = 0; i < 0.3 * fps; i++) v = evaluate(bind({ release: 0.15 }), { bass: 0 }, state, 1 / fps)
      return v
    }
    expect(fall(60)).toBeCloseTo(fall(30), 3)
    expect(fall(60)).toBeCloseTo(Math.exp(-2), 6)
  })

  test('attack 0 is instant; attack 0.5 reaches 1 − 1/e after 0.5 s; dt 0 holds', () => {
    expect(evaluate(bind(), { bass: 1 }, { y: 0 }, 1 / 60)).toBe(1)
    const state = { y: 0 }
    let v = 0
    for (let i = 0; i < 30; i++) v = evaluate(bind({ attack: 0.5 }), { bass: 1 }, state, 1 / 60)
    expect(v).toBeCloseTo(1 - 1 / Math.E, 6)
    expect(evaluate(bind({ attack: 0.5 }), { bass: 1 }, { y: 0.2 }, 0)).toBe(0.2)
    expect(evaluate(bind({ release: 0.5 }), { bass: 0 }, { y: 0.2 }, 0)).toBe(0.2)
  })

  test('beat with saw: 1 on the beat line, 0.5 mid-beat, × confidence', () => {
    const saw = bind({ source: 'beat', shape: 'saw' })
    expect(once(saw, { beat: 4, confidence: 1 })).toBe(1)
    expect(once(saw, { beat: 4.5, confidence: 1 })).toBe(0.5)
    expect(once(saw, { beat: 4, confidence: 0.5 })).toBe(0.5)
    expect(once(bind({ source: 'beat' }), { beat: 0.3, confidence: 0 })).toBe(0.3) // no shape: the raw value
  })

  test('bar with rate 2 cycles twice per bar', () => {
    const b = bind({ source: 'bar', shape: 'saw', rate: 2 })
    expect([0, 0.25, 0.5, 0.75].map((bar) => once(b, { bar, confidence: 1 }))).toEqual([1, 0.5, 1, 0.5])
  })

  test('lfo sine at time 0 / 0.25 / 0.5 → 0 / 0.5 / 1, not gated by confidence', () => {
    const b = bind({ source: 'lfo', shape: 'sine' })
    const v = [0, 0.25, 0.5].map((lfo) => once(b, { lfo, confidence: 0 }))
    expect(v[0]).toBeCloseTo(0, 12)
    expect(v[1]).toBeCloseTo(0.5, 12)
    expect(v[2]).toBeCloseTo(1, 12)
  })

  test('square and tri at three phases', () => {
    const at = (shape: Binding['shape'], lfo: number) => once(bind({ source: 'lfo', shape }), { lfo })
    expect([0.1, 0.4, 0.6].map((p) => at('square', p))).toEqual([1, 1, 0])
    expect(at('tri', 0)).toBe(0)
    expect(at('tri', 0.25)).toBe(0.5)
    expect(at('tri', 2.5)).toBe(1)
  })

  test('random holds within a cycle and changes across cycles', () => {
    const b = bind({ source: 'lfo', shape: 'random', rate: 2 })
    const v = (lfo: number) => once(b, { lfo })
    expect(v(1.01)).toBe(v(1.24)) // one cycle at rate 2 is [1.0, 1.5)
    const cycles = Array.from({ length: 8 }, (_, i) => v(i / 2 + 0.1))
    expect(new Set(cycles).size).toBeGreaterThanOrEqual(2)
    for (const x of cycles) expect(x >= 0 && x < 1).toBe(true)
  })
})

describe('level (a bound bool or event, S1.3)', () => {
  /** The values written over a run of frames, `held` carried as live.ts carries it. */
  const run = (type: 'bool' | 'event', ys: number[]) => {
    let held: boolean | undefined
    return ys.map((y) => {
      const [v, h] = level(type, y, held)
      held = h
      return v
    })
  }

  test('bool follows y ≥ .5', () => {
    expect(run('bool', [0, 0.49, 0.5, 0.9, 0.7, 0.3, 0.6])).toEqual([false, false, true, true, true, false, true])
  })

  test('event fires once on a rising edge, stays false while held, re-arms after y < .5', () => {
    expect(run('event', [0, 0.6, 0.9, 0.5, 0.49, 0.8, 0.8, 0.2])).toEqual([false, true, false, false, false, true, false, false])
  })
})

describe('bindable (GPU3D S4.4, RG-2)', () => {
  const input = (d: EffectDef, name: string) => d.inputs.find((x) => x.name === name)!
  test('I-B3 bind refuses native/model samples, takes glass and speed; count takes a source and clamps to 0..1048576', () => {
    expect(['samples', 'glass', 'speed'].map((n) => bindable(input(model, n)))).toEqual([false, true, true])
    expect(bindable(input(particles, 'count'))).toBe(true)
    const b = bind({ min: -5, max: 2_000_000 }) // out of range at both ends
    expect([0, 1].map((x) => particleCount(once(b, { bass: x }), false))).toEqual([0, 1048576])
  })
})

describe('clock bindings (audio clocks, user 2026-11-17)', () => {
  const clock = (c: Partial<Clocked> = {}, over: Partial<Binding> = {}) => bind({ clock: { base: 0, k: 1, wrap: true, ...c }, ...over })
  /** The value after each frame at dt 0.1 s, `bass` at xs[i]. */
  const run = (b: Binding, xs: number[], state = { y: 0 }) => xs.map((bass) => evaluate(b, { bass }, state, 0.1))
  const near = (a: number[], b: number[]) => a.forEach((v, i) => expect(v, `#${i}`).toBeCloseTo(b[i], 12))

  test('runs at base + k · source ranges per s; wrap goes past max back to min (both ways), clamp holds at the ends', () => {
    near(run(clock(), [0.5, 0.5, 1]), [0.05, 0.1, 0.2]) // k 1: half a range per s at .5
    near(run(clock({ base: 0.25 }), Array(9).fill(1)).slice(-2), [0, 0.125]) // 1.25 ranges per s: max is min again at the 8th frame
    expect(run(clock({ base: 0.25, wrap: false }), Array(9).fill(1)).at(-1)).toBe(1) // clamp: held at max
    near(run(clock({ base: -0.25, k: 0 }), [0]), [0.975]) // backwards past min
    expect(run(clock({ base: -1, k: 0, wrap: false }), [0, 0])).toEqual([0, 0]) // a drain held at min
  })

  test('the range maps the position (min > max runs backwards); amount, shape and smoothing do not apply', () => {
    near(run(clock({}, { min: 2, max: 4 }), [0.5]), [2.1])
    near(run(clock({}, { min: 4, max: 2 }), [0.5]), [3.9])
    near(run(clock({ k: 2 }, { amount: 4, attack: 1, release: 1, shape: 'square' }), [0.5, 0.5]), [0.1, 0.2])
  })

  test('a muted source stops the clock where it is; a base keeps it running; a NaN restarts it at min', () => {
    const state = { y: 0 }
    const s: Sources = { bass: 0.5 }
    const b = clock({ k: 2 })
    for (let i = 0; i < 3; i++) evaluate(b, s, state, 0.1)
    gain(s, { sens: {}, mute: ['bass'] })
    near([evaluate(b, s, state, 0.1), evaluate(b, s, state, 0.1)], [0.3, 0.3])
    near([evaluate(clock({ base: 0.1, k: 2 }), s, state, 0.1)], [0.31])
    expect(evaluate(clock({}, { source: 'constructor' }), {}, state, 0.1)).toBe(0) // the prototype's: NaN, so 0
  })

  test('the position is the state, so a switch between the modes never jumps', () => {
    const state = { y: 0 }
    expect(evaluate(bind(), { bass: 0.7 }, state, 0.1)).toBe(0.7)
    near([evaluate(clock({ k: 0 }), { bass: 0.7 }, state, 0.1)], [0.7])
  })
})

describe('gain (the Sources tab, user 2026-11-17)', () => {
  test('× sens: a level capped at 1, a count scaled (its shapes run faster); an absent source stays absent', () => {
    const s: Sources = { bass: 0.4, kick: 0.8, beat: 10.5, lfo: 3 }
    expect(gain(s, { sens: { bass: 0.5, kick: 2, beat: 2, nope: 2 }, mute: [] })).toBe(s)
    expect(s).toEqual({ bass: 0.2, kick: 1, beat: 21, lfo: 3 })
  })

  test('a muted source reads 0 whatever its gain: a binding on it falls to min, the others keep theirs', () => {
    const s: Sources = { bass: 0.6, mid: 0.6 }
    gain(s, { sens: { bass: 2 }, mute: ['bass'] })
    expect(s).toEqual({ bass: 0, mid: 0.6 })
    expect([once(bind({ min: 2, max: 3 }), s), once(bind({ source: 'mid' }), s)]).toEqual([2, 0.6])
  })

  test('T3b: a donor source takes its gain like ours', () => {
    expect(gain({ syn_BassLevel: 0.8 }, { sens: { syn_BassLevel: 0.5 }, mute: [] }).syn_BassLevel).toBeCloseTo(0.4, 6)
  })
})
