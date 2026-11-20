import { useEffect, useReducer, useState, useSyncExternalStore } from 'react'
import { cutTo } from '../app'
import { panel } from '../gl/live'
import { library } from '../library'
import { factory, factoryRefs, thumbUrl, type Preset } from '../presets'
import { BUILTIN } from '../scenes/builtin'
import { store } from '../store'

/** The built-in a ref's presets play on: the one with a layer that runs it (one per vs3 native; limitless as an effect). */
const sceneOf = (ref: string) => BUILTIN.find((d) => d.layers.some((l) => l.gen.ref === ref || l.fx.some((n) => n.ref === ref)))
/** A ref's presets: the factory's, then the user's (as the bar picker lists them). */
const listOf = (ref: string): readonly Preset[] => [...factory(ref), ...library.presets(ref)]
type View = 'scene' | 'all' | 'favs'
const VIEWS: readonly [View, string][] = [['scene', 'this scene'], ['all', 'all vs3'], ['favs', '★ favourites']]

/** The preset browser (user 2026-11-21, «как у них»): the presets as thumbs with a ☆ each (library.ts presetFavs).
 *  `scene`: the edited scene's preset node's (gl/live.ts presetNode), the current one lit; `all`: every vs3 scene's, by
 *  scene; `favs`: the starred ones, by scene. A click applies the preset as the bar picker does, or on another scene
 *  cuts to it first (app.ts cutTo), and closes the browser; so do Esc, W and ×. A panel on the stage's left, clear of the
 *  E panel, fading with the bar as that one does: it never covers the stage for long. */
export function Presets() {
  const open = useSyncExternalStore(store.subscribe, () => store.getSnapshot().browse)
  const name = useSyncExternalStore(store.subscribe, () => store.getSnapshot().sceneName)
  const now = useSyncExternalStore(store.subscribe, () => (store.getSnapshot().browse ? panel.presetNode()?.now : undefined)) // the current one, lit (custom: none)
  const favs = useSyncExternalStore(library.onChange, library.presetFavs)
  const [, tick] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    const off = library.onChange(tick) // a user preset saved or deleted
    return () => void off()
  }, [])
  const [view, setView] = useState<View>('scene')
  if (!open || !store.getSnapshot().edited) return null
  const t = panel.presetNode()
  const close = () => store.patch({ browse: false })
  function pick(ref: string, p: Preset) {
    const at = panel.presetNode()
    if (at?.ref === ref) panel.setValues(at.path, p.values, true)
    else {
      const s = sceneOf(ref)
      if (s) cutTo(s.id, p.name)
    }
    close()
  }
  const grid = (ref: string, ps: readonly Preset[]) => (
    <div className="grid">
      {ps.map((p, i) => {
        const fav = favs[ref]?.includes(p.name) ?? false
        return (
          <div key={i} className={p === now ? 'tile on' : 'tile'}>
            <button title={p.name} onClick={() => pick(ref, p)}>
              {p.thumb ? <img src={thumbUrl(p.thumb)} alt="" loading="lazy" /> : <span className="none" />}
              <span className="name">{p.name}</span>
            </button>
            <button className={fav ? 'fav on' : 'fav'} aria-pressed={fav} aria-label={`Favourite ${p.name}`} onClick={() => library.setPresetFav(ref, p.name, !fav)}>
              {fav ? '★' : '☆'}
            </button>
          </div>
        )
      })}
    </div>
  )
  const byScene = (refs: readonly string[], keep: (ref: string, p: Preset) => boolean) =>
    refs.map((ref) => {
      const ps = listOf(ref).filter((p) => keep(ref, p))
      return (
        ps.length > 0 && (
          <section key={ref}>
            <h3>{sceneOf(ref)?.name ?? ref}</h3>
            {grid(ref, ps)}
          </section>
        )
      )
    })
  return (
    <div className="presets" role="dialog" aria-label="Presets">
      <header>
        <span className="name">{name}</span>
        {VIEWS.map(([v, label]) => (
          <button key={v} className={v === view ? 'on' : undefined} aria-pressed={v === view} onClick={() => setView(v)}>
            {label}
          </button>
        ))}
        <button aria-label="Close" title="Close · Esc / W" onClick={close}>
          ×
        </button>
      </header>
      {view === 'scene' && (t ? grid(t.ref, t.list) : <p>This scene has no presets: all vs3 lists every one.</p>)}
      {view === 'all' && byScene(factoryRefs, () => true)}
      {view === 'favs' && (Object.keys(favs).length ? byScene(Object.keys(favs), (ref, p) => favs[ref].includes(p.name)) : <p>No favourites yet: ☆ a preset.</p>)}
    </div>
  )
}
