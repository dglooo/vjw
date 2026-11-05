import { useEffect, useRef, useState, useSyncExternalStore, type DragEvent, type ReactNode } from 'react'
import type { LayerDoc, SceneId } from '../doc'
import { newLayer } from '../edit'
import { live, panel } from '../gl/live'
import { store } from '../store'
import { Fx, FxOptions, GenOptions, LAYERS_MAX, LayerHead, LayerParams, Meters } from '../ui/Panel'
import { adjustForSource, dragged, insertIndex, MIME } from './dnd'
import { clampSel, muteMask, type Sel } from './layers'

/** A row's vertical middle (client px), for the insert index. */
const mid = (el: Element) => {
  const r = el.getBoundingClientRect()
  return r.top + r.height / 2
}

/** The builder (2b S2.2, design S2): the edited scene's layers, bottom first, the selected one open with its opacity,
 *  speed, res, generator and effects; the selected layer or effect is what Delete and Alt+↑/↓ act on (Editor's keys).
 *  Every edit goes through `panel`, which records its undo. Mute and solo are the preview's only: never saved, never
 *  undone, reset on leave. It re-renders on a structural edit or an undo (editRev), never while a slider moves.
 *  `children`: the editor's header (S2.4), on top. `tried`: the new layer of a generator tried from the library (S3.1),
 *  soloed when it comes and still soloed once kept. */
