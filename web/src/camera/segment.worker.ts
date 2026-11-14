// The segmentation side (plan_camera S0.2 + S0.4, design Variant B): the only place a model lives. A
// model is one function, no classes. The module runs in the dedicated worker (classic, G1) and — for the
// M-* probe arms — on the main thread behind the SAME ToWorker/FromWorker messages (S0.4 `host: 'main'`):
// camera.ts drives `dispatch()` there, points `hostCanvas` at the app's `stage` for the GPU delegate
// (M-same = design Variant C: MediaPipe on OUR WebGL2 context) and arms the K5 `preInfer` GL snapshot.
// Arms: `synthetic` (the deterministic ellipse — the plumbing check), `selfie` (landscape, input 144×256),
// `selfie-square` (256×256), `multiclass` (256×256, 6 classes: person = max over the person parts),
// `deeplab` (257×257, generic categories: person = the 'person' class), `pose-lite` / `pose-full`
// (PoseLandmarker, `outputSegmentationMasks`, the FULL frame — no pose in the frame yields a 1×1 empty
// mask, so a person-free clip measures degenerate, not broken), `rvm` (Robust Video Matting, the
// official fp16 ONNX on ORT-Web WebGPU — rvm.ts: the recurrent states stay on the GPU). VIDEO mode
// with a monotonic stamp; the result is area-downsampled to ≤320×180 and quantized before posting.
// The module closes every frame it is sent (design risk 2: an unclosed VideoFrame starves the buffer pool).
import type { ImageSegmenter, PoseLandmarker } from '@mediapipe/tasks-vision'
import { downsample, quantize, stats } from './smooth'
import type { MaskStats } from './smooth'
import { createRvm, type Rvm } from './rvm'

export type ModelId = 'synthetic' | 'selfie' | 'selfie-square' | 'pose-lite' | 'pose-full' | 'multiclass' | 'deeplab' | 'rvm'
export type ToWorker = { type: 'init'; model: ModelId; delegate: 'CPU' | 'GPU'; base: string }
  | { type: 'frame'; id: number; frame: VideoFrame }
  | { type: 'close' }
export type FromWorker = { type: 'ready'; info: string } | { type: 'error'; msg: string }
  // data is a fresh buffer (quantize/downsample) — transferable, and a TexImageSource on the other side
  | { type: 'mask'; id: number; w: number; h: number; data: Uint8Array<ArrayBuffer>; ms: number; stats: MaskStats }
export type Post = (f: FromWorker, t?: Transferable[]) => void
type Model = (frame: VideoFrame) => Promise<{ data: Uint8Array | Float32Array; w: number; h: number }>

const MAXW = 320, MAXH = 180 // the ≤64 KB mask (G4, G5)

// M-same (K5): the canvas MediaPipe's GPU delegate binds — the app's `stage` on the main thread (our
// WebGL2 context, design Variant C); null → a private OffscreenCanvas in a worker, MediaPipe's own
// canvas on the main thread. camera.ts sets these for the main-thread instance; the worker realm keeps
// them null (separate module instance).
let hostCanvas: OffscreenCanvas | HTMLCanvasElement | null = null
let preInfer: (() => void) | null = null // called right before the sync inference (the K5 before-snapshot)
export function setHostCanvas(c: OffscreenCanvas | HTMLCanvasElement | null): void {
  hostCanvas = c
}
export function setPreInfer(fn: (() => void) | null): void {
  preInfer = fn
}

let model: Model | null = null
let seg: ImageSegmenter | null = null
let pose: PoseLandmarker | null = null
let rvm: Rvm | null = null
let segPersonIdx: number[] = [] // multiclass/deeplab: the person classes' mask indices (getLabels)
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

// ImageSegmenter variants (S0.4): model file + the input size the docs' table lists (the masks come back
// pixel-aligned to that input). Person = mask 0 for selfie, the max over the person classes otherwise.
const SEG = {
  selfie: { file: 'selfie_segmenter_landscape.tflite', iw: 256, ih: 144 },
  'selfie-square': { file: 'selfie_segmenter.tflite', iw: 256, ih: 256 },
  multiclass: { file: 'selfie_multiclass_256x256.tflite', iw: 256, ih: 256 },
  deeplab: { file: 'deeplab_v3.tflite', iw: 257, ih: 257 },
} as const
type SegId = keyof typeof SEG

const stampNow = () => (stamp = Math.max(performance.now(), stamp + 1))

