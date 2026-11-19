import { describe, expect, test } from 'vitest'
import { SOURCE_IDS } from '../bind'
import { clockRate, clockStep } from '../clock'
import type { FrameInput } from '../frame'
import { BUILTIN } from '../scenes/builtin'
import { pairsByTarget, sizeExpr } from './isf'
import { meter } from '../audio/meter'
import { evaluate, type Binding, type Sources } from '../bind'
import { hoist, parseSyn, pushTrail, SYN, SYN_BIND, synClock, synValue, TRAIL } from './syn'
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
    expect(d.raws![0][1]({ sync: { beat: 7.25 } } as FrameInput, {})).toBe(7) // + 1 per beat (the donor's steps), not a 0..1 binding
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
    // a data grid (a side under 8 px) keeps its pixels; 0 is the frame's size; no FLOAT key is HDR (the donor's default)
    const g = parseSyn(syn({ PASSES: [{ TARGET: 'grid', WIDTH: 5, HEIGHT: 512 }, { TARGET: 'full', WIDTH: 0, HEIGHT: 0, FLOAT: false }] }, ''), 'syn/g')
    expect(g.passes.slice(0, 2)).toEqual([{ target: 'grid', persistent: false, float: true, width: '5', height: '512', wrap: 'repeat' }, { target: 'full', persistent: false, float: false, width: undefined, height: undefined, wrap: 'repeat' }]) // repeat unless WRAP clamp
    expect(parseSyn(syn({ PASSES: [{ TARGET: 'c', WRAP: 'clamp' }] }, ''), 'syn/w').passes[0].wrap).toBeUndefined()
    const m = parseSyn(syn({ PASSES: [{ TARGET: 'c', FILTER: 'mipmap' }, { TARGET: 'l', FILTER: 'linear' }] }, ''), 'syn/m') // mipmap: live.ts generates the levels per draw
    expect([m.unsupported, m.passes[0].filter, m.passes[1].filter]).toEqual([undefined, 'mipmap', undefined])
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

  test('adapter step 3: TYPE float, FRAMECOUNT compares, a bang at MIN, a toggle at MIN or MAX, a speed slider is a clock', () => {
    const d = parseSyn(syn({
      PASSES: [{ TARGET: 'f', TYPE: 'float' }],
      CONTROLS: [
        { NAME: 'shimmer', TYPE: 'bang smooth', DEFAULT: 1, MIN: 1, MAX: -10 }, // shrouded
        { NAME: 'reverse', TYPE: 'toggle', DEFAULT: 0, MIN: -1, MAX: 1 }, // stained_glass: 0 stopped its clock
        { NAME: 'up', TYPE: 'toggle', DEFAULT: 1, MIN: 0.05, MAX: 0.9 },
        { NAME: 'flip', TYPE: 'toggle', DEFAULT: 1, MIN: 1, MAX: 0 }, // a default at MIN stays
        { NAME: 'speed', TYPE: 'slider speed', DEFAULT: 4, MIN: -9, MAX: 9 }, // entombed_silicon_dreams
      ],
    }, 'vec4 renderMain() { if (FRAMECOUNT < 10 || FRAMECOUNT<=2 || FRAMECOUNT < 2.5) return vec4(0.0); return vec4(shimmer, reverse, speed, up); }'), 'syn/s3')
    expect([d.unsupported, d.passes[0].float]).toEqual([undefined, true])
    expect(d.fs).toContain('if (FRAMECOUNT < 10.0 || FRAMECOUNT<=2.0 || FRAMECOUNT < 2.5)') // ours is a float
    expect(d.inputs.map((i) => [i.name, i.default])).toEqual([['shimmer', 1], ['reverse', -1], ['up', 0.9], ['flip', 1], ['speed_', 4]])
    expect(d.clocks).toEqual([{ u: 'speed', rate: [[1, ['speed_', -1]]] }])
    const u: Record<string, unknown> = { speed_: 4 }
    for (let i = 0; i < 60; i++) for (const c of d.clocks!) u[c.u] = clockStep((u[c.u] as number | undefined) ?? 0, c.rate, u, 1 / 60)
    expect(u.speed).toBeCloseTo(4, 9) // the slider's value per second
  })

  test('syn_LevelTrail: the four levels over time, newest at x = 1; syn_InputLevel the HUD meter; syn_BassExpoCurve subBody²', () => {
    const d = parseSyn(syn({}, 'vec4 renderMain() { return texture(syn_LevelTrail, _uv.x) * syn_InputLevel * syn_BassExpoCurve; }'), 'syn/lt')
    expect([d.unsupported, d.textures]).toEqual([undefined, { syn_LevelTrail: 'trail' }])
    expect(d.fs).toContain('return _synLevelTrail(_uv.x) * syn_InputLevel * syn_BassExpoCurve;')
    expect(d.fs).toContain('vec4 _synLevelTrail(float x) { return texture(syn_LevelTrail, vec2(x, 0.5)); }')
    const bytes = new Uint8Array(4 * TRAIL).fill(9)
    const states = [0, 1, 2, 3].map(() => ({ y: 0 }))
    const s: Sources = { reeseBody: 0.5, subBody: 1, band27: 0.25 }
    pushTrail(bytes, states, s, 10) // dt ≫ the bindings' attack: the levels land in full
    expect([...bytes.slice(-8)]).toEqual([9, 9, 9, 9, 127, 255, 127, 63]) // r all (reeseBody), g bass, b mid, a high
    const raw = (n: string, s: Sources) => (SYN[n] as { raw: (f: FrameInput, s: Sources) => number }).raw({} as FrameInput, s)
    meter.db = -20
    expect(raw('syn_InputLevel', {})).toBeCloseTo(0.1, 9) // linear, of the held peak
    expect(raw('syn_BassExpoCurve', { subBody: 0.5 })).toBe(0.25)
  })

  test('SYN follows our detector: hits reach 1, beat names step on our grid at full swing, Intensity rides the arrangement', () => {
    for (const n of ['syn_BassHits', 'syn_Hits', 'syn_MidHits', 'syn_HighHits', 'syn_OnBeat']) {
      const b = SYN_BIND[n]
      const tau = b.source === 'hats' ? 0.06 : 0.12 // features.ts: e^(−age/τ), 1 on the hit
      expect(evaluate(b, { [b.source]: Math.exp(-(1 / 60) / tau) }, { y: 0 }, 1 / 60), n).toBe(1) // a hit a frame old still reads 1
    }
    expect([SYN_BIND.syn_BassHits.source, SYN_BIND.syn_Hits.source, SYN_BIND.syn_HighHits.source, SYN_BIND.syn_OnBeat.source]).toEqual(['kick', 'snare', 'hats', 'kick'])
    const raw = (n: string, beat: number, confidence = 0.1, s: Sources = {}) => (SYN[n] as { raw: (f: FrameInput, s: Sources) => number }).raw({ sync: { beat, confidence } } as FrameInput, s)
    expect([raw('syn_ToggleOnBeat', 4.5), raw('syn_ToggleOnBeat', 5.5), raw('syn_ToggleOnBeat', 5)]).toEqual([0, 1, 0]) // a full flip at confidence .1, starting on the beat
    expect(raw('syn_RandomOnBeat', 7.5)).toBe(raw('syn_RandomOnBeat', 7.9)) // held through the beat
    expect(raw('syn_RandomOnBeat', 7.5)).not.toBe(raw('syn_RandomOnBeat', 8.5))
    expect([raw('syn_BeatTime', 7.9), raw('syn_BPMTwitcher', 7), raw('syn_BPMTwitcher', 7.5)]).toEqual([7, 7, expect.closeTo(8 - Math.exp(-3), 9)])
    expect([raw('syn_Intensity', 0, 0, { energy: 0.4 }), raw('syn_Intensity', 0, 0, { energy: 0.3, build: 0.8 }), raw('syn_Intensity', 0, 0, { energy: 0.5, drop: 1 })]).toEqual([0.4, 0.8, 1])
  })

  test('unsupported: every gap listed at once; a porter slip still throws', () => {
    const d = parseSyn(syn({ PASSES: [{ TARGET: 'b', FILTER: 'cubic', TYPE: 'half' }] }, 'float x = syn_PrimeBang;'), 'syn/a')
    expect(d.unsupported!.split('; ')).toEqual(['syn_PrimeBang (not a public donor name)', 'pass b: TYPE half', 'pass b: FILTER cubic'])
    expect(() => parseSyn(syn({ VJW_CLOCK: { t: [['nope']] } }, ''), 'syn/b')).toThrow(/^syn\/b: VJW_CLOCK reads nope/)
    expect(() => parseSyn(syn({ VJW_FLASH: ['ghost'] }, ''), 'syn/d')).toThrow(/^syn\/d: VJW_FLASH/)
  })
})

