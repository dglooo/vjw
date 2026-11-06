// The segmentation worker (plan_camera S0.2, design Variant B): the only place a model lives. A model is
// one function, no classes. S0.2 arms: `synthetic` (a deterministic drifting ellipse — the plumbing check,
// no deps) and `selfie` (MediaPipe ImageSegmenter, landscape input 144×256, the CPU delegate, VIDEO mode
// with a monotonic stamp; the result is area-downsampled to ≤320×180 and quantized before posting).
// The worker closes every frame it is sent (design risk 2: an unclosed VideoFrame starves the buffer pool).
import type { ImageSegmenter } from '@mediapipe/tasks-vision'
import { downsample, quantize, stats } from './smooth'
import type { MaskStats } from './smooth'

export type ModelId = 'synthetic' | 'selfie' | 'selfie-square' | 'pose-lite' | 'pose-full' | 'multiclass' | 'deeplab' | 'rvm'
export type ToWorker = { type: 'init'; model: ModelId; delegate: 'CPU' | 'GPU'; base: string }
  | { type: 'frame'; id: number; frame: VideoFrame }
  | { type: 'close' }
export type FromWorker = { type: 'ready'; info: string } | { type: 'error'; msg: string }
  // data is a fresh buffer (quantize/downsample) — transferable, and a TexImageSource on the other side
  | { type: 'mask'; id: number; w: number; h: number; data: Uint8Array<ArrayBuffer>; ms: number; stats: MaskStats }
type Model = (frame: VideoFrame) => Promise<{ data: Uint8Array | Float32Array; w: number; h: number }>

const MAXW = 320, MAXH = 180 // the ≤64 KB mask (G4, G5)

let model: Model | null = null
let seg: ImageSegmenter | null = null
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

const selfie: Model = async (frame) => {
  const bmp = await createImageBitmap(frame, { resizeWidth: 256, resizeHeight: 144 }) // landscape input 144×256 (h×w)
  const res = seg!.segmentForVideo(bmp, (stamp = Math.max(performance.now(), stamp + 1)))
  bmp.close()
  const m = res.confidenceMasks?.[0]
  if (!m) throw new Error('no confidence mask in the segmentForVideo result')
  return { data: m.getAsFloat32Array(), w: m.width, h: m.height }
}

async function makeSelfie(base: string, delegate: 'CPU' | 'GPU') {
  const { FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision')
  const fileset = await FilesetResolver.forVisionTasks(`${base}mediapipe`) // the postinstall copy (D7: localhost only)
  return ImageSegmenter.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: `${base}models/selfie_segmenter_landscape.tflite`, delegate },
    runningMode: 'VIDEO',
  })
}

// The tsconfig's lib has no WebWorker types (it types `self` as Window); this is the worker's own surface:
// postMessage takes (message, Transferable[]).
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null
  postMessage(message: FromWorker, transfer?: Transferable[]): void
  import?: (url: string) => Promise<unknown>
}

// MediaPipe's loader loads the self-hosted wasm glue with importScripts; a module worker's importScripts
// throws, and its import() fallback goes through Vite dev, which refuses to transform /public files (G1).
// The loader honours a `self.import` override instead: fetch the glue and run it in global scope, where its
// UMD top-level `var ModuleFactory` lands on self (the code is same-origin, self-hosted by postinstall — D7).
if (!ctx.import)
  ctx.import = async (url) => {
    if (/vision_wasm_internal\.js(\?.*)?$/.test(url)) {
      ;(0, eval)(await (await fetch(url)).text())
      return {}
    }
    return import(url)
  }

ctx.onmessage = async (e: MessageEvent<ToWorker>) => {
  const m = e.data
  try {
    if (m.type === 'init') {
      n = 0
      stamp = 0
      seg?.close()
      seg = null
      if (m.model === 'synthetic') model = synthetic
      else if (m.model === 'selfie') {
        seg = await makeSelfie(m.base, m.delegate)
        model = selfie
      } else throw new Error(`${m.model} is not an S0.2 arm (S0.4)`)
      ctx.postMessage({ type: 'ready', info: m.model === 'selfie' ? 'selfie ImageSegmenter VIDEO/CPU' : 'synthetic ellipse' })
    } else if (m.type === 'frame') {
      if (!model) {
        m.frame.close()
        ctx.postMessage({ type: 'error', msg: 'frame before init' })
        return
      }
      const t0 = performance.now()
      const r = await model(m.frame).finally(() => m.frame.close())
      // S0.2's arms both return f32; a u8-returning arm (S0.4) would hand over its fresh buffer here
      let data: Uint8Array<ArrayBuffer> = r.data instanceof Float32Array ? quantize(r.data) : (r.data as Uint8Array<ArrayBuffer>)
      const scale = Math.min(MAXW / r.w, MAXH / r.h, 1)
      if (scale < 1) data = downsample(data, r.w, r.h, Math.round(r.w * scale), Math.round(r.h * scale))
      const w = scale < 1 ? Math.round(r.w * scale) : r.w
      const h = scale < 1 ? Math.round(r.h * scale) : r.h
      ctx.postMessage(
        { type: 'mask', id: m.id, w, h, data, ms: performance.now() - t0, stats: stats(data, w, h) },
        [data.buffer],
      )
    } else if (m.type === 'close') {
      seg?.close()
      seg = null
      model = null
    }
  } catch (err) {
    ctx.postMessage({ type: 'error', msg: String(err instanceof Error ? err.stack ?? err.message : err) })
  }
}
