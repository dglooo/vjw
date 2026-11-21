// vs3/look.json (written by scripts/vs3-presets.mjs from the donor text): the look's defaults, ranges and scene rows.
import { expect, test } from 'vitest'
import type { LookValues } from './chain'
import look from './look.json'

const base: LookValues = look.base // tsc: every look key, each a number
const ranges = look.ranges as Record<string, number[]>
const scenes = look.scenes as Record<string, Record<string, number> | undefined>
const inside = (k: string, v: number) => v >= ranges[k][0] && v <= ranges[k][1]

/** host.ts:295-334 before S2.2: each native's Look bloomMul, aber, vignette. */
const HOST: Record<string, number[]> = {
  ink: [1.85, 4, 0], relic: [1.15, 1.4, 0.5], morphogen: [1, 1, 0.25], mandala: [2.5, 1.6, 0.8], tendril: [1.1, 0.8, 0.35],
  citadel: [1.1, 1.4, 0.45], descent: [1.1, 0.5, 0.3], oracle: [1.4, 1.4, 0.55], idol: [1.2, 1.6, 0.5], spacetime: [1.6, 2.2, 0.4],
  ingot: [1.1, 1.2, 0.45], gate: [1.1, 1.2, 0.55], synapse: [1.7, 1.5, 0.3], anemone: [1.2, 2.4, 0.45], aurora: [1, 1, 0.34],
  blob: [1, 1, 0.34], echo: [1, 1, 0.34], flow: [1, 1, 0.34], fract: [1, 1, 0.34], signal: [0.9, 0.6, 0.12], sand: [1.5, 1.2, 0.35],
  chorus: [1.2, 1.2, 0.5], 'chorus-hall': [1.2, 1.2, 0.5], visage: [1.2, 1.4, 0.5], limitless3d: [1.1, 1.2, 0.35], lasers: [1, 0, 0.2],
  crystal: [0.8, 0, 0.2], pearl: [0.8, 0, 0.2], spiral: [0.8, 0, 0.2], fluid: [1.3, 1.4, 0.3], forge: [0.9, 0.8, 0.4],
  pelt: [1.1, 1.2, 0.5], wisp: [1.15, 1.6, 0.28], morphogen2: [1, 0.8, 0.05], locus: [1.3, 1.2, 0.4], vesica: [1.2, 0.6, 0.35],
  grove: [1.15, 1.2, 0.4], limitless: [1.1, 2, 0.3],
}

test("K1 rows = today's numbers: base + a scene's row gives each of the 38 natives its host.ts bloomMul, aber, vignette", () => {
  expect(Object.keys(HOST)).toHaveLength(38)
  for (const [name, want] of Object.entries(HOST)) {
    const l = { ...base, ...scenes[name] }
    expect([l.bloomMul, l.aber, l.vignette], name).toEqual(want)
  }
})

test('K2 base.brightness is 1.4 (the FINISH literal, host.ts BRIGHTNESS)', () => expect(base.brightness).toBe(1.4))

test("K3 shape: base has the 18 keys; each has a range holding the base value and every scene row's value", () => {
  expect(Object.keys(base)).toHaveLength(18)
  expect(Object.keys(ranges).sort()).toEqual(Object.keys(base).sort())
  for (const [k, v] of Object.entries(base)) expect(inside(k, v), `base ${k} ${v}`).toBe(true)
  for (const [s, row] of Object.entries(scenes))
    for (const [k, v] of Object.entries(row!)) expect(k in ranges && inside(k, v), `${s} ${k} ${v}`).toBe(true)
})

test('K4 brightness range: bottom ≥ 1.36, top ≥ 2.4', () => {
  expect(ranges.brightness[0]).toBeGreaterThanOrEqual(1.36)
  expect(ranges.brightness[1]).toBeGreaterThanOrEqual(2.4)
})

test('K5 base leaves tiles, twist, slice off', () => {
  expect(base.tiles).toBeLessThanOrEqual(1.0001)
  expect(Math.abs(base.twist)).toBeLessThanOrEqual(0.001)
  expect(base.slice).toBeLessThanOrEqual(0.001)
})

test('K6 lensStyles has 7 names; base.lensStyle is a valid index', () => {
  expect(look.lensStyles).toHaveLength(7)
  expect(look.lensStyles[base.lensStyle]).toBe('glass ribs') // an integer in 0..6, the donor's default style
})
