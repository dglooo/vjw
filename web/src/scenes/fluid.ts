// The 2D fluid's audio mapping (plan_gpu3d S3.1, design_gpu3d L165-L168): this frame's sources → the splats the solver
// applies (S3.2). Pure, for Vitest: no GL and no Math.random; every position, direction and hue is a hash of the frame
// time, so the same frame gives the same splats.
import type { Sources } from '../bind'
import type { FrameInput } from '../frame'
import type { Value } from '../fx/types'

/** x, y: the centre, uv 0..1 (the port's `splat(x, y, …)`); dx, dy: the velocity impulse, the port's units; rgb: the
 *  dye, 0..1; radius: in the `radius` value's units (the port's SPLAT_RADIUS). */
export interface Splat { x: number; y: number; dx: number; dy: number; rgb: [number, number, number]; radius: number }
export const V_MAX = 1000, RING_N = 8, HAT_SCALE = 0.5

// An event = its source jumps by more than RISE since the previous call (the milk-sync rule, milkdrop/levels.ts):
// between hits a drum envelope only decays (features.ts), `drop` too (arrange.ts). A hit at sens 1 jumps ≥ .39 (the
// detectors' least gaps).
const RISE = 0.25
const SPEED = 500 // knob: the impulse at force 1 × strength 1, the port's velocity units (its random splats: ±500)
const RING_R = 0.15 // knob: the drop ring's radius, stage heights

const hash = (x: number) => { const s = Math.sin(x) * 43758.5453; return s - Math.floor(s) } // plexus.ts's
const clampV = (x: number) => Math.min(V_MAX, Math.max(-V_MAX, x)) || 0 // NaN → 0
const ch = (h: number) => Math.min(1, Math.max(0, Math.abs((h - Math.floor(h)) * 6 - 3) - 1))
const hue = (h: number): [number, number, number] => [ch(h), ch(h + 2 / 3), ch(h + 1 / 3)] // the shaders' hsv(h, 1)

/** kick → 1 splat with an impulse; hats → 1 dye-only splat at HAT_SCALE × radius; drop → RING_N splats on one circle,
 *  impulses outward; no event → []. Strength = the source's level; each impulse component is clamped to ±V_MAX.
 *  `prev`: the previous call's `s` (the native keeps a copy; `{}` at first, where a decaying level reads as a hit). */
export function splats(s: Readonly<Sources>, f: FrameInput, v: Readonly<Record<string, Value>>, prev: Readonly<Sources>): Splat[] {
  const out: Splat[] = []
  const rise = (k: string) => (s[k] ?? 0) - (prev[k] ?? 0) > RISE
  const r = (i: number) => hash(f.time * 12.9898 + i * 78.233)
  const at = (i: number) => 0.2 + 0.6 * r(i) // a centre inside the middle 60 %
  const force = v.force as number, radius = v.radius as number
  if (rise('kick')) {
    const a = 2 * Math.PI * r(2), m = SPEED * force * s.kick
    out.push({ x: at(0), y: at(1), dx: clampV(m * Math.cos(a)), dy: clampV(m * Math.sin(a)), rgb: hue(r(3)), radius })
  }
  if (rise('hats')) out.push({ x: at(4), y: at(5), dx: 0, dy: 0, rgb: hue(r(6)), radius: HAT_SCALE * radius })
  if (rise('drop')) {
    const cx = at(7), cy = at(8), rgb = hue(r(9)), m = SPEED * force * s.drop, ar = f.width / f.height || 1
    for (let i = 0; i < RING_N; i++) {
      const a = (2 * Math.PI * i) / RING_N, c = Math.cos(a), sn = Math.sin(a)
      out.push({ x: cx + (RING_R * c) / ar, y: cy + RING_R * sn, dx: clampV(m * c), dy: clampV(m * sn), rgb, radius }) // ÷ ar: round on the stage
    }
  }
  return out
}
