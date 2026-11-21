import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react'
import { director, settings } from '../app'
import { activePreset } from '../audio/settings'
import { PRESETS, type PresetId } from '../audio/presets'
import { BAND_COUNT } from '../audio/energy'
import { BIND_DEFAULTS, bindable, PHASES, sourceGroups, type Binding, type Shape } from '../bind'
import { defaults, TEXT_MAX, type Blend, type Clip, type LayerDoc, type MaskMode, type NodeDoc, type SceneId } from '../doc'
import { catalog, toyDef } from '../fx/catalog'
import { donorChain } from '../fx/syn'
import type { Input, Kind, Value } from '../fx/types'
import { live, panel, type NodePath } from '../gl/live'
import { library } from '../library'
import { paramId } from '../midi'
import { ClipRow } from './Clips'
import { SourcesTab } from './SourcesTab'
import { BUILTIN } from '../scenes/builtin'
import { DJ, dj } from '../scenes/text'
import { CLIP } from '../scenes/video'
import { store, type UiSnapshot } from '../store'
import './panel.css'

const GPU_BUDGET = 5 // ms per scene (CP4's bench gate): the hint turns amber above 80 % of it, red above it
export const LAYERS_MAX = 4 // doc.ts's limit
const BLENDS: readonly Blend[] = ['normal', 'add', 'screen', 'multiply', 'max', 'difference', 'dodge']
const SHAPES: readonly Shape[] = ['sine', 'tri', 'saw', 'square', 'random']
/** A float input whose range is one turn (a hue, an angle, a phase): a clock bound to it wraps; any other clamps. */
const TURN = /hue$|angle$|^rotation$|^phase$|^yaw$/i
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
/** A binding switched to a clock (`wrap` given: its default) or back to a level (none). A clock reads a level as it is:
 *  a phase source becomes bass and the shape goes; base 0, so the clock stops while its source is silent or muted. */
