// plan_gpu3d S3.1: the fluid's pure seam splats() (matrix F-U1…F-U4). A native sees a drum hit only as its envelope's
// jump (RG-6: f.onsets carry no drum), so the matrix's onset strengths are source levels here, against `prev` = {}.
import { expect, test, vi } from 'vitest'
import type { FrameInput } from '../frame'
import { RING_N, V_MAX, splats, type Splat } from './fluid'

vi.mock('../gl/engine', () => ({})) // takes the page's canvas + WebGL at import; the seam needs neither

const v = { force: 1, radius: 0.25 } // the defaults (plan § Planner-fixed names)
const W = 1280, H = 720
const frame = (time: number) => ({ time, width: W, height: H }) as FrameInput

test('F-U1: 600 frames of silence → 0 splats in every frame (exact), also through the decaying tails before it', () => {
  let n = 0
  const zero = { kick: 0, hats: 0, drop: 0 }
  for (let i = 0; i < 600; i++) n += splats(zero, frame(i / 60), v, zero).length
  // the music just stopped: each level only decays (features.ts e^(−age/τ), arrange.ts drop), no new hit
  const tail = (age: number) => ({ kick: Math.exp(-age / 0.12), hats: Math.exp(-age / 0.06), drop: 0.9 * Math.exp(-age) })
  for (let i = 0; i < 600; i++) n += splats(tail((i + 1) / 60), frame(i / 60), v, tail(i / 60)).length
  expect(n).toBe(0)
})

test('F-U2: a kick (strength 4) → 1 impulse > 0; a drop → RING_N splats on one ring (radius std/mean ≤ .05), outward; no Math.random', () => {
  const rnd = vi.spyOn(Math, 'random')
  const k = splats({ kick: 4 }, frame(12.3), v, {})
  expect(k).toHaveLength(1)
  expect(Math.hypot(k[0].dx, k[0].dy)).toBeGreaterThan(0)
  expect(k[0].radius).toBe(v.radius)

  const d = splats({ drop: 1 }, frame(12.3), v, {})
  expect(d.length).toBeGreaterThanOrEqual(8)
  const cx = d.reduce((a, p) => a + p.x, 0) / d.length, cy = d.reduce((a, p) => a + p.y, 0) / d.length
  const rr = d.map((p) => Math.hypot((p.x - cx) * (W / H), p.y - cy)) // stage units: the ring is round on the stage
  const mean = rr.reduce((a, x) => a + x, 0) / rr.length
  const std = Math.sqrt(rr.reduce((a, x) => a + (x - mean) ** 2, 0) / rr.length)
  expect(mean * H, 'ring radius, px').toBeGreaterThan(1) // a ring, not a point
  expect(std / mean).toBeLessThanOrEqual(0.05)
  for (const p of d) expect((p.x - cx) * p.dx + (p.y - cy) * p.dy, 'outward').toBeGreaterThan(0)

  expect(splats({ kick: 4 }, frame(12.3), v, {})).toEqual(k) // the same frame → the same splats
  expect(splats({ kick: 4 }, frame(12.4), v, {})[0].x).not.toBe(k[0].x) // positions follow the frame time
  expect(rnd).not.toHaveBeenCalled()
  rnd.mockRestore()
})

test('F-U3: a hat (strength 1.6) is dye only and at most half a kick’s (strength 4) radius', () => {
  const [hat] = splats({ hats: 1.6 }, frame(3), v, {})
  const [kick] = splats({ kick: 4 }, frame(3), v, {})
  expect([hat.dx, hat.dy]).toEqual([0, 0])
  expect(hat.radius / kick.radius).toBeLessThanOrEqual(0.5)
})

test('F-U4: a kick or drop at strength 100 (and ∞) → every impulse component within ±V_MAX, every value finite', () => {
  const all: Splat[] = []
  for (const x of [100, Infinity]) for (let i = 0; i < 50; i++) all.push(...splats({ kick: x, hats: x, drop: x }, frame(i * 0.37), v, {}))
  expect(all).toHaveLength(2 * 50 * (2 + RING_N))
  for (const p of all) {
    expect(Math.abs(p.dx)).toBeLessThanOrEqual(V_MAX)
    expect(Math.abs(p.dy)).toBeLessThanOrEqual(V_MAX)
    for (const x of [p.x, p.y, p.dx, p.dy, p.radius, ...p.rgb]) expect(Number.isFinite(x)).toBe(true)
  }
  expect(Math.max(...all.map((p) => Math.abs(p.dx)))).toBe(V_MAX) // the clamp engaged
})
