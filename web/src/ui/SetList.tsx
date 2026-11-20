import { useEffect, useReducer, useRef, useState, useSyncExternalStore, type DragEvent, type PointerEvent } from 'react'
import { armSet, director } from '../app'
import { docs } from '../edit'
import { adjustForSource, insertIndex } from '../editor/dnd'
import { transitions } from '../fx/catalog'
import { panel } from '../gl/live'
import { download, library } from '../library'
import { BARS, importSets, reorder, setFile, type Cue, type SetList } from '../setlist'
import { store } from '../store'

const sceneName = (id: string) => (docs.get(id) ?? library.get(id))?.name
const short = (id: string) => id.slice(id.indexOf('/') + 1) // gl/Swirl → Swirl
const mid = (el: Element, across: boolean) => {
  const r = el.getBoundingClientRect()
  return across ? r.left + r.width / 2 : r.top + r.height / 2
}
const length = (bars: Cue['bars']) => (bars === 'hold' ? 'hold' : `${bars} bar${bars === 1 ? '' : 's'}`)
/** A clicked button or summary keeps the focus, and a focused control eats the hotkeys; a select or a field keeps it. */
const release = (e: PointerEvent) => {
  if (!(e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement)) (document.activeElement as HTMLElement | null)?.blur()
}

/** The top bar's Set menu (setlist.ts, user 2026-11-20: the groundwork): pick, make, rename or delete a set; add the
 *  scene on stage with its preset as a cue; drag the cues into order by their names; give each its bars or a hold and
 *  a transition into it; delete one; arm / disarm the set (app.ts armSet). Armed, its summary reads the cue on stage.
 *  Step 2 (user 2026-11-21): export the set or all sets as a .json file, import one (the button, or a drop on the menu);
 *  a timeline strip, the cues as blocks sized by their bars: armed, the cue on stage lit with a playhead through it on
 *  the bar clock, a click plays a block's cue from the next bar line (director.jump); the blocks drag into order too. */
