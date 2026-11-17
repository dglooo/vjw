import type { Binding, Sources } from '../bind'
import type { Rate } from '../clock'
import type { FrameInput } from '../frame'

// Effect definitions (frozen contract CP1, plan_effects.md): ISF files, natives and later Shadertoy/gl-transitions all
// describe their parameters with the same `inputs`.
export type Category = 'feedback' | 'geometry' | 'liquid' | 'retro'
export type Kind = 'generator' | 'filter' | 'transition'
export type InputType = 'float' | 'long' | 'bool' | 'event' | 'color' | 'point2D' | 'image' | 'audio' | 'audioFFT'
export type Value = number | boolean | readonly number[] // color [r,g,b,a], point2D [x,y]
/** `bindable: false` (GPU3D RG-2): no binding drives it (bind.ts bindable()).
 *  `group`: the panel folds a run of inputs with one group under its name (native/calib: a tile's controls). */
export interface Input { name: string; type: InputType; label?: string; default?: Value; min?: Value; max?: Value; values?: number[]; labels?: string[]; bindable?: false; group?: string }
/** `flash`: the inputs that brighten on a hit, gated by live.ts through flashGate (WCAG 2.3.1); ISF header `VJW_FLASH`.
 *  `tags`: an ISF file's raw CATEGORIES, beside the reduced `category` (the library's tag filter, 2b S3.1). */
export interface EffectDef { id: string; name: string; kind: Kind; category?: Category; tags?: readonly string[]; credit: string; inputs: readonly Input[]; bind?: Readonly<Record<string, Binding>>; flash?: readonly string[] }
/** `filter`/`wrap`: a synScene TARGET's sampling (fx/syn.ts); linear and clamp without. `mipmap`: trilinear, its levels
 *  generated after each draw (live.ts). */
export interface PassDef { target?: string; persistent: boolean; float: boolean; width?: string; height?: string; filter?: 'nearest' | 'mipmap'; wrap?: 'repeat' }
/** A synScene clock (fx/syn.ts): uniform `u` stepped by clock.ts each frame, its rate read from the node's values.
 *  `frame`: one step per frame, not per second (a bang counter: + 1 on its event's draw). */
export interface Clock { u: string; rate: Rate; frame?: true }
/** `unsupported` names what our runtime lacks (custom .vs, IMPORTED, extra images); such files are left out at curation.
 *  A synScene's `clocks` and `raws` (uniforms read from the frame) are set by live.ts before its passes. */
export interface ShaderDef extends EffectDef {
  glsl: 100 | 300; vs: string; fs: string; passes: readonly PassDef[]; unsupported?: string
  clocks?: readonly Clock[]; raws?: readonly (readonly [uniform: string, read: (f: FrameInput, s: Sources) => number])[]
  /** A synScene's samplers besides its TARGETs, bound by live.ts: an IMAGES file's URL (black until it loads), 'audio'
   *  (the toy texture: row 0 FFT, row 1 waveform), 'black' (the media stub) or 'trail' (syn_LevelTrail: the node's own
   *  level history, fx/syn.ts pushTrail). */
  textures?: Readonly<Record<string, 'audio' | 'black' | 'trail' | `/${string}`>>
}
