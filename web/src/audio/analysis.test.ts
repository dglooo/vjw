// plan S1.1: createAnalysis is the onset worklet's body, moved without behaviour change. The golden values below were
// captured from the pre-move worklet (AudioWorklet globals stubbed, same signal), whose whole message stream the moved
// code matched byte for byte.
import { expect, test } from 'vitest'
import { createAnalysis } from './analysis'
import type { WorkletMsg } from './onset.worklet'
import { mix, pattern } from './synth'

const SR = 48000
const BLOCK = 128
const P = 60 / 128 // kick period, s
const F0 = 1000 * BLOCK // currentFrame at the first block: t comes from `frame`, not from a hop count
const GAP = [806, 825] // blocks 2.15–2.2 s, inside kick 4: no source connected (zero channels)

/** 4 s stereo, R = L / 2. 8 kicks from 0.25 s: 150 → 50 Hz sweep, 50 ms decay tapered to 0 at 200 ms. 330 ms after
 * each kick (its tail flux out of the detector's mean) a click on a hop-aligned sample (Hann 1 in one frame), so its
 * ODF is 257 · log1p(1000 · a): 0.898 on even kicks, 1.103 on odd ones. The floor of 1 is bracketed: only odd ones fire. */
function signal() {
  const l = new Float32Array(4 * SR)
  const r = new Float32Array(4 * SR)
  for (let k = 0; k < 8; k++) {
    const s0 = Math.round((0.25 + k * P) * SR)
    let ph = 0
    for (let i = 0; i < 0.2 * SR; i++) {
      const t = i / SR
      ph += (2 * Math.PI * (50 + 100 * Math.exp(-t / 0.03))) / SR
      l[s0 + i] = 0.8 * Math.exp(-t / 0.05) * (1 - t / 0.2) * Math.sin(ph)
      r[s0 + i] = 0.5 * l[s0 + i]
    }
    const c = 256 * Math.round((s0 + 0.33 * SR) / 256)
    l[c] = r[c] = k % 2 ? 4.3e-6 : 3.5e-6
  }
  return [l, r]
}

function run() {
  const a = createAnalysis(SR)
  const out: WorkletMsg[] = []
  const [l, r] = signal()
  for (let b = 0; b < l.length / BLOCK; b++) {
    const chans = b >= GAP[0] && b < GAP[1] ? [] : [l, r].map((c) => c.subarray(b * BLOCK, (b + 1) * BLOCK))
    a.block(chans, F0 + b * BLOCK, (m) => out.push(m))
  }
  return out
}

// [t · SR, strength]: attack and sweep tail of each kick, then the odd kicks' click; kick 4's tail fires on reconnect
// after the gap instead.
const ONSETS = [
  [140032, 4], [145152, 2.87092], [162560, 4], [167680, 3.41173], [178688, 4], [185088, 4], [190208, 2.76412],
  [207616, 4], [212224, 4], [223488, 4], [230144, 4], [233728, 2.31477], [252672, 4], [257280, 2.85856], [268544, 4],
  [275200, 4], [281088, 2.42063], [297728, 4], [303104, 2.19729], [313600, 4],
]

test('block() posts the pre-move onset/odf messages on a synthetic kick train (golden)', () => {
  const out = run()
  const onsets = out.flatMap((m) => (m.kind === 'onset' ? [[Math.round(m.t * SR), m.strength]] : []))
  expect(onsets).toEqual(ONSETS.map(([f, s]) => [f, expect.closeTo(s, 4)]))

  const odf = out.filter((m) => m.kind === 'odf')
  expect(odf.map((m) => Math.round(m.t0 * SR))).toEqual(Array.from({ length: 93 }, (_, i) => 128256 + 2048 * i)) // 8 hops each
  expect(odf.every((m) => m.hop === 256 / SR && m.values.length === 8)).toBe(true)
  const v = odf.flatMap((m) => [...m.values])
  expect(v.reduce((s, x) => s + x, 0)).toBeCloseTo(507.8365, 3)
  expect(v.reduce((s, x, i) => s + (i + 1) * x, 0)).toBeCloseTo(184206.553, 2) // position-weighted: order counts too
})

// plan S1.4: drums.ts runs in the onset's hop, so the hits of a mixed DnB two-step (kick + snare + hats over the bass
// bed) land on its truth per drum. t comes from `frame` (F0 offset), as the onsets' does.
test('block() posts kick/snare/hats hits within ±30 ms of a synthetic dnb pattern', () => {
  const track = pattern('dnb', 8)
  const x = mix(track)
  const a = createAnalysis(SR)
  const hits: Extract<WorkletMsg, { kind: 'hit' }>[] = []
  for (let b = 0; (b + 1) * BLOCK <= x.length; b++) {
    a.block([x.subarray(b * BLOCK, (b + 1) * BLOCK)], F0 + b * BLOCK, (m) => {
      if (m.kind === 'hit') hits.push(m)
    })
  }
  for (const h of hits) expect(Object.keys(h).sort()).toEqual(['drum', 'kind', 'strength', 't'])
  const near = (a: number[], b: number[]) => a.filter((x) => b.some((y) => Math.abs(x - y) <= 0.03)).length / a.length
  for (const d of ['kick', 'snare', 'hats'] as const) {
    const got = hits.filter((h) => h.drum === d).map((h) => h.t - F0 / SR).filter((t) => t > 0.5) // the bed's own start
    expect(near(track.truth[d], got), `${d} recall`).toBeGreaterThanOrEqual(0.7)
    expect(near(got, track.truth[d]), `${d} precision`).toBeGreaterThanOrEqual(0.7)
  }
})
