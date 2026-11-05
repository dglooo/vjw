import { expect, test } from 'vitest'
import { createBank, type BandSpec } from './bands'

// Local stems after design C10 (synth.ts belongs to S1.2). Everything runs in 128-frame render quanta, as in the worklet.
const QUANTUM = 128
const RATES = [44100, 48000]
let seed = 1
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647 // seeded: the fixtures are deterministic
const len = (s: number, sr: number) => Math.round(s * sr)
const blk = (s: number, sr: number) => Math.floor(len(s, sr) / QUANTUM) // quantum index at time s
const sine = (f: number, s: number, sr: number, amp = 0.5) =>
  Float32Array.from({ length: len(s, sr) }, (_, i) => amp * Math.sin((2 * Math.PI * f * i) / sr))
const mean = (a: Float32Array) => a.reduce((s, v) => s + v, 0) / a.length

/** Two saws at 55 Hz ±10 cents through a 400 Hz one-pole low-pass. */
function reese(s: number, sr: number, amp = 0.5) {
  const out = new Float32Array(len(s, sr))
  const f1 = 55 * 2 ** (10 / 1200), f2 = 55 * 2 ** (-10 / 1200), k = 1 - Math.exp((-2 * Math.PI * 400) / sr)
  let lp = 0
  for (let i = 0; i < out.length; i++) {
    const t = i / sr
    lp += ((((t * f1) % 1) + ((t * f2) % 1) - 1) * amp - lp) * k
    out[i] = lp
  }
  return out
}

/** A 150 → 45 Hz sine sweep decaying over 180 ms, plus a 2 ms click. */
function kick(sr: number, amp = 1) {
  const out = new Float32Array(len(0.18, sr))
  let ph = 0
  for (let i = 0; i < out.length; i++) {
    const t = i / sr
    ph += (2 * Math.PI * (45 + 105 * Math.exp(-t / 0.025))) / sr
    out[i] = amp * (Math.sin(ph) * Math.exp(-t / 0.04) + (t < 0.002 ? (rand() * 2 - 1) * 0.5 : 0))
  }
  return out
}

/** A 55 Hz saw through a 2-pole low-pass swept 150 Hz ↔ 1.5 kHz at `lfo` Hz. */
function wobble(s: number, sr: number, lfo: number, amp = 0.5) {
  const out = new Float32Array(len(s, sr))
  let a = 0, b = 0
  for (let i = 0; i < out.length; i++) {
    const t = i / sr
    const k = 1 - Math.exp((-2 * Math.PI * 150 * 10 ** (0.5 - 0.5 * Math.cos(2 * Math.PI * lfo * t))) / sr)
    a += ((((t * 55) % 1) * 2 - 1) * amp - a) * k
    b += (a - b) * k
    out[i] = b
  }
  return out
}

const mix = (a: Float32Array, b: Float32Array, at: number) => {
  const o = a.slice()
  for (let i = 0; i < b.length && at + i < o.length; i++) o[at + i] += b[i]
  return o
}

/** A fresh one-band bank over `x`: e2, held and the gate ratio after each quantum. */
function run(spec: BandSpec, x: Float32Array, sr: number) {
  const bank = createBank(sr)
  bank.configure([spec])
  const out = new Float32Array(2)
  const n = Math.floor(x.length / QUANTUM)
  const e2 = new Float32Array(n), held = new Float32Array(n), ratio = new Float32Array(n)
  for (let k = 0; k < n; k++) {
    bank.process(x.subarray(k * QUANTUM, (k + 1) * QUANTUM))
    bank.read(out)
    e2[k] = out[0]
    held[k] = out[1]
    ratio[k] = bank.ratio(0)
  }
  return { e2, held, ratio }
}
const gatedQuanta = (r: { e2: Float32Array; held: Float32Array }, from: number) =>
  r.e2.subarray(from).filter((v, k) => r.held[from + k] !== v).length

test.each(RATES)('band isolation: 50 Hz reads >= 5x 120 Hz in a 40-60 Hz band, edges at -6 dB (%i Hz)', (sr) => {
  const band = { id: 'c', lo: 40, hi: 60 }
  const level = (f: number) => mean(run(band, sine(f, 0.8, sr), sr).e2.subarray(blk(0.5, sr)))
  expect(level(50) / level(120)).toBeGreaterThan(5)
  const centre = level(Math.sqrt(40 * 60))
  expect(level(40) / centre).toBeCloseTo(0.5, 1) // 2 stages × -3 dB at each edge: pins Q and the cascade count
  expect(level(60) / centre).toBeCloseTo(0.5, 1)
})

