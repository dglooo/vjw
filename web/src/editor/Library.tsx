import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { director } from '../app'
import { cam } from '../camera/camera'
import { library, type Mark, type View } from '../library'
import { BUILTIN } from '../scenes/builtin'
import { store } from '../store'
import { H, tiles, visible, W } from './tiles'

const VIEWS: readonly [View, string][] = [['all', 'All'], ['favourite', '★ Favourites'], ['trash', '🗑️ Trash'], ['rework', '🔧 Rework']]
const MARKS: readonly [Mark, string, string][] = [
  ['favourite', '★', 'Favourite'],
  ['trash', '🗑️', 'Trash: out of All, the favourites and the rotation'],
  ['rework', '🔧', 'Rework: a mark only, it still plays'],
]
const KEY = 'vjw.search' // sessionStorage: the search, kept over a reload
let rev = 0 // +1 per library change (a scene, a mark, the view), as Panel.tsx's
library.onChange(() => rev++)
let wait = 0 // the hover delay (S3.4): a tile moves after 150 ms under the pointer, at once on a click

// The tiles on screen bake first (S3.3).
const io = new IntersectionObserver((es) => {
  for (const e of es) {
    const id = (e.target as HTMLElement).dataset.id!
    if (e.isIntersecting) visible.add(id)
    else visible.delete(id)
  }
})

/** A tile's baked still (S3.3), once it lands; transparent over the name placeholder until then. Rows come bottom-up. */
function Still({ id }: { id: string }) {
  const img = useSyncExternalStore(tiles.onChange, () => tiles.get(id))
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current!
    io.observe(c)
    return () => {
      io.unobserve(c)
      visible.delete(id)
    }
  }, [id])
  useEffect(() => {
    if (img) ref.current!.getContext('2d')!.putImageData(img, 0, 0)
  }, [img])
  return <canvas ref={ref} data-id={id} width={W} height={H} />
}

/** The editor's library (user 2026-11-19: scenes only): the view on top (All, the favourites, the trash, the rework
 *  marks) and a name search over the scenes, by name, the order ←/→ and the autopilot walk (library.playlist). A tile
 *  opens its scene (it plays on after L), its ★ 🗑️ 🔧 mark it; one out of the rotation is dimmed, the one on stage
 *  outlined. Each a grey name tile until its still lands (S3.3); the hovered one moves (S3.4). */
export function Library() {
  useSyncExternalStore(library.onChange, () => rev)
  const playing = useSyncExternalStore(store.subscribe, () => store.getSnapshot().edited)
  const every = [...BUILTIN.map((b) => library.get(b.id)!), ...library.all()]
  useEffect(() => tiles.want(every.map((d) => ({ id: d.id, scene: d })))) // every scene bakes, the listed or not
  useEffect(() => () => {
    clearTimeout(wait)
    tiles.pause()
  }, []) // the editor closes
  const [text, setText] = useState(() => sessionStorage.getItem(KEY) ?? '')
  const view = library.view()
  const marks = library.marks()
  const t = text.trim().toLowerCase()
  const shown = library.listed(view).filter((d) => d.name.toLowerCase().includes(t))
  const rotation = new Set(library.playlist(cam.live))
  return (
    <aside className="library">
      <div className="top">
        <div className="chips">
          {VIEWS.map(([v, label]) => (
            <button key={v} aria-pressed={view === v} onClick={() => library.setView(v)}>
              {label}
            </button>
          ))}
        </div>
        <input
          type="search"
          aria-label="Search the scenes"
          placeholder="Search by name"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            sessionStorage.setItem(KEY, e.target.value)
          }}
        />
      </div>
      {shown.length === 0 && <p className="hint">Nothing here</p>}
      <ul>
        {shown.map((d) => (
          <li
            key={d.id}
            className={`${rotation.has(d.id) ? '' : 'off '}${d.id === playing ? 'on' : ''}` || undefined}
            onPointerEnter={() => (wait = window.setTimeout(() => tiles.hover(d.id), 150))}
            onPointerLeave={() => {
              clearTimeout(wait)
              tiles.hover(null)
            }}
          >
            <button className="pick" title={rotation.has(d.id) ? d.name : `${d.name} · out of the rotation`} onClick={() => {
                tiles.hover(d.id)
                director.cut(d.id)
              }}
            >
              <Still id={d.id} />
              {d.name}
            </button>
            <span className="marks">
              {MARKS.map(([m, icon, label]) => {
                const on = marks[m].has(d.id)
                return (
                  <button key={m} aria-pressed={on} aria-label={label} title={label} onClick={() => library.mark(m, d.id, !on)}>
                    {icon}
                  </button>
                )
              })}
            </span>
          </li>
        ))}
      </ul>
    </aside>
  )
}
