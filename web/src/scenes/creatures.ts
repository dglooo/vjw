// Creatures (plan_scenes_wave3.md S0.2, picks P2/P3/P5): N GPU points assemble into an animal. Each point owns sample
// i of every animal of its set (shapes.ts: the same mass quantile in each, so the morph is index-stable) and is sprung
// to it — scatter's backward-Euler spring, the home read from the animal's texture. A build loosens the shape into a
// drifting cloud, the drop slams the cloud into the set's next animal, a kick sends a ring through it. The draw is
// the swarm's: additive sprites into a persistent half-float trail, the shared bloom, particles' tone map.
// S0.3 (pick P4): `depth` gives the animal its relief (shapes.ts's z) and `yaw` orbits gl/view.ts's camera around
// it. Render only: the physics stays in the object plane, and at depth 0, yaw 0 the frame is the 2D scene.
// Look: TD SN/POP sprinklePOP ex1 (points in a shape), phaserPOP ex1 (a staggered point-set transition), particlePOP
// ex3 (image-weighted birth) (studied, rewritten). No third-party code beyond points.ts's NOISE (webgl-noise, MIT).
import { bindFramebufferInfo, createProgramInfo, createTexture, type ProgramInfo } from 'twgl.js'
import { createBloom } from '../gl/bloom'
import { fullscreenProgram, renderTarget, tint } from '../gl/engine'
import type { NativeDef } from '../gl/scene'
import { FOCAL, orbitVP } from '../gl/view'
import { SETS } from './animals'
import { COMPOSITE_FS } from './particles'
import { HASH, NOISE, tfPoints } from './points'
import { trailKeep } from './scope'
import { morphStep, shapePoints, type Morph } from './shapes'

const N = 65536 // knob: point count: P5's fallback. The S0.2 gate read 5.51 ms billed p95 at 131072 (> 4.5), 4.46 at this (≤ 5)
/** The point count: N on the stage, N/10 for a `size` (a tile, 2b S3.2). */
export const creaturesN = (size?: readonly [number, number]) => (size ? Math.round(N / 10) : N)
const COLS = 256 // an animal's texture is COLS × ⌈n / COLS⌉, one RGBA32F texel per point
const REF_N = 131072 // the look's reference: `size` is px at REF_H with REF_N points; the deposit scales to any
const REF_H = 1117 //   count and frame height, so a tile, a governor step and a lower N keep the brightness
const SPRING = 32 // knob: the pull home, ω rad/s (each point 0.7–1.3× its own): the slam reads at 0.2 s and has landed by ≈ 0.45 s
const DAMP = 0.5 // knob: the damping ratio ζ (scatter's): one small overshoot
const C_SCALE = 1.5 // knob: the cloud's flow cells per scene unit
const C_DRIFT = 0.22 // knob: its drift, cells/s
const C_DUST = 0.07 // knob: each point's own share of `scatter` (the rest follows the flow: wisps, not noise)
const C_LIT = 4 // knob: a point this many × brighter per scene unit off its home (past 0.1): the thinned cloud and the slam's flight keep their light
const W_SCALE = 0.9 // knob: the swirl's cells per scene unit: ≈ 1.5 across the animal, so it sways and its edges stay straight
const W_DRIFT = 0.6 // knob: its drift, cells/s
const W_CURL = 0.035 // knob: the curl's gain: `swirl` 0.25 stirs the outline by ≈ 30 px and the animal still reads
const RING = 1.25 // knob: the pulse ring's radius at pulse 0, scene units: past every point of a ±0.8 box
const RING_W = 0.09 // knob: its width
const PUSH = 0.07 // knob: how far it pushes the points it crosses (render only: no spring lag, no wake)
const LOOSE = 0.2 // knob: `scatter` above this pauses the bar clock: the animal a build dissolved is the one the drop replaces
const EDGE = 3.2 // knob: an outline / detail point's brightness, × a body point's
const GAIN = 1.5 // knob: the deposit of a lum-1 point × its size, at REF_N and REF_H
const GLOW = 3 // knob: the bloom strength

