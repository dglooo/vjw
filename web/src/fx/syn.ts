// VeeJay Wizard, 2026
// The donor `.synScene` adapter (research_donor_visual_system_2.md §1, §4, §5). A file under fx/syn/ is one scene: a
// JSON header comment (its scene.json's TITLE, CREDIT, TAGS, WIDTH, HEIGHT, PASSES, IMAGES, CONTROLS, plus our
// VJW_FLASH and VJW_CLOCK) over its main.glsl (GLSL 330, `vec4 renderMain()` branching on PASSINDEX), adapted to
// ES 3.00 (hoist() moves the global initializers; int → float literals by hand). The def runs on the ISF pass runtime
// (live.ts): each PASSES TARGET gets a read/write pair, so a pass that samples its own TARGET reads last frame's; the
// screen pass comes last (PASSINDEX = the PASSES count) and writes
// `syn_FinalPass` when the body samples it (the previous output: the donor's whole-frame feedback). Each `syn_*` name
// the body or a clock reads is fed as SYN says. The scene's script.js is never run: VJW_CLOCK restates its clocks as
// data, stepped per frame by clock.ts. What the adapter cannot feed yet is listed in `unsupported` (the catalog skips
// such a file), so a bulk import sees every gap at once.
import type { Binding } from '../bind'
import type { Rate, Ref } from '../clock'
import type { FrameInput } from '../frame'
import { VS } from './glsl'
import { glslName } from './isf'
import PREAMBLE from './syn/preamble.glsl?raw'
import type { Clock, Input, PassDef, ShaderDef } from './types'

/** A clock's rate as a file writes it: terms of numbers and input names (`name`, `name.x`, `name.y`). */
type RateSpec = readonly (readonly (number | string)[])[]
/** How one donor name is fed: a binding (a float input the panel shows and the user can rebind), a clock, a value
 *  read from the frame, a constant, the feedback target, or not yet (the reason). */
type Syn = Binding | { clock: RateSpec } | { raw: (f: FrameInput) => number } | { value: number } | { target: true } | { unsupported: string }

const b = (source: string, attack: number, release: number): Binding => ({ source, amount: 1, attack, release, min: 0, max: 1 })
const slow = (source: string) => b(source, 1, 2) // presence: the band held over seconds
const lfo = (shape: 'sine' | 'tri' | 'square' | 'random', rate: number): Binding => ({ ...b('beat', 0, 0), shape, rate }) // beat-locked, 0..1, × confidence (bind.ts)
/** The donor's 44 public names (its editor's keyword list; research §4) → ours, DnB first. An own built-in binds no
 *  onset/treb (doc.test.ts): the any-band hit is the snare, the highs are a band or the hats.
 *  ponytail: Level/Presence ride bass/mid/reese slowed by the binding; the subBody/reeseBody/energy sources when they
 *  land. ⚠️ = semantics guessed from scene use (no donor docs): CurvedTime, BPMTwitcher, the BPM LFOs' range, Intensity. */
