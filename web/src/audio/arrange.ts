// Build, drop and heat (design C6): a pure per-frame heuristic over the song's shape. The low end gone for a while is a
// breakdown (`sparse`); its return is the drop. app.ts feeds update() once per frame (plan S5.3).
// Kicks are weak evidence here: a teaser kick or a stray low hit in a breakdown reads as a kick (drums.ts no longer reads
// the riser, room tone or snare roll as one: ruling 2026-11-05), so a drop always needs the low end back, never kicks alone.
// Ceiling (drop v2 (1), the kick-only path deleted): a kick-only techno drop never fires.
// Real tracks (ruling 2026-11-05 (b), drop v2 (7a)): until the first drop or the first sparse run ≥ `arm`, the music so far
// is the breakdown, since G is learned in a bass-less intro, so the intro never reads sparse. A track that opens on its
// groove fires only after a deep cut (`ref`: ≥ 2 s). Ceiling: a full-level bass tease with a kick fires early, and its
// refractory can swallow the real drop.
import { HOLD } from './features'

export interface ArrangeIn {
  low: number // sub + reese `held` (bands.ts): the sustained bass, kicks gated out. Any unit: only its ratios are used
  high: number // energy at ≥ 4 kHz (risers, rolls, hats). Any unit: only its log ratio is used
  total: number // broadband RMS of the frame (energy.ts `rms`); at or below `silence` = no music
  kick: boolean // a kick hit was drained this frame
  beat: number | null // sync.beat (continuous) while sync is confident
  cuts: boolean // a deep cut arms a drop: the active preset's `cuts` (presets.ts; off under Dubstep)
  now: number // s
}
export interface ArrangeOut {
  build: number // 0..1, the breakdown's tension
  drop: number // the last drop's confidence, decaying τ 1 s (a source)
  heat: number // build smoothed τ 0.5 s; 0 within 1 s of a drop
  sparse: boolean
  fired: number | null // a drop's confidence on the frame it fires, else null
  confirmed: number | null // that confidence again on the first frame `CONFIRM` s on, if low / G averaged ≥ `back` since: the autopilot cuts on it
}
export interface ArrangeOpts {
  groove: number // s: τ of the groove level G, an EMA of `low` outside sparse sections
  sparse: number // a 1 s EMA of `low` under this × G, with music, is sparse
  arm: number // s of sparse before a drop can fire
  ret: number // a drop: `low` back at ≥ this × `ref` (the quieter of the section's mean and `slow`)…
  back: number // …and ≥ this × G…
  sustain: number // …for this long (s: a lone kick's tail through held's gate lasts ≈ 30 ms), starting within…
  near: number // …this long of a kick (s: app.ts's `low` holds features.ts's HOLD past each kick, ≈ 0.203 s hop-rounded)
  refractory: number // s between drops
  minConf: number // a drop under this confidence is ignored: no fire, no refractory (re-checked each frame of its return)
  cut: number // a deep cut: `low` (smoothed τ CUT_TAU) under this × G…
  cutMin: number // …for this long (s, music frames) arms a drop as a full build, with `cuts` on and after `warmup`
  warmup: number // s of music before G is trusted
  silence: number // `total` at or below = no music (−60 dBFS RMS): a stopped deck is not a breakdown
}
// near: the hold plus 0.15 s for the frame clock and audioNow's jitter (S1.11: at exactly HOLD the drop was a coin flip).
// sparse .6 (drop v2 (5); was .5, .35): real breaks keep `low` ≈ .4–.6 G (Kanine 77–88 s, 140–154 s); with G's drift it acts
// as ≈ .52 G. refractory 20 (was 30): drops 23.1 s apart (Sub Focus). minConf .56: on real tracks the weak fires read
// .44–.53 (Rumble's build growls, the old kick-only path; Bicep's bass entry after its intro), and every real one ≥ .60
// cutMin 1.5 (drop v2 (2)): DnB drops come out of 2.6–2.7 s pre-drop cuts (Andy C 91.0, 157.2), too short to arm as a
// run, while in-groove dips last ≤ .85 s (the first false fire, Sub Focus 178.3, came at cutMin ≤ .4). cut .3 on `low`
// smoothed τ .1 s (D1, dsp_detector_2026-11-16; was raw `low` under .2): real pre-drop cuts sit at .1–.3 G and carry
// one-frame blips (Napes 248.5, Bad Co 132.4 / 176.5); 19-track replay +5 drops, +1 false, a plateau over τ .05–.2, cut
// .3–.35, cutMin 1.5–1.8. Not "drums running": `total` doesn't separate a cut from a stutter. Ceiling: a
// techno 1-bar fill (1.875 s) passes. Off under Dubstep, whose bass stops are its groove (Rumble's 108–110 s cut fires
// 110.1 and its refractory would swallow 117.0)
export const SILENT_RMS = 1e-3 // −60 dBFS: `silence`'s default; app.ts's pause floor too
const DEFAULTS: ArrangeOpts = {
  groove: 20, sparse: 0.6, arm: 6, ret: 4, back: 0.6, sustain: 0.1, near: HOLD + 0.15, refractory: 20, minConf: 0.56, warmup: 20, silence: SILENT_RMS,
  cut: 0.3, cutMin: 1.5,
}
// knobs (C6 defaults), s unless noted
const SLOW = 1 // τ of the sparse detector's EMA of `low`
const CUT_TAU = 0.1 // τ of the cut test's EMA of `low` (D1)
// D3′ (lead pick 2026-11-16): the autopilot cut waits this long past a fire and needs low / G averaged ≥ `back` over the
// wait, so a bass stab cuts nothing (19-track replay: false cuts 13 → 9). `fired`, so `drop`, stays instant. A failed wait
// waits again on the next kick-backed return within RETRY s of the fire: a drop that opens with a ≤ .15 s hit and then a
// bass gap still cuts (Monty 165.6, Place 2b 54.3: cut hits 31 → 33, no false cut added).
// ponytail: a bass return later than RETRY s after the fire loses its cut, and a stab chain within RETRY s cuts on a later
// stab (none on the 19-track replay); gate the re-wait on the return's ratio if that shows up
const CONFIRM = 0.5
const RETRY = 4
// an armed breakdown stays armed this long after sparse ends: a loud drop ends it before `sustain`, and a bass-carrying
// build can sit between the break and its drop (ruling: ≈ 7 s, from Rumble's profile; was 1). Ceiling: a drop that the
// refractory blocks fires as it ends if still in GRACE, up to 8 s late
const GRACE = 8
const RISER = [0.5, 4] as const // riser = log2 of the ratio of these EMAs of `high`
const FULL = 16 // sparse this long gives build's and confidence's full time share
const RELEASE = 1 // τ of build after sparse, and of the `drop` source
const HEAT = 0.5 // τ of heat
const COOL = 1 // heat reaches 0 this long after a drop
const RATIO = 16 // a return this many × the sparse mean gives full confidence (log scale)

