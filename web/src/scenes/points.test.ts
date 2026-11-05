// plan_td_look.md S3.1: the swarm's TF buffer layout, and its bind defaults name its inputs and real sources.
import { expect, test, vi } from 'vitest'
import { SOURCE_IDS } from '../bind'
import { BUILTIN } from './builtin'
import { swarm, swarmLayout } from './points'

vi.mock('../gl/engine', () => ({})) // takes the page's canvas + WebGL at import; the def and the layout need neither

test('swarmLayout: one vec4 of float32 per point, 2 MiB per buffer at 131072', () => {
  expect(swarmLayout(131072)).toEqual({ floats: 524288, bytes: 2 << 20 })
  expect(swarmLayout(65536).bytes).toBe(1 << 20)
})

test('swarm: every input is bound to a known source, and builtin:swarm repeats the def bind', () => {
  expect(Object.keys(swarm.bind!).sort()).toEqual(swarm.inputs.map((i) => i.name).sort())
  for (const b of Object.values(swarm.bind!)) expect(SOURCE_IDS).toContain(b.source)
  expect(BUILTIN.find((d) => d.id === 'builtin:swarm')?.layers[0].gen.bind).toEqual(swarm.bind)
})
