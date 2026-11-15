// ?camprobe (plan_camera S0.1–S0.4): the CP0 probe. Holds HEAVY (&heavy=<id>, default
// builtin:td-feedback) the way bench.ts holds a scene, and draws cam.tex + the EMA mask cover-fitted
// over the stage in its own rAF — registered after app.ts's frame(), which rAF ordering guarantees.
// The unattended runner: 60 s per arm (&arms=, default the eight kept arms — base-0, base-cam,
// W-synthetic, W-selfie-cpu[-align-off], W-selfie-gpu, W-pose-cpu/-gpu (PoseLandmarker lite)); the S1.2a
// prune removed the rest (design § Ruling §5 lists them with their restore points).
// K7 agreement = GPU vs CPU of the same clip frames per model: each W-*-cpu/-gpu arm samples its EMA
// mask at 500 ms clip-time buckets, the pass joins the two arms' buckets and averages iou / centroid Δ.
// &moments=<seconds> for the sheet (moments × arms); &soak=<min> logs per minute (camprobe-soak-*.json);
// &recycle=<min> = D2 make-before-break (a new worker inits beside the old, the swap at its first mask,
// the old terminated) — the soak JSON's `recycle` counts the swaps.
// late = the app governor's drops (quality.ts's rule, imported — not re-derived) and scale = its
// scale at the arm's end. The big ms clock canvas + the "Latency" button cycle raw → ALIGN on →
// ALIGN off, 5 latency-<mode>-<n>.png each (the clock now, and the product's view of the clock seen
// through the camera). At the end: JSON + sheet downloads, the frozen CP0 shape.
import { director, governor } from './app'
import {
  allowCameras, cam, camAlign, camGate, camHost, camMask, camSource, camStat, listCameras, readCam, readMask, selectCamera, video,
} from './camera/camera'
import { fullscreenProgram, gl, stage } from './gl/engine'
import { centroidDelta, iou, minWindowFps, p50, p95 } from './camera/metrics'
import type { ModelId } from './camera/segment.worker'
import * as users from './camera/users' // users.use(): a bare use() reads as React's hook to the rules-of-hooks lint
import { store } from './store'

const params = new URLSearchParams(location.search)
const HEAVY = params.get('heavy') ?? 'builtin:td-feedback'
const MODEL = params.get('model') as ModelId | null // manual overlay arm (S0.2)
const CLIP = params.get('clip') // a same-origin URL fetched on boot (the harness serves it as /__clip)
const ARMS = (params.get('arms') ?? 'base-0,base-cam,W-synthetic,W-selfie-cpu,W-selfie-cpu-align-off,W-selfie-gpu,W-pose-cpu,W-pose-gpu').split(',').filter(Boolean)
const MOMENTS = (params.get('moments') ?? '12,35').split(',').map((s) => +s).filter((n) => n > 0)
const SOAK_MIN = +(params.get('soak') ?? 0)
const RECYCLE_MIN = +(params.get('recycle') ?? 0) // D2 make-before-break cadence (S0.4): tick swaps at this host age
const ARM_SECONDS = +(params.get('seconds') ?? 60)
// &fault=<spec> (S1.2b, K-1 T1a–T1c): to the first host's init (`dead`: every host's) — throw@N, hang@N, dead, crash@N,
// close@N, glloss@N (segment.worker's faulty()). A fault run waits for no first mask, never stops on cam.error and
// skips the sheet: the arm JSON is the evidence.
const FAULT = params.get('fault') ?? ''
camHost.fault = FAULT
if (RECYCLE_MIN) camHost.recycleMs = RECYCLE_MIN * 60000

// The arm's mask user (S1.2b): tick() spawns the host while one is held and retires it after the release.
let release: (() => void) | null = null
function startModel(model: ModelId, delegate: 'CPU' | 'GPU' = 'CPU') {
  Object.assign(camHost, { model, delegate })
  release ??= users.use(true)
}
async function stopModel() {
  release?.()
  release = null
  for (let i = 0; i < 100 && camMask.model !== null; i++) await sleep(50) // tick retires it on the next rAF
  camMask.workerMs.length = camMask.mainMs.length = camMask.ts.length = 0
}
/** The K-6 on/off cycle (probe.mjs CYCLES): flips the arm's mask user inside the next rVFC callback, right after the
 *  frame went to the host, so an "off" retires a host mid-flight. */
