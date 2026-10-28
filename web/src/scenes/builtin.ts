import type { SceneDoc } from '../doc'

// Built-in scenes (design E4): JSON-compatible literals, so tsc checks them and doc.test.ts round-trips them. Immutable:
// edits go to a copy. The order is the autopilot's: the natives, then the combinations.
export const BUILTIN: readonly SceneDoc[] = [
  {
    v: 1, id: 'builtin:tunnel', name: 'Tunnel', star: true,
    layers: [{ gen: { ref: 'native/tunnel' }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 }],
  },
  {
    v: 1, id: 'builtin:spectrum', name: 'Spectrum', star: true,
    layers: [{ gen: { ref: 'native/spectrum' }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 }],
  },
  {
    v: 1, id: 'builtin:particles', name: 'Particles', star: true,
    layers: [{ gen: { ref: 'native/particles' }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 }],
  },
  {
    v: 1, id: 'builtin:glitch', name: 'Glitch', star: true,
    layers: [{ gen: { ref: 'native/glitch' }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 }],
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
  {
    v: 1, id: 'builtin:vhs-tunnel', name: 'VHS tunnel', star: true,
    layers: [{
      gen: { ref: 'native/tunnel' },
      fx: [
        { ref: 'isf/Chromatic Aberration' }, // a steady RGB split, as a worn tape
        { ref: 'isf/VHS Glitch', bind: { yScanlineAmount: { source: 'bass', amount: 1, attack: 0, release: 0.2, min: 0, max: 0.8 } } }, // tracking skew on a kick
        { ref: 'own/flash', bind: { flash: { source: 'onset', amount: 1, attack: 0, release: 0.1, min: 0, max: 0.9 } } },
      ],
      blend: 'normal', opacity: 1, speed: 1, res: 1,
    }],
  },
  {
    // Two filters at most over the spectrum: a third took the scene from 3.7 to 6.4 ms GPU p95 at 1728×1118 (S4.4).
    v: 1, id: 'builtin:crt-spectrum', name: 'CRT spectrum', star: true,
    layers: [{
      gen: { ref: 'native/spectrum' },
      fx: [
        { ref: 'own/scanlines' },
        // Last, so the scanlines bend with the glass, which bulges on a kick.
        { ref: 'isf/v002-CRT-Displacement', bind: { Amount: { source: 'bass', amount: 1, attack: 0, release: 0.2, min: 0.3, max: 0.8 } } },
      ],
      blend: 'normal', opacity: 1, speed: 1, res: 1,
    }],
  },
  {
    v: 1, id: 'builtin:pixel-strobe', name: 'Pixel strobe', star: true,
    layers: [{
      gen: { ref: 'native/tunnel' },
      fx: [
        { ref: 'isf/Pixellate', bind: { cell_size: { source: 'bass', amount: 1, attack: 0, release: 0.2, min: 0.008, max: 0.025 } } }, // bigger pixels on a kick
        { ref: 'isf/Posterize', values: { numColors: 5 } },
        // On for the first part of every beat: the saw falls 1 → 0 over the beat, and a bool is on at ≥ 0.5.
        { ref: 'own/strobe', bind: { strobe: { source: 'beat', shape: 'saw', amount: 1, attack: 0, release: 0, min: 0, max: 0.65 } } },
      ],
      blend: 'normal', opacity: 1, speed: 1, res: 1,
    }],
  },
]
