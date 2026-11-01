import { useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react'
import { director, settings } from '../app'
import { activePreset } from '../audio/settings'
import { PRESETS } from '../audio/presets'
import { BAND_COUNT } from '../audio/energy'
import { BIND_DEFAULTS, sourceGroups, type Binding, type Shape } from '../bind'
import { defaults, type Blend, type NodeDoc, type SceneId } from '../doc'
import { catalog, toyDef } from '../fx/catalog'
import type { Kind, Value } from '../fx/types'
import { live, panel, type NodePath } from '../gl/live'
import { library } from '../library'
import { SourcesTab } from './SourcesTab'
import { BUILTIN } from '../scenes/builtin'
import { store, type UiSnapshot } from '../store'
import './panel.css'

const GPU_BUDGET = 5 // ms per scene (CP4's bench gate): the hint turns amber above 80 % of it, red above it
const LAYERS_MAX = 4 // doc.ts's limit
const BLENDS: readonly Blend[] = ['normal', 'add', 'screen', 'multiply']
const SHAPES: readonly Shape[] = ['sine', 'tri', 'saw', 'square', 'random']
const PHASES = ['beat', 'bar', 'lfo'] // counts, not levels: bound through a shape
const PASTE = 'toy/' // the "+ layer" entry that opens the Shadertoy paste
const byName = (k: Kind) => [...catalog.values()].filter((d) => d.kind === k).sort((a, b) => a.name.localeCompare(b.name))
const GENERATORS = byName('generator')
const FILTERS = (['feedback', 'geometry', 'liquid', 'retro', undefined] as const)
  .map((c) => [c ?? 'other', byName('filter').filter((d) => d.category === c)] as const)
  .filter(([, ds]) => ds.length)
/** Band i's lower edge, as energy.ts spaces the bands (log 30 Hz–16 kHz). */
const hz = (i: number) => {
  const f = 30 * (16000 / 30) ** (i / BAND_COUNT)
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
let libRev = 0 // +1 per library change (subscribed first, so React reads the new count): stars and lists re-render
library.onChange(() => libRev++)
// A file dragged in wakes the idle overlay as a mouse move does, so the panel is there to take a dropped library.
addEventListener('dragover', () => dispatchEvent(new MouseEvent('mousemove')))

/** Uncontrolled: dragging calls `set` and nothing re-renders. */
const slider = (lo: number, hi: number, v: number, set: (v: number) => void, step = (hi - lo) / 100) => (
  <input type="range" min={lo} max={hi} step={step} defaultValue={v} onInput={(e) => set(e.currentTarget.valueAsNumber)} />
)

interface Bindable { path: NodePath; k: string; lo: number; hi: number; init?: Binding }

/** S6.3's dim hint: a built-in row whose source the active preset's map rewrites while Auto-style is on. Its own
 * component, so only a bound row's select subscribes to the settings and the classifier's 4×/s update. */
function AutoHint({ source }: { source: string }) {
  const s = useSyncExternalStore(settings.onChange, settings.get)
  const detected = useSyncExternalStore(store.subscribe, () => store.getSnapshot().style.detected)
  const id = useSnap('edited')
  const target = s.auto && id.startsWith('builtin:') ? PRESETS[activePreset(s, detected)].map[source] : undefined
  return target ? <span className="hint">→ {target} (auto-style)</span> : null
}

/** One parameter row. A numeric one gets a bind dot that opens its binding's controls (design E3) under it. */
function Param({ label, bind, children }: { label: string; bind?: Bindable; children: ReactNode }) {
  const [b, show] = useState(bind?.init) // what is drawn: bound or not, and whether the source takes a shape
  const s = useSyncExternalStore(settings.onChange, settings.get) // the custom bands in the select
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
              {sourceGroups(s.custom).map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.ids.map((sid, i) => (
                    <option key={sid} value={sid}>
                      {g.label === 'band' ? `${i} · ${hz(i)}` : g.label === 'custom' ? s.custom.find((c) => c.id === sid)?.name ?? sid : sid}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <AutoHint source={b.source} />
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

/** The Shadertoy paste (spec §4.4, design E5): a single-pass `mainImage` becomes a new top layer, or its compile log
 *  shows under the code. A modal: keys stay in it (no hotkeys while typing; Esc closes the dialog only). */
function Paste({ ref }: { ref: RefObject<HTMLDialogElement | null> }) {
  const [log, setLog] = useState('')
  return (
    <dialog
      ref={ref}
      className="paste"
      onKeyDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()} // the panel's blur-on-pointer-up would unfocus the credit field
      onClose={() => {
        setLog('')
        ;(document.activeElement as HTMLElement | null)?.blur() // focus came back to "+ layer": no type-ahead
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const f = new FormData(e.currentTarget)
          const err = panel.pasteToy(String(f.get('code')), String(f.get('credit')).trim())
          setLog(err ?? '')
          if (err) return
          e.currentTarget.reset()
          ref.current!.close()
        }}
      >
        <p>
          A single-pass Shadertoy shader becomes a new layer. iChannel0 is the music: spectrum in row 0, waveform in row 1.
        </p>
        <textarea name="code" required spellCheck={false} placeholder="void mainImage(out vec4 fragColor, in vec2 fragCoord) { … }" />
        <input name="credit" autoComplete="off" placeholder="Credit: author · URL · license" />
        {log && <pre className="err">{log}</pre>}
        <div className="buttons">
          <button type="button" onClick={() => ref.current!.close()}>
            Cancel
          </button>
          <button>Add layer</button>
        </div>
      </form>
    </dialog>
  )
}

/** The effects panel (spec §2.4, design E6) over the output: the edited scene's layers, their nodes' controls and
 *  bindings, add/remove; the scene's star and saving, and the library (E4). It renders on a structural edit (editRev),
 *  another scene or a library change, never while a slider moves: the controls are uncontrolled and call `panel`,
 *  which edits the running scene in place. It fades out with the bar. */
export function Panel() {
  const open = useSnap('panel')
  const id = useSnap('edited')
  return open && id ? <Open id={id} /> : null
}

/** The open panel. Its state (the last library note) goes when it closes. */
function Open({ id }: { id: SceneId }) {
  const rev = useSnap('editRev')
  const errors = useSnap('nodeErrors')
  useSyncExternalStore(library.onChange, () => libRev)
  const paste = useRef<HTMLDialogElement>(null)
  const file = useRef<HTMLInputElement>(null)
  const [note, setNote] = useState<{ text: string; err: boolean }>()
  const [naming, setNaming] = useState(false) // Save as… swaps the header row for its name field
  const [tab, setTab] = useState<'scene' | 'sources'>('scene') // a view concern, not a store field (S6.1)
  const say = (err: string | null, what: string, done: string) => setNote(err ? { text: `${what}: ${err}`, err: true } : { text: done, err: false })
  const load = async (f: File) => say(await library.importFile(f), 'Import', `Imported ${f.name}`)
  const { layers, name } = live(id).doc // its name is the bar's, right above
  const star = !!library.get(id)?.star
  const builtin = id.startsWith('builtin:')
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
      onDrop={(e) => {
        const f = e.dataTransfer.files[0]
        if (!f?.name.toLowerCase().endsWith('.json')) return // audio: the document's drop plays it
        e.preventDefault()
        e.stopPropagation()
        void load(f)
      }}
    >
      <div className="tabs">
        {(['scene', 'sources'] as const).map((t) => (
          <button key={t} className={tab === t ? 'on' : undefined} aria-pressed={tab === t} onClick={() => setTab(t)}>
            {t === 'scene' ? 'Scene' : 'Sources'}
          </button>
        ))}
      </div>
      <header>
        {naming ? (
          // Not a prompt(): it blocks the main thread, so the picture froze while the name was typed. Keys stay in the
          // field as in Paste (no hotkeys while typing; Esc closes the field only), and so does pointer-up (the panel's
          // blur would unfocus it).
          <form
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.code === 'Escape') setNaming(false)
            }}
            onPointerUp={(e) => e.stopPropagation()}
            onSubmit={async (e) => {
              e.preventDefault()
              const as = String(new FormData(e.currentTarget).get('as')).trim()
              if (!as) return
              setNaming(false)
              const to = crypto.randomUUID()
              const err = await panel.saveAs(as, to)
              if (!err) director.cut(to) // on screen at once: the panel edits the new scene
              say(err, 'Save as', `Saved as “${as}”`)
            }}
          >
            <input
              name="as"
              aria-label="Save as"
              defaultValue={name}
              required
              autoFocus
              autoComplete="off"
              spellCheck={false}
              onFocus={(e) => e.currentTarget.select()} // as prompt() did: typing replaces the old name
            />
            <button>OK</button>
            <button type="button" onClick={() => setNaming(false)}>
              Cancel
            </button>
          </form>
        ) : (
          <>
            <button
              className={star ? 'star on' : 'star'}
              aria-pressed={star}
              aria-label={`Star ${name}`}
              title={star ? 'Starred: in the autopilot' : 'Star it into the autopilot'}
              onClick={() => panel.toggleStar()}
            >
              {star ? '★' : '☆'}
            </button>
            <button disabled={builtin} title={builtin ? 'A built-in: Save as a new scene' : undefined} onClick={async () => say(await panel.save(), 'Save', 'Saved')}>
              Save
            </button>
            <button onClick={() => setNaming(true)}>Save as…</button>
            <Gpu />
          </>
        )}
      </header>
      {note && (
        <p key={note.text} className={note.err ? 'err' : 'note'} onAnimationEnd={() => setNote(undefined)}>
          {note.text}
        </p>
      )}
      <details className="lib">
        <summary>Library</summary>
        <div className="io">
          <button disabled={!library.all().length} onClick={() => library.exportLibrary()}>
            Export
          </button>
          <button onClick={() => file.current!.click()}>Import</button>
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
        </div>
        <ul>
          {[...BUILTIN.map((b) => library.get(b.id)!), ...library.all()].map((d) => (
            <li key={d.id} className={d.id === id ? 'on' : undefined}>
              <button className={d.star ? 'star on' : 'star'} aria-pressed={d.star} aria-label={`Star ${d.name}`} onClick={() => library.setStar(d.id, !d.star)}>
                {d.star ? '★' : '☆'}
              </button>
              {d.name}
            </li>
          ))}
        </ul>
      </details>
      {tab === 'scene' && (
        <>
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
        <select
          className="add"
          value=""
          disabled={layers.length >= LAYERS_MAX}
          onChange={(e) => (e.target.value === PASTE ? paste.current!.showModal() : panel.addLayer(e.target.value))}
        >
          <option value="" disabled>
            {layers.length >= LAYERS_MAX ? `${LAYERS_MAX} layers` : '+ layer'}
          </option>
          {GENERATORS.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
          <option value={PASTE}>Shadertoy (paste)…</option>
        </select>
      </div>
        </>
      )}
      {tab === 'sources' && <SourcesTab />}
      <Paste ref={paste} />
    </div>
  )
}
