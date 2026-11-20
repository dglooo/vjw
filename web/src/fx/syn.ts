// VeeJay Wizard, 2026
// The donor `.synScene` adapter (research_donor_visual_system_2.md §1, §4, §5). A file under fx/syn/ is one scene: a
// JSON header comment (its scene.json's TITLE, CREDIT, TAGS, WIDTH, HEIGHT, PASSES, IMAGES, CONTROLS, plus our
// VJW_FLASH and VJW_CLOCK) over its main.glsl (GLSL 330, `vec4 renderMain()` branching on PASSINDEX), adapted to
// ES 3.00 (hoist() moves the global initializers; int → float literals by hand). The def runs on the ISF pass runtime
// (live.ts): each PASSES TARGET gets a read/write pair, so a pass that samples its own TARGET reads last frame's; the
// screen pass comes last (PASSINDEX = the PASSES count) and writes
// `syn_FinalPass` when the body samples it (the previous output: the donor's whole-frame feedback). Each `syn_*` name
// the body or a clock reads is fed as SYN says. The scene's script.js is never run: VJW_CLOCK restates its clocks as
// data, stepped per frame by clock.ts; a traveler or counter control is a clock too. IMAGES files are served from
// public/syn/<scene>/ (live.ts loads them). What the adapter cannot feed yet is listed in `unsupported` (the catalog
// skips such a file), so a bulk import sees every gap at once.
import { meter } from '../audio/meter'
import { analysis, evaluate, type Binding, type BindState, type Sources } from '../bind'
import { clockStep, type Rate, type Ref, type Values } from '../clock'
import type { FrameInput } from '../frame'
import { VS } from './glsl'
import { glslName } from './isf'
import PREAMBLE from './syn/preamble.glsl?raw'
import type { Clock, Input, PassDef, ShaderDef } from './types'

/** A clock's rate as a file writes it: terms of numbers and input names (`name`, `name.x`, `name.y`). */
type RateSpec = readonly (readonly (number | string)[])[]
/** How one donor name is fed: a binding (a float input the panel shows and the user can rebind), a clock, a value
 *  read from the frame and its sources, a constant, the feedback target, a texture (ShaderDef.textures), or not yet. */
type Syn = Binding | { clock: RateSpec; donor?: RateSpec } | { raw: (f: FrameInput, s: Sources) => number } | { value: number } | { target: true } | { texture: 'audio' | 'black' | 'trail' } | { unsupported: string }

const b = (source: string, attack: number, release: number): Binding => ({ source, amount: 1, attack, release, min: 0, max: 1 })
// A hit: our drum envelope (1 on the hit, e^(−age/τ), features.ts) as sampled at the frame peaks at .78–1 by its phase;
// × 1.35 every hit reaches 1 (a donor `step(0.99, syn_HighHits)` fires on each), and stays a frame-sharp rise.
const hit = (source: string, release: number): Binding => ({ ...b(source, 0, release), amount: 1.35 })
const slow = (source: string) => b(source, 1, 2) // presence: the band held over seconds
const lfo = (shape: 'sine' | 'tri', rate: number): Binding => ({ ...b('beat', 0, 0), shape, rate }) // beat-locked, 0..1, × confidence (bind.ts)
const frac = (x: number) => x - Math.floor(x)
/** A beat step's flip over the beat's first 15 %, smoothstepped (the donor's logistic flip; ⚠️ its length is not on file). */
const flip = (beat: number) => {
  const p = Math.min(1, frac(beat) / 0.15)
  return p * p * (3 - 2 * p)
}
const dice = (n: number) => frac(Math.sin(n * 12.9898) * 43758.5453) // bind.ts's random shape: one value per beat
/** The donor's public names (its editor's keyword list; research §4; dsp_formula_review_2026-11-17 §1 for what each
 *  does) → OUR detector, so a donor scene reacts as our scenes do. An own built-in binds no onset/treb (doc.test.ts).
 *  Hits are our drum detectors: BassHits the kick, Hits / MidHits the snare (the any-band hit), MidHigh / HighHits the
 *  hats; OnBeat (the donor's onset-based beat, BeatComponentHFC/RMS) the kick. Levels and Presence ride the body sources
 *  (P1/P2: .5 = the track's 60 s mean): bass subBody, mid and the overall level reeseBody, the any-band presence energy.
 *  The beat names run on our grid: BeatTime steps per beat (the donor's BeatToIncrement), BPMTwitcher jumps each beat
 *  and settles (BPMComponentTwitcher), Toggle / RandomOnBeat flip on it at full swing (a 0/1 flip has no half state, so
 *  confidence does not scale it: Kanine's grid sits near .45); the BPM LFOs fade with confidence, as ours do.
 *  Intensity is our arrangement: the section level, lifted by the build and held at 1 by the drop pulse.
 *  ⚠️ = semantics guessed from scene use (no donor docs): CurvedTime, the BPM LFOs' range. */