const toggle = () =>
  new Promise<'on' | 'off'>((ok) =>
    video.requestVideoFrameCallback(() => {
      if (release) {
        release()
        release = null
        ok('off')
      } else {
        release = users.use(true)
        ok('on')
      }
    }),
  )

interface ArmSpec {
  name: string
  camera: boolean
  model: ModelId | null
  align: boolean | null
  delegate?: 'CPU' | 'GPU' // default CPU
}
const ARM_SPECS: Record<string, ArmSpec> = {
  'base-0': { name: 'base-0', camera: false, model: null, align: null },
  'base-cam': { name: 'base-cam', camera: true, model: null, align: null },
  'W-synthetic': { name: 'W-synthetic', camera: true, model: 'synthetic', align: true },
  'W-selfie-cpu': { name: 'W-selfie-cpu', camera: true, model: 'selfie', align: true },
  'W-selfie-cpu-align-off': { name: 'W-selfie-cpu-align-off', camera: true, model: 'selfie', align: false },
  'W-selfie-gpu': { name: 'W-selfie-gpu', camera: true, model: 'selfie', align: true, delegate: 'GPU' },
  'W-pose-cpu': { name: 'W-pose-cpu', camera: true, model: 'pose-lite', align: true },
  'W-pose-gpu': { name: 'W-pose-gpu', camera: true, model: 'pose-lite', align: true, delegate: 'GPU' },
}
// K7: the arms whose EMA masks are sampled for the GPU-vs-CPU agreement (clip frames only).
const AGREE_ARMS = new Set(['W-selfie-cpu', 'W-selfie-gpu', 'W-pose-cpu', 'W-pose-gpu'])

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

// The overlay pass: cam.tex over the whole stage, uv in xf.ts's space (x right, y down: the v flip is the
// frag coord's, GL's y is up); the uploaded row 0 is the frame's top row (no UNPACK_FLIP_Y), so c samples as is.
const drawCam = fullscreenProgram(`#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uRes;
uniform vec4 uXf;
out vec4 outColor;
void main() {
  vec2 suv = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uRes;
  vec2 c = suv * uXf.xy + uXf.zw;
  outColor = texture(uSrc, c);
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
  vec2 suv = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uRes;
  vec2 c = suv * uXf.xy + uXf.zw;
  float m = texture(uMask, c).r;
  outColor = vec4(texture(uCam, c).rgb * m, m);
}`)

const pre = document.body.appendChild(document.createElement('pre'))
pre.style.cssText = 'position:fixed;top:0;left:0;margin:0;padding:6px;font:12px monospace;white-space:pre-wrap;color:#8f8;background:#000b;pointer-events:none;z-index:10;max-width:60vh'
const runPre = document.body.appendChild(document.createElement('pre'))
runPre.style.cssText = 'position:fixed;bottom:0;left:0;margin:0;padding:6px;font:12px monospace;white-space:pre;color:#ff8;background:#000b;pointer-events:none;z-index:10;max-height:30vh;overflow:hidden'
function log(msg: string) {
  runPre.textContent += `${new Date().toISOString().slice(11, 19)} ${msg}\n`
  runPre.scrollTop = runPre.scrollHeight
  console.log(`camprobe ${msg}`)
}
const q = (xs: number[], p: number) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length * p)] : null)

const probe: {
  env: Record<string, unknown>
  cam: typeof cam
  source: typeof camSource
  stat: typeof camStat
  mask: typeof camMask
  select: typeof selectCamera
  list: typeof listCameras
  allow: typeof allowCameras
  canRun: boolean
  running: boolean
  done: boolean
  error: string | null
  results: { json: string; sheet: string | null; prefix: string } | null // the harness's fallback when a download is blocked
  audioSource: { kind: 'device'; id: string } | { kind: 'file'; name: string } | null
  run: (() => void) | null
  toggle: typeof toggle
} = {
  env, cam, source: camSource, stat: camStat, mask: camMask, select: selectCamera, list: listCameras, allow: allowCameras,
  canRun: false, running: false, done: false, error: null, results: null, audioSource: store.getSnapshot().source, run: null, toggle,
}
Object.assign(window, { __camprobe: probe })

const RECLINE = RECYCLE_MIN ? `${RECYCLE_MIN} min` : ''
const os = /windows/i.test(navigator.userAgent) ? 'win' : /mac/i.test(navigator.userAgent) ? 'mac' : 'linux'
const gpuSlug = String(env.gpu ?? 'gpu').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
const prefix = (SOAK_MIN ? 'camprobe-soak-' : 'camprobe-') + `${os}-${gpuSlug}-${new Date().toISOString().slice(0, 10)}`

