// Presets (user 2026-11-20: «одна сцена… возможность выбирать пресеты, как у них»): a named set of input values for one
// node (a native or a shader, by its ref), applied onto the edited scene's node in one undo step (gl/live.ts
// panel.setValues). Never a scene nor a library entry. The factory's ship per ref: vs3/presets.json, written once by
// scripts/vs3-presets.mjs from the friends' factory list (chorus, tendril, vesica, locus; their post chain and macros
// have no input here). The user's are kept beside the marks (library.ts).
import type { EffectDef, Value } from './fx/types'
import FACTORY from './vs3/presets.json'

export interface Preset { name: string; values: Record<string, Value> }

/** A ref's factory presets. */
export const factory = (ref: string): readonly Preset[] => (FACTORY as Record<string, Preset[] | undefined>)[ref] ?? []

/** The first preset whose every value the node holds now (`cur`: its doc values over the def's defaults); undefined:
 *  custom. ponytail: values compare with ===, so an array (colour, point2D) never matches; compare per item when a
 *  preset carries one. */
export const presetOf = (list: readonly Preset[], cur: Readonly<Record<string, Value>>) => list.find((p) => Object.entries(p.values).every(([k, v]) => cur[k] === v))

/** What Save as preset keeps of a node: each value-bearing input's value, less the def's ⚡ inputs (an impulse drives
 *  them) and events. */
export const savable = (def: EffectDef, cur: Readonly<Record<string, Value>>): Record<string, Value> =>
  Object.fromEntries(def.inputs.filter((i) => i.type !== 'event' && !def.flash?.includes(i.name) && cur[i.name] !== undefined).map((i) => [i.name, cur[i.name]]))