function withClock(b: Binding, wrap?: boolean): Binding {
  const level = { ...b }
  delete level.clock
  return wrap === undefined ? level : { ...withSource(level, PHASES.includes(b.source) ? 'bass' : b.source), clock: { base: 0, k: 0.5, wrap } }
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

/** Uncontrolled: dragging calls `set` and nothing re-renders. `midi`: a layer input's paramId, so MIDI learn can arm it
 *  and a knob moves it (ui/Midi.tsx). */
const slider = (lo: number, hi: number, v: number, set: (v: number) => void, step = (hi - lo) / 100, midi?: string) => (
  <input type="range" min={lo} max={hi} step={step} defaultValue={v} data-midi={midi} onInput={(e) => set(e.currentTarget.valueAsNumber)} />
)

/** `gate`: a bool or event, on at .5 (bind.ts `level`): its block has amount, release and invert, no attack/min/max.
 *  `wrap` (a float only): the block offers a clock, and this is whether it wraps (TURN). */
interface Bindable { path: NodePath; k: string; lo: number; hi: number; init?: Binding; gate?: boolean; wrap?: boolean }
/** The bound rows' meters, written from `Live.read` by `Meters`' one rAF loop: nothing re-renders per frame. */
const meters = new Map<HTMLMeterElement, Bindable>()

/** S6.3's dim hint: a built-in row whose source the active preset's map rewrites while Auto-style is on. Its own
 * component, so only a bound row's select subscribes to the settings and the classifier's 4×/s update. */
function AutoHint({ source }: { source: string }) {
  const s = useSyncExternalStore(settings.onChange, settings.get)
  const detected = useSyncExternalStore(store.subscribe, () => store.getSnapshot().style.detected)
  const id = useSnap('edited')
  const genre = useSnap('sceneGenre')
  const target = s.auto && id.startsWith('builtin:') ? PRESETS[activePreset(s, detected, genre)].map[source] : undefined
  return target ? <span className="hint">→ {target} (auto-style)</span> : null
}

/** One parameter row. A numeric one gets a bind dot that opens its binding's controls (design E3) under it. */
export function Param({ label, bind, children }: { label: string; bind?: Bindable; children: ReactNode }) {
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
  /** A clock's base or k, in ranges per s (bind.ts evaluate). */
  const clockKnob = (f: 'base' | 'k', lo: number, hi: number) => (
    <label>
      <span>{f}</span>
      {slider(lo, hi, b!.clock![f], (y) => send({ ...now(), clock: { ...now().clock!, [f]: y } }), 0.01)}
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
            {/* keyed by the mode: a clock lists no phase source, and turning one on may move the source to bass */}
            <select key={b.clock ? 'clock' : 'level'} aria-label="Source" defaultValue={b.source} onChange={(e) => send(withSource(now(), e.target.value), true)}>
              {sourceGroups(s.custom).map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.ids.map((sid, i) =>
                    b.clock && PHASES.includes(sid) ? null : (
                      <option key={sid} value={sid}>
                        {g.label === 'band' ? `${i} · ${hz(i)}` : g.label === 'custom' ? s.custom.find((c) => c.id === sid)?.name ?? sid : sid}
                      </option>
                    ),
                  )}
                </optgroup>
              ))}
            </select>
            <AutoHint source={b.source} />
            {/* S3.3: in donor mode this input reads the donor core's value through this binding (live.ts, same test) */}
            {s.analyser === 'donor' && donorChain(bind.k, b) && <span className="hint">donor</span>}
            {b.shape && !b.clock && (
              <select aria-label="Shape" defaultValue={b.shape} onChange={(e) => send({ ...now(), shape: e.target.value as Shape })}>
                {SHAPES.map((s) => <option key={s}>{s}</option>)}
              </select>
            )}
            <meter
              aria-label={`${label} now`}
              min={bind.lo}
              max={bind.hi}
              ref={(el) => {
                meters.set(el!, bind)
                return () => void meters.delete(el!)
              }}
            />
          </div>
          {bind.wrap !== undefined && (
            <label>
              <span>clock</span>
              <input type="checkbox" defaultChecked={!!b.clock} onChange={(e) => send(withClock(now(), e.target.checked ? bind.wrap : undefined), true)} />
            </label>
          )}
          {b.clock ? (
            <>
              {clockKnob('base', -1, 1)}
              {clockKnob('k', -2, 2)}
              <label>
                <span>wrap</span>
                <input type="checkbox" defaultChecked={b.clock.wrap} onChange={(e) => send({ ...now(), clock: { ...now().clock!, wrap: e.target.checked } })} />
              </label>
            </>
          ) : (
            <>
              {knob('amount', 0, 4)}
              {!bind.gate && knob('attack', 0, 1)}
              {knob('release', 0, 1)}
            </>
          )}
          {bind.gate ? (
            <label>
              <span>invert</span>
              <input type="checkbox" defaultChecked={b.min > b.max} onChange={(e) => send({ ...now(), min: e.target.checked ? 1 : 0, max: e.target.checked ? 0 : 1 })} />
            </label>
          ) : (
            <>
              {knob('min', bind.lo, bind.hi)}
              {knob('max', bind.lo, bind.hi)}
            </>
          )}
          {b.shape && !b.clock && knob('rate', 0.05, 4, 0.05)}
        </div>
      )}
    </>
  )
}

/** The inputs' rows in order; a run of inputs with one `group` (native/calib: a tile's controls) folds under its name,
 *  closed, in a native <details>. */
function fold(inputs: readonly Input[], row: (x: Input) => ReactNode) {
  const out: ReactNode[] = []
  for (let i = 0; i < inputs.length; ) {
    const g = inputs[i].group
    let j = i + 1
    while (g && inputs[j]?.group === g) j++
    const rows = inputs.slice(i, j).map(row)
    out.push(g ? <details key={g} className="group"><summary>{g}</summary>{rows}</details> : rows[0])
    i = j
  }
  return out
}

