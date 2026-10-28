import { useState, useSyncExternalStore, type ReactNode } from 'react'
import { BIND_DEFAULTS, SOURCE_IDS, type Binding, type Shape } from '../bind'
import { defaults, type Blend, type NodeDoc } from '../doc'
import { catalog, toyDef } from '../fx/catalog'
import type { Kind, Value } from '../fx/types'
import { live, panel, type NodePath } from '../gl/live'
import { store, type UiSnapshot } from '../store'
import './panel.css'

const GPU_BUDGET = 5 // ms per scene (CP4's bench gate): the hint turns amber above 80 % of it, red above it
const LAYERS_MAX = 4 // doc.ts's limit
const BLENDS: readonly Blend[] = ['normal', 'add', 'screen', 'multiply']
const SHAPES: readonly Shape[] = ['sine', 'tri', 'saw', 'square', 'random']
const PHASES = ['beat', 'bar', 'lfo'] // counts, not levels: bound through a shape
const byName = (k: Kind) => [...catalog.values()].filter((d) => d.kind === k).sort((a, b) => a.name.localeCompare(b.name))
const GENERATORS = byName('generator')
const FILTERS = (['feedback', 'geometry', 'liquid', 'retro', undefined] as const)
  .map((c) => [c ?? 'other', byName('filter').filter((d) => d.category === c)] as const)
  .filter(([, ds]) => ds.length)
const LEVELS = SOURCE_IDS.filter((s) => !s.startsWith('band'))
const BANDS = SOURCE_IDS.filter((s) => s.startsWith('band'))
/** Band i's lower edge, as energy.ts spaces the bands (log 30 Hz–16 kHz). */
const hz = (i: number) => {
  const f = 30 * (16000 / 30) ** (i / BANDS.length)
  return f < 1000 ? `${Math.round(f)} Hz` : `${(f / 1000).toFixed(1)} kHz`
}
const defOf = (n: NodeDoc) => (n.ref.startsWith('toy/') ? toyDef(n) : catalog.get(n.ref)) // as live.ts finds it
const hex = (c: readonly number[]) =>
  `#${c.slice(0, 3).map((x) => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0')).join('')}`
/** A color row's value, read back from its two inputs (the swatch and the alpha slider). */
function rgba(el: HTMLElement) {
  const [c, a] = el.parentElement!.querySelectorAll('input')
  return [1, 3, 5].map((j) => parseInt(c.value.slice(j, j + 2), 16) / 255).concat(a.valueAsNumber)
}
/** A binding moved to another source: a phase source needs a shape (saw: 1 on the beat, falling), a level has none. */
function withSource({ shape, rate, ...b }: Binding, source: string): Binding {
  if (!PHASES.includes(source)) return { ...b, source }
  return { ...b, source, shape: shape ?? (source === 'lfo' ? 'sine' : 'saw'), rate: rate ?? 1 }
}
/** A binding as the edited scene's doc holds it now. */
function bindingAt({ layer, node }: NodePath, k: string): Binding {
  const l = live(store.getSnapshot().edited).doc.layers[layer]
  const o: { bind?: Record<string, Binding> } = node === 'layer' ? l : node === 'gen' ? l.gen : l.fx[node]
  return o.bind![k]
}
const useSnap = <K extends keyof UiSnapshot>(k: K) => useSyncExternalStore(store.subscribe, () => store.getSnapshot()[k])

/** Uncontrolled: dragging calls `set` and nothing re-renders. */
const slider = (lo: number, hi: number, v: number, set: (v: number) => void, step = (hi - lo) / 100) => (
  <input type="range" min={lo} max={hi} step={step} defaultValue={v} onInput={(e) => set(e.currentTarget.valueAsNumber)} />
)

interface Bindable { path: NodePath; k: string; lo: number; hi: number; init?: Binding }

