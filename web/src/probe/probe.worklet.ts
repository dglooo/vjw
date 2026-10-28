// Throwaway probe processor (plan S1.2: R5 bundling, R9 message latency). Deleted in S6.1.
import FFT from 'fft.js'
import { hann } from './hann'

// AudioWorkletGlobalScope globals are not in TypeScript's DOM lib.
declare const currentTime: number
declare class AudioWorkletProcessor {
  readonly port: MessagePort
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void

// Evaluated at module load: if either import is broken, addModule() rejects.
const loaded = `fft.js size ${new FFT(1024).size}, hann(2,4) = ${hann(2, 4)}`

registerProcessor(
  'probe',
  class extends AudioWorkletProcessor {
    blocks = 0
    constructor() {
      super()
      this.port.postMessage({ loaded })
    }
    process() {
      if (++this.blocks % 8 === 0) this.port.postMessage({ ctxTime: currentTime })
      return true
    }
  },
)
