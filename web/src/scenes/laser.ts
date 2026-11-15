// TD trace-beam as a CPU native (plan wave 3 S2.1 rework, CP2; design_laser_rework.md Variant A): per-frame
// pattern field → step-lookup into K bands → marching-squares trace → real-width additive ribbon geometry +
// ⅛-res tent haze. Mode 0 = the techno grid: a 4×3 mirror-symmetric emitter lattice of capsule "beams" whose
// pose ticks on the bar saw (beat-locked re-pose, not a glide) — the beams are traced isobars with a beam
// cross-section (thin bright core, wide faint skirt), NOT the per-pixel analytic fan the user rejected
// 2026-11-14 (own/laser-grid.fs keeps its header note). Light is neutral by construction (P7): every frame a
// fixed total light is distributed over the levels proportional to q·w·L (q = lit/dim share, w = the level's
// width, L = its traced length this frame), so the level chase, the pose ticks and the K ramp move the light
// without changing its amount; brightness on a hit only through the ⚡ inputs (flashGate ≤ 3/s).
// Look: TD laserCHOP ex2 + Trace SOP (research_donor_laser.md §1/§3: pattern → step-lookup "topographic lines"
// → trace; thresh/step = our band/cap knobs) and the laser-dome preset's beat-locked discrete re-pose
// (rewritten; nothing copied). No third-party code.
import { bindFramebufferInfo, createProgramInfo, setUniforms } from 'twgl.js'
import { fullscreenProgram, renderTarget } from '../gl/engine'
import type { NativeDef } from '../gl/scene'
import { COMPOSITE_FS } from './particles'

const TAU = 6.2831853

// Mode 0 emitter lattice: 4 columns × 3 rows in field space (x, y ∈ [0,1], y down). The mirror pair
// (c, 3−c) shares one pose id, so the field is mirror-symmetric about x = ½ (the strict techno geometry).
const COLS = 4
const ROWS = 3
const NEMIT = COLS * ROWS
const EX = [0.125, 0.375, 0.625, 0.875]
const EY = [0.16, 0.5, 0.84]
// Emitter constants, stride 11: [ex, ey, dirx, diry, len, R, I, minx, maxx, miny, maxy]. Doubles: a float32
// round of the mirror's ex is not the mirror of a float32 round of ex, and the symmetry test needs the exact pair.
const EMIT = new Float64Array(NEMIT * 11)

// One emitter's constants into EMIT at (r, c): position, beam direction (unit, mostly down), length, capsule
// reach R, intensity I, and the bbox for the grid's quick reject.
function setEmitter(r: number, c: number, ex: number, ey: number, dirx: number, diry: number, len: number, R: number, I: number): void {
  const o = (r * COLS + c) * 11
  EMIT[o] = ex; EMIT[o + 1] = ey; EMIT[o + 2] = dirx; EMIT[o + 3] = diry; EMIT[o + 4] = len; EMIT[o + 5] = R; EMIT[o + 6] = I
  EMIT[o + 7] = ex - (R + Math.abs(dirx) * len); EMIT[o + 8] = ex + (R + Math.abs(dirx) * len)
  EMIT[o + 9] = ey - (R + Math.abs(diry) * len); EMIT[o + 10] = ey + (R + Math.abs(diry) * len)
}

/** The pose's per-emitter terms (the pure core of laserField, precomputed once per frame). The mirror pair
 *  (c, 3−c) is stored as an EXACT reflection (ex → 1−ex, dirx → −dirx), so the field is mirror-symmetric
 *  about x = ½ to the last bit (the strict techno geometry, tested). `pose` = floor(phase·steps)/steps
 *  (already stepped by the caller; all terms are periodic in pose so pose 1 ≡ pose 0). */
