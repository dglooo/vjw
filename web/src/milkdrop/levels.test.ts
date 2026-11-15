import { expect, test } from 'vitest'
import { createMix } from './levels'

const theirs = () => ({ val: Float32Array.of(1.23, 0.45, 2.71), att: Float32Array.of(1.1, 0.5, 1.9) })
const DT = 1 / 60
const BEAT = 60 / 174

test("sync 0 leaves Butterchurn's levels bit-identical; sync 1 is ours: kick → bass, a drop rise bursts for one beat", () => {
  const m = createMix()
  for (const sync of [0, -1, NaN]) {
    const l = theirs()
    m.frame({ kick: 1, snare: 1, hats: 1, sub: 1 }, sync, DT, BEAT)
    m.apply(l)
    expect(l).toEqual(theirs())
  }

  const at = (s: Record<string, number>) => {
    const l = theirs()
    m.frame(s, 1, DT, BEAT)
    m.apply(l)
    return [...l.val].map((x) => +x.toFixed(3))
  }
  expect(at({})).toEqual([0.6, 0.6, 0.6]) // rest
  expect(at({ kick: 1, sub: 0.5 })).toEqual([2.8, 0.6, 0.6]) // .6 + kick 1.9 + body .6 × .5
  expect(at({ snare: 1, hats: 1 })).toEqual([0.6, 2.5, 2.5])
  expect(at({ drop: 0.8 })).toEqual([2.6, 2.6, 2.6]) // a rise: + 2 on all three
  let last: number[] = []
  for (let t = DT; t < BEAT + DT; t += DT) last = at({ drop: 0.7 }) // decaying: no new rise
  expect(last).toEqual([0.6, 0.6, 0.6]) // gone after one beat
})
