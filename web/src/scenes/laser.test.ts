// plan wave 3 S2.1 (rework, CP2): the pure seams — the mode-0 field (mirror symmetry, the stepped pose, the
// amp's reach) and the traceBands twin (a synthetic disc → one closed boundary loop on the edge ± 1 cell; the
// saddle routing; the cap respected). The GL is the browser check.
import { expect, test, vi } from 'vitest'
import { SOURCE_IDS } from '../bind'
import { BUILTIN } from './builtin'
import { contourNormal, laser, laserField, laserGrid, traceBands } from './laser'

vi.mock('../gl/engine', () => ({})) // takes the page's canvas + WebGL at import; the seams need neither

const SAMPLES: [number, number][] = []
for (let j = 0; j <= 16; j++) for (let i = 0; i <= 16; i++) SAMPLES.push([i / 16, j / 16])

test('laser: a geometry generator, tagged for the 2b library; the tile halves the grid (the wireform precedent)', () => {
  expect(laser.kind).toBe('generator')
  expect(laser.category).toBe('geometry')
  expect(laser.tags).toEqual(['laser', 'trace'])
  expect(laserGrid()).toBe(96)
  expect(laserGrid([320, 180])).toBe(48)
  expect(laser.flash).toEqual(['hit', 'width', 'burst']) // width [F] per row 6 / the step's behaviour
})

test('laserField mode 0: mirror-symmetric about x = ½ (the strict techno geometry)', () => {
  for (const [x, y] of SAMPLES) {
    const a = laserField(0, x, y, 1.37, 0.5, 0.4, 0.3)
    const b = laserField(0, 1 - x, y, 1.37, 0.5, 0.4, 0.3)
    // the residue is the (1−x)−(1−ex) cancellation (~1e-15); a band flip needs ~1e-3
    expect(Math.abs(a - b), `x ${x} y ${y}`).toBeLessThan(1e-12)
  }
  expect(laserField(0, 0.5, 0.5, 0.7, 0.25, 0, 0)).toBeGreaterThan(0) // the lattice's centre is lit
  for (const [x, y] of SAMPLES) expect(Number.isFinite(laserField(0, x, y, 2.1, 0, 1, 1))).toBe(true)
})

test('laserField mode 0: the stepped pose — identical between pose steps, changed across one (pose = floor(phase·steps)/steps)', () => {
  const t = 0.9, amp = 0.3, scan = 0.2
  const pose = (phase: number, steps = 4) => Math.floor(phase * steps) / steps
  const field = (p: number) => SAMPLES.map(([x, y]) => laserField(0, x, y, t, p, amp, scan))
  // same step → same field (phase 0.10 and 0.24 both floor to pose 0; 0.25 and 0.49 both to 0.25)
  expect(field(pose(0.10))).toEqual(field(pose(0.24)))
  expect(field(pose(0.25))).toEqual(field(pose(0.49)))
  // across a step boundary the field changes (and the picture is deterministic)
  const maxDelta = Math.max(...field(pose(0.25)).map((v, i) => Math.abs(v - field(pose(0.5))[i])))
  expect(maxDelta).toBeGreaterThan(0.01)
  // pose 1 wraps to pose 0 (all pose terms are periodic): the bar saw's end == its start
  expect(Math.max(...field(1).map((v, i) => Math.abs(v - field(0)[i])))).toBeLessThan(1e-12)
})

test("laserField mode 0: amp scales the blob reach — the field's energy grows with the sub", () => {
  const t = 1.7, pose = 0.5
  const energy = (amp: number) => SAMPLES.reduce((s, [x, y]) => s + Math.max(0, laserField(0, x, y, t, pose, amp, 0)), 0)
  const e0 = energy(0), e1 = energy(0.5), e2 = energy(1)
  expect(e1).toBeGreaterThan(e0)
  expect(e2).toBeGreaterThan(e1)
})

