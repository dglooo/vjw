import type { Sources } from '../bind'
import type { Blend } from '../doc'
import type { FrameInput } from '../frame'
import type { EffectDef, Value } from '../fx/types'

// Frozen contract CP1 (effects): a native generator behind the same inputs/values contract as the shader effects.
// CP2 (td-look, D3): `src` is the previous node's output, the texture an ISF filter reads as `inputImage`, so a native
// can be a filter (`kind: 'filter'`, no inputImage input); a generator gets null. Natives that don't read it ignore it.
export interface Native { draw(f: FrameInput, v: Readonly<Record<string, Value>>, src?: WebGLTexture | null, s?: Readonly<Sources>, blend?: Blend): void; dispose?(): void; hidden?(): boolean } // into the bound FB
// s (milk-sync, 2026-11-16): the sources the scene's bindings read this frame; milk/* feeds its levels from them.
// blend (GPU3D S1-T, lead ruling N3): the layer's; native/model writes straight alpha under normal, premultiplied else.
// hidden?() (plan_camera S1.3, N-1): true = the compositor skips the layer as it skips a muted one (live.ts `ok`): it
// adds nothing under any blend. native/camera without a picture; read per frame, on the layer's generator.
// warm?() (CP2, milkdrop): Start awaits it instead of a throwaway create() (live.ts warm()).
// size (2b S3.2, design S6): the stage it draws for, px; default the drawing buffer. A tile (live.ts tile()) passes its
// own, so the heavy natives shrink to it: the ring, scatter's grid, the point counts. Every other native ignores it.
export interface NativeDef extends EffectDef { create(gl: WebGL2RenderingContext, size?: readonly [number, number]): Native; warm?(): Promise<void> }
