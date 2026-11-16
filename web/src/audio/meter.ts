// The HUD input meter (dsp_linein_2026-11-16 § Gain sensitivity, fix 5): the sample peak in dBFS with a short hold, and a
// CLIP light that latches. A meter, not an auto-gain: the running averages already normalise the level, and an AGC would
// pump them. The DJ trims the mixer instead: 0 to at least −12 dB reads the same; +6 dB (15–49 % of the samples
// clipped) cuts the kicks 14–46 %. Pure: Vitest runs it in Node.
export const FLOOR = -60 // dBFS: the meter's bottom
const HOLD = 0.5 // s knob: a new peak holds this long, then falls
const FALL = 20 // dB/s knob, after the hold
const CLIP = 10 ** (-0.3 / 20) // a sample at or over −0.3 dBFS lights CLIP
const LATCH = 1.5 // s: CLIP stays lit this long after the last clip
const NAG = 1 // s: clips that keep coming for longer than this show the hint

export function createMeter() {
  let held = FLOOR // the last peak that beat the falling display, dBFS
  let heldAt = -Infinity
  let clipAt = -Infinity // the last clip
  let runFrom = -Infinity // the first clip of the current lit run
  const m = {
    db: FLOOR, // the held peak, dBFS, ≥ FLOOR
    clip: false, // the CLIP light
    hint: false, // CLIP lit by clips spread over more than NAG s
    /** One frame: its L and R samples (the same length), the time `now` in s. */
    update(l: Float32Array, r: Float32Array, now: number) {
      let peak = 0
      for (let i = 0; i < l.length; i++) peak = Math.max(peak, Math.abs(l[i]), Math.abs(r[i]))
      const db = Math.max(FLOOR, 20 * Math.log10(peak)) // silence: log10(0) = −∞ → FLOOR
      const fell = held - FALL * Math.max(0, now - heldAt - HOLD)
      if (db >= fell) {
        held = db
        heldAt = now
      }
      m.db = Math.max(db, fell)
      if (peak >= CLIP) {
        if (now - clipAt >= LATCH) runFrom = now
        clipAt = now
      }
      m.clip = now - clipAt < LATCH
      m.hint = m.clip && clipAt - runFrom > NAG
    },
  }
  return m
}
