// RVM (Robust Video Matting, PeterL1n, GPL-3.0) `rvm_mobilenetv3`, the official fp16 ONNX, via
// ORT-Web's WebGPU EP (plan_camera S0.5, design G7). The four recurrent states (r1..r4) stay on the
// GPU between frames: a frame's `r1o..r4o` outputs (preferredOutputLocation 'gpu-buffer') are fed
// back as the next frame's `r1i..r4i` inputs — ORT-Web's WebGPU EP registers those buffers in its
// internal IO binding (no per-frame CPU round trip); only the matte is read back ('cpu').
// The states live at FOUR different internal grids (multi-scale RNN) the ONNX graph computes from
// `src` + `downsample_ratio` — so frame 1 feeds each state as a 1×1 zero (ONNX `Expand` broadcasts
// 1×1 to whatever grid, a correct zero initial state); from frame 2 the fed-back `rXo` already has
// the right shape. `downsample_ratio=1` (the reference's config): the matte `pha` comes out at full
// input resolution 320×180 (the ONNX shares the input's H/W symbols with it), and ratio 0.5 measured
// the same 22 ms/frame on the M4 — the graph does the heavy work at full res either way, so ratio 1
// is strictly higher precision at no cost. Model I/O from the ONNX graph itself
// (checked with scratchpad/cam/rvm_io.py): src f16 [1,3,H,W] (RGB, [-1,1]); outputs fgr f16 [1,3,·,·],
// pha f16 [1,1,·,·], r1o..r4o f16. `ldenoue/rvm-webgpu` was the wiring reference only (no licence
// file — nothing copied from it).
import type { Tensor as OrT } from 'onnxruntime-web/webgpu'

const IW = 320, IH = 180 // the input (16:9)
const RATIO = 1 // downsample_ratio (the reference's config; matte at full input res — see the header)
const CH = [16, 20, 40, 64] as const // the four states' channels (the ONNX graph)

// native half (Chrome: yes; the TS DOM lib predates it — the duck type below)
type Half = { readonly length: number; [i: number]: number }
const F16 = (globalThis as { Float16Array?: new (src: Float32Array) => Half }).Float16Array
// f32 → f16 bits (round-to-nearest-even) when no native Float16Array; the values here stay in [-1,1].
const hbf = new Float32Array(1), hub = new Uint32Array(hbf.buffer)
function halfBits(x: number): number {
  hbf[0] = x
  const b = hub[0]
  const s = (b >>> 16) & 0x8000
  const e = (b >>> 23) & 0xff
  const m = b & 0x7fffff
  if (e === 0xff) return s | 0x7c00 | (m ? 0x200 : 0)
  const exp = e - 112 // (e - 127) + 15
  if (exp >= 0x1f) return s | 0x7c00
  if (exp <= 0) {
    if (exp < -10) return s
    const mm = m | 0x800000
    const shift = 14 - exp
    let v = mm >>> shift
    const rem = mm & ((1 << shift) - 1)
    if (rem > 1 << (shift - 1) || (rem === 1 << (shift - 1) && (v & 1))) v++
    return s | v
  }
  let v = s | (exp << 10) | (m >>> 13)
  const rem = m & 0x1fff
  if (rem > 0x1000 || (rem === 0x1000 && (v & 1))) v++
  return v
}
// f16 bits → f32 (exact; the matte stays in [0,1]).
function halfFloat(h: number): number {
  const s = h & 0x8000 ? -1 : 1
  const e = (h >>> 10) & 0x1f
  const m = h & 0x3ff
  if (e === 0) return s * m * 5.960464477539063e-8 // 2^-24
  if (e === 0x1f) return m ? NaN : s * Infinity
  return s * (1 + m / 1024) * 2 ** (e - 15)
}

export interface Rvm {
  run: (frame: VideoFrame) => Promise<{ data: Float32Array; w: number; h: number }>
  close: () => Promise<void>
}

/** mean of a half-encoded tensor (fgr/pha matting check: a person-free frame's matte ≈ 0). */
function halfMean(d: Half | Uint16Array, F16?: new (src: Float32Array) => Half): number {
  let s = 0
  if (F16 && d instanceof F16) for (let i = 0; i < d.length; i++) s += d[i]
  else for (let i = 0; i < d.length; i++) s += halfFloat((d as Uint16Array)[i])
  return s / d.length
}

