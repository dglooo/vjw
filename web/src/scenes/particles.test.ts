// native/particles (matrix_gpu3d.md P-U1..P-U6). create() and draw() on a fake GL; the seed law on the GPU is the browser
// check (`g3-state.mjs seeddist`, P-R5-2), the growth copy too (`g3-state.mjs grow`, P-B1, P-B3).
import { beforeAll, expect, test, vi } from 'vitest'
import { ZERO_SYNC } from '../audio/sync'
import { defaults } from '../doc'
import type { FrameInput } from '../frame'
import type { Value } from '../fx/types'
import { BUILTIN } from './builtin'
import { grownCapacity, particleCount, particles, shouldSplat, SPLAT_MIN } from './particles'

vi.mock('../gl/engine', () => ({ fullscreenProgram: () => () => {}, renderTarget: () => ({ fit: () => {}, attachments: [{}] }) })) // takes the page's canvas + WebGL at import

/** A fake context, as glstate.test.ts's: every enum is its own name, every other method returns a fresh object. It links
 *  every program with 0 uniforms / attributes / varyings (twgl's checks), records what bufferData receives and the count
 *  of each drawArrays. */
function fakeGl() {
  const uploads: unknown[] = []
  const draws: number[] = []
  const impl: Record<string, (...a: never[]) => unknown> = {
    getProgramParameter: (_: unknown, p: number) => p === 0x8b82, // LINK_STATUS; every count reads 0
    getActiveUniforms: () => [],
    getBufferParameter: () => 0,
    bufferData: (_: unknown, data: unknown) => uploads.push(data),
    drawArrays: (_: unknown, __: unknown, count: number) => draws.push(count),
  }
  const gl = new Proxy({}, { get: (_, k: string) => impl[k] ?? (/^[A-Z0-9_]+$/.test(k) ? k : () => ({})) }) as unknown as WebGL2RenderingContext
  return { gl, uploads, draws }
}

const F = { onsets: [], width: 1728, height: 1118, dt: 1 / 60, time: 0, energy: { att: { bass: 1 } }, sync: ZERO_SYNC } as unknown as FrameInput

/** The splat path's device ask (S2.3): a draw at >= SPLAT_MIN asks once per module, and in Node (no WebGPU) the device
 *  resolves null after the dynamic import and splatDevice() settle. */
async function settled(p: typeof particles) {
  p.create(fakeGl().gl).draw(F, { ...defaults(p), count: SPLAT_MIN })
  await vi.dynamicImportSettled()
  await new Promise((ok) => setTimeout(ok, 0))
}
beforeAll(() => settled(particles)) // so every row below sees the TF rules of S1.4 (S2.3 item 3)

/** The drawArrays counts of one frame: create() (a tile when `size` is given), then one draw() with these values. */
function drawn(values: Record<string, Value>, size?: readonly [number, number]) {
  const { gl, draws } = fakeGl()
  particles.create(gl, size).draw(F, { ...defaults(particles), ...values })
  return draws
}

test('P-U1 after the growth task, drawArrays draws count at res 1, res 0.5 and governor scale 0.6: 65536 and 1048576 (N1)', () => {
  vi.useFakeTimers()
  try {
    for (const count of [65536, 1048576])
      for (const [width, height] of [[1728, 1118], [864, 559], [1037, 671]]) { // the layer target at res 1, res .5, scale .6
        const { gl, draws } = fakeGl()
        const p = particles.create(gl)
        const at = () => p.draw({ ...F, width, height }, { ...defaults(particles), count })
        at()
        vi.runAllTimers() // the growth task, when the count asked for one
        at()
        expect(draws.at(-1), `count ${count} at ${width}×${height}`).toBe(count)
      }
  } finally {
    vi.useRealTimers()
  }
})

test('P-U2 a tile draws min(count, 4096): 4096 for count 1048576, 1000 for count 1000 (N1)', () => {
  expect(particleCount(1048576, true)).toBe(4096)
  expect(drawn({ count: 1048576 }, [256, 144])).toEqual([4096])
  expect(drawn({ count: 1000 }, [256, 144])).toEqual([1000])
})

test('P-U3 the count rule: 2000000 -> 1048576, -5 -> 0, 1.5 -> 2 (round half up), NaN -> 65536', () => {
  expect([2000000, -5, 1.5, NaN].map((c) => particleCount(c, false))).toEqual([1048576, 0, 2, 65536])
})

