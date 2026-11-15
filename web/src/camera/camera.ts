// Camera/clip source (plan_camera S0.1) + the segmentation side (S0.2, S0.4): a device or a clip plays in
// one hidden <video> attached to the document; each new frame (requestVideoFrameCallback) uploads into
// cam.tex, and cam.xf (xf.ts) keeps the cover fit fresh. With a model running, one frame goes to the
// model host (transferred, it closes it) and its ALIGN clone (D2) is uploaded when the mask returns, so
// the silhouette never trails the hands. The host is the dedicated segment.worker (the R0-Mac ruling; the
// S0.4 main-thread host was pruned in S1.2a). `recycle()` is D2's make-before-break: a new worker inits
// beside the old, the swap at its first mask, the old terminated. The upload rule is milkdrop/native.ts's
// copy(): texImage2D, then texSubImage2D while the size holds.
import { bindFramebufferInfo, createFramebufferInfo, createTexture, resizeFramebufferInfo } from 'twgl.js'
import { fullscreenProgram, gl, stage } from '../gl/engine'
import { coverFit } from './xf'
import { halfToU8 } from './metrics'
import { gate } from './smooth'
import type { Gate, MaskStats } from './smooth'
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

/** The mask side (S0.2): the host's state, the EMA's current texture (≤320×180, frame-space uv) and the
 *  per-frame clocks. recycleCount (the soak's `recycle`) is S0.4. */
export const camMask = {
  model: null as ModelId | null,
  ready: null as string | null,
  readyAt: null as number | null, // performance.now() of the host's ready (the probe's initMs/firstMaskMs)
  error: null as string | null,
  tex: null as WebGLTexture | null,
  w: 0,
  h: 0,
  floatEma: !!gl.getExtension('EXT_color_buffer_float'), // the engine's HALF rule: RG16F EMA, RGBA8 (k ≥ .25) otherwise (D2)
  stats: null as MaskStats | null,
  workerMs: [] as number[], // the model's ms (worker clock)
  mainMs: [] as number[], // upload + EMA (main clock)
  ts: [] as number[], // mask-arrival times (main clock) — the probe's maskFps
  inFlight: 0,
  recycleCount: 0, // the make-before-break swaps performed (the soak JSON's `recycle`)
}
/** ALIGN (design D2): on = the image waits for its mask (the clone uploaded when the mask returns);
 *  off = the newest frame uploads at once, the mask lags one inference. The probe flips it per arm (S0.3). */
export const camAlign = { on: true }

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

// One model host: the dedicated worker. `next` is the recycling worker (D2 make-before-break) — it inits
// beside `slot` and takes over at its first mask.
interface Slot {
  w: Worker
  ready: boolean
  inFlight: number
  born: number // performance.now() at creation: the recycle trail times the init (a stalled next blocks the cadence)
}
let slot: Slot | null = null // serving
let next: Slot | null = null // recycling in
let pending: VideoFrame | null = null // the ALIGN clone (D2), uploaded when its mask returns
let nextId = 0
let startOpts: { model: ModelId; delegate: 'CPU' | 'GPU'; base: string } = { model: 'selfie', delegate: 'CPU', base: '/' }
let camFbo: WebGLFramebuffer | null = null // readCam's attachment of cam.tex

