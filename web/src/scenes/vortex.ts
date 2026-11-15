// Vortex (plan_scenes_wave3.md S3.2, CP3): TD's force look — 32k GPU points as a tilted 3D disc (the plan's
// 65536 billed over the 5 ms gate on dubstep; the step's lever). Each
// point's state (tfPoints, the swarm's) is its position and velocity in the disc plane; the velocity
// relaxes toward the force field: a tangential spin with the 1/√r (Keplerian) falloff, an inward pull
// scaled by the drop's novaPull envelope (negative: the blast out; > 1: the re-accretion; 1: settled),
// and a curl noise ∝ spin (the reese stirs the wells into vortices); the kick's burst is a radial push.
// A point consumed by the core (or flung past the rim) respawns on the rim — the zero-state "new" trick:
// a fresh point is seeded inside the disc, so a tile's still is the settled disc. Render only:
// z = per-point hash × a thickness that thins with r, through gl/view.ts's orbitVP (pitch .17 turns, the
// yaw's saw orbits). The draw is the swarm's: additive sprites into a persistent half-float trail
// (trailKeep), the shared bloom, particles' tone map. No input brightens the frame on a hit: the burst
// and the nova move points, the sparkle is zero-mean, the deposit is ÷ size.
// Look: TD SN/POP forcePOP ex1 + forceradialPOP ex1–2 (radial + spiral forces with falloff: "gravitational
// wells to chaotic vortexes"), particlePOP ex1, trailPOP ex1 (studied, rewritten). No third-party code
// beyond points.ts's NOISE/HASH (webgl-noise, MIT) and twgl's m4.
import { bindFramebufferInfo, createProgramInfo, type ProgramInfo } from 'twgl.js'
import { createBloom } from '../gl/bloom'
import { fullscreenProgram, renderTarget, tint } from '../gl/engine'
import type { NativeDef } from '../gl/scene'
import { FOCAL, orbitVP } from '../gl/view'
import { COMPOSITE_FS } from './particles'
import { HASH, NOISE, tfPoints } from './points'
import { trailKeep } from './scope'

const N = 32768 // knob: point count: the plan's 65536 billed 4.98 dnb / 5.19 dub (+flash) — over the 5 ms gate on
// dubstep, so the step's lever fired (N 32768; the snoise-per-point TF pass is the cost)
/** The point count: N on the stage, N/16 for a `size` (a tile, the swarm's 4096-of-65536 ratio). */
export const vortexN = (size?: readonly [number, number]) => (size ? 2048 : N)
const CORE = 0.18 // knob: r inside this the point is consumed by the well and respawns on the rim
const RIM = 1.0 // knob: the respawn radius, scene units: the disc's outer rim (1.5 bled every yaw; 1.15 let the
//   perspective stretch the near side into a hot band at the spin-up — the disc stays in frame at every orbit phase)
const TS = 0.5 // knob: the spin's gain: v_t = spin·TS/√r — at spin .4 the rim orbits in ≈ 30 s, at 2.5 in ≈ 5 s
const PR = 0.25 // knob: the pull's gain: the rest infall = pull·PR scene units/s (rim → core in ≈ 5.5 s)
const CURL = 0.3 // knob: the curl-noise share of the field, ∝ spin: the reese stirs the wells
const RELAX = 2 // knob: 1/s — the velocity's relaxation toward the field (stable at any frame time)
const BURST_K = 0.5 // knob: the kick's radial push, u/s² per unit of burst (the kick period is shorter than the
//   relaxation, so the push is a force, not an impulse: the mean swell = BURST_K·burst·duty/RELAX — kept ≈ the infall)
const TH = 0.35 // knob: the disc's central half-thickness, thinning to 0 at the rim
const SIZE = 2.2 // knob: px on a REF_H stage (wireform's corners' class; no `size` input in the contract)
const GAIN = 0.48 // knob: one point's deposit ÷ its size (× 65536/32768 of 0.32: the halved count keeps the settled
// disc's trail coverage; the drop's spin-up + long trails must stay mid-range, not crush)
const GLOW = 3 // knob: the bloom strength (the swarm's / creatures')
const REF_H = 1117 // the point size's reference height (creatures')
const TAU = Math.PI * 2

