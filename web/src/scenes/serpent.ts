// Neuro Serpent (W4 S3 spike; design_neuro_serpent.md Variant A + § Skeptic response rev 2 + the lead rulings, incl.
// the replay outcome = the L223 fallback; creative_neuro_serpent.md §1–§3): one open chrome band-tube (a lens
// cross-section 2.4 : 1 with 3 flutes a face, L = 40 w) that coils in lit fog. A pure CPU rig (the spine: a helix on a
// seeded drift + the thrash, the whip loop, the crack, the snap kink; rotation-minimising frames + the twist) writes
// 192 rings a frame; the GL is one instanced tube mesh with a depth buffer in the native's own HDR target (mode S: one
// depth renderbuffer + the depth-edge smooth; mode M: MSAA + a blit resolve), additive sparks / glints / core glow, and
// the Rave Lasers post shape (a 1/4 threshold, a 1/8 blur H + V, one composite: the max-channel tone map + dither).
// Fallback (lead ruling): `W` winds from `build` + a time-since-last-drop floor; the whip launches on the `drop` rise.
// Own code, credit VeeJay Wizard. The studio follows the env() structure of own/liquid-chrome.fs (ours); BLUR is isobars'.
import { bindFramebufferInfo, createFramebufferInfo, resizeFramebufferInfo, setUniforms, type AttachmentOptions, type FramebufferInfo } from 'twgl.js'
import { fullscreenProgram, program, renderTarget } from '../gl/engine'
import type { NativeDef } from '../gl/scene'
import { FOCAL, orbitVP } from '../gl/view'
import type { Value } from '../fx/types'
import { BLUR } from './isobars'
import { HASH } from './points'

const TAU = Math.PI * 2, DEG = Math.PI / 180

// ---- the rig (pure: serpent.test.ts runs it in Node) ----
export const RING = 16 // p.xyz, hw | a.xyz (wide axis), s (arc, world) | c.xyz (thick axis), heat | ht, crest, band (HDR: the whip), slit (HDR: the snap gash)
export const PART = 12 // p.xyz, size | d.xyz (the streak vector), kind (0 spark, 1 glint, 2 glow) | rgb, intensity
export const RINGS = 192
export const MAXP = 384
/** T-F0 (lead ruling, replay outcome): the absence wind (design §R2 T1–T8 + N-1…N-3) is OFF, so `presence` never moves
 *  `W`. Its knobs stay for a later Tier-2 try with a source that passes replay lines d–g.
 *  ponytail: the T1–T8 path itself is not built in the spike; this flag + ABSENCE are its seam. */
export const SERPENT_ABSENCE_WIND = false
export const ABSENCE = { thetaOn: 0.3, thetaOff: 0.15, commitBeats: 2, gapBeats: 0.5, refMin: 0.0755, thawBars: 16, thawTauBars: 8 } as const

// Knobs ⚠️ (spike values; creative §1–§3, design §2.0, lead rulings G3 / G4).
const W_REST = 0.14, W_GROOVE = 0.18 // w, world units: 7 % / 9 % FH (FH = 2 at the focal plane, view.ts)
const LEN = 40 // L = 40 w
const R_MAX = 0.8 // the coil radius cap (world): at 0.8 turns the extra length goes into the pitch (a slack corkscrew)
const GAP = 1.5 // the pitch per turn ≥ 1.5 w: the 0.5 w gap between tape-wound turns
const FLOOR_W = 0.3, FLOOR_BARS = 32 // G4: W ≥ .30 × min(1, bars since the last drop ÷ 32)
const W_TAU_BARS = 8 // ⚠️ drift: W falls toward max(build, floor) with τ 8 bars (a build that drops before its fire keeps its wind)
const WHIP_MIN = 0.06 // under it a drop rise is the +15 % pump whip (recipe 4)
const PUMP = 0.15
const LATCH = 2 // s: one whip per drop (recipe 5, C14)
const UNWIND = 1.5, LOOP = 1, CRACK = 1 // beats (T4; G3: the loop 1 beat, the crack in the next)
const COV = 0.35, COV_ZOOM = 0.4, CLEAR = 0.5 // T9: the coverage cap, the eye clearance (world)
const SPARK_MAX = 150

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
const mulberry = (a: number) => () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
/** A one-pole toward `x`: `att` s up, `rel` s down (0 = instant). */
const pole = (y: number, x: number, att: number, rel: number, dt: number) => { const tau = x > y ? att : rel; return tau > 0 ? y + (x - y) * (1 - Math.exp(-dt / tau)) : x }
const norm = (a: number[]) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

/** §R5 travel rule: ripple lengths per beat, the fastest of {1/8, 1 beat, 2 beats} that keeps the rate ≤ 3 Hz. */
export const ripplePerBeat = (bpm: number) => (bpm <= 90 ? 2 : bpm <= 180 ? 1 : 0.5)

export interface StepIn { v: Readonly<Record<string, Value>>; beat: number; bpm: number; now: number; dt: number; aspect: number; perBeat?: number } // perBeat: a ripple-rate override (T-S5 arm)
export interface SerpentOut {
  rings: number; parts: number; vp: Float32Array; eye: number[]; cam: number[]; nearDist: number
  glow: number; shock: number; shockR: number; key: number; ripple: number; rippleH: number; burst: number; w: number
  axisP: number[]; axisD: number[]
}
export interface SerpentState {
  phase: 'coil' | 'release' | 'groove'; W: number; B: number; turns: number; twist: number; ripple: number; ripplePhase: number
  spanFW: number; speed: number; whips: number; pumps: number; rings: number; snaps: number; snapSide: 1 | -1; glints: number
  flares: number; coverage: number; fit: number; heat: number; loop: number; crack: number
}

