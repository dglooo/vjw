// plan_scenes_wave3.md S0.1: the sampler's pure seam on synthetic masks (count, support, determinism, the density
// ratio, raster order) and the animals' data (every set id resolves to a drawable path). The rasteriser itself needs
// a 2D canvas: that is the browser check (the readability sheet). S0.2: the morph clock (`morphStep`), creatures'
// pure seam, and creatures' def against its built-in scene.
import { expect, test, vi } from 'vitest'
import { SOURCE_IDS } from '../bind'
import { ANIMALS, SETS } from './animals'
import { BUILTIN } from './builtin'
import { creatures, creaturesN } from './creatures'
import { morphStep, sampleMask, type Morph } from './shapes'

vi.mock('../gl/engine', () => ({})) // takes the page's canvas + WebGL at import; the def needs neither

const W = 16
const H = 16
/** The texel a sample sits on. */
const texel = (xy: Float32Array, i: number) => Math.floor(xy[2 * i + 1] * H) * W + Math.floor(xy[2 * i] * W)
/** A 16×16 mask: rows 2–5 at 96, rows 9–12 at 255 (equal areas), a hole at (7, 10); the rest empty. */
const mask = () => {
  const m = new Uint8Array(W * H)
  m.fill(96, 2 * W, 6 * W)
  m.fill(255, 9 * W, 13 * W)
  m[10 * W + 7] = 0
  return m
}

test('sampleMask: n samples in [0, 1), every one on a non-zero texel', () => {
  const m = mask()
  const n = 5000
  const xy = sampleMask(m, W, H, n)
  expect(xy.length).toBe(2 * n)
  for (let i = 0; i < n; i++) {
    expect(xy[2 * i] >= 0 && xy[2 * i] < 1 && xy[2 * i + 1] >= 0 && xy[2 * i + 1] < 1).toBe(true)
    expect(m[texel(xy, i)]).toBeGreaterThan(0)
  }
})

test('sampleMask: same seed → same points; another seed → other points', () => {
  const m = mask()
  expect(sampleMask(m, W, H, 500, 7)).toEqual(sampleMask(m, W, H, 500, 7))
  expect(sampleMask(m, W, H, 500)).toEqual(sampleMask(m, W, H, 500, 1)) // the default seed
  expect(sampleMask(m, W, H, 500, 8)).not.toEqual(sampleMask(m, W, H, 500, 7))
})

test('sampleMask: a 255 region draws ≈ 2.7× an equal-area 96 region', () => {
  const m = mask()
  m[10 * W + 7] = 255 // no hole here: the areas are equal
  const n = 20000
  const xy = sampleMask(m, W, H, n)
  let grey = 0
  let white = 0
  for (let i = 0; i < n; i++) {
    if (m[texel(xy, i)] === 255) white++
    else grey++
  }
  expect(grey + white).toBe(n)
  expect(white / grey).toBeGreaterThan((255 / 96) * 0.85)
  expect(white / grey).toBeLessThan((255 / 96) * 1.15)
})

test('sampleMask: raster order — the texel index never decreases, and index i is the i/n mass quantile', () => {
  const m = mask()
  const n = 3000
  const xy = sampleMask(m, W, H, n)
  for (let i = 1; i < n; i++) expect(texel(xy, i)).toBeGreaterThanOrEqual(texel(xy, i - 1))
  // The 96 rows hold 96 / (96 + 255) of the mass (the hole's 255 aside): the last sample on them sits at that quantile.
  const total = m.reduce((s, v) => s + v, 0)
  let lastGrey = 0
  for (let i = 0; i < n; i++) if (m[texel(xy, i)] === 96) lastGrey = i
  expect(Math.abs((lastGrey + 1) / n - (96 * 4 * W) / total)).toBeLessThan(2 / n)
})

test('animals: every set id is an animal with a path to draw; the first set is spirit [wolf, eagle]', () => {
  expect(SETS[0]).toEqual({ name: 'spirit', ids: ['wolf', 'eagle'] })
  for (const set of SETS) {
    expect(set.ids.length).toBeGreaterThan(0)
    for (const id of set.ids) expect(ANIMALS[id]?.d || ANIMALS[id]?.lines, `${set.name}: ${id}`).toBeTruthy()
  }
})

