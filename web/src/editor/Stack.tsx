import { useEffect, useState, useSyncExternalStore } from 'react'
import type { LayerDoc, SceneId } from '../doc'
import { live, panel } from '../gl/live'
import { store } from '../store'
import { Fx, FxOptions, GenOptions, Gpu, LAYERS_MAX, LayerHead, LayerParams, Meters } from '../ui/Panel'
import { clampSel, muteMask, type Sel } from './stack'

/** The builder (2b S2.2, design S2): the edited scene's layers, bottom first, the selected one open with its opacity,
 *  speed, res, generator and effects; the selected layer or effect is what Delete and Alt+↑/↓ act on (Editor's keys).
 *  Every edit goes through `panel`, which records its undo. Mute and solo are the preview's only: never saved, never
 *  undone, reset on leave. It re-renders on a structural edit or an undo (editRev), never while a slider moves. */
export function Stack({ id, sel, select }: { id: SceneId; sel: Sel; select: (s: Sel) => void }) {
  const rev = useSyncExternalStore(store.subscribe, () => store.getSnapshot().editRev)
  const errors = useSyncExternalStore(store.subscribe, () => store.getSnapshot().nodeErrors)
  const { layers, name } = live(id).doc
  const s = clampSel(layers, sel)
  // Mute/solo by layer doc, so a move, a removal and its undo take them along.
  const [m, setM] = useState({ of: layers, muted: new Set<LayerDoc>(), solo: null as LayerDoc | null })
  if (m.of !== layers) {
    // edit.ts cloned the doc on the scene's first edit: the same layers as new objects. ponytail: matched by position,
    // so a first edit that adds, moves or removes a layer shifts a mute set before it; match by content if that shows.
    setM({
      of: layers,
      muted: new Set(layers.filter((_, i) => m.muted.has(m.of[i]))),
      solo: m.solo && (layers[m.of.indexOf(m.solo)] ?? null),
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
  return (
    <aside className="stack">
      <header>
        <span>{name}</span>
        <Gpu />
      </header>
      <Meters id={id} />
      {errors.map((e) => (
        <pre key={e} className="err">
          {e}
        </pre>
      ))}
      {/* Keyed by the edit: after a structural one or an undo, every control starts again from the doc. */}
      <div key={`${id} ${rev}`}>
        {layers.map((l, i) => (
          // Selected on click, not pointer-down: opening a layer moves the rows below, which would lose the click. In
          // capture, so a button's own select (duplicate) and an effect's (its row) come after and win.
          <section key={i} className={`layer${i === s.layer ? ' on' : ''}${mask[i] ? ' muted' : ''}`} onClickCapture={() => select({ layer: i, fx: null })}>
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
                  <div key={k} className={k === s.fx ? 'fx on' : 'fx'} onClickCapture={() => select({ layer: i, fx: k })}>
                    <Fx path={{ layer: i, node: k }} n={n} onRemove={() => panel.removeFx(i, k)} />
                  </div>
                ))}
                <select
                  className="add"
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
          className="add"
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