export function Stack({ id, sel, select, tried, children }: { id: SceneId; sel: Sel; select: (s: Sel) => void; tried?: LayerDoc; children: ReactNode }) {
  const rev = useSyncExternalStore(store.subscribe, () => store.getSnapshot().editRev)
  const errors = useSyncExternalStore(store.subscribe, () => store.getSnapshot().nodeErrors)
  const { layers } = live(id).doc
  const s = clampSel(layers, sel)
  // Mute/solo by layer doc, so a move, a removal and its undo take them along.
  const [m, setM] = useState({ of: layers, muted: new Set<LayerDoc>(), solo: null as LayerDoc | null, tried: undefined as LayerDoc | undefined })
  if (m.of !== layers || m.tried !== tried) {
    // edit.ts cloned the doc on the scene's first edit: the same layers as new objects. ponytail: matched by position,
    // so a first edit that adds, moves or removes a layer shifts a mute set before it; match by content if that shows.
    setM({
      of: layers,
      muted: new Set(layers.filter((_, i) => m.muted.has(m.of[i]))),
      solo: tried && tried !== m.tried ? tried : m.solo && (layers[m.of.indexOf(m.solo)] ?? null),
      tried,
    })
  }
  const solo = m.solo ? layers.indexOf(m.solo) : -1
  const mask = muteMask(layers.map((l) => m.muted.has(l)), solo < 0 ? null : solo)
  useEffect(() => mask.forEach((on, i) => panel.mute(i, on))) // a layer built again (undo) comes unmuted
  useEffect(() => () => live(store.getSnapshot().edited).doc.layers.forEach((_, i) => panel.mute(i, false)), []) // leave
  const mute = (l: LayerDoc) => {
    const muted = new Set(m.muted)
    if (!muted.delete(l)) muted.add(l)
    setM({ ...m, muted })
  }
  // Drag to reorder (S2.3, design S8). The dragged row sits in a ref: a re-render in dragstart can cancel the drag.
  const drag = useRef<Sel | null>(null)
  const press = useRef<EventTarget | null>(null) // where the pointer went down: a drag starts from a row's head only
  // The insert line: above row `layer i` or `fx k` (n: above the add select); `onto i`: layer i takes a library effect.
  const [line, setLine] = useState('')
  const ins = (row: string) => (line === row ? ' ins' : '')
  /** The drop under the pointer: the dragged effect's chain, else the layers (a layer, or a library generator as a new
   *  one: room for it only below 4), at the insert index. A library effect (S3.1) goes onto the layer row under the
   *  pointer (`onto`, at = that row). Null: not ours, and the default stays (a file: the document's drop plays it). */
  const over = (e: DragEvent<HTMLElement>) => {
    const d = drag.current
    const b = !d && e.dataTransfer.types.includes(MIME) ? dragged.block : null
    if (!d && !b) return null
    const fx = d?.fx != null
    const onto = b?.kind === 'effect'
    const rows = Array.from(e.currentTarget.querySelectorAll(fx ? '.layer.on > .fx' : ':scope > .layer'))
    const at = onto ? rows.findIndex((r) => r.contains(e.target as Node)) : insertIndex(e.clientY, rows.map(mid))
    if (onto ? at < 0 : b && layers.length >= LAYERS_MAX) return null
    e.preventDefault()
    return { d, b, fx, onto, at }
  }
  const start = (e: DragEvent, from: Sel) => {
    e.stopPropagation() // an effect's row sits in its layer's
    const t = press.current
    // Chrome drags a draggable row even from a slider inside it: refused there, the slider keeps the pointer.
    if (!(t instanceof Element && t.closest('.head') && !t.closest('input, select, button'))) return e.preventDefault()
    e.dataTransfer.effectAllowed = 'move'
    drag.current = from
  }
  // ponytail: no dragleave, so the line stays while the pointer is off the list, until the drop or dragend.
  const end = () => {
    drag.current = null
    setLine('')
  }
  useEffect(() => {
    const clear = () => setLine('') // a library tile's dragend (S3.1) fires on the tile, outside this list
    addEventListener('dragend', clear)
    return () => removeEventListener('dragend', clear)
  }, [])
  return (
    <aside className="stack">
      {children}
      <Meters id={id} />
      {errors.map((e) => (
        <pre key={e} className="err">
          {e}
        </pre>
      ))}
      {/* Keyed by the edit: after a structural one or an undo, every control starts again from the doc. */}
      <div
        key={`${id} ${rev}`}
        onDragOver={(e) => {
          const t = over(e)
          if (t) setLine(t.onto ? `onto ${t.at}` : `${t.fx ? 'fx' : 'layer'} ${t.at}`)
        }}
        onDrop={(e) => {
          const t = over(e)
          if (!t) return
          end() // here too: the move re-keys this list, and dragend on a row that is gone never reaches React
          const { d, b, at } = t
          if (!d) {
            // A library block (S3.1), added for good (no try mark): an effect at the end of that layer's chain, a
            // generator as a new layer at the line.
            const k = t.onto ? layers[at].fx.length : null
            if (k === null ? panel.insertLayer(newLayer(structuredClone(b!.node!)), at) : panel.addFx(at, b!.id, k)) select({ layer: at, fx: k })
            return
          }
          const from = d.fx ?? d.layer
          const to = adjustForSource(at, from)
          if (to === from) return // no undo step for a no-op
          if (d.fx === null) panel.moveLayer(from, to)
          else panel.moveFx(d.layer, from, to)
          select(d.fx === null ? { layer: to, fx: null } : { ...d, fx: to })
        }}
        onDragEnd={end}
        onPointerDownCapture={(e) => (press.current = e.target)}
      >
        {layers.map((l, i) => (
          // Selected on click, not pointer-down: opening a layer moves the rows below, which would lose the click. In
          // capture, so a button's own select (duplicate) and an effect's (its row) come after and win.
          <section
            key={i}
            className={`layer${i === s.layer ? ' on' : ''}${mask[i] ? ' muted' : ''}${ins(`layer ${i}`)}${line === `onto ${i}` ? ' drop' : ''}`}
            draggable
            onDragStart={(e) => start(e, { layer: i, fx: null })}
            onClickCapture={() => select({ layer: i, fx: null })}
          >
            <LayerHead i={i} l={l} n={layers.length}>
              <button aria-pressed={m.muted.has(l)} title="Mute (preview only)" onClick={() => mute(l)}>
                M
              </button>
              <button aria-pressed={m.solo === l} title="Solo (preview only)" onClick={() => setM({ ...m, solo: m.solo === l ? null : l })}>
                S
              </button>
              <button
                aria-label="Duplicate layer"
                title="Duplicate"
                disabled={layers.length >= LAYERS_MAX}
                onClick={() => panel.insertLayer(structuredClone(l), i + 1) && select({ layer: i + 1, fx: null })}
              >
                ⧉
              </button>
            </LayerHead>
            {i === s.layer && (
              <>
                <LayerParams i={i} l={l} />
                <Fx path={{ layer: i, node: 'gen' }} n={l.gen} />
                {l.fx.map((n, k) => (
                  <div
                    key={k}
                    className={`fx${k === s.fx ? ' on' : ''}${ins(`fx ${k}`)}`}
                    draggable
                    onDragStart={(e) => start(e, { layer: i, fx: k })}
                    onClickCapture={() => select({ layer: i, fx: k })}
                  >
                    <Fx path={{ layer: i, node: k }} n={n} onRemove={() => panel.removeFx(i, k)} />
                  </div>
                ))}
                <select
                  className={`add${ins(`fx ${l.fx.length}`)}`}
                  value=""
                  onChange={(e) => {
                    const k = l.fx.length // appended there
                    if (panel.addFx(i, e.target.value)) select({ layer: i, fx: k })
                  }}
                >
                  <option value="" disabled>
                    + effect
                  </option>
                  <FxOptions />
                </select>
              </>
            )}
          </section>
        ))}
        <select
          className={`add${ins(`layer ${layers.length}`)}`}
          value=""
          disabled={layers.length >= LAYERS_MAX}
          onChange={(e) => {
            const i = layers.length // on top
            if (panel.addLayer(e.target.value)) select({ layer: i, fx: null })
          }}
        >
          <option value="" disabled>
            {layers.length >= LAYERS_MAX ? `${LAYERS_MAX} layers` : '+ layer'}
          </option>
          <GenOptions />
        </select>
      </div>
    </aside>
  )
}