const M0: Morph = { from: 0, to: 0, mix: 1, slot: NaN, dur: 1 } // creatures' start: the first animal, settled, no count yet

test('morphStep: an edge slams to the next animal and wraps at len; mix reaches 1 after SLAM', () => {
  let m = morphStep(M0, 2, true, 3, 16, 1 / 60)
  expect(m).toEqual({ from: 0, to: 1, mix: 0, slot: 3, dur: 0.12 })
  for (let i = 0; i < 7; i++) m = morphStep(m, 2, false, 3, 16, 1 / 60) // 0.117 s: not yet
  expect(m.mix).toBeLessThan(1)
  m = morphStep(m, 2, false, 3, 16, 1 / 60) // 0.133 s ≥ SLAM
  expect(m.mix).toBe(1)
  expect(morphStep(m, 2, true, 3, 16, 1 / 60)).toMatchObject({ from: 1, to: 0, mix: 0 }) // the next edge wraps
})

test('morphStep: hold 16 morphs calmly once per 16 bars, over PHASE; hold 0 never does; no edge, no change', () => {
  const run = (hold: number) => { // 40 bars at 8 frames a bar
    let m = M0
    let n = 0
    for (let i = 0; i <= 320; i++) {
      const was = m.to
      m = morphStep(m, 2, false, i / 8, hold, 0.2)
      if (m.to !== was) n++
    }
    return n
  }
  expect(run(16)).toBe(2) // into bars 16 and 32
  expect(run(0)).toBe(0)
  const still = morphStep(M0, 2, false, 0, 16, 0.2) // the count starts at bar 0
  expect(morphStep(still, 2, false, 15.9, 16, 0.2)).toEqual(still) // settled, inside the hold: nothing moves
  let m = morphStep(still, 2, false, 16, 16, 0.2)
  expect(m).toEqual({ from: 0, to: 1, mix: 0, slot: 16, dur: 1.5 })
  for (let i = 0; i < 7; i++) m = morphStep(m, 2, false, 16.1, 16, 0.2) // 1.4 s: not yet
  expect(m.mix).toBeLessThan(1)
  expect(morphStep(m, 2, false, 16.1, 16, 0.2).mix).toBe(1) // 1.6 s ≥ PHASE
})

test('morphStep: the hold counts from the last switch; an unset count, hold 0 and a restarted grid start it anew, without a morph', () => {
  let m = morphStep(M0, 2, false, 40, 16, 0.1) // a scene cut to at bar 40 opens on its first animal
  expect(m).toEqual({ ...M0, slot: 40 })
  m = morphStep(m, 2, false, 47, 0, 0.1) // off (creatures: the build's loose cloud)
  m = morphStep(m, 2, false, 60, 16, 0.1) // back on 20 bars after the cut: not made up for
  expect(m).toEqual({ ...M0, slot: 60 })
  m = morphStep(m, 2, true, 70, 16, 0.1) // the drop slams…
  expect(m).toMatchObject({ to: 1, slot: 70 })
  expect(morphStep(m, 2, false, 85.9, 16, 0.1).to).toBe(1) // …and its animal holds 16 bars from there
  expect(morphStep(m, 2, false, 86, 16, 0.1)).toMatchObject({ from: 1, to: 0, dur: 1.5 })
  expect(morphStep(m, 2, false, 2, 16, 0.1)).toMatchObject({ to: 1, slot: 2 }) // the grid restarted: counted from its bar
})

test('creatures: builtin:spirit is starred and repeats the def bind on real sources; set lists SETS; a tile runs a tenth of the points', () => {
  const d = BUILTIN.find((x) => x.id === 'builtin:spirit')!
  const gen = d.layers[0].gen
  expect(d.star).toBe(true)
  expect(gen.ref).toBe(creatures.id)
  expect(gen.bind).toEqual(creatures.bind)
  for (const [name, b] of Object.entries(creatures.bind!)) {
    expect(creatures.inputs.some((i) => i.name === name), name).toBe(true)
    expect(SOURCE_IDS).toContain(b.source)
  }
  expect(creatures.inputs[0]).toMatchObject({ name: 'set', type: 'long', labels: SETS.map((s) => s.name) })
  expect(creaturesN([320, 180])).toBe(Math.round(creaturesN() / 10))
})
