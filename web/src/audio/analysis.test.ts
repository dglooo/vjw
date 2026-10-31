// plan S1.1: createAnalysis is the onset worklet's body, moved without behaviour change. The golden values below were
// captured from the pre-move worklet (AudioWorklet globals stubbed, same signal), whose whole message stream the moved
// code matched byte for byte. S3.1b re-captured the two ODF sums only (the kick/snare transient ODF); the onsets stand.
import { expect, test, vi } from 'vitest'
import { createAnalysis } from './analysis'
import { createBank, type BandSpec } from './bands'
import type { WorkletIn, WorkletMsg } from './onset.worklet'
import { kick, mix, pattern, reese } from './synth'

// Drum re-tuning is checked on configure calls; the real drums still run, so block() posts their hits (S1.4, last test).
const drumsConfigure = vi.hoisted(() => vi.fn())
vi.mock('./drums', async (importOriginal) => {
  const m = await importOriginal<typeof import('./drums')>()
  return {
    ...m,
    createDrums: (sr: number, n: number) => {
      const d = m.createDrums(sr, n)
      return { ...d, configure: (b: Parameters<typeof d.configure>[0]) => (drumsConfigure(b), d.configure(b)) }
    },
  }
})

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
  expect(v.reduce((s, x) => s + x, 0)).toBeCloseTo(289.7125, 3)
  expect(v.reduce((s, x, i) => s + (i + 1) * x, 0)).toBeCloseTo(46868.506, 2) // position-weighted: order counts too
  expect(out.some((m) => m.kind === 'feat')).toBe(false) // no config: no bands, no feat
})

// plan S2.3: the band bank inside block().
const DR = { kick: [40, 150], snare: [1000, 5000], hats: [7000, 16000] } as const
const cfg = (rev: number, bands: BandSpec[], drums: WorkletIn['drums'] = DR): WorkletIn => ({ kind: 'config', rev, drums, bands })

/** 2 s mono: a full-range reese (55 Hz root, in the sub band) with kicks at 0.5 and 1.25 s. */
function reeseKick() {
  const x = reese(2 * SR)
  for (const s of [0.5, 1.25]) kick().forEach((v, i) => (x[Math.round(s * SR) + i] += v))
  return x
}

/** Mono `x` through block(), configs sent before the keyed blocks. `frames`: a reference bank fed the same quanta,
 * re-configured at the keyed blocks and read at every hop end (odd blocks). */
function feed(x: Float32Array, sends: Record<number, WorkletIn>, ref: Record<number, BandSpec[]>) {
  const a = createAnalysis(SR)
  const bank = createBank(SR)
  const out: WorkletMsg[] = []
  const frames: number[][] = []
  let n = 0
  for (let b = 0; b < x.length / BLOCK; b++) {
    if (sends[b]) a.configure(sends[b])
    if (ref[b]) {
      bank.configure(ref[b])
      n = ref[b].length
    }
    const q = x.subarray(b * BLOCK, (b + 1) * BLOCK)
    a.block([q], F0 + b * BLOCK, (m) => out.push(m))
    bank.process(q)
    if (b % 2) {
      const f = new Float32Array(2 * n)
      bank.read(f)
      frames.push([...f])
    }
  }
  const batch = (i: number) => [...frames[2 * i], ...frames[2 * i + 1]] // batch i = blocks 4i…4i+3
  return { feat: out.flatMap((m) => (m.kind === 'feat' ? [m] : [])), batch }
}

// plan S3.1b: the tempo ODF is the kick and snare bands' transient excess, gate ratio − 1. A steady reese's ratio stays
// ≤ 1.30 (bands.ts), where the old 4-bin flux read its partials' flicker as kick-sized.
test('odf: a steady reese reads ≤ 0.35 once it has started, a kick on it > 2 (hops from a 0 frame)', () => {
  const odf = (x: Float32Array) => {
    const a = createAnalysis(SR)
    const v: number[] = []
    for (let b = 0; (b + 1) * BLOCK <= x.length; b++) a.block([x.subarray(b * BLOCK, (b + 1) * BLOCK)], b * BLOCK, (m) => m.kind === 'odf' && v.push(...m.values))
    return v
  }
  const hop = (s: number) => Math.round((s * SR) / 256) // value i ends at (i + 1) · 256 samples
  expect(Math.max(...odf(reese(2 * SR)).slice(hop(0.3)))).toBeLessThan(0.35)
  const k = odf(reeseKick())
  for (const s of [0.5, 1.25]) expect(Math.max(...k.slice(hop(s) - 1, hop(s) + 20))).toBeGreaterThan(2)
})

test('feat: every 2 hops, the bank [e2, held] per band at each hop end, in config order (reese + kick)', () => {
  const bands = [{ id: 'sub', lo: 30, hi: 60 }, { id: 'air', lo: 7000, hi: 16000 }]
  const { feat, batch } = feed(reeseKick(), { 0: cfg(1, bands) }, { 0: bands })
  expect(feat).toHaveLength(187) // 375 hops; the last one waits for its pair
  expect(feat.map((m) => [m.rev, m.hop, Math.round(m.t0 * SR), [...m.values]])).toEqual(
    feat.map((_, i) => [1, 256 / SR, F0 + (4 * i + 2) * BLOCK, batch(i)]), // t0 = the first hop's end
  )
  const e2 = (k: number) => feat.reduce((s, m) => s + m.values[2 * k] + m.values[4 + 2 * k], 0) // both hops
  expect(e2(0)).toBeGreaterThan(100 * e2(1)) // the sub band lights, the air band doesn't
})

test('config: a newer rev re-tunes at the next batch start, batches keep their rev, an older or repeated rev is ignored', () => {
  const A = [{ id: 'sub', lo: 30, hi: 60 }]
  const B = [...A, { id: 'u:1', lo: 60, hi: 250 }]
  const C = [{ id: 'air', lo: 7000, hi: 16000 }]
  const D1 = { ...DR, kick: [40, 200] } as const
  const D2 = { ...DR, kick: [50, 150] } as const
  drumsConfigure.mockClear()
  const { feat, batch } = feed(
    reeseKick(),
    {
      0: cfg(1, A),
      401: cfg(3, B), // mid-batch: applies at block 404 (batch 101); same drums, so they don't restart
      402: cfg(2, C, D1), // older than the pending rev 3
      501: cfg(3, C, D1), // repeated
      602: cfg(4, B, D2), // drums re-tune at once; the bands' rev 4 starts at block 604 (batch 151)
    },
    { 0: A, 404: B },
  )
  const rev = (i: number) => (i < 101 ? 1 : i < 151 ? 3 : 4)
  expect(feat.map((m) => [m.rev, [...m.values]])).toEqual(feat.map((_, i) => [rev(i), batch(i)])) // `sub` keeps its state
  expect(drumsConfigure.mock.calls).toEqual([[DR], [D2]])
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
