import { useRef, useState, useSyncExternalStore, type DragEvent, type PointerEvent } from 'react'
import { armSet, director } from '../app'
import { docs, move } from '../edit'
import { adjustForSource, insertIndex } from '../editor/dnd'
import { transitions } from '../fx/catalog'
import { panel } from '../gl/live'
import { library } from '../library'
import { BARS, type Cue, type SetList } from '../setlist'
import { store } from '../store'

const sceneName = (id: string) => (docs.get(id) ?? library.get(id))?.name
const short = (id: string) => id.slice(id.indexOf('/') + 1) // gl/Swirl → Swirl
const mid = (el: Element) => {
  const r = el.getBoundingClientRect()
  return r.top + r.height / 2
}
/** A clicked button or summary keeps the focus, and a focused control eats the hotkeys; a select or a field keeps it. */
const release = (e: PointerEvent) => {
  if (!(e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement)) (document.activeElement as HTMLElement | null)?.blur()
}

/** The top bar's Set menu (setlist.ts, user 2026-11-20: the groundwork): pick, make, rename or delete a set; add the
 *  scene on stage with its preset as a cue; drag the cues into order by their names; give each its bars or a hold and
 *  a transition into it; delete one; arm / disarm the set (app.ts armSet). Armed, its summary reads the cue on stage. */
