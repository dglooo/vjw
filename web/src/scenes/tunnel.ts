// Tunnel: polar tunnel. Bass swells the radius (energy.att.bass), treble adds sparks (energy.level.treb),
// the 32 bands light the stripes around the wall, onsets flash the walls and the light at the end, and the (c) beat
// pulses the light and surges the flight forward.
import { BAND_COUNT } from '../audio/energy'
import { pulse } from '../audio/sync'
import type { Input } from '../fx/types'
import { fullscreenProgram } from '../gl/engine'
import type { NativeDef } from '../gl/scene'

/** Look knobs, read as uniforms every frame; bindings and the panel drive them through `values`. */
export const inputs: Input[] = [
  { name: 'speed', type: 'float', min: 0, max: 2, default: 0.6 },
  { name: 'twist', type: 'float', min: 0, max: 0.5, default: 0.12 },
  { name: 'glow', type: 'float', min: 0, max: 3, default: 1 },
]
const BAND_RELEASE = 0.85 // per 60 Hz frame: a stripe lights at once and fades ≈1.4 dB/frame (raw bands flicker)
const FLASH_TAU = 0.12 // s: onset flash decay
const SURGE = 2 // knob: flight speed × (1 + SURGE) on the beat

const FS = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uTravel;
uniform float uBass;                  // att.bass, 1 ≈ average
uniform float uTreb;                  // level.treb, 1 ≈ average
uniform float uBands[${BAND_COUNT}];  // mean linear magnitude per band
uniform float uTwist;
uniform float uGlow;
uniform float uFlash;                 // onset strength (1.5–4) × age decay
uniform float uPulse;                 // (c) beat envelope × confidence: 1 on the beat
out vec4 outColor;

const float TAU = 6.2831853;
vec3 palette(float t) { return 0.5 + 0.5 * cos(TAU * (t + vec3(0.0, 0.33, 0.67))); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec2 p = (2.0 * gl_FragCoord.xy - uRes) / uRes.y;
  float r = max(length(p), 1e-3);
  float swell = 0.8 + 0.2 * clamp(uBass, 0.0, 3.0); // walls breathe out on the kick
  float z = swell / r;                              // depth along the tunnel
  vec2 uv = vec2(atan(p.y, p.x + 1e-6) / TAU + uTwist * z, z + uTravel);

  // Stripes: sectors mirrored around the wall, one per band, bass on the floor, highs on the ceiling.
  float m = abs(fract(uv.x - 0.25) * 2.0 - 1.0) * ${BAND_COUNT}.0;
  int band = min(int(m), ${BAND_COUNT - 1});
  float db = 8.685889 * log(uBands[band] + 1e-9) + 1.3 * float(band); // 20·log10 + tilt: highs are quieter
  float lvl = clamp((db + 90.0) / 60.0, 0.0, 1.0);                    // −90…−30 dB → 0…1
  float edge = smoothstep(0.0, 0.1, fract(m)) * (1.0 - smoothstep(0.9, 1.0, fract(m)));
  float rings = 0.55 + 0.45 * cos(uv.y * TAU * 2.0);
  vec3 col = palette(m / 64.0 + uv.y * 0.04 + uTime * 0.02) * lvl * edge * rings;

  // Sparks: sparse wall cells flash, denser as the treble rises above its average.
  vec2 g = uv * vec2(64.0, 4.0);
  float spark = step(hash(floor(g) + floor(uTime * 15.0)), 0.015 * clamp(uTreb - 0.5, 0.0, 4.0));
  col += spark * (1.0 - smoothstep(0.1, 0.5, length(fract(g) - 0.5))) * vec3(1.0, 0.95, 0.9);

  float fl = 0.25 * uFlash;
  col *= (1.0 + 1.5 * fl + 0.5 * uPulse) * smoothstep(0.02, 0.5, r);   // walls light up on a hit and the beat; fog
  col += palette(uTime * 0.05) * uGlow * 0.04 * (1.0 + 6.0 * fl + 3.0 * uPulse) / r; // the end light bursts too
  outColor = vec4(col, 1.0);
}`

export const tunnel: NativeDef = {
  id: 'native/tunnel', name: 'Tunnel', kind: 'generator', category: 'geometry', credit: 'VeeJay Wizard', inputs,
  create() {
    const draw = fullscreenProgram(FS)
    const bands = new Float32Array(BAND_COUNT)
    let travel = 0
    return {
      draw(f, v) {
        const beat = pulse(f.sync)
        travel += f.dt * (v.speed as number) * (1 + SURGE * beat)
        const fall = BAND_RELEASE ** (f.dt * 60)
        for (let i = 0; i < BAND_COUNT; i++) bands[i] = Math.max(f.energy.bands[i], bands[i] * fall)
        // Decay by age, so a 30 fps frame still shows the right envelope. Clamped at 0: a line-in onset's t is ahead of
        // audioNow by about the output latency when it arrives (R9: ≈43 ms on the M4). File onsets arrive audible (T1).
        const o = f.lastOnset
        const flash = o ? o.strength * Math.exp(-Math.max(0, f.audioNow - o.t) / FLASH_TAU) : 0
        draw({
          uRes: [f.width, f.height], uTime: f.time, uTravel: travel, uBass: f.energy.att.bass,
          uTreb: f.energy.level.treb, uBands: bands, uTwist: v.twist, uGlow: v.glow, uFlash: flash, uPulse: beat,
        })
      },
    }
  },
}
