import FFT from 'fft.js'
import { expect, test } from 'vitest'
import { createArrangement, shouldCut, type ArrangeIn, type ArrangeOpts } from './arrange'
import { createBank } from './bands'
import { createDrums } from './drums'
import { rms } from './energy'
import { PRESETS } from './presets'
import { arrangement, mix, SR, T0 } from './synth'

const N = 512 // the worklet's FFT (as drums.test.ts), hop and render quantum; one frame per 6 quanta, 62.5 fps
const HOP = 256
const Q = 128
const FRAME = 6 * Q
const HZ = SR / N
const hann = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N))

/** One ArrangeIn per frame of `x` through the worklet's DSP: low = held of the preset's sub + reese bands (bands.ts),
 *  kick = a drums.ts kick this frame, high = the mean 4–16 kHz magnitude of the last hop, total = the frame's RMS.
 *  `bpm` = a confident sync on the fixture's grid (beat 0 at T0); null = no sync. */
function inputs(x: Float32Array, bpm: number | null): ArrangeIn[] {
  const bank = createBank(SR)
  const { sub, reese } = PRESETS.dnb.bands
  // + analysis.ts's kick gate band: drums.ts's kick trigger
  bank.configure([{ id: 'sub', lo: sub[0], hi: sub[1] }, { id: 'reese', lo: reese[0], hi: reese[1] }, { id: 'kick', lo: 40, hi: 150 }])
  const drums = createDrums(SR, N)
  const fft = new FFT(N)
  const [spec, frame, mag, held] = [new Float64Array(2 * N), new Float64Array(N), new Float32Array(N / 2 + 1), new Float32Array(6)]
  const [lo, hi] = [Math.ceil(4000 / HZ), Math.floor(16000 / HZ)]
  const out: ArrangeIn[] = []
  let [kick, high] = [false, 0]
  for (let e = Q; e <= x.length; e += Q) {
    bank.process(x.subarray(e - Q, e))
    if (e % HOP === 0) {
      for (let i = 0; i < N; i++) frame[i] = (x[e - N + i] ?? 0) * hann[i]
      fft.realTransform(spec, frame)
      for (let k = 0; k <= N / 2; k++) mag[k] = Math.hypot(spec[2 * k], spec[2 * k + 1])
      if (drums.detect(mag, e / SR, bank.ratio(2)).some((h) => h.drum === 'kick')) kick = true
      high = mag.subarray(lo, hi + 1).reduce((s, v) => s + v, 0) / (hi - lo + 1)
    }
    if (e % FRAME === 0) {
      bank.read(held)
      const now = e / SR
      out.push({ low: held[1] + held[3], high, total: rms(x.subarray(e - FRAME, e)), kick, beat: bpm && ((now - T0) * bpm) / 60, now })
      kick = false
    }
  }
  return out
}

const run = (frames: readonly ArrangeIn[], opts?: Partial<ArrangeOpts>) => {
  const a = createArrangement(opts)
  return frames.map((f) => ({ now: f.now, ...a.update(f) }))
}
const fires = (r: ReturnType<typeof run>) => r.filter((f) => f.fired !== null)

const BEAT = 60 / 174
const BAR = 4 * BEAT
const main = arrangement() // 16 dnb bars, an 8-bar breakdown (riser + snare roll), the drop
const mainIn = inputs(mix(main), 174)
const mainOut = run(mainIn)
const at = (r: ReturnType<typeof run>, t: number) => r.findLast((f) => f.now <= t)!

test('the drop fires once, within a beat of its first kick, at confidence ≥ 0.6 (with sync or without)', () => {
  for (const r of [mainOut, run(mainIn.map((f) => ({ ...f, beat: null })))]) {
    const f = fires(r) // one: nothing on the snare roll, whose bare snares drums.ts reads as kicks
    expect(f).toHaveLength(1)
    expect(f[0].now - main.drop).toBeGreaterThan(0)
    expect(f[0].now - main.drop).toBeLessThanOrEqual(BEAT) // measured 0.265 s: held's gate lag + `sustain`
    expect(f[0].fired).toBeGreaterThanOrEqual(0.6) // measured 0.82 with sync, 0.71 without
  }
})

