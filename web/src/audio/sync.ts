// (c) controller, always ours (design S2, plan S5.2). Pure: holds the running beat grid, a PLL on the onsets keeps it on
// the kicks, source readings merge into it or, if they disagree confidently for relockBeats, replace it (hysteresis).
// Holds through breaks, takes the manual keys, and gives every frame a phase from the audio clock.
import type { Onset } from './onset'
import type { TempoReading, TempoSource } from './tempo'

export interface Sync {
  bpm: number // 0 = none
  beat: number // continuous: floor = beat index, fract = phase
  bar: number // continuous: (beat − downbeatOffset) / 4
  confidence: number // 0..1, smoothed; scenes multiply beat terms by it
}
export const ZERO_SYNC: Sync = { bpm: 0, beat: 0, bar: 0, confidence: 0 }
/** A scene's beat envelope: 1 on the beat, decaying to ~0 by the next, × confidence (unsure → energy-only, design S2). */
export const pulse = (s: Sync, k = 4) => (1 - (s.beat - Math.floor(s.beat))) ** k * s.confidence
export interface SyncControls { tap(t: number): void; double(): void; halve(): void; nudge(ms: number): void; downbeat(t: number): void }
export interface SyncOpts {
  lead: number // s: the grid is shown this far ahead of the audio clock (calibration; nudge() moves it)
  phaseGain: number // share of an onset's phase error corrected at once
  periodGain: number // share of it, per beat since the last correction, taken into the period (second order)
  holdBars: number // no onset on the grid for this long → no grid (bpm 0)
  holdDecayPerBar: number // confidence lost per bar of that, after the first
  relockBeats: number // a confident other grid must persist this long to replace ours
  confidenceSmoothBeats: number // confidence time constant
}

const DEFAULTS: SyncOpts = {
  lead: 0, phaseGain: 0.25, periodGain: 0.03, holdBars: 16, holdDecayPerBar: 0.05, relockBeats: 8, confidenceSmoothBeats: 1,
}
const TOL = 1 / 8 // beat: an onset this close to a grid beat corrects it
const MERGE = 0.03 // a reading within 3% of our tempo (any octave) and ±TOL of our phase agrees
const MERGE_GAIN = 0.1 // knob: share of the period gap an agreeing reading closes
const LOCK = 0.3 // knob: readings below this confidence neither start a grid nor compete with ours
// knob (T3′ e′): a reading at ⅔ or 4/3 of our tempo (its period in our octave within this share of ¾ of ours) neither
// merges nor competes. Limits: a two-step locked from scratch still locks 116; a mix change to within ~1 % of 4/3 never relocks.
const PARTNER = 0.01
const TAP_GAP = 2 // s: a longer pause starts a new tap count
const TAPS = 4 // intervals in the tap median

