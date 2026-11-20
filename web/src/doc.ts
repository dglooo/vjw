// The scene format (design E4), pure: what the library stores and `live` renders. `parseScene`/`parseLibrary` are the
// trust boundary for imported JSON: they check shapes and numbers, clamp ranges, drop unknown keys and return fresh
// objects. `values` holds only overrides of the effect's defaults.
import { PHASES, type Binding, type Shape } from './bind'
import type { EffectDef, Input, InputType, Value } from './fx/types'

export type SceneId = string // 'builtin:<slug>' | crypto.randomUUID()
export type Blend = 'normal' | 'add' | 'screen' | 'multiply' | 'max' | 'difference' | 'dodge'
export type MaskMode = 'person' | 'background' // camera CP1: cut out the person, or keep the background
export type Clip = 'inside' | 'outside' // the show composition: inside or outside the scene's frame (scenes/frame.ts)
export interface NodeDoc { ref: string; code?: string; credit?: string; values?: Record<string, Value>; bind?: Record<string, Binding> }
export interface LayerDoc { gen: NodeDoc; fx: NodeDoc[]; blend: Blend; opacity: number; speed: number; res: number; mask?: MaskMode; clip?: Clip; bind?: Partial<Record<'opacity' | 'speed', Binding>> }
// layers: 1..4, bottom first; created: ms since 1970, a user scene's (its place in the autopilot after the built-ins)
export interface SceneDoc { v: 1; id: SceneId; name: string; star: boolean; created?: number; layers: LayerDoc[] }
export interface LibraryFile { v: 1; scenes: SceneDoc[] }

export const CODE_MAX = 65536 // knob: chars of inline shader code per node
export const TEXT_MAX = 200 // knob: chars of a text input's value (native/text)
const LAYERS_MAX = 4
const BLENDS: readonly string[] = ['normal', 'add', 'screen', 'multiply', 'max', 'difference', 'dodge'] satisfies Blend[]
const MASKS: readonly string[] = ['person', 'background'] satisfies MaskMode[]
const CLIPS: readonly string[] = ['inside', 'outside'] satisfies Clip[]
const SHAPES: readonly string[] = ['sine', 'tri', 'saw', 'square', 'random'] satisfies Shape[]

type Obj = Record<string, unknown>
function fail(at: string, what: string): never {
  throw new Error(`${at}: ${what}`)
}
function obj(x: unknown, at: string): Obj {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) fail(at, 'not an object')
  return x as Obj
}
function num(x: unknown, at: string): number {
  if (typeof x !== 'number' || !Number.isFinite(x)) fail(at, 'not a finite number')
  return x
}
function str(x: unknown, at: string): string {
  if (typeof x !== 'string' || !x) fail(at, 'not a non-empty string')
  return x
}
function oneOf(x: unknown, list: readonly string[], at: string): string {
  if (typeof x !== 'string' || !list.includes(x)) fail(at, `not one of ${list.join(', ')}`)
  return x
}
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
const map = <T>(x: unknown, at: string, f: (v: unknown, at: string) => T): Record<string, T> =>
  Object.fromEntries(Object.entries(obj(x, at)).map(([k, v]) => [k, f(v, `${at}.${k}`)]))

function binding(x: unknown, at: string): Binding {
  const o = obj(x, at)
  const n = (k: string) => num(o[k], `${at}.${k}`)
  const b: Binding = { source: str(o.source, `${at}.source`), amount: n('amount'), attack: n('attack'), release: n('release'), min: n('min'), max: n('max') }
  if (o.shape !== undefined) b.shape = oneOf(o.shape, SHAPES, `${at}.shape`) as Shape
  if (o.rate !== undefined) b.rate = n('rate')
  // A clock in the panel's ranges (≤ 3 ranges per s at a full source, the WCAG cap); none on a count, which would run away.
  if (o.clock !== undefined && !PHASES.includes(b.source)) {
    const c = obj(o.clock, `${at}.clock`)
    b.clock = { base: clamp(num(c.base, `${at}.clock.base`), -1, 1), k: clamp(num(c.k, `${at}.clock.k`), -2, 2), wrap: c.wrap === true }
  }
  return b
}

