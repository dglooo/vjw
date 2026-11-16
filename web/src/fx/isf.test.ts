import { describe, expect, test, vi } from 'vitest'
import { SOURCE_IDS } from '../bind'
import { BUILTIN } from '../scenes/builtin'
import { pairsByTarget, parseIsf, sizeExpr } from './isf'

vi.mock('../gl/engine', () => ({})) // scenes/camera's import takes the page's canvas + WebGL; the defs need neither

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

  test('tags: the raw CATEGORIES, beside the reduced category; none without them', () => {
    const d = parseIsf(isf({ CATEGORIES: ['Glitch', 'Pixel', 'Stylize'] }), 'isf/x')
    expect(d.tags).toEqual(['Glitch', 'Pixel', 'Stylize'])
    expect(d.category).toBe('retro')
    expect(parseIsf(isf({}), 'isf/y').tags).toEqual([])
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

  test('passes repeating a TARGET declare its sampler once (one GLSL uniform per name)', () => {
    const d = parseIsf(isf({ PASSES: [{ TARGET: 's' }, { TARGET: 'a' }, { TARGET: 's' }, {}] }), 'p')
    for (const u of ['uniform sampler2D s;', 'uniform vec2 _s_imgSize;', 'uniform sampler2D a;']) expect(count(d.fs, u)).toBe(1)
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

  test('our own files parse with a category and VJW_BIND on their inputs, the flash-keyed ones gated; built-in refs name a bundled file', () => {
    const files = import.meta.glob(['./isf/*.fs', './own/*.fs'], { query: '?raw', import: 'default', eager: true })
    const ids = Object.keys(files).map((p) => p.slice(2, -3))
    for (const [path, src] of Object.entries(files).filter(([p]) => p.startsWith('./own/'))) {
      const d = parseIsf(src as string, path)
      expect(d.category, path).toBeDefined()
      expect(d.unsupported, path).toBeUndefined()
      for (const k of Object.keys(d.bind ?? {})) expect(d.inputs.map((i) => i.name), `${path} ${k}`).toContain(k)
    }
    const keyed = { strobe: ['strobe'], flash: ['flash'], 'tunnel-mesh': ['flash'], fractal: ['glow'], 'wave-landscape': ['flash'], bars: ['glow'], 'led-grid': ['glow'], 'diff-feedback': ['glow'], checker: ['divisions'] } // tunnel-mesh…wave-landscape: S4.1 (wave-landscape's own flash: S4.2); bars: 2b S4.1; led-grid: 2b S4.3; diff-feedback: wave-2 S1.3; checker: wave-2 S3.4 (a full-frame flip is a strobe)
    // A gated input binds from 0, in the files and the built-ins: a rest near the gate's 0.5 holds the flash (fact 6, S4.1).
    for (const [n, f] of Object.entries(keyed)) {
      const d = parseIsf(files[`./own/${n}.fs`] as string, n)
      expect(d.flash, n).toEqual(f)
      for (const k of f) expect(d.bind?.[k]?.min, `${n} ${k}`).toBe(0)
    }
    for (const x of BUILTIN.flatMap((s) => s.layers.flatMap((l) => [l.gen, ...l.fx])).filter((x) => x.ref.startsWith('own/')))
      for (const k of parseIsf(files[`./${x.ref}.fs`] as string, x.ref).flash ?? []) if (x.bind?.[k]) expect(x.bind[k].min, `${x.ref} ${k}`).toBe(0)
    const refs = BUILTIN.flatMap((s) => s.layers.flatMap((l) => [l.gen, ...l.fx])).map((n) => n.ref)
    for (const r of refs.filter((r) => !/^(native|toy|milk)\//.test(r))) expect(ids, r).toContain(r) // a toy's code is inline
  })

  test('isf/Solarize: the build and drop binds, the donor header kept (wave-2 S3.1)', () => {
    const src = import.meta.glob('./isf/Solarize.fs', { query: '?raw', import: 'default', eager: true })['./isf/Solarize.fs'] as string
    const d = parseIsf(src, 'isf/Solarize')
    expect(d.credit).toBe('by VIDVOX')
    expect(src.startsWith('// Source: https://github.com/Vidvox/ISF-Files · MIT')).toBe(true)
    expect(Object.keys(d.bind ?? {})).toEqual(['centerBrightness', 'inverse'])
    expect(d.bind?.centerBrightness.source).toBe('build')
    expect(d.bind?.inverse.source).toBe('drop')
    expect(d.inputs.find((i) => i.name === 'inverse')?.type).toBe('bool') // the donor's DEFAULT 1.0 parses to a bound bool
  })

  test('isf/Color Monochrome: the drop mix bind, the static .4/.4/.2, the skipped normalise noted (wave-2 S3.1)', () => {
    const src = import.meta.glob('./isf/Color Monochrome.fs', { query: '?raw', import: 'default', eager: true })['./isf/Color Monochrome.fs'] as string
    const d = parseIsf(src, 'isf/Color Monochrome')
    expect(d.credit).toBe('by zoidberg')
    expect(Object.keys(d.bind ?? {})).toEqual(['intensity'])
    expect(d.bind?.intensity.source).toBe('drop')
    expect(d.inputs.find((i) => i.name === 'color')?.default).toEqual([0.4, 0.4, 0.2, 1])
    expect(src).toContain('analyze-max') // the header notes TD's normalise is skipped (it needs a reduction pass)
  })

  test('isf/Color Replacement: the 5-pass donor, unbound — the q5/q6 verification froze own/change-color (wave-2 S3.1)', () => {
    const src = import.meta.glob('./isf/Color Replacement.fs', { query: '?raw', import: 'default', eager: true })['./isf/Color Replacement.fs'] as string
    const d = parseIsf(src, 'isf/Color Replacement')
    expect(d.credit).toBe('by VIDVOX')
    expect(d.bind).toBeUndefined() // no float hue-offset input: mask_color / target_color are vec4, unbindable in the panel
    expect(d.passes).toHaveLength(5)
    expect(d.inputs.filter((i) => i.type === 'color').map((i) => i.name)).toEqual(['mask_color', 'target_color'])
    expect(src).toContain('q5/q6 verification')
  })

  test('isf/Dilate: the 2-pass donor, the sub radius bind, the shim noted, the donor header kept (wave-2 S3.2)', () => {
    const src = import.meta.glob('./isf/Dilate.fs', { query: '?raw', import: 'default', eager: true })['./isf/Dilate.fs'] as string
    const d = parseIsf(src, 'isf/Dilate')
    expect(d.credit).toBe('by VIDVOX')
    expect(src.startsWith('// Source: https://github.com/Vidvox/ISF-Files · MIT')).toBe(true)
    expect(d.passes).toHaveLength(2) // firstPass + the output
    expect(Object.keys(d.bind ?? {})).toEqual(['radius'])
    expect(d.bind?.radius).toEqual({ source: 'sub', amount: 1, attack: 0.05, release: 0.3, min: 2, max: 8 })
    expect(d.inputs.find((i) => i.name === 'radius')).toMatchObject({ default: 2, min: 1, max: 15 })
    expect(src).toContain('ES 1.00 shim (S3.2)')
  })

  test('isf/Erode: the min counterpart, catalog-only — no bind, no built-in, the flip not bindable (wave-2 S3.2)', () => {
    const src = import.meta.glob('./isf/Erode.fs', { query: '?raw', import: 'default', eager: true })['./isf/Erode.fs'] as string
    const d = parseIsf(src, 'isf/Erode')
    expect(d.credit).toBe('by VIDVOX')
    expect(src.startsWith('// Source: https://github.com/Vidvox/ISF-Files · MIT')).toBe(true)
    expect(d.passes).toHaveLength(2)
    expect(d.bind).toBeUndefined() // lead-locked: the drop dilate↔erode flip is a structural fx swap, a 2b editor operation
    expect(d.inputs.find((i) => i.name === 'bleedRadius')).toMatchObject({ default: 2, min: 1, max: 15 })
    expect(src).toContain('catalog-only')
    expect(src).toContain('ES 1.00 shim (S3.2)')
  })

  // TD look (plan_td_look.md conventions): the own files its steps add, one entry per step.
  const NEW_OWN = ['td-feedback', 'edge-rings', 'bloom', 'light-tunnel', 'radial-blur', 'flow-smear', 'reaction-diffusion', 'bars', 'mosaic', 'led-grid', 'superformula', 'polar', 'gradient', 'julia', 'phaser', 'diff-feedback', 'stars', 'change-color', 'rgb-contrast', 'color-threshold', 'dent', 'emboss', 'sharpen', 'checker', 'hsv-blur', 'rgba-blur', 'laser-grid', 'negative'] // bars, mosaic, led-grid: 2b S4.1–S4.3; superformula, polar, gradient: wave-2 S1.1; julia: wave-2 S1.2; phaser, diff-feedback, stars: wave-2 S1.3; change-color: wave-2 S3.1 (the q5/q6 donor-verification contingency); rgb-contrast, color-threshold, dent: wave-2 S3.3 (q2, q3, q7); emboss, sharpen, checker: wave-2 S3.4 (q9, q8, q10); hsv-blur, rgba-blur: wave-2 S3.5 (q11, the pair); laser-grid: wave-3 S2.1; negative: camera S2.2
  test.each(NEW_OWN)('own/%s parses, binds only known sources, and binds every VJW_FLASH input from 0', (stem) => {
    const files = import.meta.glob('./own/*.fs', { query: '?raw', import: 'default', eager: true })
    const d = parseIsf(files[`./own/${stem}.fs`] as string, stem) // throws on a flash name that is not an input
    for (const b of Object.values(d.bind ?? {})) expect(SOURCE_IDS, stem).toContain(b.source)
    for (const n of d.flash ?? []) expect(d.bind?.[n]?.min, `${stem} ${n}`).toBe(0)
  })

  // camera S2.1 (matrix U4): the camera natives' defs, by the same rule.
  test.each(['camera', 'outline'] as const)('native/%s binds only known sources, and binds every flash input from 0', async (k) => {
    const d = (await import('../scenes/camera'))[k]
    for (const b of Object.values(d.bind ?? {})) expect(SOURCE_IDS, k).toContain(b.source)
    for (const n of d.flash ?? []) expect(d.bind?.[n]?.min, `${k} ${n}`).toBe(0)
  })

  test('own/rgb-contrast + color-threshold + dent: the S3.3 binds (the reversed cR, the sub tR, the kick width)', () => {
    const files = import.meta.glob('./own/*.fs', { query: '?raw', import: 'default', eager: true })
    const rc = parseIsf(files['./own/rgb-contrast.fs'] as string, 'rgb-contrast')
    expect(Object.keys(rc.bind ?? {})).toEqual(['cR'])
    expect(rc.bind?.cR).toEqual({ source: 'snare', amount: 1, attack: 0, release: 0.3, min: 1, max: -5 }) // min > max inverts the reds
    const ct = parseIsf(files['./own/color-threshold.fs'] as string, 'color-threshold')
    expect(Object.keys(ct.bind ?? {})).toEqual(['tR'])
    expect(ct.bind?.tR).toEqual({ source: 'sub', amount: 1, attack: 0.05, release: 0.3, min: 0.3, max: 0.6 })
    const dn = parseIsf(files['./own/dent.fs'] as string, 'dent')
    expect(Object.keys(dn.bind ?? {})).toEqual(['width'])
    expect(dn.bind?.width).toEqual({ source: 'kick', amount: 1, attack: 0, release: 0.15, min: 0.3, max: 0.5 })
  })

  test('own/emboss + sharpen + checker: the S3.4 binds (the lfo-sine angle, the sub k, the kick divisions flash-gated from 0, sharpen static)', () => {
    const files = import.meta.glob('./own/*.fs', { query: '?raw', import: 'default', eager: true })
    const e = parseIsf(files['./own/emboss.fs'] as string, 'emboss')
    expect(Object.keys(e.bind ?? {})).toEqual(['angle', 'k'])
    expect(e.bind?.angle).toEqual({ source: 'lfo', shape: 'sine', rate: 0.05, amount: 1, attack: 0, release: 0, min: 0, max: 1 })
    expect(e.bind?.k).toEqual({ source: 'sub', amount: 1, attack: 0.05, release: 0.3, min: 0.3, max: 0.05 }) // reversed: k is the normal's z, so the sub deepens the relief
    expect(e.inputs.find((i) => i.name === 'k')?.default).toBe(0.3) // the doc default is the bind's rest (S3.3 lesson)
    const s = parseIsf(files['./own/sharpen.fs'] as string, 'sharpen')
    expect(s.bind).toBeUndefined() // q8: static
    const c = parseIsf(files['./own/checker.fs'] as string, 'checker')
    expect(c.flash).toEqual(['divisions'])
    expect(c.bind?.divisions).toEqual({ source: 'kick', amount: 1, attack: 0, release: 0.1, min: 0, max: 9 }) // the flash rule forces the min to 0 (the plan's 4→9 rest would sit above the gate's ON line)
    expect(c.kind).toBe('generator') // q10: a generator, no inputImage
  })

  test('own/hsv-blur + rgba-blur: the S3.5 binds (size ← reese .05/.4 on both; the ⅛-res TARGET — the plan\'s lever; the doc default is the rest)', () => {
    const files = import.meta.glob('./own/*.fs', { query: '?raw', import: 'default', eager: true })
    for (const stem of ['hsv-blur', 'rgba-blur']) {
      const d = parseIsf(files[`./own/${stem}.fs`] as string, stem)
      expect(d.passes).toEqual([{ target: 'blur', persistent: false, float: true, width: '$WIDTH/8', height: '$HEIGHT/8' }, { persistent: false, float: false }])
      expect(d.bind?.size).toEqual({ source: 'reese', amount: 1, attack: 0.05, release: 0.4, min: 0.9, max: 2.0 })
      expect(d.inputs.find((i) => i.name === 'size')).toMatchObject({ default: 0.9, min: 0.9, max: 2.0 }) // the doc default is the bind's rest (S3.3 lesson); rest 0.9 = the single surviving tap (≈ the input)
    }
  })

  test('own/bars: a persistent float 128×1 levels pass, the 1×1 hot texel (I-FL1 fa2-), then the draw (2b S4.1)', () => {
    const src = import.meta.glob('./own/bars.fs', { query: '?raw', import: 'default', eager: true })['./own/bars.fs'] as string
    expect(parseIsf(src, 'bars').passes).toEqual([
      { target: 'levels', persistent: true, float: true, width: '128', height: '1' },
      { target: 'hot', persistent: true, float: true, width: '1', height: '1' },
      { persistent: false, float: false },
    ])
  })

  test('isf/Pixellate: the Pixel tag and a cell jump on the kick (2b S4.2)', () => {
    const src = import.meta.glob('./isf/Pixellate.fs', { query: '?raw', import: 'default', eager: true })['./isf/Pixellate.fs'] as string
    const d = parseIsf(src, 'isf/Pixellate')
    expect(d.tags).toContain('Pixel')
    expect(Object.keys(d.bind ?? {})).toEqual(['cell_size'])
    expect(d.inputs.map((i) => i.name)).toContain('cell_size')
    expect(d.bind?.cell_size.source).toBe('kick')
  })

  test('isf/ASCII Art: the Pixel tag, the kick and build binds, and the bool tint (2b S4.3)', () => {
    const src = import.meta.glob('./isf/ASCII Art.fs', { query: '?raw', import: 'default', eager: true })['./isf/ASCII Art.fs'] as string
    const d = parseIsf(src, 'isf/ASCII Art')
    expect(d.tags).toContain('Pixel')
    expect(Object.keys(d.bind ?? {})).toEqual(['size', 'gamma'])
    expect(d.bind?.size.source).toBe('kick')
    expect(d.bind?.gamma.source).toBe('build')
    expect(d.inputs.find((i) => i.name === 'tint')?.type).toBe('bool')
  })

  test('own/stars: the header carries the lead-locked Wombat credit (wave-2 S1.3)', () => {
    const src = import.meta.glob('./own/stars.fs', { query: '?raw', import: 'default', eager: true })['./own/stars.fs'] as string
    expect(src).toContain('Brian Sharpe')
    expect(src).toContain('Wombat')
    expect(src).toContain('Use the code however you wish')
  })
})

// live.ts node() builds one read/write pair per distinct index (GL-bound: the S1.8 browser check counts its textures).
test('pairsByTarget: pass i → the first pass naming its TARGET (the pair it shares), −1 without one', () => {
  const at = (...names: (string | undefined)[]) => pairsByTarget(names.map((target) => ({ target })))
  expect(at('down4', 'down8', 'up4')).toEqual([0, 1, 2]) // distinct names (own/bloom): identity, as before
  expect(at('s', 's', 's')).toEqual([0, 0, 0]) // repeats: the first one's
  expect(at(undefined, undefined)).toEqual([-1, -1]) // no TARGET: no pair
  expect(at('s', 'a', undefined, 's', 'a', 'b', 's', undefined)).toEqual([0, 1, -1, 0, 1, 5, 0, -1]) // mixed order
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
