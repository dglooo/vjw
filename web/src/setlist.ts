// The set list (user 2026-11-20, backlog 9: the groundwork only): a named, ordered list of cues. A cue is a scene, an
// optional preset of it (presets.ts, by name), its length in bars or a hold (it stays until the next →), an optional
// transition into it (fx/catalog.ts `transitions`, by id), the switches it sets as it starts (step 2, user
// 2026-11-21): the text layers (X) and the analysis (A) on or off, absent: as they are, and an optional track time: a
// playing file crossing it starts the cue at once, the cue before holding until then (app.ts). An armed set's cues play
// on the bar lines in place of the playlist (director.ts arm). The sets are kept beside the marks (library.ts: vjw.sets, the
// dev mirror, the build's bake) and travel as set files (setFile / importSets). Pure.
import type { SceneId } from './doc'
import { move } from './edit'
import { adjustForSource } from './editor/dnd'

export interface Cue { scene: SceneId; preset?: string; bars: number | 'hold'; transition?: string; text?: boolean; analysis?: boolean; time?: number }
export interface SetList { name: string; cues: Cue[] }
/** The lengths the Set menu offers, in bars (a file may hold any whole number). */
export const BARS = [1, 2, 4, 8, 16, 32, 64]

const rec = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const name = (x: unknown) => x === undefined || (typeof x === 'string' && x !== '')

/** Why `x` is no cue; null: it is one. */
function wrong(x: unknown) {
  if (!rec(x)) return 'not a cue'
  if (typeof x.scene !== 'string' || !x.scene) return 'no scene id'
  if (x.bars !== 'hold' && !(Number.isInteger(x.bars) && (x.bars as number) >= 1)) return `bars ${JSON.stringify(x.bars)}: a whole number ≥ 1 or "hold"`
  if (!name(x.preset)) return 'preset: not a name'
  if (!name(x.transition)) return 'transition: not an id'
  for (const k of ['text', 'analysis']) if (x[k] !== undefined && typeof x[k] !== 'boolean') return `${k} ${JSON.stringify(x[k])}: true, false or absent`
  if (x.time !== undefined && !(typeof x.time === 'number' && x.time >= 0 && x.time < Infinity)) return `time ${JSON.stringify(x.time)}: seconds ≥ 0 or absent`
  return null
}

/** The sets of a stored, filed or baked value (the trust boundary). A set with no name or no cue list is left out, and
 *  so is a bad cue, each with its reason in `dropped`. A cue keeps its own keys only. */
export function parseSets(x: unknown): { sets: SetList[]; dropped: string[] } {
  const dropped: string[] = []
  const sets = (Array.isArray(x) ? x : []).flatMap((s: unknown, i): SetList[] => {
    if (!rec(s) || typeof s.name !== 'string' || !s.name.trim()) {
      dropped.push(`set ${i + 1}: no name`)
      return []
    }
    if (!Array.isArray(s.cues)) {
      dropped.push(`set "${s.name}": no cue list`)
      return []
    }
    const cues = s.cues.flatMap((c: unknown, k): Cue[] => {
      const why = wrong(c)
      if (why) {
        dropped.push(`set "${s.name}", cue ${k + 1}: ${why}`)
        return []
      }
      const { scene, preset, bars, transition, text, analysis, time } = c as Cue
      return [{ scene, bars, ...(preset && { preset }), ...(transition && { transition }), ...(text !== undefined && { text }), ...(analysis !== undefined && { analysis }), ...(time !== undefined && { time }) }]
    })
    return [{ name: s.name, cues }]
  })
  return { sets, dropped }
}

/** The seconds of a cue's track time as the Set menu takes it, `m:ss` (store.ts clock's form); null: not that. */
export function seconds(text: string) {
  const m = /^(\d+):([0-5]\d)$/.exec(text.trim())
  return m ? +m[1] * 60 + +m[2] : null
}

/** A set file's text (the Set menu's export): `{ v: 1, sets }`; importSets reads it back. */
export const setFile = (sets: readonly SetList[]) => `${JSON.stringify({ v: 1, sets }, null, 2)}\n`

/** The sets of a set file's `text` (a bare list too, as vjw.sets holds), through the trust boundary (parseSets), to add
 *  after `have`: a name `have` or an earlier one of the file already takes gets ` (2)`, ` (3)`… (both kept). `dropped`:
 *  each left-out set or cue with its reason, or why the text is no set file. */
export function importSets(have: readonly SetList[], text: string): { sets: SetList[]; dropped: string[] } {
  let x: unknown
  try {
    x = JSON.parse(text)
  } catch (e) {
    return { sets: [], dropped: [`not a set file: ${(e as Error).message}`] }
  }
  const { sets, dropped } = parseSets(rec(x) ? x.sets : x)
  const taken = new Set(have.map((s) => s.name))
  return {
    sets: sets.map((s) => {
      let name = s.name
      for (let n = 2; taken.has(name); n++) name = `${s.name} (${n})`
      taken.add(name)
      return { ...s, name }
    }),
    dropped,
  }
}

/** `cues` with the one at `from` moved to a drop's insert index `at`, counted in the list as it stands (0: before the
 *  first, the length: past the last; editor/dnd.ts insertIndex). */
export function reorder(cues: readonly Cue[], from: number, at: number) {
  const out = [...cues]
  move(out, from, adjustForSource(at, from))
  return out
}

/** The bar's line for the armed set's cue `i` (from 0) of `n`: `cue 3 / 12 · 7 bars left`, `left` Infinity: a hold;
 *  not `sure`: timed, not on the bar lines (director.ts cueBpm). */
export const readout = (i: number, n: number, left: number, sure: boolean) =>
  `cue ${i + 1} / ${n} · ${left === Infinity ? 'hold' : `${sure ? '' : '≈ '}${left} bar${left === 1 ? '' : 's'} left`}`