test('traceBands: a synthetic disc → one closed boundary loop, midpoints on the edge ± 1 cell', () => {
  const w = 33, h = 33, r = 12
  const bands = new Float32Array(w * h)
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) if (Math.hypot(i - 16, j - 16) <= r) bands[j * w + i] = 1
  const segs = traceBands(bands, w, h, 100000)
  expect(segs.length).toBeGreaterThan(40)
  for (const [x0, y0, x1, y1, level] of segs) {
    expect(level).toBe(0) // the single boundary of the 0/1 field
    const mx = (x0 + x1) / 2 * (w - 1) - 16, my = (y0 + y1) / 2 * (h - 1) - 16
    expect(Math.abs(Math.hypot(mx, my) - r), `mid ${x0},${y0}→${x1},${y1}`).toBeLessThanOrEqual(1.01) // ± 1 cell
  }
  // one closed loop: every endpoint is shared by exactly two segments, in a single connected component
  const key = (x: number, y: number) => `${x.toFixed(6)},${y.toFixed(6)}`
  const at = new Map<string, number>()
  for (const [x0, y0, x1, y1] of segs) {
    for (const k of [key(x0, y0), key(x1, y1)]) at.set(k, (at.get(k) ?? 0) + 1)
  }
  expect([...at.values()].every((c) => c === 2)).toBe(true)
  const adj = new Map<string, string[]>()
  const add = (a: string, b: string) => (adj.get(a) ?? adj.set(a, []).get(a)!).push(b)
  for (const [x0, y0, x1, y1] of segs) {
    const a = key(x0, y0), b = key(x1, y1)
    add(a, b)
    add(b, a)
  }
  const start = [...adj.keys()][0]
  const seen = new Set([start])
  const stack = [start]
  while (stack.length) {
    const nx = adj.get(stack.pop()!) ?? []
    for (const x of nx) if (!seen.has(x)) { seen.add(x); stack.push(x) }
  }
  expect(seen.size).toBe(at.size) // every vertex reachable: the loop is closed and singular
})

test('traceBands: the saddle cases route by the corners\' mean (deterministic, tested both ways)', () => {
  // a 2×2 grid is one cell. case 10 (a,c high): mean 0.5 ≥ t 0.5 → the minority corners wrap: [TOP,RIGHT] + [LEFT,BOTTOM]
  let segs = traceBands(new Float32Array([1, 0, 0, 1]), 2, 2, 100)
  expect(segs.map((s) => [s[0], s[1], s[2], s[3], s[4]])).toEqual([
    [0.5, 0, 1, 0.5, 0],
    [0, 0.5, 0.5, 1, 0],
  ])
  // case 5 (b,d high): mean 0.5 ≥ t 0.5 → [TOP,LEFT] + [BOTTOM,RIGHT]
  segs = traceBands(new Float32Array([0, 1, 1, 0]), 2, 2, 100)
  expect(segs.map((s) => [s[0], s[1], s[2], s[3], s[4]])).toEqual([
    [0.5, 0, 0, 0.5, 0],
    [0.5, 1, 1, 0.5, 0],
  ])
})

test('traceBands: a continuous band coordinate interpolates sub-cell (smooth contours, not the integer staircase)', () => {
  // a ramp along x, v = 0.3·i − 0.5 (the draw's F·K/VMAX − ½): level L's boundary (t = L + ½) sits at i = 10(L + 1)/3
  const w = 12, h = 4
  const bands = new Float32Array(w * h)
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) bands[j * w + i] = 0.3 * i - 0.5
  const segs = traceBands(bands, w, h, 1000)
  expect(segs.every((s) => s[4] >= 0 && s[4] <= 2)).toBe(true) // v ∈ [−½, 2.8]: levels 0..2, never a negative level
  for (const L of [0, 1, 2]) {
    const s = segs.filter((x) => x[4] === L)
    expect(s).toHaveLength(h - 1) // one straight boundary per level
    for (const [x0, , x1] of s) for (const x of [x0, x1]) expect(x * (w - 1)).toBeCloseTo((10 * (L + 1)) / 3, 4)
  }
})

