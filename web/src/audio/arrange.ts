// Build, drop and heat (design C6): a pure per-frame heuristic over the song's shape. The low end gone for a while is a
// breakdown (`sparse`); its return is the drop. app.ts feeds update() once per frame (plan S5.3).
// Kicks are weak evidence here: in a breakdown, drums.ts reads a riser, room tone or a snare roll as ~13 kicks a bar
// (plan S1.2), so a drop always needs the low end back, never kicks alone.
export interface ArrangeIn {
  low: number // sub + reese `held` (bands.ts): the sustained bass, kicks gated out. Any unit: only its ratios are used
  high: number // energy at ≥ 4 kHz (risers, rolls, hats). Any unit: only its log ratio is used
  total: number // broadband RMS of the frame (energy.ts `rms`); at or below `silence` = no music
  kick: boolean // a kick hit was drained this frame
  beat: number | null // sync.beat (continuous) while sync is confident
  now: number // s
}
export interface ArrangeOut {
  build: number // 0..1, the breakdown's tension
  drop: number // the last drop's confidence, decaying τ 1 s (a source)
  heat: number // build smoothed τ 0.5 s; 0 within 1 s of a drop
  sparse: boolean
  fired: number | null // a drop's confidence on the frame it fires, else null
}
export interface ArrangeOpts {
  groove: number // s: τ of the groove level G, an EMA of `low` outside sparse sections
  sparse: number // a 1 s EMA of `low` under this × G, with music, is sparse
  arm: number // s of sparse before a drop can fire
  ret: number // a drop: `low` back at ≥ this × its sparse mean…
  back: number // …and ≥ this × G…
  sustain: number // …for this long (s: a lone kick's tail through held's gate lasts ≈ 30 ms), starting within…
  near: number // …this long of a kick (s: held's gate releases ≈ 0.14 s after the kick)
  beats: number // or, for kick-only drops: two kicks at most this many beats apart, each lifting `low` through back × G
  refractory: number // s between drops
  warmup: number // s of music before G is trusted
  silence: number // `total` at or below = no music (−60 dBFS RMS): a stopped deck is not a breakdown
}
const DEFAULTS: ArrangeOpts = {
  groove: 20, sparse: 0.35, arm: 6, ret: 4, back: 0.6, sustain: 0.1, near: 0.2, beats: 1.2, refractory: 30, warmup: 20, silence: 1e-3,
}
// knobs (C6 defaults), s unless noted
const SLOW = 1 // τ of the sparse detector's EMA of `low`
const GRACE = 1 // an armed breakdown stays armed this long after sparse ends: a loud drop ends it before `sustain`
const RISER = [0.5, 4] as const // riser = log2 of the ratio of these EMAs of `high`
const FULL = 16 // sparse this long gives build's and confidence's full time share
const RELEASE = 1 // τ of build after sparse, and of the `drop` source
const HEAT = 0.5 // τ of heat
const COOL = 1 // heat reaches 0 this long after a drop
const RATIO = 16 // a return this many × the sparse mean gives full confidence (log scale)

const ema = (dt: number, tau: number) => 1 - Math.exp(-dt / tau)
const clamp = (x: number) => Math.min(1, Math.max(0, x))

export function createArrangement(opts?: Partial<ArrangeOpts>): { update(x: ArrangeIn): ArrangeOut } {
  const o = { ...DEFAULTS, ...opts }
  const out: ArrangeOut = { build: 0, drop: 0, heat: 0, sparse: false, fired: null } // update() returns this object
  let last = NaN // previous `now`
  let music = 0 // s with `total` above silence
  let g = 0 // G
  let slow = 0
  let [hiFast, hiSlow] = [0, 0]
  let [dur, sum, peak] = [0, 0, 0] // the sparse section: length, ∫low dt (sum / dur = its mean), build's peak
  let armed = -Infinity // armed until this time
  let [kickAt, kickBeat] = [-Infinity, null as number | null]
  let [rise, riseKick] = [NaN, false] // (a) when the current return started (NaN = none), and whether near a kick
  let [up, upBeat] = [false, null as number | null] // (b) low ≥ back × G last frame; beat of the last kick-backed rise
  let [firedAt, conf, heatAt, warm] = [-Infinity, 0, 0, 0] // warm = build smoothed (heat away from a drop)

  return {
    update(x) {
      out.fired = null
      const dt = Math.min(0.1, x.now - last) // ≤ 0.1: a hidden tab's gap doesn't count as a breakdown
      last = x.now
      if (!(dt > 0)) return out
      const isMusic = x.total > o.silence
      if (isMusic) music += dt
      slow += (x.low - slow) * ema(dt, SLOW)
      const sparse = isMusic && music >= o.warmup && slow < o.sparse * g
      if (isMusic && !sparse) g += ((x.low - g) * dt) / Math.min(o.groove, music) // a plain mean until `groove` s of music
      hiFast += (x.high - hiFast) * ema(dt, RISER[0])
      hiSlow += (x.high - hiSlow) * ema(dt, RISER[1])
      if (sparse) {
        if (!out.sparse) [dur, sum, peak] = [0, 0, 0]
        dur += dt
        sum += x.low * dt
        if (dur >= o.arm) armed = x.now + GRACE
        const riser = hiSlow > 0 ? Math.log2(hiFast / hiSlow) : 0
        out.build = clamp(0.4 * Math.min(1, dur / FULL) + 0.6 * riser)
        peak = Math.max(peak, out.build)
      } else out.build -= out.build * ema(dt, RELEASE)

      if (x.kick) [kickAt, kickBeat] = [x.now, x.beat]
      const live = x.now <= armed && x.now - firedAt >= o.refractory
      const mean = dur > 0 ? sum / dur : 0
      const above = x.low >= o.back * g
      // (a) the low end back at ≥ ret × its sparse mean and ≥ back × G, for `sustain`, starting near a kick
      if (!above || x.low < o.ret * mean) rise = NaN
      else if (Number.isNaN(rise)) [rise, riseKick] = [x.now, x.now - kickAt <= o.near]
      else if (x.kick && x.now - rise <= o.near) riseKick = true
      let hit = live && riseKick && x.now - rise >= o.sustain
      // (b) kick-only drops: a second kick-backed rise of `low` through back × G within `beats` of the first
      if (above && !up && x.now - kickAt <= o.near) {
        if (live && upBeat !== null && x.beat !== null && x.beat - upBeat <= o.beats) hit = true
        upBeat = x.beat
      }
      up = above

      if (hit) {
        const align = kickBeat === null ? 0.5 : 1 - 2 * Math.abs(kickBeat - Math.round(kickBeat)) // 1 on the beat
        const ratio = mean > 0 ? x.low / mean : RATIO
        conf = (Math.min(1, dur / FULL) + clamp(Math.log(ratio) / Math.log(RATIO)) + align + peak) / 4
        out.fired = conf
        ;[firedAt, heatAt, warm, out.build] = [x.now, out.heat, 0, 0] // `armed`, `rise`, `upBeat`: the refractory covers them
        slow = Math.max(slow, g) // the drop ends the breakdown
      }
      const since = x.now - firedAt
      out.drop = conf * Math.exp(-since / RELEASE)
      warm += (out.build - warm) * ema(dt, HEAT)
      out.heat = Math.max(warm, since < COOL ? heatAt * (1 - since / COOL) : 0) // a drop: a linear fall to 0 over COOL
      out.sparse = sparse
      return out
    },
  }
}