/** A node's inputs as controls by their type (design E3); images and audio have none. */
export function Fx({ path, n, onRemove }: { path: NodePath; n: NodeDoc; onRemove?: () => void }) {
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
      {fold(def?.inputs ?? [], (x) => {
        const label = x.label ?? x.name
        const set = (y: Value) => panel.setValue(path, x.name, y)
        const bind = (k: string, lo: number, hi: number, wrap?: boolean): Bindable | undefined =>
          bindable(x) ? { path, k, lo, hi, init: n.bind?.[k], gate: x.type === 'bool' || x.type === 'event', wrap } : undefined
        const val = v[x.name]
        switch (x.type) {
          case 'float': {
            const lo = (x.min as number | undefined) ?? 0
            const hi = (x.max as number | undefined) ?? 1
            return (
              <Param key={x.name} label={label} bind={bind(x.name, lo, hi, TURN.test(x.name))}>
                {slider(lo, hi, val as number, set, undefined, paramId({ ...path, input: x.name }))}
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
              <Param key={x.name} label={label} bind={bind(x.name, 0, 1)}>
                <input type="checkbox" defaultChecked={val as boolean} onChange={(e) => set(e.target.checked)} />
              </Param>
            )
          case 'event':
            return (
              <Param key={x.name} label={label} bind={bind(x.name, 0, 1)}>
                <button onClick={() => panel.pulse(path, x.name)}>trigger</button>
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
                <Param key={`${x.name}.${j}`} label={`${label} ${c}`} bind={bind(`${x.name}.${j}`, lo, hi, false)}>
                  {slider(lo, hi, xy[j], (y) => {
                    xy[j] = y
                    set([...xy])
                  })}
                </Param>
              )
            })
          }
          case 'text': {
            if (x === CLIP) return <ClipRow key={x.name} value={String(val)} set={set} /> // native/video's: the clip library
            const app = x === DJ // the DJ name: one app-wide setting, not the node's
            return (
              <Param key={x.name} label={label}>
                <input type="text" maxLength={TEXT_MAX} defaultValue={app ? dj.name : String(val)} onChange={(e) => (app ? dj.set(e.target.value) : set(e.target.value))} />
              </Param>
            )
          }
          default:
            return null // images and audio: the engine wires them
        }
      })}
    </div>
  )
}

/** The preset picker (presets.ts) of the edited scene's preset node, in the bar and in E: the preset its values match,
 *  else "custom"; the factory's, then the user's; Browse (the thumbs, ui/Presets.tsx), Save as preset… and, on a user
 *  one, Delete. Hidden without presets.
 *  It re-reads on every store change (the bar's 4×/s too), so a moved slider shows "custom" within 250 ms. */
export function PresetSelect() {
  useSyncExternalStore(library.onChange, () => libRev)
  useSyncExternalStore(store.subscribe, () => panel.presetNode()?.now)
  const [naming, setNaming] = useState(false)
  const t = panel.presetNode()
  if (!t) return null
  const i = t.now ? t.list.indexOf(t.now) : -1
  if (naming)
    return (
      // Not a prompt(): it blocks the main thread and the picture freezes (SceneHead's Save as). app.ts skips keys typed here.
      <form
        className="preset"
        onKeyDown={(e) => e.code === 'Escape' && setNaming(false)}
        onSubmit={(e) => {
          e.preventDefault()
          const name = String(new FormData(e.currentTarget).get('name')).trim()
          if (name) panel.savePreset(name)
          setNaming(false)
        }}
      >
        <input name="name" aria-label="Preset name" placeholder="preset name" required autoFocus autoComplete="off" spellCheck={false} />
        <button>OK</button>
        <button type="button" onClick={() => setNaming(false)}>
          Cancel
        </button>
      </form>
    )
  return (
    <select
      aria-label="Preset"
      title="Preset (↑ / ↓)"
      value={i}
      onChange={(e) => {
        const v = e.currentTarget.value
        e.currentTarget.blur() // a focused select would eat hotkeys as type-ahead
        if (v === 'save') setNaming(true)
        else if (v === 'browse') store.patch({ browse: true })
        else if (v === 'delete') library.deletePreset(t.ref, t.now!.name)
        else panel.setValues(t.path, t.list[+v].values, true)
      }}
    >
      <option value={-1} disabled>
        preset: custom
      </option>
      {t.list.map((p, j) => (
        <option key={j} value={j}>
          {p.name}
        </option>
      ))}
      <option value="browse">Browse presets… · W</option>
      <option value="save">Save as preset…</option>
      {i >= t.factory && <option value="delete">Delete “{t.now!.name}”</option>}
    </select>
  )
}

/** The GPU hint: the edited scene's median against the budget. Its 4×/s update re-renders only this. */
export function Gpu() {
  const ms = useSnap('gpuMs')
  if (ms === null) return null // no GPU timer
  return <span className={ms > GPU_BUDGET ? 'gpu over' : ms > 0.8 * GPU_BUDGET ? 'gpu near' : 'gpu'}>GPU {ms.toFixed(1)} ms</span>
}

