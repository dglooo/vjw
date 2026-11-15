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
      out.push({ low: held[1] + held[3], high, total: rms(x.subarray(e - FRAME, e)), kick, beat: bpm && ((now - T0) * bpm) / 60, cuts: true, now })
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

test('a kick-only drop never fires: the kick-only path is gone (drop v2 (1); it fired on the 2nd kick)', () => {
  const techno = arrangement({ genre: 'techno', groove: 12, after: 4, bass: false }) // the bass doesn't come back
  expect(fires(run(inputs(mix(techno), 128)))).toEqual([])
})

test('3 min of groove: never sparse, no drop', () => {
  const loop = mainIn.filter((f) => f.now >= T0 && f.now < T0 + 15 * BAR) // whole bars, so it repeats seamlessly
  const frames = Array.from({ length: 9 }, (_, k) => loop.map((f) => ({ ...f, now: f.now + k * 15 * BAR, beat: f.beat! + k * 60 }))).flat()
  const r = run(frames)
  expect(r.at(-1)!.now).toBeGreaterThan(180)
  expect(r.some((f) => f.sparse || f.fired !== null)).toBe(false)
})

/** Synthetic frames, 60 fps at 120 BPM (beat = 2·now: a confident sync). Each part lasts `s` s at a constant `low`
 *  (`bump`: lifted to 1 for 50 ms on each kick instead), `high` (× `rise` per s), `total`, a kick every `kick` beats, `cuts`. */
interface Part { s: number; low?: number; high?: number; rise?: number; total?: number; kick?: number; bump?: boolean; cuts?: boolean }
function song(...parts: Part[]): ArrangeIn[] {
  const out: ArrangeIn[] = []
  let [t0, kickAt] = [0, -Infinity]
  for (const { s, low = 1, high = 1, rise = 1, total = 0.1, kick = 0, bump = false, cuts = true } of parts) {
    for (let i = 0; i < Math.round(s * 60); i++) {
      const now = t0 + i / 60
      const k = kick > 0 && i % (30 * kick) === 0
      if (k) kickAt = now
      out.push({ low: bump && now - kickAt < 0.05 ? 1 : low, high: high * rise ** (i / 60), total, kick: k, beat: 2 * now, cuts, now })
    }
    t0 += s
  }
  return out
}
const GROOVE: Part = { s: 30, kick: 1 } // G = 1
const BREAK: Part = { s: 10, low: 0.02, total: 0.003 } // room tone only, above the −60 dBFS silence floor
const DROP: Part = { s: 10, kick: 1 }
const AFTER = [GROOVE, BREAK, { ...DROP, s: 25 }] // a first drop at 40.1 s ends the intro; its refractory is over by 60 s
const fired = (...parts: Part[]) => fires(run(song(...parts))).map((f) => f.fired!)

