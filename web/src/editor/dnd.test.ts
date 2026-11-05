import { expect, test } from 'vitest'
import { adjustForSource, insertIndex } from './dnd'

test('insertIndex: above the first row 0, between rows i and i+1 → i+1, below the last n', () => {
  const mids = [10, 30, 50]
  expect(insertIndex(0, mids)).toBe(0)
  expect(insertIndex(20, mids)).toBe(1)
  expect(insertIndex(40, mids)).toBe(2)
  expect(insertIndex(60, mids)).toBe(3)
  expect(insertIndex(5, [])).toBe(0)
})

test('adjustForSource: a row taken out of the list shifts the indices past it', () => {
  expect(adjustForSource(3, 0)).toBe(2) // down: row 0 below the last of 3 → ends up at 2
  expect(adjustForSource(0, 2)).toBe(0) // up: row 2 above the first
  expect(adjustForSource(1, 1)).toBe(1) // adjacent, either side of itself: no move
  expect(adjustForSource(2, 1)).toBe(1)
})
