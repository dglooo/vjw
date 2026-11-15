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

// native/particles in its two scenes (S4.1): its onsets and bass live in its code; these add the bass class and a build.
const PARTICLES: Record<string, Binding> = {
  swirl: { source: 'reese', amount: 1, attack: 0.05, release: 0.4, min: 1.5, max: 3.5 }, // the bass spins the disc
  glow: { source: 'build', amount: 1, attack: 1, release: 2, min: 2, max: 4 }, // a build heats the bloom
}

// Built-in scenes (design E4): JSON-compatible literals, so tsc checks them and doc.test.ts round-trips them. Immutable:
// edits go to a copy. The order is the autopilot's: the natives, then the combinations, with the MilkDrop scenes
// spread evenly among them (BUILTIN, at the end).
// Bindings (design_td_look.md policy, rebind S4.1): drums, sub and build/drop bound directly; the bass class on `reese`,
// which Auto-style moves per genre; no `onset`/`treb`. A file's VJW_BIND stays its suggestion for a new node.
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
    layers: [{ gen: { ref: 'native/particles', bind: PARTICLES }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.5 }],
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
        bind: { angle: { source: 'kick', amount: 1, attack: 0, release: 0.15, min: 0, max: 0.125 } }, // ≤ 45° on a kick
      }],
      blend: 'normal', opacity: 1, speed: 1, res: 1,
    }],
  },
  {
    v: 1, id: 'builtin:vhs-tunnel', name: 'VHS tunnel', star: true,
    layers: [{
      gen: { ref: 'native/tunnel' },
      fx: [
        // A worn tape's steady RGB split (the file's .02), jittered by the hats.
        { ref: 'isf/Chromatic Aberration', bind: { amount: { source: 'hats', amount: 1, attack: 0, release: 0.06, min: 0.02, max: 0.04 } } },
        { ref: 'isf/VHS Glitch', bind: { yScanlineAmount: { source: 'kick', amount: 1, attack: 0, release: 0.2, min: 0, max: 0.8 } } }, // tracking skew on a kick
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
        // Last, so the scanlines bend with the glass, which bulges on the bass.
        { ref: 'isf/v002-CRT-Displacement', bind: { Amount: { source: 'reese', amount: 1, attack: 0, release: 0.2, min: 0.3, max: 0.8 } } },
      ],
      blend: 'normal', opacity: 1, speed: 1, res: 1,
    }],
  },
  {
    v: 1, id: 'builtin:pixel-strobe', name: 'Pixel strobe', star: true,
    layers: [{
      gen: { ref: 'native/tunnel' },
      fx: [
        { ref: 'isf/Pixellate', bind: { cell_size: { source: 'kick', amount: 1, attack: 0, release: 0.2, min: 0.008, max: 0.025 } } }, // bigger pixels on a kick
        { ref: 'isf/Posterize', values: { numColors: 5 } },
        // On for the first part of every beat: the saw falls 1 → 0 over the beat, and a bool is on at ≥ 0.5.
        { ref: 'own/strobe', bind: { strobe: { source: 'beat', shape: 'saw', amount: 1, attack: 0, release: 0, min: 0, max: 0.65 } } },
      ],
      blend: 'normal', opacity: 1, speed: 1, res: 1,
    }],
  },
  // 3D / geometry (S4.2): one generator per scene, so each shows before layers composite (S3.3); `res` and the layer
  // speed binding take effect from S3.3 too.
  {
    v: 1, id: 'builtin:flythrough', name: 'Flythrough', star: true,
    layers: [{
      gen: { ref: 'own/flythrough', bind: { glow: { source: 'sub', amount: 1, attack: 0.02, release: 0.25, min: 0.3, max: 2 } } },
      fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.5,
      bind: { speed: { source: 'reese', amount: 1, attack: 0.05, release: 0.5, min: 0.7, max: 2 } }, // faster flight on bass
    }],
  },
  {
    v: 1, id: 'builtin:tunnel-mesh', name: 'Tunnel mesh', star: true,
    layers: [{
      gen: {
        ref: 'own/tunnel-mesh',
        bind: {
          twist: { source: 'kick', amount: 1, attack: 0.03, release: 0.35, min: 0.01, max: 0.1 }, // the tube screws on a kick
          flash: { source: 'snare', amount: 1, attack: 0, release: 0.15, min: 0, max: 1 }, // ⚡
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
        bind: { borderWidth: { source: 'sub', amount: 1, attack: 0.02, release: 0.25, min: 0.03, max: 0.3 } },
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
        bind: { tSize: { source: 'sub', amount: 1, attack: 0.02, release: 0.3, min: 0.06, max: 0.1 } }, // the maze breathes
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
          fold: { source: 'reese', amount: 1, attack: 0.03, release: 0.3, min: 0.06, max: 0.32 }, // the sponge twists into crystal
          glow: { source: 'kick', amount: 1, attack: 0, release: 0.25, min: 0, max: 2.5 }, // ⚡ from 0: at .4 the gate held it (S4.1)
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
          height: { source: 'kick', amount: 1, attack: 0.03, release: 0.3, min: 0.5, max: 1.8 }, // the mountains lift on a kick
          flash: { source: 'snare', amount: 1, attack: 0, release: 0.2, min: 0, max: 1 }, // ⚡ on top of a steady glow (S4.2: a gated glow lost the grid)
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
          morph: { source: 'kick', amount: 1, attack: 0.02, release: 0.3, min: 0, max: 1 }, // cube → dodecahedron on a kick
          burst: { source: 'snare', amount: 1, attack: 0, release: 0.2, min: 0, max: 1 },
        },
      },
      fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.5,
    }],
  },
  {
    v: 1, id: 'builtin:particles-over-tunnel', name: 'Particles over tunnel', star: true,
    layers: [
      { gen: { ref: 'native/tunnel' }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 },
      { gen: { ref: 'native/particles', bind: PARTICLES }, fx: [], blend: 'add', opacity: 0.9, speed: 1, res: 0.5 },
    ],
  },
  {
    v: 1, id: 'builtin:trails-spectrum', name: 'Trails spectrum', star: true,
    layers: [{
      gen: { ref: 'native/spectrum' },
      fx: [{
        ref: 'isf/Long Exposure',
        values: { absorptionRate: 0.1, dischargeRate: 0.12 }, // longer, softer trails
        bind: { dischargeRate: { source: 'build', amount: 1, attack: 1, release: 2, min: 0.12, max: 0.05 } }, // a build lengthens them (min > max inverts)
      }],
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
          twist: { source: 'reese', amount: 1, attack: 0.03, release: 0.35, min: 0.01, max: 0.1 },
          flash: { source: 'snare', amount: 1, attack: 0, release: 0.15, min: 0, max: 1 }, // ⚡ (tunnel-mesh's key)
        },
      },
      fx: [{ ref: 'own/feedback-zoom', bind: { zoom: { source: 'kick', amount: 1, attack: 0, release: 0.2, min: 0.01, max: 0.06 } } }], // the trails punch out on a hit
      blend: 'normal', opacity: 1, speed: 1, res: 0.75,
    }],
  },
  {
    v: 1, id: 'builtin:slit-scan', name: 'Slit scan', star: true,
    layers: [{
      gen: { ref: 'native/tunnel' },
      fx: [
        { ref: 'isf/Sine Warp Tile', bind: { angle: { source: 'lfo', shape: 'saw', rate: 0.03, amount: 1, attack: 0, release: 0, min: 0, max: 1 } } },
        { ref: 'own/echo', bind: { speed: { source: 'kick', amount: 1, attack: 0.02, release: 0.3, min: 2, max: 10 } } }, // the stream rushes on a kick
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
        bind: { tSize: { source: 'sub', amount: 1, attack: 0.02, release: 0.3, min: 0.06, max: 0.1 } },
      },
      fx: [
        {
          ref: 'isf/Kaleidoscope Tile',
          bind: {
            rotation: { source: 'lfo', shape: 'saw', rate: 0.05, amount: 1, attack: 0, release: 0, min: 0, max: 1 }, // one turn per 20 s
            angle: { source: 'kick', amount: 1, attack: 0.02, release: 0.3, min: 0, max: 0.08 },
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
            twirlAmount: { source: 'kick', amount: 1, attack: 0.02, release: 0.3, min: 0.01, max: 0.08 }, // the rings spiral on a kick
            feedbackRate: { source: 'snare', amount: 1, attack: 0, release: 0.2, min: 3, max: 10 },
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
      fx: [{ ref: 'own/trails', bind: { rise: { source: 'kick', amount: 1, attack: 0.02, release: 0.3, min: 1, max: 8 } } }], // kicks blow the trails up
      blend: 'normal', opacity: 1, speed: 1, res: 0.5,
    }],
  },
  // Liquids / metal (S4.3): procedural, plus feedback advection (smoke), no Navier–Stokes (design E8). The noise-heavy
  // generators run at res 0.5–0.75.
  {
    v: 1, id: 'builtin:liquid-chrome', name: 'Liquid chrome', star: true,
    layers: [{
      gen: { ref: 'own/liquid-chrome', bind: { burst: { source: 'kick', amount: 1, attack: 0, release: 0.35, min: 0, max: 1 } } }, // a drop on every kick
      fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.75,
    }],
  },
  {
    v: 1, id: 'builtin:fluid', name: 'Fluid', star: true,
    layers: [{
      gen: { ref: 'own/domain-warp', bind: { warp: { source: 'reese', amount: 1, attack: 0.05, release: 0.4, min: 1, max: 2.2 } } }, // folds deeper on bass
      fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.5,
    }],
  },
  {
    v: 1, id: 'builtin:lava-smoke', name: 'Lava smoke', star: true,
    layers: [{
      gen: { ref: 'own/metaballs', bind: { size: { source: 'sub', amount: 1, attack: 0.03, release: 0.3, min: 0.9, max: 1.3 } } },
      fx: [{ ref: 'own/smoke', bind: { curl: { source: 'reese', amount: 1, attack: 0.05, release: 0.5, min: 0.2, max: 0.7 } } }], // the blobs steam
      blend: 'normal', opacity: 1, speed: 1, res: 1,
    }],
  },
  {
    v: 1, id: 'builtin:ink', name: 'Ink', star: true,
    layers: [{
      gen: { ref: 'own/ink', bind: { spread: { source: 'sub', amount: 1, attack: 0.05, release: 0.5, min: 0.4, max: 0.75 } } }, // the clouds swell
      fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.5,
    }],
  },
  // TD look (Stage 2d, plan_td_look.md): TD's feedback chains as own files; the bindings repeat each file's VJW_BIND.
  // The bass class binds `reese` (design ruling 2026-11-05); Auto-style moves only it, to wobble under Dubstep.
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
          displace: { source: 'reese', amount: 1, attack: 0.05, release: 0.4, min: 0.006, max: 0.025 }, // Auto-style's one
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
          edge: { source: 'reese', amount: 1, attack: 0.05, release: 0.3, min: 0.15, max: 0.4 }, // Auto-style's one
          reset: { source: 'drop', amount: 1, attack: 0, release: 1.5, min: 0, max: 1 }, // the drop wipes them
        },
      }],
      blend: 'normal', opacity: 1, speed: 1, res: 1,
    }],
  },
  {
    v: 1, id: 'builtin:bloom-glitch', name: 'Bloom glitch', star: true, // no bass-class binding, so Auto-style changes nothing
    layers: [{ gen: { ref: 'native/glitch' }, fx: [{ ref: 'own/bloom', bind: BLOOM }], blend: 'normal', opacity: 1, speed: 1, res: 1 }],
  },
  {
    v: 1, id: 'builtin:light-tunnel', name: 'Light tunnel', star: true,
    layers: [{
      gen: { ref: 'native/tunnel' }, // its rings keep the mouth round (the spectrum's bars square it off: S1.6)
      fx: [{
        ref: 'own/light-tunnel',
        bind: {
          radius: { source: 'sub', amount: 1, attack: 0.05, release: 0.4, min: 0.3, max: 0.6 }, // the sub opens the mouth
          twirl: { source: 'reese', amount: 1, attack: 0.05, release: 0.4, min: 0, max: 4 }, // Auto-style's one
          centerX: { source: 'bar', shape: 'sine', amount: 1, attack: 0, release: 0, min: 0.45, max: 0.55 }, // sways once a bar
        },
      }, {
        ref: 'own/radial-blur',
        bind: {
          strength: { source: 'kick', amount: 1, attack: 0, release: 0.18, min: 0.04, max: 0.3 }, // a kick jumps to light speed
          centerX: { source: 'bar', shape: 'sine', amount: 1, attack: 0, release: 0, min: 0.45, max: 0.55 }, // the zoom follows the mouth
        },
      }],
      blend: 'normal', opacity: 1, speed: 1, res: 1,
    }],
  },
  {
    v: 1, id: 'builtin:flow-smear', name: 'Flow smear', star: true,
    layers: [{
      gen: { ref: 'native/spectrum' }, // its bars move on their own (the tunnel moves everywhere, so it all trailed: S1.7)
      fx: [{
        ref: 'own/flow-smear',
        bind: {
          force: { source: 'reese', amount: 1, attack: 0.05, release: 0.3, min: 0.5, max: 3 }, // Auto-style's one: the streaks stretch
          decay: { source: 'build', amount: 1, attack: 1, release: 2, min: 0.92, max: 0.97 }, // a build lengthens them
          tint: { source: 'hats', amount: 1, attack: 0, release: 0.12, min: 0, max: 0.35 }, // hats turn their colour
        },
      }],
      blend: 'normal', opacity: 1, speed: 1, res: 0.5, // the spectrum at ½, flow-smear still at full size (S1.4's lever)
    }],
  },
  {
    v: 1, id: 'builtin:reaction-diffusion', name: 'Reaction-diffusion', star: true,
    layers: [{
      gen: { ref: 'native/spectrum' }, // its bars seed the coral
      fx: [{
        ref: 'own/reaction-diffusion',
        bind: {
          seed: { source: 'sub', amount: 1, attack: 0.02, release: 0.25, min: 0.3, max: 0.6 }, // a steady bed grows it, the sub speeds it up
          kill: { source: 'reese', amount: 1, attack: 0.1, release: 0.6, min: 0.062, max: 0.064 }, // Auto-style's one: mazes ↔ spots
          feed: { source: 'build', amount: 1, attack: 2, release: 2, min: 0.0545, max: 0.04 }, // a build starves it
          palette: { source: 'snare', amount: 1, attack: 0, release: 0.3, min: 0, max: 0.15 }, // a snare turns the colours
          reset: { source: 'drop', amount: 1, attack: 0, release: 1.5, min: 0, max: 1 }, // the drop wipes it to a splash
        },
      }],
      blend: 'normal', opacity: 1, speed: 1, res: 0.5, // the spectrum at ½ (RD itself runs at ½ and colours at full size)
    }],
  },
  {
    v: 1, id: 'builtin:rgba-delay', name: 'RGBA delay', star: true,
    layers: [{
      gen: { ref: 'native/tunnel' }, // its rings move everywhere, so every edge fringes
      fx: [{
        ref: 'native/rgba-delay', // the def's bind (scenes/history.ts), repeated: built-ins stay JSON literals
        bind: {
          spread: { source: 'reese', amount: 1, attack: 0.05, release: 0.3, min: 1, max: 12 }, // Auto-style's one: the split widens
          rotate: { source: 'snare', amount: 1, attack: 0, release: 0.1, min: 0, max: 1 }, // a snare cycles the channel order
        },
      }],
      blend: 'normal', opacity: 1, speed: 1, res: 1,
    }],
  },
  {
    v: 1, id: 'builtin:time-machine', name: 'Time machine', star: true,
    layers: [{
      gen: {
        ref: 'isf/Truchet Tile', // static on its own: the kick zooms it, so the rings have a past to show
        values: { color1: [1, 0.25, 0.7, 1], color2: [0.03, 0, 0.08, 1], lineMode: true },
        bind: { tSize: { source: 'kick', amount: 1, attack: 0.02, release: 0.3, min: 0.06, max: 0.1 } },
      },
      fx: [{
        ref: 'native/time-machine', // the def's bind (scenes/history.ts), repeated: built-ins stay JSON literals
        values: { tint: 0.9 }, // ≈ TD's example, 330° of hue across the history: the rings show in colour, pink is the present
        bind: {
          swirl: { source: 'reese', amount: 1, attack: 0.05, release: 0.3, min: 0, max: 1 }, // Auto-style's one: the rings twist
          depth: { source: 'build', amount: 1, attack: 1, release: 1, min: 0.3, max: 1 }, // a build reaches further back
          phase: { source: 'beat', shape: 'saw', amount: 1, attack: 0, release: 0, min: 0, max: 1 }, // one sweep per beat
        },
      }],
      blend: 'normal', opacity: 1, speed: 1, res: 1,
    }],
  },
  {
    v: 1, id: 'builtin:slit-scan-ring', name: 'Slit scan ring', star: true, // the history ring's; builtin:slit-scan is the echo one
    layers: [{
      gen: { ref: 'native/spectrum' }, // every row up the stage is an older frame: the bars smear upward through time
      fx: [{
        ref: 'native/slit-scan', // the def's bind (scenes/history.ts), repeated: built-ins stay JSON literals
        bind: {
          span: { source: 'sub', amount: 1, attack: 0.05, release: 0.5, min: 8, max: 31 }, // the sub stretches the smear back
          wave: { source: 'reese', amount: 1, attack: 0.05, release: 0.3, min: 0, max: 0.3 }, // Auto-style's one: the slit bends
        },
      }],
      blend: 'normal', opacity: 1, speed: 1, res: 1,
    }],
  },
  {
    v: 1, id: 'builtin:swarm', name: 'Swarm', star: true,
    layers: [{
      gen: {
        ref: 'native/swarm', // the def's bind (scenes/points.ts), repeated: built-ins stay JSON literals
        bind: {
          burst: { source: 'kick', amount: 1, attack: 0, release: 0.1, min: 0, max: 3 }, // a kick bursts the swarm outward
          hueStep: { source: 'snare', amount: 1, attack: 0, release: 0.3, min: 0, max: 0.2 }, // a snare turns the colours
          sparkle: { source: 'hats', amount: 1, attack: 0, release: 0.08, min: 0, max: 0.5 }, // hats twinkle the points
          size: { source: 'sub', amount: 1, attack: 0.05, release: 0.3, min: 1.5, max: 3 }, // the sub swells them
          turbulence: { source: 'reese', amount: 1, attack: 0.05, release: 0.4, min: 0.2, max: 2 }, // Auto-style's one: the bass stirs the swirls
          trail: { source: 'build', amount: 1, attack: 1, release: 2, min: 0.85, max: 0.97 }, // a build lengthens the trails
          spawn: { source: 'drop', amount: 1, attack: 0, release: 0.1, min: 0, max: 1 }, // the drop: all reborn at once, the threads gather anew
        },
      },
      fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.75,
    }],
  },
  {
    v: 1, id: 'builtin:scatter', name: 'Scatter', star: true,
    layers: [{
      gen: { ref: 'native/tunnel' }, // its rings and colours give every square something to carry
      fx: [{
        ref: 'native/scatter', // the def's bind (scenes/points.ts), repeated: built-ins stay JSON literals
        bind: {
          burst: { source: 'kick', amount: 1, attack: 0, release: 0.1, min: 0, max: 2 }, // a kick punches the squares outward
          size: { source: 'sub', amount: 1, attack: 0.05, release: 0.3, min: 0.9, max: 1.4 }, // the sub swells them
          scatter: { source: 'reese', amount: 1, attack: 0.05, release: 0.35, min: 0, max: 0.12 }, // Auto-style's one: the bass tears the image
          spring: { source: 'build', amount: 1, attack: 1, release: 2, min: 40, max: 12 }, // a build loosens it: the squares float
          explode: { source: 'drop', amount: 1, attack: 0, release: 0.1, min: 0, max: 1 }, // the drop blasts the image apart, sprung back
        },
      }],
      blend: 'normal', opacity: 1, speed: 1, res: 1,
    }],
  },
  // TD wave 2, S2.2 (CP2): pointillize — the scatter's dots mode: the spectrum as round additive sprites that burst on
  // kicks, scatter on the reese and blast on the drop. The binds repeat the def (scenes/points.ts); the bass class rides
  // `reese`: Auto-style moves it to wobble under Dubstep.
  {
    v: 1, id: 'builtin:pointillize', name: 'Pointillize', star: true, // Auto: reese (scatter; wobble under Dubstep)
    layers: [{
      gen: { ref: 'native/spectrum' }, // its bars give the dots their colours
      fx: [{
        ref: 'native/scatter', // the def's bind (scenes/points.ts), repeated: built-ins stay JSON literals
        values: { dots: 1, sizeVar: 0.7 },
        bind: {
          burst: { source: 'kick', amount: 1, attack: 0, release: 0.1, min: 0, max: 2 }, // a kick bursts the dots
          size: { source: 'sub', amount: 1, attack: 0.05, release: 0.3, min: 0.9, max: 1.4 }, // the sub swells them
          scatter: { source: 'reese', amount: 1, attack: 0.05, release: 0.35, min: 0, max: 0.12 }, // Auto-style's one: the bass scatters them
          spring: { source: 'build', amount: 1, attack: 1, release: 2, min: 40, max: 12 }, // a build loosens it
          explode: { source: 'drop', amount: 1, attack: 0, release: 0.1, min: 0, max: 1 }, // the drop blasts them apart
        },
      }],
      blend: 'normal', opacity: 1, speed: 1, res: 1,
    }],
  },
  // CP4 (2b S4.4): the S4.1–S4.3 pixel effects as scenes. The binds repeat each file's VJW_BIND (built-ins stay JSON
  // literals); the ⚡ ones (bars' and led-grid's glow) are the file's VJW_FLASH, gated to ≤3 onsets/s. The bass class
  // rides `reese` (mosaic's jitter): Auto-style moves it to wobble under Dubstep.
  {
    v: 1, id: 'builtin:bars', name: 'Bars', star: true,
    layers: [{
      gen: {
        ref: 'own/bars',
        values: { shape: 2, gain: 0.7 }, // mirror; gain < 1 keeps the bass bands off the audio texture's −30 dB ceiling on a loud drop (S4.1)
        bind: {
          glow: { source: 'kick', amount: 1, attack: 0, release: 0.15, min: 0, max: 1 }, // ⚡
          hue: { source: 'snare', amount: 1, attack: 0, release: 0.3, min: 0, max: 0.25 },
          thickness: { source: 'sub', amount: 1, attack: 0.05, release: 0.4, min: 0.3, max: 1 },
          spin: { source: 'bar', shape: 'saw', amount: 1, attack: 0, release: 0, min: 0, max: 1 },
          smoothing: { source: 'build', amount: 1, attack: 1, release: 2, min: 0.15, max: 0.6 },
        },
      },
      fx: [{ ref: 'own/bloom', bind: BLOOM }], // the TD/MilkDrop bar's soft glow (S1.4's pair)
      blend: 'normal', opacity: 1, speed: 1, res: 1,
    }],
  },
  {
    v: 1, id: 'builtin:led-grid', name: 'LED grid', star: true,
    layers: [{
      gen: { ref: 'native/tunnel' }, // the moving gen under both pixels
      fx: [
        {
          ref: 'own/mosaic', // square cells: the shards the wall shows
          bind: {
            cell: { source: 'kick', amount: 1, attack: 0, release: 0.2, min: 0.03, max: 0.05 },
            jitter: { source: 'reese', amount: 1, attack: 0.05, release: 0.4, min: 0, max: 0.8 }, // Auto-style's one (wobble under Dubstep)
            outline: { source: 'hats', amount: 1, attack: 0, release: 0.08, min: 0, max: 0.1 },
          },
        },
        {
          ref: 'own/led-grid',
          bind: {
            dot: { source: 'sub', amount: 1, attack: 0.05, release: 0.4, min: 0.5, max: 1 },
            glow: { source: 'kick', amount: 1, attack: 0, release: 0.15, min: 0, max: 1 }, // ⚡
            levels: { source: 'build', amount: 1, attack: 1, release: 2, min: 4, max: 12 },
          },
        },
      ],
      blend: 'normal', opacity: 1, speed: 1, res: 1,
    }],
  },
  {
    v: 1, id: 'builtin:ascii', name: 'ASCII', star: true, // no bass-class binding, so Auto-style changes nothing
    layers: [{
      gen: { ref: 'native/tunnel' }, // its rings give the glyphs something to chase
      fx: [{
        ref: 'isf/ASCII Art',
        bind: {
          size: { source: 'kick', amount: 1, attack: 0, release: 0.2, min: 0.1, max: 0.25 },
          gamma: { source: 'build', amount: 1, attack: 1, release: 2, min: 1, max: 2 },
        },
      }],
      blend: 'normal', opacity: 1, speed: 1, res: 1,
    }],
  },
  // TD wave 2 (plan_td_wave2.md S1.1): the top-10 S-cost trio. The binds repeat each file's VJW_BIND; the bass class
  // rides `reese` (Auto-style: wobble under Dubstep).
  {
    v: 1, id: 'builtin:superformula', name: 'Superformula', star: true, // Auto: reese (n1)
    layers: [{
      gen: {
        ref: 'own/superformula',
        bind: {
          m: { source: 'snare', amount: 1, attack: 0, release: 0.3, min: 10, max: 14 }, // a snare steps the lobe count
          n1: { source: 'reese', amount: 1, attack: 0.05, release: 0.3, min: 1, max: 3 }, // Auto-style's one: the bass rounds the lobes
          scale: { source: 'kick', amount: 1, attack: 0, release: 0.15, min: 0.7, max: 1 }, // the kick pumps the size
          glow: { source: 'sub', amount: 1, attack: 0.02, release: 0.4, min: 0, max: 1 }, // the sub lights the halo
          preset: { source: 'drop', amount: 1, attack: 0, release: 1.5, min: 0, max: 3 }, // the drop sweeps the (n2, n3) presets
        },
      },
      fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1,
    }],
  },
  {
    v: 1, id: 'builtin:tiny-planet', name: 'Tiny planet', star: true, // Auto: reese (twist)
    layers: [{
      gen: { ref: 'native/spectrum' }, // its bars give the wrap something to turn
      fx: [{
        ref: 'own/polar',
        bind: {
          rotation: { source: 'lfo', shape: 'saw', rate: 0.05, amount: 1, attack: 0, release: 0, min: 0, max: 1 }, // one turn per 20 s; the saw's wrap is a full turn, so it never jumps
          offset: { source: 'kick', amount: 1, attack: 0, release: 0.1, min: 0, max: 0.12 }, // the kick pumps the wrap
          twist: { source: 'reese', amount: 1, attack: 0, release: 0.3, min: 0, max: 1.5 }, // Auto-style's one: the bass spirals the rows
        },
      }],
      blend: 'normal', opacity: 1, speed: 1, res: 1,
    }],
  },
  {
    v: 1, id: 'builtin:grad-map', name: 'Grad map', star: true, // no bass-class binding, so Auto-style changes nothing
    layers: [{
      gen: { ref: 'native/spectrum' }, // its luma is the ramp's input
      fx: [{
        ref: 'own/gradient',
        bind: {
          rampShift: { source: 'snare', amount: 1, attack: 0, release: 0.3, min: 0, max: 1 }, // a snare steps the ramp
          bias: { source: 'sub', amount: 1, attack: 0.05, release: 0.3, min: 0, max: 1 }, // the sub lifts the operating point
          dryWet: { source: 'build', amount: 1, attack: 1, release: 2, min: 0, max: 1 }, // a build takes over the colours
        },
      }],
      blend: 'normal', opacity: 1, speed: 1, res: 1,
    }],
  },
  // TD wave 2, S1.2: the plan's two fractal built-ins (julia trap + mandelbrot over the spectrum) were dropped at
  // the gate (billed p95 18.5/6.2 ms at the locked Iter 32/res .25, over the 5 ms budget for starred scenes; lead
  // ruling 2026-11-07) — own/julia stays in the catalog as an L-class effect.
  // TD wave 2, S1.3: the last three CP1 looks. The binds repeat each file's VJW_BIND; the bass class rides `reese`
  // (Auto-style: wobble under Dubstep) where a scene has one.
  {
    v: 1, id: 'builtin:phaser', name: 'Phaser', star: true, // no bass-class binding, so Auto-style changes nothing
    layers: [{
      gen: { ref: 'native/spectrum' }, // the moving gen the wipe reads
      fx: [{
        ref: 'own/phaser',
        values: { treat: 1 }, // the treated copy B: hue +180 (the plan's scene value)
        bind: {
          t: { source: 'build', amount: 1, attack: 1, release: 2, min: 0, max: 1 }, // the wipe sweeps through the build
          map: { source: 'drop', amount: 1, attack: 0, release: 0.1, min: 0, max: 2 }, // the drop flicks snake → grid → diamond
        },
      }],
      blend: 'normal', opacity: 1, speed: 1, res: 1,
    }],
  },
  {
    v: 1, id: 'builtin:diff-feedback', name: 'Diff feedback', star: true, // no bass-class binding, so Auto-style changes nothing
    layers: [{
      gen: { ref: 'native/spectrum' }, // its moving bars are what the ghost keeps up with
      fx: [{
        ref: 'own/diff-feedback',
        bind: {
          k: { source: 'build', amount: 1, attack: 1, release: 2, min: 0.85, max: 0.97 }, // a build holds the ghost longer
          zoom: { source: 'kick', amount: 1, attack: 0, release: 0.1, min: 0.004, max: 0.02 }, // a kick punches the tunnel
          hue: { source: 'snare', amount: 1, attack: 0, release: 0.3, min: 0, max: 0.3 }, // a snare turns the rings
          glow: { source: 'kick', amount: 1, attack: 0, release: 0.2, min: 0, max: 0.5 }, // ⚡ a kick flashes the field, gated ≤ 3/s
        },
      }],
      blend: 'normal', opacity: 1, speed: 1, res: 1,
    }],
  },
  {
    v: 1, id: 'builtin:stars', name: 'Stars', star: true, // Auto: reese (scroll; wobble under Dubstep)
    layers: [{
      gen: {
        ref: 'own/stars',
        bind: {
          prob: { source: 'hats', amount: 1, attack: 0, release: 0.1, min: 0.06, max: 0.35 }, // hats pop the stars
          radius: { source: 'kick', amount: 1, attack: 0, release: 0.1, min: 0.06, max: 0.3 }, // a kick swells the dots
          scroll: { source: 'reese', amount: 1, attack: 0, release: 0.3, min: 0, max: 0.3 }, // the bass scrolls the field (Auto-style's one)
          mode: { source: 'drop', amount: 1, attack: 0, release: 1.5, min: 0, max: 1 }, // the drop re-rolls stars ↔ polka
        },
      },
      fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1,
    }],
  },
  // TD wave 2, S2.1 (CP2): the stereo XY scope — L→x, R→y Lissajous over waveLR (a mono file degenerates to a line,
  // so the figure shots use the stereo build, S0.2). The binds repeat the def (scenes/scope.ts); the bass class rides
  // `reese` (rotSpeed): Auto-style moves it to wobble under Dubstep.
  {
    v: 1, id: 'builtin:xy-scope', name: 'XY scope', star: true, // Auto: reese (rotSpeed; wobble under Dubstep)
    layers: [{
      gen: {
        ref: 'native/scope', // the def's bind (scenes/scope.ts), repeated: built-ins stay JSON literals
        bind: {
          scale: { source: 'sub', amount: 1, attack: 0.02, release: 0.4, min: 0.65, max: 1.35 }, // the sub breathes the figure
          rotSpeed: { source: 'reese', amount: 1, attack: 0, release: 0.3, min: 0, max: 1 }, // Auto-style's one: the bass spins the trail
          hue: { source: 'snare', amount: 1, attack: 0, release: 0.3, min: 0.35, max: 0.65 }, // a snare walks the colour
          trail: { source: 'build', amount: 1, attack: 1, release: 2, min: 0.85, max: 0.97 }, // a build stretches the trail
        },
      },
      fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1,
    }],
  },
  // TD wave 2, S2.3 (CP2): the plexus web — the CPU nodes drift on slow orbits and connect within `dist`, the closer
  // the pair, the brighter the line; the sub widens the web, the lfo breathes the drift (a lead-assumed binding set,
  // confirm at the CP2 demo). The binds repeat the def (scenes/plexus.ts); no bass-class binding, so Auto-style
  // changes nothing.
  {
    v: 1, id: 'builtin:plexus', name: 'Plexus', star: true,
    layers: [{
      gen: {
        ref: 'native/plexus', // the def's bind (scenes/plexus.ts), repeated: built-ins stay JSON literals
        bind: {
          drift: { source: 'lfo', shape: 'sine', rate: 0.05, amount: 1, attack: 0, release: 0, min: 0, max: 1 }, // a 20 s breath of drift
          dist: { source: 'sub', amount: 1, attack: 0.05, release: 0.3, min: 0.18, max: 0.45 }, // the sub widens the web
          size: { source: 'kick', amount: 1, attack: 0, release: 0.1, min: 2, max: 5 }, // a kick swells the nodes
          hue: { source: 'snare', amount: 1, attack: 0, release: 0.3, min: 0.35, max: 0.65 }, // a snare walks the colour
        },
      },
      fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1,
    }],
  },
  // TD wave 2, S3.3 (CP3): quick wins q3 + q2 — the spectrum posterised into 8-colour hard regions (color-threshold),
  // the reds inverting on the snare (rgb-contrast). Two filters at most over the spectrum: a third took a scene from
  // 3.7 to 6.4 ms GPU p95 at 1728×1118 (S4.4). The binds repeat each file's VJW_BIND; no bass-class binding, so
  // Auto-style changes nothing.
  {
    v: 1, id: 'builtin:poster', name: 'Poster', star: true,
    layers: [{
      gen: { ref: 'native/spectrum' },
      fx: [
        { ref: 'own/color-threshold', bind: { tR: { source: 'sub', amount: 1, attack: 0.05, release: 0.3, min: 0.3, max: 0.6 } } }, // the sub opens the reds' threshold
        { ref: 'own/rgb-contrast', bind: { cR: { source: 'snare', amount: 1, attack: 0, release: 0.3, min: 1, max: -5 } } }, // a snare inverts the reds (min > max inverts)
      ],
      blend: 'normal', opacity: 1, speed: 1, res: 1,
    }],
  },
  // TD wave 2, S3.4 (CP3): quick-win group 1 — the spectrum solarized (the S3.1 donor: the build opens the
  // inversion, the drop flips it), then relit as fake relief with an lfo-swept light angle and sub-driven depth
  // (own/emboss — the donor Emboss declares `varying`, design fact 8, so it was never a copy). Two fx over the
  // spectrum (R6); the binds repeat each file's VJW_BIND; no bass-class binding, so Auto-style changes nothing.
  {
    v: 1, id: 'builtin:solar-emboss', name: 'Solar emboss', star: true,
    layers: [{
      gen: { ref: 'native/spectrum' },
      fx: [
        {
          ref: 'isf/Solarize',
          bind: {
            centerBrightness: { source: 'build', amount: 1, attack: 1, release: 2, min: 0.35, max: 0.65 }, // the build opens the inversion (S3.1)
            inverse: { source: 'drop', amount: 1, attack: 0, release: 0, min: 0, max: 1 }, // the drop flips it (S3.1)
          },
        },
        {
          ref: 'own/emboss',
          bind: {
            angle: { source: 'lfo', shape: 'sine', rate: 0.05, amount: 1, attack: 0, release: 0, min: 0, max: 1 }, // the light sweeps, one turn per 20 s
            k: { source: 'sub', amount: 1, attack: 0.05, release: 0.3, min: 0.3, max: 0.05 }, // the sub deepens the relief (reversed: k is the normal's z, min > max)
          },
        },
      ],
      blend: 'normal', opacity: 1, speed: 1, res: 1,
    }],
  },
  // TD wave 2, S3.5 (CP3): quick-win group 3 — the spectrum's red channel bleeds at ¼ res (own/rgba-blur: the
  // coloured halos of the q11 pair), then the red band's hue is swapped to a target that walks on a saw
  // (own/change-color in q6 mode — the S3.1 verification froze it: the donor Color Replacement has no
  // hue-offset input, its band centre and target are unbindable vec4s). Two fx over the spectrum (R6); the
  // binds repeat each file's VJW_BIND; the bass class rides `reese` (Auto-style: wobble under Dubstep).
  {
    v: 1, id: 'builtin:halo', name: 'Halo', star: true, // Auto: reese (size; wobble under Dubstep)
    layers: [{
      gen: { ref: 'native/spectrum' },
      fx: [
        { ref: 'own/rgba-blur', bind: { size: { source: 'reese', amount: 1, attack: 0.05, release: 0.4, min: 0.9, max: 2.0 } } }, // the red halo blooms on bass
        { ref: 'own/change-color', values: { mode: 1, hue: 0 }, bind: { target: { source: 'lfo', shape: 'saw', rate: 0.05, amount: 1, attack: 0, release: 0, min: 0, max: 1 } } }, // q6: the red band retints as the saw walks
      ],
      blend: 'normal', opacity: 1, speed: 1, res: 1,
    }],
  },
  // Scene wave 3, S0.2 (CP0) + S1.0 (CP1, user: «ахуенно сделан, но для DnB нет динамики»): Spirit — DnB. 65k
  // glowing points hold a wolf in its 3D relief (depth .35 static); the picture orbits and drifts left–right on its
  // own lfo sines (yaw / pan), a build loosens it into a drifting cloud from the .15 floor, the drop slams the cloud
  // into an eagle (and the next drop back), a kick sends a tighter ring through the shape (release .12), a snare
  // turns its colour, hats only twinkle. The binds repeat the def (scenes/creatures.ts; plan § Scenes row 1, ⚠️
  // assumptions until the CP1 demo); the bass class rides `reese` (swirl): Auto-style moves it to wobble under
  // Dubstep. trail is the row's static; hold is 32 bars (the S0.2 ruling: the row's shorter hold morphed the wolf
  // away at the canonical 16-bar intro's end, just before the build).
  {
    v: 1, id: 'builtin:spirit', name: 'Spirit', star: true, // Auto: reese (swirl; wobble under Dubstep)
    layers: [{
      gen: {
        ref: 'native/creatures', values: { set: 0, trail: 0.5, hold: 32, depth: 0.35 }, // wolf ↔ eagle; S1.0: the 3D relief on by default; 32 bars (the S0.2 ruling)
        bind: {
          scatter: { source: 'build', amount: 1, attack: 1, release: 0.15, min: 0.15, max: 0.9 }, // S1.0: the floor .15 — the points always breathe; a build loosens the animal into a cloud
          next: { source: 'drop', amount: 1, attack: 0, release: 0.1, min: 0, max: 1 }, // the drop slams the cloud into the next animal
          pulse: { source: 'kick', amount: 1, attack: 0, release: 0.12, min: 0, max: 1 }, // S1.0: release .12 — the harder, tighter kick punch; a ring through the shape
          hue: { source: 'snare', amount: 1, attack: 0, release: 0.3, min: 0.52, max: 0.72 }, // a snare turns the colour
          swirl: { source: 'reese', amount: 1, attack: 0.05, release: 0.4, min: 0.05, max: 0.4 }, // Auto-style's one: S1.0: .05→.4 — the bass stirs the shape
          size: { source: 'sub', amount: 1, attack: 0.05, release: 0.3, min: 2.5, max: 4.5 }, // the sub swells the points
          sparkle: { source: 'hats', amount: 1, attack: 0, release: 0.08, min: 0, max: 0.5 }, // hats twinkle them
          yaw: { source: 'lfo', shape: 'sine', rate: 0.06, amount: 1, attack: 0, release: 0, min: -0.09, max: 0.09 }, // S1.0: the autonomous slow orbit, a 16.7 s breath, never edge-on
          pan: { source: 'lfo', shape: 'sine', rate: 0.04, amount: 1, attack: 0, release: 0, min: -0.35, max: 0.35 }, // S1.0: the autonomous left–right drift, a 25 s breath, no stage clip at the extremes
        },
      },
      fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1,
    }],
  },
  // Scene wave 3, S1.1 (CP1): Chase — rave. The streak regime over row 1 (plan § Scenes): trail .95 keeps the motion
  // history and the swirl floor of .06 makes the points always run along the noise field — short streaks at rest,
  // long ones on the reese. 65k points hold a prowling panther; the build scatters them, the drop slams them into a
  // stag. The binds repeat the def plus the row's yaw (⚠️ assumptions until the CP1 demo); the bass class rides
  // `reese` (swirl): Auto-style moves it to wobble under Dubstep.
  {
    v: 1, id: 'builtin:chase', name: 'Chase', star: true, // rave · Auto: reese (swirl; wobble under Dubstep)
    layers: [{
      gen: {
        ref: 'native/creatures', values: { set: 1, trail: 0.95, depth: 0.35, hold: 8 }, // panther ↔ stag; the streak trail, the 3D relief, 8 bars
        bind: {
          scatter: { source: 'build', amount: 1, attack: 1, release: 0.15, min: 0, max: 1.2 }, // the build tears the panther into a running cloud
          next: { source: 'drop', amount: 1, attack: 0, release: 0.1, min: 0, max: 1 }, // the drop slams the cloud into the stag
          pulse: { source: 'kick', amount: 1, attack: 0, release: 0.2, min: 0, max: 1 }, // a kick sends a ring through it
          hue: { source: 'snare', amount: 1, attack: 0, release: 0.3, min: 0.08, max: 0.2 }, // a snare turns the colour
          swirl: { source: 'reese', amount: 1, attack: 0.05, release: 0.4, min: 0.06, max: 0.45 }, // Auto-style's one: the floor keeps the streaks running
          size: { source: 'sub', amount: 1, attack: 0.05, release: 0.3, min: 1.2, max: 2.2 }, // the sub swells the points
          sparkle: { source: 'hats', amount: 1, attack: 0, release: 0.08, min: 0, max: 0.5 }, // hats twinkle them
          yaw: { source: 'lfo', shape: 'sine', rate: 0.06, amount: 1, attack: 0, release: 0, min: -0.09, max: 0.09 }, // a slow autonomous orbit
          pan: { source: 'lfo', shape: 'sine', rate: 0.04, amount: 1, attack: 0, release: 0, min: -0.35, max: 0.35 }, // S1.1 follow: the autonomous left–right drift (S1.0's pan input), a 25 s breath, no stage clip at the extremes
        },
      },
      fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1,
    }],
  },
  // Scene wave 3, S1.2 (CP1): Abyss — DnB. The 3D regime over row 1 (plan § Scenes row 3): static depth .35 (the
  // 3D volume on by default) and trail .7 (a little motion history in the depth); the camera sways on its own lfo
  // sine — a flat silhouette must never turn edge-on. 65k points hold a shark; the build scatters them, the drop
  // slams them into a jellyfish. The binds repeat row 1 with the row's hue / swirl / size / yaw (⚠️ assumptions
  // until the CP1 demo); the bass class rides `reese` (swirl): Auto-style moves it to wobble under Dubstep.
  {
    v: 1, id: 'builtin:abyss', name: 'Abyss', star: true, // DnB · Auto: reese (swirl; wobble under Dubstep)
    layers: [{
      gen: {
        ref: 'native/creatures', values: { set: 2, trail: 0.7, depth: 0.35, hold: 32 }, // shark ↔ jellyfish; the 3D volume, the camera sway, 32 bars (the S0.2 ruling)
        bind: {
          scatter: { source: 'build', amount: 1, attack: 1, release: 0.15, min: 0.15, max: 0.9 }, // the floor .15 — the points always breathe; a build loosens the shark into a cloud
          next: { source: 'drop', amount: 1, attack: 0, release: 0.1, min: 0, max: 1 }, // the drop slams the cloud into the jellyfish
          pulse: { source: 'kick', amount: 1, attack: 0, release: 0.12, min: 0, max: 1 }, // a kick sends a tighter ring through it
          hue: { source: 'snare', amount: 1, attack: 0, release: 0.3, min: 0.55, max: 0.62 }, // a snare turns the colour (deep blue)
          swirl: { source: 'reese', amount: 1, attack: 0.05, release: 0.4, min: 0.02, max: 0.2 }, // Auto-style's one: the bass stirs the volume gently
          size: { source: 'sub', amount: 1, attack: 0.05, release: 0.3, min: 2, max: 4 }, // the sub swells the points
          sparkle: { source: 'hats', amount: 1, attack: 0, release: 0.08, min: 0, max: 0.5 }, // hats twinkle them
          yaw: { source: 'lfo', shape: 'sine', rate: 0.07, amount: 1, attack: 0, release: 0, min: -0.09, max: 0.09 }, // the camera sway, a 14.3 s breath, never edge-on
          pan: { source: 'lfo', shape: 'sine', rate: 0.04, amount: 1, attack: 0, release: 0, min: -0.35, max: 0.35 }, // the autonomous left–right drift
        },
      },
      fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1,
    }],
  },
  // Scene wave 3, S1.3 (CP1): Dust — techno. The ink/dust regime over row 1 (plan § Scenes row 4): 1 px points at
  // sat .15 — grain, not glow — and `wisp` sheds a few % of the points far along the swirl field with the sub, so
  // the strays stream off the body. 65k points hold an owl; the build scatters them (the row's 0→.7, no floor),
  // the drop slams them into a butterfly. The binds repeat row 1 with the row's hue / swirl / pulse / scatter and
  // its wisp (⚠️ assumptions until the CP1 demo); no size bind (the grain stays 1 px); the bass class rides `reese`
  // (swirl): Auto-style moves it to wobble under Dubstep.
  {
    v: 1, id: 'builtin:dust', name: 'Dust', star: true, // techno · Auto: reese (swirl; wobble under Dubstep)
    layers: [{
      gen: {
        ref: 'native/creatures', values: { set: 3, size: 1, sat: 0.15, trail: 0.6, depth: 0.35, hold: 32 }, // owl ↔ butterfly; the 1 px ink grain, the relief, 32 bars (the S0.2 ruling: the row's 16 was a planner slip)
        bind: {
          scatter: { source: 'build', amount: 1, attack: 1, release: 0.15, min: 0, max: 0.7 }, // the row's 0→.7 — a build loosens the owl into a grain cloud
          next: { source: 'drop', amount: 1, attack: 0, release: 0.1, min: 0, max: 1 }, // the drop slams the cloud into the butterfly
          pulse: { source: 'kick', amount: 1, attack: 0, release: 0.12, min: 0, max: 0.6 }, // the row's 0→.6 — a kick sends a ring through the grain
          hue: { source: 'snare', amount: 1, attack: 0, release: 0.3, min: 0.09, max: 0.12 }, // the row's .09→.12 — a snare turns the ink
          swirl: { source: 'reese', amount: 1, attack: 0.05, release: 0.4, min: 0.03, max: 0.3 }, // Auto-style's one: the row's .03→.3 — the bass stirs the grain
          wisp: { source: 'sub', amount: 1, attack: 0.05, release: 0.4, min: 0.2, max: 0.8 }, // the sub sheds the strays off the body
          sparkle: { source: 'hats', amount: 1, attack: 0, release: 0.08, min: 0, max: 0.5 }, // hats twinkle the grain
          yaw: { source: 'lfo', shape: 'sine', rate: 0.06, amount: 1, attack: 0, release: 0, min: -0.09, max: 0.09 }, // row 1's orbit (the row does not override the rate)
          pan: { source: 'lfo', shape: 'sine', rate: 0.04, amount: 1, attack: 0, release: 0, min: -0.35, max: 0.35 }, // the autonomous left–right drift
        },
      },
      // The row's "low bloom" is the native's own internal bloom (GLOW 3): own/bloom as an fx pass read +≈3.3 ms at
      // layer res 1 in the same session (billed 7.35 vs 4.07 for the fx-free abyss), over the 5 ms gate — skipped.
      fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1,
    }],
  },
  // Scene wave 3, S1.4 (CP1): Zodiac — techno. The line regime on native/plexus (plan § Scenes row 5): the nodes'
  // homes are the dragon / snake stroke samples (shape 5 = SETS[4]); the build lets the nodes wander off the
  // strokes (wander .15→1), the sub widens the web, the drop slams the constellation into the snake. The binds are
  // row 5's (⚠️ assumptions until the CP1 demo); hold 32 (the S0.2 ruling: the row's 16 was a planner slip). The
  // def's bind (scenes/plexus.ts) stays the classic four — builtin:plexus at shape 0 is the frozen pair.
  {
    v: 1, id: 'builtin:zodiac', name: 'Zodiac', star: true, // techno · Auto: reese (drift; wobble under Dubstep)
    layers: [{
      gen: {
        ref: 'native/plexus', values: { shape: 5, hold: 32 }, // dragon ↔ snake; 32 bars (the S0.2 ruling)
        bind: {
          drift: { source: 'reese', amount: 1, attack: 0.05, release: 0.4, min: 0.2, max: 1 }, // Auto-style's one: the row's .2→1 — the bass speeds the orbits
          dist: { source: 'sub', amount: 1, attack: 0.05, release: 0.3, min: 0.06, max: 0.15 }, // row 5's .08→.2 narrowed (the S1.4 pair-count lever): the clustered stroke nodes hold 6–12 neighbours at rest (measured ≈ 10.3 dragon / 10.5 snake at .06), the sub still visibly widens the web
          size: { source: 'kick', amount: 1, attack: 0, release: 0.1, min: 2, max: 5 }, // a kick swells the nodes
          pulse: { source: 'kick', amount: 1, attack: 0, release: 0.2, min: 0, max: 0.06 }, // a kick punches the web out
          hue: { source: 'snare', amount: 1, attack: 0, release: 0.3, min: 0.1, max: 0.16 }, // a snare turns the ink
          wander: { source: 'build', amount: 1, attack: 1, release: 0.15, min: 0.15, max: 1 }, // the row's .15→1 — a build lets the nodes drift off the strokes
          next: { source: 'drop', amount: 1, attack: 0, release: 0.1, min: 0, max: 1 }, // the drop slams the lines into the snake
        },
      },
      fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1,
    }],
  },
  // Scene wave 3, S3.1 (CP3): Wireform — techno. TD's parametric meshes as a glowing wire surface that orbits
  // (plan § Scenes row 8): kicks run a wave over the grid, the reese corkscrews it, through the build the quads
  // drift apart along their normals, and at the drop they fly back together as the next surface (hold 8 bars —
  // row 8's choreography, the S1.0 creatures-only hold ruling does not apply). The binds repeat the def
  // (scenes/wireform.ts; ⚠️ assumptions until the CP3 demo); the bass class rides `reese` (twist): Auto-style
  // moves it to wobble under Dubstep.
  {
    v: 1, id: 'builtin:wireform', name: 'Wireform', star: true, // techno · Auto: reese (twist; wobble under Dubstep)
    layers: [{
      gen: {
        ref: 'native/wireform', values: { pitch: 0.06, hold: 8 }, // static pitch (row 8), the 8-bar hold (row 8)
        bind: {
          explode: { source: 'build', amount: 1, attack: 1, release: 0.15, min: 0, max: 0.8 }, // the build lets the quads drift apart
          next: { source: 'drop', amount: 1, attack: 0, release: 0.1, min: 0, max: 1 }, // the drop flies them back together as the next surface
          pulse: { source: 'kick', amount: 1, attack: 0, release: 0.2, min: 0, max: 0.25 }, // a kick runs a wave over the grid
          twist: { source: 'reese', amount: 1, attack: 0.05, release: 0.4, min: 0, max: 1.2 }, // Auto-style's one: the reese corkscrews it
          scale: { source: 'sub', amount: 1, attack: 0.05, release: 0.3, min: 0.85, max: 1.1 }, // the sub breathes the surface
          hue: { source: 'snare', amount: 1, attack: 0, release: 0.3, min: 0.5, max: 0.85 }, // a snare walks the colour
          sparkle: { source: 'hats', amount: 1, attack: 0, release: 0.08, min: 0, max: 0.5 }, // hats twinkle the grid
          yaw: { source: 'lfo', shape: 'saw', rate: 0.04, amount: 1, attack: 0, release: 0, min: 0, max: 1 }, // one full turn per 25 s (the saw wraps: the orbit stays continuous)
        },
      },
      fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1,
    }],
  },
  // Scene wave 3, S3.2 (CP3): Vortex — rave. TD's force look: a tilted spiral disc of 65k trailing points.
  // The velocity relaxes toward a force field (a tangential spin, the 1/√r falloff, an inward pull, a curl
  // noise); the reese spins it up, the sub breathes the pull, kicks punch it outward, and the drop runs the
  // nova's envelope — the disc blasts out and re-forms (plan § Scenes row 9). The binds repeat the def
  // (scenes/vortex.ts; ⚠️ assumptions until the CP3 demo); the bass class rides `reese` (spin): Auto-style
  // moves it to wobble under Dubstep.
  {
    v: 1, id: 'builtin:vortex', name: 'Vortex', star: true, // rave · Auto: reese (spin; wobble under Dubstep)
    layers: [{
      gen: {
        ref: 'native/vortex', values: { pitch: 0.17 }, // static pitch (row 9)
        bind: {
          spin: { source: 'reese', amount: 1, attack: 0.05, release: 0.4, min: 0.4, max: 2.5 }, // Auto-style's one: the reese spins the disc up
          pull: { source: 'sub', amount: 1, attack: 0.05, release: 0.3, min: 0.6, max: 0.25 }, // the sub breathes it (the pull eases on a swell)
          burst: { source: 'kick', amount: 1, attack: 0, release: 0.15, min: 0, max: 1.5 }, // a kick punches the disc outward
          hue: { source: 'snare', amount: 1, attack: 0, release: 0.3, min: 0, max: 0.25 }, // a snare walks the colour
          sparkle: { source: 'hats', amount: 1, attack: 0, release: 0.08, min: 0, max: 0.5 }, // hats twinkle the points
          trail: { source: 'build', amount: 1, attack: 1, release: 2, min: 0.88, max: 0.97 }, // a build lengthens the trails
          nova: { source: 'drop', amount: 1, attack: 0, release: 0.1, min: 0, max: 1 }, // the drop: the blast out and the re-form
          yaw: { source: 'lfo', shape: 'saw', rate: 0.03, amount: 1, attack: 0, release: 0, min: 0, max: 1 }, // one orbit per 33 s (the saw wraps: the orbit stays continuous)
        },
      },
      fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1,
    }],
  },
  // Scene wave 3, S3.3 (CP3): Orb — DnB. TD's displaced point sphere: 60k static unit vectors, no TF state.
  // The sub swells and roughens the surface (amp, freq), each kick runs a shock shell across it (spike), the
  // reese corkscrews it (twist), and the drop shatters the radius and it falls back (shatter, plan § Scenes
  // row 10). The binds repeat the def (scenes/orb.ts; ⚠️ assumptions until the CP3 demo); the bass class
  // rides `reese` (twist): Auto-style moves it to wobble under Dubstep.
  {
    v: 1, id: 'builtin:orb', name: 'Orb', star: true, // DnB · Auto: reese (twist; wobble under Dubstep)
    layers: [{
      gen: {
        ref: 'native/orb',
        bind: {
          amp: { source: 'sub', amount: 1, attack: 0.05, release: 0.3, min: 0.08, max: 0.35 }, // the sub swells and roughens the sphere
          spike: { source: 'kick', amount: 1, attack: 0, release: 0.2, min: 0, max: 0.5 }, // each kick runs a shock shell across it
          twist: { source: 'reese', amount: 1, attack: 0.05, release: 0.4, min: 0, max: 1 }, // Auto-style's one: the reese corkscrews it
          freq: { source: 'build', amount: 1, attack: 1, release: 0.3, min: 1.5, max: 5 }, // the build roughens the swell
          hue: { source: 'snare', amount: 1, attack: 0, release: 0.3, min: 0.58, max: 0.8 }, // a snare walks the colour
          sparkle: { source: 'hats', amount: 1, attack: 0, release: 0.08, min: 0, max: 0.5 }, // hats twinkle the points
          shatter: { source: 'drop', amount: 1, attack: 0, release: 0.1, min: 0, max: 1 }, // the drop shatters and rebuilds it
          yaw: { source: 'lfo', shape: 'saw', rate: 0.05, amount: 1, attack: 0, release: 0, min: 0, max: 1 }, // one orbit per 20 s (the saw wraps: continuous)
        },
      },
      fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1,
    }],
  },
  // Scene wave 3, S2.1 rework (CP2, design_laser_rework.md Variant A; the old analytic ISF fan was rejected by
  // the user 2026-11-14 — own/laser-grid.fs keeps its header note). Isobars (user 2026-11-15: the trace look stays
  // as its own scene, not a laser; `builtin:laser-grid` is free for the pending laser scene): traced beams — a per-frame
  // 96² mirror-symmetric emitter-lattice field, the step-lookup into K bands, the marching-squares trace, and
  // real-width additive ribbons (bright thin core, wide faint skirt) + the ⅛-res tent haze. The poses tick on
  // the bar saw (4/bar); the level chase is light-neutral (P7: the same count of levels lit on every step, the
  // light distributed ∝ q·ρ·w·L per frame), so the picture re-poses and chases while the frame never blinks as
  // a whole. Brightness on a hit only through the ⚡ trio (gated ≤ 3/s). The binds repeat the def
  // (scenes/isobars.ts; ⚠️ row-6 assumptions, confirm at the CP2 demo); the bass class rides `reese` (scan).
  {
    v: 1, id: 'builtin:isobars', name: 'Isobars', star: true, // techno · Auto: reese (scan; wobble under Dubstep)
    layers: [{
      gen: {
        ref: 'native/isobars',
        values: { mode: 0, steps: 4, K: 5, haze: 0.5 }, // the grid regime; a pose per beat; 5 bands (the build ramps 3 → 6)
        bind: {
          phase: { source: 'bar', shape: 'saw', amount: 1, attack: 0, release: 0, min: 0, max: 1 }, // the bar runs the poses: a tick per beat
          K: { source: 'build', amount: 1, attack: 1, release: 0.3, min: 3, max: 6 }, // the build densifies the contours into the drop
          amp: { source: 'sub', amount: 1, attack: 0.05, release: 0.3, min: 0, max: 1 }, // the sub reaches the blobs
          scan: { source: 'reese', amount: 1, attack: 0.05, release: 0.4, min: 0, max: 1 }, // Auto-style's one: the moiré drift = the wall scan
          dash: { source: 'hats', amount: 1, attack: 0, release: 0.06, min: 0, max: 1 }, // the hats run the light-neutral level chase
          hue: { source: 'snare', amount: 1, attack: 0, release: 0.25, min: 0, max: 0.25 }, // a snare walks green → white
          width: { source: 'kick', amount: 1, attack: 0, release: 0.12, min: 0, max: 0.6 }, // ⚡ a kick pops the beams
          hit: { source: 'kick', amount: 1, attack: 0, release: 0.12, min: 0, max: 0.5 }, // ⚡ a kick lifts the light
          burst: { source: 'drop', amount: 1, attack: 0, release: 0.4, min: 0, max: 1 }, // ⚡ the drop full-opens: all K levels, the widest pose, the chase stopped
        },
      },
      fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1,
    }],
  },
  // Rave Lasers (RL S3 spike, design_rave_lasers.md Variant A + rev 2; creative_rave_lasers.md): a DnB festival laser
  // rig in haze. 23 fixed emitters (truss row, side towers, floor row, booth pair), hair-thin beams; the figures cut on
  // the bar (Fan / Grid loud, Sheet + Lone beams quiet), the build closes them into a square cage, the drop shoots every
  // emitter at the viewer. The binds repeat the def (scenes/lasers.ts), `burst` before `hit` (SR-5: the gate's tie).
  {
    v: 1, id: 'builtin:rave-lasers', name: 'Rave Lasers', star: true, // dnb · Auto: reese (scissor; wobble under Dubstep)
    layers: [{
      gen: {
        ref: 'native/lasers',
        values: { layout: 0, green: 0.7, white: 0.3, red: 0, haze: 0.5 },
        bind: {
          open: { source: 'sub', amount: 1, attack: 0.04, release: 0.3, min: 0, max: 1 }, // the sub opens the fans
          scissor: { source: 'reese', amount: 1, attack: 0.03, release: 0.15, min: 0, max: 1 }, // Auto-style's one: neighbour fans scissor
          converge: { source: 'build', amount: 1, attack: 0.15, release: 0.8, min: 0, max: 1 }, // the build ramp into the cage
          flick: { source: 'hats', amount: 1, attack: 0, release: 0.18, min: 0, max: 1 }, // the hats: the chase's dark share
          pop: { source: 'kick', amount: 1, attack: 0, release: 0.14, min: 0, max: 1 }, // a kick snaps the spread, jumps the chase
          snap: { source: 'snare', amount: 1, attack: 0, release: 0.11, min: 0, max: 1 }, // a snare: the Grating burst, the chase reverses
          climax: { source: 'drop', amount: 1, attack: 0, release: 0.4, min: 0, max: 1 }, // the drop latch (geometry, ungated)
          burst: { source: 'drop', amount: 1, attack: 0, release: 0.4, min: 0, max: 1 }, // ⚡ white cores (listed before hit: the tie)
          hit: { source: 'kick', amount: 1, attack: 0, release: 0.14, min: 0, max: 1 }, // ⚡ core light +40 %
        },
      },
      fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1,
    }],
  },
]

// Design Q4: Tunnel stays first (library.test.ts), both orders kept.
export const BUILTIN: readonly SceneDoc[] = spread(OWN, MILK_SCENES)
