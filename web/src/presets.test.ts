// presets.ts: the factory data against the natives it names, and the current preset / custom of a node's values.
import { expect, test, vi } from 'vitest'
import { defaults } from './doc'
import { factory, factoryRefs, presetOf, savable } from './presets'
import { VS3 } from './vs3/host'
import FACTORY from './vs3/presets.json'

const fsId = 'node:fs' // the app tsconfig has no node types (serpent.test.ts T-F2d)
vi.mock('./gl/engine', () => ({ fullscreenProgram: () => () => {}, gl: {} })) // takes the page's canvas + WebGL at import

test('the factory presets of every vs3 scene (scripts/vs3-presets.mjs); each names only inputs of its native, within their range; its thumb is there', async () => {
  const { existsSync } = (await import(/* @vite-ignore */ fsId)) as { existsSync(p: string): boolean }
  const n = (s: string) => factory(`native/vs3-${s}`).length
  expect(Object.fromEntries(factoryRefs.map((r) => [r.slice(11), n(r.slice(11))]))).toEqual({
    ink: 2, relic: 3, signal: 7, citadel: 3, mandala: 3, synapse: 3, fluid: 4, morphogen: 3, gate: 3, sand: 3, idol: 3, oracle: 3, anemone: 4, forge: 3, ingot: 4, spacetime: 4,
    pelt: 4, wisp: 4, grove: 4, descent: 5, visage: 6, chorus: 5, limitless3d: 6, vesica: 7, locus: 10, crystal: 8, pearl: 7, lasers: 12, tendril: 13, spiral: 5,
  }) // 150 of the table's 173 + ★ hall; the generator lists the 23 it dropped and why
  for (const [ref, ps] of Object.entries(FACTORY)) {
    const def = VS3.find((d) => d.id === ref)!
    expect(new Set(ps.map((p) => p.name)).size, ref).toBe(ps.length)
    for (const p of factory(ref)) {
      for (const [k, v] of Object.entries(p.values)) {
        const i = def.inputs.find((x) => x.name === k)
        expect(i && !def.flash?.includes(k), `${ref} ${p.name}: ${k}`).toBe(true)
        if (i!.type === 'long') expect(i!.values, `${p.name}: ${k}`).toContain(v)
        else if (i!.type === 'bool') expect(typeof v, `${p.name}: ${k}`).toBe('boolean')
        else expect(typeof v === 'number' && v >= (i!.min as number) && v <= (i!.max as number), `${p.name}: ${k} ${v}`).toBe(true)
      }
      if (p.thumb) expect(existsSync(`public/vs3/thumbs/presets/${p.thumb}`), p.thumb).toBe(true)
      expect(presetOf(factory(ref), { ...defaults(def), ...p.values })?.name, `${ref}: applied, the picker names it`).toBe(p.name) // no earlier twin
    }
  }
  expect(Object.values(FACTORY).flat().filter((p) => !('thumb' in p)).map((p) => p.name)).toEqual(['★ hall']) // ours alone has none
  expect(factory('native/vs3-chorus').map((p) => p.name)).toEqual(['★ choir', '★ ball of heads', '★ hall of heads', '★ being watched', '★ hall'])
  expect(factory('native/vs3-chorus')[4].values).toMatchObject({ palette: 5, shape: 1 }) // the hall in sodium
  expect(factory('native/vs3-limitless3d').find((p) => p.name === '★ form — chrome bust')?.values.model).toBe(7) // a scan: the bust
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
