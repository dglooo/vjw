// plan_camera S1.2b (matrix U1): the mask-user counter, pure (K-3, K-11). Item 5: camera.ts imports in node.
import { expect, test, vi } from 'vitest'
import { count, use } from './users'

vi.mock('../gl/engine', () => ({})) // takes the page's canvas + WebGL at import, as in the scene tests

test('camera.ts imports in node: gl/live.ts (S1.6) and scenes/camera.ts (S1.3) import cam', async () => {
  const { cam } = await import('./camera')
  expect(cam.live).toBe(false)
  expect(cam.error).toBe(null)
})

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
