// Camera/clip source (plan_camera S0.1): a device or a clip plays in one hidden <video> attached to the
// document; each new frame (requestVideoFrameCallback) uploads into cam.tex, and cam.xf (xf.ts) keeps the
// cover fit fresh. No worker yet (S0.2). The upload rule is milkdrop/native.ts's copy(): texImage2D, then
// texSubImage2D while the size holds.
import { createTexture } from 'twgl.js'
import { gl, stage } from '../gl/engine'
import { coverFit } from './xf'

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
  if (camStat.path === 'frame') {
    const vf = new VideoFrame(video) // the A arm: a copy out of the element, then the upload
    uploadTex(vf, vf.displayWidth, vf.displayHeight) // the lib types VideoFrame without width/height; these are the same values
    vf.close()
  } else uploadTex(video, video.videoWidth, video.videoHeight)
  camStat.ms.push(performance.now() - t0)
  if (camStat.ms.length > 600) camStat.ms.shift()
}

/** track.onended (the device unplugged): the texture goes black at its last size. */
function black() {
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