function value(x: unknown, at: string): Value {
  if (typeof x === 'boolean') return x
  if (typeof x === 'string') return x.length <= TEXT_MAX ? x : fail(at, `not a string of at most ${TEXT_MAX} chars`)
  return Array.isArray(x) ? x.map((v, i) => num(v, `${at}[${i}]`)) : num(x, at)
}

function node(x: unknown, at: string): NodeDoc {
  const o = obj(x, at)
  const n: NodeDoc = { ref: str(o.ref, `${at}.ref`) }
  if (o.code !== undefined) {
    if (typeof o.code !== 'string' || o.code.length > CODE_MAX) fail(`${at}.code`, `not a string of at most ${CODE_MAX} chars`)
    n.code = o.code
  }
  if (o.credit !== undefined) {
    if (typeof o.credit !== 'string') fail(`${at}.credit`, 'not a string')
    n.credit = o.credit
  }
  if (o.values !== undefined) n.values = map(o.values, `${at}.values`, value)
  if (o.bind !== undefined) n.bind = map(o.bind, `${at}.bind`, binding)
  return n
}

function layer(x: unknown, at: string): LayerDoc {
  const o = obj(x, at)
  if (!Array.isArray(o.fx)) fail(`${at}.fx`, 'not an array')
  const l: LayerDoc = {
    gen: node(o.gen, `${at}.gen`),
    fx: o.fx.map((n, i) => node(n, `${at}.fx[${i}]`)),
    blend: oneOf(o.blend, BLENDS, `${at}.blend`) as Blend,
    opacity: clamp(num(o.opacity, `${at}.opacity`), 0, 1),
    speed: clamp(num(o.speed, `${at}.speed`), 0, 4),
    res: clamp(num(o.res, `${at}.res`), 0.25, 1),
  }
  if (o.mask !== undefined) l.mask = oneOf(o.mask, MASKS, `${at}.mask`) as MaskMode
  if (o.clip !== undefined) l.clip = oneOf(o.clip, CLIPS, `${at}.clip`) as Clip
  if (o.bind !== undefined) {
    const b = obj(o.bind, `${at}.bind`)
    l.bind = {}
    for (const k of ['opacity', 'speed'] as const) if (b[k] !== undefined) l.bind[k] = binding(b[k], `${at}.bind.${k}`)
  }
  return l
}

/** A checked, fresh copy of one scene. Throws `<field path>: <problem>`. */
export function parseScene(x: unknown): SceneDoc {
  const o = obj(x, 'scene')
  if (o.v !== 1) fail('v', `unsupported scene version ${JSON.stringify(o.v)}`)
  if (typeof o.star !== 'boolean') fail('star', 'not a boolean')
  if (!Array.isArray(o.layers) || o.layers.length < 1 || o.layers.length > LAYERS_MAX) fail('layers', `not an array of 1..${LAYERS_MAX} layers`)
  const d: SceneDoc = { v: 1, id: str(o.id, 'id'), name: str(o.name, 'name'), star: o.star, layers: o.layers.map((l, i) => layer(l, `layers[${i}]`)) }
  if (o.created !== undefined) d.created = num(o.created, 'created')
  return d
}

/** A `LibraryFile` or a single scene. */
export function parseLibrary(x: unknown): SceneDoc[] {
  const o = obj(x, 'library')
  if (!('scenes' in o)) return [parseScene(o)]
  if (o.v !== 1) fail('v', `unsupported library version ${JSON.stringify(o.v)}`)
  if (!Array.isArray(o.scenes)) fail('scenes', 'not an array')
  return o.scenes.map((s) => parseScene(s))
}

const FALLBACK: Partial<Record<InputType, (i: Input) => Value>> = {
  float: (i) => i.default ?? i.min ?? 0,
  long: (i) => i.default ?? i.values?.[0] ?? 0,
  bool: (i) => i.default ?? false,
  event: () => false,
  color: (i) => i.default ?? [0, 0, 0, 1],
  point2D: (i) => i.default ?? [0, 0],
  text: (i) => i.default ?? '',
}

/** Every value-bearing input's default; images and audio have none. Arrays are the def's own: copy before writing. */
export function defaults(def: EffectDef): Record<string, Value> {
  const out: Record<string, Value> = {}
  for (const i of def.inputs) {
    const f = FALLBACK[i.type]
    if (f) out[i.name] = f(i)
  }
  return out
}
