// The shipped MilkDrop presets (design § Variant A, C1), pure: no GL or audio import. Each `presets/<slug>.json` is a
// copy written by `scripts/milk-presets.mjs`; its fields carry the spec §6 credit. A bad file is logged and skipped, as
// in fx/catalog.ts, so one bad file never breaks the show.
import type { SceneDoc } from '../doc'

export interface PresetFile { name: string; author: string; url: string; license: string; preset: object }

const files = import.meta.glob('./presets/*.json', { eager: true, import: 'default' })

const isPreset = (f: unknown): f is PresetFile => {
  const { name, author, url, license, preset } = (f ?? {}) as Record<string, unknown>
  return [name, author, url, license].every((s) => typeof s === 'string') && typeof preset === 'object' && preset !== null
}

export const PRESETS: readonly (PresetFile & { slug: string })[] = Object.entries(files)
  .flatMap(([path, f]) => {
    if (isPreset(f)) return [{ ...f, slug: path.slice('./presets/'.length, -'.json'.length) }]
    console.error(`${path}: not a preset file (name, author, url, license strings and a preset object)`)
    return []
  })
  .sort((a, b) => (a.slug < b.slug ? -1 : 1))

// One built-in scene per preset: the preset alone, starred (CP2 contract).
export const MILK_SCENES: readonly SceneDoc[] = PRESETS.map((p): SceneDoc => ({
  v: 1, id: `builtin:milk-${p.slug}`, name: p.name, star: true,
  layers: [{ gen: { ref: `milk/${p.slug}` }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 }],
}))

/** The autopilot order (design Q4): both orders kept, `own[0]` first, the `milk` items spread evenly among `own`.
 *  `own[i]` ranks at i / own.length, `milk[j]` at (j + 1) / (milk.length + 1); a stable merge by rank, ties own first. */
export function spread<T>(own: readonly T[], milk: readonly T[]): T[] {
  const out: T[] = []
  let i = 0
  let j = 0
  while (i < own.length || j < milk.length) {
    // i / own.length <= (j + 1) / (milk.length + 1), cross-multiplied so the tie test is exact
    const ownNext = j === milk.length || (i < own.length && i * (milk.length + 1) <= (j + 1) * own.length)
    out.push(ownNext ? own[i++] : milk[j++])
  }
  return out
}
