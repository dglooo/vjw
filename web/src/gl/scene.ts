import type { FrameInput } from '../frame'

// Frozen contract CP1 / Variant A.
export interface Scene { readonly name: string; draw(f: FrameInput): void } // draws into whatever framebuffer is bound
export type SceneFactory = (gl: WebGL2RenderingContext) => Scene
