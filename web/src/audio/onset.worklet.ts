// (b) onsets in audio time (design S2, H): AudioWorklet glue around analysis.ts, which does the DSP (plan S1.1).
// Loaded via `?worker&url` (plan S1.2, R5b): Vite bundles fft.js, ./analysis and ./onset into one plain-JS chunk.
import { createAnalysis } from './analysis'

/** Worklet → main thread (frozen contract CP2). The ODF is batched per ODF_BATCH hops, for (c): the flux of the lowest
 * BASS_BINS only (kicks), since the full-band log flux scores off-beat hats as high as kicks (plan S5.3 drift). */
export type WorkletMsg = { kind: 'onset'; t: number; strength: number } | { kind: 'odf'; t0: number; hop: number; values: Float32Array }
/** Main thread → worklet (design C9). drums/bands fields arrive with the steps that read them (S1.4, S2.3). */
export type WorkletIn = { kind: 'config'; rev: number }

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

    process([chans]: Float32Array[][]) {
      this.analysis.block(chans, currentFrame, this.post)
      return true
    }
  },
)
