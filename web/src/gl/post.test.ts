import { describe, expect, test } from 'vitest'
import { evaluate, type Binding, type Sources } from '../bind'
import { donorChain, SYN_BIND } from '../fx/syn'
import { boundStep, flashGate, postFor, type Chain, type FlashState } from './post'

const NONE = Infinity // no drop yet
const gain = (heat: number, beat: number, conf: number, bpm = 60) => postFor(heat, NONE, beat, bpm, conf).gain // 60 BPM: eighths (2/s) stay under the WCAG cap

describe('postFor', () => {
  test('no heat and no drop is the identity, even on a confident beat; so is a cold tail', () => {
    expect(postFor(0, NONE, 0, 128, 1)).toEqual({ gain: 1, flash: 0 })
    expect(postFor(0.005, NONE, 0, 128, 1)).toEqual({ gain: 1, flash: 0 }) // under one 8-bit step: the engine skips the pass
    expect(postFor(0, 2, 0, 128, 1)).toEqual({ gain: 1, flash: 0 }) // the flash's tail, 2 s on
    expect(gain(0.016, 0.5, 0)).toBeCloseTo(1.004, 12) // just over one step: drawn
  })

  test('heat alone adds at most +25% brightness, linearly', () => {
    expect(gain(1, 0, 0)).toBe(1.25)
    expect(gain(0.5, 0, 0)).toBe(1.125)
    expect(gain(5, 0, 0)).toBe(1.25)
  })

  test('the strobe peaks at 0.15 on the beat, x confidence, none below 0.3', () => {
    expect(gain(1, 0, 1)).toBeCloseTo(1.4, 12)
    expect(gain(1, 0, 0.6)).toBeCloseTo(1.25 + 0.15 * 0.6, 12)
    expect(gain(1, 0, 0.3)).toBeCloseTo(1.25 + 0.15 * 0.3, 12)
    expect(gain(1, 0, 0.29)).toBe(1.25)
  })

  test('it follows the beat phase: 1/4 notes below heat 0.5, 1/8 notes from it', () => {
    expect(gain(0.49, 0, 1)).toBeCloseTo(1 + 0.25 * 0.49 + 0.15 * 0.49, 12) // on the beat
    expect(gain(0.49, 0.5, 1)).toBeCloseTo(1 + 0.25 * 0.49 + (0.15 * 0.49) / 16, 12) // off-beat: (1 - 0.5)^4
    expect(gain(0.5, 0.5, 1)).toBeCloseTo(1 + 0.25 * 0.5 + 0.15 * 0.5, 12) // off-beat 1/8 note: a full pulse
    expect(gain(1, 0.25, 1)).toBeCloseTo(1.25 + 0.15 / 16, 12) // between 1/8 notes
    expect(gain(1, 7, 1)).toBe(gain(1, 0, 1)) // only the phase counts
    expect(gain(1, 3.25, 1)).toBe(gain(1, 0.25, 1))
  })

  test('the drop flash peaks at 0.8 and decays with tau 0.1 s, whatever the heat', () => {
    expect(postFor(0, 0, 0, 0, 0)).toEqual({ gain: 1, flash: 0.8 })
    expect(postFor(1, 0.1, 0, 0, 0).flash).toBeCloseTo(0.8 / Math.E, 12)
    expect(postFor(0, 0.2, 0, 0, 0).flash).toBeCloseTo(0.8 / Math.E ** 2, 12) // .108: the Rave Lasers veil ≤ .25 at +200 ms
    expect(postFor(0, 0.25, 0, 0, 0).flash).toBeLessThanOrEqual(0.1) // ≤ .10 at +250 ms (creative_rave_lasers.md drop recipe)
    expect(postFor(0, -0.1, 0, 0, 0).flash).toBe(0) // not yet
  })

  test('WCAG 2.3.1: the strobe stays ≤ 3 flashes/s — 1/8 notes only while bpm/30 ≤ 3, else 1/4', () => {
    const offBeat = (bpm: number) => postFor(1, NONE, 0.5, bpm, 1).gain // full heat, off-beat: a full pulse iff on a 1/8 note
    expect(offBeat(60)).toBeCloseTo(1.25 + 0.15, 12) // eighths on: a pulse at phase 0.5
    expect(offBeat(90)).toBeCloseTo(1.25 + 0.15, 12) // at the bound: 90/30 = 3/s, still eighths
    expect(offBeat(91)).toBeCloseTo(1.25 + 0.15 / 16, 12) // 91/30 > 3: drops to 1/4, off-beat is a tail
    // the brief's case: 174 BPM full heat is 1/4 notes (2.9/s), not 5.8/s eighths
    expect(postFor(1, NONE, 0.5, 174, 1).gain).toBeCloseTo(1.25 + 0.15 / 16, 12)
    expect(postFor(1, NONE, 0, 174, 1).gain).toBeCloseTo(1.4, 12) // on-beat pulses at every 1/4 note regardless
  })

  test('caps hold and nothing is NaN, whatever comes in', () => {
    const odd = [NaN, Infinity, -Infinity, -1]
    for (const heat of [0, 0.3, 0.5, 1, 2, ...odd])
      for (const drop of [0, 0.1, 1, ...odd])
        for (const beat of [0, 0.25, 0.5, 0.99, 7, -3.5, ...odd])
          for (const bpm of [0, 90, 174, ...odd])
            for (const conf of [0, 0.3, 1, 5, ...odd]) {
              const p = postFor(heat, drop, beat, bpm, conf)
              expect(Number.isFinite(p.gain) && Number.isFinite(p.flash)).toBe(true)
              expect(p.gain).toBeGreaterThanOrEqual(1)
              expect(p.gain).toBeLessThanOrEqual(1.4 + 1e-12)
              expect(p.gain - postFor(heat, drop, beat, bpm, 0).gain).toBeLessThanOrEqual(0.15 + 1e-12) // the strobe's share
              expect(p.flash).toBeGreaterThanOrEqual(0)
              expect(p.flash).toBeLessThanOrEqual(0.8)
            }
  })
})

