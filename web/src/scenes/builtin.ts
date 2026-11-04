import type { Binding } from '../bind'
import type { SceneDoc } from '../doc'
import { MILK_SCENES, spread } from '../milkdrop/presets'

// own/bloom's VJW_BIND (plan_td_look.md S1.4), for the two scenes that end on it; ⚡ = VJW_FLASH, ≤3 onsets/s
const BLOOM: Record<string, Binding> = {
  threshold: { source: 'build', amount: 1, attack: 1, release: 1, min: 0.35, max: 0.15 }, // a build lowers it (min > max inverts)
  glow: { source: 'kick', amount: 1, attack: 0, release: 0.2, min: 0, max: 1 }, // ⚡ a kick pulses the glow
  level: { source: 'drop', amount: 1, attack: 0, release: 1.5, min: 0, max: 1 }, // ⚡ the drop floods it
  rampShift: { source: 'bar', shape: 'saw', amount: 1, attack: 0, release: 0, min: 0, max: 1 }, // the tint turns once a bar
}

// Built-in scenes (design E4): JSON-compatible literals, so tsc checks them and doc.test.ts round-trips them. Immutable:
// edits go to a copy. The order is the autopilot's: the natives, then the combinations, with the MilkDrop scenes
// spread evenly among them (BUILTIN, at the end).
const OWN: readonly SceneDoc[] = [
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
    // res 0.5: GPU p95 with kicks 6.4 → 3.2 ms at 1728×1118 (S4.2b); the points scale with the layer height
    layers: [{ gen: { ref: 'native/particles' }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.5 }],
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
        { ref: 'own/flash', bind: { flash: { source: 'kick', amount: 1, attack: 0, release: 0.1, min: 0, max: 0.9 } } }, // CP1 demo
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
  // S4.2b: the raymarchers dropped over budget at res 1 in S4.2, back at a res that fits.
  {
    v: 1, id: 'builtin:fractal', name: 'Fractal', star: true,
    layers: [{
      gen: {
        ref: 'own/fractal',
        bind: {
          fold: { source: 'bass', amount: 1, attack: 0.03, release: 0.3, min: 0.06, max: 0.32 }, // the sponge twists into crystal
          glow: { source: 'onset', amount: 1, attack: 0, release: 0.25, min: 0.4, max: 2.5 },
        },
      },
      fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.5,
    }],
  },
  {
    v: 1, id: 'builtin:wave-landscape', name: 'Wave landscape', star: true,
    layers: [{
      gen: {
        ref: 'own/wave-landscape',
        bind: {
          height: { source: 'bass', amount: 1, attack: 0.03, release: 0.3, min: 0.5, max: 1.8 }, // the mountains lift on a kick
          glow: { source: 'onset', amount: 1, attack: 0, release: 0.2, min: 0.8, max: 2.5 },
        },
      },
      fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.5,
    }],
  },
  {
    v: 1, id: 'builtin:sdf-shapes', name: 'SDF shapes', star: true,
    layers: [{
      gen: {
        ref: 'own/sdf-shapes',
        bind: {
          morph: { source: 'bass', amount: 1, attack: 0.02, release: 0.3, min: 0, max: 1 }, // cube → dodecahedron on a kick
          burst: { source: 'onset', amount: 1, attack: 0, release: 0.2, min: 0, max: 1 },
        },
      },
      fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.5,
    }],
  },
  {
    v: 1, id: 'builtin:particles-over-tunnel', name: 'Particles over tunnel', star: true,
    layers: [
      { gen: { ref: 'native/tunnel' }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 },
      { gen: { ref: 'native/particles' }, fx: [], blend: 'add', opacity: 0.9, speed: 1, res: 0.5 },
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
  // Feedback / kaleidoscope / mirrors (S4.1).
  {
    v: 1, id: 'builtin:spiral-mesh', name: 'Spiral mesh', star: true,
    layers: [{
      gen: {
        ref: 'own/tunnel-mesh',
        bind: {
          twist: { source: 'bass', amount: 1, attack: 0.03, release: 0.35, min: 0.01, max: 0.1 },
          flash: { source: 'onset', amount: 1, attack: 0, release: 0.15, min: 0, max: 1 },
        },
      },
      fx: [{ ref: 'own/feedback-zoom', bind: { zoom: { source: 'onset', amount: 1, attack: 0, release: 0.2, min: 0.01, max: 0.06 } } }], // the trails punch out on a hit
      blend: 'normal', opacity: 1, speed: 1, res: 0.75,
    }],
  },
  {
    v: 1, id: 'builtin:slit-scan', name: 'Slit scan', star: true,
    layers: [{
      gen: { ref: 'native/tunnel' },
      fx: [
        { ref: 'isf/Sine Warp Tile', bind: { angle: { source: 'lfo', shape: 'saw', rate: 0.03, amount: 1, attack: 0, release: 0, min: 0, max: 1 } } },
        { ref: 'own/echo', bind: { speed: { source: 'bass', amount: 1, attack: 0.02, release: 0.3, min: 2, max: 10 } } }, // the stream rushes on a kick
      ],
      blend: 'normal', opacity: 1, speed: 1, res: 1,
    }],
  },
  {
    v: 1, id: 'builtin:kaleido-maze', name: 'Kaleido maze', star: true,
    layers: [{
      gen: {
        ref: 'isf/Truchet Tile',
        values: { color1: [0.03, 0, 0.08, 1], color2: [0.2, 0.9, 1, 1], lineMode: true }, // color2 is the line
        bind: { tSize: { source: 'bass', amount: 1, attack: 0.02, release: 0.3, min: 0.06, max: 0.1 } },
      },
      fx: [
        {
          ref: 'isf/Kaleidoscope Tile',
          bind: {
            rotation: { source: 'lfo', shape: 'saw', rate: 0.05, amount: 1, attack: 0, release: 0, min: 0, max: 1 }, // one turn per 20 s
            angle: { source: 'bass', amount: 1, attack: 0.02, release: 0.3, min: 0, max: 0.08 },
          },
        },
        { ref: 'isf/Comet Tails', values: { dischargeRate: 0.08 } },
      ],
      blend: 'normal', opacity: 1, speed: 1, res: 0.75,
    }],
  },
  {
    v: 1, id: 'builtin:feedback-ring', name: 'Feedback ring', star: true,
    layers: [{
      gen: { ref: 'native/spectrum' },
      fx: [
        { ref: 'isf/Mirror', values: { horizontal: false, vertical: true } }, // bars from the top and the bottom
        {
          ref: 'isf/Circular Feedback Mask',
          values: { maskRadius: 0.22, fadeRate: 0.6 },
          bind: {
            twirlAmount: { source: 'bass', amount: 1, attack: 0.02, release: 0.3, min: 0.01, max: 0.08 }, // the rings spiral on a kick
            feedbackRate: { source: 'onset', amount: 1, attack: 0, release: 0.2, min: 3, max: 10 },
          },
        },
      ],
      blend: 'normal', opacity: 1, speed: 1, res: 0.5,
    }],
  },
  {
    v: 1, id: 'builtin:rainbow-trails', name: 'Rainbow trails', star: true,
    layers: [{
      gen: { ref: 'native/spectrum' },
      fx: [{ ref: 'own/trails', bind: { rise: { source: 'bass', amount: 1, attack: 0.02, release: 0.3, min: 1, max: 8 } } }], // kicks blow the trails up
      blend: 'normal', opacity: 1, speed: 1, res: 0.5,
    }],
  },
  // Liquids / metal (S4.3): procedural, plus feedback advection (smoke), no Navier–Stokes (design E8). The noise-heavy
  // generators run at res 0.5–0.75; the bindings repeat each file's VJW_BIND suggestion.
  {
    v: 1, id: 'builtin:liquid-chrome', name: 'Liquid chrome', star: true,
    layers: [{
      gen: { ref: 'own/liquid-chrome', bind: { burst: { source: 'onset', amount: 1, attack: 0, release: 0.35, min: 0, max: 1 } } }, // a drop on every hit
      fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.75,
    }],
  },
  {
    v: 1, id: 'builtin:fluid', name: 'Fluid', star: true,
    layers: [{
      gen: { ref: 'own/domain-warp', bind: { warp: { source: 'bass', amount: 1, attack: 0.05, release: 0.4, min: 1, max: 2.2 } } }, // folds deeper on bass
      fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.5,
    }],
  },
  {
    v: 1, id: 'builtin:lava-smoke', name: 'Lava smoke', star: true,
    layers: [{
      gen: { ref: 'own/metaballs', bind: { size: { source: 'bass', amount: 1, attack: 0.03, release: 0.3, min: 0.9, max: 1.3 } } },
      fx: [{ ref: 'own/smoke', bind: { curl: { source: 'bass', amount: 1, attack: 0.05, release: 0.5, min: 0.2, max: 0.7 } } }], // the blobs steam
      blend: 'normal', opacity: 1, speed: 1, res: 1,
    }],
  },
  {
    v: 1, id: 'builtin:ink', name: 'Ink', star: true,
    layers: [{
      gen: { ref: 'own/ink', bind: { spread: { source: 'bass', amount: 1, attack: 0.05, release: 0.5, min: 0.4, max: 0.75 } } }, // the clouds swell
      fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.5,
    }],
  },
  // TD look (Stage 2d, plan_td_look.md): TD's feedback chains as own files; the bindings repeat each file's VJW_BIND.
  // Auto-style moves only the `bass`-bound param: DnB → reese, Dubstep → wobble, Techno or off → bass.
  {
    v: 1, id: 'builtin:td-feedback', name: 'TD feedback', star: true,
    layers: [{
      gen: { ref: 'native/spectrum' },
      fx: [{
        ref: 'own/td-feedback',
        bind: {
          zoom: { source: 'kick', amount: 1, attack: 0, release: 0.25, min: 1.012, max: 1.035 }, // pumps on a kick
          hueStep: { source: 'snare', amount: 1, attack: 0, release: 0.3, min: 5, max: 15 }, // a snare sweeps the colours
          edge: { source: 'hats', amount: 1, attack: 0, release: 0.1, min: 0.25, max: 0.6 },
          displace: { source: 'bass', amount: 1, attack: 0.05, release: 0.4, min: 0.006, max: 0.025 }, // Auto-style's one
          fade: { source: 'build', amount: 1, attack: 1, release: 2, min: 0.95, max: 0.98 }, // a build lengthens the trails
          reset: { source: 'drop', amount: 1, attack: 0, release: 1.5, min: 0, max: 1 }, // the drop wipes them
        },
      }, { ref: 'own/bloom', bind: BLOOM }],
      blend: 'normal', opacity: 1, speed: 1, res: 0.5, // the spectrum at ½: the effects still run at full size (S1.4 budget)
    }],
  },
  {
    v: 1, id: 'builtin:edge-rings', name: 'Edge rings', star: true,
    layers: [{
      gen: { ref: 'native/tunnel' },
      fx: [{
        ref: 'own/edge-rings',
        bind: {
          scale: { source: 'kick', amount: 1, attack: 0, release: 0.3, min: 1.002, max: 1.012 }, // a kick pushes the rings out
          hueStep: { source: 'snare', amount: 1, attack: 0, release: 0.3, min: -1, max: -8 }, // a snare steps their colour
          gain: { source: 'sub', amount: 1, attack: 0.1, release: 0.6, min: 1.03, max: 1.08 }, // the sub swells them
          edge: { source: 'bass', amount: 1, attack: 0.05, release: 0.3, min: 0.15, max: 0.4 }, // Auto-style's one
          reset: { source: 'drop', amount: 1, attack: 0, release: 1.5, min: 0, max: 1 }, // the drop wipes them
        },
      }],
      blend: 'normal', opacity: 1, speed: 1, res: 1,
    }],
  },
  {
    v: 1, id: 'builtin:bloom-glitch', name: 'Bloom glitch', star: true, // no `bass` binding, so Auto-style changes nothing
    layers: [{ gen: { ref: 'native/glitch' }, fx: [{ ref: 'own/bloom', bind: BLOOM }], blend: 'normal', opacity: 1, speed: 1, res: 1 }],
  },
]

// Design Q4: Tunnel stays first (library.test.ts), both orders kept.
export const BUILTIN: readonly SceneDoc[] = spread(OWN, MILK_SCENES)
