// vs3/host.ts's logic: the donor `s` from our sources, the screen redirect, the scenes' panel rows as inputs and back.
// No GL: the engine and three's renderer are mocked.
import { expect, test, vi } from 'vitest'
import { defaults } from '../doc'
import type { Input } from '../fx/types'
import { factory, factoryRefs } from '../presets'
import { BUILTIN } from '../scenes/builtin'
import { chainState, frame, PROBE, type LookValues } from './chain'
import { FINISH, PALETTES, paramInputs, put, putLook, screen, signal, specHi, VS3, type Signal } from './host'
import look from './look.json'

const fsId = 'node:fs' // the app tsconfig has no node types (serpent.test.ts T-F2d)
const T = vi.hoisted(() => ({ fits: [] as (readonly number[])[] })) // C12c: every engine target's fit() size
vi.mock('../gl/engine', () => ({ // it takes the page's canvas + WebGL at import
  fullscreenProgram: () => () => {}, gl: {}, shotSize: () => [640, 360], programAsync: async () => {},
  renderTarget: () => ({ framebuffer: {}, attachments: [{}], fit: (w: number, h: number) => void T.fits.push([w, h]) }),
}))
vi.mock('../three/host', () => ({ // C12c: start() without three's renderer
  three: () => ({ R: { setRenderTarget() {}, compileAsync: async () => {} }, guard: (_: string, f: () => unknown) => f(), texture: () => null }),
  fit: () => ({ dispose() {} }), RENDER_LIST: [],
}))
const canvas = { getContext: () => new Proxy({}, { get: () => () => ({ addColorStop() {}, data: new Uint8ClampedArray(4) }) }) } // the scenes' sprite canvases (gradients, image data)

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
  expect(paramInputs({ paramOrder: ['speed'], params: { speed: 0.5, body: 0, hue: 0.1, logo: 0, invert: false }, panelRows: [['body', -1, 1, 'body'], ['hue', -1, 1, 'hue', 'color'], ['gone', 0, 1, 'x']] })).toEqual([
    { name: 'speed', type: 'float', label: undefined, default: 0.5, min: 0, max: 1 },
    { name: 'body', type: 'float', label: 'body', default: 0, min: -1, max: 1 }, // morphogen 2.0's own rows, at their ranges …
    { name: 'hue', type: 'float', label: 'hue', default: 0.1, min: -1, max: 1, group: 'color' }, // … folded by their folder
    { name: 'invert', type: 'bool', default: false },
  ]) // a row the scene lacks is skipped; logo has no row
})

test('put: the values into the params, mode back to its name, a mode index out of range keeps the current one', () => {
  const ps = paramInputs({ modes: ['ring', 'cross'], params: { mode: 'ring', fill: 0.5 } })
  const P: Record<string, unknown> = { mode: 'ring', fill: 0.5, own: 1 }
  put(P, ps, { mode: 1, fill: 0.9, hit: 1 })
  expect(P).toEqual({ mode: 'cross', fill: 0.9, own: 1 }) // hit is not a row; the scene's other fields stay
  put(P, ps, { mode: 7, fill: 0.1 })
  expect(P).toEqual({ mode: 'cross', fill: 0.1, own: 1 })
})

