import FFT from 'fft.js'
import { expect, test } from 'vitest'
import { createDrums, type Drum } from './drums'
import { mix, pattern, SR, type Stem, type Track } from './synth'

const N = 512 // as the worklet: mono → Hann → 512-point FFT every 256 samples, stamped at the window's end
const HOP = 256
const hann = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N))
const DRUMS: Drum[] = ['kick', 'snare', 'hats']
const BED: Stem[] = ['reese', 'sub', 'room']

/** Hit times per drum for a signal run through the worklet's FFT path, after a 0.5 s warm-up (the bed's own start). */
function hitsOf(x: Float32Array) {
  const fft = new FFT(N)
  const out = new Float64Array(2 * N)
  const frame = new Float64Array(N)
  const mag = new Float32Array(N / 2 + 1)
  const drums = createDrums(SR, N)
  const hits: Record<Drum, number[]> = { kick: [], snare: [], hats: [] }
  for (let e = HOP; e <= x.length; e += HOP) {
    for (let i = 0; i < N; i++) frame[i] = (x[e - N + i] ?? 0) * hann[i]
    fft.realTransform(out, frame)
    for (let k = 0; k <= N / 2; k++) mag[k] = Math.hypot(out[2 * k], out[2 * k + 1])
    for (const h of drums.detect(mag, e / SR)) {
      expect(h.t).toBe(e / SR)
      expect(h.strength).toBeGreaterThan(1.5) // the detector's odf/mean, capped at 4 (bind.ts maps (s − 1.5)/2.5)
      expect(h.strength).toBeLessThanOrEqual(4)
      if (h.t > 0.5) hits[h.drum].push(h.t)
    }
  }
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
  // Measured 2026-10-31: kick 0.79, snare 0.97, hats 1.00.
  const f = scores(dnb)
  for (const d of DRUMS) expect(f[d], d).toBeGreaterThanOrEqual(0.7)
  expect(f.snare).toBeGreaterThanOrEqual(0.9)
  expect(f.hats).toBeGreaterThanOrEqual(0.95)
})

test('dubstep 140 and techno 128 mixes: every drum F1 ≥ 0.70', () => {
  // Measured: dubstep kick 0.80, snare 1.00, hats 1.00; techno kick 0.89, snare 0.77 (claps on kicks), hats 1.00.
  for (const g of ['dubstep', 'techno'] as const) {
    const f = scores(pattern(g, 8))
    for (const d of DRUMS) expect(f[d], `${g} ${d}`).toBeGreaterThanOrEqual(0.7)
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

/** One hop per spectrum: `on` bins at `level`, the rest at `rest`. */
const frame = (on: [number, number][], level = 100, rest = 0) =>
  Float32Array.from({ length: N / 2 + 1 }, (_, k) => (on.some(([a, b]) => k >= a && k <= b) ? level : rest))
const fire = (frames: Float32Array[], d = createDrums(SR, N)) => frames.map((m, i) => d.detect(m, i * (HOP / SR)).map((h) => h.drum))

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

test("crosstalk: a snare in a kick's hop is dropped unless its flux is at least as far above its floor", () => {
  // From silence: kick bin 1 at 0.01 is log1p(10) = 2.4 = 3.4 kick floors; 43 snare bins at 0.01 are 1.3 snare floors
  // (a click), at 100 they are 6.2 (a clap on the kick).
  const hop = (kick: number, snare: number) => Float32Array.from({ length: N / 2 + 1 }, (_, k) => (k === 1 ? kick : k >= 11 && k <= 53 ? snare : 0))
  const quiet = hop(0, 0)
  expect(fire([quiet, quiet, hop(0.01, 0.01)])[2]).toEqual(['kick'])
  expect(fire([quiet, quiet, hop(0.01, 100)])[2]).toEqual(['kick', 'snare'])
  expect(fire([quiet, quiet, hop(0, 0.01)])[2]).toEqual(['snare']) // no kick, nothing to drop
})
