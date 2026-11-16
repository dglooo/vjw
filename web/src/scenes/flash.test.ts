// I-FL1 (WCAG 2.3.1, the photosensitive audit): the natives whose light followed every onset and the beat pulse now
// light a hit only through their ⚡ input, which live.ts gates by flashGate (≤ 3 onsets/s, one shared budget).
import { expect, test, vi } from 'vitest'
import { BUILTIN } from './builtin'
import { glitch } from './glitch'
import { spectrum } from './spectrum'
import { tunnel } from './tunnel'

vi.mock('../gl/engine', () => ({})) // takes the page's canvas + WebGL at import; the defs need neither
vi.mock('../audio/input', () => ({})) // creates the AudioContext at import (spectrum)

test.each([
  [tunnel, 12], // builtin:tunnel and the 11 combinations over it
  [spectrum, 17], // builtin:spectrum and 16
  [glitch, 2], // builtin:glitch, builtin:bloom-glitch
])('I-FL1 $id: def.flash = [hit], every built-in layer binds hit to kick from 0', (def, layers) => {
  expect(def.flash).toEqual(['hit'])
  const gens = BUILTIN.flatMap((d) => d.layers.map((l) => l.gen)).filter((g) => g.ref === def.id)
  expect(gens.length).toBeGreaterThanOrEqual(layers)
  for (const g of gens) expect(g.bind?.hit, 'flashGate rests below its ON line at min 0').toMatchObject({ source: 'kick', attack: 0, min: 0, max: 1 })
})