// The nova's envelope, the CP3 contract's seam.
const T = 3 // knob: s (layer clock): the blast, the re-accretion, the settle
const BLAST = 3 // knob: the pull multiplier's depth just after the edge (1 − BLAST < 0: the field flips outward)
const REGAIN = 2.5 // knob: the re-accretion's peak above the settled pull
const ss = (a: number, b: number, x: number) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t) }

/** The pull multiplier `age` s after a drop (PURE, the CP3 contract): a blast outward (negative, u 0→.35),
 *  a strong re-accretion (> 1, peaking at u .8), then exactly 1. age = Infinity: no drop yet. */
export function novaPull(age: number): number {
  if (!Number.isFinite(age) || age < 0) return 1
  const u = Math.min(age / T, 1)
  if (u >= 1) return 1
  return 1 - BLAST * (1 - ss(0, 0.35, u)) + REGAIN * ss(0.35, 0.8, u) * (1 - ss(0.8, 1, u))
}

// Scene units, the disc plane (the camera orbits it): y −1..1, x by the aspect. One pass integrates
// (transform feedback) and draws, as the swarm's.
const VS = `#version 300 es
in vec4 state; // pos.xy, vel.xy — the disc plane
out vec4 stateOut;
out vec3 vColor;
uniform mat4 uVP;
uniform float uDt, uTime, uPx, uSize, uSpin, uPull, uNova, uBurst, uHue, uSparkle;
${NOISE}${HASH}
const float FOCAL = ${FOCAL.toFixed(9)};
const float CORE = ${CORE.toFixed(2)}, RIM = ${RIM.toFixed(2)};
vec3 hsv(float h, float s) { return mix(vec3(1.0), clamp(abs(fract(h + vec3(0.0, 2.0, 1.0) / 3.0) * 6.0 - 3.0) - 1.0, 0.0, 1.0), s); }
void main() {
  uint id = uint(gl_VertexID);
  float r1 = hash(id), r2 = hash(id + 0x9e3779b9u);
  uint seed = mixu(id + floatBitsToUint(uTime)); // a respawn's angle varies per frame: no stripes in a nova blast
  vec2 p = state.xy, v = state.zw;
  float r = length(p);
  if (state == vec4(0.0)) {
    float a = 6.2831853 * hash(seed); // new: inside the disc (uniform in area), at rest — a tile's still is the settled disc
    p = vec2(cos(a), sin(a)) * mix(CORE + 0.1, RIM - 0.08, sqrt(hash(seed + 1u)));
    v = vec2(0.0);
    r = length(p);
  } else if (r < CORE || r > RIM) {
    float a = 6.2831853 * hash(seed + 7u); // consumed by the well (or flung past the rim): back on the rim, at rest
    p = vec2(cos(a), sin(a)) * RIM * (0.9 + 0.1 * r2); // a band, not a hairline: the respawns of one frame do not bunch
    v = vec2(0.0);
    r = length(p);
  }
  vec2 rhat = p / max(r, 1e-3);
  // The field: the tangential spin, the 1/√r falloff (the inner points orbit faster, as a Keplerian disc);
  // the inward pull × the drop's nova envelope (negative: the blast out); the curl of a wide noise field,
  // ∝ spin: the reese stirs the wells into vortices.
  vec3 g;
  snoise(vec3(p * 1.1, uTime * 0.1), g);
  vec2 vf = vec2(-rhat.y, rhat.x) * uSpin * ${TS.toFixed(2)} / sqrt(max(r, CORE))
          - rhat * uPull * uNova * ${PR.toFixed(2)}
          + vec2(g.y, -g.x) * uSpin * ${CURL.toFixed(2)};
  v += (vf - v) * (1.0 - exp(-${RELAX.toFixed(1)} * uDt)); // the relaxation: stable at any frame time
  v += rhat * uBurst * ${BURST_K.toFixed(1)} * uDt; // the kick's radial push (a force: the field pulls it back)
  p += v * uDt;
  stateOut = vec4(p, v);
  // The disc, render only: the per-point hash × a thickness that thins with r (a bulge at the well).
  float z = (2.0 * r1 - 1.0) * ${TH.toFixed(2)} * (1.0 - r / RIM);
  vec4 pos = uVP * vec4(p, z, 1.0);
  float near = FOCAL / max(pos.w, FOCAL / 1.5); // the 3D cue: near is bigger and brighter (≤ 1.5×: the inner rim's
  //   1/√r speed trap must not band the near side at the spin-up, no flash)
  float heat = clamp(length(v) * 0.45, 0.0, 1.0); // fast = hot: whiter (sub-linear in speed: the spin-up on the reese must not white the frame out)
  float twinkle = 1.0 + uSparkle * (4.0 * hash(id ^ mixu(floatBitsToUint(uTime))) - 2.0); // hats: zero-mean, per point
  vec3 c = hsv(uHue + 0.15 * r / RIM, 0.85);
  float s = uSize * uPx * (0.6 + 0.8 * r1) * near, ps = max(s, 1.0);
  // The lum is near-flat in the speed: the spin-up on the reese maxes heat over the whole disc at once, so a
  // linear lum would white the frame out — faster points spread their light over longer trails instead, and only
  // a quadratic heat lift + the whiteness carry the motion.
  vColor = mix(c, vec3(1.0), heat * heat * 0.6) * (0.5 + 0.5 * heat * heat) * twinkle * near * ${GAIN.toFixed(2)} / uSize * (s * s) / (ps * ps); // ÷ size
  gl_PointSize = ps;
  gl_Position = pos;
}`
// The soft round sprite (creatures'): the falloff anti-aliases a 2-px point, so a slow drift does not shimmer.
const FS = `#version 300 es
precision highp float;
in vec3 vColor;
out vec4 outColor;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float a = max(0.0, 1.0 - dot(q, q));
  outColor = vec4(vColor * a * a, 1.0);
}`

