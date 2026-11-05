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

test('editor defaults off; toggling it notifies once per change (app.ts setEditor patches it, 2b S2.1)', () => {
  expect(store.getSnapshot().editor).toBe(false)
  const calls: number[] = []
  const off = store.subscribe(() => calls.push(1))
  store.patch({ editor: true })
  expect(store.getSnapshot().editor).toBe(true)
  store.patch({ editor: false })
  expect(store.getSnapshot().editor).toBe(false)
  expect(calls).toHaveLength(2)
  off()
})

test('pickSaved returns the saved device only if it is present', () => {
  const devices = [{ id: 'a', label: 'Built-in' }, { id: 'b', label: 'USB line-in' }]
  expect(pickSaved(devices, 'b')).toBe(devices[1])
  expect(pickSaved(devices, 'gone')).toBeUndefined()
  expect(pickSaved(devices, null)).toBeUndefined()
})
