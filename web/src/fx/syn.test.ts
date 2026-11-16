import { describe, expect, test } from 'vitest'
import { SOURCE_IDS } from '../bind'
import { BUILTIN } from '../scenes/builtin'
import { pairsByTarget, sizeExpr } from './isf'
import { parseSyn, SYN_BIND, tick } from './syn'

const syn = (header: object, body: string) => `// Source: test\n/*${JSON.stringify(header)}*/\n${body}`
const BODY = `// syn_BassTime only in a comment
vec4 renderMain() {
  if (PASSINDEX == 0) return vec4(syn_BassHits);
  return mix(texture(buf, _uv), texture(syn_FinalPass, _uv), 0.5) + vec4(tint, 1.0) * ct;
}`
const HEADER = {
  TITLE: 'Test Scene', CREDIT: 'someone', WIDTH: 1920, HEIGHT: 1080,
  PASSES: [{ TARGET: 'buf', FLOAT: true, WIDTH: 960, HEIGHT: 540 }],
  CONTROLS: [
    { NAME: 'speed', TYPE: 'xy smooth', DEFAULT: [0.5, 0.25], MIN: [-2, -1], MAX: [2, 1] },
    { NAME: 'tint', TYPE: 'color', DEFAULT: 0, DEF_COLOR: [1, 0, 0] },
    { NAME: 'wires', TYPE: 'toggle smooth', DEFAULT: 1, MIN: 0, MAX: 1 },
  ],
  VJW_FLASH: ['syn_BassHits'],
  VJW_CLOCK: { ct: [['speed.x'], ['speed.y', 'syn_Presence'], [2, 'wires', 'syn_Presence', 'syn_Presence']] },
}

