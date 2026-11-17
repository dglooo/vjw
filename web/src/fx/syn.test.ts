import { describe, expect, test } from 'vitest'
import { SOURCE_IDS } from '../bind'
import { clockRate, clockStep } from '../clock'
import type { FrameInput } from '../frame'
import { BUILTIN } from '../scenes/builtin'
import { pairsByTarget, sizeExpr } from './isf'
import { hoist, parseSyn, SYN, SYN_BIND } from './syn'
import PREAMBLE from './syn/preamble.glsl?raw'

const syn = (header: object, body: string) => `// Source: test\n/*${JSON.stringify(header)}*/\n${body}`
const BODY = `// syn_BassTime only in a comment
vec4 renderMain() {
  if (PASSINDEX == 0.0) return vec4(syn_BassHits);
  return mix(texture(buf, _uv), texture(syn_FinalPass, _uv), 0.5) + vec4(tint, 1.0) * ct * syn_FadeInOut + syn_BeatTime + syn_MidTime;
}`
const HEADER = {
  TITLE: 'Test Scene', CREDIT: 'someone', WIDTH: 1920, HEIGHT: 1080,
  PASSES: [{ TARGET: 'buf', FLOAT: true, WIDTH: 960, HEIGHT: 540, WRAP: 'repeat', FILTER: 'nearest', DOUBLE_BUFFER: true }],
  CONTROLS: [
    { NAME: 'speed', TYPE: 'xy smooth', DEFAULT: [0.5, 0.25], MIN: [-2, -1], MAX: [2, 1] },
    { NAME: 'tint', TYPE: 'color', DEFAULT: 0, DEF_COLOR: [1, 0, 0] },
    { NAME: 'wires', TYPE: 'toggle smooth', DEFAULT: 1, MIN: 0, MAX: 1 },
    { NAME: 'mode', TYPE: 'dropdown smooth', DEFAULT: 1, LABELS: ['a', 'b', 'c'] },
  ],
  VJW_FLASH: ['syn_BassHits'],
  VJW_CLOCK: { ct: [['speed.x'], ['speed.y', 'syn_Presence'], [2, 'wires', 'syn_Presence', 'syn_Presence']] },
}
const def = () => parseSyn(syn(HEADER, BODY), 'syn/test')

