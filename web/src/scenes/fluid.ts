// native/fluid (plan_gpu3d S3.1, S3.2; design_gpu3d L76, L165-L168): a 2D grid fluid. The audio mapping splats() is
// pure, for Vitest: no GL and no Math.random; every position, direction and hue is a hash of the frame time, so the same
// frame gives the same splats. The solver is a hand port to GLSL ES 3.00 of WebGL-Fluid-Simulation: splat, advection,
// curl, vorticity, divergence, pressure, gradient subtract and its display pass (shading on). Not ported: bloom, sunrays
// (our fx chain has them), the pointer input, the GUI, the manual filtering (WebGL2 filters half floats).
//
// Ported from WebGL-Fluid-Simulation by Pavel Dobryakov, https://github.com/PavelDoGreat/WebGL-Fluid-Simulation,
// script.js at commit a2d292931f19d9b3b9f564e23e6c32729d2121c3 (2024-11-12). License: MIT. The original notice:
//
// MIT License
//
// Copyright (c) 2017 Pavel Dobryakov
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
import { bindFramebufferInfo, type ProgramInfo } from 'twgl.js'
import type { Sources } from '../bind'
import type { FrameInput } from '../frame'
import type { Input, Value } from '../fx/types'
import { draw, program, renderTarget, type Target } from '../gl/engine'
import { glState, PASS_LIST, restore } from '../gl/glstate'
import type { NativeDef } from '../gl/scene'

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

// The solver (S3.2). Defaults = the port's config: SPLAT_RADIUS .25, CURL 30, DENSITY_DISSIPATION 1; `force` scales
// SPEED. Grids: the short side in texels, the long one × the stage aspect (the port's getResolution).
export const inputs: Input[] = [
  { name: 'force', type: 'float', min: 0, max: 2, default: 1 },
  { name: 'radius', type: 'float', min: 0, max: 1, default: 0.25 },
  { name: 'curl', type: 'float', min: 0, max: 50, default: 30 },
  { name: 'fade', type: 'float', min: 0, max: 4, default: 1 },
]
// The design's lever (matrix G5): F-PERF1 billed p95 at DYE 1024 / PRESSURE_ITER 20 read 4.01 / 4.13 / 3.74 ms > 4.00
// (plan_gpu3d S3.3, alone, slow class).
export const SIM = 128, DYE = 512, PRESSURE_ITER = 12
const PRESSURE = 0.8 // the port's: the share of last frame's pressure the solve starts from
const VELOCITY_DISSIPATION = 0.2 // the port's
const DYE_GAIN = 1.5 // knob: the dye at hue 1, the port's random splats (generateColor() 0.15 × 10)
const DT_MAX = 0.05 // s, as native/particles

