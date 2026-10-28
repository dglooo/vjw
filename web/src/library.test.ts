import { afterEach, expect, test, vi } from 'vitest'
import type { Binding } from './bind'
import type { SceneDoc } from './doc'
import { docs } from './edit'
import { createLibrary, type Db } from './library'
import { BUILTIN } from './scenes/builtin'

const B: Binding = { source: 'bass', amount: 1, attack: 0, release: 0.15, min: 0, max: 1 }
const scene = (id: string, over: Partial<SceneDoc> = {}): SceneDoc => ({
  v: 1, id, name: id, star: false, layers: [{ gen: { ref: 'native/tunnel' }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 }], ...over,
})
const STARRED = BUILTIN.filter((d) => d.star).map((d) => d.id)
const file = (x: unknown) => new File([typeof x === 'string' ? x : JSON.stringify(x)], 'f.json')

/** What the browser keeps across a reload (IndexedDB rows, localStorage) and the downloads; `open()` is a page load. */
function browser() {
  const rows = new Map<string, unknown>()
  const kv = new Map<string, string>()
  const files: { name: string; text: string }[] = []
  const db: Db = {
    all: async () => [...rows.values()].map((r) => structuredClone(r)),
    put: async (d) => rows.set(d.id, structuredClone(d)),
    del: async (id) => rows.delete(id),
  }
  const open = () =>
    createLibrary(db, { getItem: (k) => kv.get(k) ?? null, setItem: (k, v) => void kv.set(k, v) }, (name, text) => void files.push({ name, text }))
  return { rows, kv, files, open }
}
async function loaded(b = browser()) {
  const lib = b.open()
  await lib.load()
  return lib
}
/** The library's next change notification. */
const changed = (lib: ReturnType<typeof createLibrary>) =>
  new Promise<void>((ok) => {
    const off = lib.onChange(() => {
      off()
      ok()
    })
  })

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  docs.clear()
})

test('a stored scene survives a reload; user scenes list oldest first, an overwrite keeps its place', async () => {
  const b = browser()
  const lib = await loaded(b)
  await lib.put(scene('u-late', { created: 200 }))
  await lib.put(scene('u-early', { created: 100 }))
  vi.setSystemTime(300)
  await lib.put(scene('u-now')) // no created: now
  await lib.put(scene('u-early', { name: 'Renamed' })) // over the stored one: its created stays
  expect(lib.all().map((d) => [d.id, d.name, d.created])).toEqual([['u-early', 'Renamed', 100], ['u-late', 'u-late', 200], ['u-now', 'u-now', 300]])
  const again = b.open()
  expect(again.all()).toEqual([])
  await again.load()
  expect(again.all()).toStrictEqual(lib.all())
  expect(again.get('builtin:tunnel')).toStrictEqual(BUILTIN[0])
  expect(again.get('nope')).toBeUndefined()
})

test('put refuses what would not load back: an invalid scene, a built-in id', async () => {
  const b = browser()
  const lib = await loaded(b)
  await expect(lib.put(scene('u-1', { name: '' }))).rejects.toThrow(/^name: /)
  await expect(lib.put({ ...BUILTIN[0] })).rejects.toThrow(/^id: builtin:tunnel is a built-in/)
  expect(b.rows.size).toBe(0)
  expect(lib.all()).toEqual([])
  expect(lib.get('builtin:tunnel')).toStrictEqual(BUILTIN[0])
})

test('load skips a corrupt row and a row under a built-in id, with a console error each', async () => {
  const b = browser()
  b.rows.set('u-1', scene('u-1'))
  b.rows.set('bad', { v: 1, id: 'bad' })
  b.rows.set('builtin:tunnel', { ...BUILTIN[0], name: 'Shadow' })
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  const lib = await loaded(b)
  expect(lib.all().map((d) => d.id)).toEqual(['u-1'])
  expect(lib.get('builtin:tunnel')!.name).toBe('Tunnel')
  expect(error).toHaveBeenCalledTimes(2)
})