export function createSync(source: TempoSource, opts?: Partial<SyncOpts>): SyncControls & { at(audioNow: number): Sync; feed(o: Onset): void; seek(): void } {
  const o = { ...DEFAULTS, ...opts }
  const out: Sync = { ...ZERO_SYNC } // at() returns this object every call
  let period = 0 // s; 0 = no grid
  let anchor = 0 // time of beat `anchorBeat`, s
  let anchorBeat = 0 // integer beat count, continuous across corrections and re-locks
  let lead = o.lead
  let downbeatOffset = 0
  let conf = 0 // target; the output is smoothed
  let smooth = 0
  let lastAt = NaN
  let now = -Infinity // latest time seen, s (double/halve keep the beat at it)
  let lastHit = -Infinity // last onset on the grid (or tap), s
  let weakSince: number | null = null // the source has only seen weak rhythm since then (a break with hats, ambience)
  let lastFix = 0 // beat of the last period correction
  let seen: TempoReading | null = null
  let pending: { r: TempoReading; since: number } | null = null // a confident other grid, waiting out relockBeats
  let taps: number[] = []
  let rephase = false // seek(): the tempo is kept, the phase is not: the next reading at our tempo re-anchors at once

  const beatAt = (t: number) => anchorBeat + (t - anchor) / period
  const timeOf = (n: number) => anchor + (n - anchorBeat) * period
  /** Moves the anchor to the last beat ≤ t, so a period change doesn't swing the beat count. */
  function rebase(t: number) {
    const n = Math.floor(beatAt(t))
    anchor = timeOf(n)
    anchorBeat = n
  }
  /** A new grid on (bpm, beat time `at`), numbered on from the old one. */
  function lock(bpm: number, at: number, confidence: number) {
    const n = period ? Math.round(beatAt(at)) : 0
    period = 60 / bpm
    anchor = at
    anchorBeat = lastFix = n
    lastHit = Math.max(lastHit, at)
    conf = confidence
    pending = weakSince = null // a tap is news too: any weak streak counts from here
    rephase = false
  }
  /** Phase of reading `r` against grid (p, a), in beats of the finer of the two, folded to [−½, ½). */
  function phase(r: TempoReading, p: number, a: number) {
    const unit = Math.min(p, 60 / r.bpm)
    const e = (r.anchor - a) / unit
    return e - Math.round(e)
  }
  function consider(r: TempoReading, t: number) {
    if (r.confidence < LOCK) {
      weakSince ??= t // no clear rhythm: ours decays like a hold, and its tempo is no evidence either way
      return
    }
    weakSince = null
    if (!period) return lock(r.bpm, r.anchor, r.confidence) // a fresh lock
    const k = Math.round(Math.log2(60 / r.bpm / period)) // our octave of it: ×2 / ÷2 stick
    const p = 60 / r.bpm / 2 ** k
    if (Math.abs(p / period / 0.75 - 1) < PARTNER) return // DnB's two-step reads its ⅔ lag (174 → 116) for long stretches
    if (rephase && Math.abs(p / period - 1) < MERGE) return lock(60 / p, r.anchor, r.confidence) // the new spot's phase
    if (Math.abs(p / period - 1) < MERGE && Math.abs(phase(r, period, anchor)) <= TOL) {
      rebase(t)
      period += (p - period) * MERGE_GAIN
      conf = r.confidence
      pending = null
      return
    }
    conf = Math.min(conf, 1 - r.confidence) // a confident other grid: ours is likely wrong
    const was = pending?.r
    const same = was && Math.abs(was.bpm / r.bpm - 1) < MERGE && Math.abs(phase(r, 60 / was.bpm, was.anchor)) <= TOL
    if (!pending || !same) pending = { r, since: t }
    else if (t - pending.since >= (o.relockBeats * 60) / r.bpm) lock(r.bpm, r.anchor, r.confidence)
  }

  return {
    /** A file's seek or resume: the music's phase moved, its tempo did not. The grid hides (confidence 0) and keeps
     *  its tempo; the first confident reading at that tempo (any octave, any phase) re-anchors it, without the
     *  relockBeats wait. A fresh lock would take the source's reading as it is: 116 in a two-step (the ⅔ lag).
     *  ponytail: hidden until the source reads our tempo family; outside the DnB range a two-step groove reads 116 for
     *  8 s and more (Kanine 58–68 s). A comb phase at the kept tempo (tempo.ts update()'s, for a given bpm) if it bites. */
    seek() {
      conf = smooth = 0
      pending = null
      rephase = true
    },
    feed(on) {
      now = Math.max(now, on.t)
      if (!period) return
      const b = beatAt(on.t)
      const n = Math.round(b)
      if (Math.abs(b - n) > TOL) return // off the grid: hats, the other track; readings decide about those
      const err = (b - n) * period
      anchor = timeOf(n) + err * o.phaseGain // rebased onto this beat
      anchorBeat = n
      if (n > lastFix) {
        period += (err * o.periodGain) / (n - lastFix) // 1 BPM of error would otherwise drift a beat a minute
        lastFix = n
      }
      lastHit = Math.max(lastHit, on.t)
    },
    at(audioNow) {
      now = Math.max(now, audioNow)
      const r = source.read()
      if (r && r !== seen) {
        seen = r
        consider(r, audioNow)
      }
      if (!period) return ZERO_SYNC
      const bar = 4 * period
      const idle = (audioNow - lastHit) / bar // bars without an onset on the grid
      if (idle > o.holdBars) {
        period = conf = smooth = downbeatOffset = 0 // the next lock counts beats from 0
        pending = null
        return ZERO_SYNC
      }
      const weak = weakSince === null ? 0 : (audioNow - weakSince) / bar
      const target = Math.max(0, conf - o.holdDecayPerBar * Math.max(0, Math.max(idle, weak) - 1))
      const dt = Number.isNaN(lastAt) ? 0 : Math.max(0, audioNow - lastAt)
      lastAt = audioNow
      smooth += (target - smooth) * (1 - Math.exp(-dt / (o.confidenceSmoothBeats * period)))
      out.bpm = 60 / period
      out.beat = beatAt(audioNow + lead)
      out.bar = (out.beat - downbeatOffset) / 4
      out.confidence = smooth
      return out
    },
    tap(t) {
      now = Math.max(now, t)
      if (t - (taps.at(-1) ?? -Infinity) > TAP_GAP) taps = []
      taps.push(t)
      if (taps.length > TAPS + 1) taps.shift()
      if (taps.length < 2) return
      const iv = taps.slice(1).map((x, i) => x - taps[i]).sort((a, b) => a - b)
      const m = iv.length
      lock(60 / (m % 2 ? iv[m >> 1] : (iv[m / 2 - 1] + iv[m / 2]) / 2), t, 1)
    },
    double() {
      if (!period) return
      rebase(now)
      period /= 2
    },
    halve() {
      if (!period) return
      rebase(now)
      period *= 2
    },
    nudge(ms) {
      lead -= ms / 1000 // +ms: the grid comes later. Not the anchor: the PLL would pull it back within a few beats.
    },
    downbeat(t) {
      now = Math.max(now, t)
      if (period) downbeatOffset = ((Math.round(beatAt(t + lead)) % 4) + 4) % 4 // round: a press just before the 1 marks it
    },
  }
}