export const SYN: Readonly<Record<string, Syn>> = {
  syn_Level: b('mid', 0.05, 0.3),
  syn_BassLevel: b('bass', 0.05, 0.15),
  syn_MidLevel: b('mid', 0.05, 0.15),
  syn_MidHighLevel: b('band22', 0.05, 0.15), // ≈ 2.2 kHz (energy.ts: 32 log bands, 30 Hz–16 kHz)
  syn_HighLevel: b('band27', 0.05, 0.15), // ≈ 6 kHz
  syn_Hits: b('snare', 0, 0.2),
  syn_BassHits: b('kick', 0, 0.2),
  syn_MidHits: b('snare', 0, 0.2),
  syn_MidHighHits: b('hats', 0, 0.15),
  syn_HighHits: b('hats', 0, 0.15),
  syn_Presence: slow('bass'),
  syn_BassPresence: slow('bass'),
  syn_MidPresence: slow('reese'),
  syn_MidHighPresence: slow('hats'),
  syn_HighPresence: slow('hats'),
  syn_Time: { clock: [['syn_Level']] }, // a clock wound by its band's level: silence freezes it
  syn_BassTime: { clock: [['syn_BassLevel']] },
  syn_MidTime: { clock: [['syn_MidLevel']] },
  syn_MidHighTime: { clock: [['syn_MidHighLevel']] },
  syn_HighTime: { clock: [['syn_HighLevel']] },
  syn_CurvedTime: { clock: [[0.5], [0.5, 'syn_Level']] }, // ⚠️ never stops, faster when loud
  syn_OnBeat: b('kick', 0, 0.2),
  syn_ToggleOnBeat: lfo('square', 0.5), // 0/1, flips each beat
  syn_RandomOnBeat: lfo('random', 1), // a new value per beat
  syn_BeatTime: { raw: (f) => f.sync.beat }, // the beat count
  syn_BPMTwitcher: { raw: (f) => f.sync.beat }, // ⚠️ jumps per beat: scenes floor/fract the count
  syn_BPM: { raw: (f) => f.sync.bpm }, // 0 = no tempo yet
  syn_BPMConfidence: b('confidence', 0.5, 0.5),
  syn_BPMSin: lfo('sine', 1), // ⚠️ the period in beats is the suffix; 0..1 here
  syn_BPMSin2: lfo('sine', 1 / 2),
  syn_BPMSin4: lfo('sine', 1 / 4),
  syn_BPMSin8: lfo('sine', 1 / 8),
  syn_BPMTri: lfo('tri', 1),
  syn_BPMTri2: lfo('tri', 1 / 2),
  syn_BPMTri4: lfo('tri', 1 / 4),
  syn_BPMTri8: lfo('tri', 1 / 8),
  syn_Intensity: b('build', 0.5, 1), // ⚠️ the donor's OSC energy macro; the build is ours
  syn_FadeInOut: { value: 1 }, // the donor's fade to black in silence: none here
  syn_MediaType: { value: 0 }, // no media input yet: the preamble's media helpers are stubs
  syn_FinalPass: { target: true },
  syn_Spectrum: { unsupported: 'syn_Spectrum (the donor FFT texture, 4 channels: map to audioTex)' },
  syn_LevelTrail: { unsupported: 'syn_LevelTrail (a band-level history texture)' },
  syn_Media: { unsupported: 'syn_Media (a media input)' },
  syn_UserImage: { unsupported: 'syn_UserImage (a media input)' },
}
/** SYN's bindings, by name: a built-in's `bind` for its scene's bound names. */
export const SYN_BIND: Readonly<Record<string, Binding>> = Object.fromEntries(Object.entries(SYN).filter(([, m]) => 'source' in m)) as Record<string, Binding>

interface Control { NAME: string; TYPE?: string; DEFAULT?: number | number[]; MIN?: number | number[]; MAX?: number | number[]; DEF_COLOR?: number[]; LABELS?: string[] }
interface Pass { TARGET: string; FLOAT?: boolean; WIDTH?: number; HEIGHT?: number; FILTER?: string; WRAP?: string; DOUBLE_BUFFER?: boolean; TYPE?: string }
interface SynHeader {
  TITLE?: string; CREDIT?: string; TAGS?: string[]; WIDTH?: number; HEIGHT?: number; PASSES?: Pass[]; IMAGES?: unknown[]; CONTROLS?: Control[]
  VJW_FLASH?: string[]; VJW_CLOCK?: Record<string, RateSpec>
}
const COMMENTS = /\/\/.*|\/\*[\s\S]*?\*\//g
const DECL = /^(\s*)((?:(?:highp|mediump|lowp)\s+)?(?:float|int|uint|bool|[biu]?vec[234]|mat[234](?:x[234])?)(?:\s*\[\s*\d*\s*\])?)\s+([^;]*);\s*$/

/** `s` split at its top-level commas (none inside () or []). */
function commas(s: string): string[] {
  const out = ['']
  let d = 0
  for (const ch of s) {
    if (ch === '(' || ch === '[') d++
    else if (ch === ')' || ch === ']') d--
    if (ch === ',' && d === 0) out.push('')
    else out[out.length - 1] += ch
  }
  return out
}
/** GLSL 330 (the donor's) lets a global's initializer read uniforms and globals; ES 3.00 wants it constant. Each
 *  non-const global initializer of `code` (comment-free) moves into `init`, in order, for main() to run first. A
 *  statement inside #if…#endif or interrupted by a directive is left as written. */
