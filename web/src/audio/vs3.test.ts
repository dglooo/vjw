// audio/vs3.ts: the vs3 core's onset / refractory maths on synthetic spectra, and hear()'s overlay. Frames at 60 fps in
// analyser2k's shape (48 kHz, FFT 2048: 23.4 Hz bins): a −90 dB floor, a "kick" = 47-140 Hz at −10 dB for 2 frames.
import { expect, test } from 'vitest'
import { createVs3, hear, type Vs3Out } from './vs3'

const DT = 1 / 60
const frame = (loud: [number, number][] = []) => {
  const m = new Float32Array(1024).fill(-90)
  for (const [lo, hi] of loud) m.fill(-10, lo, hi + 1)
  return m
}
const KICK = frame([[2, 6]]), MID = frame([[15, 55]]), QUIET = frame() // MID: 350-1290 Hz (bands 3-4)
/** Runs `n` frames; `at(i)` = frame i's spectrum. Returns each frame's copy of the scalar outputs. */
function run(n: number, at: (i: number) => Float32Array, core = createVs3(48000, 2048)) {
  const rows: Omit<Vs3Out, 'bands' | 'specHi'>[] = []
  for (let i = 0; i < n; i++) {
    const { kick, onKick, onMid, onHigh, sub, mids, highs, air, energy } = core.update(at(i), DT)
    rows.push({ kick, onKick, onMid, onHigh, sub, mids, highs, air, energy })
  }
  return rows
}
const on = (rows: { onKick: number }[]) => rows.flatMap((r, i) => (r.onKick > 0 ? [i] : []))

test('a kick train at 120 BPM: one onKick per kick on its first frame; the kick envelope peaks near 1 and falls below .1 between', () => {
  const starts = [30, 60, 90, 120, 150, 180, 210, 240] // every 0.5 s, after a 0.5 s floor
  const rows = run(270, (i) => (starts.some((s) => i >= s && i < s + 2) ? KICK : QUIET))
  expect(on(rows)).toEqual(starts)
  expect(rows[30].onKick).toBe(1) // min(1, 4 (fast − slow)): a full-scale hit
  for (const s of starts) {
    expect(Math.max(...rows.slice(s, s + 4).map((r) => r.kick))).toBeGreaterThan(0.9)
    expect(rows[s - 1].kick).toBeLessThan(0.1) // release .14 s: gone before the next beat
  }
  expect(rows.every((r) => r.onMid === 0 && Number.isFinite(r.energy))).toBe(true) // no mid hit in a kick train
})

test('refractory: a second hit 50 ms after the first makes no event (gap .12 s); 150 ms after, it does', () => {
  const two = (gap: number) => on(run(60, (i) => (i === 20 || i === 21 || i === 20 + gap || i === 21 + gap ? KICK : QUIET)))
  expect(two(3)).toEqual([20]) // 50 ms
  expect(two(9)).toEqual([20, 29]) // 150 ms
})

test('onMid on a mid burst train (bands 3-4), refractory .09 s; no onKick', () => {
  const rows = run(100, (i) => (i % 20 < 2 && i >= 20 ? MID : QUIET))
  expect(rows.flatMap((r, i) => (r.onMid > 0 ? [i] : []))).toEqual([20, 40, 60, 80])
  expect(on(rows)).toEqual([])
})

test('silence (−∞ dB): every output 0, never NaN', () => {
  const core = createVs3(48000, 2048)
  const o = run(30, () => new Float32Array(1024).fill(-Infinity), core).at(-1)!
  expect(Object.values(o).every((v) => v === 0)).toBe(true)
  expect([...core.out.specHi, ...core.out.bands].every((v) => v === 0)).toBe(true)
  run(30, () => KICK, core)
  expect([...core.out.specHi].every((v) => v >= 0 && v <= 1)).toBe(true)
})

test('hear: no vs3 signal (ours, donor) is the same object; vs3 swaps in the core\'s kick and onMid as kick and snare, keeps the rest', () => {
  const s = { kick: 0.3, snare: 0.2, bass: 0.7 }, out = {}
  expect(hear(s, null, out)).toBe(s)
  const v = { kick: 0.9, onMid: 0.2 } as Vs3Out
  expect(hear(s, v, out)).toEqual({ kick: 0.9, snare: 0.2, bass: 0.7 })
  expect(hear(s, { ...v, onMid: 0.8 }, out).snare).toBe(0.8)
  expect(hear(s, { ...v, onMid: 0 }, out).snare).toBe(0)
  expect(s).toEqual({ kick: 0.3, snare: 0.2, bass: 0.7 }) // the scene's sources stay as they were
})
