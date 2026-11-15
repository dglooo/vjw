// Camera/clip source + the segmentation host (plan_camera S0.1–S0.4, S1.2b; the CP1 contract rev 2). A device or a
// clip plays in one hidden <video> attached to the document. Each new frame (requestVideoFrameCallback) uploads into
// cam.tex at once while no host is ready (or with ALIGN off); with a ready host it goes there (transferred, the worker
// closes it) and its ALIGN clone (D2) waits for the mask, so the silhouette never trails the hands. tick(), once per
// rAF in app.ts before render(), owns the rest: the host's life (one while mask users > 0 && cam.live; RECYCLE's
// make-before-break; retire, K-6, K-11) and the GL: the aligned frame + its mask, the EMA pass at the gate's k, the
// cam.ref pass (K-5). The host is the dedicated segment.worker (the R0-Mac ruling). The upload rule is
// milkdrop/native.ts's copy(): texImage2D, then texSubImage2D while the size holds.
import { bindFramebufferInfo, createFramebufferInfo, createTexture, resizeFramebufferInfo } from 'twgl.js'
import { fullscreenProgram, gl, stage } from '../gl/engine'
import { RECYCLE_MS, retryAt, stalled, STUCK_MS, type HostClock } from './host'
import { halfToU8 } from './metrics'
import { gate } from './smooth'
import type { Gate, MaskStats } from './smooth'
import { count } from './users'
import { coverFit } from './xf'
import SegmentWorker from './segment.worker.ts?worker' // classic (G1): see vite.config's worker.format
import type { FromWorker, ModelId, ToWorker } from './segment.worker'

type MaskMsg = Extract<FromWorker, { type: 'mask' }>
const EMPTY: MaskStats = { area: 0, cx: 0, cy: 0, box: [0, 0, 0, 0] }
const REF_TAU = 1000 // ms: cam.ref's time constant (K-5, τ ≈ 1 s)

/** The GL side, built once at import: cam.tex, the raw mask, two ping-pongs in one format (D2's mask EMA at mask res;
 *  K-5's cam.ref 1×1: R the slow EMA of the frame's mean luma, G this frame's mean) and their passes. */
function glSide() {
  const float = !!gl.getExtension('EXT_color_buffer_float') // the engine's HALF rule: RG16F, RGBA8 (k ≥ .25) otherwise (D2)
  const attach = [float ? { internalFormat: gl.RG16F, format: gl.RG, type: gl.HALF_FLOAT } : { format: gl.RGBA, type: gl.UNSIGNED_BYTE }]
  const tex = () => createTexture(gl, { minMag: gl.LINEAR, wrap: gl.CLAMP_TO_EDGE, auto: false })
  const pair = () => [createFramebufferInfo(gl, attach, 1, 1), createFramebufferInfo(gl, attach, 1, 1)] // zero-filled
  return {
    float,
    attach,
    tex: tex(),
    raw: tex(),
    ema: pair(),
    ref: pair(),
    // `ema = mix(ema, raw, k)`, one pass at mask res, only when a mask arrived (D2)
    emaPass: fullscreenProgram(`#version 300 es
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
}`),
    // one fragment: the mean Rec. 709 luma of a 16×9 grid of cam.tex taps, and its slow EMA (no CPU readback, K-5)
    refPass: fullscreenProgram(`#version 300 es
precision highp float;
uniform sampler2D uCam;
uniform sampler2D uRef;
uniform float uK;
out vec4 outColor;
void main() {
  float s = 0.0;
  for (int y = 0; y < 9; y++)
    for (int x = 0; x < 16; x++) s += dot(texture(uCam, (vec2(x, y) + 0.5) / vec2(16.0, 9.0)).rgb, vec3(0.2126, 0.7152, 0.0722));
  float l = s / 144.0;
  outColor = vec4(mix(texelFetch(uRef, ivec2(0), 0).r, l, uK), l, 0.0, 1.0);
}`),
  }
}
const G = glSide()
let ei = 0 // the mask EMA's current target
let ri = 0 // cam.ref's current target

