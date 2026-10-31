// (b) onsets in audio time (design S2, H): AudioWorklet glue around analysis.ts, which does the DSP (plan S1.1).
// Loaded via `?worker&url` (plan S1.2, R5b): Vite bundles fft.js, ./analysis and ./onset into one plain-JS chunk.
import { createAnalysis } from './analysis'
import type { BandSpec } from './bands'
import type { Drum, Hit } from './drums'
import type { Band } from './presets'

/** Worklet → main thread (frozen contract CP2). The ODF is batched per ODF_BATCH hops, for (c): the kick and snare bands'
 * transient excess (plan S3.1b), since the full-band log flux scores off-beat hats as high as kicks (plan S5.3 drift). */
export type WorkletMsg = { kind: 'onset'; t: number; strength: number } | { kind: 'odf'; t0: number; hop: number; values: Float32Array }
  | { kind: 'feat'; rev: number; t0: number; hop: number; values: Float32Array } // FEAT_HOPS hops × bands × [e2, held]
  | ({ kind: 'hit' } & Hit) // drums.ts, posted in the onset's hop (CP1)
/** Main thread → worklet (design C9, Variant B): drum bands and bank bands in Hz. Send a growing `rev`: a `feat` batch
 * carries the rev of the band list it was made with, and an older or repeated rev is ignored. */
export type WorkletIn = { kind: 'config'; rev: number; drums: Record<Drum, Band>; bands: BandSpec[] }

// AudioWorkletGlobalScope globals are not in TypeScript's DOM lib. Declared in this module only, so
// `sampleRate`/`currentFrame` don't leak into main-thread typings.
declare const currentFrame: number
declare const sampleRate: number
declare class AudioWorkletProcessor {
  readonly port: MessagePort
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void

registerProcessor(
  'onset',
  class extends AudioWorkletProcessor {
    analysis = createAnalysis(sampleRate)
    post = (m: WorkletMsg) => this.port.postMessage(m)

    constructor() {
      super()
      this.port.onmessage = ({ data }: MessageEvent<WorkletIn>) => this.analysis.configure(data)
    }

    process([chans]: Float32Array[][]) {
      this.analysis.block(chans, currentFrame, this.post)
      return true
    }
  },
)
