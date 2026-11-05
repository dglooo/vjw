// The library's tile stills (2b S3.3, design S6, Variant B): a bake queue renders each block's tile scene on its own
// tile() instance (live.ts), K frames at dt 1/60 on the live Sources and audio textures, then reads it back
// asynchronously (a pixel-pack buffer behind a fence, MDN's pattern) into an ImageData kept for the session. App.ts
// calls frame() before the live render, editor only; Library.tsx hands over the blocks and which tiles are on screen.
import { bindFramebufferInfo } from 'twgl.js'
import type { Sources } from '../bind'
import type { SceneDoc } from '../doc'
import type { FrameInput } from '../frame'
import { catalog, toyDef } from '../fx/catalog'
import type { EffectDef, ShaderDef } from '../fx/types'
import { gl, programAsync, renderTarget, type Target } from '../gl/engine'
import { live, tile, type Live } from '../gl/live'
import { store } from '../store'

export const W = 320 // a still's px (rows bottom-up: the canvases flip them, CSS scaleY(-1))
export const H = 180
export const SLICE = 6 // tile-frames per rAF
export const LATE = 0.02 // s: a frame longer than this was late; the rAF after it bakes nothing
const DT = 1 / 60

/** A tile waiting for its still: its doc as queued, `left` frames to render, `ready` once its shaders compiled,
 *  `milk` when a milk/* node is in it, `live` its tile() instance once its bake started. */
export interface Job { id: string; doc: SceneDoc; left: number; ready: boolean; milk: boolean; live?: Live }

const nodes = (doc: SceneDoc) => doc.layers.flatMap((l) => [l.gen, ...l.fx])
const hasMilk = (doc: SceneDoc) => nodes(doc).some((n) => n.ref.startsWith('milk/'))

/** K (design S6): 1 frame when no node is a native or has a persistent pass, else 90 (trails and rings need their
 *  history). A toy (not in the catalog) is one plain pass. */
export function bakeFrames(doc: SceneDoc, cat: ReadonlyMap<string, EffectDef>): number {
  const deep = nodes(doc).some((n) => {
    const d = cat.get(n.ref)
    return !!d && ('create' in d || !!(d as ShaderDef).passes?.some((p) => p.persistent))
  })
  return deep ? 90 : 1
}

/** This rAF's bake (design S6) as [job, frames] runs: nothing on the rAF after a late frame; else ≤ SLICE
 *  tile-frames over the ready jobs, the started one first (so ≤ 1 bake instance is alive), then the visible ones, then
 *  the rest, each in queue order. */
export function nextSlice(queue: readonly Job[], dt: number, visible: ReadonlySet<string>): [Job, number][] {
  const out: [Job, number][] = []
  if (dt > LATE) return out
  const rank = (j: Job) => (j.live ? 2 : visible.has(j.id) ? 1 : 0)
  let budget = SLICE
  for (const j of queue.filter((x) => x.ready).sort((a, b) => rank(b) - rank(a))) {
    if (!budget) break
    const n = Math.min(j.left, budget)
    out.push([j, n])
    budget -= n
  }
  return out
}

/** `id` into the queue with `doc`, unless a job for it waits there already (a started one bakes on, this one after
 *  it). Its shaders compile off the main thread first (programAsync); one that fails leaves the tile without a still. */
export function requeue(queue: Job[], id: string, doc: SceneDoc, cat: ReadonlyMap<string, EffectDef>, compile: (doc: SceneDoc) => Promise<unknown>) {
  if (queue.some((j) => j.id === id && !j.live)) return
  const j: Job = { id, doc, left: bakeFrames(doc, cat), ready: false, milk: hasMilk(doc) }
  queue.push(j)
  compile(doc).then(
    () => (j.ready = true),
    () => queue.splice(queue.indexOf(j), 1), // ready never: the only remover of a job that never started
  )
}

const compile = (doc: SceneDoc) =>
  Promise.all(
    nodes(doc)
      .map((n) => (n.ref.startsWith('toy/') ? toyDef(n) : catalog.get(n.ref)))
      .filter((d): d is ShaderDef => !!d && 'fs' in d)
      .map((d) => programAsync(d.vs, d.fs)),
  )

