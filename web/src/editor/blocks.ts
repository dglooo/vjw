// The editor's library data (2b S3.1, design S5), pure: blocks are derived from the catalog and the library's scenes,
// never stored.
import type { NodeDoc, SceneDoc } from '../doc'
import { newLayer, newNode } from '../edit'
import type { Category, EffectDef } from '../fx/types'

export type BlockKind = 'generator' | 'effect' | 'scene'
/** `scene`: what its tile renders. `node`: what an add inserts (a generator's or an effect's; a scene has none). */
export interface Block {
  id: string; name: string; kind: BlockKind; group: Category | 'milkdrop' | 'other'; tags: readonly string[]; credit: string
  scene: SceneDoc; node?: NodeDoc
}

const KINDS: readonly BlockKind[] = ['generator', 'effect', 'scene']
const REF: NodeDoc = { ref: 'native/tunnel' } // an effect's tile runs over it (G4: S3.3 judges the look)
const tile = (id: string, name: string, gen: NodeDoc, fx: NodeDoc[] = []): SceneDoc => ({ v: 1, id: `tile:${id}`, name, star: false, layers: [{ ...newLayer(gen), fx }] })

/** Every non-transition def once (`milk/*` in group milkdrop), every toy found in the scenes as a generator (once per
 *  ref), every scene as a scene; by kind, then name. */
export function blocks(catalog: ReadonlyMap<string, EffectDef>, scenes: readonly SceneDoc[]): Block[] {
  const out: Block[] = []
  for (const d of catalog.values()) {
    if (d.kind === 'transition') continue
    const node = newNode(d.id, d.bind)
    const fx = d.kind === 'filter'
    out.push({
      id: d.id, name: d.name, kind: fx ? 'effect' : 'generator', group: d.id.startsWith('milk/') ? 'milkdrop' : d.category ?? 'other',
      tags: d.tags ?? [], credit: d.credit, node, scene: fx ? tile(d.id, d.name, REF, [node]) : tile(d.id, d.name, node),
    })
  }
  const toys = new Set<string>()
  for (const s of scenes) {
    for (const { gen } of s.layers) {
      if (!gen.ref.startsWith('toy/') || toys.has(gen.ref)) continue
      toys.add(gen.ref)
      out.push({ id: gen.ref, name: s.name, kind: 'generator', group: 'other', tags: [], credit: gen.credit ?? '', node: gen, scene: tile(gen.ref, s.name, gen) })
    }
  }
  for (const s of scenes) out.push({ id: s.id, name: s.name, kind: 'scene', group: 'other', tags: [], credit: '', scene: s })
  return out.sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || a.name.localeCompare(b.name))
}

/** The blocks that pass every given filter (AND, as Synesthesia's): kind, group, tag, a case-insensitive substring of
 *  the name, credit or a tag, and the favourites. */
export function filterBlocks(all: readonly Block[], q: { kind?: BlockKind; group?: string; tag?: string; text?: string; favs?: ReadonlySet<string> }): Block[] {
  const t = q.text?.trim().toLowerCase()
  return all.filter((b) =>
    (!q.kind || b.kind === q.kind) && (!q.group || b.group === q.group) && (!q.tag || b.tags.includes(q.tag)) && (!q.favs || q.favs.has(b.id)) &&
    (!t || [b.name, b.credit, ...b.tags].some((s) => s.toLowerCase().includes(t))))
}