test.each(RATES)('e2 rises in ~20 ms and falls in ~45 ms (%i Hz)', (sr) => {
  const x = new Float32Array(len(1, sr))
  x.set(sine(200, 0.4, sr), len(0.3, sr)) // a 200 Hz burst, 0.3–0.7 s
  const { e2 } = run({ id: 'm', lo: 100, hi: 400 }, x, sr)
  const top = mean(e2.subarray(blk(0.6, sr), blk(0.7, sr)))
  const after = (s: number, hit: (v: number) => boolean) => {
    let k = blk(s, sr)
    while (!hit(e2[k])) k++
    return (((k + 1) * QUANTUM) / sr - s) * 1000 // ms from s to the end of the first quantum that hits
  }
  const rise = after(0.3, (v) => v >= 0.63 * top)
  const fall = after(0.7, (v) => v <= 0.37 * top)
  expect(rise).toBeGreaterThan(16)
  expect(rise).toBeLessThan(28)
  expect(fall).toBeGreaterThan(36)
  expect(fall).toBeLessThan(56)
})

test.each(RATES)('kick vs sustained bass: kicks stay out of held, a sustained 55 Hz reese passes (%i Hz)', (sr) => {
  const REESE = { id: 'reese', lo: 60, hi: 250 }
  const bass = reese(3, sr)
  const ref = run(REESE, bass, sr)
  expect(gatedQuanta(ref, blk(0.3, sr))).toBe(0) // the reese alone never trips the gate: held = e2
  const at = [0.5, 1, 1.5, 2, 2.5]
  for (const amp of [0.6, 1]) { // in-band kick ≈ 2.5x / 3.8x the reese
    let x = bass
    for (const t of at) x = mix(x, kick(sr, amp), len(t, sr))
    const r = run(REESE, x, sr)
    let jump = 0, hi = 0, lo = Infinity
    for (const t of at) {
      for (let k = blk(t, sr); k < blk(t + 0.25, sr); k++) {
        jump = Math.max(jump, r.e2[k] / ref.e2[k])
        hi = Math.max(hi, r.held[k] / ref.e2[k])
        lo = Math.min(lo, r.held[k] / ref.e2[k])
      }
      const back = blk(t + 0.15, sr)
      expect(r.held[back]).toBe(r.e2[back]) // the hold is over 150 ms after the kick
    }
    expect(jump).toBeGreaterThan(2) // e2 sees every kick…
    expect(hi).toBeLessThan(1.3) // …held stays flat through them, tail included
    expect(lo).toBeGreaterThan(0.7)
  }
})

test('held is gated at TRANSIENT 1.5, not at the kick trigger (drums.ts KICK 1.35, real-track ruling 2026-11-05 (c))', () => {
  const sr = 48000
  // A 100 Hz tone stepping up ×k at 0.5 s: the gate's fast/slow ratio peaks under k (gs moves during gf's attack).
  // Measured: ×1.7 peaks at 1.42, held untouched; ×2.5 at 1.78, held frozen for 43 quanta.
  const step = (k: number) => run({ id: 'b', lo: 60, hi: 250 }, sine(100, 1, sr, 0.2).map((v, i) => (i < len(0.5, sr) ? v : k * v)), sr)
  const from = blk(0.3, sr)
  const [lo, hi] = [step(1.7), step(2.5)]
  expect(Math.max(...lo.ratio.subarray(from))).toBeGreaterThan(1.35) // the kick trigger sees it…
  expect(gatedQuanta(lo, from)).toBe(0) // …held doesn't
  expect(Math.max(...hi.ratio.subarray(from))).toBeGreaterThan(1.5)
  expect(gatedQuanta(hi, from)).toBeGreaterThan(0)
})

test.each([4.67, 11.6])('a wobble at %f Hz (rises >= 40 ms) passes the gate and e2 follows it', (lfo) => {
  const sr = 48000
  const r = run({ id: 'wob', lo: 150, hi: 1500 }, wobble(2, sr, lfo), sr)
  expect(gatedQuanta(r, blk(0.5, sr))).toBe(0)
  const tail = r.e2.subarray(blk(1, sr))
  expect(Math.max(...tail) / Math.min(...tail)).toBeGreaterThan(1.5)
})

test('configure keeps state per id, reads in the new spec order, and retunes', () => {
  const sr = 48000, bank = createBank(sr), out = new Float32Array(4)
  const x = sine(50, 1, sr)
  const feed = (from: number, to: number) => {
    for (let i = len(from, sr); i + QUANTUM <= len(to, sr); i += QUANTUM) bank.process(x.subarray(i, i + QUANTUM))
  }
  bank.configure([{ id: 'a', lo: 40, hi: 60 }, { id: 'b', lo: 200, hi: 400 }])
  feed(0, 0.5)
  bank.read(out)
  const a = out[0]
  expect(out[1]).toBe(a)
  bank.configure([{ id: 'c', lo: 40, hi: 60 }, { id: 'a', lo: 400, hi: 800 }]) // b gone, a moved and retuned
  bank.read(out)
  expect([out[0], out[1], out[2], out[3]]).toEqual([0, 0, a, a]) // c starts at 0, a keeps e2 and held
  feed(0.5, 0.5 + QUANTUM / sr)
  bank.read(out)
  expect(out[2]).toBeGreaterThan(0.9 * a) // no jump…
  feed(0.6, 0.9)
  bank.read(out)
  expect(out[2]).toBeLessThan(0.2 * a) // …but the new edges reject 50 Hz
})
