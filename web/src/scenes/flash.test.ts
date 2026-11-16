// I-FL1 (WCAG 2.3.1, the photosensitive audit): the natives whose light followed every onset and the beat pulse now
// light a hit only through their ⚡ input, which live.ts gates by flashGate (≤ 3 onsets/s, one shared budget).
import { expect, test, vi } from 'vitest'
import { parseIsf } from '../fx/isf'
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

// fa2-: an ISF fx has no draw code, so its ⚡ inputs are slewed in the shader: a 1×1 persistent `hot` texel holds them as
// drawn (bloom glow + level and bars glow + thickness rise with heatStep's 40 ms; the strobe's off edge falls over .12 s).
const FX = import.meta.glob(['../fx/own/bloom.fs', '../fx/own/bars.fs', '../fx/own/strobe.fs'], { query: '?raw', import: 'default', eager: true })
test.each(['bloom', 'bars', 'strobe'])('I-FL1 own/%s: its ⚡ inputs are drawn through a persistent 1×1 hot texel', (n) => {
  const d = parseIsf(FX[`../fx/own/${n}.fs`] as string, `own/${n}`)
  expect(d.passes).toContainEqual({ target: 'hot', persistent: true, float: true, width: '1', height: '1' })
  expect(d.fs).toContain('TIMEDELTA') // the slew runs on the frame's dt
})
