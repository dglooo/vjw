import { expect, test } from 'vitest'
import { audioSummary, inputLabel } from './bar'

// The top bar's chips (Overlay.tsx, user 2026-11-21 «покрасивее, поудобнее»): the text each one reads.
test('audioSummary: analyser · genre · sensitivity, as the audio chip reads them', () => {
  const s = { analyser: 'ours', auto: true, pick: null, sensitivity: undefined } as const
  expect(audioSummary(s, 'dnb')).toBe('ours · auto dnb · mid') // auto names the detected genre; no sensitivity = mid
  expect(audioSummary(s, null)).toBe('ours · auto · mid') // nothing detected yet
  expect(audioSummary({ ...s, analyser: 'donor', auto: false, pick: 'house', sensitivity: 'high' }, 'dnb')).toBe('vs2 · house · high') // a hand pick, not the detected
  expect(audioSummary({ ...s, analyser: 'vs3', pick: 'psy', sensitivity: 'low' }, 'techno')).toBe('vs3 · psy · low')
  expect(audioSummary({ ...s, analyser: 'off', pick: 'psy', sensitivity: 'high' }, 'dnb')).toBe('analysis off') // no scene hears genre or sensitivity then
})

test("inputLabel: the device's label, the file's name, else the call to pick one", () => {
  const devices = [{ id: 'a', label: 'Scarlett 2i2 USB' }]
  expect(inputLabel({ source: { kind: 'device', id: 'a' }, devices })).toBe('Scarlett 2i2 USB')
  expect(inputLabel({ source: { kind: 'device', id: 'gone' }, devices })).toBe('Audio input') // its label not listed (yet)
  expect(inputLabel({ source: { kind: 'file', name: 'track.flac' }, devices })).toBe('track.flac')
  expect(inputLabel({ source: null, devices })).toBe('Choose input')
})
