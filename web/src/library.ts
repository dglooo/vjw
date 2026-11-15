// The scene library (design E4, contract CP6): the user's scenes in IndexedDB, the user's stars over the built-ins in
// localStorage, the autopilot's playlist from the stars, and one JSON file to export and import every user scene. The
// browser side is three seams (`Db`, `Kv`, `download`), so the logic runs in Vitest without a browser.
import { parseLibrary, parseScene, type LibraryFile, type SceneDoc, type SceneId } from './doc'
import { docs } from './edit'
import { BUILTIN } from './scenes/builtin'

export interface Db { all(): Promise<unknown[]>; put(doc: SceneDoc): Promise<unknown>; del(id: SceneId): Promise<unknown> }
type Kv = Pick<Storage, 'getItem' | 'setItem'>

const STARS = 'vjw.stars' // { [built-in id]: boolean }: the user's stars over the built-ins' own
const FAVS = 'vjw.favs' // [block or scene id]: the editor library's favourites (2b S3.1), apart from the stars, not exported
const PERSISTED = 'vjw.persisted' // set once navigator.storage.persist() is granted
const CAMERA = new Set(['native/camera', 'native/outline'])
/** A camera node or a masked layer: with no camera its person layers fade out and it repeats its other layers. */
const needsCamera = (d: SceneDoc) => d.layers.some((l) => l.mask || [l.gen, ...l.fx].some((n) => CAMERA.has(n.ref)))
const isBuiltin = (id: SceneId) => id.startsWith('builtin:')
const byCreated = (a: SceneDoc, b: SceneDoc) => (a.created ?? 0) - (b.created ?? 0)

/** A user scene, checked as an import is, so whatever is stored loads back. A built-in's id is not a user scene's. */
function own(x: unknown) {
  const d = parseScene(x)
  if (isBuiltin(d.id)) throw new Error(`id: ${d.id} is a built-in, save it as a new scene`)
  return d
}

export function createLibrary(db: Db, kv: Kv, download: (name: string, text: string) => void) {
  const user = new Map<SceneId, SceneDoc>()
  const subs = new Set<() => void>()
  const notify = () => subs.forEach((cb) => cb())
  let stars: Record<string, unknown> = {}
  try {
    stars = { ...JSON.parse(kv.getItem(STARS) ?? '{}') }
  } catch {
    // no localStorage, or a corrupt value: the built-ins' own stars
  }
  let favs: ReadonlySet<string> = new Set()
  try {
    const f: unknown = JSON.parse(kv.getItem(FAVS) ?? '[]')
    if (Array.isArray(f)) favs = new Set(f.filter((x) => typeof x === 'string'))
  } catch {
    // no localStorage, or a corrupt value: none
  }
  // The built-ins with the user's stars: our own shallow copies, so a star changes in place.
  const builtin = new Map<SceneId, SceneDoc>(BUILTIN.map((b) => {
    const s = stars[b.id]
    return [b.id, { ...b, star: typeof s === 'boolean' ? s : b.star }]
  }))
  const all = () => [...user.values()].sort(byCreated)

  async function put(doc: SceneDoc) {
    const d = own({ ...doc, created: doc.created ?? user.get(doc.id)?.created ?? Date.now() })
    await db.put(d)
    user.set(d.id, d)
    if (!kv.getItem(PERSISTED)) void globalThis.navigator?.storage?.persist().then((ok) => ok && kv.setItem(PERSISTED, '1'))
    notify()
  }

  return {
    /** Reads every stored scene; a corrupt one is skipped with a console error. */
    async load() {
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
    get: (id: SceneId): SceneDoc | undefined => user.get(id) ?? builtin.get(id),
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
        notify()
        return
      }
      const d = user.get(id)
      if (d) void put({ ...d, star: on }).catch((e: unknown) => console.error('library', e))
    },
    /** The library's favourites: a new Set per change, so it is its own snapshot. */
    favs: () => favs,
    setFav(id: string, on: boolean) {
      const f = new Set(favs)
      if (on) f.add(id)
      else f.delete(id)
      favs = f
      kv.setItem(FAVS, JSON.stringify([...f]))
      notify()
    },
    /** The autopilot's order: the starred built-ins as BUILTIN lists them, then the starred user scenes, oldest first.
     *  `camLive` false: a scene that needs the camera sits out (user 2026-11-16: it played as a duplicate); a manual
     *  pick (director.cut) still opens it. Nothing starred: the built-ins starred by default, as the director needs a
     *  non-empty playlist (plan S2.1). */
    playlist(camLive = true): SceneId[] {
      const on = (d: SceneDoc) => d.star && (camLive || !needsCamera(d))
      const ids = [...builtin.values(), ...all()].filter(on).map((d) => d.id)
      return ids.length ? ids : BUILTIN.filter(on).map((d) => d.id)
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

/** A file into the downloads, the recorder's way (recorder.ts). */
function download(name: string, text: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 40_000)
}

export const library = createLibrary(idb(), globalThis.localStorage, download)