function onMask(role: 'slot' | 'next', s: Slot, m: Extract<FromWorker, { type: 'mask' }>) {
  const t0 = performance.now()
  if (m.id !== s.inFlight) return
  s.inFlight = 0
  if (role === 'next') {
    // D2 make-before-break: the incoming's first mask — take over, terminate the old. The pending clone
    // belonged to the old host, so one frame of image lag at the swap — the EMA (k = .85) absorbs it.
    const old = slot
    slot = s
    next = null
    if (pending) {
      pending.close()
      pending = null
    }
    old?.w.terminate()
    camMask.recycleCount++
    console.info(`cam: recycle ${camMask.recycleCount} — ${startOpts.model} ${startOpts.delegate} is live after ${Math.round(performance.now() - s.born)} ms init, the old host terminated`)
  }
  camMask.inFlight = slot?.inFlight ?? 0
  if (pending) {
    uploadTex(pending, pending.displayWidth, pending.displayHeight) // ALIGN: the image waits for its mask
    pending.close()
    pending = null
  }
  uploadMask(m.w, m.h, m.data)
  tickEma(m.stats.area)
  camMask.stats = m.stats
  camMask.workerMs.push(m.ms)
  camMask.mainMs.push(performance.now() - t0)
  camMask.ts.push(performance.now())
  // all three keep the whole probe window (60 s × 60 fps + a 3 min soak): 20 000 — the 600 cap of S0.3
  // truncated the soak's per-minute inferP95 after ~20 s (index-based polling + shift = empty slices)
  if (camMask.workerMs.length > 20000) camMask.workerMs.shift()
  if (camMask.mainMs.length > 20000) camMask.mainMs.shift()
  if (camMask.ts.length > 20000) camMask.ts.shift()
}

function handleMsg(role: 'slot' | 'next', m: FromWorker) {
  const s = role === 'slot' ? slot : next
  if (!s) return // stopped in the meantime
  if (m.type === 'ready') {
    s.ready = true
    if (role === 'slot') {
      camMask.ready = m.info
      camMask.readyAt = performance.now()
    }
  } else if (m.type === 'error') {
    if (role === 'slot') camMask.error = m.msg // armSetup's waitUntil throws on it
    else {
      // the recycle failed (init or first frames): drop the incoming, the old host keeps serving (no gap)
      console.error(`cam: recycle host failed: ${m.msg} — the old host keeps serving`)
      s.w.terminate()
      next = null
    }
  } else onMask(role, s, m)
}

function sendFrame(s: Slot, f: VideoFrame) {
  const id = ++nextId
  s.inFlight = id
  if (s === slot) camMask.inFlight = id // live, not just at mask arrival: the soak's stuck watchdog reads it
  s.w.postMessage({ type: 'frame', id, frame: f } satisfies ToWorker, [f])
}

/** A worker's onmessage, bound to its Slot — the role is derived from identity at message time.
 *  Binding the role at creation was the S0.4 soak freeze: after the make-before-break swap the
 *  promoted worker's handler still targeted `next` (now null) and dropped every mask, stalling
 *  inFlight until the watchdog force-re-init'ed. A retired/terminated host's stragglers are dropped. */
function routeMsg(s: Slot) {
  return (e: MessageEvent<FromWorker>) => {
    if (slot === s) handleMsg('slot', e.data)
    else if (next === s) handleMsg('next', e.data)
  }
}

/** Start a model (the probe runs one at a time) in a fresh worker. */
export interface StartOpts {
  delegate?: 'CPU' | 'GPU'
  base?: string
}
export function startModel(model: ModelId, opts: StartOpts = {}) {
  stopModel()
  startOpts = { model, delegate: opts.delegate ?? 'CPU', base: opts.base ?? '/' }
  camMask.model = model
  const s: Slot = { w: new SegmentWorker(), ready: false, inFlight: 0, born: performance.now() }
  slot = s
  s.w.onmessage = routeMsg(s)
  s.w.onerror = (e) => console.error('cam: slot worker died:', e.message) // a silent death = no more masks, no pageerror
  s.w.postMessage({ type: 'init', model, delegate: startOpts.delegate, base: startOpts.base } satisfies ToWorker)
}

/** D2 make-before-break (S0.4): a new worker initialised beside the old one, the swap at its first mask,
 *  the old one terminated. */
export function recycle() {
  if (!slot) return
  if (next) {
    // a next that never becomes ready (and never errors) would stall the whole recycle cadence: drop it after 10 s
    if (performance.now() - next.born > 10000) {
      console.error(`cam: recycle host stalled in init (${Math.round(performance.now() - next.born)} ms) — dropped, the old host keeps serving`)
      next.w.terminate()
      next = null
    } else return
  }
  const s: Slot = { w: new SegmentWorker(), ready: false, inFlight: 0, born: performance.now() }
  s.w.onmessage = routeMsg(s)
  s.w.onerror = (e) => console.error('cam: recycle worker died:', e.message)
  s.w.postMessage({ type: 'init', model: startOpts.model, delegate: startOpts.delegate, base: startOpts.base } satisfies ToWorker)
  next = s
  console.info(`cam: recycle started — a new ${startOpts.model} ${startOpts.delegate} worker initialises beside the old`)
}

