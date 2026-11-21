import type { EffectDef } from '../fx/types'

// The "+ layer" picker's lists (Panel.tsx LayerPick; user 2026-11-21: «выбирать строго категории … всё вперемешку»),
// pure so they test without a browser. A layer starts from a generator: the effects stay in each layer's "+ effect".

/** The categories, in the picker's order. */
export const CATS = { background: 'Background', camera: 'Camera', text: 'Text', frame: 'Frame', video: 'Video' } as const
export type Cat = keyof typeof CATS
const BY_ID: Readonly<Record<string, Cat>> = { 'native/camera': 'camera', 'native/outline': 'camera', 'native/text': 'text', 'native/frame': 'frame', 'native/video': 'video' }
/** A generator's category: the camera, text, frame and video natives by id; every other generator draws a background. */
export const categoryOf = (d: Pick<EffectDef, 'id'>): Cat => BY_ID[d.id] ?? 'background'

/** A generator's source, named as the library's groups (Library.tsx GROUPS), in their order. */
const SOURCES = ['MilkDrop', 'Ours', 'vs2 (donor)', 'vs3 (new)']
const sourceOf = (id: string) => SOURCES[id.startsWith('milk/') ? 0 : id.startsWith('syn/') ? 2 : id.startsWith('native/vs3-') ? 3 : 1]

export interface Item { id: string; name: string; group: string }
/** The generators of `cat` whose name holds `text` (any case), by source, then by name. */
export function pickList(defs: Iterable<Pick<EffectDef, 'id' | 'name' | 'kind'>>, cat: Cat, text: string): Item[] {
  const t = text.trim().toLowerCase()
  return [...defs]
    .filter((d) => d.kind === 'generator' && categoryOf(d) === cat && d.name.toLowerCase().includes(t))
    .map((d) => ({ id: d.id, name: d.name, group: sourceOf(d.id) }))
    .sort((a, b) => SOURCES.indexOf(a.group) - SOURCES.indexOf(b.group) || a.name.localeCompare(b.name))
}
