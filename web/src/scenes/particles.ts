// Particles: `count` GPU points (65 536 by default) in a swirling disc. Onsets burst them outward, bass breathes the
// disc and the point size, the (c) beat swells the disc and the points, a spring pulls each point back to its rest
// radius, and points flung off-screen respawn at the centre.
// Light on a hit only through ⚡ `hit` (flashGate <= 3/s, WCAG 2.3.1; I-FL1): a kick heats the points through the bloom,
// the burst's fast ones most; the calm swirl stays cool blue. The size breathing adds no light (a sprite's colour / m²,
// m = its audio size factor): before, bass, beat and the onsets' radial speed stepped the frame-mean luma up to 12/s.
// N*_shipped = 49 152 points at res .5 (GPU3D Bench N*, plan_gpu3d S1.5, LR-2). A `count` above it is L-class: a new
// built-in that sets one is never starred. Billed p95 as shipped + own/flash, alone, slow class (M4, 1728×1118): 49 152
// at res .5 4.7 ms; 65 536 5.3 ms at res .5 (5.9 at res 1), so builtin:particles (starred before GPU3D, kept as is: R5)
// overshoots the 5.0 budget by ~.3 ms; 1 048 576 14.9 ms at res 1 (22.1 at res .5).
//
// Adapted from twgl.js examples (MIT, https://github.com/greggman/twgl.js), examples/transform-feedback-particles-va.html
// by Gregg Tavares: ping-pong vertex arrays + transform feedback objects, and the update shader also rasterises the
// points in the same pass. Original header: "twgl.js Copyright (c) 2015, Gregg Tavares All Rights Reserved.
// Available via the MIT license. see: http://github.com/greggman/twgl.js for details"
import {
  bindFramebufferInfo, createBufferInfoFromArrays, createProgramInfo, createTexture, createTransformFeedback,
  createVertexArrayInfo, setUniforms, type ProgramInfo,
} from 'twgl.js'
import { pulse } from '../audio/sync'
import type { Input } from '../fx/types'
import { createBloom } from '../gl/bloom'
import { fullscreenProgram, renderTarget } from '../gl/engine'
import { glState, PASS_LIST, restore } from '../gl/glstate'
import type { NativeDef } from '../gl/scene'
import type { SplatPath } from '../gpu/splat'
import { noteWebgpuMs } from '../quality'

export const COUNT_DEFAULT = 65536, COUNT_MAX = 1048576, TILE_MAX = 4096
/** Points drawn (GPU3D N1: the value as is, at any layer res and governor scale). NaN -> COUNT_DEFAULT; else Math.round,
 *  clamp 0..COUNT_MAX; tile -> min(n, TILE_MAX). Pure. */
export function particleCount(count: number, tile: boolean): number {
  const n = Number.isNaN(count) ? COUNT_DEFAULT : Math.min(COUNT_MAX, Math.max(0, Math.round(count)))
  return tile ? Math.min(n, TILE_MAX) : n
}
/** max(capacity, next power of two >= n). Pure. Never shrinks. */
export function grownCapacity(capacity: number, n: number): number {
  return Math.max(capacity, 2 ** Math.ceil(Math.log2(n))) // n 0: 2 ** -Infinity = 0
}
// Points from which the WebGPU splat path draws (GPU3D CP2). S2.4 row B: the smallest swept N (262 144) already beats TF
// at the demo's res .5, splat billed 5.4-8.2 ms against TF 11.8-22.0 at every N in {256 K, 512 K, 1 M} x res {1, .5}.
export const SPLAT_MIN = 262144
// GPU3D N4 (lead ruling, S2.2 notes 2): Chrome's canvas snapshot at the texImage2D upload, ms. It runs on the WebGPU queue
// after the splat's last timestamp, so the governor's term adds it as a constant until it can be timed per frame. S2.4's
// post-copy marker, 1 M alone: p95 1.05 at res .5 (the demo's), 1.8-2.0 at res 1 (S1-W read 0.35 at res 1).
const SNAPSHOT_MS = 1.05
/** GPU3D CP2 path rule: the splat path when its device is ready and n >= SPLAT_MIN, else TF. A tile (n <= TILE_MAX)
 *  stays on TF. Pure. */
export function shouldSplat(n: number, deviceReady: boolean): boolean {
  return deviceReady && n >= SPLAT_MIN
}

