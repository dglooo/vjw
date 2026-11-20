// Frame (user 2026-11-20, the 4-layer show composition): a neon frame over the layers below — rect, rounded rect,
// circle, hexagon or n-gon — its line, its glow and an inner fill (alpha 0: none). The shape is one signed distance
// (FRAME_SDF), so it is also a mask: live.ts clips a layer to the inside or the outside of the scene's first
// native/frame layer (LayerDoc.clip), the window a camera cut-out or another scene sits in. The inside ends at the
// line's inner edge, so a clipped layer never covers the line. The clip ignores the frame layer's opacity and mute: at
// opacity 0 the frame is a pure mask.
// `pulse` scales the shape (motion; the clip follows it); light on a hit only through ⚡ `hit` (flashGate ≤ 3/s, WCAG
// 2.3.1; I-FL1): the glow flares, the line's core whitens. Straight alpha under normal (as native/text, N3);
// premultiplied else.
// The rounded box and the regular polygon distances are after Inigo Quilez,
// https://iquilezles.org/articles/distfunctions2d/ (MIT); rewritten. Credits: VeeJay Wizard.
import type { Value } from '../fx/types'
import { fullscreenProgram } from '../gl/engine'
import { heatStep } from '../gl/post'
import type { NativeDef } from '../gl/scene'

/** The shape's signed distance in height units of the target (< 0 inside the line's centre), from `uFrame`
 *  (frameUniforms). Both the frame's draw and live.ts's clip read it. */
export const FRAME_SDF = `uniform vec4 uFrame[3]; // [x, y (of the target, y up), rotation (rad, ccw), scale], [half w, half h | radius, corner, sides], [kind 0 box 1 circle 2 polygon, line half width]
float frameD(vec2 fc, vec2 res) {
  vec4 g = uFrame[0], s = uFrame[1];
  vec2 p = (fc - g.xy * res) / res.y;
  float cs = cos(g.z), sn = sin(g.z);
  p = mat2(cs, -sn, sn, cs) * p / g.w; // into the shape's frame, unscaled
  float d;
  if (uFrame[2].x > 1.5) { // a regular polygon, an edge at the bottom: fold into one sector, then its edge's distance
    float an = 3.14159265 / s.w;
    float b = mod(atan(p.x, 1e-9 - p.y) + an, 2.0 * an) - an; // atan(0, 0) is undefined
    vec2 q = length(p) * vec2(cos(b), abs(sin(b))) - s.x * vec2(cos(an), sin(an));
    q.y += clamp(-q.y, 0.0, s.x * sin(an));
    d = length(q) * sign(q.x);
  } else if (uFrame[2].x > 0.5) d = length(p) - s.x;
  else {
    vec2 q = abs(p) - s.xy + s.z;
    d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - s.z;
  }
  return d * g.w; // the line keeps its width at any scale
}
// The inside of the line's inner edge, antialiased over a px of the target: what an "inside" clip keeps.
float frameIn(vec2 fc, vec2 res) { return clamp(0.5 - (frameD(fc, res) + uFrame[2].y) * res.y, 0.0, 1.0); }`

const SHAPES = ['rect', 'rounded rect', 'circle', 'hexagon', 'n-gon']
const SIDES = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

/** FRAME_SDF's `uFrame` (12 floats) from a node's values, into `out`. Pure. A circle's and a polygon's radius is half
 *  the size; the rest of the shape is the box's. */
export function frameUniforms(v: Readonly<Record<string, Value>>, out: Float32Array) {
  const n = v.shape as number
  const h = (v.size as number) / 2
  const w = n < 2 ? h * (v.aspect as number) : h
  const sides = n === 3 ? 6 : Math.min(12, Math.max(3, Math.round(v.sides as number))) // a stored doc's 0 would divide by 0
  out.set([v.x as number, v.y as number, ((v.rotation as number) * Math.PI) / 180, Math.max(0.01, 1 + (v.pulse as number)), w, h, n === 1 ? (v.round as number) * Math.min(w, h) : 0, sides, n < 2 ? 0 : n === 2 ? 1 : 2, (v.width as number) / 2, 0, 0])
}