test('build rises through the breakdown to ≥ 0.5; heat trails it; both are 0 a second after the drop', () => {
  expect(mainOut.filter((f) => f.now < main.start).every((f) => f.build === 0 && !f.sparse)).toBe(true)
  const builds = [2, 3, 4, 5, 6, 7, 8].map((b) => at(mainOut, main.start + b * BAR).build) // bar ends
  builds.slice(1).forEach((b, i) => expect(b).toBeGreaterThan(builds[i])) // measured 0, .26, .45, .57, .62, .66, .69
  expect(builds.at(-1)).toBeGreaterThanOrEqual(0.5)
  for (const b of [3, 4, 5]) expect(at(mainOut, main.start + b * BAR).heat).toBeLessThan(at(mainOut, main.start + b * BAR).build)
  const [f] = fires(mainOut)
  expect(f.heat).toBeGreaterThan(0.5)
  expect(f.build).toBe(0)
  expect(f.drop).toBe(f.fired)
  expect(at(mainOut, f.now + 0.5).heat).toBeCloseTo(f.heat / 2, 1) // a linear fall, not a cut
  const after = mainOut.find((x) => x.now >= f.now + 1)!
  expect(after.heat).toBe(0)
  expect(after.drop).toBeCloseTo(f.fired! * Math.exp(f.now - after.now), 6) // τ 1 s
})

test('no drop on a teaser kick (inside the 16th roll) or on a 2-bar break', () => {
  const teaser = arrangement({ teaser: 7 })
  expect(fires(run(inputs(mix(teaser), 174))).map((f) => f.now > teaser.drop)).toEqual([true])
  expect(fires(run(inputs(mix(arrangement({ brk: 2 })), 174)))).toEqual([])
})

test('a kick-only drop fires on its second kick (path b), not on its first', () => {
  const techno = arrangement({ genre: 'techno', groove: 12, after: 4, bass: false }) // the bass doesn't come back
  const f = fires(run(inputs(mix(techno), 128)))
  expect(f).toHaveLength(1)
  expect(f[0].now - techno.drop).toBeGreaterThan(60 / 128) // measured 1 beat + 0.135 s: the 2nd kick's held lag
  expect(f[0].now - techno.drop).toBeLessThan(60 / 128 + 0.2)
  expect(f[0].fired).toBeGreaterThanOrEqual(0.6)
})

test('3 min of groove: never sparse, no drop', () => {
  const loop = mainIn.filter((f) => f.now >= T0 && f.now < T0 + 15 * BAR) // whole bars, so it repeats seamlessly
  const frames = Array.from({ length: 9 }, (_, k) => loop.map((f) => ({ ...f, now: f.now + k * 15 * BAR, beat: f.beat! + k * 60 }))).flat()
  const r = run(frames)
  expect(r.at(-1)!.now).toBeGreaterThan(180)
  expect(r.some((f) => f.sparse || f.fired !== null)).toBe(false)
})

/** Synthetic frames, 60 fps at 120 BPM (beat = 2·now: a confident sync). Each part lasts `s` s at a constant `low`
 *  (`bump`: lifted to 1 for 50 ms on each kick instead), `high` (× `rise` per s), `total`, a kick every `kick` beats. */
interface Part { s: number; low?: number; high?: number; rise?: number; total?: number; kick?: number; bump?: boolean }
function song(...parts: Part[]): ArrangeIn[] {
  const out: ArrangeIn[] = []
  let [t0, kickAt] = [0, -Infinity]
  for (const { s, low = 1, high = 1, rise = 1, total = 0.1, kick = 0, bump = false } of parts) {
    for (let i = 0; i < Math.round(s * 60); i++) {
      const now = t0 + i / 60
      const k = kick > 0 && i % (30 * kick) === 0
      if (k) kickAt = now
      out.push({ low: bump && now - kickAt < 0.05 ? 1 : low, high: high * rise ** (i / 60), total, kick: k, beat: 2 * now, now })
    }
    t0 += s
  }
  return out
}
const GROOVE: Part = { s: 30, kick: 1 } // G = 1
const BREAK: Part = { s: 10, low: 0.02, total: 0.003 } // room tone only, above the −60 dBFS silence floor
const DROP: Part = { s: 10, kick: 1 }
const fired = (...parts: Part[]) => fires(run(song(...parts))).map((f) => f.fired!)

