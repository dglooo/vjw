// native/model rows (GPU3D plan S4.2+; matrix_gpu3d). M-U6: every shipped model carries recorded CC0 provenance.
// M-U1..M-U4 (S4.3): three/host.ts's GL-free half runs for real (three's scene graph needs no GL); model.ts takes an
// injected load (resolve, reject, pending) and is re-imported per row for a fresh memo.
import { expect, test, vi } from 'vitest'
import type { FrameInput } from '../frame'
import { fit, pose, rig } from '../three/host'

vi.mock('../gl/engine', () => ({ fullscreenProgram: () => () => {}, gl: {} })) // takes the page's canvas + WebGL at import

const CC0 = 'CC0-1.0' // SPDX id of CC0 1.0 Universal: the only licence a shipped model may carry (matrix ruling G4)
const fsId = 'node:fs' // the app tsconfig has no node types (serpent.test.ts T-F2d)
const gl = {} as WebGL2RenderingContext
const F = { width: 64, height: 40, time: 1, dt: 1 / 60 } as FrameInput
const V = { glass: 0, samples: 1, speed: 1 }
type Obj = { isMesh?: boolean; material?: unknown; skeleton?: { update(): void; boneMatrices: Float32Array } }

/** The shipped model (S4.2), parsed in Node, through the host's GL-free half: a fresh scene per call. */
async function wolf() {
  const { readFileSync } = (await import(/* @vite-ignore */ fsId)) as { readFileSync(p: URL): Uint8Array }
  const b = readFileSync(new URL('../../public/models/Wolf.glb', import.meta.url))
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js')
  return rig(await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), ''))
}
const fakeHost = (render: (...a: never[]) => unknown = vi.fn((rt: unknown) => rt ?? {})) => ({ render, texture: () => null, free: vi.fn() })
/** model.ts with a fresh memo (its load and host are module state) and `load` injected: returns the module + the spy. */
async function fresh(load: () => Promise<unknown>) {
  vi.resetModules()
  const m = await import('./model')
  const spy = vi.fn(load)
  m.loader.load = spy as never
  return { ...m, spy }
}

test('M-U1: one material on every mesh, transparent at glass 0, 0.5 and 1, no program field change', async () => {
  const r = await wolf()
  const key = (m: typeof r.material) => JSON.stringify([m.defines, m.customProgramCacheKey(), Object.entries(m).filter(([k, x]) => k !== 'metalness' && typeof x !== 'object' && typeof x !== 'function')])
  const k0 = key(r.material)
  for (const g of [0, 0.5, 1]) {
    r.apply(pose(1), 1.6, g)
    const mats = new Set<unknown>()
    r.scene.traverse((o: Obj) => o.isMesh && mats.add(o.material))
    expect(mats.size, `glass ${g}`).toBe(1)
    expect(mats.has(r.material), `glass ${g}`).toBe(true)
    expect(r.material.transparent, `glass ${g}`).toBe(true)
    expect(key(r.material), `glass ${g}`).toBe(k0)
  }
})

test('M-U2: samples 1 -> 4 = 1 RT rebuild, 4 -> 4 = 0 rebuilds, 3 -> 1', async () => {
  const sent: unknown[] = []
  let builds = 0
  const h = fakeHost(vi.fn((rt: unknown, w: number, hh: number, s: 1 | 4) => {
    sent.push(s)
    const n = fit(rt, w, hh, s)
    if (n !== rt) builds++
    return n
  }))
  const { model, modelSamples } = await fresh(async () => h)
  const inst = model.create(gl)
  await model.warm!()
  expect([1, 4, 4, 3].map((samples) => (inst.draw(F, { ...V, samples }), builds))).toEqual([1, 2, 2, 3])
  expect(sent).toEqual([1, 4, 4, 1])
  expect([1, 3, 4, NaN].map(modelSamples)).toEqual([1, 1, 4, 1])
})

test('M-U3: the shipped Wolf parsed in Node: 0.5 s of the clip moves the bones; two instances share one scene', async () => {
  const r = await wolf()
  let sk: Obj['skeleton']
  r.scene.traverse((o: Obj) => (sk ??= o.skeleton))
  const bones = (t: number) => {
    r.apply(pose(t), 1.6, 0)
    r.scene.updateMatrixWorld(true) // what render() does before skinning
    sk!.update()
    return Array.from(sk!.boneMatrices)
  }
  const a = bones(0), b = bones(0.5)
  expect(Math.hypot(...a.map((x, i) => x - b[i]))).toBeGreaterThan(1e-3)
  const drawn = new Set<unknown>() // each load parses its own copy: 1 load, 1 scene drawn by both instances
  const { model, spy } = await fresh(async () => {
    const { scene } = await wolf()
    return fakeHost(vi.fn((rt: unknown) => (drawn.add(scene), rt ?? {})))
  })
  const x = model.create(gl), y = model.create(gl)
  await model.warm!()
  x.draw(F, V)
  y.draw(F, V)
  expect([spy.mock.calls.length, drawn.size]).toEqual([1, 1])
})

test('M-U4: hidden until Ready, no draw before; 2 instances = 1 fetch; dispose() in Loading keeps the cache; Failed stays hidden, 1 console.error', async () => {
  let ready!: (h: unknown) => void
  const pending = new Promise((ok) => (ready = ok))
  const { model, spy } = await fresh(() => pending)
  const a = model.create(gl)
  a.draw(F, V) // Loading: nothing to draw
  a.dispose!() // Loading: the load goes on, cached
  const b = model.create(gl)
  expect([a.hidden!(), b.hidden!()]).toEqual([true, true])
  const h = fakeHost()
  ready(h)
  await model.warm!()
  expect(b.hidden!()).toBe(false)
  expect(h.render).not.toHaveBeenCalled()
  b.draw(F, V)
  expect(h.render).toHaveBeenCalledTimes(1)
  expect(spy).toHaveBeenCalledTimes(1)

  const err = vi.spyOn(console, 'error').mockImplementation(() => {})
  const failed = await fresh(() => Promise.reject(new Error('404')))
  const c = failed.model.create(gl), e = failed.model.create(gl)
  await new Promise((ok) => setTimeout(ok, 10)) // no warm(): its handler would hide a rejection create() leaves unhandled
  c.draw(F, V)
  expect([c.hidden!(), e.hidden!()]).toEqual([true, true])
  await expect(failed.model.warm!()).resolves.toBeUndefined()
  expect(err).toHaveBeenCalledTimes(1)
  expect(failed.spy).toHaveBeenCalledTimes(1)
  err.mockRestore()
})

test('M-U6: every .glb / .gltf in public/models has exactly one manifest entry, licence CC0-1.0, an https source', async () => {
  const { readdirSync, readFileSync } = (await import(/* @vite-ignore */ fsId)) as { readdirSync(p: URL): string[]; readFileSync(p: URL, e: 'utf8'): string }
  const dir = new URL('../../public/models/', import.meta.url)
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', dir), 'utf8')) as { file: string; licence: string; source: string }[]
  const models = readdirSync(dir).filter((f) => /\.(glb|gltf)$/i.test(f))
  expect(models.length).toBeGreaterThan(0)
  for (const f of models) {
    const entries = manifest.filter((m) => m.file === f)
    expect(entries, f).toHaveLength(1)
    expect(entries[0].licence, f).toBe(CC0)
    expect(new URL(entries[0].source).protocol, f).toBe('https:')
  }
})
