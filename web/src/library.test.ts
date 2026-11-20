import { afterEach, expect, test, vi } from 'vitest'
import { SOURCE_IDS, type Binding } from './bind'
import { parseScene, type LayerDoc, type SceneDoc } from './doc'
import { docs, MUSIC_TIME, newShader, toyCode } from './edit'
import { byName, createLibrary, GROUPS, type Db, type Disk } from './library'
import { MILK_SCENES } from './milkdrop/presets'
import { BUILTIN } from './scenes/builtin'

const B: Binding = { source: 'bass', amount: 1, attack: 0, release: 0.15, min: 0, max: 1 }
const scene = (id: string, over: Partial<SceneDoc> = {}): SceneDoc => ({
  v: 1, id, name: id, star: false, layers: [{ gen: { ref: 'native/tunnel' }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 }], ...over,
})
const STARRED = BUILTIN.filter((d) => d.star).sort(byName).map((d) => d.id) // the list's order
const file = (x: unknown) => new File([typeof x === 'string' ? x : JSON.stringify(x)], 'f.json')
type Lib = ReturnType<typeof createLibrary>
/** `ids` in the list's order. */
const inOrder = (lib: Lib, ids: string[]) => ids.map((id) => lib.get(id)!).sort(byName).map((d) => d.id)

/** What the browser keeps across a reload (IndexedDB rows, localStorage) and the downloads; `open()` is a page load.
 *  `marks`: the dev server's web/scene-marks.json (`text` undefined: none yet). `baked`: a build's defaults. */
function browser(marks?: { text?: string; unreadable?: boolean }, baked?: unknown) {
  const rows = new Map<string, unknown>()
  const kv = new Map<string, string>()
  const files: { name: string; text: string }[] = []
  const db: Db = {
    all: async () => [...rows.values()].map((r) => structuredClone(r)),
    put: async (d) => rows.set(d.id, structuredClone(d)),
    del: async (id) => rows.delete(id),
  }
  const disk: Disk | undefined = marks && {
    read: async () => {
      if (marks.unreadable) throw new Error('unreadable')
      return marks.text === undefined ? null : JSON.parse(marks.text)
    },
    write: (text) => void (marks.text = text),
  }
  const open = () =>
    createLibrary(db, { getItem: (k) => kv.get(k) ?? null, setItem: (k, v) => void kv.set(k, v) }, (name, text) => void files.push({ name, text }), disk, baked)
  return { rows, kv, files, open }
}
async function loaded(b = browser()) {
  const lib = b.open()
  await lib.load()
  return lib
}
/** The library's next change notification. */
const changed = (lib: Lib) =>
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

test('a shader editor scene (one Shadertoy layer on the music clock) saves and loads back as a shader scene', async () => {
  const b = browser()
  const lib = await loaded(b)
  const code = 'void mainImage(out vec4 c, in vec2 p) {\n  c = vec4(p / iResolution.xy, 0.5 + 0.5 * sin(iTime), 1.0);\n}'
  const d = newShader(code)
  expect(docs.get(d.id)).toBe(d) // the draft plays before it is saved, as New's
  await lib.put({ ...d, id: 'u-shader', name: 'Mine', created: 1 }) // Save as…
  const back = (await loaded(b)).get('u-shader')!
  expect(back).toStrictEqual({ ...d, id: 'u-shader', name: 'Mine', created: 1 })
  expect(toyCode(back)).toBe(code) // the shader editor reopens it on its code
  expect(back.layers[0].bind).toEqual({ speed: MUSIC_TIME })
  expect(toyCode(scene('u-1'))).toBeUndefined() // a native's scene opens a new draft instead
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
  expect(reloaded.playlist()).toEqual(inOrder(reloaded, [...STARRED, 'u-1']))
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
  expect(ids).toEqual(inOrder(lib, [...STARRED, mine.id])) // the copy is starred, as its built-in was; no id twice
  expect(await lib.importFile(file(scene('u-3')))).toBeNull() // a single scene
  expect(lib.get('u-3')).toBeDefined()
})

