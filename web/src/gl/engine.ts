// WebGL2 engine on #stage (Variant A): the shot's scene(s) render into internal targets at base × scale, then one
// final pass upscales them into the stage: a copy, or the transition during a fade (design E7).
import {
  bindFramebufferInfo, createBufferInfoFromArrays, createFramebufferInfo, createProgramInfo, createProgramInfoAsync,
  createTexture, drawBufferInfo, resizeFramebufferInfo, setBuffersAndAttributes, setUniforms, type ProgramInfo,
} from 'twgl.js'
import { sourcesFor, type Sources } from '../bind'
import type { Shot } from '../director'
import { defaults, type SceneId } from '../doc'
import type { FrameInput } from '../frame'
import type { EffectDef, ShaderDef } from '../fx/types'
import type { Live } from './live'

export const stage = document.getElementById('stage') as HTMLCanvasElement
export const gl = stage.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: false })!
stage.addEventListener('webglcontextlost', () => location.reload())

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

/** A texture over the bound target at any size, linear: the stage pass without a fade, and the persistent resample. */
const copy = fullscreenProgram(`#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uRes;
out vec4 outColor;
void main() {
  outColor = texture(uSrc, gl_FragCoord.xy / uRes);
}`)

/** A color-only target, linear filtering, clamped: RGBA8, or half-float with `hdr` where the GPU renders to it. A
 *  `persistent` one keeps its content when fit() resizes it, resampled into the new size (design E2: trails survive a
 *  governor step). Every target starts cleared: WebGL zero-fills new textures. fit() may leave the target bound. */
export function renderTarget(hdr = false, persistent = false) {
  const attach = [hdr && HALF ? { internalFormat: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT } : { format: gl.RGBA, type: gl.UNSIGNED_BYTE }]
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
/** Ping-pong scratch for effect chains, at the shots' size. */
export const temps = [renderTarget(), renderTarget()]

const audioBytes = new Uint8ClampedArray(2 * BINS) // row 0 FFT, row 1 waveform: the toy texture; fft/wave are its rows
const r8 = (rows: number) => createTexture(gl, { width: BINS, height: rows, internalFormat: gl.R8, minMag: gl.LINEAR, wrap: gl.CLAMP_TO_EDGE, auto: false })
/** Audio as R8 textures (design E3): `fft` and `wave` 512×1 for ISF audioFFT/audio, `toy` 512×2 (rows FFT, waveform)
 *  for Shadertoy's iChannel0 ⚠️ G5. */
export const audioTex = { fft: r8(1), wave: r8(1), toy: r8(2) }
function upload(tex: WebGLTexture, rows: number, offset: number) {
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, BINS, rows, gl.RED, gl.UNSIGNED_BYTE, audioBytes, offset)
}
/** Every frame: 512 bins in dB and 512 waveform samples (−1…1) into the audio textures. */
export function setAudio(magDb: Float32Array, wave: Float32Array) {
  for (let i = 0; i < BINS; i++) {
    audioBytes[i] = ((magDb[i] - FFT_MIN_DB) / (FFT_MAX_DB - FFT_MIN_DB)) * 255 // clamped: −∞ dB (silence) → 0
    audioBytes[BINS + i] = (0.5 + 0.5 * wave[i]) * 255
  }
  upload(audioTex.fft, 1, 0)
  upload(audioTex.wave, 1, BINS)
  upload(audioTex.toy, 2, 0)
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

/** One live scene into its target, inside a timer query unless RING of the scene's are still in flight (results come
 *  frames late). Sequential: only one TIME_ELAPSED query may be active at a time. */
function drawScene(id: SceneId, f: FrameInput, src: Sources, styled: Sources | null, into: Target) {
  const scene = scenes.live!(id) // outside the query: an unknown id throws here, not with a query left active
  const s = sourcesFor(id, src, styled)
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

/** `styled` (Auto-style's overlay, design C5) is what built-ins read; null = every scene reads `src`. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- `post` is in the contract now; S5.2 applies it
export function render(shot: Shot, f: FrameInput, src: Sources, styled: Sources | null, _post: Post) {
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
  if (!shot.to) return copy({ uSrc: a.attachments[0], uRes })
  draw(fade.info, Object.assign(fade.u, { from: a.attachments[0], to: b.attachments[0], progress: shot.mix, ratio: uRes[0] / uRes[1], uRes }))
}