export function SetMenu() {
  const sets = useSyncExternalStore(library.onChange, library.sets)
  const armed = useSyncExternalStore(store.subscribe, () => store.getSnapshot().armedSet)
  const cue = useSyncExternalStore(store.subscribe, () => store.getSnapshot().cue) // re-renders the cue on stage too
  const [pick, setPick] = useState(() => armed ?? 0)
  const [naming, setNaming] = useState(false)
  const [sure, setSure] = useState(false) // delete set: the second click deletes
  const [line, setLine] = useState(-1) // a drag's insert line: above cue `line` (the cue count: the end)
  const [open, setOpen] = useState(false)
  const [, rerender] = useReducer((n: number) => n + 1, 0) // a jump's block outlined at once
  const drag = useRef<number | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const strip = useRef<HTMLDivElement>(null)
  const head = useRef<HTMLElement>(null)
  const [note, setNote] = useState<{ text: string; dropped: string[] } | null>(null) // the last import's report
  const i = Math.min(pick, sets.length - 1) // -1: no set yet
  const set = sets[i] as SetList | undefined
  const playing = armed === i ? director.cue() : null
  const on = playing ? set!.cues.indexOf(playing.of) : -1 // the cue on stage, lit
  // The playhead, open and armed: through the cue on stage's block by its bars played, round a hold's each bar. One rAF
  // loop writes its transform, no React state (as the input meter).
  useEffect(() => {
    if (!open || armed !== i || !set) return
    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const c = director.cue()
      const el = c && (strip.current?.children[set.cues.indexOf(c.of)] as HTMLElement | undefined)
      if (!c || !el) return
      const f = c.of.bars === 'hold' ? c.at % 1 : Math.min(1, c.at / c.of.bars)
      head.current!.style.transform = `translateX(${el.offsetLeft + el.offsetWidth * f}px)`
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [open, armed, i, set])
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
  /** A set file's sets after the user's, the first picked (setlist.ts importSets: a taken name gets a suffix), and the
   *  report: what came in, each left-out set or cue with its reason. */
  async function load(f: File) {
    const have = library.sets()
    const { sets: got, dropped } = importSets(have, await f.text())
    if (got.length) {
      library.setSets([...have, ...got])
      choose(have.length)
    }
    setNote({ text: got.length ? `Imported ${got.map((s) => `"${s.name}"`).join(', ')}` : `No set in ${f.name}`, dropped })
  }
  /** The drop's insert index under the pointer (the strip's blocks across, the list's rows down), or null for a drag
   *  that is not a cue's (a file: this menu imports a set file, the document plays the rest). */
  const over = (e: DragEvent<HTMLElement>) => {
    if (drag.current === null) return null
    e.preventDefault()
    const across = e.currentTarget === strip.current
    return insertIndex(across ? e.clientX : e.clientY, Array.from(e.currentTarget.querySelectorAll(':scope > :is(.cue, .blk)'), (el) => mid(el, across)))
  }
  const end = () => {
    drag.current = null
    setLine(-1)
  }
  const dragOver = (e: DragEvent<HTMLElement>) => {
    const at = over(e)
    if (at !== null) setLine(at)
  }
  const drop = (e: DragEvent<HTMLElement>) => {
    const at = over(e)
    const from = drag.current
    end()
    if (at !== null && from !== null && adjustForSource(at, from) !== from) save({ ...set!, cues: reorder(set!.cues, from, at) })
  }
  const dragStart = (e: DragEvent<HTMLElement>, k: number) => {
    e.dataTransfer.effectAllowed = 'move'
    drag.current = k
  }
  return (
    <details
      className="midi setlist"
      onPointerUp={release}
      onToggle={(e) => {
        setOpen(e.currentTarget.open)
        if (!e.currentTarget.open) setNote(null)
      }}
      onDrop={(e) => {
        const f = e.dataTransfer.files[0]
        if (!f?.name.toLowerCase().endsWith('.json')) return // audio: the document's drop plays it
        e.preventDefault()
        e.stopPropagation()
        void load(f)
      }}
    >
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
            {set.cues.length > 0 && (
              <div className="strip" ref={strip} onDragOver={dragOver} onDrop={drop} onDragEnd={end}>
                {set.cues.map((c, k) => (
                  <button
                    key={k}
                    className={`blk${k === on ? ' on' : ''}${c === playing?.jump ? ' next' : ''}${sceneName(c.scene) ? '' : ' gone'}${line === k ? ' ins' : ''}${line === set.cues.length && k === line - 1 ? ' end' : ''}`}
                    style={{ flex: c.bars === 'hold' ? 'none' : `${c.bars} 1 0` }}
                    draggable
                    title={`${k + 1}. ${sceneName(c.scene) ?? 'missing scene'} · ${length(c.bars)}${armed === i ? ' · click: from the next bar line' : ''} · drag to reorder`}
                    onDragStart={(e) => dragStart(e, k)}
                    onClick={() => {
                      if (armed !== i) return
                      director.jump(c)
                      rerender()
                    }}
                  >
                    {k + 1}
                    {c.bars === 'hold' ? ' ∞' : ` ${sceneName(c.scene) ?? ''}`}
                  </button>
                ))}
                <i ref={head} className="head" hidden={armed !== i} />
              </div>
            )}
            <div onDragOver={dragOver} onDrop={drop} onDragEnd={end}>
              {set.cues.map((c, k) => (
                <div key={k} className={`line cue${k === on ? ' on' : ''}${sceneName(c.scene) ? '' : ' gone'}${line === k ? ' ins' : ''}`}>
                  <span draggable title={`${c.scene}: drag to reorder`} onDragStart={(e) => dragStart(e, k)}>
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
        <span className="line">
          {set && (
            <button title="Download this set as a .json file" onClick={() => download(`veejay-set-${set.name}.json`, setFile([set]))}>
              export
            </button>
          )}
          {sets.length > 1 && (
            <button title="Download every set as one .json file" onClick={() => download('veejay-sets.json', setFile(sets))}>
              export all
            </button>
          )}
          <button title="Add the sets of a .json set file (or drop one on this menu)" onClick={() => file.current!.click()}>
            import…
          </button>
          <input
            ref={file}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = '' // the same file can come in again
              if (f) void load(f)
            }}
          />
        </span>
        {note && <p>{note.text}</p>}
        {note?.dropped.map((d, k) => (
          <p key={k} className="err">
            left out: {d}
          </p>
        ))}
      </div>
    </details>
  )
}
