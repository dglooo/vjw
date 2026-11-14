import { describe, expect, test } from 'vitest'
import { FOCAL, orbitVP } from './view'

/** clip = m · (x, y, z, 1), m column-major as GLSL reads it → ndc x, y and the clip w. */
const project = (m: Float32Array, x: number, y: number, z: number) => {
  const [cx, cy, , w] = [0, 1, 2, 3].map((r) => m[r] * x + m[4 + r] * y + m[8 + r] * z + m[12 + r])
  return { x: cx / w, y: cy / w, w }
}

describe('orbitVP', () => {
  test('at yaw 0, pitch 0 the z = 0 plane is the 2D scene: (x, y, 0) → ndc (x / aspect, y), w = FOCAL', () => {
    const aspect = 1728 / 1117
    for (const [x, y] of [[0, 0], [aspect, 1], [-0.8, 0.3], [0.41, -0.77]]) {
      const p = project(orbitVP(0, 0, aspect), x, y, 0)
      expect(p.x).toBeCloseTo(x / aspect, 6)
      expect(p.y).toBeCloseTo(y, 6)
      expect(p.w).toBeCloseTo(FOCAL, 6)
    }
  })

  test('at a quarter turn of yaw the eye sits on +x: (1, 0, 0) projects to the centre, nearer than the origin', () => {
    const p = project(orbitVP(Math.PI / 2, 0, 1.5), 1, 0, 0)
    expect(p.x).toBeCloseTo(0, 6)
    expect(p.y).toBeCloseTo(0, 6)
    expect(p.w).toBeCloseTo(FOCAL - 1, 6)
  })

  test('a point at z > 0 projects larger than its mirror at z < 0', () => {
    const m = orbitVP(0, 0, 1.5)
    const near = project(m, 0.5, 0.4, 0.3)
    const far = project(m, 0.5, 0.4, -0.3)
    expect(near.x).toBeGreaterThan(far.x) // further from the centre
    expect(near.y).toBeGreaterThan(far.y)
    expect(FOCAL / near.w).toBeGreaterThan(1) // the size a vertex shader gives it: over 1 before the plane,
    expect(FOCAL / far.w).toBeLessThan(1) //   under 1 behind it
  })
})