/** Recovery for a host that hung or died mid-frame (the soak's stuck-in-flight watchdog calls this): the
 *  gap already exists — make-before-break cannot rescue a dead host. Drop the in-flight claim so the
 *  upload stops feeding the corpse, terminate it, re-init on the spot (the image runs at video rate
 *  during the ~300 ms re-init). */
export function forceRecycle() {
  if (!slot) return
  console.error(`cam: forced re-init — ${startOpts.model} ${startOpts.delegate} (the old host hung or died mid-frame)`)
  if (next) {
    next.w.terminate()
    next = null
  }
  slot.inFlight = 0
  camMask.inFlight = 0
  startModel(startOpts.model, startOpts) // stopModel() first: terminates the corpse, re-inits
}

/** Tear the host(s) down and forget the mask state (the S0.3 probe runs the arms one after another). */
export function stopModel() {
  slot?.w.terminate()
  next?.w.terminate()
  slot = null
  next = null
  camMask.model = null
  camMask.ready = null
  camMask.readyAt = null
  camMask.error = null
  camMask.tex = null
  camMask.stats = null
  camMask.w = camMask.h = 0
  camMask.inFlight = 0
  // recycleCount is NOT reset here: the probe resets it per arm/soak window (armSetup), so a forced
  // re-init (which routes through startModel → stopModel) cannot zero the soak's swap evidence
  if (pending) {
    pending.close()
    pending = null
  }
  camMask.workerMs.length = 0
  camMask.mainMs.length = 0
  camMask.ts.length = 0
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

export const camGate: Gate = { area: 0, held: 0 } // S1.1: the gate's state — the EMA's k (D2), not a fixed KEEP; presence reads its area (D3)

function tickEma(area: number) {
  const gk = gate(camGate, area)
  const k = gk === 0 ? 0 : camMask.floatEma ? gk : Math.max(gk, 0.25) // an 8-bit EMA stalls below .25 (D2); k 0 (a freeze) is exact even in 8-bit
  const src = ema
  ema = ema === emaA ? emaB : emaA
  bindFramebufferInfo(gl, ema)
  emaPass({ uRaw: rawMask.tex, uEma: src.attachments[0] as WebGLTexture, uK: k, uRes: [camMask.w, camMask.h] })
  camMask.tex = ema.attachments[0] as WebGLTexture
}

export const video = document.createElement('video')
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
  const s = slot
  if (!s || !s.ready) {
    // no host, or still initialising (MediaPipe takes a few s): the image runs at video rate, no mask
    if (camStat.path === 'frame') {
      const vf = new VideoFrame(video) // the A arm: a copy out of the element, then the upload
      uploadTex(vf, vf.displayWidth, vf.displayHeight) // the lib types VideoFrame without width/height; these are the same values
      vf.close()
    } else uploadTex(video, video.videoWidth, video.videoHeight)
    camStat.ms.push(performance.now() - t0)
    if (camStat.ms.length > 600) camStat.ms.shift()
    return
  }
  // With a model the host needs a VideoFrame, so the &upload= A/B applies only to the base arms (S0.3).
  const vf = new VideoFrame(video)
  if (camAlign.on) {
    if (s.inFlight) {
      if (next?.ready && !next.inFlight) {
        const c = vf.clone()
        vf.close()
        sendFrame(next, c) // the recycling worker builds its first mask at video rate
      } else vf.close() // one frame in flight: the image runs at the mask rate
    } else {
      pending = vf.clone() // ALIGN (D2): uploaded when this mask returns
      const nf = next?.ready && !next.inFlight ? vf.clone() : null // before sendFrame: it transfers vf, closing it
      sendFrame(s, vf)
      if (nf) sendFrame(next!, nf)
    }
  } else {
    uploadTex(vf, vf.displayWidth, vf.displayHeight) // ALIGN off (D2): the newest frame shows at once
    if (!s.inFlight) sendFrame(s, vf.clone()) // the mask lags one inference
    if (next?.ready && !next.inFlight) sendFrame(next, vf.clone())
    vf.close()
  }
  camStat.ms.push(performance.now() - t0)
  if (camStat.ms.length > 600) camStat.ms.shift()
}