test("V3 look inputs: every vs3 native ends with the 15 look keys of S2.2 and S3.2 in group look, then lens and lensStyle (V6), base + its row as defaults (K1), look.json's ranges; mirror a long 0..12; the 4 macros bindable floats 0..1 at .5 (R1); bloomMul and brightness never bound", () => {
  const ranges = look.ranges as Record<string, number[]>, rows = look.scenes as Record<string, object | undefined>, folds = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
  const keys = ['bloomMul', 'aber', 'vignette', 'brightness', 'mirror', 'tiles', 'twist', 'slice', 'spin', 'persist', 'zoom', 'trails', 'chaos', 'heat', 'react']
  for (const d of VS3) {
    const want: Record<string, number> = { ...look.base, ...rows[d.id.slice(11)] }
    expect(d.inputs.filter((i) => i.group === 'look'), d.id).toHaveLength(17)
    expect(d.inputs.slice(-17, -2), d.id).toEqual(keys.map((k) => k === 'mirror'
      ? { name: k, type: 'long', group: 'look', values: folds, labels: folds.map(String), default: want[k] }
      : { name: k, type: 'float', group: 'look', default: want[k], min: ranges[k][0], max: ranges[k][1], ...(k === 'bloomMul' || k === 'brightness' ? { bindable: false } : {}) }))
    for (const k of ['react', 'chaos', 'trails', 'heat']) expect(d.inputs.find((i) => i.name === k), `${d.id} ${k}`).toEqual({ name: k, type: 'float', group: 'look', default: 0.5, min: 0, max: 1 }) // no bindable: false
  }
})

test("V6 lens inputs: every vs3 native ends with lens, a bindable float on look.json's range at its row's value (0 on every row), and lensStyle, a select of the 7 lensStyles at 0; putLook hands both to frame()", () => {
  const rows = look.scenes as Record<string, { lens?: number } | undefined>
  for (const d of VS3) {
    expect(rows[d.id.slice(11)]?.lens ?? look.base.lens, d.id).toBe(0)
    expect(d.inputs.slice(-2), d.id).toEqual([
      { name: 'lens', type: 'float', group: 'look', default: 0, min: 0, max: 1 },
      { name: 'lensStyle', type: 'long', group: 'look', values: [0, 1, 2, 3, 4, 5, 6], labels: look.lensStyles, default: 0 },
    ])
  }
  expect(look.lensStyles).toHaveLength(7)
  expect(putLook({ ...look.base } as LookValues, { lens: 0.7, lensStyle: 4 })).toMatchObject({ lens: 0.7, lensStyle: 4 })
})

test('M1 hot preset: ★ magma — Magmatic Eye on vs3 morphogen2 carries its post and macros; each look key a look input of the native, inside look.ranges; heat ≥ .75', () => {
  const ranges = look.ranges as Record<string, number[]>, d = VS3.find((x) => x.id === 'native/vs3-morphogen2')!
  const v = factory(d.id).find((p) => p.name === '★ magma — Magmatic Eye')!.values
  for (const k of Object.keys(v).filter((k) => k in ranges)) {
    expect(d.inputs.find((i) => i.name === k)?.group, k).toBe('look')
    expect(v[k] as number, k).toBeGreaterThanOrEqual(ranges[k][0])
    expect(v[k] as number, k).toBeLessThanOrEqual(ranges[k][1])
  }
  expect(v.heat).toBeGreaterThanOrEqual(0.75) // its macro
  expect(v.brightness).toBe(2.4) // and its post
})

test('M2 only one: no other factory preset holds a look key (S7.1 deletes this test)', () => {
  const keys = Object.keys(look.ranges)
  expect(factoryRefs.flatMap((r) => factory(r).filter((p) => Object.keys(p.values).some((k) => keys.includes(k))).map((p) => `${r} ${p.name}`)))
    .toEqual(['native/vs3-morphogen2 ★ magma — Magmatic Eye'])
})

test('V4 built-ins: no vs3 built-in doc carries isf/Mirror, isf/Kaleidoscope or own/feedback-zoom; its only fx is a vs3 filter (Limitless)', () => {
  const docs = BUILTIN.filter((d) => d.id.startsWith('builtin:vs3-')), legacy = ['isf/Mirror', 'isf/Kaleidoscope', 'own/feedback-zoom']
  expect(docs).toHaveLength(VS3.length)
  for (const d of docs) for (const l of d.layers) {
    expect([l.gen, ...l.fx].filter((n) => legacy.includes(n.ref)), d.id).toEqual([])
    expect(l.fx.filter((n) => !n.ref.startsWith('native/vs3-')), d.id).toEqual([])
  }
})

