import { describe, expect, test } from 'vitest'
import { ZERO_SYNC, type Sync } from './audio/sync'
import { createDirector, type Director, type Shot } from './director'

const playlist = ['tunnel', 'spectrum', 'particles', 'glitch']

type Frame = Shot & { t: number }

/** A (c) fixture: by default `bar` advances 1 per second (240 BPM), so bar n is at n s. */
const bars = (confidence: (t: number) => number, bar = (t: number) => t) => (t: number): Sync =>
  ({ bpm: 240, beat: 4 * bar(t), bar: bar(t), confidence: confidence(t) })

/** Updates at frame times i / 60 from t0 to t1 s; returns a copy of every shot with its time. */
function frames(d: Director, t0: number, t1: number, sync: (t: number) => Sync = () => ZERO_SYNC): Frame[] {
  const out: Frame[] = []
  for (let i = Math.round(t0 * 60); i <= Math.round(t1 * 60); i++) out.push({ t: i / 60, ...d.update(i / 60, sync(i / 60)) })
  return out
}
/** The frame at t (a multiple of 0.05, so i / 60 equals the literal exactly). */
const at = (s: Frame[], t: number) => s.find((x) => x.t === t)!

describe('time fallback (no confident phase)', () => {
  test('a 2 s fade every 30 s, in playlist order, wrapping after the 4th scene', () => {
    const s = frames(createDirector(playlist), 0, 125)
    expect(s.filter((x) => x.t < 30).every((x) => x.from === 'tunnel' && x.to === null)).toBe(true)
    expect(at(s, 30)).toMatchObject({ from: 'tunnel', to: 'spectrum', mix: 0 })
    expect(at(s, 31).mix).toBeCloseTo(0.5, 9)
    expect(at(s, 31.95)).toMatchObject({ from: 'tunnel', to: 'spectrum' })
    expect(at(s, 32.05)).toMatchObject({ from: 'spectrum', to: null, mix: 0 })
    const starts = s.filter((x) => x.to && x.mix === 0).map((x) => [x.t, x.from, x.to])
    expect(starts).toEqual([
      [30, 'tunnel', 'spectrum'],
      [60, 'spectrum', 'particles'],
      [90, 'particles', 'glitch'],
      [120, 'glitch', 'tunnel'],
    ])
  })

  test('lock (setHold) stops the autopilot, ←/→ still switch, and unlocking resumes it', () => {
    const d = createDirector(playlist)
    d.setHold(true)
    expect(frames(d, 0, 100).every((x) => x.from === 'tunnel' && x.to === null)).toBe(true)
    d.next()
    expect(d.update(100.05, ZERO_SYNC)).toMatchObject({ from: 'tunnel', to: 'spectrum', mix: 0 })
    expect(frames(d, 102.1, 200).every((x) => x.from === 'spectrum' && x.to === null)).toBe(true)
    d.setHold(false) // overdue: the autopilot fades on at once, from mix ≈ 0
    const resumed = d.update(200 + 1 / 60, ZERO_SYNC)
    expect(resumed).toMatchObject({ from: 'spectrum', to: 'particles' })
    expect(resumed.mix).toBeLessThan(0.01)
  })

  test('prev from the first scene wraps to the last; ←/→ mid-fade make the incoming scene current at once', () => {
    const d = createDirector(playlist)
    d.update(0, ZERO_SYNC)
    d.prev()
    expect({ ...d.update(0.1, ZERO_SYNC) }).toEqual({ from: 'tunnel', to: 'glitch', mix: 0 })
    expect(d.update(1.1, ZERO_SYNC).mix).toBeCloseTo(0.5, 9) // a 2 s fade without a confident phase
    d.next()
    expect({ ...d.update(1.2, ZERO_SYNC) }).toEqual({ from: 'glitch', to: 'tunnel', mix: 0 })
    expect(frames(d, 3.3, 31.15).every((x) => x.from === 'tunnel' && x.to === null)).toBe(true)
    expect(d.update(31.2, ZERO_SYNC)).toMatchObject({ from: 'tunnel', to: 'spectrum', mix: 0 }) // 30 s after the key
  })
})

