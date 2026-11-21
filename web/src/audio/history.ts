// The analysis screen's memory (user 2026-11-21, «экран анализа»: what the app hears in the music over time). app.ts
// records every frame as the detectors read it, before the user's gain, mute and Off (bind.ts gain()), into
// fixed-width time buckets: `recent`, the last 34 s at 60 per s on the frame clock (ui/Analysis.tsx's timeline).
// Pure, so Vitest runs it in Node.
import type { ArrangeOut } from './arrange'
import type { Drum } from './drums'
import type { Sync } from './sync'

/** A bucket's fields: the first 4 count the frames' hits and ⚡ (live.ts flashOnsets), up to `confidence` they keep the
 *  peak, from `pitch` on the last frame's value. `fired` / `confirmed`: a drop's confidence on the frame it fires, 1 on
 *  the frame the autopilot may cut (arrange.ts). `section`: 0, BUILD (arrange.ts `sparse`: the breakdown) or DROP (from
 *  a drop firing to the next breakdown). */
export const LANES = ['kick', 'snare', 'hats', 'flash', 'sub', 'reese', 'energy', 'tonal', 'voice', 'build', 'fired', 'confirmed', 'confidence', 'pitch', 'beat', 'bar', 'bpm', 'section'] as const
export type Lane = (typeof LANES)[number]
export type Sample = Record<Lane, number>
/** A lane's index in a bucket. */
export const L = Object.fromEntries(LANES.map((l, i) => [l, i])) as Readonly<Record<Lane, number>>
export const BUILD = 1
export const DROP = 2
const PEAK = L.sub // lanes [PEAK, LAST) keep their peak, the ones before count
const LAST = L.pitch
const RECENT_HZ = 60
const RECENT_N = 2048 // 34 s at 60 per s: the 30 s timeline and some slack

export type Buckets = ReturnType<typeof createBuckets>
/** `n` buckets of `width` s: bucket i (= floor(t / width)) lives in slot i mod n, so the newest n stay held. A frame in a
 *  bucket other than the last one written starts it afresh: a seek back overwrites, never adds. */
export function createBuckets(n: number, width: number) {
  const v = new Float32Array(n * LANES.length)
  const at = new Float64Array(n).fill(NaN) // each slot's bucket index; NaN: none yet
  let cur = NaN
  return {
    width,
    n,
    bytes: v.byteLength + at.byteLength,
    add(t: number, s: Readonly<Sample>) {
      const i = Math.floor(t / width)
      const k = ((i % n) + n) % n
      const o = k * LANES.length
      if (i !== cur) {
        v.fill(0, o, o + LANES.length)
        at[k] = cur = i
      }
      for (let j = 0; j < LANES.length; j++) {
        const x = s[LANES[j]] || 0 // NaN, a missing source: 0
        v[o + j] = j < PEAK ? v[o + j] + x : j < LAST ? Math.max(v[o + j], x) : x
      }
    },
    /** Lane `j` of bucket `i`: NaN when the bucket is not held (never heard, or overwritten since). */
    get(i: number, j: number) {
      const k = ((i % n) + n) % n
      return at[k] === i ? v[k * LANES.length + j] : NaN
    },
  }
}

/** The buckets of the last `span` s up to `now`, oldest first: [i0, i1]. */
export function range(b: Buckets, now: number, span: number): [i0: number, i1: number] {
  const i1 = Math.floor(now / b.width)
  return [i1 - Math.round(span / b.width) + 1, i1]
}

/** A time's x on a strip that ends at `now` on its right edge (`x0` + `w`) and starts `span` s before at `x0`. */
export const xAt = (t: number, now: number, span: number, x0: number, w: number) => x0 + w * (1 - (now - t) / span)

export function createHistory() {
  const rec = Object.fromEntries(LANES.map((l) => [l, 0])) as Sample
  let seen = -Infinity // the newest ⚡ onset counted
  const h = {
    recent: createBuckets(RECENT_N, 1 / RECENT_HZ),
    now: 0, // the newest frame's time, s on the frame clock
    /** A hit drained this frame (app.ts's drain loop). */
    hit(d: Drum) {
      rec[d]++
    },
    /** The frame at `t` (f.time): `s` the sources before gain(), the grid, the arrangement, the flash budget's onsets
     *  (live.ts, newest last). */
    frame(t: number, s: Readonly<Record<string, number>>, sync: Sync, a: ArrangeOut, flashes: readonly number[]) {
      rec.sub = s.sub
      rec.reese = s.reese
      rec.tonal = s.tonal
      rec.voice = s.voice
      rec.pitch = s.pitch
      rec.energy = a.energy
      rec.build = a.build
      rec.fired = a.fired ?? 0
      rec.confirmed = a.confirmed === null ? 0 : 1
      rec.section = a.fired !== null ? DROP : a.sparse ? BUILD : rec.section === BUILD ? 0 : rec.section
      rec.beat = sync.beat
      rec.bar = sync.bar
      rec.bpm = sync.bpm
      rec.confidence = sync.confidence
      // ponytail: app.ts records before render(), so a ⚡ counts on the frame after the gate allowed it (≤ 17 ms late)
      let k = 0
      for (let i = flashes.length - 1; i >= 0 && flashes[i] > seen; i--) k++
      rec.flash = k
      seen = flashes.at(-1) ?? seen
      h.recent.add(t, rec)
      h.now = t
      rec.kick = rec.snare = rec.hats = 0
    },
  }
  return h
}
