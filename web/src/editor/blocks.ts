// The editor's library data (2b S3.1, design S5), pure: blocks are derived from the catalog and the library's scenes,
// never stored.
import type { NodeDoc, SceneDoc } from '../doc'
import { newLayer, newNode } from '../edit'
import type { Category, EffectDef } from '../fx/types'

export type BlockKind = 'generator' | 'effect' | 'scene'
/** Where a block comes from (plan_editor_origins S1): the library's sections, in the key order of `ORIGINS`. */
export type Origin = 'mine' | 'ours' | 'td' | 'milkdrop' | 'isf' | 'camera'
export const ORIGINS: Record<Origin, string> = { mine: 'Mine', ours: 'Ours', td: 'TouchDesigner', milkdrop: 'MilkDrop', isf: 'ISF/Shadertoy donors', camera: 'Camera' }
/** `scene`: what its tile renders. `node`: what an add inserts (a generator's or an effect's; a scene has none). */
export interface Block {
  id: string; name: string; kind: BlockKind; group: Category | 'milkdrop' | 'other'; origin: Origin; tags: readonly string[]; credit: string
  scene: SceneDoc; node?: NodeDoc
}

const KINDS: readonly BlockKind[] = ['generator', 'effect', 'scene']
const ORDER = Object.keys(ORIGINS)
// Hand lists (scene_origins_2026-11-15 §4): a native's `Look: TD` line is a TS comment, not in its def.
const CAMERA = new Set(['native/camera', 'native/outline', 'own/negative'])
const TD_NATIVES = new Set(['native/rgba-delay', 'native/time-machine', 'native/slit-scan', 'native/swarm', 'native/scatter', 'native/scope', 'native/plexus', 'native/creatures', 'native/isobars', 'native/wireform', 'native/vortex', 'native/orb'])
const REF: NodeDoc = { ref: 'native/tunnel' } // an effect's tile runs over it (G4: S3.3 judges the look)
const tile = (id: string, name: string, gen: NodeDoc, fx: NodeDoc[] = []): SceneDoc => ({ v: 1, id: `tile:${id}`, name, star: false, layers: [{ ...newLayer(gen), fx }] })
const mine = (s: SceneDoc) => !s.id.startsWith('builtin:') // a user scene (library.ts's isBuiltin)
/** What a tile shows: its name, loosely ('Tunnel mesh' = 'tunnel-mesh'), and its node refs, values and binds aside. */
const look = (name: string, s: SceneDoc) => `${name.toLowerCase().replace(/[-\s]+/g, ' ')}|${s.layers.map((l) => [l.gen, ...l.fx].map((n) => n.ref).join('>')).join('|')}`

/** A def's origin by its id, first match wins; an `own/*` file is TouchDesigner when a line starts `// Look: TD` or
 *  `// Look: a TD`. */
function defOrigin(id: string, rawFs: ReadonlyMap<string, string>): Origin {
  if (id.startsWith('milk/')) return 'milkdrop'
  if (CAMERA.has(id)) return 'camera'
  if ((id.startsWith('own/') && /^\/\/ Look: (a )?TD/m.test(rawFs.get(id) ?? '')) || TD_NATIVES.has(id)) return 'td'
  return id.startsWith('isf/') ? 'isf' : 'ours'
}

/** A scene's origin, first match wins: a user scene; any camera node; a MilkDrop preset; any TouchDesigner node; an ISF
 *  generator; else ours. */
function sceneOrigin(s: SceneDoc, rawFs: ReadonlyMap<string, string>): Origin {
  if (mine(s)) return 'mine'
  const refs = s.layers.flatMap((l) => [l.gen, ...l.fx].map((n) => n.ref))
  if (refs.some((r) => CAMERA.has(r))) return 'camera'
  if (s.id.startsWith('builtin:milk-')) return 'milkdrop'
  if (refs.some((r) => defOrigin(r, rawFs) === 'td')) return 'td'
  return s.layers.some((l) => l.gen.ref.startsWith('isf/')) ? 'isf' : 'ours'
}

/** Every non-transition def once (`milk/*` in group milkdrop), every toy found in the scenes as a generator (once per
 *  ref), every scene as a scene but a built-in twin of a block; by origin, then kind, then name. `rawFs`: the `.fs`
 *  files' text (catalog.ts). */
export function blocks(catalog: ReadonlyMap<string, EffectDef>, scenes: readonly SceneDoc[], rawFs: ReadonlyMap<string, string> = new Map()): Block[] {
  const out: Block[] = []
  for (const d of catalog.values()) {
    if (d.kind === 'transition') continue
    const node = newNode(d.id, d.bind)
    const fx = d.kind === 'filter'
    out.push({
      id: d.id, name: d.name, kind: fx ? 'effect' : 'generator', group: d.id.startsWith('milk/') ? 'milkdrop' : d.category ?? 'other',
      origin: defOrigin(d.id, rawFs), tags: d.tags ?? [], credit: d.credit, node, scene: fx ? tile(d.id, d.name, REF, [node]) : tile(d.id, d.name, node),
    })
  }
  const toys = new Set<string>()
  for (const s of scenes) {
    for (const { gen } of s.layers) {
      if (!gen.ref.startsWith('toy/') || toys.has(gen.ref)) continue
      toys.add(gen.ref)
      out.push({ id: gen.ref, name: s.name, kind: 'generator', group: 'other', origin: mine(s) ? 'mine' : 'ours', tags: [], credit: gen.credit ?? '', node: gen, scene: tile(gen.ref, s.name, gen) })
    }
  }
  // A built-in that is one block alone under that block's name (Tunnel, Neuro Serpent, every MilkDrop preset) is that
  // block's tile twice (user 2026-11-16: the duplicates): the block stays, the scene stays in the header's list.
  const twins = new Set(out.map((b) => look(b.name, b.scene)))
  for (const s of scenes) if (mine(s) || !twins.has(look(s.name, s))) out.push({ id: s.id, name: s.name, kind: 'scene', group: 'other', origin: sceneOrigin(s, rawFs), tags: [], credit: '', scene: s })
  return out.sort((a, b) => ORDER.indexOf(a.origin) - ORDER.indexOf(b.origin) || KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || a.name.localeCompare(b.name))
}

/** The blocks that pass every given filter (AND, as Synesthesia's): kind, group, origin, tag, a case-insensitive
 *  substring of the name, credit or a tag, and the favourites. */
export function filterBlocks(all: readonly Block[], q: { kind?: BlockKind; group?: string; origin?: string; tag?: string; text?: string; favs?: ReadonlySet<string> }): Block[] {
  const t = q.text?.trim().toLowerCase()
  return all.filter((b) =>
    (!q.kind || b.kind === q.kind) && (!q.group || b.group === q.group) && (!q.origin || b.origin === q.origin) && (!q.tag || b.tags.includes(q.tag)) &&
    (!q.favs || q.favs.has(b.id)) && (!t || [b.name, b.credit, ...b.tags].some((s) => s.toLowerCase().includes(t))))
}
