// VeeJay Wizard, 2026
// The donor `.synScene` adapter (research_donor_visual_system_2.md §1, §4, §5). A file under fx/syn/ is one scene: a
// JSON header comment (its scene.json's TITLE, CREDIT, TAGS, WIDTH, HEIGHT, PASSES, CONTROLS, plus our VJW_FLASH and
// VJW_CLOCK) over its main.glsl (GLSL 330, `vec4 renderMain()` branching on PASSINDEX), adapted to ES 3.00 by hand.
// The def runs on the ISF pass runtime (live.ts): each PASSES TARGET gets a read/write pair, so a pass that samples its
// own TARGET reads last frame's; the screen pass comes last (PASSINDEX = the PASSES count) and writes `syn_FinalPass`
// when the body samples it (the previous output: the donor's whole-frame feedback). Every `syn_*` float the body or a
// clock reads is a float input, SYN_BIND its binding for a new node. The scene's script.js is never run: VJW_CLOCK
// restates its clocks as data, ticked per frame by tick().
import type { Binding } from '../bind'
import { VS } from './glsl'
import { glslName } from './isf'
import PREAMBLE from './syn/preamble.glsl?raw'
import type { Clock, Input, PassDef, ShaderDef } from './types'

interface Control { NAME: string; TYPE: string; DEFAULT?: number | number[]; MIN?: number | number[]; MAX?: number | number[]; DEF_COLOR?: number[] }
interface SynHeader {
  TITLE?: string; CREDIT?: string; TAGS?: string[]; WIDTH?: number; HEIGHT?: number
  PASSES?: { TARGET: string; FLOAT?: boolean; WIDTH?: number; HEIGHT?: number }[]; CONTROLS?: Control[]
  VJW_FLASH?: string[]; VJW_CLOCK?: Record<string, (number | string)[][]>
}

const b = (source: string, attack: number, release: number): Binding => ({ source, amount: 1, attack, release, min: 0, max: 1 })
/** The donor's audio floats → our sources (research §4), DnB first. Presence = the band held over seconds. An own
 *  built-in binds no onset/treb (doc.test.ts), so the any-band hit is the snare and the mid-highs are the hats.
 *  ponytail: Level and Presence ride bass/mid/reese slowed by the binding; subBody/reeseBody/energy when they land. */
export const SYN_BIND: Readonly<Record<string, Binding>> = {
  syn_Level: b('mid', 0.05, 0.3),
  syn_BassLevel: b('bass', 0.05, 0.15),
  syn_Hits: b('snare', 0, 0.2),
  syn_BassHits: b('kick', 0, 0.2),
  syn_HighHits: b('hats', 0, 0.15),
  syn_Presence: b('bass', 1, 2),
  syn_BassPresence: b('bass', 1, 2),
  syn_MidPresence: b('reese', 1, 2),
  syn_MidHighPresence: b('hats', 1, 2),
  syn_OnBeat: b('kick', 0, 0.2),
  // ponytail: a binding is 0..1, so the beat count arrives as the beat's saw (1 on the beat); a raw count if a scene needs the steps
  syn_BeatTime: { ...b('beat', 0, 0), shape: 'saw' },
}
const COMMENTS = /\/\/.*|\/\*[\s\S]*?\*\//g

