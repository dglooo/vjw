// native/particles (matrix_gpu3d.md P-U5). create() on a fake GL; the seed law on the GPU is the browser check
// (`g3-state.mjs seeddist`, P-R5-2).
import { expect, test, vi } from 'vitest'
import { particles } from './particles'

vi.mock('../gl/engine', () => ({ fullscreenProgram: () => () => {}, renderTarget: () => ({}) })) // takes the page's canvas + WebGL at import

/** A fake context, as glstate.test.ts's: every enum is its own name, every other method returns a fresh object. It links
 *  every program with 0 uniforms / attributes / varyings (twgl's checks) and records what bufferData receives. */
function fakeGl() {
  const uploads: unknown[] = []
  const impl: Record<string, (...a: never[]) => unknown> = {
    getProgramParameter: (_: unknown, p: number) => p === 0x8b82, // LINK_STATUS; every count reads 0
    getActiveUniforms: () => [],
    getBufferParameter: () => 0,
    bufferData: (_: unknown, data: unknown) => uploads.push(data),
  }
  const gl = new Proxy({}, { get: (_, k: string) => impl[k] ?? (/^[A-Z0-9_]+$/.test(k) ? k : () => ({})) }) as unknown as WebGL2RenderingContext
  return { gl, uploads }
}

test('P-U5 create() at the default count uploads no data array; the TF buffers get 65536 points by size (C8)', () => {
  const { gl, uploads } = fakeGl()
  particles.create(gl)
  expect(uploads.filter((d) => ArrayBuffer.isView(d) && d.byteLength > 0), 'data arrays uploaded at create').toHaveLength(0)
  expect(uploads).toEqual(Array(4).fill(65536 * 2 * 4)) // pos + vel of the two ping-pong sets, a float vec2 per point
})