export function createSerpent(seed = 1, n = RINGS) {
  const rnd = mulberry(seed)
  const P = new Float32Array(n * 3), T = new Float32Array(n * 3), R = new Float32Array(n * 3), S = new Float32Array(n)
  const X0 = new Float32Array(n * 2) // the last frame's projected (x · aspect, y) ndc: the speed truth
  const sp = new Float32Array(SPARK_MAX * 9) // x y z vx vy vz born life fork
  const gli = new Float32Array(16 * 4) // glints: x y z born
  const rp = new Float32Array(6 * 2).fill(-1) // kick ring pairs: s0, born
  const vp = new Float32Array(16)
  const yaw0 = rnd() * TAU, a0 = (rnd() - 0.5) * 0.6, ph1 = rnd() * TAU, ph2 = rnd() * TAU, phi0 = rnd() * TAU
  let first = true, lastNow = 0, layerT = 0, prevBeat = 0, rip = 0
  let b3 = 0, b4 = 0, heat = 0, W = 0, bars = 0, Wg = 0
  let prevDrop = 0, prevFlare = 0, prevKick = 0, prevSnare = 0, prevHats = 0
  let whipOn = false, c = 0, W0 = 0, pump = false, lastWhip = -Infinity, whips = 0, pumps = 0, hand = rnd() < 0.5 ? 1 : -1
  let shockT = -Infinity, flares = 0, nRings = 0, snaps = 0, snapS = 0, snapT = -Infinity, snapC = 0, side: 1 | -1 = rnd() < 0.5 ? 1 : -1
  let shT = -Infinity, shSign = 1, nGlints = 0, nSp = 0, nGl = 0, cx = 0, cy = 0, cz = 0, fit = 1, sparked = false, nearK = n >> 1
  let st: SerpentState = { phase: 'coil', W: 0, B: 0, turns: 0.8, twist: 0.25, ripple: 0, ripplePhase: 0, spanFW: 0, speed: 0, whips: 0, pumps: 0, rings: 0, snaps: 0, snapSide: side, glints: 0, flares: 0, coverage: 0, fit: 1, heat: 0, loop: -1, crack: -1 }

  const spark = (x: number, y: number, z: number, dx: number, dy: number, dz: number, w: number, now: number) => {
    if (nSp >= SPARK_MAX) return
    const o = nSp++ * 9, sv = (6 + 6 * rnd()) * w // 6–12 w/s
    let vx = dx + (rnd() - 0.5) * 1.2, vy = dy + (rnd() - 0.5) * 1.2, vz = dz + (rnd() - 0.5) * 1.2
    const l = Math.hypot(vx, vy, vz) || 1
    vx *= sv / l; vy *= sv / l; vz *= sv / l
    sp[o] = x; sp[o + 1] = y; sp[o + 2] = z; sp[o + 3] = vx; sp[o + 4] = vy; sp[o + 5] = vz
    sp[o + 6] = now; sp[o + 7] = 0.25 + 0.15 * rnd(); sp[o + 8] = (rnd() - 0.5) * 1.2
  }

  return {
    state: (): SerpentState => ({ ...st }),
    step(i: StepIn, rings: Float32Array, parts: Float32Array): SerpentOut {
      const v = i.v
      const num = (k: string, d = 0) => { const y = v[k]; return typeof y === 'number' && Number.isFinite(y) ? y : d }
      const now = i.now, dtw = first ? 0 : clamp(now - lastNow, 0, 0.1) // every timed window on the wall clock (S-4)
      lastNow = now
      layerT += clamp(i.dt, 0, 0.1) // the layer clock: the drift and the auto-orbit only
      const bpm = i.bpm > 0 ? i.bpm : 174, beatS = 60 / bpm, db = dtw / beatS
      const B = clamp(num('bass'), 0, 1), sub = clamp(num('sub'), 0, 1), burst = clamp(Math.max(num('reese'), num('wobble')), 0, 1)
      const build = clamp(num('build'), 0, 1), drop = num('drop'), flare = clamp(num('flare'), 0, 1)
      const kick = num('kick'), snare = num('snare'), hats = num('hats'), zoom = clamp(num('zoom', 1), 0.5, 3)
      b3 = pole(b3, B, 0.08, 0.5, dtw) // row 3: flex + thrash
      b4 = pole(b4, B, 0.4, 2, dtw) // row 4: scale + key gain
      heat = pole(heat, B, 0.06, 0.9, dtw) // the gills: dark within 2 bars of the bass leaving (C17)
      // W (fallback): max(build, the floor) at once up, τ 8 bars down; a whip spends it (W := 0, the floor restarts)
      bars += db / 4
      const target = Math.max(build, FLOOR_W * Math.min(1, bars / FLOOR_BARS))
      W = target >= W ? target : W + (target - W) * (1 - Math.exp(-db / (4 * W_TAU_BARS)))
      // the drop rise (T8 under the fallback; cold entry A-3: prevDrop starts at 0) → a whip outside the 2-s latch
      if (drop >= 0.5 && prevDrop < 0.5 && now - lastWhip >= LATCH) {
        W0 = W
        pump = W0 < WHIP_MIN
        whipOn = true; c = 0; W = 0; bars = 0; lastWhip = now; whips++; if (pump) pumps++
        hand = rnd() < 0.5 ? 1 : -1 // the twist handedness is re-drawn at each release (creative §5)
        sparked = false
      }
      prevDrop = drop
      if (flare >= 0.5 && prevFlare < 0.5) { shockT = now; flares++ }
      prevFlare = flare
      if (whipOn) { c += db; if (c >= Math.max(UNWIND, LOOP + CRACK)) whipOn = false }
      const unw = whipOn ? smooth(0, UNWIND, c) : 1
      Wg = whipOn ? (pump ? 0 : W0 * (1 - unw)) : W // the displayed wind (the coil, the scale, the glow)
      const pumpK = whipOn && pump ? PUMP * Math.sin(Math.PI * clamp(c / (LOOP + CRACK), 0, 1)) : 0
      // the ripple (§R5): + k × the beat step, capped at twice the nominal; bpm 0 → 2.9 Hz on the wall clock
      const step = i.bpm > 0 && !first ? Math.min(Math.max(0, i.beat - prevBeat), 2 * db) : db
      rip += (i.perBeat || ripplePerBeat(bpm)) * step
      prevBeat = i.beat
      // the body numbers (world, before the zoom and the fit)
      const w = (W_REST + (W_GROOVE - W_REST) * b4) * (1 - 0.36 * Wg) * (1 + pumpK)
      const L = LEN * w, ds = L / (n - 1)
      const twist = 0.25 + 5.75 * B, turns = 0.8 + 3.2 * Wg
      // the snare: the snap (a kink 0.8 w over 2 w; full 1 sixteenth, ≤ 10 % after 1 beat; sides alternate, ≥ 4 w apart)
      const snapNew = snare - prevSnare > 0.25 && snare >= 0.5
      if (snapNew) {
        let s = 0
        for (let tries = 0; tries < 6; tries++) { s = (0.2 + 0.6 * rnd()) * L; if (Math.abs(s - snapS) >= 4 * w) break }
        if (Math.abs(s - snapS) < 4 * w) s = snapS + (snapS < L / 2 ? 4 : -4) * w
        snapS = s; snapT = now; snapC = 0; side = side === 1 ? -1 : 1; snaps++
      }
      prevSnare = snare
      snapC += db
      const snapEnv = snapT < 0 ? 0 : snapC < 0.25 ? 1 : Math.exp(-(snapC - 0.25) * 3.1)
      const hatNew = hats - prevHats > 0.25 && hats >= 0.5
      if (hatNew) { shT = now; shSign = -shSign; nGlints++ }
      prevHats = hats
      const shiver = shT < 0 ? 0 : shSign * 4 * DEG * Wg * Math.exp(-(now - shT) / 0.08)
      // the spine, local: a helix about +z (its turn density follows the per-ring wind) + the thrash + the snap kink
      const sL = whipOn ? L * clamp(c / LOOP, 0, 1) : -1, Rcap = R_MAX * (1 - 0.25 * b3)
      let phi = phi0 + shiver, z = 0
      for (let j = 0; j < n; j++) {
        const s = j * ds, u = s / L
        const wk = whipOn && !pump ? W0 * (1 - unw) * smooth(sL - 2 * w, sL + w, s) : Wg // behind the loop: unfurled
        const lam = L / (0.8 + 3.2 * wk)
        const Pt = Math.max(GAP * w, Math.sqrt(Math.max(0, lam * lam - (TAU * Rcap) ** 2)))
        const Rr = Math.sqrt(Math.max(0, lam * lam - Pt * Pt)) / TAU
        if (j) { phi += (TAU * ds) / lam; z += (ds * Pt) / lam }
        const thr = 1.5 * w * b3 * (0.6 + 0.4 * u) * Math.sin(TAU * (s / (L / 2.2) - 0.8 * layerT))
        const kink = snapEnv * side * 0.8 * w * Math.exp(-(((s - snapS) / (0.7 * w)) ** 2))
        P[j * 3] = Rr * Math.cos(phi) + thr
        P[j * 3 + 1] = Rr * Math.sin(phi) + kink
        P[j * 3 + 2] = z
        S[j] = s
      }
      tangents(P, T, n)
      // the whip loop: a windowed trochoid in the base tangent's plane, R_L = 1.2 w → 3 w tail → head in 1 beat
      const loopA = whipOn ? smooth(0, 0.08, c) * smooth(LOOP + 0.3, LOOP, c) : 0
      if (loopA > 0) {
        const p = clamp(c / LOOP, 0, 1), RL = 1.2 * w * (1 + 1.5 * p), ell = TAU * RL * 0.6
        for (let j = 0; j < n; j++) {
          const psi = (TAU * (S[j] - (sL - ell / 2))) / ell
          if (psi <= 0 || psi >= TAU) continue
          const o = j * 3, tx = T[o], ty = T[o + 1], tz = T[o + 2]
          let nx = -ty, ny = tx, nz = 0 // ẑ × t, or x̂ × t where t ∥ ẑ
          if (Math.hypot(nx, ny) < 0.3) { nx = 0; ny = -tz; nz = ty }
          const nl = Math.hypot(nx, ny, nz) || 1, a = loopA * RL * Math.sin(psi / 2) ** 2
          const fa = -Math.sin(psi) * a, fb = ((1 - Math.cos(psi)) * a) / nl
          P[o] += fa * tx + fb * nx; P[o + 1] += fa * ty + fb * ny; P[o + 2] += fa * tz + fb * nz
        }
      }
      // the drift: the coil axis z → world Z (seeded, slow), local x → V (up-ish), local y → U (across)
      const az = a0 + 0.5 * Math.sin(0.05 * layerT + ph1), el = 0.35 * Math.sin(0.037 * layerT + ph2)
      const Z = [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)]
      const U = norm([Z[2], 0, -Z[0]]), V = cross(Z, U)
      let mx = 0, my = 0, mz = 0
      for (let j = 0; j < n; j++) {
        const o = j * 3, x = P[o], y = P[o + 1], zz = P[o + 2]
        P[o] = x * V[0] + y * U[0] + zz * Z[0]; P[o + 1] = x * V[1] + y * U[1] + zz * Z[1]; P[o + 2] = x * V[2] + y * U[2] + zz * Z[2]
        mx += P[o]; my += P[o + 1]; mz += P[o + 2]
      }
      const kc = first ? 1 : 1 - Math.exp(-dtw / 1) // the body centre, lagged 1 s
      cx += (mx / n - cx) * kc; cy += (my / n - cy) * kc; cz += (mz / n - cz) * kc
      // the camera: orbit 1 = the auto drift (yaw 4°/s on the layer clock, pitch +5…+20°), else the yaw / pitch inputs (deg)
      const orbit = num('orbit', 1) >= 0.5
      const yaw = orbit ? yaw0 + 4 * DEG * layerT : num('yaw') * DEG, pitch = orbit ? (12.5 + 7.5 * Math.sin((TAU * layerT) / 47)) * DEG : num('pitch', 12) * DEG
      const eye = [FOCAL * Math.sin(yaw) * Math.cos(pitch), FOCAL * Math.sin(pitch), FOCAL * Math.cos(yaw) * Math.cos(pitch)]
      vp.set(orbitVP(yaw, pitch, i.aspect))
      const back = norm(eye), right = norm(cross([0, 1, 0], back)), up = cross(back, right)
      for (let j = 0; j < n; j++) { const o = j * 3; P[o] = (P[o] - cx) * zoom; P[o + 1] = (P[o + 1] - cy) * zoom; P[o + 2] = (P[o + 2] - cz) * zoom }
      // the crack: the head tip sweeps out and back across the view (≥ 60 % FW of travel) in the beat after the loop
      const p2 = whipOn ? clamp((c - LOOP) / CRACK, 0, 1) : 0, h = (n - 1) * 3
      if (p2 > 0 && p2 < 1) {
        const th = norm([P[h] - P[h - 9], P[h + 1] - P[h - 8], P[h + 2] - P[h - 7]]), dir = norm(cross(th, back))
        const A = 0.95 * zoom * (1 + (pump ? PUMP : 0)) * Math.sin(Math.PI * p2)
        for (let j = Math.floor(0.6 * n); j < n; j++) { const f = A * smooth(0.6 * L, L, S[j]) ** 2, o = j * 3; P[o] += f * dir[0]; P[o + 1] += f * dir[1]; P[o + 2] += f * dir[2] }
        if (!sparked && p2 >= 0.5) { // the crack sheds 80–120 sparks from the tip
          sparked = true
          for (let q = 80 + Math.floor(rnd() * 41); q > 0; q--) spark(P[h], P[h + 1], P[h + 2], dir[0], dir[1], dir[2], w * zoom, now)
        }
      }
      // T9 fit: coverage ≤ 35 % (40 % zoomed) and every ring surface ≥ 0.5 in front of the eye (the body, 40 w long, can
      // reach past the camera: a depth test, not only a distance); one scale about the centre, release 1 s. A re-draw in
      // the same frame (dtw 0: a still's second angle) renders its own need but keeps the stored fit.
      const wz = w * zoom
      let cov = project(P, vp, n, i.aspect, X0, null, wz), near = Infinity, toEye = 0
      for (let j = 0; j < n; j++) {
        const o = j * 3, d = Math.hypot(eye[0] - P[o], eye[1] - P[o + 1], eye[2] - P[o + 2]) - wz / 2
        if (d < near) { near = d; nearK = j }
        toEye = Math.max(toEye, P[o] * back[0] + P[o + 1] * back[1] + P[o + 2] * back[2] + wz / 2)
      }
      let need = Math.min(1, Math.sqrt((zoom > 1 ? COV_ZOOM : COV) / Math.max(cov, 1e-6)))
      if (toEye > FOCAL - CLEAR) need = Math.min(need, (FOCAL - CLEAR) / toEye)
      const fitNow = first || need < fit ? need : fit + (need - fit) * (1 - Math.exp(-dtw / 1))
      if (first || dtw > 0) fit = fitNow
      for (let j = 0; j < n * 3; j++) P[j] *= fitNow
      const sc = zoom * fitNow, wf = w * sc
      let speed = 0, xmin = Infinity, xmax = -Infinity
      cov = project(P, vp, n, i.aspect, X0, (j, x, y) => {
        if (!first && dtw > 0) speed += Math.hypot(x - X0[j * 2], y - X0[j * 2 + 1])
        xmin = Math.min(xmin, x); xmax = Math.max(xmax, x)
      }, wf)
      speed = dtw > 0 ? speed / n / dtw / (2 * i.aspect) : 0
      tangents(P, T, n)
      rmf(P, T, R, n)
      // the kick: a ring pair born at the body point nearest the camera, both fronts 8 w per beat, half-life 100 ms
      if (kick - prevKick > 0.25 && kick >= 0.5) {
        let slot = 0
        for (let q = 0; q < 6; q++) if (rp[q * 2 + 1] < rp[slot * 2 + 1]) slot = q
        rp[slot * 2] = S[nearK]; rp[slot * 2 + 1] = now; nRings++
      }
      prevKick = kick
      for (let q = 0; q < 6; q++) if (rp[q * 2 + 1] >= 0 && 0.3 * 2 ** (-(now - rp[q * 2 + 1]) / 0.1) < 0.005) rp[q * 2 + 1] = -1
      // the rings
      const gash = snapT < 0 ? 0 : 6 * Math.exp(-(now - snapT) / 0.1)
      let nearD = Infinity
      for (let j = 0; j < n; j++) {
        const o = j * 3, r = j * RING, s = S[j], u = s / L, ue = Math.min(u, 1 - u)
        const taper = j === 0 || j === n - 1 ? 0 : ue < 0.15 ? 0.2 + 0.8 * smooth(0, 0.15, ue) : 1
        let bulge = 0
        for (let q = 0; q < 6; q++) {
          const born = rp[q * 2 + 1]
          if (born < 0) continue
          const age = now - born, A = 0.3 * 2 ** (-age / 0.1), run = (8 * w * age) / beatS
          bulge += A * (Math.exp(-(((s - rp[q * 2] - run) / (0.5 * w)) ** 2)) + Math.exp(-(((s - rp[q * 2] + run) / (0.5 * w)) ** 2)))
        }
        const ang = TAU * twist * hand * (u - 0.5)
        const tx = T[o], ty = T[o + 1], tz = T[o + 2], rx = R[o], ry = R[o + 1], rz = R[o + 2]
        const bx = ty * rz - tz * ry, by = tz * rx - tx * rz, bz = tx * ry - ty * rx // t × r
        const ca = Math.cos(ang), sa = Math.sin(ang)
        const ax = ca * rx + sa * bx, ay = ca * ry + sa * by, azz = ca * rz + sa * bz // the wide axis a
        const hw = (wf / 2) * taper * (1 + bulge), ht = (hw / 2.4) * (1 + 0.3 * sub)
        const band = 6 * loopA * Math.exp(-(((s - sL) / (1.5 * w)) ** 2)), slit = gash * Math.exp(-(((s - snapS) / (0.8 * w)) ** 2))
        rings[r] = P[o]; rings[r + 1] = P[o + 1]; rings[r + 2] = P[o + 2]; rings[r + 3] = hw
        rings[r + 4] = ax; rings[r + 5] = ay; rings[r + 6] = azz; rings[r + 7] = s * sc
        rings[r + 8] = ty * azz - tz * ay; rings[r + 9] = tz * ax - tx * azz; rings[r + 10] = tx * ay - ty * ax // c = t × a
        rings[r + 11] = heat; rings[r + 12] = ht; rings[r + 13] = bulge / 0.3; rings[r + 14] = band; rings[r + 15] = slit
        nearD = Math.min(nearD, Math.hypot(eye[0] - P[o], eye[1] - P[o + 1], eye[2] - P[o + 2]) - hw)
      }
      // the snap's sparks (24–40 from the gash) and the hats' glints (8 ± 4 on crests facing the eye, 60 ms)
      if (snapNew) {
        const r = clamp(Math.round(snapS / ds), 0, n - 1) * RING, sg = side
        for (let q = 24 + Math.floor(rnd() * 17); q > 0; q--) spark(rings[r] + sg * rings[r + 8] * rings[r + 12], rings[r + 1] + sg * rings[r + 9] * rings[r + 12], rings[r + 2] + sg * rings[r + 10] * rings[r + 12], sg * rings[r + 8], sg * rings[r + 9], sg * rings[r + 10], wf, now)
      }
      if (hatNew) {
        nGl = 0
        for (let q = 4 + Math.floor(rnd() * 9); q > 0 && nGl < 16; q--) {
          const r = Math.floor((0.15 + 0.7 * rnd()) * n) * RING
          const sg = (eye[0] - rings[r]) * rings[r + 8] + (eye[1] - rings[r + 1]) * rings[r + 9] + (eye[2] - rings[r + 2]) * rings[r + 10] > 0 ? 1 : -1
          const xo = (rnd() - 0.5) * 1.2, g = nGl++ * 4
          for (let e = 0; e < 3; e++) gli[g + e] = rings[r + e] + sg * rings[r + 8 + e] * rings[r + 12] * 1.05 + xo * rings[r + 3] * rings[r + 4 + e]
          gli[g + 3] = now
        }
      }
      // the parts: sparks (+ one fork each), glints, the core glow on the coil axis (HDR 2 × W²)
      let np = 0
      const put = (x: number, y: number, zz: number, size: number, dx: number, dy: number, dz: number, kind: number, cr: number, cg: number, cb: number, I: number) => {
        if (np >= MAXP) return
        const o = np++ * PART
        parts[o] = x; parts[o + 1] = y; parts[o + 2] = zz; parts[o + 3] = size; parts[o + 4] = dx; parts[o + 5] = dy; parts[o + 6] = dz; parts[o + 7] = kind
        parts[o + 8] = cr; parts[o + 9] = cg; parts[o + 10] = cb; parts[o + 11] = I
      }
      let live = 0
      for (let q = 0; q < nSp; q++) {
        const o = q * 9, age = now - sp[o + 6], life = sp[o + 7]
        if (age >= life) continue
        if (live !== q) sp.copyWithin(live * 9, o, o + 9)
        const b = live++ * 9, t = age / life
        const x = sp[b] + sp[b + 3] * age, y = sp[b + 1] + sp[b + 4] * age - 0.6 * age * age, zz = sp[b + 2] + sp[b + 5] * age
        const cg = t < 0.5 ? 1 - 0.29 * (t / 0.5) : 0.71 - 0.36 * ((t - 0.5) / 0.5), cb = t < 0.5 ? 1 - 0.65 * (t / 0.5) : 0.35 - 0.23 * ((t - 0.5) / 0.5)
        const I = 6 * (1 - t), k1 = 0.045, f = sp[b + 8], cf = Math.cos(f), sf = Math.sin(f)
        put(x, y, zz, 0.006 * sc, sp[b + 3] * k1, sp[b + 4] * k1, sp[b + 5] * k1, 0, 1, cg, cb, I)
        put(x + sp[b + 3] * k1 * 0.5, y + sp[b + 4] * k1 * 0.5, zz + sp[b + 5] * k1 * 0.5, 0.004 * sc, (cf * sp[b + 3] - sf * sp[b + 4]) * k1 * 0.6, (sf * sp[b + 3] + cf * sp[b + 4]) * k1 * 0.6, sp[b + 5] * k1 * 0.6, 0, 1, cg, cb, I * 0.7)
      }
      nSp = live
      for (let q = 0; q < nGl; q++) {
        const age = now - gli[q * 4 + 3]
        if (age < 0.06) put(gli[q * 4], gli[q * 4 + 1], gli[q * 4 + 2], 0.03 * sc, 0, 0, 0, 1, 1, 0.97, 0.92, 4 * (1 - age / 0.06))
      }
      const glow = 2 * Wg * Wg
      const axisP = [(Z[0] * z * 0.5 - cx) * sc, (Z[1] * z * 0.5 - cy) * sc, (Z[2] * z * 0.5 - cz) * sc]
      if (glow > 0.01) for (let q = 0; q < 10; q++) {
        const zz = ((q + 0.5) / 10 - 0.5) * z * sc
        put(axisP[0] + Z[0] * zz, axisP[1] + Z[1] * zz, axisP[2] + Z[2] * zz, Math.max(2.4 * wf, 0.08 * z * sc), 0, 0, 0, 2, 1, 0.54, 0.12, glow)
      }
      const shockAge = now - shockT
      st = {
        phase: whipOn ? 'release' : whips && Wg < WHIP_MIN ? 'groove' : 'coil', W: Wg, B, turns, twist, ripple: 0.07 * B * (1 + 0.5 * burst), ripplePhase: rip,
        spanFW: xmax > xmin ? (clamp(xmax, -i.aspect, i.aspect) - clamp(xmin, -i.aspect, i.aspect)) / (2 * i.aspect) : 0, speed,
        whips, pumps, rings: nRings, snaps, snapSide: side, glints: nGlints, flares, coverage: cov, fit: fitNow, heat, loop: whipOn && c < LOOP ? sL / L : -1, crack: p2 > 0 && p2 < 1 ? p2 : -1,
      }
      first = false
      return {
        rings: n, parts: np, vp, eye, cam: [...right, ...up, ...back], nearDist: Math.max(0.05, nearD), glow,
        shock: shockAge < 0.4 ? 1 - shockAge / 0.4 : 0, shockR: 0.6 * smooth(0, 0.3, shockAge), key: (1 + 0.3 * b4) * (1 + 0.8 * Wg) * (1 + 0.5 * flare),
        ripple: rip, rippleH: 0.07 * wf * B * (1 + 0.5 * burst), burst, w: wf, axisP, axisD: Z,
      }
    },
  }
}