export const SYN: Readonly<Record<string, Syn>> = {
  syn_Level: b('reeseBody', 0.05, 0.3),
  syn_BassLevel: b('subBody', 0.05, 0.15),
  syn_MidLevel: b('reeseBody', 0.05, 0.15),
  syn_MidHighLevel: b('band22', 0.05, 0.15), // ≈ 2.2 kHz (energy.ts: 32 log bands, 30 Hz–16 kHz)
  syn_HighLevel: b('band27', 0.05, 0.15), // ≈ 6 kHz
  syn_Hits: hit('snare', 0.2),
  syn_BassHits: hit('kick', 0.2),
  syn_MidHits: hit('snare', 0.2),
  syn_MidHighHits: hit('hats', 0.15),
  syn_HighHits: hit('hats', 0.15),
  syn_Presence: b('energy', 0, 0),
  syn_BassPresence: slow('subBody'),
  syn_MidPresence: slow('reeseBody'),
  syn_MidHighPresence: slow('hats'),
  syn_HighPresence: slow('hats'),
  // a clock wound by its band's level: silence freezes it; `donor`: its rate in donor mode (plan S2.4: 2 L, 8 L³)
  syn_Time: { clock: [['syn_Level']], donor: [[2, 'syn_Level']] },
  syn_BassTime: { clock: [['syn_BassLevel']], donor: [[2, 'syn_BassLevel']] },
  syn_MidTime: { clock: [['syn_MidLevel']], donor: [[2, 'syn_MidLevel']] },
  syn_MidHighTime: { clock: [['syn_MidHighLevel']], donor: [[2, 'syn_MidHighLevel']] },
  syn_HighTime: { clock: [['syn_HighLevel']], donor: [[2, 'syn_HighLevel']] },
  syn_CurvedTime: { clock: [[0.5], [0.5, 'syn_Level']], donor: [[8, 'syn_Level', 'syn_Level', 'syn_Level']] }, // ⚠️ never stops, faster when loud
  syn_OnBeat: hit('kick', 0.2),
  syn_ToggleOnBeat: { raw: (f) => (Math.floor(f.sync.beat) % 2 ? flip(f.sync.beat) : 1 - flip(f.sync.beat)) }, // 0/1, flips each beat
  syn_RandomOnBeat: { raw: (f) => dice(Math.floor(f.sync.beat) - 1) + (dice(Math.floor(f.sync.beat)) - dice(Math.floor(f.sync.beat) - 1)) * flip(f.sync.beat) }, // a new value per beat
  syn_BeatTime: { raw: (f) => Math.floor(f.sync.beat) }, // + 1 per beat
  syn_BPMTwitcher: { raw: (f) => Math.floor(f.sync.beat) + 1 - Math.exp(-6 * frac(f.sync.beat)) }, // a jump at each beat, eased
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
  syn_Intensity: { raw: (_, s) => Math.max(s.energy ?? 0, s.build ?? 0, s.drop ?? 0) }, // swells through a build, peaks on the drop
  syn_FadeInOut: { raw: () => 1 }, // the donor's fade to black in silence: ours none; a uniform, so donor mode feeds its fade (a library tile stays ours: w 0, lit)
  syn_BassExpoCurve: { raw: (_, s) => (s.subBody ?? 0) ** 2 }, // not public (exoplanet): growth on a sustained bass
  syn_InputLevel: { raw: () => (analysis.off ? 0.5 : 10 ** (meter.db / 20)) }, // not public (audio_indicators): the HUD meter's held peak, linear ⚠️; Off: the idle mid
  syn_PrimeBang: b('syn_PrimeBang', 0, 0), // not public (overload): the donor core's bang on our `fired` (a drop), both modes
  syn_PrimeAndBang: b('build', 0, 0), // not public: our build (the donor core's is our build too)
  syn_MediaType: { value: 0 }, // no media input yet: syn_Media and syn_UserImage are black, the preamble's media helpers stubs
  syn_FinalPass: { target: true },
  // The donor's 1D FFT texture (research §4): .r the raw FFT, .g the FFT, .b a smoothed ("juiced") one, .a the waveform.
  // Ours: the toy texture (row 0 FFT, row 1 waveform) through _synSpectrum below; r = g = b = our one FFT (the analyser
  // runs unsmoothed: ⚠️ no raw/juiced split, no smoothing), a = the waveform. Donor mode: the donor core's own r g b a
  // (parseSyn adds the 'spectrum' texture _synSpectrumDonor; _synSpectrum mixes by w).
  syn_Spectrum: { texture: 'audio' },
  syn_LevelTrail: { texture: 'trail' }, // TRAIL texels of the four levels (r all, g bass, b mid, a high), newest at x = 1
  syn_Media: { texture: 'black' },
  syn_UserImage: { texture: 'black' },
}
/** SYN's bindings, by name: a built-in's `bind` for its scene's bound names. */
export const SYN_BIND: Readonly<Record<string, Binding>> = Object.fromEntries(Object.entries(SYN).filter(([, m]) => 'source' in m)) as Record<string, Binding>
/** A bound input's donor chain (design rev 2, C1; gl/post.ts boundStep): its own binding, the source swapped to its
 *  name (the donor core's value of it), so the scene's override (amount, attack, release, range) shapes the donor
 *  value as it shapes ours. No shape or rate: a donor BPMSin / Tri is shaped already. None for a name SYN does not bind
 *  (a native's `kick` or `bass` is never rewired) or for a clock binding (it keeps its own rate). */