/** The CP1 contract (rev 2), + w/h: cam.tex's size (0 = no image). */
export const cam = {
  tex: G.tex,
  mask: G.ema[0].attachments[0] as WebGLTexture, // the EMA's current target: never null, all-zero until a mask (N-2)
  xf: new Float32Array(4),
  ref: G.ref[0].attachments[0] as WebGLTexture, // 1×1: R the slow EMA (τ ≈ 1 s) of the mean luma, G this frame's mean
  stats: EMPTY, // the last good mask's
  live: false, // a source plays: a host may run (K-11)
  video: true, // the main-UI switch (Decision 1, S1.4): it hides the picture, the masks keep working
  error: null as string | null, // the last host failure, null after the next good mask (K-1)
  w: 0,
  h: 0,
}
/** Upload path A/B (D1): &upload=frame|video, per-frame ms of the last ~10 s, rVFC captureTime presence (env). */
export const camStat = { path: 'video', ms: [] as number[], captureTime: false }
/** The active source, for the probe's env (camSettings/camCaps) and the overlay's status line. */
export const camSource = { kind: 'off' as 'off' | 'camera' | 'clip', settings: null as MediaTrackSettings | null, caps: null as MediaTrackCapabilities | null }
camStat.path = new URLSearchParams(location.search).get('upload') === 'frame' ? 'frame' : 'video'

/** The host side for the probe: the serving host's model (null = none) and ready info, the mask size, the per-mask
 *  clocks. recycleCount (the soak's `recycle`) is S0.4. */
export const camMask = {
  model: null as ModelId | null,
  ready: null as string | null,
  readyAt: null as number | null, // performance.now() of the serving host's ready (the probe's initMs/firstMaskMs)
  w: 0,
  h: 0,
  floatEma: G.float,
  workerMs: [] as number[], // the model's ms (worker clock)
  mainMs: [] as number[], // tick's mask upload + EMA (main clock)
  ts: [] as number[], // mask-arrival times (main clock) — the probe's maskFps
  recycleCount: 0, // the make-before-break swaps performed (the soak JSON's `recycle`)
}
/** The host's model, read at each spawn: the app's is the [R0] pick (Selfie, CPU); the probe sets it per arm. */
export const camHost = { model: 'selfie' as ModelId, delegate: 'CPU' as 'CPU' | 'GPU', base: '/', recycleMs: RECYCLE_MS }
/** ALIGN (design D2): on = the image waits for its mask (the clone uploaded with the mask); off = the newest frame
 *  uploads at once, the mask lags one inference. The probe flips it per arm (S0.3). */
export const camAlign = { on: true }
export const camGate: Gate = { area: 0, held: 0 } // S1.1: the gate's state — the EMA's k (D2); presence reads its area (D3)

interface Host extends HostClock {
  w: Worker
  ready: boolean // its 'ready' reply: frames go to it from then on
  inFlight: number // the frame id in flight, 0 = idle
}
let slot: Host | null = null // serving
let next: Host | null = null // RECYCLE's incoming (D2 make-before-break): inits beside the slot, swaps in at its first mask
const leaving = new Set<Host>() // retired with a frame in flight: terminated on its reply, or by the watchdog (K-6)
let pending: VideoFrame | null = null // the ALIGN clone (D2) of the slot's frame in flight
let fresh: { mask: MaskMsg; frame: VideoFrame | null } | null = null // a mask back (+ its ALIGN frame), for the next tick
let imageFresh = false // cam.tex changed since the last tick: the ref pass runs
let refAt = 0
let nextId = 0
let nextSpawnAt = -Infinity // tick spawns no host before this (K-1 rule 2)
let lastRetryAt: number | null = null // the last granted respawn: retryAt's window (N-3); only fail() writes it
let failAt: number | null = null // the serving host's last failure, until a good mask: STUCK_MS later → resetMask()
let camFbo: WebGLFramebuffer | null = null // readCam's attachment of cam.tex

