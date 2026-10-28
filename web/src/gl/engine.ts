// WebGL2 engine on #stage (Variant A): the shot's scene(s) render into internal targets at base × scale, then one
// final pass crossfades them and upscales into the stage.
import {
  bindFramebufferInfo, createBufferInfoFromArrays, createFramebufferInfo, createProgramInfo, drawBufferInfo,
  resizeFramebufferInfo, setBuffersAndAttributes, setUniforms, type ProgramInfo,
} from 'twgl.js'
import type { Sources } from '../bind'
import type { Shot } from '../director'
import type { SceneId } from '../doc'
import type { FrameInput } from '../frame'
import type { Live } from './live'

export const stage = document.getElementById('stage') as HTMLCanvasElement
export const gl = stage.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: false })!
stage.addEventListener('webglcontextlost', () => location.reload())

/** Filled by app.ts: live.ts imports this engine, so the engine can't import it (no import cycle). */
export const scenes: { live?: (id: SceneId) => Live } = {}
const HALF = !!gl.getExtension('EXT_color_buffer_float') // half-float targets are renderable
// GPU timer queries (G3). The DOM typings don't name this extension: these are the two constants used.
const timer: { TIME_ELAPSED_EXT: GLenum; GPU_DISJOINT_EXT: GLenum } | null = gl.getExtension('EXT_disjoint_timer_query_webgl2')
const RING = 8 // per scene: timer queries in flight, and results in its median

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

/** A color-only target, linear filtering, clamped: RGBA8, or half-float with `hdr` where the GPU renders to it. */
export function renderTarget(hdr = false) {
  const attach = [hdr && HALF ? { internalFormat: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT } : { format: gl.RGBA, type: gl.UNSIGNED_BYTE }]
  const fb = createFramebufferInfo(gl, attach, 1, 1)
  return Object.assign(fb, {
    fit(w: number, h: number) {
      if (fb.width !== w || fb.height !== h) resizeFramebufferInfo(gl, fb, attach, w, h)
    },
  })
}

export type Target = ReturnType<typeof renderTarget>
const shots = [renderTarget(), renderTarget()] // A: shot.from, B: shot.to
/** Ping-pong scratch for effect chains, at the shots' size. */
export const temps = [renderTarget(), renderTarget()]
const final = fullscreenProgram(`#version 300 es
precision highp float;
uniform sampler2D uA;
uniform sampler2D uB;
uniform float uMix;
uniform vec2 uRes;
out vec4 outColor;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  outColor = mix(texture(uA, uv), texture(uB, uv), uMix);
}`)

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
function drawScene(id: SceneId, f: FrameInput, s: Sources, into: Target) {
  const scene = scenes.live!(id) // outside the query: an unknown id throws here, not with a query left active
  let t = timings.get(id)
  if (!t) timings.set(id, (t = { flight: [], ms: [] }))
  if (!timer || t.flight.length === RING) return scene.render(f, s, into)
  const q = spare.pop() ?? gl.createQuery()
  gl.beginQuery(timer.TIME_ELAPSED_EXT, q)
  scene.render(f, s, into)
  gl.endQuery(timer.TIME_ELAPSED_EXT)
  t.flight.push(q)
}

export function render(shot: Shot, f: FrameInput, s: Sources) {
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
  drawScene(shot.from, f, s, a) // each binds the targets it draws into
  if (shot.to) drawScene(shot.to, f, s, b)
  bindFramebufferInfo(gl, null)
  final({ uA: a.attachments[0], uB: (shot.to ? b : a).attachments[0], uMix: shot.to ? shot.mix : 0, uRes: [stage.width, stage.height] })
}
