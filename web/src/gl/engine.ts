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

export function render(shot: Shot, f: FrameInput, s: Sources) {
  if (FLASH && f.onsets.length) {
    bindFramebufferInfo(gl, null)
    gl.clearColor(1, 1, 1, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
    return
  }
  const [a, b] = shots
  f.width = a.width // scenes draw at the internal size
  f.height = a.height
  scenes.live!(shot.from).render(f, s, a) // each binds the targets it draws into
  if (shot.to) scenes.live!(shot.to).render(f, s, b)
  bindFramebufferInfo(gl, null)
  final({ uA: a.attachments[0], uB: (shot.to ? b : a).attachments[0], uMix: shot.to ? shot.mix : 0, uRes: [stage.width, stage.height] })
}