/** Look knobs, read every frame; bindings and the panel drive them through `values`. */
export const inputs: Input[] = [
  { name: 'burst', type: 'float', min: 0, max: 6, default: 2.5 },
  { name: 'swirl', type: 'float', min: 0, max: 5, default: 1.5 },
  { name: 'size', type: 'float', min: 1, max: 16, default: 6 },
  { name: 'glow', type: 'float', min: 0, max: 8, default: 2 },
  { name: 'count', type: 'float', min: 0, max: COUNT_MAX, default: COUNT_DEFAULT }, // points drawn: particleCount()
  { name: 'hit', type: 'float', min: 0, max: 1, default: 0 }, // ⚡ the kick's heat: the one input that adds light on a hit
]
const SPRING = 40 // knob: 1/s², pull back to the rest radius: a burst returns within ~¼ s, and frequent onsets
// (≈4/s with hats) only push the disc out by their mean impulse / SPRING
const DRAG = 3 // knob: 1/s, velocity damping (bouncy, settles in ~1 s)
// knob: s, the heat's rise time constant: a frame takes 1 - e^(-dt/HOT_RISE) of the step (34 % at 60 fps), so an allowed
// kick's full heat step (≈ +.11 frame-mean luma at 65 536 points) never makes a luma step > .10 in one frame (I-FL1)
const HOT_RISE = 0.04
/** The heat drawn this frame: rises toward the gated `hit` with HOT_RISE, falls with it at once (its binding's release
 *  smooths the fall). Pure. */
export const heatStep = (hot: number, hit: number, dt: number) => (hit > hot ? hot + (hit - hot) * (1 - Math.exp(-dt / HOT_RISE)) : hit)
const EXPOSURE = 1.2 // knob: tone map

// Scene units: y −1..1, x scaled by the aspect. One pass integrates (written back by transform feedback) and draws.
const VS = `#version 300 es
in vec2 pos;
in vec2 vel;
out vec2 posOut;
out vec2 velOut;
out vec3 vColor;
uniform float uDt;
uniform float uTime;
uniform float uKick;   // radial impulse this frame, units/s; 0 without an onset
uniform float uBass;   // att.bass clamped 0..3, 1 ≈ average
uniform float uPulse;  // (c) beat envelope × confidence: 1 on the beat
uniform float uAspect;
uniform float uSize;   // px at a 1000 px tall target
uniform float uScale;  // target height / 1000
uniform float uSwirl;
uniform float uHot;    // ⚡ input hit, gated by live.ts (flashGate): the heat
uniform int uSeeded;   // ids below it hold a state; the others are new (GPU3D C8: no CPU seed array)
float hash(float n) { return fract(sin(n) * 43758.5453); } // the respawn's (time-keyed, so no fixed pattern)
// A point's own values: pcg_hash (Jarzynski & Olano 2020, "Hash Functions for GPU Rendering", JCGT 9(3),
// https://jcgt.org/published/0009/03/02/), 24-bit uniform in [0, 1). hash() puts 65 % of ids on a 1/256 grid in float32, 0.25 % of them at exactly 0: at 1 M points those sat on
// the home-radius floor as a sharp ring (GPU3D S1.5 still).
float idHash(uint n) {
  n = n * 747796405u + 2891336453u;
  n = ((n >> ((n >> 28u) + 4u)) ^ n) * 277803737u;
  return float(((n >> 22u) ^ n) >> 8u) * (1.0 / 16777216.0);
}
void main() {
  float id = float(gl_VertexID);
  uint k = uint(gl_VertexID) * 4u; // 4 streams per id
  float r1 = idHash(k), r2 = idHash(k + 1u);
  vec2 p = pos, v = vel;
  if (gl_VertexID >= uSeeded) { // a new id: a random point of the disc, at rest (the CPU law it replaced)
    float a = 6.2831853 * idHash(k + 2u);
    p = (0.06 + 0.66 * sqrt(idHash(k + 3u))) * vec2(cos(a), sin(a));
    v = vec2(0.0);
  }
  float d = length(p);
  vec2 dir = d > 1e-5 ? p / d : vec2(cos(id), sin(id));
  float home = (0.06 + 0.66 * sqrt(r1)) * (0.8 + 0.2 * uBass + 0.1 * uPulse); // rest radius: breathes with bass and beat
  v += dir * uKick * (0.35 + r2);                                          // onset: radial burst, spread per point
  v += vec2(-dir.y, dir.x) * uSwirl * d * (0.6 + 0.8 * r2) * uDt;          // swirl: near-rigid, sheared per point
  v -= dir * (d - home) * ${SPRING.toFixed(2)} * uDt;
  v *= exp(-${DRAG.toFixed(2)} * uDt);
  p += v * uDt;
  if (length(p) > 3.0) { // flung off-screen: respawn at the centre
    float a = 6.2831853 * hash(id + uTime);
    p = vec2(cos(a), sin(a)) * 0.05 * hash(id * 1.7 + uTime);
    v = vec2(0.0);
  }
  posOut = p;
  velOut = v;
  float heat = uHot * (0.35 + r2) / 1.35; // the kick's heat, spread per point as the burst is
  float m = 0.6 + 0.4 * uBass + 0.4 * uPulse; // the audio size factor
  vColor = mix(vec3(0.12, 0.25, 1.0), vec3(1.0, 0.55, 0.2), heat) * (0.5 + 0.5 * heat) / (m * m); // / m²: a sprite's light (∝ size²) stays
  gl_PointSize = uSize * uScale * m * (0.5 + r1);
  gl_Position = vec4(p.x / uAspect, p.y, 0.0, 1.0);
}`
const FS = `#version 300 es
precision highp float;
in vec3 vColor;
out vec4 outColor;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float a = max(0.0, 1.0 - dot(q, q)); // soft round sprite
  outColor = vec4(vColor * a * a, 1.0);
}`
export const COMPOSITE_FS = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uRes;
out vec4 outColor;
void main() { outColor = vec4(1.0 - exp(-texture(uSrc, gl_FragCoord.xy / uRes).rgb * ${EXPOSURE.toFixed(2)}), 1.0); }`
// The splat path's stand-in for the POINTS draw (GPU3D CP2): the canvas holds each pixel's particle count as data
// (R = count & 255, G = count >> 8, top row first: gpu/splat.ts), read NEAREST by texelFetch (S2.2 ruling: no blend of
// two counts) and scaled while a resize is pending. A count gets the calm colour at uGain = one TF sprite's energy.
const DECODE_FS = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uRes;
uniform float uGain;
out vec4 outColor;
void main() {
  ivec2 s = textureSize(uSrc, 0);
  ivec2 p = ivec2(gl_FragCoord.xy * vec2(s) / uRes);
  vec2 rg = round(texelFetch(uSrc, ivec2(p.x, s.y - 1 - p.y), 0).rg * 255.0);
  outColor = vec4(vec3(0.06, 0.125, 0.5) * uGain * (rg.r + 256.0 * rg.g), 1.0);
}`