export function SetMenu() {
  const sets = useSyncExternalStore(library.onChange, library.sets)
  const armed = useSyncExternalStore(store.subscribe, () => store.getSnapshot().armedSet)
  const cue = useSyncExternalStore(store.subscribe, () => store.getSnapshot().cue) // re-renders the cue on stage too
  const [pick, setPick] = useState(() => armed ?? 0)
  const [naming, setNaming] = useState(false)
  const [sure, setSure] = useState(false) // delete set: the second click deletes
  const [line, setLine] = useState(-1) // a drag's insert line: above cue `line` (the cue count: the end)
  const drag = useRef<number | null>(null)
  const i = Math.min(pick, sets.length - 1) // -1: no set yet
  const set = sets[i] as SetList | undefined
  const playing = armed === i ? director.cue()?.of : undefined
  const on = playing ? set!.cues.indexOf(playing) : -1 // the cue on stage, lit
  const save = (next: SetList) => library.setSets(sets.with(i, next))
  const edit = (k: number, c: Cue) => save({ ...set!, cues: set!.cues.with(k, c) })
  const choose = (k: number) => {
    setPick(k)
    setSure(false)
    setNaming(false)
  }
  function create() {
    let n = sets.length + 1
    while (sets.some((s) => s.name === `Set ${n}`)) n++
    library.setSets([...sets, { name: `Set ${n}`, cues: [] }])
    choose(sets.length)
  }
  function remove() {
    const a = store.getSnapshot().armedSet
    if (a !== null && a >= i) store.patch({ armedSet: a > i ? a - 1 : null }) // before the change, which re-arms by index
    library.setSets(sets.toSpliced(i, 1))
    choose(Math.max(0, i - 1))
  }
  function add() {
    const { edited } = store.getSnapshot()
    const preset = panel.presetNode()?.now?.name
    if (edited) save({ ...set!, cues: [...set!.cues, { scene: edited, bars: 16, ...(preset && { preset }) }] })
  }
  /** The drop's insert index under the pointer, or null for a drag that is not a cue's (a file: the document plays it). */
  const over = (e: DragEvent<HTMLElement>) => {
    if (drag.current === null) return null
    e.preventDefault()
    return insertIndex(e.clientY, Array.from(e.currentTarget.querySelectorAll(':scope > .cue'), mid))
  }
  const end = () => {
    drag.current = null
    setLine(-1)
  }
  return (
    <details className="midi setlist" onPointerUp={release}>
      <summary className={armed === null ? undefined : 'on'}>{cue || 'Set'}</summary>
      <div className="menu">
        {naming && set ? (
          // Not a prompt(): it blocks the main thread and the picture freezes (PresetSelect's naming). app.ts skips keys typed here.
          <form
            className="line"
            onKeyDown={(e) => e.code === 'Escape' && setNaming(false)}
            onSubmit={(e) => {
              e.preventDefault()
              const name = String(new FormData(e.currentTarget).get('name')).trim()
              if (name) save({ ...set, name })
              setNaming(false)
            }}
          >
            <input name="name" aria-label="Set name" defaultValue={set.name} required autoFocus autoComplete="off" spellCheck={false} />
            <button>OK</button>
            <button type="button" onClick={() => setNaming(false)}>
              Cancel
            </button>
          </form>
        ) : (
          <span className="line">
            {set && (
              <select
                aria-label="Set"
                value={i}
                onChange={(e) => {
                  e.currentTarget.blur() // a focused select would eat hotkeys as type-ahead
                  choose(+e.currentTarget.value)
                }}
              >
                {sets.map((s, k) => (
                  <option key={k} value={k}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
            <button onClick={create}>new set</button>
            {set && <button onClick={() => setNaming(true)}>rename</button>}
            {set && <button onClick={() => (sure ? remove() : setSure(true))}>{sure ? 'delete? yes' : 'delete'}</button>}
          </span>
        )}
        {set && (
          <>
            <span className="line">
              <button aria-pressed={armed === i} disabled={!set.cues.length} title="The set plays its cues in place of the autopilot; ← / → step" onClick={() => armSet(armed === i ? null : i)}>
                {armed === i ? 'armed · disarm' : 'arm'}
              </button>
            </span>
            <div
              onDragOver={(e) => {
                const at = over(e)
                if (at !== null) setLine(at)
              }}
              onDrop={(e) => {
                const at = over(e)
                const from = drag.current
                end()
                if (at === null || from === null) return
                const to = adjustForSource(at, from)
                if (to === from) return
                const cues = [...set.cues]
                move(cues, from, to)
                save({ ...set, cues })
              }}
              onDragEnd={end}
            >
              {set.cues.map((c, k) => (
                <div key={k} className={`line cue${k === on ? ' on' : ''}${sceneName(c.scene) ? '' : ' gone'}${line === k ? ' ins' : ''}`}>
                  <span
                    draggable
                    title={`${c.scene}: drag to reorder`}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move'
                      drag.current = k
                    }}
                  >
                    {k + 1}. {sceneName(c.scene) ?? 'missing scene'}
                    {c.preset && ` · ${c.preset}`}
                  </span>
                  <select
                    aria-label="Length"
                    value={c.bars}
                    onChange={(e) => {
                      const v = e.currentTarget.value
                      e.currentTarget.blur()
                      edit(k, { ...c, bars: v === 'hold' ? 'hold' : +v })
                    }}
                  >
                    {/* ponytail: a file's other whole number plays but shows as 1 bar here; list it when files get edited by hand */}
                    {[...BARS, 'hold' as const].map((b) => (
                      <option key={b} value={b}>
                        {b === 'hold' ? 'hold' : `${b} bar${b === 1 ? '' : 's'}`}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Transition in"
                    value={c.transition ?? ''}
                    onChange={(e) => {
                      const v = e.currentTarget.value
                      e.currentTarget.blur()
                      edit(k, { ...c, transition: v || undefined })
                    }}
                  >
                    <option value="">random</option>
                    {transitions.map((id) => (
                      <option key={id} value={id}>
                        {short(id)}
                      </option>
                    ))}
                  </select>
                  <button aria-label="Delete cue" onClick={() => save({ ...set, cues: set.cues.toSpliced(k, 1) })}>
                    ×
                  </button>
                </div>
              ))}
              <button className={line === set.cues.length ? 'ins' : undefined} onClick={add}>
                + scene on stage
              </button>
            </div>
          </>
        )}
      </div>
    </details>
  )
}
