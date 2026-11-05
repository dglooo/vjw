import { beforeEach, expect, test } from 'vitest'
import { edits } from './undo'

// One value, edited as the panel does: apply the edit, then record its inverse.
let v = 0
function set(to: number, key?: string, t?: number) {
  const from = v
  v = to
  edits.record({ undo: () => (v = from), redo: () => (v = to), key, t })
}
/** Undoes (redoes) once and returns the value that leaves. */
const back = () => (edits.undo(), v)
const fwd = () => (edits.redo(), v)

beforeEach(() => {
  edits.clear()
  v = 0
})

test('undo and redo walk the steps back and forth in order; false when there is none', () => {
  expect(edits.undo()).toBe(false)
  expect(edits.redo()).toBe(false)
  set(1)
  set(2)
  set(3)
  expect([back(), back(), fwd(), back(), back()]).toEqual([2, 1, 2, 1, 0])
  expect(edits.undo()).toBe(false)
  expect([fwd(), fwd(), fwd()]).toEqual([1, 2, 3])
  expect(edits.redo()).toBe(false)
})

test('a new record clears redo', () => {
  set(1)
  set(2)
  expect(edits.undo()).toBe(true)
  set(5)
  expect(edits.redo()).toBe(false)
  expect([back(), back()]).toEqual([1, 0])
})

test('steps with one key, each within 1 s of the last, are one step; another key, or none, is not', () => {
  set(1, 'a', 0)
  set(2, 'a', 600)
  set(3, 'a', 1200) // 1.2 s after the first, 0.6 s after the last: the same drag
  set(4, 'b', 1300) // another key
  set(5, 'b', 2400) // 1.1 s after the last
  set(6, undefined, 2400)
  set(7, undefined, 2400) // no key
  expect([back(), back(), back(), back(), back()]).toEqual([6, 5, 4, 3, 0])
  expect(edits.undo()).toBe(false)
  expect(fwd()).toBe(3) // the drag's last value
  set(8, 'c')
  set(9, 'c') // no t: stamped now, within 1 s
  expect([back(), back()]).toEqual([3, 0])
})

test('clear empties both undo and redo', () => {
  set(1)
  set(2)
  edits.undo()
  edits.clear()
  expect(edits.undo()).toBe(false)
  expect(edits.redo()).toBe(false)
  expect(v).toBe(1)
})
