// Transform-feedback point natives (plan_td_look.md CP3, design D4). Swarm: N GPU points curl through a drifting
// simplex-noise field, gather onto its zero contour (glowing threads), burst outward on kicks and draw additively into
// one persistent half-float trail, faded each frame by a constant blend (no texture read, no ping-pong); then the shared
// bloom and particles.ts's tone map. The TF pattern is particles.ts's (after the twgl.js example, MIT, Gregg Tavares):
// two buffer sets, one pass that integrates and rasterises.
// Look: TD particlesGpu.tox + Particle/Trail POP (studied, rewritten). Credits: webgl-noise snoise (Ian McEwan, Ashima
// Arts, MIT; its header is kept in NOISE); gl/bloom.ts.
import {
  bindFramebufferInfo, createBufferInfoFromArrays, createProgramInfo, createTransformFeedback, createVertexArrayInfo,
  setUniforms, type ProgramInfo,
} from 'twgl.js'
import { createBloom } from '../gl/bloom'
import { fullscreenProgram, renderTarget, tint } from '../gl/engine'
import type { NativeDef } from '../gl/scene'
import { COMPOSITE_FS } from './particles'

const N = 65536 // knob: point count (D5 lever: 131072 measured 5.6 ms p95 at res .75)
/** Each of the two TF buffers: one vec4 (pos.xy, vel.xy) of float32 per point. */
export const swarmLayout = (n: number) => ({ floats: 4 * n, bytes: 16 * n })
const LIFE = 6 // knob: s, each point's life (staggered by id); it fades in and out
const SCALE = 1.2 // knob: noise cells per scene unit (the stage is 2 units tall)
const DRIFT = 0.15 // knob: noise drift, cells/s: the swirls morph
const TURB = 0.5 // knob: curl force per unit of `turbulence`
const BURST = 0.6 // knob: radial burst per unit of `burst`
const GATHER = 1 // knob: pull onto the noise's zero contour (the threads)
const DRAG = 1.5 // knob: 1/s
const GAIN = 0.8 // knob: one point's deposit ÷ its size (trails sum ≈ 1/(1 − trail) of it)
const GLOW = 2 // knob: bloom strength

// webgl-noise noise3Dgrad.glsl (donor/webgl-noise, MIT): its header and code, the comments and blank lines dropped.
const NOISE = `
// Description : Array and textureless GLSL 2D/3D/4D simplex
//               noise functions.
//      Author : Ian McEwan, Ashima Arts.
//  Maintainer : stegu
//     Lastmod : 20201014 (stegu)
//     License : Copyright (C) 2011 Ashima Arts. All rights reserved.
//               Distributed under the MIT License. See LICENSE file.
//               https://github.com/ashima/webgl-noise
//               https://github.com/stegu/webgl-noise
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+10.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v, out vec3 gradient) {
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 =   v - i + dot(i, C.xxx) ;
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute( permute( permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
  float n_ = 0.142857142857;
  vec3  ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );
  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  vec4 m2 = m * m;
  vec4 m4 = m2 * m2;
  vec4 pdotx = vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3));
  vec4 temp = m2 * m * pdotx;
  gradient = -8.0 * (temp.x * x0 + temp.y * x1 + temp.z * x2 + temp.w * x3);
  gradient += m4.x * p0 + m4.y * p1 + m4.z * p2 + m4.w * p3;
  gradient *= 105.0;
  return 105.0 * dot(m4, pdotx);
}`

