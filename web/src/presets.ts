// Presets (user 2026-11-20: «одна сцена… возможность выбирать пресеты, как у них»): a named set of input values for one
// node (a native or a shader, by its ref), applied onto the edited scene's node in one undo step (gl/live.ts
// panel.setValues). Never a scene nor a library entry. The factory's ship per ref: vs3/presets.json, written once by
// scripts/vs3-presets.mjs from the friends' factory list (every vs3 scene's, 2026-11-21; their post chain and macros
// have no input here), each with its thumb in public/vs3/thumbs/presets/. The user's are kept beside the marks
// (library.ts), as are the ☆ favourites of both (ui/Presets.tsx, the browser).
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
