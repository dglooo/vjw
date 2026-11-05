import { useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { stage } from '../gl/engine'
import { store } from '../store'
import './editor.css'

/** The editor screen (2b, design S1; key L): library | preview | builder. The preview is the live stage itself,
 *  CSS-scaled into its cell. A transform leaves clientWidth alone, so measure(), the governor and the ring sizes stay
 *  live, and nothing reallocates on the way in or out. */
export function Editor() {
  const on = useSyncExternalStore(store.subscribe, () => store.getSnapshot().editor)
  return on ? <Open /> : null
}

function Open() {
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
  return (
    <div className="editor">
      <aside>Library</aside>
      <div ref={cell} />
      <aside>Builder</aside>
    </div>
  )
}
