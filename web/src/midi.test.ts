import { describe, expect, test } from 'vitest'
import { createMidi, mappingsOf, parse, scale, type Access, type Mapping, type ParamTarget } from './midi'

const P: ParamTarget = { kind: 'param', scene: 's1', layer: 0, node: 'gen', input: 'zoom', lo: 0.5, hi: 2, label: 'zoom' }
const CC21 = { kind: 'cc', ch: 1, num: 21 } as const
const PAD36 = { kind: 'note', ch: 1, num: 36 } as const

/** A memory store (JSON, as localStorage keeps it) and a fake app: the scene on stage, the params set, the keys pressed. */
function rig(stored: unknown = null) {
  const kept = { v: stored }
  const calls = { param: [] as [string, number][], key: [] as string[] }
  let scene = 's1'
  const midi = createMidi(
    { load: () => kept.v, save: (m) => void (kept.v = JSON.parse(JSON.stringify(m))) },
    { scene: () => scene, param: (t, v) => void calls.param.push([t.input, v]), key: (code) => void calls.key.push(code) },
  )
  return { midi, kept, calls, stage: (s: string) => void (scene = s) }
}

type FakeInput = { name: string; state: string; onmidimessage: ((e: MIDIMessageEvent) => void) | null }
/** A MIDIAccess whose inputs' messages the test sends. */
function access(...names: string[]) {
  const inputs = new Map<string, FakeInput>(names.map((name, i) => [String(i), { name, state: 'connected', onmidimessage: null }]))
  const a: Access = { inputs, onstatechange: null }
  const send = (i: number, ...bytes: number[]) => inputs.get(String(i))!.onmidimessage?.({ data: new Uint8Array(bytes) } as MIDIMessageEvent)
  const plug = () => a.onstatechange!({} as MIDIConnectionEvent) // a hot-plug
  return { a, inputs, send, plug }
}

describe('parse and scale', () => {
  test('CC and note-on with their channel; a note-off, a note-on at velocity 0, the rest and a short message: null', () => {
    expect(parse([0xb0, 21, 64])).toEqual({ kind: 'cc', ch: 1, num: 21, val: 64 })
    expect(parse([0xbf, 7, 127])).toEqual({ kind: 'cc', ch: 16, num: 7, val: 127 })
    expect(parse([0x92, 36, 100])).toEqual({ kind: 'note', ch: 3, num: 36, val: 100 })
    for (const d of [[0x92, 36, 0], [0x82, 36, 64], [0xe0, 0, 64], [0xf8], [0xb0, 21]]) expect(parse(d), String(d)).toBeNull()
  })

  test("a CC 0–127 onto the input's range, both ends reached", () => {
    expect([0, 127].map((v) => scale(v, 0.5, 2))).toEqual([0.5, 2])
    expect(scale(64, 0, 127)).toBe(64)
  })
})

describe('learn', () => {
  test('learn on, a slider armed: a CC assigns it, a pad does not; an action armed: a pad assigns it, a CC does not; stored', async () => {
    const { midi, kept } = rig()
    const { a, send } = access('Launch Control')
    await midi.start(async () => a)
    expect(midi.get()).toMatchObject({ on: true, inputs: ['Launch Control'], error: null })
    midi.arm(P) // learn off: nothing to arm
    expect(midi.get().armed).toBeNull()
    midi.setLearn(true)
    midi.arm(P)
    send(0, 0x90, 36, 100)
    expect(midi.get().armed).toEqual(P)
    send(0, 0xb0, 21, 10)
    expect(midi.get()).toMatchObject({ learn: true, armed: null, maps: [{ ctl: CC21, target: P }] })
    midi.arm({ kind: 'key', code: 'ArrowRight' })
    send(0, 0xb0, 22, 5)
    send(0, 0x99, 40, 90) // a pad on channel 10
    expect(midi.get().maps.map((m) => m.ctl)).toEqual([CC21, { kind: 'note', ch: 10, num: 40 }])
    expect(kept.v).toEqual(midi.get().maps)
  })

  test('a second click on the armed target cancels it, leaving learn too; a control or a target learnt again moves', async () => {
    const { midi } = rig()
    const { a, send } = access('x')
    await midi.start(async () => a)
    midi.setLearn(true)
    midi.arm(P)
    midi.arm({ ...P }) // the same slider again
    expect(midi.get().armed).toBeNull()
    midi.arm(P)
    midi.setLearn(false)
    expect(midi.get()).toMatchObject({ learn: false, armed: null })
    midi.setLearn(true)
    midi.arm(P)
    send(0, 0xb0, 21, 0)
    const Q: ParamTarget = { ...P, input: 'angle' }
    midi.arm(Q)
    send(0, 0xb0, 21, 0) // CC 21 now drives angle only
    midi.arm(Q)
    send(0, 0xb0, 22, 0) // angle moves to CC 22
    expect(midi.get().maps).toEqual([{ ctl: { ...CC21, num: 22 }, target: Q }])
  })
})

