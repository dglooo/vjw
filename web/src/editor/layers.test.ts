import { expect, test } from 'vitest'
import { clampSel, muteMask } from './layers'

test('muteMask: no solo gives the own flags; a solo layer plays alone, one flag per layer', () => {
  expect(muteMask([false, true, false], null)).toEqual([false, true, false])
  expect(muteMask([false, true, false], 1)).toEqual([true, false, true]) // solo unmutes a muted layer
  expect(muteMask([true, false, false, false], 3)).toHaveLength(4)
  expect(muteMask([], null)).toEqual([])
})

test('clampSel: a removed layer or effect selects the nearest one left', () => {
  const two = [{ fx: [1, 2] }, { fx: [] }]
  expect(clampSel(two, { layer: 0, fx: 1 })).toEqual({ layer: 0, fx: 1 })
  expect(clampSel(two, { layer: 0, fx: 5 })).toEqual({ layer: 0, fx: 1 })
  expect(clampSel(two, { layer: 3, fx: 0 })).toEqual({ layer: 1, fx: null }) // its layer has no effects
})
