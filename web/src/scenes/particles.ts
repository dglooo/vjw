// Particles: 65 536 GPU points in a swirling disc. Onsets burst them outward, bass breathes the disc and the point
// size, the (c) beat swells the disc and the points, a spring pulls each point back to its rest radius, and points
// flung off-screen respawn at the centre.
// Bursting points (radial speed) glow hot through the bloom; the calm swirl stays cool blue.
//
// Adapted from twgl.js examples (MIT, https://github.com/greggman/twgl.js), examples/transform-feedback-particles-va.html
// by Gregg Tavares: ping-pong vertex arrays + transform feedback objects, and the update shader also rasterises the
// points in the same pass. Original header: "twgl.js Copyright (c) 2015, Gregg Tavares All Rights Reserved.
// Available via the MIT license. see: http://github.com/greggman/twgl.js for details"
import {
  bindFramebufferInfo, createBufferInfoFromArrays, createProgramInfo, createTransformFeedback, createVertexArrayInfo,
  setUniforms,
} from 'twgl.js'
import { pulse } from '../audio/sync'
import { createBloom } from '../gl/bloom'
import { fullscreenProgram, renderTarget } from '../gl/engine'
import type { SceneFactory } from '../gl/scene'

/** Look knobs, read every frame (the stage-2 editor binds to these). */
export const params = { burst: 2.5, swirl: 1.5, size: 6, glow: 2 }
const N = 65536 // knob: point count
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
float hash(float n) { return fract(sin(n) * 43758.5453); }
void main() {
  float id = float(gl_VertexID);
  float r1 = hash(id * 0.1031 + 0.11), r2 = hash(id * 0.0973 + 0.37);
  vec2 p = pos, v = vel;
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
const COMPOSITE_FS = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uRes;
out vec4 outColor;
void main() { outColor = vec4(1.0 - exp(-texture(uSrc, gl_FragCoord.xy / uRes).rgb * ${EXPOSURE.toFixed(2)}), 1.0); }`

export const particles: SceneFactory = (gl) => {
  const prog = createProgramInfo(gl, [VS, FS], { transformFeedbackVaryings: ['posOut', 'velOut'] })
  const composite = fullscreenProgram(COMPOSITE_FS)
  const bloom = createBloom(gl)
  const target = renderTarget(true)
  const start = new Float32Array(2 * N) // a random disc, at rest
  for (let i = 0; i < N; i++) {
    const a = Math.random() * 2 * Math.PI
    const r = 0.06 + 0.66 * Math.sqrt(Math.random())
    start[2 * i] = r * Math.cos(a)
    start[2 * i + 1] = r * Math.sin(a)
  }
  const a = createBufferInfoFromArrays(gl, { pos: { numComponents: 2, data: start }, vel: { numComponents: 2, data: 2 * N } })
  const b = createBufferInfoFromArrays(gl, { pos: { numComponents: 2, data: 2 * N }, vel: { numComponents: 2, data: 2 * N } })
  // Ping-pong: each set reads one pair of buffers through its VAO and writes the other pair through its TF object.
  const sets = [[a, b], [b, a]].map(([src, dst]) => ({
    vao: createVertexArrayInfo(gl, prog, src).vertexArrayObject!,
    tf: createTransformFeedback(gl, prog, { posOut: dst.attribs!.pos, velOut: dst.attribs!.vel }),
  }))
  gl.bindBuffer(gl.ARRAY_BUFFER, null) // as in the example: don't leave a TF buffer on a generic binding
  let cur = 0

  return {
    name: 'particles',
    draw(f) {
      // Onsets new this frame (a file's once audible, T1). The detector fires above strength 1.5 (its threshold) and caps
      // at 4, so prominent hits burst fully and weak ones (hats) barely push.
      let kick = 0
      for (const o of f.onsets) kick = Math.max(kick, (o.strength - 1.5) / 2.5)
      const { vao, tf } = sets[cur]
      cur ^= 1

      const out = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null // the engine's target
      target.fit(f.width, f.height)
      bindFramebufferInfo(gl, target)
      gl.clearColor(0, 0, 0, 1)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.useProgram(prog.program)
      gl.bindVertexArray(vao)
      setUniforms(prog, {
        uDt: Math.min(f.dt, 0.05), uTime: f.time, uKick: kick * params.burst, uBass: Math.min(3, f.energy.att.bass),
        uPulse: pulse(f.sync),
        uAspect: f.width / f.height, uSize: params.size, uScale: f.height / 1000, uSwirl: params.swirl,
      })
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.ONE, gl.ONE)
      gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, tf)
      gl.beginTransformFeedback(gl.POINTS)
      gl.drawArrays(gl.POINTS, 0, N)
      gl.endTransformFeedback()
      gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null)
      gl.disable(gl.BLEND)
      gl.bindVertexArray(null) // fullscreen passes set their attributes on the default VAO

      const lit = bloom.apply(target.attachments[0], f.width, f.height, params.glow)
      gl.bindFramebuffer(gl.FRAMEBUFFER, out)
      gl.viewport(0, 0, f.width, f.height)
      composite({ uSrc: lit, uRes: [f.width, f.height] })
    },
  }
}