describe('confident phase: bar lines', () => {
  test('switches on the bar line 16 bars after the last switch, fading over exactly 1 bar', () => {
    const s = frames(createDirector(playlist), 0, 40, bars(() => 0.9))
    expect(s.filter((x) => x.t < 16).every((x) => x.to === null)).toBe(true) // 16 s: before the 30 s rule would
    expect(at(s, 16)).toMatchObject({ from: 'tunnel', to: 'spectrum', mix: 0 })
    expect(at(s, 16.5).mix).toBeCloseTo(0.5, 9)
    expect(at(s, 16.95)).toMatchObject({ to: 'spectrum' })
    expect(at(s, 17.05)).toMatchObject({ from: 'spectrum', to: null })
    expect(at(s, 32)).toMatchObject({ from: 'spectrum', to: 'particles', mix: 0 })
  })

  test('no switch during the first 2 bars of confidence, then on the next bar line', () => {
    const s = frames(createDirector(playlist), 0, 25, bars((t) => (t < 20.5 ? 0 : 0.9)))
    expect(s.filter((x) => x.t < 23).every((x) => x.to === null)).toBe(true) // due since bar 16, confident from 22.5
    expect(at(s, 23)).toMatchObject({ to: 'spectrum', mix: 0 })
  })

  test('confidence dropping to 0 mid-run falls back to the 30 s rule', () => {
    const s = frames(createDirector(playlist), 0, 50, bars((t) => (t < 20 ? 0.9 : 0)))
    expect(at(s, 16)).toMatchObject({ to: 'spectrum', mix: 0 })
    expect(s.filter((x) => x.t >= 17.05 && x.t < 46).every((x) => x.from === 'spectrum' && x.to === null)).toBe(true)
    expect(at(s, 46)).toMatchObject({ from: 'spectrum', to: 'particles', mix: 0 }) // 30 s after the bar-16 switch
    expect(at(s, 47).mix).toBeCloseTo(0.5, 9)
  })

  test('a sync reset (bar jumps back to 0) mid-fade neither rewinds the fade nor stalls the autopilot', () => {
    const s = frames(createDirector(playlist), 0, 40, bars(() => 0.9, (t) => (t < 16.5 ? t : t - 16.5)))
    expect(at(s, 16.55).mix).toBeGreaterThan(at(s, 16.45).mix)
    expect(at(s, 17.6)).toMatchObject({ from: 'spectrum', to: null }) // the new count isn't confident yet: on seconds
    expect(at(s, 32.5)).toMatchObject({ from: 'spectrum', to: 'particles', mix: 0 }) // 16 bars into the new count
  })
})

describe('setPlaylist and peek', () => {
  test('setPlaylist keeps the current scene, mid-fade too; then → and the autopilot follow the new order', () => {
    const d = createDirector(playlist)
    d.update(0, ZERO_SYNC)
    d.next()
    d.update(0.1, ZERO_SYNC) // tunnel → spectrum, a 2 s fade
    d.setPlaylist(['particles', 'glitch', 'spectrum', 'tunnel'])
    const mid = { ...d.update(1.1, ZERO_SYNC) }
    expect(mid).toMatchObject({ from: 'tunnel', to: 'spectrum' }) // the fade goes on
    expect(mid.mix).toBeCloseTo(0.5, 9)
    d.next()
    expect({ ...d.update(1.2, ZERO_SYNC) }).toEqual({ from: 'spectrum', to: 'tunnel', mix: 0 })
    expect(d.update(31.2, ZERO_SYNC)).toMatchObject({ from: 'tunnel', to: 'particles', mix: 0 }) // wraps in the new order
  })

  test('removing the current scene: it plays on, and the next switch continues from the slot it left', () => {
    // After `secs` of the time fallback, playlist[secs / 30] is current; then it's dropped and a key decides.
    const dropThenKey = (secs: number, ids: string[], key: 'next' | 'prev') => {
      const d = createDirector(playlist)
      frames(d, 0, secs)
      d.setPlaylist(ids)
      d[key]()
      return { ...d.update(secs + 0.05, ZERO_SYNC) }
    }
    const noSpectrum = ['tunnel', 'particles', 'glitch']
    expect(dropThenKey(32.05, noSpectrum, 'next')).toEqual({ from: 'spectrum', to: 'particles', mix: 0 }) // not glitch
    expect(dropThenKey(32.05, noSpectrum, 'prev')).toEqual({ from: 'spectrum', to: 'tunnel', mix: 0 })
    // glitch's slot 3 is past the end of the shorter list: clamped there, so → wraps to the first scene
    expect(dropThenKey(92.05, ['tunnel', 'spectrum'], 'next')).toEqual({ from: 'glitch', to: 'tunnel', mix: 0 })
  })

  test('peek() matches the scene next() then fades to: mid-fade, after a reorder, after a drop; and the autopilot', () => {
    const d = createDirector(playlist)
    const peeked: string[] = []
    const went: (string | null)[] = []
    const press = (t: number) => {
      peeked.push(d.peek())
      d.next()
      went.push(d.update(t, ZERO_SYNC).to)
    }
    d.update(0, ZERO_SYNC)
    press(0.1)
    press(0.2) // mid-fade
    d.setPlaylist(['glitch', 'particles', 'tunnel'])
    press(0.3)
    d.setPlaylist(['spectrum', 'glitch']) // the incoming tunnel is dropped mid-fade
    press(0.4)
    peeked.push(d.peek())
    went.push(d.update(31, ZERO_SYNC).to) // the autopilot, 30 s after the last key
    expect(went).toEqual(peeked)
    expect(peeked).toEqual(['spectrum', 'particles', 'tunnel', 'spectrum', 'glitch'])
  })
})

