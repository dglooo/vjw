// Glitch: a pixel-art plasma (mosaic cells sized by the mids, posterised with an ordered dither). A hit tears it apart
// for 0.15 s: blocks jump and swap channels, scanlines tear sideways, RGB splits. Calm between hits.
// Light on a hit only through ⚡ `hit` (flashGate <= 3/s, WCAG 2.3.1; I-FL1): a kick brightens the frame. Before, every
// tear flashed it and darkened its scanlines, and the (c) beat pulse lifted it (builtin:bloom-glitch: frame-mean luma
// steps > .10 up to 8 per 1 s).
import type { Input } from '../fx/types'
import { fullscreenProgram } from '../gl/engine'
import { heatStep } from '../gl/post'
import type { NativeDef } from '../gl/scene'

/** Look knobs, read as uniforms every frame; bindings and the panel drive them through `values`. Sizes are px at a
 * 1000 px tall target. */
export const inputs: Input[] = [
  { name: 'pixel', type: 'float', min: 1, max: 40, default: 10 },
  { name: 'levels', type: 'float', min: 2, max: 16, default: 5 }, // colour levels per channel; below 2 it divides by 0
  { name: 'split', type: 'float', min: 0, max: 60, default: 14 },
  { name: 'hue', type: 'float', min: 0, max: 1, default: 0.62 },
  { name: 'hit', type: 'float', min: 0, max: 1, default: 0 }, // ⚡ the kick's light: the one input that adds light on a hit
]
const HIT = 0.15 // s: a hit glitches this long after its onset, fading out (plan S3.5)

const FS = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uPixel;  // mosaic cell, px
uniform float uLevels; // colour levels per channel
uniform float uBass;   // att.bass clamped 0..3, 1 ≈ average
uniform float uHit;    // 0..1: onset strength × fade (the tear: motion)
uniform float uHot;    // ⚡ input hit, gated by live.ts (flashGate), its rise slewed (heatStep): the light
uniform float uSeed;   // a new glitch pattern every 50 ms of audio time
uniform float uSplit;  // RGB split at a full hit, px
uniform float uHue;
out vec4 outColor;

const float TAU = 6.2831853;
const float BAYER[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
vec3 palette(float t) { return 0.5 + 0.5 * cos(TAU * (t + vec3(0.0, 0.33, 0.67))); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// The base: a slow plasma, bright ridges over black valleys; the bass swells it from the centre.
vec3 plasma(vec2 px) {
  vec2 p = (2.0 * px - uRes) / uRes.y / (1.0 + 0.06 * uBass);
  float t = uTime * 0.35;
  float v = sin(3.0 * p.x + t) + sin(3.7 * p.y - 1.3 * t) + sin(2.1 * (p.x + p.y) + 0.7 * t) + sin(5.0 * length(p) - 2.0 * t);
  float lum = 0.5 + 0.5 * sin(1.5 * v);
  return palette(uHue + 0.1 * v + 0.02 * uTime) * lum * lum;
}

// One mosaic cell around q (grid centred on the screen), posterised with a 4×4 ordered dither in cell units.
vec3 cell(vec2 q) {
  vec2 c = floor((q - 0.5 * uRes) / uPixel);
  vec3 col = clamp(plasma(0.5 * uRes + (c + 0.5) * uPixel), 0.0, 1.0);
  ivec2 i = ivec2(mod(c, 4.0));
  float n = uLevels - 1.0;
  return floor(col * n + (BAYER[4 * i.y + i.x] + 0.5) / 16.0) / n;
}

void main() {
  vec2 q = gl_FragCoord.xy;
  float g = uHit;
  // Scanline tear: thin rows slide sideways.
  float row = floor(q.y / max(2.0, uRes.y / 90.0));
  if (hash(vec2(row, uSeed)) < 0.3 * g) q.x += (hash(vec2(uSeed, row)) - 0.5) * 0.4 * uRes.x * g;
  // Block fragments: a coarse grid with a new size per pattern; some blocks jump and swap channels.
  vec2 size = uRes / mix(vec2(4.0, 6.0), vec2(14.0, 20.0), hash(vec2(uSeed, 0.5)));
  vec2 b = floor(q / size);
  float jump = float(hash(b + uSeed) < 0.4 * g); // strict: the hash hits exactly 0 now and then, so g = 0 stays calm
  q += jump * (vec2(hash(b.yx + uSeed), hash(b + 0.5 * uSeed)) - 0.5) * 1.5 * size;
  // RGB split, then the jumped blocks swap channels; a kick flashes the frame. The tear moves light, it adds or takes
  // none (I-FL1 fa-): its darkened scanlines (−.2 g of the mean) and its flash (+.6 g) stepped the frame-mean luma
  // > .10 on onsets (with the bloom over it up to 8 per 1 s).
  vec2 s = vec2(uSplit * g, 0.0);
  vec3 col = vec3(cell(q + s).r, cell(q).g, cell(q - s).b);
  col = mix(col, col.gbr, jump);
  outColor = vec4(col * (1.0 + 0.6 * uHot), 1.0);
}`

export const glitch: NativeDef = {
  id: 'native/glitch', name: 'Glitch', kind: 'generator', category: 'retro', credit: 'VeeJay Wizard', inputs, flash: ['hit'],
  create() {
    const draw = fullscreenProgram(FS)
    let hot = 0 // the hit as drawn (heatStep)
    return {
      draw(f, v) {
        // Age clamped at 0 for line-in, as in the tunnel. Strength is (1.5, 4] (the detector's threshold and cap), as
        // in the particles: prominent hits glitch fully, weak ones (hats) barely.
        const o = f.lastOnset
        const age = o ? Math.max(0, f.audioNow - o.t) : HIT
        const hit = o && age < HIT ? ((o.strength - 1.5) / 2.5) * (1 - age / HIT) : 0
        const k = f.height / 1000
        hot = heatStep(hot, v.hit as number, f.dt)
        draw({
          uRes: [f.width, f.height], uTime: f.time, uPixel: (v.pixel as number) * k * (0.6 + 0.4 * Math.min(3, f.energy.att.mid)),
          uLevels: v.levels, uBass: Math.min(3, f.energy.att.bass), uHit: hit, uHot: hot,
          uSeed: Math.floor(f.audioNow * 20) % 1000, // wrapped: the sin hash degrades on large inputs
          uSplit: (v.split as number) * k, uHue: v.hue,
        })
      },
    }
  },
}
