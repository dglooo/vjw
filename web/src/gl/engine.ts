// WebGL2 engine on #stage (Variant A): the shot's scene(s) render into internal targets at base × scale, then one
// final pass upscales them into the stage: a copy, or the transition during a fade (design E7), then the heat post
// pass blends over it (design C6).
import {
  bindFramebufferInfo, createBufferInfoFromArrays, createFramebufferInfo, createProgramInfo, createProgramInfoAsync,
  createTexture, drawBufferInfo, resizeFramebufferInfo, setBuffersAndAttributes, setUniforms, type ProgramInfo,
} from 'twgl.js'
import { hear, vs3Live } from '../audio/vs3'
import { sourcesFor, type Sources } from '../bind'
import type { Shot } from '../director'
import { defaults, type SceneId } from '../doc'
import type { FrameInput } from '../frame'
import type { EffectDef, ShaderDef } from '../fx/types'
import type { Live } from './live'

export const stage = document.getElementById('stage') as HTMLCanvasElement
export const gl = stage.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: false })!
stage.addEventListener('webglcontextlost', () => location.reload())
/** The editor screens (2b S1, the shader editor): the stage CSS-scaled into `cell`, letterboxed centre on centre, until
 *  the returned stop. A transform leaves clientWidth alone, so measure(), the governor and the ring sizes stay live,
 *  and nothing reallocates on the way in or out. The stage sits at 0,0 and scales about its own centre. */
export function fitStage(cell: HTMLElement) {
  const ro = new ResizeObserver(() => {
    const r = cell.getBoundingClientRect()
    const w = stage.clientWidth
    const h = stage.clientHeight
    const k = Math.min(r.width / w, r.height / h)
    stage.style.transform = `translate(${r.x + (r.width - w) / 2}px, ${r.y + (r.height - h) / 2}px) scale(${k})`
  })
  ro.observe(cell)
  return () => {
    ro.disconnect()
    stage.style.transform = ''
  }
}

/** Filled by app.ts: live.ts and the catalog (through its natives) import this engine, so it can't import them (no
 *  import cycle). */
export const scenes: { live?: (id: SceneId) => Live; catalog?: ReadonlyMap<string, EffectDef> } = {}
const HALF = !!gl.getExtension('EXT_color_buffer_float') // half-float targets are renderable
// GPU timer queries (G3). The DOM typings don't name this extension: these are the two constants used.
const timer: { TIME_ELAPSED_EXT: GLenum; GPU_DISJOINT_EXT: GLenum } | null = gl.getExtension('EXT_disjoint_timer_query_webgl2')
const RING = 8 // per scene: timer queries in flight, and results in its median
// Knob ⚠️ (design E3): the dB window the FFT texture maps to bytes 0…255, an AnalyserNode's default (as Shadertoy's).
const FFT_MIN_DB = -100
const FFT_MAX_DB = -30
const BINS = 512 // audio texture width: the analyser's 512 bins, and as many waveform samples

const VS = `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }`
const triangle = createBufferInfoFromArrays(gl, { position: { numComponents: 2, data: [-1, -1, 3, -1, -1, 3] } })

const programs = new Map<string, ProgramInfo>()
/** Compiled once per source pair. twgl returns null (and logs the log) when it fails to compile or link. */
export function program(vs: string, fs: string): ProgramInfo {
  const key = vs + '\0' + fs
  let info = programs.get(key)
  if (!info) programs.set(key, (info = createProgramInfo(gl, [vs, fs])))
  return info
}
/** program() off the main thread (KHR_parallel_shader_compile) into the same cache: the warm-up's path. Rejects when it
 *  fails to compile or link (twgl logged why), caching nothing. */
export function programAsync(vs: string, fs: string): Promise<unknown> {
  const key = vs + '\0' + fs
  if (programs.has(key)) return Promise.resolve()
  return createProgramInfoAsync(gl, [vs, fs]).then((info) => programs.has(key) || programs.set(key, info))
}

/** The shared fullscreen triangle with this program and uniforms, into the bound framebuffer. */
export function draw(info: ProgramInfo, uniforms: Record<string, unknown>) {
  gl.useProgram(info.program)
  setBuffersAndAttributes(gl, info, triangle)
  setUniforms(info, uniforms)
  drawBufferInfo(gl, triangle)
}

/** One fullscreen-triangle pass with the given fragment shader; returns its draw call. */
export function fullscreenProgram(fs: string) {
  const info = program(VS, fs)
  return (uniforms: Record<string, unknown>) => draw(info, uniforms)
}

/** A texture over the bound target at any size, linear: the stage pass without a fade, the persistent resample and the
 *  history ring's push (scenes/history.ts). */
export const copy = fullscreenProgram(`#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uRes;
out vec4 outColor;
void main() {
  outColor = texture(uSrc, gl_FragCoord.xy / uRes);
}`)

