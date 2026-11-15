// Orb (plan_scenes_wave3.md S3.3, CP3): TD's displaced point sphere — N static unit vectors (the Fibonacci
// lattice, orbPoints) with no TF state: one static buffer, one drawArrays, every displacement in the VS.
// The sub swells the surface (amp, the build's freq roughens it), each kick sweeps a shock shell pole to
// pole as its envelope decays (spike), the reese corkscrews the sphere about y by latitude (twist), and the
// drop's shatter edge runs a CPU age clock (shatterEnv, the novaState-style seam): the radius blows out
// per-point and falls back to the sphere. Camera = orbitVP (the yaw's saw orbits, one turn per 20 s); size
// and brightness × FOCAL/w, so the far side of the cloud is dimmer (no depth buffer, the wireform's
// eye-space cue). Draw: additive round sprites into a short persistent trail, the shared bloom, particles'
// tone map (the vortex pipeline, without tfPoints). No input brightens the frame on a hit: the shell and
// the shatter move points, the sparkle is zero-mean, the deposit is ÷ size.
// Look: TD SN/POP spherePOP ex1 (point sphere) + fieldPOP ex1 (points moved by a shape-distance weight) +
// POPs/pointRender (studied, rewritten). No third-party code beyond points.ts's NOISE/HASH (webgl-noise,
// MIT) and twgl's m4.
import { bindFramebufferInfo, createProgramInfo, setUniforms, type ProgramInfo } from 'twgl.js'
import { createBloom } from '../gl/bloom'
import { fullscreenProgram, renderTarget, tint } from '../gl/engine'
import type { NativeDef } from '../gl/scene'
import { FOCAL, orbitVP } from '../gl/view'
import { COMPOSITE_FS } from './particles'
import { HASH, NOISE } from './points'
import { trailKeep } from './scope'

const N = 60000 // knob: point count (row 10: a 60k-point sphere; the lever if it bills over is 30000)
/** The point count: N on the stage, N/10 for a `size` (a tile, the ×0.1 rule). */
export const orbN = (size?: readonly [number, number]) => (size ? 6000 : N)
const R0 = 0.55 // the plan's rest radius, scene units
const US = 0.5 // knob: the row's spike peak: the shell's sweep normalizes to it (spike = US → one pole, 0 → the other)
const SW = 0.25 // knob: the shell band's half-width in latitude
const TW = 2 // knob: rad of corkscrew per unit of latitude at twist 1 (the row's 0→1 reads as ≈ 230° pole to pole)
const PITCH = 0.1 // knob: the camera's static elevation, turns (the contract's inputs have no pitch)
const SIZE = 2.2 // knob: px on a REF_H stage (the vortex/wireform class; no `size` input in the contract)
const TRAIL = 0.6 // knob: what one 60 Hz frame keeps — the plan's "short trail" (vortex's bind is .88→.97); at
// .75 the shatter's fall back smeared over the whole frame in the low-fps harness and the rebuild never read
const GAIN = 0.5 // knob: one point's deposit ÷ its size (60k points cover the sphere ≈ 4× over; the settled
// ball reads lit, and the shatter's ≈ 1.6× area dilution stays at ≈ the settled brightness — no hit flash)
const GLOW = 3 // knob: the bloom strength (the swarm's / creatures')
const REF_H = 1117 // the point size's reference height (creatures')
const TAU = Math.PI * 2
const GA = Math.PI * (3 - Math.sqrt(5)) // the golden angle

// The shatter's envelope, the novaState-style CPU seam (the plan: a rising edge → an age clock).
const T = 2 // knob: s (layer clock): the blow out and the fall back (the drop still is at the peak ≈ +.5 s,
// the rebuild still ≈ +1.6 s is the sphere back — the shatter and the re-form must read as two pictures;
// T 3 put the rebuild at 92 % of the peak: no story)
const PEAK = 0.2 // knob: the shatter's peak: the mean blow ≈ +15 %; the per-point mix(0.3, 1.5, hash) scatters
// the debris to +30 % — a broken core with a sparse shell. At 0.3–0.6 the cloud left the frame and the drop
// read as a darkening, not a shatter (the vortex BURST_K hollow-ring lesson)
const ss = (a: number, b: number, x: number) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t) }

/** The shatter's per-point radius share `age` s after a drop (PURE, the novaState-style seam): a blow out
 *  (peak PEAK at u .2–.45), then exactly 0. age = Infinity: no drop yet. */
export function shatterEnv(age: number): number {
  if (!Number.isFinite(age) || age < 0) return 0
  const u = age / T
  if (u >= 1) return 0
  return PEAK * ss(0, 0.2, u) * (1 - ss(0.45, 1, u))
}

/** n×3 unit vectors, a Fibonacci lattice (PURE, the CP3 contract): y walks pole to pole, the golden angle
 *  spins each ring, so the points spread evenly over the sphere. */