test('each drop rule blocks just past its edge (sparse, arming, grace, return ratio, G share, sustain, kick, refractory, warm-up, silence)', () => {
  const cases: [string, Part[], number][] = [
    ['base', [GROOVE, BREAK, DROP], 1],
    // G follows the break down (τ 20 s) while `slow` falls (τ 1 s): a break at 0.45 G never reads sparse either
    ['sparse: a break at 0.4 G', [GROOVE, { ...BREAK, low: 0.4 }, { ...DROP, low: 2.4 }], 1],
    ['sparse: at 0.5 G', [GROOVE, { ...BREAK, low: 0.5 }, { ...DROP, low: 2.4 }], 0],
    ['arm: a 6 s break is sparse ~5.3 s', [GROOVE, { ...BREAK, s: 6 }, DROP], 0],
    ['arm: 8 s', [GROOVE, { ...BREAK, s: 8 }, DROP], 1],
    ['ret: break at 0.25, back at 0.9 (3.6×)', [GROOVE, { ...BREAK, low: 0.25 }, { ...DROP, low: 0.9 }], 0],
    ['ret: back at 1.2 (4.8×)', [GROOVE, { ...BREAK, low: 0.25 }, { ...DROP, low: 1.2 }], 1],
    ['back: 0.5 G', [GROOVE, BREAK, { ...DROP, low: 0.5 }], 0],
    ['back: 0.7 G', [GROOVE, BREAK, { ...DROP, low: 0.7 }], 1],
    ['grace: a 6 G drop ends sparse before `sustain`', [GROOVE, BREAK, { ...DROP, low: 6 }], 1],
    // a bass-carrying build (0.7: not sparse, under ret × the break's mean) ends sparse ~0.8 s in; the drop after it
    ['grace: a 7 s bass build, then the drop', [GROOVE, { ...BREAK, low: 0.2 }, { s: 7, low: 0.7 }, { ...DROP, low: 1.5 }], 1],
    ['grace: a 10 s bass build', [GROOVE, { ...BREAK, low: 0.2 }, { s: 10, low: 0.7 }, { ...DROP, low: 1.5 }], 0],
    ['sustain: a lone kick lifting low for 50 ms', [GROOVE, BREAK, { ...BREAK, s: 0.5, kick: 1, bump: true }, { ...BREAK, s: 5 }], 0],
    ['near: the low end back without a kick', [GROOVE, BREAK, { ...DROP, kick: 0 }], 0],
    ['beats: kick-only, a kick every beat', [GROOVE, BREAK, { ...DROP, low: 0.02, bump: true }], 1],
    ['beats: kick-only, every 2 beats', [GROOVE, BREAK, { ...DROP, low: 0.02, bump: true, kick: 2 }], 0],
    ['refractory: two drops 10 s apart (its grace ends first)', [GROOVE, BREAK, { ...DROP, s: 1 }, { ...BREAK, s: 9 }, DROP], 1],
    ['refractory: 22 s apart', [GROOVE, BREAK, { ...DROP, s: 12 }, BREAK, DROP], 2],
    ['warmup: 10 s of groove', [{ ...GROOVE, s: 10 }, BREAK, DROP], 0],
    ['silence: a stopped deck is no breakdown', [GROOVE, { ...BREAK, total: 0 }, DROP], 0],
  ]
  for (const [name, parts, n] of cases) expect(fired(...parts), name).toHaveLength(n)
  // 18 s apart: still in its grace, the second fires as the refractory ends (ceiling: a blocked drop runs ≤ GRACE late)
  const [a, b] = fires(run(song(GROOVE, BREAK, { ...DROP, s: 8 }, BREAK, DROP)))
  expect(b.now - a.now).toBeCloseTo(20, 1)
  // a hidden tab: 60 s without frames, 3 s into that 6 s break, is not 60 s of breakdown
  const gap = song(GROOVE, { ...BREAK, s: 6 }, DROP).map((f) => (f.now < 33 ? f : { ...f, now: f.now + 60, beat: f.beat! + 120 }))
  expect(fires(run(gap))).toEqual([])
})

test('build decays (τ 1 s) when a breakdown ends without a drop', () => {
  // too short to arm; the groove keeps the riser's last `high` (at sparse .5 the section ends ~0.7 s into it: a riser cut
  // at the return would already have pulled build under 0.1)
  const r = run(song(GROOVE, { ...BREAK, s: 4, rise: 1.3 }, { ...GROOVE, high: 1.3 ** 4 }))
  const i = r.findLastIndex((f) => f.sparse)
  expect(fires(r)).toEqual([])
  expect(r[i].build).toBeGreaterThan(0.1)
  expect(r[i + 30].build).toBeCloseTo(r[i].build * Math.exp(-0.5), 3) // 0.5 s later
})

