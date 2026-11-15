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