function spawn(now: number): Host {
  const h: Host = { w: new SegmentWorker(), ready: false, masked: false, born: now, sentAt: null, inFlight: 0 }
  h.w.onmessage = (e: MessageEvent<FromWorker>) => onMsg(h, e.data)
  h.w.onerror = (e) => {
    e.preventDefault() // fail() logs it once; uncancelled, it would also surface as the page's uncaught error
    onMsg(h, { type: 'error', msg: `crashed: ${e.message || 'worker error'}` })
  }
  h.w.postMessage({ type: 'init', model: camHost.model, delegate: camHost.delegate, base: camHost.base } satisfies ToWorker)
  return h
}

/** A host stop (K-6): it gets no new frame; an idle one is terminated at once, a busy one on its reply. */
function retire(h: Host) {
  if (h === slot && pending) {
    pending.close()
    pending = null
  }
  if (h.inFlight) leaving.add(h)
  else h.w.terminate()
}

/** The one failure path (K-1): an error reply, the worker's onerror, the watchdog. The host is terminated at once and
 *  the image takes the raw path (no host ready); the respawn waits for retryAt (N-3). Never throws (D7). */
function fail(h: Host, why: string, now: number) {
  h.w.terminate()
  h.inFlight = 0
  h.sentAt = null
  if (h === slot) {
    slot = null
    if (pending) {
      pending.close()
      pending = null
    }
    cam.error = why
    failAt = now
    camMask.model = camMask.ready = camMask.readyAt = null
  } else next = null // RECYCLE's incoming: the old host keeps serving
  nextSpawnAt = lastRetryAt = retryAt(now, lastRetryAt)
  console.warn(`cam: host failed (${why}) — terminated; the next spawn in ${Math.round(nextSpawnAt - now)} ms`)
}

/** K-4 + N-2: no mask. The gate's area and held 0 (presence 0), empty stats, and BOTH EMA targets cleared: cam.mask
 *  stays a valid all-zero texture (a kept target would show the old silhouette for HOLD masks on re-entry). */
function resetMask() {
  camGate.area = camGate.held = 0
  cam.stats = EMPTY
  if (fresh) {
    fresh.frame?.close()
    fresh = null
  }
  for (const fb of G.ema) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb.framebuffer)
    gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]) // leaves the engine's clearColor alone
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
}

/** The host's life (K-1, K-3, K-6, K-11): one is wanted while mask users > 0 && cam.live; the watchdog fails a
 *  stalled one (host.ts). */
function hostLife(now: number) {
  for (const h of leaving)
    if (stalled(h, now)) {
      h.w.terminate()
      leaving.delete(h)
    }
  if (slot && stalled(slot, now)) fail(slot, 'stalled', now)
  if (next && stalled(next, now)) fail(next, 'stalled', now)
  if (failAt !== null && now - failAt > STUCK_MS) {
    failAt = null // no good mask within STUCK_MS of the failure: no frozen ghost stays on screen (K-1 rule 4)
    resetMask()
  }
  if (count() > 0 && cam.live) {
    if (next?.masked) {
      // D2 make-before-break: the incoming's first mask is back; the old host retires (on its in-flight reply)
      if (slot) retire(slot)
      slot = next
      next = null
      camMask.recycleCount++
      console.info(`cam: recycle ${camMask.recycleCount} — ${camHost.model} ${camHost.delegate} is live after ${Math.round(now - slot.born)} ms, the old host retired`)
    }
    if (!slot) {
      if (now >= nextSpawnAt) {
        slot = spawn(now)
        camMask.model = camHost.model
      }
    } else if (!next && now - slot.born > camHost.recycleMs && now >= nextSpawnAt) {
      next = spawn(now)
      console.info(`cam: recycle started — a new ${camHost.model} ${camHost.delegate} worker initialises beside the old`)
    }
  } else if (slot || next) {
    if (next) retire(next)
    if (slot) retire(slot)
    slot = next = null
    camMask.model = camMask.ready = camMask.readyAt = null
    resetMask() // segmentation stops (not a RECYCLE swap): person layers empty, presence 0 (K-4)
  }
}

