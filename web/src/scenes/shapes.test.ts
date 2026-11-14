// plan_scenes_wave3.md S0.1: the sampler's pure seam on synthetic masks (count, support, determinism, the density
// ratio, raster order) and the animals' data (every set id resolves to a drawable path). The rasteriser itself needs
// a 2D canvas: that is the browser check (the readability sheet).
import { expect, test } from 'vitest'
import { ANIMALS, SETS } from './animals'
import { sampleMask } from './shapes'

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
