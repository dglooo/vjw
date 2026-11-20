import { expect, test } from 'vitest'
import { parseSets } from './setlist'

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
