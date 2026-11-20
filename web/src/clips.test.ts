// The clip library (clips.ts): drops (video files only, a name replaced), remove, the folder's handle kept through io
// (save, load, forget) and its permission (granted at once, or waiting for allow()). The platform is a fake: node has
// no IndexedDB, directory picker or <video>.
import { expect, test, vi } from 'vitest'
import { createClips, isClip, type ClipsIo } from './clips'

const file = (name: string, type = '') => new File(['x'], name, { type })
/** A directory handle: these entries ('sub/' a subfolder), this permission, `next` from requestPermission. */
function folder(name: string, entries: string[], state: PermissionState, next: PermissionState = 'granted') {
  return {
    name,
    kind: 'directory',
    async *values() {
      for (const n of entries) yield n.endsWith('/') ? { kind: 'directory', name: n.slice(0, -1) } : { kind: 'file', name: n, getFile: async () => file(n) }
    },
    queryPermission: vi.fn(async () => state),
    requestPermission: vi.fn(async () => next),
  } as unknown as FileSystemDirectoryHandle
}
/** The platform with one IndexedDB record (`stored`); the picker returns `picked`, else it was closed. */
function fake(stored?: FileSystemDirectoryHandle, picked?: FileSystemDirectoryHandle) {
  let rec = stored
  const io = {
    load: vi.fn(async () => rec),
    save: vi.fn(async (h: FileSystemDirectoryHandle) => (rec = h)),
    forget: vi.fn(async () => (rec = undefined)),
    pick: vi.fn(async () => {
      if (!picked) throw new DOMException('The user aborted a request.', 'AbortError')
      return picked
    }),
    duration: vi.fn(async (f: File) => f.name.length), // a stand-in duration, s
  } satisfies ClipsIo
  return { io, rec: () => rec }
}
const names = (c: ReturnType<typeof createClips>) => c.all().map((x) => x.name)

test('isClip: by type, or by extension when the OS gave none', () => {
  for (const f of [file('a.mp4'), file('A.MOV'), file('b.m4v'), file('x', 'video/webm'), file('y.bin', 'video/quicktime')]) expect(isClip(f), f.name).toBe(true)
  for (const f of [file('t.flac', 'audio/flac'), file('m.mp3'), file('scene.json', 'application/json'), file('s.glsl')]) expect(isClip(f), f.name).toBe(false)
})

test('add: the video files of a drop join (a dropped name replaced), each gets its duration; remove drops one', async () => {
  const c = createClips(fake().io)
  const seen = vi.fn()
  c.onChange(seen)
  expect(c.add([file('a.mp4'), file('song.mp3', 'audio/mpeg'), file('bb.webm')])).toEqual(['a.mp4', 'bb.webm'])
  const rev = c.rev
  expect(c.add([file('song.wav', 'audio/wav')])).toEqual([]) // no video: no change
  expect(c.rev).toBe(rev)
  const again = file('a.mp4')
  c.add([again])
  expect(names(c)).toEqual(['bb.webm', 'a.mp4'])
  expect(c.get('a.mp4')?.file).toBe(again)
  expect(c.get('a.mp4')?.folder).toBe(false)
  await vi.waitFor(() => expect(c.get('bb.webm')?.duration).toBe(7))
  expect(seen).toHaveBeenCalled()
  c.remove('bb.webm')
  expect(names(c)).toEqual(['a.mp4'])
})

test('pick: the handle saved (the reference the next visit loads), the folder listed: its videos by name, no subfolder', async () => {
  const h = folder('clips', ['b.mov', 'notes.txt', 'a.mp4', 'sub/'], 'granted')
  const { io, rec } = fake(undefined, h)
  const c = createClips(io)
  await c.pick()
  expect(io.save).toHaveBeenCalledWith(h)
  expect(rec()).toBe(h)
  expect(names(c)).toEqual(['a.mp4', 'b.mov'])
  expect(c.all().every((x) => x.folder)).toBe(true)
  expect(c.folder()).toBe('clips')
})

test('pick closed: nothing saved, nothing listed', async () => {
  const { io } = fake()
  const c = createClips(io)
  await c.pick()
  expect(io.save).not.toHaveBeenCalled()
  expect(c.folder()).toBeNull()
  expect(names(c)).toEqual([])
})

test('restore: a stored folder Chrome still grants is listed at once; one it asks about waits for the one click', async () => {
  const live = createClips(fake(folder('live', ['x.mp4'], 'granted')).io)
  await live.restore()
  expect(names(live)).toEqual(['x.mp4'])
  expect(live.ask()).toBeNull()

  const h = folder('set', ['y.webm'], 'prompt')
  const c = createClips(fake(h).io)
  await c.restore()
  expect(c.ask()).toBe('set')
  expect(names(c)).toEqual([])
  await c.allow()
  expect((h as unknown as { requestPermission: unknown }).requestPermission).toHaveBeenCalledWith({ mode: 'read' })
  expect(names(c)).toEqual(['y.webm'])
  expect(c.ask()).toBeNull()
  expect(c.folder()).toBe('set')
})

test('allow refused: the folder keeps waiting; nothing stored, or a folder gone: restore lists nothing and never throws', async () => {
  const c = createClips(fake(folder('set', ['y.webm'], 'prompt', 'denied')).io)
  await c.restore()
  await c.allow()
  expect(c.ask()).toBe('set')
  expect(names(c)).toEqual([])

  const none = createClips(fake().io)
  await none.restore()
  expect(none.ask()).toBeNull()

  const gone = folder('moved', [], 'granted')
  Object.assign(gone, { values: () => ({ [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(new DOMException('gone', 'NotFoundError')) }) }) })
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const g = createClips(fake(gone).io)
  await g.restore()
  expect(names(g)).toEqual([])
  expect(g.folder()).toBeNull()
  expect(warn).toHaveBeenCalledOnce()
  warn.mockRestore()
})

test('forget: the record and the folder clips go, the dropped stay; a dropped clip hides the folder clip of its name', async () => {
  const { io, rec } = fake(undefined, folder('clips', ['a.mp4', 'b.mp4'], 'granted'))
  const c = createClips(io)
  await c.pick()
  const mine = file('a.mp4')
  c.add([mine])
  expect(names(c)).toEqual(['a.mp4', 'b.mp4'])
  expect(c.get('a.mp4')?.file).toBe(mine)
  c.remove('b.mp4') // a folder clip stays with its folder
  expect(names(c)).toEqual(['a.mp4', 'b.mp4'])
  await c.forget()
  expect(io.forget).toHaveBeenCalledOnce()
  expect(rec()).toBeUndefined()
  expect(names(c)).toEqual(['a.mp4'])
  expect(c.folder()).toBeNull()
})
