// Amen Shatter (W4 S3 spike; design_amen_shatter.md Variant A + the rev-2 core rules K1–K5, M1–M4, E1–E6, A-4…A-11,
// the lead rulings, N-1 (move guard) and N-2; creative_amen_shatter.md §2–§4): a glowing ring picture (the plate) cut
// on a fixed 16 × 10 lattice. Every drum hit relocates whole slices by whole cells (wrapped, so mean luma is kept);
// one snare per bar slams the picture whole. A pure CPU core (the 16th clock, the bar-phase histogram, the predicted
// kick shove, the slice table, the roll, the drop recipe) writes two 16 × 10 tables per frame; one full-screen pass
// evaluates the plate at the relocated uv, adds HDR seams and shadows, tone-maps and dithers. Own code, credit
// VeeJay Wizard; HASH (lowbias32) through points.ts.

export const COLS = 16, ROWS = 10, CELLS = COLS * ROWS
// Knobs ⚠️ (spike values; design §2.0 + rev 2).
export const PHASE_MARGIN = 0.5 // G-2 (open, audio-dsp): barPhase's lead over the runner-up, on the 0–4 score
export const S3_SEED = 7 // the fixed S3 seed (design decision 6): disc centre (.41, .43) of the frame
export const RISE = 0.05 // A-7: a hit rise = a frame-to-frame increase ≥ this on kick, snare or hats
const TAU_SLOTS = 64 // the slot histograms' EMA: 4 bars
const LEAD = 16 // A-6: crossings a new candidate must lead before it is adopted
const BREAK = 1 / 8 // M4: beat residual against Δ audioNow · bpm / 60
const TEMPO = 0.02 // M4: a tempo change from the histogram's start
const QUIET_SLOTS = 32, SLAM_SLOTS = 16, WIDE_SLOTS = 128 // 2 bars, 1 bar, 8 bars
const HOLD_FREE = 0.35, ONE_SHOT = 0.17, ENTRY_MAX = 0.5, WIDE_FREE = 11 // s, wall clock
const REST = 0.25 // a seam's level while its slice stays displaced
const SHATTER_REL = 0.4, FRINGE = 0.05, HATS_FLARE = 0.5, HATS_REL = 0.06, SLAM_FADE = 0.15 // s
const PUSH = 0.06, SUB_PUSH = 0.04 // the hold's push-in, the sub's
const DEG = Math.PI / 180

/** The 16th slot of a beat position (dsp §5 a): the label of a hit. */
export const slotOf = (beat: number) => ((Math.round(4 * beat - 0.4) % 16) + 16) % 16
/** A-7: the one hit rule for kick, snare and hats. ponytail: the drums clamp at 1 twice (features.ts, bind.ts), so at
 *  kick/snare sens > 1.66 most 174-BPM 16ths give no rise (lead ruling A-7: recorded, T-V12r); an uncapped hit count
 *  is the Tier-2 path if the user raises sens. */
export const rose = (prev: number, x: number) => x - prev >= RISE
const mod = (a: number, n: number) => ((a % n) + n) % n
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))
/** Seeded choice in [0, 1): no clock, no Math.random (C14). */
function pick(...xs: number[]) {
  let h = 0x9e3779b9
  for (const x of xs) {
    h = Math.imul(h ^ (x | 0), 0x85ebca6b)
    h ^= h >>> 13
    h = Math.imul(h, 0xc2b2ae35)
    h ^= h >>> 16
  }
  return (h >>> 0) / 4294967296
}
/** The 6 band layouts of {2, 3} rows (creative §5), top to bottom. */
export const LAYOUTS: readonly (readonly number[])[] = [[2, 2, 3, 3], [2, 3, 2, 3], [2, 3, 3, 2], [3, 2, 2, 3], [3, 2, 3, 2], [3, 3, 2, 2]]
const bandOf = (layout: readonly number[], r: number) => { let b = 0; for (let acc = layout[0]; r >= acc; acc += layout[++b]); return b }

/** EMA slot histograms (tau 4 bars) of kick and snare rises; `hits` since the last reset. */
export interface Hist { k: Float32Array; s: Float32Array; hits: number }
/** rho = argmax over r in {0, 4, 8, 12} of K[r] + K[r+10] + S[r+4] + S[r+12] (each normalised to its max); null while
 *  hits < 6 or the best leads the runner-up by less than `margin` (A-6). Bar slot = (slot − rho) mod 16. */
