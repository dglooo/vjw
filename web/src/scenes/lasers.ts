// Rave Lasers (RL S3 spike; design_rave_lasers.md Variant A + rev 2 SR-1…SR-8 + the lead ruling N-1…N-3;
// creative_rave_lasers.md §2–§3): a festival laser rig seen from front of house. 23 fixed emitters, hair-thin
// straight beams in haze, pinned to their points. A pure CPU rig (figures, the row chase, one light state) writes
// ≤ MAX_INST beam instances per frame; the GL is the Isobars pipeline: instanced quads, additive, into a full-res HDR
// target whose mip chain is the haze (near tent + far blur, Isobars' BLUR), a 1/8-res smoke field, one composite
// with the rev-2 max-channel tone map. Light: the frame's total linear light is ONE rate-limited state (`sum`, SR-3),
// so a chase step, a pop or a figure change never blinks the frame; brightness rises only through the drop latch,
// an allowed `hit` rise (both counted in `onsets`) and the gated ⚡ pair. Own code, credit VeeJay Wizard;
// webgl-noise snoise (Ian McEwan, Ashima Arts, MIT) through points.ts NOISE, whose header keeps the licence.
import { bindFramebufferInfo, setUniforms } from 'twgl.js'
import { fullscreenProgram, program, renderTarget } from '../gl/engine'
import type { NativeDef } from '../gl/scene'
import type { Value } from '../fx/types'
import { BLUR } from './isobars'
import { HASH, NOISE } from './points'

const DEG = Math.PI / 180

// ---- the rig (pure: lasers.test.ts runs it in Node) ----
export type Group = 'T' | 'S' | 'F' | 'B'
export interface Emitter { group: Group; x: number; y: number; max: number; floor: number }
const em = (group: Group, x: number, y: number, max: number, floor: number): Emitter => ({ group, x, y, max, floor })
/** creative §2.1, frame fractions (y down): T 0–7, S left 8–10 and right 11–13 (top → bottom), F 14–20, B 21–22. */
export const EMITTERS: readonly Emitter[] = [
  ...Array.from({ length: 8 }, (_, k) => em('T', 0.08 + 0.12 * k, 0.1, 7, 5)),
  ...[0.03, 0.97].flatMap((x) => [0.27, 0.455, 0.64].map((y) => em('S', x, y, 5, 3))),
  ...Array.from({ length: 7 }, (_, k) => em('F', 0.14 + 0.12 * k, 0.94, 7, 5)),
  em('B', 0.46, 0.5, 32, 24), em('B', 0.54, 0.5, 32, 24),
]
const NE = EMITTERS.length
const LAYOUTS: readonly (readonly Group[])[] = [['T', 'S', 'B'], ['F', 'S', 'B'], ['T', 'S', 'F', 'B']] // truss, floor, full
/** Beams per emitter at most in a layout: `full` takes the floor counts (L2: 93 beams, 24 rays). */
const maxOf = (e: Emitter, layout: number) => (layout === 2 ? e.floor : e.max)
/** Σ beams of a layout at full open (B rays excluded): 86 / 79 / 93. */
export const layoutMax = (layout: number) => EMITTERS.reduce((s, e) => s + (e.group !== 'B' && LAYOUTS[layout].includes(e.group) ? maxOf(e, layout) : 0), 0)
export const STRIDE = 12 // x0 y0 x1 y1 (px, y down) | w0 w1 (core half-width, px) | gain0 gain1 | hot | tint | kind | fade
export const MAX_INST = 256
export const FIG = { sheet: 0, fan: 1, grid: 2, cage: 3, crowd: 4 } as const // sheet = Sheet + Lone beams; crowd = Beam-to-crowd

// Knobs ⚠️ (spike values, the S3 look; design SR-3 / SR-4 / SR-6).
const L0_K = 0.45 // the frame's total light at power 1, per frame px² (rig units): a loud Fan skirt peak ≈ m .4, its core ≈ 1.1
const SUM_RATE = 0.4 // /s, log: the light state's slew (≤ 7.1 % per 8th at 174 BPM)
const EPS = 1e-3 // the light state's floor (N-2: the log step can leave 0)
const W_MAX = 0.35 // a beam's relative weight cap (share ÷ lit beams): the capped regime (cage, Lone beams, thin Grid)
const SHEET_W = 0.012 // a Sheet's weight: the plane spreads its emitter's power (the dimmest figure per px)
const RAY_W = 0.25 // a Grating-burst ray's weight
const DISC_W = 0.6 // an origin disc's weight
const GLINT_W = 1.2 // a glint star's weight
const CORE_W = 1 // px at 1117 rows: the core half-width (2 px wide)
export const SK = 9 // the skirt's half-support ÷ the core half-width (lever after L1: FWHM 9.7 w ≈ the creative's 5 × the core; was 11)
const EXIT = 2 // w1 ÷ w0 = 1 + EXIT·toward (L1: exit growth 3×)
const FWD = 1 // gain1 ÷ gain0 = 1 + FWD·toward (forward scatter)
const OPEN_LOUD = 0.4 // the sub above this is loud (creative §1: quiet = sub at rest and no kick for ≥ 2 bars)
const SHOOT = 0.048, AFTER = 0.05, HIT_IGNORE = 1, DRUM_ARM = 0.7, BURST_LIFE = 0.11, BURST_GAP = 0.17, HOT_HOLD = 0.4
export const SKIRT_A = 0.35, CORE_A = 1, SHEET_A = 1 // the cross-section peaks (shared with the FS)
const SQ2PI = Math.sqrt(2 * Math.PI)
const P_BEAM = SKIRT_A * 2 * SK * (8 / 15) + CORE_A * SQ2PI * 0.85 // ∫ across ÷ w: skirt (1 − u²)² + core Gaussian σ .85 w
const P_RAY = CORE_A * SQ2PI * 0.85 // core only
const P_SHEET = 1.85 * SHEET_A // the flat-top wedge (smoothstep edge from .85 w)

/** One instance's linear light in rig units (closed form, gain × area): Σ over the buffer × RigOut.light = the light
 *  state `sum` on every frame (T-L1e). */