test('stars: the starred scenes, built-in and user alike, in the list order; built-in stars survive a reload', async () => {
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
  expect(lib.playlist()).toEqual(inOrder(lib, [...rest, 'u-early', 'u-late']))

  const again = b.open()
  expect(again.playlist()).toEqual(rest) // before load: the built-in stars are in localStorage
  await again.load()
  expect(again.playlist()).toEqual(inOrder(again, [...rest, 'u-early', 'u-late']))
  const off = changed(again)
  again.setStar('u-late', false)
  await off
  expect(again.playlist()).toEqual(inOrder(again, [...rest, 'u-early']))
  expect(b.rows.get('u-late')).toMatchObject({ star: false, created: 20 })
  again.setStar('builtin:tunnel', true)
  expect(again.playlist()).toEqual(inOrder(again, [...STARRED, 'u-early']))
  expect((await loaded(b)).playlist()).toEqual(inOrder(again, [...STARRED, 'u-early']))
  again.setStar('nope', true) // unknown: nothing
  expect(again.playlist()).toEqual(inOrder(again, [...STARRED, 'u-early']))
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

test('no live camera: a scene that needs one (a camera node or a masked layer) sits out of the playlist (user 2026-11-16)', async () => {
  const DJ = ['builtin:dj-over-tunnel', 'builtin:dj-inside', 'builtin:dj-ghost']
  expect(STARRED).toEqual(expect.arrayContaining(DJ))
  const rest = STARRED.filter((id) => !DJ.includes(id))
  const plain = scene('x').layers[0]
  const lib = await loaded()
  await lib.put(scene('u-outline', { star: true, created: 1, layers: [plain, { ...plain, gen: { ref: 'native/outline' } }] }))
  await lib.put(scene('u-mask', { star: true, created: 2, layers: [{ ...plain, mask: 'background' }] }))
  await lib.put(scene('u-plain', { star: true, created: 3 }))
  expect(lib.playlist(false)).toEqual(inOrder(lib, [...rest, 'u-plain']))
  expect(lib.playlist(true)).toEqual(inOrder(lib, [...STARRED, 'u-outline', 'u-mask', 'u-plain'])) // the camera plays: they join again
  expect(lib.playlist()).toEqual(lib.playlist(true))
  const only = await loaded() // only camera scenes starred, no camera: the default stars that need none, never empty
  for (const id of rest) only.setStar(id, false)
  expect(only.playlist(true)).toEqual(inOrder(only, DJ))
  expect(only.playlist(false)).toEqual(rest)
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

test('I-LIB1: the GPU3D demos are built-ins, all unstarred, none in the playlist (with or without a camera)', async () => {
  const DEMOS = ['builtin:demo-fluid', 'builtin:demo-particles', 'builtin:demo-model'] // plan_gpu3d: S3.2, S1.5, S4.7 (exactly 3)
  expect(BUILTIN.filter((d) => d.id.startsWith('builtin:demo-')).map((d) => [d.id, d.star])).toEqual(DEMOS.map((id) => [id, false]))
  const lib = await loaded()
  for (const cam of [true, false]) expect(lib.playlist(cam).filter((id) => DEMOS.includes(id))).toEqual([])
})

test('marks survive a reload (the favourites under their old key), apart from the stars and the export; a corrupt value → none', async () => {
  const b = browser()
  const lib = await loaded(b)
  const none = { favourite: new Set(), trash: new Set(), rework: new Set() }
  expect(lib.marks()).toEqual(none)
  const off = changed(lib)
  lib.mark('favourite', 'builtin:spectrum', true)
  await off
  const before = lib.marks()
  lib.mark('favourite', 'builtin:tunnel', true)
  lib.mark('rework', 'builtin:tunnel', true)
  lib.mark('trash', 'builtin:glitch', true)
  lib.mark('favourite', 'builtin:spectrum', false)
  expect(before.favourite).toEqual(new Set(['builtin:spectrum'])) // a snapshot: a change makes a new set
  const now = { favourite: new Set(['builtin:tunnel']), trash: new Set(['builtin:glitch']), rework: new Set(['builtin:tunnel']) }
  expect(lib.marks()).toEqual(now)
  expect(b.open().marks()).toEqual(now)
  expect(JSON.parse(b.kv.get('vjw.favs')!)).toEqual(['builtin:tunnel'])
  expect(lib.get('builtin:glitch')!.star).toBe(true) // the stars apart
  await lib.put(scene('u-1'))
  lib.exportLibrary()
  expect(b.files[0].text).not.toContain('builtin:')
  for (const bad of ['{ oops', 'null', '5', '{"own/bloom":true}', '[1,null]']) {
    b.kv.set('vjw.favs', bad)
    expect(b.open().marks().favourite).toEqual(new Set())
  }
})

test('the list and the playlist (user 2026-11-19): one order by name; All plays the starred, a mark view its scenes, the trash none', async () => {
  const b = browser()
  const lib = await loaded(b)
  await lib.put(scene('u-1', { name: 'Aaa user', star: true }))
  await lib.put(scene('u-2', { name: 'Bbb user' })) // unstarred
  const list = lib.listed('all').map((d) => d.id)
  expect(list.length).toBe(BUILTIN.length + 2)
  expect(lib.listed('all')).toEqual([...lib.listed('all')].sort(byName))
  // All: the list less the unstarred (a built-in starred off stays listed), top to bottom.
  const rotation = list.filter((id) => lib.get(id)!.star)
  expect(lib.playlist()).toEqual(rotation)
  expect(rotation).not.toContain('builtin:demo-fluid')
  expect(list).toContain('builtin:demo-fluid')
  // ←/→ from a scene out of the rotation: on from its place in the list.
  const after = list.slice(list.indexOf('builtin:demo-fluid') + 1).find((id) => rotation.includes(id))
  expect(rotation[lib.slot('builtin:demo-fluid')!]).toBe(after)
  expect(lib.slot('builtin:spectrum')).toBe(rotation.indexOf('builtin:spectrum'))
  expect(lib.slot('nope')).toBeUndefined()

  // Trash: out of All, the favourites and the rotation; its own view lists it, and plays All's.
  lib.mark('trash', 'builtin:tunnel', true)
  lib.mark('trash', 'u-1', true)
  expect(lib.listed('trash').map((d) => d.id)).toEqual(['u-1', 'builtin:tunnel'])
  expect(lib.listed('all').map((d) => d.id)).toEqual(list.filter((id) => id !== 'builtin:tunnel' && id !== 'u-1'))
  const all = rotation.filter((id) => id !== 'builtin:tunnel' && id !== 'u-1')
  expect(lib.playlist()).toEqual(all)
  lib.setView('trash')
  expect(lib.playlist()).toEqual(all)

  // Favourites: none yet plays All; a favourite plays starred or not, a trashed one not; the view survives a reload.
  lib.setView('favourite')
  expect(lib.listed()).toEqual([])
  expect(lib.playlist()).toEqual(all)
  for (const id of ['builtin:spectrum', 'builtin:demo-fluid', 'builtin:tunnel']) lib.mark('favourite', id, true)
  expect(lib.playlist()).toEqual(inOrder(lib, ['builtin:spectrum', 'builtin:demo-fluid']))
  expect(lib.listed().map((d) => d.id)).toEqual(lib.playlist())
  expect(b.open().view()).toBe('favourite')
  // Rework (user 2026-11-21): All lists it, but only its own view plays it, starred or not.
  expect(all).toContain('builtin:glitch') // starred
  lib.mark('rework', 'builtin:glitch', true)
  lib.setView('rework')
  expect(lib.playlist()).toEqual(['builtin:glitch'])
  lib.setView('all')
  expect(lib.listed().map((d) => d.id)).toContain('builtin:glitch')
  expect(lib.playlist()).toEqual(all.filter((id) => id !== 'builtin:glitch'))
  for (const bad of ['"toString"', '"nope"', '{ oops', '5']) {
    b.kv.set('vjw.view', bad)
    expect(b.open().view()).toBe('all')
  }
})

test('groups (user 2026-11-20): read off the nodes; every built-in in one, the camera scenes also in ours', () => {
  const of = (d: SceneDoc) => Object.entries(GROUPS).filter(([, f]) => f(d)).map(([g]) => g)
  const DJ = ['builtin:dj-over-tunnel', 'builtin:dj-inside', 'builtin:dj-ghost', 'builtin:show-frame-cam']
  const MILK = MILK_SCENES.map((d) => d.id) // not by id: builtin:milk-honey-smoke-bile is a synScene
  for (const d of BUILTIN) {
    const id = d.id
    const own = DJ.includes(id) ? ['ours', 'camera'] : MILK.includes(id) ? ['milk'] : id.startsWith('builtin:vs3-') ? ['vs3'] : null
    if (own) expect(of(d), id).toEqual(own)
    else expect([['ours'], ['vs2']], id).toContainEqual(of(d))
  }
  const count = (g: keyof typeof GROUPS) => BUILTIN.filter(GROUPS[g]).length
  expect([count('vs3'), count('vs2'), count('camera'), count('mine')]).toEqual([38, 85, 4, 0]) // the donor port: 85 of 87
  expect(of(BUILTIN.find((d) => d.id === 'builtin:vs3-limitless')!)).toEqual(['vs3']) // a vs3 filter over our tunnel
  const plain = scene('x').layers[0]
  expect(of(scene('u-1', { layers: [plain, { ...plain, gen: { ref: 'milk/x' } }] }))).toEqual(['milk', 'ours', 'mine'])
  expect(of(newShader('void mainImage(out vec4 c, in vec2 p) {}'))).toEqual(['ours', 'mine'])
})

test('a group lists and plays all its scenes, starred or not, less the trash; the view narrows it; empty: every group', async () => {
  const b = browser()
  const lib = await loaded(b)
  const VS3 = BUILTIN.filter((d) => d.id.startsWith('builtin:vs3-')).map((d) => d.id)
  expect(BUILTIN.filter((d) => VS3.includes(d.id) && !d.star)).toEqual([]) // all starred by default (user 2026-11-21): All plays them
  expect(lib.playlist()).toEqual(expect.arrayContaining(VS3))
  expect(lib.group()).toBe('all')
  lib.setGroup('vs3')
  const list = inOrder(lib, VS3)
  expect(lib.listed().map((d) => d.id)).toEqual(list)
  expect(lib.playlist()).toEqual(list)
  lib.mark('trash', VS3[0], true)
  const rest = list.filter((id) => id !== VS3[0])
  expect(lib.playlist()).toEqual(rest)
  lib.setView('trash') // the group's trash lists, and plays the group's All
  expect(lib.listed().map((d) => d.id)).toEqual([VS3[0]])
  expect(lib.playlist()).toEqual(rest)
  lib.setView('favourite')
  expect(lib.playlist()).toEqual(rest) // no favourite in the group yet
  lib.mark('favourite', VS3[1], true)
  lib.mark('favourite', 'builtin:tunnel', true) // another group's
  expect(lib.playlist()).toEqual([VS3[1]])
  lib.mark('rework', VS3[1], true) // out of the favourites and the group too: the group's All plays, less it
  expect(lib.playlist()).toEqual(rest.filter((id) => id !== VS3[1]))
  lib.mark('rework', VS3[1], false)
  expect(b.open().group()).toBe('vs3')

  lib.setView('all')
  lib.setGroup('mine') // empty: every group, All's starred (less the trashed vs3 scene, starred too)
  expect(lib.listed()).toEqual([])
  const starred = STARRED.filter((id) => id !== VS3[0])
  expect(lib.playlist()).toEqual(starred)
  await lib.put(scene('u-1')) // unstarred, still plays in its group
  expect(lib.playlist()).toEqual(['u-1'])
  lib.setGroup('camera') // no live camera: nothing of it plays, so every group's All less the camera scenes
  const DJ = ['builtin:dj-over-tunnel', 'builtin:dj-inside', 'builtin:dj-ghost']
  expect(lib.playlist(true)).toEqual(inOrder(lib, [...DJ, 'builtin:show-frame-cam'])) // the show template: unstarred, in its group
  expect(lib.playlist(false)).toEqual(starred.filter((id) => !DJ.includes(id)))
  for (const bad of ['"all"', '"toString"', '"favourite"', '{ oops', '5']) {
    b.kv.set('vjw.group', bad)
    expect(b.open().group()).toBe('all')
  }
})

test('dev marks file (web/scene-marks.json): ours start it, each change mirrors it sorted, it wins at load, an unreadable one is left alone', async () => {
  const disk: { text?: string; unreadable?: boolean } = {}
  const b = browser(disk)
  b.kv.set('vjw.favs', JSON.stringify(['builtin:tunnel'])) // favourites from before the file
  b.kv.set('vjw.stars', JSON.stringify({ 'builtin:tunnel': false, 'builtin:glitch': 0 })) // a corrupt star stays out
  const lib = await loaded(b)
  expect(JSON.parse(disk.text!)).toEqual({ favourite: ['builtin:tunnel'], trash: [], rework: [], stars: { 'builtin:tunnel': false } })
  lib.mark('trash', 'u-b', true)
  lib.mark('trash', 'u-a', true)
  lib.mark('rework', 'builtin:spectrum', true)
  lib.setStar('builtin:demo-fluid', true)
  const marks = { favourite: ['builtin:tunnel'], trash: ['u-a', 'u-b'], rework: ['builtin:spectrum'], stars: { 'builtin:demo-fluid': true, 'builtin:tunnel': false } }
  expect(disk.text).toBe(`${JSON.stringify(marks, null, 2)}\n`)
  const wiped = browser(disk) // a browser data wipe: the file brings the marks and stars back, into localStorage too
  const again = await loaded(wiped)
  expect(again.marks()).toEqual({ favourite: new Set(marks.favourite), trash: new Set(marks.trash), rework: new Set(marks.rework) })
  expect([again.get('builtin:demo-fluid')!.star, again.get('builtin:tunnel')!.star]).toEqual([true, false])
  expect(wiped.open().marks()).toEqual(again.marks())
  expect(wiped.open().get('builtin:tunnel')!.star).toBe(false)
  disk.text = JSON.stringify({ favourite: ['builtin:glitch'], trash: [], rework: [] }) // a file from before the stars
  await loaded(wiped)
  expect(JSON.parse(disk.text)).toEqual({ favourite: ['builtin:glitch'], trash: [], rework: [], stars: marks.stars }) // gets ours
  disk.unreadable = true
  const text = disk.text
  expect((await loaded(browser(disk))).marks().trash).toEqual(new Set())
  expect(disk.text).toBe(text)
})

test('a build bakes scene-marks.json in (user 2026-11-20): a stored mark or star beats it, it beats a built-in own star', async () => {
  const baked = { favourite: ['builtin:glitch'], trash: ['builtin:tunnel'], rework: ['builtin:spectrum'], stars: { 'builtin:spectrum': false, 'builtin:demo-fluid': true, 'builtin:glitch': false } }
  const b = browser(undefined, baked)
  b.kv.set('vjw.favs', JSON.stringify(['builtin:particles'])) // stored
  b.kv.set('vjw.rework', '{ oops') // corrupt: as none stored
  b.kv.set('vjw.stars', JSON.stringify({ 'builtin:demo-fluid': false }))
  const lib = await loaded(b)
  expect(lib.marks()).toEqual({ favourite: new Set(['builtin:particles']), trash: new Set(['builtin:tunnel']), rework: new Set(['builtin:spectrum']) })
  const star = (id: string) => lib.get(id)!.star
  expect([star('builtin:demo-fluid'), star('builtin:spectrum'), star('builtin:particles')]).toEqual([false, false, true]) // stored, baked, own
  expect(lib.playlist()).toEqual(STARRED.filter((id) => !['builtin:tunnel', 'builtin:spectrum', 'builtin:glitch'].includes(id)))
  lib.setStar('builtin:glitch', true) // a visitor's change: stored, and only it, so a later build's defaults still reach the rest
  expect(JSON.parse(b.kv.get('vjw.stars')!)).toEqual({ 'builtin:demo-fluid': false, 'builtin:glitch': true })
  expect(b.open().get('builtin:glitch')!.star).toBe(true)
  for (const junk of [null, 5, 'x', [1], { favourite: 'builtin:tunnel', stars: [true] }]) {
    const none = await loaded(browser(undefined, junk)) // no defaults: today's library
    expect([none.playlist(), none.marks().favourite]).toEqual([STARRED, new Set()])
  }
})

test('user presets (presets.ts): saved per ref after a reload, a name saved again moves to the end, delete; mirrored and baked as the marks', async () => {
  const disk: { text?: string } = {}
  const b = browser(disk)
  const lib = await loaded(b)
  const ref = 'native/vs3-tendril'
  lib.savePreset(ref, 'a', { mode: 1, fill: 0.2 })
  lib.savePreset(ref, 'b', { mode: 2, fill: 0.4 })
  lib.savePreset(ref, 'a', { mode: 3, fill: 0.6 }) // over a: it moves to the end
  lib.savePreset('native/vs3-locus', 'c', { shape: 0.5 })
  const tendril = [{ name: 'b', values: { mode: 2, fill: 0.4 } }, { name: 'a', values: { mode: 3, fill: 0.6 } }]
  expect((await loaded(b)).presets(ref)).toEqual(tendril) // a reload
  expect(JSON.parse(disk.text!).presets).toEqual({ [ref]: tendril, 'native/vs3-locus': [{ name: 'c', values: { shape: 0.5 } }] })
  lib.deletePreset('native/vs3-locus', 'c')
  expect(lib.presets('native/vs3-locus')).toEqual([])
  expect(Object.keys(JSON.parse(disk.text!).presets)).toEqual([ref]) // an empty ref leaves the file
  const wiped = await loaded(browser(disk)) // a browser data wipe: the dev file brings them back
  expect(wiped.presets(ref)).toEqual(tendril)
  const baked = browser(undefined, { presets: { [ref]: [{ name: 'x', values: { fill: 1 } }, { name: 'bad', values: { fill: 'no' } }, { values: {} }] } })
  expect((await loaded(baked)).presets(ref)).toEqual([{ name: 'x', values: { fill: 1 } }]) // a build's defaults, the corrupt ones left out
  baked.kv.set('vjw.presets', JSON.stringify({ [ref]: [{ name: 'y', values: { fill: 0 } }] }))
  expect((await loaded(baked)).presets(ref)).toEqual([{ name: 'y', values: { fill: 0 } }]) // a stored one beats them
})

test('preset favourites (ui/Presets.tsx): ☆ per ref over a reload, mirrored into the marks file (none: left out), back after a wipe, baked', async () => {
  const disk: { text?: string } = {}
  const b = browser(disk)
  const lib = await loaded(b)
  const ref = 'native/vs3-tendril'
  lib.setPresetFav(ref, '★ lace', true)
  lib.setPresetFav(ref, 'mine', true)
  lib.setPresetFav('native/vs3-ink', '★ tripped', true)
  lib.setPresetFav(ref, '★ lace', false)
  const favs = { [ref]: ['mine'], 'native/vs3-ink': ['★ tripped'] }
  expect((await loaded(b)).presetFavs()).toEqual(favs) // a reload
  expect(JSON.parse(disk.text!).presetFavs).toEqual(favs)
  expect((await loaded(browser(disk))).presetFavs()).toEqual(favs) // a browser data wipe: the dev file brings them back
  lib.setPresetFav(ref, 'mine', false)
  lib.setPresetFav('native/vs3-ink', '★ tripped', false)
  expect([lib.presetFavs(), JSON.parse(disk.text!).presetFavs]).toEqual([{}, undefined]) // none: left out of the file
  const baked = browser(undefined, { presetFavs: { [ref]: ['x', 5], 'native/vs3-ink': 'no' } })
  expect((await loaded(baked)).presetFavs()).toEqual({ [ref]: ['x'] }) // a build's defaults, the corrupt ones left out
  baked.kv.set('vjw.presetFavs', JSON.stringify({ [ref]: ['y'] }))
  expect((await loaded(baked)).presetFavs()).toEqual({ [ref]: ['y'] }) // a stored one beats them
})

test('MIDI mappings (midi.ts): stored over a reload, mirrored into the marks file (empty: left out), back after a wipe, baked', async () => {
  const disk: { text?: string } = {}
  const b = browser(disk)
  const lib = await loaded(b)
  const maps = [{ ctl: { kind: 'note', ch: 1, num: 36 }, target: { kind: 'key', code: 'KeyT' } }]
  lib.setMidi(maps)
  expect((await loaded(b)).midi()).toEqual(maps)
  expect(JSON.parse(disk.text!).midi).toEqual(maps)
  expect((await loaded(browser(disk))).midi()).toEqual(maps) // a browser data wipe: the dev file brings them back
  lib.setMidi([])
  expect(JSON.parse(disk.text!).midi).toBeUndefined()
  expect((await loaded(browser(undefined, { midi: maps }))).midi()).toEqual(maps) // a build's defaults
})

test('set lists (setlist.ts): stored over a reload, mirrored into the marks file (none: left out), back after a wipe, baked, a bad cue left out', async () => {
  const disk: { text?: string } = {}
  const b = browser(disk)
  const lib = await loaded(b)
  const sets = [{ name: 'Friday', cues: [{ scene: 'builtin:tunnel', bars: 4 }, { scene: 'builtin:plexus', preset: 'x', bars: 'hold' as const, transition: 'gl/Swirl' }] }]
  lib.setSets(sets)
  expect((await loaded(b)).sets()).toEqual(sets) // a reload
  expect(JSON.parse(disk.text!).sets).toEqual(sets)
  expect((await loaded(browser(disk))).sets()).toEqual(sets) // a browser data wipe: the dev file brings them back
  lib.setSets([])
  expect(JSON.parse(disk.text!).sets).toBeUndefined()
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const baked = await loaded(browser(undefined, { sets: [{ name: 'B', cues: [{ scene: 'builtin:tunnel', bars: 8 }, { scene: 'builtin:tunnel', bars: -1 }] }] }))
  expect(baked.sets()).toEqual([{ name: 'B', cues: [{ scene: 'builtin:tunnel', bars: 8 }] }]) // a build's defaults, the bad cue left out
  expect(warn).toHaveBeenCalledWith('set list: set "B", cue 2: bars -1: a whole number ≥ 1 or "hold" (left out)')
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

test('the camera scenes (plan_camera S2.3): each parses; L0, the fallback, has no person; every person layer fades with presence', () => {
  const person = (l: LayerDoc) => !!l.mask || ['native/camera', 'native/outline'].includes(l.gen.ref)
  for (const id of ['builtin:dj-over-tunnel', 'builtin:dj-inside', 'builtin:dj-ghost']) {
    const d = BUILTIN.find((x) => x.id === id)!
    expect(parseScene(JSON.parse(JSON.stringify(d))), id).toStrictEqual(d)
    expect(person(d.layers[0]), id).toBe(false)
    expect(d.layers.filter(person).length, id).toBeGreaterThan(0)
    for (const l of d.layers.filter(person)) expect(l.bind?.opacity, id).toEqual({ source: 'presence', amount: 1, attack: 0.3, release: 1.5, min: 0, max: 1 })
    const sources = d.layers.flatMap((l) => [l.bind, l.gen.bind, ...l.fx.map((n) => n.bind)]).flatMap((b) => Object.values(b ?? {}).map((x) => x!.source))
    for (const s of sources) expect(SOURCE_IDS, id).toContain(s)
  }
})