export function barPhase(h: Hist, margin = PHASE_MARGIN): number | null {
  if (h.hits < 6) return null
  const mk = Math.max(...h.k) || 1, ms = Math.max(...h.s) || 1
  const sc = [0, 4, 8, 12].map((r) => (h.k[r] + h.k[(r + 10) % 16]) / mk + (h.s[(r + 4) % 16] + h.s[(r + 12) % 16]) / ms)
  const best = sc.indexOf(Math.max(...sc))
  return sc[best] - Math.max(...sc.filter((_, i) => i !== best)) >= margin ? 4 * best : null
}

/** out[c + 16r] = the plate cell shown at screen cell (c, r), rows top down: bands (whole columns, on the band of the
 *  source row), then strips (whole rows), then cell swaps (a cell with its right neighbour). Always a permutation. */
export function compose(bands: Int8Array, layout: readonly number[], strips: Int8Array, swaps: readonly number[], out: Uint8Array) {
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const rs = mod(r - strips[c], ROWS)
      out[c + COLS * r] = mod(c - bands[bandOf(layout, rs)], COLS) + COLS * rs
    }
  for (const i of swaps) {
    const j = i - (i % COLS) + ((i + 1) % COLS), t = out[i]
    out[i] = out[j]
    out[j] = t
  }
}

export interface ShatterIn {
  beat: number; bpm: number; conf: number; now: number; audioNow: number // f.sync raw; now = performance.now() / 1000 (A-4)
  kick: number; snare: number; hats: number // bound floats, release 0: the core finds the rises
  build: number; drop: number; bass: number; sub: number; seams: number
  burst: number; kickFlare: number; snareFlare: number // ⚡ after the flash gate
}
export type Cause = 'kick' | 'predicted' | 'retract' | 'snare' | 'hats' | 'ghost' | 'slam' | 'roll' | 'drop' | 'shatter' | 'quiet'
export interface Move { kind: 'shove' | 'crack' | 'tick' | 'ghost' | 'slam' | 'stamp' | 'home' | 'shatter'; cause: Cause; slot: number }
export interface PlateP { phase: number; sheen: number; bright: number; scale: number; pal: number } // pal 0 = C, 1 = A, 2 = B (a cross-fade between)
export interface ShatterState { // shatterState(): the harness's CPU truth
  frame: number; slot: number; rho: number | null; mode: 'free' | 'locked'; tier: 'quiet' | 'groove' | 'wide'; recipe: 'none' | 'hold' | 'shattered'
  src: Uint8Array; bands: Int8Array; strips: Int8Array // the slice table (160); 4 band column offsets; 16 strip row offsets
  stamps: Int32Array; moves: Move[] // per column the frame it was stamped on, −1 = live; this frame's moves with causes
  pending: number; plate: PlateP; hair: number; shock: number // the raw slot of the open predicted shove or −1; hairline opacity; s since T0 (−1: none)
  // spike extras (read-only truth for the tests and harnesses)
  hits: number; armed: number; crossed: boolean; roll: 0 | 8 | 16; swaps: number[]; layout: readonly number[]; phrase: number; centre: readonly [number, number]
}
export interface Shatter { step(x: ShatterIn, cells: Uint8Array, edges: Uint8Array, stampP: Float32Array): ShatterState }

/** A move that undoes itself: a ghost and a tick at the next crossing, a free one-shot after ONE_SHOT s. */
interface Temp { b: Int8Array; s: Int8Array; sw: number[]; untilU: number; untilT: number }
const T_BAND = 0, T_STRIP = 1, T_CELL = 2, T_STAMP = 3