export async function createRvm(base: string): Promise<Rvm> {
  const ort = await import('onnxruntime-web/webgpu')
  type T = OrT
  // self-hosted by scripts/models.mjs (D7: localhost only). Object form with `wasm` only: it makes ORT
  // use the emscripten glue inlined in its bundle and fetch the binary straight (a directory string sends
  // it to a dynamic import() of the .mjs glue, which Vite dev poisons with `?import` on /public files —
  // the S0.2 G1 disease, avoided at the root here).
  ort.env.wasm.wasmPaths = { wasm: `${base}ort/ort-wasm-simd-threaded.asyncify.wasm` }
  ort.env.wasm.numThreads = 1
  const session = await ort.InferenceSession.create(`${base}models/rvm_mobilenetv3_fp16.onnx`, {
    executionProviders: ['webgpu'],
    // every output named (an unnamed one defaults to 'cpu'): the matte read back, the states stay on the GPU
    preferredOutputLocation: {
      pha: 'cpu' as const,
      r1o: 'gpu-buffer' as const,
      r2o: 'gpu-buffer' as const,
      r3o: 'gpu-buffer' as const,
      r4o: 'gpu-buffer' as const,
    },
  })
  const ratioT: T = new ort.Tensor('float32', new Float32Array([RATIO]), [1])
  const canvas = new OffscreenCanvas(IW, IH)
  const c2d = canvas.getContext('2d')!
  const f32src = new Float32Array(3 * IW * IH) // the f16 tensor is built from it (native) or the bits below
  const halfsrc = new Uint16Array(3 * IW * IH)
  // frame 1: a 1×1 zero per state — `Expand` broadcasts it to the graph's internal grid (correct init)
  const oneState = (i: number): T => new ort.Tensor('float16', new Uint16Array(CH[i]), [1, CH[i], 1, 1])
  let prev: T[] | null = null // the previous run's r1o..r4o, still on the GPU (IO binding)
  let older: T[] | null = null
  let logged = false

  const run = async (frame: VideoFrame) => {
    const bmp = await createImageBitmap(frame, { resizeWidth: IW, resizeHeight: IH })
    c2d.drawImage(bmp, 0, 0)
    bmp.close()
    const rgba = c2d.getImageData(0, 0, IW, IH).data
    const n = IW * IH
    if (F16) {
      for (let i = 0; i < n; i++) {
        f32src[3 * i] = rgba[4 * i] / 127.5 - 1
        f32src[3 * i + 1] = rgba[4 * i + 1] / 127.5 - 1
        f32src[3 * i + 2] = rgba[4 * i + 2] / 127.5 - 1
      }
    } else {
      for (let i = 0; i < n; i++) {
        halfsrc[3 * i] = halfBits(rgba[4 * i] / 127.5 - 1)
        halfsrc[3 * i + 1] = halfBits(rgba[4 * i + 1] / 127.5 - 1)
        halfsrc[3 * i + 2] = halfBits(rgba[4 * i + 2] / 127.5 - 1)
      }
    }
    // the d.ts types float16 data as Uint16Array; with native Float16Array ORT accepts the half view directly
    const srcT: T = F16
      ? new ort.Tensor('float16', new F16(f32src) as unknown as Uint16Array, [1, 3, IH, IW])
      : new ort.Tensor('float16', halfsrc.slice(0), [1, 3, IH, IW]) // slice: the tensor keeps the buffer
    const feeds: Record<string, T> = { src: srcT, downsample_ratio: ratioT }
    if (prev) {
      feeds.r1i = prev[0]
      feeds.r2i = prev[1]
      feeds.r3i = prev[2]
      feeds.r4i = prev[3]
    } else {
      feeds.r1i = oneState(0)
      feeds.r2i = oneState(1)
      feeds.r3i = oneState(2)
      feeds.r4i = oneState(3)
    }
    const out = (await session.run(feeds, ['pha', 'r1o', 'r2o', 'r3o', 'r4o'])) as Record<string, T>
    const d = out.pha.data // 'cpu' location: sync (native Float16Array, or Uint16Array half bits)
    const ph = out.pha.dims[2], pw = out.pha.dims[3] // the matte's grid (at downsample_ratio of the input)
    if (ph * pw !== d.length) throw new Error(`rvm: matte ${ph}×${pw} does not fit the readback (${d.length})`)
    const matte = new Float32Array(d.length)
    if (F16 && d instanceof F16) for (let i = 0; i < matte.length; i++) matte[i] = d[i]
    else for (let i = 0; i < matte.length; i++) matte[i] = halfFloat((d as Uint16Array)[i])
    if (!logged) {
      logged = true
      console.info(`rvm: first matte (pha) ${pw}×${ph} mean=${halfMean(d as unknown as Half | Uint16Array, F16).toFixed(4)} — ≈0 confirms pha is the matting (a person-free frame)`)
    }
    out.pha.dispose()
    srcT.dispose()
    if (!prev) older = [feeds.r1i, feeds.r2i, feeds.r3i, feeds.r4i] // the 1×1 inits are one-shot
    older?.forEach((t) => t.dispose()) // the fed-back states were consumed by this run
    older = prev
    prev = [out.r1o, out.r2o, out.r3o, out.r4o] // still on the GPU
    return { data: matte, w: pw, h: ph }
  }

  const close = async () => {
    prev?.forEach((t) => t.dispose())
    older?.forEach((t) => t.dispose())
    ratioT.dispose()
    prev = null
    older = null
    await session.release()
  }

  return { run, close }
}
