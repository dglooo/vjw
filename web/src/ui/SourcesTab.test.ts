import { test, expect } from 'vitest'
import { meterGroups, pickToPatch, type AudioSettings } from '../audio/settings'

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

// pickToPatch: the C4 state machine (design C4) — a picker value or an Auto-toggle move becomes the `patch` it applies.
test('pickToPatch: picker — "auto" follows, a preset id is a manual pick', () => {
  const s0 = s([])
  expect(pickToPatch('picker', 'auto', s0, 'dnb')).toEqual({ pick: null }) // follow the detected
  for (const id of ['default', 'dnb', 'dubstep', 'techno'] as const) expect(pickToPatch('picker', id, s0, null)).toEqual({ pick: id })
})

test('pickToPatch: toggle — on follows, off keeps the preset active *now* as the pick (not null)', () => {
  const st = (auto: boolean, pick: AudioSettings['pick']) => ({ ...s([]), auto, pick })
  expect(pickToPatch('toggle', true, st(true, 'dnb'), 'dubstep')).toEqual({ auto: true, pick: null })
  // Locked: the pick wins, so the lock keeps it
  expect(pickToPatch('toggle', false, st(true, 'dnb'), 'dubstep')).toEqual({ auto: false, pick: 'dnb' })
  // Follow: the detected genre is what is active, so the lock keeps it
  expect(pickToPatch('toggle', false, st(true, null), 'dubstep')).toEqual({ auto: false, pick: 'dubstep' })
  // Follow in silence: nothing detected, so the lock falls back to default
  expect(pickToPatch('toggle', false, st(true, null), null)).toEqual({ auto: false, pick: 'default' })
  // Already off (Manual): the pick stays whatever it is
  expect(pickToPatch('toggle', false, st(false, 'dubstep'), 'dnb')).toEqual({ auto: false, pick: 'dubstep' })
})
