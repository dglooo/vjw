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
  // 3D / geometry (S4.2): one generator per scene, so each shows before layers composite (S3.3); `res` and the layer
  // speed binding take effect from S3.3 too. The gen bindings repeat each file's VJW_BIND suggestion.
  {
    v: 1, id: 'builtin:flythrough', name: 'Flythrough', star: true,
    layers: [{
      gen: { ref: 'own/flythrough', bind: { glow: { source: 'bass', amount: 1, attack: 0.02, release: 0.25, min: 0.3, max: 2 } } },
      fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.5,
      bind: { speed: { source: 'bass', amount: 1, attack: 0.05, release: 0.5, min: 0.7, max: 2 } }, // faster flight on bass
    }],
  },
  {
    v: 1, id: 'builtin:tunnel-mesh', name: 'Tunnel mesh', star: true,
    layers: [{
      gen: {
        ref: 'own/tunnel-mesh',
        bind: {
          twist: { source: 'bass', amount: 1, attack: 0.03, release: 0.35, min: 0.01, max: 0.1 }, // the tube screws on a kick
          flash: { source: 'onset', amount: 1, attack: 0, release: 0.15, min: 0, max: 1 },
        },
      },
      fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.75,
    }],
  },
  {
    v: 1, id: 'builtin:worley-cells', name: 'Worley cells', star: true,
    layers: [{
      gen: {
        ref: 'isf/Worley Cells',
        values: { density: 7, speed: 0.8, colorMode: 1, cellColor1: [0.2, 0.9, 1, 1], cellColor2: [0.08, 0, 0.2, 1] },
        bind: { borderWidth: { source: 'bass', amount: 1, attack: 0.02, release: 0.25, min: 0.03, max: 0.3 } },
      },
      fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.75,
    }],
  },
  {
    v: 1, id: 'builtin:truchet', name: 'Truchet', star: true,
    layers: [{
      gen: {
        ref: 'isf/Truchet Tile',
        values: { color1: [1, 0.25, 0.7, 1], color2: [0.03, 0, 0.08, 1], lineMode: true },
        bind: { tSize: { source: 'bass', amount: 1, attack: 0.02, release: 0.3, min: 0.06, max: 0.1 } }, // the maze breathes
      },
      fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.75,
    }],
  },
  {
    v: 1, id: 'builtin:particles-over-tunnel', name: 'Particles over tunnel', star: true,
    layers: [
      { gen: { ref: 'native/tunnel' }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 },
      { gen: { ref: 'native/particles' }, fx: [], blend: 'add', opacity: 0.9, speed: 1, res: 1 },
    ],
  },
  {
    v: 1, id: 'builtin:trails-spectrum', name: 'Trails spectrum', star: true,
    layers: [{
      gen: { ref: 'native/spectrum' },
      fx: [{ ref: 'isf/Long Exposure', values: { absorptionRate: 0.1, dischargeRate: 0.12 } }], // longer, softer trails
      blend: 'normal', opacity: 1, speed: 1, res: 1,
    }],
  },
  {
    // The Shadertoy node's own fixture (S3.4): inline `mainImage` code, as a paste. iChannel0 row 0 is the FFT, 512 bins
    // up to Nyquist, so x = 0.004 reads bins 1–2 (≈ 45–95 Hz): the kick swells the rings and the light.
    v: 1, id: 'builtin:toy-plasma', name: 'Toy plasma', star: true,
    layers: [{
      gen: {
        ref: 'toy/plasma', credit: 'VeeJay Wizard',
        code: `// Toy plasma (VeeJay Wizard, own): four sine fields through a cosine palette.
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 p = (2.0 * fragCoord - iResolution.xy) / iResolution.y;
    float bass = texture(iChannel0, vec2(0.004, 0.25)).r;
    float t = iTime * 0.5;
    float v = sin(p.x * 3.0 + t) + sin(p.y * 2.5 - t * 1.3) + sin((p.x + p.y) * 2.0 + t * 0.7)
            + sin(length(p) * (7.0 - 3.0 * bass) - t * 2.0);
    vec3 col = 0.5 + 0.5 * cos(v * 1.6 + vec3(0.0, 2.1, 4.2) + iTime * 0.15);
    fragColor = vec4(col * (0.5 + 0.7 * bass), 1.0);
}`,
      },
      fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1,
    }],
  },
]
