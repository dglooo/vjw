// Quality modes and the frame-time governor (design S4), pure: no DOM, so Vitest runs it.
export type QualityMode = '60-adaptive' | '60-full' | '30'

export interface Governor {
  frame(now: number, jsMs: number, gpuMs?: number): void // now = the rAF timestamp, ms; jsMs = this frame's JS time, ms; gpuMs = its GL timer ms (0 if none)
  reset(): void // on a mode change
  readonly scale: number
  readonly drops: number // late frames since the last reset: the spec §7.5 counter
  readonly refreshMs: number // the median of the last 120 deltas, never a hard-coded 16.67
  readonly jsMs: number // the median of the last 120 JS times (the step-down test's), 0 before 120 samples
  readonly webgpuMs: number // the last frame's WebGPU term (noteWebgpuMs), ms; 0 when no native reported one
  readonly gpuCostMs: number // the last frame's GPU cost (GPU3D N4) = gpuMs + webgpuMs. A read-out: no step rule reads it
}

let webgpuTerm = 0 // the WebGPU ms reported since the last governor frame
/** GPU3D N4: a native's WebGPU ms this frame (its timestamp-query p95). WebGPU work runs outside the GL timer, so gpuMs
 *  misses it (scratchpad/gpu3d/s1w.md). Reports in one frame add up; the next governor frame takes them, and a frame with
 *  none reads 0. A plain export, so a native reports with no change to `Native` and no import of app.ts (a cycle). */
export function noteWebgpuMs(ms: number) {
  webgpuTerm += ms
}
export interface GovernorOpts {
  min: number // scale range (design S4; Q9 floor)
  max: number
  down: number // step factors
  up: number
  lateFactor: number // late = delta > lateFactor × refreshMs
  windowSeconds: number // step down on > lateN late frames within this window …
  lateN: number
  jsBudgetMs: number // … while the median JS time is under this (GPU-bound)
  probeSeconds: number // step up after this long with no late frame; doubles after a failed probe, up to 160 s
}

const DEFAULTS: GovernorOpts = {
  min: 0.6, max: 1, down: 0.85, up: 1.1, lateFactor: 1.5, windowSeconds: 2, lateN: 3, jsBudgetMs: 10, probeSeconds: 10,
}
const N = 120 // deltas (and JS times) kept for the medians
const PROBE_CAP_MS = 160_000

export function createGovernor(opts?: Partial<GovernorOpts>): Governor {
  const o = { ...DEFAULTS, ...opts }
  const windowMs = o.windowSeconds * 1000
  const deltas = new Float64Array(N) // rings, slot i is next
  const js = new Float64Array(N)
  const sorted = new Float64Array(N)
  let n = 0 // filled slots
  let i = 0
  let last: number | null = null
  let late: number[] = [] // late frame times within the window
  let calmSince = 0 // the last late frame or step
  let probeMs = 0
  let probeUntil = 0 // a late frame before this fails the step-up probe

  const median = (ring: Float64Array) => {
    const s = sorted.subarray(0, n)
    s.set(ring.subarray(0, n))
    return s.sort()[n >> 1]
  }

  const g = {
    scale: o.max,
    drops: 0,
    refreshMs: 0,
    webgpuMs: 0,
    gpuCostMs: 0,
    get jsMs() {
      return n < N ? 0 : median(js)
    },
    frame(now: number, jsMs: number, gpuMs = 0) {
      g.webgpuMs = webgpuTerm // taken on every frame, the first too: a report never leaks into the next frame
      g.gpuCostMs = gpuMs + webgpuTerm
      webgpuTerm = 0
      if (last === null) {
        last = calmSince = now
        return
      }
      const d = now - last
      last = now
      deltas[i] = d
      js[i] = jsMs
      i = (i + 1) % N
      n = Math.min(n + 1, N)
      g.refreshMs = median(deltas)

      if (d <= o.lateFactor * g.refreshMs) {
        if (g.scale < o.max && now - calmSince >= probeMs) {
          g.scale = Math.min(o.max, g.scale * o.up)
          calmSince = now
          probeUntil = now + windowMs
        }
        return
      }
      g.drops++
      calmSince = now
      if (now < probeUntil) {
        probeMs = Math.min(PROBE_CAP_MS, probeMs * 2)
        probeUntil = 0
      }
      late = late.filter((t) => now - t < windowMs)
      late.push(now)
      if (late.length > o.lateN && median(js) < o.jsBudgetMs) {
        g.scale = Math.max(o.min, g.scale * o.down)
        late = []
      }
    },
    reset() {
      g.scale = o.max
      g.drops = 0
      g.refreshMs = 0
      n = i = 0
      last = null
      late = []
      probeMs = o.probeSeconds * 1000
      probeUntil = 0
    },
  }
  g.reset()
  return g
}

const MODES: readonly QualityMode[] = ['60-adaptive', '60-full', '30']
export const nextMode = (m: QualityMode) => MODES[(MODES.indexOf(m) + 1) % MODES.length]

const LABEL: Record<QualityMode, string> = { '60-adaptive': '60A', '60-full': '60F', '30': '30' }
/** The overlay badge, e.g. `60A · 0.80× · 3 drops`. */
export const badge = (s: { quality: QualityMode; scale: number; drops: number }) =>
  `${LABEL[s.quality]} · ${s.scale.toFixed(2)}× · ${s.drops} drop${s.drops === 1 ? '' : 's'}`

/** The output (stage) size per mode: 60A is ½ base, 60F and 30 the base. Even, because the H.264 recorder crops odd
 *  sizes (S1.2); 30 renders every other rAF. */
export function outputFor(mode: QualityMode, baseW: number, baseH: number) {
  const k = mode === '60-adaptive' ? 4 : 2
  return { w: 2 * Math.round(baseW / k), h: 2 * Math.round(baseH / k), everyOtherFrame: mode === '30' }
}
