import { test, expect } from 'vitest'
import { meterGroups, type AudioSettings } from '../audio/settings'

const s = (custom: AudioSettings['custom']): AudioSettings => ({ v: 1, auto: true, pick: null, sens: {}, custom })
const band = (id: string) => ({ id, name: id, lo: 50, hi: 80, gain: 1, gate: 0.2, attack: 0.01, release: 0.2 })

test('meterGroups: the fixed groups, in order, no Custom', () => {
  expect(meterGroups(s([]))).toEqual([
    { title: 'Drums', ids: ['kick', 'snare', 'hats'] },
    { title: 'Bass', ids: ['sub', 'reese', 'wobble'] },
    { title: 'Arrangement', ids: ['build', 'drop'] },
  ])
})

test('meterGroups: custom bands append under Custom, in order', () => {
  const g = meterGroups(s([band('u:aaaa11'), band('u:bbbb22')]))
  expect(g.at(-1)).toEqual({ title: 'Custom', ids: ['u:aaaa11', 'u:bbbb22'] })
  expect(g.length).toBe(4)
})
