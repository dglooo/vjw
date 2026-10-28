// (b) onsets in audio time (design S2, H): mono → Hann → 512-point FFT every 256 samples → createDetector → port.
// Loaded via `?worker&url` (plan S1.2, R5b): Vite bundles fft.js and ./onset into one plain-JS chunk.
import FFT from 'fft.js'
import { createDetector } from './onset'

/** Worklet → main thread (frozen contract CP2). The ODF is batched per ODF_BATCH hops, for (c): the flux of the lowest
 * BASS_BINS only (kicks), since the full-band log flux scores off-beat hats as high as kicks (plan S5.3 drift). */
export type WorkletMsg = { kind: 'onset'; t: number; strength: number } | { kind: 'odf'; t0: number; hop: number; values: Float32Array }

// AudioWorkletGlobalScope globals are not in TypeScript's DOM lib. Declared in this module only (as the probe does),
// so `sampleRate`/`currentFrame` don't leak into main-thread typings.
declare const currentFrame: number
declare const sampleRate: number
declare class AudioWorkletProcessor {
  readonly port: MessagePort
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void

const N = 512 // FFT size
const HOP = 256
const BLOCK = 128 // render quantum (no renderSizeHint is set)
const ODF_BATCH = 8
const BASS_BINS = 4 // knob: 0–330 Hz at 48 kHz, the kick body

const fft = new FFT(N)
const hann = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N))

registerProcessor(
  'onset',
  class extends AudioWorkletProcessor {
    ring = new Float32Array(N) // last N mono samples; `pos` is the next write and the oldest sample
    pos = 0
    frame = new Float32Array(N)
    spectrum = new Float64Array(2 * N) // fft.js complex output, re/im interleaved
    mag = new Float32Array(N / 2 + 1)
    odf = new Float32Array(ODF_BATCH)
    hops = 0
    detector = createDetector()
    bass = createDetector() // (c) only its flux is used

    process([chans]: Float32Array[][]) {
      // No source connected → zero channels: count it as silence, so time stays continuous.
      for (let i = 0; i < BLOCK; i++) {
        let s = 0
        for (const c of chans) s += c[i]
        this.ring[this.pos + i] = chans.length ? s / chans.length : 0
      }
      this.pos = (this.pos + BLOCK) % N
      if (this.pos % HOP) return true

      for (let i = 0; i < N; i++) this.frame[i] = this.ring[(this.pos + i) % N] * hann[i]
      fft.realTransform(this.spectrum, this.frame)
      for (let k = 0; k <= N / 2; k++) this.mag[k] = Math.sqrt(this.spectrum[2 * k] ** 2 + this.spectrum[2 * k + 1] ** 2)
      const t = (currentFrame + BLOCK) / sampleRate // end of the window: the block that completed this hop
      const onset = this.detector.detect(this.mag, t)
      if (onset) this.port.postMessage({ kind: 'onset', ...onset } satisfies WorkletMsg)
      this.bass.detect(this.mag.subarray(0, BASS_BINS), t)
      this.odf[this.hops % ODF_BATCH] = this.bass.odf
      if (++this.hops % ODF_BATCH === 0) {
        const hop = HOP / sampleRate
        this.port.postMessage({ kind: 'odf', t0: t - (ODF_BATCH - 1) * hop, hop, values: this.odf.slice() } satisfies WorkletMsg)
      }
      return true
    }
  },
)