// The big ms clock canvas (the U0.4 latency ground truth): 5 digits of performance.now() mod 100000,
// and — after a "Latency" grab — the product's view of the clock seen through the camera (a readback of
// cam.tex, which carries whatever the mode's gating delayed).
const lat = document.createElement('canvas')
lat.width = 960
lat.height = 480
lat.style.cssText = 'position:fixed;top:150px;left:50%;transform:translateX(-50%);background:#000;z-index:11'
document.body.appendChild(lat)
const lctx = lat.getContext('2d')!
const grabCanvas = document.createElement('canvas')
let grabAt: number | null = null
function drawLat() {
  lctx.fillStyle = '#000'
  lctx.fillRect(0, 0, lat.width, lat.height)
  lctx.fillStyle = '#fff'
  lctx.font = '150px monospace'
  lctx.textBaseline = 'middle'
  lctx.fillText(String(Math.floor(performance.now() % 100000)).padStart(5, '0'), 20, 210)
  lctx.font = '16px monospace'
  lctx.fillStyle = '#8f8'
  lctx.fillText('now (ms)', 20, 450)
  if (grabAt !== null) {
    lctx.drawImage(grabCanvas, 520, 90, 420, 236)
    lctx.fillText(`product view (cam.tex), grabbed ${Math.round(performance.now() - grabAt)} ms ago`, 520, 450)
  } else {
    lctx.fillText('product view: press Latency (raw → ALIGN on → ALIGN off, 5 shots each)', 520, 200)
  }
}

const runBtn = document.body.appendChild(document.createElement('button'))
runBtn.textContent = `Run all${SOAK_MIN ? ` (soak ${SOAK_MIN} min)` : ` (${ARMS.length} arms × ${ARM_SECONDS} s)`}`
runBtn.style.cssText = 'position:fixed;top:8px;right:8px;z-index:12;font:16px monospace;padding:8px 12px'
const latBtn = document.body.appendChild(document.createElement('button'))
latBtn.textContent = 'Latency'
latBtn.style.cssText = 'position:fixed;top:56px;right:8px;z-index:12;font:16px monospace;padding:8px 12px'

const deltas: number[] = [] // the overlay rAF's, a whole-frame period sample
let lastT = 0
let nextPrint = 0
let rafFrames = 0
let lastCameraId: string | null = null // camera mode: base-0 turns the source off, base-cam must re-select it
function overlay() {
  requestAnimationFrame(overlay)
  rafFrames++
  const now = performance.now()
  if (lastT) {
    deltas.push(now - lastT)
    if (deltas.length > 300) deltas.shift()
  }
  lastT = now
  if (camMask.model && cam.w && cam.h) {
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    drawCutout({ uCam: cam.tex, uMask: cam.mask, uRes: [stage.width, stage.height], uXf: cam.xf })
    gl.disable(gl.BLEND)
  } else if (cam.w && cam.h) drawCam({ uSrc: cam.tex, uRes: [stage.width, stage.height], uXf: cam.xf }) // raw until the first mask
  drawLat()
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
      ? `mask ${mk.model} ${mk.ready ?? 'waiting for the worker…'}${cam.error ? ` ERROR: ${cam.error}` : ''} · ema ${mk.w}×${mk.h} ${mk.floatEma ? 'RG16F' : 'RGBA8 (k ≥ .25)'} k=gate (area ${camGate.area.toFixed(3)} held ${camGate.held}) · ALIGN ${camAlign.on ? 'on' : 'off'}`
      : null
    const st = cam.stats
    const maskStat = maskLine ? ` · area ${st.area.toFixed(3)} · centroid (${st.cx.toFixed(3)}, ${st.cy.toFixed(3)}) · box [${st.box.map((v) => v.toFixed(2)).join(', ')}]` : ''
    const maskMs =
      maskLine && mk.workerMs.length
        ? ` · worker ${q(mk.workerMs, 0.5)!.toFixed(1)}/${q(mk.workerMs, 0.95)!.toFixed(1)} ms p50/p95 · main ${q(mk.mainMs, 0.95)?.toFixed(2)} ms p95`
        : ''
    probe.canRun = !!env.stage && (camSource.kind === 'clip' || camSource.kind === 'camera') && !probe.running
    probe.audioSource = store.getSnapshot().source
    if (camSource.kind === 'camera' && camSource.settings?.deviceId) lastCameraId = camSource.settings.deviceId
    pre.textContent = [
      `camprobe: heavy=${HEAVY} upload=${camStat.path} arms=${ARMS.join('|')} moments=${MOMENTS.join('|')}${SOAK_MIN ? ` soak=${SOAK_MIN}min` : ''}${RECLINE ? ` recycle=${RECLINE}` : ''}`,
      `source ${camSource.kind} ${cam.w}×${cam.h} · upload ${up}`,
      ...(maskLine ? [`${maskLine}${maskStat}${maskMs}`] : []),
      JSON.stringify(env, null, 1),
      `select: __camprobe.allow() → __camprobe.list() → __camprobe.select('<deviceId>') (or select(file) for a clip, select('off') to stop)`,
    ].join('\n')
    console.log(`camprobe source ${camSource.kind} ${cam.w}×${cam.h} · upload ${up}${maskLine ? ` · ${maskLine}${maskMs}` : ''}`)
  }
}
requestAnimationFrame(overlay)