/** Projects the rings (ndc, x × aspect) and returns the coverage: Σ segment length × projected width ÷ the frame
 *  (overlap ignored, so it over-counts: T9). `each` sees every ring in front of the eye; then X0 takes this frame's. */
function project(P: Float32Array, vp: Float32Array, n: number, aspect: number, X0: Float32Array, each: ((j: number, x: number, y: number) => void) | null, w: number) {
  let cov = 0, px = 0, py = 0
  for (let j = 0; j < n; j++) {
    const o = j * 3, cw = vp[3] * P[o] + vp[7] * P[o + 1] + vp[11] * P[o + 2] + vp[15]
    const x = ((vp[0] * P[o] + vp[4] * P[o + 1] + vp[8] * P[o + 2] + vp[12]) / Math.max(cw, 1e-3)) * aspect
    const y = (vp[1] * P[o] + vp[5] * P[o + 1] + vp[9] * P[o + 2] + vp[13]) / Math.max(cw, 1e-3)
    if (j && cw > 0.05) cov += Math.hypot(x - px, y - py) * ((w * FOCAL) / cw)
    if (each && cw > 0.05) each(j, x, y)
    if (each) { X0[j * 2] = x; X0[j * 2 + 1] = y }
    px = x; py = y
  }
  return cov / (4 * aspect)
}
/** Unit tangents by central differences (one-sided at the ends). */
function tangents(P: Float32Array, T: Float32Array, n: number) {
  for (let j = 0; j < n; j++) {
    const a = Math.max(0, j - 1) * 3, b = Math.min(n - 1, j + 1) * 3
    const x = P[b] - P[a], y = P[b + 1] - P[a + 1], z = P[b + 2] - P[a + 2], l = Math.hypot(x, y, z) || 1
    T[j * 3] = x / l; T[j * 3 + 1] = y / l; T[j * 3 + 2] = z / l
  }
}
/** Rotation-minimising frames by double reflection (Wang et al. 2008, research §1.2; own code), anchored mid-body.
 *  ponytail: no helix counter-twist (design §2.0); the twist rides on the RMF. Add it if the tape-wound read fails. */
