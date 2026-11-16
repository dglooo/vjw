// The heat post pass's numbers (design C6): heat brightens the frame plus a gentle beat strobe, a drop flashes it
// toward white; and the gate that caps the bound flashes (`flashGate`). Pure, so the photosensitivity caps are tested
// without a browser.
import { pulse, ZERO_SYNC } from '../audio/sync'
import type { Post } from './engine'

// Knobs ⚠️ (design C6, research gap 6): conservative caps for photosensitivity.
const HEAT_GAIN = 0.25 // brightness at full heat: +25%
const STROBE = 0.15 // the strobe's peak (full heat, full confidence), on top: gain ≤ 1.4
const EIGHTHS = 0.5 // heat from which the strobe pulses on 1/8 notes instead of 1/4
const SURE = 0.3 // sync confidence below this: no strobe (sync's LOCK)
const FLASH = 0.8 // the drop flash's peak white mix
const TAU = 0.1 // s, its decay: ≤ .25 at +200 ms, ≤ .10 at +250 ms (RL fix 1, F3; design_rave_lasers.md L207's app-wide knob)
const STEP = 1 / 255 // one 8-bit step: less is 0, so a cold frame is the identity and the engine skips the pass
const WCAG = 3 // WCAG 2.3.1: flashes never above this many/s

const unit = (x: number) => (x > 0 ? Math.min(1, x) : 0) // NaN → 0
const visible = (x: number) => (x >= STEP ? x : 0) // NaN → 0

/** `heat` 0..1 (arrange.ts); `drop` = seconds since the drop fired (Infinity: none yet); `beat` = `sync.beat` (its fract
 *  is the phase); `bpm` = `sync.bpm` (0 = unknown); `conf` = `sync.confidence`. The strobe is capped at 3 flashes/s
 *  (WCAG 2.3.1): 1/8 notes only while `bpm`/30 stays under the cap, else 1/4 (≤ 3/s while `bpm` ≤ 3·`WCAG`). No heat
 *  and no drop = `{ gain: 1, flash: 0 }`, the frame as it is. */
export function postFor(heat: number, drop: number, beat: number, bpm: number, conf: number): Post {
  const h = unit(heat)
  const c = unit(conf)
  // 1/8 notes pulse at `bpm`/30 per s; allow the switch only while that stays ≤ WCAG 3/s (bpm ≤ 90). Else 1/4 notes
  // (`bpm`/60, ≤ 3/s to bpm 180). ponytail: past 180 even 1/4 exceeds the cap — a knob change, not a guess, if it bites.
  const eighths = h >= EIGHTHS && bpm > 0 && bpm / 30 <= WCAG
  const strobe = c >= SURE ? STROBE * h * pulse({ ...ZERO_SYNC, beat: eighths ? 2 * beat : beat, confidence: c }) : 0
  return { gain: 1 + visible(HEAT_GAIN * h + strobe), flash: visible(drop >= 0 ? FLASH * Math.exp(-drop / TAU) : 0) }
}

const ON = 0.5 // a bool/event binding's on-level (bind.ts level); a float flash rises through the same line

/** One flash-class binding's gate memory: `prev` = its last output; `blocked` = an onset was refused, until the raw
 *  falls below ON. */
export interface FlashState { prev: number; blocked: boolean }

/** WCAG 2.3.1 for the bound flashes (polish §3): an onset (`y` rising to ON) is allowed while fewer than WCAG of
 *  `onsets` (the allowed onsets' times, oldest first; one array = one shared budget) lie in the closed window
 *  [`t` − 1, `t`] (s). A refused one holds the last output; between allowed onsets the output never rises, so a
 *  refused flash never leaks later. NaN reads 0.
 *  ponytail: a sub-0.5 swell on a user-bound float is held, then steps at 0.5 (a counted onset); trough-relative
 *  hysteresis if that bites. */
export function flashGate(y: number, s: FlashState, onsets: number[], t: number): number {
  if (!(y >= 0)) y = 0
  if (y < ON) s.blocked = false
  else if (s.prev < ON && !s.blocked) {
    while (onsets.length && onsets[0] < t - 1) onsets.shift()
    if (onsets.length < WCAG) {
      onsets.push(t)
      return (s.prev = y)
    }
    s.blocked = true
  }
  return (s.prev = Math.min(y, s.prev))
}

// knob: s, a native's ⚡ hit's rise time constant as drawn: a frame takes 1 - e^(-dt/HOT_RISE) of the step (34 % at
// 60 fps), so an allowed hit's full light step (particles: ≈ +.11 frame-mean luma at 65 536 points) never makes a luma
// step > .10 in one frame (I-FL1)
const HOT_RISE = 0.04
/** A native's ⚡ `hit` as drawn this frame (particles, tunnel, spectrum): rises toward the gated `hit` with HOT_RISE,
 *  falls with it at once (its binding's release smooths the fall). Pure. */
export const heatStep = (hot: number, hit: number, dt: number) => (hit > hot ? hot + (hit - hot) * (1 - Math.exp(-dt / HOT_RISE)) : hit)