describe('flashGate', () => {
  const FPS = 60
  const ph = (k: number, r: number) => ((k * r) % FPS) / FPS // frame k's phase at r flashes/s, exact
  const saw = (r: number) => (k: number) => 0.65 * (1 - ph(k, r)) // own/strobe's bool binding at conf 1 (strobe.fs:12)
  const kick = (r: number) => (k: number) => 0.9 * Math.exp(-ph(k, r) / r / 0.1) // own/flash's float, release 0.1 (flash.fs:12)
  const fresh = (): FlashState => ({ prev: 0, blocked: false })
  const run = (raw: (k: number) => number, secs = 3) => {
    const s = fresh()
    const onsets: number[] = []
    return Array.from({ length: secs * FPS }, (_, k) => flashGate(raw(k), s, onsets, k / FPS))
  }
  const before = (out: number[], k: number) => (k ? out[k - 1] : 0) // the state starts at 0
  const rises = (out: number[]) => out.flatMap((y, k) => (y >= 0.5 && before(out, k) < 0.5 ? [k / FPS] : []))
  const maxPerSecond = (ts: number[]) => Math.max(...ts.map((t) => ts.filter((u) => u >= t && u - 1 <= t).length)) // closed [t, t + 1]
  const climbs = (out: number[]) => out.filter((y, k) => y > before(out, k)).length

  // at 4/s the allowed stamps are 0 .25 .5 1.25 1.5 1.75 2.5 2.75 (at t = 1, stamp 0 is still in the closed window)
  test.each([[1, 3], [4, 8], [10, 9]])('at %i/s: ≤ 3 onsets in any 1 s, %i allowed over 3 s, the only climbs', (r, n) => {
    for (const sig of [saw, kick]) {
      const out = run(sig(r))
      expect(rises(out)).toHaveLength(n)
      expect(maxPerSecond(rises(out))).toBeLessThanOrEqual(3)
      expect(climbs(out)).toBe(n) // the output rises only through an allowed onset: a blocked float never creeps up
    }
  })

  test('under the cap it is the identity', () => {
    for (const raw of [saw(1), saw(2), kick(1), kick(2)]) expect(run(raw)).toEqual(Array.from({ length: 3 * FPS }, (_, k) => raw(k)))
  })

  test('one budget for every flash: a second layer is refused once the first spends it', () => {
    const [a, b] = [fresh(), fresh()]
    const onsets: number[] = []
    const raw = saw(4)
    const A: number[] = []
    const B: number[] = []
    for (let k = 0; k <= FPS; k++) {
      A.push(flashGate(raw(k), a, onsets, k / FPS))
      B.push(flashGate(raw(k), b, onsets, k / FPS))
    }
    expect([A[0], B[0]]).toEqual([0.65, 0.65]) // t = 0: both allowed
    expect(A[15]).toBe(0.65) // t = 0.25: A takes the third slot …
    expect(Math.max(...B.slice(15))).toBeLessThan(0.5) // … B is refused there and stays dark through t = 1
    expect(rises(A).length + rises(B).length).toBe(3)
  })

  test('NaN reads 0; a refusal holds until the raw falls under 0.5, then the next onset counts', () => {
    const s = fresh()
    const onsets = [0, 0, 0] // the budget is spent at t = 0
    expect(flashGate(NaN, s, onsets, 0)).toBe(0)
    expect(s).toEqual({ prev: 0, blocked: false })
    expect(flashGate(0.9, s, onsets, 0.5)).toBe(0) // refused
    expect(s.blocked).toBe(true)
    expect(flashGate(0.9, s, onsets, 1.5)).toBe(0) // still on, the budget free again: no late leak
    expect(flashGate(NaN, s, onsets, 1.6)).toBe(0) // under 0.5: clears
    expect(s.blocked).toBe(false)
    expect(flashGate(0.9, s, onsets, 1.7)).toBe(0.9) // the next onset, counted
    expect(onsets).toEqual([1.7])
  })
})

