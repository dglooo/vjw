import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { director } from '../app'
import type { LayerDoc, SceneId } from '../doc'
import { newLayer } from '../edit'
import { stage } from '../gl/engine'
import { live, panel } from '../gl/live'
import { library } from '../library'
import { BUILTIN } from '../scenes/builtin'
import { store } from '../store'
import { Gpu, LAYERS_MAX, LibraryIo, SceneHead, type Say } from '../ui/Panel'
import { edits, type Step } from '../undo'
import { Library } from './Library'
import { Stack } from './Stack'
import type { Block } from './blocks'
import { clampSel, type Sel } from './layers'
import './editor.css'

/** A block on trial from the library (design S3, spec §2.2): `step` is its add, `sel` the selection before it, `solo` a
 *  generator's new layer. Pending while its add is the top undo step: Enter or any other edit keeps it. */
interface Tried { id: string; step: Step | undefined; sel: Sel; solo?: LayerDoc }

/** A text field keeps its own keys (Cmd+Z, Delete). A slider, checkbox or select has no text selection (null). */
const typing = (t: EventTarget | null) => t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && t.selectionStart !== null)
let libRev = 0 // +1 per library change, as Panel.tsx's: the open list and Export follow a save or an import
library.onChange(() => libRev++)

/** The editor's header (S2.4), on top of the builder: New, open (any library scene, starred or not), the GPU hint; then
 *  the scene's star, Save and Save as… (the panel's SceneHead), Export and Import. Both cut (director.cut), so
 *  `store.edited` follows and undo starts again (S1.2). */