/** A color-only target, linear filtering, clamped (`tex`: twgl's min/minMag/wrap otherwise, kept across fit()): RGBA8, or
 *  half-float with `hdr` where the GPU renders to it. A
 *  `persistent` one keeps its content when fit() resizes it, resampled into the new size (design E2: trails survive a
 *  governor step). Every target starts cleared: WebGL zero-fills new textures. fit() may leave the target bound. */
export function renderTarget(hdr = false, persistent = false, tex: { min?: number; minMag?: number; wrap?: number } = {}) {
  const attach = [{ ...(hdr && HALF ? { internalFormat: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT } : { format: gl.RGBA, type: gl.UNSIGNED_BYTE }), ...tex }]
  const fb = createFramebufferInfo(gl, attach, 1, 1)
  return Object.assign(fb, {
    fit(w: number, h: number) {
      if (fb.width === w && fb.height === h) return
      if (!persistent) return resizeFramebufferInfo(gl, fb, attach, w, h)
      const { framebuffer, attachments: [old] } = fb
      bindFramebufferInfo(gl, Object.assign(fb, createFramebufferInfo(gl, attach, w, h)))
      copy({ uSrc: old, uRes: [w, h] })
      gl.deleteFramebuffer(framebuffer)
      gl.deleteTexture(old)
    },
  })
}

export type Target = ReturnType<typeof renderTarget>
const shots = [renderTarget(), renderTarget()] // A: shot.from, B: shot.to
/** The shots' size, px: the stage's draw size (vs3/host.ts sizes a layer's chain by it at create: C12). */
export const shotSize = () => [shots[0].width, shots[0].height] as const
/** Ping-pong scratch for effect chains, at the shots' size. */
export const temps = [renderTarget(), renderTarget()]

const audioBytes = new Uint8ClampedArray(2 * BINS) // row 0 FFT, row 1 waveform: the toy texture; fft/wave are its rows
const waveLrBytes = new Uint8ClampedArray(2 * BINS) // row 0 L, row 1 R: the waveLR texture (S0.2)
const r8 = (rows: number) => createTexture(gl, { width: BINS, height: rows, internalFormat: gl.R8, minMag: gl.LINEAR, wrap: gl.CLAMP_TO_EDGE, auto: false })
/** Audio as R8 textures (design E3): `fft` and `wave` 512×1 for ISF audioFFT/audio, `toy` 512×2 (rows FFT, waveform)
 *  for Shadertoy's iChannel0 ⚠️ G5, `waveLR` 512×2 (row 0 L, row 1 R) for the CP2 scope (S0.2). `donor` 512×1 RGBA8:
 *  the donor core's Spectrum (audio/donor.ts, setDonorSpectrum), a ShaderDef's 'spectrum' texture. */
export const audioTex = {
  fft: r8(1), wave: r8(1), toy: r8(2), waveLR: r8(2),
  donor: createTexture(gl, { width: BINS, height: 1, internalFormat: gl.RGBA8, minMag: gl.LINEAR, wrap: gl.CLAMP_TO_EDGE, auto: false }),
}
function upload(tex: WebGLTexture, rows: number, offset: number, bytes: Uint8ClampedArray = audioBytes) {
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, BINS, rows, gl.RED, gl.UNSIGNED_BYTE, bytes, offset)
}
/** Every frame: 512 bins in dB, 512 mid waveform samples and the L/R pair (−1…1) into the audio textures. */
export function setAudio(magDb: Float32Array, wave: Float32Array, waveL: Float32Array, waveR: Float32Array) {
  for (let i = 0; i < BINS; i++) {
    audioBytes[i] = ((magDb[i] - FFT_MIN_DB) / (FFT_MAX_DB - FFT_MIN_DB)) * 255 // clamped: −∞ dB (silence) → 0
    audioBytes[BINS + i] = (0.5 + 0.5 * wave[i]) * 255
    waveLrBytes[i] = (0.5 + 0.5 * waveL[i]) * 255
    waveLrBytes[BINS + i] = (0.5 + 0.5 * waveR[i]) * 255
  }
  upload(audioTex.fft, 1, 0)
  upload(audioTex.wave, 1, BINS)
  upload(audioTex.toy, 2, 0)
  upload(audioTex.waveLR, 2, 0, waveLrBytes)
}
/** The donor core's `spectrum` (512 texels × r g b a, audio/donor.ts) into audioTex.donor: one upload. */
export function setDonorSpectrum(bytes: Uint8Array) {
  gl.bindTexture(gl.TEXTURE_2D, audioTex.donor)
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, BINS, 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes)
}

let fade!: { info: ProgramInfo; u: Record<string, unknown> } // app.ts sets the first one at boot
/** The fades' transition pass (design E7): a `gl/<Name>` or `own/crossfade` def, its params at their defaults. One that
 *  fails to compile (twgl logged why) leaves the current one. */
export function setTransition(id: string) {
  const def = scenes.catalog!.get(id) as ShaderDef
  const info = program(def.vs, def.fs)
  if (info) fade = { info, u: defaults(def) }
}

/** Output = the stage's pixel size; scenes render at output × scale and the final pass upscales. */
export function setOutput(width: number, height: number, scale: number) {
  stage.width = width
  stage.height = height
  for (const t of [...shots, ...temps]) t.fit(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)))
}