const VMAX = V_MAX.toFixed(1)
const VS = `#version 300 es
precision highp float;
in vec2 position;
out vec2 vUv;
out vec2 vL;
out vec2 vR;
out vec2 vT;
out vec2 vB;
uniform vec2 texelSize;
void main () {
  vUv = position * 0.5 + 0.5;
  vL = vUv - vec2(texelSize.x, 0.0);
  vR = vUv + vec2(texelSize.x, 0.0);
  vT = vUv + vec2(0.0, texelSize.y);
  vB = vUv - vec2(0.0, texelSize.y);
  gl_Position = vec4(position, 0.0, 1.0);
}`
const NEIGHBOURS = `in highp vec2 vUv;
in highp vec2 vL;
in highp vec2 vR;
in highp vec2 vT;
in highp vec2 vB;
out vec4 fragColor;`
const CLEAR = `#version 300 es
precision mediump float;
precision mediump sampler2D;
in highp vec2 vUv;
uniform sampler2D uTexture;
uniform float value;
out vec4 fragColor;
void main () { fragColor = value * texture(uTexture, vUv); }`
// Every pass that writes velocity clamps it to ±V_MAX (the port's vorticity pass did); splat and advection also write
// the dye, which never gets near it.
const SPLAT = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 point;
uniform float radius;
out vec4 fragColor;
void main () {
  vec2 p = vUv - point.xy;
  p.x *= aspectRatio;
  vec3 splat = exp(-dot(p, p) / radius) * color;
  vec3 base = texture(uTarget, vUv).xyz;
  fragColor = vec4(clamp(base + splat, -${VMAX}, ${VMAX}), 1.0);
}`
const ADVECTION = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 texelSize;
uniform float dt;
uniform float dissipation;
out vec4 fragColor;
void main () {
  vec2 coord = vUv - dt * texture(uVelocity, vUv).xy * texelSize;
  vec4 result = texture(uSource, coord);
  float decay = 1.0 + dissipation * dt;
  fragColor = clamp(result / decay, -${VMAX}, ${VMAX});
}`
const DIVERGENCE = `#version 300 es
precision mediump float;
precision mediump sampler2D;
${NEIGHBOURS}
uniform sampler2D uVelocity;
void main () {
  float L = texture(uVelocity, vL).x;
  float R = texture(uVelocity, vR).x;
  float T = texture(uVelocity, vT).y;
  float B = texture(uVelocity, vB).y;
  vec2 C = texture(uVelocity, vUv).xy;
  if (vL.x < 0.0) { L = -C.x; }
  if (vR.x > 1.0) { R = -C.x; }
  if (vT.y > 1.0) { T = -C.y; }
  if (vB.y < 0.0) { B = -C.y; }
  float div = 0.5 * (R - L + T - B);
  fragColor = vec4(div, 0.0, 0.0, 1.0);
}`
const CURL = `#version 300 es
precision mediump float;
precision mediump sampler2D;
${NEIGHBOURS}
uniform sampler2D uVelocity;
void main () {
  float L = texture(uVelocity, vL).y;
  float R = texture(uVelocity, vR).y;
  float T = texture(uVelocity, vT).x;
  float B = texture(uVelocity, vB).x;
  float vorticity = R - L - T + B;
  fragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
}`
const VORTICITY = `#version 300 es
precision highp float;
precision highp sampler2D;
${NEIGHBOURS}
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float curl;
uniform float dt;
void main () {
  float L = texture(uCurl, vL).x;
  float R = texture(uCurl, vR).x;
  float T = texture(uCurl, vT).x;
  float B = texture(uCurl, vB).x;
  float C = texture(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001;
  force *= curl * C;
  force.y *= -1.0;
  vec2 velocity = texture(uVelocity, vUv).xy;
  velocity += force * dt;
  velocity = min(max(velocity, -${VMAX}), ${VMAX});
  fragColor = vec4(velocity, 0.0, 1.0);
}`
const PRESSURE_FS = `#version 300 es
precision mediump float;
precision mediump sampler2D;
${NEIGHBOURS}
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
void main () {
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  float divergence = texture(uDivergence, vUv).x;
  float pressure = (L + R + B + T - divergence) * 0.25;
  fragColor = vec4(pressure, 0.0, 0.0, 1.0);
}`
const GRADIENT_SUBTRACT = `#version 300 es
precision mediump float;
precision mediump sampler2D;
${NEIGHBOURS}
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
void main () {
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  vec2 velocity = texture(uVelocity, vUv).xy;
  velocity.xy -= vec2(R - L, T - B);
  fragColor = vec4(clamp(velocity, -${VMAX}, ${VMAX}), 0.0, 1.0);
}`
// The port's display pass with SHADING; alpha 1 as native/particles writes its target (BACK_COLOR black, opaque).
const DISPLAY = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
uniform sampler2D uTexture;
uniform vec2 texelSize;
out vec4 fragColor;
void main () {
  vec3 c = texture(uTexture, vUv).rgb;
  vec3 lc = texture(uTexture, vL).rgb;
  vec3 rc = texture(uTexture, vR).rgb;
  vec3 tc = texture(uTexture, vT).rgb;
  vec3 bc = texture(uTexture, vB).rgb;
  float dx = length(rc) - length(lc);
  float dy = length(tc) - length(bc);
  vec3 n = normalize(vec3(dx, dy, length(texelSize)));
  vec3 l = vec3(0.0, 0.0, 1.0);
  float diffuse = clamp(dot(n, l) + 0.7, 0.7, 1.0);
  fragColor = vec4(c * diffuse, 1.0);
}`

/** The port's getResolution: `r` texels on the short side, the long one × the aspect. */
const grid = (r: number, w: number, h: number): [number, number] => {
  const long = Math.round(r * Math.max(w / h, h / w))
  return w > h ? [long, r] : [r, long]
}

export const fluid: NativeDef = {
  id: 'native/fluid', name: 'Fluid', kind: 'generator', category: 'liquid', tags: ['fluid', 'ink'],
  credit: 'VeeJay Wizard, after Pavel Dobryakov (WebGL-Fluid-Simulation)', inputs,
  create(gl) {
    const [clear, splat, advection, divergenceP, curlP, vorticity, pressureP, gradient, display] =
      [CLEAR, SPLAT, ADVECTION, DIVERGENCE, CURL, VORTICITY, PRESSURE_FS, GRADIENT_SUBTRACT, DISPLAY].map((fs) => program(VS, fs))
    // [read, write] pairs, swapped after each write. Velocity and dye keep their content through a resize (the port's
    // resizeDoubleFBO); the others start over, as the port's do.
    const velocity = [renderTarget(true, true), renderTarget(true, true)]
    const dye = [renderTarget(true, true), renderTarget(true, true)]
    const pressure = [renderTarget(true), renderTarget(true)]
    const divergence = renderTarget(true), curl = renderTarget(true)
    const prev: Sources = {} // the last frame's sources: splats() reads the rises
    const pass = (t: Target, info: ProgramInfo, u: Record<string, unknown>) => {
      bindFramebufferInfo(gl, t) // and its viewport
      draw(info, u)
    }
    const swap = (pair: Target[], info: ProgramInfo, u: Record<string, unknown>) => {
      pass(pair[1], info, u)
      pair.reverse()
    }
    const tex = (t: Target) => t.attachments[0]

    return {
      draw(f, v, _src, s = {}) {
        const keep = glState(gl, PASS_LIST) // GPU3D I-GL2: the state its passes change, put back at the end
        const out = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null // the engine's target
        const [sw, sh] = grid(SIM, f.width, f.height)
        for (const t of [...velocity, ...pressure, divergence, curl]) t.fit(sw, sh)
        // DYE on the short side, never more than the output's (a 320×180 Library tile baked 1820×1024: 14-16.5 ms slices)
        for (const t of dye) t.fit(...grid(Math.min(DYE, f.width, f.height), f.width, f.height))
        const dt = Math.min(f.dt, DT_MAX), aspectRatio = f.width / f.height, texelSize = [1 / sw, 1 / sh]

        for (const p of splats(s, f, v, prev)) { // the port's splat(): velocity (none for a hat), then the dye
          const u = { aspectRatio, point: [p.x, p.y], radius: (Math.max(p.radius, 1e-3) / 100) * Math.max(1, aspectRatio), uTarget: tex(velocity[0]), color: [p.dx, p.dy, 0] }
          if (p.dx || p.dy) swap(velocity, splat, u)
          swap(dye, splat, Object.assign(u, { uTarget: tex(dye[0]), color: p.rgb.map((c) => c * DYE_GAIN) }))
        }
        Object.assign(prev, s)

        // The port's step(dt).
        pass(curl, curlP, { texelSize, uVelocity: tex(velocity[0]) })
        swap(velocity, vorticity, { texelSize, uVelocity: tex(velocity[0]), uCurl: tex(curl), curl: v.curl, dt })
        pass(divergence, divergenceP, { texelSize, uVelocity: tex(velocity[0]) })
        swap(pressure, clear, { uTexture: tex(pressure[0]), value: PRESSURE })
        const pu = { texelSize, uDivergence: tex(divergence), uPressure: tex(pressure[0]) }
        for (let i = 0; i < PRESSURE_ITER; i++) {
          pu.uPressure = tex(pressure[0])
          swap(pressure, pressureP, pu)
        }
        swap(velocity, gradient, { texelSize, uPressure: tex(pressure[0]), uVelocity: tex(velocity[0]) })
        swap(velocity, advection, { texelSize, uVelocity: tex(velocity[0]), uSource: tex(velocity[0]), dt, dissipation: VELOCITY_DISSIPATION })
        swap(dye, advection, { texelSize, uVelocity: tex(velocity[0]), uSource: tex(dye[0]), dt, dissipation: v.fade })

        gl.bindFramebuffer(gl.FRAMEBUFFER, out)
        gl.viewport(0, 0, f.width, f.height)
        draw(display, { texelSize: [1 / f.width, 1 / f.height], uTexture: tex(dye[0]) })
        restore(gl, keep)
      },
      // The programs are the engine's cache (program()): shared by every instance and the warm-up, never deleted here.
      dispose() {
        for (const t of [...velocity, ...dye, ...pressure, divergence, curl]) {
          gl.deleteFramebuffer(t.framebuffer)
          gl.deleteTexture(t.attachments[0])
        }
      },
    }
  },
}