function segModel(v: SegId): Model {
  const c = SEG[v]
  return async (frame) => {
    const bmp = await createImageBitmap(frame, { resizeWidth: c.iw, resizeHeight: c.ih })
    preInfer?.() // K5: bracket the sync GL work (the main-thread host)
    const res = seg!.segmentForVideo(bmp, stampNow())
    bmp.close()
    const ms = res.confidenceMasks
    if (!ms?.length) {
      res.close()
      throw new Error(`${v}: no confidence masks in the result`)
    }
    const idx = v === 'selfie' || v === 'selfie-square' ? [0] : segPersonIdx
    let out: { data: Uint8Array | Float32Array; w: number; h: number }
    if (idx.length === 1) {
      const m = ms[idx[0]]
      if (!m) throw new Error(`${v}: missing mask ${idx[0]}`)
      out = { data: m.getAsFloat32Array(), w: m.width, h: m.height } // a copy (readPixels), not a view
    } else {
      const w = ms[0].width, h = ms[0].height
      const max = new Float32Array(w * h)
      for (const i of idx) {
        const a = ms[i].getAsFloat32Array()
        for (let j = 0; j < max.length; j++) if (a[j] > max[j]) max[j] = a[j]
      }
      out = { data: max, w, h }
    }
    // S0.2 leak, fixed in S0.4: every unclosed MPMask pins a GL texture in the wasm context (close() is
    // the deleteTexture) — MediaPipe's leak detector logged it since S0.2. The data above is a copy
    // (readPixels), so closing now is safe. (The soak's 3.5 s stalls persist with this fix — a different
    // cause, under instrumentation.)
    res.close()
    return out
  }
}

// PoseLandmarker (S0.4): the FULL frame is the input (no crop/resize — the whole-body model); the
// segmentation mask comes off the first (only) pose.
const POSE = {
  'pose-lite': 'pose_landmarker_lite.task',
  'pose-full': 'pose_landmarker_full.task',
} as const

const poseModel = (): Model =>
  async (frame) => {
    preInfer?.()
    const res = pose!.detectForVideo(frame, stampNow())
    const m = res.segmentationMasks?.[0]
    const out = m
      ? { data: m.getAsFloat32Array(), w: m.width, h: m.height } // a copy (readPixels), not a view
      : { data: new Float32Array(1), w: 1, h: 1 } // no pose in frame: an empty mask
    res.close() // as in segModel: the unclosed result pins its masks' GL textures in the wasm context
    return out
  }

function gpuCanvas(delegate: 'CPU' | 'GPU'): OffscreenCanvas | HTMLCanvasElement | undefined {
  if (delegate !== 'GPU') return undefined
  if (hostCanvas) return hostCanvas
  if (typeof document === 'undefined') return new OffscreenCanvas(2, 2) // worker: a private context (W-*-gpu)
  return undefined // main thread without hostCanvas: MediaPipe creates its own canvas
}

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

/** One ToWorker message, from either host; `post` carries the FromWorker reply (transferred in the
 *  worker, a plain call on the main thread where the buffers stay live). */
export async function dispatch(m: ToWorker, post: Post): Promise<void> {
  try {
    if (m.type === 'init') {
      n = 0
      stamp = 0
      seg?.close()
      seg = null
      pose?.close()
      pose = null
      await rvm?.close()
      rvm = null
      segPersonIdx = []
      const v = m.model
      if (v === 'synthetic') model = synthetic
      else if (v in SEG) {
        const sv = v as SegId
        seg = await makeSeg(m.base, m.delegate, SEG[sv].file)
        if (sv === 'multiclass' || sv === 'deeplab') {
          // the person classes by their label (getLabels: mask index ↔ label index); the docs' order as fallback
          const labels = seg.getLabels()
          const want = sv === 'multiclass' ? /(hair|body|face|cloth)/i : /^person/i
          segPersonIdx = labels.map((l, i) => [want.test(l), i] as const).filter(([ok]) => ok).map(([, i]) => i)
          if (!segPersonIdx.length) segPersonIdx = sv === 'multiclass' ? [1, 2, 3, 4] : [1]
        }
        model = segModel(sv)
      } else if (v in POSE) {
        const pv = v as keyof typeof POSE
        pose = await makePose(m.base, m.delegate, POSE[pv])
        model = poseModel()
      } else if (v === 'rvm') {
        rvm = await createRvm(m.base) // WebGPU EP regardless of the delegate (S0.5: rvm is the WebGPU arm)
        model = rvm.run
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
      await rvm?.close()
      rvm = null
      model = null
    }
  } catch (err) {
    post({ type: 'error', msg: String(err instanceof Error ? err.stack ?? err.message : err) })
  }
}

// Only the worker realm wires itself up; the main-thread instance is driven by camera.ts calling
// dispatch (setting window.onmessage would clobber the page's own handler).
if (typeof document === 'undefined')
  ctx.onmessage = (e: MessageEvent<ToWorker>) => {
    void dispatch(e.data, (f, t) => ctx.postMessage(f, t))
  }