describe('cut', () => {
  test('shows a scene at once; off the playlist, → and the autopilot go on from the slot it cut from', () => {
    const d = createDirector(playlist)
    frames(d, 0, 40) // spectrum since the 30–32 s fade
    d.cut('mine')
    expect({ ...d.update(40.05, ZERO_SYNC) }).toEqual({ from: 'mine', to: null, mix: 0 })
    expect(d.peek()).toBe('spectrum')
    // The autopilot counts 30 s from the cut, not from the last switch (which would fire at 60 s).
    expect(frames(d, 40.1, 70).every((x) => x.from === 'mine' && x.to === null)).toBe(true)
    expect(d.update(70.1, ZERO_SYNC)).toMatchObject({ from: 'mine', to: 'spectrum' })
  })

  test('off the playlist with opts.slot (its place in the list): → and peek go to the scene after it, ← to the one before', () => {
    const d = createDirector(playlist, { slot: (id) => (id === 'mine' ? 2 : undefined) }) // 'mine' stands before particles
    d.update(0, ZERO_SYNC)
    d.cut('mine')
    expect(d.peek()).toBe('particles')
    d.next()
    expect({ ...d.update(0.1, ZERO_SYNC) }).toEqual({ from: 'mine', to: 'particles', mix: 0 })
    d.cut('mine')
    d.prev()
    expect({ ...d.update(0.2, ZERO_SYNC) }).toEqual({ from: 'mine', to: 'spectrum', mix: 0 })
  })

  test('mid-fade it ends the fade; a listed scene becomes the current slot', () => {
    const d = createDirector(playlist)
    d.update(0, ZERO_SYNC)
    d.next()
    d.update(0.1, ZERO_SYNC) // tunnel → spectrum
    d.cut('glitch')
    expect({ ...d.update(0.2, ZERO_SYNC) }).toEqual({ from: 'glitch', to: null, mix: 0 })
    d.next()
    expect({ ...d.update(0.3, ZERO_SYNC) }).toEqual({ from: 'glitch', to: 'tunnel', mix: 0 }) // wraps after glitch
  })
})

// Fps independence: the shot is a function of time, whatever the frame times. The defaults schedule a switch every
// `every` (s or bars) from 0, fading over `fade`. Frames within 1e-6 of a fade's end are skipped (float noise there).
function scheduled(x: number, every: number, fade: number): Shot | null {
  const k = Math.floor(x / every)
  const phase = x - every * k
  if (Math.abs(phase - fade) < 1e-6) return null
  return k > 0 && phase < fade
    ? { from: playlist[(k - 1) % 4], to: playlist[k % 4], mix: phase / fade }
    : { from: playlist[k % 4], to: null, mix: 0 }
}
let seed = 7
const jittered = [0]
while (jittered.length < 4000) {
  seed = (seed * 16807) % 2147483647 // deterministic
  jittered.push(jittered.at(-1)! + 0.004 + (0.036 * seed) / 2147483647) // 4–40 ms frames
}
const clocks: [string, number[]][] = [
  ...[24, 60, 144].map((fps): [string, number[]] => [`${fps} fps`, Array.from({ length: 100 * fps }, (_, i) => i / fps)]),
  ['jittered 4–40 ms frames', jittered],
]
const at128 = (t: number): Sync => ({ bpm: 128, beat: 1.2 + (t * 128) / 60, bar: 0.3 + (t * 128) / 240, confidence: 0.9 })
const timelines: [string, (t: number) => Sync, (t: number) => Shot | null][] = [
  ['time fallback', () => ZERO_SYNC, (t) => scheduled(t, 30, 2)],
  ['bar lines at 128 BPM', at128, (t) => scheduled(at128(t).bar, 16, 1)],
]

describe.each(timelines)('fps independence: %s', (_, sync, want) => {
  test.each(clocks)('%s', (_, times) => {
    const d = createDirector(playlist)
    const bad: unknown[] = []
    for (const t of times) {
      const got = { ...d.update(t, sync(t)) }
      const w = want(t)
      if (w && (got.from !== w.from || got.to !== w.to || Math.abs(got.mix - w.mix) > 1e-6)) bad.push({ t, got, w })
    }
    expect(bad.slice(0, 3)).toEqual([])
  })
})