export function instLight(b: Float32Array, o: number): number {
  const kind = b[o + 10]
  if (kind === 3) return b[o + 6] * (Math.PI / 3) * b[o + 4] * b[o + 4] + b[o + 7] * P_RAY * b[o + 5] // disc + glint (two tapered 1-px lines)
  const len = Math.hypot(b[o + 2] - b[o], b[o + 3] - b[o + 1])
  const w0 = b[o + 4], w1 = b[o + 5], g0 = b[o + 6], g1 = b[o + 7]
  const gw = (g0 * w0 + g1 * w1) / 3 + (g0 * w1 + g1 * w0) / 6 // ∫₀¹ g(t)·w(t), both linear
  return len * gw * (1 - b[o + 11] / 2) * (kind === 0 ? P_BEAM : kind === 1 ? P_SHEET : P_RAY)
}

export const TONE = { K0: 1, K1: 2, W: 0.9 } // SR-7 ⚠️ (the look is the user's)
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
/** The P5 tone map's TS twin (SR-7, T-L5): the hue holds, the max channel above K0 whitens toward K1. */
export function tone(r: number, g: number, b: number): [number, number, number] {
  const m = Math.max(r, g, b, 1e-4), s = TONE.W * smooth(TONE.K0, TONE.K1, m), k = 1 - Math.exp(-m)
  return [r, g, b].map((x) => (x / m + (1 - x / m) * s) * k) as [number, number, number]
}

export interface RigIn { v: Readonly<Record<string, Value>>; bar: number; bpm: number; conf: number; time: number; width: number; height: number }
export interface RigOut { n: number; light: number; core: number; haze: number; speckle: number }
export interface LaserState {
  mode: 'quiet' | 'loud' | 'drop'; figure: number; step: number; open: number; converge: number; spread: number; power: number
  lit: number[]; onsets: number; locked: boolean; fill: number; sum: number; target: number; cuts: number // cuts: figure (re)builds so far
}
export interface Rig { step(x: RigIn, out: Float32Array): RigOut; state(): LaserState }

/** A row (SR-2) = the chase unit: one emitter's fan (≥ 2 beams), or a line of 1-beam emitters (T, F, each S tower).
 *  `k` of its `N` slots are lit, spread evenly and rotated by `o`; kMin ≤ k ≤ N always (I-1). */
interface Row { em: number[]; N: number; k: number; o: number; kMin: number }
const litAt = (r: Row, j: number) => { const m = (((j - r.o) % r.N) + r.N) % r.N; return Math.floor(((m + 1) * r.k) / r.N) > Math.floor((m * r.k) / r.N) }
const mulberry = (a: number) => () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))
const tri = (x: number) => 1 - 4 * Math.abs(x - Math.floor(x + 0.5)) // −1…1, period 1

/** The px distance from (x, y) along (dx, dy) to the frame rectangle inflated by `pad` (the end is clipped off-screen). */
function exitLen(x: number, y: number, dx: number, dy: number, W: number, H: number, pad: number) {
  const tx = dx > 1e-9 ? (W + pad - x) / dx : dx < -1e-9 ? (-pad - x) / dx : Infinity
  const ty = dy > 1e-9 ? (H + pad - y) / dy : dy < -1e-9 ? (-pad - y) / dy : Infinity
  return Math.max(0, Math.min(tx, ty))
}

