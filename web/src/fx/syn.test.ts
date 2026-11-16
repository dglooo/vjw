import { describe, expect, test } from 'vitest'
import { SOURCE_IDS } from '../bind'
import { clockRate, clockStep } from '../clock'
import type { FrameInput } from '../frame'
import { BUILTIN } from '../scenes/builtin'
import { pairsByTarget, sizeExpr } from './isf'
import { hoist, parseSyn, SYN, SYN_BIND } from './syn'

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

  test('unsupported: every gap listed at once; a porter slip still throws', () => {
    const d = parseSyn(syn({
      IMAGES: [{ NAME: 'noise', PATH: 'images/noise.jpg' }],
      PASSES: [{ TARGET: 'b', FILTER: 'mipmap' }],
      CONTROLS: [{ NAME: 't', TYPE: 'slider traveler' }, { NAME: 'n', TYPE: 'bang counter' }],
    }, 'float x = syn_Spectrum.r + syn_PrimeBang;'), 'syn/a')
    expect(d.unsupported!.split('; ')).toEqual([
      'control t: TYPE slider traveler (it moves or counts by itself)', 'control n: TYPE bang counter (it moves or counts by itself)',
      'syn_Spectrum (the donor FFT texture, 4 channels: map to audioTex)', 'syn_PrimeBang (not a public donor name)',
      'IMAGES (1: copy images/ to public/ and load them as textures)', 'pass b: FILTER mipmap',
    ])
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

  test('each parses clean; its starred built-in binds every bound syn_* input; ⚡ names inputs', () => {
    expect(defs.map((d) => d.id)).toEqual(expect.arrayContaining(['syn/beats_in_4d', 'syn/dark_twister', 'syn/kaleidowhoa_man'])) // ports add more
    for (const d of defs) {
      expect(d.unsupported, d.id).toBeUndefined()
      const gens = BUILTIN.flatMap((s) => (s.star ? s.layers.map((l) => l.gen) : [])).filter((g) => g.ref === d.id)
      expect(gens.length, d.id).toBe(1)
      const want = d.inputs.filter((i) => i.name.startsWith('syn_')).map((i) => i.name)
      expect(Object.keys(gens[0].bind ?? {}).sort(), d.id).toEqual(want.sort())
      for (const f of d.flash ?? []) expect(want, d.id).toContain(f)
    }
  })
})
