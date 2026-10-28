// WebGL2 engine on #stage (Variant A): the shot's scene(s) render into internal targets at base × scale, then one
// final pass crossfades them and upscales into the stage.
import {
  bindFramebufferInfo, createBufferInfoFromArrays, createFramebufferInfo, createProgramInfo, drawBufferInfo,
  resizeFramebufferInfo, setBuffersAndAttributes, setUniforms,
} from 'twgl.js'
import type { OwnSceneId, Shot } from '../director'
import type { FrameInput } from '../frame'
import type { Scene } from './scene'

export const stage = document.getElementById('stage') as HTMLCanvasElement
export const gl = stage.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: false })!
stage.addEventListener('webglcontextlost', () => location.reload())
const HALF = !!gl.getExtension('EXT_color_buffer_float') // half-float targets are renderable

/** Filled by app.ts at startup; scene modules import this engine, so the engine can't import them. */
export const scenes: Partial<Record<OwnSceneId, Scene>> = {}

const VS = `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }`
const triangle = createBufferInfoFromArrays(gl, { position: { numComponents: 2, data: [-1, -1, 3, -1, -1, 3] } })

/** One fullscreen-triangle pass with the given fragment shader; returns its draw call. */
export function fullscreenProgram(fs: string) {
  const info = createProgramInfo(gl, [VS, fs])
  return (uniforms: Record<string, unknown>) => {
    gl.useProgram(info.program)
    setBuffersAndAttributes(gl, info, triangle)
    setUniforms(info, uniforms)
    drawBufferInfo(gl, triangle)
  }
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

const shots = [renderTarget(), renderTarget()] // A: shot.from, B: shot.to
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
  for (const t of shots) t.fit(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)))
}

const FLASH = location.search.includes('flash') // ?flash: a white frame per onset, for the lag video (spec §7.2)

export function render(shot: Shot, f: FrameInput) {
  if (FLASH && f.onsets.length) {
    bindFramebufferInfo(gl, null)
    gl.clearColor(1, 1, 1, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
    return
  }
  const [a, b] = shots
  f.width = a.width // scenes draw at the internal size
  f.height = a.height
  bindFramebufferInfo(gl, a)
  scenes[shot.from]!.draw(f)
  if (shot.to) {
    bindFramebufferInfo(gl, b)
    scenes[shot.to]!.draw(f)
  }
  bindFramebufferInfo(gl, null)
  final({ uA: a.attachments[0], uB: (shot.to ? b : a).attachments[0], uMix: shot.to ? shot.mix : 0, uRes: [stage.width, stage.height] })
}