function onMsg(h: Host, m: FromWorker) {
  if (leaving.delete(h)) return h.w.terminate() // retired: terminated on its reply (K-6)
  if (h !== slot && h !== next) return // a stopped host's straggler
  if (m.type === 'ready') {
    h.ready = true
    if (h === slot) {
      camMask.ready = m.info
      camMask.readyAt = performance.now()
    }
  } else if (m.type === 'error') fail(h, m.msg.split('\n')[0], performance.now()) // the stack's first line
  else onMask(h, m)
}

function onMask(h: Host, m: MaskMsg) {
  if (m.id !== h.inFlight) return
  h.inFlight = 0
  h.sentAt = null
  h.masked = true
  if (h !== slot) return // RECYCLE's incoming: tick swaps it in; this first mask is dropped
  cam.error = null // a good mask (K-1)
  failAt = null
  fresh?.frame?.close() // two masks inside one rAF: the newer wins
  fresh = { mask: m, frame: pending } // ALIGN (D2): the image waits for its mask
  pending = null
  camMask.workerMs.push(m.ms)
  camMask.ts.push(performance.now())
  // both keep the whole probe window (60 s × 60 fps + a 3 min soak): 20 000 — the 600 cap of S0.3 truncated the
  // soak's per-minute inferP95 after ~20 s (index-based polling + shift = empty slices)
  if (camMask.workerMs.length > 20000) camMask.workerMs.shift()
  if (camMask.ts.length > 20000) camMask.ts.shift()
}

function send(h: Host, f: VideoFrame) {
  h.inFlight = ++nextId
  h.sentAt = performance.now()
  h.w.postMessage({ type: 'frame', id: h.inFlight, frame: f } satisfies ToWorker, [f])
}

function uploadMask(w: number, h: number, data: Uint8Array<ArrayBuffer>) {
  gl.bindTexture(gl.TEXTURE_2D, G.raw)
  if (camMask.w === w && camMask.h === h) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RED, gl.UNSIGNED_BYTE, data) // the pixels overload (width/height, not TexImageSource)
  else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, data)
    camMask.w = w
    camMask.h = h
    // fresh targets are zero-filled: the mask fades in over the first ~10 frames; the texture objects stay (cam.mask)
    if (G.ema[0].width !== w || G.ema[0].height !== h) for (const fb of G.ema) resizeFramebufferInfo(gl, fb, G.attach, w, h)
  }
}

function emaPass(area: number) {
  const gk = gate(camGate, area)
  const k = gk === 0 ? 0 : G.float ? gk : Math.max(gk, 0.25) // an 8-bit EMA stalls below .25 (D2); k 0 (a freeze) is exact even in 8-bit
  const src = G.ema[ei]
  ei ^= 1
  bindFramebufferInfo(gl, G.ema[ei])
  G.emaPass({ uRaw: G.raw, uEma: src.attachments[0], uK: k, uRes: [camMask.w, camMask.h] })
  cam.mask = G.ema[ei].attachments[0] as WebGLTexture
}

function refPass(now: number) {
  const k0 = 1 - Math.exp(-(now - refAt) / REF_TAU) // the first frame (refAt 0): k ≈ 1, the ref starts at its mean
  refAt = now
  const src = G.ref[ri]
  ri ^= 1
  bindFramebufferInfo(gl, G.ref[ri])
  G.refPass({ uCam: G.tex, uRef: src.attachments[0], uK: G.float ? k0 : Math.max(k0, 0.25) }) // 8-bit: the D2 floor
  cam.ref = G.ref[ri].attachments[0] as WebGLTexture
}

/** Once per rAF in app.ts's frame, before render() (D1): the host's life, then the GL (the aligned frame + its mask,
 *  the EMA pass at the gate's k, cam.ref). app.ts reads presence(camGate.area) after it. */