export function orbPoints(n: number): Float32Array {
  const out = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const a = GA * i
    out[i * 3] = r * Math.cos(a)
    out[i * 3 + 1] = y
    out[i * 3 + 2] = r * Math.sin(a)
  }
  return out
}

// aPos: the static unit vector. Everything else is a uniform; the displacement is render-only (no TF state).
const VS = `#version 300 es
in vec3 aPos;
out vec3 vColor;
uniform mat4 uVP;
uniform float uAmp, uSpike, uTwist, uFreq, uHue, uSparkle, uShat, uTime, uPx, uSize;
${NOISE}${HASH}
const float FOCAL = ${FOCAL.toFixed(9)};
const float R0 = ${R0.toFixed(2)}, US = ${US.toFixed(2)}, SW = ${SW.toFixed(2)}, TW = ${TW.toFixed(1)};
vec3 hsv(float h, float s) { return mix(vec3(1.0), clamp(abs(fract(h + vec3(0.0, 2.0, 1.0) / 3.0) * 6.0 - 3.0) - 1.0, 0.0, 1.0), s); }
void main() {
  uint id = uint(gl_VertexID);
  vec3 n = aPos;
  vec3 g;
  float swell = snoise(n * uFreq + vec3(0.0, 0.0, uTime * 0.25), g); // the sub's swell; the build's freq roughens it
  float yb = 1.0 - 2.0 * clamp(uSpike / US, 0.0, 1.0); // the kick's decay runs the band pole to pole
  float d = (n.y - yb) / SW;
  // The plan's radius: 0.55·(1 + amp·snoise + spike·shell), × the shatter's per-point blow out (its own
  // hash: the cloud scatters, and as shatterEnv falls the points ride back to the sphere).
  float rad = R0 * (1.0 + uAmp * swell + uSpike * exp(-d * d)) * (1.0 + uShat * mix(0.3, 1.5, hash(id + 0x85ebca6bu)));
  float t = TW * uTwist * n.y, c = cos(t), sn = sin(t); // the reese's corkscrew about y, ∝ latitude
  vec3 p = vec3(c * n.x - sn * n.z, n.y, sn * n.x + c * n.z) * rad;
  vec4 pos = uVP * vec4(p, 1.0);
  float near = FOCAL / max(pos.w, FOCAL / 2.0); // the 3D cue: the near side bigger and brighter (≤ 2×, no flash)
  float tw = 1.0 + uSparkle * (4.0 * hash(id ^ mixu(floatBitsToUint(uTime))) - 2.0); // hats: zero-mean, per point
  float sz = uSize * uPx * (0.7 + 0.6 * hash(id + 1u)) * near, ps = max(sz, 1.0);
  vColor = hsv(uHue + 0.06 * n.y, 0.8) * tw * near * ${GAIN.toFixed(2)} / uSize * (sz * sz) / (ps * ps); // ÷ size
  gl_PointSize = ps;
  gl_Position = pos;
}`
// The soft round sprite (creatures'/vortex's): the falloff anti-aliases a 2-px point, so the slow orbit does not shimmer.
const FS = `#version 300 es
precision highp float;
in vec3 vColor;
out vec4 outColor;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float a = max(0.0, 1.0 - dot(q, q));
  outColor = vec4(vColor * a * a, 1.0);
}`

let program: ProgramInfo | undefined // as vortex's: compiled once and shared

/** The bindings (plan § Scenes row 10, all ⚠️ assumptions until the CP3 demo): the sub swells the sphere
 *  (amp), each kick runs a shock shell across it (spike), the reese corkscrews it (twist, Auto-style's one —
 *  wobble under Dubstep), the build roughens the swell (freq), the snare walks the colour, the hats twinkle,
 *  the drop shatters and rebuilds (shatter, the CPU age clock), and the yaw's saw orbits (one turn per 20 s;
 *  the saw wraps, so the phase is continuous). No input brightens the frame on a hit: the shell and the
 *  shatter move points, the sparkle is zero-mean. */
