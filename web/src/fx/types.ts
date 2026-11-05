import type { Binding } from '../bind'

// Effect definitions (frozen contract CP1, plan_effects.md): ISF files, natives and later Shadertoy/gl-transitions all
// describe their parameters with the same `inputs`.
export type Category = 'feedback' | 'geometry' | 'liquid' | 'retro'
export type Kind = 'generator' | 'filter' | 'transition'
export type InputType = 'float' | 'long' | 'bool' | 'event' | 'color' | 'point2D' | 'image' | 'audio' | 'audioFFT'
export type Value = number | boolean | readonly number[] // color [r,g,b,a], point2D [x,y]
export interface Input { name: string; type: InputType; label?: string; default?: Value; min?: Value; max?: Value; values?: number[]; labels?: string[] }
/** `flash`: the inputs that brighten on a hit, gated by live.ts through flashGate (WCAG 2.3.1); ISF header `VJW_FLASH`.
 *  `tags`: an ISF file's raw CATEGORIES, beside the reduced `category` (the library's tag filter, 2b S3.1). */
export interface EffectDef { id: string; name: string; kind: Kind; category?: Category; tags?: readonly string[]; credit: string; inputs: readonly Input[]; bind?: Readonly<Record<string, Binding>>; flash?: readonly string[] }
export interface PassDef { target?: string; persistent: boolean; float: boolean; width?: string; height?: string }
/** `unsupported` names what our runtime lacks (custom .vs, IMPORTED, extra images); such files are left out at curation. */
export interface ShaderDef extends EffectDef { glsl: 100 | 300; vs: string; fs: string; passes: readonly PassDef[]; unsupported?: string }