describe('parseSyn', () => {
  test('uniform mapping: each syn_* the body or a clock reads is a float input bound by SYN_BIND; controls by TYPE', () => {
    const d = parseSyn(syn(HEADER, BODY), 'syn/test')
    expect(d).toMatchObject({ id: 'syn/test', name: 'Test Scene', kind: 'generator', credit: 'someone', glsl: 300, flash: ['syn_BassHits'] })
    expect(d.inputs).toEqual([
      { name: 'syn_BassHits', type: 'float', default: 0, min: 0, max: 1 }, // the body's (the comment's syn_BassTime is not read)
      { name: 'syn_Presence', type: 'float', default: 0, min: 0, max: 1 }, // the clock's
      { name: 'speed', type: 'point2D', default: [0.5, 0.25], min: [-2, -1], max: [2, 1] },
      { name: 'tint_', label: 'tint', type: 'color', default: [1, 0, 0, 1] }, // the panel's rgba, the body's .rgb
      { name: 'wires', type: 'float', default: 1, min: 0, max: 1 },
    ])
    expect(d.bind).toEqual({ syn_BassHits: SYN_BIND.syn_BassHits, syn_Presence: SYN_BIND.syn_Presence })
    expect(d.bind!.syn_BassHits.source).toBe('kick')
    for (const u of ['uniform float syn_BassHits;', 'uniform vec2 speed;', 'uniform vec4 tint_;\n#define tint tint_.rgb', 'uniform float ct;', '_COLOR_OUT_ = renderMain();'])
      expect(d.fs).toContain(u)
    expect(d.fs.startsWith('#version 300 es\n')).toBe(true)
  })

  test('feedback wiring: a PASSES TARGET and syn_FinalPass get read/write pairs; the screen pass is last, its size scales', () => {
    const d = parseSyn(syn(HEADER, BODY), 'syn/test')
    expect(d.passes).toEqual([
      { target: 'buf', persistent: false, float: true, width: '$WIDTH*960/1920', height: '$HEIGHT*540/1080' },
      { target: 'syn_FinalPass', persistent: false, float: false }, // the body samples it: the screen pass writes it
    ])
    expect(pairsByTarget(d.passes)).toEqual([0, 1]) // each its own pair: a pass reads its target's last frame (live.ts)
    expect(sizeExpr(d.passes[0].width!, { WIDTH: 1000 })).toBe(500)
    for (const t of ['buf', 'syn_FinalPass']) expect(d.fs).toContain(`uniform sampler2D ${t};\nuniform vec2 _${t}_imgSize;`)
    const plain = parseSyn(syn({}, 'vec4 renderMain() { return vec4(1.0); }'), 'syn/plain')
    expect(plain.passes).toEqual([{ target: undefined, persistent: false, float: false }]) // no feedback: the direct path
    expect(plain.name).toBe('plain')
  })

  test('clock integration: per frame u[clock] += Σ terms · dt, from 0, reading the live input values', () => {
    const d = parseSyn(syn(HEADER, BODY), 'syn/test')
    expect(d.clocks).toEqual([{ u: 'ct', terms: [[['speed', 0]], [['speed', 1], ['syn_Presence', -1]], [2, ['wires', -1], ['syn_Presence', -1], ['syn_Presence', -1]]] }])
    const u: Record<string, unknown> = { speed: [0.5, 0.25], wires: 1, syn_Presence: 0.8 }
    for (let i = 0; i < 60; i++) tick(u, d.clocks!, 1 / 60)
    expect(u.ct).toBeCloseTo(0.5 + 0.25 * 0.8 + 2 * 0.64, 9) // 1 s at rate 1.98
    u.syn_Presence = 0 // a binding moved the input: the rate follows at once
    tick(u, d.clocks!, 0.5)
    expect(u.ct).toBeCloseTo(1.98 + 0.25, 9)
  })

  test('readable errors: an unmapped syn_* float, a clock reading a non-input, an unsupported control TYPE', () => {
    expect(() => parseSyn(syn({}, 'float x = syn_BPMTwitcher;'), 'syn/a')).toThrow(/^syn\/a: syn_BPMTwitcher has no source/)
    expect(() => parseSyn(syn({ VJW_CLOCK: { t: [['nope']] } }, ''), 'syn/b')).toThrow(/^syn\/b: VJW_CLOCK reads nope/)
    expect(() => parseSyn(syn({ CONTROLS: [{ NAME: 'm', TYPE: 'dropdown' }] }, ''), 'syn/c')).toThrow(/^syn\/c: control m: TYPE "dropdown"/)
    expect(() => parseSyn(syn({ VJW_FLASH: ['ghost'] }, ''), 'syn/d')).toThrow(/^syn\/d: VJW_FLASH/)
  })
})

describe('the bundled scenes', () => {
  const files = import.meta.glob(['./syn/*.glsl', '!./syn/preamble.glsl'], { query: '?raw', import: 'default', eager: true })
  const defs = Object.entries(files).map(([path, src]) => parseSyn(src as string, path.slice('./'.length, -'.glsl'.length)))

  test('each parses; its starred built-in binds every syn_* input; ⚡ names inputs', () => {
    expect(defs.map((d) => d.id).sort()).toEqual(['syn/beats_in_4d', 'syn/dark_twister', 'syn/kaleidowhoa_man'])
    for (const d of defs) {
      const gens = BUILTIN.flatMap((s) => (s.star ? s.layers.map((l) => l.gen) : [])).filter((g) => g.ref === d.id)
      expect(gens.length, d.id).toBe(1)
      const want = d.inputs.filter((i) => i.name.startsWith('syn_')).map((i) => i.name)
      expect(Object.keys(gens[0].bind ?? {}).sort(), d.id).toEqual(want.sort())
      for (const f of d.flash ?? []) expect(want, d.id).toContain(f)
    }
  })

  test('SYN_BIND reads known sources, no onset/treb (an own built-in binds neither: doc.test.ts)', () => {
    for (const b of Object.values(SYN_BIND)) {
      expect(SOURCE_IDS).toContain(b.source)
      expect(['onset', 'treb']).not.toContain(b.source)
    }
  })
})
