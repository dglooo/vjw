// plan_scenes_wave3.md S3.2: the novaPull seam (the CP3 contract: the blast is negative just after the edge,
// the re-accretion is > 1, and it settles to exactly 1) and the registration (the def's binds ⊆ declared
// inputs, real sources; builtin:vortex repeats the def's bind with row 9's statics). The GL itself is the
// browser check.
import { expect, test, vi } from 'vitest'
import { SOURCE_IDS } from '../bind'
import { BUILTIN } from './builtin'
import { novaPull, vortex, vortexN } from './vortex'

vi.mock('../gl/engine', () => ({})) // takes the page's canvas + WebGL at import; the def and the seam need neither

test('novaPull: exactly 1 before the first drop (age = ∞) and after the envelope ends', () => {
  expect(novaPull(Infinity)).toBe(1) // no drop yet
  expect(novaPull(-1)).toBe(1) // before the edge (defensive)
  expect(novaPull(3)).toBe(1) // the envelope's end: exactly settled
  expect(novaPull(4.2)).toBe(1)
  expect(novaPull(1e9)).toBe(1)
})

test('novaPull: negative (the blast outward) just after the edge', () => {
  expect(novaPull(0)).toBeLessThan(0)
  expect(novaPull(0.05)).toBeLessThan(0)
  expect(novaPull(0.5)).toBeLessThan(1) // still on the way out / not re-accreting yet
})

test('novaPull: > 1 during the re-accretion, back to 1 by the end', () => {
  let sawRegain = false
  for (let age = 0; age <= 3; age += 0.05) {
    const m = novaPull(age)
    expect(Number.isFinite(m), `age ${age}`).toBe(true)
    if (m > 1) sawRegain = true
  }
  expect(sawRegain).toBe(true) // the strong re-accretion happens inside the envelope
  expect(novaPull(2.4)).toBeGreaterThan(1) // the peak (u .8)
})

test('novaPull: the envelope is continuous at its knots (no pull jump the physics would step)', () => {
  for (const u of [0.35, 0.8, 1]) {
    const age = u * 3
    expect(Math.abs(novaPull(age - 1e-3) - novaPull(age)), `knot ${u}`).toBeLessThan(0.02)
  }
})

test('vortex: a geometry generator with the contract tags; N shrinks a tile ×.16 (the swarm tile ratio)', () => {
  expect(vortex.kind).toBe('generator')
  expect(vortex.category).toBe('geometry')
  expect(vortex.tags).toEqual(['particles', 'vortex', '3d'])
  expect(vortexN()).toBe(32768) // the plan's 65536 billed over the 5 ms gate on dubstep → the step's lever
  expect(vortexN([320, 180])).toBe(2048)
})

const gen = (id: string) => BUILTIN.find((d) => d.id === id)!.layers[0].gen
test('vortex: every bind names a declared input and a real source; builtin:vortex repeats the def bind with row 9 statics', () => {
  expect(gen('builtin:vortex').ref).toBe(vortex.id)
  expect(gen('builtin:vortex').bind).toEqual(vortex.bind)
  for (const [name, b] of Object.entries(vortex.bind!)) {
    expect(vortex.inputs.some((i) => i.name === name), name).toBe(true)
    expect(SOURCE_IDS).toContain(b.source)
  }
  expect(Object.keys(vortex.bind!).sort()).toEqual(['burst', 'hue', 'nova', 'pull', 'sparkle', 'spin', 'trail', 'yaw'])
  expect(gen('builtin:vortex').values).toMatchObject({ pitch: 0.17 }) // the row's static
})

test('builtin:vortex: starred, one native/vortex generator layer', () => {
  const d = BUILTIN.find((x) => x.id === 'builtin:vortex')!
  expect(d.star).toBe(true)
  expect(d.layers).toHaveLength(1)
  expect(gen('builtin:vortex').ref).toBe('native/vortex')
})
