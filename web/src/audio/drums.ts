// Hits (design C2): snare and hats are createDetector instances over Hz → bin ranges of the worklet's existing magnitudes,
// no new FFT. The kick is a transient in the 40–150 Hz IIR gate (bands.ts) that also carries the hop's power (ruling
// 2026-11-05). The snare's flux counts only on hops whose band power leans high (snare ruling 2026-11-05). Pure: the
// worklet runs it per hop, Vitest runs it on synth.ts fixtures.
import { KICK_SLOW, TRANSIENT } from './bands'
import { createDetector } from './onset'

export type Drum = 'kick' | 'snare' | 'hats'
export interface Hit { drum: Drum; t: number; strength: number } // t = AudioContext time, s

// knobs (default; presets may override). At 48 kHz the kick is bin 1 alone: DC (a sine's ± images interfere there)
// and bin 2 (187.5 Hz, a snare's body) fall outside 40–150 Hz. Snare/clap 1–5 kHz, hats 7–16 kHz.
const BANDS: Record<Drum, readonly [lo: number, hi: number]> = { kick: [40, 150], snare: [1000, 5000], hats: [7000, 16000] }
export type Floors = Record<'snare' | 'hats', number>
/** The drum knobs every preset carries (presets.ts), so the preset picker is the drum profile switch; the worklet config
 *  sends them. `kickSlow` goes to analysis.ts's tempo bank (bands.ts `setKickSlow`), the rest stays here. */
export interface Knobs {
  floors: Floors // per-band ODF floors, log units summed over the band's bins
  snareThreshold: number // a snare needs odf > mean₁₆ · this + floor (the hats keep onset.ts's 1.5)
  kick: number // the kick's gate-ratio trigger
  kickSlow: number // s: the kick trigger's own gate slow follower
}
// The defaults (Default, DnB, Techno; Dubstep keeps floors 80/100). The snare: real DnB masters' backbeat flux reads p50
// 16–17 / p90 32–50 (real-track ruling 2026-11-05), and at floor 40 / threshold 1.5 all 441 missed snares of 8 real
// windows sat under the floor or under mean × 1.5 (.54–.79 of it); floor 30 / threshold 1.3 take R .47 → .67, P .69 → .62,
// for ≈ +3 false snares a minute of drumless audio (dsp_kick_snare_misses §4.1, §6). The kick trigger (ruling 2026-11-05
// (c)): real masters' kicks and a 16th double kick's 2nd (≈ 1.39) peak under TRANSIENT, a steady or beating bass stays
// ≤ 1.30. TRANSIENT 1.5 still gates bands.ts's `held` (the bass sources, arrange `low`) and stays the crosstalk's kick unit.
export const KNOBS: Knobs = { floors: { snare: 30, hats: 50 }, snareThreshold: 1.3, kick: 1.35, kickSlow: KICK_SLOW }
// The crosstalk's snare unit (its flux over this = 1), tuned at the old floor of 80: tied to the live floor, halving it
// would double every snare's weight against the kick.
const XT_SNARE = 80
// knob: the kick bins' least share of the hop's power, DC excluded (a line-in offset can't fake it). In an empty band the
// gate also trips on a riser, room tone or a snare's body; those hold ≲ 0.06 of the power, a kick ≈ 0.4–0.9.
const SHARE = 0.2
// knob: s between kicks (onset.ts's snare/hats minGap stays 0.05). 60 ms, not 50: the gate's release tail re-crosses at
// 52 ms on 3 real-track kicks (2nd ratio 1.35–1.39, just over the trigger); the shortest legitimate pair is 75.5 ms (T2 data).
const MIN_GAP = 0.06
// knob: the snare hop's least share of its band's power above the band's midpoint (3 kHz at the default). A snare or
// clap is flat noise there (≈ .4–.9), a wobble's saw edge falls ≈ 18 dB/oct (≈ .01–.02). A failed hop's ODF is 0 inside
// the detector, so a vetoed spike arms no minGap and swallows no real snare after it.
const TILT = 0.1