export function createRig(seed = 1): Rig {
  const rnd = mulberry(seed)
  let first = true, lastT = 0, locked = false, mode: LaserState['mode'] = 'quiet', fig: number = FIG.sheet, layout = 0
  let sum = EPS, target = EPS, power = 0.5, onsets = 0, steps = 0, fill = 0, spreadDeg = 0, cuts = 0
  let drumT = -Infinity, kickT = -Infinity, prevClimax = 0, prevHit = 0, prevPop = 0, prevSnap = 0, hitIgnore = -Infinity, hotUntil = -Infinity
  let dropPhase = 0, refBar = 0, refT = 0, c16Bar: number | null = null, lastIdx = 0, lastRes = 8, lastCut = 0, cutRef = 0
  let dir = 1, sPose = 0, sweepDir = 1, loudNext = 0, burstT = -Infinity, burstRot = 0, palette = ''
  let rows: Row[] = []
  const nOf = new Int8Array(NE) // beams of each emitter in the figure (0 = dark)
  const rowOf = new Int16Array(NE).fill(-1), slotOf = new Int16Array(NE) // its row; a line row's slot
  const tint = new Uint8Array(NE), lit = new Uint8Array(NE)
  const wasOn = new Uint8Array(NE * 8), enterAt = new Float64Array(NE * 8), shot = new Uint8Array(NE * 8), offAt = new Float64Array(NE * 8).fill(-Infinity)
  let shootNow = false // this frame's rising slots enter with `shoot` (a pop step, the drop latch)
  const glintAt = new Float64Array(NE).fill(-Infinity)
  let sheetE = -1, lone: number[] = []
  const poseS = Array.from({ length: 4 }, () => Array.from({ length: 6 }, () => (rnd() * 2 - 1) * 20)) // S poses within ±20° (snare steps them)
  const inLayout = (e: number) => LAYOUTS[layout].includes(EMITTERS[e].group)

  /** Emitter colours (creative §2.5): the normalised amounts = the emitter shares, seeded per figure. */
  function assignTints(v: RigIn['v']) {
    let a = [+(v.green ?? 0.7), +(v.white ?? 0.3), +(v.red ?? 0)].map((x) => Math.max(0, x))
    const s = a[0] + a[1] + a[2]
    a = s > 0 ? a.map((x) => x / s) : [1, 0, 0]
    const ids = [...Array(NE).keys()].filter((e) => EMITTERS[e].group !== 'B')
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]] }
    const nG = Math.round(a[0] * ids.length), nW = Math.round(a[1] * ids.length)
    ids.forEach((e, i) => (tint[e] = i < nG ? 0 : i < nG + nW ? 1 : 2))
    const dom = a.indexOf(Math.max(...a))
    tint[21] = tint[22] = a[1] > 0 ? 1 : dom // the Grating burst: white, else the dominant colour
  }

  /** (Re)builds the rows of figure `f` (a cut, a mode change, the drop phases). `open1` = the open the counts read. */
  function build(f: number, open1: number, flick: number, shootAll = false) {
    fig = f
    cuts++
    rows = []
    nOf.fill(0)
    rowOf.fill(-1)
    const o3 = clamp((open1 - 0.3) / 0.7, 0, 1)
    if (f === FIG.sheet) {
      const g = layout === 1 ? 'F' : 'T'
      const ids = [...Array(NE).keys()].filter((e) => EMITTERS[e].group === g)
      sheetE = ids[Math.floor(ids.length / 2) - (rnd() < 0.5 ? 1 : 0)]
      lone = [9, 12, rnd() < 0.5 ? ids[0] : ids[ids.length - 1]] // 3 Lone beams from 2 groups: the S mids + an outer T (F)
      for (const e of [sheetE, ...lone]) { nOf[e] = 1; rowOf[e] = rows.length; slotOf[e] = 0; rows.push({ em: [e], N: 1, k: 1, o: 0, kMin: 1 }) }
    } else {
      for (const G of ['T', 'S', 'F'] as const) {
        const ids = [...Array(NE).keys()].filter((e) => EMITTERS[e].group === G && inLayout(e))
        if (!ids.length) continue
        const mx = maxOf(EMITTERS[ids[0]], layout)
        const n = f === FIG.cage ? 1 : f === FIG.crowd ? mx
          : f === FIG.grid ? Math.min(mx, G === 'S' ? 3 + Math.floor(2 * o3) : 1 + Math.floor(2 * o3 + 0.01))
            : Math.min(mx, Math.round(G === 'S' ? 2 + 3 * o3 : 3 + 4 * o3)) // fan
        const share = (N: number) => (f === FIG.crowd ? N : f === FIG.cage ? (G === 'S' ? N : Math.ceil(0.75 * N)) : dropPhase === 2 ? Math.ceil(0.75 * N) : Math.ceil(0.4 * N))
        const lines = n === 1 ? (G === 'S' ? [ids.filter((e) => EMITTERS[e].x < 0.5), ids.filter((e) => EMITTERS[e].x > 0.5)] : [ids]) : ids.map((e) => [e])
        for (const line of lines) {
          const N = n === 1 ? line.length : n
          const kMin = share(N)
          line.forEach((e, j) => { nOf[e] = n; rowOf[e] = rows.length; slotOf[e] = j })
          rows.push({ em: line, N, kMin, k: dropPhase === 2 ? kMin : clamp(Math.round(N * (1 - 0.6 * flick)), kMin, N), o: Math.floor(rnd() * N) })
        }
      }
    }
    palette = '' // re-seed the colours with the figure
    wasOn.fill(0) // every lit slot rises at the next emission: snapped in, or shot at the latch
    offAt.fill(-Infinity) // a cut is hard: no afterglow
    if (shootAll) shootNow = true
  }

  /** One chase step (SR-2): every chased row rotates by one; then k moves ≤ 1 toward its flick goal. */
  function chase(flick: number, shoot: boolean) {
    if (mode === 'quiet' || fig === FIG.crowd) return
    steps++
    for (const r of rows) {
      if (r.kMin >= r.N) continue // never chased (cage S rows, all-lit)
      r.o = (r.o + dir + r.N) % r.N
      r.k += Math.sign(clamp(Math.round(r.N * (1 - 0.6 * flick)), r.kMin, dropPhase === 2 ? r.kMin : r.N) - r.k) // the drop's bar 2 holds 75 %
    }
    if (shoot) shootNow = true // the newly lit beams enter with `shoot` (only rising slots read it)
  }

  const nextLoud = () => (loudNext++ % 3 === 2 ? FIG.grid : rnd() < 0.5 ? FIG.fan : FIG.grid)

  let st: LaserState | null = null
  return {
    state() {
      return st ? { ...st, lit: [...st.lit] } : { mode, figure: fig, step: steps, open: 0, converge: 0, spread: 0, power, lit: Array.from(lit), onsets, locked, fill, sum, target, cuts }
    },
    step(x, out) {
      const v = x.v, t = x.time
      const num = (k: string) => { const y = v[k]; return typeof y === 'number' && Number.isFinite(y) ? y : 0 }
      const dt = first ? 0 : clamp(t - lastT, 0, 0.1)
      lastT = t
      const wasLocked = locked
      if (locked ? x.conf < 0.2 || !(x.bpm > 0) : x.conf >= 0.3 && x.bpm > 0) locked = !locked
      const pop = num('pop'), snap = num('snap'), flick = clamp(num('flick'), 0, 1), open = clamp(num('open'), 0, 1)
      const climax = num('climax'), hit = num('hit'), burst = num('burst')
      const lay = clamp(Math.round(num('layout')), 0, 2)
      if (pop > 0.05 || snap > 0.05 || flick > 0.05) drumT = t
      const armed = t - drumT <= DRUM_ARM // C11: steps and cuts only with drums in the last 0.7 s
      if (pop >= 0.5) kickT = t
      const barS = locked ? 240 / x.bpm : 1.4 // s per bar (unlocked: the figure cuts every 2.8 s)
      const barsSince = (b: number, tt: number) => (locked ? x.bar - b : (t - tt) / barS)
      let load = first ? 2 : 0 // 2: sum = target; 1: sum = min(sum, target)
      const latch = climax >= 0.5 && prevClimax < 0.5 // SR-5: a rig whose first frame is at a drop latches at once
      prevClimax = climax
      const conv = mode === 'drop' || latch ? 0 : clamp(num('converge'), 0, 1)
      if (lay !== layout || first) { layout = lay; if (!first) { build(fig, mode === 'drop' ? 1 : Math.max(open, 0.3), flick); load = Math.max(load, 1) } }
      if (latch) {
        mode = 'drop'; dropPhase = 1; refBar = x.bar; refT = t; hitIgnore = t + HIT_IGNORE; onsets++; load = 2; power = 1
        build(FIG.crowd, 1, flick, true)
        glintAt.fill(t)
        burstT = t; burstRot = rnd() * 360
      } else if (mode === 'drop') {
        if (dropPhase === 1 && barsSince(refBar, refT) >= 1 && climax < 0.5) { dropPhase = 2; refBar = x.bar; refT = t; build(FIG.fan, 1, flick); load = Math.max(load, 1) }
        else if (dropPhase === 2 && barsSince(refBar, refT) >= 1) { dropPhase = 0; mode = 'loud'; build(nextLoud(), Math.max(open, 0.3), flick); load = Math.max(load, 1); cutRef = lastCut }
      } else {
        const m = t - kickT <= 2 * barS || open >= OPEN_LOUD ? 'loud' : 'quiet'
        if (m !== mode || first) { mode = m; build(m === 'loud' ? nextLoud() : FIG.sheet, Math.max(open, 0.3), flick); load = Math.max(load, 1); cutRef = lastCut }
        else if (mode === 'loud' && fig !== FIG.cage && conv >= 0.8) { build(FIG.cage, 0.3, flick); load = Math.max(load, 1) }
        else if (mode === 'loud' && fig === FIG.cage && conv < 0.7) { build(nextLoud(), Math.max(open, 0.3), flick); load = Math.max(load, 1); cutRef = lastCut }
      }
      // The clocks (SR-4): an index fires once when it exceeds the last fired one; a lock change, a resolution change or
      // a backward jump of > 1 index re-bases it and fires nothing.
      if (mode === 'loud' && conv >= 0.75) c16Bar ??= locked ? x.bar : t / barS
      else c16Bar = null
      const res = c16Bar !== null && (locked ? x.bar : t / barS) - c16Bar < 4 ? 16 : 8
      const idx = Math.floor(locked ? x.bar * res : (t * 5.8 * res) / 8)
      const cutIdx = Math.floor(locked ? x.bar : t / barS)
      const rebase = first || locked !== wasLocked
      if (rebase || res !== lastRes || idx < lastIdx - 1) lastIdx = idx
      else if (idx > lastIdx) { lastIdx = idx; if (armed) chase(flick, false) }
      lastRes = res
      if (rebase || cutIdx < lastCut - 1) { lastCut = cutIdx; cutRef = cutIdx }
      else if (cutIdx > lastCut) {
        lastCut = cutIdx
        if (armed && mode === 'loud' && fig !== FIG.cage && cutIdx - cutRef >= 2) { cutRef = cutIdx; build(nextLoud(), Math.max(open, 0.3), flick); load = Math.max(load, 1) }
        else if (armed && mode === 'quiet' && cutIdx - cutRef >= 4) { cutRef = cutIdx; sweepDir = -sweepDir } // the quiet cut: the sweeps turn, nothing blanks
      }
      // the hits: geometry (never gated)
      if (pop >= 0.5 && prevPop < 0.5) chase(flick, true)
      if (snap >= 0.5 && prevSnap < 0.5) {
        dir = -dir
        sPose = (sPose + 1) % poseS.length
        if (fig !== FIG.cage && t >= burstT + BURST_LIFE + BURST_GAP) { burstT = t; burstRot = rnd() * 360 }
      }
      prevPop = pop
      prevSnap = snap
      if (burst >= 0.5) hotUntil = t + HOT_HOLD // ⚡ burst: white cores ≥ 400 ms (SR-5)
      const key = `${v.green},${v.white},${v.red}`
      if (key !== palette) { palette = key; assignTints(v) }
      // the power (creative §2.4): quiet .5, loud .7 → .85 with the build, the drop 1; slewed .3 per 600 ms
      const P = mode === 'drop' ? 1 : mode === 'quiet' ? 0.5 : 0.7 + 0.15 * conv
      if (!latch) power += clamp(P - power, -0.5 * dt, 0.5 * dt)
      if (first) power = P

      // ---- the pose (creative §3 rows 4, 5, 6) ----
      const W = Math.max(1, x.width), H = Math.max(1, x.height), hs = H / 1117
      const op = mode === 'drop' ? 1 : mode === 'loud' ? Math.max(open, 0.3) : open
      const sK = conv < 0.5 ? 1 - conv : conv < 0.8 ? 0.5 - ((conv - 0.5) / 0.3) * 0.35 : 0.15
      const perp = smooth(0.5, 0.8, conv)
      const scK = conv < 0.5 ? 1 - 1.4 * conv : 0.3 * (1 - perp)
      const scissor = clamp(num('scissor'), 0, 1)
      const popK = 1 + 0.3 * clamp(pop, 0, 1)
      const spTF = (8 + 52 * op) * popK * sK, spS = (4 + 26 * op) * popK * sK
      spreadDeg = spTF
      const shear = fig === FIG.grid ? 15 * Math.sin((Math.PI * (locked ? x.bar : t / barS)) / 2) * (1 - perp) : 0
      const hotBurst = clamp((hotUntil + 0.3 - t) / 0.3, 0, 1)
      // lit per emitter first: the weights divide the emitter's share among them
      for (let e = 0; e < NE; e++) {
        const r = rows[rowOf[e]]
        lit[e] = !r || !nOf[e] || !inLayout(e) ? 0 : nOf[e] === 1 ? +litAt(r, slotOf[e]) : r.k
      }

      let n = 0, A = 0, A0 = 0
      fill = 0
      const put = (x0: number, y0: number, x1: number, y1: number, w0: number, w1: number, g0: number, g1: number, hot: number, ti: number, kind: number, fade: number, uncap: number) => {
        if (n >= MAX_INST) return
        const o = n++ * STRIDE
        out[o] = x0; out[o + 1] = y0; out[o + 2] = x1; out[o + 3] = y1; out[o + 4] = w0; out[o + 5] = w1
        out[o + 6] = g0; out[o + 7] = g1; out[o + 8] = hot; out[o + 9] = ti; out[o + 10] = kind; out[o + 11] = fade
        const L = instLight(out, o)
        A += L
        A0 += L * uncap
        const len = Math.hypot(x1 - x0, y1 - y0)
        fill += kind === 3 ? 4 * Math.max(1.5 * w0, w1) ** 2 : (len + SK * (w0 + w1)) * SK * (w0 + w1) * (kind === 1 ? 1.2 / SK : kind === 2 ? 4 / SK : 1)
      }
      const towardOf = (e: number) => {
        const G = EMITTERS[e].group
        if (fig === FIG.crowd) return 0.97 + 0.03 * Math.sin(2 * Math.PI * (3 * t + 0.37 * e)) // audience scan: the origins glint in turn
        if (fig === FIG.cage) return G === 'S' ? 0.05 : 0.26 // T and F tilted 15° toward the viewer
        if (fig === FIG.sheet) return e === sheetE ? 0.4 : 0.3
        return G === 'S' ? 0.1 : fig === FIG.grid ? 0.3 : 0.55
      }
      /** The beam angle (rad, y down) of slot j of n at emitter e. */
      const aim = (e: number, j: number, nn: number) => {
        const E = EMITTERS[e], G = E.group, left = E.x < 0.5
        const f = nn > 1 ? j / (nn - 1) - 0.5 : 0
        if (fig === FIG.sheet) {
          if (e === sheetE) return (G === 'T' ? 90 : -90) * DEG + 10 * DEG * Math.sin((2 * Math.PI * (locked ? x.bar : t / barS)) / 8)
          const base = G === 'S' ? (left ? 0 : 180) : G === 'T' ? 90 + (0.5 - E.x) * 50 : -90 - (0.5 - E.x) * 50
          return (base + sweepDir * 18 * tri(t / 4 + 0.3 * e)) * DEG
        }
        if (fig === FIG.cage) return (G === 'T' ? 90 : G === 'F' ? -90 : left ? 0 : 180) * DEG
        if (fig === FIG.grid) {
          if (G === 'S') return ((left ? 0 : 180) - shear + 6 * f) * DEG
          return ((G === 'T' ? 90 : -90) + shear + 8 * f * (1 - perp)) * DEG
        }
        // fan and crowd
        const k = e % 2 ? 1 : -1
        const lean = fig === FIG.crowd ? 0 : k * 25 * scissor * scK
        if (G === 'S') {
          const base = (left ? 0 : 180) + (left ? 1 : -1) * (fig === FIG.crowd ? 0 : poseS[sPose][e - 8]) * (1 - perp)
          return (base + lean + spS * f) * DEG
        }
        const ax = G === 'T' ? 90 + (0.5 - E.x) * (fig === FIG.crowd ? 20 : 50) : -90 - (0.5 - E.x) * (fig === FIG.crowd ? 20 : 50)
        const axis = ax + lean + ((G === 'T' ? 90 : -90) - ax - lean) * perp
        return (axis + (fig === FIG.crowd ? 60 * popK : spTF) * f) * DEG
      }

      // ---- the beams and the Sheet ----
      for (let e = 0; e < NE; e++) {
        const nn = nOf[e]
        if (!nn || !inLayout(e)) continue
        const r = rows[rowOf[e]], E = EMITTERS[e]
        const ex = E.x * W, ey = E.y * H, tw = towardOf(e)
        const wSh = 1 / Math.max(1, lit[e]) // N-2: a 0-lit emitter never divides
        const hot = Math.max(fig === FIG.cage || (fig === FIG.sheet && lone.includes(e)) ? 1 : 0, hotBurst)
        if (tw >= Math.cos(10 * DEG) && t - glintAt[e] >= 0.13 + 0.05 * Math.sin(e * 7.1)) glintAt[e] = t
        for (let j = 0; j < nn; j++) {
          const s = e * 8 + j
          const on = nn === 1 ? litAt(r, slotOf[e]) : litAt(r, j)
          if (on && !wasOn[s]) { enterAt[s] = t; shot[s] = +shootNow } // a chase step snaps in; a pop or the latch shoots
          if (!on && wasOn[s]) offAt[s] = t
          wasOn[s] = +on
          const glow = on ? 1 : clamp(1 - (t - offAt[s]) / AFTER, 0, 1) // the exit: ≤ 50 ms of afterglow
          if (glow <= 0) continue
          const th = aim(e, j, nn), dx = Math.cos(th), dy = Math.sin(th)
          const w0 = CORE_W * hs
          if (fig === FIG.sheet && e === sheetE) { // the Sheet: a flat-top wedge, 30° wide
            const len = exitLen(ex, ey, dx, dy, W, H, 0)
            put(ex, ey, ex + dx * len, ey + dy * len, 2 * w0, len * Math.tan(15 * DEG), SHEET_W, SHEET_W * (1 + FWD * tw), 0, tint[e], 1, 0, 1)
            continue
          }
          const w1 = w0 * (1 + EXIT * tw)
          const len = exitLen(ex, ey, dx, dy, W, H, SK * w1)
          const fr = on && shot[s] ? clamp((t - enterAt[s]) / SHOOT, 0, 1) : 1 // `shoot`: the tip runs out in ≤ 48 ms
          const wc = Math.min(wSh, W_MAX)
          const g0 = wc * glow
          put(ex, ey, ex + dx * len * fr, ey + dy * len * fr, w0, w0 + (w1 - w0) * fr, g0, g0 * (1 + FWD * tw * fr), hot, tint[e], 0, fr < 1 ? 0.2 : 0, wSh / wc)
        }
      }
      // ---- the Grating burst (B): white hair rays, 110 ms, turning 20° ----
      const age = t - burstT
      const burstOn = age >= 0 && age < BURST_LIFE && fig !== FIG.cage
      if (burstOn) {
        const R = layout === 2 ? 24 : 32
        for (const e of [21, 22]) {
          const ex = EMITTERS[e].x * W, ey = EMITTERS[e].y * H, w = 0.5 * hs
          for (let k = 0; k < R; k++) {
            const th = (burstRot + (360 * k) / R + (e === 22 ? 180 / R : 0) + (20 * age) / BURST_LIFE) * DEG
            const dx = Math.cos(th), dy = Math.sin(th), len = exitLen(ex, ey, dx, dy, W, H, 4 * w)
            put(ex, ey, ex + dx * len, ey + dy * len, w, w, RAY_W, RAY_W, 1, tint[e], 2, 0, 1)
          }
        }
      }
      // ---- the origins: a white disc on every lit emitter, the glint (4-ray star, ≤ 50 ms) ----
      for (let e = 0; e < NE; e++) {
        if (!inLayout(e) || !(lit[e] > 0 || (e >= 21 && burstOn))) continue
        const g = t - glintAt[e] < 0.05 ? GLINT_W : 0
        put(EMITTERS[e].x * W, EMITTERS[e].y * H, EMITTERS[e].x * W, EMITTERS[e].y * H, 5 * hs, g ? 60 * hs : 0, DISC_W, g, 1, tint[e], 3, 0, 1)
      }

      // ---- the light state (SR-3 + N-1 + N-2) ----
      const hitRise = hit >= 0.5 && prevHit < 0.5 && t >= hitIgnore // an allowed (gate-passed) kick, out of the drop's 1 s
      prevHit = hit
      if (hitRise) onsets++
      const loudOn = hitRise && mode !== 'quiet' && power < P // N-1: the loud-on is a step on a counted onset, never a swell
      if (loudOn) power = P
      const phi = A0 > 0 ? A / A0 : 1
      target = Math.max(EPS, L0_K * W * H * power * phi)
      if (load === 2) sum = target
      else if (load === 1) sum = Math.min(sum, target)
      else sum *= Math.exp(clamp(Math.log(target / sum), -SUM_RATE * dt, SUM_RATE * dt))
      if (hitRise && mode !== 'quiet' && sum < target) sum = target // N-1: the loud-on load
      shootNow = false
      sum = Math.max(sum, EPS)
      first = false
      st = { mode, figure: fig, step: steps, open: op, converge: conv, spread: spreadDeg, power, lit: Array.from(lit), onsets, locked, fill: fill / (W * H), sum, target, cuts }
      return { n, light: A > 0 ? sum / A : 0, core: t < hitIgnore ? 1 : 1 + 0.4 * clamp(hit, 0, 1), haze: num('haze') * (conv < 0.5 ? 1 + 0.5 * conv : 1.25 + 0.25 * Math.min(1, (conv - 0.5) / 0.3)), speckle: 0.1 + 0.15 * flick }
    },
  }
}

