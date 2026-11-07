import { expect, test } from 'vitest'
import { createAnalysis } from './analysis'
import { createDrums, type Drum, type Floors } from './drums'
import type { Genre } from './presets'
import { parseSettings, workletBands } from './settings'
import { mix, pattern, reese, room, SR, sub, wobble, type Stem, type Track } from './synth'

const N = 512 // as the worklet: a 512-point FFT every 256 samples (the spectrum-level tests below)
const HOP = 256
const DRUMS: Drum[] = ['kick', 'snare', 'hats']
const BED: Stem[] = ['reese', 'sub', 'room']

/** Hit times per drum for a signal run through the worklet's body (analysis.ts) in render quanta, after a 0.5 s warm-up
 *  (the bed's own start); at `genre`'s config (its floors) if given, else the default floors. */
function hitsOf(x: Float32Array, genre?: Genre) {
  const a = createAnalysis(SR)
  if (genre) a.configure({ kind: 'config', rev: 1, ...workletBands(parseSettings(null), genre) })
  const hits: Record<Drum, number[]> = { kick: [], snare: [], hats: [] }
  for (let i = 0; i + 128 <= x.length; i += 128)
    a.block([x.subarray(i, i + 128)], i, (h) => {
      if (h.kind !== 'hit') return
      expect(h.strength).toBeGreaterThanOrEqual(h.drum === 'kick' ? 1.35 : 1.5) // odf/mean or the kick's gate ratio (KICK), capped at 4
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
const scores = (track: Track, genre?: Genre, x = mix(track)) => {
  const h = hitsOf(x, genre)
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
  // Measured 2026-11-05: dubstep kick 1.00 (bin 1: 0.80), snare 1.00, hats 1.00; techno kick 1.00 (0.89), snare 0.86
  // (claps on kicks; same-hop crosstalk 0.83, bin 1 0.77), hats 1.00.
  for (const g of ['dubstep', 'techno'] as const) {
    const f = scores(pattern(g, 8), g) // at the floors the genre gets once classified (Dubstep 80/100)
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
/** Drums per hop, each hit in the hop of its own t (a snare posts a hop late), plus one silent hop that releases the
 *  last snare. Every hop's kick gate ratio is `ratio`, or per hop (the silent one at 1). */
const fire = (frames: Float32Array[], d = createDrums(SR, N), ratio: number | number[] = 2) => {
  const out = frames.map((): Drum[] => [])
  for (const [i, m] of [...frames, frame([])].entries())
    for (const h of d.detect(m, i * (HOP / SR), typeof ratio === 'number' ? ratio : (ratio[i] ?? 1))) out[Math.round((h.t * SR) / HOP)].push(h.drum)
  return out
}

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

test("crosstalk: a snare within a hop of a kick is dropped unless it is as far over XT_SNARE (80) as the kick's ratio over TRANSIENT", () => {
  // From silence: 43 snare bins at 0.01 are 1.3 XT_SNAREs (a click; 2.6 live floors of 40), at 100 they are 6.2 (a clap
  // on the kick); a kick ratio of 3 is 2 TRANSIENTs. Kick bin 1 at 1000 holds ≥ 0.7 of the hop's power either way.
  const hop = (kick: number, snare: number) => Float32Array.from({ length: N / 2 + 1 }, (_, k) => (k === 1 ? kick : k >= 11 && k <= 53 ? snare : 0))
  const quiet = hop(0, 0)
  expect(fire([quiet, quiet, hop(1000, 0.01)], undefined, 3)[2]).toEqual(['kick'])
  expect(fire([quiet, quiet, hop(1000, 100)], undefined, 3)[2]).toEqual(['kick', 'snare'])
  expect(fire([quiet, quiet, hop(0, 0.01)], undefined, 3)[2]).toEqual(['snare']) // no kick, nothing to drop
  // ±1 hop (lead amendment to the snare ruling, 2026-11-05): under a wobble the click leads the kick's gate by a hop.
  expect(fire([quiet, quiet, hop(0, 0.01), hop(1000, 0.01)], undefined, 3).slice(2)).toEqual([[], ['kick']])
  expect(fire([quiet, quiet, hop(1000, 0), hop(1000, 0.01)], undefined, 3).slice(2)).toEqual([['kick'], []])
  expect(fire([quiet, quiet, hop(0, 100), hop(1000, 100)], undefined, 3).slice(2)).toEqual([['snare'], ['kick']])
  // T2: KICK posts a kick at 1.4, a hop before its gate reaches 2.5. A click there (1.3 ≥ 1.4 / 1.5), or one or two hops
  // later, is still dropped: the next hop's 2.5 weighs the kick, as when it posted at 2.5.
  const [k, c] = [hop(1000, 0), hop(1000, 0.01)]
  expect(fire([quiet, quiet, c, k], undefined, [1, 1, 1.4, 2.5]).slice(2)).toEqual([['kick'], []])
  expect(fire([quiet, quiet, k, c], undefined, [1, 1, 1.4, 2.5]).slice(2)).toEqual([['kick'], []])
  expect(fire([quiet, quiet, k, k, c], undefined, [1, 1, 1.4, 2.5, 1.2]).slice(2)).toEqual([['kick'], [], []])
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
  // Right after a vetoed hop, the flux is read against the hop before it: 43·log1p(3) ≈ 60 over the floor of 40; against
  // the steep hop only the 22 bins ≥ 3 kHz would rise (≈ 30).
  expect(fire([quiet, quiet, steep, flat(0.003)])[3]).toEqual(['snare'])
})

test('a kick needs both: the gate ratio at KICK (1.35, not TRANSIENT) and its bins over SHARE of the hop power, DC excluded', () => {
  const kick = (ratio: number, m: Float32Array) => fire([frame([]), m], undefined, ratio)[1].includes('kick')
  const share = (s: number) => frame([[1, 1]], 100, 100 * Math.sqrt((1 - s) / s / 255)) // bin 1 = s of bins 1–256
  // real-track ruling 2026-11-05 (c): a hop at 1.4 with its share posts, one at 1.30 doesn't
  expect([1.4, 1.35, 1.34, 1.3].map((r) => kick(r, share(0.21)))).toEqual([true, true, false, false])
  expect([kick(2, share(0.21)), kick(2, share(0.19))]).toEqual([true, false])
  const dc = (d: number, b1: number) => Float32Array.from({ length: N / 2 + 1 }, (_, k) => (k === 0 ? d : k === 1 ? b1 : 0))
  expect([kick(2, dc(1000, 100)), kick(2, dc(1000, 0))]).toEqual([true, false]) // a line-in offset neither dilutes nor fakes it
})

test('a double kick 53 ms apart fires once, 64 ms apart twice (the <60 ms re-triggers, real tracks 2026-11-05)', () => {
  // 10 hops = 53.3 ms: the 3 real-track re-triggers sit at 52 ms (2nd ratio 1.35–1.39), the shortest legitimate pair at
  // 75.5 ms, so MIN_GAP 0.06 drops the re-trigger only. 12 hops = 64 ms pins the other side: a wider gap would eat it.
  const quiet = frame([])
  const k = frame([[1, 1]])
  const kicks = (gap: number) =>
    fire([quiet, k, ...Array(gap - 1).fill(quiet), k], undefined, [1, 2, ...Array(gap - 1).fill(1), 2]).flat().filter((d) => d === 'kick').length
  expect([kicks(10), kicks(12)]).toEqual([1, 2])
})

test('floors: snare 40 / hats 50 by default, setFloors moves them (real-track ruling 2026-11-05: Dubstep sends 80/100)', () => {
  // From silence, 43 snare bins at 0.003 rise 43·log1p(3) ≈ 60 and 96 hats bins at 0.001 rise 96·log1p(1) ≈ 67
  const mid = Float32Array.from({ length: N / 2 + 1 }, (_, k) => (k >= 11 && k <= 53 ? 0.003 : k >= 75 && k <= 170 ? 0.001 : 0))
  const quiet = frame([])
  const at = (f: Floors) => {
    const d = createDrums(SR, N)
    d.setFloors(f)
    return fire([quiet, quiet, mid], d)[2]
  }
  expect(fire([quiet, quiet, mid])[2]).toEqual(['hats', 'snare'])
  expect(at({ snare: 80, hats: 100 })).toEqual([])
  expect(at({ snare: 40, hats: 100 })).toEqual(['snare'])
})
