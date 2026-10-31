// The onset worklet's body, pure (plan S1.1): mono → Hann → 512-point FFT every 256 samples → createDetector → post.
// Each quantum also feeds the IIR band bank, whose [e2, held] per band goes out as `feat` (plan S2.3, Variant B).
// onset.worklet.ts is the glue around it; Vitest runs whole signals through block().
import FFT from 'fft.js'
import { createBank } from './bands'
import { createDrums } from './drums'
import { createDetector } from './onset'
import type { WorkletIn, WorkletMsg } from './onset.worklet'

const N = 512 // FFT size
const HOP = 256
const BLOCK = 128 // render quantum (no renderSizeHint is set)
const ODF_BATCH = 8
const BASS_BINS = 4 // knob: 0–330 Hz at 48 kHz, the kick body
const FEAT_HOPS = 2 // hops per `feat` batch: 93.75 msgs/s at 48 kHz, shorter than a 60 Hz frame (Variant B)

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
  const hop = HOP / sampleRate
  const detector = createDetector()
  const bass = createDetector() // (c) only its flux is used
  const drums = createDrums(sampleRate, N)

  // S2.3: the band bank. A config's bands apply at the next batch start, so a batch is made with one band list (its rev).
  const bank = createBank(sampleRate)
  const quanta = Array.from({ length: N / BLOCK }, (_, i) => ring.subarray(i * BLOCK, (i + 1) * BLOCK)) // made once: no per-quantum alloc
  let rev = -1 // the bank's band list; -1 = no config yet: no bands, no feat
  let next: WorkletIn | null = null
  let feat = new Float32Array(0) // FEAT_HOPS × bands × [e2, held]
  let drumKey = ''

  return {
    /** An older or repeated rev is ignored. Drums restart only when their bands change: a restart drops the flux
     * history, so the next hop would fire every drum at full strength. */
    configure(c) {
      if (c.rev <= (next?.rev ?? rev)) return
      next = c
      const key = `${c.drums.kick} ${c.drums.snare} ${c.drums.hats}`
      if (key !== drumKey) {
        drumKey = key
        drums.configure(c.drums)
      }
    },
    /** One render quantum; `frame` = the worklet's currentFrame. */
    block(chans, frame, post) {
      if (next && hops % FEAT_HOPS === 0 && pos % HOP === 0) {
        // a batch starts here
        bank.configure(next.bands) // follower state is kept per id: no jump
        feat = new Float32Array(FEAT_HOPS * 2 * next.bands.length)
        rev = next.rev
        next = null
      }
      // No source connected → zero channels: count it as silence, so time stays continuous.
      for (let i = 0; i < BLOCK; i++) {
        let s = 0
        for (const c of chans) s += c[i]
        ring[pos + i] = chans.length ? s / chans.length : 0
      }
      bank.process(quanta[pos / BLOCK])
      pos = (pos + BLOCK) % N
      if (pos % HOP) return

      for (let i = 0; i < N; i++) windowed[i] = ring[(pos + i) % N] * hann[i]
      fft.realTransform(spectrum, windowed)
      for (let k = 0; k <= N / 2; k++) mag[k] = Math.sqrt(spectrum[2 * k] ** 2 + spectrum[2 * k + 1] ** 2)
      const t = (frame + BLOCK) / sampleRate // end of the window: the block that completed this hop
      const onset = detector.detect(mag, t)
      if (onset) post({ kind: 'onset', ...onset })
      for (const h of drums.detect(mag, t)) post({ kind: 'hit', ...h }) // same hop as the onset: no added latency (C2)
      bass.detect(mag.subarray(0, BASS_BINS), t)
      odf[hops % ODF_BATCH] = bass.odf
      if (++hops % ODF_BATCH === 0) {
        post({ kind: 'odf', t0: t - (ODF_BATCH - 1) * hop, hop, values: odf.slice() })
      }

      if (feat.length) {
        bank.read(feat.subarray(((hops - 1) % FEAT_HOPS) * (feat.length / FEAT_HOPS))) // this hop's slot
        if (hops % FEAT_HOPS === 0) post({ kind: 'feat', rev, t0: t - (FEAT_HOPS - 1) * hop, hop, values: feat.slice() })
      }
    },
  }
}
