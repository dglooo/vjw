import type { Binding } from '../bind'
import type { LayerDoc, SceneDoc } from '../doc'
import { SYN_BIND } from '../fx/syn'
import { MILK_SCENES, spread } from '../milkdrop/presets'

// own/bloom's VJW_BIND (plan_td_look.md S1.4), for the two scenes that end on it; ⚡ = VJW_FLASH, ≤3 onsets/s
const BLOOM: Record<string, Binding> = {
  threshold: { source: 'build', amount: 1, attack: 1, release: 1, min: 0.35, max: 0.15 }, // a build lowers it (min > max inverts)
  glow: { source: 'kick', amount: 1, attack: 0, release: 0.2, min: 0, max: 1 }, // ⚡ a kick pulses the glow
  level: { source: 'drop', amount: 1, attack: 0, release: 1.5, min: 0, max: 1 }, // ⚡ the drop floods it
  rampShift: { source: 'bar', shape: 'saw', amount: 1, attack: 0, release: 0, min: 0, max: 1 }, // the tint turns once a bar
}

// native/particles in its scenes (S4.1): its onsets and bass live in its code (motion only); these add the bass class, a
// build and the kick's heat (⚡ = its flash input, ≤3 onsets/s: the only light a hit adds, I-FL1).
const PARTICLES: Record<string, Binding> = {
  swirl: { source: 'reese', amount: 1, attack: 0.05, release: 0.4, min: 1.5, max: 3.5 }, // the bass spins the disc
  glow: { source: 'build', amount: 1, attack: 1, release: 2, min: 2, max: 4 }, // a build heats the bloom
  hit: { source: 'kick', amount: 1, attack: 0, release: 0.2, min: 0, max: 1 }, // ⚡ a kick heats the points
}

// native/tunnel, native/spectrum and native/glitch in every scene (I-FL1): ⚡ hit = their flash input (≤3 onsets/s), the
// only light a hit adds (their onsets and the beat pulse lit them before).
const KICK_HIT: Record<string, Binding> = { hit: { source: 'kick', amount: 1, attack: 0, release: 0.2, min: 0, max: 1 } }

/** A synScene's bindings: SYN_BIND's, by name; a name SYN feeds otherwise (a raw: the beat toggles, Intensity) is left out. */
const syn = (...names: string[]): Record<string, Binding> => Object.fromEntries(names.filter((n) => SYN_BIND[n]).map((n) => [n, SYN_BIND[n]]))
// A ⚡ hit that lights a whole synScene frame: its rise over 40 ms (post.ts HOT_RISE's reason: a frame takes 34 % of the
// step). I-FL1 on dnb174-arr, 30 s, luma steps > .10 at attack 0 → 40 ms: Alien Cavern 11 → 1, Dispersion 27 → 1.
// × 6: the slowed rise still reaches 1 (≥ .996 at any hit phase; × 1 it peaked at .55, so a donor step(0.99, hit) never
// fired): the envelope holds the target at 1 for τ·ln 6 = 215 ms, then the release.
const SOFT_SNARE: Binding = { ...SYN_BIND.syn_Hits, attack: 0.04, amount: 6 }
const SOFT_KICK: Binding = { ...SYN_BIND.syn_BassHits, attack: 0.04, amount: 6 }

