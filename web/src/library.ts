// The scene library (design E4, contract CP6): the user's scenes in IndexedDB, the user's stars over the built-ins and
// the list's marks, view and group in localStorage, the autopilot's playlist from the list, and one JSON file to export
// and import every user scene. The browser side is four seams (`Db`, `Kv`, `download`, `Disk`), so the logic runs in
// Vitest without a browser.
import { parseLibrary, parseScene, type LibraryFile, type SceneDoc, type SceneId } from './doc'
import { docs } from './edit'
import type { Value } from './fx/types'
import type { Preset } from './presets'
import { BUILTIN } from './scenes/builtin'
import { parseSets, type SetList } from './setlist'

export interface Db { all(): Promise<unknown[]>; put(doc: SceneDoc): Promise<unknown>; del(id: SceneId): Promise<unknown> }
type Kv = Pick<Storage, 'getItem' | 'setItem'>
/** Dev only (vite.config.ts): web/scene-marks.json. `read` resolves to its JSON, or null when there is none, and
 *  rejects when it cannot be read. */
export interface Disk { read(): Promise<unknown>; write(text: string): void }

const STARS = 'vjw.stars' // { [built-in id]: boolean }: the user's stars over the built-ins' own
/** The list's marks on a scene (user 2026-11-19), apart from the stars, not exported: each a localStorage [scene id]
 *  (the favourites under the editor's old key), mirrored in dev to web/scene-marks.json with the stars, for the lead to
 *  act on and for a build's defaults (user 2026-11-20). */
export type Mark = 'favourite' | 'trash' | 'rework'
const MARKS: Record<Mark, string> = { favourite: 'vjw.favs', trash: 'vjw.trash', rework: 'vjw.rework' }
const MARK_IDS = Object.keys(MARKS) as Mark[]
/** What the list shows: every scene but the trashed, or one mark's scenes (the trash's; the others less the trashed). */
export type View = 'all' | Mark
const VIEW = 'vjw.view'
const PERSISTED = 'vjw.persisted' // set once navigator.storage.persist() is granted
const PRESETS = 'vjw.presets' // { [ref]: Preset[] }: the user's presets (presets.ts), kept and mirrored as the marks
const MIDI = 'vjw.midi' // the MIDI mappings (midi.ts parses them): kept, mirrored and baked as the presets
const SETS = 'vjw.sets' // the set lists (setlist.ts): kept, mirrored and baked as the presets
/** The list's order, so the playlist's (user 2026-11-19: ←/→ as the list stands): by name, then id. */
export const byName = (a: SceneDoc, b: SceneDoc) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
/** The scene ids of a stored or filed mark; none from a corrupt value. */
const ids = (x: unknown): ReadonlySet<string> => new Set(Array.isArray(x) ? x.filter((s) => typeof s === 'string') : [])
const rec = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const value = (v: unknown): v is Value => typeof v === 'number' || typeof v === 'boolean' || (Array.isArray(v) && v.every((x) => typeof x === 'number'))
/** The user's presets of a stored or filed value: a corrupt preset (no name, a value that is no input value) is left out. */
const presetsOf = (x: unknown): Record<string, Preset[]> =>
  rec(x)
    ? Object.fromEntries(
        Object.entries(x)
          .map(([ref, ps]) => [ref, Array.isArray(ps) ? ps.filter((p): p is Preset => rec(p) && typeof p.name === 'string' && rec(p.values) && Object.values(p.values).every(value)) : []] as const)
          .filter(([, ps]) => ps.length),
      )
    : {}
const CAMERA = new Set(['native/camera', 'native/outline'])
/** A camera node or a masked layer: with no camera its person layers fade out and it repeats its other layers. */
const needsCamera = (d: SceneDoc) => d.layers.some((l) => l.mask || [l.gen, ...l.fx].some((n) => CAMERA.has(n.ref)))
const isBuiltin = (id: SceneId) => id.startsWith('builtin:')
const byCreated = (a: SceneDoc, b: SceneDoc) => (a.created ?? 0) - (b.created ?? 0)
const uses = (d: SceneDoc, prefix: string) => d.layers.some((l) => [l.gen, ...l.fx].some((n) => n.ref.startsWith(prefix)))
const vs2 = (d: SceneDoc) => uses(d, 'syn/')
const vs3 = (d: SceneDoc) => uses(d, 'native/vs3-')
/** The list's groups (user 2026-11-20), read off a scene's nodes, never tagged: a scene sits in each one it matches.
 *  vs2: the donor's synScenes; vs3: the friends' three.js scenes; ours: a generator of ours in a scene of neither. */
