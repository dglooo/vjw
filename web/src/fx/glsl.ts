// VeeJay Wizard, 2026
// GLSL ES 3.00 wrappers (design_effects.md E5, E7), pure: a Shadertoy `mainImage` paste or a gl-transitions
// `transition(uv)` source becomes a full program over the engine's triangle. The prefixes follow the documented hosts:
// https://www.shadertoy.com/howto and https://github.com/gl-transitions/gl-transitions ("GLSL ES 3.00 contract").
import type { Input } from './types'

/** `gl/engine.ts` VS, duplicated so this module stays pure (glsl.test.ts pins the two together). */
export const VS = `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }`
const HEAD = `#version 300 es
precision highp float;
precision highp int;
`
const TOY = `${HEAD}uniform vec3 iResolution;
uniform float iTime;
uniform float iTimeDelta;
uniform int iFrame;
uniform float iFrameRate;
uniform vec4 iMouse;
uniform vec4 iDate;
uniform float iSampleRate;
uniform float iChannelTime[4];
uniform vec3 iChannelResolution[4];
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform sampler2D iChannel2;
uniform sampler2D iChannel3;
out vec4 _o;
`
const TRANSITION = `${HEAD}uniform sampler2D from, to;
uniform float progress, ratio;
uniform vec2 uRes;
out vec4 outColor;
vec4 getFromColor(vec2 uv) { return texture(from, uv); }
vec4 getToColor(vec2 uv) { return texture(to, uv); }
`
// `uniform <type> <name>; // = <default>` on one line; the default is a `vecN(…)` call or a single token.
const PARAM = /^\s*uniform\s+(float|int|bool|vec[234])\s+(\w+)\s*;[ \t]*\/\/[ \t]*=[ \t]*(?:(vec[234])\(([^)\n]*)\)|([^\s;]+))/gm

/**
 * Inputs from comment defaults (the gl-transitions convention): float/int → float/long in [min(0, 2·d), 2·|d| or 1],
 * bool, vec2 → point2D and vec3/vec4 → color from `vecN(a)` or `vecN(a, …)` of plain numbers. Anything else is skipped.
 */
export function commentParams(src: string): Input[] {
  const inputs: Input[] = []
  for (const [, type, name, ctor, args, lit] of src.matchAll(PARAM)) {
    if (type === 'bool') {
      if (lit === 'true' || lit === 'false') inputs.push({ name, type: 'bool', default: lit === 'true' })
    } else if (type === 'float' || type === 'int') {
      const d = Number(lit) // NaN for a non-number or a vecN(…) default
      if (Number.isFinite(d)) inputs.push({ name, type: type === 'int' ? 'long' : 'float', default: d, min: Math.min(0, 2 * d), max: 2 * Math.abs(d) || 1 })
    } else if (ctor === type) {
      const n = Number(type[3])
      const a = args.split(',').map(Number)
      const d = a.length === 1 ? Array<number>(n).fill(a[0]) : a
      if (d.length === n && d.every(Number.isFinite)) inputs.push({ name, type: n === 2 ? 'point2D' : 'color', default: d })
    }
  }
  return inputs
}

/** A Shadertoy `mainImage` paste → an ES 3.00 program. Compile-log line n is paste line n − prefixLines. */
export function wrapToy(code: string) {
  const fs = `${TOY}${code}\nvoid main() { mainImage(_o, gl_FragCoord.xy); _o.a = 1.0; }\n`
  return { vs: VS, fs, inputs: commentParams(code), prefixLines: TOY.split('\n').length - 1 }
}

/** A toy's compile log, its line numbers already in the code (live.ts toyLog), as the shader editor lists it: one entry
 *  per ERROR line; line 0 when it names no line of the code's `lines` (main(), a missing mainImage). A log without an
 *  ERROR line (a link failure, a length error) is one entry, line 0. */
export function toyErrors(log: string, lines: number): { line: number; msg: string }[] {
  const errs = [...log.matchAll(/^\s*ERROR:\s*\d+:(-?\d+):\s*(.*)$/gm)].map(([, n, msg]) => ({ line: +n >= 1 && +n <= lines ? +n : 0, msg }))
  return errs.length ? errs : [{ line: 0, msg: log.trim() }]
}

/** A gl-transitions ES 3.00 source (params + `vec4 transition(vec2 uv)`) → a program over `from`/`to` at `progress`. */
export function wrapTransition(glsl: string) {
  const fs = `${TRANSITION}${glsl.replace(/^[ \t]*#version[^\n]*/m, '')}\nvoid main() { outColor = transition(gl_FragCoord.xy / uRes); }\n`
  return { vs: VS, fs, inputs: commentParams(glsl) }
}
