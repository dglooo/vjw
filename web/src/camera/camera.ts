// Camera/clip source (plan_camera S0.1) + the segmentation side (S0.2): a device or a clip plays in one
// hidden <video> attached to the document; each new frame (requestVideoFrameCallback) uploads into cam.tex,
// and cam.xf (xf.ts) keeps the cover fit fresh. With a model running, one frame goes to the worker
// (transferred, it closes it) and its ALIGN clone (D2) is uploaded when the mask returns, so the silhouette
// never trails the hands. The upload rule is milkdrop/native.ts's copy(): texImage2D, then texSubImage2D
// while the size holds.
import { bindFramebufferInfo, createFramebufferInfo, createTexture, resizeFramebufferInfo } from 'twgl.js'
import { fullscreenProgram, gl, stage } from '../gl/engine'
import { coverFit } from './xf'
import { KEEP } from './smooth'
import type { MaskStats } from './smooth'
import SegmentWorker from './segment.worker.ts?worker' // classic (G1): see vite.config's worker.format
import type { FromWorker, ModelId, ToWorker } from './segment.worker'

export const cam = {
  tex: createTexture(gl, { minMag: gl.LINEAR, wrap: gl.CLAMP_TO_EDGE, auto: false }),
  w: 0,
  h: 0,
  xf: new Float32Array(4),
}
/** Upload path A/B (D1): &upload=frame|video, per-frame ms of the last ~10 s, rVFC captureTime presence (env). */
export const camStat = { path: 'video', ms: [] as number[], captureTime: false }
/** The active source, for the probe's env (camSettings/camCaps) and the overlay's status line. */
export const camSource = { kind: 'off' as 'off' | 'camera' | 'clip', settings: null as MediaTrackSettings | null, caps: null as MediaTrackCapabilities | null }
camStat.path = new URLSearchParams(location.search).get('upload') === 'frame' ? 'frame' : 'video'

/** The mask side (S0.2): the worker's state, the EMA's current texture (≤320×180, frame-space uv) and the
 *  per-frame clocks. The gate lands in S1.1 — until then the EMA runs at the fixed k = KEEP. */
export const camMask = {
  model: null as ModelId | null,
  ready: null as string | null,
  error: null as string | null,
  tex: null as WebGLTexture | null,
  w: 0,
  h: 0,
  floatEma: !!gl.getExtension('EXT_color_buffer_float'), // the engine's HALF rule: RG16F EMA, RGBA8 (k ≥ .25) otherwise (D2)
  stats: null as MaskStats | null,
  workerMs: [] as number[], // the model's ms (worker clock)
  mainMs: [] as number[], // upload + EMA (main clock)
  inFlight: 0,
}

const rawMask = { tex: gl.createTexture() }
gl.bindTexture(gl.TEXTURE_2D, rawMask.tex)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

/** The RG16F ping-pong (D2): `ema = mix(ema, raw, k)`, one pass at mask res, only when a mask arrived. */
const emaAttach = [
  camMask.floatEma
    ? { internalFormat: gl.RG16F, format: gl.RG, type: gl.HALF_FLOAT }
    : { format: gl.RGBA, type: gl.UNSIGNED_BYTE },
]
const emaA = createFramebufferInfo(gl, emaAttach, 1, 1)
const emaB = createFramebufferInfo(gl, emaAttach, 1, 1)
let ema = emaA
const emaPass = fullscreenProgram(`#version 300 es
precision highp float;
uniform sampler2D uRaw;
uniform sampler2D uEma;
uniform float uK;
uniform vec2 uRes;
out vec4 outColor;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float v = mix(texture(uEma, uv).r, texture(uRaw, uv).r, uK);
  outColor = vec4(v, 0.0, 0.0, 1.0);
}`)

let worker: Worker | null = null
let pending: VideoFrame | null = null // the ALIGN clone (D2), uploaded when its mask returns
let nextId = 0

/** Spawn the segmentation worker (the probe runs one model at a time; S0.4 re-inits). `base` is the
 *  self-hosted root, so the page touches localhost only (D7). */
export function startModel(model: ModelId, base = '/') {
  if (worker) return
  camMask.model = model
  camMask.ready = null
  camMask.error = null
  worker = new SegmentWorker()
  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    const m = e.data
    if (m.type === 'ready') camMask.ready = m.info
    else if (m.type === 'error') camMask.error = m.msg
    else onMask(m)
  }
  worker.postMessage({ type: 'init', model, delegate: 'CPU', base } satisfies ToWorker)
}

function uploadMask(w: number, h: number, data: Uint8Array<ArrayBuffer>) {
  gl.bindTexture(gl.TEXTURE_2D, rawMask.tex)
  if (camMask.w === w && camMask.h === h) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RED, gl.UNSIGNED_BYTE, data) // the pixels overload (width/height, not TexImageSource)
  else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, data)
    camMask.w = w
    camMask.h = h
    if (emaA.width !== w || emaA.height !== h) {
      resizeFramebufferInfo(gl, emaA, emaAttach, w, h)
      resizeFramebufferInfo(gl, emaB, emaAttach, w, h) // fresh targets are zero-filled: the mask fades in over the first ~10 frames
    }
  }
}

