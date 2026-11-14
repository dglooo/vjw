// The orbit camera every 3D scene of the wave shares (plan_scenes_wave3.md S0.3, pick P4): one perspective
// view-projection, the eye on a sphere of radius FOCAL around the origin. At yaw 0, pitch 0 the z = 0 plane lands on
// the 2D scene units (x ±aspect, y ±1), so a flat scene and its 3D form share one framing.
// Look: TD POPs/pointRender cameraViewport (studied, rewritten). No third-party code beyond twgl's m4.
import { m4 } from 'twgl.js'

const FOV = Math.PI / 4 // knob: the vertical field of view. Narrower flattens the depth, wider bends the frame's rim
const NEAR = 0.05 // the clip planes: the wave's scenes are additive points and lines with no depth buffer,
const FAR = 100 //   so these only cut what passes behind the eye

/** The camera's distance from the origin, 1/tan(fovY/2): the w of the z = 0 plane's centre, so a vertex shader
 *  scales a point's size (and its light) by FOCAL / gl_Position.w: 1 there, more towards the eye. */
export const FOCAL = 1 / Math.tan(FOV / 2)

/** The view-projection (pure; column-major, radians): the eye at FOCAL·(sin yaw·cos pitch, sin pitch, cos yaw·cos
 *  pitch) looks at the origin, y up, so |pitch| stays under π/2. */
export function orbitVP(yaw: number, pitch: number, aspect: number): Float32Array {
  const r = FOCAL * Math.cos(pitch)
  const view = m4.inverse(m4.lookAt([r * Math.sin(yaw), FOCAL * Math.sin(pitch), r * Math.cos(yaw)], [0, 0, 0], [0, 1, 0]))
  const out = new Float32Array(16)
  m4.multiply(m4.perspective(FOV, aspect, NEAR, FAR), view, out)
  return out
}
