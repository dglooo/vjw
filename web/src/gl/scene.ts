import type { FrameInput } from '../frame'
import type { EffectDef, Value } from '../fx/types'

// Frozen contract CP1 / Variant A. Removed in S2.4 (spectrum, particles and glitch still use them).
export interface Scene { readonly name: string; draw(f: FrameInput): void } // draws into whatever framebuffer is bound
export type SceneFactory = (gl: WebGL2RenderingContext) => Scene

// Frozen contract CP1 (effects): a native generator behind the same inputs/values contract as the shader effects.
export interface Native { draw(f: FrameInput, v: Readonly<Record<string, Value>>): void; dispose?(): void } // into the bound FB
export interface NativeDef extends EffectDef { create(gl: WebGL2RenderingContext): Native }
