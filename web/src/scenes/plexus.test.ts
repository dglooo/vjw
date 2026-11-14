// plan_td_wave2.md S2.3: the grid-hash neighbour search seam (deterministic, exact vs brute force, every emitted
// pair ≤ dist) and the def's binds (repeated by the built-in scene). The GL itself is the browser check.
import { expect, test, vi } from 'vitest'
import { SOURCE_IDS } from '../bind'
import { BUILTIN } from './builtin'
import { plexus, plexusN, plexusPairs } from './plexus'

vi.mock('../gl/engine', () => ({})) // takes the page's canvas + WebGL at import; the def and the seam need neither

const flat = (pos: number[]) => new Float32Array(pos)
const call = (pos: Float32Array, n: number, dist: number, aspect: number) => {
  const out = new Int32Array(n * (n - 1))
  const k = plexusPairs(pos, n, dist, aspect, out)
  return Array.from(out.subarray(0, 2 * k)) // [i0, j0, i1, j1, …]
}
const sortedPairs = (flat: number[]) => {
  const pairs: number[][] = []
  for (let i = 0; i < flat.length; i += 2) pairs.push([flat[i], flat[i + 1]])
  return pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1])
}

test('plexusPairs: the known 4-point fixture — exact, the boundary (== dist) included, deterministic order', () => {
  // A (0,0), B (0.5,0), C (1.25,0), D (0.75,1.5): AB 0.5, BC 0.75, AC 1.25 (boundary); D out (≥ 1.52). All exact in
  // binary float, so the boundary's ≤ is the code's, not the representation's.
  const pos = flat([0, 0, 0.5, 0, 1.25, 0, 0.75, 1.5])
  const once = call(pos, 4, 1.25, 2)
  expect(sortedPairs(once)).toEqual([[0, 1], [0, 2], [1, 2]])
  expect(call(pos, 4, 1.25, 2)).toEqual(once) // same input → same pairs, same order
  expect(call(pos, 4, 1.25, 2)).toEqual(once)
})

test('plexusPairs: exact vs the O(n²) brute force, and every emitted pair ≤ dist (20 seeds, n 50)', () => {
  let seed = 1
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
  for (let s = 0; s < 20; s++) {
    const n = 50
    const pos = new Float32Array(n * 2)
    const aspect = 1 + rnd()
    for (let i = 0; i < n; i++) { pos[2 * i] = (rnd() * 2 - 1) * aspect; pos[2 * i + 1] = rnd() * 2 - 1 }
    const dist = 0.1 + rnd() * 0.5
    const want: number[] = []
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const dx = pos[2 * j] - pos[2 * i], dy = pos[2 * j + 1] - pos[2 * i + 1]
      if (dx * dx + dy * dy <= dist * dist) want.push(i, j)
    }
    const got = call(pos, n, dist, aspect)
    expect(sortedPairs(got)).toEqual(sortedPairs(want)) // no misses, no duplicates
    for (let i = 0; i < got.length; i += 2) {
      const dx = pos[2 * got[i + 1]] - pos[2 * got[i]], dy = pos[2 * got[i + 1] + 1] - pos[2 * got[i] + 1]
      expect(dx * dx + dy * dy).toBeLessThanOrEqual(dist * dist)
    }
  }
})

test('plexus: a geometry generator, tagged for the 2b library; plexusN shrinks a tile ×.1 (the swarmN precedent)', () => {
  expect(plexus.kind).toBe('generator')
  expect(plexus.category).toBe('geometry')
  expect(plexus.tags).toEqual(['plexus', 'lines'])
  expect(plexusN()).toBe(400)
  expect(plexusN([320, 180])).toBe(40)
})

const gen = (id: string) => BUILTIN.find((d) => d.id === id)!.layers[0].gen
test('plexus: every bind names a declared input and a real source; the def bind stays the classic four (S1.4 frozen pair); zodiac binds the shape inputs', () => {
  expect(gen('builtin:plexus').ref).toBe(plexus.id)
  expect(gen('builtin:plexus').bind).toEqual(plexus.bind)
  for (const [name, b] of Object.entries(plexus.bind!)) {
    expect(plexus.inputs.some((i) => i.name === name)).toBe(true)
    expect(SOURCE_IDS).toContain(b.source)
  }
  expect(Object.keys(plexus.bind!).sort()).toEqual(['dist', 'drift', 'hue', 'size']) // S1.4: shape/wander/pulse/hold/next ride builtin:zodiac's bind
  const z = gen('builtin:zodiac')
  expect(z.ref).toBe(plexus.id)
  expect(z.values).toMatchObject({ shape: 5, hold: 32 }) // SETS[4] = zodiac, the S0.2 hold ruling
  for (const name of ['drift', 'dist', 'size', 'pulse', 'hue', 'wander', 'next']) {
    expect(plexus.inputs.some((i) => i.name === name), name).toBe(true)
    expect(SOURCE_IDS).toContain(z.bind![name].source)
  }
})

test('builtin:plexus: starred, one native/plexus generator layer', () => {
  const d = BUILTIN.find((x) => x.id === 'builtin:plexus')!
  expect(d.star).toBe(true)
  expect(d.layers).toHaveLength(1)
  expect(gen('builtin:plexus').ref).toBe('native/plexus')
})