const ema = (dt: number, tau: number) => 1 - Math.exp(-dt / tau)
const clamp = (x: number) => Math.min(1, Math.max(0, x))

/** A confident drop (≥ 0.6), once `confirmed`, cuts the scene — unless the user holds (LOCK or the panel open) (plan S5.3). */
export const shouldCut = (fired: number | null, hold: boolean) => fired !== null && fired >= 0.6 && !hold

export function createArrangement(opts?: Partial<ArrangeOpts>): { update(x: ArrangeIn): ArrangeOut } {
  const o = { ...DEFAULTS, ...opts }
  const out: ArrangeOut = { build: 0, drop: 0, heat: 0, sparse: false, fired: null, confirmed: null } // update() returns this object
  let last = NaN // previous `now`
  let music = 0 // s with `total` above silence
  let g = 0 // G
  let slow = 0
  let [cutLow, deep] = [0, 0] // `low` smoothed for the cut test; s of it under cut × G (music frames; silence neither counts nor resets it)
  let [hiFast, hiSlow] = [0, 0]
  let [dur, sum, peak] = [0, 0, 0] // the section (the last sparse run, or the intro): length, ∫low dt (sum / dur = its mean), build's peak
  let [run, runSum] = [0, 0] // the current (or last) sparse run: length, ∫low dt
  let intro = true // until the first drop or the first sparse run ≥ arm (7a)
  let armed = -Infinity // armed until this time
  let [kickAt, kickBeat] = [-Infinity, null as number | null]
  let [rise, riseKick] = [NaN, false] // when the current return started (NaN = none), and whether near a kick
  let [firedAt, conf, heatAt, warm] = [-Infinity, 0, 0, 0] // warm = build smoothed (heat away from a drop)
  let [cutUntil, waitAt, waitSum, waitN] = [-Infinity, 0, NaN, 0] // the last fire's cut: a wait may start until cutUntil; the running wait's start, Σ low / G, frames (NaN = none)

  return {
    update(x) {
      out.fired = out.confirmed = null
      const dt = Math.min(0.1, x.now - last) // ≤ 0.1: a hidden tab's gap doesn't count as a breakdown
      last = x.now
      if (!(dt > 0)) return out
      const isMusic = x.total > o.silence
      // `slow` follows music only, as G does: a stopped deck is no cut for `ref` (it would fire a drop on play from the intro)
      if (isMusic) [music, slow, cutLow] = [music + dt, slow + (x.low - slow) * ema(dt, SLOW), cutLow + (x.low - cutLow) * ema(dt, CUT_TAU)]
      if (isMusic) deep = cutLow < o.cut * g ? deep + dt : 0
      const sparse = isMusic && music >= o.warmup && slow < o.sparse * g
      if (isMusic && !sparse) g += ((x.low - g) * dt) / Math.min(o.groove, music) // a plain mean until `groove` s of music
      hiFast += (x.high - hiFast) * ema(dt, RISER[0])
      hiSlow += (x.high - hiSlow) * ema(dt, RISER[1])
      // drop v2 (2): a deep cut arms (a) as a full build (before the run below starts, so that run keeps the peak: 7b)
      if (x.cuts && music >= o.warmup && deep >= o.cutMin) [armed, peak] = [x.now + GRACE, 1]
      if (sparse) {
        // a new run resets the section (outside the intro), but (7b) one that starts while armed (a cut between the build
        // and its drop) keeps the build's peak, and (7a) the intro lives on through runs shorter than `arm`
        if (!out.sparse) [run, runSum, peak] = [0, 0, intro || x.now <= armed ? peak : 0]
        run += dt
        // a return's own frames (`slow` lags it past sparse) aren't the breakdown: in a short run (7b's cut) they would lift
        // its mean past low / ret before `sustain` (Bicep 176.5)
        if (Number.isNaN(rise)) runSum += x.low * dt
        if (run >= o.arm) [armed, intro] = [x.now + GRACE, false] // a short run doesn't refresh `armed`
        if (!intro) [dur, sum] = [run, runSum]
        const riser = hiSlow > 0 ? Math.log2(hiFast / hiSlow) : 0
        out.build = clamp(0.4 * Math.min(1, run / FULL) + 0.6 * riser) // the run, not the intro: its visuals don't change
        peak = Math.max(peak, out.build)
      } else out.build -= out.build * ema(dt, RELEASE)
      if (intro && isMusic) [dur, sum] = [dur + dt, sum + x.low * dt] // the breakdown; `sparse`, build, `armed` untouched

      if (x.kick) [kickAt, kickBeat] = [x.now, x.beat]
      const live = x.now <= armed && x.now - firedAt >= o.refractory
      // (3) the return is measured against the quieter of the section's mean and the last second: a pre-drop cut quieter
      // than its break counts, and on a return 4 × `slow` climbs ≈ .035 a frame through `sustain`, so a groove needs a
      // ≥ 2 s dip to .02 G to fire (measured; in-groove dips ≤ .85 s)
      const ref = Math.min(dur > 0 ? sum / dur : 0, slow)
      const above = x.low >= o.back * g
      // the low end back at ≥ ret × ref and ≥ back × G, for `sustain`, starting near a kick
      if (!above || x.low < o.ret * ref) rise = NaN
      else if (Number.isNaN(rise)) [rise, riseKick] = [x.now, x.now - kickAt <= o.near]
      else if (x.kick && x.now - rise <= o.near) riseKick = true
      // D2: the intro path has no build evidence, so its return needs a beat grid at its kick (Sandstorm 18.2: a bass entry)
      const hit = (live || (intro && dur >= o.arm && kickBeat !== null)) && riseKick && x.now - rise >= o.sustain

      if (hit) {
        const align = kickBeat === null ? 0.5 : 1 - 2 * Math.abs(kickBeat - Math.round(kickBeat)) // 1 on the beat
        const ratio = ref > 0 ? x.low / ref : RATIO
        const c = (Math.min(1, dur / FULL) + clamp(Math.log(ratio) / Math.log(RATIO)) + align + peak) / 4
        if (c >= o.minConf) {
          out.fired = conf = c
          // `armed` ends: its peak doesn't carry into a break that starts within GRACE (7b); `rise`: the refractory covers it
          ;[firedAt, heatAt, warm, out.build, intro, armed, cutUntil, waitSum] = [x.now, out.heat, 0, 0, false, -Infinity, x.now + RETRY, NaN]
          slow = Math.max(slow, g) // the drop ends the breakdown
        }
      }
      // a wait starts on a kick-backed return (the fire's own frame first) while the fire's cut is open
      if (Number.isNaN(waitSum) && x.now <= cutUntil && riseKick && x.now - rise >= o.sustain) [waitAt, waitSum, waitN] = [x.now, 0, 0]
      if (!Number.isNaN(waitSum)) {
        ;[waitSum, waitN] = [waitSum + x.low / g, waitN + 1] // from the wait's own first frame
        if (x.now - waitAt >= CONFIRM) {
          const ok = waitSum / waitN >= o.back
          ;[out.confirmed, waitSum, cutUntil] = [ok ? conf : null, NaN, ok ? -Infinity : cutUntil] // a cut closes it
        }
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
