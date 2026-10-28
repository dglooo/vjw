import type { FrameInput } from '../frame'
import type { EffectDef, Value } from '../fx/types'

// Frozen contract CP1 (effects): a native generator behind the same inputs/values contract as the shader effects.
export interface Native { draw(f: FrameInput, v: Readonly<Record<string, Value>>): void; dispose?(): void } // into the bound FB
export interface NativeDef extends EffectDef { create(gl: WebGL2RenderingContext): Native }
