// Browser-check fixtures (plan S2.5): `pattern()` beds from synth.ts encoded as 16-bit PCM WAV, no dependency; plus
// `arrangement()` songs with a build and a drop (plan S1.10 of plan_td_look.md).
// Run: node --experimental-strip-types scripts/make-fx.mjs  (Node ≥ 22.6; on Node 20 import it from a throwaway
// *.test.ts in src/ and run that with vitest). Writes ../../scratchpad/fx_audio/ (gitignored).
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { arrangement, mix, pattern, SR, wobble } from '../src/audio/synth.ts'

/** 16-bit PCM mono WAV; the level stays in −1..1 (synth stems never clip, so no scaling). */
function wav(x) {
  const n = x.length
  const out = new ArrayBuffer(44 + n * 2)
  const v = new DataView(out)
  const text = (o, s) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i))
  }
  text(0, 'RIFF')
  v.setUint32(4, 36 + n * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true) // PCM
  v.setUint16(22, 1, true) // mono
  v.setUint32(24, SR, true)
  v.setUint32(28, SR * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  text(36, 'data')
  v.setUint32(40, n * 2, true)
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x[i])) * 0x7fff, true)
  return Buffer.from(out)
}

const out = join(dirname(fileURLToPath(import.meta.url)), '../../scratchpad/fx_audio')
mkdirSync(out, { recursive: true })
for (const [genre, bpm] of [['dubstep', 140], ['dnb', 174]]) {
  const x = mix(pattern(genre, 8))
  const file = join(out, `${genre}${bpm}.wav`)
  writeFileSync(file, wav(x))
  console.log(file, (x.length / SR).toFixed(1), 's')
}

// -arr: 16 groove bars → the 8-bar breakdown (riser + snare roll: the build) → the drop → 8 bars. The Dubstep one adds
// the wobble stem, silent over the breakdown like the bass (the same 5 ms edges). Scaled under clipping if it peaks.
for (const [genre, bpm] of [['dubstep', 140], ['dnb', 174]]) {
  const a = arrangement({ genre })
  const x = mix(a)
  if (genre === 'dubstep') {
    const gate = (t) => Math.min(1, Math.max(0, (a.start - t) / 0.005, (t - a.drop) / 0.005 + 1))
    wobble(x.length).forEach((v, i) => (x[i] += v * gate(i / SR)))
  }
  const peak = x.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
  if (peak > 0.99) x.forEach((v, i) => (x[i] = (v * 0.99) / peak))
  const file = join(out, `${genre}${bpm}-arr.wav`)
  writeFileSync(file, wav(x))
  console.log(file, (x.length / SR).toFixed(1), 's, build', a.start.toFixed(2), 's, drop', a.drop.toFixed(2), 's, peak', peak.toFixed(2))
}