describe('dispatch', () => {
  test("a mapped CC sets the param on its range while its scene is on stage, else nothing; a mapped pad presses its key", async () => {
    const maps: Mapping[] = [{ ctl: CC21, target: P }, { ctl: PAD36, target: { kind: 'key', code: 'KeyT' } }]
    const { midi, calls, stage } = rig(maps)
    const { a, send } = access('x')
    await midi.start(async () => a)
    send(0, 0xb0, 21, 127)
    send(0, 0xb0, 21, 0)
    send(0, 0xb1, 21, 64) // channel 2: not mapped
    stage('s2')
    send(0, 0xb0, 21, 64) // its scene is not on stage
    send(0, 0x90, 36, 1)
    send(0, 0x90, 36, 0) // a note-off as a note-on at 0
    send(0, 0x80, 36, 64)
    expect(calls.param).toEqual([['zoom', 2], ['zoom', 0.5]])
    expect(calls.key).toEqual(['KeyT'])
  })

  test('hot-plug: a new input is heard and listed, a gone one leaves the list; stop hears nothing', async () => {
    const { midi, calls } = rig([{ ctl: PAD36, target: { kind: 'key', code: 'KeyB' } }])
    const { a, inputs, send, plug } = access('A')
    await midi.start(async () => a)
    inputs.set('1', { name: 'B', state: 'connected', onmidimessage: null })
    plug()
    expect(midi.get().inputs).toEqual(['A', 'B'])
    send(1, 0x90, 36, 100)
    inputs.get('0')!.state = 'disconnected'
    plug()
    expect(midi.get().inputs).toEqual(['B'])
    midi.stop()
    send(1, 0x90, 36, 100)
    expect(calls.key).toEqual(['KeyB'])
    expect(midi.get()).toMatchObject({ on: false, inputs: [], learn: false })
  })

  test('a refused request (the permission, no Web MIDI) reads as an error, MIDI stays off', async () => {
    const { midi } = rig()
    await midi.start(() => Promise.reject(new DOMException('denied', 'NotAllowedError')))
    expect(midi.get()).toMatchObject({ on: false, error: expect.stringMatching(/blocked/) })
    await midi.start(() => {
      throw new TypeError('navigator.requestMIDIAccess is not a function')
    })
    expect(midi.get()).toMatchObject({ on: false, error: expect.stringMatching(/no Web MIDI/) })
  })
})

test('storage: the mappings come back after a reload; a corrupt entry is left out', async () => {
  const { midi, kept } = rig()
  const { a, send } = access('x')
  await midi.start(async () => a)
  midi.setLearn(true)
  midi.arm(P)
  send(0, 0xb0, 21, 1)
  midi.arm({ kind: 'key', code: 'ArrowLeft' })
  send(0, 0x90, 36, 1)
  const again = rig(kept.v).midi.get().maps // a reload
  expect(again).toEqual([{ ctl: CC21, target: P }, { ctl: PAD36, target: { kind: 'key', code: 'ArrowLeft' } }])
  const junk = [
    { ctl: { ...CC21, ch: 17 }, target: P },
    { ctl: { ...CC21, num: 128 }, target: P },
    { ctl: PAD36, target: P }, // a pad on a slider
    { ctl: CC21, target: { kind: 'key', code: 'ArrowRight' } }, // a knob on an action
    { ctl: PAD36, target: { kind: 'key', code: 'KeyF' } }, // not an action we map (the flash)
    { ctl: CC21, target: { ...P, lo: 'x' } },
    { ctl: CC21, target: { ...P, layer: 9 } },
    'x',
  ]
  expect(mappingsOf([...junk, ...again])).toEqual(again)
  for (const x of [null, 'x', {}, 5]) expect(mappingsOf(x)).toEqual([])
})
