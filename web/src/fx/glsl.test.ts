import { describe, expect, test } from 'vitest'
import engineSrc from '../gl/engine.ts?raw'
import { commentParams, toyErrors, wrapToy, wrapTransition } from './glsl'

const count = (s: string, part: string) => s.split(part).length - 1
const HEAD = '#version 300 es\nprecision highp float;\nprecision highp int;\n'

describe('commentParams', () => {
  test('a float default, a non-numeric comment and a vec2 default', () => {
    expect(commentParams([
      'uniform float speed; // = 1.5',
      'uniform float mode; // = fast',
      'uniform vec2 center; // = vec2(0.25, -0.5)',
    ].join('\n'))).toEqual([
      { name: 'speed', type: 'float', default: 1.5, min: 0, max: 3 },
      { name: 'center', type: 'point2D', default: [0.25, -0.5] },
    ])
  })

  test('the spellings found in gl-transitions; anything not a plain literal of the right type is skipped', () => {
    expect(commentParams(`
uniform float zero;// = 0
  uniform float back ; //= -1.0 ; // a trailing comment
uniform float five;      // = 5.;
uniform int steps; // = 50
uniform bool on; // = true
uniform bool off; // = false
uniform vec2 splat; // = vec2(.5)
uniform vec3 tint; // = vec3(1.0, 0.5, 0.0)
uniform vec4 shadow; // = vec4(0.,0.,0.,.6);
uniform bool maybe; // = 1
uniform float third; // = 1.0/3.0
uniform float notVec; // = vec2(1.0)
uniform vec3 wrongCtor; // = vec4(1.0)
uniform vec2 three; // = vec2(1.0, 2.0, 3.0)
uniform vec2 expr; // = vec2(1.0 / 3.0, 0.5)
uniform ivec2 grid; // = ivec2(10, 10)
uniform vec3 color /* = vec3(0.9, 0.4, 0.2) */;
uniform sampler2D map;
uniform float nextLine;
// = 2.0
// uniform float commented; // = 1.0
`)).toEqual([
      { name: 'zero', type: 'float', default: 0, min: 0, max: 1 },
      { name: 'back', type: 'float', default: -1, min: -2, max: 2 },
      { name: 'five', type: 'float', default: 5, min: 0, max: 10 },
      { name: 'steps', type: 'long', default: 50, min: 0, max: 100 },
      { name: 'on', type: 'bool', default: true },
      { name: 'off', type: 'bool', default: false },
      { name: 'splat', type: 'point2D', default: [0.5, 0.5] },
      { name: 'tint', type: 'color', default: [1, 0.5, 0] },
      { name: 'shadow', type: 'color', default: [0, 0, 0, 0.6] },
    ])
  })
})

describe('wrapToy', () => {
  const paste = 'void mainImage(out vec4 c, in vec2 p) { c = vec4(p / iResolution.xy, 0.0, 1.0); } // no newline at the end'
  const toy = wrapToy(`// marker\nuniform float gain; // = 2.0\n${paste}`)

  test('the ES 3.00 prefix declares every Shadertoy uniform once, then the paste, then main()', () => {
    expect(toy.fs.startsWith(HEAD)).toBe(true)
    for (const u of [
      'uniform vec3 iResolution;', 'uniform float iTime;', 'uniform float iTimeDelta;', 'uniform int iFrame;',
      'uniform float iFrameRate;', 'uniform vec4 iMouse;', 'uniform vec4 iDate;', 'uniform float iSampleRate;',
      'uniform float iChannelTime[4];', 'uniform vec3 iChannelResolution[4];', 'uniform sampler2D iChannel0;',
      'uniform sampler2D iChannel1;', 'uniform sampler2D iChannel2;', 'uniform sampler2D iChannel3;', 'out vec4 _o;',
    ]) expect(count(toy.fs, u), u).toBe(1)
    // main() sits on its own line, so a trailing // comment in the paste can't swallow it
    expect(toy.fs.endsWith(`${paste}\nvoid main() { mainImage(_o, gl_FragCoord.xy); _o.a = 1.0; }\n`)).toBe(true)
    expect(toy.inputs).toEqual([{ name: 'gain', type: 'float', default: 2, min: 0, max: 4 }])
  })

  test('prefixLines is the number of lines before the paste', () => {
    expect(toy.prefixLines).toBeGreaterThan(0)
    expect(toy.fs.split('\n').indexOf('// marker')).toBe(toy.prefixLines)
  })

  test('vs is the engine triangle VS', () => {
    expect(engineSrc).toContain(toy.vs)
  })
})

describe('toyErrors', () => {
  test('ERROR lines by code line; a WARNING is dropped, a line past the code (main()) has none', () => {
    const log = "ERROR: 0:3: 'x' : undeclared identifier\nWARNING: 0:2: 'y' : unused\nERROR: 0:9: 'mainImage' : no matching overloaded function found\nERROR: 0:-4: before the code"
    expect(toyErrors(log, 5)).toEqual([
      { line: 3, msg: "'x' : undeclared identifier" },
      { line: 0, msg: "'mainImage' : no matching overloaded function found" },
      { line: 0, msg: 'before the code' },
    ])
  })

  test('a log with no ERROR line (a link failure, a length error) is one entry with no line', () => {
    expect(toyErrors('failed to link\n', 5)).toEqual([{ line: 0, msg: 'failed to link' }])
  })
})

describe('wrapTransition', () => {
  const body = '// Author: someone\nuniform float amount; // = 0.5\nvec4 transition(vec2 uv) {\n  return mix(getFromColor(uv), getToColor(uv), progress * amount);\n}\n'
  const t = wrapTransition(`#version 300 es\n${body}`)

  test('the documented host around the source: from/to, progress/ratio, getFromColor/getToColor, main()', () => {
    expect(t.fs.startsWith(HEAD)).toBe(true)
    expect(count(t.fs, '#version')).toBe(1) // the source's own line is stripped
    for (const u of [
      'uniform sampler2D from, to;', 'uniform float progress, ratio;', 'uniform vec2 uRes;', 'out vec4 outColor;',
      'vec4 getFromColor(vec2 uv) { return texture(from, uv); }', 'vec4 getToColor(vec2 uv) { return texture(to, uv); }',
    ]) expect(count(t.fs, u), u).toBe(1)
    expect(t.fs.indexOf('vec4 getToColor')).toBeLessThan(t.fs.indexOf(body)) // declared before the body uses them
    expect(t.fs.endsWith(`${body}\nvoid main() { outColor = transition(gl_FragCoord.xy / uRes); }\n`)).toBe(true)
    expect(t.inputs).toEqual([{ name: 'amount', type: 'float', default: 0.5, min: 0, max: 1 }])
    expect(t.vs).toBe(wrapToy('').vs)
  })

  test('a #version after leading comments is stripped too, the rest is kept', () => {
    const fs = wrapTransition(`// header\n#version 300 es\n${body}`).fs
    expect(count(fs, '#version')).toBe(1)
    expect(fs).toContain('// header\n')
    expect(fs).toContain(body)
    expect(wrapTransition(body).fs).toContain(`return texture(to, uv); }\n${body}\nvoid main()`) // no #version: verbatim
  })
})
