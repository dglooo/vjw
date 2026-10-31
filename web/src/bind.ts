// Bindings (design E3): the per-frame source numbers in an open registry, and the source → shape → amount →
// attack/release → range chain that drives one parameter. Pure, so Vitest runs it in Node.
import { BAND_COUNT } from './audio/energy'
import type { FrameInput } from './frame'

export type Shape = 'sine' | 'tri' | 'saw' | 'square' | 'random'
export interface Binding { source: string; amount: number; attack: number; release: number; min: number; max: number; shape?: Shape; rate?: number }
/** Open ids (lead's note): one object, refilled every frame. Later epics add keys; bindings never enumerate it. */
export type Sources = Record<string, number>
export interface BindState { y: number } // the smoothed 0..1 value
export const BIND_DEFAULTS = { amount: 1, attack: 0, release: 0.15 }

// Knobs: the band dB window and tilt (spectrum's mapping), the onset strength range (the detector's threshold and cap)
// and its decay (the pilot scenes' mapping).
const DB_LO = -75
const DB_HI = -15
const TILT = 1 // dB per band: highs are quieter
const ONSET_LO = 1.5
const ONSET_SPAN = 2.5
const ONSET_TAU = 0.12 // s
const GATED = ['beat', 'bar'] // phase sources × confidence (pilot S8); lfo is not

const BANDS = Array.from({ length: BAND_COUNT }, (_, i) => `band${i}`)
/** The keys `sources()` and features.ts's `fill()` fill, for the panel's list. */
export const SOURCE_IDS: readonly string[] = ['bass', 'mid', 'treb', ...BANDS, 'onset', 'kick', 'snare', 'hats', 'beat', 'bar', 'lfo', 'confidence']

const clamp = (x: number) => Math.min(1, Math.max(0, x))

/** Fills `out` with this frame's sources, no allocation. Silence (log 0 = −∞) clamps to 0. */
export function sources(f: FrameInput, out: Sources): Sources {
  const { att, bands } = f.energy
  out.bass = clamp(att.bass / 2) // 1 ≈ average → 0.5 (MilkDrop convention)
  out.mid = clamp(att.mid / 2)
  out.treb = clamp(att.treb / 2)
  for (let i = 0; i < BAND_COUNT; i++) out[BANDS[i]] = clamp((20 * Math.log10(bands[i]) + TILT * i - DB_LO) / (DB_HI - DB_LO))
  const o = f.lastOnset // age clamped at 0: a line-in onset arrives ahead of audioNow
  out.onset = o ? clamp((o.strength - ONSET_LO) / ONSET_SPAN) * Math.exp(-Math.max(0, f.audioNow - o.t) / ONSET_TAU) : 0
  out.beat = f.sync.beat // counts: shapes take the fract
  out.bar = f.sync.bar
  out.confidence = f.sync.confidence
  out.lfo = f.time
  return out
}

/** Auto-style's overlay (design C5): `out` (≠ `s`) is a copy of `s`, then each key of either map crossfades from the
 *  source `from` names to the one `to` names, a missing name being the key itself. `w` 0 → 1 is the fade; Auto off is
 *  a fade to `{}`. A source not in `s` reads 0, as in evaluate(). */
export function restyle(s: Sources, from: Readonly<Record<string, string>>, to: Readonly<Record<string, string>>, w: number, out: Sources): Sources {
  Object.assign(out, s)
  for (const m of [from, to]) for (const k in m) out[k] = (1 - w) * (s[from[k] ?? k] ?? 0) + w * (s[to[k] ?? k] ?? 0)
  return out
}

/** The sources a scene reads (design C5): a built-in reads the styled overlay when there is one, any other scene `src`. */
export const sourcesFor = (id: string, src: Sources, styled: Sources | null) => (styled && id.startsWith('builtin:') ? styled : src)

/** One cycle of `shape` at t (its fract is the phase): 0..1. Random is a hash of the cycle index, so it holds. */
function shape(s: Shape, t: number): number {
  const p = t - Math.floor(t)
  switch (s) {
    case 'sine':
      return 0.5 - 0.5 * Math.cos(2 * Math.PI * p)
    case 'tri':
      return 1 - Math.abs(2 * p - 1)
    case 'saw':
      return 1 - p // 1 on the beat, falling
    case 'square':
      return p < 0.5 ? 1 : 0
    case 'random': {
      const h = Math.sin(Math.floor(t) * 12.9898) * 43758.5453
      return h - Math.floor(h)
    }
  }
}

/** The bound value this frame. An unknown source reads 0; the one-pole is fps-independent; min > max inverts. */
export function evaluate(b: Binding, s: Sources, state: BindState, dt: number): number {
  let x = Object.hasOwn(s, b.source) ? s[b.source] : 0
  if (b.shape) {
    x = shape(b.shape, x * (b.rate ?? 1))
    if (GATED.includes(b.source)) x *= s.confidence ?? 0
  }
  const y = clamp(b.amount * x)
  const tau = y > state.y ? b.attack : b.release
  state.y += (y - state.y) * (tau > 0 ? 1 - Math.exp(-dt / tau) : 1)
  return b.min + (b.max - b.min) * state.y
}
