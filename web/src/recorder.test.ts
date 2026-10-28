import { expect, test } from 'vitest'
import { fileName, pickMimeType, recorderOptions, timeslice } from './recorder'

test('pickMimeType returns the first type the browser accepts (MP4 first), else undefined', () => {
  expect(pickMimeType(() => true)).toBe('video/mp4;codecs=avc1.640028,mp4a.40.2')
  expect(pickMimeType((t) => t.startsWith('video/webm;codecs=vp8'))).toBe('video/webm;codecs=vp8,opus')
  expect(pickMimeType(() => false)).toBeUndefined()
})

test('timeslice: the picked MP4 records in 1 s chunks, WebM in one piece (its duration needs an unchunked take)', () => {
  expect(timeslice(pickMimeType(() => true)!)).toBe(1000)
  expect(timeslice(pickMimeType((t) => t.startsWith('video/webm'))!)).toBeUndefined()
  expect(timeslice('')).toBeUndefined() // no type picked: the browser's default container, unchunked
})

test('recorderOptions: MP4 asks for a keyframe every 60 s, WebM keeps the encoder default', () => {
  const mp4 = pickMimeType(() => true)
  expect(recorderOptions(mp4, 12e6)).toEqual({ mimeType: mp4, videoBitsPerSecond: 12e6, videoKeyFrameIntervalDuration: 60_000 })
  expect(recorderOptions('video/webm;codecs=vp9,opus', 12e6)).toEqual({ mimeType: 'video/webm;codecs=vp9,opus', videoBitsPerSecond: 12e6 })
  expect(recorderOptions(undefined, 12e6)).toEqual({ mimeType: undefined, videoBitsPerSecond: 12e6 }) // the browser's default
})

test('fileName: a single take is plain, every part of a split recording is numbered', () => {
  const mp4 = pickMimeType(() => true)!
  expect(fileName('2026-10-28T21-00-00', mp4, 1, 1)).toBe('veejay-2026-10-28T21-00-00.mp4')
  expect(fileName('2026-10-28T21-00-00', mp4, 1, 3)).toBe('veejay-2026-10-28T21-00-00-part1.mp4')
  expect(fileName('2026-10-28T21-00-00', 'video/webm;codecs=vp9,opus', 3, 3)).toBe('veejay-2026-10-28T21-00-00-part3.webm')
})
