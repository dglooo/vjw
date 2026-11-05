import { expect, test } from 'vitest'
import type { Binding } from '../bind'
import type { LayerDoc, NodeDoc, SceneDoc } from '../doc'
import type { EffectDef, Kind } from '../fx/types'
import { blocks, filterBlocks } from './blocks'

const B: Binding = { source: 'kick', amount: 1, attack: 0, release: 0.2, min: 0, max: 1 }
const def = (id: string, kind: Kind, over: Partial<EffectDef> = {}): EffectDef =>
  ({ id, name: id.slice(id.indexOf('/') + 1), kind, credit: 'VeeJay Wizard', inputs: [], ...over })
const CATALOG = new Map([
  def('native/tunnel', 'generator', { name: 'Tunnel', category: 'geometry' }),
  def('native/spectrum', 'generator', { name: 'Spectrum' }),
  def('milk/flexi-mindblob', 'generator', { name: 'Mindblob', category: 'feedback', credit: 'Flexi' }),
  def('own/bloom', 'filter', { category: 'feedback', tags: ['Glow', 'Feedback'], bind: { glow: B } }),
  def('isf/Pixellate', 'filter', { category: 'retro', tags: ['Stylize', 'Retro'], credit: 'VIDVOX' }),
  def('own/wipe', 'transition'),
].map((d) => [d.id, d] as const))
const TOY: NodeDoc = { ref: 'toy/plasma', code: 'void mainImage(out vec4 c, in vec2 p) { c = vec4(1.0); }', credit: 'Someone' }
const layer = (gen: NodeDoc): LayerDoc => ({ gen, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 })
const scene = (id: string, name: string, ...gens: NodeDoc[]): SceneDoc => ({ v: 1, id, name, star: false, layers: gens.map(layer) })
// The toy again in a user scene (a Save as of the built-in): one block.
const SCENES = [scene('builtin:toy-plasma', 'Toy plasma', TOY), scene('builtin:tunnel', 'Tunnel', { ref: 'native/tunnel' }), scene('u-1', 'Mine', { ref: 'native/spectrum' }, TOY)]
const all = blocks(CATALOG, SCENES)
const get = (id: string) => all.find((b) => b.id === id)!

test('every non-transition def exactly once, kind and group from the def; milk/* in milkdrop; by kind, then name', () => {
  expect(all.filter((b) => CATALOG.has(b.id)).map((b) => b.id).sort()).toEqual(['isf/Pixellate', 'milk/flexi-mindblob', 'native/spectrum', 'native/tunnel', 'own/bloom'])
  expect(new Set(all.map((b) => b.id)).size).toBe(all.length)
  expect(get('native/tunnel')).toMatchObject({ kind: 'generator', group: 'geometry', tags: [], credit: 'VeeJay Wizard' })
  expect(get('native/spectrum').group).toBe('other')
  expect(get('milk/flexi-mindblob')).toMatchObject({ kind: 'generator', group: 'milkdrop', credit: 'Flexi' })
  expect(get('own/bloom')).toMatchObject({ kind: 'effect', group: 'feedback', tags: ['Glow', 'Feedback'] })
  expect(all.map((b) => `${b.kind} ${b.name}`)).toEqual([
    'generator Mindblob', 'generator Spectrum', 'generator Toy plasma', 'generator Tunnel',
    'effect bloom', 'effect Pixellate',
    'scene Mine', 'scene Toy plasma', 'scene Tunnel',
  ])
})

test("a def's node carries its VJW_BIND as a copy; its tile: a generator alone, an effect over native/tunnel", () => {
  const bloom = get('own/bloom')
  expect(bloom.node).toEqual({ ref: 'own/bloom', bind: { glow: B } })
  expect(bloom.node!.bind!.glow).not.toBe(B)
  expect(bloom.scene.layers).toEqual([{ ...layer({ ref: 'native/tunnel' }), fx: [bloom.node] }])
  expect(get('native/tunnel').scene.layers).toEqual([layer({ ref: 'native/tunnel' })])
  expect(get('native/tunnel').scene.id).not.toBe('builtin:tunnel')
})

test('a toy inside a scene becomes one generator block whose node is the toy, named after its first scene', () => {
  expect(all.filter((b) => b.id === 'toy/plasma')).toHaveLength(1)
  expect(get('toy/plasma')).toMatchObject({ kind: 'generator', name: 'Toy plasma', group: 'other', credit: 'Someone', node: TOY })
  expect(get('toy/plasma').scene.layers).toEqual([layer(TOY)])
  expect(blocks(CATALOG, []).some((b) => b.id.startsWith('toy/'))).toBe(false)
})

test('built-in and user scenes appear as kind scene, rendering their own doc, with no node', () => {
  for (const s of SCENES) {
    expect(get(s.id)).toMatchObject({ kind: 'scene', name: s.name, scene: s })
    expect(get(s.id).node).toBeUndefined()
  }
})

test('filterBlocks: kind, group, tag, text over name, credit and tags (any case), favourites; all ANDed', () => {
  const ids = (q: Parameters<typeof filterBlocks>[1]) => filterBlocks(all, q).map((b) => b.id)
  expect(ids({})).toEqual(all.map((b) => b.id))
  expect(ids({ kind: 'effect' })).toEqual(['own/bloom', 'isf/Pixellate'])
  expect(ids({ group: 'milkdrop' })).toEqual(['milk/flexi-mindblob'])
  expect(ids({ tag: 'Retro' })).toEqual(['isf/Pixellate'])
  expect(ids({ text: '  vidvox ' })).toEqual(['isf/Pixellate']) // credit
  expect(ids({ text: 'GLOW' })).toEqual(['own/bloom']) // a tag
  expect(ids({ text: 'plasma' })).toEqual(['toy/plasma', 'builtin:toy-plasma']) // names
  const favs = new Set(['own/bloom', 'builtin:tunnel', 'native/tunnel'])
  expect(ids({ favs })).toEqual(['native/tunnel', 'own/bloom', 'builtin:tunnel'])
  expect(ids({ favs, kind: 'generator' })).toEqual(['native/tunnel'])
  expect(ids({ favs, text: 'tunnel', group: 'other' })).toEqual(['builtin:tunnel'])
  expect(ids({ kind: 'effect', group: 'feedback', tag: 'Glow', text: 'bloom', favs })).toEqual(['own/bloom'])
  expect(ids({ kind: 'effect', tag: 'Glow', text: 'pix' })).toEqual([])
})
