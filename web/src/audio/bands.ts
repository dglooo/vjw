// IIR band bank (design_audio_reactivity Variant B): per band two cascaded RBJ band-pass biquads, a fast (e1)
// and a slow (e2) envelope follower, and `held` = e2 with kicks gated out by differential envelopes
// (research_audio_features §2, the SPL transient designer). Pure: no Web Audio imports, so Vitest runs it in
// Node and the worklet bundles it. Allocation-free per quantum (audio thread).
export interface BandSpec { id: string; lo: number; hi: number } // Hz

// Knobs (Variant B, tuned in bands.test.ts). Time constants in seconds.
const ATTACK_FAST = 0.001 // e1 and the gate's fast follower
const ATTACK_SLOW = 0.02 // e2 (smooths e1) and the gate's slow follower
const RELEASE = 0.02 // e1; well below an 11.6 Hz LFO period (research §2)
// The gate runs its own fast/slow pair with a long release that bridges the 18–33 ms between a bass note's
// peaks. With RELEASE there, the ripple alone pushed a sustained reese/wobble over TRANSIENT.
const GATE_RELEASE = 0.2
export const TRANSIENT = 1.5 // gate fast/slow above this = a transient (a kick): `held` stops following e2…
const HOLD = 0.1 // …and stays put this long after it ends, past the kick's in-band tail
const STAGES = 2 // cascaded biquads per band, ≈12 dB/octave skirts

interface Band {
  id: string
  b0: number // RBJ band-pass, constant 0 dB peak, normalised: b1 = 0, b2 = -b0
  a1: number
  a2: number
  z: Float64Array // transposed direct form II state, 2 per stage
  e1: number
  e2: number
  gf: number // gate fast
  gs: number // gate slow
  held: number
  hold: number // samples left
}

/** One-pole follower coefficient for time constant tau. */
const coef = (tau: number, sampleRate: number) => 1 - Math.exp(-1 / (tau * sampleRate))

export function createBank(sampleRate: number) {
  const fast = coef(ATTACK_FAST, sampleRate)
  const slow = coef(ATTACK_SLOW, sampleRate)
  const rel = coef(RELEASE, sampleRate)
  const gateRel = coef(GATE_RELEASE, sampleRate)
  const holdLen = Math.round(HOLD * sampleRate)
  let bands: Band[] = []

  return {
    /** New coefficients; follower and filter state is kept per id, so a change doesn't jump. */
    configure(specs: readonly BandSpec[]) {
      const old = new Map(bands.map((b) => [b.id, b]))
      bands = specs.map(({ id, lo, hi }) => {
        const f0 = Math.sqrt(lo * hi) // Q from the edges: the -3 dB points of one stage sit at lo and hi
        const w = (2 * Math.PI * f0) / sampleRate
        const alpha = Math.sin(w) / (2 * (f0 / (hi - lo)))
        const b = old.get(id) ?? { id, b0: 0, a1: 0, a2: 0, z: new Float64Array(2 * STAGES), e1: 0, e2: 0, gf: 0, gs: 0, held: 0, hold: 0 }
        b.b0 = alpha / (1 + alpha)
        b.a1 = (-2 * Math.cos(w)) / (1 + alpha)
        b.a2 = (1 - alpha) / (1 + alpha)
        return b
      })
    },
    /** One render quantum, mono. */
    process(x: Float32Array) {
      for (const b of bands) {
        const { b0, a1, a2, z } = b
        let { e1, e2, gf, gs, held, hold } = b
        for (let i = 0; i < x.length; i++) {
          let y = x[i]
          for (let s = 0; s < 2 * STAGES; s += 2) {
            const v = b0 * y + z[s]
            z[s] = z[s + 1] - a1 * v
            z[s + 1] = -b0 * y - a2 * v
            y = v
          }
          y = Math.abs(y)
          e1 += (y - e1) * (y > e1 ? fast : rel)
          e2 += (e1 - e2) * slow // from e1, not |y|: the mean of |y| sits a crest factor below e1
          gf += (y - gf) * (y > gf ? fast : gateRel)
          gs += (gf - gs) * slow
          if (gf > TRANSIENT * gs) hold = holdLen
          else if (hold > 0) hold--
          else held = e2
        }
        b.e1 = e1
        b.e2 = e2
        b.gf = gf
        b.gs = gs
        b.held = held
        b.hold = hold
      }
    },
    /** Band i's gate fast/slow ratio: sustained material peaks at ≤ 1.30, a kick at ≥ 1.65; 0 before any signal. */
    ratio: (i: number) => (bands[i].gs > 0 ? bands[i].gf / bands[i].gs : 0),
    /** Per band, in spec order: [e2, held]. */
    read(out: Float32Array) {
      for (let i = 0; i < bands.length; i++) {
        out[2 * i] = bands[i].e2
        out[2 * i + 1] = bands[i].held
      }
    },
  }
}
