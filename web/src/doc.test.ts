import { describe, expect, test } from 'vitest'
import type { Binding } from './bind'
import { defaults, parseLibrary, parseScene } from './doc'
import type { EffectDef } from './fx/types'
import { BUILTIN } from './scenes/builtin'

const LAYER = { gen: { ref: 'native/tunnel' }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 }
const doc = (over: object = {}) => ({ v: 1, id: 'u-1', name: 'Mine', star: false, layers: [LAYER], ...over })
const withLayer = (over: object) => doc({ layers: [{ ...LAYER, ...over }] })
const B: Binding = { source: 'bass', amount: 1, attack: 0, release: 0.15, min: 0, max: 1 }

describe('parseScene', () => {
  test('every built-in round-trips through JSON', () => {
    expect(BUILTIN.length).toBeGreaterThan(0)
    for (const d of BUILTIN) expect(parseScene(JSON.parse(JSON.stringify(d)))).toStrictEqual(d)
  })

  test('every built-in ref is a native or a file under fx/isf or fx/own', () => {
    const files = Object.keys(import.meta.glob(['./fx/isf/*.fs', './fx/own/*.fs'])).map((p) => p.slice('./fx/'.length, -'.fs'.length))
    const refs = BUILTIN.flatMap((d) => d.layers.flatMap((l) => [l.gen, ...l.fx].map((n) => n.ref)))
    expect(refs.filter((r) => !/^(native|toy|milk)\//.test(r) && !files.includes(r))).toEqual([])
  })

  test('rejections name the field', () => {
    expect(() => parseScene(doc({ v: 2 }))).toThrow(/^v: unsupported scene version 2/)
    expect(() => parseScene(doc({ layers: [] }))).toThrow(/^layers: /)
    expect(() => parseScene(doc({ layers: Array(5).fill(LAYER) }))).toThrow(/^layers: /)
    expect(() => parseScene(withLayer({ blend: 'xor' }))).toThrow(/^layers\[0\]\.blend: /)
    expect(() => parseScene(withLayer({ opacity: NaN }))).toThrow(/^layers\[0\]\.opacity: /)
    expect(() => parseScene(withLayer({ gen: { ref: 'a', code: 'x'.repeat(65537) } }))).toThrow(/^layers\[0\]\.gen\.code: /)
    expect(() => parseScene(5)).toThrow(/^scene: not an object/)
    expect(() => parseScene([])).toThrow(/^scene: not an object/)
    const noSource = { ref: 'isf/x', bind: { angle: { ...B, source: '' } } }
    expect(() => parseScene(withLayer({ fx: [noSource] }))).toThrow(/^layers\[0\]\.fx\[0\]\.bind\.angle\.source: /)
    expect(() => parseScene(withLayer({ gen: { ref: 'a', bind: { k: { ...B, shape: 'zigzag' } } } }))).toThrow(/\.shape: /)
    expect(() => parseScene(withLayer({ gen: { ref: 'a', values: { c: [1, 'x'] } } }))).toThrow(/gen\.values\.c\[1\]: /)
    expect(() => parseScene(doc({ id: '' }))).toThrow(/^id: /)
    expect(() => parseScene(doc({ star: 1 }))).toThrow(/^star: /)
    expect(() => parseScene(withLayer({ fx: {} }))).toThrow(/^layers\[0\]\.fx: /)
  })

  test('created is optional: kept when a finite number, absent otherwise', () => {
    expect(parseScene(doc({ created: 1761681600000 })).created).toBe(1761681600000)
    expect(parseScene(doc())).not.toHaveProperty('created')
    expect(() => parseScene(doc({ created: '2026-10-28' }))).toThrow(/^created: /)
    expect(() => parseScene(doc({ created: Infinity }))).toThrow(/^created: /)
  })

  test('code may be exactly CODE_MAX chars; opacity, speed and res clamp', () => {
    expect(parseScene(withLayer({ gen: { ref: 'a', code: 'x'.repeat(65536) } })).layers[0].gen.code).toHaveLength(65536)
    expect(parseScene(withLayer({ opacity: 2, speed: 9, res: 0.1 })).layers[0]).toMatchObject({ opacity: 1, speed: 4, res: 0.25 })
    expect(parseScene(withLayer({ opacity: -1, speed: -1, res: 2 })).layers[0]).toMatchObject({ opacity: 0, speed: 0, res: 1 })
  })

  test('bindings on gen, fx[0] and layer opacity are kept exactly', () => {
    const shaped: Binding = { ...B, source: 'beat', shape: 'saw', rate: 2, min: 1, max: 0 }
    const x = withLayer({
      gen: { ref: 'native/tunnel', bind: { speed: B }, values: { speed: 1.5, on: true, center: [0.5, 0.5] } },
      fx: [{ ref: 'isf/Kaleidoscope', credit: 'by VIDVOX', code: 'void main() {}', bind: { 'center.0': shaped } }],
      bind: { opacity: shaped },
    })
    expect(parseScene(x)).toStrictEqual(x)
  })

  test('unknown keys are dropped and the result is a fresh object', () => {
    const k = { ...B, junk: 2 }
    const x = withLayer({ extra: 1, gen: { ref: 'a', junk: true, bind: { k } }, bind: { opacity: B, blend: B } })
    const d = parseScene({ ...x, junk: 'x' })
    expect(d).toStrictEqual(withLayer({ gen: { ref: 'a', bind: { k: B } }, bind: { opacity: B } }))
    expect(d).not.toBe(x)
    expect(d.layers[0]).not.toBe(x.layers[0])
    expect(d.layers[0].bind!.opacity).not.toBe(B)
    expect(d.layers[0].gen.bind!.k).not.toBe(k)
  })
})

describe('parseLibrary', () => {
  test('takes a LibraryFile or a single scene', () => {
    expect(parseLibrary({ v: 1, scenes: [doc(), doc({ id: 'u-2' })] }).map((d) => d.id)).toEqual(['u-1', 'u-2'])
    expect(parseLibrary({ v: 1, scenes: [] })).toEqual([])
    expect(parseLibrary(doc())).toStrictEqual([doc()])
  })

  test('rejects another version or a bad scene', () => {
    expect(() => parseLibrary({ v: 0, scenes: [] })).toThrow(/^v: unsupported library version 0/)
    expect(() => parseLibrary({ v: 1, scenes: {} })).toThrow(/^scenes: /)
    expect(() => parseLibrary({ v: 1, scenes: [doc({ v: 2 })] })).toThrow(/^v: unsupported scene version/)
  })
})

test('defaults: every value-bearing type, images and audio omitted', () => {
  const def: EffectDef = {
    id: 'isf/t', name: 't', kind: 'filter', credit: '',
    inputs: [
      { name: 'inputImage', type: 'image' },
      { name: 'f1', type: 'float', default: 0.3, min: 0.1 },
      { name: 'f2', type: 'float', min: 0.1 },
      { name: 'f3', type: 'float' },
      { name: 'l1', type: 'long', values: [2, 4] },
      { name: 'l2', type: 'long', default: 4, values: [2, 4] },
      { name: 'l3', type: 'long' },
      { name: 'b1', type: 'bool', default: true },
      { name: 'b2', type: 'bool' },
      { name: 'e', type: 'event', default: true },
      { name: 'c1', type: 'color', default: [1, 0, 0, 1] },
      { name: 'c2', type: 'color' },
      { name: 'p1', type: 'point2D', default: [0.25, 0.75] },
      { name: 'p2', type: 'point2D' },
      { name: 'fft', type: 'audioFFT' },
      { name: 'wave', type: 'audio' },
    ],
  }
  expect(defaults(def)).toStrictEqual({
    f1: 0.3, f2: 0.1, f3: 0, l1: 2, l2: 4, l3: 0, b1: true, b2: false, e: false,
    c1: [1, 0, 0, 1], c2: [0, 0, 0, 1], p1: [0.25, 0.75], p2: [0, 0],
  })
})