test('P-U4 builtin:particles draws its default count 65536, unbound; the inputs gain count and keep burst, swirl, size, glow (R5)', () => {
  const gen = BUILTIN.find((d) => d.id === 'builtin:particles')!.layers[0].gen
  const v = { ...defaults(particles), ...gen.values }
  expect(v.count).toBe(65536)
  expect(gen.bind?.count, 'a binding would move the drawn count').toBeUndefined()
  expect(drawn(v)).toEqual([65536])
  expect(particles.inputs.map((i) => i.name)).toEqual(expect.arrayContaining(['count', 'burst', 'swirl', 'size', 'glow']))
})

test('P-U5 create() at the default count uploads no data array; the TF buffers get 65536 points by size (C8)', () => {
  const { gl, uploads } = fakeGl()
  particles.create(gl)
  expect(uploads.filter((d) => ArrayBuffer.isView(d) && d.byteLength > 0), 'data arrays uploaded at create').toHaveLength(0)
  expect(uploads).toEqual(Array(4).fill(65536 * 2 * 4)) // pos + vel of the two ping-pong sets, a float vec2 per point
})

test('P-U6 grownCapacity: n 1000000 -> 1048576, then n 65536 keeps 1048576; powers of two; one growth task (C8)', () => {
  expect(grownCapacity(65536, 1000000)).toBe(1048576)
  expect(grownCapacity(1048576, 65536), 'never shrinks').toBe(1048576)
  expect([0, 65536, 65537, 131072, 131073].map((n) => grownCapacity(65536, n))).toEqual([65536, 65536, 131072, 131072, 262144])
  const grown = (uploads: unknown[]) => uploads.filter((b) => b === 1048576 * 2 * 4) // a buffer by size at 1048576 points
  vi.useFakeTimers()
  try {
    const { gl, uploads, draws } = fakeGl()
    const p = particles.create(gl)
    const at = (count: number) => p.draw(F, { ...defaults(particles), count })
    at(1000000)
    at(1000000) // a second frame before the task runs: still one task (at most one pending per instance)
    expect(vi.getTimerCount()).toBe(1)
    vi.runAllTimers()
    at(65536)
    expect(vi.getTimerCount(), 'no growth after it').toBe(0)
    expect(grown(uploads), 'one growth: pos + vel of the two ping-pong sets').toHaveLength(4)
    expect(draws).toEqual([65536, 65536, 65536]) // the capacity until the task ran, then the count

    const q = particles.create(gl)
    q.draw(F, { ...defaults(particles), count: 1048576 })
    q.dispose!()
    vi.runAllTimers()
    expect(grown(uploads), 'a growth pending at dispose() does nothing').toHaveLength(4)
  } finally {
    vi.useRealTimers()
  }
})

test('S2.3 shouldSplat(n, ready): the splat path from SPLAT_MIN = 262144 with a ready device; else TF, and a tile always TF', () => {
  const cases: [number, boolean][] = [[SPLAT_MIN, true], [SPLAT_MIN - 1, true], [1048576, false], [particleCount(1048576, true), true]]
  expect(SPLAT_MIN).toBe(262144)
  expect(cases.map(([n, ready]) => shouldSplat(n, ready))).toEqual([true, false, false, false])
})

test('S2.3 while the device is pending, TF draws its capacity with no growth task; once it resolves null, the S1.4 growth applies', async () => {
  vi.resetModules()
  const { particles: fresh } = await import('./particles') // its device not asked yet
  const { gl, draws } = fakeGl()
  const p = fresh.create(gl)
  const at = () => p.draw(F, { ...defaults(fresh), count: 1048576 })
  vi.useFakeTimers()
  at() // asks; pending
  expect(vi.getTimerCount(), 'no growth task while pending').toBe(0)
  vi.useRealTimers()
  await settled(fresh) // null: no WebGPU in Node
  vi.useFakeTimers()
  try {
    at()
    expect(vi.getTimerCount(), 'one growth task').toBe(1)
    vi.runAllTimers()
    at()
    expect(draws).toEqual([65536, 65536, 1048576])
  } finally {
    vi.useRealTimers()
  }
})
