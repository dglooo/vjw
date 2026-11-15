// plan_scenes_wave3.md S3.3: the orbPoints seam (the CP3 contract: the Fibonacci lattice's unit vectors)
// and the shatterEnv seam (the novaState-style: 0 before the first drop and after the envelope ends, a blow
// out inside), plus the registration (the def's binds ⊆ declared inputs, real sources; builtin:orb repeats
// the def's bind). The GL itself is the browser check.
import { expect, test, vi } from 'vitest'
import { SOURCE_IDS } from '../bind'
import { BUILTIN } from './builtin'
import { orb, orbN, orbPoints, shatterEnv } from './orb'

vi.mock('../gl/engine', () => ({})) // takes the page's canvas + WebGL at import; the def and the seams need neither

test('orbPoints: n×3 unit vectors (±1e-5), deterministic (same n twice → identical)', () => {
  for (const n of [1, 1000, orbN()]) {
    const p = orbPoints(n)
    expect(p.length).toBe(n * 3)
    for (let i = 0; i < n; i++) {
      expect(Math.abs(Math.hypot(p[3 * i], p[3 * i + 1], p[3 * i + 2]) - 1), `n ${n} i ${i}`).toBeLessThan(1e-5)
    }
    expect(orbPoints(n)).toEqual(p)
  }
})

test('orbPoints: |mean| < 0.02 and y spans −1…1', () => {
  const n = orbN(), p = orbPoints(n)
  let mx = 0, my = 0, mz = 0, ymin = 2, ymax = -2
  for (let i = 0; i < n; i++) {
    mx += p[3 * i]; my += p[3 * i + 1]; mz += p[3 * i + 2]
    ymin = Math.min(ymin, p[3 * i + 1]); ymax = Math.max(ymax, p[3 * i + 1])
  }
  expect(Math.hypot(mx, my, mz) / n).toBeLessThan(0.02)
  expect(ymax).toBeGreaterThan(0.99)
  expect(ymin).toBeLessThan(-0.99)
})

test('shatterEnv: exactly 0 before the first drop (age = ∞) and after the envelope ends', () => {
  expect(shatterEnv(Infinity)).toBe(0) // no drop yet
  expect(shatterEnv(-1)).toBe(0) // before the edge (defensive)
  expect(shatterEnv(2)).toBe(0) // the envelope's end: exactly settled
  expect(shatterEnv(4.2)).toBe(0)
  expect(shatterEnv(1e9)).toBe(0)
})

test('shatterEnv: the blow out inside (the peak at u .2–.45), continuous at its knots', () => {
  let peak = 0
  for (let age = 0; age <= 2; age += 0.05) {
    const e = shatterEnv(age)
    expect(Number.isFinite(e) && e >= 0, `age ${age}`).toBe(true)
    peak = Math.max(peak, e)
  }
  expect(peak).toBeGreaterThan(0.15) // the blow out happens inside the envelope
  expect(shatterEnv(0.5)).toBeGreaterThan(0.15) // the drop still is at the peak (u .25)
  expect(shatterEnv(1.5)).toBeGreaterThan(0) // the fall back is on its way at the rebuild still (u .75)
  expect(shatterEnv(1.5)).toBeLessThan(peak) // …and the sphere is coming back
  for (const u of [0.2, 0.45, 1]) {
    const age = u * 2
    expect(Math.abs(shatterEnv(age - 1e-3) - shatterEnv(age)), `knot ${u}`).toBeLessThan(0.02)
  }
})

test('orb: a geometry generator with the contract tags; N shrinks a tile ×0.1', () => {
  expect(orb.kind).toBe('generator')
  expect(orb.category).toBe('geometry')
  expect(orb.tags).toEqual(['particles', 'sphere', '3d'])
  expect(orbN()).toBe(60000)
  expect(orbN([320, 180])).toBe(6000)
})

const gen = (id: string) => BUILTIN.find((d) => d.id === id)!.layers[0].gen
test('orb: every bind names a declared input and a real source; builtin:orb repeats the def bind', () => {
  expect(gen('builtin:orb').ref).toBe(orb.id)
  expect(gen('builtin:orb').bind).toEqual(orb.bind)
  for (const [name, b] of Object.entries(orb.bind!)) {
    expect(orb.inputs.some((i) => i.name === name), name).toBe(true)
    expect(SOURCE_IDS).toContain(b.source)
  }
  expect(Object.keys(orb.bind!).sort()).toEqual(['amp', 'freq', 'hue', 'shatter', 'sparkle', 'spike', 'twist', 'yaw'])
})

test('builtin:orb: starred, one native/orb generator layer', () => {
  const d = BUILTIN.find((x) => x.id === 'builtin:orb')!
  expect(d.star).toBe(true)
  expect(d.layers).toHaveLength(1)
  expect(gen('builtin:orb').ref).toBe('native/orb')
})
