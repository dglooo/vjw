import { expect, test } from 'vitest'
import { BAND_COUNT, bandEdges, createEnergy, easeBars, rms } from './energy'

const SR = 48000
const N = 1024
const KEYS = ['bass', 'mid', 'treb'] as const
const STEP_DB = 20 * Math.log10(2) // 2× linear magnitude
/** One AnalyserNode dB frame: silence everywhere except one bin. */
const spike = (hz: number, db = -20) => {
  const a = new Float32Array(N / 2).fill(-Infinity)
  a[Math.round((hz * N) / SR)] = db
  return a
}
const run = (en: ReturnType<typeof createEnergy>, frame: Float32Array, frames: number, fps = 60) => {
  for (let i = 1; i < frames; i++) en.update(frame, fps)
  return en.update(frame, fps)
}

test.each([44100, 48000])('band edges at %i Hz: 32 non-empty bands, monotonic, inside 30 Hz–16 kHz', (sr) => {
  const edges = bandEdges(sr, N)
  expect(edges).toHaveLength(BAND_COUNT)
  edges.forEach(([start, end], i) => {
    expect(end).toBeGreaterThan(start)
    expect((start * sr) / N).toBeGreaterThanOrEqual(30)
    expect(((end - 1) * sr) / N).toBeLessThanOrEqual(16000)
    if (i > 0) {
      expect(start).toBeGreaterThanOrEqual(edges[i - 1][0])
      expect(end).toBeGreaterThanOrEqual(edges[i - 1][1])
    }
  })
})

test.each([
  [100, 'bass'],
  [1000, 'mid'],
  [5000, 'treb'],
] as const)('a spike at %i Hz lands only in %s', (hz, only) => {
  const { level } = createEnergy(SR, N).update(spike(hz), 60)
  for (const k of KEYS) {
    if (k === only) expect(level[k]).toBeGreaterThan(0)
    else expect(level[k]).toBe(0)
  }
})

test('auto-gain: constant input settles to 1, a 2× step jumps to ≈2 with att lagging, then relaxes', () => {
  const en = createEnergy(SR, N)
  expect(Math.abs(run(en, spike(100), 600).level.bass - 1)).toBeLessThan(0.05)
  const step = en.update(spike(100, -20 + STEP_DB), 60)
  expect(step.level.bass).toBeCloseTo(2, 1)
  expect(step.att.bass).toBeLessThan(step.level.bass)
  expect(run(en, spike(100, -20 + STEP_DB), 2 * 4.2 * 60).level.bass).toBeLessThan(1.2)
})

test('rates rescale with fps: two frames at 60 fps equal one at 30 fps', () => {
  const at30 = createEnergy(SR, N).update(spike(100), 30)
  const at60 = run(createEnergy(SR, N), spike(100), 2, 60)
  expect(Math.abs(at60.level.bass - at30.level.bass)).toBeLessThan(1e-6)
  expect(Math.abs(at60.att.bass - at30.att.bass)).toBeLessThan(1e-6)
})

test('sound after digital silence seeds fast again instead of reading hundreds × average', () => {
  const en = createEnergy(SR, N)
  run(en, new Float32Array(N / 2).fill(-Infinity), 300)
  expect(run(en, spike(100), 60).level.bass).toBeLessThan(1.2)
})

test('a paused input (quiet: app.ts, ≥ 1 s at or under −60 dBFS RMS) reads as digital silence: levels 0, then sound seeds fast', () => {
  // dsp_linein_2026-11-16 fix 2: a line-in's noise floor is > 0, so the seed never restarted and the bass level read ≥ 4×
  // for 1.2 s after a 30 s pause
  const en = createEnergy(SR, N)
  run(en, spike(100), 20 * 60)
  const floor = new Float32Array(N / 2).fill(-90)
  for (let i = 0; i < 30 * 60; i++) en.update(floor, 60, true)
  expect(en.update(floor, 60, true).level).toEqual({ bass: 0, mid: 0, treb: 0 })
  let loud = 0 // frames at ≥ 4× after the return
  for (let i = 0; i < 5 * 60; i++) if (en.update(spike(100), 60).level.bass >= 4) loud++
  expect(loud / 60).toBeLessThanOrEqual(0.1) // digital silence: 0.08 s
})

test('rms of a unit sine is 1/√2', () => {
  const sine = Float32Array.from({ length: 256 }, (_, i) => Math.sin((2 * Math.PI * 5.3 * i) / 256))
  expect(rms(sine)).toBeCloseTo(Math.SQRT1_2, 2)
})

test('easeBars: a rising bar moves by up, a falling one by down', () => {
  const h = easeBars(Float32Array.of(0, 1), [1, 0], 0.5, 0.1)
  expect(h[0]).toBeCloseTo(0.5)
  expect(h[1]).toBeCloseTo(0.9)
})
