// ?camprobe (plan_camera S0.1): the CP0 probe skeleton. Holds HEAVY (&heavy=<id>, default
// builtin:td-feedback) the way bench.ts holds a scene, and draws cam.tex cover-fitted over the stage in its
// own rAF — registered after app.ts's frame(), and frame() re-registers at its own start, so rAF ordering
// guarantees the overlay draws after the scene's render(). Also collects the env fields of the frozen camprobe
// JSON, printed to a <pre> and held on window.__camprobe for the harness.
import { director } from './app'
import { allowCameras, cam, camMask, camSource, camStat, listCameras, selectCamera, startModel } from './camera/camera'
import { fullscreenProgram, gl, stage } from './gl/engine'
import type { ModelId } from './camera/segment.worker'
import { store } from './store'

const HEAVY = new URLSearchParams(location.search).get('heavy') ?? 'builtin:td-feedback'
const MODEL = new URLSearchParams(location.search).get('model') as ModelId | null // S0.2 arms: synthetic, selfie

const env: Record<string, unknown> = {
  ua: navigator.userAgent,
  gpu: null,
  webgpu: null,
  floatRT: !!gl.getExtension('EXT_color_buffer_float'),
  cores: navigator.hardwareConcurrency,
  deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
  dpr: devicePixelRatio,
  stage: null, // [clientW, clientH, bufferW, bufferH]
  refresh: null, // median rAF Δ, ms (the overlay loop fills it)
  camSettings: null, // the active track's, filled at source select
  camCaps: null,
  rvfcCaptureTime: false, // rVFC metadata's captureTime present?
}
const dbg = gl.getExtension('WEBGL_debug_renderer_info')
if (dbg) env.gpu = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL))
if (navigator.gpu)
  void navigator.gpu.requestAdapter().then((a) => {
    env.webgpu = a ? { vendor: a.info.vendor, description: a.info.description } : null
  })

// The overlay pass: cam.tex over the whole stage, uv in xf.ts's space (x right, y down); the uploaded row 0 is
// the frame's top row, hence the final v flip.
const drawCam = fullscreenProgram(`#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uRes;
uniform vec4 uXf;
out vec4 outColor;
void main() {
  vec2 suv = vec2(gl_FragCoord.x, 1.0 - gl_FragCoord.y) / uRes;
  vec2 c = suv * uXf.xy + uXf.zw;
  outColor = texture(uSrc, vec2(c.x, 1.0 - c.y));
}`)

// The S0.2 cut-out: the camera image through the EMA mask (person where m > 0, HEAVY showing through
// where m = 0), drawn blended. The mask is in frame-space uv, so both textures run through the same xf.
const drawCutout = fullscreenProgram(`#version 300 es
precision highp float;
uniform sampler2D uCam;
uniform sampler2D uMask;
uniform vec2 uRes;
uniform vec4 uXf;
out vec4 outColor;
void main() {
  vec2 suv = vec2(gl_FragCoord.x, 1.0 - gl_FragCoord.y) / uRes;
  vec2 c = suv * uXf.xy + uXf.zw;
  float m = texture(uMask, vec2(c.x, 1.0 - c.y)).r;
  outColor = vec4(texture(uCam, vec2(c.x, 1.0 - c.y)).rgb * m, m);
}`)

const pre = document.body.appendChild(document.createElement('pre'))
pre.style.cssText = 'position:fixed;top:0;left:0;margin:0;padding:6px;font:12px monospace;white-space:pre-wrap;color:#8f8;background:#000b;pointer-events:none;z-index:10'
const q = (xs: number[], p: number) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length * p)] : null)

const deltas: number[] = [] // the overlay rAF's, a whole-frame period sample
let lastT = 0
let nextPrint = 0
function overlay() {
  requestAnimationFrame(overlay)
  const now = performance.now()
  if (lastT) {
    deltas.push(now - lastT)
    if (deltas.length > 300) deltas.shift()
  }
  lastT = now
  if (camMask.tex && cam.w && cam.h) {
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    drawCutout({ uCam: cam.tex, uMask: camMask.tex, uRes: [stage.width, stage.height], uXf: cam.xf })
    gl.disable(gl.BLEND)
  } else if (cam.w && cam.h) drawCam({ uSrc: cam.tex, uRes: [stage.width, stage.height], uXf: cam.xf }) // raw until the first mask
  if (now >= nextPrint) {
    nextPrint = now + 2000
    env.stage = [stage.clientWidth, stage.clientHeight, stage.width, stage.height]
    env.refresh = deltas.length > 30 ? +q(deltas, 0.5)!.toFixed(3) : null
    env.camSettings = camSource.settings
    env.camCaps = camSource.caps
    env.rvfcCaptureTime = camStat.captureTime
    const up = camStat.ms.length ? `median ${q(camStat.ms, 0.5)!.toFixed(2)} p95 ${q(camStat.ms, 0.95)!.toFixed(2)} ms / frame` : 'no uploads yet'
    const mk = camMask
    const maskLine = mk.model
      ? `mask ${mk.model} ${mk.ready ?? 'waiting for the worker…'}${mk.error ? ` ERROR: ${mk.error}` : ''} · ema ${mk.w}×${mk.h} ${mk.floatEma ? 'RG16F' : 'RGBA8'} k=${mk.floatEma ? 0.85 : 0.25}`
      : null
    const maskStat =
      maskLine && mk.stats
        ? ` · area ${mk.stats.area.toFixed(3)} · centroid (${mk.stats.cx.toFixed(3)}, ${mk.stats.cy.toFixed(3)}) · box [${mk.stats.box.map((v) => v.toFixed(2)).join(', ')}]`
        : ''
    const maskMs =
      maskLine && mk.workerMs.length
        ? ` · worker ${q(mk.workerMs, 0.5)!.toFixed(1)}/${q(mk.workerMs, 0.95)!.toFixed(1)} ms p50/p95 · main ${q(mk.mainMs, 0.95)!.toFixed(2)} ms p95 · in-flight ${mk.inFlight}`
        : ''
    pre.textContent = [
      `camprobe: heavy=${HEAVY} upload=${camStat.path}`,
      `source ${camSource.kind} ${cam.w}×${cam.h} · upload ${up}`,
      ...(maskLine ? [`${maskLine}${maskStat}${maskMs}`] : []),
      JSON.stringify(env, null, 1),
      `select: __camprobe.allow() → __camprobe.list() → __camprobe.select('<deviceId>') (or select(file) for a clip, select('off') to stop)`,
    ].join('\n')
    console.log(`camprobe source ${camSource.kind} ${cam.w}×${cam.h} · upload ${up}${maskLine ? ` · ${maskLine}${maskMs}` : ''}`)
  }
}
requestAnimationFrame(overlay)

Object.assign(window, {
  __camprobe: { env, cam, source: camSource, stat: camStat, mask: camMask, select: selectCamera, list: listCameras, allow: allowCameras },
})

/** Hold HEAVY once the app is started (bench.ts's pattern; needsStart clears on the Start click), and
 *  spawn the segmentation worker for &model= (S0.2). */
async function run() {
  const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms))
  while (store.getSnapshot().needsStart) await sleep(200)
  director.setPlaylist([HEAVY])
  director.setHold(true)
  director.next()
  if (MODEL && (MODEL === 'synthetic' || MODEL === 'selfie')) startModel(MODEL) // S0.2 arms; the rest come in S0.4
}
void run()