/** One parameter row. A numeric one gets a bind dot that opens its binding's controls (design E3) under it. */
function Param({ label, bind, children }: { label: string; bind?: Bindable; children: ReactNode }) {
  const [b, show] = useState(bind?.init) // what is drawn: bound or not, and whether the source takes a shape
  const send = (x: Binding | undefined, redraw = false) => {
    panel.setBinding(bind!.path, bind!.k, x ?? null)
    if (redraw) show(x)
  }
  const now = () => bindingAt(bind!.path, bind!.k) // the sliders' edits are in the doc, not in `b`
  const knob = (f: 'amount' | 'attack' | 'release' | 'min' | 'max' | 'rate', lo: number, hi: number, step?: number) => (
    <label>
      <span>{f}</span>
      {slider(lo, hi, b![f] ?? 1, (y) => send({ ...now(), [f]: y }), step)}
    </label>
  )
  return (
    <>
      <label className="row">
        <span>{label}</span>
        {children}
        {bind && (
          <button
            className={b ? 'dot on' : 'dot'}
            aria-pressed={!!b}
            title={b ? `Unbind ${label}` : `Bind ${label} to the music`}
            onClick={() => send(b ? undefined : { source: 'bass', ...BIND_DEFAULTS, min: bind.lo, max: bind.hi }, true)}
          />
        )}
      </label>
      {b && bind && (
        <div className="bind">
          <div className="src">
            <select aria-label="Source" defaultValue={b.source} onChange={(e) => send(withSource(now(), e.target.value), true)}>
              {LEVELS.map((s) => <option key={s}>{s}</option>)}
              <optgroup label="band">
                {BANDS.map((s, i) => <option key={s} value={s}>{`${i} · ${hz(i)}`}</option>)}
              </optgroup>
            </select>
            {b.shape && (
              <select aria-label="Shape" defaultValue={b.shape} onChange={(e) => send({ ...now(), shape: e.target.value as Shape })}>
                {SHAPES.map((s) => <option key={s}>{s}</option>)}
              </select>
            )}
          </div>
          {knob('amount', 0, 4)}
          {knob('attack', 0, 1)}
          {knob('release', 0, 1)}
          {knob('min', bind.lo, bind.hi)}
          {knob('max', bind.lo, bind.hi)}
          {b.shape && knob('rate', 0.05, 4, 0.05)}
        </div>
      )}
    </>
  )
}

/** A node's inputs as controls by their type (design E3); images and audio have none. */
function Fx({ path, n, onRemove }: { path: NodePath; n: NodeDoc; onRemove?: () => void }) {
  const def = defOf(n)
  const v: Record<string, Value> = def ? { ...defaults(def), ...n.values } : {}
  return (
    <div className="node">
      {onRemove && (
        <div className="head">
          <span>{def?.name ?? n.ref}</span>
          <button className="x" aria-label="Remove effect" onClick={onRemove}>
            ×
          </button>
        </div>
      )}
      {def?.inputs.map((x) => {
        const label = x.label ?? x.name
        const set = (y: Value) => panel.setValue(path, x.name, y)
        const bind = (k: string, lo: number, hi: number): Bindable => ({ path, k, lo, hi, init: n.bind?.[k] })
        const val = v[x.name]
        switch (x.type) {
          case 'float': {
            const lo = (x.min as number | undefined) ?? 0
            const hi = (x.max as number | undefined) ?? 1
            return (
              <Param key={x.name} label={label} bind={bind(x.name, lo, hi)}>
                {slider(lo, hi, val as number, set)}
              </Param>
            )
          }
          case 'long': {
            const vals = x.values ?? []
            return (
              <Param key={x.name} label={label} bind={bind(x.name, Math.min(...vals), Math.max(...vals))}>
                <select defaultValue={String(val)} onChange={(e) => set(Number(e.target.value))}>
                  {vals.map((y, j) => (
                    <option key={y} value={y}>
                      {x.labels?.[j] ?? y}
                    </option>
                  ))}
                </select>
              </Param>
            )
          }
          case 'bool':
            return (
              <Param key={x.name} label={label}>
                <input type="checkbox" defaultChecked={val as boolean} onChange={(e) => set(e.target.checked)} />
              </Param>
            )
          case 'event':
            return (
              <Param key={x.name} label={label}>
                <button onClick={() => set(true)}>trigger</button>
              </Param>
            )
          case 'color':
            return (
              <Param key={x.name} label={label}>
                <span className="pair">
                  <input type="color" defaultValue={hex(val as number[])} onInput={(e) => set(rgba(e.currentTarget))} />
                  <input type="range" min={0} max={1} step={0.01} defaultValue={(val as number[])[3]} onInput={(e) => set(rgba(e.currentTarget))} />
                </span>
              </Param>
            )
          case 'point2D': {
            const xy = [...(val as number[])] // both sliders' value, each writes its own component
            return ['x', 'y'].map((c, j) => {
              const lo = (x.min as number[] | undefined)?.[j] ?? 0
              const hi = (x.max as number[] | undefined)?.[j] ?? 1
              return (
                <Param key={`${x.name}.${j}`} label={`${label} ${c}`} bind={bind(`${x.name}.${j}`, lo, hi)}>
                  {slider(lo, hi, xy[j], (y) => {
                    xy[j] = y
                    set([...xy])
                  })}
                </Param>
              )
            })
          }
          default:
            return null // images and audio: the engine wires them
        }
      })}
    </div>
  )
}