test('traceBands: the cap is respected — over budget, the shortest segments drop; never a crash', () => {
  // a checkerboard of 0/1: every cell is a saddle → 2 segments per cell
  const w = 16, h = 16
  const bands = new Float32Array(w * h)
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) bands[j * w + i] = (i + j) % 2
  const all = traceBands(bands, w, h, 100000)
  expect(all.length).toBe(2 * (w - 1) * (h - 1))
  const capped = traceBands(bands, w, h, 100)
  expect(capped.length).toBeLessThanOrEqual(100)
  expect(capped.length).toBeGreaterThan(0)
  // the kept ones are the longest: nothing in the kept set is shorter than the shortest dropped
  const len = (s: [number, number, number, number, number]) => Math.hypot(s[2] - s[0], s[3] - s[1])
  const key5 = (s: number[]) => s.join(',')
  const keptKeys = new Set(capped.map(key5))
  const kept = capped.map(len), dropped = all.filter((s) => !keptKeys.has(key5(s))).map(len)
  // the kept ones are the longest, to float32 length granularity (the trace stores normalized coords in f32)
  expect(Math.min(...kept)).toBeGreaterThanOrEqual(Math.max(...dropped) - 1e-6)
  // an empty field traces nothing; cap 0 survives
  expect(traceBands(new Float32Array(16 * 16), 16, 16, 1000)).toEqual([])
  expect(traceBands(bands, w, h, 0).length).toBe(0)
})

const ROW6 = {
  phase: { source: 'bar', shape: 'saw', amount: 1, attack: 0, release: 0, min: 0, max: 1 },
  K: { source: 'build', amount: 1, attack: 1, release: 0.3, min: 3, max: 6 },
  amp: { source: 'sub', amount: 1, attack: 0.05, release: 0.3, min: 0, max: 1 },
  scan: { source: 'reese', amount: 1, attack: 0.05, release: 0.4, min: 0, max: 1 },
  dash: { source: 'hats', amount: 1, attack: 0, release: 0.06, min: 0, max: 1 },
  hue: { source: 'snare', amount: 1, attack: 0, release: 0.25, min: 0, max: 0.25 },
  width: { source: 'kick', amount: 1, attack: 0, release: 0.12, min: 0, max: 0.6 },
  hit: { source: 'kick', amount: 1, attack: 0, release: 0.12, min: 0, max: 0.5 },
  burst: { source: 'drop', amount: 1, attack: 0, release: 0.4, min: 0, max: 1 },
} as const

test('contourNormal (fix 1, F6): the gradient normal at both ends of every traced segment is ⊥ it and points uphill', () => {
  const w = 49, g = new Float32Array(w * w)
  for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) g[j * w + i] = 3 - Math.hypot(i - 24, j - 24) / 8 // a cone: rings at r 20, 12, 4
  const n = new Float64Array(2)
  const segs = traceBands(g, w, w, 1e9)
  expect(segs.length).toBeGreaterThan(50)
  for (const [x0, y0, x1, y1] of segs) {
    const sx = x1 - x0, sy = y0 - y1, sl = Math.hypot(sx, sy) // scene orientation (y up), aspect 1
    if (sl < 1e-6) continue // a corner-through crossing (the draw skips it too)
    for (const [x, y] of [[x0, y0], [x1, y1]]) {
      expect(contourNormal(g, w, w, x, y, 1, n)).toBe(true)
      expect(Math.abs(n[0] * sx + n[1] * sy) / sl).toBeLessThan(0.3) // ⊥ the chord (a swapped axis reads ≈ 1)
      expect(n[0] * (0.5 - x) + n[1] * (y - 0.5)).toBeGreaterThan(0) // uphill: toward the apex
    }
  }
})

test('builtin:laser-grid: mode 0 on native/laser, the row-6 bindings (the ⚡ pair bound from 0), starred', () => {
  const d = BUILTIN.find((x) => x.id === 'builtin:laser-grid')!
  expect(d.star).toBe(true)
  expect(d.layers).toHaveLength(1)
  const gen = d.layers[0].gen
  expect(gen.ref).toBe(laser.id)
  expect(gen.values).toMatchObject({ mode: 0, steps: 4, K: 5, haze: 0.5 })
  expect(gen.bind).toEqual(ROW6) // the def bind is repeated (the vortex/orb precedent)
  for (const name of Object.keys(gen.bind!)) expect(laser.inputs.some((i) => i.name === name), name).toBe(true)
  expect(gen.bind!.hit.min).toBe(0) // the ⚡ pair from 0 (the flashGate's policy)
  expect(gen.bind!.burst.min).toBe(0)
})

test('the def bind names declared inputs and real sources (the plexus test, same shape)', () => {
  for (const [name, b] of Object.entries(laser.bind!)) {
    expect(laser.inputs.some((i) => i.name === name), name).toBe(true)
    expect(SOURCE_IDS).toContain(b.source)
  }
})
