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
// donor `kick` (drawn with the natives' rise slew, gl/post.ts heatStep: synapse's kick swell made 19 one-frame luma
// steps > .10 in 15 s without it, 0 with it), its rise the donor `onKick`, the bloom's kick term and the finish's kick
// aberration. A scene that reads onMid / onHigh gets a second ⚡ `mid` (look.mid): its rise is both. Analyser 'vs3': the
// levels and specHi come from the vs3 core (audio/vs3.ts vs3Live), and gl/engine.ts's hear() binds ⚡ hit / mid to its
// kick and onMid, so its light passes the same gate.
import { vs3Live, type Vs3Out } from '../audio/vs3'
import type { Sources } from '../bind'
import { createBloom } from '../gl/bloom'
import { copy, fullscreenProgram, gl as stageGl } from '../gl/engine'
import { glState, PASS_LIST, restore } from '../gl/glstate'
import { heatStep } from '../gl/post'
import type { NativeDef } from '../gl/scene'
import { MODEL_SPIKE } from '../scenes/model'
import { rose } from '../scenes/shatter'

/** The donor `s` fields the ported scenes read (research §1). Add a field when a ported scene reads it (guide § Signal). */
export interface Signal { onKick: number; kick: number; onMid: number; onHigh: number; sub: number; mids: number; highs: number; air: number; energy: number; specHi: Float32Array; bands?: Float32Array }
/** Our sources → the donor `s` (research §4): the levels from the donor-mode core's bands (the closest edges; it runs in
 *  every mode), the kick from `hit` (the ⚡ input, bound to our kick), onKick on its rise × our kickAccent (the kick's
 *  velocity: .7 at the kicks' mean, 1 for a loud one; `hit` when there is none). onMid and onHigh: both on the rise of
 *  `mid` (the second ⚡ input, bound to our snare). One gated input for the two: they add light (synapse's nodes, anemone's
 *  sparkle), and hats at their own rate would spend the whole 3/s flash budget, the kick's share too. `v` (analyser 'vs3'):
 *  the levels and bands are the vs3 core's own, and onKick is the gated hit's rise at its value (`hit` and `mid` then
 *  follow the core's kick and onMid: gl/engine.ts hear()). */
export function signal(src: Readonly<Sources>, hit: number, prev: number, out: Signal, mid = 0, prevMid = 0, v: Vs3Out | null = null): Signal {
  out.kick = hit
  out.onKick = rose(prev, hit) ? (v ? hit : src.kickAccent || hit) : 0
  out.onMid = out.onHigh = rose(prevMid, mid) ? mid : 0
  if (v) {
    out.sub = v.sub
    out.mids = v.mids
    out.highs = v.highs
    out.air = v.air
    out.energy = v.energy
    out.bands = v.bands
    return out
  }
  out.sub = src.syn_BassLevel ?? 0 // 30-150 Hz (donor: the 60 Hz octave)
  out.mids = src.syn_MidLevel ?? 0 // 250-2000 Hz (donor: 240-960)
  out.highs = src.syn_MidHighLevel ?? 0 // 2-6 kHz (donor: 1.9-3.8 k)
  out.air = src.syn_HighLevel ?? 0 // 6-16 kHz (donor: the 7.7 kHz octave)
  out.energy = src.syn_Level ?? 0 // 30-16 kHz (donor: band energy × loudness)
  out.bands = undefined // ours has no octave bands (a switch back from vs3 drops its)
  return out
}

/** The donor `specHi` (192 log display bins, 35 Hz-18 kHz, AGC; sand, signal) from the closest the host has: our 32 log
 *  bands (30 Hz-16 kHz, 0-1), linear in the index. ponytail: no AGC, no display floor; the donor analyser's own bins
 *  if a scene's peaks read wrong. */
