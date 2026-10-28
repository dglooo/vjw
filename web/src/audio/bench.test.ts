// The (c) bench (plan S5.4, design Q4): createTempoSource + createSync on 5 synthetic minutes of 4/4 at 128 BPM, then
// a cut to 140 for the recovery metric. Stepped at hop rate, no FFTs: the stream mimics what the worklet sends, as
// measured on test tracks (S5.1): bass-band ODF with an exponential floor (mean 1) and kicks ~13 + 5 over two hops;
// onsets stamped at hop ends, one per 50 ms (the detector's minGap), hats as onsets with little bass.
import { expect, test } from 'vitest'
import { createSync } from './sync'
import { createTempoSource } from './tempo'

const HOP = 256 / 48000
const FPS = 60
const P = 60 / 128
const THETA = 0.6 // app.ts CONFIDENT

/** Seeded uniform [0, 1) and a normal from it. */
let seed = 7
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd())

// 160 bars at 128 = 300 s: 40 bars, an 8-bar break, 40 bars, a 16-bar beatmatched overlap, 24 bars, an 8-bar break,
// 24 bars. Then 35 bars at 140 from a new phase (a cut).
const T0 = 1
const breaks = [[40, 48], [128, 136]].map(([a, b]) => [T0 + a * 4 * P, T0 + b * 4 * P])
const overlap = [T0 + 88 * 4 * P, T0 + 104 * 4 * P]
const CUT = T0 + 160 * 4 * P
const Q = 60 / 140
const END = CUT + 35 * 4 * Q
const inBreak = (t: number) => breaks.some(([a, b]) => t >= a && t < b)

interface Hit { t: number; strength: number; bass: number; kick?: number } // kick: its beat index on the 128 grid
const hits: Hit[] = []
for (let k = 0; T0 + k * P < CUT; k++) {
  const t = T0 + k * P
  if (!inBreak(t)) hits.push({ t: t + 0.003 * gauss(), strength: 3.5 + 0.5 * rnd(), bass: 13, kick: k })
  if (t >= overlap[0] && t < overlap[1]) hits.push({ t: t + 0.006 + 0.003 * gauss(), strength: 4, bass: 13 }) // the other deck
  for (const h of [0, 0.5]) hits.push({ t: t + h * P + 0.002 * gauss(), strength: 2, bass: 0.5 }) // hats on 8ths, half strength
}
for (let k = 0; CUT + (k + 0.37) * Q < END; k++) {
  const t = CUT + (k + 0.37) * Q
  hits.push({ t: t + 0.003 * gauss(), strength: 3.5 + 0.5 * rnd(), bass: 13, kick: -1 - k })
  for (const h of [0, 0.5]) hits.push({ t: t + h * Q + 0.002 * gauss(), strength: 2, bass: 0.5 })
}
hits.sort((a, b) => a.t - b.t)

const odf = Float32Array.from({ length: Math.ceil(END / HOP) + 2 }, () => -Math.log(1 - rnd()))
for (const h of hits) {
  odf[Math.floor(h.t / HOP) + 1] += h.bass
  odf[Math.floor(h.t / HOP) + 2] += 0.4 * h.bass
}
// The worklet stamps the hop end; one onset per 50 ms, the earlier (a kick hides the hat on the beat, and the second deck).
const onsets: (Hit & { at: number })[] = []
for (const h of hits) {
  const at = (Math.floor(h.t / HOP) + 1) * HOP
  const prev = onsets.at(-1)
  if (prev && at - prev.at < 0.05) {
    if (h.kick !== undefined && prev.kick === undefined) Object.assign(prev, { kick: h.kick, strength: Math.max(prev.strength, h.strength) })
  } else onsets.push({ ...h, at })
}

