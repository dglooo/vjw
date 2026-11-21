import { expect, test } from 'vitest'
import { AUTOPILOT } from '../director'
import { audioSummary, autoChip, autoTitle, inputLabel } from './bar'

// The top bar's chips (Overlay.tsx, user 2026-11-21 «покрасивее, поудобнее»): the text each one reads.
test('audioSummary: analyser · genre · sensitivity, as the audio chip reads them', () => {
  const s = { analyser: 'ours', auto: true, pick: null, sensitivity: undefined } as const
  expect(audioSummary(s, 'dnb')).toBe('ours · auto dnb · mid') // auto names the detected genre; no sensitivity = mid
  expect(audioSummary(s, null)).toBe('ours · auto · mid') // nothing detected yet
  expect(audioSummary({ ...s, analyser: 'donor', auto: false, pick: 'house', sensitivity: 'high' }, 'dnb')).toBe('vs2 · house · high') // a hand pick, not the detected
  expect(audioSummary({ ...s, analyser: 'vs3', pick: 'psy', sensitivity: 'low' }, 'techno')).toBe('vs3 · psy · low')
  expect(audioSummary({ ...s, analyser: 'off', pick: 'psy', sensitivity: 'high' }, 'dnb')).toBe('analysis off') // no scene hears genre or sensitivity then
  // the on-stage scene's genre (user 2026-11-21): in force under no hand pick, and the chip says so
  expect(audioSummary(s, 'dnb', 'psy')).toBe('ours · scene: psy · mid')
  expect(audioSummary({ ...s, pick: 'house' }, 'dnb', 'psy')).toBe('ours · house · mid') // a hand pick wins
  expect(audioSummary(s, 'dnb', null)).toBe('ours · auto dnb · mid') // a scene without one: Auto
  expect(audioSummary({ ...s, analyser: 'off' }, 'dnb', 'psy')).toBe('analysis off')
})

test("inputLabel: the device's label, the file's name, else the call to pick one", () => {
  const devices = [{ id: 'a', label: 'Scarlett 2i2 USB' }]
  expect(inputLabel({ source: { kind: 'device', id: 'a' }, devices })).toBe('Scarlett 2i2 USB')
  expect(inputLabel({ source: { kind: 'device', id: 'gone' }, devices })).toBe('Audio input') // its label not listed (yet)
  expect(inputLabel({ source: { kind: 'file', name: 'track.flac' }, devices })).toBe('track.flac')
  expect(inputLabel({ source: null, devices })).toBe('Choose input')
})

test('autoChip and autoTitle: the ⟳ chip reads the shot length (hold while held), its title the countdown', () => {
  const secs = { ...AUTOPILOT, mode: 'seconds', seconds: 90 } as const
  const off = { ...AUTOPILOT, mode: 'off' } as const
  expect([autoChip(AUTOPILOT, false), autoChip(secs, false), autoChip(off, false), autoChip(secs, true)]).toEqual(['128', '90s', 'off', 'hold'])
  const s = { hold: false, due: 37, confident: true, armedSet: null }
  expect(autoTitle(AUTOPILOT, s)).toBe('Autopilot: the next scene every 128 bars · next cut in 37 bars')
  expect(autoTitle(AUTOPILOT, { ...s, due: 1, confident: false })).toBe('Autopilot: the next scene every 128 bars · next cut in ≈ 1 bar') // timed at 174 BPM
  expect(autoTitle(secs, { ...s, due: 42, confident: false })).toBe('Autopilot: the next scene every 90 s · next cut in 42 s') // the clock's: no ≈
  expect(autoTitle(off, { ...s, due: Infinity })).toBe('Autopilot off: no timed cut, ← → and drops still switch')
  expect(autoTitle(AUTOPILOT, { ...s, hold: true, due: Infinity })).toBe('Autopilot: the next scene every 128 bars · held (Space)')
  expect(autoTitle(secs, { ...s, armedSet: 0, due: Infinity })).toBe('Autopilot: the next scene every 90 s · the armed set plays its own bars')
})
