// The melodic layer (dsp_genre_melodic_2026-11-21 §5–§6): `tonal`, `pitch` and `voice` from one 4096-point analyser
// frame (input.ts analyser4k, smoothing 0): its 11.7 Hz bins resolve pitch classes, the worklet's 93.75 Hz ones cannot.
// app.ts runs it once per frame and writes src.tonal / src.pitch / src.voice before gain(). The bin masks and the voice
// features are scratchpad/dsp-genre/mel.py's, so they are the measured ones (§7 M2's parity check). Pure, so Vitest runs
// it in Node.

const TONAL_TAU = 0.33 // s: the flatness EMA
const CHROMA_TAU = 0.167 // s: the 12-bin chroma EMA
const VOICE_TAU = 0.167 // s: the voice features' EMA (the model's 10 frames at 60 fps)
const FLAT: readonly [number, number] = [0.6, 0.95] // knob: 1 − flatness over this window → tonal 0..1 (real tracks: p5 .58–.75, p95 .90–.98)
const SWITCH = 1.1 // knob: the pitch class moves only to a class above this × the held one's
const HOLD = 1 // knob: s of real time a new class must lead (above SWITCH, unbroken) before it wins. Kanine RMV 41.5–51.5 s in the browser: 22 → 1 change; 10 s windows of 3 tracks offline: 14–35 → 0–2
const VV_HZ = 60 // the MFCC σ ring's samples per s, whatever the frame rate: 60 of them = the trained 1 s window
const EDGES = [20, 60, 250, 500, 1000, 2000, 4000, 8000, 16000] // Hz: the 8 band energies
// The voice logistic: scratchpad/dsp-genre/out/voice_model.json (voice28.py, audio-dsp 2026-11-21; fitted on the 7 tracks
// with vocals, truth = their demucs `vocals` stem on; leave-one-track-out J .50), rounded to 6 digits. Feature order: the
// 8 bands, flatness, peakiness, MFCC 0–12, the σ of MFCC 1–5 (mel.py NAMES without hshare, chromapk, salience).
const MU = [-3.35699, -2.56567, -2.91098, -2.9955, -3.13075, -3.29223, -3.52051, -3.9526, 0.219362, 0.0950258, -165.304, 10.9729, 2.10539, 2.82136, 0.813511, 1.28688, 0.680996, 0.365342, 0.0248055, -0.0835279, -0.155912, 0.174535, 0.382611, 5.68236, 4.37697, 3.14476, 2.69804, 2.51614]
const SD = [2.13901, 1.25234, 1.05171, 1.03347, 1.05579, 1.14034, 1.30884, 1.55353, 0.122455, 0.0106093, 43.3004, 10.3736, 7.01929, 4.69753, 4.70945, 3.46663, 3.12324, 2.76564, 2.37625, 2.31847, 1.90738, 1.86975, 1.73833, 3.74209, 2.54002, 1.67595, 1.35857, 1.14287]
const W = [-0.548345, -0.659435, 0.0174742, 0.87698, 0.786528, 0.773306, 0.537997, 0.143109, -1.92629, -0.427459, -0.114404, -0.140011, -0.590855, 0.532494, 0.346459, -0.232756, 0.104502, 0.0622068, 0.175853, -0.195194, -0.21314, 0.0380503, 0.432282, 0.0868811, -0.186173, -0.253334, -0.0431997, 0.637153]
const C = -1.62657

/** `tonal` 0..1: 1 − the spectral flatness of 300–3000 Hz, up with pads, voices and leads, down in drum-only sections.
 *  `pitch` [0, 1): the loudest pitch class of 100–2000 Hz / 12, C = 0, a step value (often the key root, not each
 *  melody note); a new class wins only after it leads for HOLD s. Never one-pole a hue on it: 11/12 → 0 would sweep the
 *  wheel; crossfade a palette over ≥ 0.3 s.
 *  `voice` 0..1: the trained vocal-activity logistic (p .256 maximised J on its tracks). Not a gate: leads open it too. */
export interface Melody { tonal: number; pitch: number; voice: number }

