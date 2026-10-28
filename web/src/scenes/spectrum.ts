// Spectrum: the 32 bands as 64 mirrored bars (bass in the middle) standing on a floor line, eased per bar, with bloom
// and a reflection on a dark glossy floor. Onsets brighten the bars and the floor line, and so does the (c) beat.
import { bindFramebufferInfo, createProgramInfo, setUniforms } from 'twgl.js'
import { BAND_COUNT, easeBars } from '../audio/energy'
import { pulse } from '../audio/sync'
import { createBloom } from '../gl/bloom'
import { fullscreenProgram, renderTarget } from '../gl/engine'
import type { SceneFactory } from '../gl/scene'

/** Look knobs, read every frame (the stage-2 editor binds to these). */
export const params = { glow: 3, reflect: 0.35, hue: 0.55, exposure: 1.4 }
const ATTACK = 0.6 // per 60 Hz frame: the share of the gap a rising bar closes
const RELEASE = 0.1 // per 60 Hz frame for a falling bar: slower, so bars sink smoothly
const DB_LO = -75 // band dB (after the tilt) at height 0; bands are mean linear magnitudes (S1.3)
const DB_HI = -15 // … at full height
const TILT = 1 // dB per band: highs are quieter
const FLASH_TAU = 0.12 // s: onset brightening decay
const FLOOR = 0.3 // the floor line, as a share of the height from the bottom
const BARS = 2 * BAND_COUNT

// No vertex buffers: the quad corner comes from gl_VertexID, the bar from gl_InstanceID.
const BAR_VS = `#version 300 es
uniform float uH[${BAND_COUNT}];
out vec2 vUv;    // across the bar 0..1, up the bar 0..1
out float vBand; // 0 = bass … 1 = highs
out float vH;
void main() {
  int i = gl_InstanceID; // left to right
  int band = i < ${BAND_COUNT} ? ${BAND_COUNT - 1} - i : i - ${BAND_COUNT};
  vUv = vec2(gl_VertexID & 1, gl_VertexID >> 1);
  vBand = float(band) / ${BAND_COUNT - 1}.0;
  vH = uH[band];
  float slot = 1.8 / ${BARS}.0; // the bars span 90% of the width
  float x = -0.9 + (float(i) + 0.15 + 0.7 * vUv.x) * slot;
  gl_Position = vec4(x, ${(2 * FLOOR - 1).toFixed(3)} + vUv.y * max(vH, 0.005) * 1.2, 0.0, 1.0);
}`
const BAR_FS = `#version 300 es
precision highp float;
in vec2 vUv;
in float vBand;
in float vH;
uniform float uTime;
uniform float uFlash; // onset strength / 4 × age decay
uniform float uPulse; // (c) beat envelope × confidence: 1 on the beat
uniform float uHue;
out vec4 outColor;
vec3 palette(float t) { return 0.5 + 0.5 * cos(6.2831853 * (t + vec3(0.0, 0.33, 0.67))); }
void main() {
  vec3 col = palette(uHue + 0.5 * vBand + 0.02 * uTime);
  float lift = 0.25 + 0.75 * vUv.y * vUv.y; // dark at the base, bright at the tip
  outColor = vec4(col * lift * (0.5 + vH) * (1.0 + 1.5 * uFlash + 0.5 * uPulse), 1.0);
}`
// Bars + glow → the engine's target: mirrored below the floor line with a depth fade and a faint ripple, the floor
// line itself, then a soft tone map (the bloom target is half-float).
const COMPOSITE_FS = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uRes;
uniform float uReflect;
uniform float uFlash;
uniform float uPulse;
uniform float uTime;
uniform float uExposure;
out vec4 outColor;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 c = texture(uSrc, uv).rgb;
  float d = ${FLOOR.toFixed(3)} - uv.y; // depth below the floor line
  if (d > 0.0) {
    vec2 m = vec2(uv.x + 0.0015 * sin(uv.y * 150.0 + uTime * 3.0) * min(d * 10.0, 1.0), ${FLOOR.toFixed(3)} + d);
    c += texture(uSrc, m).rgb * uReflect * exp(-d * 7.0);
  }
  float px = abs(d) * uRes.y; // pixels from the floor line
  c += vec3(0.45, 0.65, 1.0) * (0.08 + 0.8 * uFlash + 0.3 * uPulse) * (exp(-px * 0.7) + 0.25 * exp(-px * 0.05));
  outColor = vec4(1.0 - exp(-c * uExposure), 1.0);
}`

export const spectrum: SceneFactory = (gl) => {
  const bars = createProgramInfo(gl, [BAR_VS, BAR_FS])
  const composite = fullscreenProgram(COMPOSITE_FS)
  const bloom = createBloom(gl)
  const target = renderTarget(true)
  const goal = new Float32Array(BAND_COUNT)
  const h = new Float32Array(BAND_COUNT)
  return {
    name: 'spectrum',
    draw(f) {
      for (let i = 0; i < BAND_COUNT; i++) {
        const db = 20 * Math.log10(f.energy.bands[i] + 1e-9) + TILT * i
        goal[i] = Math.min(1, Math.max(0, (db - DB_LO) / (DB_HI - DB_LO)))
      }
      const k = f.dt * 60 // rates are per 60 Hz frame
      easeBars(h, goal, 1 - (1 - ATTACK) ** k, 1 - (1 - RELEASE) ** k)
      const o = f.lastOnset // age clamped at 0 for line-in, as in the tunnel
      const flash = o ? (o.strength / 4) * Math.exp(-Math.max(0, f.audioNow - o.t) / FLASH_TAU) : 0
      const beat = pulse(f.sync)

      const out = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null // the engine's target
      target.fit(f.width, f.height)
      bindFramebufferInfo(gl, target)
      gl.clearColor(0, 0, 0, 1)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.useProgram(bars.program)
      setUniforms(bars, { uH: h, uTime: f.time, uFlash: flash, uPulse: beat, uHue: params.hue })
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, BARS)
      const lit = bloom.apply(target.attachments[0], f.width, f.height, params.glow)
      gl.bindFramebuffer(gl.FRAMEBUFFER, out)
      gl.viewport(0, 0, f.width, f.height)
      composite({
        uSrc: lit, uRes: [f.width, f.height], uReflect: params.reflect, uFlash: flash, uPulse: beat, uTime: f.time,
        uExposure: params.exposure,
      })
    },
  }
}
