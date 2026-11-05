import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { stage } from '../gl/engine'
import { live, panel } from '../gl/live'
import { store } from '../store'
import { edits } from '../undo'
import { Stack } from './Stack.tsx' // with its extension: on a case-blind disk './Stack' finds stack.ts first
import { clampSel, type Sel } from './stack'
import './editor.css'

/** A text field keeps its own keys (Cmd+Z, Delete). A slider, checkbox or select has no text selection (null). */
const typing = (t: EventTarget | null) => t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && t.selectionStart !== null)

/** The editor screen (2b, design S1; key L): library | preview | builder. The preview is the live stage itself,
 *  CSS-scaled into its cell. A transform leaves clientWidth alone, so measure(), the governor and the ring sizes stay
 *  live, and nothing reallocates on the way in or out. */
export function Editor() {
  const on = useSyncExternalStore(store.subscribe, () => store.getSnapshot().editor)
  return on ? <Open /> : null
}

function Open() {
  const id = useSyncExternalStore(store.subscribe, () => store.getSnapshot().edited)
  const [sel, select] = useState<Sel>({ layer: 0, fx: null })
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
    // The editor's keys (design S1; app.ts lets only L through): undo/redo, and Delete and Alt+↑/↓ on the selection
    // (↑ = towards the bottom layer, the first effect: up the list).
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
      <aside>Library</aside>
      <div ref={cell} />
      {id && <Stack key={id} id={id} sel={sel} select={select} />}
    </div>
  )
}