let program: ProgramInfo | undefined // as the swarm's tfProgram: compiled once and shared

/** The bindings (plan § Scenes row 9, all ⚠️ assumptions until the CP3 demo): the reese spins the disc up
 *  (Auto-style moves it to wobble under Dubstep), the sub breathes the pull (min > max inverts), the kick
 *  punches it outward, the snare walks the colour, the hats twinkle, the build lengthens the trails, the
 *  drop runs novaPull (the blast out and the re-form), and the yaw's saw orbits (one turn per 33 s; the saw
 *  wraps, so the phase is continuous). pitch .17 turns is the row's static. No input brightens the frame on
 *  a hit: the burst and the nova move points, the sparkle is zero-mean. */
export const vortex: NativeDef = {
  id: 'native/vortex', name: 'Vortex', kind: 'generator', category: 'geometry', tags: ['particles', 'vortex', '3d'], credit: 'VeeJay Wizard', inputs: [
    { name: 'spin', type: 'float', min: 0, max: 3, default: 0.4 }, // the tangential field, the 1/√r falloff: 2.5 spins the rim up to ≈ 5 s/orbit
    { name: 'pull', type: 'float', min: 0, max: 1, default: 0.6 }, // the inward field × novaPull: the accretion rate
    { name: 'burst', type: 'float', min: 0, max: 1.5, default: 0 }, // the kick's radial push
    { name: 'hue', type: 'float', min: 0, max: 1, default: 0.6 }, // the base hue, turns
    { name: 'sparkle', type: 'float', min: 0, max: 0.5, default: 0 }, // per-point twinkle, zero-mean
    { name: 'trail', type: 'float', min: 0, max: 0.99, default: 0.88 }, // what one 60 Hz frame keeps of the last
    { name: 'yaw', type: 'float', min: 0, max: 1, default: 0 }, // the camera's orbit about the disc's normal, turns
    { name: 'pitch', type: 'float', min: 0, max: 0.5, default: 0.17 }, // the camera's elevation above the disc, turns
    { name: 'nova', type: 'event' }, // the drop: the blast out and the re-form (novaPull's envelope)
  ],
  bind: {
    spin: { source: 'reese', amount: 1, attack: 0.05, release: 0.4, min: 0.4, max: 2.5 }, // Auto-style's one: the reese spins the disc up
    pull: { source: 'sub', amount: 1, attack: 0.05, release: 0.3, min: 0.6, max: 0.25 }, // the sub breathes it (min > max inverts: the pull eases)
    burst: { source: 'kick', amount: 1, attack: 0, release: 0.15, min: 0, max: 1.5 }, // a kick punches the disc outward
    hue: { source: 'snare', amount: 1, attack: 0, release: 0.3, min: 0, max: 0.25 }, // a snare walks the colour
    sparkle: { source: 'hats', amount: 1, attack: 0, release: 0.08, min: 0, max: 0.5 }, // hats twinkle the points
    trail: { source: 'build', amount: 1, attack: 1, release: 2, min: 0.88, max: 0.97 }, // a build lengthens the trails
    nova: { source: 'drop', amount: 1, attack: 0, release: 0.1, min: 0, max: 1 }, // the drop: the blast out and the re-form
    yaw: { source: 'lfo', shape: 'saw', rate: 0.03, amount: 1, attack: 0, release: 0, min: 0, max: 1 }, // one orbit per 33 s (the saw wraps: continuous)
  },
  create(gl, size) {
    const prog = (program ??= createProgramInfo(gl, [VS, FS], { transformFeedbackVaryings: ['stateOut'] }))
    const composite = fullscreenProgram(COMPOSITE_FS)
    const bloom = createBloom(gl)
    const trail = renderTarget(true, true) // persistent: the trails survive a governor step
    const pts = tfPoints(gl, prog, vortexN(size)) // zero states: the first frame seeds every point inside the disc
    let held = false
    let novaT: number | null = null // the nova edge's draw time (the layer clock); null: no drop yet
    let edges = 0, age = Infinity, nova = 1
    return {
      novaState: () => ({ edges, age, nova }), // the bench reads the nova clock's CPU truth (wireform's morphState precedent)
      draw(f, v) {
        const edge = !!v.nova && !held // the rising edge, as the swarm's spawn
        held = !!v.nova
        if (edge) { novaT = f.time; edges++ }
        age = novaT === null ? Infinity : f.time - novaT
        nova = novaPull(age)
        const dt = Math.min(f.dt, 0.05)
        const keep = trailKeep(v.trail as number, dt)
        const out = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null // the engine's target
        trail.fit(f.width, f.height)
        bindFramebufferInfo(gl, trail)
        gl.viewport(0, 0, f.width, f.height) // the points at the trail's px (the convention: explicit)
        gl.enable(gl.BLEND)
        gl.blendFunc(gl.ZERO, gl.SRC_ALPHA) // dst × keep: the engine's post-pass fade, no texture read
        tint({ uColor: [0, 0, 0, keep] })
        gl.blendFunc(gl.ONE, gl.ONE)
        pts.run({
          uDt: dt, uTime: f.time,
          uVP: orbitVP((v.yaw as number) * TAU, (v.pitch as number) * TAU, f.width / f.height),
          uSpin: v.spin, uPull: v.pull, uNova: nova, uBurst: v.burst, uHue: v.hue, uSparkle: v.sparkle,
          uPx: f.height / REF_H, uSize: SIZE,
        })
        gl.disable(gl.BLEND)
        const lit = bloom.apply(trail.attachments[0], f.width, f.height, GLOW)
        gl.bindFramebuffer(gl.FRAMEBUFFER, out)
        gl.viewport(0, 0, f.width, f.height)
        composite({ uSrc: lit, uRes: [f.width, f.height] })
      },
      dispose() {
        bloom.dispose()
        gl.deleteFramebuffer(trail.framebuffer)
        gl.deleteTexture(trail.attachments[0])
        pts.dispose()
      },
    }
  },
}
