import { expect, test } from 'vitest'
import { createAnalysis } from './analysis'
import { createDrums, type Drum } from './drums'
import { mix, pattern, reese, room, SR, sub, wobble, type Stem, type Track } from './synth'

const N = 512 // as the worklet: a 512-point FFT every 256 samples (the spectrum-level tests below)
const HOP = 256
const DRUMS: Drum[] = ['kick', 'snare', 'hats']
const BED: Stem[] = ['reese', 'sub', 'room']

/** Hit times per drum for a signal run through the worklet's body (analysis.ts) in render quanta, after a 0.5 s warm-up
 *  (the bed's own start). */
function hitsOf(x: Float32Array) {
  const a = createAnalysis(SR)
  const hits: Record<Drum, number[]> = { kick: [], snare: [], hats: [] }
  for (let i = 0; i + 128 <= x.length; i += 128)
    a.block([x.subarray(i, i + 128)], i, (h) => {
      if (h.kind !== 'hit') return
      expect(h.strength).toBeGreaterThanOrEqual(1.5) // odf/mean or the kick's gate ratio, capped at 4 (bind.ts maps (s − 1.5)/2.5)
      expect(h.strength).toBeLessThanOrEqual(4)
      if (h.t > 0.5) hits[h.drum].push(h.t)
    })
  return hits
}

/** F1 of `hits` against `truth`, one-to-one matches within ±tol s. */
function f1(truth: number[], hits: number[], tol = 0.03) {
  const used = new Set<number>()
  let tp = 0
  for (const t of truth) {
    const j = hits.findIndex((h, k) => !used.has(k) && Math.abs(h - t) <= tol)
    if (j < 0) continue
    used.add(j)
    tp++
  }
  return (2 * tp) / (truth.length + hits.length)
}

const dnb = pattern('dnb', 8)
const scores = (track: Track, x = mix(track)) => {
  const h = hitsOf(x)
  return Object.fromEntries(DRUMS.map((d) => [d, f1(track.truth[d], h[d])])) as Record<Drum, number>
}

test('DnB 174 two-step mix: F1 per drum ≥ 0.70 at ±30 ms', () => {
  // Measured 2026-11-05: kick 1.00 (the bin-1 detector: 0.79), snare 0.97, hats 1.00.
  const f = scores(dnb)
  for (const d of DRUMS) expect(f[d], d).toBeGreaterThanOrEqual(0.7)
  expect(f.snare).toBeGreaterThanOrEqual(0.9)
  expect(f.hats).toBeGreaterThanOrEqual(0.95)
})

test('dubstep 140 and techno 128 mixes: every drum F1 ≥ 0.70', () => {
  // Measured 2026-11-05: dubstep kick 1.00 (bin 1: 0.80), snare 1.00, hats 1.00; techno kick 1.00 (0.89), snare 0.83
  // (claps on kicks; 0.77), hats 1.00.
  for (const g of ['dubstep', 'techno'] as const) {
    const f = scores(pattern(g, 8))
    for (const d of DRUMS) expect(f[d], `${g} ${d}`).toBeGreaterThanOrEqual(0.7)
    expect(f.snare, `${g} snare`).toBeGreaterThanOrEqual(0.8) // the snare ruling's tilt keeps them (unchanged)
  }
})

test('crosstalk matrix: each drum over the bass bed drives only its own detector', () => {
  for (const own of DRUMS) {
    const h = hitsOf(mix(dnb, [own, ...BED]))
    const n = dnb.truth[own].length
    expect(f1(dnb.truth[own], h[own]), own).toBeGreaterThanOrEqual(0.8)
    for (const other of DRUMS) if (other !== own) expect(h[other].length, `${own} → ${other}`).toBeLessThanOrEqual(0.1 * n)
  }
})

test('the bed alone (reese, sub, room tone) gives no hits', () => {
  expect(hitsOf(mix(dnb, BED))).toEqual({ kick: [], snare: [], hats: [] })
})

test.each([
  ['a full-range reese', (n: number) => reese(n, 0.15)], // no high-pass: its 55 and 110 Hz partials beat inside bin 1
  ['a 4.67 Hz wobble', (n: number) => wobble(n)],
  ['an 11.6 Hz wobble', (n: number) => wobble(n, 11.6)],
])('%s over the sub and room tone gives no kicks or snares (rulings 2026-11-05: the bin-1 kick fired 32–41 in 4 s, the untilted snare 12 / 17 on the wobbles)', (_, bass) => {
  const n = 4 * SR
  const x = bass(n)
  for (const s of [sub(n, 0.2, 55), room(n)]) s.forEach((v, i) => (x[i] += v))
  const h = hitsOf(x)
  expect([h.kick, h.snare]).toEqual([[], []])
})

/** One hop per spectrum: `on` bins at `level`, the rest at `rest`. */
const frame = (on: [number, number][], level = 100, rest = 0) =>
  Float32Array.from({ length: N / 2 + 1 }, (_, k) => (on.some(([a, b]) => k >= a && k <= b) ? level : rest))
