import { expect, test } from 'vitest'
import { pickSaved, store } from './store'

test('patch keeps the snapshot object on a no-op and replaces it on a change', () => {
  const calls: number[] = []
  const off = store.subscribe(() => calls.push(1))
  const before = store.getSnapshot()
  store.patch({ bpm: before.bpm, hold: before.hold })
  expect(store.getSnapshot()).toBe(before)
  store.patch({ bpm: 128 })
  expect(store.getSnapshot()).not.toBe(before)
  expect(store.getSnapshot().bpm).toBe(128)
  expect(calls).toHaveLength(1)
  off()
})

test('pickSaved returns the saved device only if it is present', () => {
  const devices = [{ id: 'a', label: 'Built-in' }, { id: 'b', label: 'USB line-in' }]
  expect(pickSaved(devices, 'b')).toBe(devices[1])
  expect(pickSaved(devices, 'gone')).toBeUndefined()
  expect(pickSaved(devices, null)).toBeUndefined()
})
