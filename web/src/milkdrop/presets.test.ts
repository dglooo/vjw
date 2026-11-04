import { expect, test } from 'vitest'
import { parseScene } from '../doc'
import { MILK_SCENES, PRESETS, spread } from './presets'

test('every preset file loads with its credit and a shader', () => {
  expect(PRESETS.length).toBeGreaterThanOrEqual(20) // CP3 contract: 20–30 shipped presets
  expect(PRESETS.length).toBeLessThanOrEqual(30)
  expect(PRESETS).toHaveLength(Object.keys(import.meta.glob('./presets/*.json')).length) // none skipped by the guard
  for (const p of PRESETS) {
    for (const k of ['name', 'author', 'url', 'license'] as const) expect(p[k], `${p.slug} ${k}`).not.toBe('')
    const { warp, comp } = p.preset as { warp?: string; comp?: string }
    expect(warp || comp, `${p.slug} warp or comp`).toBeTruthy()
  }
  const slugs = PRESETS.map((p) => p.slug)
  expect(new Set(slugs).size).toBe(slugs.length)
  for (const s of slugs) expect(s).toMatch(/^[a-z0-9-]+$/)
})

test('every MilkDrop scene is its preset alone, starred, and round-trips through JSON', () => {
  expect(MILK_SCENES).toHaveLength(PRESETS.length)
  MILK_SCENES.forEach((d, i) => {
    const { slug, name } = PRESETS[i]
    expect(d).toMatchObject({ id: `builtin:milk-${slug}`, name, star: true, layers: [{ gen: { ref: `milk/${slug}` }, fx: [] }] })
    expect(parseScene(JSON.parse(JSON.stringify(d)))).toStrictEqual(d)
  })
})

test('spread keeps both orders, own[0] first, and spaces the milk evenly', () => {
  const own = Array.from({ length: 27 }, (_, i) => `o${i}`)
  const milk = Array.from({ length: 25 }, (_, i) => `m${i}`)
  expect(spread(own, [])).toEqual(own)
  expect(spread([], milk)).toEqual(milk)
  expect(spread<number | string>([1, 2, 3, 4], ['m'])).toEqual([1, 2, 3, 'm', 4])
  const out = spread(own, milk)
  expect(out).toHaveLength(own.length + milk.length)
  expect(out[0]).toBe(own[0])
  expect(out.filter((x) => x[0] === 'o')).toEqual(own) // each input is a subsequence of the output
  expect(out.filter((x) => x[0] === 'm')).toEqual(milk)
  expect(out.map((x) => x[0]).join('')).not.toMatch(/ooo|mmm/)
})