// Scene units: y −1..1, x scaled by the aspect. One pass integrates (written back by transform feedback) and draws.
const VS = `#version 300 es
in vec4 state; // pos.xy, vel.xy
out vec4 stateOut;
out vec3 vColor;
uniform float uDt, uTime, uAspect, uBurst, uTurb, uSize, uSparkle, uHue, uSpawn;
${NOISE}
uint mixu(uint x) { x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; return x ^ (x >> 16); } // lowbias32
float hash(uint x) { return float(mixu(x)) / 4294967296.0; } // fract(sin) has ~8 bits here: 512 points shared the origin
void main() {
  uint id = uint(gl_VertexID);
  float r1 = hash(id), r2 = hash(id + 0x9e3779b9u);
  vec2 p = state.xy, v = state.zw;
  float life = uTime / ${LIFE.toFixed(1)} + r1; // its own phase: about N / LIFE points are reborn per second
  uint seed = mixu(id + uint(floor(life)) * 0x632be5abu + floatBitsToUint(uSpawn * uTime)); // per life; the drop reseeds
  // The drop (all at once), expired, off-stage or new: reborn at rest, over the stage. The threads scatter to dust and
  // gather again (a core burst whited the stage out).
  if (uSpawn > 0.5 || floor(life) != floor(life - uDt / ${LIFE.toFixed(1)}) || dot(p, p) > 4.0 || state == vec4(0.0)) {
    float a = 6.2831853 * hash(seed);
    p = sqrt(hash(seed + 1u)) * vec2(cos(a) * uAspect, sin(a));
    v = vec2(0.0);
  }
  vec3 g;
  float n = snoise(vec3(p * ${SCALE.toFixed(2)}, uTime * ${DRIFT.toFixed(2)}), g);
  // The curl runs along the noise's level sets; −n·∇n gathers the points onto its zero contour: threads that flow
  // along themselves. The burst is ∝ the radius: the swarm expands, no hole.
  v += (vec2(g.y, -g.x) * uTurb * ${TURB.toFixed(2)} - n * g.xy * ${GATHER.toFixed(2)} + p * uBurst * ${BURST.toFixed(2)} * (0.5 + r2)) * uDt;
  v *= exp(-${DRAG.toFixed(2)} * uDt);
  p += v * uDt;
  stateOut = vec4(p, v);
  // The noise's value as the hue: neighbouring streams share a colour (magenta, blue, cyan).
  vec3 c = 0.5 + 0.5 * cos(6.2831853 * (0.33 + 0.22 * n + uHue + vec3(0.0, 0.33, 0.67)));
  float heat = clamp(length(v) * 0.6, 0.0, 1.0); // fast = hot: whiter and brighter
  float fade = smoothstep(0.0, 0.15, fract(life)) * smoothstep(1.0, 0.7, fract(life)); // no pop at birth or death
  float twinkle = 1.0 + uSparkle * (4.0 * hash(id ^ mixu(floatBitsToUint(uTime))) - 2.0); // hats: zero-mean, per point
  vColor = mix(c, vec3(1.0), heat * heat * 0.6) * (0.4 + heat) * fade * twinkle * ${GAIN.toFixed(3)} / uSize; // ÷ size: a swell reads thicker, not size² brighter
  gl_PointSize = uSize * (0.7 + 0.6 * r1);
  gl_Position = vec4(p.x / uAspect, p.y, 0.0, 1.0);
}`
const FS = `#version 300 es
precision highp float;
in vec3 vColor;
out vec4 outColor;
void main() { outColor = vec4(vColor, 1.0); }`

let tfProgram: ProgramInfo | undefined // as particles.ts: compiled once and shared; the engine's cache takes no varyings

