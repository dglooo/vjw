// plan_camera S1.3 (matrix U7): native/camera imports in node; its defaults; no flash input, no audio binding (D4).
import { expect, test, vi } from 'vitest'
import { defaults } from '../doc'

vi.mock('../gl/engine', () => ({})) // takes the page's canvas + WebGL at import, as in the scene tests

test('U7: native/camera imports in node; cut none, limit 1, gain 1; no flash input, no binding', async () => {
  const { camera } = await import('./camera')
  expect(defaults(camera)).toEqual({ cut: 0, limit: 1, gain: 1 })
  expect(camera.inputs.find((x) => x.name === 'cut')?.labels).toEqual(['none', 'person', 'background'])
  expect(camera.flash).toBeUndefined()
  expect(camera.bind).toBeUndefined()
})
