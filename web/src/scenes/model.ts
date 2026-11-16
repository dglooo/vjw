// native/model (GPU3D S1-T spike, design_gpu3d § Model rev 1): the Khronos Fox (model CC0 by PixelMannen; rig and
// animation CC-BY-4.0 by tomkranis; glTF conversion CC-BY-4.0; web/THIRD_PARTY.md) through three r187 on OUR context.
// create() starts (or joins) the memoised load of three/host.ts; hidden() is true until it is ready, and stays true
// after a failed load (one console error). An instance owns its RT (1 sample + depth, or `samples` 4) and draws on its
// layer's clock. The RT holds premultiplied linear colour; the composite un-premultiplies, tone-maps, encodes sRGB and
// writes straight alpha under `normal`, premultiplied colour under every other blend (lead ruling N3).
import type { Blend } from '../doc'
import { fullscreenProgram, gl as stageGl } from '../gl/engine'
import type { NativeDef } from '../gl/scene'
import type { Spike } from '../three/host'

const FOX = '/models/Fox.glb'
/** The S1-T harness's switches and records (three/host.ts Spike). */
export const MODEL_SPIKE: Spike = { entry: 0, skipCtorReset: false, diff: false, diffs: [], alpha: 0, info: null, list: null, readyAt: 0, draws: 0, drawMs: [] }
type Host = Awaited<ReturnType<typeof import('../three/host').load>>
let loading: Promise<Host> | undefined
let host: Host | null = null
/** The memoised load: the host once, the GLB once (one context, one URL). `ponytail:` session cache, no eviction. */
const load = (gl: WebGL2RenderingContext) => (loading ??= import('../three/host')
  .then((m) => m.load(gl, FOX, MODEL_SPIKE))
  .then((h) => ((MODEL_SPIKE.readyAt = performance.now()), (host = h)), (e: unknown) => {
    console.error('native/model: the load failed', e)
    throw e
  }))

const COMPOSITE = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uRes;
uniform float uPremul; // 1: every blend but normal (N3)
out vec4 outColor;
vec3 aces(vec3 x) { return clamp(x * (2.51 * x + 0.03) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); } // Narkowicz 2015
vec3 srgb(vec3 c) { return mix(12.92 * c, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  vec4 c = texture(uSrc, gl_FragCoord.xy / uRes); // premultiplied linear
  vec3 d = srgb(aces(c.rgb / max(c.a, 1e-4)));      // straight display
  outColor = vec4(d * mix(1.0, c.a, uPremul), c.a);
}`
let composite: ReturnType<typeof fullscreenProgram> | undefined

export const model: NativeDef = {
  id: 'native/model', name: 'Model', kind: 'generator', category: 'geometry',
  credit: 'Fox: PixelMannen (CC0), rig + animation tomkranis (CC-BY-4.0), glTF Khronos (CC-BY-4.0); three.js r187 (MIT)',
  inputs: [
    { name: 'glass', type: 'float', min: 0, max: 1, default: 0 },
    { name: 'samples', type: 'long', values: [1, 4], labels: ['1', '4'], default: 1 },
  ],
  warm: () => load(stageGl).then(() => {}, () => {}), // Start waits for it; a failed load leaves the layer hidden
  create(gl) {
    void load(gl).catch(() => {}) // logged once in load()
    composite ??= fullscreenProgram(COMPOSITE)
    let rt: ReturnType<Host['render']> | null = null
    const u = { uSrc: null as WebGLTexture | null, uRes: [0, 0], uPremul: 0 }
    return {
      hidden: () => !host,
      draw(f, v, _src, _s, blend?: Blend) {
        if (!host) return
        const t0 = performance.now()
        rt = host.render(rt, f.width, f.height, Math.round(v.samples as number) >= 4 ? 4 : 0, f.time, v.glass as number) // restores dst + viewport
        u.uSrc = host.texture(rt)
        u.uRes = [f.width, f.height]
        u.uPremul = blend && blend !== 'normal' ? 1 : 0
        composite!(u)
        MODEL_SPIKE.draws++
        if (MODEL_SPIKE.drawMs.push(performance.now() - t0) > 4096) MODEL_SPIKE.drawMs.shift()
      },
      dispose() {
        if (host && rt) host.free(rt) // the shared scene, material and env live for the session
      },
    }
  },
}