function Head({ id, say }: { id: SceneId; say: Say }) {
  useSyncExternalStore(library.onChange, () => libRev)
  const scenes = [...BUILTIN.map((b) => library.get(b.id)!), ...library.all()]
  if (!library.get(id)) scenes.push(live(id).doc) // New's draft, until it is saved
  return (
    <>
      <header>
        <button title="A new scene: one Spectrum layer" onClick={() => director.cut(panel.newScene())}>
          New
        </button>
        <select aria-label="Open a scene" value={id} onChange={(e) => director.cut(e.target.value)}>
          {scenes.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <Gpu />
      </header>
      <SceneHead id={id} say={say}>
        <LibraryIo say={say} />
      </SceneHead>
    </>
  )
}

/** The editor screen (2b, design S1; key L): library | preview | builder. The preview is the live stage itself,
 *  CSS-scaled into its cell. A transform leaves clientWidth alone, so measure(), the governor and the ring sizes stay
 *  live, and nothing reallocates on the way in or out. */
export function Editor() {
  const on = useSyncExternalStore(store.subscribe, () => store.getSnapshot().editor)
  return on ? <Open /> : null
}

function Open() {
  const id = useSyncExternalStore(store.subscribe, () => store.getSnapshot().edited)
  useSyncExternalStore(store.subscribe, () => store.getSnapshot().editRev) // the try's mark goes with an edit or an undo
  const [sel, select] = useState<Sel>({ layer: 0, fx: null })
  const [tried, setTried] = useState<Tried | null>(null)
  const trying = tried && edits.top() === tried.step ? tried : null
  /** A library block into the edited scene (design S3): an effect at the end of the selected layer's chain; a generator
   *  on top as a new layer (soloed when tried), or, at 4 layers, in place of the selected layer's. `mark`: a tile's
   *  click tries it, in place of the block on trial (undo, then add); `+` adds it for good. A scene tile opens it. */
  const pick = (b: Block, mark: boolean) => {
    if (b.kind === 'scene') return director.cut(b.id)
    if (!id) return
    let back = clampSel(live(id).doc.layers, sel)
    if (mark && trying) {
      edits.undo()
      back = trying.sel
    }
    const { layers } = live(id).doc
    const l = back.layer
    const k = layers[l].fx.length
    const n = layers.length
    let to: Sel | null = null
    let solo: LayerDoc | undefined
    if (b.kind === 'effect') {
      if (panel.addFx(l, b.id, k)) to = { layer: l, fx: k }
    } else if (n < LAYERS_MAX) {
      solo = newLayer(structuredClone(b.node!))
      if (panel.insertLayer(solo, n)) to = { layer: n, fx: null }
    } else if (panel.setGen(l, b.node!)) to = { layer: l, fx: null }
    select(to ?? back)
    setTried(mark && to ? { id: b.id, step: edits.top(), sel: back, solo } : null)
  }
  // The header's last result. Here, not in the Stack: New, open and Save as re-key it, and the note outlives that.
  const [note, setNote] = useState<{ text: string; err: boolean }>()
  const say: Say = (err, what, done) => setNote(err ? { text: `${what}: ${err}`, err: true } : { text: done, err: false })
  const cell = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = cell.current!
    // Letterboxed fit, centre on centre: the stage sits at 0,0 and scales about its own centre (the default origin).
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      const w = stage.clientWidth
      const h = stage.clientHeight
      const k = Math.min(r.width / w, r.height / h)
      stage.style.transform = `translate(${r.x + (r.width - w) / 2}px, ${r.y + (r.height - h) / 2}px) scale(${k})`
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      stage.style.transform = ''
    }
  }, [])
  useEffect(() => {
    // The editor's keys (design S1; app.ts lets only L through): undo/redo, Delete and Alt+↑/↓ on the selection (↑ =
    // towards the bottom layer, the first effect: up the list), and a tried block's Enter (keep) and Esc (take back).
    const keys = (e: KeyboardEvent) => {
      if (typing(e.target) || !id) return // no id before Start: no scene yet
      const { layers } = live(id).doc
      const s = clampSel(layers, sel)
      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyZ') {
        if (e.shiftKey) edits.redo()
        else edits.undo()
      } else if (e.code === 'Delete' || e.code === 'Backspace') {
        if (s.fx === null) panel.removeLayer(s.layer) // refused at one layer
        else panel.removeFx(s.layer, s.fx)
      } else if (e.altKey && (e.code === 'ArrowUp' || e.code === 'ArrowDown')) {
        const to = (s.fx ?? s.layer) + (e.code === 'ArrowUp' ? -1 : 1)
        if (to >= 0 && to < (s.fx === null ? layers : layers[s.layer].fx).length) {
          if (s.fx === null) panel.moveLayer(s.layer, to)
          else panel.moveFx(s.layer, s.fx, to)
          select(s.fx === null ? { layer: to, fx: null } : { ...s, fx: to })
        }
      } else if (tried && (e.code === 'Escape' || e.code === 'Enter')) {
        if (e.code === 'Escape' && edits.top() === tried.step) {
          edits.undo()
          select(tried.sel)
        }
        setTried(null)
      } else return
      e.preventDefault()
    }
    addEventListener('keydown', keys)
    return () => removeEventListener('keydown', keys)
  }, [id, sel, tried])
  return (
    <div
      className="editor"
      onPointerUp={(e) => {
        // As the panel: mouse use leaves no focus behind, so L and these keys stay live and Space presses nothing again.
        const t = e.target
        if (t instanceof HTMLButtonElement || (t instanceof HTMLInputElement && t.type !== 'color' && !typing(t))) t.blur()
      }}
      onChange={(e) => {
        if (e.target instanceof HTMLSelectElement) e.target.blur() // a focused select picks by type-ahead
      }}
      // A value edit in the builder keeps the tried block: its mark goes at once (Esc checks the undo stack anyway).
      onInput={(e) => (e.target as Element).closest('.library') || setTried(null)}
    >
      <Library trying={trying?.id} pick={pick} />
      <div ref={cell} />
      {id && (
        <Stack key={id} id={id} sel={sel} select={select} tried={trying?.solo}>
          <Head id={id} say={say} />
          {note && (
            <p key={note.text} className={note.err ? 'err' : 'note'} onAnimationEnd={() => setNote(undefined)}>
              {note.text}
            </p>
          )}
        </Stack>
      )}
    </div>
  )
}
