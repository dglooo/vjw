import { expect, test } from 'vitest'
import type { ArrangeOut } from './arrange'
import { BUILD, DROP, L, LANES, TRACK_BYTES, createBuckets, createHistory, range, trackBuckets, xAt, type Sample } from './history'
import { ZERO_SYNC } from './sync'

const blank = (): Sample => Object.fromEntries(LANES.map((l) => [l, 0])) as Sample
const QUIET: ArrangeOut = { build: 0, drop: 0, heat: 0, energy: 0, sparse: false, fired: null, confirmed: null }

test('a bucket counts the hits, keeps the levels peak and the last pitch', () => {
  const b = createBuckets(20, 0.5)
  const s = blank()
  for (let f = 0; f < 600; f++) {
    s.kick = f % 15 === 0 ? 1 : 0 // a kick every .25 s
    s.sub = (f % 30) / 30 // a saw, its peak 29/30 in every .5 s bucket
    s.pitch = f / 600
    b.add(f / 60, s)
  }
  expect(b.get(0, L.kick)).toBe(2)
  expect(b.get(0, L.sub)).toBeCloseTo(29 / 30)
  expect(b.get(0, L.pitch)).toBeCloseTo(29 / 600) // the bucket's last frame
  expect(b.get(19, L.kick)).toBe(2)
  expect(b.get(-1, L.kick)).toBeNaN() // never heard
})

test('the timeline window holds the last 30 s; older buckets are gone from the ring', () => {
  const h = createHistory()
  for (let f = 0; f <= 40 * 60; f++) h.frame((f + 0.5) / 60, {}, ZERO_SYNC, QUIET, [], null) // mid-bucket: no float holes
  const [i0, i1] = range(h.recent, h.now, 30)
  expect(i1 - i0 + 1).toBe(1800)
  for (let i = i0; i <= i1; i++) expect(h.recent.get(i, L.kick)).toBe(0)
  expect(h.recent.get(i1 - 35 * 60, L.kick)).toBeNaN() // 35 s back: overwritten (the ring holds 34 s)
})

test('an event lands at its age on the strip: now at the right edge, span s back at the left', () => {
  expect(xAt(100, 100, 30, 96, 1200)).toBe(1296)
  expect(xAt(70, 100, 30, 96, 1200)).toBe(96)
  expect(xAt(85, 100, 30, 96, 1200)).toBe(696)
})

test('sections: a breakdown builds, a fired drop holds until the next breakdown; ⚡ counts each new onset once', () => {
  const h = createHistory()
  const flashes: number[] = []
  const at = (t: number, a: Partial<ArrangeOut>) => {
    h.frame(t, {}, ZERO_SYNC, { ...QUIET, ...a }, flashes, null)
    const i = Math.floor(t / h.recent.width)
    return [h.recent.get(i, L.section), h.recent.get(i, L.flash)]
  }
  expect(at(1, {})).toEqual([0, 0])
  expect(at(2, { sparse: true })).toEqual([BUILD, 0])
  flashes.push(2.9, 3)
  expect(at(3, { fired: 0.8 })).toEqual([DROP, 2])
  expect(at(4, {})).toEqual([DROP, 0]) // the drop section holds; the same onsets never count twice
  expect(at(5, { sparse: true })).toEqual([BUILD, 0])
  expect(at(6, {})).toEqual([0, 0]) // a breakdown that ends with no drop
})

test('a seek back overwrites the bucket it plays again, never adds to it', () => {
  const b = createBuckets(8, 0.5)
  const kick = { ...blank(), kick: 1 }
  b.add(1.2, kick)
  b.add(1.3, kick)
  b.add(3, blank()) // the seek forward…
  b.add(1.4, kick) // …and back into bucket 2
  expect(b.get(2, L.kick)).toBe(1)
  expect(b.get(4, L.kick)).toBeNaN() // skipped over: never heard
})

test('the overview stays at ≤ 2 buckets per s and within 2 MB, however long the file', () => {
  expect(trackBuckets(600).n).toBe(1200) // 2 per s exactly
  for (const d of [10.2, 600, 18_000]) {
    const b = trackBuckets(d)
    expect(b.width).toBeGreaterThanOrEqual(0.5)
    expect(b.bytes).toBeLessThanOrEqual(TRACK_BYTES)
    expect(b.n * b.width).toBeCloseTo(d)
  }
})

test('the export: the last 30 s and the whole file as lane columns, null where nothing was heard', () => {
  const h = createHistory()
  const file = { currentTime: 0, duration: 60, src: 'blob:a' }
  for (let f = 0; f <= 31 * 60; f++) {
    if (f === 20 * 60) file.currentTime = 40 // a seek: 20–40 s of the file unheard
    h.frame(f / 60, { sub: 0.5 }, ZERO_SYNC, QUIET, [], { ...file, currentTime: file.currentTime + (f % 1200) / 60 })
  }
  const r = h.report('a.flac')
  expect(r).toMatchObject({ v: 1, kind: 'analysis', track: 'a.flac', recent: { n: 1800, bucket: 1 / 60, lanes: LANES }, file: { n: 120, bucket: 0.5 } })
  expect(r.recent.t0).toBeCloseTo(-30, 1)
  for (const l of LANES) expect(r.recent.data[l]).toHaveLength(1800)
  expect(r.file!.data.sub[0]).toBe(0.5)
  expect(r.file!.data.sub[60]).toBeNull() // 30 s: skipped by the seek
  expect(r.file!.data.sub[84]).toBe(0.5) // 42 s: played after it
  expect(createHistory().report(null).file).toBeNull() // line-in: no file section
})
