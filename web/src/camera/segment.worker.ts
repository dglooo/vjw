// The segmentation side (plan_camera S0.2 + S0.4, design Variant B): the only place a model lives. A
// model is one function, no classes. The module runs in the dedicated worker only (classic, G1; the R0-Mac
// ruling: worker host). Models (S1.2a prune, design § Ruling §5): `synthetic` (the deterministic
// ellipse — the plumbing check), `selfie` (the pick: landscape, input 256×144) and `pose-lite`
// (PoseLandmarker lite, the K6 runner-up: `outputSegmentationMasks`, the FULL frame — no pose in the frame
// yields a 1×1 empty mask, so a person-free clip measures degenerate, not broken). The `delegate: 'GPU'`
// init field stays (the PC fallback). VIDEO mode with a monotonic stamp; the result is area-downsampled to
// ≤320×180 and quantized before posting.
// The module closes every frame it is sent (design risk 2: an unclosed VideoFrame starves the buffer pool).
import type { ImageSegmenter, PoseLandmarker } from '@mediapipe/tasks-vision'
import { downsample, quantize, stats } from './smooth'
import type { MaskStats } from './smooth'

export type ModelId = 'synthetic' | 'selfie' | 'pose-lite'
export type ToWorker = { type: 'init'; model: ModelId; delegate: 'CPU' | 'GPU'; base: string }
  | { type: 'frame'; id: number; frame: VideoFrame }
  | { type: 'close' }
export type FromWorker = { type: 'ready'; info: string } | { type: 'error'; msg: string }
  // data is a fresh buffer (quantize/downsample) — transferable, and a TexImageSource on the other side
  | { type: 'mask'; id: number; w: number; h: number; data: Uint8Array<ArrayBuffer>; ms: number; stats: MaskStats }
type Post = (f: FromWorker, t?: Transferable[]) => void
type Model = (frame: VideoFrame) => Promise<{ data: Uint8Array | Float32Array; w: number; h: number }>

const MAXW = 320, MAXH = 180 // the ≤64 KB mask (G4, G5)

let model: Model | null = null
let seg: ImageSegmenter | null = null
let pose: PoseLandmarker | null = null
let stamp = 0 // the monotonic VIDEO-mode clock (a looping clip's media time jumps back)
let n = 0 // the synthetic's frame counter

/** The stand-in (plan CP0 TL;DR): an ellipse, area ≈ .12, whose centre drifts on a sine; every 90th frame
 *  is flooded and every 91st empty — the S1.1 gate must hold those (S0.2 shows them as flashes). */
const synthetic: Model = async () => {
  const w = 240, h = 135 // 16:9, already ≤320×180
  const i = ++n
  const data = new Float32Array(w * h)
  if (i % 90 === 0) data.fill(1)
  else if (i % 91 === 0) return { data, w, h }
  else {
    const cx = 0.5 + 0.28 * Math.sin((2 * Math.PI * i) / 180)
    const cy = 0.5 + 0.22 * Math.sin((2 * Math.PI * i) / 120 + 1.3)
    // π·(a/W)·(b/H) = .12 → a = .22·W, b = .12/(π·.22)·H
    const ax = 0.22 * w, ay = (0.12 / (Math.PI * 0.22)) * h
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const dx = (x + 0.5 - cx * w) / ax
        const dy = (y + 0.5 - cy * h) / ay
        const d2 = dx * dx + dy * dy
        data[y * w + x] = d2 < 1 ? 1 - 0.25 * d2 : 0 // soft edge; the mean stays ≈ .12
      }
  }
  return { data, w, h }
}

// ImageSegmenter (S0.2): the model file + the input size the docs' table lists (the mask comes back
// pixel-aligned to that input). Person = confidence mask 0.
const SELFIE = { file: 'selfie_segmenter_landscape.tflite', iw: 256, ih: 144 }
const POSE_FILE = 'pose_landmarker_lite.task'

const stampNow = () => (stamp = Math.max(performance.now(), stamp + 1))

const selfieModel: Model = async (frame) => {
  const bmp = await createImageBitmap(frame, { resizeWidth: SELFIE.iw, resizeHeight: SELFIE.ih })
  const res = seg!.segmentForVideo(bmp, stampNow())
  bmp.close()
  const m = res.confidenceMasks?.[0]
  if (!m) {
    res.close()
    throw new Error('selfie: no confidence mask in the result')
  }
  const out = { data: m.getAsFloat32Array(), w: m.width, h: m.height } // a copy (readPixels), not a view
  // S0.2 leak, fixed in S0.4: every unclosed MPMask pins a GL texture in the wasm context (close() is
  // the deleteTexture) — MediaPipe's leak detector logged it since S0.2. The data above is a copy
  // (readPixels), so closing now is safe. (The soak's 3.5 s stalls persist with this fix — a different
  // cause, under instrumentation.)
  res.close()
  return out
}

// PoseLandmarker (S0.4): the FULL frame is the input (no crop/resize — the whole-body model); the
// segmentation mask comes off the first (only) pose.
const poseModel: Model = async (frame) => {
  const res = pose!.detectForVideo(frame, stampNow())
  const m = res.segmentationMasks?.[0]
  const out = m
    ? { data: m.getAsFloat32Array(), w: m.width, h: m.height } // a copy (readPixels), not a view
    : { data: new Float32Array(1), w: 1, h: 1 } // no pose in frame: an empty mask
  res.close() // as in selfieModel: the unclosed result pins its masks' GL textures in the wasm context
  return out
}