describe('boundStep: the read point (design rev 2, C1)', () => {
  const FPS = 60
  const DT = 1 / FPS
  const mulberry = (a: number) => () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const ups = (out: number[]) => out.flatMap((y, k) => (y >= 0.5 && (k ? out[k - 1] : 0) < 0.5 ? [k / FPS] : [])) // rises through 0.5, as times
  const maxPerSecond = (ts: number[]) => Math.max(0, ...ts.map((t) => ts.filter((u) => u >= t && u - 1 <= t).length)) // closed [t, t + 1]
  /** A bound input as live.ts builds it: ours on `b`; a donor chain when donorChain gives one; each its own state. */
  const chain = (name: string, b: Binding, flash = false): Chain & { donor?: Chain; flash?: FlashState } => {
    const d = donorChain(name, b)
    return { b, state: { y: 0 }, ...(d && { donor: { b: d, state: { y: 0 } } }), ...(flash && { flash: { prev: 0, blocked: false } }) }
  }

  // flashGate(evaluate(SYN_BIND.syn_BassHits)) on every 50th frame of T7c's trace, captured on master 2e0a673 before
  // boundStep existed.
  const GOLDEN = [1, 0.9738816360413167, 0.030861289206803588, 0.396853458211086, 0.7383705578168592, 0.7770773675067663, 0.6615178690534983, 0.5183441827521581, 0.7383705578168592, 0.19141233058835774, 0.5876107833956082, 0.345030726427589]

  test('T7c: at w 0 the output is ours bit for bit, with or without a donor chain, and matches the master golden', () => {
    const b = SYN_BIND.syn_BassHits
    const rnd = mulberry(7)
    const s: Sources = { kick: 0, syn_BassHits: 0 }
    const ref = { state: { y: 0 }, flash: { prev: 0, blocked: false } } // live.ts render() on master, inline
    const lone = { b, state: { y: 0 }, flash: { prev: 0, blocked: false } }
    const duo = chain('syn_BassHits', b, true)
    const onsets: number[][] = [[], [], []]
    const out: number[] = []
    let diff = 0
    for (let k = 0; k < 10 * FPS; k++) {
      s.kick = rnd() < 0.08 ? 1 : s.kick * Math.exp(-DT / 0.12) // our drum envelope, ≈ 4.8 hits/s: the gate refuses some
      s.syn_BassHits = rnd() // the donor's value: unread at w 0
      const y = flashGate(evaluate(b, s, ref.state, DT), ref.flash, onsets[0], k * DT)
      if (!Object.is(boundStep(lone, s, 0, onsets[1], DT, k * DT), y) || !Object.is(boundStep(duo, s, 0, onsets[2], DT, k * DT), y)) diff++
      out.push(y)
    }
    expect(diff).toBe(0)
    expect(duo.donor!.state.y).toBeGreaterThan(0) // the donor chain ran: warm at the switch
    expect(out.filter((_, k) => k % 50 === 0)).toEqual(GOLDEN)
  })

  test('T7a: the gate runs on the mix: 6 frame-sharp donor hits in 1 s at w 1 rise through 0.5 only 2 times (DONOR_WCAG); ours keeps 3', () => {
    const six = (name: string, b: Binding, w: number) => {
      const x = chain(name, b, true)
      const s: Sources = { kick: 0 }
      const onsets: number[] = []
      return ups(Array.from({ length: FPS }, (_, k) => {
        s[w ? name : 'kick'] = k % 10 ? 0 : 1 // a one-frame hit every 1/6 s: the donor's at w 1, ours at w 0
        return boundStep(x, s, w, onsets, DT, k * DT)
      }))
    }
    const kb: Binding = { source: 'kick', amount: 1, attack: 0, release: 0.2, min: 0, max: 1 }
    expect(six('syn_BassHits', SYN_BIND.syn_BassHits, 1)).toHaveLength(2) // "gate, then mix" lets all 6 through
    expect(six('syn_BassHits', SYN_BIND.syn_BassHits, 0)).toHaveLength(3) // ours mode: WCAG
    expect(six('kick', kb, 1)).toHaveLength(3) // a native's kick has no donor chain: WCAG in donor mode too
  })

  test.each([false, true])('T7b: the scene override shapes a donor hit: attack 0.04, amount 6 (flash %s)', (flash) => {
    const x = chain('syn_BassHits', { ...SYN_BIND.syn_BassHits, attack: 0.04, amount: 6 }, flash) // SOFT_KICK, scenes/builtin.ts
    const s: Sources = { kick: 0 }
    const onsets: number[] = []
    const [y0, y1, y2] = [-1, 0, 1].map((age) => {
      s.syn_BassHits = age < 0 ? 0 : Math.exp((-age * DT) / 0.12) // one donor BassHits: 1, then its decay (tau 0.12 s)
      return boundStep(x, s, 1, onsets, DT, (age + 1) * DT)
    })
    expect(y0).toBe(0)
    expect(y1).toBeLessThanOrEqual(0.35) // of the step 0 → 1: 1 - e^(-dt/0.04) = 0.341; a bypass gives 1
    expect(y2).toBeLessThanOrEqual(0.6) // N3: about 0.566
    expect(y2).toBeGreaterThan(0.5) // the hit lands (with flash: an allowed onset)
  })

  test('T7d: a parked binding stays parked at w 1 (Canvas BPMTri, amount 0); a native kick has no chain, w 1 changes nothing', () => {
    const tri = chain('syn_BPMTri', { ...SYN_BIND.syn_BPMTri, amount: 0 })
    const kb: Binding = { source: 'kick', amount: 1, attack: 0, release: 0.2, min: 0, max: 1 }
    const kick = chain('kick', kb)
    expect(tri.donor).toBeDefined()
    expect(kick.donor).toBeUndefined()
    const ref = { y: 0 }
    const rnd = mulberry(5)
    const s: Sources = { confidence: 1 }
    let lit = 0
    let diff = 0
    for (let k = 0; k < 2 * FPS; k++) {
      s.beat = k / 20 // 180 BPM
      s.syn_BPMTri = 1 - Math.abs(2 * (s.beat % 1) - 1) // the donor's tri, full swing
      s.kick = rnd() < 0.1 ? 1 : 0
      s.syn_BassHits = rnd()
      if (boundStep(tri, s, 1, [], DT, k * DT) !== 0) lit++
      if (!Object.is(boundStep(kick, s, 1, [], DT, k * DT), evaluate(kb, s, ref, DT))) diff++
    }
    expect(lit).toBe(0)
    expect(diff).toBe(0)
  })

  test('T5: two ⚡ inputs share one onsets budget at w 1: ≤ 3 passes in any 1 s over 60 s; refusals counted', () => {
    const a = chain('syn_BassHits', SYN_BIND.syn_BassHits, true)
    const b = chain('syn_OnBeat', SYN_BIND.syn_OnBeat, true)
    const rnd = mulberry(3)
    const s: Sources = { kick: 0 } // ours silent: only the donor values light them
    const onsets: number[] = []
    const A: number[] = []
    const B: number[] = []
    let hit = -Infinity
    let next = 0
    let refused = 0
    for (let k = 0; k < 60 * FPS; k++) {
      const t = k * DT
      if (t >= next) [hit, next] = [t, t + (60 / 78) * (0.6 + 0.8 * rnd())] // BassHits ≈ 78 per min, jittered ±40 %
      s.syn_BassHits = Math.exp(-(t - hit) / 0.12)
      s.syn_OnBeat = Math.exp(-(t % (60 / 185)) / 0.1) // 185 BPM, tau 0.1 s
      for (const [x, out] of [[a, A], [b, B]] as const) {
        const was = x.flash!.blocked
        out.push(boundStep(x, s, 1, onsets, DT, t))
        if (!was && x.flash!.blocked) refused++
      }
    }
    const passes = [...ups(A), ...ups(B)]
    console.log(`T5: ${ups(A).length} + ${ups(B).length} passes, ${refused} refused onsets in 60 s`)
    expect(maxPerSecond(passes)).toBeLessThanOrEqual(3)
    expect(refused).toBeGreaterThan(0)
  })
})

