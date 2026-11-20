// The clip library (backlog 8, user 2026-11-20): the user's own video clips for native/video (scenes/video.ts). They
// never leave the machine: nothing uploads them, and no build serves any, so each user brings their own. Two ways in:
// - a clips folder (Chrome: showDirectoryPicker), its handle kept in IndexedDB, so a later visit lists it again after
//   one click (Allow: Chrome asks again for a stored handle) or at once (the user's "Allow on every visit");
// - video files dropped onto the page (ui/Clips.tsx): session-only. A clip that should stay goes into the folder, so
//   the browser keeps no copy of the user's files (no quota, no eviction, no second GB on disk).
// A clip is known by its file name: a scene saves the name, and the same folder brings the same clip back. A dropped
// clip hides the folder's clip of its name. ponytail: the folder's top level only; recurse when clips live in subfolders.

export interface Clip { name: string; file: File; duration: number; folder: boolean } // duration s, NaN until probed

/** The platform: the folder handle's one IndexedDB record, the directory picker, a clip's duration. Tests fake it. */
export interface ClipsIo {
  load(): Promise<FileSystemDirectoryHandle | undefined>
  save(h: FileSystemDirectoryHandle): Promise<unknown>
  forget(): Promise<unknown>
  pick(): Promise<FileSystemDirectoryHandle>
  duration(f: File): Promise<number>
}
/** The File System Access permission calls (Chrome 86+; not in TypeScript's DOM lib). */
type Perm = { queryPermission(d: { mode: 'read' }): Promise<PermissionState>; requestPermission(d: { mode: 'read' }): Promise<PermissionState> }
const perm = (h: FileSystemDirectoryHandle) => h as unknown as Perm

const VIDEO = /\.(mp4|m4v|webm|mov)$/i // the containers Chrome plays (a .mov with H.264 inside; ProRes does not decode)
/** A video file: by its type, or by its extension when the OS gave none. */
export const isClip = (f: { name: string; type: string }) => f.type.startsWith('video/') || VIDEO.test(f.name)

export function createClips(io: ClipsIo) {
  let drops: Clip[] = []
  let dir: Clip[] = []
  let folder: FileSystemDirectoryHandle | null = null
  let ask: FileSystemDirectoryHandle | null = null // a stored folder waiting for the user's click (permission 'prompt')
  const subs = new Set<() => void>()
  const changed = () => {
    clips.rev++
    subs.forEach((cb) => cb())
  }
  /** Each clip's duration, one at a time, published as it lands. */
  async function probe(list: Clip[]) {
    for (const c of list) {
      c.duration = await io.duration(c.file).catch(() => NaN)
      changed()
    }
  }
  /** The folder's video files, by name. A folder gone or unreadable is logged and changes nothing. */
  async function scan(h: FileSystemDirectoryHandle) {
    const found: Clip[] = []
    try {
      for await (const e of h.values()) if (e.kind === 'file' && VIDEO.test(e.name)) found.push({ name: e.name, file: await e.getFile(), duration: NaN, folder: true })
    } catch (e) {
      return console.warn(`clips: the folder ${h.name} could not be read:`, e)
    }
    dir = found.sort((a, b) => a.name.localeCompare(b.name))
    folder = h
    ask = null
    changed()
    void probe(dir)
  }

  const clips = {
    rev: 0, // + 1 per change: native/video finds its clip again, the panel re-renders
    /** Every clip: the dropped ones first, then the folder's that no dropped one hides. */
    all: (): Clip[] => [...drops, ...dir.filter((c) => !drops.some((d) => d.name === c.name))],
    get: (name: string): Clip | undefined => drops.find((c) => c.name === name) ?? dir.find((c) => c.name === name),
    folder: () => folder?.name ?? null,
    ask: () => ask?.name ?? null,
    /** Dropped files: the video ones join for this session, a name already dropped replaced. Returns their names. */
    add(files: Iterable<File>): string[] {
      const add = [...files].filter(isClip).map((file): Clip => ({ name: file.name, file, duration: NaN, folder: false }))
      if (!add.length) return []
      drops = [...drops.filter((c) => !add.some((a) => a.name === c.name)), ...add]
      changed()
      void probe(add)
      return add.map((c) => c.name)
    },
    /** A dropped clip leaves; the folder's stay with their folder (forget()). */
    remove(name: string) {
      drops = drops.filter((c) => c.name !== name)
      changed()
    },
    /** The picker (a user gesture), then the folder kept and listed. Closing the picker changes nothing. */
    async pick() {
      let h: FileSystemDirectoryHandle
      try {
        h = await io.pick()
      } catch {
        return // AbortError: the picker was closed
      }
      await io.save(h)
      await scan(h)
    },
    /** The bar's one click (a user gesture): Chrome asks again for the stored folder; granted, it is listed. */
    async allow() {
      if (ask && (await perm(ask).requestPermission({ mode: 'read' }).catch(() => 'denied')) === 'granted') await scan(ask)
    },
    /** The folder let go: its record and its clips; the dropped ones stay. */
    async forget() {
      folder = ask = null
      dir = []
      changed()
      await io.forget()
    },
    /** At load: the stored folder, listed if Chrome still grants it, else waiting for allow(). */
    async restore() {
      const h = await io.load().catch(() => undefined)
      if (!h) return
      if ((await perm(h).queryPermission({ mode: 'read' })) === 'granted') return scan(h)
      ask = h
      changed()
    },
    onChange(cb: () => void) {
      subs.add(cb)
      return () => subs.delete(cb)
    },
  }
  return clips
}

/** One request on IndexedDB `vjw-clips` (its own database: library.ts's `vjw` stays as it is), store `kv`. */
function kv<T>(mode: IDBTransactionMode, req: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((ok, fail) => {
    const r = indexedDB.open('vjw-clips', 1)
    r.onupgradeneeded = () => r.result.createObjectStore('kv')
    r.onerror = () => fail(r.error)
    r.onsuccess = () => {
      const db = r.result
      const q = req(db.transaction('kv', mode).objectStore('kv'))
      q.onsuccess = () => (db.close(), ok(q.result as T))
      q.onerror = () => (db.close(), fail(q.error))
    }
  })
}

/** A clip's duration from its metadata (a throwaway <video>); NaN when it does not decode. */
function duration(f: File) {
  const v = document.createElement('video')
  const url = URL.createObjectURL(f)
  v.preload = 'metadata'
  v.muted = true
  return new Promise<number>((ok) => {
    v.onloadedmetadata = () => ok(v.duration)
    v.onerror = () => ok(NaN)
    v.src = url
  }).finally(() => {
    URL.revokeObjectURL(url)
    v.removeAttribute('src')
    v.load()
  })
}

const picker = globalThis as unknown as { showDirectoryPicker(o: { id: string; mode: 'read' }): Promise<FileSystemDirectoryHandle> }
export const clips = createClips({
  load: () => kv('readonly', (s) => s.get('folder')),
  save: (h) => kv('readwrite', (s) => s.put(h, 'folder')),
  forget: () => kv('readwrite', (s) => s.delete('folder')),
  pick: () => picker.showDirectoryPicker({ id: 'vjw-clips', mode: 'read' }),
  duration,
})
if (typeof document !== 'undefined' && 'indexedDB' in globalThis) void clips.restore()