/** Hold HEAVY once the app is started (bench.ts's pattern; needsStart clears on the Start click), then
 *  the unattended source: &clip= is fetched and selected on boot; &model= is the S0.2 manual overlay. */
function sleep(ms: number) {
  return new Promise((ok) => setTimeout(ok, ms))
}
async function run() {
  while (store.getSnapshot().needsStart) await sleep(200)
  director.setPlaylist([HEAVY])
  director.setHold(true)
  director.next()
  if (CLIP) {
    log(`clip: ${CLIP}`)
    await selectClip()
  }
  if (MODEL) startModel(MODEL) // any model, manual overlay (S0.4)
}
void run()

async function waitUntil(pred: () => boolean, ms: number, what: string) {
  const t0 = performance.now()
  while (performance.now() - t0 < ms) {
    if (pred()) return
    if (cam.error && !FAULT) throw new Error(`${what}: worker error: ${cam.error}`) // a fault run expects errors
    await sleep(100)
  }
  throw new Error(`${what}: timed out after ${ms} ms`)
}

async function selectClip() {
  const blob = await (await fetch(CLIP!)).blob()
  await selectCamera(new File([blob], CLIP!.split('/').pop() ?? 'clip', { type: blob.type }))
  await waitUntil(() => cam.w > 0, 15000, 'clip first frame')
}

const r1 = (x: number | null) => (x === null ? null : Math.round(x * 10) / 10)
const r2 = (x: number | null) => (x === null ? null : Math.round(x * 100) / 100)

/** Put the arm's source + model + ALIGN in place; the 60 s window starts only at steady state. */
async function armSetup(spec: ArmSpec): Promise<{ initMs: number | null; firstMaskMs: number | null } | null> {
  await stopModel()
  camMask.recycleCount = 0 // the swap count belongs to this arm/soak window
  if (spec.align !== null) camAlign.on = spec.align
  if (!spec.camera) {
    if (camSource.kind !== 'off') await selectCamera('off')
  } else if (camSource.kind !== 'camera' && camSource.kind !== 'clip') {
    if (CLIP) await selectClip()
    else if (lastCameraId) {
      await selectCamera(lastCameraId)
      await waitUntil(() => cam.w > 0, 15000, 'camera first frame')
    } else throw new Error('no source: use &clip= or select a camera before Run all')
  }
  if (!spec.model) return null
  const t0 = performance.now()
  startModel(spec.model, spec.delegate)
  if (FAULT === 'dead') return { initMs: null, firstMaskMs: null } // every host fails at its first frame (B3)
  await waitUntil(() => camMask.ready !== null, 90000, `init ${spec.model}`)
  const initMs = performance.now() - t0
  await waitUntil(() => camMask.ts.length > 0, 30000, `first mask ${spec.model}`)
  return { initMs, firstMaskMs: camMask.ts[0] - (camMask.readyAt ?? t0) }
}

const maxGap = (ts: number[]) => (ts.length > 1 ? Math.round(Math.max(...ts.slice(1).map((t, i) => t - ts[i]))) : null)