const FLASH = location.search.includes('flash') // ?flash: a white frame per onset, for the lag video (spec §7.2)

/** Each scene's median GPU ms over its last RING timer results; empty without EXT_disjoint_timer_query_webgl2. */
export const gpuMs = new Map<SceneId, number>()
/** Per scene: its timer queries in flight (oldest first) and its last RING results in ms. */
const timings = new Map<SceneId, { flight: WebGLQuery[]; ms: number[] }>()
const spare: WebGLQuery[] = [] // queries done with, for reuse

/** Reads the finished timer queries into `gpuMs`. A disjoint GPU (a power-state change, say) voids all in flight. */
function poll() {
  if (!timer) return
  const disjoint = gl.getParameter(timer.GPU_DISJOINT_EXT) // reading it clears it: once per frame, for every scene
  for (const [id, t] of timings) {
    let read = false
    while (t.flight.length && (disjoint || gl.getQueryParameter(t.flight[0], gl.QUERY_RESULT_AVAILABLE))) {
      const q = t.flight.shift()!
      spare.push(q) // beginning it again drops a result still pending
      if (disjoint) continue
      if (t.ms.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6) > RING) t.ms.shift()
      read = true
    }
    if (read) gpuMs.set(id, [...t.ms].sort((a, b) => a - b)[t.ms.length >> 1])
  }
}

const heard: Sources = {} // hear()'s copy, refilled per vs3 scene (scenes draw one after the other)
const VS3 = /^native\/vs3-/
/** One live scene into its target, inside a timer query unless RING of the scene's are still in flight (results come
 *  frames late). Sequential: only one TIME_ELAPSED query may be active at a time. Analyser 'vs3': a scene with a vs3
 *  native hears the vs3 core's kick and onMid (audio/vs3.ts hear()). */
function drawScene(id: SceneId, f: FrameInput, src: Sources, styled: Sources | null, into: Target) {
  const scene = scenes.live!(id) // outside the query: an unknown id throws here, not with a query left active
  let s = sourcesFor(id, src, styled)
  if (vs3Live.s && scene.doc.layers.some((l) => VS3.test(l.gen.ref) || l.fx.some((x) => VS3.test(x.ref)))) s = hear(s, vs3Live.s, heard)
  let t = timings.get(id)
  if (!t) timings.set(id, (t = { flight: [], ms: [] }))
  if (!timer || t.flight.length === RING) return scene.render(f, s, into)
  const q = spare.pop() ?? gl.createQuery()
  gl.beginQuery(timer.TIME_ELAPSED_EXT, q)
  scene.render(f, s, into)
  gl.endQuery(timer.TIME_ELAPSED_EXT)
  t.flight.push(q)
}

/** The post pass's input (design C6): `{ gain: 1, flash: 0 }` leaves the frame as it is. */
export interface Post { gain: number; flash: number }
/** The post pass: one colour over the stage, through fixed-function blending (also the swarm's trail fade). */
export const tint = fullscreenProgram(`#version 300 es
precision highp float;
uniform vec4 uColor;
out vec4 outColor;
void main() { outColor = uColor; }`)

let frames = 0
/** render()'s calls so far: a native not drawn on the previous one is back on stage (vs3/chain.ts clock(), N2). */
export const engineFrame = () => frames

/** `styled` (Auto-style's overlay, design C5) is what built-ins read; null = every scene reads `src`. `post` then
 *  multiplies the stage by `gain` and mixes it toward white by `flash`; at rest it draws nothing. */
export function render(shot: Shot, f: FrameInput, src: Sources, styled: Sources | null, post: Post) {
  frames++
  poll()
  if (FLASH && f.onsets.length) {
    bindFramebufferInfo(gl, null)
    gl.clearColor(1, 1, 1, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
    return
  }
  const [a, b] = shots
  f.width = a.width // scenes draw at the internal size
  f.height = a.height
  drawScene(shot.from, f, src, styled, a) // each binds the targets it draws into
  if (shot.to) drawScene(shot.to, f, src, styled, b)
  bindFramebufferInfo(gl, null)
  const uRes = [stage.width, stage.height]
  if (!shot.to) copy({ uSrc: a.attachments[0], uRes })
  else draw(fade.info, Object.assign(fade.u, { from: a.attachments[0], to: b.attachments[0], progress: shot.mix, ratio: uRes[0] / uRes[1], uRes }))
  const g = post.gain - 1 // ≤ 1: a colour
  if (!g && !post.flash) return // at rest: the frame bit for bit
  gl.enable(gl.BLEND)
  if (g) {
    gl.blendFunc(gl.DST_COLOR, gl.ONE) // dst·g + dst = dst·gain
    tint({ uColor: [g, g, g, 0] })
  }
  if (post.flash) {
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA) // white·flash + dst·(1 − flash)
    tint({ uColor: [post.flash, post.flash, post.flash, post.flash] })
  }
  gl.disable(gl.BLEND)
}