describe('parseSyn', () => {
  test('uniform mapping: bound syn_* floats are inputs, the rest clocks / frame values / constants; controls by TYPE', () => {
    const d = def()
    expect(d).toMatchObject({ id: 'syn/test', name: 'Test Scene', kind: 'generator', credit: 'someone', glsl: 300, flash: ['syn_BassHits'], unsupported: undefined })
    expect(d.inputs).toEqual([
      { name: 'syn_BassHits', type: 'float', default: 0, min: 0, max: 1 }, // the body's (the comment's syn_BassTime is not read)
      { name: 'syn_Presence', type: 'float', default: 0, min: 0, max: 1 }, // the scene clock's
      { name: 'syn_MidLevel', type: 'float', default: 0, min: 0, max: 1 }, // syn_MidTime's (a SYN clock)
      { name: 'speed', type: 'point2D', default: [0.5, 0.25], min: [-2, -1], max: [2, 1] },
      { name: 'tint_', label: 'tint', type: 'color', default: [1, 0, 0, 1] }, // the panel's rgba, the body's .rgb
      { name: 'wires', type: 'float', default: 1, min: 0, max: 1 },
      { name: 'mode', type: 'float', default: 1, min: 0, max: 2, label: 'mode (a / b / c)' },
    ])
    expect(d.bind).toEqual({ syn_BassHits: SYN_BIND.syn_BassHits, syn_Presence: SYN_BIND.syn_Presence, syn_MidLevel: SYN_BIND.syn_MidLevel })
    expect(d.bind!.syn_BassHits.source).toBe('kick')
    expect(d.raws!.map(([n]) => n)).toEqual(['syn_BeatTime'])
    expect(d.raws![0][1]({ sync: { beat: 7.25 } } as FrameInput)).toBe(7.25) // the beat count, not a 0..1 binding
    for (const u of ['uniform float syn_BassHits;', 'uniform vec2 speed;', 'uniform vec4 tint_;\n#define tint tint_.rgb', 'uniform float ct;', 'uniform float syn_MidTime;', 'uniform float syn_BeatTime;', '#define syn_FadeInOut 1.0', '_COLOR_OUT_ = renderMain();'])
      expect(d.fs).toContain(u)
    expect(d.fs.startsWith('#version 300 es\n')).toBe(true)
    expect(d.fs).toContain('if (PASSINDEX == 0) return') // the donor's float compare, as our int
    expect(d.fs).toContain('_COLOR_OUT_ = renderMain();\n  if (PASSINDEX == 1) _COLOR_OUT_.a = 1.0;') // the screen pass is opaque
  })

  test('transitions are static controls; a bang rests at 0; #line is dropped', () => {
    const d = parseSyn(syn({
      CONTROLS: [{ NAME: 'jump', TYPE: 'bang smooth', DEFAULT: 1 }, { NAME: 'mode', TYPE: 'dropdown', DEFAULT: 1, LABELS: ['a', 'b'] }],
      HARD_TRANSITIONS: [{ UNIFORM: 'reso', VALUES: [10, 0, 30] }, { UNIFORM: 'mode', VALUES: [0, 1] }],
      SMOOTH_TRANSITIONS: [{ UNIFORMS: ['light', 'dark'], DURATION: 3 }],
    }, '#line 0\nvec4 renderMain() { return vec4(reso, light, dark, jump); }'), 'syn/tr')
    expect(d.unsupported).toBeUndefined()
    expect(d.inputs).toEqual([
      { name: 'jump', type: 'float', default: 0, min: 0, max: 1 },
      { name: 'mode', type: 'float', default: 1, min: 0, max: 1, label: 'mode (a / b)' }, // declared once: the control wins
      { name: 'reso', type: 'float', default: 10, min: 0, max: 30 }, // the first value
      { name: 'light', type: 'float', default: 1, min: 0, max: 1 }, // the group's first one on
      { name: 'dark', type: 'float', default: 0, min: 0, max: 1 },
    ])
    expect(d.fs).not.toContain('#line')
  })

  test('feedback wiring: a PASSES TARGET and syn_FinalPass get read/write pairs; the screen pass is last, its size scales', () => {
    const d = def()
    expect(d.passes).toEqual([
      { target: 'buf', persistent: false, float: true, width: '$WIDTH*960/1920', height: '$HEIGHT*540/1080', filter: 'nearest', wrap: 'repeat' },
      { target: 'syn_FinalPass', persistent: false, float: false }, // the body samples it: the screen pass writes it
    ])
    expect(pairsByTarget(d.passes)).toEqual([0, 1]) // each its own pair: a pass reads its target's last frame (live.ts)
    expect(sizeExpr(d.passes[0].width!, { WIDTH: 1000 })).toBe(500)
    for (const t of ['buf', 'syn_FinalPass']) expect(d.fs).toContain(`uniform sampler2D ${t};\nuniform vec2 _${t}_imgSize;`)
    // a data grid (a side under 8 px) keeps its pixels; 0 is the frame's size
    const g = parseSyn(syn({ PASSES: [{ TARGET: 'grid', WIDTH: 5, HEIGHT: 512 }, { TARGET: 'full', WIDTH: 0, HEIGHT: 0 }] }, ''), 'syn/g')
    expect(g.passes.slice(0, 2)).toEqual([{ target: 'grid', persistent: false, float: false, width: '5', height: '512', wrap: 'repeat' }, { target: 'full', persistent: false, float: false, width: undefined, height: undefined, wrap: 'repeat' }]) // repeat unless WRAP clamp
    expect(parseSyn(syn({ PASSES: [{ TARGET: 'c', WRAP: 'clamp' }] }, ''), 'syn/w').passes[0].wrap).toBeUndefined()
    expect(sizeExpr(g.passes[0].width!, { WIDTH: 432 })).toBe(5)
    const plain = parseSyn(syn({}, 'vec4 renderMain() { return vec4(1.0); }'), 'syn/plain')
    expect(plain.passes).toEqual([{ target: undefined, persistent: false, float: false }]) // no feedback: the direct path
    expect(plain.name).toBe('plain')
  })

  test('clock integration (clock.ts): u[clock] += rate · dt from 0, reading the live values; SYN clocks step first', () => {
    const d = def()
    expect(d.clocks!.map((c) => c.u)).toEqual(['syn_MidTime', 'ct'])
    expect(d.clocks![1].rate).toEqual([[['speed', 0]], [['speed', 1], ['syn_Presence', -1]], [2, ['wires', -1], ['syn_Presence', -1], ['syn_Presence', -1]]])
    const u: Record<string, unknown> = { speed: [0.5, 0.25], wires: 1, syn_Presence: 0.8, syn_MidLevel: 0.5 }
    for (let i = 0; i < 60; i++) for (const c of d.clocks!) u[c.u] = clockStep((u[c.u] as number | undefined) ?? 0, c.rate, u, 1 / 60)
    expect(u.ct).toBeCloseTo(0.5 + 0.25 * 0.8 + 2 * 0.64, 9) // 1 s at rate 1.98
    expect(u.syn_MidTime).toBeCloseTo(0.5, 9) // wound by its level
    // The binding-shaped clock (the user's audio-clock feature): ∫ (base + k·source) dt over the frame's Sources.
    const r = clockRate({ source: 'bass', base: 0.5, k: 2 })
    expect(clockStep(1, r, { bass: 0.25 }, 0.5)).toBe(1.5)
    expect(clockStep(1, r, {}, 0.5)).toBe(1.25) // a missing source reads 0
  })

  test('hoist: a non-const global initializer runs in _synInit (GLSL 330 → ES 3.00); const, prototypes and #if blocks stay', () => {
    const src = 'const float K = 2.0;\nfloat t = TIME * K, u, w = mix(1.0, 2.0, t);\nvec2 p[2] = vec2[](_uv, _uvc);\nfloat f(float x);\n#ifdef KODELIFE\nfloat beam = 3.5;\n#endif\nfloat f(float x) { float y = x; return y; }\n'
    const { body, init } = hoist(src)
    expect(init).toEqual(['t = TIME * K;', 'w = mix(1.0, 2.0, t);', 'p = vec2[](_uv, _uvc);'])
    expect(body.trimEnd()).toBe('const float K = 2.0;\nfloat t, u, w;\nvec2 p[2];\nfloat f(float x);\n#ifdef KODELIFE\nfloat beam = 3.5;\n#endif\nfloat f(float x) { float y = x; return y; }')
    expect(def().fs).toContain('_synInit();\n  _COLOR_OUT_ = renderMain();')
  })

  test('textures: IMAGES from public/syn/<scene>/, the media stub black, syn_Spectrum the toy texture (1D calls rewritten)', () => {
    const body = 'vec4 renderMain() { float s = texture(syn_Spectrum, _uv.x).g + textureLod( syn_Spectrum ,0.5, 0).b; return texture(noise, _uv) + texture(fbm, _uv) + texture(syn_Media, _uv) + texture(syn_UserImage, _uv) * s * syn_MediaType; }'
    const d = parseSyn(syn({ IMAGES: [{ NAME: 'noise', PATH: './images/noise.jpg' }, { NAME: 'fbm', PATH: 'fbm.png' }] }, body), 'syn/t')
    expect(d.unsupported).toBeUndefined()
    expect(d.textures).toEqual({ noise: '/syn/t/images/noise.jpg', fbm: '/syn/t/fbm.png', syn_Spectrum: 'audio', syn_Media: 'black', syn_UserImage: 'black' })
    for (const t of ['noise', 'fbm', 'syn_Media', 'syn_UserImage', 'syn_Spectrum']) expect(d.fs).toContain(`uniform sampler2D ${t};`)
    expect(d.fs).toContain('float s = _synSpectrum(_uv.x).g + _synSpectrum(0.5, 0).b;') // ES 3.00 has no sampler1D
    // the spectrum's channels: r = g = b the toy texture's FFT row, a its waveform row
    expect(d.fs).toContain('vec4 _synSpectrum(float x) { float f = texture(syn_Spectrum, vec2(x, 0.25)).r; return vec4(f, f, f, texture(syn_Spectrum, vec2(x, 0.75)).r); }')
    expect(d.fs).toContain('#define syn_MediaType 0.0') // media code behind its guard stays off
  })

  test('controls: a counter is + 1 per bang event, a traveler moves at its value × PARAMS per frame; an xy scalar is a pair', () => {
    const d = parseSyn(syn({ CONTROLS: [
      { NAME: 'n', TYPE: 'bang counter' },
      { NAME: 'spin', TYPE: 'slider traveler', DEFAULT: 0.2, MIN: 0, MAX: 2, PARAMS: 0.02 },
      { NAME: 'v', TYPE: 'xy traveler', DEFAULT: 0, MIN: -0.5, MAX: 0.5, PARAMS: 0.0025 },
      { NAME: 'look', TYPE: 'xy smooth', DEFAULT: 0, MIN: -1, MAX: 1 },
      { NAME: 'ink', TYPE: 'color' }, // no default: black
    ] }, 'vec4 renderMain() { return vec4(n, spin, v); }'), 'syn/c')
    expect(d.unsupported).toBeUndefined()
    expect(d.inputs).toEqual([
      { name: 'n_', label: 'n', type: 'event' }, // the panel's trigger, bindable: the body reads the count
      { name: 'spin_', label: 'spin', type: 'float', default: 0.2, min: 0, max: 2 }, // the speed: the body reads the position
      { name: 'v_', label: 'v', type: 'point2D', default: [0, 0], min: [-0.5, -0.5], max: [0.5, 0.5] },
      { name: 'look', type: 'point2D', default: [0, 0], min: [-1, -1], max: [1, 1] },
      { name: 'ink_', label: 'ink', type: 'color', default: [0, 0, 0, 1] },
    ])
    expect(d.fs).toContain('#define v vec2(v_x, v_y)')
    // live.ts run(): the clocks step before the draw (a frame clock by 1), the events clear after it
    const u: Record<string, unknown> = { n_: false, spin_: 0.5, v_: [0.1, -0.2] }
    for (let i = 0; i < 60; i++) {
      if (i % 20 === 0) u.n_ = true
      for (const c of d.clocks!) u[c.u] = clockStep((u[c.u] as number | undefined) ?? 0, c.rate, u, c.frame ? 1 : 1 / 60)
      u.n_ = false
    }
    expect(u.n).toBe(3) // three bangs, at any frame rate
    expect(u.spin).toBeCloseTo(0.5 * 0.02 * 60, 9) // 1 s
    expect([u.v_x, u.v_y]).toEqual([expect.closeTo(0.1 * 0.0025 * 60, 9), expect.closeTo(-0.2 * 0.0025 * 60, 9)])
    const o = parseSyn(syn({ CONTROLS: [{ NAME: 'spin', TYPE: 'slider traveler', PARAMS: 0.02 }], VJW_CLOCK: { spin: [[1, 'spin_']] } }, ''), 'syn/o')
    expect(o.clocks).toEqual([{ u: 'spin', rate: [[1, ['spin_', -1]]] }]) // a scene's own clock of the name replaces it
  })

  test('preamble: the meta-control stubs return the neutral result (a zero one turned a scene black); media reads black', () => {
    const stubs = PREAMBLE.slice(PREAMBLE.indexOf('// The media and meta-control stubs'), PREAMBLE.indexOf('// The helpers:')).split('\n')
    const meta = stubs.filter((l) => /^\w+ _(apply\w+|ratioFix|flipMediaCoords|correctUserImageCoords|imageToMask|mediaSize)\(/.test(l))
    expect(meta).toHaveLength(21)
    for (const l of meta) expect(l).not.toMatch(/return (vec[24]\(0\.0\)|0\.0);/)
    for (const s of ['vec4 _applyContrast(vec4 color) { return color; }', 'vec4 _applyColorCorrection(vec4 colIn) { return _applyBrightness(_applyGamma(_applyContrast(_applyHueSaturation(_applyInvert(colIn))))); }'])
      expect(PREAMBLE).toContain(s)
    expect(stubs.filter((l) => /^vec4 _(load|texture)Media/.test(l)).every((l) => l.includes('{ return vec4(0.0); }'))).toBe(true) // the black media stub
  })

  test('unsupported: every gap listed at once; a porter slip still throws', () => {
    const d = parseSyn(syn({ PASSES: [{ TARGET: 'b', FILTER: 'mipmap' }] }, 'float x = texture(syn_LevelTrail, 0.5).g + syn_PrimeBang;'), 'syn/a')
    expect(d.unsupported!.split('; ')).toEqual(['syn_LevelTrail (a band-level history texture)', 'syn_PrimeBang (not a public donor name)', 'pass b: FILTER mipmap'])
    expect(() => parseSyn(syn({ VJW_CLOCK: { t: [['nope']] } }, ''), 'syn/b')).toThrow(/^syn\/b: VJW_CLOCK reads nope/)
    expect(() => parseSyn(syn({ VJW_FLASH: ['ghost'] }, ''), 'syn/d')).toThrow(/^syn\/d: VJW_FLASH/)
  })
})

describe('SYN and the bundled scenes', () => {
  test('SYN maps the 44 public donor names; its bindings read known sources, no onset/treb (an own built-in binds neither)', () => {
    expect(Object.keys(SYN)).toHaveLength(44)
    for (const b of Object.values(SYN_BIND)) {
      expect(SOURCE_IDS).toContain(b.source)
      expect(['onset', 'treb']).not.toContain(b.source)
    }
  })

  const files = import.meta.glob(['./syn/*.glsl', '!./syn/preamble.glsl'], { query: '?raw', import: 'default', eager: true })
  const defs = Object.entries(files).map(([path, src]) => parseSyn(src as string, path.slice('./'.length, -'.glsl'.length)))

  test('each parses clean; its built-in binds every bound syn_* input; ⚡ names inputs', () => {
    expect(defs.map((d) => d.id)).toEqual(expect.arrayContaining(['syn/beats_in_4d', 'syn/dark_twister', 'syn/kaleidowhoa_man'])) // ports add more
    for (const d of defs) {
      expect(d.unsupported, d.id).toBeUndefined()
      const gens = BUILTIN.flatMap((s) => s.layers.map((l) => l.gen)).filter((g) => g.ref === d.id)
      expect(gens.length, d.id).toBe(1)
      const want = d.inputs.filter((i) => i.name.startsWith('syn_')).map((i) => i.name)
      expect(Object.keys(gens[0].bind ?? {}).sort(), d.id).toEqual(want.sort())
      for (const f of d.flash ?? []) expect(want, d.id).toContain(f)
    }
  })
})
