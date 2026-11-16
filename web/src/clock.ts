// VeeJay Wizard, 2026
// Audio clocks (user 2026-11-17): a value driven by ∫ (base + k·source) dt, so a source's level becomes speed: a
// louder bass winds the clock faster, a silent one freezes it. Pure, so Vitest runs it in Node. fx/syn.ts steps the
// donor scenes' clocks here (VJW_CLOCK); a binding mode can step its {source, base, k} the same way.

/** The binding-shaped clock: y += (base + k · s[source]) · dt. */
export interface AudioClock { source: string; base: number; k: number }
/** A value named in `Values`: [name, −1] reads a number, [name, i] component i of an array (an xy input). */
export type Ref = readonly [name: string, i: number]
/** A rate as data: the sum of the terms, each the product of its numbers and Refs. {source, base, k} is clockRate's. */
export type Rate = readonly (readonly (number | Ref)[])[]
/** What a Ref reads: the frame's Sources, or a node's uniforms. A missing name reads 0 (bind.ts evaluate's rule). */
export type Values = Readonly<Record<string, unknown>>

export const clockRate = ({ source, base, k }: AudioClock): Rate => [[base], [k, [source, -1]]]

/** `y` one frame on: y + rate · dt, the rate read from `v` now. No allocation. */
export function clockStep(y: number, rate: Rate, v: Values, dt: number): number {
  let r = 0
  for (const t of rate) {
    let p = 1
    for (const f of t) p *= typeof f === 'number' ? f : ((f[1] < 0 ? v[f[0]] : (v[f[0]] as number[] | undefined)?.[f[1]]) as number | undefined) ?? 0
    r += p
  }
  return y + r * dt
}