function fillEmitters(t: number, pose: number, amp: number, scan: number): void {
  pose -= Math.floor(pose) // the pose is periodic: pose 1 ≡ pose 0 exactly (the bar saw's end is its start)
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS / 2; c++) {
      const id = r * 2 + c // the mirror pair's shared id 0..5
      const off = id / 6
      // The pose: one stepped term each for the intensity (3 cycles/bar), the lean (2) and the length (1),
      // per-emitter offsets — the picture re-poses beat-locked, and pose 1 wraps to pose 0.
      const I = 0.35 + 0.65 * (0.5 + 0.5 * Math.cos(TAU * (3 * pose + off)))
      const lean = 0.5 * Math.sin(TAU * (2 * pose + (id % 3) / 3))
      const lenF = 0.7 + 0.3 * Math.sin(TAU * (pose + off))
      // The wall weave (static per id) + the pose's lean + a slow wobble (the rest is alive).
      const ang = (id / 5 - 0.5) * 0.5 + 0.45 * lean + 0.06 * Math.sin(TAU * (0.09 * t + off * 2))
      // The lattice + the scan shear (top row one way, bottom the other = the wall scan) + the slow drift.
      const ex = EX[c] + 0.2 * scan * (EY[r] - 0.5) + 0.02 * Math.sin(TAU * (0.07 * t + off * 3))
      const ey = EY[r] + 0.015 * Math.cos(TAU * (0.05 * t + off))
      const dirx = Math.sin(ang), diry = Math.cos(ang)
      const len = 0.3 * lenF * (0.8 + 0.9 * amp) // the sub reaches the beams
      const R = 0.05 + 0.065 * amp
      setEmitter(r, c, ex, ey, dirx, diry, len, R, I)
      setEmitter(r, COLS - 1 - c, 1 - ex, ey, -dirx, diry, len, R, I) // the exact reflection
    }
}

/** The mirror-symmetric field texture: the rest wobble (always on: the rest is alive) and the scan's moiré
 *  shimmer — STANDING waves (the space and the time factor apart): a traveling cos(kx + ωt) would break the
 *  mirror about x = ½ (cos(kx + ωt) ≠ cos(−kx + ωt)), the standing cos(kx)·cos(ωt) does not. */
function interference(x: number, y: number, t: number, scan: number): number {
  let f = 0.035 * Math.cos(TAU * 3 * (x - 0.5)) * Math.cos(TAU * 0.07 * t) * Math.cos(TAU * (2.5 * y - 0.05 * t))
  if (scan > 0) f += 0.07 * scan * Math.cos(TAU * 5 * (x - 0.5)) * Math.cos(TAU * 0.11 * t)
  return f
}

/** The mode-0 field at (x, y): the sum of the lattice's capsule bumps + the interference. x, y ∈ [0,1].
 *  A beam's bump is (1 − d²/R²)³ about its capsule — the isobars ladder out from the centreline: the tight
 *  top bands are the bright thin core, the wide low bands the faint skirt (the beam cross-section). */
export function laserField(mode: number, x: number, y: number, t: number, pose: number, amp: number, scan: number): number {
  if (mode !== 0) return 0 // mode 1 (the storm): S2.2
  fillEmitters(t, pose, amp, scan)
  let f = interference(x, y, t, scan)
  for (let e = 0; e < NEMIT; e++) {
    const o = e * 11
    if (x < EMIT[o + 7] || x > EMIT[o + 8] || y < EMIT[o + 9] || y > EMIT[o + 10]) continue
    const px = x - EMIT[o], py = y - EMIT[o + 1]
    let tp = px * EMIT[o + 2] + py * EMIT[o + 3]
    if (tp < 0) tp = 0
    else if (tp > EMIT[o + 4]) tp = EMIT[o + 4]
    const qx = px - EMIT[o + 2] * tp, qy = py - EMIT[o + 3] * tp
    const d2 = qx * qx + qy * qy, R2 = EMIT[o + 5] * EMIT[o + 5]
    if (d2 < R2) { const s = 1 - d2 / R2; f += EMIT[o + 6] * s * s * s }
  }
  return f
}

