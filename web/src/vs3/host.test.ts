// vs3/host.ts's logic: the donor `s` from our sources, the screen redirect, the scenes' panel rows as inputs and back.
// No GL: the engine is mocked.
import { expect, test, vi } from 'vitest'
import { defaults } from '../doc'
import type { Input } from '../fx/types'
import { PALETTES, paramInputs, put, screen, signal, specHi, VS3, type Signal } from './host'

const fsId = 'node:fs' // the app tsconfig has no node types (serpent.test.ts T-F2d)
vi.mock('../gl/engine', () => ({ fullscreenProgram: () => () => {}, gl: {} })) // takes the page's canvas + WebGL at import

test('signal: levels from the donor-mode bands, kick = hit, onKick on its rise × kickAccent, onMid = onHigh on the rise of mid', () => {
  const src = { syn_BassLevel: 0.6, syn_MidLevel: 0.5, syn_MidHighLevel: 0.4, syn_HighLevel: 0.3, syn_Level: 0.7, kickAccent: 0.8 }
  const s = signal(src, 1, 0.1, {} as Signal)
  expect(s).toEqual({ kick: 1, onKick: 0.8, onMid: 0, onHigh: 0, sub: 0.6, mids: 0.5, highs: 0.4, air: 0.3, energy: 0.7 })
  expect(signal(src, 0.9, 1, s).onKick).toBe(0) // a falling hit: no impulse
  expect(signal(src, 0.12, 0.1, s).onKick).toBe(0) // a rise under shatter's RISE (.05): no impulse
  expect(signal({}, 1, 0, s)).toEqual({ kick: 1, onKick: 1, onMid: 0, onHigh: 0, sub: 0, mids: 0, highs: 0, air: 0, energy: 0 }) // no kickAccent: hit; no levels: 0; no mid: no impulse
  expect(signal({}, 0, 0, s, 0.9, 0)).toMatchObject({ onKick: 0, onMid: 0.9, onHigh: 0.9 }) // the rise of mid: both, at its value
  expect(signal({}, 0, 0, s, 0.8, 0.9)).toMatchObject({ onMid: 0, onHigh: 0 }) // a falling mid: no impulse
})

test('signal, analyser vs3: the levels and bands are the core\'s, onKick = the gated hit at its rise (no kickAccent); back to ours drops bands', () => {
  const src = { syn_BassLevel: 0.6, syn_Level: 0.7, kickAccent: 0.8 }
  const v = { sub: 0.1, mids: 0.2, highs: 0.3, air: 0.4, energy: 0.5, bands: new Float32Array(8), kick: 1, onKick: 1, onMid: 1, onHigh: 1, specHi: new Float32Array(192) }
  const s = signal(src, 0.9, 0, {} as Signal, 0, 0, v)
  expect(s).toEqual({ kick: 0.9, onKick: 0.9, onMid: 0, onHigh: 0, sub: 0.1, mids: 0.2, highs: 0.3, air: 0.4, energy: 0.5, bands: v.bands }) // the core's onMid / onHigh never pass raw
  expect(signal(src, 0.9, 0, s)).toEqual({ kick: 0.9, onKick: 0.8, onMid: 0, onHigh: 0, sub: 0.6, mids: 0, highs: 0, air: 0, energy: 0.7 })
  expect(s.bands).toBeUndefined()
})

test('specHi: our 32 bands stretched over the 192 donor bins, ends kept', () => {
  const src = Object.fromEntries(Array.from({ length: 32 }, (_, i) => [`band${i}`, i / 31]))
  const out = specHi(src, new Float32Array(192))
  expect([out[0], out[191]]).toEqual([0, 1])
  expect(out[96]).toBeCloseTo(96 / 191, 5) // a ramp stays a ramp
  expect(specHi({}, out).every((v) => v === 0)).toBe(true) // no bands: zeros, never NaN
})

test('screen: null and undefined mean the layer RT, the buffer size is its size, both restored after', () => {
  const calls: unknown[] = []
  const set = vi.fn((t: unknown) => calls.push(t))
  const size = vi.fn()
  const R = { setRenderTarget: set, getDrawingBufferSize: size }
  const rt = { width: 640, height: 360 }, sim = { width: 8, height: 8 }, made = new Set<unknown>()
  const v = { x: 0, y: 0, set(x: number, y: number) { return Object.assign(this, { x, y }) } }
  const r = screen(R, rt, made, () => {
    R.setRenderTarget(sim)
    R.setRenderTarget(null)
    R.setRenderTarget(undefined)
    R.getDrawingBufferSize(v)
    return 7
  })
  expect(r).toBe(7)
  expect(calls).toEqual([sim, rt, rt])
  expect([v.x, v.y]).toEqual([640, 360])
  expect([...made]).toEqual([sim, rt])
  expect([R.setRenderTarget, R.getDrawingBufferSize]).toEqual([set, size])
  expect(() => screen(R, rt, made, () => { throw new Error('x') })).toThrow('x') // restored on a throw too
  expect(R.setRenderTarget).toBe(set)
})

