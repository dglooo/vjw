import type { SceneDoc } from '../doc'

// Built-in scenes (design E4): JSON-compatible literals, so tsc checks them and doc.test.ts round-trips them. Immutable:
// edits go to a copy. Spectrum, particles and glitch return as docs when their natives exist (S2.3, S2.4).
export const BUILTIN: readonly SceneDoc[] = [
  {
    v: 1, id: 'builtin:tunnel', name: 'Tunnel', star: true,
    layers: [{ gen: { ref: 'native/tunnel' }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 }],
  },
  {
    v: 1, id: 'builtin:kaleido-tunnel', name: 'Kaleido tunnel', star: true,
    layers: [{
      gen: { ref: 'native/tunnel' },
      fx: [{
        ref: 'isf/Kaleidoscope',
        values: { center: [0.5, 0.5] }, // the file's default is the corner
        bind: { angle: { source: 'bass', amount: 1, attack: 0, release: 0.15, min: 0, max: 0.125 } }, // ≤ 45° on a kick
      }],
      blend: 'normal', opacity: 1, speed: 1, res: 1,
    }],
  },
]