export const GROUPS = {
  milk: (d: SceneDoc) => uses(d, 'milk/'),
  ours: (d: SceneDoc) => !vs2(d) && !vs3(d) && d.layers.some((l) => /^(native|own|isf|toy)\//.test(l.gen.ref)),
  vs2,
  vs3,
  camera: needsCamera,
  mine: (d: SceneDoc) => !isBuiltin(d.id),
}
/** What the list shows of the view: every group, or one group's scenes. */
export type Group = 'all' | keyof typeof GROUPS
const GROUP = 'vjw.group'

/** A user scene, checked as an import is, so whatever is stored loads back. A built-in's id is not a user scene's. */
function own(x: unknown) {
  const d = parseScene(x)
  if (isBuiltin(d.id)) throw new Error(`id: ${d.id} is a built-in, save it as a new scene`)
  return d
}

/** `baked`: the build's defaults, web/scene-marks.json's marks and stars (vite.config.ts __VJW_MARKS__, user 2026-11-20):
 *  what a visitor with empty storage starts from. A stored mark or star beats them; they beat a built-in's own star. */
export function createLibrary(db: Db, kv: Kv, download: (name: string, text: string) => void, disk?: Disk, baked?: unknown) {
  const base = rec(baked) ? baked : {}
  const baseStars = rec(base.stars) ? base.stars : {}
  const user = new Map<SceneId, SceneDoc>()
  const subs = new Set<() => void>()
  const notify = () => subs.forEach((cb) => cb())
  let stars: Record<string, unknown> = {}
  try {
    stars = { ...JSON.parse(kv.getItem(STARS) ?? '{}') }
  } catch {
    // no localStorage, or a corrupt value: the built-ins' own stars
  }
  const stored = (key: string): unknown => {
    try {
      return JSON.parse(kv.getItem(key) ?? 'null')
    } catch {
      return null // no localStorage, or a corrupt value
    }
  }
  let marks = Object.fromEntries(MARK_IDS.map((m) => [m, ids(stored(MARKS[m]) ?? base[m])])) as Record<Mark, ReadonlySet<string>>
  const keep = (m: Mark) => kv.setItem(MARKS[m], JSON.stringify([...marks[m]]))
  let presets = presetsOf(stored(PRESETS) ?? base.presets)
  let midi = stored(MIDI) ?? base.midi
  /** The sets of a stored or filed value; a bad one or a bad cue is left out with a console warning. */
  const setsOf = (x: unknown) => {
    const { sets, dropped } = parseSets(x)
    for (const why of dropped) console.warn(`set list: ${why} (left out)`)
    return sets
  }
  let sets = setsOf(stored(SETS) ?? base.sets)
  /** web/scene-marks.json's text: each mark's ids, sorted, then the user's stars over the built-ins, by id, then the
   *  user's presets, MIDI mappings and sets when there are any. */
  const file = () => {
    const on = Object.entries(stars).filter(([, s]) => typeof s === 'boolean').sort(([a], [b]) => (a < b ? -1 : 1))
    const f = { ...Object.fromEntries(MARK_IDS.map((m) => [m, [...marks[m]].sort()])), stars: Object.fromEntries(on), ...(Object.keys(presets).length && { presets }), ...(Array.isArray(midi) && midi.length && { midi }), ...(sets.length && { sets }) }
    return `${JSON.stringify(f, null, 2)}\n`
  }
  const keepPresets = (next: Record<string, Preset[]>) => {
    presets = next
    kv.setItem(PRESETS, JSON.stringify(presets))
    disk?.write(file())
    notify()
  }
  const v = stored(VIEW)
  let view = (typeof v === 'string' && Object.hasOwn(MARKS, v) ? v : 'all') as View
  const g = stored(GROUP)
  let group = (typeof g === 'string' && Object.hasOwn(GROUPS, g) ? g : 'all') as Group
  // The built-ins with their stars: our own shallow copies, so a star changes in place.
  const builtin = new Map<SceneId, SceneDoc>(BUILTIN.map((b) => [b.id, { ...b }]))
  /** Each built-in's star: the user's, else the build's default, else its own. */
  const restar = () => {
    for (const b of BUILTIN) {
      const s = [stars[b.id], baseStars[b.id]].find((x) => typeof x === 'boolean')
      builtin.get(b.id)!.star = typeof s === 'boolean' ? s : b.star
    }
  }
  restar()
  const all = () => [...user.values()].sort(byCreated)
  const get = (id: SceneId): SceneDoc | undefined => user.get(id) ?? builtin.get(id)
  /** The scenes view `w` lists of group `g`, built-in and user alike, in the list's order. */
  function listed(w: View = view, g: Group = group) {
    const { trash } = marks
    const shows = (d: SceneDoc) => (w === 'trash' ? trash.has(d.id) : !trash.has(d.id) && (w === 'all' || marks[w].has(d.id)))
    return [...builtin.values(), ...user.values()].filter((d) => shows(d) && (g === 'all' || GROUPS[g](d))).sort(byName)
  }
  /** The autopilot's and ←/→'s order: the list of the view and the group (user 2026-11-19, 2026-11-20) less the scenes
   *  out of rotation. View All: in every group the starred scenes (a built-in starred off, the heavy and utility ones,
   *  stays out), in one group all its scenes; a mark's view: its scenes, starred or not; the trash's: All's. `camLive`
   *  false: a scene that needs the camera sits out (user 2026-11-16: it played as a duplicate); a manual pick
   *  (director.cut) still opens it. An empty view plays the group's All, an empty group every group's; nothing there:
   *  the built-ins starred by default, trashed or not, as the director needs a non-empty playlist (plan S2.1). */
  function playlist(camLive = true): SceneId[] {
    const on = (d: SceneDoc) => camLive || !needsCamera(d)
    const rotation = (w: View, g: Group) =>
      listed(w, g).filter((d) => on(d) && (w === 'all' ? g !== 'all' || d.star : w !== 'trash')).map((d) => d.id)
    for (const [w, g] of [[view, group], ['all', group], ['all', 'all']] as const) {
      const p = rotation(w, g)
      if (p.length) return p
    }
    return [...BUILTIN].sort(byName).filter((d) => d.star && on(d)).map((d) => d.id)
  }

  async function put(doc: SceneDoc) {
    const d = own({ ...doc, created: doc.created ?? user.get(doc.id)?.created ?? Date.now() })
    await db.put(d)
    user.set(d.id, d)
    if (!kv.getItem(PERSISTED)) void globalThis.navigator?.storage?.persist().then((ok) => ok && kv.setItem(PERSISTED, '1'))
    notify()
  }

  return {
    /** Reads every stored scene; a corrupt one is skipped with a console error. Dev: the marks file wins, its stars too,
     *  as it outlives a browser data wipe; with none yet, ours start it, and one from before the stars gets ours; one that
     *  cannot be read is left alone. */
    async load() {
      const f = await disk?.read().catch(() => undefined)
      if (rec(f)) {
        marks = Object.fromEntries(MARK_IDS.map((m) => [m, ids(f[m])])) as typeof marks
        MARK_IDS.forEach(keep)
        if (rec(f.stars)) {
          stars = { ...f.stars }
          kv.setItem(STARS, JSON.stringify(stars))
          restar()
        }
        if (rec(f.presets)) {
          presets = presetsOf(f.presets)
          kv.setItem(PRESETS, JSON.stringify(presets))
        }
        if (Array.isArray(f.midi)) kv.setItem(MIDI, JSON.stringify((midi = f.midi)))
        if (Array.isArray(f.sets)) kv.setItem(SETS, JSON.stringify((sets = setsOf(f.sets))))
      }
      if (f === null || (rec(f) && !rec(f.stars))) disk!.write(file())
      for (const x of await db.all()) {
        try {
          const d = own(x)
          user.set(d.id, d)
        } catch (e) {
          console.error(`library: a stored scene skipped: ${(e as Error).message}`)
        }
      }
      notify()
    },
    /** A user scene, or a built-in with the user's star. */
    get,
    /** The user scenes, oldest first. */
    all,
    /** Stores a user scene, new or over the one with its id. Rejects an invalid scene or a built-in's id. */
    put,
    async del(id: SceneId) {
      await db.del(id)
      user.delete(id)
      notify()
    },
    setStar(id: SceneId, on: boolean) {
      const copy = docs.get(id) // the panel's unsaved copy (edit.ts) stars along
      if (copy) copy.star = on
      const b = builtin.get(id)
      if (b) {
        b.star = on
        stars = { ...stars, [id]: on }
        kv.setItem(STARS, JSON.stringify(stars))
        disk?.write(file())
        notify()
        return
      }
      const d = user.get(id)
      if (d) void put({ ...d, star: on }).catch((e: unknown) => console.error('library', e))
    },
    /** The marks: a new Set per change, so each is its own snapshot. */
    marks: () => marks,
    mark(m: Mark, id: SceneId, on: boolean) {
      const s = new Set(marks[m])
      if (on) s.add(id)
      else s.delete(id)
      marks = { ...marks, [m]: s }
      keep(m)
      disk?.write(file())
      notify()
    },
    /** The user's presets of a ref (presets.ts), oldest first; a new array per change. */
    presets: (ref: string): readonly Preset[] => presets[ref] ?? [],
    /** Keeps `values` as the user's preset `name` of `ref`, over one of that name (which moves to the end). */
    savePreset(ref: string, name: string, values: Record<string, Value>) {
      keepPresets({ ...presets, [ref]: [...(presets[ref] ?? []).filter((p) => p.name !== name), { name, values }] })
    },
    deletePreset(ref: string, name: string) {
      const { [ref]: ps = [], ...rest } = presets
      const left = ps.filter((p) => p.name !== name)
      keepPresets(left.length ? { ...rest, [ref]: left } : rest)
    },
    /** The MIDI mappings as stored, else the build's (midi.ts checks them). */
    midi: () => midi,
    setMidi(m: unknown) {
      kv.setItem(MIDI, JSON.stringify((midi = m)))
      disk?.write(file())
    },
    /** The set lists (setlist.ts), in the Set menu's order; a new array per change. */
    sets: (): readonly SetList[] => sets,
    setSets(next: readonly SetList[]) {
      sets = [...next]
      kv.setItem(SETS, JSON.stringify(sets))
      disk?.write(file())
      notify()
    },
    /** The list's view, kept over a reload; the playlist follows it. */
    view: () => view,
    setView(w: View) {
      view = w
      kv.setItem(VIEW, JSON.stringify(w))
      notify()
    },
    /** The list's group, kept over a reload; the playlist follows it. */
    group: () => group,
    setGroup(g: Group) {
      group = g
      kv.setItem(GROUP, JSON.stringify(g))
      notify()
    },
    listed,
    playlist,
    /** Where `id` stands in `playlist(camLive)`, for director.cut: its index, or off the playlist the index of the first
     *  scene after it in the list (past the end: the first), so ←/→ go on from its place in the list. Undefined: not a
     *  library scene (New's draft). */
    slot(id: SceneId, camLive = true) {
      const d = get(id)
      if (!d) return undefined
      const p = playlist(camLive)
      const i = p.findIndex((x) => byName(get(x)!, d) >= 0)
      return i < 0 ? p.length : i
    },
    /** Downloads every user scene as one `veejay-library-<local date>.json`. */
    exportLibrary() {
      const date = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
      download(`veejay-library-${date}.json`, JSON.stringify({ v: 1, scenes: all() } satisfies LibraryFile, null, 2))
    },
    /** A library file or a single scene. Each scene overwrites the user scene with its id (a backup restores); one
     *  with a built-in's id comes in as a new scene. Resolves to an error message, or null once imported. */
    async importFile(f: File) {
      try {
        for (const d of parseLibrary(JSON.parse(await f.text()))) await put(isBuiltin(d.id) ? { ...d, id: crypto.randomUUID() } : d)
        return null
      } catch (e) {
        return (e as Error).message
      }
    },
    onChange(cb: () => void) {
      subs.add(cb)
      return () => subs.delete(cb)
    },
  }
}

/** IndexedDB `vjw`, one store `scenes` keyed by `id` (MDN, Using IndexedDB), opened on first use. A connection closed
 *  under us (DevTools deleting the database, another tab upgrading it) is let go, so the next call opens a new one. */
function idb(): Db {
  let conn: Promise<IDBDatabase> | null = null
  const open = () =>
    (conn ??= new Promise((ok, fail) => {
      const r = indexedDB.open('vjw', 1)
      r.onupgradeneeded = () => r.result.createObjectStore('scenes', { keyPath: 'id' })
      r.onsuccess = () => {
        const d = r.result
        d.onclose = d.onversionchange = () => {
          d.close()
          conn = null
        }
        ok(d)
      }
      r.onerror = () => fail(r.error)
    }))
  /** One request in its own transaction, resolved once the transaction commits. */
  async function run<T>(mode: IDBTransactionMode, req: (s: IDBObjectStore) => IDBRequest<T>) {
    const tx = (await open()).transaction('scenes', mode)
    const r = req(tx.objectStore('scenes'))
    return new Promise<T>((ok, fail) => {
      tx.oncomplete = () => ok(r.result)
      tx.onabort = () => fail(tx.error)
    })
  }
  return {
    all: () => run('readonly', (s) => s.getAll()),
    put: (d) => run('readwrite', (s) => s.put(d)),
    del: (id) => run('readwrite', (s) => s.delete(id)),
  }
}

/** A file into the downloads, the recorder's way (recorder.ts); also the shader editor's Export. */
export function download(name: string, text: string, type = 'application/json') {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 40_000)
}

/** The dev server's `/__marks` (vite.config.ts): `null` when the file is absent. A failed write leaves localStorage
 *  the marks' one copy until the next change. Absent outside dev. */
const disk: Disk | undefined = import.meta.env.DEV
  ? {
      read: () => fetch('/__marks').then((r) => (r.ok ? r.json() : Promise.reject(new Error(`marks: ${r.status}`)))),
      write: (text) => void fetch('/__marks', { method: 'POST', body: text }).catch((e: unknown) => console.error('marks', e)),
    }
  : undefined
/** The build's copy of web/scene-marks.json, or null without one (vite.config.ts `define`). Dev reads the file itself. */
declare const __VJW_MARKS__: unknown

export const library = createLibrary(idb(), globalThis.localStorage, download, disk, import.meta.env.DEV ? undefined : __VJW_MARKS__)