export function specHi(src: Readonly<Sources>, out: Float32Array): Float32Array {
  for (let i = 0; i < out.length; i++) {
    const x = (i * 31) / (out.length - 1), j = Math.min(30, Math.floor(x)), a = src[`band${j}`] ?? 0
    out[i] = a + ((src[`band${j + 1}`] ?? 0) - a) * (x - j)
  }
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
uniform float uAber, uVig, uFaithful;
out vec4 outColor;
void main() { // donor engine/post-shaders.js FinishShader, the grain and the watermark left out
  vec2 uv = gl_FragCoord.xy / uRes, d = uv - 0.5, off = d * uAber * 0.003;
  vec3 raw = vec3(texture(uSrc, uv + off).r, texture(uSrc, uv).g, texture(uSrc, uv - off).b), col = raw * 1.4; // BRIGHTNESS 1.4
  col /= 1.0 + dot(col, vec3(0.2126, 0.7152, 0.0722)) * 0.9; // the soft tone map: no palette whites out
  col = mix(col, max(raw, 0.0), uFaithful); // a filter's picture skips the grade (original main.js:2130, uGainF 1)
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
interface Scene { scene: { traverse(f: (o: { geometry?: { dispose(): void }; material?: { dispose(): void } }) => void): void }; camera: unknown; update(s: Signal, dt: number, t: number): void; resize?(w: number, h: number): void; bloom?: { strength: number; gain: number; kick?: number }; source?: { sourceTexture: WebGLTexture | null } }

/** FX_DEFAULTS' bloomMul and finish keys (original renderer/main.js:167+), SCENE_PALETTE (main.js:7780; else nocturne).
 *  `filter` (limitless): a filter native; the scene's `source` (a three ExternalTexture) gets the previous layer each
 *  frame, shown as the original shows a dropped clip (its faithful path, main.js:2397): no grade, no resting bloom. */
export interface Look { palette: string; bloomMul: number; aber: number; vignette: number; mid?: true; filter?: true }

/** One scene's frame loop on its own RT; resolves once its programs compiled (rule 5: no compile on a visible frame). */
async function start(gl: WebGL2RenderingContext, L: Lib, sc: Scene, look: Look) {
  const { R, guard, texture } = L
  const pal = L.PRESETS.find((p) => p.name === look.palette)!.colors.map((c) => new L.Color(c))
  const made = new Set<{ dispose(): void }>()
  const s = { specHi: new Float32Array(192) } as Signal
  let rt = L.fit(null, 16, 16, 1), prev = 0, prevMid = 0, hot = 0, w = 0, h = 0
  await guard('compileAsync', () => (R.setRenderTarget(rt), R.compileAsync(sc.scene, sc.camera)))
  finish ??= fullscreenProgram(FINISH)
  const bloom = createBloom(gl, 8, 0.3) // the donor's threshold (luma .3); 8 levels reach its widest mip's ≈ 350 px
  return {
    draw(f: { width: number; height: number; dt: number; time: number }, hit: number, mid: number, src: Readonly<Sources>, input: WebGLTexture | null) {
      if (sc.source) sc.source.sourceTexture = input // a filter's picture: the previous layer
      const v = vs3Live.s // analyser 'vs3': the core's levels and spectrum
      signal(src, hit, prev, s, mid, prevMid, v)
      s.kick = hot = heatStep(hot, hit, f.dt) // the kick as drawn (I-FL1); onKick stays on the raw rise
      prev = hit
      prevMid = mid
      if (v) s.specHi.set(v.specHi)
      else specHi(src, s.specHi)
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
      const b = sc.bloom, k = b ? ((look.filter ? 0 : b.strength) + s.energy * b.gain + hot * (b.kick ?? 0.35)) * look.bloomMul : 0 // a filter: no resting glow (main.js:15700)
      // The donor's glow is 9 k² (three r170 UnrealBloomPass: its composite is k × Σ factors (3 at radius .4) × blur, alpha
      // 3k too, and the additive blend is SRC_ALPHA, ONE on a half-float target, so the colour lands × 3k unclamped)
      const lit = k > 0 ? bloom.apply(texture(rt), f.width, f.height, 9 * k * k) : texture(rt) // binds its own targets
      gl.bindFramebuffer(gl.FRAMEBUFFER, out)
      gl.viewport(0, 0, f.width, f.height)
      finish!({ uSrc: lit, uRes: [f.width, f.height], uAber: look.aber * (0.22 + hot), uVig: look.vignette, uFaithful: look.filter ? 1 : 0 })
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
  const flash = look.mid ? ['hit', 'mid'] : ['hit']
  return {
    id: `native/vs3-${name}`, name: `vs3 ${name}`, kind: look.filter ? 'filter' : 'generator', credit: "vs3: the friends' three.js engine, used with permission; three.js r187 (MIT)",
    inputs: flash.map((n) => ({ name: n, type: 'float', min: 0, max: 1, default: 0 })), // ⚡ the donor kick (+ onMid / onHigh): all a hit lights through
    flash,
    warm: () => ready(stageGl).then(() => {}, () => {}), // Start waits for it; a failed load leaves the layer hidden
    create(gl) {
      let run: Awaited<ReturnType<typeof start>> | null = null, gone = false
      ready(gl).then(([L, m]) => start(gl, L, m.default(), look)).then((r) => (gone ? r.dispose() : (run = r)), (e: unknown) => console.error(`native/vs3-${name}: the load failed`, e))
      return {
        hidden: () => !run,
        draw(f, v, input, s) {
          if (run) run.draw(f, v.hit as number, (v.mid as number | undefined) ?? 0, s ?? {}, input ?? null)
          else if (input) copy({ uSrc: input, uRes: [f.width, f.height] }) // a filter passes its picture through until it runs
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
// 169 (mandala), 268 (tendril), 179 (citadel), 228 (descent),
// 191 (oracle), 187 (idol), 208 (spacetime), 200 (ingot), 204 (gate), 171 (synapse),
// 194 (anemone); from batch 3 on: the scene's row, or the donor's BASE_POST 1, 1, .34 when it has none.
export const VS3: readonly NativeDef[] = [
  vs3('ink', () => import('./kit/scenes/ink.js'), { palette: 'nocturne', bloomMul: 1.85, aber: 4, vignette: 0 }),
  vs3('relic', () => import('./kit/scenes/relic.js'), { palette: 'nocturne', bloomMul: 1.15, aber: 1.4, vignette: 0.5 }),
  vs3('morphogen', () => import('./kit/scenes/morphogen.js'), { palette: 'pearl', bloomMul: 1, aber: 1, vignette: 0.25 }),
  vs3('mandala', () => import('./kit/scenes/kaleido.js'), { palette: 'nocturne', bloomMul: 2.5, aber: 1.6, vignette: 0.8 }),
  vs3('tendril', () => import('./kit/scenes/tendril.js'), { palette: 'nocturne', bloomMul: 1.1, aber: 0.8, vignette: 0.35 }),
  vs3('citadel', () => import('./kit/scenes/citadel.js'), { palette: 'nocturne', bloomMul: 1.1, aber: 1.4, vignette: 0.45 }),
  vs3('descent', () => import('./kit/scenes/descent.js'), { palette: 'nocturne', bloomMul: 1.1, aber: 0.5, vignette: 0.3 }),
  vs3('oracle', () => import('./kit/scenes/oracle.js'), { palette: 'nocturne', bloomMul: 1.4, aber: 1.4, vignette: 0.55 }),
  vs3('idol', () => import('./kit/scenes/idol.js'), { palette: 'nocturne', bloomMul: 1.2, aber: 1.6, vignette: 0.5 }),
  vs3('spacetime', () => import('./kit/scenes/spacetime.js'), { palette: 'nocturne', bloomMul: 1.6, aber: 2.2, vignette: 0.4 }),
  vs3('ingot', () => import('./kit/scenes/ingot.js'), { palette: 'nocturne', bloomMul: 1.1, aber: 1.2, vignette: 0.45 }),
  vs3('gate', () => import('./kit/scenes/gate.js'), { palette: 'nocturne', bloomMul: 1.1, aber: 1.2, vignette: 0.55 }),
  vs3('synapse', () => import('./kit/scenes/synapse.js'), { palette: 'nocturne', bloomMul: 1.7, aber: 1.5, vignette: 0.3, mid: true }),
  vs3('anemone', () => import('./kit/scenes/anemone.js'), { palette: 'nocturne', bloomMul: 1.2, aber: 2.4, vignette: 0.45 }), // no `mid`: its onHigh is a sparkle, not worth the kicks the snare takes from the flash budget
  vs3('aurora', () => import('./kit/scenes/aurora.js'), { palette: 'nocturne', bloomMul: 1, aber: 1, vignette: 0.34 }),
  vs3('blob', () => import('./kit/scenes/blob.js'), { palette: 'nocturne', bloomMul: 1, aber: 1, vignette: 0.34 }),
  vs3('echo', () => import('./kit/scenes/echo.js'), { palette: 'nocturne', bloomMul: 1, aber: 1, vignette: 0.34, mid: true }),
  vs3('flow', () => import('./kit/scenes/flow.js'), { palette: 'nocturne', bloomMul: 1, aber: 1, vignette: 0.34 }),
  vs3('fract', () => import('./kit/scenes/fract.js'), { palette: 'nocturne', bloomMul: 1, aber: 1, vignette: 0.34 }),
  vs3('signal', () => import('./kit/scenes/signal.js'), { palette: 'nocturne', bloomMul: 0.9, aber: 0.6, vignette: 0.12 }),
  vs3('sand', () => import('./kit/scenes/sand.js'), { palette: 'nocturne', bloomMul: 1.5, aber: 1.2, vignette: 0.35 }),
  vs3('chorus', () => import('./kit/scenes/chorus.js'), { palette: 'sodium', bloomMul: 1.2, aber: 1.2, vignette: 0.5 }), // its thumb's amber: the factory preset ★ chorus — choir (main.js:9826)
  vs3('visage', () => import('./kit/scenes/visage.js'), { palette: 'nocturne', bloomMul: 1.2, aber: 1.4, vignette: 0.5 }),
  vs3('limitless3d', () => import('./kit/scenes/limitless3d.js'), { palette: 'nocturne', bloomMul: 1.1, aber: 1.2, vignette: 0.35 }),
  vs3('lasers', () => import('./kit/scenes/lasers.js'), { palette: 'vapor', bloomMul: 1, aber: 0, vignette: 0.2 }),
  // Batch 2a (2026-11-19). Rows 254 (crystal), 255 (pearl), 270 (spiral): lib/recursive-flight.js.
  vs3('crystal', () => import('./kit/scenes/crystal.js'), { palette: 'nocturne', bloomMul: 0.8, aber: 0, vignette: 0.2 }),
  vs3('pearl', () => import('./kit/scenes/pearl.js'), { palette: 'nocturne', bloomMul: 0.8, aber: 0, vignette: 0.2 }),
  vs3('spiral', () => import('./kit/scenes/spiral.js'), { palette: 'nocturne', bloomMul: 0.8, aber: 0, vignette: 0.2 }),
  vs3('fluid', () => import('./kit/scenes/fluid.js'), { palette: 'nocturne', bloomMul: 1.3, aber: 1.4, vignette: 0.3 }),
  vs3('forge', () => import('./kit/scenes/forge.js'), { palette: 'nocturne', bloomMul: 0.9, aber: 0.8, vignette: 0.4 }),
  vs3('pelt', () => import('./kit/scenes/pelt.js'), { palette: 'nocturne', bloomMul: 1.1, aber: 1.2, vignette: 0.5 }),
  vs3('wisp', () => import('./kit/scenes/wisp.js'), { palette: 'nocturne', bloomMul: 1.15, aber: 1.6, vignette: 0.28 }),
  vs3('morphogen2', () => import('./kit/scenes/morphogen2.js'), { palette: 'glacial', bloomMul: 1, aber: 0.8, vignette: 0.05 }),
  vs3('locus', () => import('./kit/scenes/locus.js'), { palette: 'nocturne', bloomMul: 1.3, aber: 1.2, vignette: 0.4 }),
  vs3('vesica', () => import('./kit/scenes/vesica.js'), { palette: 'nocturne', bloomMul: 1.2, aber: 0.6, vignette: 0.35 }),
  vs3('grove', () => import('./kit/scenes/grove.js'), { palette: 'nocturne', bloomMul: 1.15, aber: 1.2, vignette: 0.4 }), // row 226
  // Row 170. A filter: the picture it bends is the layer under it (melt, the file's default mode; params are no inputs yet).
  vs3('limitless', () => import('./kit/scenes/limitless.js'), { palette: 'nocturne', bloomMul: 1.1, aber: 2, vignette: 0.3, filter: true }),
]
