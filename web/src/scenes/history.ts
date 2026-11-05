// History ring (plan_td_look.md CP2, design Variant A "History ring"): a native filter's last 32 inputs in one RGBA8
// TEXTURE_2D_ARRAY at ½ the stage, read through the ES 3.00 `past(uv, age)`. Natives own their programs, so the ISF
// 1.00 limit doesn't apply. Allocated in create() (prepare-ahead runs it mid-scene), never refit by the governor (a step
// costs nothing and the history survives it), freed in dispose(). A mode change takes effect at the next instance.
// Look: TD rgbaDelay.tox (studied, rewritten). No third-party code.
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

// past(): the CP2 contract. Ages clamp to what the ring holds, so a fresh instance (a cut) shows no black ghost.
const FS = `#version 300 es
precision highp float;
uniform highp sampler2DArray uRing;
uniform sampler2D uSrc;
uniform float uHead, uDepth, uFilled;
uniform vec2 uRes;
uniform float uSpread, uOrder;
out vec4 outColor;
vec4 tap(vec2 uv, float age) { return age < 0.5 ? texture(uSrc, uv) : texture(uRing, vec3(uv, mod(uHead - age, uDepth))); }
// age in slots; 0 = uSrc at full res; fractions mix 2 slots; clamped to uFilled - 1
vec4 past(vec2 uv, float age) {
  age = clamp(age, 0.0, uFilled - 1.0);
  float a = floor(age);
  return mix(tap(uv, a), tap(uv, min(a + 1.0, uFilled - 1.0)), age - a);
}
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