function rmf(P: Float32Array, T: Float32Array, R: Float32Array, n: number) {
  const m = n >> 1, o = m * 3
  let rx = -T[o + 1], ry = T[o], rz = 0 // ẑ × t, or x̂ × t where t ∥ ẑ
  if (Math.hypot(rx, ry) < 0.3) { rx = 0; ry = -T[o + 2]; rz = T[o + 1] }
  const l = Math.hypot(rx, ry, rz) || 1
  R[o] = rx / l; R[o + 1] = ry / l; R[o + 2] = rz / l
  for (const dir of [1, -1]) for (let j = m; j + dir >= 0 && j + dir < n; j += dir) {
    const a = j * 3, b = (j + dir) * 3
    const v1x = P[b] - P[a], v1y = P[b + 1] - P[a + 1], v1z = P[b + 2] - P[a + 2], c1 = v1x * v1x + v1y * v1y + v1z * v1z || 1e-12
    const kr = (2 / c1) * (v1x * R[a] + v1y * R[a + 1] + v1z * R[a + 2]), kt = (2 / c1) * (v1x * T[a] + v1y * T[a + 1] + v1z * T[a + 2])
    const rLx = R[a] - kr * v1x, rLy = R[a + 1] - kr * v1y, rLz = R[a + 2] - kr * v1z
    const v2x = T[b] - (T[a] - kt * v1x), v2y = T[b + 1] - (T[a + 1] - kt * v1y), v2z = T[b + 2] - (T[a + 2] - kt * v1z), c2 = v2x * v2x + v2y * v2y + v2z * v2z
    const k2 = c2 > 1e-12 ? (2 / c2) * (v2x * rLx + v2y * rLy + v2z * rLz) : 0
    let x = rLx - k2 * v2x, y = rLy - k2 * v2y, z = rLz - k2 * v2z
    const d = x * T[b] + y * T[b + 1] + z * T[b + 2] // re-orthogonalise (float32 drift)
    x -= d * T[b]; y -= d * T[b + 1]; z -= d * T[b + 2]
    const ll = Math.hypot(x, y, z) || 1
    R[b] = x / ll; R[b + 1] = y / ll; R[b + 2] = z / ll
  }
}