const docs = new Map<string, SceneDoc>() // every block the library listed: what its tile renders
const cache = new Map<string, ImageData>()
const queue: Job[] = []
const reads: { id: string; pbo: WebGLBuffer; sync: WebGLSync }[] = [] // in flight, oldest first
const spare: WebGLBuffer[] = [] // pixel-pack buffers done with
const subs = new Set<() => void>()
/** The tiles on screen (Library.tsx's IntersectionObserver): baked first. */
export const visible = new Set<string>()
const tf = {} as FrameInput // the tile frames' input: the live one at dt 1/60
let acc: Target | undefined // the bake's W×H target, made at its first frame
let prev = 0 // the last frame's time, s

/** acc's pixels into a pixel-pack buffer, then a fence: poll() reads them once the GPU got there (no stall). */
function read(id: string) {
  let pbo = spare.pop()
  if (!pbo) {
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, (pbo = gl.createBuffer()))
    gl.bufferData(gl.PIXEL_PACK_BUFFER, W * H * 4, gl.STREAM_READ)
  } else gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo)
  bindFramebufferInfo(gl, acc)
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, 0)
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
  reads.push({ id, pbo, sync: gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)! })
}

/** The signalled readbacks (fences signal in order: up to the first one still pending) into the cache, opaque as the
 *  stage (alpha: false) shows them; one wake-up per still. */
function poll() {
  while (reads.length) {
    const r = reads[0]
    const st = gl.clientWaitSync(r.sync, 0, 0)
    if (st === gl.TIMEOUT_EXPIRED) return
    reads.shift()
    gl.deleteSync(r.sync)
    spare.push(r.pbo)
    if (st === gl.WAIT_FAILED) continue
    const img = new ImageData(W, H)
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, r.pbo)
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, img.data)
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
    for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255
    cache.set(r.id, img)
    subs.forEach((cb) => cb())
  }
}

/** The bake (frozen contract CP3, without S3.4's hover). */
export const tiles = {
  /** Every rAF in the editor, right before the live render: reads back what the GPU finished, then bakes this rAF's
   *  slice. A milk tile waits while the live scene has a milk layer: both would take turns resizing milkdrop's one
   *  copy() texture. ponytail: the 30 fps mode renders every other rAF, so its every frame reads as late and nothing
   *  bakes; compare to the mode's interval if the editor runs there. */
  frame(f: FrameInput, s: Sources) {
    poll()
    const dt = f.time - prev // rAF's, unscaled by heat
    prev = f.time
    const id = store.getSnapshot().edited
    const milk = !!id && hasMilk(live(id).doc)
    const slice = nextSlice(milk ? queue.filter((j) => j.live || !j.milk) : queue, dt, visible)
    if (!slice.length) return
    if (!acc) (acc = renderTarget()).fit(W, H)
    Object.assign(tf, f).dt = DT
    for (const [j, n] of slice) {
      j.live ??= tile(j.doc, W, H)
      for (let i = 0; i < n; i++) j.live.render(tf, s, acc)
      if ((j.left -= n)) continue
      read(j.id)
      j.live.dispose() // the readback reads acc, ours
      queue.splice(queue.indexOf(j), 1)
    }
  },
  /** A tile's still, rows bottom-up; undefined until its first bake lands. */
  get: (id: string) => cache.get(id),
  /** Bakes `id` again from its latest doc (once, however often called); its old still shows until then. */
  invalidate(id: string) {
    const doc = docs.get(id)
    if (doc) requeue(queue, id, doc, catalog, compile)
  },
  onChange(cb: () => void) {
    subs.add(cb)
    return () => subs.delete(cb)
  },
  /** Library.tsx, as the editor closes: a started bake lets its instance go (a milk one holds a pooled visualizer the
   *  live show may need) and starts over next time. */
  pause() {
    for (const j of queue) {
      if (!j.live) continue
      j.live.dispose()
      j.live = undefined
      j.left = bakeFrames(j.doc, catalog)
    }
  },
  /** Library.tsx, per render: the blocks it lists (their docs kept current); a new one is queued. */
  want(blocks: readonly { id: string; scene: SceneDoc }[]) {
    for (const b of blocks) {
      const known = docs.has(b.id)
      docs.set(b.id, b.scene)
      if (!known) requeue(queue, b.id, b.scene, catalog, compile)
    }
  },
}