describe('SYN and the bundled scenes', () => {
  test('SYN maps the 44 public donor names (+ BassExpoCurve, InputLevel); its bindings read known sources, no onset/treb (an own built-in binds neither)', () => {
    expect(Object.keys(SYN)).toHaveLength(46)
    for (const b of Object.values(SYN_BIND)) {
      expect(SOURCE_IDS).toContain(b.source)
      expect(['onset', 'treb']).not.toContain(b.source)
    }
  })

  const files = import.meta.glob(['./syn/*.glsl', '!./syn/preamble.glsl'], { query: '?raw', import: 'default', eager: true })
  const defs = Object.entries(files).map(([path, src]) => parseSyn(src as string, path.slice('./'.length, -'.glsl'.length)))

  test('each parses clean; its built-in binds every bound syn_* input (and may bind its controls); ⚡ names inputs', () => {
    expect(defs.map((d) => d.id)).toEqual(expect.arrayContaining(['syn/beats_in_4d', 'syn/dark_twister', 'syn/kaleidowhoa_man'])) // ports add more
    for (const d of defs) {
      expect(d.unsupported, d.id).toBeUndefined()
      const gens = BUILTIN.flatMap((s) => s.layers.map((l) => l.gen)).filter((g) => g.ref === d.id)
      expect(gens.length, d.id).toBe(1)
      const want = d.inputs.filter((i) => i.name.startsWith('syn_')).map((i) => i.name)
      const keys = Object.keys(gens[0].bind ?? {})
      expect(keys, d.id).toEqual(expect.arrayContaining(want))
      for (const k of keys) expect(d.inputs.map((i) => i.name), `${d.id} binds ${k}`).toContain(k) // a declared input: no stray or raw name
      for (const f of d.flash ?? []) expect(want, d.id).toContain(f)
    }
  })
})

