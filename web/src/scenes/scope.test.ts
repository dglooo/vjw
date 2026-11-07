// plan_td_wave2.md S2.1: the trail-decay seam and the def's binds (repeated by the built-in scene). The GL itself is
// the browser check.
import { expect, test, vi } from 'vitest'
import { SOURCE_IDS } from '../bind'
import { BUILTIN } from './builtin'
import { scope, trailKeep } from './scope'

vi.mock('../gl/engine', () => ({})) // takes the page's canvas + WebGL at import; the def and the seam need neither

test('trailKeep: what one 60 Hz frame keeps, frame-rate independent (trail^(dt·60))', () => {
  expect(trailKeep(0.9, 1 / 60)).toBeCloseTo(0.9) // a 60 Hz frame keeps exactly `trail`
  expect(trailKeep(0.9, 2 / 60)).toBeCloseTo(0.81) // a 30 Hz frame keeps two 60 Hz frames' worth
  expect(trailKeep(0.9, 0)).toBe(1) // no time, no fade
  expect(trailKeep(0.85, 1 / 60)).toBeLessThan(trailKeep(0.97, 1 / 60)) // a longer `trail` decays slower
})

const gen = (id: string) => BUILTIN.find((d) => d.id === id)!.layers[0].gen
test('scope: every bind names a declared input and a real source; the built-in scene repeats the def bind; width is static', () => {
  expect(gen('builtin:xy-scope').ref).toBe(scope.id)
  expect(gen('builtin:xy-scope').bind).toEqual(scope.bind)
  for (const [name, b] of Object.entries(scope.bind!)) {
    expect(scope.inputs.some((i) => i.name === name)).toBe(true)
    expect(SOURCE_IDS).toContain(b.source)
  }
  expect(Object.keys(scope.bind!)).not.toContain('width')
})

test('scope: a geometry generator, tagged for the 2b library', () => {
  expect(scope.kind).toBe('generator')
  expect(scope.category).toBe('geometry')
  expect(scope.tags).toEqual(['scope', 'audio'])
})