interface ArmResult {
  maskFps: { min1s: number | null; med: number | null } | null
  inferMs: { p50: number | null; p95: number | null } | null
  mainMs: { p95: number | null } | null
  late: number
  frames: number
  scale: number
  masks: number // armTs.length — the denominator: < window × rate means the ts cap truncated the window
  initMs: number | null
  firstMaskMs: number | null
  align: boolean | null
  error?: string // the arm failed (init error): the run continues, the evidence is the error
  // S1.2b (K-1 B1–B5): SegmentWorker constructions in the window, cam.error at its end, the readMask() mean (0..1) at
  // its end, the worst mask-arrival gap, the image: cam.tex uploads in the worst 1 s window and the worst gap
  hosts?: number
  camError?: string | null
  maskMean?: number | null
  maskGapMs?: number | null
  imageFps?: { min1s: number | null }
  imageGapMs?: number | null
}

/** A 60 s steady-state window: late = the governor's drops (reset at the window start), scale at the end. */
async function runArm(spec: ArmSpec, seconds: number): Promise<ArmResult> {
  const info = await armSetup(spec)
  governor.reset()
  await sleep(2000) // the reset's first reallocation settles outside the window (K3 is steady state)
  const frames0 = rafFrames
  const late0 = governor.drops
  const hosts0 = camMask.hosts
  const armTs: number[] = [], armWorkerMs: number[] = [], armMainMs: number[] = [], armUp: number[] = []
  let ti = camMask.ts.length, wi = camMask.workerMs.length, mi = camMask.mainMs.length, ui = camStat.at.length
  const drain = () => {
    armTs.push(...camMask.ts.slice(ti)); ti = camMask.ts.length
    armWorkerMs.push(...camMask.workerMs.slice(wi)); wi = camMask.workerMs.length
    armMainMs.push(...camMask.mainMs.slice(mi)); mi = camMask.mainMs.length
    armUp.push(...camStat.at.slice(ui)); ui = camStat.at.length
  }
  const poll = setInterval(() => {
    drain()
    if (AGREE_ARMS.has(spec.name)) agreeSample(spec) // K7: the EMA mask at this clip moment (the 500 ms poll's cadence)
  }, 500)
  log(`${spec.name}: ${seconds} s window (model ${spec.model ?? '—'} · ${spec.delegate ?? 'CPU'} · align ${spec.align ?? '—'}${FAULT ? ` · fault ${FAULT}` : ''})`)
  await sleep(seconds * 1000)
  clearInterval(poll)
  drain()
  const gaps = armTs.slice(1).map((t, i) => t - armTs[i])
  const medGap = p50(gaps)
  const m = readMask()
  const r0 = (x: number | null | undefined) => (x == null ? null : Math.round(x))
  const result: ArmResult = {
    maskFps: spec.model ? { min1s: r1(minWindowFps(armTs)), med: medGap ? r1(1000 / medGap) : null } : null,
    inferMs: spec.model ? { p50: r1(p50(armWorkerMs)), p95: r1(p95(armWorkerMs)) } : null,
    mainMs: { p95: r2(p95(armMainMs)) }, // K-9: per camera frame, in every arm (null with no camera)
    late: governor.drops - late0,
    frames: rafFrames - frames0,
    scale: +governor.scale.toFixed(4),
    masks: armTs.length,
    initMs: r0(info?.initMs),
    firstMaskMs: r0(info?.firstMaskMs),
    align: spec.align,
    hosts: camMask.hosts - hosts0,
    camError: cam.error,
    maskMean: r4(m.data.reduce((a, b) => a + b, 0) / m.data.length / 255),
    maskGapMs: maxGap(armTs),
    imageFps: { min1s: r1(minWindowFps(armUp)) },
    imageGapMs: maxGap(armUp),
  }
  log(`${spec.name}: done — ${JSON.stringify(result)}`)
  return result
}

// K7 agreement samples: the EMA mask (readMask, after D2 smoothing) bucketed by 500 ms of CLIP time —
// the CPU and GPU arms of the same model sample the same deterministic loop, so the buckets join.
interface AgreeSample {
  model: ModelId
  delegate: 'CPU' | 'GPU'
  key: number
  w: number
  h: number
  data: Uint8Array
  area: number
}
const agreeBuf: AgreeSample[] = []
function agreeSample(spec: ArmSpec) {
  const d = video.duration
  if (!isFinite(d) || d <= 0) return // camera source: no deterministic clip time — the pass yields no pairs
  const mk = readMask()
  if (!mk) return
  agreeBuf.push({
    model: spec.model!,
    delegate: spec.delegate ?? 'CPU',
    key: Math.round((video.currentTime % d) * 2),
    w: mk.w,
    h: mk.h,
    data: mk.data,
    area: cam.stats.area,
  })
}