// ---- the GL: Variant A (the Isobars pipeline) ----
const f4 = (x: number) => x.toFixed(4)
const HAZE_NEAR_DIV = 8 // the near halo: a 3×3 tent over the 1/8-res re-draw (≈ 140 rows, Isobars' level)
const HAZE_FAR_N = 64 // the far haze: ≈ 64 rows, σ 3 texels ≈ 52 px (design P2–P3: a lone beam's haze < .1 % at 200 px)
const HAZE_NEAR = 0.35 // knob ⚠️: the near halo per unit of `haze`
const HAZE_FAR = 1.1 // knob ⚠️: the lit air between the beams per unit of `haze`
const EXPOSURE = 1
const SMOKE_DIV = 8 // the smoke field's resolution divisor
// The colours (creative §2.5), skirt / hot core per tint: green · white · red. Green is the design's (.1, 1, .38)
// (SR-7, T-L5: hue 138.7°), the creative's #00FF46 family.
const COL = `const vec3 SKIRT[3] = vec3[3](vec3(0.10, 1.00, 0.38), vec3(0.91, 0.94, 1.00), vec3(1.00, 0.10, 0.18));
const vec3 HOTC[3] = vec3[3](vec3(0.90, 1.00, 0.925), vec3(1.0), vec3(1.00, 0.91, 0.894));`
// P1: one instanced quad per beam / Sheet / ray / origin. The VS builds the trapezoid (the support grows with the
// width toward the exit); the FS takes the cross-section from the pixel's distance to the axis (flat varyings).
const VS = `#version 300 es
layout(location = 0) in vec4 aSeg; // x0 y0 x1 y1, px, y down
layout(location = 1) in vec4 aW;   // w0 w1 gain0 gain1
layout(location = 2) in vec4 aK;   // hot tint kind fade
uniform vec2 uRes;
uniform float uScale; // 1, or 1/8 for the haze's low-res re-draw (L3)
flat out vec4 vSeg;
flat out vec4 vW;
flat out vec4 vK;
flat out uint vId;
out vec2 vP;
void main() {
  vSeg = aSeg * uScale; vW = vec4(aW.xy * uScale, aW.zw); vK = aK; vId = uint(gl_InstanceID);
  float t = float(gl_VertexID & 1), s = float(gl_VertexID >> 1) * 2.0 - 1.0;
  vec2 p0 = vSeg.xy, p1 = vSeg.zw, p;
  if (aK.z > 2.5) {
    float R = max(1.5 * vW.x, vW.y) + 2.0;
    p = p0 + vec2(t * 2.0 - 1.0, s) * R;
  } else {
    vec2 d = p1 - p0;
    float L = length(d);
    vec2 dir = L > 1e-3 ? d / L : vec2(1.0, 0.0), nrm = vec2(-dir.y, dir.x);
    float k = aK.z < 0.5 ? ${SK.toFixed(1)} : aK.z < 1.5 ? 1.2 : 4.0; // half-support ÷ w: beam, Sheet, ray
    float h0 = k * vW.x + 1.0, h1 = k * vW.y + 1.0;
    p = t < 0.5 ? p0 - dir * h0 + nrm * s * h0 : p1 + dir * h1 + nrm * s * h1;
  }
  vP = p;
  gl_Position = vec4(p.x / uRes.x * 2.0 - 1.0, 1.0 - p.y / uRes.y * 2.0, 0.0, 1.0);
}`
const FS = `#version 300 es
precision highp float;
${HASH}
${COL}
flat in vec4 vSeg;
flat in vec4 vW;
flat in vec4 vK;
flat in uint vId;
in vec2 vP;
uniform float uLight, uCore, uSpeckle;
uniform uint uFrame;
out vec4 outColor;
void main() {
  int kind = int(vK.z + 0.5), ti = int(vK.y + 0.5);
  vec3 sk = SKIRT[ti], hc = mix(sk, HOTC[ti], 0.4 + 0.6 * vK.x); // a hot core is white
  vec2 q = vP - vSeg.xy;
  if (kind == 3) { // the origin: a white disc + the glint (two tapered 1-px lines)
    float u = length(q) / vW.x;
    float disc = u < 1.0 ? (1.0 - u * u) * (1.0 - u * u) : 0.0;
    float a = abs(q.x), b = abs(q.y), g = 0.0;
    if (vW.y > 0.0) g = 0.71 * (exp(-1.39 * b * b) * max(0.0, 1.0 - a / vW.y) + exp(-1.39 * a * a) * max(0.0, 1.0 - b / vW.y));
    outColor = vec4(uLight * (vW.z * disc + vW.w * g) * HOTC[ti], 0.0);
    return;
  }
  vec2 d = vSeg.zw - vSeg.xy;
  float L = max(length(d), 1e-3);
  vec2 dir = d / L;
  float al = dot(q, dir), ac = abs(dot(q, vec2(-dir.y, dir.x)));
  float t = clamp(al / L, 0.0, 1.0);
  float w = mix(vW.x, vW.y, t), g = mix(vW.z, vW.w, t);
  float r = al < 0.0 ? length(q) : al > L ? length(vP - vSeg.zw) : ac; // round caps
  float tip = vK.w > 0.0 ? clamp((1.0 - al / L) / vK.w, 0.0, 1.0) : 1.0;
  if (kind == 1) { // the Sheet: a flat-top wedge (its alpha marks it for the composite's deeper smoke)
    vec3 c = uLight * g * tip * ${f4(SHEET_A)} * smoothstep(1.0, 0.85, r / max(w, 1.0)) * sk;
    outColor = vec4(c, max(c.r, max(c.g, c.b)));
    return;
  }
  float sig = max(0.6, 0.85 * w);
  float core = exp(-0.5 * r * r / (sig * sig)) * (0.85 * w / sig); // σ ≥ .6 px, its peak scaled down by the same factor
  float u = r / (${SK.toFixed(1)} * w);
  float skirt = kind == 0 && u < 1.0 ? (1.0 - u * u) * (1.0 - u * u) : 0.0; // windowed to 0 at the support (L1)
  float spk = 1.0 + uSpeckle * (2.0 * hash(uint(max(al, 0.0) / 2.5) * 747796405u + vId * 2891336453u + uFrame * 277803737u) - 1.0); // grain along the beam, new each frame
  outColor = vec4(uLight * g * tip * spk * (${f4(SKIRT_A)} * skirt * sk + ${f4(CORE_A)} * uCore * core * hc), 0.0);
}`
// P4: the smoke field (2 octaves of snoise; features 150–400 px, drift 20–60 px/s) at 1/8 res, on the layer clock.
const SMOKE = `#version 300 es
precision highp float;
${NOISE}
uniform float uTime, uPx; // uPx: frame px per smoke texel, in 1117-row units
out vec4 outColor;
void main() {
  vec2 p = gl_FragCoord.xy * uPx;
  vec3 g;
  float n = 0.65 * snoise(vec3(p / 300.0 + vec2(0.0, 0.12 * uTime), 0.05 * uTime), g) + 0.35 * snoise(vec3(p / 140.0 - vec2(0.2 * uTime, 0.0), 0.09 * uTime + 7.0), g);
  outColor = vec4(0.5 + 0.5 * n, 0.0, 0.0, 1.0);
}`
// P5: beams × smoke (±25 %, ±40 % in a Sheet) + the near tent + the far haze; the rev-2 tone map; ±1 LSB TPDF dither.
const COMPOSITE = `#version 300 es
precision highp float;
${HASH}
uniform sampler2D uSrc;
uniform sampler2D uFar;
uniform sampler2D uSmoke;
uniform sampler2D uNear; // the 1/8-res re-draw (L3: no mip chain)
uniform vec2 uRes;
uniform vec2 uNd; // one uNear texel (uv)
uniform vec2 uGain;
uniform uint uFrame;
out vec4 outColor;
vec3 tent(vec2 uv) {
  vec2 d = uNd;
  vec3 c = 4.0 * texture(uNear, uv).rgb
    + 2.0 * (texture(uNear, uv + vec2(d.x, 0.0)).rgb + texture(uNear, uv - vec2(d.x, 0.0)).rgb + texture(uNear, uv + vec2(0.0, d.y)).rgb + texture(uNear, uv - vec2(0.0, d.y)).rgb)
    + texture(uNear, uv + d).rgb + texture(uNear, uv - d).rgb + texture(uNear, uv + vec2(d.x, -d.y)).rgb + texture(uNear, uv + vec2(-d.x, d.y)).rgb;
  return c / 16.0;
}
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec4 b = textureLod(uSrc, uv, 0.0);
  float s = texture(uSmoke, uv).r * 2.0 - 1.0;
  float sh = clamp(b.a / max(max(b.r, max(b.g, b.b)), 1e-5), 0.0, 1.0);
  vec3 haze = uGain.x * tent(uv) + uGain.y * texture(uFar, uv).rgb;
  vec3 E = (b.rgb * (1.0 + s * (0.25 + 0.15 * sh)) + haze * (1.0 + 0.35 * s)) * ${f4(EXPOSURE)};
  float m = max(max(E.r, E.g), max(E.b, 1e-4));
  vec3 o = mix(E / m, vec3(1.0), ${f4(TONE.W)} * smoothstep(${f4(TONE.K0)}, ${f4(TONE.K1)}, m)) * (1.0 - exp(-m));
  uint h = uint(gl_FragCoord.x) * 1973u + uint(gl_FragCoord.y) * 9277u + uFrame * 26699u;
  outColor = vec4(o + (hash(h) + hash(h ^ 0x9e3779b9u) - 1.0) / 255.0, 1.0);
}`

