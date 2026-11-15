// plan_camera S1.2b (matrix U1): the mask-user counter, pure (K-3, K-11).
import { expect, test } from 'vitest'
import { count, use } from './users'

test('U1: take, take, release(h1) twice → 1; release(h2) → 0; use(false) claims nothing', () => {
  const h1 = use(true)
  const h2 = use(true)
  h1()
  h1() // idempotent
  expect(count()).toBe(1)
  h2()
  expect(count()).toBe(0)
  use(false)
  expect(count()).toBe(0)
})
