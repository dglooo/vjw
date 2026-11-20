// I-FL1 (WCAG 2.3.1, the photosensitive audit): the natives whose light followed every onset and the beat pulse now
// light a hit only through their ⚡ input, which live.ts gates by flashGate (≤ 3 onsets/s, one shared budget).
import { expect, test, vi } from 'vitest'
import { catalog } from '../fx/catalog'
import { parseIsf } from '../fx/isf'
import { BUILTIN } from './builtin'
import { glitch } from './glitch'
import { spectrum } from './spectrum'
import { tunnel } from './tunnel'

// as gl/scene.test.ts: the natives take the page's canvas + WebGL, the AudioContext, window and a texture at import
vi.mock('../gl/engine', () => ({ fullscreenProgram: () => () => {}, program: () => ({}), renderTarget: () => ({ fit() {} }), gl: {} }))
vi.mock('butterchurn', () => ({ default: {} }))
vi.mock('../audio/input', () => ({ analyser: {}, ctx: {} }))
vi.mock('twgl.js', async (real: () => Promise<object>) => ({ ...(await real()), createTexture: () => ({}) }))

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

// The melody (builtin.ts pitchHue / tonalShape, user 2026-11-21): colour and shape only. `pitch` steps, so a hue on it
// glides; `voice` opens on leads, so no built-in binds it; neither source lights the frame.
test('melody: a built-in binds pitch with attack and release ≥ 0.3 s, never voice; pitch and tonal drive no ⚡ input and no light', () => {
  const nodes = BUILTIN.flatMap((d) => d.layers.flatMap((l) => [{ ref: 'layer', bind: l.bind }, l.gen, ...l.fx]))
  const mel = nodes.flatMap((n) => Object.entries(n.bind ?? {}).filter(([, b]) => ['pitch', 'tonal', 'voice'].includes(b.source)).map(([k, b]) => ({ at: `${n.ref}.${k}`, k, b, flash: catalog.get(n.ref)?.flash ?? [] })))
  expect(mel.filter((m) => m.b.source === 'pitch').length).toBeGreaterThanOrEqual(8)
  expect(mel.filter((m) => m.b.source === 'tonal').length).toBeGreaterThanOrEqual(8)
  expect(mel.filter((m) => m.b.source === 'voice').map((m) => m.at)).toEqual([])
  for (const m of mel) {
    if (m.b.source === 'pitch') expect(Math.min(m.b.attack, m.b.release), m.at).toBeGreaterThanOrEqual(0.3)
    expect(m.flash, m.at).not.toContain(m.k)
    expect(m.k, m.at).not.toMatch(/opacity|bright|exposure|glow|level|gain|intensity|flash|hit/i)
  }
})
