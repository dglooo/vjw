// tester (AV QA, CP1 close): adversarial cases on the host watchdog seam, not covered by host.test.ts.
import { expect, test } from 'vitest'
import { INIT_MS, stalled } from './host'

// A host that never receives a frame (sentAt null) before its first mask must still fail at INIT_MS.
test('adversarial: pre-mask host with no request in flight is stalled once its spawn is older than INIT_MS', () => {
  const h = { born: 0, masked: false, sentAt: null }
  expect(stalled(h, INIT_MS)).toBe(false) // strict >
  expect(stalled(h, INIT_MS + 1)).toBe(true)
})

// Once masked, an idle host (nothing unanswered) must never be stalled, however old it is.
test('adversarial: masked host with no request in flight is never stalled', () => {
  const h = { born: 0, masked: true, sentAt: null }
  expect(stalled(h, 10 * 60_000)).toBe(false)
})