export function createMelody(sampleRate: number, fftSize: number) {
  const hz = sampleRate / fftSize
  /** The first bin at or above `f` Hz: [at(a), at(b)) are mel.py's a ≤ f < b. */
  const at = (f: number) => {
    let k = 0
    while (k * hz < f) k++
    return k
  }
  const [F0, F1, C0, top] = [at(300), at(3000), at(100), at(16000)] // top: the highest band's end; every range is under it
  let C1 = C0
  while (C1 * hz <= 2000) C1++ // the chroma's 100 ≤ f ≤ 2000
  const band = EDGES.map(at) // band i: [band[i], band[i + 1])
  // mel.py's 40-band HTK mel filterbank, 0–8 kHz: per band its first bin and its triangle's weights; then a DCT-II
  const mz = (h: number) => 2595 * Math.log10(1 + h / 700)
  const e = Array.from({ length: 42 }, (_, i) => 700 * (10 ** ((i * (mz(8000) / 41)) / 2595) - 1))
  const MEL = e.slice(0, 40).map((lo, m) => {
    const k0 = at(lo)
    return { k0, w: Float64Array.from({ length: at(e[m + 2]) - k0 }, (_, i) => Math.max(0, Math.min(((k0 + i) * hz - lo) / (e[m + 1] - lo), (e[m + 2] - (k0 + i) * hz) / (e[m + 2] - e[m + 1])))) }
  })
  const DCT = Array.from({ length: 13 }, (_, c) => Float64Array.from({ length: 40 }, (_, m) => Math.cos((Math.PI / 40) * (m + 0.5) * c)))
  const P = new Float64Array(top) // this frame's power per bin
  const lS = new Float64Array(F1 - F0) // log10 magnitude, 300–3000 Hz
  const mel = new Float64Array(40)
  const ring = new Float64Array(VV_HZ * 5) // MFCC 1–5, the last VV_HZ samples
  const x = new Float64Array(28) // this frame's voice features, the model's order, before the EMA
  const pc = Int8Array.from({ length: C1 }, (_, k) => (Math.round(12 * Math.log2((k * hz) / 440)) + 69) % 12) // read from C0 on
  const chroma = new Float64Array(12)
  let [flatY, zY, held, cand, lead, n, head, due, started] = [1, 0, 0, 0, 0, 0, 0, 0, false]
  const ema = (tau: number, dt: number) => (started ? 1 - Math.exp(-dt / tau) : 1) // the first frame seeds every EMA
  const out: Melody = { tonal: 0, pitch: 0, voice: 0 }

  return {
    /** `magDb`: analyser4k's getFloatFrequencyData (−Infinity = silence); `quiet`: the input is paused (app.ts PAUSE),
     *  read as digital silence, as energy.ts does. Silence decays `tonal` and `voice` to 0 and holds `pitch`. Returns
     *  `out`. */
    update(magDb: Float32Array, dt: number, quiet = false): Melody {
      for (let k = 0; k < top; k++) P[k] = quiet ? 0 : 10 ** (magDb[k] / 10)
      let [lg, ar] = [0, 0]
      for (let k = F0; k < F1; k++) {
        lg += Math.log(P[k] + 1e-20)
        ar += P[k]
      }
      const flat = Math.exp(lg / (F1 - F0)) / (ar / (F1 - F0) + 1e-20) // geometric / arithmetic mean: 1 on silence
      flatY += (flat - flatY) * ema(TONAL_TAU, dt)
      out.tonal = Math.min(1, Math.max(0, (1 - flatY - FLAT[0]) / (FLAT[1] - FLAT[0])))
      const ac = ema(CHROMA_TAU, dt)
      for (let i = 0; i < 12; i++) chroma[i] *= 1 - ac
      for (let k = C0; k < C1; k++) chroma[pc[k]] += ac * P[k]
      let best = 0
      for (let i = 1; i < 12; i++) if (chroma[i] > chroma[best]) best = i
      // strict: an all-0 chroma (silence) holds. A challenger's lead counts from its first frame, so it wins once it has
      // led HOLD s; a frame it loses, or another challenger, restarts the count.
      if (chroma[best] > SWITCH * chroma[held]) {
        lead = best === cand ? lead + dt : 0
        cand = best
        if (lead >= HOLD) held = best
      } else cand = held
      out.pitch = held / 12
      // voice: the 28 features (mel.py build())
      for (let i = 0; i < 8; i++) {
        let s = 0
        for (let k = band[i]; k < band[i + 1]; k++) s += P[k]
        x[i] = Math.log10(s + 1e-14)
      }
      x[8] = flat
      const L = F1 - F0 // peakiness: the mean of max(0, log10 S − its 7-bin mean), the ends mirrored (scipy's 'reflect')
      for (let j = 0; j < L; j++) lS[j] = Math.log10(Math.sqrt(P[F0 + j]) + 1e-10)
      let pk = 0
      for (let j = 0; j < L; j++) {
        let s = 0
        for (let d = j - 3; d <= j + 3; d++) s += lS[d < 0 ? -1 - d : d >= L ? 2 * L - 1 - d : d]
        pk += Math.max(0, lS[j] - s / 7)
      }
      x[9] = pk / L
      for (let m = 0; m < 40; m++) {
        const { k0, w } = MEL[m]
        let s = 0
        for (let i = 0; i < w.length; i++) s += P[k0 + i] * w[i]
        mel[m] = Math.log10(s + 1e-14)
      }
      for (let c = 0; c < 13; c++) {
        let s = 0
        for (let m = 0; m < 40; m++) s += mel[m] * DCT[c][m]
        x[10 + c] = s
      }
      for (due += started ? dt * VV_HZ : 1; due >= 0.5; due--) {
        for (let c = 0; c < 5; c++) ring[head * 5 + c] = x[11 + c]
        head = (head + 1) % VV_HZ
        n = Math.min(VV_HZ, n + 1)
      }
      for (let c = 0; c < 5; c++) {
        let [s, s2] = [0, 0]
        for (let r = 0; r < n; r++) {
          s += ring[r * 5 + c]
          s2 += ring[r * 5 + c] ** 2
        }
        x[23 + c] = Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2)) // the population σ, as mel.py's
      }
      let z = C
      for (let i = 0; i < 28; i++) z += (W[i] * (x[i] - MU[i])) / SD[i]
      zY += (z - zY) * ema(VOICE_TAU, dt) // z is linear in the features: one EMA on it is the model's EMA on each
      out.voice = 1 / (1 + Math.exp(-zY))
      started = true
      return out
    },
    /** The last frame's 28 voice features (the model's order, before the EMA), for the parity check. */
    features: x,
  }
}
