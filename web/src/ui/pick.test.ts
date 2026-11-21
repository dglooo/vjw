import { expect, test, vi } from 'vitest'
import { catalog } from '../fx/catalog'
import { CATS, pickList, type Cat } from './pick'

// as scenes/flash.test.ts: the natives take the page's canvas + WebGL, the AudioContext, window and a texture at import
vi.mock('../gl/engine', () => ({ fullscreenProgram: () => () => {}, program: () => ({}), renderTarget: () => ({ fit() {} }), gl: {} }))
vi.mock('butterchurn', () => ({ default: {} }))
vi.mock('../audio/input', () => ({ analyser: {}, ctx: {} }))
vi.mock('twgl.js', async (real: () => Promise<object>) => ({ ...(await real()), createTexture: () => ({}) }))

const cats = Object.keys(CATS) as Cat[]
const ids = (cat: Cat, text = '') => pickList(catalog.values(), cat, text).map((d) => d.id)

test('every generator of the catalog sits in exactly one category, no filter or transition in any', () => {
  const seen = cats.flatMap((c) => ids(c))
  for (const d of catalog.values()) expect(seen.filter((id) => id === d.id), d.id).toHaveLength(d.kind === 'generator' ? 1 : 0)
  expect(ids('camera')).toEqual(['native/camera', 'native/outline'])
  expect([ids('text'), ids('frame'), ids('video')]).toEqual([['native/text'], ['native/frame'], ['native/video']])
  expect(ids('background').length).toBeGreaterThan(150) // MilkDrop, ours, vs2, vs3
})

test('the search keeps the names that hold it, in any case, inside the category only', () => {
  const lasers = pickList(catalog.values(), 'background', '  LASER ')
  expect(lasers.map((d) => d.id)).toEqual(expect.arrayContaining(['native/lasers', 'native/vs3-lasers', 'own/laser-grid']))
  for (const d of lasers) expect(d.name.toLowerCase()).toContain('laser')
  expect(ids('camera', 'out')).toEqual(['native/outline'])
  expect(ids('camera', 'laser')).toEqual([])
  expect(ids('background', ' ')).toEqual(ids('background'))
})

test('a background list runs by source (MilkDrop, ours, vs2, vs3), then by name', () => {
  const all = pickList(catalog.values(), 'background', '')
  const groups = all.map((d) => d.group).filter((g, i, a) => g !== a[i - 1])
  expect(groups).toEqual(['MilkDrop', 'Ours', 'vs2 (donor)', 'vs3 (new)'])
  for (const g of groups) {
    const names = all.filter((d) => d.group === g).map((d) => d.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  }
  expect(all.find((d) => d.id === 'native/tunnel')?.group).toBe('Ours')
  expect(all.find((d) => d.id === 'syn/fire_tunnel')?.group).toBe('vs2 (donor)')
})