export function donorChain(name: string, b: Binding): Binding | undefined {
  return Object.hasOwn(SYN_BIND, name) && !b.clock ? { ...b, source: name, shape: undefined, rate: undefined } : undefined
}
const COUNTS = ['syn_BeatTime', 'syn_BPMTwitcher', 'syn_BPM']
/** A SYN raw at its read point (live.ts): ours crossfaded by `w` to the donor core's value of `name` in `s`. A count
 *  never slides: the donor's from `w` .5. Ours as it is at `w` 0, for a name SYN does not feed, or with no donor value. */
export function synValue(name: string, ours: number, s: Sources, w: number): number {
  const d = s[name]
  if (!(w > 0) || typeof d !== 'number' || !Object.hasOwn(SYN, name)) return ours
  return COUNTS.includes(name) ? (w >= 0.5 ? d : ours) : ours + (d - ours) * w
}
/** A clock one frame on (live.ts): the `1 − w` share of `dt` at its own rate, the `w` share at its donor rate (finding
 *  C9: clockStep is linear in dt, so the speed blends with no jump at any `w` and the position is kept). With no donor
 *  rate, or at `w` 0, today's one clockStep. */
export function synClock(y: number, c: Clock, v: Values, dt: number, w: number): number {
  return c.donor && w > 0 ? clockStep(clockStep(y, c.rate, v, dt * (1 - w)), c.donor, v, dt * w) : clockStep(y, c.rate, v, dt)
}

