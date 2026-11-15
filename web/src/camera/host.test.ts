// plan_camera S1.2b (matrix U2): the host watchdog and the respawn window, with an injected `now` (K-1, K-6, N-3).
import { expect, test } from 'vitest'
import { INIT_MS, RETRY_MS, retryAt, stalled, STUCK_MS } from './host'

test('U2: stalled after the first mask = the oldest unanswered request older than STUCK_MS (strict)', () => {
  expect(STUCK_MS).toBe(1000)
  const h = { born: 0, masked: true, sentAt: 5000 }
  expect(stalled(h, 5999)).toBe(false)
  expect(stalled(h, 6000)).toBe(false) // strict >
  expect(stalled(h, 6001)).toBe(true)
  expect(stalled({ ...h, sentAt: null }, 60_000)).toBe(false) // idle: nothing unanswered
})

test('U2: before the first mask the limit is INIT_MS from the spawn (strict)', () => {
  expect(INIT_MS).toBe(10_000)
  const h = { born: 2000, masked: false, sentAt: 2500 }
  expect(stalled(h, 4000)).toBe(false) // 1500 ms in flight: the init limit, not STUCK_MS
  expect(stalled(h, 12_000)).toBe(false)
  expect(stalled(h, 12_001)).toBe(true)
})

test('U2: retryAt: the first respawn at once; then lastRetryAt + RETRY_MS exactly; after the window, now', () => {
  expect(RETRY_MS).toBe(5000)
  expect(retryAt(7000, null)).toBe(7000) // a first failure, any host age
  expect(retryAt(9000, 7000)).toBe(12_000) // inside the window: from the last granted respawn (N-3)
  expect(retryAt(12_000, 7000)).toBe(12_000)
  expect(retryAt(30_000, 7000)).toBe(30_000) // after the window
})
