import { test, expect } from 'vitest'
import { PRESETS } from '../audio/presets'
import { createSettings, pickToPatch, type AudioSettings } from '../audio/settings'

// The tab's groups are bind.ts sourceGroups() now (every source gets a gain and a mute): bind.test.ts covers them.
const s = (custom: AudioSettings['custom']): AudioSettings => ({ v: 1, auto: true, pick: null, sens: {}, mute: [], custom, analyser: 'ours' })

// pickToPatch: the C4 state machine (design C4) — a picker value or an Auto-toggle move becomes the `patch` it applies.
test('pickToPatch: picker — "auto" re-enters Follow (even from Manual), a preset id is a manual pick', () => {
  const s0 = s([])
  expect(pickToPatch('picker', 'auto', s0, 'dnb')).toEqual({ auto: true, pick: null }) // follow the detected
  // Manual (auto off, e.g. after a toggle-off) + "Auto" → Follow, not `auto:false, pick:null` (which would show "Auto"
  // but stay locked on Default — the dropdown, checkbox and active preset would disagree)
  expect(pickToPatch('picker', 'auto', { ...s0, auto: false, pick: 'dnb' }, 'dnb')).toEqual({ auto: true, pick: null })
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
  // The on-stage scene's genre (user 2026-11-21) is what is active under no pick, so the lock keeps it; a pick still wins
  expect(pickToPatch('toggle', false, st(true, null), 'dnb', 'house')).toEqual({ auto: false, pick: 'house' })
  expect(pickToPatch('toggle', false, st(true, 'dnb'), 'dubstep', 'house')).toEqual({ auto: false, pick: 'dnb' })
})

// The top bar's genre select (user 2026-11-21) and this tab's picker share one change (SourcesTab.tsx pickGenre: the
// store's patch of pickToPatch's picker move) and both show `pick ?? 'auto'`: every option of either lands as the same
// auto/pick in the stored settings and reads back as itself, so the two stay in step.
test('the top-bar genre select and the Sources-tab picker write the same settings', () => {
  const m = new Map<string, string>()
  const st = createSettings({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) })
  const pickGenre = (v: string) => st.patch(pickToPatch('picker', v, st.get(), 'techno'))
  for (const v of ['house', 'auto', ...Object.keys(PRESETS), 'auto']) {
    pickGenre(v)
    expect([st.get().auto, st.get().pick ?? 'auto'], v).toEqual([true, v])
  }
  st.patch({ auto: false, pick: 'psy' }) // Manual: the tab's Auto-style toggled off
  pickGenre('auto') // re-enters Follow, so the checkbox and both selects agree
  expect([st.get().auto, st.get().pick]).toEqual([true, null])
  expect(createSettings({ getItem: (k) => m.get(k) ?? null, setItem: () => {} }).get().pick).toBeNull() // stored as such
})