test('each drop rule blocks just past its edge (sparse, arming, grace, return ratio and its ref, G share, sustain, kick, refractory, warm-up, silence; no kick-only path; a cut keeps the peak; a deep cut arms)', () => {
  const cases: [string, Part[], number][] = [
    ['base', [GROOVE, BREAK, DROP], 1],
    ['sparse: a break at 0.4 G', [GROOVE, { ...BREAK, low: 0.4 }, { ...DROP, low: 2.4 }], 1],
    // after a first drop (in the intro a short break is no run ≥ `arm`, and the intro fires on it: 7a). At sparse .6 the
    // run starts ~.55 s into the break and lasts ~.5 s into the return, so a 6 s break arms as the return goes on (cuts
    // off: this deep a break arms as a cut, below)
    ['arm: a 5.5 s break is sparse ~5.5 s', [...AFTER, { ...BREAK, s: 5.5, cuts: false }, { ...DROP, cuts: false }], 1],
    ['arm: 8 s', [...AFTER, { ...BREAK, s: 8, cuts: false }, { ...DROP, cuts: false }], 2],
    // drop v2 (2) + D1: low smoothed τ .1 s under .3 G (G drifts to ≈ .98 before the run, ≈ .95 in it) for ≥ 1.5 s arms mid-groove (Andy C 91.0, 157.2)
    ['cut: 2.5 s at .03 G', [...AFTER, { ...BREAK, s: 2.5, low: 0.03 }, DROP], 2],
    ['cut: 1.4 s', [...AFTER, { ...BREAK, s: 1.4, low: 0.03 }, DROP], 1],
    ['cut: 1.6 s', [...AFTER, { ...BREAK, s: 1.6, low: 0.03 }, DROP], 2],
    ['cut: at .32 G', [...AFTER, { ...BREAK, s: 2.5, low: 0.32 }, { ...DROP, low: 2 }], 1], // the return at 2: ≥ 4 × the cut
    ['cut: at .26 G', [...AFTER, { ...BREAK, s: 2.5, low: 0.26 }, { ...DROP, low: 2 }], 2],
    ['cut: off under Dubstep', [...AFTER, { ...BREAK, s: 2.5, low: 0.03, cuts: PRESETS.dubstep.cuts !== false }, { ...DROP, cuts: PRESETS.dubstep.cuts !== false }], 1],
    ['cut: a stopped deck is no cut', [...AFTER, { ...BREAK, s: 2.5, low: 0, total: 0 }, DROP], 1],
    ['ret: break at 0.25, back at 0.9 (3.6×)', [GROOVE, { ...BREAK, low: 0.25 }, { ...DROP, low: 0.9 }], 0],
    ['ret: back at 1.2 (4.8×)', [GROOVE, { ...BREAK, low: 0.25 }, { ...DROP, low: 1.2 }], 1],
    // drop v2 (3): ref = the quieter of the section's mean and `slow`, so a cut quieter than the break counts
    ['ref: a break at 0.3, back at 1.0 (3.3×)', [GROOVE, { ...BREAK, low: 0.3 }, { ...DROP, low: 1 }], 0],
    ['ref: a 1.5 s cut at 0.02 between them', [GROOVE, { ...BREAK, low: 0.3 }, { ...BREAK, s: 1.5 }, { ...DROP, low: 1 }], 1],
    ['back: 0.5 G', [GROOVE, BREAK, { ...DROP, low: 0.5 }], 0],
    ['back: 0.7 G', [GROOVE, BREAK, { ...DROP, low: 0.7 }], 1],
    ['grace: a 6 G drop ends sparse before `sustain`', [GROOVE, BREAK, { ...DROP, low: 6 }], 1],
    // a bass-carrying build (0.7: not sparse, under ret × the break's mean) ends sparse ~0.8 s in; the drop after it
    ['grace: a 7 s bass build, then the drop', [GROOVE, { ...BREAK, low: 0.2 }, { s: 7, low: 0.7 }, { ...DROP, low: 1.5 }], 1],
    ['grace: a 10 s bass build', [GROOVE, { ...BREAK, low: 0.2 }, { s: 10, low: 0.7 }, { ...DROP, low: 1.5 }], 0],
    // a missed drop (no kick) and then two dips: a run shorter than `arm` doesn't refresh `armed` (chained, it fires ≈ .7;
    // cuts off: the 1.5 s dip sits on the cut's edge)
    ['grace: groove dips after a missed drop', [GROOVE, { ...BREAK, rise: 1.3 }, { s: 5, kick: 0 }, { ...BREAK, s: 1 }, { s: 4, kick: 0 }, { ...BREAK, s: 1.5, cuts: false }, DROP], 0],
    // drop v2 (7b), Bicep 176.5: a riser break, a bass build, then a cut that starts while armed keeps the riser's peak
    ['peak: a 1.5 s cut after a 3 s bass build', [GROOVE, { ...BREAK, rise: 1.3 }, { s: 3, low: 0.7 }, { ...BREAK, s: 1.5 }, DROP], 1],
    // …and a 0.5 s cut, sparse ≈ .1 s before the return: the return's own frames stay out of that run's mean
    ['peak: a 0.5 s cut', [GROOVE, { ...BREAK, rise: 1.3 }, { s: 3, low: 0.9 }, { ...BREAK, s: 0.5 }, DROP], 1],
    ['sustain: a lone kick lifting low for 50 ms', [GROOVE, BREAK, { ...BREAK, s: 0.5, kick: 1, bump: true }, { ...BREAK, s: 5 }], 0],
    ['near: the low end back without a kick', [GROOVE, BREAK, { ...DROP, kick: 0 }], 0],
    // drop v2 (1): the kick-only path (two kick-backed rises through back × G within 1.2 beats) is gone
    ['no kick-only path: kicks lifting low every beat', [GROOVE, BREAK, { ...DROP, low: 0.02, bump: true }], 0],
    ['no kick-only path: kicks over a partial bass (Bicep 167.2)', [GROOVE, { ...BREAK, low: 0.2 }, { ...DROP, low: 0.5, bump: true }], 0],
    ['refractory: two drops 10 s apart (its grace ends first)', [GROOVE, BREAK, { ...DROP, s: 1 }, { ...BREAK, s: 9 }, DROP], 1],
    ['refractory: 22 s apart', [GROOVE, BREAK, { ...DROP, s: 12 }, BREAK, DROP], 2],
    // a stopped deck in the intro: neither a breakdown nor a cut for `ref` on play
    ['silence: a stopped deck is no breakdown', [GROOVE, { ...BREAK, total: 0 }, DROP], 0],
  ]
  for (const [name, parts, n] of cases) expect(fired(...parts), name).toHaveLength(n)
  expect(fired(...AFTER, { ...BREAK, s: 2.5, low: 0.03 }, DROP)[1]).toBeGreaterThanOrEqual(0.6) // the cut counts as a full build: it cuts
  // These edges only show as `sparse`: on fires the intro's `ref` = `slow` fires the same deep cut either way (7a).
  // sparse .6 (drop v2 (5)): G follows the break down (τ 20 s) while `slow` falls (τ 1 s): a break at 0.55 G never reads sparse
  const sparseIn = (...parts: Part[]) => run(song(...parts)).some((f) => f.sparse)
  expect(sparseIn(GROOVE, { ...BREAK, low: 0.5 })).toBe(true)
  expect(sparseIn(GROOVE, { ...BREAK, low: 0.55 })).toBe(false)
  expect(sparseIn({ ...GROOVE, s: 10 }, BREAK)).toBe(false) // warmup: G from 10 s of groove isn't trusted yet
  // 18 s apart: still in its grace, the second fires as the refractory ends (ceiling: a blocked drop runs ≤ GRACE late)
  const [a, b] = fires(run(song(GROOVE, BREAK, { ...DROP, s: 8 }, BREAK, DROP)))
  expect(b.now - a.now).toBeCloseTo(20, 1)
  // a hidden tab: 60 s without frames, 3 s into that 5.5 s break, is not 60 s of breakdown
  const gap = song(...AFTER, { ...BREAK, s: 5.5, cuts: false }, { ...DROP, cuts: false }).map((f) => (f.now < 68 ? f : { ...f, now: f.now + 60, beat: f.beat! + 120 }))
  expect(fires(run(gap))).toHaveLength(1) // the first drop only
})