// Scene units (y −1..1, x by the aspect). One pass integrates (transform feedback) and draws, as the swarm's.
const VS = `#version 300 es
in vec4 state; // pos.xy, vel.xy
out vec4 stateOut;
out vec3 vColor;
uniform sampler2D uA, uB; // the animal morphed from / to, a texel per point: home.xy, relief z (× uDepth), edge
uniform mat4 uVP; // gl/view.ts's orbit camera: at yaw 0 the z = 0 plane is the 2D scene
uniform float uN, uMix, uDt, uTime, uPx, uGain, uSize, uScatter, uSwirl, uPulse, uHue, uSat, uSparkle, uDepth;
${NOISE}${HASH}
const float FOCAL = ${FOCAL.toFixed(9)};
vec3 hsv(float h, float s) { return mix(vec3(1.0), clamp(abs(fract(h + vec3(0.0, 2.0, 1.0) / 3.0) * 6.0 - 3.0) - 1.0, 0.0, 1.0), s); }
void main() {
  uint id = uint(gl_VertexID);
  ivec2 at = ivec2(gl_VertexID % ${COLS}, gl_VertexID / ${COLS});
  float u = float(gl_VertexID) / uN; // its place in every animal: the mass quantile, top to bottom
  float r1 = hash(id), r2 = hash(id + 0x9e3779b9u), r3 = hash(id + 0x7f4a7c15u);
  vec4 shape = u < uMix ? texelFetch(uB, at, 0) : texelFetch(uA, at, 0); // the staggered switch; the spring eases it
  vec2 home = shape.xy;
  vec2 p = state == vec4(0.0) ? home : state.xy, v = state.zw; // new: at home, at rest (a tile's still is the animal)
  // The cloud: scatter's drifting two-channel field (neighbours drift together and the sheet folds into wisps) plus
  // each point's own slowly circling offset, so the folds read as dust and the silhouette is gone.
  vec3 q = vec3(home * ${C_SCALE.toFixed(2)}, uTime * ${C_DRIFT.toFixed(2)}), g;
  vec2 flow = vec2(snoise(q, g), snoise(q + vec3(31.4, -17.2, 0.0), g)) * vec2(1.3, 0.8); // wider than tall, as the stage
  float a = 6.2831853 * r1 + uTime * (r3 - 0.5) * 1.5;
  vec2 own = vec2(cos(a), sin(a)) * (0.3 + r2);
  vec2 target = home + mix(flow, own, ${C_DUST.toFixed(2)}) * uScatter + own * 0.0025; // + a 1-px orbit: dust at rest still floats
  // The swirl: the curl of a wide, faster field (along its level sets), so the shape stirs without tearing.
  snoise(vec3(home * ${W_SCALE.toFixed(2)} + 5.0, uTime * ${W_DRIFT.toFixed(2)}), g);
  target += vec2(g.y, -g.x) * uSwirl * ${W_CURL.toFixed(2)};
  // scatter's damped spring, backward Euler: stable at any ω and frame time.
  float w = ${SPRING.toFixed(1)} * (0.7 + 0.6 * r2), k = w * w, c = 2.0 * ${DAMP.toFixed(2)} * w;
  v = (v + uDt * k * (target - p)) / (1.0 + uDt * c + uDt * uDt * k);
  p += v * uDt;
  stateOut = vec4(p, v);
  // The depth, render only: the animal's relief once the point has landed (within 0.3 of its target), and while it
  // flies its own signed share of the way still to go, so the slam is a volume closing in on the animal.
  float off = length(p - target);
  float z = uDepth * (shape.z * (1.0 - min(off / 0.3, 1.0)) + (2.0 * r1 - 1.0) * off); // 2 r1 − 1: the side shapes.ts gave its dust
  // Mostly dim dust with a few bright, whiter sparks; the outline and the detail lines burn brighter.
  float spark = r3 * r3 * r3 * r3;
  float lum = (0.08 + 1.6 * spark) * mix(1.0, ${EDGE.toFixed(2)}, shape.w) * (1.0 + ${C_LIT.toFixed(1)} * max(0.0, length(p - home) - 0.1));
  float twinkle = 1.0 + uSparkle * (4.0 * hash(id ^ mixu(floatBitsToUint(uTime))) - 2.0); // hats: zero-mean, per point
  // The pulse: a ring that runs from the centre out as the kick's envelope falls and pushes what it crosses outward.
  // The points bunch on its front and thin behind it: a crest of light, the frame no brighter.
  float d = length(p), band = (d - (1.0 - uPulse) * ${RING.toFixed(2)}) / ${RING_W.toFixed(2)};
  p += p / max(d, 1e-4) * exp(-band * band) * smoothstep(0.0, 0.15, uPulse) * smoothstep(0.0, 0.25, d) * ${PUSH.toFixed(2)}; // no hole punched at the centre
  gl_Position = uVP * vec4(p, z, 1.0);
  float near = FOCAL / max(gl_Position.w, FOCAL / 3.0); // the perspective: 1 on the z = 0 plane; a point nearer the eye is bigger and brighter (≤ 3×: a fly-by is no flash)
  float s = uSize * uPx * (0.6 + 0.8 * r1) * near, ps = max(s, 1.0); // px; under 1 px the point stays 1 px and dims instead
  vColor = hsv(uHue + 0.15 * u - 0.03 * shape.w, uSat * (1.0 - 0.3 * spark)) * lum * twinkle * near * uGain / uSize * (s * s) / (ps * ps); // ÷ size: a swell reads thicker, not size² brighter
  gl_PointSize = ps;
}`
// A soft round sprite (particles.ts's): the falloff anti-aliases a 2-px point, so a slow drift does not shimmer.
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
const texes = new Map<string, WebGLTexture>() // an animal's points at a count, for the page's life: every instance shares them
function shapeTex(gl: WebGL2RenderingContext, id: string, n: number) {
  const key = `${id}:${n}`
  let tex = texes.get(key)
  if (!tex) {
    const rows = Math.ceil(n / COLS)
    const data = new Float32Array(COLS * rows * 4) // the last row's tail stays 0: no point reads it
    data.set(shapePoints(id, n))
    tex = createTexture(gl, { src: data, width: COLS, height: rows, internalFormat: gl.RGBA32F, minMag: gl.NEAREST, wrap: gl.CLAMP_TO_EDGE, auto: false })
    texes.set(key, tex)
  }
  return tex
}

