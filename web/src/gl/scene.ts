import type { FrameInput } from '../frame'
import type { EffectDef, Value } from '../fx/types'

// Frozen contract CP1 (effects): a native generator behind the same inputs/values contract as the shader effects.
// CP2 (td-look, D3): `src` is the previous node's output, the texture an ISF filter reads as `inputImage`, so a native
// can be a filter (`kind: 'filter'`, no inputImage input); a generator gets null. Natives that don't read it ignore it.
export interface Native { draw(f: FrameInput, v: Readonly<Record<string, Value>>, src?: WebGLTexture | null): void; dispose?(): void } // into the bound FB
// warm?() (CP2, milkdrop): Start awaits it instead of a throwaway create() (live.ts warm()).
export interface NativeDef extends EffectDef { create(gl: WebGL2RenderingContext): Native; warm?(): Promise<void> }