test('V5 rows without trails: at the defaults of crystal, pearl, spiral and descent frame() gives feedback false (ink, the control: true)', () => {
  const s: Signal = { onKick: 0, kick: 0, onMid: 0, onHigh: 0, sub: 0.3, mids: 0.4, highs: 0.2, air: 0.1, energy: 0.5, specHi: new Float32Array(192) }
  const late = look.lateTrails as Record<string, number | undefined>
  for (const [name, on] of [['crystal', false], ['pearl', false], ['spiral', false], ['descent', false], ['ink', true]] as const) {
    const v = putLook({ ...look.base } as LookValues, defaults(VS3.find((d) => d.id === `native/vs3-${name}`)!)) // its look inputs at their defaults
    const facts = { hint: null, wet: 1, grain: 0, lateTrails: late[name] ?? 0, filter: false, bloomRow: v.bloomMul, gainBase: look.base.brightness, vigRange: 0.8 }
    expect(frame(v, facts, s, 0, chainState(), [0.5, 0.5, 0.5], 1 / 60, 1 / 60, 0, 16 / 9).feedback, name).toBe(on)
  }
})

test('V2 FINISH: the gain is the uniform uGain, no literal 1.4', () => {
  expect(FINISH).toMatch(/uniform float [^;]*\buGain\b/)
  expect(FINISH).toContain('raw * uGain')
  expect(FINISH).not.toContain('1.4')
})

test("V8 FINISH (S3b.2): uProbe and uExp; the gain × the servo's e (the pair holds ln e); the probe's luma guards isnan and isinf (N4)", () => {
  expect(FINISH).toMatch(/uniform sampler2D [^;]*\buExp\b/)
  expect(FINISH).toMatch(/uniform float [^;]*\buProbe\b/)
  expect(FINISH).toContain('raw * uGain * exp(texelFetch(uExp, ivec2(0), 0).r)')
  expect(FINISH).toContain('float l = any(isnan(col)) || any(isinf(col)) ? 0.0 :')
  expect(FINISH).toContain('uProbe > 0.5 ? vec4(l, step(0.85, l), 0.0, 1.0)')
})

test('putLook: the look values in; a non-finite one (a bound source gone bad) keeps the last, so the limiter never latches a NaN', () => {
  const out = { bloomMul: 1, aber: 1, vignette: 0.34, brightness: 1.4 } as LookValues
  putLook(out, { bloomMul: 1.5, aber: 2, vignette: 0.5, brightness: 2, hit: 1 })
  putLook(out, { bloomMul: 1.5, aber: NaN, vignette: Infinity, brightness: 2 })
  expect(out).toEqual({ bloomMul: 1.5, aber: 2, vignette: 0.5, brightness: 2 })
})

test('params.json = every registered scene\'s rows (regenerate: npx vitest run -u); untouched inputs leave its params as they were', async () => {
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

test("C12c size: create(gl, size) hands the tile's size to the chain's three targets at create (the servo's probe keeps PROBE²); without a size it hands shotSize()", async () => {
  vi.stubGlobal('document', { createElement: () => canvas })
  const gl = { deleteFramebuffer() {}, deleteTexture() {} } as unknown as WebGL2RenderingContext // dispose()'s calls
  for (const [size, want] of [[[300, 200], [300, 200]], [undefined, [640, 360]]] as const) {
    T.fits.length = 0
    const n = VS3[0].create(gl, size)
    await vi.waitFor(() => expect(n.hidden!()).toBe(false), { timeout: 10_000 }) // start() resolved
    expect(T.fits, String(size)).toEqual([want, want, want, [PROBE, PROBE]]) // hist[0], hist[1], lensRT, the probe (the bloom fits on its first apply)
    n.dispose!()
  }
  vi.unstubAllGlobals()
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