export function createShatter(seed = S3_SEED): Shatter {
  const hist: Hist = { k: new Float32Array(16), s: new Float32Array(16), hits: 0 }
  const bands = new Int8Array(4), strips = new Int8Array(16), src = new Uint8Array(CELLS), stamps = new Int32Array(16).fill(-1)
  const armed = new Uint8Array(16).fill(1), zB = new Float64Array(4), zS = new Float64Array(16), sB = new Float64Array(8), sS = new Float64Array(32) // z: frame on top; smear: [delta, frame]
  const plate: PlateP = { phase: 0, sheen: 0, bright: 1, scale: 1, pal: 0 }
  const centre = [0.35 + 0.3 * pick(seed, 9), 0.4 + 0.2 * pick(seed, 10)] as const
  const sheenOff = (pick(seed, 11) - 0.5) * 20
  const moves: Move[] = []
  let temps: Temp[] = []
  const st: ShatterState = {
    frame: 0, slot: 0, rho: null, mode: 'free', tier: 'quiet', recipe: 'none', src, bands, strips, stamps, moves, pending: -1, plate, hair: 0, shock: -1,
    hits: 0, armed: 0, crossed: false, roll: 0, swaps: [], layout: LAYOUTS[0], phrase: 0, centre,
  }
  let last = 0, prevBeat = 0, prevAudio = 0, prevBpm = 0, bpm0 = 0, prevNow = 0
  let prevKick = 0, prevSnare = 0, prevHats = 0, prevDrop = 0 // N-1: drums start from their frame-1 value, drop from 0 (E1)
  let cand: number | null = null, lead = 0, paused = false, pendB = new Int8Array(4), pendSet = 0, nextSet = 0
  let visitKick = false, visitTick = false, entryX = 0, entryT = 0, sinceSlam = 0, snaresSince = 0, lastDrumU = 0, lastDrumT = 0
  let slams = 0, shatterU = -1, shatterF = -1, shatterT = -Infinity, b0 = 0, t0 = -Infinity, holdFree = false, holdEndU = 0, beat0 = 0
  let wideU = 0, wideT = 0, prevSnareU = -99, densU = -99, b8 = false, b16 = false, fringeT = -Infinity, fringeF = -1, hatsT = -Infinity
  let slamF = -1, slamT = -Infinity, freeN = 0, held = false // held: this frame's hits are guarded (N-1, judged once per frame)
  const lastMove = new Float64Array(4).fill(-1) // per seam type: the frame of its latest move
  const born = new Int32Array(2 * CELLS), key = new Int32Array(2 * CELLS).fill(-1), meta = new Uint8Array(2 * CELLS), fade = new Uint8Array(2 * CELLS)

  const layout = () => LAYOUTS[Math.floor(pick(seed, st.phrase, 1) * 6)]
  const barSlot = () => mod(mod(last, 16) - (st.rho ?? 0), 16)
  const dist = () => (st.tier === 'wide' ? 4 : 2)
  const norm = (h: Float32Array, i: number) => { const m = Math.max(...h); return m > 0 ? h[i] / m : 0 }
  const learnedK = (slot: number) => hist.hits >= 6 && norm(hist.k, slot) >= 0.5
  const learnedS = (slot: number) => hist.hits >= 6 && norm(hist.s, slot) >= 0.5
  const guard = (now: number) => st.recipe !== 'none' || (entryX < 2 && now - entryT < ENTRY_MAX) // N-1
  const displaced = () => bands.some((b) => b !== 0) || strips.some((s) => s !== 0) || temps.length > 0
  const move = (kind: Move['kind'], cause: Cause) => moves.push({ kind, cause, slot: barSlot() })
  const smearB = (b: number, d: number) => { sB[2 * b] = d; sB[2 * b + 1] = st.frame }
  const smearS = (c: number, d: number) => { sS[2 * c] = d; sS[2 * c + 1] = st.frame }

  function resetHist() {
    hist.k.fill(0)
    hist.s.fill(0)
    hist.hits = 0
    st.rho = cand = null
    lead = 0
    armed.fill(1)
    paused = false
  }
  function expire(all: boolean, now: number) {
    temps = temps.filter((t) => {
      if (!all && last < t.untilU && now < t.untilT) return true
      for (let b = 0; b < 4; b++) bands[b] -= t.b[b]
      for (let c = 0; c < 16; c++) strips[c] -= t.s[c]
      return false
    })
  }
  function home(cause: Cause, now: number, record = true) {
    const was = displaced()
    expire(true, now)
    bands.fill(0)
    strips.fill(0)
    st.pending = -1 // K5: a home closes pending with no move
    nextSet = 0
    if (was && record) move('home', cause)
  }
  function shove(cause: Cause) {
    expire(true, Infinity) // a held move first reverts the open ghosts
    const set = nextSet, dir = set ? -1 : 1, d = dist(), back = bands[set] !== 0 || bands[set + 2] !== 0 // toggle
    const delta = new Int8Array(4)
    for (const b of [set, set + 2]) {
      const to = back ? 0 : dir * d
      delta[b] = to - bands[b]
      bands[b] = to
      zB[b] = st.frame
      smearB(b, delta[b])
    }
    pendB = delta
    pendSet = set
    nextSet ^= 1
    lastMove[T_BAND] = st.frame
    move('shove', cause)
  }
  function retract() { // K3
    for (let b = 0; b < 4; b++) {
      bands[b] -= pendB[b]
      if (pendB[b]) smearB(b, -pendB[b])
    }
    nextSet = pendSet
    armed[st.pending] = 0
    paused = true
    st.pending = -1
    lastMove[T_BAND] = st.frame
    move('shove', 'retract')
  }
  function crack(head: number, now: number) {
    expire(true, Infinity)
    const wide = st.tier === 'wide', d = dist(), up = pick(seed, st.phrase, 2, barSlot()) < 0.5 ? -1 : 1
    const cols = Array.from({ length: wide ? 8 : 4 }, (_, k) => (head + (wide ? 2 * k : k)) % 16)
    const back = cols.some((c) => strips[c] !== 0)
    cols.forEach((c, k) => {
      const to = back ? 0 : (k % 2 ? -up : up) * d
      smearS(c, to - strips[c])
      strips[c] = to
      zS[c] = st.frame
    })
    lastMove[T_STRIP] = st.frame
    fringeT = now
    fringeF = st.frame
    move('crack', 'snare')
  }
  function temp(b: Int8Array, s: Int8Array, sw: number[], untilU: number, untilT: number) {
    for (let i = 0; i < 4; i++) bands[i] += b[i]
    for (let i = 0; i < 16; i++) strips[i] += s[i]
    temps.push({ b, s, sw, untilU, untilT })
  }
  function ghost(drum: 'kick' | 'snare', head: number) { // 1 band of the next set / 2 strips at the head, half the distance, 1 slot
    const h = dist() / 2, b = new Int8Array(4), s = new Int8Array(16)
    if (drum === 'kick') {
      b[nextSet] = clamp(bands[nextSet] + (nextSet ? -h : h), -dist(), dist()) - bands[nextSet]
      zB[nextSet] = st.frame
      smearB(nextSet, b[nextSet])
      lastMove[T_BAND] = st.frame
    } else {
      for (const [k, c] of [head, (head + 1) % 16].entries()) {
        s[c] = clamp(strips[c] + (k ? -h : h), -dist(), dist()) - strips[c]
        zS[c] = st.frame
        smearS(c, s[c])
      }
      lastMove[T_STRIP] = st.frame
    }
    temp(b, s, [], last + 1, Infinity)
    moves.push({ kind: 'ghost', cause: drum, slot: barSlot() })
  }
  function tick(col: number, untilU: number, untilT: number, now: number) {
    const r1 = Math.floor(pick(seed, st.phrase, 3, barSlot(), freeN) * ROWS), r2 = (r1 + 1 + Math.floor(pick(seed, st.phrase, 4, barSlot(), freeN) * (ROWS - 1))) % ROWS
    temp(new Int8Array(4), new Int8Array(16), [col + COLS * r1, col + COLS * r2], untilU, untilT)
    lastMove[T_CELL] = st.frame
    hatsT = now
    move('tick', 'hats')
  }
  function slam(cause: 'kick' | 'snare', now: number) {
    const was = st.recipe === 'shattered'
    home(cause, now, false)
    move('slam', cause)
    if (was) {
      st.recipe = 'none'
      st.tier = 'wide'
      wideU = last
      wideT = now
    }
    st.phrase = Math.floor(++slams / 4) // a phrase = 4 slams; the seed moves on while the frame is whole
    sinceSlam = snaresSince = 0
    slamF = st.frame
    slamT = fringeT = now
    fringeF = st.frame
  }
  function slamDue(drum: 'kick' | 'snare') {
    if (sinceSlam >= SLAM_SLOTS && st.mode === 'locked') return true
    if (drum === 'kick') return false
    if (st.rho !== null) {
      let ss = -1
      for (let b = 0; b < 16; b++) if (norm(hist.s, (b + st.rho) % 16) >= 0.5) ss = b // the bar's last learned snare slot
      if (ss >= 0) return barSlot() === ss
    }
    return snaresSince >= 2 // E5: the 2nd snare rise since the last slam, shatter or entry
  }
  function T0(x: ShatterIn) { // the drop recipe, step 1 (creative §3.3)
    home('drop', x.now)
    stamps.fill(-1)
    st.recipe = 'hold'
    st.tier = 'wide'
    plate.pal = 2 // palette B in one frame
    st.hair = 0
    t0 = x.now
    holdFree = st.mode === 'free' // E4: the mode at T0 fixes the hold end
    beat0 = x.beat
    holdEndU = 4 * Math.ceil((4 * x.beat + 3.1) / 4) // the first beat crossing ≥ .75 beat after T0
  }
  function shatter(x: ShatterIn) { // step 3: ± 4 columns, every other strip ± 4 rows, every seam at full HDR
    expire(true, x.now)
    for (let b = 0; b < 4; b++) {
      bands[b] = b % 2 ? -4 : 4
      zB[b] = st.frame
      smearB(b, bands[b])
    }
    for (let c = 0; c < 16; c++) {
      strips[c] = c % 2 ? 0 : (c % 4 ? -4 : 4)
      zS[c] = st.frame
      if (strips[c]) smearS(c, strips[c])
    }
    st.recipe = 'shattered'
    shatterU = last
    shatterF = st.frame
    shatterT = fringeT = x.now
    fringeF = st.frame
    b0 = x.burst
    sinceSlam = snaresSince = 0
    move('shatter', 'shatter')
  }

  function onCrossing(x: ShatterIn) {
    entryX++
    sinceSlam++
    for (let i = 0; i < 16; i++) {
      hist.k[i] *= Math.exp(-1 / TAU_SLOTS)
      hist.s[i] *= Math.exp(-1 / TAU_SLOTS)
    }
    const c = barPhase(hist) // A-6: adopt after LEAD crossings in the lead, on bar slot 0 (at once while rho is null)
    lead = c === cand ? lead + 1 : 1
    cand = c
    if (c !== st.rho && lead >= LEAD && (st.rho === null || barSlot() === 0)) st.rho = c
    expire(false, x.now)
    if (st.pending >= 0) retract()
    visitKick = visitTick = false
    const slot = mod(last, 16), head = barSlot()
    if (st.recipe === 'hold' && !holdFree && last >= holdEndU) shatter(x)
    else if (!guard(x.now)) {
      if (last % 4 === 0 && st.tier !== 'quiet' && last - lastDrumU >= QUIET_SLOTS) { // 2 bars, no kick, no snare
        home('quiet', x.now)
        st.tier = 'quiet'
      }
      if (st.tier !== 'quiet' && !paused && armed[slot] && learnedK(slot)) { // K1
        shove('predicted')
        st.pending = slot
      }
      if (st.roll && (st.roll === 16 || head % 2 === 0)) {
        stamps[head] = st.frame
        move('stamp', 'roll')
      } else stamps[head] = -1
    }
    if (st.tier === 'wide' && st.recipe === 'none' && last - wideU >= WIDE_SLOTS) st.tier = 'groove'
  }

  function onKick(x: ShatterIn) {
    if (st.mode === 'free') return freeShot('kick', x.now)
    if (held) {
      if (st.recipe === 'shattered' && slamDue('kick')) slam('kick', x.now)
      return
    }
    if (st.pending >= 0) { // K2: confirmed, absorbed
      st.pending = -1
      visitKick = true
      return
    }
    if (visitKick) return // K4: a second kick rise inside a visit that already fired
    visitKick = true
    paused = false // K4: any kick rise resumes prediction
    const slot = mod(last, 16)
    armed[slot] = 1
    if (slamDue('kick')) return slam('kick', x.now)
    if (hist.hits < 6 || learnedK(slot)) {
      if (st.tier === 'quiet') st.tier = 'groove'
      shove('kick')
    } else ghost('kick', barSlot())
  }
  function onSnare(x: ShatterIn) {
    if (st.mode === 'free') {
      if (st.recipe === 'shattered' && ++snaresSince >= 2) return slam('snare', x.now)
      return freeShot('snare', x.now)
    }
    snaresSince++
    if (last - prevSnareU <= 2) densU = last // signal 6: ≥ 2 snare rises within 3 slots
    prevSnareU = last
    if (held) {
      if (st.recipe === 'shattered' && last !== shatterU && slamDue('snare')) slam('snare', x.now) // never in the shatter's own visit
      return
    }
    if (slamDue('snare')) return slam('snare', x.now)
    if (hist.hits < 6 || learnedS(mod(last, 16))) {
      if (st.tier === 'quiet') st.tier = 'groove'
      crack(barSlot(), x.now)
    } else ghost('snare', barSlot())
  }
  function onHats(x: ShatterIn) {
    if (st.mode === 'free') return freeShot('hats', x.now)
    if (held || st.roll || visitTick) return // ticks pause during a roll; 1 tick per visit (C13)
    visitTick = true
    tick(barSlot(), last + 1, Infinity, x.now)
  }
  /** Free mode (creative §4): one-shots out in 1 frame, home after ONE_SHOT s; seeded columns; no slam, roll, prediction. */
  function freeShot(drum: 'kick' | 'snare' | 'hats', now: number) {
    if (held) return
    const col = Math.floor(pick(seed, st.phrase, 5, ++freeN) * COLS)
    if (drum === 'hats') return void (temps.some((t) => t.sw.length) || tick(col, Infinity, now + ONE_SHOT, now)) // 1 tick at a time (C13)
    const b = new Int8Array(4), s = new Int8Array(16)
    if (drum === 'kick') {
      for (const i of [nextSet, nextSet + 2]) {
        b[i] = clamp(nextSet ? -2 : 2, -2 - bands[i], 2 - bands[i])
        zB[i] = st.frame
        smearB(i, b[i])
      }
      nextSet ^= 1
      lastMove[T_BAND] = st.frame
    } else {
      for (let k = 0; k < 4; k++) {
        const c = (col + k) % 16
        s[c] = clamp(k % 2 ? -2 : 2, -2 - strips[c], 2 - strips[c])
        zS[c] = st.frame
        smearS(c, s[c])
      }
      lastMove[T_STRIP] = st.frame
    }
    temp(b, s, [], Infinity, now + ONE_SHOT)
    move(drum === 'kick' ? 'shove' : 'crack', drum)
  }

  function step(x: ShatterIn, cells: Uint8Array, edges: Uint8Array, stampP: Float32Array): ShatterState {
    st.frame++
    moves.length = 0
    const now = x.now, u = Math.round(4 * x.beat - 0.4), locked = x.bpm > 0
    const dBeat = st.frame > 1 && locked && prevBpm > 0 ? clamp(x.beat - prevBeat, 0, 0.5) : 0, dNow = st.frame > 1 ? clamp(now - prevNow, 0, 0.25) : 0
    // (1) clock and break (M1–M4, E2)
    st.crossed = false
    if (st.frame === 1) {
      last = lastDrumU = wideU = u
      bpm0 = x.bpm
      entryT = now
    } else {
      const brk = locked !== prevBpm > 0 || (locked && Math.abs(x.bpm - bpm0) > TEMPO * bpm0) || (locked && Math.abs(x.beat - prevBeat - ((x.audioNow - prevAudio) * x.bpm) / 60) > BREAK)
      if (brk) {
        if (st.pending >= 0) retract() // K5: a grid break retracts an open pending at once
        resetHist()
        bpm0 = x.bpm
        const d = u - last // re-anchor every slot count on the new clock (no crossing)
        lastDrumU += d
        prevSnareU += d
        densU += d
        wideU += d
        shatterU += d
        holdEndU += d
        last = u
      } else if (locked && u > last) {
        last = u
        st.crossed = true
      }
    }
    prevBeat = x.beat
    prevAudio = x.audioNow
    prevBpm = x.bpm
    prevNow = now
    // (2) mode: bpm = 0 returns any state to free; free → quiet on a grid
    const mode = locked ? 'locked' : 'free'
    if (mode !== st.mode && st.frame > 1 && mode === 'free') {
      home('quiet', now)
      st.recipe = 'none'
      st.tier = 'quiet'
    }
    st.mode = mode
    // (3) the drop rise (E1: from prev 0)
    const dropRise = prevDrop < 0.5 && x.drop >= 0.5
    prevDrop = x.drop
    if (dropRise && st.recipe !== 'hold') T0(x)
    // the roll rate (hysteresis .05; signal 6 density for 1 beat)
    b8 = x.build >= (b8 ? 0.1 : 0.15)
    b16 = x.build >= (b16 ? 0.35 : 0.4)
    st.roll = locked && st.tier !== 'quiet' && st.recipe === 'none' ? (b16 || last - densU <= 4 ? 16 : b8 ? 8 : 0) : 0
    // (4) the crossing; the free hold on the wall clock
    if (st.crossed) onCrossing(x)
    if (st.recipe === 'hold' && holdFree && now - t0 >= HOLD_FREE) shatter(x)
    if (st.tier === 'wide' && st.recipe === 'none' && !locked && now - wideT >= WIDE_FREE) st.tier = 'quiet'
    expire(false, now)
    // (5) hits: every one feeds the histogram (locked), the guard decides the moves
    const kr = rose(prevKick, x.kick) && st.frame > 1, sr = rose(prevSnare, x.snare) && st.frame > 1, hr = rose(prevHats, x.hats) && st.frame > 1
    prevKick = x.kick
    prevSnare = x.snare
    prevHats = x.hats
    const slot = mod(last, 16)
    if (locked && kr) hist.k[slot] += 1
    if (locked && sr) hist.s[slot] += 1
    if (locked) hist.hits += +kr + +sr
    if (kr || sr) {
      lastDrumU = last
      lastDrumT = now
    }
    held = guard(now)
    if (kr) onKick(x)
    if (sr) onSnare(x)
    if (hr) onHats(x)
    if (st.mode === 'free' && st.recipe === 'none' && now - lastDrumT > 3) st.tier = 'quiet' // free QUIET: 3 s without drums
    // (6) compose, the plate and the tables
    st.layout = layout()
    st.swaps = temps.flatMap((t) => t.sw)
    compose(bands, st.layout, strips, st.swaps, src)
    st.slot = mod(last, 16)
    st.armed = armed.reduce((n, a, i) => n + (a && learnedK(i) ? 1 : 0), 0)
    st.hits = hist.hits
    const fast = st.tier === 'wide' ? 2 : 1 // ring speed × 2 from T0 through WIDE (G-3 ⚠️)
    plate.phase += locked ? dBeat * (1 + x.build) * fast : dNow * 0.4
    plate.sheen = (-35 + 15 * Math.sin((2 * Math.PI * (locked ? x.beat : now * 0.4)) / 8) + sheenOff) * DEG
    plate.bright = 0.6 + 0.8 * clamp(x.bass, 0, 1)
    const hold = st.recipe === 'hold' ? clamp(holdFree ? (now - t0) / HOLD_FREE : (x.beat - beat0) / ((holdEndU - 0.1) / 4 - beat0), 0, 1) : 0
    plate.scale = (1 + SUB_PUSH * clamp(x.sub, 0, 1)) * (1 + PUSH * hold)
    const palTo = st.tier === 'wide' ? 2 : st.tier === 'groove' ? 1 : 0
    const dp = locked ? dBeat : dNow * 2 // a cross-fade over 1 beat (≈ .5 s free)
    plate.pal = clamp(palTo, plate.pal - dp, plate.pal + dp)
    const hairTo = locked && st.recipe !== 'hold' ? 0.08 * clamp(x.conf, 0, 1) + 0.17 * clamp(x.build, 0, 1) : 0
    st.hair += (hairTo - st.hair) * (1 - Math.exp(-dNow / (hairTo > st.hair ? 0.5 : 1)))
    if (st.recipe === 'hold') st.hair = 0
    st.shock = now - t0 < 2 ? now - t0 : -1
    for (let c = 0; c < 16; c++) if (stamps[c] === st.frame) stampP.set([plate.phase, plate.sheen, plate.bright, plate.pal], 4 * c)
    tables(x, cells, edges)
    return st
  }

  /** cells: source column, source row, smear (128 + 64 × cells along the axis), flags (1 stamped, 2 vertical smear).
   *  edges: right level, lower level, right meta, lower meta (meta: type 0 band / 1 strip / 2 cell / 3 stamp, 4 shadow
   *  onto the far side, 8 fringe). An edge is a seam when its two cells are not plate neighbours (the wrap line too). */
  function tables(x: ShatterIn, cells: Uint8Array, edges: Uint8Array) {
    const f = st.frame, now = x.now, gain = clamp(x.seams, 0, 1)
    const swapped = new Set(st.swaps.flatMap((i) => [i, i - (i % COLS) + ((i + 1) % COLS)]))
    const sm = (a: Float64Array, i: number) => { const k = f - a[2 * i + 1]; return k === 0 ? 0.3 * a[2 * i] : k === 1 ? 0.1 * a[2 * i] : 0 }
    const z = (c: number, r: number) => { // the later move on top (creative §2.3); a stamp covers its column
      if (stamps[c] >= 0) return Infinity
      const b = bandOf(st.layout, mod(r - strips[c], ROWS))
      return Math.max(strips[c] ? zS[c] : -1, bands[b] ? zB[b] : -1, swapped.has(c + COLS * r) ? f : -1)
    }
    const flare = [x.kickFlare, x.snareFlare, Math.max(0, HATS_FLARE * (1 - (now - hatsT) / HATS_REL)), 0]
    const shat = b0 > 0 && f >= shatterF ? Math.exp(-(now - shatterT) / SHATTER_REL) : 0
    const ring = now - fringeT < FRINGE, slamFade = Math.exp(-(now - slamT) / SLAM_FADE) * Math.max(REST, x.snareFlare)
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const i = c + COLS * r, a = src[i], sb = sm(sB, bandOf(st.layout, mod(r - strips[c], ROWS))), ss = sm(sS, c)
        cells[4 * i] = a % COLS
        cells[4 * i + 1] = (a / COLS) | 0
        cells[4 * i + 2] = clamp(Math.round(128 + 64 * (Math.abs(ss) > Math.abs(sb) ? ss : sb)), 0, 255)
        cells[4 * i + 3] = (stamps[c] >= 0 ? 1 : 0) | (Math.abs(ss) > Math.abs(sb) ? 2 : 0)
        for (let e = 0; e < 2; e++) { // 0: right edge (c | c + 1), 1: lower edge (r | r + 1)
          const j = 2 * i + e
          let seam = false, type = T_BAND, shadow = false, b = 0
          if (e === 0 && c < COLS - 1) {
            const st0 = stamps[c] >= 0, st1 = stamps[c + 1] >= 0
            b = src[i + 1]
            seam = st0 || st1 || b !== a + 1 || a % COLS === COLS - 1
            type = st0 || st1 ? T_STAMP : swapped.has(i) || swapped.has(i + 1) ? T_CELL : strips[c] !== strips[c + 1] ? T_STRIP : T_BAND
            shadow = z(c, r) > z(c + 1, r)
          } else if (e === 1 && r < ROWS - 1 && stamps[c] < 0) {
            b = src[i + COLS]
            seam = b !== a + COLS
            type = swapped.has(i) || swapped.has(i + COLS) ? T_CELL : mod(r - strips[c], ROWS) === ROWS - 1 ? T_STRIP : T_BAND
            shadow = z(c, r) > z(c, r + 1)
          }
          const k = seam ? (a * CELLS + b) * 4 + type : -1
          if (slamF === f && key[j] >= 0 && !seam) fade[j] = 1 // a former seam flares once more and fades (slam)
          if (k !== key[j]) {
            born[j] = f
            key[j] = k
          }
          let level = 0, m = 0
          if (seam) {
            fade[j] = 0
            level = Math.max(REST, born[j] >= lastMove[type] ? flare[type] : 0, born[j] === shatterF ? shat : 0)
            m = type | (shadow ? 4 : 0) | (ring && born[j] >= fringeF ? 8 : 0)
            meta[j] = m
          } else if (fade[j]) {
            level = slamFade
            m = (meta[j] & 3) | (ring ? 8 : 0)
            if (slamFade < 0.02) fade[j] = 0
          }
          edges[4 * i + e] = clamp(Math.round(255 * gain * level), 0, 255)
          edges[4 * i + 2 + e] = m
        }
      }
  }
  return { step }
}