/** Bindings: D1 with the 2026-11-05 ruling (turbulence binds reese; Auto-style maps it to wobble in Dubstep). */
export const swarm: NativeDef = {
  id: 'native/swarm', name: 'Swarm', kind: 'generator', category: 'geometry', credit: 'VeeJay Wizard', inputs: [
    { name: 'burst', type: 'float', min: 0, max: 3, default: 0 }, // radial push, ∝ the radius
    { name: 'hueStep', type: 'float', min: 0, max: 1, default: 0 }, // turns the palette (1 = all the way round)
    { name: 'sparkle', type: 'float', min: 0, max: 0.5, default: 0 }, // per-point twinkle, zero-mean
    { name: 'size', type: 'float', min: 1, max: 6, default: 1.5 }, // px
    { name: 'turbulence', type: 'float', min: 0, max: 3, default: 0.5 }, // the curl force
    { name: 'trail', type: 'float', min: 0, max: 0.99, default: 0.9 }, // what a frame keeps of the last
    { name: 'spawn', type: 'event' }, // every point reborn at once, scattered over the stage
  ],
  bind: {
    burst: { source: 'kick', amount: 1, attack: 0, release: 0.1, min: 0, max: 3 }, // a kick bursts the swarm outward
    hueStep: { source: 'snare', amount: 1, attack: 0, release: 0.3, min: 0, max: 0.2 }, // a snare turns the colours
    sparkle: { source: 'hats', amount: 1, attack: 0, release: 0.08, min: 0, max: 0.5 }, // hats twinkle the points
    size: { source: 'sub', amount: 1, attack: 0.05, release: 0.3, min: 1.5, max: 3 }, // the sub swells them
    turbulence: { source: 'reese', amount: 1, attack: 0.05, release: 0.4, min: 0.2, max: 2 }, // the bass stirs the swirls
    trail: { source: 'build', amount: 1, attack: 1, release: 2, min: 0.85, max: 0.97 }, // a build lengthens the trails
    spawn: { source: 'drop', amount: 1, attack: 0, release: 0.1, min: 0, max: 1 }, // short release: one edge per drop
  },
  create(gl) {
    const prog = (tfProgram ??= createProgramInfo(gl, [VS, FS], { transformFeedbackVaryings: ['stateOut'] }))
    const composite = fullscreenProgram(COMPOSITE_FS)
    const bloom = createBloom(gl)
    const trail = renderTarget(true, true) // persistent: the trails survive a governor step
    // Both start zeroed: a zero state is "new", so the first frame scatters every point over the stage.
    const [a, b] = [0, 1].map(() => createBufferInfoFromArrays(gl, { state: { numComponents: 4, data: swarmLayout(N).floats } }))
    const sets = [[a, b], [b, a]].map(([src, dst]) => ({
      vao: createVertexArrayInfo(gl, prog, src).vertexArrayObject!,
      tf: createTransformFeedback(gl, prog, { stateOut: dst.attribs!.state }),
    }))
    gl.bindBuffer(gl.ARRAY_BUFFER, null) // as particles.ts: no TF buffer left on a generic binding
    let cur = 0
    let held = false
    return {
      draw(f, v) {
        const spawn = !!v.spawn && !held // the rising edge: bound, it stays true while the envelope does
        held = !!v.spawn
        const { vao, tf } = sets[cur]
        cur ^= 1
        const out = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null // the engine's target
        trail.fit(f.width, f.height)
        bindFramebufferInfo(gl, trail)
        gl.enable(gl.BLEND)
        // ponytail: a per-frame fade (as the feedback effects): trails are half as long in time at 120 Hz
        gl.blendFunc(gl.ZERO, gl.SRC_ALPHA) // dst × trail: the engine's post-pass trick, no texture read
        tint({ uColor: [0, 0, 0, v.trail] })
        gl.blendFunc(gl.ONE, gl.ONE)
        gl.useProgram(prog.program)
        gl.bindVertexArray(vao)
        setUniforms(prog, {
          uDt: Math.min(f.dt, 0.05), uTime: f.time, uAspect: f.width / f.height, uBurst: v.burst, uTurb: v.turbulence,
          uSize: v.size, uSparkle: v.sparkle, uHue: v.hueStep, uSpawn: spawn ? 1 : 0,
        })
        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, tf)
        gl.beginTransformFeedback(gl.POINTS)
        gl.drawArrays(gl.POINTS, 0, N)
        gl.endTransformFeedback()
        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null)
        gl.disable(gl.BLEND)
        gl.bindVertexArray(null) // fullscreen passes set their attributes on the default VAO
        const lit = bloom.apply(trail.attachments[0], f.width, f.height, GLOW)
        gl.bindFramebuffer(gl.FRAMEBUFFER, out)
        gl.viewport(0, 0, f.width, f.height)
        composite({ uSrc: lit, uRes: [f.width, f.height] })
      },
      dispose() {
        bloom.dispose()
        gl.deleteFramebuffer(trail.framebuffer)
        gl.deleteTexture(trail.attachments[0])
        for (const s of sets) {
          gl.deleteVertexArray(s.vao)
          gl.deleteTransformFeedback(s.tf)
        }
        for (const x of [a, b]) gl.deleteBuffer(x.attribs!.state.buffer)
      },
    }
  },
}