test('build decays (τ 1 s) when a breakdown ends without a drop', () => {
  // too short to arm, and the low end comes back without a kick (in the intro a 4 s cut and a kick fire: (7a), `ref`); the
  // groove keeps the riser's last `high` (a riser cut at the return would already have pulled build under 0.1)
  const r = run(song(GROOVE, { ...BREAK, s: 4, rise: 1.3 }, { ...GROOVE, kick: 0, high: 1.3 ** 4 }))
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

test('D1: a cut counts on `low` smoothed τ 0.1 s under .3 G: a shallow cut with a one-frame blip arms (Napes 248.5, Bad Co 176.5); an in-groove .8 s dip does not', () => {
  const blip = [{ ...BREAK, s: 1.2, low: 0.2 }, { ...BREAK, s: 1 / 60, low: 0.5 }, { ...BREAK, s: 1.2, low: 0.2 }] // G ≈ .95
  expect(fired(...AFTER, ...blip, DROP)).toHaveLength(2) // raw low under .2 G (master) or .3 G: two 1.2 s runs, no arm
  expect(fired(...AFTER, { ...BREAK, s: 0.8 }, DROP)).toHaveLength(1) // the first drop only
})

test('D2: an intro return fires only with a beat grid at its kick (Sandstorm 18.2: a bare bass entry); the live path keeps its no-grid fire', () => {
  const intro: Part = { s: 30, low: 0.02, kick: 2, bump: true }
  expect(fired(intro, DROP)).toHaveLength(1)
  expect(fires(run(song(intro, DROP).map((f) => ({ ...f, beat: null }))))).toEqual([])
  expect(fires(run(song(GROOVE, BREAK, DROP).map((f) => ({ ...f, beat: null }))))).toHaveLength(1)
})

test('D3′: the fire stays instant; its cut comes 0.5 s later, only if low / G averaged ≥ `back` over the wait (a 0.3 s stab cuts nothing)', () => {
  for (const [s, cuts] of [[10, 1], [0.5, 1], [0.3, 0]] as const) {
    const r = run(song(GROOVE, BREAK, { ...DROP, s }, { ...BREAK, s: 5 }))
    const [f] = fires(r)
    const c = r.filter((x) => x.confirmed !== null)
    expect(fires(r), `${s} s`).toHaveLength(1)
    expect(c, `${s} s`).toHaveLength(cuts)
    if (!cuts) continue
    expect(c[0].confirmed).toBe(f.fired)
    expect(c[0].now - f.now).toBeGreaterThanOrEqual(0.5)
    expect(c[0].now - f.now).toBeLessThan(0.5 + 1 / 60) // the first frame past the wait
  }
})

test('confidence rises with the break length, the return ratio, beat alignment and the build', () => {
  // no floor: the formula; cuts off unless a part says so (a deep break would read as a full build: see below)
  const raw = (...parts: Part[]) => fires(run(song(...parts.map((p) => ({ cuts: false, ...p }))), { minConf: 0 })).map((f) => f.fired!)
  const [c] = raw(GROOVE, BREAK, DROP)
  expect(raw(GROOVE, { ...BREAK, s: 16 }, DROP)[0]).toBeGreaterThan(c + 0.05)
  expect(raw(GROOVE, { ...BREAK, low: 0.2 }, DROP)[0]).toBeLessThan(c - 0.05) // 5×, not 50×
  expect(raw(GROOVE, { ...BREAK, s: 10.25 }, DROP)[0]).toBeCloseTo(c - 0.25, 1) // kicks on the off-beat
  expect(fires(run(song(GROOVE, { ...BREAK, cuts: false }, { ...DROP, cuts: false }).map((f) => ({ ...f, beat: null }))))[0].fired).toBeCloseTo(c - 0.125, 2)
  expect(raw(GROOVE, { ...BREAK, rise: 1.3 }, DROP)[0]).toBeGreaterThan(c + 0.05) // a riser
  // …but its peak doesn't carry into a later break that starts unarmed (only a cut inside its grace keeps it: 7b)
  expect(raw(GROOVE, { ...BREAK, rise: 1.3 }, { s: 10, kick: 0 }, BREAK, DROP)[0]).toBeCloseTo(c, 1)
  // drop v2 (2): a deep cut counts as a full build (a riser that pins build at 1)…
  expect(raw(GROOVE, { ...BREAK, cuts: true }, DROP)[0]).toBeCloseTo(raw(GROOVE, { ...BREAK, rise: 2 }, DROP)[0], 2)
  // …but not before `warmup` (G isn't trusted: the intro still fires on that cut through `ref`, 7a, without the build)
  expect(raw({ ...GROOVE, s: 10 }, { ...BREAK, s: 2.5, cuts: true }, DROP)).toEqual(raw({ ...GROOVE, s: 10 }, { ...BREAK, s: 2.5 }, DROP))
  // …and its drop ends `armed`, so that build doesn't carry into a break starting 3 s after it (it did through GRACE: 7b)
  expect(raw(GROOVE, { ...BREAK, cuts: true }, { ...DROP, s: 3 }, { ...BREAK, s: 20 }, DROP)[1]).toBeCloseTo(raw(GROOVE, { ...BREAK, s: 20 }, DROP)[0], 2)
  // the ratio is to `ref` too (drop v2 (3)): a 3 s cut ends this 0.5 G break, and the low end comes back at only 0.7
  // (`ref` = `slow` ≈ .09 at the hit; against the run's mean, ≈ .4, it would read ≈ .52)
  expect(raw(GROOVE, { ...BREAK, low: 0.5 }, { ...BREAK, s: 3 }, { ...DROP, low: 0.7 })[0]).toBeGreaterThan(0.6)
  const [soft] = fired(GROOVE, { ...BREAK, low: 0.22, cuts: false }, { ...DROP, cuts: false }) // over the floor, too weak to cut (cuts off: at .22 G it's a deep cut, a full build)
  expect(soft).toBeGreaterThanOrEqual(0.56)
  expect(soft).toBeLessThan(0.6)
})

test("minConf: a weak drop (0.43, as Rumble's 70.6 s growl) is ignored and starts no refractory; the real one 11 s later fires", () => {
  // the first return's kicks are off the beat; the real drop at 49 s is still armed (GRACE) when a refractory from 38.35 s
  // would open, so without the floor it is swallowed, not late
  const parts = [GROOVE, { ...BREAK, s: 8.25, cuts: false }, { ...DROP, s: 0.75, cuts: false }, BREAK, DROP] // cuts off: a full build isn't weak
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

test('a bass-less intro is the breakdown, through cuts shorter than `arm`: its drop fires; a teaser kick in it, a short intro, a groove start with dips or a later jump never', () => {
  // drums, no bass, a kick bleeding into `low` every 2 beats: G is learned on it, so it never reads sparse
  const INTRO: Part = { s: 30, low: 0.02, kick: 2, bump: true }
  const TEASE: Part = { ...INTRO, s: 1, kick: 1 } // two kicks a beat apart, each lifting low through back × G: the old kick-only path's shape
  const f = fires(run(song(INTRO, TEASE, DROP)))
  expect(f).toHaveLength(1) // not on the teaser: the intro arms (a) only
  expect(f[0].now - 31).toBeGreaterThan(0)
  expect(f[0].now - 31).toBeLessThan(0.5)
  expect(f[0].fired).toBeGreaterThanOrEqual(0.6)
  expect(run(song(INTRO, TEASE, DROP)).some((x) => x.sparse || x.build > 0)).toBe(false) // the classifier keeps judging
  expect(fired(GROOVE, BREAK, TEASE)).toEqual([]) // the same teaser after a real breakdown: the old kick-only path
  expect(fired({ ...INTRO, s: 5 }, DROP)).toEqual([]) // arm: 5 s of intro
  expect(fired({ ...INTRO, s: 7 }, DROP)).toHaveLength(1) // 7 s
  // a groove start with 0.8 s dips (in-groove dips are ≤ .85 s): 4 × `slow` stays over the return (drop v2 (3))
  expect(fired(...Array.from({ length: 15 }, () => [{ ...GROOVE, s: 3.2 }, { ...BREAK, s: 0.8 }]).flat())).toEqual([])
  expect(fired(INTRO, { ...DROP, s: 25 }, { ...DROP, low: 5 })).toHaveLength(1) // the intro ends at its drop
  // drop v2 (7a), Kanine 44.3 / Andy C 46.9: a 1.5 s pre-drop cut reads sparse, but the intro lives on through it (it
  // used to become a 1 s section that never arms), and build follows that run, not the intro's 30 s
  const cut = run(song(INTRO, { ...BREAK, s: 1.5 }, DROP))
  expect(cut.some((x) => x.sparse)).toBe(true)
  expect(Math.max(...cut.map((x) => x.build))).toBeLessThan(0.05) // measured .031
  const [d] = fires(cut)
  expect(d.now - 31.5).toBeGreaterThan(0)
  expect(d.now - 31.5).toBeLessThan(0.5)
  expect(d.fired).toBeGreaterThanOrEqual(0.6)
  expect(fired(INTRO, BREAK, { ...INTRO, s: 10 }, DROP)).toEqual([]) // …and ends at the first run ≥ `arm` (here past its grace)
})
