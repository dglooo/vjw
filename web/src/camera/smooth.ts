// Mask math (plan_camera S0.2, the frozen contract; the gate/presence land in S1.1). Pure — testable in node.
// Data is top-down u8 (row 0 = the frame's top), values 0..255 = confidence.
export interface MaskStats {
  area: number // mean confidence, 0..1 (D3's presence follows it)
  cx: number // centroid of the >50% pixels, 0..1 of the mask (0 if none)
  cy: number
  box: [x0: number, y0: number, x1: number, y1: number] // 0..1 of the mask, [0,0,0,0] when empty
}

/** EMA weight of a kept mask (design D2, OBS's default). S0.2 uses it fixed; S1.1's gate() may lower it. */
export const KEEP = 0.85

export function stats(data: Uint8Array, w: number, h: number): MaskStats {
  let sum = 0
  let x0 = w, y0 = h, x1 = 0, y1 = 0, cx = 0, cy = 0, n = 0
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = data[y * w + x]
      sum += v
      if (v > 127) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
        cx += x + 0.5
        cy += y + 0.5
        n++
      }
    }
  return {
    area: sum / (255 * w * h),
    cx: n ? cx / n / w : 0,
    cy: n ? cy / n / h : 0,
    box: n ? [x0 / w, y0 / h, (x1 + 1) / w, (y1 + 1) / h] : [0, 0, 0, 0],
  }
}

/** Area-preserving box filter (overlap-weighted, so a half-filled block averages exactly). No upscale:
 *  tw ≥ w and th ≥ h returns `data` as is (the ≤320×180 target is already met). */
export function downsample(data: Uint8Array<ArrayBuffer>, w: number, h: number, tw: number, th: number): Uint8Array<ArrayBuffer> {
  if (tw >= w && th >= h) return data
  const out = new Uint8Array(tw * th)
  const sx = w / tw, sy = h / th
  for (let ty = 0; ty < th; ty++) {
    const fy0 = ty * sy, fy1 = fy0 + sy
    const y0 = Math.floor(fy0), y1 = Math.min(h, Math.ceil(fy1))
    for (let tx = 0; tx < tw; tx++) {
      const fx0 = tx * sx, fx1 = fx0 + sx
      const x0 = Math.floor(fx0), x1 = Math.min(w, Math.ceil(fx1))
      let sum = 0, weight = 0
      for (let y = y0; y < y1; y++) {
        const wy = Math.min(fy1, y + 1) - Math.max(fy0, y)
        for (let x = x0; x < x1; x++) {
          const wx = Math.min(fx1, x + 1) - Math.max(fx0, x)
          sum += data[y * w + x] * wx * wy
          weight += wx * wy
        }
      }
      out[ty * tw + tx] = weight ? Math.round(sum / weight) : 0
    }
  }
  return out
}

/** 0..1 confidence → u8: 0→0, 1→255, .5→128, out-of-range clamps. A fresh ArrayBuffer (transferable). */
export function quantize(f32: Float32Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(f32.length)
  for (let i = 0; i < f32.length; i++) out[i] = Math.max(0, Math.min(255, Math.round(f32[i] * 255)))
  return out
}
