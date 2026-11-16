// Source: donor/visual_system_2/glsl/01_preamble.txt (+ 02_img_helpers.txt, 03_hue_saturation.txt) · unknown (strings recovered from a commercial live-visual app, no licence header; rewritten by analogy)
// Author: the donor app (anonymised in donor/visual_system_2/report.md); _hsv2rgb/_rgb2hsv: sam hocevar
// License: unknown (app resource strings; generic math rewritten by analogy); _hsv2rgb/_rgb2hsv WTFPL
// VeeJay Wizard, 2026: the preamble every fx/syn scene compiles after its uniforms (fx/syn.ts), only the helpers the
// ported scenes call, in GLSL ES 3.00 (float literals, no implicit int → float). `_xy`, `_uv`, `_uvc` are set by main():
// an ES 3.00 global initializer must be constant. No media input yet: `_isMediaActive()` is false, `_loadMedia` black,
// `syn_MediaType` 0. A port that calls another donor helper adds it here.
vec2 _xy, _uv, _uvc; // gl_FragCoord.xy; ÷ RENDERSIZE; centred, y −.5….5 and x on the same unit
const float PI = 3.14159265359;
#define syn_MediaType 0.0
bool _isMediaActive() { return false; }
vec4 _loadMedia() { return vec4(0.0); }
vec4 _loadMedia(vec2 offset) { return vec4(0.0); }
float _nclamp(float x) { return clamp(x, 0.0, 1.0); }
float _pulse(float x, float center, float width) { return smoothstep(center - width, center, x) - smoothstep(center, center + width, x); }
vec2 _rotate(vec2 v, float t) { return mat2(cos(t), -sin(t), sin(t), cos(t)) * v; }
// (radius, angle in turns 0…1, counter-clockwise from +x): the donor's quadrant-by-quadrant form as one atan
vec2 _toPolarTrue(vec2 v) {
  float a = atan(v.y, v.x);
  return vec2(length(v), (a < 0.0 ? a + 2.0 * PI : a) / (2.0 * PI));
}
// License: WTFPL, author: sam hocevar, found: https://stackoverflow.com/a/17897228/418488
vec3 _hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
vec3 _rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
