// Test-only synthetic fixtures (design C10): seeded stems at 48 kHz and genre patterns with their truth onset times.
// No binaries, no ffmpeg. Only *.test.ts import this, so it never reaches the bundle.
import type { Drum } from './drums'

export const SR = 48000
const DRUMS = ['kick', 'snare', 'hats'] as const

/** Seeded uniform [0, 1) (Park–Miller, as onset.test.ts). */
export const rng = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647

/** RBJ cookbook 2-pole low/high-pass, in place. */
function biquad(x: Float32Array, type: 'lp' | 'hp', f: number) {
  const w = (2 * Math.PI * f) / SR
  const c = Math.cos(w)
  const al = Math.sin(w) / Math.SQRT2 // Q = 1/√2
  const b1 = type === 'lp' ? 1 - c : -1 - c
  const [b0, a0, a1, a2] = [Math.abs(b1) / 2, 1 + al, -2 * c, 1 - al]
  let [x1, x2, y1, y2] = [0, 0, 0, 0]
  for (let i = 0; i < x.length; i++) {
    const y = (b0 * (x[i] + x2) + b1 * x1 - a1 * y1 - a2 * y2) / a0
    ;[x2, x1, y2, y1] = [x1, x[i], y1, y]
    x[i] = y
  }
  return x
}

/** White noise through 8-pole (48 dB/oct) edges, then a 1 ms sin² attack and an exponential decay. */
function burst(r: () => number, len: number, decay: number, hp: number, lp?: number) {
  const x = Float32Array.from({ length: Math.round(len * SR) }, () => 2 * r() - 1)
  for (let i = 0; i < 4; i++) {
    biquad(x, 'hp', hp)
    if (lp) biquad(x, 'lp', lp)
  }
  return x.map((v, i) => v * attack(i) * Math.exp(-i / SR / decay))
}

/** 1 ms sin² fade-in: an instant start is a kink, and its broadband leak reads as flux in every band. */
const attack = (i: number) => Math.sin((Math.PI / 2) * Math.min(1, i / (0.001 * SR))) ** 2

/** Sine sweep 150 → 45 Hz with a 180 ms decay, plus a 2 ms click at 3 kHz (it reaches 1–5 kHz, design C2). */
export function kick() {
  let ph = 0
  return Float32Array.from({ length: Math.round(0.18 * SR) }, (_, i) => {
    const t = i / SR
    ph += (2 * Math.PI * (45 + 105 * Math.exp(-t / 0.03))) / SR
    const click = t < 0.002 ? 0.1 * Math.sin((Math.PI * t) / 0.002) ** 2 * Math.sin(2 * Math.PI * 3000 * t) : 0
    return 0.9 * attack(i) * (1 - t / 0.18) ** 2 * Math.sin(ph) + click
  })
}

/** A 190 Hz tone plus 1–6 kHz noise. The techno clap reuses it (same band). */
export function snare(r: () => number) {
  return burst(r, 0.15, 0.04, 1000, 6000).map((v, i) => 0.5 * v + 0.15 * attack(i) * Math.exp(-i / SR / 0.03) * Math.sin((2 * Math.PI * 190 * i) / SR))
}

/** Noise high-passed at 7 kHz, 40 ms long (open hats: longer). */
export const hats = (r: () => number, len = 0.04) => burst(r, len, len / 4, 7000).map((v) => 0.4 * v)

/** A 45 Hz sine (the patterns tune it to the reese root, 55 Hz: a 45 + 55 Hz bed beats at 10 Hz). */
export const sub = (n: number, amp = 0.2, f = 45) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * f * i) / SR))

/** Two saws at 55 Hz ±10 cents, low-passed (and high-passed at `hp` Hz, 2-pole, if set): additive, nothing aliases. */
export function reese(n: number, amp = 0.15, hp = 0) {
  const x = new Float32Array(n)
  for (const f of [55 * 2 ** (10 / 1200), 55 * 2 ** (-10 / 1200)])
    for (let h = 1; h * f < 1000; h++) {
      const a = amp / h / (1 + ((h * f) / 300) ** 2) / (hp ? 1 + (hp / (h * f)) ** 2 : 1) // a saw's 1/h, 2-pole LP at 300 Hz
      const w = (2 * Math.PI * h * f) / SR
      for (let i = 0; i < n; i++) x[i] += a * Math.sin(w * i)
    }
  return x
}

/** Room tone, white noise at −51 dBFS RMS. A mix is never digital silence, and the log flux reads −100 dB leaks there. */
const room = (n: number, r = rng(99)) => Float32Array.from({ length: n }, () => 0.005 * (2 * r() - 1))