// The marching-squares edge table: case bits a(TL)=8 b(TR)=4 c(BR)=2 d(BL)=1 (grid y down), edges
// TOP=0 RIGHT=1 BOTTOM=2 LEFT=3. The saddles (5: b,d high; 10: a,c high) route by the four corners' mean
// (mean ≥ t: the minority corners each wrap; else the S through the centre) — deterministic, tested.
const EDGES: readonly (readonly number[])[] = [
  [], [3, 2], [2, 1], [3, 1], [0, 1],
  [0, 3, 2, 1], [0, 2], [0, 3], [0, 3],
  [0, 2], [0, 1, 3, 2], [0, 1], [3, 1], [2, 1], [3, 2],
]
// Index: case 5 → saddle A (0,3,2,1), case 10 → saddle B (0,1,3,2); the mean decides.
const SADDLE_A = [0, 3, 2, 1]
const SADDLE_B = [0, 1, 3, 2]
const edgePoint = (i: number, j: number, e: number, t: number, a: number, b: number, c: number, d: number, out: Float32Array, p: number) => {
  switch (e) {
    case 0: out[p] = i + (t - a) / (b - a); out[p + 1] = j; break // top, between a and b
    case 1: out[p] = i + 1; out[p + 1] = j + (t - b) / (c - b); break // right, between b and c
    case 2: out[p] = i + (t - d) / (c - d); out[p + 1] = j + 1; break // bottom, between d and c
    default: out[p] = i; out[p + 1] = j + (t - a) / (d - a) // left, between a and d
  }
}

/** Single-pass marching squares over every band boundary of a w×h grid of step-lookup band indices
 *  (integers 0..K: the value b = the field sits above b−1 and below b more boundaries). Emits the
 *  contour segments of the thresholds 0.5, 1.5, … as [x0, y0, x1, y1, level] in normalized [0,1]²
 *  (level 0 = the outermost boundary, level K−1 the innermost core). `cap` respected: over budget → the
 *  shortest segments drop first (the TD Trace SOP `step`/`doresample` knob — "how many points you
 *  generate and the un-snoothness you can accept"), never a crash. */
export function traceBands(bands: Float32Array, w: number, h: number, cap: number): [number, number, number, number, number][] {
  const segs: number[] = []
  const ep = new Float32Array(8) // the four edge points (grid units, normalized on the push)
  const nx = 1 / (w - 1), ny = 1 / (h - 1)
  for (let j = 0; j < h - 1; j++) {
    const row = j * w
    for (let i = 0; i < w - 1; i++) {
      const a = bands[row + i], b = bands[row + i + 1], c = bands[row + w + i + 1], d = bands[row + w + i]
      const mn = Math.min(a, b, c, d), mx = Math.max(a, b, c, d)
      if (mn === mx) continue
      for (let L = mn; L < mx; L++) { // the active boundaries of this cell (t = L + ½)
        const t = L + 0.5
        const cs = (a >= t ? 8 : 0) | (b >= t ? 4 : 0) | (c >= t ? 2 : 0) | (d >= t ? 1 : 0)
        let table: readonly number[]
        if (cs === 5 || cs === 10) table = (a + b + c + d) / 4 >= t ? (cs === 5 ? SADDLE_A : SADDLE_B) : (cs === 5 ? SADDLE_B : SADDLE_A)
        else table = EDGES[cs]
        if (table.length < 2) continue
        // the edge points, only where that edge straddles t (either way round)
        if ((a < t) !== (b < t)) edgePoint(i, j, 0, t, a, b, c, d, ep, 0)
        if ((b < t) !== (c < t)) edgePoint(i, j, 1, t, a, b, c, d, ep, 2)
        if ((d < t) !== (c < t)) edgePoint(i, j, 2, t, a, b, c, d, ep, 4)
        if ((a < t) !== (d < t)) edgePoint(i, j, 3, t, a, b, c, d, ep, 6)
        ep[0] *= nx; ep[1] *= ny; ep[2] *= nx; ep[3] *= ny; ep[4] *= nx; ep[5] *= ny; ep[6] *= nx; ep[7] *= ny
        const n = table.length >> 1
        for (let k = 0; k < n; k++) {
          const e0 = table[2 * k], e1 = table[2 * k + 1]
          segs.push(ep[2 * e0], ep[2 * e0 + 1], ep[2 * e1], ep[2 * e1 + 1], L)
        }
      }
    }
  }
  let n = segs.length / 5
  if (n > cap) {
    // over budget: drop the shortest (the squared lengths, grid units).
    const lens = new Float32Array(n)
    for (let s = 0; s < n; s++) {
      const dx = segs[5 * s + 2] - segs[5 * s], dy = segs[5 * s + 3] - segs[5 * s + 1]
      lens[s] = dx * dx + dy * dy
    }
    const sorted = new Float32Array(lens)
    sorted.sort()
    const cut = sorted[cap - 1]
    const kept: number[] = []
    for (let s = 0; s < n && kept.length / 5 < cap; s++) if (lens[s] >= cut) kept.push(segs[5 * s], segs[5 * s + 1], segs[5 * s + 2], segs[5 * s + 3], segs[5 * s + 4])
    segs.length = 0
    segs.push(...kept)
  }
  const out: [number, number, number, number, number][] = new Array(n = segs.length / 5)
  for (let s = 0; s < n; s++) out[s] = [segs[5 * s], segs[5 * s + 1], segs[5 * s + 2], segs[5 * s + 3], segs[5 * s + 4]]
  return out
}

