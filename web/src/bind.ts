// Bindings (design E3): the per-frame source numbers in an open registry, and the source → shape → amount →
// attack/release → range chain that drives one parameter. Pure, so Vitest runs it in Node.
import { BAND_COUNT } from './audio/energy'
import type { FrameInput } from './frame'

export type Shape = 'sine' | 'tri' | 'saw' | 'square' | 'random'
export interface Binding { source: string; amount: number; attack: number; release: number; min: number; max: number; shape?: Shape; rate?: number }
/** Open ids (lead's note): one object, refilled every frame. Later epics add keys; bindings never enumerate it. */
export type Sources = Record<string, number>
/** `y`: the smoothed 0..1 value; `held`: a bound bool's or event's last level (`level`), kept across a rebind with it. */
export interface BindState { y: number; held?: boolean }
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
export const SOURCE_IDS: readonly string[] = ['bass', 'mid', 'treb', ...BANDS, 'onset', 'kick', 'snare', 'hats', 'sub', 'reese', 'wobble', 'wobbleDepth', 'reeseLevel', 'beat', 'bar', 'lfo', 'confidence', 'build', 'drop', 'presence'] // build/drop: the arrangement (S5.3); presence: the camera (S1.1) — S6.3 lists them in a group

export interface SourceGroup { label: string; ids: readonly string[] }
/** The Scene tab's source-select optgroups (S6.3), mirroring the Sources tab's meter groups: the fixed ones, the
 * custom bands (only when there are any), then `band` last. Covers every `SOURCE_IDS` entry exactly once. */
export const sourceGroups = (custom: readonly { id: string; name: string }[] = []): readonly SourceGroup[] => {
  const g: SourceGroup[] = [
    { label: 'levels', ids: ['bass', 'mid', 'treb'] },
    { label: 'drums', ids: ['kick', 'snare', 'hats'] },
    { label: 'bass', ids: ['sub', 'reese', 'wobble', 'wobbleDepth', 'reeseLevel'] },
    { label: 'arrangement', ids: ['build', 'drop'] },
    { label: 'timing', ids: ['onset', 'beat', 'bar', 'lfo', 'confidence'] },
    { label: 'camera', ids: ['presence'] }, // S1.1: the camera's presence (never in an Auto-style map, D3)
  ]
  if (custom.length) g.push({ label: 'custom', ids: custom.map((c) => c.id) })
  g.push({ label: 'band', ids: [...BANDS] })
  return g
}

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

/** The Auto-style 2 s crossfade (design C5, plan S4.3): holds `from`/`to` and `w`; a changed target restarts the ramp
 *  0→1 at 1/2 per s (`w` is 1 at start, so the first target is already in place). App.ts calls this, then `restyle`. */
export function createRemap() {
  let from: Record<string, string> = {}
  let to: Record<string, string> = {}
  let w = 1
  return {
    /** Returns [from, to, w] for the frame. */
    frame(target: Readonly<Record<string, string>>, dt: number): readonly [Record<string, string>, Record<string, string>, number] {
      if (JSON.stringify(target) !== JSON.stringify(to)) {
        from = to
        to = target
        w = 0
      }
      w = Math.min(1, w + dt / 2)
      return [from, to, w]
    },
  }
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

/** A bound bool's or event's value for its evaluated `y`, and the new `held` (on at .5). A bool follows the level; an
 *  event is true on the rising edge only (the draw clears it), so one hit fires it once, not on every held frame. */
export function level(type: 'bool' | 'event', y: number, held = false): [value: boolean, held: boolean] {
  const on = y >= 0.5
  return [on && (type === 'bool' || !held), on]
}