/** Parses a fx/syn file. Throws a readable Error on a bad header or on what the adapter cannot feed yet. */
export function parseSyn(src: string, id: string): ShaderDef {
  const a = src.indexOf('/*')
  const z = src.indexOf('*/', a + 2)
  if (a < 0 || z < 0) throw new Error(`${id}: no header (a leading /* JSON */ comment)`)
  let h: SynHeader
  try {
    h = JSON.parse(src.slice(a + 2, z))
  } catch (e) {
    throw new Error(`${id}: the header is not valid JSON (${(e as Error).message})`, { cause: e })
  }
  const body = src.slice(z + 2)
  const code = body.replace(COMMENTS, '')

  const controls: Input[] = (h.CONTROLS ?? []).map((c) => {
    const name = glslName(c.NAME, id, 'control NAME')
    const type = String(c.TYPE).split(' ')[0] // 'slider smooth' → slider: the donor's smoothing is not ours
    if (type === 'xy') return { name, type: 'point2D', default: c.DEFAULT, min: c.MIN, max: c.MAX }
    // the panel edits a colour as rgba: the uniform is a vec4 under `<name>_`, the body reads `<name>` = its .rgb
    if (type === 'color') return { name: `${name}_`, label: name, type: 'color', default: [...((c.DEF_COLOR ?? c.DEFAULT) as number[]), 1] }
    if (['slider', 'knob', 'toggle', 'bang'].includes(type)) return { name, type: 'float', default: c.DEFAULT, min: c.MIN ?? 0, max: c.MAX ?? 1 }
    throw new Error(`${id}: control ${name}: TYPE ${JSON.stringify(c.TYPE)} is not supported yet`)
  })
  const syn: Input[] = []
  const bind: Record<string, Binding> = {}
  for (const [name] of [...code.matchAll(/\bsyn_\w+/g), ...JSON.stringify(h.VJW_CLOCK ?? {}).matchAll(/\bsyn_\w+/g)]) {
    if (name === 'syn_MediaType' || name === 'syn_FinalPass' || bind[name]) continue // the preamble's 0; a pass target
    if (!SYN_BIND[name]) throw new Error(`${id}: ${name} has no source (map it in SYN_BIND, fx/syn.ts)`)
    syn.push({ name, type: 'float', default: 0, min: 0, max: 1 })
    bind[name] = SYN_BIND[name]
  }
  const inputs = [...syn, ...controls]
  const flash = h.VJW_FLASH
  if (flash !== undefined && !(Array.isArray(flash) && flash.every((n) => inputs.some((i) => i.name === n))))
    throw new Error(`${id}: VJW_FLASH ${JSON.stringify(flash)} must list declared input names`)

  const ref = (f: string): readonly [string, number] => {
    const [name, c] = f.split('.')
    const i = c === undefined ? -1 : ['x', 'y'].indexOf(c)
    const x = inputs.find((y) => y.name === name)
    if (x?.type !== (c === undefined ? 'float' : 'point2D') || (c !== undefined && i < 0)) throw new Error(`${id}: VJW_CLOCK reads ${f}: not a float input or a point2D's .x/.y`)
    return [name, i]
  }
  const clocks: Clock[] = Object.entries(h.VJW_CLOCK ?? {}).map(([u, terms]) => ({ u: glslName(u, id, 'VJW_CLOCK name'), terms: terms.map((t) => t.map((f) => (typeof f === 'number' ? f : ref(f)))) }))

  // The donor's pass sizes are pixels of its WIDTH × HEIGHT frame: ours scale with the target.
  const W = h.WIDTH ?? 1920
  const H = h.HEIGHT ?? 1080
  const passes: PassDef[] = [
    ...(h.PASSES ?? []).map((p) => ({
      target: glslName(p.TARGET, id, 'pass TARGET'), persistent: false, float: !!p.FLOAT,
      width: p.WIDTH === undefined ? undefined : `$WIDTH*${Number(p.WIDTH)}/${W}`, height: p.HEIGHT === undefined ? undefined : `$HEIGHT*${Number(p.HEIGHT)}/${H}`,
    })),
    { target: /\bsyn_FinalPass\b/.test(code) ? 'syn_FinalPass' : undefined, persistent: false, float: false },
  ]
  const targets = [...new Set(passes.flatMap((p) => (p.target ? [p.target] : [])))]
  const decl = (i: Input) => (i.type === 'color' ? `uniform vec4 ${i.name};\n#define ${i.label} ${i.name}.rgb` : `uniform ${i.type === 'point2D' ? 'vec2' : 'float'} ${i.name};`)
  const fs = [
    '#version 300 es\nprecision highp float;\nprecision highp int;\nuniform float TIME;\nuniform vec2 RENDERSIZE;\nuniform int PASSINDEX;',
    ...inputs.map(decl),
    ...clocks.map((c) => `uniform float ${c.u};`),
    ...targets.map((t) => `uniform sampler2D ${t};\nuniform vec2 _${t}_imgSize;`),
    PREAMBLE,
    body,
    'out vec4 _COLOR_OUT_;',
    'void main() {\n  _xy = gl_FragCoord.xy;\n  _uv = _xy / RENDERSIZE;\n  _uvc = _xy / RENDERSIZE.y - vec2(RENDERSIZE.x / RENDERSIZE.y / 2.0, 0.5);\n  _COLOR_OUT_ = renderMain();\n}\n',
  ].join('\n')
  return { id, name: h.TITLE ?? id.slice(id.lastIndexOf('/') + 1), kind: 'generator', tags: h.TAGS, credit: String(h.CREDIT ?? ''), inputs, bind, flash, glsl: 300, vs: VS, fs, passes, clocks }
}

/** One frame of a def's clocks, pure: `u[c.u]` (0 before the first) += rate · dt, the rate read from `u`. */
export function tick(u: Record<string, unknown>, clocks: readonly Clock[], dt: number) {
  for (const c of clocks) {
    let rate = 0
    for (const t of c.terms) {
      let p = 1
      for (const f of t) p *= typeof f === 'number' ? f : f[1] < 0 ? (u[f[0]] as number) : (u[f[0]] as number[])[f[1]]
      rate += p
    }
    u[c.u] = ((u[c.u] as number | undefined) ?? 0) + rate * dt
  }
}