describe('the donor mix at the raws and the LevelTrail (plan S2.3)', () => {
  test('T2a T2c: a SYN name crossfades to its donor value by w; a name SYN does not feed stays ours', () => {
    expect([0, 0.5, 1].map((w) => synValue('syn_BassLevel', 0.3, { syn_BassLevel: 0.8 }, w))).toEqual([0.3, expect.closeTo(0.55, 9), expect.closeTo(0.8, 9)])
    expect([synValue('foo', 0.3, { foo: 0.9 }, 1), synValue('kick', 0.3, { kick: 0.9 }, 1)]).toEqual([0.3, 0.3])
  })

  test('T2b: a count is ours below w .5 and the donor value from .5, never a value between', () => {
    for (const n of ['syn_BeatTime', 'syn_BPMTwitcher', 'syn_BPM']) {
      const ws = Array.from({ length: 101 }, (_, i) => i / 100) // .49 → 6, .5 → 7
      expect(ws.map((w) => synValue(n, 6, { [n]: 7 }, w)), n).toEqual(ws.map((w) => (w < 0.5 ? 6 : 7)))
    }
  })

  test('T2g: at w 1 the newest texel is the four donor levels through their own bindings (rise and fall); at w 0 ours', () => {
    const lit = (source: string, release: number): Binding => ({ source, amount: 1, attack: 0.05, release, min: 0, max: 1 })
    const donor = [lit('syn_Level', 0.3), lit('syn_BassLevel', 0.15), lit('syn_MidLevel', 0.15), lit('syn_HighLevel', 0.15)]
    const ours = ['syn_Level', 'syn_BassLevel', 'syn_MidLevel', 'syn_HighLevel'].map((n) => SYN_BIND[n])
    const fresh = (n: number) => Array.from({ length: n }, () => ({ y: 0 }))
    const [b0, b1, s0, s1, so, sd] = [new Uint8Array(4 * TRAIL), new Uint8Array(4 * TRAIL), fresh(8), fresh(8), fresh(4), fresh(4)]
    let want = { ours: new Uint8Array(4), donor: new Uint8Array(4) }
    const run = (frames: number, s: Sources) => {
      for (let i = 0; i < frames; i++) {
        pushTrail(b0, s0, s, 1 / 60, 0)
        pushTrail(b1, s1, s, 1 / 60, 1)
        want = { ours: Uint8Array.from(ours, (b, c) => 255 * evaluate(b, s, so[c], 1 / 60)), donor: Uint8Array.from(donor, (b, c) => 255 * evaluate(b, s, sd[c], 1 / 60)) }
      }
    }
    const s = { reeseBody: 0.2, subBody: 0.3, band27: 0.1, syn_Level: 0.8, syn_BassLevel: 0.7, syn_MidLevel: 0.6, syn_HighLevel: 0.9 }
    run(60, s) // 1 s held: the attack
    for (let c = 0; c < 4; c++) expect(want.ours[c], `channel ${c}: the fixture tells ours from the donor's`).not.toBe(want.donor[c])
    expect([b1.slice(-4), b0.slice(-4)]).toEqual([want.donor, want.ours])
    run(6, { ...s, syn_Level: 0, syn_BassLevel: 0, syn_MidLevel: 0, syn_HighLevel: 0 }) // the fall: Level's release .3, the rest .15
    expect([b1.slice(-4), b0.slice(-4)]).toEqual([want.donor, want.ours])
  })
})

