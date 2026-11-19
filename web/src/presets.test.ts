// presets.ts: the factory data against the natives it names, and the current preset / custom of a node's values.
import { expect, test, vi } from 'vitest'
import { defaults } from './doc'
import { factory, presetOf, savable } from './presets'
import { VS3 } from './vs3/host'
import FACTORY from './vs3/presets.json'

vi.mock('./gl/engine', () => ({ fullscreenProgram: () => () => {}, gl: {} })) // takes the page's canvas + WebGL at import

test('the factory presets: chorus, tendril, vesica, locus; each names only inputs of its native, within their range', () => {
  expect(Object.fromEntries(Object.entries(FACTORY).map(([ref, ps]) => [ref, ps.length]))).toEqual({ 'native/vs3-chorus': 5, 'native/vs3-vesica': 7, 'native/vs3-locus': 10, 'native/vs3-tendril': 13 })
  for (const [ref, ps] of Object.entries(FACTORY)) {
    const def = VS3.find((d) => d.id === ref)!
    expect(new Set(ps.map((p) => p.name)).size, ref).toBe(ps.length)
    for (const p of factory(ref))
      for (const [k, v] of Object.entries(p.values)) {
        const i = def.inputs.find((x) => x.name === k)
        expect(i && !def.flash?.includes(k), `${ref} ${p.name}: ${k}`).toBe(true)
        if (i!.type === 'long') expect(i!.values, `${p.name}: ${k}`).toContain(v)
        else expect(typeof v === 'number' && v >= (i!.min as number) && v <= (i!.max as number), `${p.name}: ${k} ${v}`).toBe(true)
      }
  }
  expect(factory('native/vs3-chorus').map((p) => p.name)).toEqual(['★ choir', '★ ball of heads', '★ hall of heads', '★ being watched', '★ hall'])
  expect(factory('native/vs3-chorus')[4].values).toMatchObject({ palette: 5, shape: 1 }) // the hall in sodium
  expect(factory('native/tunnel')).toEqual([])
})

test('presetOf: the preset the values match; one edit makes it custom, the edit undone brings the name back', () => {
  const def = VS3.find((d) => d.id === 'native/vs3-tendril')!
  const cur = { ...defaults(def), ...factory(def.id)[2].values }
  expect(presetOf(factory(def.id), cur)?.name).toBe('★ ring — Welcome To Tendril')
  const mine = { name: 'mine', values: savable(def, { ...cur, fill: 0.9 }) }
  expect(Object.keys(mine.values)).toEqual(['palette', 'mode', 'speed', 'shape', 'complexity', 'density', 'fill', 'contrast']) // no ⚡ hit
  const list = [...factory(def.id), mine]
  expect(presetOf(list, { ...cur, fill: 0.9 })?.name).toBe('mine')
  expect(presetOf(list, { ...cur, fill: 0.91 })).toBeUndefined() // custom
  expect(presetOf(list, { ...cur, hit: 1 })?.name).toBe('★ ring — Welcome To Tendril') // a value no preset names changes nothing
})