// ---- the GL: Variant A (a mesh + depth in the native's own HDR target) ----
/** The spike's A/B switches (T-P2 / T-P3; the bench flips them live): `msaa` ≥ 2 = mode M at that sample count, 0 = mode
 *  S; the depth (+ MSAA colour) invalidates; the split's body / parts arms; a ripple-rate override (T-S5). */
export const SERPENT_GL = { msaa: 0, invalidate: true, body: true, parts: true, perBeat: 0 } // perBeat 0 = the §R5 rule
const SIDES = 24
const f4 = (x: number) => x.toFixed(4)
const GLOW_K = 0.9 // knob ⚠️: the 1/8 glow's gain in the composite

// P1: one instance = the segment ring i → i + 1, a strip of SIDES + 1 quads around the lens (even vertices: ring i + 1,
// so the strip winds CCW outward and BACK culling keeps the outside).
const BODY_VS = (cent: string) => `#version 300 es
layout(location = 0) in vec4 aP0;
layout(location = 1) in vec4 aA0;
layout(location = 2) in vec4 aC0;
layout(location = 3) in vec4 aX0;
layout(location = 4) in vec4 aP1;
layout(location = 5) in vec4 aA1;
layout(location = 6) in vec4 aC1;
layout(location = 7) in vec4 aX1;
uniform mat4 uVP;
${cent} out vec3 vPos;
${cent} out vec3 vN;
out vec3 vA;
out vec3 vT;
out vec2 vX;
out float vS;
out vec4 vH;
void main() {
  bool hd = (gl_VertexID & 1) == 0;
  vec4 P = hd ? aP1 : aP0, A = hd ? aA1 : aA0, C = hd ? aC1 : aC0, X = hd ? aX1 : aX0;
  float th = 6.2831853 * float(gl_VertexID >> 1) / ${SIDES}.0, ct = cos(th), st = sin(th);
  vec3 p = P.xyz + A.xyz * (P.w * ct) + C.xyz * (X.x * st);
  vPos = p;
  vN = A.xyz * (ct * max(X.x, 1e-5)) + C.xyz * (st * max(P.w, 1e-5)); // the ellipse normal ∝ (cos θ ÷ hw, sin θ ÷ ht)
  vA = A.xyz;
  vT = cross(A.xyz, C.xyz);
  vX = vec2(ct, st);
  vS = A.w;
  vH = vec4(C.w, X.yzw);
  gl_Position = uVP * vec4(p, 1.0);
}`
// P1 FS: 3 flutes a face + the travelling saw ripple as an analytic bump; the dark studio in view space (a key strip,
// two rim strips, the fog bounce; no sky, no horizon) × Schlick; a Fresnel rim; polished crests over satin cavities;
// the core glow's back-light; the gills (heat ramp) + the tempering fringe; the whip band / snap gash; the depth fog.
const BODY_FS = (cent: string) => `#version 300 es
precision highp float;
${cent} in vec3 vPos;
${cent} in vec3 vN;
in vec3 vA;
in vec3 vT;
in vec2 vX;
in float vS;
in vec4 vH;
uniform vec3 uEye, uCamR, uCamU, uCamB, uAxisP, uAxisD;
uniform float uNear, uW, uRip, uRipH, uBurst, uKey, uGlow, uModeS;
out vec4 outColor;
const vec3 TINT = vec3(0.784, 0.824, 0.863), KEY = vec3(0.918, 0.957, 1.0), RIM = vec3(0.290, 0.235, 1.0);
const vec3 FOGC = vec3(0.055, 0.102, 0.180), FLOOR = vec3(0.027, 0.039, 0.063), CORE = vec3(1.0, 0.541, 0.122);
float band(float x, float c, float h, float s) { return smoothstep(h + s, h - s, abs(x - c)); }
vec3 studio(vec3 r, float s) {
  float el = asin(clamp(r.y, -1.0, 1.0)), az = atan(r.x, r.z);
  vec3 c = 6.0 * KEY * band(el, 0.84, 0.052, s) * band(az, 0.0, 0.61, 2.0 * s); // the key: 48° up, 70° × 6°, HDR 6
  c += 3.0 * RIM * (band(az, 2.27, 0.07, s) + band(az, -2.27, 0.07, s)) * band(el, 0.0, 0.52, 2.0 * s); // rims ±130°, 8° × 60°
  c += 0.45 * KEY * smoothstep(-0.2, 1.0, r.y) + 0.35 * KEY * smoothstep(0.6, -0.4, r.z) * smoothstep(-0.3, 0.5, r.y); // soft top fill + back panel: the steel's form (no edge, no horizon)
  return c + 1.6 * FOGC * smoothstep(0.1, -0.7, r.y); // the fog bounce from below
}
vec3 ramp(float h) { // #5A0A06 → #B3130B → #FF3B12 → #FF8A1F → #FFD98A → #FFF6E0
  vec3 c = mix(vec3(0.353, 0.039, 0.024), vec3(0.702, 0.075, 0.043), smoothstep(0.0, 0.2, h));
  c = mix(c, vec3(1.0, 0.231, 0.071), smoothstep(0.2, 0.4, h));
  c = mix(c, vec3(1.0, 0.541, 0.122), smoothstep(0.4, 0.6, h));
  c = mix(c, vec3(1.0, 0.851, 0.541), smoothstep(0.6, 0.8, h));
  return mix(c, vec3(1.0, 0.965, 0.878), smoothstep(0.8, 1.0, h));
}
void main() {
  vec3 T = normalize(vT), A = normalize(vA), V = normalize(uEye - vPos), N = normalize(vN);
  float x = clamp(vX.x, -1.0, 1.0), edge = 1.0 - smoothstep(0.72, 0.92, abs(x));
  float groove = (0.5 + 0.5 * cos(12.566371 * x)) * edge; // 3 flutes a face (x = 0, ±.5), depth 6 % of t
  N = normalize(N - 0.314 * sin(12.566371 * x) * edge * A);
  float q = vS / (0.6 * uW) + uRip, f = fract(q), fw = fwidth(q), e = max(0.03, 0.5 * fw); // the ripple, 0.6 w a length
  float fade = 1.0 - smoothstep(0.1, 0.17, fw); // below 6 px a length it fades out
  float steep = smoothstep(0.85 - e, 0.85 + e, f) * (1.0 - smoothstep(1.0 - e, 1.0, f));
  float hR = f < 0.85 ? f / 0.85 : (1.0 - f) / 0.15; // 0 trough … 1 crest; the steep side 15 %
  N = normalize(N - mix(1.0 / 0.85, -1.0 / 0.15, steep) * uRipH / (0.6 * uW) * fade * T);
  float rip = clamp(uRipH / (0.105 * uW), 0.0, 1.0);
  float cav = clamp(0.75 * groove + 0.8 * (1.0 - hR) * rip * fade, 0.0, 1.0);
  float NdV = max(dot(N, V), 0.0);
  vec3 r = reflect(-V, N), rv = vec3(dot(r, uCamR), dot(r, uCamU), dot(r, uCamB));
  float s = 0.015 + 0.22 * cav + min(0.12, 0.5 * length(fwidth(rv))); // polished crests, satin cavities; no crawl
  vec3 F = TINT + (1.0 - TINT) * pow(1.0 - NdV, 5.0);
  vec3 col = studio(rv, s) * F * uKey * (1.0 + 2.0 * vH.y) * (1.0 - 0.65 * cav);
  col += 1.2 * RIM * pow(1.0 - NdV, 5.0) * (1.0 - 0.5 * cav); // the Fresnel rim
  vec3 d = vPos - uAxisP;
  d -= dot(d, uAxisD) * uAxisD;
  float da = length(d);
  col += uGlow * CORE * max(0.0, dot(N, -d / max(da, 1e-4))) * exp(-pow(da / (3.0 * uW), 2.0)); // the core's back-light
  float gw = mix(0.08, 0.2, uBurst), H = vH.x, on = edge * fade * step(0.02, rip);
  float gill = smoothstep(0.0, 0.03, f) * smoothstep(gw, gw - 0.03, f) * on; // the slit in each trough
  col += gill * H * ramp(H) * (0.4 + 1.2 * H * H) * (1.0 + uBurst);
  float fr = smoothstep(gw - 0.03, gw, f) * smoothstep(gw + 0.12, gw + 0.05, f) * on * H; // the tempering fringe
  col += fr * 0.35 * mix(vec3(0.416, 0.169, 0.851), vec3(0.247, 0.627, 1.0), clamp((f - gw) / 0.12, 0.0, 1.0));
  col += vH.z * vec3(1.0, 0.95, 0.85) + vH.w * exp(-pow(x / 0.16, 2.0)) * vec3(1.0, 0.9, 0.7); // the whip band (the section), the snap gash (a slit)
  col = max(col, FLOOR);
  float dist = length(uEye - vPos), tr = exp(-0.6931 * (dist - uNear) / uNear); // ≤ 25 % at 3× the nearest distance
  outColor = vec4(col * tr + FOGC * (1.0 - tr), uModeS > 0.5 ? clamp(uNear / dist, 0.002, 1.0) : 1.0);
}`
// P2: sparks (streaks), glints (4-ray stars), the core glow (soft discs): camera-facing quads, depth-tested, additive.
const PART_VS = `#version 300 es
layout(location = 0) in vec4 aP;
layout(location = 1) in vec4 aD;
layout(location = 2) in vec4 aC;
uniform mat4 uVP;
uniform vec2 uRes;
out vec2 vQ;
flat out vec4 vC;
flat out vec2 vK;
void main() {
  float t = float(gl_VertexID & 1), sd = float(gl_VertexID >> 1) * 2.0 - 1.0;
  vec4 c0 = uVP * vec4(aP.xyz, 1.0), c1 = uVP * vec4(aP.xyz + aD.xyz, 1.0);
  vC = aC;
  vK = vec2(aD.w, 0.0);
  vQ = vec2(0.0);
  if (c0.w < 0.05 || c1.w < 0.05) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec2 hr = 0.5 * uRes, s0 = c0.xy / c0.w * hr, s1 = c1.xy / c1.w * hr;
  float rad = max(1.0, aP.w * ${FOCAL.toFixed(6)} / c0.w * hr.y);
  vec2 dd = s1 - s0;
  float L = length(dd);
  vec2 dir = L > 0.5 ? dd / L : vec2(1.0, 0.0), nrm = vec2(-dir.y, dir.x);
  vec2 p = (t < 0.5 ? s0 - dir * rad : s1 + dir * rad) + nrm * sd * rad;
  vQ = vec2(t < 0.5 ? -1.0 : L / rad + 1.0, sd);
  vK.y = L / rad;
  gl_Position = vec4(p / hr, t < 0.5 ? c0.z / c0.w : c1.z / c1.w, 1.0);
}`
const PART_FS = `#version 300 es
precision highp float;
in vec2 vQ;
flat in vec4 vC;
flat in vec2 vK;
out vec4 outColor;
void main() {
  float a;
  if (vK.x < 0.5) { // a spark: a soft streak with round caps, its head brighter
    float al = clamp(vQ.x, 0.0, vK.y), dx = vQ.x - al;
    a = exp(-3.0 * (dx * dx + vQ.y * vQ.y)) * (0.35 + 0.65 * al / max(vK.y, 1e-3));
  } else if (vK.x < 1.5) { // a glint: a 4-ray star
    float r = length(vQ);
    a = exp(-30.0 * r * r) + 0.5 * (exp(-40.0 * abs(vQ.y)) + exp(-40.0 * abs(vQ.x))) * max(0.0, 1.0 - r);
  } else { // the core glow
    float r2 = dot(vQ, vQ);
    a = exp(-3.0 * r2) * max(0.0, 1.0 - r2);
  }
  outColor = vec4(vC.rgb * vC.a * a, 0.0);
}`
// P3: the glow source at 1/4 res: a 4×4 box (4 bilinear taps), thresholded at HDR 1.
const DOWN = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uRes, uTx;
out vec4 outColor;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 c = 0.25 * (texture(uSrc, uv - uTx).rgb + texture(uSrc, uv + uTx).rgb + texture(uSrc, uv + vec2(uTx.x, -uTx.y)).rgb + texture(uSrc, uv + vec2(-uTx.x, uTx.y)).rgb);
  outColor = vec4(max(c - 1.0, 0.0), 1.0);
}`
// P5: the fog void (#04060A top → #0A1220 bottom, a soft #12233F band at mid height) + the fog shock ring, the body over
// it (premultiplied by coverage), + the glow; the max-channel tone map (lasers); mode S: the depth-edge smooth (S-10:
// 4 taps after the tone map where a's relative step > .08); ±1 LSB TPDF dither.
const COMPOSITE = `#version 300 es
precision highp float;
${HASH}
uniform sampler2D uSrc;
uniform sampler2D uGlow;
uniform vec2 uRes;
uniform float uShock, uShockR, uModeS;
uniform uint uFrame;
out vec4 outColor;
vec3 shade(vec2 uv) {
  vec4 b = textureLod(uSrc, uv, 0.0);
  float cov = uModeS > 0.5 ? step(1e-3, b.a) : clamp(b.a, 0.0, 1.0);
  vec3 bg = mix(vec3(0.039, 0.071, 0.125), vec3(0.016, 0.024, 0.039), uv.y) + vec3(0.071, 0.137, 0.247) * 0.6 * exp(-pow((uv.y - 0.5) / 0.16, 2.0));
  float rr = length((uv - 0.5) * uRes) / uRes.x;
  bg += uShock * vec3(0.15, 0.21, 0.33) * exp(-pow((rr - uShockR) / 0.018, 2.0));
  vec3 E = bg * (1.0 - cov) + b.rgb + ${f4(GLOW_K)} * texture(uGlow, uv).rgb;
  float m = max(max(E.r, E.g), max(E.b, 1e-4));
  return mix(E / m, vec3(1.0), 0.9 * smoothstep(1.0, 2.0, m)) * (1.0 - exp(-m));
}
void main() {
  vec2 uv = gl_FragCoord.xy / uRes, d = 1.0 / uRes;
  vec3 o = shade(uv);
  if (uModeS > 0.5) {
    float a0 = textureLod(uSrc, uv, 0.0).a, a1 = textureLod(uSrc, uv + vec2(d.x, 0.0), 0.0).a, a2 = textureLod(uSrc, uv - vec2(d.x, 0.0), 0.0).a;
    float a3 = textureLod(uSrc, uv + vec2(0.0, d.y), 0.0).a, a4 = textureLod(uSrc, uv - vec2(0.0, d.y), 0.0).a;
    float hi = max(max(max(a1, a2), max(a3, a4)), a0), lo = min(min(min(a1, a2), min(a3, a4)), a0);
    if (hi > 0.0 && hi - lo > 0.08 * hi) o = (2.0 * o + shade(uv + vec2(d.x, 0.0)) + shade(uv - vec2(d.x, 0.0)) + shade(uv + vec2(0.0, d.y)) + shade(uv - vec2(0.0, d.y))) / 6.0;
  }
  uint h = uint(gl_FragCoord.x) * 1973u + uint(gl_FragCoord.y) * 9277u + uFrame * 26699u;
  outColor = vec4(o + (hash(h) + hash(h ^ 0x9e3779b9u) - 1.0) / 255.0, 1.0);
}`

const ev = { amount: 1, attack: 0, release: 0, min: 0, max: 1 } as const
/** Bindings: design §2.0 table (the body rows on `band8`, `presence` = `reeseLevel`, the drums as floats with release 0
 *  so the rig sees every rise; `flare` is the one flash-class input). */
export const serpent: NativeDef = {
  id: 'native/serpent', name: 'Neuro Serpent', kind: 'generator', category: 'geometry', tags: ['serpent', 'chrome', '3d'], credit: 'VeeJay Wizard',
  inputs: [
    { name: 'bass', type: 'float', min: 0, max: 1, default: 0 }, // B: twist, ripple, flex + thrash, scale
    { name: 'presence', type: 'float', min: 0, max: 1, default: 0 }, // reeseLevel: the absence wind (flag OFF)
    { name: 'reese', type: 'float', min: 0, max: 1, default: 0 }, // the burst = the larger of reese, wobble
    { name: 'wobble', type: 'float', min: 0, max: 1, default: 0 },
    { name: 'sub', type: 'float', min: 0, max: 1, default: 0 }, // the thickness
    { name: 'kick', type: 'float', min: 0, max: 1, default: 0 }, // a rise: the ring pair
    { name: 'snare', type: 'float', min: 0, max: 1, default: 0 }, // a rise: the snap
    { name: 'hats', type: 'float', min: 0, max: 1, default: 0 }, // a rise: the glints + the shiver
    { name: 'build', type: 'float', min: 0, max: 1, default: 0 }, // the floor of W
    { name: 'drop', type: 'float', min: 0, max: 1, default: 0 }, // a rise: the whip (ungated)
    { name: 'flare', type: 'float', min: 0, max: 1, default: 0 }, // ⚡ the after-flare: the fog shock + key gain
    { name: 'orbit', type: 'float', min: 0, max: 1, default: 1 }, // 1 = the auto drift; 0 = yaw / pitch
    { name: 'yaw', type: 'float', min: -180, max: 180, default: 30 }, // deg
    { name: 'pitch', type: 'float', min: -30, max: 30, default: 12 }, // deg
    { name: 'zoom', type: 'float', min: 1, max: 3, default: 1 },
  ],
  flash: ['flare'],
  bind: {
    bass: { source: 'band8', amount: 1, attack: 0.06, release: 0.3, min: 0, max: 1 },
    presence: { source: 'reeseLevel', ...ev },
    reese: { source: 'reese', amount: 1, attack: 0.03, release: 0.2, min: 0, max: 1 },
    wobble: { source: 'wobble', amount: 1, attack: 0.03, release: 0.2, min: 0, max: 1 },
    sub: { source: 'sub', amount: 1, attack: 0.04, release: 0.4, min: 0, max: 1 },
    kick: { source: 'kick', ...ev },
    snare: { source: 'snare', ...ev },
    hats: { source: 'hats', ...ev },
    build: { source: 'build', ...ev },
    drop: { source: 'drop', amount: 1, attack: 0, release: 0.4, min: 0, max: 1 },
    flare: { source: 'drop', amount: 1, attack: 0, release: 0.4, min: 0, max: 1 },
  },
  create(gl, size) {
    const n = size ? 64 : RINGS
    const rig = createSerpent(3, n)
    const ringBuf = new Float32Array(n * RING), partBuf = new Float32Array(MAXP * PART)
    const half = !!gl.getExtension('EXT_color_buffer_float'), fmt = half ? gl.RGBA16F : gl.RGBA8
    const samples = Array.from((gl.getInternalformatParameter(gl.RENDERBUFFER, fmt, gl.SAMPLES) as Int32Array | null) ?? []) // T-SH1
    const progM = program(BODY_VS('centroid'), BODY_FS('centroid')), progS = program(BODY_VS(''), BODY_FS('')), progP = program(PART_VS, PART_FS)
    const down = fullscreenProgram(DOWN), blur = fullscreenProgram(BLUR), composite = fullscreenProgram(COMPOSITE)
    const colour: AttachmentOptions = half ? { internalFormat: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT } : { format: gl.RGBA, type: gl.UNSIGNED_BYTE }
    const attS: AttachmentOptions[] = [colour, { format: gl.DEPTH_COMPONENT24, samples: 1 }] // mode S: its colour texture + depth
    const fbS = createFramebufferInfo(gl, attS, 1, 1)
    let fbM: FramebufferInfo | null = null, attM: AttachmentOptions[] = [], mS = 0
    const tR = renderTarget(true), tD = renderTarget(true), tH = renderTarget(true), tV = renderTarget(true) // tR: mode M's resolve
    /** N-4: resize only when the size (or the sample count) changes. */
    const fit = (fb: FramebufferInfo, att: AttachmentOptions[], w: number, h: number) => { if (fb.width !== w || fb.height !== h) resizeFramebufferInfo(gl, fb, att, w, h) }
    const vbo = gl.createBuffer(), pbo = gl.createBuffer(), vao = gl.createVertexArray(), pao = gl.createVertexArray()
    gl.bindVertexArray(vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
    gl.bufferData(gl.ARRAY_BUFFER, ringBuf.byteLength, gl.DYNAMIC_DRAW)
    for (let k = 0; k < 8; k++) { // ring i at locations 0–3, ring i + 1 at 4–7: one buffer, a one-ring offset
      gl.enableVertexAttribArray(k)
      gl.vertexAttribPointer(k, 4, gl.FLOAT, false, RING * 4, (k & 3) * 16 + (k >> 2) * RING * 4)
      gl.vertexAttribDivisor(k, 1)
    }
    gl.bindVertexArray(pao)
    gl.bindBuffer(gl.ARRAY_BUFFER, pbo)
    gl.bufferData(gl.ARRAY_BUFFER, partBuf.byteLength, gl.DYNAMIC_DRAW)
    for (let k = 0; k < 3; k++) {
      gl.enableVertexAttribArray(k)
      gl.vertexAttribPointer(k, 4, gl.FLOAT, false, PART * 4, k * 16)
      gl.vertexAttribDivisor(k, 1)
    }
    gl.bindVertexArray(null)
    let frame = 0
    const native = {
      serpentState: () => rig.state(), // the harness's CPU truth (the laserState() precedent)
      serpentInfo: () => ({ samples, half, msaa: !size && SERPENT_GL.msaa > 1 && samples.some((x) => x >= SERPENT_GL.msaa) ? SERPENT_GL.msaa : 0 }),
      draw(f: Parameters<ReturnType<NativeDef['create']>['draw']>[0], v: Readonly<Record<string, Value>>) {
        frame = (frame + 1) >>> 0
        const r = rig.step({ v, beat: f.sync.beat, bpm: f.sync.bpm, now: performance.now() / 1000, dt: f.dt, aspect: f.width / f.height, perBeat: SERPENT_GL.perBeat }, ringBuf, partBuf)
        const out = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null
        const W = f.width, H = f.height, M = native.serpentInfo().msaa
        if (M) {
          if (M !== mS) { // a new sample count: (re)build the MSAA pair
            attM = [{ format: fmt, samples: M }, { format: gl.DEPTH_COMPONENT24, samples: M }]
            if (fbM) resizeFramebufferInfo(gl, fbM, attM, W, H)
            else fbM = createFramebufferInfo(gl, attM, W, H)
            mS = M
          }
          fit(fbM!, attM, W, H)
          bindFramebufferInfo(gl, fbM)
        } else {
          fit(fbS, attS, W, H)
          bindFramebufferInfo(gl, fbS)
        }
        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
        gl.enable(gl.DEPTH_TEST)
        gl.depthFunc(gl.LESS)
        if (SERPENT_GL.body) {
          const prog = M ? progM : progS
          gl.enable(gl.CULL_FACE)
          gl.cullFace(gl.BACK)
          gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, ringBuf)
          gl.bindVertexArray(vao)
          gl.useProgram(prog.program)
          setUniforms(prog, {
            uVP: r.vp, uEye: r.eye, uCamR: r.cam.slice(0, 3), uCamU: r.cam.slice(3, 6), uCamB: r.cam.slice(6, 9), uAxisP: r.axisP, uAxisD: r.axisD,
            uNear: r.nearDist, uW: r.w, uRip: r.ripple, uRipH: r.rippleH, uBurst: r.burst, uKey: r.key, uGlow: r.glow, uModeS: M ? 0 : 1,
          })
          gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 2 * (SIDES + 1), r.rings - 1)
          gl.disable(gl.CULL_FACE)
        }
        if (SERPENT_GL.parts && r.parts) {
          gl.depthMask(false)
          gl.enable(gl.BLEND)
          gl.blendFunc(gl.ONE, gl.ONE) // additive light; the FS writes a = 0, so the coverage stays
          gl.bindBuffer(gl.ARRAY_BUFFER, pbo)
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, partBuf, 0, r.parts * PART)
          gl.bindVertexArray(pao)
          gl.useProgram(progP.program)
          setUniforms(progP, { uVP: r.vp, uRes: [W, H] })
          gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, r.parts)
          gl.disable(gl.BLEND)
          gl.blendFunc(gl.ONE, gl.ZERO)
          gl.depthMask(true)
        }
        gl.bindVertexArray(null)
        gl.disable(gl.DEPTH_TEST) // the GL defaults again (risk 4): depth test, cull, depth mask, blend
        if (SERPENT_GL.invalidate) gl.invalidateFramebuffer(gl.FRAMEBUFFER, [gl.DEPTH_ATTACHMENT]) // S-7
        let src = fbS.attachments[0] as WebGLTexture
        if (M) {
          tR.fit(W, H)
          gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fbM!.framebuffer)
          gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, tR.framebuffer)
          gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST)
          if (SERPENT_GL.invalidate) gl.invalidateFramebuffer(gl.READ_FRAMEBUFFER, [gl.COLOR_ATTACHMENT0])
          src = tR.attachments[0]
        }
        const qw = Math.max(1, Math.round(W / 4)), qh = Math.max(1, Math.round(H / 4)), ew = Math.max(1, Math.round(W / 8)), eh = Math.max(1, Math.round(H / 8))
        tD.fit(qw, qh)
        bindFramebufferInfo(gl, tD)
        down({ uSrc: src, uRes: [qw, qh], uTx: [1 / W, 1 / H] })
        tH.fit(ew, eh)
        tV.fit(ew, eh)
        bindFramebufferInfo(gl, tH)
        blur({ uSrc: tD.attachments[0], uRes: [ew, eh], uStep: [1 / ew, 0], uLod: 0 })
        bindFramebufferInfo(gl, tV)
        blur({ uSrc: tH.attachments[0], uRes: [ew, eh], uStep: [0, 1 / eh], uLod: 0 })
        gl.bindFramebuffer(gl.FRAMEBUFFER, out)
        gl.viewport(0, 0, W, H)
        composite({ uSrc: src, uGlow: tV.attachments[0], uRes: [W, H], uShock: r.shock, uShockR: r.shockR, uModeS: M ? 0 : 1, uFrame: frame })
      },
      dispose() {
        for (const fb of [fbS, fbM]) if (fb) {
          gl.deleteFramebuffer(fb.framebuffer)
          for (const a of fb.attachments) if (a instanceof WebGLTexture) gl.deleteTexture(a); else gl.deleteRenderbuffer(a)
        }
        for (const t of [tR, tD, tH, tV]) {
          gl.deleteFramebuffer(t.framebuffer)
          gl.deleteTexture(t.attachments[0])
        }
        gl.deleteBuffer(vbo)
        gl.deleteBuffer(pbo)
        gl.deleteVertexArray(vao)
        gl.deleteVertexArray(pao)
      },
    }
    return native
  },
}