/** The one rAF loop that writes every bound row's meter (`meters`) from `Live.read`: nothing re-renders per frame. */
export function Meters({ id }: { id: SceneId }) {
  useEffect(() => {
    let raf = 0
    const loop = () => {
      const l = live(id)
      for (const [el, b] of meters) el.value = l.read(b.path, b.k) ?? 0
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [id])
  return null
}

/** A layer's head row: its number and generator, its blend and camera mask, `children` (the editor's buttons), remove. */
export function LayerHead({ i, l, n, children }: { i: number; l: LayerDoc; n: number; children?: ReactNode }) {
  return (
    <div className="head">
      <span>
        {i + 1} · {defOf(l.gen)?.name ?? l.gen.ref}
      </span>
      <select aria-label="Blend" defaultValue={l.blend} onChange={(e) => panel.setBlend(i, e.target.value as Blend)}>
        {BLENDS.map((b) => <option key={b}>{b}</option>)}
      </select>
      <select aria-label="Mask" defaultValue={l.mask ?? ''} onChange={(e) => panel.setMask(i, (e.target.value || undefined) as MaskMode | undefined)}>
        <option value="">no mask</option>
        <option value="person">person</option>
        <option value="background">background</option>
      </select>
      {children}
      {n > 1 && (
        <button className="x" aria-label="Remove layer" onClick={() => panel.removeLayer(i)}>
          ×
        </button>
      )}
    </div>
  )
}

/** A layer's opacity and speed (both bindable), res and frame clip (the scene's first Frame layer's inside or outside). */
export function LayerParams({ i, l }: { i: number; l: LayerDoc }) {
  const at: NodePath = { layer: i, node: 'layer' }
  const set = (k: string) => (y: number) => panel.setValue(at, k, y)
  const tag = (k: string) => paramId({ ...at, input: k })
  return (
    <>
      <Param label="opacity" bind={{ path: at, k: 'opacity', lo: 0, hi: 1, init: l.bind?.opacity, wrap: false }}>
        {slider(0, 1, l.opacity, set('opacity'), undefined, tag('opacity'))}
      </Param>
      <Param label="layer speed" bind={{ path: at, k: 'speed', lo: 0, hi: 4, init: l.bind?.speed, wrap: false }}>
        {slider(0, 4, l.speed, set('speed'), undefined, tag('speed'))}
      </Param>
      <Param label="res">{slider(0.25, 1, l.res, set('res'), 0.05, tag('res'))}</Param>
      <Param label="frame clip">
        <select defaultValue={l.clip ?? ''} onChange={(e) => panel.setClip(i, (e.target.value || undefined) as Clip | undefined)}>
          <option value="">none</option>
          <option value="inside">inside frame</option>
          <option value="outside">outside frame</option>
        </select>
      </Param>
    </>
  )
}

/** The "+ effect" picker's entries: every filter, by category. */
export function FxOptions() {
  return FILTERS.map(([c, ds]) => (
    <optgroup key={c} label={c}>
      {ds.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </optgroup>
  ))
}

/** The "+ layer" picker's entries: every generator. */
export function GenOptions() {
  return GENERATORS.map((d) => (
    <option key={d.id} value={d.id}>
      {d.name}
    </option>
  ))
}

const GENRE = 'The analyser genre profile while this scene is on stage: its kick/snare knobs and bands (the tempo range and the drop detection follow the top bar). follow = none, the top bar\'s; a genre picked in the top bar wins. Saved with the scene.'
/** The scene's genre profile (doc.ts `genre`, user 2026-11-21): one undo step, saved with the scene. */
function GenreRow({ id }: { id: SceneId }) {
  return (
    <Param label="genre">
      <select aria-label="Scene genre" title={GENRE} value={live(id).doc.genre ?? ''} onChange={(e) => panel.setGenre((e.target.value || undefined) as PresetId | undefined)}>
        <option value="">follow</option>
        {(Object.keys(PRESETS) as PresetId[]).map((g) => (
          <option key={g}>{g}</option>
        ))}
      </select>
    </Param>
  )
}

/** A file op's result, for the note under the header: its error, or what it did. */
export type Say = (err: string | null, what: string, done: string) => void

/** The edited scene's file row (design E4), the panel's and the editor's: its star, Save, Save as… and `children`.
 *  Save as… swaps the row for its name field, then cuts to the new scene. A scene not in the library yet (the editor's
 *  New) has no star to keep until it is saved. */
export function SceneHead({ id, say, children }: { id: SceneId; say: Say; children?: ReactNode }) {
  useSyncExternalStore(library.onChange, () => libRev) // the star
  const [naming, setNaming] = useState(false)
  const { name } = live(id).doc
  const star = !!library.get(id)?.star
  const builtin = id.startsWith('builtin:')
  return (
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
            disabled={!library.get(id)}
            onClick={() => panel.toggleStar()}
          >
            {star ? '★' : '☆'}
          </button>
          <button disabled={builtin} title={builtin ? 'A built-in: Save as a new scene' : undefined} onClick={async () => say(await panel.save(), 'Save', 'Saved')}>
            Save
          </button>
          <button onClick={() => setNaming(true)}>Save as…</button>
          {children}
        </>
      )}
    </header>
  )
}

/** Export (every user scene, one file) and Import (a library file or one scene, through a hidden file input). */
export function LibraryIo({ say }: { say: Say }) {
  const file = useRef<HTMLInputElement>(null)
  return (
    <>
      <button disabled={!library.all().length} onClick={() => library.exportLibrary()}>
        Export
      </button>
      <button onClick={() => file.current!.click()}>Import</button>
      <input
        ref={file}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = '' // the same file can come in again
          if (f) say(await library.importFile(f), 'Import', `Imported ${f.name}`)
        }}
      />
    </>
  )
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
  const [note, setNote] = useState<{ text: string; err: boolean }>()
  const [tab, setTab] = useState<'scene' | 'sources'>('scene') // a view concern, not a store field (S6.1)
  const say: Say = (err, what, done) => setNote(err ? { text: `${what}: ${err}`, err: true } : { text: done, err: false })
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
      onDrop={(e) => {
        const f = e.dataTransfer.files[0]
        if (!f?.name.toLowerCase().endsWith('.json')) return // audio: the document's drop plays it
        e.preventDefault()
        e.stopPropagation()
        void library.importFile(f).then((err) => say(err, 'Import', `Imported ${f.name}`))
      }}
    >
      <div className="tabs">
        {(['scene', 'sources'] as const).map((t) => (
          <button key={t} className={tab === t ? 'on' : undefined} aria-pressed={tab === t} onClick={() => setTab(t)}>
            {t === 'scene' ? 'Scene' : 'Sources'}
          </button>
        ))}
      </div>
      <SceneHead id={id} say={say}>
        <Gpu />
      </SceneHead>
      <GenreRow id={id} />
      {note && (
        <p key={note.text} className={note.err ? 'err' : 'note'} onAnimationEnd={() => setNote(undefined)}>
          {note.text}
        </p>
      )}
      <details className="lib">
        <summary>Library</summary>
        <div className="io">
          <LibraryIo say={say} />
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
      <PresetSelect />
      {/* Keyed by the edit: after a structural one, every control starts again from the doc. */}
      <div key={`${id} ${rev}`}>
        {layers.map((l, i) => (
          <section key={i} className="layer">
            <LayerHead i={i} l={l} n={layers.length} />
            <LayerParams i={i} l={l} />
            <Fx path={{ layer: i, node: 'gen' }} n={l.gen} />
            {l.fx.map((n, k) => (
              <Fx key={k} path={{ layer: i, node: k }} n={n} onRemove={() => panel.removeFx(i, k)} />
            ))}
            <select className="add" value="" onChange={(e) => panel.addFx(i, e.target.value)}>
              <option value="" disabled>
                + effect
              </option>
              <FxOptions />
            </select>
          </section>
        ))}
        <select
          className="add"
          value=""
          disabled={layers.length >= LAYERS_MAX}
          onChange={(e) => (e.target.value === PASTE ? paste.current!.showModal() : panel.addLayer(e.target.value))}
        >
          <option value="" disabled>
            {layers.length >= LAYERS_MAX ? `${LAYERS_MAX} layers` : '+ layer'}
          </option>
          <GenOptions />
          <option value={PASTE}>Shadertoy (paste)…</option>
        </select>
      </div>
        </>
      )}
      {tab === 'sources' && <SourcesTab />}
      <Paste ref={paste} />
      <Meters id={id} />
    </div>
  )
}
