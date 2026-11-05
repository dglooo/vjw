// plan_td_look.md S3.1–S3.2: the TF buffer layout and scatter's grid, and each def's bind defaults name its inputs and
// real sources, repeated by its built-in scene.
import { expect, test, vi } from 'vitest'
import { SOURCE_IDS } from '../bind'
import { BUILTIN } from './builtin'
import { gridFor, scatter, swarm, swarmLayout } from './points'

vi.mock('../gl/engine', () => ({})) // takes the page's canvas + WebGL at import; the defs and the layout need neither

test('swarmLayout: one vec4 of float32 per point, 2 MiB per buffer at 131072', () => {
  expect(swarmLayout(131072)).toEqual({ floats: 524288, bytes: 2 << 20 })
  expect(swarmLayout(65536).bytes).toBe(1 << 20)
})

test('gridFor: one point per cell, edge cells cut; ≈121k at 4 px on the 1728×1117 stage (214k at 3 px)', () => {
  expect(gridFor(1728, 1117, 4)).toEqual({ cols: 432, rows: 280, count: 120960 })
  expect(gridFor(1728, 1117, 3).count).toBe(214848)
  expect(gridFor(8, 8, 4).count).toBe(4)
})

const layer = (id: string) => BUILTIN.find((d) => d.id === id)!.layers[0]
test.each([
  ['swarm', swarm, layer('builtin:swarm').gen],
  ['scatter', scatter, layer('builtin:scatter').fx[0]],
] as const)('%s: every input is bound to a known source, and its built-in scene repeats the def bind', (_, def, node) => {
  expect(Object.keys(def.bind!).sort()).toEqual(def.inputs.map((i) => i.name).sort())
  for (const b of Object.values(def.bind!)) expect(SOURCE_IDS).toContain(b.source)
  expect(node.ref).toBe(def.id)
  expect(node.bind).toEqual(def.bind)
})

test('scatter is a filter over the tunnel', () => {
  expect(scatter.kind).toBe('filter')
  expect(layer('builtin:scatter').gen.ref).toBe('native/tunnel')
})