const FS = `#version 300 es
precision highp float;
${FRAME_SDF}
uniform vec2 uRes;
uniform vec4 uColor;   // the line and the glow
uniform vec4 uFill;    // the inside; alpha 0: none
uniform float uGlow;
uniform float uHot;    // ⚡ input hit, gated by live.ts (flashGate), its rise slewed (heatStep): the light
uniform float uPremul; // 1: every blend but normal (N3)
out vec4 outColor;
const float REACH = 0.02; // knob: the glow's e-fold distance from the line, of the target's height
void main() {
  float d = frameD(gl_FragCoord.xy, uRes);
  float e = abs(d) - uFrame[2].y; // from the line's edge (< 0 on the line)
  float line = clamp(0.5 - e * uRes.y, 0.0, 1.0) * uColor.a;
  float glow = (1.0 - exp(-2.0 * uGlow * (1.0 + 1.5 * uHot) * exp(-max(e, 0.0) / REACH))) * uColor.a; // a soft knee, no slab
  vec4 c = vec4(uFill.rgb, 1.0) * frameIn(gl_FragCoord.xy, uRes) * uFill.a;
  c = vec4(uColor.rgb, 1.0) * glow + c * (1.0 - glow);
  c = vec4(min(vec3(1.0), mix(uColor.rgb, vec3(1.0), 0.5) * (1.0 + 0.5 * uHot)), 1.0) * line + c * (1.0 - line); // a white-hot core
  outColor = uPremul > 0.5 ? c : vec4(c.rgb / max(c.a, 1e-4), c.a);
}`

export const frame: NativeDef = {
  id: 'native/frame', name: 'Frame', kind: 'generator', credit: 'VeeJay Wizard (distances after Inigo Quilez, MIT)', flash: ['hit'],
  alpha: 'straight', // N3 under normal: live.ts keeps the layer off the direct path (LR-7)
  inputs: [
    { name: 'shape', type: 'long', values: [0, 1, 2, 3, 4], labels: SHAPES, default: 1, bindable: false },
    { name: 'sides', type: 'long', label: 'n-gon sides', values: SIDES, default: 5, bindable: false },
    { name: 'round', type: 'float', label: 'corner radius', min: 0, max: 1, default: 0.3, bindable: false }, // rounded rect: of the half short side
    { name: 'size', type: 'float', min: 0.05, max: 1.2, default: 0.7, bindable: false }, // the height, of the frame's (a circle's and a polygon's circle: the diameter)
    { name: 'aspect', type: 'float', min: 0.2, max: 4, default: 1.4, bindable: false }, // a rect's width / height
    { name: 'x', type: 'float', min: 0, max: 1, default: 0.5 },
    { name: 'y', type: 'float', min: 0, max: 1, default: 0.5 }, // 0 the bottom
    { name: 'rotation', type: 'float', min: -180, max: 180, default: 0 }, // degrees, counter-clockwise
    { name: 'width', type: 'float', label: 'line width', min: 0, max: 0.05, default: 0.006, bindable: false }, // of the frame's height
    { name: 'color', type: 'color', label: 'line + glow', default: [0.2, 0.85, 1, 1] },
    { name: 'glow', type: 'float', min: 0, max: 2, default: 0.8, bindable: false }, // light: a beat lifts it through ⚡ hit only
    { name: 'fill', type: 'color', label: 'fill (alpha 0: none)', default: [0, 0, 0, 0] },
    { name: 'pulse', type: 'float', min: 0, max: 0.3, default: 0 }, // the scale's add: motion
    { name: 'hit', type: 'float', min: 0, max: 1, default: 0 }, // ⚡ the kick's light: the one input that adds light on a hit
  ],
  create() {
    const draw = fullscreenProgram(FS)
    const uFrame = new Float32Array(12)
    let hot = 0
    return {
      draw(f, v, _src, _s, blend) {
        frameUniforms(v, uFrame)
        hot = heatStep(hot, v.hit as number, f.dt)
        draw({ uFrame, uRes: [f.width, f.height], uColor: v.color, uFill: v.fill, uGlow: v.glow, uHot: hot, uPremul: blend && blend !== 'normal' ? 1 : 0 })
      },
    }
  },
}