export function hoist(code: string): { body: string; init: string[] } {
  let body = ''
  let stmt = ''
  let depth = 0
  let pp = 0
  const init: string[] = []
  const decl = (s: string) => {
    const m = DECL.exec(s)
    if (!m || /^\s*const\b/.test(s) || m[3].split('=')[0].includes('(')) return s // a const, a prototype, not a declaration
    const names = commas(m[3]).map((p) => {
      const eq = p.indexOf('=')
      if (eq < 0) return p.trim()
      init.push(`${p.slice(0, eq).replace(/\[.*$/, '').trim()} = ${p.slice(eq + 1).trim()};`)
      return p.slice(0, eq).trim()
    })
    return `${m[1]}${m[2]} ${names.join(', ')};`
  }
  for (const line of code.split('\n')) {
    if (line.trim().startsWith('#')) {
      if (/^\s*#\s*if/.test(line)) pp++
      else if (/^\s*#\s*endif/.test(line)) pp--
      body += `${stmt}${line}\n`
      stmt = ''
      continue
    }
    for (const ch of `${line}\n`) {
      if (depth > 0 || pp > 0) {
        body += ch
        depth += ch === '{' ? 1 : ch === '}' ? -1 : 0
      } else if (ch === '{') {
        body += `${stmt}{` // a function body starts: the pending text was its signature
        stmt = ''
        depth = 1
      } else if (ch === ';') {
        body += decl(`${stmt};`)
        stmt = ''
      } else stmt += ch
    }
  }
  return { body: body + stmt, init }
}

/** Parses a fx/syn file. Throws a readable Error on a malformed header (a porter's slip); a feature the adapter cannot
 *  feed yet goes to `unsupported`, every one of them. */
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
  // the donor compares PASSINDEX as int and as float (`== 1.0`); ours is an int
  const code = src.slice(z + 2).replace(COMMENTS, '').replace(/\bPASSINDEX(\s*(?:[=!<>]=|[<>])\s*)(\d+)\.0*(?![\d.])/g, 'PASSINDEX$1$2')
  const why: string[] = []

  const controls: Input[] = []
  for (const c of h.CONTROLS ?? []) {
    const name = glslName(c.NAME, id, 'control NAME')
    const [type, mode] = String(c.TYPE ?? 'slider').split(' ') // 'slider smooth' → slider: the donor's smoothing is not ours
    if (mode === 'traveler' || mode === 'counter') why.push(`control ${name}: TYPE ${c.TYPE} (it moves or counts by itself)`)
    else if (type === 'xy') controls.push({ name, type: 'point2D', default: c.DEFAULT, min: c.MIN, max: c.MAX })
    // the panel edits a colour as rgba: the uniform is a vec4 under `<name>_`, the body reads `<name>` = its .rgb
    else if (type === 'color') controls.push({ name: `${name}_`, label: name, type: 'color', default: [...((c.DEF_COLOR ?? c.DEFAULT) as number[]), 1] })
    else if (type === 'dropdown') controls.push({ name, type: 'float', default: c.DEFAULT, min: 0, max: Math.max(1, (c.LABELS?.length ?? 2) - 1), label: c.LABELS ? `${name} (${c.LABELS.join(' / ')})` : name })
    else if (['slider', 'knob', 'toggle', 'bang'].includes(type)) controls.push({ name, type: 'float', default: c.DEFAULT, min: c.MIN ?? 0, max: c.MAX ?? 1 })
    else why.push(`control ${name}: TYPE ${c.TYPE}`)
  }

  // Every syn_* name the body, a scene clock or a SYN clock reads (the Set grows while it is walked).
  const names = new Set([...code.matchAll(/\bsyn_\w+/g), ...JSON.stringify(h.VJW_CLOCK ?? {}).matchAll(/\bsyn_\w+/g)].map((m) => m[0]))
  const syn: Input[] = []
  const bind: Record<string, Binding> = {}
  const defines: string[] = []
  const raws: [string, (f: FrameInput) => number][] = []
  const synClocks: [string, RateSpec][] = []
  let feedback = false
  for (const n of names) {
    const m = SYN[n]
    if (!m) why.push(`${n} (not a public donor name)`)
    else if ('source' in m) {
      syn.push({ name: n, type: 'float', default: 0, min: 0, max: 1 })
      bind[n] = m
    } else if ('clock' in m) {
      synClocks.push([n, m.clock])
      for (const t of m.clock) for (const f of t) if (typeof f === 'string') names.add(f)
    } else if ('raw' in m) raws.push([n, m.raw])
    else if ('value' in m) defines.push(`#define ${n} ${m.value.toFixed(1)}`)
    else if ('target' in m) feedback = true
    else why.push(m.unsupported)
  }
  const inputs = [...syn, ...controls]
  const flash = h.VJW_FLASH
  if (flash !== undefined && !(Array.isArray(flash) && flash.every((n) => inputs.some((i) => i.name === n))))
    throw new Error(`${id}: VJW_FLASH ${JSON.stringify(flash)} must list declared input names`)

  const ref = (f: string): Ref => {
    const [name, c] = f.split('.')
    const i = c === undefined ? -1 : ['x', 'y'].indexOf(c)
    const x = inputs.find((y) => y.name === name)
    if (x?.type !== (c === undefined ? 'float' : 'point2D') || (c !== undefined && i < 0)) throw new Error(`${id}: VJW_CLOCK reads ${f}: not a float input or a point2D's .x/.y`)
    return [name, i]
  }
  const rate = (r: RateSpec): Rate => r.map((t) => t.map((f) => (typeof f === 'number' ? f : ref(f))))
  // SYN clocks first: a scene clock may read one (it reads the value before this frame's step).
  const clocks: Clock[] = [...synClocks, ...Object.entries(h.VJW_CLOCK ?? {})].map(([u, r]) => ({ u: glslName(u, id, 'VJW_CLOCK name'), rate: rate(r) }))

  if (h.IMAGES?.length) why.push(`IMAGES (${h.IMAGES.length}: copy images/ to public/ and load them as textures)`)
  // The donor's pass sizes are pixels of its WIDTH × HEIGHT frame: ours scale with the target.
  const W = h.WIDTH ?? 1920
  const H = h.HEIGHT ?? 1080
  const passes: PassDef[] = (h.PASSES ?? []).map((p) => {
    const target = glslName(p.TARGET, id, 'pass TARGET')
    if (p.TYPE !== undefined) why.push(`pass ${target}: TYPE ${p.TYPE}`)
    if (p.FILTER !== undefined && p.FILTER !== 'linear' && p.FILTER !== 'nearest') why.push(`pass ${target}: FILTER ${p.FILTER}`)
    if (p.WRAP !== undefined && p.WRAP !== 'clamp' && p.WRAP !== 'repeat') why.push(`pass ${target}: WRAP ${p.WRAP}`)
    return {
      target, persistent: false, float: !!p.FLOAT, // DOUBLE_BUFFER: every TARGET is a read/write pair here
      width: p.WIDTH === undefined ? undefined : `$WIDTH*${Number(p.WIDTH)}/${W}`, height: p.HEIGHT === undefined ? undefined : `$HEIGHT*${Number(p.HEIGHT)}/${H}`,
      ...(p.FILTER === 'nearest' && { filter: 'nearest' as const }), ...(p.WRAP === 'repeat' && { wrap: 'repeat' as const }),
    }
  })
  passes.push({ target: feedback ? 'syn_FinalPass' : undefined, persistent: false, float: false })
  const targets = [...new Set(passes.flatMap((p) => (p.target ? [p.target] : [])))]
  const decl = (i: Input) => (i.type === 'color' ? `uniform vec4 ${i.name};\n#define ${i.label} ${i.name}.rgb` : `uniform ${i.type === 'point2D' ? 'vec2' : 'float'} ${i.name};`)
  const { body: hoisted, init } = hoist(code)
  const fs = [
    '#version 300 es\nprecision highp float;\nprecision highp int;\nuniform float TIME;\nuniform vec2 RENDERSIZE;\nuniform int PASSINDEX;\nuniform int FRAMEINDEX;\n#define FRAMECOUNT float(FRAMEINDEX)',
    ...inputs.map(decl),
    ...[...clocks.map((c) => c.u), ...raws.map(([n]) => n)].map((n) => `uniform float ${n};`),
    ...defines,
    ...targets.map((t) => `uniform sampler2D ${t};\nuniform vec2 _${t}_imgSize;`),
    PREAMBLE,
    hoisted,
    `void _synInit() {${init.map((x) => `\n  ${x}`).join('')}\n}`,
    'out vec4 _COLOR_OUT_;',
    'void main() {\n  _xy = gl_FragCoord.xy;\n  _uv = _xy / RENDERSIZE;\n  _uvc = _xy / RENDERSIZE.y - vec2(RENDERSIZE.x / RENDERSIZE.y / 2.0, 0.5);\n  _synInit();\n  _COLOR_OUT_ = renderMain();\n}\n',
  ].join('\n')
  return {
    id, name: h.TITLE ?? id.slice(id.lastIndexOf('/') + 1), kind: 'generator', tags: h.TAGS, credit: String(h.CREDIT ?? ''), inputs, bind, flash,
    glsl: 300, vs: VS, fs, passes, clocks, raws, unsupported: why.length ? why.join('; ') : undefined,
  }
}
