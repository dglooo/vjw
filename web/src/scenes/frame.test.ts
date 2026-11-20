// native/frame and the show composition (user 2026-11-20): the shape's uniforms (what the frame draws and live.ts
// clips by), the input declaration, and the two templates' layer contract. The GL is a fake: the SDF itself is the
// browser check (scratchpad/show/check.mjs: each shape's inside/outside probes).
import { expect, test, vi } from 'vitest'
import { bindable } from '../bind'
import { defaults } from '../doc'
import type { Value } from '../fx/types'
import { GROUPS } from '../library'
import { BUILTIN } from './builtin'
import { frame, frameUniforms } from './frame'

vi.mock('../gl/engine', () => ({ fullscreenProgram: () => () => {} })) // takes the page's canvas + WebGL at import

const at = (v: Record<string, Value>) => {
  const out = new Float32Array(12)
  frameUniforms({ ...defaults(frame), ...v }, out)
  return [...out].map((x) => +x.toFixed(4))
}

test.each([
  // [shape, the values, [half w, half h | radius, corner radius, sides], kind]
  ['rect', { shape: 0, size: 0.6, aspect: 1.5 }, [0.45, 0.3, 0], 0],
  ['rounded rect', { shape: 1, size: 0.6, aspect: 1.5, round: 0.5 }, [0.45, 0.3, 0.15], 0], // of the half short side
  ['circle', { shape: 2, size: 0.6, aspect: 1.5 }, [0.3, 0.3, 0], 1], // the aspect is a box's only
  ['hexagon', { shape: 3, size: 0.6, sides: 9 }, [0.3, 0.3, 0, 6], 2], // 6 whatever the n-gon's sides
  ['n-gon', { shape: 4, size: 0.6, sides: 9 }, [0.3, 0.3, 0, 9], 2],
])('frameUniforms %s: the shape, its kind and the line', (_, v, shape, kind) => {
  const u = at({ ...v, width: 0.01 })
  expect(u.slice(4, 4 + shape.length)).toEqual(shape)
  expect(u.slice(8, 10)).toEqual([kind, 0.005]) // the line's half width
})

test('frameUniforms: the centre and the rotation as drawn, the pulse scales; a stored doc cannot divide by 0', () => {
  expect(at({ x: 0.25, y: 0.75, rotation: 90, pulse: 0.1 }).slice(0, 4)).toEqual([0.25, 0.75, 1.5708, 1.1])
  expect(at({ pulse: -5 })[3]).toBe(0.01) // the scale stays > 0
  expect(at({ shape: 4, sides: 0 })[7]).toBe(3)
  expect(at({ shape: 4, sides: 99 })[7]).toBe(12)
})

test('inputs: ⚡ hit the only flash; the light and the shape never bound; motion bindable; straight alpha', () => {
  const by = new Map(frame.inputs.map((i) => [i.name, i]))
  for (const n of ['shape', 'sides', 'round', 'size', 'aspect', 'width', 'glow']) expect(bindable(by.get(n)!), n).toBe(false)
  for (const n of ['x', 'y', 'rotation', 'pulse', 'hit']) expect(bindable(by.get(n)!), n).toBe(true)
  expect(frame.flash).toEqual(['hit'])
  expect(frame.alpha).toBe('straight')
  expect(defaults(frame).fill).toEqual([0, 0, 0, 0]) // no fill by default
})

test('the show templates: bottom → top a scene, the frame, the inside (you or a scene), the DJ name', () => {
  const show = (id: string) => BUILTIN.find((d) => d.id === id)!
  const cam = show('builtin:show-frame-cam')
  const plain = show('builtin:show-frame')
  const by = new Map(frame.inputs.map((i) => [i.name, i]))
  for (const d of [cam, plain]) {
    expect(d.star, d.id).toBe(false)
    expect(d.layers.map((l) => l.gen.ref), d.id).toEqual([d.layers[0].gen.ref, 'native/frame', d.layers[2].gen.ref, 'native/text'])
    expect([d.layers[0].mask, d.layers[0].clip, d.layers[2].clip], d.id).toEqual([undefined, undefined, 'inside'])
    expect(d.layers[3].gen.values?.source, d.id).toBe(2) // the DJ name
    const f = d.layers[1].gen
    for (const k of Object.keys(f.bind ?? {})) expect(by.get(k) && bindable(by.get(k)!), k).toBe(true)
    for (const k of Object.keys(f.values ?? {})) expect(by.has(k), k).toBe(true)
    for (const g of [f, d.layers[3].gen]) expect(g.bind?.hit, 'flashGate rests below its ON line at min 0').toMatchObject({ source: 'kick', attack: 0, min: 0, max: 1 })
  }
  // The camera's: the person cut out (cut none, the mask), clipped inside, fading with presence (the Camera group's rule)
  expect(cam.layers[2]).toMatchObject({ gen: { ref: 'native/camera' }, mask: 'person', clip: 'inside', bind: { opacity: { source: 'presence', min: 0, max: 1 } } })
  expect([GROUPS.camera(cam), GROUPS.camera(plain)]).toEqual([true, false]) // a clip alone needs no camera
  expect(plain.layers[2].mask).toBeUndefined()
})