const GRID = 96 // knob: the field grid per frame on the main thread (the plan's lever, in order: 96 → 64 → K → cap)
/** The tile (2b S3.2, design S6): half the grid (the swarm's ×.1 precedent, grid-shaped). */
export const laserGrid = (size?: readonly [number, number]) => (size ? GRID / 2 : GRID)
const SEG_CAP = 8000 // knob: the trace budget (the TD `step` knob; the shortest drop first when over)
const VMAX = 1.15 // knob: the field peak the K bands span (step-lookup threshold lattice)
const CHASE_LIT = 3 // knob: the levels the chase lights — the SAME count on every step (P7)
const DIM = 0.2 // knob: an unlit level's share of the per-area light (the faint ghost rails)
const LIGHT = 1.1 // knob: the frame's total linear light at rest (the flatness is independent of it)
const W_CORE = 0.006 // knob: the ribbon's half-width, scene units (the core, at pop 1)
const W_SKIRT = 0.02 // the skirt (the outer levels widen: the beam cross-section)
const WIDTH_POP = 1.6 // ⚡ `width` (kick): the half-widths ×(1 + 1.6·width) — the beam pop (flash-gated)
const HIT_POP = 0.5 // ⚡ `hit` (kick): the total light ×(1 + 0.5·hit) (flash-gated)
const BURST_W = 1.6 // ⚡ `burst` (drop): full width — the half-widths ×(1 + 1.6·burst), all K levels, the widest pose, the chase stopped
const HAZE_GAIN = 1.2 // the ⅛-res tent's gain per unit of `haze`
const CHASE_SPEED = 2.2 // the chase's rotation, levels/s at dash 1 (the hats flutter it)

const VS = `#version 300 es
in vec2 aPos;
in vec2 aDir;
in float aLevel; // the boundary level 0..K−1 (0 = the outermost)
in float aSide;  // 0 / 1 across the width
uniform float uAspect;
uniform float uK;
uniform float uWCore, uWSkirt, uPop; // the base half-widths (scene units) and the ⚡ pop (× the width)
uniform float uLevelA[8];
out float vLevel; // 0 skirt → 1 core
out float vSide;
out float vA;
void main() {
  float c = uK > 1.0 ? aLevel / (uK - 1.0) : 1.0;
  vLevel = c;
  vSide = aSide;
  vA = uLevelA[int(aLevel + 0.5)];
  float w = mix(uWSkirt, uWCore, c) * uPop; // the core is thin, the skirt wide
  vec2 p = aPos + aDir * (aSide - 0.5) * 2.0 * w;
  gl_Position = vec4(p.x / uAspect, p.y, 0.0, 1.0);
}`
const FS = `#version 300 es
precision highp float;
uniform float uWhite; // the snare's green → white walk
uniform float uBurst; // ⚡ the drop's white core
in float vLevel;
in float vSide;
in float vA;
out vec4 outColor;
void main() {
  float u = abs(vSide - 0.5) * 2.0; // 0 the centreline → 1 the edge: one soft cross-section (no sub-pixel shimmer)
  float cs = exp(-5.0 * u * u);
  vec3 green = vec3(0.10, 1.00, 0.38);
  vec3 white = vec3(0.90, 1.00, 0.92);
  vec3 base = mix(green, white, uWhite);
  vec3 col = mix(base, vec3(1.0), 0.45 * vLevel + 0.5 * uBurst); // the core is whiter
  outColor = vec4(col * cs * vA, 1.0);
}`
// The ⅛-res 3×3 tent (the halo precedent, S3.5's budget lever): (1 2 1 / 2 4 2 / 1 2 1) / 16.
const TENT = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uRes;
out vec4 outColor;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes, px = 1.0 / uRes;
  vec3 c = 4.0 * texture(uSrc, uv).rgb
    + 2.0 * (texture(uSrc, uv + vec2(px.x, 0.0)).rgb + texture(uSrc, uv - vec2(px.x, 0.0)).rgb + texture(uSrc, uv + vec2(0.0, px.y)).rgb + texture(uSrc, uv - vec2(0.0, px.y)).rgb)
    + texture(uSrc, uv + px).rgb + texture(uSrc, uv - px).rgb + texture(uSrc, uv + vec2(px.x, -px.y)).rgb + texture(uSrc, uv + vec2(-px.x, px.y)).rgb;
  outColor = vec4(c / 16.0, 1.0);
}`
const HAZE_UP = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uRes;
uniform float uGain;
out vec4 outColor;
void main() { outColor = vec4(texture(uSrc, gl_FragCoord.xy / uRes).rgb * uGain, 1.0); }`