describe('the donor rate at the SYN clocks (plan S2.4, finding C9)', () => {
  const d = parseSyn(syn({}, 'vec4 renderMain() { return vec4(syn_Time + syn_CurvedTime); }'), 'syn/clk')
  const [time, curved] = d.clocks!

  test('T2e: at L .5, w 1 runs syn_Time and syn_CurvedTime at 1.0 / s (2 L, 8 L³), w 0 at .5 and .75 / s, bit for bit today’s', () => {
    expect(d.clocks!.map((c) => c.u)).toEqual(['syn_Time', 'syn_CurvedTime'])
    for (const n of ['syn_Time', 'syn_BassTime', 'syn_MidTime', 'syn_MidHighTime', 'syn_HighTime']) expect(SYN[n], n).toEqual({ clock: [[n.replace('Time', 'Level')]], donor: [[2, n.replace('Time', 'Level')]] }) // 2 × its own level
    const speed = (w: number) => {
      const u: Record<string, unknown> = { syn_Level: 0.5 }
      for (let i = 0; i < 60; i++) for (const c of d.clocks!) u[c.u] = synClock((u[c.u] as number | undefined) ?? 0, c, u, 1 / 60, w)
      return [u.syn_Time, u.syn_CurvedTime] // from 0 over 1 s: the advance per s
    }
    expect(speed(1)).toEqual([expect.closeTo(1, 6), expect.closeTo(1, 6)])
    expect(speed(0)).toEqual([expect.closeTo(0.5, 6), expect.closeTo(0.75, 6)])
    for (const c of [time, curved]) expect(Object.is(synClock(0.3, c, { syn_Level: 0.4 }, 1 / 60, 0), clockStep(0.3, c.rate, { syn_Level: 0.4 }, 1 / 60))).toBe(true)
  })

  test('T2f: rates .5 and 1.0 / s, the per-frame step at w .49 and at w .51 differ by < 10 % (no jump at the midpoint)', () => {
    const step = (w: number) => synClock(0, time, { syn_Level: 0.5 }, 1 / 60, w)
    expect([step(0), step(1)]).toEqual([expect.closeTo(0.5 / 60, 12), expect.closeTo(1 / 60, 12)]) // the fixture's two rates
    expect(Math.abs(step(0.51) - step(0.49)) / step(0.49)).toBeLessThan(0.1)
  })

  test('PA3: a scene clock (VJW_CLOCK) has no donor rate: it steps the same at w 1 as at w 0', () => {
    const ct = def().clocks!.find((c) => c.u === 'ct')!
    const u = { speed: [0.5, 0.25], wires: 1, syn_Presence: 0.8 }
    expect(ct.donor).toBeUndefined()
    expect(synClock(0.3, ct, u, 1 / 60, 1)).toBe(synClock(0.3, ct, u, 1 / 60, 0))
    expect(synClock(0.3, ct, u, 1 / 60, 1)).toBe(clockStep(0.3, ct.rate, u, 1 / 60))
  })
})