/** Bindings: design §2.0 table + SR-5 (`burst` before `hit`: the gate's same-frame tie goes to the drop). */
export const lasers: NativeDef = {
  id: 'native/lasers', name: 'Rave Lasers', kind: 'generator', category: 'geometry', tags: ['lasers', 'beams'], credit: 'VeeJay Wizard',
  inputs: [
    { name: 'layout', type: 'long', values: [0, 1, 2], labels: ['truss', 'floor', 'full'], default: 0 },
    { name: 'green', type: 'float', min: 0, max: 1, default: 0.7 },
    { name: 'white', type: 'float', min: 0, max: 1, default: 0.3 },
    { name: 'red', type: 'float', min: 0, max: 1, default: 0 },
    { name: 'haze', type: 'float', min: 0, max: 1, default: 0.5 },
    { name: 'open', type: 'float', min: 0, max: 1, default: 0 }, // the sub: beams per emitter, spread
    { name: 'scissor', type: 'float', min: 0, max: 1, default: 0 }, // the reese: neighbour fans lean apart
    { name: 'converge', type: 'float', min: 0, max: 1, default: 0 }, // the build: the ramp into the cage
    { name: 'flick', type: 'float', min: 0, max: 1, default: 0 }, // the hats: the chase's dark share, speckle
    { name: 'pop', type: 'float', min: 0, max: 1, default: 0 }, // the kick: spread ×1.3, a chase jump with `shoot`
    { name: 'snap', type: 'float', min: 0, max: 1, default: 0 }, // the snare: the Grating burst, the chase reverses
    { name: 'climax', type: 'float', min: 0, max: 1, default: 0 }, // the drop: the latch (ungated)
    { name: 'burst', type: 'float', min: 0, max: 1, default: 0 }, // ⚡ the drop: white cores ≥ 400 ms
    { name: 'hit', type: 'float', min: 0, max: 1, default: 0 }, // ⚡ the kick: core light +40 %
  ],
  flash: ['burst', 'hit'],
  bind: {
    open: { source: 'sub', amount: 1, attack: 0.04, release: 0.3, min: 0, max: 1 },
    scissor: { source: 'reese', amount: 1, attack: 0.03, release: 0.15, min: 0, max: 1 },
    converge: { source: 'build', amount: 1, attack: 0.15, release: 0.8, min: 0, max: 1 },
    flick: { source: 'hats', amount: 1, attack: 0, release: 0.18, min: 0, max: 1 },
    pop: { source: 'kick', amount: 1, attack: 0, release: 0.14, min: 0, max: 1 },
    snap: { source: 'snare', amount: 1, attack: 0, release: 0.11, min: 0, max: 1 },
    climax: { source: 'drop', amount: 1, attack: 0, release: 0.4, min: 0, max: 1 },
    burst: { source: 'drop', amount: 1, attack: 0, release: 0.4, min: 0, max: 1 },
    hit: { source: 'kick', amount: 1, attack: 0, release: 0.14, min: 0, max: 1 },
  },
  create(gl) {
    const rig = createRig(7)
    const buf = new Float32Array(MAX_INST * STRIDE)
    const beams = program(VS, FS) // the engine's cache: compiled once per source pair, never per prepare (T-L11)
    const blur = fullscreenProgram(BLUR), smoke = fullscreenProgram(SMOKE), composite = fullscreenProgram(COMPOSITE)
    const tA = renderTarget(true), tL = renderTarget(true), tH = renderTarget(true), tV = renderTarget(true), tS = renderTarget() // tL: the 1/8 re-draw (L3)
    const vao = gl.createVertexArray(), vbo = gl.createBuffer()
    gl.bindVertexArray(vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
    gl.bufferData(gl.ARRAY_BUFFER, buf.byteLength, gl.DYNAMIC_DRAW)
    for (let i = 0; i < 3; i++) {
      gl.enableVertexAttribArray(i)
      gl.vertexAttribPointer(i, 4, gl.FLOAT, false, STRIDE * 4, i * 16)
      gl.vertexAttribDivisor(i, 1)
    }
    gl.bindVertexArray(null)
    let frame = 0
    const native = {
      laserState: () => rig.state(), // the harness's CPU truth (the isobarState() precedent)
      draw(f: Parameters<ReturnType<NativeDef['create']>['draw']>[0], v: Readonly<Record<string, Value>>) {
        frame = (frame + 1) >>> 0
        const r = rig.step({ v, bar: f.sync.bar, bpm: f.sync.bpm, conf: f.sync.confidence, time: performance.now() / 1000, width: f.width, height: f.height }, buf)
        const out = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null
        const lw = Math.max(1, Math.round(f.width / HAZE_NEAR_DIV)), lh = Math.max(1, Math.round(f.height / HAZE_NEAR_DIV))
        tA.fit(f.width, f.height)
        bindFramebufferInfo(gl, tA)
        gl.viewport(0, 0, f.width, f.height)
        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT)
        if (r.n) {
          gl.enable(gl.BLEND)
          gl.blendFunc(gl.ONE, gl.ONE) // additive, order-independent
          gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, buf, 0, r.n * STRIDE)
          gl.bindVertexArray(vao)
          gl.useProgram(beams.program)
          setUniforms(beams, { uRes: [f.width, f.height], uScale: 1, uLight: r.light, uCore: r.core, uSpeckle: r.speckle, uFrame: frame })
          gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, r.n)
        }
        // L3: the haze reads a 1/8-res re-draw of the same instances (the box average of the light), not a mip chain
        tL.fit(lw, lh)
        bindFramebufferInfo(gl, tL)
        gl.clear(gl.COLOR_BUFFER_BIT)
        if (r.n) {
          setUniforms(beams, { uRes: [lw, lh], uScale: lw / f.width, uSpeckle: 0 })
          gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, r.n)
          gl.bindVertexArray(null)
          gl.disable(gl.BLEND)
        }
        const L = Math.max(0, Math.round(Math.log2(f.height / HAZE_FAR_N))), hw = Math.max(1, f.width >> L), hh = Math.max(1, f.height >> L)
        tH.fit(hw, hh)
        tV.fit(hw, hh)
        bindFramebufferInfo(gl, tH)
        blur({ uSrc: tL.attachments[0], uRes: [hw, hh], uStep: [1 / hw, 0], uLod: 0 })
        bindFramebufferInfo(gl, tV)
        blur({ uSrc: tH.attachments[0], uRes: [hw, hh], uStep: [0, 1 / hh], uLod: 0 })
        const sw = Math.max(1, Math.round(f.width / SMOKE_DIV)), sh = Math.max(1, Math.round(f.height / SMOKE_DIV))
        tS.fit(sw, sh)
        bindFramebufferInfo(gl, tS)
        smoke({ uTime: f.time, uPx: (f.width / sw) * (1117 / f.height) })
        gl.bindFramebuffer(gl.FRAMEBUFFER, out)
        gl.viewport(0, 0, f.width, f.height)
        composite({ uSrc: tA.attachments[0], uFar: tV.attachments[0], uSmoke: tS.attachments[0], uNear: tL.attachments[0], uNd: [1 / lw, 1 / lh], uRes: [f.width, f.height], uGain: [HAZE_NEAR * r.haze, HAZE_FAR * r.haze], uFrame: frame })
      },
      dispose() {
        for (const t of [tA, tL, tH, tV, tS]) {
          gl.deleteFramebuffer(t.framebuffer)
          gl.deleteTexture(t.attachments[0])
        }
        gl.deleteBuffer(vbo)
        gl.deleteVertexArray(vao)
      },
    }
    return native
  },
}
