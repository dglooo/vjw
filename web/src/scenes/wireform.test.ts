// plan_scenes_wave3.md S3.1: the surface seam (finite, the unit ball, the closed kinds meet at the seams) and
// the registration (the def's binds ⊆ declared inputs, real sources; builtin:wireform repeats the def's bind with
// row 8's statics). The GL itself is the browser check.
import { expect, test, vi } from 'vitest'
import { SOURCE_IDS } from '../bind'
import { BUILTIN } from './builtin'
import { SURFACE_KINDS, surface, wireform, wireformGrid } from './wireform'

vi.mock('../gl/engine', () => ({})) // takes the page's canvas + WebGL at import; the def and the seam need neither

const K = SURFACE_KINDS.length
const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

test('surface: finite and inside the unit ball on a 16×16 grid for every kind', () => {
  for (let k = 0; k < K; k++)
    for (let i = 0; i <= 16; i++)
      for (let j = 0; j <= 16; j++) {
        const p = surface(k, i / 16, j / 16)
        expect(p.every(Number.isFinite), `kind ${k} at ${i / 16}, ${j / 16}`).toBe(true)
        expect(Math.hypot(p[0], p[1], p[2]), `kind ${k} at ${i / 16}, ${j / 16}`).toBeLessThanOrEqual(1.05)
      }
})

test('surface: every kind is closed in u (u = 0 meets u = 1); the torus kinds are closed in v too', () => {
  for (let k = 0; k < K; k++)
    for (let j = 0; j <= 16; j++) {
      expect(dist(surface(k, 0, j / 16), surface(k, 1, j / 16)), `kind ${k} u seam at v ${j / 16}`).toBeLessThan(1e-9)
    }
  for (const k of [0, 3]) // Elliptic Torus, Triaxial Tritorus (the v-tube is a full period)
    for (let i = 0; i <= 16; i++) {
      expect(dist(surface(k, i / 16, 0), surface(k, i / 16, 1)), `kind ${k} v seam at u ${i / 16}`).toBeLessThan(1e-9)
    }
})

test('surface: the plan requires ≥ 6 TD-list kinds + the 3D supershape', () => {
  expect(K).toBeGreaterThanOrEqual(7)
  expect(SURFACE_KINDS).toContain('Supershape 3D')
})

test('wireform: a geometry generator with the contract tags; the grid shrinks a tile ×.1 (the swarmN precedent)', () => {
  expect(wireform.kind).toBe('generator')
  expect(wireform.category).toBe('geometry')
  expect(wireform.tags).toEqual(['mesh', 'wireframe', '3d'])
  expect(wireformGrid()).toBe(96)
  expect(wireformGrid([320, 180])).toBe(5)
})

const gen = (id: string) => BUILTIN.find((d) => d.id === id)!.layers[0].gen
test('wireform: every bind names a declared input and a real source; builtin:wireform repeats the def bind with row 8 statics', () => {
  expect(gen('builtin:wireform').ref).toBe(wireform.id)
  expect(gen('builtin:wireform').bind).toEqual(wireform.bind)
  for (const [name, b] of Object.entries(wireform.bind!)) {
    expect(wireform.inputs.some((i) => i.name === name), name).toBe(true)
    expect(SOURCE_IDS).toContain(b.source)
  }
  expect(Object.keys(wireform.bind!).sort()).toEqual(['explode', 'hue', 'next', 'pulse', 'scale', 'sparkle', 'twist', 'yaw'])
  expect(gen('builtin:wireform').values).toMatchObject({ pitch: 0.06, hold: 8 }) // the row's statics
})

test('builtin:wireform: starred, one native/wireform generator layer', () => {
  const d = BUILTIN.find((x) => x.id === 'builtin:wireform')!
  expect(d.star).toBe(true)
  expect(d.layers).toHaveLength(1)
  expect(gen('builtin:wireform').ref).toBe('native/wireform')
})