/** The GPU hint: the edited scene's median against the budget. Its 4×/s update re-renders only this. */
function Gpu() {
  const ms = useSnap('gpuMs')
  if (ms === null) return null // no GPU timer
  return <span className={ms > GPU_BUDGET ? 'gpu over' : ms > 0.8 * GPU_BUDGET ? 'gpu near' : 'gpu'}>GPU {ms.toFixed(1)} ms</span>
}

/** The effects panel (spec §2.4, design E6) over the output: the edited scene's layers, their nodes' controls and
 *  bindings, add/remove. It renders on a structural edit (editRev) or another scene, never while a slider moves: the
 *  controls are uncontrolled and call `panel`, which edits the running scene in place. It fades out with the bar. */
export function Panel() {
  const open = useSnap('panel')
  const id = useSnap('edited')
  const rev = useSnap('editRev')
  const errors = useSnap('nodeErrors')
  if (!open || !id) return null
  const { layers } = live(id).doc // its name is the bar's, right above
  return (
    <div
      className="panel"
      onKeyDown={(e) => {
        // app.ts skips keys in a focused field, Esc too: hand it a fresh one, it closes and restores the hold.
        if (e.code === 'Escape') dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }))
      }}
      onPointerUp={(e) => {
        // Mouse use leaves no focus behind, so the hotkeys stay live: Space would press a focused button again.
        const t = e.target
        if (t instanceof HTMLButtonElement || (t instanceof HTMLInputElement && t.type !== 'color')) t.blur()
      }}
      onChange={(e) => {
        if (e.target instanceof HTMLSelectElement) e.target.blur() // a focused select picks by type-ahead
      }}
    >
      <header>
        <Gpu />
      </header>
      {errors.map((e) => (
        <pre key={e} className="err">
          {e}
        </pre>
      ))}
      {/* Keyed by the edit: after a structural one, every control starts again from the doc. */}
      <div key={`${id} ${rev}`}>
        {layers.map((l, i) => {
          const at: NodePath = { layer: i, node: 'layer' }
          const set = (k: string) => (y: number) => panel.setValue(at, k, y)
          return (
            <section key={i} className="layer">
              <div className="head">
                <span>
                  {i + 1} · {defOf(l.gen)?.name ?? l.gen.ref}
                </span>
                <select aria-label="Blend" defaultValue={l.blend} onChange={(e) => panel.setBlend(i, e.target.value as Blend)}>
                  {BLENDS.map((b) => <option key={b}>{b}</option>)}
                </select>
                {layers.length > 1 && (
                  <button className="x" aria-label="Remove layer" onClick={() => panel.removeLayer(i)}>
                    ×
                  </button>
                )}
              </div>
              <Param label="opacity" bind={{ path: at, k: 'opacity', lo: 0, hi: 1, init: l.bind?.opacity }}>
                {slider(0, 1, l.opacity, set('opacity'))}
              </Param>
              <Param label="layer speed" bind={{ path: at, k: 'speed', lo: 0, hi: 4, init: l.bind?.speed }}>
                {slider(0, 4, l.speed, set('speed'))}
              </Param>
              <Param label="res">{slider(0.25, 1, l.res, set('res'), 0.05)}</Param>
              <Fx path={{ layer: i, node: 'gen' }} n={l.gen} />
              {l.fx.map((n, k) => (
                <Fx key={k} path={{ layer: i, node: k }} n={n} onRemove={() => panel.removeFx(i, k)} />
              ))}
              <select className="add" value="" onChange={(e) => panel.addFx(i, e.target.value)}>
                <option value="" disabled>
                  + effect
                </option>
                {FILTERS.map(([c, ds]) => (
                  <optgroup key={c} label={c}>
                    {ds.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </section>
          )
        })}
        <select className="add" value="" disabled={layers.length >= LAYERS_MAX} onChange={(e) => panel.addLayer(e.target.value)}>
          <option value="" disabled>
            {layers.length >= LAYERS_MAX ? `${LAYERS_MAX} layers` : '+ layer'}
          </option>
          {GENERATORS.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