/** &soak=<min>: one arm (the first of &arms, default W-selfie-cpu) for N minutes, logged per minute.
 *  &recycle=<min> (S0.4, D2 make-before-break): tick() starts a new worker beside the old at that host age, the
 *  swap at its first mask, the old retired — `recycle` in the JSON counts the swaps actually made. The stuck
 *  watchdog is tick's (K-1, S1.2b). */
async function soakArm(spec: ArmSpec, minutes: number): Promise<{ recycle: number | null; perMin: { min: number; maskFps: number | null; inferP95: number | null; late: number }[] }> {
  await armSetup(spec)
  governor.reset()
  await sleep(2000)
  const t0 = performance.now()
  const perMin: { min: number; maskFps: number | null; inferP95: number | null; late: number }[] = []
  let lastDrops = 0
  let bTs: number[] = [], bWm: number[] = []
  let ti = camMask.ts.length, wi = camMask.workerMs.length
  const flush = () => {
    const gaps = bTs.slice(1).map((t, i) => t - bTs[i])
    const medGap = p50(gaps)
    perMin.push({
      min: perMin.length + 1,
      maskFps: medGap ? Math.round(1000 / medGap) : null,
      inferP95: p95(bWm) === null ? null : Math.round(p95(bWm)!),
      late: governor.drops - lastDrops,
    })
    lastDrops = governor.drops
    bTs = []
    bWm = []
  }
  const poll = setInterval(() => {
    bTs.push(...camMask.ts.slice(ti)); ti = camMask.ts.length
    bWm.push(...camMask.workerMs.slice(wi)); wi = camMask.workerMs.length
    while (perMin.length < Math.floor((performance.now() - t0) / 60000) && perMin.length < minutes) flush()
  }, 500)
  log(`${spec.name}: soak ${minutes} min (recycle ${RECYCLE_MIN ? `every ${RECYCLE_MIN} min` : 'off'})`)
  await sleep(minutes * 60000)
  clearInterval(poll)
  bTs.push(...camMask.ts.slice(ti))
  bWm.push(...camMask.workerMs.slice(wi))
  while (perMin.length < minutes) flush()
  log(`soak: done — swaps ${camMask.recycleCount} · ${JSON.stringify(perMin)}`)
  return { recycle: RECYCLE_MIN ? camMask.recycleCount : null, perMin }
}

// K7: GPU vs CPU of the same clip frames, per model (metrics.iou / centroidDelta, already tested).
// The samples are the EMA readbacks (both arms run the same D2 smoothing, so they compare like for
// like). Degenerate on a person-free clip: two empty masks score iou 1 / Δ 0 by metrics.iou's
// definition — `meanArea` marks that in the JSON, and the log says so plainly.
const r4 = (x: number | null) => (x === null ? null : Math.round(x * 10000) / 10000)
function computeAgreement(): Record<string, { iou: number | null; centroidTexels: number | null; pairs: number; meanArea: number }> {
  const out: Record<string, { iou: number | null; centroidTexels: number | null; pairs: number; meanArea: number }> = {}
  const byModel = new Map<ModelId, { cpu: AgreeSample[]; gpu: AgreeSample[] }>()
  for (const s of agreeBuf) {
    let e = byModel.get(s.model)
    if (!e) byModel.set(s.model, (e = { cpu: [], gpu: [] }))
    ;(s.delegate === 'GPU' ? e.gpu : e.cpu).push(s)
  }
  for (const [model, { cpu, gpu }] of byModel) {
    if (!cpu.length || !gpu.length) continue
    const buckets = new Map<number, { c: AgreeSample[]; g: AgreeSample[] }>()
    for (const s of cpu) {
      const b = buckets.get(s.key) ?? { c: [], g: [] }
      b.c.push(s)
      buckets.set(s.key, b)
    }
    for (const s of gpu) {
      const b = buckets.get(s.key) ?? { c: [], g: [] }
      b.g.push(s)
      buckets.set(s.key, b)
    }
    let pairs = 0, iouSum = 0, centSum = 0, areaSum = 0
    for (const { c, g } of buckets.values()) {
      const k = Math.min(c.length, g.length)
      for (let i = 0; i < k; i++) {
        const a = c[i], b = g[i]
        if (a.w !== b.w || a.h !== b.h) continue // the delegates disagree on the output size: skip, not average
        pairs++
        iouSum += iou(a.data, b.data)
        centSum += centroidDelta(a.data, b.data, a.w, a.h)
        areaSum += (a.area + b.area) / 2
      }
    }
    const meanArea = pairs ? areaSum / pairs : 0
    out[model] = { iou: pairs ? r4(iouSum / pairs) : null, centroidTexels: pairs ? r2(centSum / pairs) : null, pairs, meanArea: Math.round(meanArea * 10000) / 10000 }
    const degenerate = pairs > 0 && meanArea < 0.005
    log(
      `agreement ${model}: ${pairs} pairs · mean iou ${out[model].iou} · mean centroid Δ ${out[model].centroidTexels} texels · mean area ${meanArea.toFixed(4)}` +
        (degenerate ? ' — DEGENERATE: no person in the clip; two near-empty masks score iou 1 / Δ 0 (metrics.iou: two empty masks agree → 1). Real numbers need a person in frame.' : ''),
    )
  }
  if (!Object.keys(out).length) log('agreement: no model ran both a -cpu and a -gpu arm (need W-<model>-cpu and W-<model>-gpu in &arms)')
  return out
}