describe('donorChain (lead item C7)', () => {
  const ev = { amount: 1, attack: 0, release: 0, min: 0, max: 1 } // scenes/serpent.ts's raw drums

  test('T8a: a native input has none (serpent bass and presence; shatter kick, build and drop)', () => {
    const natives: [string, Binding][] = [
      ['bass', { source: 'band8', amount: 1, attack: 0.06, release: 0.3, min: 0, max: 1 }],
      ['presence', { source: 'reeseLevel', ...ev }],
      ['kick', { source: 'kick', ...ev }],
      ['build', { source: 'build', amount: 1, attack: 0.2, release: 0.5, min: 0, max: 1 }],
      ['drop', { source: 'drop', ...ev }],
      ['toString', { source: 'kick', ...ev }], // an Object.prototype key: hasOwn, not `in`
    ]
    for (const [name, b] of natives) expect(donorChain(name, b)).toBeUndefined()
  })

  test('T8b: the source becomes the input name; the override, attack and release stay; shape and rate go', () => {
    const tri = { ...SYN_BIND.syn_BPMTri, amount: 0 }
    const c = donorChain('syn_BPMTri', tri)
    expect(c).toEqual({ ...tri, source: 'syn_BPMTri', shape: undefined, rate: undefined })
    expect([c?.shape, c?.rate]).toEqual([undefined, undefined])
    const h = SYN_BIND.syn_HighHits
    expect(donorChain('syn_HighHits', h)).toEqual({ ...h, source: 'syn_HighHits' })
  })

  test('T8c: a clock binding on a syn_ input gets none', () => {
    const b = SYN_BIND.syn_Level
    expect(donorChain('syn_Level', b)).toBeDefined() // a SYN name: only the clock refuses it
    expect(donorChain('syn_Level', { ...b, clock: { base: 0, k: 1, wrap: true } })).toBeUndefined()
  })
})