test('export → import round-trips every user scene into an empty browser, and survives its reload', async () => {
  const src = browser()
  const from = await loaded(src)
  const rich = scene('u-1', {
    name: 'My tunnel', star: true, created: 5,
    layers: [{
      gen: { ref: 'toy/x', code: 'void mainImage(out vec4 o, vec2 p) { o = vec4(1); }', credit: 'me', values: { k: [1, 2], on: true } },
      fx: [{ ref: 'isf/Kaleidoscope', values: { angle: 0.1 }, bind: { angle: { ...B, source: 'lfo', shape: 'saw', rate: 2 } } }],
      blend: 'add', opacity: 0.5, speed: 2, res: 0.5, bind: { opacity: B },
    }],
  })
  await from.put(rich)
  await from.put(scene('u-2', { created: 9 }))
  from.exportLibrary()
  expect(src.files).toHaveLength(1)
  const { name, text } = src.files[0]
  expect(JSON.parse(text)).toStrictEqual({ v: 1, scenes: from.all() })

  const dst = browser()
  const to = await loaded(dst)
  expect(await to.importFile(new File([text], name))).toBeNull()
  expect(to.all()).toStrictEqual(from.all())
  expect(to.get('u-1')).toStrictEqual(rich)
  const reloaded = await loaded(dst)
  expect(reloaded.all()).toStrictEqual(from.all())
  expect(reloaded.playlist()).toEqual([...STARRED, 'u-1'])
})

test('export names the file by the local date, either side of midnight', async () => {
  const b = browser()
  const lib = await loaded(b)
  for (const h of [0, 23]) {
    vi.setSystemTime(new Date(2026, 9, 28, h, 30))
    lib.exportLibrary()
  }
  expect(b.files.map((f) => f.name)).toEqual(['veejay-library-2026-10-28.json', 'veejay-library-2026-10-28.json'])
  expect(JSON.parse(b.files[0].text)).toStrictEqual({ v: 1, scenes: [] })
})

test('import refuses bad JSON, another version or one bad scene, and then changes nothing', async () => {
  const b = browser()
  const lib = await loaded(b)
  await lib.put(scene('u-1', { name: 'Kept' }))
  expect(await lib.importFile(file('{ nope'))).toMatch(/JSON/)
  expect(await lib.importFile(file({ v: 2, scenes: [] }))).toBe('v: unsupported library version 2')
  expect(await lib.importFile(file({ ...scene('u-1'), v: 2 }))).toBe('v: unsupported scene version 2')
  expect(await lib.importFile(file({ v: 1, scenes: [scene('u-1', { name: 'Lost' }), { ...scene('u-2'), layers: [] }] }))).toMatch(/^layers: /)
  expect(await lib.importFile(file('[]'))).toMatch(/^library: not an object/)
  expect(lib.all().map((d) => d.name)).toEqual(['Kept'])
  expect([...b.rows.keys()]).toEqual(['u-1'])
})

test('import id collisions: a user id overwrites, the last of a repeated id wins, a built-in id comes in as new', async () => {
  const b = browser()
  const lib = await loaded(b)
  await lib.put(scene('u-1', { name: 'Old', created: 7 }))
  const scenes = [scene('u-1', { name: 'New' }), scene('u-2', { name: 'First' }), scene('u-2', { name: 'Second' }), { ...BUILTIN[0], name: 'My tunnel' }]
  expect(await lib.importFile(file({ v: 1, scenes }))).toBeNull()
  expect(lib.get('u-1')).toMatchObject({ name: 'New', created: 7 })
  expect(lib.get('u-2')!.name).toBe('Second')
  const mine = lib.all().find((d) => d.name === 'My tunnel')!
  expect(mine.id).toMatch(/^[0-9a-f-]{36}$/)
  expect(mine.layers).toStrictEqual(BUILTIN[0].layers)
  expect(lib.get('builtin:tunnel')).toStrictEqual(BUILTIN[0])
  expect(lib.all().map((d) => d.id)).toEqual(['u-1', 'u-2', mine.id])
  expect([...b.rows.keys()]).toEqual(['u-1', 'u-2', mine.id])
  const ids = lib.playlist()
  expect(ids).toEqual([...STARRED, mine.id]) // the copy is starred, as its built-in was; no id twice
  expect(await lib.importFile(file(scene('u-3')))).toBeNull() // a single scene
  expect(lib.get('u-3')).toBeDefined()
})