// The sheet: moments (clip seconds) × arms, the EMA mask (after D2 smoothing) over the frame, each cell
// 320×180. Columns are re-armed (source + model), then the clip is seeked per row.
function coverDraw(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.width, h / img.height)
  const dw = img.width * s, dh = img.height * s
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
}

function texToCanvas(data: Uint8Array, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(data), w, h), 0, 0)
  return c
}

async function sheetPass(specs: ArmSpec[]): Promise<HTMLCanvasElement | null> {
  const cols = specs.filter((s) => s.camera)
  if (!cols.length || !MOMENTS.length) return null
  const CW = 320, CH = 180, GAP = 8, LB = 22
  const sheet = document.createElement('canvas')
  sheet.width = cols.length * (CW + GAP) + GAP
  sheet.height = MOMENTS.length * (CH + LB + GAP) + GAP
  const sctx = sheet.getContext('2d')!
  sctx.fillStyle = '#111'
  sctx.fillRect(0, 0, sheet.width, sheet.height)
  sctx.font = '13px monospace'
  sctx.textBaseline = 'alphabetic'
  for (let c = 0; c < cols.length; c++) {
    const spec = cols[c]
    await armSetup(spec) // a measured arm failing again here is a real error
    const x0 = GAP + c * (CW + GAP)
    for (let r = 0; r < MOMENTS.length; r++) {
      const sec = MOMENTS[r]
      const t = camSource.kind === 'clip' && isFinite(video.duration) && video.duration > 0 ? sec % video.duration : sec
      if (camSource.kind === 'clip') {
        video.currentTime = t
        await waitUntil(() => Math.abs(video.currentTime - t) < 0.05, 5000, `seek ${sec} s`)
      }
      await sleep(800) // EMA settle (k = .85: ≈20 frames to 96%)
      const y0 = GAP + r * (CH + LB + GAP)
      sctx.fillStyle = '#000'
      sctx.fillRect(x0, y0, CW, CH)
      const f = readCam()
      if (f) coverDraw(sctx, texToCanvas(f.data, f.w, f.h), x0, y0, CW, CH)
      const m = readMask()
      if (m) {
        const mc = document.createElement('canvas')
        mc.width = m.w
        mc.height = m.h
        const mi = mc.getContext('2d')!.createImageData(m.w, m.h)
        for (let i = 0; i < m.data.length; i++) {
          mi.data[i * 4] = mi.data[i * 4 + 1] = mi.data[i * 4 + 2] = 255
          mi.data[i * 4 + 3] = m.data[i]
        }
        mc.getContext('2d')!.putImageData(mi, 0, 0)
        sctx.globalAlpha = 0.55
        coverDraw(sctx, mc, x0, y0, CW, CH)
        sctx.globalAlpha = 1
      }
      sctx.fillStyle = '#8f8'
      sctx.fillText(`${spec.name} · t=${sec}s${t !== sec ? ` (mod ${video.duration.toFixed(1)})` : ''} · area ${cam.stats.area.toFixed(3)}`, x0, y0 + CH + 15)
    }
  }
  await stopModel()
  return sheet
}

function download(name: string, blob: Blob) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 10000)
}

const shot = (mode: string, n: number) =>
  new Promise<void>((ok) => {
    lat.toBlob((b) => {
      if (b) download(`latency-${mode}-${n}.png`, b)
      ok()
    }, 'image/png')
  })