/** Bindings: plan_scenes_wave3.md § Scenes row 1 (Spirit, the default set), all ⚠️ assumptions until the CP0 demo;
 *  the bass class binds reese (swirl; Auto-style maps it to wobble in Dubstep). trail and hold stay static. No input
 *  brightens the frame on a hit: the ring only moves points, the sparkle is zero-mean. */
export const creatures: NativeDef = {
  id: 'native/creatures', name: 'Creatures', kind: 'generator', category: 'geometry', tags: ['particles', 'animals'], credit: 'VeeJay Wizard', inputs: [
    { name: 'set', type: 'long', values: SETS.map((_, i) => i), labels: SETS.map((s) => s.name), default: 0 }, // the animals it morphs through
    { name: 'size', type: 'float', min: 1, max: 8, default: 3 }, // px on a 1117-px-high stage
    { name: 'trail', type: 'float', min: 0, max: 0.99, default: 0.5 }, // what one 60 Hz frame keeps of the last
    { name: 'scatter', type: 'float', min: 0, max: 1.5, default: 0 }, // the cloud: how far the points drift off the animal, scene units
    { name: 'swirl', type: 'float', min: 0, max: 0.5, default: 0.02 }, // the curl that sways the shape: 0.25 moves its outline by ≈ 30 px
    { name: 'pulse', type: 'float', min: 0, max: 1, default: 0 }, // the ring: 1 at the centre, 0 past the rim (gone)
    { name: 'hue', type: 'float', min: 0, max: 1, default: 0.52 }, // the top's hue, turns; the bottom's is +0.15
    { name: 'sat', type: 'float', min: 0, max: 1, default: 0.92 },
    { name: 'sparkle', type: 'float', min: 0, max: 0.5, default: 0 }, // per-point twinkle, zero-mean
    { name: 'depth', type: 'float', min: 0, max: 0.6, default: 0 }, // the animal's thickness, scene units each way: 0 = flat, the 2D scene
    { name: 'yaw', type: 'float', min: -1, max: 1, default: 0 }, // the camera's orbit around it, turns
    { name: 'hold', type: 'float', min: 0, max: 64, default: 32 }, // bars an animal holds before a calm morph; 0 = only `next` switches
    { name: 'next', type: 'event' }, // slam into the set's next animal
  ],
  bind: {
    scatter: { source: 'build', amount: 1, attack: 1, release: 0.15, min: 0, max: 0.9 }, // a build loosens the animal into a drifting cloud
    next: { source: 'drop', amount: 1, attack: 0, release: 0.1, min: 0, max: 1 }, // the drop slams the cloud into the next animal
    pulse: { source: 'kick', amount: 1, attack: 0, release: 0.25, min: 0, max: 1 }, // a kick sends a ring through it
    hue: { source: 'snare', amount: 1, attack: 0, release: 0.3, min: 0.52, max: 0.72 }, // a snare turns the colour
    swirl: { source: 'reese', amount: 1, attack: 0.05, release: 0.4, min: 0.02, max: 0.25 }, // the bass stirs the shape
    size: { source: 'sub', amount: 1, attack: 0.05, release: 0.3, min: 2.5, max: 4.5 }, // the sub swells the points
    sparkle: { source: 'hats', amount: 1, attack: 0, release: 0.08, min: 0, max: 0.5 }, // hats twinkle them
  },
  create(gl, size) {
    const prog = (program ??= createProgramInfo(gl, [VS, FS], { transformFeedbackVaryings: ['stateOut'] }))
    const composite = fullscreenProgram(COMPOSITE_FS)
    const bloom = createBloom(gl)
    const trail = renderTarget(true, true) // persistent: the trails survive a governor step
    const n = creaturesN(size)
    const pts = tfPoints(gl, prog, n) // zero states: the first frame puts every point on its animal
    // The stage's animals, rasterised and uploaded here: Start's warm-up pays for them, not the first cut. A tile
    // takes its own (smaller) ones at its first draw.
    if (!size) for (const s of SETS) for (const id of s.ids) shapeTex(gl, id, n)
    let morph: Morph = { from: 0, to: 0, mix: 1, slot: NaN, dur: 1 }
    let held = false
    return {
      draw(f, v) {
        const next = !!v.next && !held // the rising edge, as the swarm's spawn
        held = !!v.next
        const dt = Math.min(f.dt, 0.05)
        const ids = (SETS[v.set as number] ?? SETS[0]).ids
        // A loose cloud pauses the bar clock (hold 0): a calm morph nobody sees would turn the drop's animal back.
        morph = morphStep(morph, ids.length, next, f.sync.bar, (v.scatter as number) > LOOSE ? 0 : (v.hold as number), dt)
        const keep = trailKeep(v.trail as number, dt)
        const out = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null // the engine's target
        trail.fit(f.width, f.height)
        bindFramebufferInfo(gl, trail)
        gl.viewport(0, 0, f.width, f.height) // the points at the trail's px (the default viewport is the canvas')
        gl.enable(gl.BLEND)
        gl.blendFunc(gl.ZERO, gl.SRC_ALPHA) // dst × keep: the engine's post-pass fade, no texture read
        tint({ uColor: [0, 0, 0, keep] })
        gl.blendFunc(gl.ONE, gl.ONE)
        pts.run({
          uA: shapeTex(gl, ids[morph.from % ids.length], n), uB: shapeTex(gl, ids[morph.to % ids.length], n), uN: n, uMix: morph.mix,
          uDt: dt, uTime: f.time, uVP: orbitVP((v.yaw as number) * 2 * Math.PI, 0, f.width / f.height), uPx: f.height / REF_H,
          uGain: (GAIN * (1 - keep) * REF_N) / n, // × (1 − keep): a point at rest is as bright at any `trail`, a moving one smears
          uSize: v.size, uScatter: v.scatter, uSwirl: v.swirl, uPulse: v.pulse, uHue: v.hue, uSat: v.sat, uSparkle: v.sparkle, uDepth: v.depth,
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
