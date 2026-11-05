// ISF loader: header parse, kind by convention, uniform and prefix generation (GLSL ES 1.00, as the official JS
// runtime emits it), ported from interactive-shader-format-js src/ISFParser.js.
// Source: https://github.com/msfeldstein/interactive-shader-format-js
//
// MIT License
//
// Copyright (c) 2025 Michael Feldstein
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
//
// Changes (VeeJay Wizard, 2026): pure functions over our types; audio/audioFFT inputs are samplers too; the IMG_* calls
// are preprocessor macros, with IMG_PIXEL dividing by the image's own size (ISF spec) rather than RENDERSIZE; plain
// JSON.parse for the header (all 327 ISF-Files headers parse); our VJW_BIND and VJW_FLASH keys; `unsupported`;
// a whitelist evaluator for PASSES WIDTH/HEIGHT; passes repeating a TARGET share its sampler and pair (pairsByTarget).
import type { Binding } from '../bind'
import type { Category, Input, InputType, Kind, PassDef, ShaderDef, Value } from './types'

interface IsfInput { NAME: string; TYPE: InputType; LABEL?: string; DEFAULT?: Value; MIN?: Value; MAX?: Value; VALUES?: number[]; LABELS?: string[] }
interface IsfPass { TARGET?: string; PERSISTENT?: boolean; FLOAT?: boolean; WIDTH?: string | number; HEIGHT?: string | number }
interface IsfHeader { CREDIT?: string; CATEGORIES?: string[]; INPUTS?: IsfInput[]; PASSES?: IsfPass[]; IMPORTED?: Record<string, unknown>; VJW_BIND?: Record<string, Binding>; VJW_FLASH?: string[] }

const UNIFORM: Record<InputType, string> = {
  float: 'float', long: 'int', bool: 'bool', event: 'bool', color: 'vec4', point2D: 'vec2',
  image: 'sampler2D', audio: 'sampler2D', audioFFT: 'sampler2D',
}
const OURS: readonly string[] = ['feedback', 'geometry', 'liquid', 'retro'] satisfies Category[]
const KEYWORDS: [RegExp, Category][] = [
  [/kaleid|mirror|feedback|tile/, 'feedback'],
  [/3d|geometry|shape/, 'geometry'],
  [/liquid|fluid|water|metal/, 'liquid'],
  [/vhs|crt|retro|glitch|pixel|scanline|strobe/, 'retro'],
]

/** ES 1.00 vertex shader over the engine's shared triangle (attribute `position`, clip space). */
export const ISF_VS = `precision highp float;
attribute vec2 position;
varying vec2 isf_FragNormCoord;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
  isf_FragNormCoord = position * 0.5 + 0.5;
}
`
// IMG_PIXEL's size argument and IMG_SIZE are filled in per image name by parseIsf (ES 1.00 has no ## pasting).
const PREFIX = `precision highp float;
precision highp int;
uniform float TIME;
uniform float TIMEDELTA;
uniform vec2 RENDERSIZE;
uniform int PASSINDEX;
uniform int FRAMEINDEX;
uniform vec4 DATE;
varying vec2 isf_FragNormCoord;
#define IMG_PIXEL(img, size, coord) texture2D(img, (coord) / (size))
#define IMG_NORM_PIXEL(img, coord) texture2D(img, coord)
#define IMG_THIS_PIXEL(img) texture2D(img, isf_FragNormCoord)
#define IMG_THIS_NORM_PIXEL(img) texture2D(img, isf_FragNormCoord)
`

/** A GLSL identifier, or a readable throw: names go straight into the generated source. */
function glslName(x: unknown, id: string, what: string): string {
  if (typeof x !== 'string' || !/^[A-Za-z_]\w*$/.test(x)) throw new Error(`${id}: ${what} ${JSON.stringify(x)} is not a GLSL name`)
  return x
}

function categoryOf(categories: unknown[]): Category | undefined {
  const cats = categories.map((c) => String(c).toLowerCase())
  const exact = cats.find((c) => OURS.includes(c))
  if (exact) return exact as Category
  for (const c of cats) for (const [re, cat] of KEYWORDS) if (re.test(c)) return cat
}

