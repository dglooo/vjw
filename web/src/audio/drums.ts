// Hits (design C2): three createDetector instances over Hz → bin ranges of the worklet's existing magnitudes, no new
// FFT. Pure: the worklet runs it per hop, Vitest runs it on synth.ts fixtures.
import { createDetector } from './onset'

export type Drum = 'kick' | 'snare' | 'hats'
export interface Hit { drum: Drum; t: number; strength: number } // t = AudioContext time, s

const DRUMS = ['kick', 'snare', 'hats'] as const
// knobs (default; presets may override). At 48 kHz the kick is bin 1 alone: DC (a sine's ± images interfere there)
// and bin 2 (187.5 Hz, a snare's body) fall outside 40–150 Hz. Snare/clap 1–5 kHz, hats 7–16 kHz.
const BANDS: Record<Drum, readonly [lo: number, hi: number]> = { kick: [40, 150], snare: [1000, 5000], hats: [7000, 16000] }
// knobs: per-band ODF floors (log units summed over the band's bins), tuned on the synth.ts fixtures (drums.test.ts).
// ponytail: log flux is level-independent, so a bare reese or snare in digital silence still fires the kick bin.
const FLOORS: Record<Drum, number> = { kick: 0.7, snare: 80, hats: 100 }

export function createDrums(sampleRate: number, fftSize: number) {
  const hz = sampleRate / fftSize
  const hits: Hit[] = [] // reused: 0–3 hits per hop
  let bands: { drum: Drum; lo: number; hi: number; d: ReturnType<typeof createDetector> }[] = []

  /** Bins whose centre lies in [lo, hi] Hz (at least one). Detectors restart: their flux history is per bin. */
  function configure(b: Record<Drum, readonly [lo: number, hi: number]>) {
    bands = DRUMS.map((drum) => {
      const lo = Math.min(Math.ceil(b[drum][0] / hz), fftSize / 2)
      return { drum, lo, hi: Math.min(Math.max(lo, Math.floor(b[drum][1] / hz)), fftSize / 2), d: createDetector({ floor: FLOORS[drum] }) }
    })
  }
  configure(BANDS)

  return {
    configure,
    detect(mag: Float32Array, t: number): readonly Hit[] {
      hits.length = 0
      for (const { drum, lo, hi, d } of bands) {
        const o = d.detect(mag.subarray(lo, hi + 1), t)
        if (o) hits.push({ drum, ...o })
      }
      // Crosstalk: a kick's click reaches 1–5 kHz, so a snare in the same hop is dropped unless it is at least as strong.
      // Strong = flux in units of the band's own floor: `strength` saturates at its cap in sparse bands (mean ≈ 0).
      const snare = hits.findIndex((h) => h.drum === 'snare')
      const [k, s] = [bands[0], bands[1]] // DRUMS order
      if (snare > 0 && s.d.odf / FLOORS.snare < k.d.odf / FLOORS.kick) hits.splice(snare, 1) // > 0: a kick is hits[0]
      return hits
    },
  }
}
