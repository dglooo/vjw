// The onset worklet's body, pure (plan S1.1): mono → Hann → 512-point FFT every 256 samples → createDetector → post.
// onset.worklet.ts is the glue around it; Vitest runs whole signals through block().
import FFT from 'fft.js'
import { createDetector } from './onset'
import type { WorkletIn, WorkletMsg } from './onset.worklet'

const N = 512 // FFT size
const HOP = 256
const BLOCK = 128 // render quantum (no renderSizeHint is set)
const ODF_BATCH = 8
const BASS_BINS = 4 // knob: 0–330 Hz at 48 kHz, the kick body

export function createAnalysis(sampleRate: number): {
  configure(c: WorkletIn): void
  block(chans: Float32Array[], frame: number, post: (m: WorkletMsg) => void): void
} {
  const fft = new FFT(N)
  const hann = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N))
  const ring = new Float32Array(N) // last N mono samples; `pos` is the next write and the oldest sample
  let pos = 0
  const windowed = new Float32Array(N)
  const spectrum = new Float64Array(2 * N) // fft.js complex output, re/im interleaved
  const mag = new Float32Array(N / 2 + 1)
  const odf = new Float32Array(ODF_BATCH)
  let hops = 0
  const detector = createDetector()
  const bass = createDetector() // (c) only its flux is used

  return {
    configure() {}, // nothing reads the config yet (drums: S1.4, bands: S2.3)
    /** One render quantum; `frame` = the worklet's currentFrame. */
    block(chans, frame, post) {
      // No source connected → zero channels: count it as silence, so time stays continuous.
      for (let i = 0; i < BLOCK; i++) {
        let s = 0
        for (const c of chans) s += c[i]
        ring[pos + i] = chans.length ? s / chans.length : 0
      }
      pos = (pos + BLOCK) % N
      if (pos % HOP) return

      for (let i = 0; i < N; i++) windowed[i] = ring[(pos + i) % N] * hann[i]
      fft.realTransform(spectrum, windowed)
      for (let k = 0; k <= N / 2; k++) mag[k] = Math.sqrt(spectrum[2 * k] ** 2 + spectrum[2 * k + 1] ** 2)
      const t = (frame + BLOCK) / sampleRate // end of the window: the block that completed this hop
      const onset = detector.detect(mag, t)
      if (onset) post({ kind: 'onset', ...onset })
      bass.detect(mag.subarray(0, BASS_BINS), t)
      odf[hops % ODF_BATCH] = bass.odf
      if (++hops % ODF_BATCH === 0) {
        const hop = HOP / sampleRate
        post({ kind: 'odf', t0: t - (ODF_BATCH - 1) * hop, hop, values: odf.slice() })
      }
    },
  }
}
