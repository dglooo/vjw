// The melodic layer (dsp_genre_melodic_2026-11-21 §5–§6): `tonal` and `pitch` from one 4096-point analyser frame
// (input.ts analyser4k, smoothing 0): its 11.7 Hz bins resolve pitch classes, the worklet's 93.75 Hz ones cannot. app.ts
// runs it once per frame and writes src.tonal / src.pitch before gain(). The bin masks are scratchpad/dsp-genre/mel.py's,
// so the features are the measured ones. Pure, so Vitest runs it in Node.

const TONAL_TAU = 0.33 // s: the flatness EMA
const CHROMA_TAU = 0.167 // s: the 12-bin chroma EMA
const FLAT: readonly [number, number] = [0.6, 0.95] // knob: 1 − flatness over this window → tonal 0..1 (real tracks: p5 .58–.75, p95 .90–.98)
const SWITCH = 1.1 // knob: the pitch class moves only to a class above this × the held one's

/** `tonal` 0..1: 1 − the spectral flatness of 300–3000 Hz, up with pads, voices and leads, down in drum-only sections.
 *  `pitch` [0, 1): the loudest pitch class of 100–2000 Hz / 12, C = 0, a step value (often the key root, not each
 *  melody note). Never one-pole a hue on it: 11/12 → 0 would sweep the wheel; crossfade a palette over ≥ 0.3 s. */
export interface Melody { tonal: number; pitch: number }

export function createMelody(sampleRate: number, fftSize: number) {
  const hz = sampleRate / fftSize
  /** The first bin at or above `f` Hz: [at(a), at(b)) are mel.py's a ≤ f < b. */
  const at = (f: number) => {
    let k = 0
    while (k * hz < f) k++
    return k
  }
  const [F0, F1, C0] = [at(300), at(3000), at(100)]
  let C1 = C0
  while (C1 * hz <= 2000) C1++ // the chroma's 100 ≤ f ≤ 2000
  const top = Math.max(F1, C1)
  const P = new Float64Array(top) // this frame's power per bin
  const pc = Int8Array.from({ length: C1 }, (_, k) => (Math.round(12 * Math.log2((k * hz) / 440)) + 69) % 12) // read from C0 on
  const chroma = new Float64Array(12)
  let [flatY, held, started] = [1, 0, false]
  const out: Melody = { tonal: 0, pitch: 0 }

  return {
    /** `magDb`: analyser4k's getFloatFrequencyData (−Infinity = silence); `quiet`: the input is paused (app.ts PAUSE),
     *  read as digital silence, as energy.ts does. Silence decays `tonal` to 0 and holds `pitch`. Returns `out`. */
    update(magDb: Float32Array, dt: number, quiet = false): Melody {
      for (let k = 0; k < top; k++) P[k] = quiet ? 0 : 10 ** (magDb[k] / 10)
      const a = (tau: number) => (started ? 1 - Math.exp(-dt / tau) : 1) // the first frame seeds every EMA
      let [lg, ar] = [0, 0]
      for (let k = F0; k < F1; k++) {
        lg += Math.log(P[k] + 1e-20)
        ar += P[k]
      }
      const flat = Math.exp(lg / (F1 - F0)) / (ar / (F1 - F0) + 1e-20) // geometric / arithmetic mean: 1 on silence
      flatY += (flat - flatY) * a(TONAL_TAU)
      out.tonal = Math.min(1, Math.max(0, (1 - flatY - FLAT[0]) / (FLAT[1] - FLAT[0])))
      const ac = a(CHROMA_TAU)
      for (let i = 0; i < 12; i++) chroma[i] *= 1 - ac
      for (let k = C0; k < C1; k++) chroma[pc[k]] += ac * P[k]
      let best = 0
      for (let i = 1; i < 12; i++) if (chroma[i] > chroma[best]) best = i
      if (chroma[best] > SWITCH * chroma[held]) held = best // strict: an all-0 chroma (silence) holds
      out.pitch = held / 12
      started = true
      return out
    },
  }
}
