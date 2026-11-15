// native/camera (plan_camera S1.3, design D2 + D4): the camera picture as a generator, cover-fitted through cam.xf.
// `cut` keeps the person (rgb·m, alpha m) or the background (1 − m), black outside, for chains ending in add/screen; a
// cut-out over graphics is the layer mask with cut none (S1.6). `limit` is D2's WCAG limiter: rgb × min(1, ref/mean)
// from cam.ref (R the slow EMA, G this frame's mean luma), so a filmed strobe dims and nothing is boosted. No audio
// binding (D4): a zoom or a shake would split the image from its mask. Users (K-3, K-11): an instance holds one
// use(true) from create to dispose; a tile (`size` set) holds none. Hidden (N-1) without a picture: the compositor skips
// the layer (live.ts `ok`), so it adds nothing under any blend. The programs are the engine's cache: nothing to free.
// Look: the camera image, cut by the segmentation mask. Credits: VeeJay Wizard (MediaPipe's in web/THIRD_PARTY.md).
// ponytail: an instance always segments while live, cut none included (S1.6's masks need it anyway); take the user
// only for cut ≠ none if the worker CPU matters.
import { cam } from '../camera/camera'
import * as users from '../camera/users'
import { fullscreenProgram } from '../gl/engine'
import type { NativeDef } from '../gl/scene'

// uv in xf.ts's space (x right, y down: the v flip is the frag coord's); the uploaded row 0 is the frame's top row and
// the mask is in frame space too, so both sample at c (camprobe.ts's drawCutout).
const FS = `#version 300 es
precision highp float;
uniform sampler2D uCam;
uniform sampler2D uMask;
uniform sampler2D uRef;
uniform vec2 uRes;
uniform vec4 uXf;
uniform int uCut; // 0 none, 1 person, 2 background
uniform float uLimit;
uniform float uGain;
out vec4 outColor;
void main() {
  vec2 c = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uRes * uXf.xy + uXf.zw;
  vec2 r = texelFetch(uRef, ivec2(0), 0).rg;
  float dim = mix(1.0, min(1.0, r.r / max(r.g, 1e-4)), uLimit); // dims, never boosts; a black frame stays black
  float m = smoothstep(0.35, 0.65, texture(uMask, c).r); // the global feather f .15 (D2), as live.ts's (S1.6)
  float a = uCut == 0 ? 1.0 : uCut == 1 ? m : 1.0 - m;
  outColor = vec4(texture(uCam, c).rgb * uGain * dim * a, a);
}`

export const camera: NativeDef = {
  id: 'native/camera', name: 'Camera', kind: 'generator', credit: 'VeeJay Wizard', inputs: [
    { name: 'cut', type: 'long', values: [0, 1, 2], labels: ['none', 'person', 'background'], default: 0 }, // none: the layer mask cuts (D4)
    { name: 'limit', type: 'float', min: 0, max: 1, default: 1 }, // the strobe limiter's share (D2)
    { name: 'gain', type: 'float', min: 0, max: 2, default: 1 },
  ],
  create(_gl, size) {
    const out = fullscreenProgram(FS)
    const release = users.use(!size) // a tile takes no camera user (K-11)
    return {
      draw(f, v) {
        out({ uCam: cam.tex, uMask: cam.mask, uRef: cam.ref, uRes: [f.width, f.height], uXf: cam.xf, uCut: v.cut, uLimit: v.limit, uGain: v.gain })
      },
      hidden: () => !cam.live || !cam.video || !cam.w, // cam.w 0: no frame of this source yet
      dispose: release,
    }
  },
}

// native/outline (S2.1, D4): the mask's .5 iso-line at a constant px width, through cam.xf as above; scenes follow it
// with own/bloom. d = |m − .5| / |∇m| is the distance in px to the line; a flat mask (all-zero: Camera off, N-2; or a
// flood) has no gradient and draws nothing. The gradient's length, not fwidth's |dx| + |dy| (√2 thinner at 45°). m is
// a 3×3 tent over the mask texels (4 bilinear taps half a texel out): one tap's .5 contour of the near-binary mask is
// a staircase of its texels (≈ 7 px at 1728 wide).
const OUTLINE_FS = `#version 300 es
precision highp float;
uniform sampler2D uMask;
uniform vec2 uRes;
uniform vec4 uXf;
uniform float uWidth;
uniform float uGlow;
uniform float uHue;
out vec4 outColor;
void main() {
  vec2 c = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uRes * uXf.xy + uXf.zw;
  vec2 t = 0.5 / vec2(textureSize(uMask, 0));
  float m = 0.25 * (texture(uMask, c - t).r + texture(uMask, c + t).r + texture(uMask, c + vec2(t.x, -t.y)).r + texture(uMask, c - vec2(t.x, -t.y)).r);
  float g = length(vec2(dFdx(m), dFdy(m)));
  float d = g > 1e-6 ? abs(m - 0.5) / g : 1e6;
  float line = clamp(0.5 * uWidth + 0.5 - d, 0.0, 1.0); // width px, a 1 px antialiased edge
  float halo = uGlow * exp(-d / (2.0 * uWidth)); // the kick's neon halo
  vec3 hue = clamp(abs(fract(uHue + vec3(0.0, 2.0, 1.0) / 3.0) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
  outColor = vec4(mix(hue, vec3(1.0), 0.5 * line) * line + hue * halo, 1.0); // a white-hot core in a coloured glow
}`

export const outline: NativeDef = {
  id: 'native/outline', name: 'Outline', kind: 'generator', credit: 'VeeJay Wizard', inputs: [
    { name: 'width', type: 'float', min: 1, max: 8, default: 2 }, // px of the target it draws into
    { name: 'glow', type: 'float', min: 0, max: 1, default: 0 },
    { name: 'hueStep', type: 'bool', default: false }, // its rising edge turns the hue by the golden ratio
  ],
  flash: ['glow'],
  bind: { // the CP2 contract
    width: { source: 'sub', amount: 1, attack: 0.05, release: 0.4, min: 1.5, max: 4 },
    glow: { source: 'kick', amount: 1, attack: 0, release: 0.2, min: 0, max: 1 },
    hueStep: { source: 'snare', amount: 1, attack: 0, release: 0.15, min: 0, max: 1 }, // on at y ≥ .5 (bind.ts level); the contract's 1.5 held it on between snares
  },
  create(_gl, size) {
    const out = fullscreenProgram(OUTLINE_FS)
    const release = users.use(!size) // a tile takes no camera user (K-11, N-4)
    let hue = 0.5 // cyan
    let held = false
    return {
      draw(f, v) {
        if (v.hueStep && !held) hue = (hue + 0.618) % 1
        held = !!v.hueStep
        out({ uMask: cam.mask, uRes: [f.width, f.height], uXf: cam.xf, uWidth: v.width, uGlow: v.glow, uHue: hue })
      },
      dispose: release,
    }
  },
}
