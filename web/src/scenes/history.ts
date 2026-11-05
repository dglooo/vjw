// History ring (plan_td_look.md CP2, design Variant A "History ring"): a native filter's last 32 inputs in one RGBA8
// TEXTURE_2D_ARRAY at ½ the stage, read through the ES 3.00 `past(uv, age)`. Natives own their programs, so the ISF
// 1.00 limit doesn't apply. Allocated in create() (prepare-ahead runs it mid-scene), never refit by the governor (a step
// costs nothing and the history survives it), freed in dispose(). A mode change takes effect at the next instance.
// Look: TD rgbaDelay.tox and Time Machine TOP (studied, rewritten). No third-party code.
import { copy, fullscreenProgram } from '../gl/engine'
import type { NativeDef } from '../gl/scene'

/** The slot `age` frames before `head` (the newest), wrapping both ways. */
export const slot = (head: number, age: number, depth: number) => (((head - age) % depth) + depth) % depth
/** A slot's size: ½ of w×h, halved again until depth·w·h·4 bytes ≤ cap. */
export function ringSize(w: number, h: number, depth = 32, cap = 64 << 20): [number, number] {
  do {
    w = Math.max(1, Math.round(w / 2))
    h = Math.max(1, Math.round(h / 2))
  } while (depth * w * h * 4 > cap && w > 1)
  return [w, h]
}

interface Ring { tex: WebGLTexture; depth: number; head: number; filled: number; push(src: WebGLTexture): void; dispose(): void }

/** Sized from the stage (G1: the drawing buffer is the stage), not the governed internal size. */
function ring(gl: WebGL2RenderingContext, depth = 32): Ring {
  const [w, h] = ringSize(gl.drawingBufferWidth, gl.drawingBufferHeight, depth)
  const res = [w, h]
  const tex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex)
  gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, w, h, depth)
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR) // one level: the mipmap default is incomplete
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  const fb = gl.createFramebuffer()
  const r: Ring = {
    tex, depth, head: 0, filled: 0,
    push(src) { // src, at any size, into the next slot: linear
      r.head = slot(r.head, -1, depth)
      r.filled = Math.min(r.filled + 1, depth)
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, tex, 0, r.head)
      gl.viewport(0, 0, w, h)
      copy({ uSrc: src, uRes: res })
    },
    dispose() {
      gl.deleteFramebuffer(fb)
      gl.deleteTexture(tex)
    },
  }
  return r
}

// past(): the CP2 contract, shared by every ring native. Ages clamp to what the ring holds, so a fresh instance (a cut)
// shows no black ghost.
const PAST = `#version 300 es
precision highp float;
uniform highp sampler2DArray uRing;
uniform sampler2D uSrc;
uniform float uHead, uDepth, uFilled;
uniform vec2 uRes;
out vec4 outColor;
vec4 tap(vec2 uv, float age) { return age < 0.5 ? texture(uSrc, uv) : texture(uRing, vec3(uv, mod(uHead - age, uDepth))); }
// age in slots; 0 = uSrc at full res; fractions mix 2 slots; clamped to uFilled - 1
vec4 past(vec2 uv, float age) {
  age = clamp(age, 0.0, uFilled - 1.0);
  float a = floor(age);
  return mix(tap(uv, a), tap(uv, min(a + 1.0, uFilled - 1.0)), age - a);
}
`
const FS = `${PAST}
uniform float uSpread, uOrder;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 age = mod(vec3(0.0, 1.0, 2.0) + uOrder, 3.0) * uSpread; // R, G, B: 0 / spread / 2·spread frames back, rotated
  outColor = vec4(past(uv, age.r).r, past(uv, age.g).g, past(uv, age.b).b, 1.0);
}`

/** R, G and B from different past frames: colour fringes on motion only. Bindings: D1 with the 2026-11-05 ruling (the
 *  bass class binds reese; Auto-style maps it to wobble in Dubstep). */