// Compiled once and shared: instances differ only in their buffers, and every draw sets all the uniforms. Kept here
// because the engine's program() cache takes no transform feedback varyings.
let tfProgram: ProgramInfo | undefined

// The splat path's device, once per page (GPU3D CP2): asked the first time a draw wants >= SPLAT_MIN points, through a
// dynamic import (no WebGPU code before it; no import cycle with gpu/splat.ts). undefined = not asked yet, or pending;
// null = no WebGPU, or lost (dead for the page, no retry: every instance draws TF from its next frame).
let newSplat: (() => SplatPath) | null | undefined
let asked: Promise<void> | undefined
const ask = () => (asked ??= import('../gpu/splat').then(async ({ splatDevice, createSplat }) => {
  const dev = await splatDevice()
  newSplat = dev && (() => createSplat(dev))
  void dev?.lost.then(() => (newSplat = null))
}).catch(() => { newSplat = null }))

export const particles: NativeDef = {
  id: 'native/particles', name: 'Particles', kind: 'generator', category: 'geometry',
  credit: 'VeeJay Wizard, after Gregg Tavares (twgl.js)', inputs, flash: ['hit'],
  create(gl, size) {
    const tile = !!size
    let capacity = tile ? TILE_MAX : COUNT_DEFAULT // points the buffers hold (grow() raises it); a tile's (2b S3.2, design S6): ≈.1 ms
    const prog = (tfProgram ??= createProgramInfo(gl, [VS, FS], { transformFeedbackVaryings: ['posOut', 'velOut'] }))
    const composite = fullscreenProgram(COMPOSITE_FS)
    const decode = fullscreenProgram(DECODE_FS)
    const bloom = createBloom(gl)
    const target = renderTarget(true)
    // Allocated by size (zero-filled, no CPU array): the TF pass seeds each id once, on the GPU (uSeeded).
    // Ping-pong: each set reads one pair of buffers through its VAO and writes the other pair through its TF object.
    // numElements given: twgl reads no BUFFER_SIZE back, a sync GPU-process wait on the zero-fill (3-22 ms at 1 M, s14-diag).
    const alloc = (cap: number) => {
      const pairs = [0, 1].map(() => createBufferInfoFromArrays(gl, { pos: { numComponents: 2, data: 2 * cap }, vel: { numComponents: 2, data: 2 * cap } }, { numElements: cap }))
      const sets = [pairs, [pairs[1], pairs[0]]].map(([src, dst]) => ({
        vao: createVertexArrayInfo(gl, prog, src).vertexArrayObject!,
        tf: createTransformFeedback(gl, prog, { posOut: dst.attribs!.pos, velOut: dst.attribs!.vel }),
      }))
      return { pairs, sets }
    }
    const free = ({ pairs, sets }: ReturnType<typeof alloc>) => {
      for (const s of sets) {
        gl.deleteVertexArray(s.vao)
        gl.deleteTransformFeedback(s.tf)
      }
      for (const x of pairs) for (const at of Object.values(x.attribs!)) gl.deleteBuffer(at.buffer)
    }
    let bufs = alloc(capacity)
    gl.bindBuffer(gl.ARRAY_BUFFER, null) // as in the example: don't leave a TF buffer on a generic binding
    let cur = 0
    let seeded = 0 // high-water mark: the ids a pass has covered (each seeded once)
    let growth: ReturnType<typeof setTimeout> | undefined // the pending growth task: at most one per instance
    let splat: SplatPath | undefined // this instance's splat path while the path rule says so (its own state and seeds)
    let wasSplat = false // the last frame drew the splat path: TF reseeds when it takes over (no state crosses paths)
    let tex: WebGLTexture | undefined // the splat canvas, uploaded as milkdrop/native.ts's copy() does
    let tw = 0, th = 0
    let hot = 0 // the heat as drawn (heatStep)

    /** GPU3D C8, N6: a task between frames (no allocation inside a stage frame). New buffers by size, both pairs copied
     *  on the GPU, then swapped; `seeded` stays, so the new ids take their hash seeds in the next pass. */
    const grow = (n: number) => {
      growth = undefined
      const old = bufs, bytes = 2 * 4 * capacity, arrayBuffer = gl.getParameter(gl.ARRAY_BUFFER_BINDING) as WebGLBuffer | null
      capacity = grownCapacity(capacity, n)
      bufs = alloc(capacity)
      gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null) // copying a buffer of the bound TF object: INVALID_OPERATION (WebGL 2)
      for (const [i, x] of old.pairs.entries())
        for (const k of ['pos', 'vel']) {
          gl.bindBuffer(gl.COPY_READ_BUFFER, x.attribs![k].buffer)
          gl.bindBuffer(gl.COPY_WRITE_BUFFER, bufs.pairs[i].attribs![k].buffer)
          gl.copyBufferSubData(gl.COPY_READ_BUFFER, gl.COPY_WRITE_BUFFER, 0, 0, bytes)
        }
      gl.bindBuffer(gl.COPY_READ_BUFFER, null)
      gl.bindBuffer(gl.COPY_WRITE_BUFFER, null)
      gl.bindBuffer(gl.ARRAY_BUFFER, arrayBuffer) // alloc() left a TF buffer there: the frame's binding back
      free(old)
    }

    return {
      draw(f, v) {
        const keep = glState(gl, PASS_LIST) // GPU3D I-GL2: the state its passes change, put back at the end
        // Onsets new this frame (a file's once audible, T1). The detector fires above strength 1.5 (its threshold) and caps
        // at 4, so prominent hits burst fully and weak ones (hats) barely push.
        let kick = 0
        for (const o of f.onsets) kick = Math.max(kick, (o.strength - 1.5) / 2.5)
        const want = particleCount(v.count as number, tile)
        if (want >= SPLAT_MIN) void ask() // the first time only, never before; draw never awaits it
        const on = shouldSplat(want, !!newSplat)
        if (!on && splat) { // lost, or below SPLAT_MIN: TF from this frame
          splat.dispose()
          splat = undefined
        }
        if (on) splat ??= newSplat!()
        // TF grows only where the splat path can never take the count (no WebGPU, lost, below SPLAT_MIN). While the device
        // is pending, and on the splat path, it draws its capacity.
        if (want > capacity && !growth && !shouldSplat(want, newSplat !== null)) growth = setTimeout(() => grow(want), 0) // this frame draws the capacity
        const u = { dt: Math.min(f.dt, 0.05), time: f.time, kick: kick * (v.burst as number), bass: Math.min(3, f.energy.att.bass), pulse: pulse(f.sync), swirl: v.swirl as number }
        hot = heatStep(hot, v.hit as number, u.dt)
        const index = splat?.index
        splat?.frame(want, f.width, f.height, u)
        const drew = !!splat && splat.index !== index // TF on a frame whose index did not move: before the first build (S2.2 ruling)
        const wg = drew ? splat!.webgpuMs() : undefined
        if (wg !== undefined) noteWebgpuMs(wg + SNAPSHOT_MS) // N4: the splat's GPU work is outside the GL timer; none without timestamp-query
        // S2.4 row A, DEV only: globalThis.vjwBare skips the look (the decoded count straight into the engine's target)
        const bare = import.meta.env.DEV && drew && !!(globalThis as { vjwBare?: boolean }).vjwBare

        const out = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null // the engine's target
        target.fit(f.width, f.height)
        bindFramebufferInfo(gl, target)
        gl.viewport(0, 0, f.width, f.height) // the points at the target's px: the viewport is what the last pass left (the canvas' by default)
        if (drew) {
          const c = splat!.canvas // this frame's: read in the task that submitted it (P-B5)
          gl.bindTexture(gl.TEXTURE_2D, (tex ??= createTexture(gl, { minMag: gl.NEAREST, wrap: gl.CLAMP_TO_EDGE, auto: false })))
          if (c.width === tw && c.height === th) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, c)
          else {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c)
            tw = c.width
            th = c.height
          }
          // uGain: a TF sprite's energy, ∫(1 − q²)² over its disc = (π/12) s², s = its mean px size (E[(.5 + r1)²] = 1.08)
          // at m = 1: the VS's / m² keeps it for any audio size factor m (I-FL1)
          const s = (v.size as number) * (f.height / 1000)
          if (bare) gl.bindFramebuffer(gl.FRAMEBUFFER, out)
          decode({ uSrc: tex, uRes: [f.width, f.height], uGain: (Math.PI / 12) * 1.08 * s * s })
        } else {
          if (wasSplat) seeded = 0 // the switch reseeds
          const n = Math.min(want, capacity)
          const { vao, tf } = bufs.sets[cur]
          cur ^= 1
          gl.clearColor(0, 0, 0, 1)
          gl.clear(gl.COLOR_BUFFER_BIT)
          gl.useProgram(prog.program)
          gl.bindVertexArray(vao)
          setUniforms(prog, {
            uDt: u.dt, uTime: u.time, uKick: u.kick, uBass: u.bass, uPulse: u.pulse,
            uAspect: f.width / f.height, uSize: v.size, uScale: f.height / 1000, uSwirl: u.swirl, uHot: hot, uSeeded: seeded,
          })
          gl.enable(gl.BLEND)
          gl.blendFunc(gl.ONE, gl.ONE)
          gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, tf)
          gl.beginTransformFeedback(gl.POINTS)
          gl.drawArrays(gl.POINTS, 0, n)
          seeded = Math.max(seeded, n)
          gl.endTransformFeedback()
          gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null)
          gl.disable(gl.BLEND)
          gl.bindVertexArray(null) // fullscreen passes set their attributes on the default VAO
        }
        wasSplat = drew
        if (bare) return restore(gl, keep)

        const lit = bloom.apply(target.attachments[0], f.width, f.height, v.glow as number)
        gl.bindFramebuffer(gl.FRAMEBUFFER, out)
        gl.viewport(0, 0, f.width, f.height)
        composite({ uSrc: lit, uRes: [f.width, f.height] })
        restore(gl, keep)
      },
      dispose() {
        clearTimeout(growth) // a pending growth does nothing on a disposed instance
        splat?.dispose()
        gl.deleteTexture(tex ?? null)
        bloom.dispose()
        gl.deleteFramebuffer(target.framebuffer)
        gl.deleteTexture(target.attachments[0])
        free(bufs)
      },
    }
  },
}
