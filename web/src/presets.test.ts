// presets.ts: the factory data against the natives it names, and the current preset / custom of a node's values.
import { expect, test, vi } from 'vitest'
import { defaults } from './doc'
import { between, ease, factory, factoryRefs, glideTo, MORPH_S, presetOf, savable } from './presets'
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

test('the preset glide: numbers ease in-out from the values on screen to the preset\'s, selects and checkboxes switch at the midpoint, exactly the preset from the end on', () => {
  expect(MORPH_S).toBe(1.8) // the donor's
  expect([ease(-1), ease(0), ease(1), ease(2)]).toEqual([0, 0, 1, 1])
  expect(ease(0.5)).toBeCloseTo(0.5, 12)
  expect(ease(0.1)).toBeLessThan(0.1) // slow out of the start …
  expect(ease(0.9)).toBeGreaterThan(0.9) // … and into the end
  const eased = new Set(['speed', 'tint'])
  const g = glideTo({ speed: 0.2, mode: 1, eyeFollow: true, tint: [0, 0, 0, 1], hit: 1 }, { speed: 0.8, mode: 4, eyeFollow: false, tint: [1, 0.5, 0, 1] }, eased)
  expect(Number.isNaN(g.t0)).toBe(true) // its first frame starts it
  expect(between(g, 0)).toEqual({ speed: 0.2, mode: 1, eyeFollow: true, tint: [0, 0, 0, 1] }) // the values it found
  expect(between(g, 0.25).speed).toBeCloseTo(0.2 + 0.6 * ease(0.25), 12)
  expect(between(g, 0.49)).toMatchObject({ mode: 1, eyeFollow: true }) // the old select and checkbox until the midpoint …
  const half = between(g, 0.5)
  expect(half).toMatchObject({ mode: 4, eyeFollow: false }) // … the new from it
  expect([half.speed, ...(half.tint as number[])].map((x) => +(x as number).toFixed(9))).toEqual([0.5, 0.5, 0.25, 0, 1]) // halfway
  expect(between(g, 1)).toEqual({ speed: 0.8, mode: 4, eyeFollow: false, tint: [1, 0.5, 0, 1] })
  expect(between(g, 3).speed).toBe(0.8) // never past it
  expect(between(glideTo({ a: 0 }, { a: 7 }, new Set()), 0.3).a).toBe(0) // a number not eased (a select's index) never walks through the ones between
  const cur = { tint: [0, 0, 0, 1] }
  const copy = glideTo(cur, { tint: [1, 1, 1, 1] }, eased)
  cur.tint[0] = 0.9 // a binding writing into the live array
  expect(copy.from.tint).toEqual([0, 0, 0, 1])
})

test('a pick mid-glide starts from the in-between values, and the first glide\'s other inputs still reach their targets', () => {
  const eased = new Set(['speed', 'fill'])
  const first = glideTo({ speed: 0, fill: 0, mode: 0 }, { speed: 1, fill: 1, mode: 2 }, eased)
  const mid = between(first, 0.3) // on screen 0.54 s in
  const next = glideTo(mid, { speed: 0.1, mode: 5 }, eased, first)
  expect(next.from).toEqual(mid)
  expect(next.to).toEqual({ speed: 0.1, fill: 1, mode: 5 }) // fill heads on for the first preset's 1
  expect(between(next, 0)).toEqual(mid) // no jump at the re-pick
  expect(between(next, 1)).toEqual({ speed: 0.1, fill: 1, mode: 5 })
})