export const orb: NativeDef = {
  id: 'native/orb', name: 'Orb', kind: 'generator', category: 'geometry', tags: ['particles', 'sphere', '3d'], credit: 'VeeJay Wizard', inputs: [
    { name: 'amp', type: 'float', min: 0, max: 0.5, default: 0.08 }, // the sub's swell, the noise's radius share
    { name: 'spike', type: 'float', min: 0, max: 1, default: 0 }, // the kick's shock shell
    { name: 'twist', type: 'float', min: 0, max: 2, default: 0 }, // the corkscrew about y, rad at the poles
    { name: 'freq', type: 'float', min: 0, max: 8, default: 1.5 }, // the swell's roughening
    { name: 'hue', type: 'float', min: 0, max: 1, default: 0.58 }, // the base hue, turns
    { name: 'sparkle', type: 'float', min: 0, max: 0.5, default: 0 }, // per-point twinkle, zero-mean
    { name: 'yaw', type: 'float', min: 0, max: 1, default: 0 }, // the camera's orbit about the sphere, turns
    { name: 'shatter', type: 'event' }, // the drop: the blow out and the fall back (shatterEnv's envelope)
  ],
  bind: {
    amp: { source: 'sub', amount: 1, attack: 0.05, release: 0.3, min: 0.08, max: 0.35 }, // the sub swells and roughens the sphere
    spike: { source: 'kick', amount: 1, attack: 0, release: 0.2, min: 0, max: 0.5 }, // each kick runs a shock shell across it
    twist: { source: 'reese', amount: 1, attack: 0.05, release: 0.4, min: 0, max: 1 }, // Auto-style's one: the reese corkscrews it
    freq: { source: 'build', amount: 1, attack: 1, release: 0.3, min: 1.5, max: 5 }, // the build roughens the swell
    hue: { source: 'snare', amount: 1, attack: 0, release: 0.3, min: 0.58, max: 0.8 }, // a snare walks the colour
    sparkle: { source: 'hats', amount: 1, attack: 0, release: 0.08, min: 0, max: 0.5 }, // hats twinkle the points
    shatter: { source: 'drop', amount: 1, attack: 0, release: 0.1, min: 0, max: 1 }, // the drop shatters and rebuilds it
    yaw: { source: 'lfo', shape: 'saw', rate: 0.05, amount: 1, attack: 0, release: 0, min: 0, max: 1 }, // one orbit per 20 s (the saw wraps: continuous)
  },
  create(gl, size) {
    const prog = (program ??= createProgramInfo(gl, [VS, FS], { attribLocations: { aPos: 0 } }))
    const composite = fullscreenProgram(COMPOSITE_FS)
    const bloom = createBloom(gl)
    const trail = renderTarget(true, true) // persistent: the short trail survives a governor step
    const n = orbN(size)
    const vao = gl.createVertexArray()
    const buf = gl.createBuffer()
    gl.bindVertexArray(vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, orbPoints(n), gl.STATIC_DRAW) // static: no TF state, no per-frame refill
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0)
    gl.bindVertexArray(null)
    let held = false // the `shatter` rising edge, as the swarm's spawn
    let shatT: number | null = null // the shatter edge's draw time (the layer clock); null: no drop yet
    let edges = 0, age = Infinity, shat = 0
    return {
      shatterState: () => ({ edges, age, shat }), // the bench reads the shatter clock's CPU truth (novaState's precedent)
      draw(f, v) {
        const edge = !!v.shatter && !held
        held = !!v.shatter
        if (edge) { shatT = f.time; edges++ }
        age = shatT === null ? Infinity : f.time - shatT
        shat = shatterEnv(age)
        const dt = Math.min(f.dt, 0.05)
        const keep = trailKeep(TRAIL, dt)
        const out = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null // the engine's target
        trail.fit(f.width, f.height)
        bindFramebufferInfo(gl, trail)
        gl.viewport(0, 0, f.width, f.height) // the points at the trail's px (the convention: explicit)
        gl.enable(gl.BLEND)
        gl.blendFunc(gl.ZERO, gl.SRC_ALPHA) // dst × keep: the engine's post-pass fade, no texture read
        tint({ uColor: [0, 0, 0, keep] })
        gl.blendFunc(gl.ONE, gl.ONE)
        gl.bindVertexArray(vao)
        gl.useProgram(prog.program)
        setUniforms(prog, {
          uVP: orbitVP((v.yaw as number) * TAU, PITCH * TAU, f.width / f.height),
          uAmp: v.amp as number, uSpike: v.spike as number, uTwist: v.twist as number,
          uFreq: v.freq as number, uHue: v.hue as number, uSparkle: v.sparkle as number,
          uShat: shat, uTime: f.time, uPx: f.height / REF_H, uSize: SIZE,
        })
        gl.drawArrays(gl.POINTS, 0, n)
        gl.bindVertexArray(null) // the fullscreen passes set their own on the default VAO
        gl.disable(gl.BLEND) // as the swarm: no state into the next node
        const lit = bloom.apply(trail.attachments[0], f.width, f.height, GLOW)
        gl.bindFramebuffer(gl.FRAMEBUFFER, out)
        gl.viewport(0, 0, f.width, f.height)
        composite({ uSrc: lit, uRes: [f.width, f.height] })
      },
      dispose() {
        bloom.dispose()
        gl.deleteFramebuffer(trail.framebuffer)
        gl.deleteTexture(trail.attachments[0])
        gl.deleteBuffer(buf)
        gl.deleteVertexArray(vao)
      },
    }
  },
}