/** track.onended (the device unplugged): the texture goes black at its last size, the mask is dropped. */
function black() {
  camMask.tex = null
  if (slot) slot.inFlight = 0 // its in-flight mask arrives to a null check (m.id ≠ 0) and is dropped
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

// requestVideoFrameCallback has no cancel API, so a stale chain cannot be un-armed — only made inert.
// Each selectCamera() bumps the generation; a stale chain's next callback sees the mismatch, does not
// upload, and does not re-arm, so it dies there. Without this, re-selecting the clip (the probe's
// base-0 → base-cam) revives the boot chain: two upload chains, and on the main host two sends per
// frame (mask rate up to 2× video rate).
let rvcGen = 0
function arm() {
  const gen = ++rvcGen
  const cb = (_t: number, meta: VideoFrameCallbackMetadata) => {
    if (gen !== rvcGen) return
    camStat.captureTime ||= typeof meta.captureTime === 'number'
    try {
      upload()
    } catch (e) {
      // one bad frame (a VideoFrame op threw) must not kill the feed: log, drop the frame, keep the chain
      console.error('cam: upload threw — frame dropped, chain alive:', e)
    }
    video.requestVideoFrameCallback(cb)
  }
  video.requestVideoFrameCallback(cb)
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
  if (clipUrl) {
    URL.revokeObjectURL(clipUrl)
    clipUrl = null
    video.removeAttribute('src')
    video.load() // drop the element's reference to the just-revoked blob (a pending load of it logs ERR_FILE_NOT_FOUND)
  }
  mirror = false
  camSource.kind = 'off'
  camSource.settings = null
  camSource.caps = null
  if (sel === 'off') {
    cam.w = cam.h = 0 // base-0: nothing camera-shaped is drawn (the probe's 'HEAVY alone' arm)
    return
  }
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

/** S0.3 probe readbacks (sheet + latency clock): top-first RGBA8 of the uploaded camera image,
 *  or null when there is none. Called between tasks (never inside the app's rAF), so the FBO dance
 *  cannot race the engine. */
export function readCam(): { data: Uint8Array; w: number; h: number } | null {
  if (!cam.w || !cam.h) return null
  if (!camFbo) {
    camFbo = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, camFbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, cam.tex, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }
  const { w, h } = cam
  const data = new Uint8Array(w * h * 4)
  gl.bindFramebuffer(gl.FRAMEBUFFER, camFbo)
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, data)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  return { data, w, h }
}

/** The EMA mask (after D2 smoothing), top-first u8, or null. */
export function readMask(): { data: Uint8Array; w: number; h: number } | null {
  if (!camMask.tex || !camMask.w || !camMask.h) return null
  const w = camMask.w, h = camMask.h
  const info = camMask.tex === emaA.attachments[0] ? emaA : emaB
  const f32 = camMask.floatEma
  // RG16F must be read back as (RG, HALF_FLOAT) — (RGBA, HALF_FLOAT) on an RG texture is
  // INVALID_OPERATION and readPixels silently returns nothing (the sheet's invisible-mask bug)
  const raw = f32 ? new Uint16Array(w * h * 2) : new Uint8Array(w * h * 4)
  gl.bindFramebuffer(gl.FRAMEBUFFER, info.framebuffer)
  gl.readPixels(0, 0, w, h, f32 ? gl.RG : gl.RGBA, f32 ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, raw)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  const data = new Uint8Array(w * h)
  for (let i = 0; i < data.length; i++) data[i] = f32 ? halfToU8(raw[i * 2]) : raw[i * 4] // half bits, not unorm16
  return { data, w, h }
}