/** Parses an ISF fragment file (its JSON header is the first comment). Throws a readable Error on a bad header. */
export function parseIsf(src: string, id: string): ShaderDef {
  const a = src.indexOf('/*')
  const b = src.indexOf('*/', a + 2)
  if (a < 0 || b < 0) throw new Error(`${id}: no ISF header (a leading /* JSON */ comment)`)
  let h: IsfHeader
  try {
    h = JSON.parse(src.slice(a + 2, b))
  } catch (e) {
    throw new Error(`${id}: the ISF header is not valid JSON (${(e as Error).message})`, { cause: e })
  }
  if (typeof h !== 'object' || h === null || Array.isArray(h)) throw new Error(`${id}: the ISF header is not a JSON object`)

  const inputs: Input[] = (h.INPUTS ?? []).map((i) => {
    const name = glslName(i?.NAME, id, 'input NAME')
    if (!Object.hasOwn(UNIFORM, i.TYPE)) throw new Error(`${id}: input ${name} has unknown TYPE ${JSON.stringify(i.TYPE)}`)
    return { name, type: i.TYPE, label: i.LABEL, default: i.DEFAULT, min: i.MIN, max: i.MAX, values: i.VALUES, labels: i.LABELS }
  })
  const flash = h.VJW_FLASH
  if (flash !== undefined && !(Array.isArray(flash) && flash.every((n) => inputs.some((i) => i.name === n))))
    throw new Error(`${id}: VJW_FLASH ${JSON.stringify(flash)} must list declared input names`)
  const has = (name: string, type: InputType) => inputs.some((i) => i.name === name && i.type === type)
  const kind: Kind = has('inputImage', 'image')
    ? 'filter'
    : has('startImage', 'image') && has('endImage', 'image') && has('progress', 'float') ? 'transition' : 'generator'
  const size = (x: string | number | undefined) => (x === undefined ? undefined : String(x))
  const passes: PassDef[] = (h.PASSES?.length ? h.PASSES : [{}]).map((p) => ({
    target: p.TARGET === undefined ? undefined : glslName(p.TARGET, id, 'pass TARGET'),
    persistent: !!p.PERSISTENT,
    float: !!p.FLOAT,
    width: size(p.WIDTH),
    height: size(p.HEIGHT),
  }))
  const imported = Object.keys(h.IMPORTED ?? {}).map((k) => glslName(k, id, 'IMPORTED name'))

  // Every image the body may sample gets a sampler and its size: image/audio inputs, pass targets, imports.
  const samplers = [
    ...inputs.filter((i) => UNIFORM[i.type] === 'sampler2D').map((i) => i.name),
    ...new Set(passes.flatMap((p) => (p.target ? [p.target] : []))), // passes may repeat a TARGET: one name
    ...imported,
  ]
  const decls = [
    ...inputs.filter((i) => UNIFORM[i.type] !== 'sampler2D').map((i) => `uniform ${UNIFORM[i.type]} ${i.name};`),
    ...samplers.map((n) => `uniform sampler2D ${n};\nuniform vec2 _${n}_imgSize;`),
  ]
  const body = src
    .slice(b + 2)
    .replace(/\bIMG_SIZE\s*\(\s*(\w+)\s*\)/g, '_$1_imgSize')
    .replace(/\bIMG_PIXEL\s*\(\s*(\w+)\s*,/g, 'IMG_PIXEL($1, _$1_imgSize,')

  const own = kind === 'filter' ? ['inputImage'] : kind === 'transition' ? ['startImage', 'endImage'] : []
  const extra = inputs.find((i) => i.type === 'image' && !own.includes(i.name))
  // ponytail: a custom .vs is seen by the varyings it feeds (36 of the 38 in ISF-Files); the 2 that only move vertices
  // need the sibling-.vs check at curation (S2.2 sweep).
  const unsupported = imported.length
    ? 'IMPORTED images'
    : extra ? `extra image input ${extra.name}` : /^\s*varying\s/m.test(body) ? 'custom vertex shader' : undefined

  return {
    id, name: id.slice(id.lastIndexOf('/') + 1), kind, category: categoryOf(h.CATEGORIES ?? []), credit: String(h.CREDIT ?? ''),
    inputs, bind: h.VJW_BIND, flash, glsl: 100, vs: ISF_VS, fs: `${PREFIX}${decls.join('\n')}\n${body}`, passes, unsupported,
  }
}

/** Pass i → the index of the first pass naming the same TARGET, whose read/write pair it shares (live.ts node()); −1
 *  for a pass without a TARGET. */
export const pairsByTarget = (passes: readonly { target?: string }[]): number[] =>
  passes.map((p) => (p.target ? passes.findIndex((q) => q.target === p.target) : -1))

const TOKENS = /\$\w+|floor|ceil|round|min|max|abs|sqrt|pow|[\d.\s+\-*/(),]/g

/**
 * A PASSES WIDTH/HEIGHT expression: `$WIDTH`, `$HEIGHT` and `$<input>` come from `vars`. Imported JSON is a trust
 * boundary: anything but numbers, + - * / ( ) . , and the Math names above throws before evaluation.
 */
export function sizeExpr(expr: string, vars: Record<string, number>): number {
  if (expr.replace(TOKENS, '') !== '') throw new Error(`size expression not allowed: ${expr}`)
  const js = expr.replace(/\$(\w+)|[a-z]+/g, (m, k?: string) => {
    if (!k) return `Math.${m}`
    if (!Object.hasOwn(vars, k)) throw new Error(`size expression ${expr}: unknown $${k}`)
    return `(${vars[k]})`
  })
  // ponytail: Function() on the whitelisted string; a tiny parser if a CSP ever forbids eval (Electron).
  const v: unknown = Function(`"use strict"; return (${js})`)()
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`size expression ${expr}: not a finite number`)
  return v
}
