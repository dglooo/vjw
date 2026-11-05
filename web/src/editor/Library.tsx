import { useState, useSyncExternalStore } from 'react'
import { catalog } from '../fx/catalog'
import { library } from '../library'
import { BUILTIN } from '../scenes/builtin'
import { blocks, filterBlocks, type Block, type BlockKind } from './blocks'
import { dragged, MIME } from './dnd'

const KINDS: readonly BlockKind[] = ['generator', 'effect', 'scene']
const GROUPS: readonly Block['group'][] = ['feedback', 'geometry', 'liquid', 'retro', 'milkdrop', 'other']
const KEY = 'vjw.lib' // sessionStorage: the filters and the search, kept over a reload (CP3 demo)
interface Q { kind?: BlockKind; group?: string; tag?: string; text?: string; fav?: boolean }
let rev = 0 // +1 per library change (a scene, a favourite), as Panel.tsx's
library.onChange(() => rev++)

function stored(): Q {
  try {
    const q: unknown = JSON.parse(sessionStorage.getItem(KEY) ?? '{}')
    return q && typeof q === 'object' ? (q as Q) : {}
  } catch {
    return {} // a corrupt value: no filter
  }
}

/** The editor's library (2b S3.1, design S5): kind, group and tag chips, the favourites and a search box, ANDed, over
 *  every block, as grey name tiles until S3.3 bakes their stills. A tile's click tries its block (`trying`: marked until
 *  Enter or another edit keeps it, or Esc takes it back), its `+` adds it for good, a drag onto the stack adds it there;
 *  a scene tile opens that scene. `pick` (Editor) does all of it. */
export function Library({ trying, pick }: { trying?: string; pick: (b: Block, mark: boolean) => void }) {
  useSyncExternalStore(library.onChange, () => rev)
  const all = blocks(catalog, [...BUILTIN.map((b) => library.get(b.id)!), ...library.all()])
  const favs = library.favs()
  const [q, setQ] = useState(stored)
  const set = (p: Q) => {
    const n = { ...q, ...p }
    setQ(n)
    sessionStorage.setItem(KEY, JSON.stringify(n))
  }
  /** A filter chip: pressed while it filters; pressing it again lets go. */
  const chip = (label: string, on: boolean, p: Q) => (
    <button key={label} aria-pressed={on} onClick={() => set(p)}>
      {label}
    </button>
  )
  return (
    <aside className="library">
      <div className="top">
        <input type="search" aria-label="Search the library" placeholder="Search name, credit, tag" value={q.text ?? ''} onChange={(e) => set({ text: e.target.value })} />
        <div className="chips">
          {KINDS.map((k) => chip(k, q.kind === k, { kind: q.kind === k ? undefined : k }))}
          {chip('★ favourites', !!q.fav, { fav: !q.fav })}
        </div>
        <div className="chips">{GROUPS.map((g) => chip(g, q.group === g, { group: q.group === g ? undefined : g }))}</div>
        <div className="chips">{[...new Set(all.flatMap((b) => b.tags))].sort().map((t) => chip(t, q.tag === t, { tag: q.tag === t ? undefined : t }))}</div>
        {trying && <p className="hint">Enter keeps it · Esc takes it back</p>}
      </div>
      <ul>
        {filterBlocks(all, { ...q, favs: q.fav ? favs : undefined }).map((b) => (
          <li
            key={b.id}
            className={b.id === trying ? 'tried' : undefined}
            draggable={b.kind !== 'scene'}
            onDragStart={(e) => {
              e.dataTransfer.setData(MIME, b.id)
              e.dataTransfer.effectAllowed = 'copy'
              dragged.block = b
            }}
          >
            <button className="pick" title={[b.credit, ...b.tags].filter(Boolean).join(' · ') || undefined} onClick={() => pick(b, true)}>
              {b.name}
              <small>{b.kind}</small>
            </button>
            <button className="fav" aria-pressed={favs.has(b.id)} aria-label="Favourite" onClick={() => library.setFav(b.id, !favs.has(b.id))}>
              ★
            </button>
            {b.kind !== 'scene' && (
              <button className="plus" aria-label="Add" title="Add, no try" onClick={() => pick(b, false)}>
                +
              </button>
            )}
          </li>
        ))}
      </ul>
    </aside>
  )
}