function tickEma() {
  const k = camMask.floatEma ? KEEP : Math.max(KEEP, 0.25) // an 8-bit EMA stalls below .25 (D2)
  const src = ema
  ema = ema === emaA ? emaB : emaA
  bindFramebufferInfo(gl, ema)
  emaPass({ uRaw: rawMask.tex, uEma: src.attachments[0] as WebGLTexture, uK: k, uRes: [camMask.w, camMask.h] })
  camMask.tex = ema.attachments[0] as WebGLTexture
}

function onMask(m: Extract<FromWorker, { type: 'mask' }>) {
  const t0 = performance.now()
  if (m.id === camMask.inFlight) {
    camMask.inFlight = 0
    if (pending) {
      uploadTex(pending, pending.displayWidth, pending.displayHeight) // ALIGN: the image waits for its mask
      pending.close()
      pending = null
    }
    uploadMask(m.w, m.h, m.data)
    tickEma()
  }
  camMask.stats = m.stats
  camMask.workerMs.push(m.ms)
  camMask.mainMs.push(performance.now() - t0)
  for (const xs of [camMask.workerMs, camMask.mainMs]) if (xs.length > 600) xs.shift()
}

const video = document.createElement('video')
video.muted = true
video.playsInline = true
video.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none' // hidden, still decoding
document.body.appendChild(video)

let mirror = false // a webcam preview is mirrored (like a mirror); a clip is not
let clipUrl: string | null = null

/** The copy rule: sub-image while the size holds, a reallocation (and the xf's refresh) when it changes. */
function uploadTex(src: TexImageSource, w: number, h: number) {
  gl.bindTexture(gl.TEXTURE_2D, cam.tex)
  if (w === cam.w && h === cam.h) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, src)
  else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src)
    cam.w = w
    cam.h = h
  }
  cam.xf.set(coverFit(stage.clientWidth, stage.clientHeight, cam.w, cam.h, mirror))
}

function upload() {
  const t0 = performance.now()
  if (!worker || !camMask.ready) {
    // no worker, or still initialising (MediaPipe takes a few s): the image runs at video rate, no mask
    if (camStat.path === 'frame') {
      const vf = new VideoFrame(video) // the A arm: a copy out of the element, then the upload
      uploadTex(vf, vf.displayWidth, vf.displayHeight) // the lib types VideoFrame without width/height; these are the same values
      vf.close()
    } else uploadTex(video, video.videoWidth, video.videoHeight)
    camStat.ms.push(performance.now() - t0)
    if (camStat.ms.length > 600) camStat.ms.shift()
    return
  }
  // With a model the worker needs a VideoFrame, so the &upload= A/B applies only to the base arms (S0.3).
  const vf = new VideoFrame(video)
  if (!camMask.inFlight) {
    pending = vf.clone() // ALIGN (D2): uploaded when this mask returns
    camMask.inFlight = ++nextId
    worker.postMessage({ type: 'frame', id: camMask.inFlight, frame: vf }, [vf]) // transferred; the worker closes it
  } else vf.close() // one frame in flight: the image runs at the mask rate
  camStat.ms.push(performance.now() - t0)
  if (camStat.ms.length > 600) camStat.ms.shift()
}

/** track.onended (the device unplugged): the texture goes black at its last size, the mask is dropped. */
function black() {
  camMask.tex = null
  camMask.inFlight = 0
  if (pending) {
    pending.close()
    pending = null
  }
  const w = cam.w || 1
  const h = cam.h || 1
  gl.bindTexture(gl.TEXTURE_2D, cam.tex)
  const buf = new Uint8Array(w * h * 4)
  for (let i = 3; i < buf.length; i += 4) buf[i] = 255
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, buf)
}

function arm() {
  video.requestVideoFrameCallback((_t, meta) => {
    camStat.captureTime ||= typeof meta.captureTime === 'number'
    upload()
    arm()
  })
}

/** Labeled video inputs only: labels stay empty until the user grants permission (MDN enumerateDevices), as
 *  in audio/input.ts's listDevices. */
export async function listCameras() {
  const all = await navigator.mediaDevices.enumerateDevices()
  return all.filter((d) => d.kind === 'videoinput' && d.label)
}

/** Permission prompt only; the picker (CP1) then shows labeled devices. */
export async function allowCameras() {
  const ms = await navigator.mediaDevices.getUserMedia({ video: true })
  ms.getTracks().forEach((t) => t.stop())
}

export async function selectCamera(sel: string | 'off' | File) {
  video.pause()
  video.srcObject = null
  if (clipUrl) URL.revokeObjectURL(clipUrl)
  clipUrl = null
  mirror = false
  camSource.kind = 'off'
  camSource.settings = null
  camSource.caps = null
  if (sel === 'off') return
  if (sel instanceof File) {
    camSource.kind = 'clip'
    clipUrl = URL.createObjectURL(sel)
    video.loop = true
    video.src = clipUrl
  } else {
    mirror = true
    const ms = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: sel }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
    })
    const t = ms.getVideoTracks()[0]
    t.onended = black
    camSource.kind = 'camera'
    camSource.settings = t.getSettings()
    camSource.caps = t.getCapabilities()
    console.info('camera', camSource.settings) // as selectDevice logs its track's settings
    video.srcObject = ms
  }
  await video.play()
  arm()
}