/** Drums per hop; every hop's kick gate ratio is `ratio`. */
const fire = (frames: Float32Array[], d = createDrums(SR, N), ratio = 2) => frames.map((m, i) => d.detect(m, i * (HOP / SR), ratio).map((h) => h.drum))

test('bands are the bins whose centre lies in the Hz range (kick 40–150, snare 1–5 kHz, hats 7–16 kHz at 93.75 Hz bins)', () => {
  const quiet = frame([])
  const after = (on: [number, number][]) => fire([quiet, quiet, frame(on)])[2]
  expect(after([[1, 1]])).toEqual(['kick'])
  expect(after([[11, 53]])).toEqual(['snare'])
  expect(after([[75, 170]])).toEqual(['hats'])
  expect(after([[0, 0]])).toEqual([]) // DC: a sine's ± images interfere there
  expect(after([[2, 10]])).toEqual([]) // 187.5 Hz (a snare's body) up to 1 kHz
  expect(after([[54, 74]])).toEqual([]) // the 5–7 kHz gap
  expect(after([[171, 256]])).toEqual([]) // above 16 kHz
})

test('configure re-maps Hz to bins, and the mapping follows the sample rate', () => {
  const d = createDrums(SR, N)
  const quiet = frame([])
  d.configure({ kick: [7000, 16000], snare: [1000, 5000], hats: [16100, 24000] })
  expect(fire([quiet, frame([[75, 170]])], d)[1]).toEqual(['kick'])
  expect(fire([quiet, frame([[172, 256]])], d)[1]).toEqual(['hats'])
  // 44.1 kHz: 86.13 Hz bins, so 150 Hz is bin 1 and bin 2 (172 Hz) is out
  const d44 = createDrums(44100, N)
  expect(fire([quiet, frame([[1, 1]])], d44)[1]).toEqual(['kick'])
  expect(fire([quiet, frame([[2, 2]])], createDrums(44100, N))[1]).toEqual([])
})

test("crosstalk: a snare in a kick's hop is dropped unless it is as far over its floor as the kick's ratio over TRANSIENT", () => {
  // From silence: 43 snare bins at 0.01 are 1.3 snare floors (a click), at 100 they are 6.2 (a clap on the kick); a kick
  // ratio of 3 is 2 TRANSIENTs. Kick bin 1 at 1000 holds ≥ 0.7 of the hop's power either way.
  const hop = (kick: number, snare: number) => Float32Array.from({ length: N / 2 + 1 }, (_, k) => (k === 1 ? kick : k >= 11 && k <= 53 ? snare : 0))
  const quiet = hop(0, 0)
  expect(fire([quiet, quiet, hop(1000, 0.01)], undefined, 3)[2]).toEqual(['kick'])
  expect(fire([quiet, quiet, hop(1000, 100)], undefined, 3)[2]).toEqual(['kick', 'snare'])
  expect(fire([quiet, quiet, hop(0, 0.01)], undefined, 3)[2]).toEqual(['snare']) // no kick, nothing to drop
})

test('a snare hop needs ≥ TILT of its band power from 3 kHz up; a vetoed hop arms no minGap (snare ruling 2026-11-05)', () => {
  const quiet = frame([])
  const steep = frame([[11, 31]]) // a wobble's saw edge: 1–3 kHz only
  const flat = (level: number) => frame([[11, 53]], level) // a snare: 22 of its 43 bins are ≥ 3 kHz
  expect(fire([quiet, quiet, steep])[2]).toEqual([])
  expect(fire([quiet, quiet, flat(100)])[2]).toEqual(['snare'])
  // 43·log1p(100) ≈ 198 of flux, under the steep hop's 21·log1p(1e5) ≈ 242 and 10.7 ms after it: had the steep hop
  // posted, minGap and the peak window would each block this one.
  expect(fire([quiet, quiet, steep, quiet, flat(0.1)])[4]).toEqual(['snare'])
})

test('a kick needs both: the gate ratio at TRANSIENT and its bins over SHARE of the hop power, DC excluded', () => {
  const kick = (ratio: number, m: Float32Array) => fire([frame([]), m], undefined, ratio)[1].includes('kick')
  const share = (s: number) => frame([[1, 1]], 100, 100 * Math.sqrt((1 - s) / s / 255)) // bin 1 = s of bins 1–256
  expect([kick(1.5, frame([[1, 1]])), kick(1.49, frame([[1, 1]]))]).toEqual([true, false])
  expect([kick(2, share(0.21)), kick(2, share(0.19))]).toEqual([true, false])
  const dc = (d: number, b1: number) => Float32Array.from({ length: N / 2 + 1 }, (_, k) => (k === 0 ? d : k === 1 ? b1 : 0))
  expect([kick(2, dc(1000, 100)), kick(2, dc(1000, 0))]).toEqual([true, false]) // a line-in offset neither dilutes nor fakes it
})
