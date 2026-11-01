// Browser-check fixtures (plan S2.5): `pattern()` beds from synth.ts encoded as 16-bit PCM WAV, no dependency.
// Run: node --experimental-strip-types scripts/make-fx.mjs  (writes ../../scratchpad/fx_audio/, gitignored)
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mix, pattern, SR } from '../src/audio/synth.ts'

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
