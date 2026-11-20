import { expect, test } from 'vitest'
import { importSets, parseSets, reorder, setFile, type SetList } from './setlist'

test('parseSets keeps the good cues and sets, and drops each bad one with its reason', () => {
  const good = { scene: 'builtin:tunnel', preset: 'hall', bars: 16, transition: 'gl/Swirl' }
  expect(
    parseSets([
      {
        name: 'Friday',
        cues: [good, { scene: 'builtin:plexus', bars: 'hold', extra: 1 }, { bars: 4 }, { scene: 'x', bars: 0 }, { scene: 'x', bars: 2.5 }, { scene: 'x', bars: 4, preset: 3 }, { scene: 'x', bars: 4, transition: '' }, 'cue'],
      },
      { name: ' ', cues: [] },
      { name: 'no list' },
      { name: 'empty', cues: [] },
    ]),
  ).toEqual({
    sets: [
      { name: 'Friday', cues: [good, { scene: 'builtin:plexus', bars: 'hold' }] }, // a cue keeps its own keys only
      { name: 'empty', cues: [] },
    ],
    dropped: [
      'set "Friday", cue 3: no scene id',
      'set "Friday", cue 4: bars 0: a whole number ≥ 1 or "hold"',
      'set "Friday", cue 5: bars 2.5: a whole number ≥ 1 or "hold"',
      'set "Friday", cue 6: preset: not a name',
      'set "Friday", cue 7: transition: not an id',
      'set "Friday", cue 8: not a cue',
      'set 2: no name',
      'set "no list": no cue list',
    ],
  })
  expect(parseSets(null)).toEqual({ sets: [], dropped: [] }) // nothing stored
  expect(parseSets({ name: 'not a list' }).sets).toEqual([])
})

test('a set file round-trips; a taken name gets a suffix, both kept; a bad file reports its reasons and keeps the good cues', () => {
  const set: SetList = { name: 'Friday', cues: [{ scene: 'builtin:tunnel', preset: 'hall', bars: 16, transition: 'gl/Swirl' }, { scene: 'x', bars: 'hold' }] }
  expect(importSets([], setFile([set]))).toEqual({ sets: [set], dropped: [] })
  expect(importSets([set], setFile([set, set])).sets.map((s) => s.name)).toEqual(['Friday (2)', 'Friday (3)'])
  expect(importSets([], JSON.stringify([set])).sets).toEqual([set]) // a bare list, as vjw.sets holds
  expect(importSets([], JSON.stringify({ sets: [{ name: 'A', cues: [set.cues[0], { bars: 4 }] }, { cues: [] }] }))).toEqual({
    sets: [{ name: 'A', cues: [set.cues[0]] }],
    dropped: ['set "A", cue 2: no scene id', 'set 2: no name'],
  })
  const bad = importSets([set], '{"sets": [')
  expect(bad.sets).toEqual([])
  expect(bad.dropped).toHaveLength(1)
  expect(bad.dropped[0]).toMatch(/^not a set file: /)
  expect(importSets([], JSON.stringify({ v: 1, scenes: [] }))).toEqual({ sets: [], dropped: [] }) // a library file: no set
})

test('reorder keeps every cue once, at each drop line', () => {
  const cues = ['a', 'b', 'c', 'd'].map((scene) => ({ scene, bars: 4 }))
  for (let from = 0; from < cues.length; from++)
    for (let at = 0; at <= cues.length; at++) {
      const out = reorder(cues, from, at)
      expect(new Set(out)).toEqual(new Set(cues))
      expect(out).toHaveLength(cues.length)
    }
  expect(reorder(cues, 0, 4).map((c) => c.scene).join('')).toBe('bcda') // past the last
  expect(reorder(cues, 3, 0).map((c) => c.scene).join('')).toBe('dabc')
  expect(reorder(cues, 1, 2)).toEqual(cues) // its own line: no move
})