test('paramInputs: mode = a select by index, sliders in paramOrder (else the donor order), labels as the default mode reads them', () => {
  const sc = {
    modes: ['ring', 'cross'], paramOrder: ['fill', 'speed', 'gone'],
    params: { mode: 'cross', speed: 0.5, fill: 0.2, shape: 0.7, model: 'knot' },
    paramLabels: { '*': { fill: 'zoom', speed: 'rate' }, cross: { speed: null } },
  }
  expect(paramInputs(sc)).toEqual([
    { name: 'mode', type: 'long', values: [0, 1], labels: ['ring', 'cross'], default: 1 },
    { name: 'fill', type: 'float', label: 'zoom', default: 0.2, min: 0, max: 1 },
    { name: 'speed', type: 'float', label: undefined, default: 0.5, min: 0, max: 1 }, // null in this mode: the name
  ]) // shape is not in paramOrder, a string is no slider (a model only with models()), a key the scene lacks is skipped
  expect(paramInputs({ params: { contrast: 0.5, speed: 0.3 } }).map((i) => i.name)).toEqual(['speed', 'contrast']) // the donor order
  expect(paramInputs({ models: () => ['knot', 'bust'], params: { model: 'bust', fill: 0.5, eyeFollow: true } })).toEqual([
    { name: 'model', type: 'long', values: [0, 1], labels: ['knot', 'bust'], default: 1 }, // limitless 3d's model
    { name: 'fill', type: 'float', label: undefined, default: 0.5, min: 0, max: 1 },
    { name: 'eyeFollow', type: 'bool', default: true }, // a boolean: a checkbox
  ])
  expect(paramInputs({})).toEqual([]) // aurora, blob: no params
})

test('put: the values into the params, mode back to its name, a mode index out of range keeps the current one', () => {
  const ps = paramInputs({ modes: ['ring', 'cross'], params: { mode: 'ring', fill: 0.5 } })
  const P: Record<string, unknown> = { mode: 'ring', fill: 0.5, own: 1 }
  put(P, ps, { mode: 1, fill: 0.9, hit: 1 })
  expect(P).toEqual({ mode: 'cross', fill: 0.9, own: 1 }) // hit is not a row; the scene's other fields stay
  put(P, ps, { mode: 7, fill: 0.1 })
  expect(P).toEqual({ mode: 'cross', fill: 0.1, own: 1 })
})

test('params.json = every registered scene\'s rows (regenerate: npx vitest run -u); untouched inputs leave its params as they were', async () => {
  const canvas = { getContext: () => new Proxy({}, { get: () => () => ({ addColorStop() {}, data: new Uint8ClampedArray(4) }) }) } // the scenes' sprite canvases (gradients, image data)
  vi.stubGlobal('document', { createElement: () => canvas })
  const rows: Record<string, Input[]> = {}
  for (const d of VS3) {
    const sc = (await d.load()).default(), ps = (rows[d.id.slice(11)] = paramInputs(sc)), P = { ...sc.params }
    put(P, ps, defaults({ ...d, inputs: ps })) // the values an untouched node draws with
    expect(P, d.id).toEqual(sc.params ?? {}) // so an existing built-in renders as before
  }
  expect(PALETTES).toEqual((await import('./kit/lib/palette.js')).PRESETS.map((p: { name: string }) => p.name)) // the palette select's indices
  vi.unstubAllGlobals()
  expect(Object.values(rows).flat().length).toBeGreaterThan(200)
  const json = `{\n${Object.entries(rows).map(([k, v]) => `${JSON.stringify(k)}: [${v.map((i) => `\n  ${JSON.stringify(i)}`).join(',')}\n]`).join(',\n')}\n}\n`
  await expect(json).toMatchFileSnapshot('./params.json')
})

test('loadScan (limitless 3d): one fetch and decode per scan, every pick its own Group, mesh, geometry and material', async () => {
  const { readFileSync } = (await import(/* @vite-ignore */ fsId)) as { readFileSync(p: string): Uint8Array<ArrayBuffer> }
  const fetch = vi.fn(async () => new Response(readFileSync('public/vs3/models/hand.lm3d')))
  vi.stubGlobal('fetch', fetch)
  const { loadScan } = await import('./kit/lib/model-scans.js')
  const [a, b] = await Promise.all([loadScan('hand'), loadScan('hand')])
  vi.unstubAllGlobals()
  const [ma, mb] = [a.children[0], b.children[0]]
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(a).not.toBe(b) // two layers never share one (finishModel re-parents and re-centres it)
  expect([ma.geometry === mb.geometry, ma.material === mb.material]).toEqual([false, false])
  expect(ma.geometry.attributes.position.count).toBe(mb.geometry.attributes.position.count)
  expect(ma.geometry.attributes.position.count).toBeGreaterThan(10000)
})