// 16th steps per bar. dnb: two-step, kick on 1 and 2.5, snare on 2 and 4, hats on 8ths plus 16th pickups.
// dubstep: half-time, kick on 1, snare on 3. techno: four on the floor, clap on 2 and 4, open hats off the beat.
// ponytail: reese + sub stand in for the dubstep wobble until a wobble stem exists (S2.1).
const GENRES = {
  dnb: { bpm: 174, kick: [0, 6], snare: [4, 12], hats: [0, 2, 4, 6, 7, 8, 10, 12, 14, 15], open: false },
  dubstep: { bpm: 140, kick: [0], snare: [8], hats: [0, 2, 4, 6, 8, 10, 12, 14], open: false },
  techno: { bpm: 128, kick: [0, 4, 8, 12], snare: [4, 12], hats: [2, 6, 10, 14], open: true },
}
export type Genre = keyof typeof GENRES
export type Stem = Drum | 'reese' | 'sub' | 'room'
export interface Track { stems: Record<Stem, Float32Array>; truth: Record<Drum, number[]> }
export const T0 = 1 // s of bass bed before the first drum

/** `bars` of `genre` at its tempo (or `bpm`), stems kept apart so tests can solo or mix them. */
export function pattern(genre: Genre, bars = 8, bpm = GENRES[genre].bpm, seed = 1): Track {
  const g = GENRES[genre]
  const step = 60 / bpm / 4
  const r = rng(seed)
  const n = Math.ceil((T0 + bars * 16 * step + 0.5) * SR)
  // Layered as mixed: the sub owns the low end in tune with the reese root, and the reese layer is high-passed above
  // it (a full-range reese's 55 Hz harmonics beat inside the kick's one bin, design C2's 93.75 Hz bins).
  const bass = { reese: reese(n, 0.15, 300), sub: sub(n, 0.2, 55), room: room(n) }
  const stems = { kick: new Float32Array(n), snare: new Float32Array(n), hats: new Float32Array(n), ...bass }
  const truth: Track['truth'] = { kick: [], snare: [], hats: [] }
  for (let b = 0; b < bars; b++)
    for (const d of DRUMS)
      for (const s of g[d]) {
        const t = T0 + (b * 16 + s) * step
        truth[d].push(t)
        const x = d === 'kick' ? kick() : d === 'snare' ? snare(r) : hats(r, g.open ? 0.15 : 0.04)
        const at = Math.round(t * SR)
        x.forEach((v, i) => (stems[d][at + i] += v)) // n leaves 0.5 s of tail room
      }
  return { stems, truth }
}

/** Sum of the named stems (default: all). */
export function mix(track: Track, names = Object.keys(track.stems) as Stem[]) {
  const out = new Float32Array(track.stems.kick.length)
  for (const s of names) track.stems[s].forEach((v, i) => (out[i] += v))
  return out
}

// ---- Style-classifier fixtures (S4.1, design C10 / spec §4.3). Feature-level for now: tempo.families (S3.1) and the
// raw wobbleDepth and bass share (S2.4) don't exist yet, so style.test.ts derives the classifier's inputs from these.
/** A groove shaped like GENRES above (pattern() can render it once it takes one), plus the raw wobbleDepth and bass
 *  share its bass layer reads. ⚠️ wobble/bass are assumed (wobble ≈ 0.6–0.8, reese ≈ 0.2–0.3, no wobble ≈ 0.1) until
 *  S2.4 measures them on stems. */
export interface Groove { bpm: number; kick: number[]; snare: number[]; hats: number[]; open: boolean; wobble: number; bass: number }
/** Two grooves per genre: [0] is the audio pattern above; [1] is a 170 DnB with a ghost kick and off-beat hats, a 142
 *  dubstep with kicks on 1 and the "and" of 3, and a 124 house with 16th hats. */
export const GROOVES: Record<Genre, readonly [Groove, Groove]> = {
  dnb: [{ ...GENRES.dnb, wobble: 0.2, bass: 0.7 }, { bpm: 170, kick: [0, 7, 10], snare: [4, 12], hats: [2, 6, 10, 14], open: false, wobble: 0.3, bass: 0.6 }],
  dubstep: [{ ...GENRES.dubstep, wobble: 0.8, bass: 0.75 }, { bpm: 142, kick: [0, 10], snare: [8], hats: [0, 4, 8, 12], open: false, wobble: 0.6, bass: 0.8 }],
  techno: [{ ...GENRES.techno, wobble: 0.05, bass: 0.35 }, { bpm: 124, kick: [0, 4, 8, 12], snare: [4, 12], hats: [...Array(16).keys()], open: false, wobble: 0.15, bass: 0.5 }],
}

/** Equal-power crossfade over `bars` bars at `bpm`, from t0 (s): the [a, b] gains at time t, a² + b² = 1. */
export const crossfade = (t0: number, bars = 16, bpm = 128) => (t: number) => {
  const p = (Math.PI / 2) * Math.min(1, Math.max(0, ((t - t0) * bpm) / 240 / bars))
  return [Math.cos(p), Math.sin(p)] as const
}