export function createDrums(sampleRate: number, fftSize: number) {
  const hz = sampleRate / fftSize
  const hits: Hit[] = [] // reused: 0–3 hits per hop
  let kick = { lo: 1, hi: 1 }
  let bands: { drum: 'snare' | 'hats'; lo: number; hi: number; d: ReturnType<typeof createDetector> }[] = []
  let lastKick = -Infinity
  let lastRatio = 0 // the last hop's kick weight in the crosstalk, 0 if none
  let rising = false // the last hop posted a kick under TRANSIENT
  let held: { hit: Hit; s: number } | null = null // the last hop's snare and its flux over XT_SNARE (crosstalk ±1 hop)
  let knobs = KNOBS // setKnobs moves them in place; a configure restart keeps them
  const tune = (b: (typeof bands)[number]) => {
    b.d.floor = knobs.floors[b.drum]
    if (b.drum === 'snare') b.d.threshold = knobs.snareThreshold
  }

  /** Bins whose centre lies in [lo, hi] Hz (at least one). Detectors restart: their flux history is per bin. */
  function configure(b: Record<Drum, readonly [lo: number, hi: number]>) {
    const bins = (d: Drum) => {
      const lo = Math.min(Math.ceil(b[d][0] / hz), fftSize / 2)
      return { lo, hi: Math.min(Math.max(lo, Math.floor(b[d][1] / hz)), fftSize / 2) }
    }
    kick = bins('kick')
    bands = (['snare', 'hats'] as const).map((drum) => ({ drum, ...bins(drum), d: createDetector() }))
    bands.forEach(tune)
  }
  configure(BANDS)

  return {
    configure,
    /** A preset's knobs, in place: the detectors keep their flux history, so a switch fires nothing. */
    setKnobs(k: Knobs) {
      knobs = k
      bands.forEach(tune)
    },
    /** `kickRatio` = the 40–150 Hz gate's fast over its kick slow follower at this hop (analysis.ts's tempo bank), the
     *  trigger: a steady or beating bass stays ≤ 1.30 there, so the kick fires on its transient, never on a bass's in-bin
     *  beating. `xtRatio` = the same gate over its 20 ms follower (bands.ts `ratio`): the kick's crosstalk weight. */
    detect(mag: Float32Array, t: number, kickRatio: number, xtRatio = kickRatio): readonly Hit[] {
      hits.length = 0
      let own = 0
      let all = 0
      let up = 0 // the snare's bins above its band's midpoint
      let band = 0 // all the snare's bins
      const sn = bands[0]
      for (let k = 1; k < mag.length; k++) {
        const p = mag[k] * mag[k]
        all += p
        if (k >= kick.lo && k <= kick.hi) own += p
        if (k >= sn.lo && k <= sn.hi) {
          band += p
          if (2 * k >= sn.lo + sn.hi) up += p
        }
      }
      // Crosstalk: a kick's click reaches 1–5 kHz and can lead its 40–150 Hz gate by a hop, so a snare within a hop of a
      // kick is dropped unless it is at least as strong. Strong = in tuned units, not the live floor: the snare's flux over
      // XT_SNARE (`strength` saturates at its cap in sparse bands, mean ≈ 0), the kick's ratio over TRANSIENT. So a
      // snare waits one hop (+5.3 ms) and keeps its own t; it posts ahead of this hop's kick, in time order.
      const fire = kickRatio >= knobs.kick && own > SHARE * all && t - lastKick >= MIN_GAP
      // xk = the kick's weight here, on the 20 ms ratio that TRANSIENT was tuned on: the 40 ms trigger ratio reads a kick
      // higher and dropped one more techno clap on a kick (the 8 real windows: equal). One posted under TRANSIENT is
      // still rising: the next hop's ratio weighs it there, as when it posted at TRANSIENT (T2: without this its click
      // passed for a snare, techno pattern F1 .80 → .76).
      const xk = fire || rising ? xtRatio : 0
      if (held && held.s >= xk / TRANSIENT) hits.push(held.hit)
      held = null
      if (fire) {
        lastKick = t
        hits.push({ drum: 'kick', t, strength: Math.min(4, kickRatio) })
      }
      for (const { drum, lo, hi, d } of bands) {
        const o = d.detect(mag.subarray(lo, hi + 1), t, drum !== 'snare' || up >= TILT * band)
        if (o && drum === 'hats') hits.push({ drum, ...o })
        else if (o && d.odf / XT_SNARE >= Math.max(xk, lastRatio) / TRANSIENT) held = { hit: { drum, ...o }, s: d.odf / XT_SNARE }
      }
      lastRatio = xk
      rising = fire && xtRatio < TRANSIENT
      return hits
    },
  }
}
