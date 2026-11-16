// Particles: `count` GPU points (65 536 by default) in a swirling disc. Onsets burst them outward, bass breathes the
// disc and the point size, the (c) beat swells the disc and the points, a spring pulls each point back to its rest
// radius, and points flung off-screen respawn at the centre.
// Bursting points (radial speed) glow hot through the bloom; the calm swirl stays cool blue.
//
// Adapted from twgl.js examples (MIT, https://github.com/greggman/twgl.js), examples/transform-feedback-particles-va.html
// by Gregg Tavares: ping-pong vertex arrays + transform feedback objects, and the update shader also rasterises the
// points in the same pass. Original header: "twgl.js Copyright (c) 2015, Gregg Tavares All Rights Reserved.
// Available via the MIT license. see: http://github.com/greggman/twgl.js for details"
import {
  bindFramebufferInfo, createBufferInfoFromArrays, createProgramInfo, createTransformFeedback, createVertexArrayInfo,
  setUniforms, type ProgramInfo,
} from 'twgl.js'
import { pulse } from '../audio/sync'
import type { Input } from '../fx/types'
import { createBloom } from '../gl/bloom'
import { fullscreenProgram, renderTarget } from '../gl/engine'
import type { NativeDef } from '../gl/scene'

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

/** Look knobs, read every frame; bindings and the panel drive them through `values`. */
export const inputs: Input[] = [
  { name: 'burst', type: 'float', min: 0, max: 6, default: 2.5 },
  { name: 'swirl', type: 'float', min: 0, max: 5, default: 1.5 },
  { name: 'size', type: 'float', min: 1, max: 16, default: 6 },
  { name: 'glow', type: 'float', min: 0, max: 8, default: 2 },
  { name: 'count', type: 'float', min: 0, max: COUNT_MAX, default: COUNT_DEFAULT }, // points drawn: particleCount()
]
const SPRING = 40 // knob: 1/s², pull back to the rest radius: a burst returns within ~¼ s, and frequent onsets
// (≈4/s with hats) only push the disc out by their mean impulse / SPRING
const DRAG = 3 // knob: 1/s, velocity damping (bouncy, settles in ~1 s)
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
uniform int uSeeded;   // ids below it hold a state; the others are new (GPU3D C8: no CPU seed array)
float hash(float n) { return fract(sin(n) * 43758.5453); }
void main() {
  float id = float(gl_VertexID);
  float r1 = hash(id * 0.1031 + 0.11), r2 = hash(id * 0.0973 + 0.37);
  vec2 p = pos, v = vel;
  if (gl_VertexID >= uSeeded) { // a new id: a random point of the disc, at rest (the CPU law it replaced)
    float a = 6.2831853 * hash(id * 0.0617 + 0.71);
    p = (0.06 + 0.66 * sqrt(hash(id * 0.0859 + 0.23))) * vec2(cos(a), sin(a));
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
  float heat = clamp(abs(dot(v, dir)) * 0.5, 0.0, 1.0); // radial speed: bursting = hot, the calm swirl stays cool
  vColor = mix(vec3(0.12, 0.25, 1.0), vec3(1.0, 0.55, 0.2), heat) * (0.5 + 0.5 * heat);
  gl_PointSize = uSize * uScale * (0.6 + 0.4 * uBass + 0.4 * uPulse) * (0.5 + r1);
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

// Compiled once and shared: instances differ only in their buffers, and every draw sets all the uniforms. Kept here
// because the engine's program() cache takes no transform feedback varyings.
let tfProgram: ProgramInfo | undefined

export const particles: NativeDef = {
  id: 'native/particles', name: 'Particles', kind: 'generator', category: 'geometry',
  credit: 'VeeJay Wizard, after Gregg Tavares (twgl.js)', inputs,
  create(gl, size) {
    const tile = !!size
    let capacity = tile ? TILE_MAX : COUNT_DEFAULT // points the buffers hold (grow() raises it); a tile's (2b S3.2, design S6): ≈.1 ms
    const prog = (tfProgram ??= createProgramInfo(gl, [VS, FS], { transformFeedbackVaryings: ['posOut', 'velOut'] }))
    const composite = fullscreenProgram(COMPOSITE_FS)
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
        // Onsets new this frame (a file's once audible, T1). The detector fires above strength 1.5 (its threshold) and caps
        // at 4, so prominent hits burst fully and weak ones (hats) barely push.
        let kick = 0
        for (const o of f.onsets) kick = Math.max(kick, (o.strength - 1.5) / 2.5)
        const want = particleCount(v.count as number, tile)
        if (want > capacity && !growth) growth = setTimeout(() => grow(want), 0) // this frame draws the capacity
        const n = Math.min(want, capacity)
        const { vao, tf } = bufs.sets[cur]
        cur ^= 1

        const out = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null // the engine's target
        target.fit(f.width, f.height)
        bindFramebufferInfo(gl, target)
        gl.viewport(0, 0, f.width, f.height) // the points at the target's px: the viewport is what the last pass left (the canvas' by default)
        gl.clearColor(0, 0, 0, 1)
        gl.clear(gl.COLOR_BUFFER_BIT)
        gl.useProgram(prog.program)
        gl.bindVertexArray(vao)
        setUniforms(prog, {
          uDt: Math.min(f.dt, 0.05), uTime: f.time, uKick: kick * (v.burst as number),
          uBass: Math.min(3, f.energy.att.bass), uPulse: pulse(f.sync),
          uAspect: f.width / f.height, uSize: v.size, uScale: f.height / 1000, uSwirl: v.swirl, uSeeded: seeded,
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

        const lit = bloom.apply(target.attachments[0], f.width, f.height, v.glow as number)
        gl.bindFramebuffer(gl.FRAMEBUFFER, out)
        gl.viewport(0, 0, f.width, f.height)
        composite({ uSrc: lit, uRes: [f.width, f.height] })
      },
      dispose() {
        clearTimeout(growth) // a pending growth does nothing on a disposed instance
        bloom.dispose()
        gl.deleteFramebuffer(target.framebuffer)
        gl.deleteTexture(target.attachments[0])
        free(bufs)
      },
    }
  },
}
