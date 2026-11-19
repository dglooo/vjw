// The vs3 host (agents/guides/guide_vs3_port.md; research_donor_vs3_scenes.md §1, §3b, §4, §5): one native per copied
// scene of donor/vs3 (the friends' three.js engine, used with permission, 2026-11-19). A scene is the donor contract
// { scene, camera, params, update(s, dt, t), resize(w, h) }, copied near-verbatim into vs3/kit/scenes/ with its
// default export turned into a factory, so every layer owns its scene object.
// Lazy like native/model: three (the shared renderer, three/host.ts three()), the donor libs and the scene module load
// on the first create(); hidden() until the scene's programs compiled. Per frame, in three/host.ts's guard: PAL ← the
// scene's palette, s ← our sources (signal()), update + render into the layer's HalfFloat RT, with setRenderTarget(null)
// and getDrawingBufferSize() meaning that RT (screen()). Then on our passes: the scene's own `bloom` field through our
// gl/bloom.ts (the natives' internal bloom; strength as the donor engine.js:193, × FX_DEFAULTS bloomMul) and the donor
// finish (FinishShader: aberration, BRIGHTNESS 1.4 and its soft tone map, vignette) into the bound FB. Colour: a donor
// ShaderMaterial writes display values (no colorspace chunk; PAL holds three's linear-converted hex, as in the donor),
// so the finish is the only grade: no ACES, no sRGB (unlike native/model). The rest of the donor post chain is the
// built-in's fx (scenes/builtin.ts VS3). Light on a hit only through ⚡ `hit` (flashGate ≤ 3/s, I-FL1): it is the
// donor `kick`, its rise the donor `onKick`, the bloom's kick term and the finish's kick aberration.
import type { Sources } from '../bind'
import { createBloom } from '../gl/bloom'
import { fullscreenProgram, gl as stageGl } from '../gl/engine'
import { glState, PASS_LIST, restore } from '../gl/glstate'
import type { NativeDef } from '../gl/scene'
import { MODEL_SPIKE } from '../scenes/model'
import { rose } from '../scenes/shatter'

/** The donor `s` fields the ported scenes read (research §1). Add a field when a ported scene reads it (guide § Signal). */
export interface Signal { onKick: number; kick: number; sub: number; mids: number; highs: number; energy: number }
/** Our sources → the donor `s` (research §4): the levels from the donor-mode core's bands (the closest edges; it runs in
 *  every mode), the kick from `hit` (the ⚡ input, bound to our kick), onKick on its rise × our kickAccent (the kick's
 *  velocity: .7 at the kicks' mean, 1 for a loud one; `hit` when there is none). */
export function signal(src: Readonly<Sources>, hit: number, prev: number, out: Signal): Signal {
  out.kick = hit
  out.onKick = rose(prev, hit) ? src.kickAccent || hit : 0
  out.sub = src.syn_BassLevel ?? 0 // 30-150 Hz (donor: the 60 Hz octave)
  out.mids = src.syn_MidLevel ?? 0 // 250-2000 Hz (donor: 240-960)
  out.highs = src.syn_MidHighLevel ?? 0 // 2-6 kHz (donor: 1.9-3.8 k)
  out.energy = src.syn_Level ?? 0 // 30-16 kHz (donor: band energy × loudness)
  return out
}

interface Screen { setRenderTarget(t: unknown, ...a: unknown[]): void; getDrawingBufferSize(v: { set(x: number, y: number): unknown }): unknown }
/** While `fn` runs, the scene's screen is `rt` (research §3b): setRenderTarget(null) binds rt (7 donor scenes call it
 *  after their sims), getDrawingBufferSize() reads rt's size (11 files size by it). `made` collects every target the
 *  scene binds, for dispose(). */
