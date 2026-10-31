import { describe, expect, test } from 'vitest'
import type { Sources } from '../bind'
import type { Drum, Hit } from './drums'
import { createFeatures } from './features'
import { PRESETS, type Preset } from './presets'
import type { AudioSettings } from './settings'
import { pattern } from './synth'

const DRUMS: Drum[] = ['kick', 'snare', 'hats']
const settings = (sens: Record<string, number> = {}): AudioSettings => ({ v: 1, auto: false, pick: null, sens, custom: [] })
const preset = (sens: Record<string, number> = {}): Preset => ({ ...PRESETS.default, sens })
const hit = (drum: Drum, t = 0): Hit => ({ drum, t, strength: 4 })
const close = (a: number[], b: number[]) => {
  expect(a).toHaveLength(b.length)
  a.forEach((v, i) => expect(v, `#${i}`).toBeCloseTo(b[i], 12))
}

/** `drum`'s value at each fill after one hit; fill i passes dts[i], so fill 0 is the hit's frame (age 0). */
function after(drum: Drum, dts: number[], s = settings(), p = preset()) {
  const f = createFeatures()
  const out: Sources = {}
  f.hit(hit(drum))
  return dts.map((dt) => {
    f.fill(out, dt, s, p)
    return out[drum]
  })
}

describe('hit sources (design C1)', () => {
  test('a hit jumps to 1 on its frame, then decays by 1/e every τ: kick and snare 0.12 s, hats 0.06 s', () => {
    close(after('kick', [0.06, 0.06, 0.06]), [1, Math.exp(-0.5), Math.exp(-1)])
    close(after('snare', [0.06, 0.06, 0.06]), [1, Math.exp(-0.5), Math.exp(-1)])
    close(after('hats', [0.06, 0.06, 0.06]), [1, Math.exp(-1), Math.exp(-2)])
  })

  test('only the hit drum moves; a drum never hit reads 0; a new hit restarts the decay', () => {
    const f = createFeatures()
    const out: Sources = {}
    const fill = () => f.fill(out, 0.06, settings(), preset())
    fill()
    expect(out).toEqual({ kick: 0, snare: 0, hats: 0 })
    f.hit(hit('snare'))
    fill()
    expect(out).toEqual({ kick: 0, snare: 1, hats: 0 })
    fill()
    f.hit(hit('snare'))
    fill()
    expect(out.snare).toBe(1)
  })

  test("sens: the user's × the preset's factor for that id (missing = 1), capped at 1", () => {
    const kick = (s: AudioSettings, p = preset()) => after('kick', [0.12, 0], s, p) // ages 0 and τ
    close(kick(settings({ kick: 0 })), [0, 0])
    close(kick(settings({ kick: 1 })), [1, Math.exp(-1)])
    close(kick(settings({ kick: 2 })), [1, 2 * Math.exp(-1)]) // the hit frame caps at 1
    close(kick(settings(), preset({ kick: 0.5 })), [0.5, 0.5 * Math.exp(-1)])
    close(kick(settings({ kick: 2 }), preset({ kick: 0.5 })), [1, Math.exp(-1)]) // a product: 2 × 0.5 is neutral
    close(after('hats', [0.06, 0], settings({ kick: 0, hats: 2 })), [1, 2 * Math.exp(-1)]) // each id its own factor
  })

  test('a DnB hit train at 60 fps: each hit peaks on the frame it is drained and crosses 0.5 once (one event per hit)', () => {
    const { truth } = pattern('dnb') // hats include 16th pickups, 86 ms apart at 174 BPM
    const queue = DRUMS.flatMap((d) => truth[d].map((t) => hit(d, t))).sort((a, b) => a.t - b.t)
    const f = createFeatures()
    const out: Sources = {}
    const edges = { kick: 0, snare: 0, hats: 0 }
    const prev = { kick: 0, snare: 0, hats: 0 }
    const dt = 1 / 60
    for (let now = 0; now < truth.hats[truth.hats.length - 1] + 1; now += dt) {
      const drained: Drum[] = []
      while (queue.length && queue[0].t <= now) drained.push(queue.shift()!.drum) // a file's hit is held until heard (T1)
      for (const d of drained) f.hit(hit(d, now))
      f.fill(out, dt, settings(), preset())
      for (const d of drained) expect(out[d]).toBe(1)
      for (const d of DRUMS) {
        if (out[d] >= 0.5 && prev[d] < 0.5) edges[d]++
        prev[d] = out[d]
      }
    }
    expect(queue).toHaveLength(0)
    expect(edges).toEqual({ kick: truth.kick.length, snare: truth.snare.length, hats: truth.hats.length })
  })
})