test('stars: built-ins in their order, then starred user scenes oldest first; built-in stars survive a reload', async () => {
  const b = browser()
  const lib = await loaded(b)
  expect(lib.playlist()).toEqual(STARRED)
  lib.setStar('builtin:tunnel', false)
  const rest = STARRED.filter((id) => id !== 'builtin:tunnel')
  expect(lib.playlist()).toEqual(rest)
  expect(lib.get('builtin:tunnel')!.star).toBe(false)
  expect(BUILTIN[0].star).toBe(true) // the built-in itself is untouched
  await lib.put(scene('u-late', { star: true, created: 20 }))
  await lib.put(scene('u-early', { star: true, created: 10 }))
  await lib.put(scene('u-off', { created: 5 }))
  expect(lib.playlist()).toEqual([...rest, 'u-early', 'u-late'])

  const again = b.open()
  expect(again.playlist()).toEqual(rest) // before load: the built-in stars are in localStorage
  await again.load()
  expect(again.playlist()).toEqual([...rest, 'u-early', 'u-late'])
  const off = changed(again)
  again.setStar('u-late', false)
  await off
  expect(again.playlist()).toEqual([...rest, 'u-early'])
  expect(b.rows.get('u-late')).toMatchObject({ star: false, created: 20 })
  again.setStar('builtin:tunnel', true)
  expect(again.playlist()).toEqual([...STARRED, 'u-early'])
  expect((await loaded(b)).playlist()).toEqual([...STARRED, 'u-early'])
  again.setStar('nope', true) // unknown: nothing
  expect(again.playlist()).toEqual([...STARRED, 'u-early'])
})

test('nothing starred: the playlist falls back to the built-ins starred by default, never empty', async () => {
  const b = browser()
  const lib = await loaded(b)
  for (const d of BUILTIN) lib.setStar(d.id, false)
  expect(STARRED.length).toBeGreaterThan(0)
  expect(lib.playlist()).toEqual(STARRED)
  const again = await loaded(b)
  expect(BUILTIN.filter((d) => again.get(d.id)!.star)).toEqual([]) // every star kept, not only the last
  expect(again.playlist()).toEqual(STARRED)
  await lib.put(scene('u-1', { star: true }))
  expect(lib.playlist()).toEqual(['u-1'])
  const off = changed(lib)
  lib.setStar('u-1', false)
  await off
  expect(lib.playlist()).toEqual(STARRED)
})

test('corrupt built-in stars in localStorage: the built-ins keep their own', async () => {
  for (const bad of ['{ oops', 'null', '5', '{"builtin:tunnel":0}']) {
    const b = browser()
    b.kv.set('vjw.stars', bad)
    const lib = await loaded(b)
    expect(lib.playlist()).toEqual(STARRED)
    lib.setStar('builtin:tunnel', false)
    expect(JSON.parse(b.kv.get('vjw.stars')!)).toMatchObject({ 'builtin:tunnel': false })
    expect((await loaded(b)).playlist()).not.toContain('builtin:tunnel')
  }
})

test("setStar stars the panel's unsaved copy along, so a later save keeps it", async () => {
  const lib = await loaded()
  docs.set('builtin:tunnel', structuredClone(BUILTIN[0]))
  lib.setStar('builtin:tunnel', false)
  expect(docs.get('builtin:tunnel')!.star).toBe(false)
  await lib.put(scene('u-1'))
  docs.set('u-1', { ...scene('u-1'), name: 'Unsaved' })
  const off = changed(lib)
  lib.setStar('u-1', true)
  await off
  expect(docs.get('u-1')).toMatchObject({ star: true, name: 'Unsaved' })
  expect(lib.get('u-1')).toMatchObject({ star: true, name: 'u-1' }) // the unsaved edit stays unsaved
})

test('onChange after every change until unsubscribed; del forgets a scene; persist is asked until granted', async () => {
  const persist = vi.fn(async () => true)
  vi.stubGlobal('navigator', { storage: { persist } })
  const b = browser()
  const lib = b.open()
  const cb = vi.fn()
  const off = lib.onChange(cb)
  await lib.load()
  expect(cb).toHaveBeenCalledTimes(1)
  await lib.put(scene('u-1'))
  expect(cb).toHaveBeenCalledTimes(2)
  lib.setStar('builtin:tunnel', false)
  expect(cb).toHaveBeenCalledTimes(3)
  await lib.importFile(file(scene('u-2')))
  expect(cb).toHaveBeenCalledTimes(4)
  await lib.del('u-1')
  expect(cb).toHaveBeenCalledTimes(5)
  expect(lib.get('u-1')).toBeUndefined()
  expect([...b.rows.keys()]).toEqual(['u-2'])
  off()
  await lib.put(scene('u-3'))
  expect(cb).toHaveBeenCalledTimes(5)
  expect(persist).toHaveBeenCalledTimes(1)
  expect(b.kv.get('vjw.persisted')).toBe('1')

  const denied = vi.fn(async () => false)
  vi.stubGlobal('navigator', { storage: { persist: denied } })
  const c = browser()
  const other = await loaded(c)
  await other.put(scene('u-1'))
  await other.put(scene('u-2'))
  expect(denied).toHaveBeenCalledTimes(2) // not granted: asked again on the next save
  expect(c.kv.has('vjw.persisted')).toBe(false)
})