export const rgbaDelay: NativeDef = {
  id: 'native/rgba-delay', name: 'RGBA delay', kind: 'filter', category: 'feedback', credit: 'VeeJay Wizard', inputs: [
    { name: 'spread', type: 'float', min: 0, max: 15, default: 4 }, // frames between the channels: 2·15 < 32 slots
    { name: 'rotate', type: 'event' }, // cycles which channel is the newest
  ],
  bind: {
    spread: { source: 'reese', amount: 1, attack: 0.05, release: 0.3, min: 1, max: 12 }, // the bass widens the split
    rotate: { source: 'snare', amount: 1, attack: 0, release: 0.1, min: 0, max: 1 }, // short release: one edge per snare
  },
  warm: async () => void fullscreenProgram(FS), // compiles only: Start allocates no ring
  create(gl) {
    const out = fullscreenProgram(FS)
    const r = ring(gl)
    let order = 0
    let held = false
    return {
      draw(f, v, src) {
        const fb = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null // the engine's target
        if (src) r.push(src) // null only in a generator slot: it then draws black
        if (v.rotate && !held) order = (order + 1) % 3 // on the rising edge: bound, it stays true while the envelope does
        held = !!v.rotate
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
        gl.viewport(0, 0, f.width, f.height)
        out({ uRing: r.tex, uSrc: src, uHead: r.head, uDepth: r.depth, uFilled: r.filled || 1, uRes: [f.width, f.height], uSpread: v.spread, uOrder: order })
      },
      dispose: r.dispose,
    }
  },
}

// Look: TD Time Machine TOP over a circular ramp (timemachineTOP.tox ex1; studied, rewritten). The ramp picks each
// pixel's age; past() reads it. uLag: between pushes the head is a frame old, so ages shift back half a slot. uTint is
// the example's per-frame hue step (hsvadj before the cache) applied at read time: the present keeps its colours.
const TM = `${PAST}
uniform float uLag, uSwirl, uSpan, uPhase, uRings, uTint;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0); // round on any aspect
  float age = uSpan * (uDepth - 1.0) * fract(uRings * length(p) + uSwirl * atan(p.y, p.x) / 6.2831853 - uPhase);
  vec3 c = past(uv, age - uLag).rgb;
  float a = 6.2831853 * uTint * age / (uDepth - 1.0);
  const vec3 k = vec3(0.57735027);
  outColor = vec4(c * cos(a) + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - cos(a)), 1.0); // hue: c turned about grey
}`

/** Each pixel from its own past frame, picked by a circular ramp: motion swirls through time. Stride 2: the ring holds
 *  every 2nd frame, so its 32 slots span 64. Bindings: D1 with the 2026-11-05 ruling (swirl binds reese; Auto-style
 *  maps it to wobble in Dubstep). */
export const timeMachine: NativeDef = {
  id: 'native/time-machine', name: 'Time machine', kind: 'filter', category: 'feedback', credit: 'VeeJay Wizard', inputs: [
    { name: 'swirl', type: 'float', min: 0, max: 1, default: 0 }, // 0 = rings, 1 = a one-arm spiral
    { name: 'depth', type: 'float', min: 0, max: 1, default: 0.5 }, // how far back the ramp reaches: 1 = all 64 frames
    { name: 'phase', type: 'float', min: 0, max: 1, default: 0 }, // slides the ramp: one cycle sweeps every pixel through it
    { name: 'rings', type: 'float', min: 0, max: 8, default: 2 }, // ramp cycles per stage height of radius (taste)
    { name: 'tint', type: 'float', min: 0, max: 1, default: 0 }, // hue turns across the whole ring: the time map in colour
  ],
  bind: {
    swirl: { source: 'reese', amount: 1, attack: 0.05, release: 0.3, min: 0, max: 1 }, // the bass twists the rings
    depth: { source: 'build', amount: 1, attack: 1, release: 1, min: 0.3, max: 1 }, // a build reaches further back
    phase: { source: 'beat', shape: 'saw', amount: 1, attack: 0, release: 0, min: 0, max: 1 }, // one sweep per beat
  },
  warm: async () => void fullscreenProgram(TM), // compiles only: Start allocates no ring
  create(gl) {
    const out = fullscreenProgram(TM)
    const r = ring(gl)
    let n = 0
    return {
      draw(f, v, src) {
        const fb = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null // the engine's target
        const lag = n++ & 1 // stride 2: frames since the last push
        if (src && !lag) r.push(src)
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
        gl.viewport(0, 0, f.width, f.height)
        out({ uRing: r.tex, uSrc: src, uHead: r.head, uDepth: r.depth, uFilled: r.filled || 1, uRes: [f.width, f.height], uLag: lag / 2, uSwirl: v.swirl, uSpan: v.depth, uPhase: v.phase, uRings: v.rings, uTint: v.tint })
      },
      dispose: r.dispose,
    }
  },
}