test('bench: 5 min at 128 with breaks and a beatmatched overlap, then a cut to 140 — the §7.2 (c) metrics', () => {
  const tempo = createTempoSource()
  const sync = createSync(tempo)
  const frames: { t: number; bpm: number; beat: number; conf: number }[] = []
  const kicks: { t: number; k: number; err: number; bpm: number; beat: number }[] = [] // err: grid − onset, ms
  let batch = 0
  let next = 0
  for (let f = 0; f / FPS < END; f++) {
    const t = f / FPS
    for (; (batch + 7) * HOP <= t; batch += 8) tempo.pushOdf(odf.subarray(batch, batch + 8), batch * HOP, HOP) // index j = stamp j·HOP
    for (; next < onsets.length && onsets[next].at <= t; next++) {
      const o = onsets[next]
      const s = sync.at(o.at) // the grid just before this onset corrects it
      if (o.kick !== undefined && s.bpm) {
        const e = s.beat - Math.round(s.beat)
        kicks.push({ t: o.at, k: o.kick, err: (e * 60000) / s.bpm, bpm: s.bpm, beat: Math.round(s.beat) })
      }
      tempo.push({ t: o.at, strength: o.strength })
      sync.feed({ t: o.at, strength: o.strength })
    }
    const s = sync.at(t)
    frames.push({ t, bpm: s.bpm, beat: s.beat, conf: s.confidence })
  }

  const q = (a: number[], p: number) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))]
  const lockAt = frames.find((f) => f.conf >= THETA)!.t
  const main = frames.filter((f) => f.t >= T0 + 10 && f.t < CUT)
  const tempoErr = main.map((f) => Math.abs(f.bpm - 128))
  const flips = frames.filter((f) => f.t >= lockAt && f.t < CUT && Math.abs(f.bpm / 128 - 1) > 0.1).length
  const locked = kicks.filter((k) => k.t >= lockAt && k.t < CUT)
  const offs = locked.map((k) => Math.abs(k.err))
  const slips = locked.filter((k, i) => i && k.beat - k.k !== locked[i - 1].beat - locked[i - 1].k).length
  const afterBreak = breaks.map(([, b]) => locked.find((k) => k.t >= b)!.err)
  const inBreaks = breaks.map(([a, b]) => frames.filter((f) => f.t >= a && f.t < b).at(-1)!.conf)
  // Recovery: the first 140 kick from which every later kick is within ±⅛ beat and every frame within ±1 BPM.
  const late = kicks.filter((k) => k.t >= CUT)
  let r = late.length
  while (r > 0 && Math.abs(late[r - 1].err) < (Q * 1000) / 8 && Math.abs(late[r - 1].bpm - 140) < 1) r--
  const recovered = late[r]?.t ?? Infinity
  const wrongConfident = frames.filter((f) => f.t >= CUT && f.t < recovered && f.conf >= THETA).length / FPS

  console.log(
    `(c) bench — ${(END / 60).toFixed(1)} min, ${onsets.length} onsets, ${locked.length} kicks after lock\n` +
      `  time to confident: ${(lockAt - T0).toFixed(2)} s after the first kick\n` +
      `  tempo error (≥10 s, 128 part): max ${Math.max(...tempoErr).toFixed(3)} BPM, p95 ${q(tempoErr, 0.95).toFixed(3)}\n` +
      `  pulse offset |grid − kick onset|: median ${q(offs, 0.5).toFixed(2)} ms, p95 ${q(offs, 0.95).toFixed(2)}, max ${Math.max(...offs).toFixed(2)}\n` +
      `  octave flips: ${flips} frames; beat slips: ${slips}\n` +
      `  breaks: confidence at the end ${inBreaks.map((c) => c.toFixed(2)).join(', ')}; first kick back off by ${afterBreak.map((e) => e.toFixed(1)).join(', ')} ms\n` +
      `  recovery after the 128 → 140 cut: ${(recovered - CUT).toFixed(2)} s = ${((recovered - CUT) / Q).toFixed(1)} beats; confident while wrong: ${wrongConfident.toFixed(2)} s`,
  )
  expect(Math.max(...tempoErr)).toBeLessThan(0.3) // bpm within ±0.3 after 10 s
  expect(q(offs, 0.95)).toBeLessThan(20) // |grid beat − kick| p95 ≤ 20 ms after lock
  expect(flips).toBe(0)
  expect(slips).toBe(0) // through both breaks and the overlap
  for (const e of afterBreak) expect(Math.abs(e)).toBeLessThan((P * 1000) / 8) // the hold: ≤ ⅛ beat off after 8 bars
  expect(recovered - CUT).toBeLessThan(15)
  expect(wrongConfident).toBeLessThan(4)
})