// Built-in scenes (design E4): JSON-compatible literals, so tsc checks them and doc.test.ts round-trips them. Immutable:
// edits go to a copy. The order is the autopilot's: the natives, then the combinations, with the MilkDrop scenes
// spread evenly among them (BUILTIN, at the end).
// Bindings (design_td_look.md policy, rebind S4.1): drums, sub and build/drop bound directly; the bass class on `reese`,
// which Auto-style moves per genre; no `onset`/`treb`. A file's VJW_BIND stays its suggestion for a new node.
const OWN: readonly SceneDoc[] = [
  {
    v: 1, id: 'builtin:tunnel', name: 'Tunnel', star: true,
    layers: [{ gen: { ref: 'native/tunnel', bind: KICK_HIT }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 }],
  },
  {
    v: 1, id: 'builtin:spectrum', name: 'Spectrum', star: true,
    layers: [{ gen: { ref: 'native/spectrum', bind: KICK_HIT }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 }],
  },
  {
    v: 1, id: 'builtin:particles', name: 'Particles', star: true,
    // res 0.5: GPU p95 with kicks 6.4 → 3.2 ms at 1728×1118 (S4.2b); the points scale with the layer height
    layers: [{ gen: { ref: 'native/particles', bind: PARTICLES }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.5 }],
  },
  {
    v: 1, id: 'builtin:glitch', name: 'Glitch', star: true,
    layers: [{ gen: { ref: 'native/glitch', bind: KICK_HIT }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 }],
  },
  {
    v: 1, id: 'builtin:kaleido-tunnel', name: 'Kaleido tunnel', star: true,
    layers: [{
      gen: { ref: 'native/tunnel', bind: KICK_HIT },
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
      gen: { ref: 'native/tunnel', bind: KICK_HIT },
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
      gen: { ref: 'native/spectrum', bind: KICK_HIT },
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
      gen: { ref: 'native/tunnel', bind: KICK_HIT },
      fx: [
        { ref: 'isf/Pixellate', bind: { cell_size: { source: 'kick', amount: 1, attack: 0, release: 0.2, min: 0.008, max: 0.025 } } }, // bigger pixels on a kick
        { ref: 'isf/Posterize', values: { numColors: 5 } },
        // On for the first ~6 % of every bar (≈ 80 ms at 174 BPM): the saw falls 1 → 0 over the bar, a bool is on at ≥ 0.5.
        // Once a bar, not a beat (I-FL1 fa2-): one step per strobe even with its slewed fall, so 3 a second plus the
        // drop's own flash made 7 luma steps > .10 in its second.
        { ref: 'own/strobe', bind: { strobe: { source: 'bar', shape: 'saw', amount: 1, attack: 0, release: 0, min: 0, max: 0.53 } } },
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
      { gen: { ref: 'native/tunnel', bind: KICK_HIT }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 },
      { gen: { ref: 'native/particles', bind: PARTICLES }, fx: [], blend: 'add', opacity: 0.9, speed: 1, res: 0.5 },
    ],
  },
  {
    v: 1, id: 'builtin:trails-spectrum', name: 'Trails spectrum', star: true,
    layers: [{
      gen: { ref: 'native/spectrum', bind: KICK_HIT },
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
    // up to Nyquist, so x = 0.004 reads bins 1–2 (≈ 45–95 Hz): the kick swells the rings. No light from that raw bin
    // (a toy has no ⚡ input): col × (.5 + .7 bass) stepped the frame-mean luma > .10 up to 20 per 1 s (I-FL1).
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
    fragColor = vec4(col, 1.0);
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
      gen: { ref: 'native/tunnel', bind: KICK_HIT },
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
      gen: { ref: 'native/spectrum', bind: KICK_HIT },
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
      gen: { ref: 'native/spectrum', bind: KICK_HIT },
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
      gen: { ref: 'native/spectrum', bind: KICK_HIT },
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
      gen: { ref: 'native/tunnel', bind: KICK_HIT },
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
    layers: [{ gen: { ref: 'native/glitch', bind: KICK_HIT }, fx: [{ ref: 'own/bloom', bind: BLOOM }], blend: 'normal', opacity: 1, speed: 1, res: 1 }],
  },
  {
    v: 1, id: 'builtin:light-tunnel', name: 'Light tunnel', star: true,
    layers: [{
      gen: { ref: 'native/tunnel', bind: KICK_HIT }, // its rings keep the mouth round (the spectrum's bars square it off: S1.6)
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
      gen: { ref: 'native/spectrum', bind: KICK_HIT }, // its bars move on their own (the tunnel moves everywhere, so it all trailed: S1.7)
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
      gen: { ref: 'native/spectrum', bind: KICK_HIT }, // its bars seed the coral
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
      gen: { ref: 'native/tunnel', bind: KICK_HIT }, // its rings move everywhere, so every edge fringes
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
      gen: { ref: 'native/spectrum', bind: KICK_HIT }, // every row up the stage is an older frame: the bars smear upward through time
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
      gen: { ref: 'native/tunnel', bind: KICK_HIT }, // its rings and colours give every square something to carry
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
      gen: { ref: 'native/spectrum', bind: KICK_HIT }, // its bars give the dots their colours
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
      gen: { ref: 'native/tunnel', bind: KICK_HIT }, // the moving gen under both pixels
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
      gen: { ref: 'native/tunnel', bind: KICK_HIT }, // its rings give the glyphs something to chase
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
      gen: { ref: 'native/spectrum', bind: KICK_HIT }, // its bars give the wrap something to turn
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
      gen: { ref: 'native/spectrum', bind: KICK_HIT }, // its luma is the ramp's input
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
      gen: { ref: 'native/spectrum', bind: KICK_HIT }, // the moving gen the wipe reads
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
      gen: { ref: 'native/spectrum', bind: KICK_HIT }, // its moving bars are what the ghost keeps up with
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
      gen: { ref: 'native/spectrum', bind: KICK_HIT },
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
      gen: { ref: 'native/spectrum', bind: KICK_HIT },
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
      gen: { ref: 'native/spectrum', bind: KICK_HIT },
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
  // Neuro Serpent (W4 S3 spike, design_neuro_serpent.md Variant A + the L223 fallback; creative_neuro_serpent.md): one
  // open chrome band-tube coiling in lit fog; the build winds it, the drop whips it. The binds repeat the def
  // (scenes/serpent.ts); `presence` stays bound to reeseLevel for the absence wind (flag OFF).
  {
    v: 1, id: 'builtin:neuro-serpent', name: 'Neuro Serpent', star: true, // dnb
    layers: [{
      gen: {
        ref: 'native/serpent',
        values: { orbit: 1, yaw: 30, pitch: 12, zoom: 1 },
        bind: {
          bass: { source: 'band8', amount: 1, attack: 0.06, release: 0.3, min: 0, max: 1 }, // B: twist, ripple, flex, scale
          presence: { source: 'reeseLevel', amount: 1, attack: 0, release: 0, min: 0, max: 1 }, // the absence wind (OFF)
          reese: { source: 'reese', amount: 1, attack: 0.03, release: 0.2, min: 0, max: 1 }, // the burst (the larger)
          wobble: { source: 'wobble', amount: 1, attack: 0.03, release: 0.2, min: 0, max: 1 },
          sub: { source: 'sub', amount: 1, attack: 0.04, release: 0.4, min: 0, max: 1 }, // the thickness
          kick: { source: 'kick', amount: 1, attack: 0, release: 0, min: 0, max: 1 }, // a ring pair per rise
          snare: { source: 'snare', amount: 1, attack: 0, release: 0, min: 0, max: 1 }, // a snap per rise
          hats: { source: 'hats', amount: 1, attack: 0, release: 0, min: 0, max: 1 }, // glints + the shiver
          build: { source: 'build', amount: 1, attack: 0, release: 0, min: 0, max: 1 }, // the floor of W
          drop: { source: 'drop', amount: 1, attack: 0, release: 0.4, min: 0, max: 1 }, // the whip (ungated)
          flare: { source: 'drop', amount: 1, attack: 0, release: 0.4, min: 0, max: 1 }, // ⚡ the after-flare
        },
      },
      fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1,
    }],
  },
  // Amen Shatter (W4 S3 spike, design_amen_shatter.md Variant A + rev 2; creative_amen_shatter.md): jungle. A glowing
  // ring plate cut on a 16 × 10 lattice: the kick shoves bands, the snare cracks strips, the hats tick cells, the bar's
  // last snare slams it whole; the build rolls frozen strips across, the drop holds clean, then shatters wide. One
  // layer, the native only. The binds repeat the def (scenes/shatter.ts), `burst` first (the gate's tie).
  {
    v: 1, id: 'builtin:amen-shatter', name: 'Amen Shatter', star: true, // dnb (jungle)
    layers: [{
      gen: {
        ref: 'native/amen-shatter',
        values: { seams: 1, seed: 3 },
        bind: {
          kick: { source: 'kick', amount: 1, attack: 0, release: 0, min: 0, max: 1 }, // raw: the core finds the rises
          snare: { source: 'snare', amount: 1, attack: 0, release: 0, min: 0, max: 1 },
          hats: { source: 'hats', amount: 1, attack: 0, release: 0, min: 0, max: 1 },
          build: { source: 'build', amount: 1, attack: 0.2, release: 0.5, min: 0, max: 1 }, // the roll
          drop: { source: 'drop', amount: 1, attack: 0, release: 0, min: 0, max: 1 }, // the recipe (ungated)
          bass: { source: 'band6', amount: 1, attack: 0.03, release: 0.3, min: 0, max: 1 }, // ring + sheen brightness
          sub: { source: 'sub', amount: 1, attack: 0.08, release: 0.6, min: 0, max: 1 }, // the push-in
          burst: { source: 'drop', amount: 1, attack: 0, release: 0.4, min: 0, max: 1 }, // ⚡ the shatter's seams (listed first: the tie)
          kickFlare: { source: 'kick', amount: 1, attack: 0, release: 0.15, min: 0, max: 1 }, // ⚡ amber band seams
          snareFlare: { source: 'snare', amount: 1, attack: 0, release: 0.18, min: 0, max: 1 }, // ⚡ cyan strip seams
        },
      },
      fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1,
    }],
  },
  // Donor synScenes (fx/syn.ts, research_donor_visual_system_2.md §3): the scene's own bound syn_* floats, by SYN_BIND
  // (fx/syn.test.ts: every one bound); ⚡ = the file's VJW_FLASH. res: the raymarch cost, billed p95 on M4 1728×1117 @2
  // (the 5 ms budget of a starred scene): beats 14.9 → 10.8 ms (res .5 → .25), twister 9.6 → 7.5, kaleido 5.3 → 3.5 (.4).
  {
    // Library-only (unstarred, the flash-audit rule): I-FL1 4–5 luma steps in 1 s at dnb174-arr's drop (the frame
    // falls from luma .86 over 3 frames; the hit's own ⚡ stays ≤ 2/s) and billed p95 10.8 ms at the res floor.
    v: 1, id: 'builtin:beats-in-4d', name: 'Beats in 4D', star: false, // dnb · mrange, CC0
    layers: [{
      gen: {
        ref: 'syn/beats_in_4d',
        values: { bass_mix: [0.4, 0.6] }, // B = .4·level³ + .6·hit³ (the donor's .7/.7): the exp(6·B) flash term less white
        // the level moves over .8 s: a build's bass ramp steps the exp(6·B) light less (I-FL1 8 → 4 steps in 1 s); ⚡ the hit
        bind: { ...syn('syn_BassHits'), syn_BassLevel: { ...SYN_BIND.syn_BassLevel, attack: 0.8, release: 0.8 } },
      },
      fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.25,
    }],
  },
  {
    v: 1, id: 'builtin:dark-twister', name: 'Dark Twister', star: true, // dnb · mrange, CC0
    layers: [{ gen: { ref: 'syn/dark_twister', bind: syn('syn_BassLevel', 'syn_BassHits', 'syn_Hits', 'syn_BassPresence', 'syn_MidPresence', 'syn_MidHighPresence') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.25 }], // ⚡ syn_BassHits
  },
  {
    v: 1, id: 'builtin:kaleidowhoa-man', name: 'KaleidoWHOA, MAN', star: true, // dnb · Meebs (syn_BeatTime: the beat count, unbound)
    layers: [{ gen: { ref: 'syn/kaleidowhoa_man', bind: syn('syn_OnBeat', 'syn_BassLevel', 'syn_Presence', 'syn_HighHits', 'syn_Level') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.4 }],
  },
  // Port lane B2a (2026-11-17): the scenes with clocks and manual control decisions (each file's header says which).
  {
    v: 1, id: 'builtin:meta-experiment-3', name: 'Meta Experiment 3', star: true, // dnb · aiekick, CC BY-NC-SA 3.0 · I-FL1 1/s, billed p95 1.43 ms
    // one cell full screen (the donor opens on its 12-cell picker), the clock wound by the bass and the hats
    layers: [{ gen: { ref: 'syn/meta_experiment_3', values: { TURN_ME_DOWN: 0, auto_zoom: 1, bass_mix: 0.6, highs_mix: 0.5, constant_mix: 0.25 }, bind: syn('syn_Presence', 'syn_HighHits', 'syn_BassLevel', 'syn_BassHits') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 }],
  },
  {
    v: 1, id: 'builtin:min-max-hex', name: 'Min Max Hex', star: false, // dnb · Meebs ⚡ syn_HighHits · Library-only: billed p95 8.63 ms (res 1), 9.28 (res .75) > 7.5; I-FL1 2/s
    layers: [{ gen: { ref: 'syn/min_max_hex', bind: syn('syn_BPMSin2', 'syn_HighHits', 'syn_Presence', 'syn_BassLevel', 'syn_HighPresence', 'syn_OnBeat', 'syn_Hits', 'syn_Level') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.75 }],
  },
  {
    v: 1, id: 'builtin:overload', name: 'Overload', star: false, // dnb · Alex Rowe · Library-only: billed p95 7.82 ms (res .5), 7.61 (res .4) > 7.5; I-FL1 1/s
    // syn_HighLevel tops at .4: the rings' level is pow(level, 3.5 + 5·high), and DnB's hats would keep them dark
    layers: [{ gen: { ref: 'syn/overload', bind: { ...syn('syn_BassLevel', 'syn_BassHits', 'syn_HighHits', 'syn_Level', 'syn_MidHits', 'syn_Presence'), syn_HighLevel: { ...SYN_BIND.syn_HighLevel, max: 0.4 } } }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.4 }],
  },
  {
    v: 1, id: 'builtin:beamers', name: 'Beamers', star: false, // dnb · sheltron · Library-only: billed p95 12.99 ms (res 1), 10.62 (res .5) > 7.5, not pixel-bound in this session; I-FL1 2/s (1 at res 1)
    layers: [{ gen: { ref: 'syn/beamers', bind: syn('syn_Presence', 'syn_BassPresence', 'syn_BassHits', 'syn_BassLevel', 'syn_Level', 'syn_HighLevel') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.5 }],
  },
  {
    v: 1, id: 'builtin:fractilian-foundation', name: 'Fractilian Foundation', star: true, // dnb · mojovideotech, CC BY-NC-SA 3.0 · I-FL1 1/s, billed p95 6.68 ms
    layers: [{ gen: { ref: 'syn/fractilian_foundation', bind: syn('syn_Presence', 'syn_BPMSin4', 'syn_ToggleOnBeat', 'syn_Level', 'syn_BassLevel') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 }],
  },
  {
    v: 1, id: 'builtin:hex-array', name: 'Hex Array', star: true, // dnb · sheltron (syn_BeatTime: the beat count, unbound) · I-FL1 1/s, billed p95 4.77 ms
    layers: [{ gen: { ref: 'syn/hex_array' }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.5 }],
  },
  {
    v: 1, id: 'builtin:gpu-melter', name: 'GPU Melter', star: true, // dnb · Meebs ⚡ syn_HighHits · I-FL1 3/s, billed p95 1.61 ms at res .4 (7.45 at res .5: the two readings disagree, re-measure alone)
    layers: [{ gen: { ref: 'syn/gpu_melter', bind: syn('syn_BassLevel', 'syn_HighHits', 'syn_MidPresence', 'syn_OnBeat', 'syn_BassPresence', 'syn_HighPresence', 'syn_Level') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.4 }],
  },
  {
    v: 1, id: 'builtin:neuron-proximitors', name: 'Neuron Proximitors', star: true, // dnb · patu x Meebs ⚡ syn_HighHits · I-FL1 3/s, billed p95 4.33 ms
    layers: [{ gen: { ref: 'syn/neuron_proximitors', bind: syn('syn_OnBeat', 'syn_Level', 'syn_Hits', 'syn_BassLevel', 'syn_HighHits', 'syn_HighLevel') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.25 }],
  },
  {
    v: 1, id: 'builtin:thresholder', name: 'Thresholder', star: true, // dnb · Kyle Grover ⚡ syn_BassHits · I-FL1 1/s, billed p95 3.79 ms
    layers: [{ gen: { ref: 'syn/thresholder', bind: syn('syn_BPMSin4', 'syn_BassHits', 'syn_BassLevel', 'syn_MidHighLevel', 'syn_HighPresence', 'syn_HighLevel', 'syn_MidLevel', 'syn_BassPresence', 'syn_Presence', 'syn_MidHighPresence', 'syn_Hits', 'syn_Level') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.5 }],
  },
  {
    v: 1, id: 'builtin:exoplanet', name: 'EXOplanet', star: true, // dnb · Meebs ft. WAHa_06x36 · I-FL1 2/s, billed p95 6.43 ms
    // syn_Intensity (the planet's radius, 2 + 9·x) = SYN's max(energy, build, drop): big in a drop's body, small in a break
    layers: [{ gen: { ref: 'syn/exoplanet', bind: { ...syn('syn_BPMSin4', 'syn_HighHits', 'syn_BassLevel', 'syn_BassHits', 'syn_HighLevel', 'syn_Level') } }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.25 }],
  },
  // Donor port lane B1b (2026-11-17). The star rule of that run: I-FL1 ≤ 3 luma steps in 1 s (30 s audit on
  // dnb174-arr) AND billed p95 ≤ 7.5 ms (20 s + the own/flash tail, M4 1728×1117 @2, five lanes on the GPU, so the
  // numbers read high: a scene near the limit was run twice and is starred only if both runs pass). The donor's
  // transition uniforms (cReg*, direction, sides, config, …) are panel sliders at the donor's first values.
  {
    v: 1, id: 'builtin:nova', name: 'Nova', star: true, // dnb · Felix Woitzel · I-FL1 1/s · billed p95 5.45 ms
    layers: [{ gen: { ref: 'syn/nova', bind: syn('syn_BassHits', 'syn_HighHits', 'syn_RandomOnBeat', 'syn_MidLevel', 'syn_OnBeat', 'syn_ToggleOnBeat', 'syn_HighLevel', 'syn_BassLevel', 'syn_HighPresence', 'syn_MidPresence', 'syn_BassPresence', 'syn_BPMTri2', 'syn_BPMConfidence', 'syn_Presence', 'syn_Level') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 }], // ⚡ syn_HighHits
  },
  {
    v: 1, id: 'builtin:pop', name: 'Pop', star: false, // dnb · Meebs · Library-only: billed p95 7.38 and 8.17 ms in two runs (med 2.19, 4.72), I-FL1 3/s
    layers: [{ gen: { ref: 'syn/pop', bind: syn('syn_RandomOnBeat', 'syn_HighLevel', 'syn_HighPresence', 'syn_BPMTri2', 'syn_BassLevel', 'syn_BassPresence', 'syn_Presence', 'syn_Level') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 }],
  },
  {
    v: 1, id: 'builtin:quicksand', name: 'Quicksand', star: true, // dnb · Meebs · I-FL1 1/s · billed p95 4.47 ms
    layers: [{ gen: { ref: 'syn/quicksand', bind: syn('syn_MidHighHits', 'syn_Presence', 'syn_OnBeat', 'syn_BPMSin2', 'syn_HighHits', 'syn_Intensity') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 }], // ⚡ syn_HighHits
  },
  {
    v: 1, id: 'builtin:rearranged', name: 'Rearranged', star: true, // dnb · Meebs · I-FL1 1/s · billed p95 1.51 ms
    layers: [{ gen: { ref: 'syn/rearranged', bind: syn('syn_Presence', 'syn_BassLevel', 'syn_OnBeat', 'syn_HighHits', 'syn_Level') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 }], // ⚡ syn_OnBeat
  },
  {
    v: 1, id: 'builtin:sprinkles', name: 'Sprinkles', star: true, // dnb · sheltron ft. Meebs · I-FL1 2/s · billed p95 4.07 ms
    layers: [{ gen: { ref: 'syn/sprinkles', bind: syn('syn_HighHits', 'syn_BassLevel') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.5 }],
  },
  {
    v: 1, id: 'builtin:square-shoals', name: 'SquareShoals', star: false, // dnb · Alex Rowe · Library-only: billed p95 7.86 and 4.38 ms in two runs (med 1.47, 2.59), I-FL1 1/s
    layers: [{ gen: { ref: 'syn/square_shoals', bind: syn('syn_Hits', 'syn_HighHits', 'syn_OnBeat', 'syn_BassLevel', 'syn_ToggleOnBeat', 'syn_Level') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.5 }],
  },
  {
    v: 1, id: 'builtin:sun-set', name: 'Sun_Set', star: true, // dnb · Meebs · I-FL1 2/s · billed p95 5.82 ms
    layers: [{ gen: { ref: 'syn/sun_set', bind: syn('syn_Presence', 'syn_MidPresence', 'syn_HighHits', 'syn_HighLevel', 'syn_OnBeat', 'syn_BassHits', 'syn_BassPresence', 'syn_MidLevel', 'syn_BassLevel') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 }], // ⚡ syn_BassHits
  },
  {
    v: 1, id: 'builtin:turbo-encabulator-fluid', name: 'Turbo Encabulator Fluid', star: false, // dnb · cornusammonis · Library-only: billed p95 6.94 and 11.16 ms in two runs (med 5.88, 10.23), I-FL1 1/s
    layers: [{ gen: { ref: 'syn/turbo_encabulator_fluid', bind: syn('syn_BPMTri2', 'syn_BPMConfidence', 'syn_BassPresence', 'syn_ToggleOnBeat', 'syn_Level', 'syn_HighHits', 'syn_BassHits', 'syn_OnBeat', 'syn_Presence', 'syn_HighPresence', 'syn_HighLevel', 'syn_BassLevel', 'syn_MidLevel') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.5 }],
  },
  {
    v: 1, id: 'builtin:circles5', name: 'Circles5', star: true, // dnb · Keijiro Takahashi · I-FL1 3/s · billed p95 4.82 ms
    layers: [{ gen: { ref: 'syn/circles5', bind: syn('syn_BassHits', 'syn_BassLevel', 'syn_BassPresence') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 }],
  },
  {
    v: 1, id: 'builtin:hills-eels', name: 'Hills, Eels', star: true, // dnb · Victor S. · I-FL1 1/s · billed p95 3.29 ms
    layers: [{ gen: { ref: 'syn/hills_eels', bind: syn('syn_BassLevel', 'syn_MidPresence', 'syn_MidHighPresence', 'syn_HighPresence', 'syn_Intensity', 'syn_BassHits', 'syn_MidHits', 'syn_MidHighHits') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.5 }],
  },
  // Adapter step 2's proofs (IMAGES, the media stub, syn_Spectrum), res .25, I-FL1 PASS both. Billed p95 with other lanes
  // on the GPU (it only adds time: the lower run bounds the cost): geode 5.5 ms (≤ 7.5: starred), hexagons 7.7 / 12.6 ms
  // (Library-only until a solo run).
  {
    v: 1, id: 'builtin:voronoi-geode', name: 'Voronoi Geode', star: true, // dnb · Shane (IMAGES: agate1/agate2)
    layers: [{ gen: { ref: 'syn/voronoi_geode', bind: syn('syn_HighHits', 'syn_Presence', 'syn_BassHits', 'syn_Level') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.25 }], // ⚡ syn_BassHits
  },
  {
    v: 1, id: 'builtin:bouncy-hexagons', name: 'Bouncy Hexagons', star: false, // dnb · mrange, CC0 (syn_Spectrum, IMAGES t_fbm)
    layers: [{ gen: { ref: 'syn/bouncy_hexagons', bind: syn('syn_BassPresence', 'syn_MidLevel', 'syn_MidHighLevel', 'syn_Level') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.25 }],
  },
  // Lane B1a (2026-11-17, the bulk import): 10 more. A hit that lights the frame rides the snare or the kick, never the
  // hats (⚡ lets 3 onsets/s through: hats would pass at random). The feedback scenes run at res .5 (the donor's own
  // pass sizes on a 3456-wide stage: their patterns are sized in texels) or, over the budget there, lower.
  // Measured as shipped: I-FL1 = the most luma steps > .10 in any 1 s (dnb174-arr, 30 s; ≤ 3 passes) and the billed p95
  // (M4 1728×1117 @2 with 5 lanes on the GPU, so this run's star line was 7.5 ms): PLUS 3 · 6.64 ms, Alien Cavern 1 ·
  // 6.01, Canvas 1 · 2.13, Churning 1 · 2.35, Compound Iris 2 · 3.06 (11.98 at res .5), Dispersion 1 · 4.71, Fluid Body
  // 1 · 4.04 (13.25 at .5), Glassier 2 · 6.25 (11.61 at .5), Milk Honey 1 · 2.96; Glob 3 · 5.39, Library-only (below).
  {
    v: 1, id: 'builtin:plus', name: 'PLUS', star: true, // dnb · Meebs
    layers: [{ gen: { ref: 'syn/PLUS', bind: { ...syn('syn_Level'), syn_HighHits: SYN_BIND.syn_Hits } }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 }], // ⚡ syn_HighHits ← snare
  },
  {
    v: 1, id: 'builtin:alien-cavern', name: 'Alien Cavern', star: true, // dnb · aiekick, CC BY-NC-SA 3.0
    layers: [{
      gen: { ref: 'syn/alien_cavern', values: { flashing: 1 }, bind: { ...syn('syn_Presence', 'syn_BPMSin4', 'syn_BassLevel', 'syn_Level'), syn_HighHits: SOFT_SNARE } }, // ⚡ syn_HighHits ← snare: the ridges light up
      fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.25,
    }],
  },
  {
    v: 1, id: 'builtin:canvas', name: 'Canvas', star: true, // dnb · ⚡ syn_OnBeat (the kick), syn_BPMTri
    layers: [{
      gen: {
        ref: 'syn/canvas',
        // the kick's whole-frame light at half (the feedback takes 17 % of it per frame: a luma step under .10) and
        // short (.1 s: black again before the next kick)
        values: { beat_flasher_on: 0.5 },
        // syn_BPMTri (⚡, read by bpm_flasher_on only, which is off) is parked at amount 0: its 2.9 onsets/s at 174 BPM
        // would spend the scene's flash budget, and the kick's light would be refused at random
        bind: { ...syn('syn_BPMConfidence', 'syn_RandomOnBeat', 'syn_BassLevel', 'syn_Level'), syn_OnBeat: { ...SYN_BIND.syn_OnBeat, release: 0.1 }, syn_BPMTri: { ...SYN_BIND.syn_BPMTri, amount: 0 } },
      },
      fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1,
    }],
  },
  {
    v: 1, id: 'builtin:churning', name: 'Churning', star: true, // dnb · Victor S.
    layers: [{
      gen: { ref: 'syn/churning', values: { colRegSel: 0.1 }, bind: { ...syn('syn_HighLevel', 'syn_BassLevel', 'syn_BassHits', 'syn_ToggleOnBeat', 'syn_RandomOnBeat', 'syn_BPMTri2', 'syn_Level', 'syn_HighPresence', 'syn_BassPresence'), syn_HighHits: SYN_BIND.syn_Hits } }, // syn_HighHits ← snare
      fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.5,
    }],
  },
  {
    v: 1, id: 'builtin:compound-iris', name: 'Compound Iris', star: true, // dnb · Meebs
    layers: [{ gen: { ref: 'syn/compound_iris', bind: syn('syn_BassPresence', 'syn_MidPresence', 'syn_BPMSin2', 'syn_HighPresence', 'syn_HighHits', 'syn_Level', 'syn_BassLevel') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.35 }],
  },
  {
    v: 1, id: 'builtin:dispersion', name: 'Dispersion', star: true, // dnb · cornusammonis
    layers: [{ gen: { ref: 'syn/dispersion', bind: { ...syn('syn_BassLevel', 'syn_Presence', 'syn_HighLevel', 'syn_Level'), syn_HighHits: SOFT_KICK } }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.5 }], // ⚡ syn_HighHits ← kick: the stripes pump
  },
  {
    v: 1, id: 'builtin:fluid-body', name: 'Fluid Body', star: true, // dnb · Victor S.
    layers: [{ gen: { ref: 'syn/fluid_body', bind: syn('syn_BassHits', 'syn_MidLevel', 'syn_MidHighLevel', 'syn_HighHits') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.33 }],
  },
  {
    v: 1, id: 'builtin:glassier', name: 'Glassier', star: true, // dnb · Felix Woitzel
    layers: [{
      gen: { ref: 'syn/glassier', values: { cReg4: 1 }, bind: { ...syn('syn_BassHits', 'syn_RandomOnBeat', 'syn_OnBeat', 'syn_ToggleOnBeat', 'syn_HighLevel', 'syn_BassLevel', 'syn_BassPresence', 'syn_Level'), syn_HighHits: SYN_BIND.syn_Hits } }, // syn_HighHits ← snare: the brush's push
      fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.35,
    }],
  },
  {
    // Library-only (unstarred, the flash-audit rule): the snare's glow is most of its light. I-FL1 read 3, 4 and 4
    // steps in 1 s at rises of 0 and 40 ms, and 3 (the cap, in the snare roll) at the 80 ms kept here: no margin.
    v: 1, id: 'builtin:glob', name: 'Glob', star: false, // dnb · Nimitz
    layers: [{ gen: { ref: 'syn/glob', bind: { ...syn('syn_Level'), syn_HighHits: { ...SOFT_SNARE, attack: 0.08 }, syn_BassHits: { ...SOFT_KICK, attack: 0.08 } } }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.5 }], // ⚡ syn_HighHits ← snare, syn_BassHits (the kick)
  },
  {
    v: 1, id: 'builtin:milk-honey-smoke-bile', name: 'Milk, Honey, Smoke, Bile', star: true, // dnb · Victor S.
    layers: [{
      // ⚡ syn_BassHits at full: the kick's drag drop is what keeps the field in blobs (softened to .8 over 3 frames, it
      // went flat within 12 s)
      gen: { ref: 'syn/milk_honey_smoke_bile', bind: syn('syn_HighLevel', 'syn_HighPresence', 'syn_MidLevel', 'syn_BassHits', 'syn_MidPresence', 'syn_MidHighLevel', 'syn_MidHighPresence', 'syn_RandomOnBeat', 'syn_OnBeat', 'syn_Level') },
      fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.5,
    }],
  },
  // Lane B2b (clocks + manual-control decisions; each file's header says what its script.js / bang / traveler became).
  // Starred = I-FL1 (max luma steps > .10 in 1 s, 30 s of dnb174-arr) <= 3 and billed p95 <= 7.5 ms (5 lanes on the GPU,
  // M4 1728x1118), on adapter step 2: hue-review 1 / 3.7 ms, inkshot 2 / 4.9, lattix 1 / 3.7, myoplasm 2 / 5.0,
  // scaffold-fractal 3 / 5.9, deeper 1 / 6.0. Library-only (frame time): swarm-meebs 3 / 8.7, entombed 1 / 13.1.
  {
    v: 1, id: 'builtin:hue-review', name: 'Hue Review', star: true, // dnb · Meebs · ⚡ syn_Hits (the snare's ring), syn_BassHits
    layers: [{ gen: { ref: 'syn/hue_review', bind: syn('syn_Hits', 'syn_Presence', 'syn_HighHits', 'syn_BassHits', 'syn_OnBeat', 'syn_BassLevel', 'syn_HighLevel') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 }],
  },
  {
    v: 1, id: 'builtin:inkshot', name: 'Ink Shot', star: true, // dnb · Meebs · ⚡ syn_BassHits
    layers: [{ gen: { ref: 'syn/inkshot', bind: syn('syn_HighHits', 'syn_BassHits', 'syn_BassLevel', 'syn_RandomOnBeat', 'syn_BassPresence', 'syn_Level', 'syn_HighLevel', 'syn_MidHighLevel') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 }],
  },
  {
    v: 1, id: 'builtin:lattix', name: 'Lattix', star: true, // dnb · Anonymous (the kick lunges the camera: a clock)
    layers: [{ gen: { ref: 'syn/lattix', bind: syn('syn_OnBeat', 'syn_Presence', 'syn_HighHits', 'syn_BassLevel', 'syn_BassHits') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.5 }],
  },
  {
    v: 1, id: 'builtin:myoplasm', name: 'Myoplasm', star: true, // dnb · Alex Rowe
    layers: [{ gen: { ref: 'syn/myoplasm', bind: syn('syn_BassLevel', 'syn_BassHits', 'syn_BassPresence', 'syn_HighLevel', 'syn_Level') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 }],
  },
  {
    v: 1, id: 'builtin:scaffold-fractal', name: 'Scaffold Fractal', star: true, // dnb · Meebs (after kabuto / s1e) · ⚡ syn_HighHits
    layers: [{ gen: { ref: 'syn/scaffold_fractal', bind: syn('syn_Presence', 'syn_HighHits', 'syn_Level', 'syn_HighLevel') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.5 }],
  },
  {
    v: 1, id: 'builtin:swarm-meebs', name: 'Swarm (Meebs)', star: false, // dnb · Meebs (40 particles: a FLOAT state row); builtin:swarm is our own
    layers: [{ gen: { ref: 'syn/swarm', bind: syn('syn_HighHits', 'syn_Presence', 'syn_BPMSin2', 'syn_Level') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.5 }], // Library-only: billed p95 8.7 ms at res .5 (40 particles per pixel; 15.5 ms at res 1, the governor steps to .6)
  },
  {
    v: 1, id: 'builtin:deeper', name: 'Deeper', star: true, // dnb · Meebs (the bass flies the corridor: a clock)
    layers: [{
      gen: {
        ref: 'syn/deeper',
        // the donor's thumbnail look (its defaults are a bare grey corridor): colour, spiral bumps, the beams that
        // swell with the hats and wave with the bass, the walls breathing per two bars. light_chaser stays off (its
        // light jumps back to the near walls at each bar start; not measured with the slowed hats below)
        values: { colorful: 1, walls_texture: 0.5, beams_on: 1, many_beams: 1, beam_glow: 0.12, undulating: 1 },
        // the hats swell the beams (and their glow) over .12 s, not in one frame (I-FL1 on dnb174-arr: 5 luma steps in
        // 1 s and 22 in 30 s at attack 0, 1 and 1 here). res: billed p95 11.1 ms at 1 (its raymarch pass is .53 of it)
        bind: { ...syn('syn_BassLevel', 'syn_HighPresence', 'syn_Presence', 'syn_BassPresence'), syn_HighHits: { ...SYN_BIND.syn_HighHits, attack: 0.12, release: 0.3 } },
      },
      fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.6,
    }],
  },
  {
    // Library-only: billed p95 13.1 ms at res .25 (14.5 at .5, 13.3 at .3: each with the governor at .6, so few scale-1
    // samples; its 50-step raymarch is 7.5 of 11.6 ms at res .3). Re-measure with the GPU alone before starring.
    v: 1, id: 'builtin:entombed-silicon-dreams', name: 'Entombed Silicon Dreams', star: false, // dnb · mrange, CC0 · ⚡ syn_BassHits (the ring = our FFT)
    layers: [{ gen: { ref: 'syn/entombed_silicon_dreams', bind: syn('syn_BassLevel', 'syn_BassHits') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.25 }],
  },
  // Lane B3a (IMAGES scenes on adapter step 2; each file's header says what its script.js / transitions / media became).
  // Starred = I-FL1 (max luma steps > .10 in 1 s, 30 s of dnb174-arr) <= 3 and billed p95 <= 7.5 ms (5 lanes on the GPU,
  // M4 1728x1118, the lowest run): biopsy 3 / 5.4 ms, biopsy-v2 2 / 4.7, boreal 1 / 6.6, cloudten 2 / 6.3, cosmic-dust
  // 2 / 5.2, dynamical-flame 3 / 7.2, gaussian-smoothlife 2 / 6.5, glitch-meebs 3 / 4.8, hexoplanet 1 / 6.1.
  {
    // inOrOut -1: the bass zooms in (the donor re-rolls it per transition; at its first value, 1, our bass level pulls
    // the field in over the wrapped edges faster than it grows: an empty frame round the picture)
    v: 1, id: 'builtin:biopsy', name: 'Biopsy', star: true, // dnb · Meebs ft. Flexi · ⚡ syn_HighHits
    layers: [{ gen: { ref: 'syn/biopsy', values: { inOrOut: -1 }, bind: syn('syn_HighHits', 'syn_HighPresence', 'syn_BassPresence', 'syn_BassLevel', 'syn_BPMTri2', 'syn_MidHighPresence', 'syn_Presence', 'syn_MidPresence', 'syn_Level', 'syn_MidLevel', 'syn_MidHighLevel', 'syn_HighLevel') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 }],
  },
  {
    v: 1, id: 'builtin:biopsy-v2', name: 'Biopsy V2', star: true, // dnb · Meebs ft. Flexi · ⚡ syn_HighHits (inOrOut: as Biopsy)
    layers: [{ gen: { ref: 'syn/biopsy_v2', values: { inOrOut: -1 }, bind: syn('syn_HighHits', 'syn_HighPresence', 'syn_BassPresence', 'syn_BassLevel', 'syn_BassHits', 'syn_MidHighPresence', 'syn_MidPresence', 'syn_Presence', 'syn_MidLevel', 'syn_MidHighLevel', 'syn_HighLevel') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 }],
  },
  {
    // the donor's script re-rolls its three dropdowns per transition; held here on colour tears, moving in, waving (its
    // defaults are the still white feathers). res: billed p95 8.6 ms at 1
    v: 1, id: 'builtin:boreal', name: 'Boreal', star: true, // dnb · Alex Rowe (the scanner's phase: a clock)
    layers: [{ gen: { ref: 'syn/boreal', values: { image_select: 2, wind_movement: 0, warp_type: 0 }, bind: syn('syn_Intensity', 'syn_MidHighPresence', 'syn_BassHits', 'syn_BassPresence', 'syn_BassLevel', 'syn_HighHits', 'syn_Level') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.75 }],
  },
  {
    // res: billed p95 10.4 ms at 1 (its clouds are a third of the layer: soft at .5)
    v: 1, id: 'builtin:cloudten', name: 'Cloud Ten', star: true, // dnb · nimitz (the level flies the camera: a clock)
    layers: [{ gen: { ref: 'syn/cloudten', bind: syn('syn_Presence', 'syn_HighPresence', 'syn_BassPresence', 'syn_Level') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.5 }],
  },
  {
    v: 1, id: 'builtin:cosmic-dust', name: 'Cosmic Dust', star: true, // dnb · Kali x Meebs · ⚡ syn_HighHits, syn_MidHighHits (res: billed p95 12.7 ms at 1)
    layers: [{ gen: { ref: 'syn/cosmic_dust', bind: syn('syn_BassLevel', 'syn_MidLevel', 'syn_HighHits', 'syn_MidHighHits', 'syn_HighPresence', 'syn_MidPresence', 'syn_Level', 'syn_HighLevel') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.5 }],
  },
  {
    v: 1, id: 'builtin:dynamical-flame', name: 'Dynamical Flame', star: true, // dnb · cornusammonis · ⚡ syn_HighHits
    layers: [{ gen: { ref: 'syn/dynamical_flame', bind: syn('syn_BassLevel', 'syn_HighHits', 'syn_Presence') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 }],
  },
  {
    // res: billed p95 8.8 ms at 1 (two 101-tap blurs). scale 1.13 keeps the donor's cell size on screen at res .75 (its
    // kernel is in texels: 1.3 x sqrt(.75)). The hits rise over 40 ms, the picture's on the snare (I-FL1 on dnb174-arr,
    // 30 s, as SYN binds them: the drop's first hit steps the luma up and back in two frames, 4 steps in 1 s with the
    // two every scene shows at the drop; 2 here)
    v: 1, id: 'builtin:gaussian-smoothlife', name: 'Gaussian SmoothLife', star: true, // dnb · cornusammonis · ⚡ syn_HighHits ← snare, syn_BassHits ← kick
    layers: [{ gen: { ref: 'syn/gaussian_smoothlife', values: { scale: 1.13 }, bind: { ...syn('syn_Presence', 'syn_BassLevel'), syn_HighHits: SOFT_SNARE, syn_BassHits: SOFT_KICK } }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.75 }],
  },
  {
    v: 1, id: 'builtin:glitch-meebs', name: 'Glitch (Meebs)', star: true, // dnb · Meebs ft. XOR · ⚡ syn_OnBeat, syn_HighHits; builtin:glitch is our own
    layers: [{ gen: { ref: 'syn/glitch', bind: syn('syn_OnBeat', 'syn_BassPresence', 'syn_HighPresence', 'syn_Presence', 'syn_HighHits', 'syn_BassLevel', 'syn_BassHits', 'syn_BPMTri', 'syn_Hits', 'syn_Level') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 }],
  },
  {
    // the donor's thumbnail look: the camera close over the pole, full bumps (its defaults show the whole ball). The
    // bumps follow the sub (bass_bump 0); the donor's default flips them per beat (syn_ToggleOnBeat: our beat LFO scales
    // with the tempo confidence, so they lie flat on a weak grid). res: billed p95 13.5 ms at .5, 8.1 at .35 (its march
    // takes up to 1000 short steps)
    v: 1, id: 'builtin:hexoplanet', name: 'HEXOplanet', star: true, // dnb · aiekick, CC BY-NC-SA 3.0 · ⚡ syn_Hits
    layers: [{ gen: { ref: 'syn/hexoplanet', values: { elevation: 3.2, size_bumps: 1, bass_bump: 0 }, bind: syn('syn_BassLevel', 'syn_ToggleOnBeat', 'syn_Hits', 'syn_Level') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.25 }],
  },
  // Lane B3b (IMAGES scenes; each file's header says what its script.js / bang / reversed range became). A hit that
  // lights the frame rides the snare (SOFT_SNARE), never the hats. Res: .5 where the scene is sized in its pass's
  // pixels (the fields of Vein Melter, Shrouded and Molten, REDRUM's drips): the donor's own pass sizes on a 3456-wide
  // stage; else what the frame time allows.
  // Measured as shipped: I-FL1 = the most luma steps > .10 in any 1 s (dnb174-arr, 30 s; <= 3 passes) and the billed
  // p95 (M4 1728x1117 @2, other lanes on the GPU, so the lowest run; this run's star line was 7.5 ms): replik8 2 ·
  // 4.09 ms (12.13 at res 1), Stained Glass 1 · 4.49 (11.34 at res 1), Transparent Isoslices 2 · 5.11 (6.23 at .35),
  // KIFS Flythrough 1 · 4.44 (3.6 at .5), REDRUM 3 · 3.35, Vein Melter 2 · 4.09, Shrouded 1 · 3.2, Molten 2 · 3.52.
  {
    v: 1, id: 'builtin:replik8', name: 'replik8', star: true, // dnb · Meebs · ⚡ syn_HighHits ← snare (with `flashing` on)
    layers: [{ gen: { ref: 'syn/replik8', bind: { ...syn('syn_Presence', 'syn_BassPresence', 'syn_HighLevel', 'syn_BassLevel'), syn_HighHits: SOFT_SNARE } }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.6 }],
  },
  {
    v: 1, id: 'builtin:stained-glass', name: 'Stained Glass', star: true, // dnb · Meebs (IMAGES colorNoise)
    // syn_RandomOnBeat: SYN's per-beat value, flipped over the beat's first 15 % (adapter step 3: a raw on our grid at
    // full swing; the binding that eased it over .83 s like script.js's random_spot is gone)
    layers: [{ gen: { ref: 'syn/stained_glass', bind: { ...syn('syn_Presence', 'syn_BassLevel', 'syn_BassPresence', 'syn_HighLevel') } }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.5 }],
  },
  {
    v: 1, id: 'builtin:transparent-isoslices', name: 'Transparent Isoslices', star: true, // dnb · Shane · ⚡ syn_HighHits ← snare
    layers: [{ gen: { ref: 'syn/transparent_isoslices', bind: { ...syn('syn_OnBeat', 'syn_MidPresence', 'syn_MidLevel', 'syn_BassLevel', 'syn_HighLevel'), syn_HighHits: SOFT_SNARE } }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.3 }],
  },
  {
    v: 1, id: 'builtin:kifs-flythrough', name: 'KIFS Flythrough', star: true, // dnb · Shane (the bass flies the camera: a clock)
    layers: [{ gen: { ref: 'syn/kifs_flythrough', bind: syn('syn_BassLevel', 'syn_BassPresence', 'syn_BassHits') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.6 }],
  },
  {
    v: 1, id: 'builtin:redrum', name: 'REDRUM', star: true, // dnb · Meebs · ⚡ syn_HighHits ← snare
    // more_blood 2 (the donor's top): at its default 1 the frame stays near black here (median luma .004 on dnb174-arr):
    // the donor also splats on a hat hit >= .99, which our 40 ms snare rise never reaches, so the kick alone splats
    layers: [{ gen: { ref: 'syn/redrum', values: { more_blood: 2 }, bind: { ...syn('syn_BassLevel', 'syn_Presence', 'syn_OnBeat', 'syn_Level', 'syn_HighLevel'), syn_HighHits: SOFT_SNARE } }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.5 }],
  },
  {
    v: 1, id: 'builtin:vein-melter', name: 'Vein Melter', star: true, // dnb · cornusammonis (a FLOAT field, 40 advection steps)
    // paint1_on: the donor's brush at the centre, so the field hears the music (the hats push it out, the bass pulls
    // it in); off (the donor's default) only the bar-long heartbeat moves it
    layers: [{ gen: { ref: 'syn/vein_melter', values: { paint1_on: 1 }, bind: syn('syn_HighHits', 'syn_BassLevel') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.5 }],
  },
  {
    v: 1, id: 'builtin:shrouded', name: 'Shrouded', star: true, // dnb · Felix Woitzel ft. Meebs · ⚡ syn_HighHits ← snare
    layers: [{ gen: { ref: 'syn/shrouded', bind: { ...syn('syn_Presence', 'syn_BassLevel', 'syn_BPMSin2', 'syn_MidHighPresence', 'syn_BassPresence', 'syn_HighPresence', 'syn_MidPresence', 'syn_MidLevel', 'syn_MidHighLevel', 'syn_HighLevel'), syn_HighHits: SOFT_SNARE } }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.5 }],
  },
  {
    v: 1, id: 'builtin:molten', name: 'Molten', star: true, // dnb · Meebs ft. Flexi · ⚡ syn_HighHits ← snare (the camera: clocks)
    layers: [{ gen: { ref: 'syn/molten', bind: { ...syn('syn_BassLevel', 'syn_HighPresence', 'syn_BassPresence', 'syn_BPMSin4', 'syn_MidPresence', 'syn_HighLevel', 'syn_Level'), syn_HighHits: SOFT_SNARE } }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.5 }],
  },
  // Lane B4b (the media-stub batch; each file's header says what its script.js / bang / image became). Our detector's
  // logic (user 2026-11-18): the syn(...) defaults (kick = bass hits, snare = any / mid hits, hats = high hits, subBody /
  // reeseBody / energy = levels and presence, the beat grid = beat steps); a size or intensity control rides a source:
  // bound here to `build` (a swell) or `drop` (a hit) where the scene has one (adapter step 3: a built-in may bind its
  // controls too), else syn_Intensity in the body (SYN's max(energy, build, drop)).
  // Starred = I-FL1 (max luma steps > .10 in 1 s, 30 s of dnb174-arr) <= 3 and billed p95 <= 7.5 ms (M4 1728x1118, the
  // lowest run; the GPU was shared, the reference scene wireform+flash read 4.6-6.4 ms): tunnel-beauty-6 1 / 7.33 ms,
  // waterly 2 / 5.99, traced-tunnel 1 / 5.4, raymarched-reflections 1 / 4.75. Library-only (frame time): terrain-lattice
  // 1 / 7.9 at res .6 (12.3 at its .8).
  {
    v: 1, id: 'builtin:tunnel-beauty-6', name: 'Tunnel Beauty 6', star: true, // dnb · aiekick, CC BY-NC-SA 3.0 · ⚡ syn_OnBeat ← kick: the far walls light up
    // overrides: syn_OnBeat's 40 ms rise (a light); diameter ← build (.35 → .525): the tunnel swells through a build.
    // res: billed p95 7.33 ms at .6 (9.59 at .75, 9.47 at 1, each with the GPU shared): raise it after a solo re-measure
    layers: [{ gen: { ref: 'syn/tunnel_beauty_6', bind: { ...syn('syn_Presence', 'syn_BassPresence', 'syn_BPMSin4', 'syn_HighLevel', 'syn_BassLevel'), syn_OnBeat: SOFT_KICK, diameter: { source: 'build', amount: 1, attack: 1, release: 2, min: 0.35, max: 0.525 } } }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.6 }],
  },
  {
    v: 1, id: 'builtin:waterly', name: 'Waterly', star: true, // dnb · FabriceNeyret2 / Shady Headstash, CC BY-NC-SA 3.0 (the levels and the drums wind the flow: a clock; energy churns it: syn_Intensity). No override
    layers: [{ gen: { ref: 'syn/waterly', bind: syn('syn_Level', 'syn_Presence', 'syn_Hits', 'syn_BassPresence', 'syn_BassHits', 'syn_Intensity') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 }],
  },
  {
    // Library-only: billed p95 7.9 ms at res .6 and 12.3 at .8 with these values (7.91 at .8 with the donor's defaults),
    // each with the GPU shared (the reference scene read 4.6 ms). Re-measure with the GPU alone before starring.
    // perturbation 2 (the donor's height at energy .5) read 11.4 ms with the governor at .85: left at 1.
    v: 1, id: 'builtin:terrain-lattice', name: 'Terrain Lattice', star: false, // dnb · Shane (the kick swells the pipes). No override
    // the donor's own switches: auto_perturb = the terrain's height x energy; split_amt .5 with its auto_split = a red /
    // cyan fringe x the sub cubed (loud sub only; at 1 the pipes read as an anaglyph through a whole drop)
    layers: [{ gen: { ref: 'syn/terrain_lattice', values: { auto_perturb: 1, split_amt: 0.5 }, bind: syn('syn_OnBeat', 'syn_Presence', 'syn_BassLevel', 'syn_Level') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.8 }],
  },
  {
    v: 1, id: 'builtin:traced-tunnel', name: 'Traced Tunnel', star: true, // dnb · Shane · ⚡ syn_HighHits ← snare (auto_flasher only)
    // overrides: syn_HighHits ← snare, 40 ms rise (a light on the hats would flicker); FOV ← build (1 → .55): the lens
    // widens through a build
    layers: [{ gen: { ref: 'syn/traced_tunnel', bind: { ...syn('syn_Presence', 'syn_BPMSin2', 'syn_BassLevel', 'syn_Level', 'syn_MidHighLevel', 'syn_HighLevel'), syn_HighHits: SOFT_SNARE, FOV: { source: 'build', amount: 1, attack: 1, release: 2, min: 1, max: 0.55 } } }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.25 }],
  },
  {
    v: 1, id: 'builtin:raymarched-reflections', name: 'Raymarched Reflections', star: true, // dnb · Shane (the sub flies the cubes: a clock)
    // override: pulse_pillars ← drop (1 → 0): the drop fuses the cubes into pillars (the donor's bang); geometry, no light
    layers: [{ gen: { ref: 'syn/raymarched_reflections', bind: { ...syn('syn_BassLevel'), pulse_pillars: { source: 'drop', amount: 1, attack: 0.04, release: 1.5, min: 1, max: 0 } } }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.25 }],
  },
  // Lane B4b, the six media scenes: Library-only, each NEEDS A MEDIA INPUT (backlog 8, video files as a source). The
  // adapter's media is a black stub, so they draw their no-media fallback or nothing; parse + compile checked, not
  // flash- or frame-time-measured (measure them when media lands, before starring).
  {
    v: 1, id: 'builtin:equirectangular', name: 'Equirectangular', star: false, // needs a media input · Shady Headstash (no media: its own tile on a sphere)
    layers: [{ gen: { ref: 'syn/equirectangular' }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 }],
  },
  {
    v: 1, id: 'builtin:sinusoidal-warp', name: 'Sinusoidal Warp', star: false, // needs a media input · Shane / Shady Headstash, CC BY-NC-SA 3.0 (no media: a textureless warp)
    layers: [{ gen: { ref: 'syn/sinusoidal_warp', bind: syn('syn_Level', 'syn_Hits', 'syn_BassPresence') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 }],
  },
  {
    v: 1, id: 'builtin:videofx-directionalblur', name: 'VideoFX Directional Blur', star: false, // needs a media input · the donor app (no media: a zoom-blurred grid)
    layers: [{ gen: { ref: 'syn/videofx_directionalblur', bind: syn('syn_ToggleOnBeat', 'syn_Level', 'syn_BassLevel') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 }],
  },
  {
    v: 1, id: 'builtin:raw-video', name: 'Raw Video', star: false, // needs a media input · the donor app (no media: black)
    layers: [{ gen: { ref: 'syn/raw_video' }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 }],
  },
  {
    v: 1, id: 'builtin:videofx-1', name: 'VideoFX 1', star: false, // needs a media input · the donor app (no media: its stripes) · ⚡ syn_HighHits ← snare (circle_pix only)
    layers: [{ gen: { ref: 'syn/videofx_1', bind: { ...syn('syn_BassLevel', 'syn_Level'), syn_HighHits: SOFT_SNARE } }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 }],
  },
  {
    v: 1, id: 'builtin:pxl-sort-1', name: 'Pxl Sort 1', star: false, // needs a media input · Meebs (no media: black; the kick refreshes the smear)
    layers: [{ gen: { ref: 'syn/pxl_sort_1', bind: syn('syn_HighHits', 'syn_OnBeat') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 }],
  },
  // synScene adapter step 3: the ports its features unblocked (each file's header says what its script.js became).
  {
    v: 1, id: 'builtin:logo-grid-pulses', name: 'Logo Grid Pulses', star: true, // UFFFD x Meebs · ⚡ syn_BassHits, syn_OnBeat · the logo: our wordmark (IMAGES) · I-FL1 2/s, billed p95 5.22 ms
    // the auto re-roll knobs at 0: the donor's default modes (diagonal lines x zigzag) hold; some re-rolled pairs leave the
    // frame almost empty (fill up x expanding waves). Raise them to .15 for the donor's re-roll (every 32 bars here).
    layers: [{ gen: { ref: 'syn/logo_grid_pulses', values: { grid_auto_transition: 0, pulse_auto_transition: 0 }, bind: syn('syn_BassLevel', 'syn_BPMSin4', 'syn_BPMConfidence', 'syn_HighHits', 'syn_OnBeat', 'syn_BassHits', 'syn_Level') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.5 }],
  },
  {
    v: 1, id: 'builtin:lost-in-the-sauce', name: 'Lost in the Sauce', star: true, // Keijiro Takahashi x Meebs · ⚡ syn_OnBeat (no media: the side lines feed it) · I-FL1 1/s, billed p95 3.72 ms
    layers: [{ gen: { ref: 'syn/lost_in_the_sauce', bind: syn('syn_OnBeat', 'syn_BassLevel', 'syn_Level') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.5 }],
  },
  {
    // Library-only: the donor's audio monitor (spectrum, waveform, the level trail, the input meter), a tool, not a look
    v: 1, id: 'builtin:audio-indicators', name: 'Audio Indicators', star: false, // the donor app's built-in monitor
    layers: [{ gen: { ref: 'syn/audio_indicators' }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 }],
  },
  // Donor port lane B4a (2026-11-18, the media stub: syn_Media is black). The stars follow the B2b rule above.
  {
    v: 1, id: 'builtin:filter-blown', name: 'Filter Blown', star: false, // dnb · Meebs · ⚡ syn_OnBeat (the kick's diamond lines)
    layers: [{ gen: { ref: 'syn/filter_blown', bind: syn('syn_Intensity', 'syn_BPMSin2', 'syn_BPMConfidence', 'syn_BassLevel', 'syn_HighHits', 'syn_OnBeat', 'syn_ToggleOnBeat', 'syn_BPMSin4', 'syn_Presence', 'syn_HighLevel') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 }],
  },
  {
    v: 1, id: 'builtin:fuzzy-signal', name: 'Fuzzy Signal', star: false, // dnb · Meebs · ⚡ syn_HighHits (the hats' CMY glitch)
    layers: [{ gen: { ref: 'syn/fuzzy_signal', bind: syn('syn_Intensity', 'syn_Presence', 'syn_HighHits', 'syn_BassLevel') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.25 }],
  },
  {
    v: 1, id: 'builtin:hextunnel', name: 'HexTunnel', star: false, // dnb · sheltron
    layers: [{ gen: { ref: 'syn/hextunnel', values: { media_scale: 0.03 }, bind: syn('syn_Intensity', 'syn_Presence', 'syn_BassLevel', 'syn_HighLevel') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.5 }], // media_scale: the noise image as broad patches (.5, the donor's default for a video, is a fine speckle)
  },
  {
    v: 1, id: 'builtin:fire-tunnel', name: 'Fire Tunnel', star: false, // dnb · aiekick, CC BY-NC-SA 3.0 · ⚡ syn_BassHits (the kick's fire bands)
    layers: [{ gen: { ref: 'syn/fire_tunnel', bind: syn('syn_Intensity', 'syn_HighPresence', 'syn_HighHits', 'syn_BassPresence', 'syn_BassLevel', 'syn_BassHits', 'syn_MidPresence') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.7 }],
  },
  {
    v: 1, id: 'builtin:ray-marching-experiment-62', name: 'Ray Marching Experiment 62', star: false, // dnb · aiekick, CC BY-NC-SA 3.0 · ⚡ syn_Hits ← snare (40 ms rise): the spiral lights up
    // the donor's own switches: flashing = the snare lights the spiral, highhits_ridges = the hats ripple its ridges
    layers: [{ gen: { ref: 'syn/ray_marching_experiment_62', values: { flashing: 1, highhits_ridges: 1 }, bind: { ...syn('syn_Intensity', 'syn_HighHits', 'syn_Presence', 'syn_BassLevel', 'syn_BassPresence'), syn_Hits: SOFT_SNARE } }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.3 }],
  },
  {
    v: 1, id: 'builtin:mandelbrot-decoration', name: 'Mandelbrot Decoration', star: false, // dnb · Shane (the lit layer steps per beat)
    layers: [{ gen: { ref: 'syn/mandelbrot_decoration', bind: syn('syn_Intensity', 'syn_MidHighLevel', 'syn_Level') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.5 }],
  },
  {
    v: 1, id: 'builtin:circuit-bending', name: 'Circuit Bending', star: false, // dnb · mojovideotech + Meebs, CC BY-NC-SA 3.0 · ⚡ syn_HighHits ← snare: the cyan circuits light up
    layers: [{ gen: { ref: 'syn/circuit_bending', bind: { ...syn('syn_BassLevel', 'syn_Presence', 'syn_BassHits', 'syn_BassPresence', 'syn_HighLevel'), syn_HighHits: SOFT_SNARE } }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.5 }],
  },
  {
    v: 1, id: 'builtin:primitiv-logik', name: 'PRIMITIV_logik', star: false, // dnb · Meebs (a shape per two beats)
    // the donor's own switch: bass_twitcher = the kick twitches the shape (off in the donor's defaults)
    layers: [{ gen: { ref: 'syn/primitiv_logik', values: { bass_twitcher: 1 }, bind: syn('syn_Intensity', 'syn_HighHits', 'syn_OnBeat', 'syn_BassLevel') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.6 }],
  },
  {
    v: 1, id: 'builtin:deeper-v2', name: 'Deeper V2', star: false, // dnb · Meebs (the bass flies the corridor: a clock)
    layers: [{ gen: { ref: 'syn/deeper_v2', bind: syn('syn_OnBeat', 'syn_MidHighLevel', 'syn_HighHits', 'syn_BassLevel', 'syn_Intensity', 'syn_BassPresence', 'syn_Level') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.35 }],
  },
  {
    v: 1, id: 'builtin:neon-city', name: 'Neon City by Night', star: false, // dnb · mrange (path tracing) · ⚡ the four Hits: the windows
    // the donor's own switch: lighting_mode 1 (Hits) = the kick, the snare and the hats light their towers (0 = its FFT:
    // on our linear FFT only 2 % of the towers); height_mul 1.5 lifts the hats' towers (the hats read <= .33)
    layers: [{ gen: { ref: 'syn/neon_city', values: { lighting_mode: 1, height_mul: 1.5 }, bind: syn('syn_BassHits', 'syn_MidHighHits', 'syn_HighHits', 'syn_MidHits', 'syn_BassPresence', 'syn_MidPresence', 'syn_MidHighPresence', 'syn_HighPresence', 'syn_Intensity') }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.35 }],
  },
  {
    v: 1, id: 'builtin:skaiwalker-og', name: 'Skaiwalker OG', star: false, // dnb · Psybernautics · ⚡ syn_Hits ← snare (40 ms rise): x2 on the walls' colour
    // the donor's own switch: auto_bubble = the lens bubbles with the sub's presence
    layers: [{ gen: { ref: 'syn/SkaiWalkerOG', values: { auto_bubble: 1 }, bind: { ...syn('syn_Intensity', 'syn_Presence', 'syn_BassPresence', 'syn_MidHighPresence', 'syn_MidHighLevel', 'syn_HighHits', 'syn_HighPresence'), syn_Hits: SOFT_SNARE } }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.5 }],
  },
]

// Camera CP2 (plan_camera S2.3, design D5): you in a TD scene. L0 is a TD scene's layer with its D1 bindings, and the
// fallback: no camera or nobody in frame leaves it playing (decision 6) — every person layer fades with presence and the
// camera draws nothing without a picture. The bass class rides L0's `reese` binds; presence is never in an Auto-style map.
const PRESENCE: Binding = { source: 'presence', amount: 1, attack: 0.3, release: 1.5, min: 0, max: 1 }
const td = (id: string) => OWN.find((d) => d.id === id)!.layers[0]
const OUTLINE: LayerDoc = {
  gen: { ref: 'native/outline', bind: { // the def's bind (scenes/camera.ts), repeated
    width: { source: 'sub', amount: 1, attack: 0.05, release: 0.4, min: 1.5, max: 4 }, // the sub thickens the line
    glow: { source: 'kick', amount: 1, attack: 0, release: 0.2, min: 0, max: 1 }, // ⚡ a kick flares the halo
    hueStep: { source: 'snare', amount: 1, attack: 0, release: 0.15, min: 0, max: 1 }, // a snare steps the hue
  } },
  fx: [{ ref: 'own/bloom', bind: BLOOM }], blend: 'add', opacity: 1, speed: 1, res: 1, bind: { opacity: PRESENCE },
}
// dj-ghost's bloom without level ⚡ ← drop: on the whole bright figure it floods white (S2.3 fix 1). Not a lower max:
// the flash gate fires at .5, so a level under it never rises (post.ts flashGate).
const GHOST_BLOOM: Record<string, Binding> = { threshold: BLOOM.threshold, glow: BLOOM.glow, rampShift: BLOOM.rampShift }
const DJ: readonly SceneDoc[] = [
  {
    v: 1, id: 'builtin:dj-over-tunnel', name: 'DJ over tunnel', star: true, // camera · Auto: reese (twirl; wobble under Dubstep)
    layers: [
      td('builtin:light-tunnel'),
      { gen: { ref: 'native/camera' }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1, mask: 'person', bind: { opacity: PRESENCE } }, // cut none: the mask cuts (D4)
      OUTLINE,
    ],
  },
  {
    v: 1, id: 'builtin:dj-inside', name: 'DJ inside', star: true, // camera · Auto: reese (displace, turbulence; wobble under Dubstep)
    layers: [
      { ...td('builtin:td-feedback'), fx: td('builtin:td-feedback').fx.slice(0, 1), opacity: 0.5 }, // no bloom: the outline's
      { ...td('builtin:swarm'), mask: 'person', bind: { opacity: PRESENCE } }, // the swarm inside your silhouette
      OUTLINE,
    ],
  },
  {
    v: 1, id: 'builtin:dj-ghost', name: 'DJ ghost', star: true, // camera · Auto: reese (edge, spread; wobble under Dubstep)
    layers: [
      { ...td('builtin:edge-rings'), opacity: 0.6 }, // the rings dimmed: the screened ghost reads over them, not white
      { // negative before rgba-delay: the ring writes alpha 1, so a − rgb after it would turn the black outside white
        gen: { ref: 'native/camera', values: { cut: 1 } },
        fx: [{ ref: 'own/negative', bind: { amount: { source: 'snare', amount: 1, attack: 0, release: 0.15, min: 0, max: 1 } } }, td('builtin:rgba-delay').fx[0], { ref: 'own/bloom', bind: GHOST_BLOOM }],
        blend: 'screen', opacity: 1, speed: 1, res: 1, bind: { opacity: PRESENCE },
      },
    ],
  },
]

// GPU3D capability demos (plan_gpu3d § Planner-fixed names): unstarred, so never in the autopilot (I-LIB1); after the
// spread, so the autopilot's order stays as it was.
const DEMOS: readonly SceneDoc[] = [
  { // the sub pushes the kicks' and the drop's ink harder (plan_gpu3d LR-1: force ← sub, 0.4..1.6)
    v: 1, id: 'builtin:demo-fluid', name: 'Demo fluid', star: false,
    layers: [{ gen: { ref: 'native/fluid', bind: { force: { source: 'sub', amount: 1, attack: 0.02, release: 0.25, min: 0.4, max: 1.6 } } }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 }],
  },
  { // builtin:particles' document at N*_shipped: 49 152 points at res .5 (Bench N*, plan_gpu3d S1.5, LR-2: p95 4.66 ms)
    v: 1, id: 'builtin:demo-particles', name: 'Demo particles', star: false,
    layers: [{ gen: { ref: 'native/particles', values: { count: 49152 }, bind: PARTICLES }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 0.5 }],
  },
  { // native/model in chrome at 1 sample (plan_gpu3d S4.7, M-PERF2); the sub drives the clip's speed
    v: 1, id: 'builtin:demo-model', name: 'Demo model', star: false,
    layers: [{ gen: { ref: 'native/model', values: { glass: 0, samples: 1 }, bind: { speed: { source: 'sub', amount: 1, attack: 0.05, release: 0.3, min: 0.5, max: 2 } } }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 }],
  },
]

// The calibration view (user 2026-11-17): what the analyser hears, a tile per source (scenes/calib.ts). No bindings: it
// reads `src` itself, never Auto-style's remap (bind.ts sourcesFor). Starred by the user's order, and last, so the
// autopilot's order before it stays as it was.
const CALIBRATION: SceneDoc = {
  v: 1, id: 'builtin:calibration', name: 'Calibration', star: true,
  layers: [{ gen: { ref: 'native/calib' }, fx: [], blend: 'normal', opacity: 1, speed: 1, res: 1 }],
}

// Design Q4: Tunnel stays first (library.test.ts), both orders kept.
export const BUILTIN: readonly SceneDoc[] = [...spread([...OWN, ...DJ], MILK_SCENES), ...DEMOS, CALIBRATION]