// the GPU delegate gets a private OffscreenCanvas context in the worker (W-*-gpu)
const gpuCanvas = (delegate: 'CPU' | 'GPU') => (delegate === 'GPU' ? new OffscreenCanvas(2, 2) : undefined)

async function makeSeg(base: string, delegate: 'CPU' | 'GPU', file: string) {
  const { FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision')
  const fileset = await FilesetResolver.forVisionTasks(`${base}mediapipe`) // the postinstall copy (D7: localhost only)
  const canvas = gpuCanvas(delegate)
  return ImageSegmenter.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: `${base}models/${file}`, delegate, ...(canvas ? { canvas } : {}) },
    runningMode: 'VIDEO',
  })
}

async function makePose(base: string, delegate: 'CPU' | 'GPU', file: string) {
  const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision')
  const fileset = await FilesetResolver.forVisionTasks(`${base}mediapipe`)
  const canvas = gpuCanvas(delegate)
  return PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: `${base}models/${file}`, delegate, ...(canvas ? { canvas } : {}) },
    runningMode: 'VIDEO',
    numPoses: 1,
    outputSegmentationMasks: true,
  })
}

// The tsconfig's lib has no WebWorker types (it types `self` as Window); this is the worker's own surface:
// postMessage takes (message, Transferable[]).
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null
  postMessage(message: FromWorker, transfer?: Transferable[]): void
  import?: (url: string) => Promise<unknown>
}

// D7 (localhost only): tasks-vision 1.2.2 carries a usage logger that POSTs to
// https://odml.pa.googleapis.com/v1/log once a minute (vision_bundle's logger class; S0.3 took it for
// Chrome's own telemetry, the S1.2a B17 run caught it). The worker refuses every foreign fetch: the logger
// catches the rejection, stops its timer and prints nothing; the wasm and the models stay same-origin.
const fetch0 = self.fetch.bind(self)
self.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input), self.location.href)
  return url.origin === self.location.origin ? fetch0(input, init) : Promise.reject(new Error(`segment.worker: foreign fetch refused (D7): ${url.origin}`))
}

// MediaPipe's loader loads the self-hosted wasm glue: on the main thread a classic <script> tag (Vite
// serves /public untransformed — verified in vision_bundle's Ph), in a worker importScripts (which throws
// in a module worker, G1) → the `self.import` fallback, which Vite dev poisons for /public files. The shim
// honours the loader's self.import check first: fetch the glue and run it in global scope, where its UMD
// top-level `var ModuleFactory` lands on self (the code is same-origin, self-hosted by postinstall — D7).
if (!ctx.import)
  ctx.import = async (url) => {
    if (/vision_wasm_internal\.js(\?.*)?$/.test(url)) {
      ;(0, eval)(await (await fetch(url)).text())
      return {}
    }
    return import(/* @vite-ignore */ url)
  }

/** One ToWorker message; `post` carries the FromWorker reply (the mask buffer transferred). */
async function dispatch(m: ToWorker, post: Post): Promise<void> {
  try {
    if (m.type === 'init') {
      n = 0
      stamp = 0
      seg?.close()
      seg = null
      pose?.close()
      pose = null
      const v = m.model
      if (v === 'synthetic') model = synthetic
      else if (v === 'selfie') {
        seg = await makeSeg(m.base, m.delegate, SELFIE.file)
        model = selfieModel
      } else if (v === 'pose-lite') {
        pose = await makePose(m.base, m.delegate, POSE_FILE)
        model = poseModel
      } else throw new Error(`${v} is not a model`)
      post({ type: 'ready', info: `${v} ${m.delegate}` })
    } else if (m.type === 'frame') {
      if (!model) {
        m.frame.close()
        post({ type: 'error', msg: 'frame before init' })
        return
      }
      const t0 = performance.now()
      const r = await model(m.frame).finally(() => m.frame.close())
      let data: Uint8Array<ArrayBuffer> = r.data instanceof Float32Array ? quantize(r.data) : (r.data as Uint8Array<ArrayBuffer>)
      const scale = Math.min(MAXW / r.w, MAXH / r.h, 1)
      let w = r.w, h = r.h
      if (scale < 1) {
        w = Math.round(r.w * scale)
        h = Math.round(r.h * scale)
        data = downsample(data, r.w, r.h, w, h)
      }
      post({ type: 'mask', id: m.id, w, h, data, ms: performance.now() - t0, stats: stats(data, w, h) }, [data.buffer])
    } else if (m.type === 'close') {
      seg?.close()
      seg = null
      pose?.close()
      pose = null
      model = null
    }
  } catch (err) {
    post({ type: 'error', msg: String(err instanceof Error ? err.stack ?? err.message : err) })
  }
}

// Only the worker realm wires itself up (camera.ts imports types only; on the main thread, setting
// window.onmessage would clobber the page's own handler).
if (typeof document === 'undefined')
  ctx.onmessage = (e: MessageEvent<ToWorker>) => {
    void dispatch(e.data, (f, t) => ctx.postMessage(f, t))
  }
