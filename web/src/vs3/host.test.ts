// vs3/host.ts's two pieces of logic: the donor `s` from our sources and the screen redirect. No GL: the engine is mocked.
import { expect, test, vi } from 'vitest'
import { screen, signal, specHi, type Signal } from './host'

vi.mock('../gl/engine', () => ({ fullscreenProgram: () => () => {}, gl: {} })) // takes the page's canvas + WebGL at import

test('signal: levels from the donor-mode bands, kick = hit, onKick on its rise × kickAccent, onMid = onHigh on the rise of mid', () => {
  const src = { syn_BassLevel: 0.6, syn_MidLevel: 0.5, syn_MidHighLevel: 0.4, syn_HighLevel: 0.3, syn_Level: 0.7, kickAccent: 0.8 }
  const s = signal(src, 1, 0.1, {} as Signal)
  expect(s).toEqual({ kick: 1, onKick: 0.8, onMid: 0, onHigh: 0, sub: 0.6, mids: 0.5, highs: 0.4, air: 0.3, energy: 0.7 })
  expect(signal(src, 0.9, 1, s).onKick).toBe(0) // a falling hit: no impulse
  expect(signal(src, 0.12, 0.1, s).onKick).toBe(0) // a rise under shatter's RISE (.05): no impulse
  expect(signal({}, 1, 0, s)).toEqual({ kick: 1, onKick: 1, onMid: 0, onHigh: 0, sub: 0, mids: 0, highs: 0, air: 0, energy: 0 }) // no kickAccent: hit; no levels: 0; no mid: no impulse
  expect(signal({}, 0, 0, s, 0.9, 0)).toMatchObject({ onKick: 0, onMid: 0.9, onHigh: 0.9 }) // the rise of mid: both, at its value
  expect(signal({}, 0, 0, s, 0.8, 0.9)).toMatchObject({ onMid: 0, onHigh: 0 }) // a falling mid: no impulse
})

test('specHi: our 32 bands stretched over the 192 donor bins, ends kept', () => {
  const src = Object.fromEntries(Array.from({ length: 32 }, (_, i) => [`band${i}`, i / 31]))
  const out = specHi(src, new Float32Array(192))
  expect([out[0], out[191]]).toEqual([0, 1])
  expect(out[96]).toBeCloseTo(96 / 191, 5) // a ramp stays a ramp
  expect(specHi({}, out).every((v) => v === 0)).toBe(true) // no bands: zeros, never NaN
})

test('screen: null and undefined mean the layer RT, the buffer size is its size, both restored after', () => {
  const calls: unknown[] = []
  const set = vi.fn((t: unknown) => calls.push(t))
  const size = vi.fn()
  const R = { setRenderTarget: set, getDrawingBufferSize: size }
  const rt = { width: 640, height: 360 }, sim = { width: 8, height: 8 }, made = new Set<unknown>()
  const v = { x: 0, y: 0, set(x: number, y: number) { return Object.assign(this, { x, y }) } }
  const r = screen(R, rt, made, () => {
    R.setRenderTarget(sim)
    R.setRenderTarget(null)
    R.setRenderTarget(undefined)
    R.getDrawingBufferSize(v)
    return 7
  })
  expect(r).toBe(7)
  expect(calls).toEqual([sim, rt, rt])
  expect([v.x, v.y]).toEqual([640, 360])
  expect([...made]).toEqual([sim, rt])
  expect([R.setRenderTarget, R.getDrawingBufferSize]).toEqual([set, size])
  expect(() => screen(R, rt, made, () => { throw new Error('x') })).toThrow('x') // restored on a throw too
  expect(R.setRenderTarget).toBe(set)
})
