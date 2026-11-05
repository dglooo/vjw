// Hits (design C2): snare and hats are createDetector instances over Hz → bin ranges of the worklet's existing magnitudes,
// no new FFT. The kick is a transient in the 40–150 Hz IIR gate (bands.ts) that also carries the hop's power (ruling
// 2026-11-05). Pure: the worklet runs it per hop, Vitest runs it on synth.ts fixtures.
import { TRANSIENT } from './bands'
import { createDetector } from './onset'

export type Drum = 'kick' | 'snare' | 'hats'
export interface Hit { drum: Drum; t: number; strength: number } // t = AudioContext time, s

// knobs (default; presets may override). At 48 kHz the kick is bin 1 alone: DC (a sine's ± images interfere there)
// and bin 2 (187.5 Hz, a snare's body) fall outside 40–150 Hz. Snare/clap 1–5 kHz, hats 7–16 kHz.
const BANDS: Record<Drum, readonly [lo: number, hi: number]> = { kick: [40, 150], snare: [1000, 5000], hats: [7000, 16000] }
// knobs: per-band ODF floors (log units summed over the band's bins), tuned on the synth.ts fixtures (drums.test.ts).
const FLOORS = { snare: 80, hats: 100 }
// knob: the kick bins' least share of the hop's power, DC excluded (a line-in offset can't fake it). In an empty band the
// gate also trips on a riser, room tone or a snare's body; those hold ≲ 0.06 of the power, a kick ≈ 0.4–0.9.
const SHARE = 0.2
const MIN_GAP = 0.05 // s between kicks (onset.ts's minGap)

export function createDrums(sampleRate: number, fftSize: number) {
  const hz = sampleRate / fftSize
  const hits: Hit[] = [] // reused: 0–3 hits per hop
  let kick = { lo: 1, hi: 1 }
  let bands: { drum: 'snare' | 'hats'; lo: number; hi: number; d: ReturnType<typeof createDetector> }[] = []
  let lastKick = -Infinity

  /** Bins whose centre lies in [lo, hi] Hz (at least one). Detectors restart: their flux history is per bin. */
  function configure(b: Record<Drum, readonly [lo: number, hi: number]>) {
    const bins = (d: Drum) => {
      const lo = Math.min(Math.ceil(b[d][0] / hz), fftSize / 2)
      return { lo, hi: Math.min(Math.max(lo, Math.floor(b[d][1] / hz)), fftSize / 2) }
    }
    kick = bins('kick')
    bands = (['snare', 'hats'] as const).map((drum) => ({ drum, ...bins(drum), d: createDetector({ floor: FLOORS[drum] }) }))
  }
  configure(BANDS)

  return {
    configure,
    /** `kickRatio` = the 40–150 Hz gate's fast/slow ratio at this hop (analysis.ts's tempo bank): a steady or beating
     *  bass stays ≤ 1.30 there, so the kick fires on its transient, never on a full-range bass's in-bin beating. */
    detect(mag: Float32Array, t: number, kickRatio: number): readonly Hit[] {
      hits.length = 0
      let own = 0
      let all = 0
      for (let k = 1; k < mag.length; k++) {
        all += mag[k] * mag[k]
        if (k >= kick.lo && k <= kick.hi) own += mag[k] * mag[k]
      }
      if (kickRatio >= TRANSIENT && own > SHARE * all && t - lastKick >= MIN_GAP) {
        lastKick = t
        hits.push({ drum: 'kick', t, strength: Math.min(4, kickRatio) })
      }
      for (const { drum, lo, hi, d } of bands) {
        const o = d.detect(mag.subarray(lo, hi + 1), t)
        if (o) hits.push({ drum, ...o })
      }
      // Crosstalk: a kick's click reaches 1–5 kHz, so a snare in the same hop is dropped unless it is at least as strong.
      // Strong = in units of each side's own threshold: the snare's flux over its floor (`strength` saturates at its cap
      // in sparse bands, mean ≈ 0), the kick's ratio over TRANSIENT.
      const snare = hits.findIndex((h) => h.drum === 'snare')
      if (snare > 0 && bands[0].d.odf / FLOORS.snare < kickRatio / TRANSIENT) hits.splice(snare, 1) // > 0: a kick is hits[0]
      return hits
    },
  }
}
