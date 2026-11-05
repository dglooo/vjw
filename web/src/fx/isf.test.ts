import { describe, expect, test } from 'vitest'
import { SOURCE_IDS } from '../bind'
import { BUILTIN } from '../scenes/builtin'
import { parseIsf, sizeExpr } from './isf'

const BODY = '\nvoid main() {\n  gl_FragColor = IMG_THIS_PIXEL(inputImage);\n}\n'
const isf = (header: object, body = BODY) => `/*${JSON.stringify(header)}*/${body}`
const count = (s: string, part: string) => s.split(part).length - 1
const image = (NAME: string) => ({ NAME, TYPE: 'image' })

describe('parseIsf', () => {
  test('a 3-input header parses with every field', () => {
    const d = parseIsf(isf({
      CREDIT: 'by someone',
      INPUTS: [
        { NAME: 'amount', TYPE: 'float', LABEL: 'Amount', DEFAULT: 0.5, MIN: 0, MAX: 2 },
        { NAME: 'mode', TYPE: 'long', DEFAULT: 1, VALUES: [0, 1, 2], LABELS: ['a', 'b', 'c'] },
        { NAME: 'tint', TYPE: 'color', DEFAULT: [1, 0, 0, 1] },
      ],
    }), 'isf/My Effect')
    expect(d).toMatchObject({ id: 'isf/My Effect', name: 'My Effect', kind: 'generator', credit: 'by someone', glsl: 100 })
    expect(d.inputs).toEqual([
      { name: 'amount', type: 'float', label: 'Amount', default: 0.5, min: 0, max: 2 },
      { name: 'mode', type: 'long', default: 1, values: [0, 1, 2], labels: ['a', 'b', 'c'] },
      { name: 'tint', type: 'color', default: [1, 0, 0, 1] },
    ])
    expect(d.passes).toEqual([{ persistent: false, float: false }]) // no PASSES = one pass to the output
    for (const u of ['uniform float amount;', 'uniform int mode;', 'uniform vec4 tint;']) expect(count(d.fs, u)).toBe(1)
    expect(d.unsupported).toBeUndefined()
    expect(parseIsf(isf({}), 'isf/x').credit).toBe('')
  })

  test('kind by convention: inputImage → filter, startImage + endImage + progress → transition, else generator', () => {
    expect(parseIsf(isf({ INPUTS: [image('inputImage')] }), 'f').kind).toBe('filter')
    const t = [image('startImage'), image('endImage'), { NAME: 'progress', TYPE: 'float' }]
    expect(parseIsf(isf({ INPUTS: t }), 't').kind).toBe('transition')
    expect(parseIsf(isf({ INPUTS: t.slice(0, 2) }), 'g').kind).toBe('generator') // no progress
    expect(parseIsf(isf({ INPUTS: [{ NAME: 'inputImage', TYPE: 'float' }] }), 'g').kind).toBe('generator') // not an image
    expect(parseIsf(isf({}), 'g').kind).toBe('generator')
  })

  test('PASSES map to PassDefs, and each TARGET gets a sampler and its size', () => {
    const d = parseIsf(isf({
      INPUTS: [image('inputImage')],
      PASSES: [{ TARGET: 'buf', PERSISTENT: true, FLOAT: true, WIDTH: '$WIDTH/2', HEIGHT: 1 }, {}],
    }), 'p')
    expect(d.passes).toEqual([
      { target: 'buf', persistent: true, float: true, width: '$WIDTH/2', height: '1' },
      { persistent: false, float: false },
    ])
    for (const u of ['uniform sampler2D buf;', 'uniform vec2 _buf_imgSize;', 'uniform sampler2D inputImage;', 'uniform vec2 _inputImage_imgSize;'])
      expect(count(d.fs, u)).toBe(1)
    expect(parseIsf(isf({ PASSES: [] }), 'p').passes).toHaveLength(1)
  })

  test('audio and audioFFT inputs become sampler2D uniforms with a size, and are supported', () => {
    const d = parseIsf(isf({ INPUTS: [{ NAME: 'wave', TYPE: 'audio' }, { NAME: 'fft', TYPE: 'audioFFT' }] }), 'a')
    for (const u of ['uniform sampler2D wave;', 'uniform vec2 _wave_imgSize;', 'uniform sampler2D fft;', 'uniform vec2 _fft_imgSize;'])
      expect(count(d.fs, u)).toBe(1)
    expect(d.unsupported).toBeUndefined()
  })

  test('the prefix declares every auto uniform and macro exactly once, then the body follows verbatim', () => {
    const d = parseIsf(isf({ INPUTS: [image('inputImage')] }), 'f')
    const auto = [
      'uniform float TIME;', 'uniform float TIMEDELTA;', 'uniform vec2 RENDERSIZE;', 'uniform int PASSINDEX;',
      'uniform int FRAMEINDEX;', 'uniform vec4 DATE;', 'varying vec2 isf_FragNormCoord;', 'precision highp float;',
      '#define IMG_PIXEL(', '#define IMG_NORM_PIXEL(', '#define IMG_THIS_PIXEL(', '#define IMG_THIS_NORM_PIXEL(',
    ]
    for (const u of auto) expect(count(d.fs, u), u).toBe(1)
    expect(d.fs.endsWith(BODY)).toBe(true)
    expect(d.fs.indexOf('#define IMG_THIS_NORM_PIXEL(')).toBeLessThan(d.fs.indexOf(BODY))
    expect(d.vs).toContain('attribute vec2 position;')
    expect(d.vs).toContain('isf_FragNormCoord =')
  })

  test('IMG_SIZE and IMG_PIXEL get the named image size (ES 1.00 has no token pasting)', () => {
    const d = parseIsf(isf({ INPUTS: [image('inputImage')] }, 'v = IMG_SIZE( inputImage ); c = IMG_PIXEL(inputImage, vec2(1.0, 2.0));'), 'f')
    expect(d.fs).toContain('v = _inputImage_imgSize; c = IMG_PIXEL(inputImage, _inputImage_imgSize, vec2(1.0, 2.0));')
    expect(d.fs).toContain('#define IMG_PIXEL(img, size, coord) texture2D(img, (coord) / (size))')
  })

  test('VJW_BIND round-trips', () => {
    const bind = { amount: { source: 'onset', amount: 1, attack: 0, release: 0.15, min: 0, max: 2, shape: 'saw', rate: 2 } }
    expect(parseIsf(isf({ VJW_BIND: bind }), 'b').bind).toEqual(bind)
    expect(parseIsf(isf({}), 'b').bind).toBeUndefined()
  })

  test('VJW_FLASH round-trips; anything but a list of declared input names is rejected', () => {
    const INPUTS = [{ NAME: 'glow', TYPE: 'float' }, { NAME: 'level', TYPE: 'float' }]
    expect(parseIsf(isf({ INPUTS, VJW_FLASH: ['glow', 'level'] }), 'f').flash).toEqual(['glow', 'level'])
    expect(parseIsf(isf({ INPUTS }), 'f').flash).toBeUndefined()
    expect(() => parseIsf(isf({ INPUTS, VJW_FLASH: ['glow', 'glo'] }), 'isf/f')).toThrow('isf/f: VJW_FLASH ["glow","glo"] must list declared input names')
    expect(() => parseIsf(isf({ INPUTS, VJW_FLASH: 'glow' }), 'isf/f')).toThrow('VJW_FLASH "glow" must list')
  })

  test('category: the first exact CATEGORIES name (any case) beats keywords, else a keyword, else none', () => {
    const cat = (CATEGORIES?: string[]) => parseIsf(isf({ CATEGORIES }), 'c').category
    expect(cat(['Glitch', 'GEOMETRY'])).toBe('geometry') // exact, though a keyword entry comes first
    expect(cat(['Stylize', 'Kaleidoscope'])).toBe('feedback')
    expect(cat(['VHS Glitch'])).toBe('retro')
    expect(cat(['Liquid Metal'])).toBe('liquid')
    expect(cat(['Stylize', 'Color Effect'])).toBeUndefined()
    expect(cat()).toBeUndefined()
  })

  test('custom vertex shader, IMPORTED and extra images parse but are unsupported', () => {
    expect(parseIsf(isf({}, '\nvarying vec2 left;\nvoid main() {}'), 'v').unsupported).toBe('custom vertex shader')
    expect(parseIsf(isf({ IMPORTED: { logo: { PATH: 'logo.png' } } }), 'i').unsupported).toBe('IMPORTED images')
    expect(parseIsf(isf({ INPUTS: [image('inputImage'), image('mask')] }), 'm').unsupported).toBe('extra image input mask')
    expect(parseIsf(isf({ INPUTS: [image('photo')] }), 'g').unsupported).toBe('extra image input photo') // a generator has none
  })

  test('a bad header throws a readable message', () => {
    expect(() => parseIsf('void main() {}', 'isf/none')).toThrow('isf/none: no ISF header')
    expect(() => parseIsf('/* not json */ void main() {}', 'isf/bad')).toThrow(/isf\/bad: the ISF header is not valid JSON/)
    expect(() => parseIsf('/* 5 */', 'isf/num')).toThrow('not a JSON object')
    expect(() => parseIsf(isf({ INPUTS: [{ NAME: 'x', TYPE: 'vec3' }] }), 'isf/t')).toThrow('input x has unknown TYPE "vec3"')
    expect(() => parseIsf(isf({ INPUTS: [{ TYPE: 'float' }] }), 'isf/n')).toThrow('input NAME undefined is not a GLSL name')
    expect(() => parseIsf(isf({ INPUTS: [{ NAME: 'a;b', TYPE: 'float' }] }), 'isf/n')).toThrow('is not a GLSL name')
    expect(() => parseIsf(isf({ PASSES: [{ TARGET: 'x y' }] }), 'isf/p')).toThrow('pass TARGET')
  })

  test('our own files parse with a category and VJW_BIND on their inputs, strobe/flash gated; built-in refs name a bundled file', () => {
    const files = import.meta.glob(['./isf/*.fs', './own/*.fs'], { query: '?raw', import: 'default', eager: true })
    const ids = Object.keys(files).map((p) => p.slice(2, -3))
    for (const [path, src] of Object.entries(files).filter(([p]) => p.startsWith('./own/'))) {
      const d = parseIsf(src as string, path)
      expect(d.category, path).toBeDefined()
      expect(d.unsupported, path).toBeUndefined()
      for (const k of Object.keys(d.bind ?? {})) expect(d.inputs.map((i) => i.name), `${path} ${k}`).toContain(k)
    }
    expect(['strobe', 'flash'].map((n) => parseIsf(files[`./own/${n}.fs`] as string, n).flash)).toEqual([['strobe'], ['flash']])
    const refs = BUILTIN.flatMap((s) => s.layers.flatMap((l) => [l.gen, ...l.fx])).map((n) => n.ref)
    for (const r of refs.filter((r) => !/^(native|toy|milk)\//.test(r))) expect(ids, r).toContain(r) // a toy's code is inline
  })

  // TD look (plan_td_look.md conventions): the own files its steps add, one entry per step.
  const NEW_OWN = ['td-feedback', 'edge-rings', 'bloom', 'light-tunnel', 'radial-blur']
  test.each(NEW_OWN)('own/%s parses, binds only known sources, and binds every VJW_FLASH input from 0', (stem) => {
    const files = import.meta.glob('./own/*.fs', { query: '?raw', import: 'default', eager: true })
    const d = parseIsf(files[`./own/${stem}.fs`] as string, stem) // throws on a flash name that is not an input
    for (const b of Object.values(d.bind ?? {})) expect(SOURCE_IDS, stem).toContain(b.source)
    for (const n of d.flash ?? []) expect(d.bind?.[n]?.min, `${stem} ${n}`).toBe(0)
  })
})

describe('sizeExpr', () => {
  test('substitutes $WIDTH, $HEIGHT and $<input>, with the Math names', () => {
    expect(sizeExpr('$WIDTH/2', { WIDTH: 1000 })).toBe(500)
    expect(sizeExpr('floor($HEIGHT*$res)', { HEIGHT: 1081, res: 0.5 })).toBe(540)
    expect(sizeExpr('max(floor($WIDTH*0.02),1.0)', { WIDTH: 10 })).toBe(1)
    expect(sizeExpr('1', {})).toBe(1)
  })

  test('anything outside the whitelist, unknown variables and non-numbers throw', () => {
    for (const bad of ['alert(1)', 'a.b', '[', 'max.constructor', '"1"', '$WIDTH`'])
      expect(() => sizeExpr(bad, { WIDTH: 1 }), bad).toThrow()
    expect(() => sizeExpr('$nope/2', { WIDTH: 1 })).toThrow('unknown $nope')
    expect(() => sizeExpr('$toString', {})).toThrow('unknown $toString')
    expect(() => sizeExpr('1/0', {})).toThrow('not a finite number')
    expect(() => sizeExpr('max', {})).toThrow('not a finite number')
  })
})
