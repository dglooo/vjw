// Calibration (user 2026-11-17, Tier S): the tile set, the layout, the beat grid's ticks and the per-tile inputs. The
// Canvas2D drawing itself is the browser check.
import { expect, test, vi } from 'vitest'
import { DONOR_GROUPS } from '../audio/donor'
import { SOURCE_IDS, sourceGroups } from '../bind'
import { defaults } from '../doc'
import { BUILTIN } from './builtin'
import { calib, inputs, layout, rows, ticks } from './calib'

vi.mock('../milkdrop/native', () => ({})) // takes the page's WebGL at import; the def and the seams need none

const IDS = rows(0).flat()
const DONOR = DONOR_GROUPS.flatMap((g) => g.ids)

test('T6a tiles: every source but the bands, the camera and the donor ids, each once, a row per source group', () => {
  expect([...IDS].sort()).toEqual(SOURCE_IDS.filter((id) => !/^band\d+$/.test(id) && id !== 'presence' && !DONOR.includes(id)).sort())
  expect(new Set(IDS).size).toBe(IDS.length)
  expect(rows(0)).toHaveLength(sourceGroups().length - 2 - DONOR_GROUPS.length) // all the groups but `camera`, `band` and the donor ones
  expect(IDS.filter((id) => DONOR.includes(id))).toEqual([]) // ours mode shows no donor tile (skeptic C8)
})

test('T6b: above 0 the 5 donor rows follow ours, each of the 31 donor ids once', () => {
  const all = rows(0.5).flat()
  expect(rows(0.5).slice(0, rows(0).length)).toEqual(rows(0))
  for (const id of DONOR) expect(all.filter((x) => x === id), id).toHaveLength(1)
  expect(all).toHaveLength(IDS.length + 31)
})

test.each([0, 1])('layout (T6c at 1) of rows(%d): the tiles sit under the header, inside the stage, none on another; every row spans the width, the rows the height', (mix) => {
  const [w, h, gap, top] = [1728, 1118, 13, 73]
  const r = layout(rows(mix), w, h, gap, top)
  const e = 1e-9
  expect(r).toHaveLength(rows(mix).flat().length)
  for (const a of r) {
    expect(a.x).toBeGreaterThanOrEqual(gap)
    expect(a.y).toBeGreaterThanOrEqual(top + gap)
    expect(a.x + a.w).toBeLessThanOrEqual(w - gap + e)
    expect(a.y + a.h).toBeLessThanOrEqual(h - gap + e)
    for (const b of r) if (a !== b) expect(a.x + a.w <= b.x + e || b.x + b.w <= a.x + e || a.y + a.h <= b.y + e || b.y + b.h <= a.y + e).toBe(true)
  }
  let i = 0
  for (const row of rows(mix)) {
    i += row.length
    expect(r[i - 1].x + r[i - 1].w).toBeCloseTo(w - gap) // the row's last tile ends a gap from the right edge
    expect(r[i - 1].h).toBeCloseTo(r[0].h) // equal rows
  }
  expect(r[i - 1].y + r[i - 1].h).toBeCloseTo(h - gap)
})

test('ticks: a grid line where a new beat starts, in samples back from the newest; a wrapped ring reads the same', () => {
  const out = new Float32Array(8)
  const ring = Float32Array.from([0.2, 0.7, 1.2, 1.7, 2.2, 2.7]) // half a beat per sample: beats 1 and 2 start at samples 2 and 4
  expect(ticks(ring, 0, out)).toBe(2) // next write at 0: the newest is the last sample
  expect([...out.subarray(0, 2)]).toEqual([1, 3])
  const wrapped = Float32Array.from([2.2, 2.7, 0.2, 0.7, 1.2, 1.7]) // the same history, the next write at 2
  expect(ticks(wrapped, 2, out)).toBe(2)
  expect([...out.subarray(0, 2)]).toEqual([1, 3])
  expect(ticks(new Float32Array(6), 0, out)).toBe(0) // no grid (beat stays 0): no lines
  expect(ticks(ring, 0, new Float32Array(1))).toBe(1) // never past `out`
})

test('inputs: five per tile, folded under its name, unbound; valid defaults; the built-in is starred, last, with no bindings', () => {
  for (const id of IDS) expect(inputs.filter((x) => x.group === id).map((x) => x.name)).toEqual(['Shape', 'Attack', 'Release', 'Color', 'Size'].map((k) => id + k))
  expect(inputs).toHaveLength(5 * IDS.length)
  expect(inputs.every((x) => x.type === 'color' || x.bindable === false)).toBe(true) // a colour takes no binding anyway
  const d = defaults(calib)
  for (const x of inputs) if (x.type === 'long') expect(x.values).toContain(d[x.name])
  const scene = BUILTIN.at(-1)!
  expect([scene.id, scene.name, scene.star]).toEqual(['builtin:calibration', 'Calibration', true])
  expect(scene.layers).toEqual([{ gen: { ref: calib.id }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 }])
})
