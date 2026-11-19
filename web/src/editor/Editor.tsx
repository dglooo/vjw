import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { director } from '../app'
import type { SceneId } from '../doc'
import { fitStage } from '../gl/engine'
import { live, panel } from '../gl/live'
import { library } from '../library'
import { BUILTIN } from '../scenes/builtin'
import { store } from '../store'
import { Gpu, LibraryIo, SceneHead, type Say } from '../ui/Panel'
import { edits } from '../undo'
import { Library } from './Library'
import { Stack } from './Stack'
import { clampSel, type Sel } from './layers'
import './editor.css'

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
 *  CSS-scaled into its cell (fitStage). */
export function Editor() {
  const on = useSyncExternalStore(store.subscribe, () => store.getSnapshot().editor)
  return on ? <Open /> : null
}

function Open() {
  const id = useSyncExternalStore(store.subscribe, () => store.getSnapshot().edited)
  const [sel, select] = useState<Sel>({ layer: 0, fx: null })
  // The header's last result. Here, not in the Stack: New, open and Save as re-key it, and the note outlives that.
  const [note, setNote] = useState<{ text: string; err: boolean }>()
  const say: Say = (err, what, done) => setNote(err ? { text: `${what}: ${err}`, err: true } : { text: done, err: false })
  const cell = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => fitStage(cell.current!), [])
  useEffect(() => {
    // The editor's keys (design S1; app.ts lets only L, G and Esc through): undo/redo, Delete and Alt+↑/↓ on the selection (↑ =
    // towards the bottom layer, the first effect: up the list).
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
      } else return
      e.preventDefault()
    }
    addEventListener('keydown', keys)
    return () => removeEventListener('keydown', keys)
  }, [id, sel])
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
    >
      <Library />
      <div ref={cell} />
      {id && (
        <Stack key={id} id={id} sel={sel} select={select}>
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