/** Bindings (row 6 of plan § Scenes; ⚠️ planner assumptions — the design §2 table, confirmed at the CP2
 *  demo). No bass-class default, so Auto-style moves `scan` (reese) to wobble under Dubstep. */
export const laser: NativeDef = {
  id: 'native/laser', name: 'Laser', kind: 'generator', category: 'geometry', tags: ['laser', 'trace'], credit: 'VeeJay Wizard',
  inputs: [
    { name: 'mode', type: 'long', values: [0, 1], labels: ['grid', 'storm'], default: 0 }, // S2.2 adds the storm field
    { name: 'K', type: 'float', min: 2, max: 8, default: 5 }, // the step-lookup's band count (build 3 → 6: the density ramp)
    { name: 'steps', type: 'long', values: [2, 3, 4, 5, 6, 7, 8], default: 4 }, // the poses per bar (the TD pattern_steps cycles)
    { name: 'phase', type: 'float', min: 0, max: 1, default: 0 }, // the bar saw: pose = floor(phase·steps)/steps
    { name: 'amp', type: 'float', min: 0, max: 1, default: 0 }, // the sub: the blobs' reach
    { name: 'scan', type: 'float', min: 0, max: 1, default: 0 }, // the reese: the moiré drift = the wall scan
    { name: 'dash', type: 'float', min: 0, max: 1, default: 0 }, // the hats: the light-neutral level chase
    { name: 'hue', type: 'float', min: 0, max: 1, default: 0 }, // green (0) ↔ white (0.25)
    { name: 'width', type: 'float', min: 0, max: 1, default: 0 }, // ⚡ the kick: the beam pop
    { name: 'haze', type: 'float', min: 0, max: 1, default: 0.5 }, // the ⅛-res tent's gain (internal, the S1.3 bloom ruling)
    { name: 'trail', type: 'float', min: 0, max: 1, default: 0 }, // S2.2 (the storm's streaks; the grid has no trail)
    { name: 'hit', type: 'float', min: 0, max: 1, default: 0 }, // ⚡ the kick: the light pop
    { name: 'burst', type: 'float', min: 0, max: 1, default: 0 }, // ⚡ the drop: full open
  ],
  flash: ['hit', 'width', 'burst'], // width [F] per row 6 / the step's behaviour ("flash-gated"); the contract's list named hit + burst only
  bind: {
    phase: { source: 'bar', shape: 'saw', amount: 1, attack: 0, release: 0, min: 0, max: 1 }, // the bar runs the poses: a tick per beat (4/bar at steps 4)
    K: { source: 'build', amount: 1, attack: 1, release: 0.3, min: 3, max: 6 }, // the build densifies the contours into the drop
    amp: { source: 'sub', amount: 1, attack: 0.05, release: 0.3, min: 0, max: 1 }, // the sub reaches the blobs
    scan: { source: 'reese', amount: 1, attack: 0.05, release: 0.4, min: 0, max: 1 }, // Auto-style's one: the wall scan
    dash: { source: 'hats', amount: 1, attack: 0, release: 0.06, min: 0, max: 1 }, // the hats flutter the level chase
    hue: { source: 'snare', amount: 1, attack: 0, release: 0.25, min: 0, max: 0.25 }, // a snare walks green → white
    width: { source: 'kick', amount: 1, attack: 0, release: 0.12, min: 0, max: 0.6 }, // ⚡ a kick pops the beams
    hit: { source: 'kick', amount: 1, attack: 0, release: 0.12, min: 0, max: 0.5 }, // ⚡ a kick lifts the light (row 6 omits it; the test line binds the ⚡ pair from 0)
    burst: { source: 'drop', amount: 1, attack: 0, release: 0.4, min: 0, max: 1 }, // ⚡ the drop full-opens: all K levels, the widest pose, the chase stopped
  },
  create(gl, size) {
    const G = laserGrid(size)
    const cap = size ? SEG_CAP / 2 : SEG_CAP
    const ribbon = createProgramInfo(gl, [VS, FS], { attribLocations: { aPos: 0, aDir: 1, aLevel: 2, aSide: 3 } })
    const tent = fullscreenProgram(TENT)
    const hazeUp = fullscreenProgram(HAZE_UP)
    const composite = fullscreenProgram(COMPOSITE_FS)
    const tA = renderTarget(true) // the beams (hdr: the overlaps add before the tone map)
    const tB = renderTarget(true) // the ⅛-res haze
    const field = new Float32Array(G * G) // the field → the bands (the step-lookup overwrites in place)
    const verts = new Float32Array(cap * 6 * 6) // de-indexed ribbon quads: 6 verts × 6 floats
    const lenL = new Float32Array(8) // the traced length per level (the light's bookkeeping)
    const uLevelA = new Float32Array(8)
    const cosX = new Float32Array(G), cosScanX = new Float32Array(G), cosY = new Float32Array(G)
    const vao = gl.createVertexArray()
    const buf = gl.createBuffer()
    gl.bindVertexArray(vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, verts.byteLength, gl.DYNAMIC_DRAW)
    for (const [loc, size2, off] of [[0, 2, 0], [1, 2, 8], [2, 1, 16], [3, 1, 20]] as const) {
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, size2, gl.FLOAT, false, 24, off)
    }
    gl.bindVertexArray(null)
    let chaseT = 0 // the chase's rotation (the state: the hats integrate it, a burst stops it)
    let state: { pose: number; K: number; M: number; o: number; segs: number; burst: number; width: number; dash: number } =
      { pose: 0, K: 5, M: CHASE_LIT, o: 0, segs: 0, burst: 0, width: 0, dash: 0 } // the laserState()'s CPU truth (per instance)
    return {
      laserState() { // the harness reads the pose / chase / trace's CPU truth (the plexus `nodes` precedent)
        return { pose: state.pose, K: state.K, M: state.M, o: state.o, chase: chaseT, segs: state.segs, burst: state.burst, width: state.width, dash: state.dash }
      },
      draw(f, v) {
        const dt = Math.min(f.dt, 0.05)
        const aspect = f.width / f.height
        const K = Math.min(8, Math.max(2, Math.round(v.K as number)))
        const steps = Math.min(8, Math.max(2, (v.steps as number) | 0))
        const amp = v.amp as number, scan = v.scan as number
        const burst = v.burst as number
        // The stepped pose (the TD pattern_steps): floor(phase·steps)/steps — it ticks, it does not glide.
        let pose = Math.floor((v.phase as number) * steps) / steps
        if (burst > 0) {
          // the widest step: the candidate that maximizes the mean beam length, toward which a burst mixes
          let best = 0, bw = -1
          for (let k = 0; k < steps; k++) {
            const p = k / steps
            let s = 0
            for (let id = 0; id < 6; id++) s += 0.7 + 0.3 * Math.sin(TAU * (p + id / 6))
            if (s > bw) { bw = s; best = p }
          }
          pose += (best - pose) * burst
        }
        const M = Math.min(CHASE_LIT, K)
        chaseT += (v.dash as number) * CHASE_SPEED * (1 - burst) * dt // the chase: the hats run it, a burst stops it
        const o = ((Math.floor(chaseT) % K) + K) % K
        // The field → the K bands: the emitters' constants once, the interference precomputed per row/column.
        fillEmitters(f.time, pose, amp, scan)
        const ig = 1 / (G - 1), Ki = K / VMAX, half = (G + 1) >> 1
        for (let j = 0; j < G; j++) {
          const y = j * ig
          cosY[j] = Math.cos(TAU * (2.5 * y - 0.05 * f.time))
        }
        const wT = Math.cos(TAU * 0.07 * f.time) // the standing waves' time factors (the x parts, per column)
        const sT = scan > 0 ? Math.cos(TAU * 0.11 * f.time) : 0
        for (let i = 0; i < G; i++) {
          const x = i * ig
          cosX[i] = Math.cos(TAU * 3 * (x - 0.5))
          cosScanX[i] = scan > 0 ? Math.cos(TAU * 5 * (x - 0.5)) : 0
        }
        for (let j = 0; j < G; j++) {
          const y = j * ig, row = j * G, cy = cosY[j]
          for (let i = 0; i < half; i++) {
            const x = i * ig
            let F = 0.035 * cosX[i] * cy * wT + 0.07 * scan * cosScanX[i] * sT
            for (let e = 0; e < NEMIT; e++) {
              const oo = e * 11
              if (x < EMIT[oo + 7] || x > EMIT[oo + 8] || y < EMIT[oo + 9] || y > EMIT[oo + 10]) continue
              const px = x - EMIT[oo], py = y - EMIT[oo + 1]
              let tp = px * EMIT[oo + 2] + py * EMIT[oo + 3]
              if (tp < 0) tp = 0
              else if (tp > EMIT[oo + 4]) tp = EMIT[oo + 4]
              const qx = px - EMIT[oo + 2] * tp, qy = py - EMIT[oo + 3] * tp
              const d2 = qx * qx + qy * qy, R2 = EMIT[oo + 5] * EMIT[oo + 5]
              if (d2 < R2) { const s = 1 - d2 / R2; F += EMIT[oo + 6] * s * s * s }
            }
            const band = Math.min(K, (F * Ki) | 0) // the step-lookup (a negative F floors to 0)
            field[row + i] = band
            field[row + G - 1 - i] = band // the mirror: the picture is symmetric to the last bit
          }
        }
        // The trace → the ribbon vertices (scene units, y up) + the traced length per level.
        const segs = traceBands(field, G, G, cap)
        lenL.fill(0, 0, K)
        let n = 0
        for (let s = 0; s < segs.length; s++) {
          const seg = segs[s]
          const level = seg[4]
          const x0 = (seg[0] - 0.5) * 2 * aspect, y0 = (0.5 - seg[1]) * 2
          const x1 = (seg[2] - 0.5) * 2 * aspect, y1 = (0.5 - seg[3]) * 2
          const dx = x1 - x0, dy = y1 - y0
          const dl = Math.sqrt(dx * dx + dy * dy)
          if (dl < 1e-5) continue
          const px = -dy / dl, py = dx / dl
          lenL[level] += dl
          const A = (n += 6) * 6 - 36
          // [A, A, B, B, A, B] × (x y px py level side): two triangles
          verts[A] = x0; verts[A + 1] = y0; verts[A + 2] = px; verts[A + 3] = py; verts[A + 4] = level; verts[A + 5] = 0
          verts[A + 6] = x1; verts[A + 7] = y1; verts[A + 8] = px; verts[A + 9] = py; verts[A + 10] = level; verts[A + 11] = 0
          verts[A + 12] = x1; verts[A + 13] = y1; verts[A + 14] = px; verts[A + 15] = py; verts[A + 16] = level; verts[A + 17] = 1
          verts[A + 18] = x0; verts[A + 19] = y0; verts[A + 20] = px; verts[A + 21] = py; verts[A + 22] = level; verts[A + 23] = 0
          verts[A + 24] = x0; verts[A + 25] = y0; verts[A + 26] = px; verts[A + 27] = py; verts[A + 28] = level; verts[A + 29] = 1
          verts[A + 30] = x1; verts[A + 31] = y1; verts[A + 32] = px; verts[A + 33] = py; verts[A + 34] = level; verts[A + 35] = 1
        }
        // The light (P7, by construction): a fixed total, distributed over the levels ∝ q/(w·L) — every lit
        // level's per-area light is LIGHT/S, so the chase's rotation, the pose's ticks and the K ramp move
        // the light without changing its amount (the total = LIGHT·hitPop·wPop, the ⚡ pair gated ≤ 3/s).
        const width = v.width as number
        const wPop = 1 + WIDTH_POP * width + BURST_W * burst
        const hitPop = 1 + HIT_POP * (v.hit as number)
        let S = 0
        for (let l = 0; l < K; l++) {
          const q = burst > 0 ? 1 : (((l - o) % K + K) % K < M ? 1 : DIM)
          const wl = W_CORE + (W_SKIRT - W_CORE) * (K > 1 ? l / (K - 1) : 0)
          S += q * wl * lenL[l]
        }
        for (let l = 0; l < K; l++) {
          const q = burst > 0 ? 1 : (((l - o) % K + K) % K < M ? 1 : DIM)
          uLevelA[l] = S > 1e-6 ? (LIGHT * hitPop * q) / S : 0
        }
        for (let l = K; l < 8; l++) uLevelA[l] = 0
        state = { pose, K, M, o, segs: n / 6, burst, width, dash: v.dash as number }
        const out = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null
        tA.fit(f.width, f.height)
        bindFramebufferInfo(gl, tA)
        gl.viewport(0, 0, f.width, f.height) // Conventions: before every geometry draw
        gl.clearColor(0, 0, 0, 1)
        gl.clear(gl.COLOR_BUFFER_BIT)
        gl.enable(gl.BLEND)
        gl.blendFunc(gl.ONE, gl.ONE) // additive, order-independent (no depth buffer this wave)
        gl.bindBuffer(gl.ARRAY_BUFFER, buf)
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, verts.subarray(0, n * 6))
        gl.bindVertexArray(vao)
        gl.useProgram(ribbon.program)
        setUniforms(ribbon, { uAspect: aspect, uK: K, uWCore: W_CORE, uWSkirt: W_SKIRT, uPop: wPop, uLevelA, uWhite: Math.min(1, (v.hue as number) / 0.25), uBurst: burst })
        gl.drawArrays(gl.TRIANGLES, 0, n)
        gl.bindVertexArray(null)
        // The haze: a ⅛-res 3×3 tent of the beam pass, added back (internal to the native: the S1.3 bloom
        // ruling — own/bloom as a def pass billed +3.3 ms over the gate).
        if ((v.haze as number) > 0) {
          tB.fit(Math.max(1, f.width >> 3), Math.max(1, f.height >> 3))
          bindFramebufferInfo(gl, tB)
          gl.disable(gl.BLEND)
          gl.viewport(0, 0, tB.width, tB.height)
          tent({ uSrc: tA.attachments[0], uRes: [tB.width, tB.height] })
          bindFramebufferInfo(gl, tA)
          gl.enable(gl.BLEND)
          gl.viewport(0, 0, f.width, f.height)
          hazeUp({ uSrc: tB.attachments[0], uRes: [f.width, f.height], uGain: HAZE_GAIN * (v.haze as number) })
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, out) // the engine's target (a raw framebuffer, as plexus)
        gl.disable(gl.BLEND)
        gl.viewport(0, 0, f.width, f.height)
        composite({ uSrc: tA.attachments[0], uRes: [f.width, f.height] })
      },
      dispose() {
        gl.deleteFramebuffer(tA.framebuffer)
        gl.deleteTexture(tA.attachments[0])
        gl.deleteFramebuffer(tB.framebuffer)
        gl.deleteTexture(tB.attachments[0])
        gl.deleteBuffer(buf)
        gl.deleteVertexArray(vao)
      },
    }
  },
}