/** syn_LevelTrail's length in frames (⚠️ the donor's is not on file: 256 ≈ 4 s at 60 fps). */
export const TRAIL = 256
const LEVELS = ['syn_Level', 'syn_BassLevel', 'syn_MidLevel', 'syn_HighLevel']
const TRAILED = LEVELS.map((n) => SYN_BIND[n])
const DONOR_TRAILED = LEVELS.map((n) => donorChain(n, SYN_BIND[n])!)
/** syn_LevelTrail one frame on (live.ts, per node): the RGBA8 texels shift one left, and the four levels as SYN's
 *  bindings evaluate them now land in the last. While `w` > 0 each crossfades to its donor chain (`states` 4–7). */
export function pushTrail(bytes: Uint8Array, states: BindState[], s: Sources, dt: number, w = 0) {
  bytes.copyWithin(0, 4)
  for (let c = 0; c < 4; c++) {
    let y = evaluate(TRAILED[c], s, states[c], dt)
    if (w > 0) y += (evaluate(DONOR_TRAILED[c], s, states[4 + c], dt) - y) * w
    bytes[bytes.length - 4 + c] = 255 * y
  }
}

interface Control { NAME: string; TYPE?: string; DEFAULT?: number | number[]; MIN?: number | number[]; MAX?: number | number[]; DEF_COLOR?: number[]; LABELS?: string[]; PARAMS?: number }
interface Pass { TARGET: string; FLOAT?: boolean; WIDTH?: number; HEIGHT?: number; FILTER?: string; WRAP?: string; DOUBLE_BUFFER?: boolean; TYPE?: string }
interface SynHeader {
  TITLE?: string; CREDIT?: string; TAGS?: string[]; WIDTH?: number; HEIGHT?: number; PASSES?: Pass[]; IMAGES?: { NAME: string; PATH: string }[]; CONTROLS?: Control[]
  VJW_FLASH?: string[]; VJW_CLOCK?: Record<string, RateSpec>
  HARD_TRANSITIONS?: { UNIFORM: string; VALUES: number[] }[]; SMOOTH_TRANSITIONS?: { UNIFORMS: string[] }[]
}
const COMMENTS = /\/\/.*|\/\*[\s\S]*?\*\//g
/** An xy control's DEFAULT / MIN / MAX: the donor often writes one number for both. */
const pair = (x: number | number[] | undefined) => (typeof x === 'number' ? [x, x] : x)
// syn_Spectrum is a sampler1D in GLSL 330 (texture(s, x), textureLod(s, x, lod)): ES 3.00 has none, so the calls read
// the toy texture's two rows (SYN) through _synSpectrum (its one level: lod is ignored), crossfaded by the donor mix
// (_synMix = w, live.ts) to the donor core's rgba (_synSpectrumDonor, app.ts uploads it while the mix is above 0).
const SPECTRUM = `uniform sampler2D syn_Spectrum;
uniform sampler2D _synSpectrumDonor; uniform float _synMix;
vec4 _synSpectrum(float x) { float f = texture(syn_Spectrum, vec2(x, 0.25)).r; return mix(vec4(f, f, f, texture(syn_Spectrum, vec2(x, 0.75)).r), texture(_synSpectrumDonor, vec2(x, 0.5)), _synMix); }
vec4 _synSpectrum(float x, float lod) { return _synSpectrum(x); }
vec4 _synSpectrum(float x, int lod) { return _synSpectrum(x); }`
const LEVEL_TRAIL = `uniform sampler2D syn_LevelTrail;
vec4 _synLevelTrail(float x) { return texture(syn_LevelTrail, vec2(x, 0.5)); }`
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
    .replace(/^[ \t]*#line\b.*$/gm, '') // keeps the compile log's line numbers the fs's
    .replace(/\bFRAMECOUNT(\s*(?:[=!<>]=|[<>])\s*)(\d+)(?![\d.])/g, 'FRAMECOUNT$1$2.0') // ours is a float
  const why: string[] = []
  const defines: string[] = []

  const controls: Input[] = []
  const moving: Clock[] = [] // the travelers' and counters' clocks
  for (const c of h.CONTROLS ?? []) {
    const name = glslName(c.NAME, id, 'control NAME')
    const [type, mode] = String(c.TYPE ?? 'slider').split(' ') // 'slider smooth' → slider: the donor's smoothing is not ours
    // The body reads a counter's count and a traveler's position; the panel's input (`<name>_`) is its bang or speed.
    if (mode === 'counter') {
      // +1 on each trigger (the panel's button, or a bound source's rise: an event is true for one draw, live.ts)
      controls.push({ name: `${name}_`, label: name, type: 'event' })
      moving.push({ u: name, rate: [[[`${name}_`, -1]]], frame: true })
    } else if (mode === 'traveler' || mode === 'speed') {
      // ⚠️ a traveler's PARAMS read as the step per frame at the donor's 60 fps, a speed slider's value as its rate per
      // second (no donor docs); a VJW_CLOCK of the name replaces it
      const k = mode === 'speed' ? 1 : 60 * (c.PARAMS ?? 1)
      const xy = type === 'xy'
      controls.push(xy ? { name: `${name}_`, label: name, type: 'point2D', default: pair(c.DEFAULT), min: pair(c.MIN), max: pair(c.MAX) } : { name: `${name}_`, label: name, type: 'float', default: c.DEFAULT, min: c.MIN ?? 0, max: c.MAX ?? 1 })
      if (!xy) moving.push({ u: name, rate: [[k, [`${name}_`, -1]]] })
      else {
        moving.push({ u: `${name}_x`, rate: [[k, [`${name}_`, 0]]] }, { u: `${name}_y`, rate: [[k, [`${name}_`, 1]]] })
        defines.push(`#define ${name} vec2(${name}_x, ${name}_y)`)
      }
    } else if (type === 'xy') controls.push({ name, type: 'point2D', default: pair(c.DEFAULT), min: pair(c.MIN), max: pair(c.MAX) })
    // the panel edits a colour as rgba: the uniform is a vec4 under `<name>_`, the body reads `<name>` = its .rgb
    else if (type === 'color') {
      const rgb = c.DEF_COLOR ?? c.DEFAULT
      controls.push({ name: `${name}_`, label: name, type: 'color', default: [...(Array.isArray(rgb) ? rgb.slice(0, 3) : [0, 0, 0]), 1] }) // none: black
    }
    else if (type === 'dropdown') controls.push({ name, type: 'float', default: c.DEFAULT, min: 0, max: Math.max(1, (c.LABELS?.length ?? 2) - 1), label: c.LABELS ? `${name} (${c.LABELS.join(' / ')})` : name })
    else if (['slider', 'knob', 'toggle', 'bang'].includes(type)) {
      // a bang rests at MIN (shrouded's shimmer: 1, its hit −10); a toggle sits at MIN or MAX, so a DEFAULT between them
      // is its state (0: MIN, else MAX; stained_glass's reverse −1/1 at DEFAULT 0 stopped a clock)
      const [lo, hi] = [c.MIN ?? 0, c.MAX ?? 1]
      const def = type === 'bang' ? lo : type === 'toggle' && c.DEFAULT !== lo && c.DEFAULT !== hi ? (c.DEFAULT ? hi : lo) : c.DEFAULT
      controls.push({ name, type: 'float', default: def, min: lo, max: hi })
    }
    else why.push(`control ${name}: TYPE ${c.TYPE}`)
  }
  // The donor re-rolls these on a musical transition (HARD: one of VALUES; SMOOTH: a one-hot group, crossfaded). Here
  // static controls at the first value / the group's first one on, unless the porter declared one.
  // ponytail: no re-roll; a bar-event clock if a scene needs the variation.
  const has = (n: string) => controls.some((x) => x.name === n || x.label === n) // a renamed one (colour, traveler) by its label
  for (const t of h.HARD_TRANSITIONS ?? [])
    if (!has(t.UNIFORM)) controls.push({ name: glslName(t.UNIFORM, id, 'HARD_TRANSITIONS UNIFORM'), type: 'float', default: t.VALUES[0], min: Math.min(...t.VALUES), max: Math.max(...t.VALUES) })
  for (const g of h.SMOOTH_TRANSITIONS ?? [])
    g.UNIFORMS.forEach((u, i) => has(u) || controls.push({ name: glslName(u, id, 'SMOOTH_TRANSITIONS UNIFORM'), type: 'float', default: i ? 0 : 1, min: 0, max: 1 }))

  // Every syn_* name the body, a scene clock or a SYN clock reads (the Set grows while it is walked).
  const names = new Set([...code.matchAll(/\bsyn_\w+/g), ...JSON.stringify(h.VJW_CLOCK ?? {}).matchAll(/\bsyn_\w+/g)].map((m) => m[0]))
  const syn: Input[] = []
  const bind: Record<string, Binding> = {}
  const textures: Record<string, NonNullable<ShaderDef['textures']>[string]> = {}
  for (const x of h.IMAGES ?? []) textures[glslName(x.NAME, id, 'IMAGES NAME')] = `/${id}/${String(x.PATH).replace(/^\.\//, '')}` as const // public/syn/<scene>/<PATH>
  const raws: [string, (f: FrameInput, s: Sources) => number][] = []
  const synClocks: [string, RateSpec, RateSpec?][] = []
  let feedback = false
  for (const n of names) {
    const m = SYN[n]
    if (!m) why.push(`${n} (not a public donor name)`)
    else if ('source' in m) {
      syn.push({ name: n, type: 'float', default: 0, min: 0, max: 1 })
      bind[n] = m
    } else if ('clock' in m) {
      synClocks.push([n, m.clock, m.donor])
      for (const t of [...m.clock, ...(m.donor ?? [])]) for (const f of t) if (typeof f === 'string') names.add(f)
    } else if ('raw' in m) raws.push([n, m.raw])
    else if ('value' in m) defines.push(`#define ${n} ${m.value.toFixed(1)}`)
    else if ('target' in m) feedback = true
    else if ('texture' in m) {
      textures[n] = m.texture
      if (n === 'syn_Spectrum') textures._synSpectrumDonor = 'spectrum' // its donor half (SPECTRUM declares it)
    } else why.push(m.unsupported)
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
  const own = h.VJW_CLOCK ?? {}
  const clocks: Clock[] = [
    ...[...synClocks, ...Object.entries(own)].map(([u, r, d]) => ({ u: glslName(u, id, 'VJW_CLOCK name'), rate: rate(r), ...(d && { donor: rate(d) }) })),
    ...moving.filter((c) => !Object.hasOwn(own, c.u)),
  ]

  // The donor's pass sizes are pixels of its WIDTH × HEIGHT frame: ours scale with the target, except a data grid (a side
  // under 8 px: glitch's 2 × 1, neuron_proximitors' 5 × 512, swarm's 100 × 2), kept in exact pixels; 0 = the frame's.
  // ponytail: fluid_body's 7 × 4 pyramid level is caught too (exact at any res); a per-pass flag if a grid ever exceeds it.
  const W = h.WIDTH ?? 1920
  const H = h.HEIGHT ?? 1080
  const passes: PassDef[] = (h.PASSES ?? []).map((p) => {
    const target = glslName(p.TARGET, id, 'pass TARGET')
    const grid = !!p.WIDTH && !!p.HEIGHT && Math.min(p.WIDTH, p.HEIGHT) < 8
    const size = (n: number | undefined, v: string, of: number) => (!n ? undefined : grid ? String(Number(n)) : `$${v}*${Number(n)}/${of}`)
    if (p.TYPE !== undefined && p.TYPE !== 'float') why.push(`pass ${target}: TYPE ${p.TYPE}`)
    if (p.FILTER !== undefined && !['linear', 'nearest', 'mipmap'].includes(p.FILTER)) why.push(`pass ${target}: FILTER ${p.FILTER}`)
    if (p.WRAP !== undefined && p.WRAP !== 'clamp' && p.WRAP !== 'repeat') why.push(`pass ${target}: WRAP ${p.WRAP}`)
    return {
      // DOUBLE_BUFFER: every TARGET is a read/write pair here. WRAP: repeat unless clamp (⚠️ the donor's default is not on
      // file: hills_eels writes none and needs repeat; 13 donor passes write repeat, 3 clamp). FLOAT: HDR unless false
      // (the donor's default: lattix, swarm, hue_review and deeper go flat in 8-bit; 85 passes write true, 10 false)
      target, persistent: false, float: p.TYPE === 'float' || p.FLOAT !== false, // TYPE float: our HDR (half float) too
      width: size(p.WIDTH, 'WIDTH', W), height: size(p.HEIGHT, 'HEIGHT', H),
      ...((p.FILTER === 'nearest' || p.FILTER === 'mipmap') && { filter: p.FILTER }), ...(p.WRAP !== 'clamp' && { wrap: 'repeat' as const }),
    }
  })
  passes.push({ target: feedback ? 'syn_FinalPass' : undefined, persistent: false, float: false })
  const targets = [...new Set(passes.flatMap((p) => (p.target ? [p.target] : [])))]
  const decl = (i: Input) => (i.type === 'color' ? `uniform vec4 ${i.name};\n#define ${i.label} ${i.name}.rgb` : `uniform ${i.type === 'point2D' ? 'vec2' : 'float'} ${i.name};`)
  const { body: hoisted, init } = hoist(code.replace(/\btexture(?:Lod)?\s*\(\s*syn_(Spectrum|LevelTrail)\s*,\s*/g, '_syn$1(')) // 1D in GLSL 330
  const fs = [
    '#version 300 es\nprecision highp float;\nprecision highp int;\nuniform float TIME;\nuniform vec2 RENDERSIZE;\nuniform int PASSINDEX;\nuniform int FRAMEINDEX;\n#define FRAMECOUNT float(FRAMEINDEX)',
    ...inputs.map(decl),
    ...[...clocks.map((c) => c.u), ...raws.map(([n]) => n)].map((n) => `uniform float ${n};`),
    ...defines,
    ...targets.map((t) => `uniform sampler2D ${t};\nuniform vec2 _${t}_imgSize;`),
    ...Object.keys(textures).filter((t) => t !== '_synSpectrumDonor').map((t) => (t === 'syn_Spectrum' ? SPECTRUM : t === 'syn_LevelTrail' ? LEVEL_TRAIL : `uniform sampler2D ${t};`)),
    PREAMBLE,
    hoisted,
    `void _synInit() {${init.map((x) => `\n  ${x}`).join('')}\n}`,
    'out vec4 _COLOR_OUT_;',
    // the screen pass is opaque: the layer composite multiplies by alpha, where a donor scene may return 0 or data
    `void main() {\n  _xy = gl_FragCoord.xy;\n  _uv = _xy / RENDERSIZE;\n  _uvc = _xy / RENDERSIZE.y - vec2(RENDERSIZE.x / RENDERSIZE.y / 2.0, 0.5);\n  _synInit();\n  _COLOR_OUT_ = renderMain();\n  if (PASSINDEX == ${passes.length - 1}) _COLOR_OUT_.a = 1.0;\n}\n`,
  ].join('\n')
  return {
    id, name: h.TITLE ?? id.slice(id.lastIndexOf('/') + 1), kind: 'generator', tags: h.TAGS, credit: String(h.CREDIT ?? ''), inputs, bind, flash,
    glsl: 300, vs: VS, fs, passes, clocks, raws, textures, unsupported: why.length ? why.join('; ') : undefined,
  }
}
