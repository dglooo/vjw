// (a) energy: pure band math + Butterchurn-style auto-gain over AnalyserNode dB frames (design S2).
// No Web Audio imports, so Vitest runs it in Node.
export const BAND_COUNT = 32 // log 30 Hz–16 kHz
export interface Levels { bass: number; mid: number; treb: number } // 1 ≈ running average
export interface Energy { bands: Float32Array; level: Levels; att: Levels }

// Knobs. Butterchurn's ranges and its rates at 30 fps (research audio §4); rates rescale as rate^(30/fps).
const RANGES = { bass: [20, 320], mid: [320, 2800], treb: [2800, 11025] } as const
const ATTACK = 0.2 // avg rate while rising
const RELEASE = 0.5 // avg rate while falling
const LONG = 0.992 // longAvg rate, ≈4.2 s
const SEED = 0.9 // longAvg rate for the first SEED_FRAMES frames of sound
const SEED_FRAMES = 50
const KEYS = ['bass', 'mid', 'treb'] as const

const binOf = (hz: number, sampleRate: number, fftSize: number) => Math.ceil((hz * fftSize) / sampleRate)
const sum = (a: Float32Array, start: number, end: number) => {
  let s = 0
  for (let i = start; i < end; i++) s += a[i]
  return s
}

/** [start, end) bin pairs, log-spaced lo..hi. A band narrower than one bin takes one bin, so low bands may share. */
export function bandEdges(sampleRate: number, fftSize: number, count = BAND_COUNT, lo = 30, hi = 16000) {
  const edge = (i: number) => binOf(lo * (hi / lo) ** (i / count), sampleRate, fftSize)
  return Array.from({ length: count }, (_, i) => [edge(i), Math.max(edge(i) + 1, edge(i + 1))] as const)
}

export function createEnergy(sampleRate: number, fftSize: number) {
  const edges = bandEdges(sampleRate, fftSize)
  const range = (k: (typeof KEYS)[number]) => RANGES[k].map((hz) => binOf(hz, sampleRate, fftSize))
  const ranges = { bass: range('bass'), mid: range('mid'), treb: range('treb') }
  const lin = new Float32Array(fftSize / 2)
  const imm: Levels = { bass: 0, mid: 0, treb: 0 }
  const avg: Levels = { bass: 0, mid: 0, treb: 0 }
  const long: Levels = { bass: 0, mid: 0, treb: 0 }
  const e: Energy = { bands: new Float32Array(BAND_COUNT), level: { bass: 0, mid: 0, treb: 0 }, att: { bass: 0, mid: 0, treb: 0 } }
  let frames = 0

  return {
    /** magDb = AnalyserNode.getFloatFrequencyData output; `quiet`: the input is paused (app.ts: ≥ 1 s at or under −60
     *  dBFS RMS, a line-in's noise floor), read as digital silence. Returns the same Energy object every call. */
    update(magDb: Float32Array, fps: number, quiet = false): Energy {
      for (let i = 0; i < magDb.length; i++) lin[i] = quiet ? 0 : 10 ** (magDb[i] / 20) // -Infinity dB → 0
      for (let b = 0; b < BAND_COUNT; b++) {
        const [start, end] = edges[b]
        e.bands[b] = sum(lin, start, end) / (end - start)
      }
      let total = 0
      for (const k of KEYS) total += imm[k] = sum(lin, ranges[k][0], ranges[k][1])
      // Digital silence (no source, paused file, a paused input) restarts the fast seed, so sound after silence doesn't
      // read as hundreds × the average for seconds.
      if (total === 0) frames = 0
      const longRate = (++frames <= SEED_FRAMES ? SEED : LONG) ** (30 / fps)
      for (const k of KEYS) {
        avg[k] += (imm[k] - avg[k]) * (1 - (imm[k] > avg[k] ? ATTACK : RELEASE) ** (30 / fps))
        long[k] += (imm[k] - long[k]) * (1 - longRate)
        e.level[k] = long[k] > 0 ? imm[k] / long[k] : 0 // 0/0 only before any sound
        e.att[k] = long[k] > 0 ? avg[k] / long[k] : 0
      }
      return e
    },
  }
}

/** RMS of a time-domain block (the ?debug L/R meters). */
export const rms = (x: Float32Array) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length)

/** Eases bar heights toward target, in place: a rising bar closes `up` of the gap, a falling one `down`. */
export function easeBars(prev: Float32Array, target: ArrayLike<number>, up: number, down: number) {
  for (let i = 0; i < prev.length; i++) prev[i] += (target[i] - prev[i]) * (target[i] > prev[i] ? up : down)
  return prev
}
