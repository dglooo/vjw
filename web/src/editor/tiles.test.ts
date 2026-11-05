// 2b S3.3: the bake's pure scheduler (design S6): K per tile, the per-rAF slice, a re-queue.
import { expect, test, vi } from 'vitest'
import type { NodeDoc, SceneDoc } from '../doc'
import type { EffectDef, ShaderDef } from '../fx/types'
import type { Live } from '../gl/live'
import { bakeFrames, nextSlice, requeue, SLICE, type Job } from './tiles'

vi.mock('../gl/engine', () => ({})) // takes the page's canvas + WebGL at import; the scheduler needs neither
vi.mock('../gl/live', () => ({}))
vi.mock('../fx/catalog', () => ({})) // the natives behind it reach for WebGL and Butterchurn

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
