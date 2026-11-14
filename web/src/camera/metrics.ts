// Probe metrics (plan_camera S0.3, the frozen CP0 JSON): pure — testable in node. Timestamps are
// performance.now() ms, ascending.
/** The codebase's quantile (bench.ts/s0.2's `q`): sorted, floor(n·p). null on empty. */
export function quantile(xs: number[], p: number): number | null {
  if (!xs.length) return null
  return [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))]
}
export const p50 = (xs: number[]) => quantile(xs, 0.5)
export const p95 = (xs: number[]) => quantile(xs, 0.95)

/** The minimum fps over all 1 s windows, from mask-arrival stamps: for each start stamp, the fps of the
 *  arrivals inside [t, t+1000) = intervals × 1000 / span (a steady 30 fps source reads 30, not 29). */
export function minWindowFps(ts: number[], windowMs = 1000): number | null {
  let best: number | null = null
  let j = 0
  for (let i = 0; i < ts.length; i++) {
    if (j < i) j = i
    while (j + 1 < ts.length && ts[j + 1] < ts[i] + windowMs) j++
    const span = ts[j] - ts[i]
    if (j > i && span > 0) {
      const fps = ((j - i) * 1000) / span
      best = best === null ? fps : Math.min(best, fps)
    }
  }
  return best
}

/** IEEE 754 half bits → u8 (value × 255, clamped to [0, 1]): readMask's RG16F (RG, HALF_FLOAT) readback. */
export function halfToU8(h: number): number {
  if (h & 0x8000) return 0 // negative, −0 included
  const e = h >> 10, f = h & 0x3ff
  const v = e ? (1 + f / 1024) * 2 ** (e - 15) : f * 2 ** -24 // e = 31 (inf/NaN) clamps to 255 below
  return Math.min(255, Math.round(v * 255))
}

/** Binary (v > 127) intersection-over-union of two same-size masks. Two empty masks agree → 1. */
export function iou(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length) throw new Error(`iou: ${a.length} ≠ ${b.length}`)
  let inter = 0, uni = 0
  for (let i = 0; i < a.length; i++) {
    const p = a[i] > 127, q = b[i] > 127
    if (p && q) inter++
    if (p || q) uni++
  }
  return uni ? inter / uni : 1
}

/** Centroid distance in mask texels of the >127 pixels; 0 when either mask is empty (K7). */
export function centroidDelta(a: Uint8Array, b: Uint8Array, w: number, h: number): number {
  const c = (m: Uint8Array): [number, number] | null => {
    let sx = 0, sy = 0, n = 0
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (m[y * w + x] > 127) {
          sx += x + 0.5
          sy += y + 0.5
          n++
        }
    return n ? [sx / n, sy / n] : null
  }
  const A = c(a), B = c(b)
  if (!A || !B) return 0
  return Math.hypot(A[0] - B[0], A[1] - B[1])
}

/** The __raf / governor late rule (quality.ts's lateFactor 1.5): count of Δ > 1.5× the median Δ.
 *  The harness runs it over its own __raf deltas; the in-page arm count is the governor's drops. */
export function lateCount(deltas: number[]): number {
  const med = quantile(deltas, 0.5)
  return med === null ? 0 : deltas.filter((d) => d > 1.5 * med).length
}
