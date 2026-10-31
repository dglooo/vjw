// The heat post pass's numbers (design C6): heat brightens the frame plus a gentle beat strobe, a drop flashes it
// toward white. Pure, so the photosensitivity caps are tested without a browser.
import { pulse, ZERO_SYNC } from '../audio/sync'
import type { Post } from './engine'

// Knobs ⚠️ (design C6, research gap 6): conservative caps for photosensitivity.
const HEAT_GAIN = 0.25 // brightness at full heat: +25%
const STROBE = 0.15 // the strobe's peak (full heat, full confidence), on top: gain ≤ 1.4
const EIGHTHS = 0.5 // heat from which the strobe pulses on 1/8 notes instead of 1/4
const SURE = 0.3 // sync confidence below this: no strobe (sync's LOCK)
const FLASH = 0.8 // the drop flash's peak white mix
const TAU = 0.2 // s, its decay
const STEP = 1 / 255 // one 8-bit step: less is 0, so a cold frame is the identity and the engine skips the pass

const unit = (x: number) => (x > 0 ? Math.min(1, x) : 0) // NaN → 0
const visible = (x: number) => (x >= STEP ? x : 0) // NaN → 0

/** `heat` 0..1 (arrange.ts); `drop` = seconds since the drop fired (Infinity: none yet); `beat` = `sync.beat` (its fract
 *  is the phase); `conf` = `sync.confidence`. No heat and no drop = `{ gain: 1, flash: 0 }`, the frame as it is. */
export function postFor(heat: number, drop: number, beat: number, conf: number): Post {
  const h = unit(heat)
  const c = unit(conf)
  const strobe = c >= SURE ? STROBE * h * pulse({ ...ZERO_SYNC, beat: h >= EIGHTHS ? 2 * beat : beat, confidence: c }) : 0
  return { gain: 1 + visible(HEAT_GAIN * h + strobe), flash: visible(drop >= 0 ? FLASH * Math.exp(-drop / TAU) : 0) }
}
