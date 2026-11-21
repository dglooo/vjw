// Presets (user 2026-11-20: «одна сцена… возможность выбирать пресеты, как у них»): a named set of input values for one
// node (a native or a shader, by its ref), applied onto the edited scene's node in one undo step (gl/live.ts
// panel.setValues). Never a scene nor a library entry. The factory's ship per ref: vs3/presets.json, written once by
// scripts/vs3-presets.mjs from the friends' factory list (every vs3 scene's, 2026-11-21; their post chain and macros
// on the look inputs, plan_vs3_engine S7.1), each with its thumb in public/vs3/thumbs/presets/. The user's are kept
// beside the marks (library.ts), as are the ☆ favourites of both (ui/Presets.tsx, the browser).
import type { EffectDef, Value } from './fx/types'
import FACTORY from './vs3/presets.json'

/** `thumb`: a factory preset's picture, a file in public/vs3/thumbs/presets/ (thumbUrl). */
export interface Preset { name: string; values: Record<string, Value>; thumb?: string }

const ALL = FACTORY as Record<string, Preset[] | undefined>
/** A ref's factory presets. */
export const factory = (ref: string): readonly Preset[] => ALL[ref] ?? []
/** The refs with factory presets, in presets.json's order. */
export const factoryRefs = Object.keys(ALL)
/** A thumb's URL under the app's base (a deploy's sub-path). */
export const thumbUrl = (thumb: string) => `${import.meta.env.BASE_URL}vs3/thumbs/presets/${thumb}`

/** The first preset whose every value the node holds now (`cur`: its doc values over the def's defaults); undefined:
 *  custom. ponytail: values compare with ===, so an array (colour, point2D) never matches; compare per item when a
 *  preset carries one. */
export const presetOf = (list: readonly Preset[], cur: Readonly<Record<string, Value>>) => list.find((p) => Object.entries(p.values).every(([k, v]) => cur[k] === v))

/** What Save as preset keeps of a node: each value-bearing input's value, less the def's ⚡ inputs (an impulse drives
 *  them), events and texts (a preset is a look: native/text keeps its words). */
export const savable = (def: EffectDef, cur: Readonly<Record<string, Value>>): Record<string, Value> =>
  Object.fromEntries(def.inputs.filter((i) => i.type !== 'event' && i.type !== 'text' && !def.flash?.includes(i.name) && cur[i.name] !== undefined).map((i) => [i.name, cur[i.name]]))

// The preset glide (user 2026-11-21, the donor's preset morph: original main.js stepPresetMorph, its palette's time in
// kit/lib/palette.js): a picked preset's values arrive over MORPH_S, not at once (gl/live.ts Live.glide).
/** s */
export const MORPH_S = 1.8
/** The glide's in-out ease of its time share `k` (clamped to 0 … 1): the donor's cosine. */
export const ease = (k: number) => (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, k)))) / 2
/** One node's glide: the values on screen it starts from, the preset's, the inputs that ease, its first frame's time
 *  (NaN until that frame). */
export interface Glide { from: Record<string, Value>; to: Record<string, Value>; eased: ReadonlySet<string>; t0: number }
/** A glide onto `values` from `cur`, the node's values on screen (mid-glide: the in-between ones). `prev`: the node's
 *  unfinished glide, whose other inputs glide on to their targets. */
export function glideTo(cur: Readonly<Record<string, unknown>>, values: Readonly<Record<string, Value>>, eased: ReadonlySet<string>, prev?: Glide): Glide {
  const to = { ...prev?.to, ...values }
  const from = Object.fromEntries(Object.keys(to).map((k) => [k, Array.isArray(cur[k]) ? [...(cur[k] as number[])] : (cur[k] as Value)])) // a copy: a binding writes into the live array
  return { from, to, eased, t0: NaN }
}
/** The glide's values `k` of the way through it (by time; from 1 on exactly `to`): an `eased` number, or each item of
 *  an eased colour or point, follows the ease; any other value (a select, a checkbox) switches at the midpoint. */
export function between(g: Glide, k: number): Record<string, Value> {
  if (k >= 1) return { ...g.to }
  const e = ease(k)
  return Object.fromEntries(Object.entries(g.to).map(([n, b]) => {
    const a = g.from[n]
    if (!g.eased.has(n) || a === undefined) return [n, k < 0.5 && a !== undefined ? a : b]
    if (typeof a === 'number' && typeof b === 'number') return [n, a + (b - a) * e]
    if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) return [n, b.map((x: number, i) => a[i] + (x - a[i]) * e)]
    return [n, k < 0.5 ? a : b]
  }))
}