/** The "Latency" button (U0.4): raw → ALIGN on → ALIGN off, 5 shots per mode. Each PNG: the clock now
 *  (left) and the product's view of the clock seen through the camera (right, a cam.tex readback). */
async function latencyRun() {
  if (probe.running) return
  if (camSource.kind === 'off') return log('Latency: select a source first')
  latBtn.disabled = true
  try {
    const model: ModelId = (camMask.model as ModelId | null) ?? MODEL ?? 'selfie'
    const modes: [string, boolean | null][] = [
      ['raw', null],
      ['align-on', true],
      ['align-off', false],
    ]
    for (const [mode, align] of modes) {
      await stopModel()
      if (align === null) log('latency raw (no model)')
      else {
        camAlign.on = align
        startModel(model)
        await waitUntil(() => camMask.ready !== null, 90000, `latency init ${model}`)
        await waitUntil(() => camMask.ts.length > 0, 30000, `latency first mask`)
        log(`latency ${mode}: ${model} ready`)
      }
      await sleep(1500)
      for (let n = 1; n <= 5; n++) {
        const f = readCam()
        if (f) {
          grabCanvas.width = f.w
          grabCanvas.height = f.h
          grabCanvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(f.data), f.w, f.h), 0, 0)
          grabAt = performance.now()
        }
        drawLat() // fresh clock + grab in the same task, then the blob
        await shot(mode, n)
        await sleep(1000)
      }
    }
    log('latency: 15 shots downloaded (raw, align-on, align-off × 5)')
  } finally {
    latBtn.disabled = false
  }
}

/** "Run all": the arms (or the soak), the sheet, then the JSON + sheet downloads (frozen CP0 shape). */
async function runner() {
  if (probe.running) return
  probe.running = true
  runBtn.disabled = true
  const results: Record<string, ArmResult> = {}
  const json: Record<string, unknown> = { env, arms: results, agreement: {} }
  const pfx = camSource.kind === 'camera' ? `${prefix}-cam` : prefix // camera and clip runs share a date-based name; keep the evidence separate
  try {
    for (const name of ARMS)
      if (!ARM_SPECS[name]) throw new Error(`unknown arm '${name}' (known: ${Object.keys(ARM_SPECS).join(', ')})`)
    let sheet: HTMLCanvasElement | null = null
    if (SOAK_MIN > 0) {
      const spec = ARM_SPECS[ARMS[0] ?? 'W-selfie-cpu']
      json.soak = await soakArm(spec, SOAK_MIN)
    } else {
      for (const name of ARMS) {
        const spec = ARM_SPECS[name]
        try {
          results[name] = await runArm(spec, ARM_SECONDS)
        } catch (e) {
          // one broken arm (e.g. the GPU delegate refusing a context) is the evidence, not a run-killer
          const msg = String(e instanceof Error ? e.message : e)
          log(`arm ${name}: FAILED — ${msg}`)
          results[name] = {
            maskFps: null,
            inferMs: null,
            mainMs: null,
            late: 0,
            frames: 0,
            scale: +governor.scale.toFixed(4),
            masks: 0,
            initMs: null,
            firstMaskMs: null,
            align: spec.align,
            error: msg,
          }
        }
      }
      log('agreement: GPU vs CPU of the same clip frames, per model (K7)')
      json.agreement = computeAgreement()
      log(FAULT ? 'sheet: skipped (a fault run)' : 'sheet: moments × arms')
      sheet = FAULT ? null : await sheetPass(ARMS.map((n) => ARM_SPECS[n]))
      const sh = sheet
      if (sh) await new Promise<void>((ok) => sh.toBlob((b) => b && (download(`${pfx}-sheet.png`, b), ok()), 'image/png'))
    }
    probe.done = true
    probe.results = { json: JSON.stringify(json, null, 1), sheet: sheet ? sheet.toDataURL('image/png') : null, prefix: pfx }
    download(`${pfx}.json`, new Blob([probe.results.json], { type: 'application/json' }))
    log(`downloaded ${pfx}.json${SOAK_MIN ? ' (soak)' : ' + sheet'}`)
  } catch (e) {
    probe.error = String(e instanceof Error ? e.message : e)
    log(`RUNNER FAILED: ${probe.error}`)
  } finally {
    probe.running = false
    runBtn.disabled = false
  }
}
runBtn.addEventListener('click', () => void runner())
latBtn.addEventListener('click', () => void latencyRun())
probe.run = runner