export function tick(now: number) {
  hostLife(now)
  if (fresh) {
    const t0 = performance.now()
    const { mask: m, frame } = fresh
    fresh = null
    if (frame) {
      uploadTex(frame, frame.displayWidth, frame.displayHeight) // ALIGN: the image waits for its mask
      frame.close()
    }
    uploadMask(m.w, m.h, m.data)
    emaPass(m.stats.area)
    cam.stats = m.stats
    camMask.mainMs.push(performance.now() - t0)
    if (camMask.mainMs.length > 20000) camMask.mainMs.shift()
  }
  if (imageFresh) {
    imageFresh = false
    refPass(now)
  }
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
  imageFresh = true
}

/** The rVFC callback: the raw upload, or the frame to the host (+ its ALIGN clone). */
function upload() {
  const t0 = performance.now()
  const s = slot?.ready ? slot : null
  if (!s) {
    // no host ready (none wanted, or still initialising): the image runs at video rate, no mask
    if (camStat.path === 'frame') {
      const vf = new VideoFrame(video) // the A arm: a copy out of the element, then the upload
      uploadTex(vf, vf.displayWidth, vf.displayHeight) // the lib types VideoFrame without width/height; these are the same values
      vf.close()
    } else uploadTex(video, video.videoWidth, video.videoHeight)
  } else {
    // With a host the frame is a VideoFrame, so the &upload= A/B applies only to the base arms (S0.3).
    const vf = new VideoFrame(video)
    const nx = next?.ready && !next.inFlight ? next : null // RECYCLE's incoming builds its first mask at video rate
    if (!camAlign.on) {
      uploadTex(vf, vf.displayWidth, vf.displayHeight) // ALIGN off (D2): the newest frame shows at once
      if (!s.inFlight) send(s, vf.clone()) // the mask lags one inference
      if (nx) send(nx, vf.clone())
      vf.close()
    } else if (s.inFlight) {
      if (nx) send(nx, vf)
      else vf.close() // one frame in flight: the image runs at the mask rate
    } else {
      pending?.close()
      pending = vf.clone() // ALIGN (D2): tick uploads it with this frame's mask
      if (nx) send(nx, vf.clone())
      send(s, vf) // transferred
    }
  }
  camStat.ms.push(performance.now() - t0)
  if (camStat.ms.length > 600) camStat.ms.shift()
}

/** K-4: no source. resetMask() + every track stopped + srcObject null + cam.live false (the host retires at the next
 *  tick) + no image (cam.w 0). Callers: the start of every selectCamera, and track onended (the device unplugged). */
function resetStream() {
  resetMask()
  ;(video.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop())
  video.srcObject = null
  cam.live = false
  cam.w = cam.h = 0 // nothing camera-shaped is drawn (the probe's base-0); the next frame reallocates
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
  resetStream()
  video.pause()
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
    t.onended = resetStream
    camSource.kind = 'camera'
    camSource.settings = t.getSettings()
    camSource.caps = t.getCapabilities()
    console.info('camera', camSource.settings) // as selectDevice logs its track's settings
    video.srcObject = ms
  }
  await video.play()
  cam.live = true
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

/** The EMA mask (after D2 smoothing), top-first u8: cam.mask's current target, all-zero before any mask (N-2). */
export function readMask(): { data: Uint8Array; w: number; h: number } {
  const fb = G.ema[ei]
  const { width: w, height: h } = fb
  // RG16F must be read back as (RG, HALF_FLOAT) — (RGBA, HALF_FLOAT) on an RG texture is
  // INVALID_OPERATION and readPixels silently returns nothing (the sheet's invisible-mask bug)
  const raw = G.float ? new Uint16Array(w * h * 2) : new Uint8Array(w * h * 4)
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb.framebuffer)
  gl.readPixels(0, 0, w, h, G.float ? gl.RG : gl.RGBA, G.float ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, raw)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  const data = new Uint8Array(w * h)
  for (let i = 0; i < data.length; i++) data[i] = G.float ? halfToU8(raw[i * 2]) : raw[i * 4] // half bits, not unorm16
  return { data, w, h }
}
