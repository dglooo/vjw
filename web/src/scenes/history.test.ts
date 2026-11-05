// plan_td_look.md S2.2–S2.4: the history ring's pure helpers, and the native's bind defaults name real sources.
import { expect, test, vi } from 'vitest'
import { SOURCE_IDS } from '../bind'
import { rgbaDelay, ringSize, slitScan, slot, timeMachine } from './history'

vi.mock('../gl/engine', () => ({})) // takes the page's canvas + WebGL at import; the helpers need neither

test('slot: age 0 is the head, ages wrap below 0, the oldest is depth − 1 back', () => {
  expect(slot(5, 0, 32)).toBe(5)
  expect(slot(5, 6, 32)).toBe(31)
  expect(slot(0, 31, 32)).toBe(1)
  expect(slot(31, -1, 32)).toBe(0) // push's step: one newer than the head
})

test('ringSize: ½ the stage under 64 MiB, halved again when 32 slots would pass it', () => {
  const [w, h] = ringSize(1728, 1117)
  expect([w, h]).toEqual([864, 559])
  expect(32 * w * h * 4).toBeLessThanOrEqual(64 << 20) // 61.8 MB
  expect(ringSize(3840, 2160)).toEqual([960, 540]) // ½ = 1920×1080 is 265 MB
})

test('ringSize for a 320×180 tile (2b S3.2): 160×90 × 32 slots ≈ 1.8 MB, against 61.8 MB on the stage', () => {
  const bytes = ([w, h]: [number, number]) => 32 * w * h * 4
  expect(ringSize(320, 180)).toEqual([160, 90])
  expect(bytes(ringSize(320, 180))).toBe(1_843_200)
  expect(bytes(ringSize(1728, 1117))).toBe(61_820_928)
})

test('the ring natives bind known sources', () => {
  for (const d of [rgbaDelay, timeMachine, slitScan]) for (const b of Object.values(d.bind!)) expect(SOURCE_IDS).toContain(b.source)
})
