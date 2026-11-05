// 2b S3.3: the bake's pure scheduler (design S6): K per tile, the per-rAF slice, a re-queue. S3.4: the hovered tile, on
// a fake GL whose readbacks never land.
import { expect, test, vi } from 'vitest'
import type { Sources } from '../bind'
import type { NodeDoc, SceneDoc } from '../doc'
import type { FrameInput } from '../frame'
import type { EffectDef, ShaderDef } from '../fx/types'
import { tile, type Live } from '../gl/live'
import { bakeFrames, nextSlice, requeue, SLICE, tiles, type Job } from './tiles'

const gl = vi.hoisted(() => ({
  PIXEL_PACK_BUFFER: 0, STREAM_READ: 0, RGBA: 0, UNSIGNED_BYTE: 0, SYNC_GPU_COMMANDS_COMPLETE: 0, TIMEOUT_EXPIRED: 1,
  createBuffer: () => ({}), bindBuffer() {}, bufferData() {}, readPixels: vi.fn(), fenceSync: () => ({}), clientWaitSync: () => 1,
}))
// The real engine takes the page's canvas + WebGL at import; the catalog's natives reach for WebGL and Butterchurn.
vi.mock('../gl/engine', () => ({ gl, renderTarget: () => ({ fit() {} }) }))
vi.mock('../gl/live', () => ({ tile: vi.fn((doc: SceneDoc) => ({ doc, render: vi.fn(), dispose: vi.fn() })) }))
vi.mock('../fx/catalog', () => ({ catalog: new Map() }))
vi.mock('twgl.js', () => ({ bindFramebufferInfo() {} }))

const shader = (id: string, persistent = false): ShaderDef =>
  ({ id, name: id, kind: 'filter', credit: '', inputs: [], glsl: 300, vs: '', fs: '', passes: [{ persistent, float: false }] })
const CATALOG = new Map<string, EffectDef>([
  shader('isf/plain'),
  shader('own/trail', true),
  { ...shader('native/tunnel'), create: () => ({ draw() {} }) } as EffectDef,
].map((d) => [d.id, d] as const))
const scene = (...refs: string[]): SceneDoc =>
  ({ v: 1, id: 's', name: 's', star: false, layers: [{ gen: { ref: refs[0] }, fx: refs.slice(1).map((ref): NodeDoc => ({ ref })), blend: 'normal', opacity: 1, speed: 1, res: 1 }] })
const job = (id: string, left: number, over: Partial<Job> = {}): Job => ({ id, doc: scene('isf/plain'), left, ready: true, milk: false, ...over })
const frames = (s: [Job, number][]) => s.map(([j, n]) => `${j.id}:${n}`)

test('bakeFrames: 1 for plain shaders and toys, 90 once a node is a native or has a persistent pass', () => {
  expect(bakeFrames(scene('isf/plain', 'isf/plain'), CATALOG)).toBe(1)
  expect(bakeFrames(scene('toy/x'), CATALOG)).toBe(1) // a toy is not in the catalog: one plain pass
  expect(bakeFrames(scene('isf/plain', 'own/trail'), CATALOG)).toBe(90)
  expect(bakeFrames(scene('native/tunnel', 'isf/plain'), CATALOG)).toBe(90) // an effect's tile runs over tunnel
})

test('nextSlice: ≤ SLICE tile-frames, finishing a job before the next one starts', () => {
  const s = nextSlice([job('a', 1), job('b', 1), job('c', 90), job('d', 1)], 1 / 60, new Set())
  expect(frames(s)).toEqual(['a:1', 'b:1', 'c:4'])
  expect(s.reduce((n, [, k]) => n + k, 0)).toBe(SLICE)
  expect(frames(nextSlice([job('a', 2)], 1 / 60, new Set()))).toEqual(['a:2']) // less work than the slice: just that
})

test('nextSlice: nothing on the rAF after a late frame (dt > 20 ms)', () => {
  expect(nextSlice([job('a', 1)], 0.021, new Set())).toEqual([])
  expect(nextSlice([job('a', 1)], 0.02, new Set())).toHaveLength(1)
})

test('nextSlice: the started job first, then the visible ones, then the rest; compiling ones wait', () => {
  const q = [job('a', 90), job('b', 1, { ready: false }), job('c', 1), job('d', 90, { live: {} as Live }), job('e', 1)]
  expect(frames(nextSlice(q, 1 / 60, new Set(['b', 'e'])))).toEqual(['d:6'])
  q[3].left = 2
  expect(frames(nextSlice(q, 1 / 60, new Set(['b', 'e'])))).toEqual(['d:2', 'e:1', 'a:3'])
})

test('requeue (invalidate): once, however often; again behind a started bake of the same tile', async () => {
  const q: Job[] = []
  const compile = vi.fn(() => Promise.resolve())
  requeue(q, 'a', scene('isf/plain'), CATALOG, compile)
  requeue(q, 'a', scene('isf/plain'), CATALOG, compile)
  expect(q.map((j) => j.id)).toEqual(['a'])
  expect(compile).toHaveBeenCalledTimes(1)
  await Promise.resolve()
  expect(q[0].ready).toBe(true) // compiled: bakeable from the next frame
  q[0].live = {} as Live // its bake started: an edit since needs one more
  requeue(q, 'a', scene('native/tunnel'), CATALOG, compile)
  requeue(q, 'a', scene('native/tunnel'), CATALOG, compile)
  expect(q.map((j) => [j.id, j.left])).toEqual([['a', 1], ['a', 90]])
})

test('requeue: a tile whose shaders fail to compile leaves the queue (no still)', async () => {
  const q: Job[] = []
  requeue(q, 'a', scene('isf/plain'), CATALOG, () => Promise.reject(new Error('compile')))
  expect(q).toHaveLength(1)
  await new Promise((r) => setTimeout(r))
  expect(q).toHaveLength(0)
})

const at = (time: number) => ({ time, dt: 1 / 60 }) as FrameInput // 1 s apart: every frame reads as late, so the bake idles
const S = {} as Sources

test('hover: one live tile, drawn every frame; a swap or a leave lets the old one go', () => {
  const a = scene('isf/plain')
  const b = scene('own/trail')
  tiles.want([{ id: 'a', scene: a }, { id: 'b', scene: b }])
  tiles.hover('a')
  tiles.frame(at(1), S)
  tiles.hover('a') // the same tile: it runs on
  tiles.frame(at(2), S)
  tiles.hover('b')
  tiles.frame(at(3), S)
  expect(vi.mocked(tile).mock.calls.map(([d]) => d)).toEqual([a, b])
  const [la, lb] = vi.mocked(tile).mock.results.map((r) => r.value as Live)
  expect(la.render).toHaveBeenCalledTimes(2)
  expect(la.dispose).toHaveBeenCalledOnce()
  tiles.hover(null)
  expect(lb.dispose).toHaveBeenCalledOnce()
  tiles.frame(at(4), S)
  expect(lb.render).toHaveBeenCalledOnce() // left: nothing draws
})

test('hover: read back on every 3rd frame (20 fps), from its first', () => {
  tiles.hover('a')
  const n = gl.readPixels.mock.calls.length
  for (let i = 0; i < 7; i++) tiles.frame(at(10 + i), S)
  expect(gl.readPixels.mock.calls.length - n).toBe(3) // its frames 0, 3, 6
  tiles.hover(null)
})