test('shouldCut: a confident drop (≥ 0.6) cuts, weak or missing never, and a hold blocks even a confident one', () => {
  for (const hold of [false, true]) {
    expect(shouldCut(0.6, hold)).toBe(!hold) // at the bound
    expect(shouldCut(0.59, hold)).toBe(false) // just below
    expect(shouldCut(0.9, hold)).toBe(!hold) // confident
    expect(shouldCut(null, hold)).toBe(false) // no drop this frame
  }
})

test('confidence rises with the break length, the return ratio, beat alignment and the build', () => {
  const raw = (...parts: Part[]) => fires(run(song(...parts), { minConf: 0 })).map((f) => f.fired!) // no floor: the formula
  const [c] = raw(GROOVE, BREAK, DROP)
  expect(raw(GROOVE, { ...BREAK, s: 16 }, DROP)[0]).toBeGreaterThan(c + 0.05)
  expect(raw(GROOVE, { ...BREAK, low: 0.2 }, DROP)[0]).toBeLessThan(c - 0.05) // 5×, not 50×
  expect(raw(GROOVE, { ...BREAK, s: 10.25 }, DROP)[0]).toBeCloseTo(c - 0.25, 1) // kicks on the off-beat
  expect(fires(run(song(GROOVE, BREAK, DROP).map((f) => ({ ...f, beat: null }))))[0].fired).toBeCloseTo(c - 0.125, 2)
  expect(raw(GROOVE, { ...BREAK, rise: 1.3 }, DROP)[0]).toBeGreaterThan(c + 0.05) // a riser
  const [soft] = fired(GROOVE, { ...BREAK, low: 0.2 }, DROP) // over the floor, too weak to cut
  expect(soft).toBeGreaterThanOrEqual(0.56)
  expect(soft).toBeLessThan(0.6)
})

test("minConf: a weak drop (0.43, as Rumble's 70.6 s growl) is ignored and starts no refractory; the real one 11 s later fires", () => {
  // the first return's kicks are off the beat; the real drop at 49 s is still armed (GRACE) when a refractory from 38.35 s
  // would open, so without the floor it is swallowed, not late
  const parts = [GROOVE, { ...BREAK, s: 8.25 }, { ...DROP, s: 0.75 }, BREAK, DROP]
  const [weak, ...rest] = fires(run(song(...parts), { minConf: 0 }))
  expect(weak.fired).toBeCloseTo(0.43, 1)
  expect(rest).toEqual([]) // without the floor its refractory swallows the real drop
  const f = fires(run(song(...parts)))
  expect(f).toHaveLength(1)
  expect(f[0].now - 49).toBeGreaterThan(0)
  expect(f[0].now - 49).toBeLessThan(0.5)
  expect(f[0].fired).toBeGreaterThanOrEqual(0.6)
  expect(fires(run(song(...parts), { minConf: weak.fired! }))[0].now).toBe(weak.now) // the bound fires
})

test("a bass-less intro is (a)'s breakdown: its drop fires; a teaser kick in it, a short intro, a groove start or a later jump never", () => {
  // drums, no bass, a kick bleeding into `low` every 2 beats: G is learned on it, so it never reads sparse
  const INTRO: Part = { s: 30, low: 0.02, kick: 2, bump: true }
  const TEASE: Part = { ...INTRO, s: 1, kick: 1 } // two kicks a beat apart, each lifting low through back × G: (b)'s shape
  const f = fires(run(song(INTRO, TEASE, DROP)))
  expect(f).toHaveLength(1) // not on the teaser: the intro arms (a) only
  expect(f[0].now - 31).toBeGreaterThan(0)
  expect(f[0].now - 31).toBeLessThan(0.5)
  expect(f[0].fired).toBeGreaterThanOrEqual(0.6)
  expect(run(song(INTRO, TEASE, DROP)).some((x) => x.sparse || x.build > 0)).toBe(false) // the classifier keeps judging
  expect(fired(GROOVE, BREAK, TEASE)).toHaveLength(1) // the same teaser after a real breakdown: (b)
  expect(fired({ ...INTRO, s: 5 }, DROP)).toEqual([]) // arm: 5 s of intro
  expect(fired({ ...INTRO, s: 7 }, DROP)).toHaveLength(1) // 7 s
  expect(fired({ ...GROOVE, s: 60 })).toEqual([]) // a groove from the start
  expect(fired(INTRO, { ...DROP, s: 25 }, { ...DROP, low: 5 })).toHaveLength(1) // the intro ends at its drop
})
