// native/video (backlog 8): the fit maths (cover = xf.ts coverFit, contain's bars, zoom, x/y), the jump's target, the
// jump on a rise of its flash-gated binding (live.ts's read point: boundStep, then level), the inputs and the built-in.
// The GL, the <video> and the limiter are the browser check's.
import { expect, test, vi } from 'vitest'
import { bindable, level, type Binding, type Sources } from '../bind'
import { coverFit } from '../camera/xf'
import { boundStep } from '../gl/post'
import { BUILTIN } from './builtin'
import { fitXf, jumpTime, video } from './video'

vi.mock('../gl/engine', () => ({ fullscreenProgram: () => () => {} })) // takes the page's canvas + WebGL at import

const close = (a: readonly number[], b: readonly number[]) => a.forEach((x, i) => expect(x).toBeCloseTo(b[i], 9))
/** The event `jump` per frame as live.ts reads a bound one: boundStep (the flash gate last), then level's rising edge.
 *  Returns the frame times it fired at. */
function jumps(b: Binding, frames: number, src: (t: number) => Sources) {
  const x = { b, state: { y: 0 }, flash: { prev: 0, blocked: false } }
  const onsets: number[] = []
  const at: number[] = []
  let held = false
  for (let i = 0; i < frames; i++) {
    const t = i / 60
    const [on, h] = level('event', boundStep(x, src(t), 0, onsets, 1 / 60, t), held)
    held = h
    if (on) at.push(t)
  }
  return at
}

test('fitXf: cover, centred, zoom 1 is xf.ts coverFit (unmirrored) at any aspect', () => {
  for (const [sw, sh, cw, ch] of [[1920, 1080, 640, 360], [1728, 1117, 1280, 720], [1080, 1920, 1920, 1080], [800, 800, 640, 480]])
    close(fitXf(sw, sh, cw, ch, false, 0.5, 0.5, 1), coverFit(sw, sh, cw, ch, false))
})

test('fitXf: contain shows the whole clip (bars outside [0,1]); zoom scales about the centre; x, y place the centre', () => {
  const [ax, ay, ox, oy] = fitXf(1600, 900, 640, 480, true, 0.5, 0.5, 1) // 4:3 on 16:9: the full height, bars beside
  const u = (s: number) => s * ax + ox
  expect(ay).toBeCloseTo(1)
  expect(oy).toBeCloseTo(0)
  expect(u(0.5)).toBeCloseTo(0.5)
  expect(u(0.5 - 600 / 1600)).toBeCloseTo(0) // the clip is 900 · 4/3 = 1200 px wide on the stage
  expect(u(0.5 + 600 / 1600)).toBeCloseTo(1)
  expect(u(0)).toBeLessThan(0) // a bar: transparent
  const z = fitXf(1600, 900, 640, 480, true, 0.5, 0.5, 2)
  close(z.slice(0, 2), [ax / 2, ay / 2]) // twice as big
  expect(0.5 * z[0] + z[2]).toBeCloseTo(0.5) // about the same centre
  const p = fitXf(1600, 900, 640, 480, false, 0.25, 0.75, 1) // centre at x .25, y .75 (0 the bottom): stage uv (.25, .25), y down
  expect(0.25 * p[0] + p[2]).toBeCloseTo(0.5)
  expect(0.25 * p[1] + p[3]).toBeCloseTo(0.5)
})

test('jumpTime: inside the clip, forward by 20–80 % of it (always a visible cut, wrapped), the same for the same n', () => {
  const ts = Array.from({ length: 300 }, (_, n) => jumpTime(7, 12, n + 1))
  for (const t of ts) {
    expect(t).toBeGreaterThanOrEqual(0)
    expect(t).toBeLessThan(12)
    const ahead = (t - 7 + 12) % 12
    expect(ahead).toBeGreaterThanOrEqual(0.2 * 12 - 1e-9)
    expect(ahead).toBeLessThanOrEqual(0.8 * 12 + 1e-9)
  }
  expect(jumpTime(7, 12, 5)).toBe(jumpTime(7, 12, 5))
  expect(new Set(ts.map((t) => t.toFixed(2))).size).toBeGreaterThan(200) // spread, not stuck
})

test('jump: one per rise; a kick train at 8.6 Hz jumps ≤ 3 times in any 1 s (the flash gate, WCAG 2.3.1)', () => {
  expect(video.flash).toEqual(['jump'])
  const at = jumps({ source: 'kick', amount: 1, attack: 0, release: 0, min: 0, max: 1 }, 600, (t) => ({ kick: Math.round(t * 60) % 7 ? 0 : 1 }))
  expect(at.length).toBeGreaterThanOrEqual(27) // ≈ 3/s over 10 s: it does jump
  for (const t of at) expect(at.filter((u) => u >= t && u < t + 1).length).toBeLessThanOrEqual(3)
})

test('the built-in: no clip (the hint), the def bind repeated; its jump cuts once per 4-bar phrase, only with a sure tempo', () => {
  const by = new Map(video.inputs.map((i) => [i.name, i]))
  for (const n of ['clip', 'fit']) expect(bindable(by.get(n)!), n).toBe(false)
  for (const n of ['speed', 'jump', 'x', 'y', 'zoom']) expect(bindable(by.get(n)!), n).toBe(true)
  expect(by.get('jump')!.type).toBe('event')
  const d = BUILTIN.find((b) => b.id === 'builtin:video-clip')!
  expect(d.star).toBe(false)
  const g = d.layers[0].gen
  expect(g.ref).toBe('native/video')
  expect(g.values?.clip ?? '').toBe('')
  expect(g.bind).toEqual(video.bind)
  const bar = (conf: number) => (t: number) => ({ bar: t * (174 / 60 / 4), confidence: conf }) // 174 BPM
  expect(jumps(g.bind!.jump, 60 * 60, bar(1)).length).toBe(11) // 60 s = 43.5 bars: phrases 0, 4, …, 40
  expect(jumps(g.bind!.jump, 60 * 60, bar(0.2))).toEqual([]) // no sure tempo, no cut
})