export function screen<T>(R: Screen, rt: { width: number; height: number }, made: Set<unknown>, fn: () => T): T {
  const { setRenderTarget: set, getDrawingBufferSize: size } = R
  R.setRenderTarget = (t, ...a) => (made.add(t ?? rt), set.call(R, t ?? rt, ...a))
  R.getDrawingBufferSize = (v) => v.set(rt.width, rt.height)
  try {
    return fn()
  } finally {
    Object.assign(R, { setRenderTarget: set, getDrawingBufferSize: size })
  }
}

const FINISH = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uRes;
uniform float uAber, uVig;
out vec4 outColor;
void main() { // donor engine/post-shaders.js FinishShader, the grain and the watermark left out
  vec2 uv = gl_FragCoord.xy / uRes, d = uv - 0.5, off = d * uAber * 0.003;
  vec3 col = vec3(texture(uSrc, uv + off).r, texture(uSrc, uv).g, texture(uSrc, uv - off).b) * 1.4; // BRIGHTNESS 1.4
  col /= 1.0 + dot(col, vec3(0.2126, 0.7152, 0.0722)) * 0.9; // the soft tone map: no palette whites out
  outColor = vec4(col * (1.0 - uVig * dot(d, d) * 2.4), 1.0);
}`
let finish: ReturnType<typeof fullscreenProgram> | undefined
const SLOTS = ['bg', 'shadow', 'mid', 'accent', 'glow'] as const

let libs: Promise<Awaited<ReturnType<typeof open>>> | undefined
async function open(gl: WebGL2RenderingContext) {
  const [h, THREE, common, palette, context] = await Promise.all([import('../three/host'), import('three'), import('./kit/lib/common.js'), import('./kit/lib/palette.js'), import('./kit/lib/context.js')])
  const t = h.three(gl, MODEL_SPIKE)
  context.ctx.renderer = t.R // morphogen and the other sims reach the renderer here
  return { ...t, fit: h.fit, RENDER_LIST: h.RENDER_LIST, Color: THREE.Color, PAL: common.PAL, PRESETS: palette.PRESETS as { name: string; colors: string[] }[] }
}
type Lib = Awaited<ReturnType<typeof open>>
/** The donor scene as the host reads it (research §1). */
interface Scene { scene: { traverse(f: (o: { geometry?: { dispose(): void }; material?: { dispose(): void } }) => void): void }; camera: unknown; update(s: Signal, dt: number, t: number): void; resize?(w: number, h: number): void; bloom?: { strength: number; gain: number; kick?: number } }

/** FX_DEFAULTS' bloomMul and finish keys (original renderer/main.js:167+), SCENE_PALETTE (main.js:7780; else nocturne). */
export interface Look { palette: string; bloomMul: number; aber: number; vignette: number }

/** One scene's frame loop on its own RT; resolves once its programs compiled (rule 5: no compile on a visible frame). */
async function start(gl: WebGL2RenderingContext, L: Lib, sc: Scene, look: Look) {
  const { R, guard, texture } = L
  const pal = L.PRESETS.find((p) => p.name === look.palette)!.colors.map((c) => new L.Color(c))
  const made = new Set<{ dispose(): void }>()
  const s = {} as Signal
  let rt = L.fit(null, 16, 16, 1), prev = 0, w = 0, h = 0
  await guard('compileAsync', () => (R.setRenderTarget(rt), R.compileAsync(sc.scene, sc.camera)))
  finish ??= fullscreenProgram(FINISH)
  const bloom = createBloom(gl)
  return {
    draw(f: { width: number; height: number; dt: number; time: number }, hit: number, src: Readonly<Sources>) {
      signal(src, hit, prev, s)
      prev = hit
      guard('render', () => {
        rt = L.fit(rt, f.width, f.height, 1)
        if (f.width !== w || f.height !== h) sc.resize?.((w = f.width), (h = f.height)) // px, not the donor's CSS px: the scenes read the aspect
        pal.forEach((c, i) => L.PAL[SLOTS[i]].copy(c)) // the uniforms hold PAL's slots: this scene's colours for its draw
        screen(R, rt, made, () => {
          R.setRenderTarget(rt)
          sc.update(s, f.dt, f.time)
          R.setRenderTarget(rt) // a sim may have left its own target bound
          R.render(sc.scene, sc.camera)
        })
      }, L.RENDER_LIST) // restores the engine's target and viewport
      const out = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null, keep = glState(gl, PASS_LIST) // GPU3D I-GL2
      const b = sc.bloom, k = b ? (b.strength + s.energy * b.gain + hit * (b.kick ?? 0.35)) * look.bloomMul : 0
      const lit = k > 0 ? bloom.apply(texture(rt), f.width, f.height, k) : texture(rt) // binds its own targets
      gl.bindFramebuffer(gl.FRAMEBUFFER, out)
      gl.viewport(0, 0, f.width, f.height)
      finish!({ uSrc: lit, uRes: [f.width, f.height], uAber: look.aber * (0.22 + hit), uVig: look.vignette })
      restore(gl, keep)
    },
    dispose() {
      guard('dispose', () => {
        for (const t of made) t.dispose() // the sims' targets and ours (a second dispose is a no-op in three)
        rt.dispose()
        sc.scene.traverse((o) => (o.geometry?.dispose(), o.material?.dispose()))
      })
      bloom.dispose()
    },
  }
}

/** The native of one copied scene: `load` imports its file, `look` its engine keys (FX_DEFAULTS, SCENE_PALETTE). */
export function vs3(name: string, load: () => Promise<{ default: () => Scene }>, look: Look): NativeDef {
  const ready = (gl: WebGL2RenderingContext) => Promise.all([(libs ??= open(gl)), load()])
  return {
    id: `native/vs3-${name}`, name: `vs3 ${name}`, kind: 'generator', credit: "vs3: the friends' three.js engine, used with permission; three.js r187 (MIT)",
    inputs: [{ name: 'hit', type: 'float', min: 0, max: 1, default: 0 }], // ⚡ the donor kick: the one input a hit lights through
    flash: ['hit'],
    warm: () => ready(stageGl).then(() => {}, () => {}), // Start waits for it; a failed load leaves the layer hidden
    create(gl) {
      let run: Awaited<ReturnType<typeof start>> | null = null, gone = false
      ready(gl).then(([L, m]) => start(gl, L, m.default(), look)).then((r) => (gone ? r.dispose() : (run = r)), (e: unknown) => console.error(`native/vs3-${name}: the load failed`, e))
      return {
        hidden: () => !run,
        draw(f, v, _src, s) {
          run?.draw(f, v.hit as number, s ?? {})
        },
        dispose() {
          gone = true
          run?.dispose()
        },
      }
    },
  }
}

// The ported scenes (guide § Register): one line each. Looks from the original main.js FX_DEFAULTS rows 168, 178, 213;
// 169 (mandala), 268 (tendril), 179 (citadel), 228 (descent).
export const VS3: readonly NativeDef[] = [
  vs3('ink', () => import('./kit/scenes/ink.js'), { palette: 'nocturne', bloomMul: 1.85, aber: 4, vignette: 0 }),
  vs3('relic', () => import('./kit/scenes/relic.js'), { palette: 'nocturne', bloomMul: 1.15, aber: 1.4, vignette: 0.5 }),
  vs3('morphogen', () => import('./kit/scenes/morphogen.js'), { palette: 'pearl', bloomMul: 1, aber: 1, vignette: 0.25 }),
  vs3('mandala', () => import('./kit/scenes/kaleido.js'), { palette: 'nocturne', bloomMul: 2.5, aber: 1.6, vignette: 0.8 }),
  vs3('tendril', () => import('./kit/scenes/tendril.js'), { palette: 'nocturne', bloomMul: 1.1, aber: 0.8, vignette: 0.35 }),
  vs3('citadel', () => import('./kit/scenes/citadel.js'), { palette: 'nocturne', bloomMul: 1.1, aber: 1.4, vignette: 0.45 }),
  vs3('descent', () => import('./kit/scenes/descent.js'), { palette: 'nocturne', bloomMul: 1.1, aber: 0.5, vignette: 0.3 }),
]
