// Copied from donor/vs3/visual_kit/src/scenes/morphogen2.js (the friends' engine, used with permission, 2026-11-19).
// vjw: wrapped in a factory (one scene object per layer); buildPanel (the donor console's DOM rows) and logoBox's
// canvas readback stripped, both marked below. agents/guides/guide_vs3_port.md
// Scene: Morphogen 2.0, the reaction-diffusion field as a lit relief,
// built to match Karl Sims' RD Tool and go past it.
//
// How it works (the 2026-11-01 rebuild, measured against the RD Tool
// running in Chrome; HANDOFF has the numbers):
// - The sim runs on a COARSE grid, about 3 CSS pixels per texel at the
//   default scale (1 to 9 across the scale slider), and takes many
//   steps: 1500 a second at speed 0.5, 150 to 15000 across the slider.
//   The smooth, liquid look is in the rendering, not the grid.
// - Only chemical B flows and only B is oriented. Both are done with the
//   B stencil's neighbor weights: flow tilts each opposite pair (more
//   from upstream, less from downstream), orientation trades weight
//   between the pairs along and across a direction. Every weight stays
//   positive and each pair keeps its total, so nothing is created or
//   lost and nothing goes unstable. A stays isotropic and still, so the
//   pattern swims instead of smearing.
// - A second area of the frame can differ from the rest. Its where row (the
//   shared shape lane) places it: nowhere, middle, drifting patches, a
//   ring, the right side, the top. Size spreads the stencil there
//   (texel spacing up to S_MAX), turned a little as it spreads so the
//   spaced taps never split the grid into lattices that drift apart,
//   with the reaction slowed slightly to match. Pattern moves the
//   area's chemistry from the main one (0 is the same). Moving a row
//   grays out the rest and outlines the second area for a moment. Layout and a
//   separate second pattern used to be two controls for this one idea
//   (Alec, 2026-11-07: simplify).
// - Motion is our own pair of morphs, current and grain, each a slider
//   that glides through curated blends of the flow and orientation
//   fields plus a strength (push, grip).
// - Display: a pass at grid resolution packs B (averaged over the last
//   two steps, which kills step-to-step shimmer) and its gradient; the
//   screen pass samples that with a cubic B-spline, lights five
//   sub-pixel samples and averages them, and reads color from a
//   generated map texture whose upper rows are pre-blurred, so a thin
//   band inside one pixel resolves to its average instead of aliasing.
// - Kicks act on the field: every kick drops a bubble of flow that
//   shoves B outward where it lands. Accents push harder and sow a seed.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { PAL, drastic, scenePointer } from '../lib/common.js';
import { ctx } from '../lib/context.js';
export default function create() { // vjw

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// ------------------------------------------------------------ constants
const W_SIDE = 0.18, W_DIAG = 0.07;   // 9-point weights, sum 1
const REACT = 1.65;                    // reaction speed against diffusion
const STEPS_PER_SEC = 1500;            // at speed 0.5, music at rest
const TEXEL_STEP_BUDGET = 16e6;        // per frame at full governor
const MAX_STEPS = 400;
const S_MAX = 4.0;                     // layout's biggest stencil spacing
const TILT = 0.06;                     // stencil turn per unit of spacing above 1 (radians)
const SEED_N = 4;
const IMP_N = 4;

// ------------------------------------------------------- pattern space
// Internal coordinates: x, y in [-1, 1]. Feed rises with y over the
// range Karl Sims' tutorial charts; kill is measured from the line
// k = sqrt(f)/2 - f, where B's uniform state stops existing, so the
// crescent of interesting behavior fills the square instead of a sliver
// of it. The band is wide at low feed and narrows as feed rises.
function mapKF(x, y) {
  const y1 = y * 0.5 + 0.5;
  const f = 0.002 + 0.118 * y1;
  const kb = Math.sqrt(f) * 0.5 - f;
  const lo = -0.0035 - 0.0015 * y1, hi = 0.0115 - 0.0145 * y1;
  return [kb + lo + (hi - lo) * (x * 0.5 + 0.5), f];
}
function kfToXY(k, f) {
  const y1 = (f - 0.002) / 0.118;
  const kb = Math.sqrt(f) * 0.5 - f;
  const lo = -0.0035 - 0.0015 * y1, hi = 0.0115 - 0.0145 * y1;
  return [((k - kb - lo) / (hi - lo)) * 2 - 1, y1 * 2 - 1];
}
// The pattern slider walks these points of the map (each grown from one
// seed and checked by eye): spots that divide, separate worms and dots,
// a lone wandering worm (the RD Tool's example 13), sparse long worms,
// the coral labyrinth, fat limbs, then holes.
const PATH = [
  [0.0649, 0.0367], [0.0655, 0.0520], [0.0616, 0.0788], [0.0628, 0.0700],
  [0.0620, 0.0545], [0.0626, 0.0610], [0.0590, 0.0390],
].map(([k, f]) => kfToXY(k, f));
function pathXY(c) {
  const x = Math.min(1, Math.max(0, c)) * (PATH.length - 1);
  const i = Math.min(PATH.length - 2, Math.floor(x));
  const u = x - i, s = u * u * (3 - 2 * u);
  return [PATH[i][0] + (PATH[i + 1][0] - PATH[i][0]) * s, PATH[i][1] + (PATH[i + 1][1] - PATH[i][1]) * s];
}

// ---------------------------------------------------------- color maps
// Stops over NORMALIZED height: 0 bare ground, 1 the tallest crown.
// The display divides B by its live peak (tracked from the field), the
// way the RD Tool scales B before its color lookup, so every pattern
// spans the whole map: spots and coral reach different B heights. Each
// map keeps the RD Tool's anatomy: ground, a halo where B first rises,
// a thin line, a flank, then the body and the crown. Colors were
// picked off Alec's reference shots and the RD Tool's own maps.
// palette on cream was a toggle under color, greyed out in every mode
// but match palette (Alec, 2026-11-07: "why can cream ground never be
// selected"); as a mode it can always be picked. Appended, so the other
// modes keep their places.
const MODES = ['match palette', 'tide', 'porcelain', 'jade', 'lagoon', 'magma', 'coral', 'palette on cream'];
const FIXED_FROM = 1;                  // every mode from here takes the faithful path
const onPalette = (m) => m === 'match palette' || m === 'palette on cream';
const MAPS = {
  tide: [[0, '#ffffff'], [0.18, '#ffffff'], [0.3, '#b4d8fd'], [0.5, '#2665a5'], [0.6, '#00317d'], [0.75, '#000e62'], [0.9, '#000000'], [1, '#000000']],
  porcelain: [[0, '#f2f2f2'], [0.08, '#e4e6e4'], [0.16, '#45cf8c'], [0.3, '#45cf8c'], [0.34, '#f6f6f6'], [0.4, '#c943a6'], [0.52, '#9d0cf5'], [0.8, '#7a14f0'], [1, '#2a1ee6']],
  jade: [[0, '#f3f1df'], [0.08, '#f6efb6'], [0.16, '#f0d040'], [0.28, '#f0d040'], [0.33, '#1a2040'], [0.4, '#126a46'], [0.6, '#22a05a'], [0.85, '#52c88c'], [1, '#8ee0b0']],
  lagoon: [[0, '#63b9ae'], [0.08, '#4cece8'], [0.26, '#4cece8'], [0.3, '#6f7a7b'], [0.34, '#e1100d'], [0.42, '#f98a06'], [0.52, '#ffff41'], [1, '#ffff6a']],
  magma: [[0, '#000000'], [0.08, '#6a4a22'], [0.12, '#d1ddd9'], [0.16, '#86b0dc'], [0.19, '#233c7c'], [0.22, '#1a0420'], [0.28, '#a02c08'], [0.4, '#fea519'], [0.8, '#f0c81c'], [1, '#a6f08c']],
  coral: [[0, '#041718'], [0.08, '#1d6466'], [0.22, '#1d6466'], [0.26, '#060b0e'], [0.3, '#d8240c'], [0.42, '#f2780f'], [0.65, '#ffb01c'], [1, '#ffe41c']],
};
// Hex as shown on screen. THREE.Color('#hex') converts to linear, and
// this scene's output is displayed as it is (the fixed maps take the
// faithful path), so a parsed hex rendered darker than authored: a
// #f2f2f2 ground came out 227, not 242.
function rawColor(hex) {
  const n = parseInt(hex.slice(1), 16);
  return new THREE.Color().setRGB(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
// match palette's light ground (Alec, 2026-10-24: a cream toggle).
const CREAM = rawColor('#f2ede0');
const CMAP_W = 512, CMAP_H = 16;

function lerpStops(stops, t, out) {
  if (t <= stops[0][0]) return out.copy(stops[0][1]);
  for (let i = 1; i < stops.length; i++) {
    const [p1, c1] = stops[i];
    if (t <= p1) {
      const [p0, c0] = stops[i - 1];
      const u = (t - p0) / Math.max(1e-6, p1 - p0);
      const s = u * u * (3 - 2 * u);
      return out.copy(c0).lerp(c1, s);
    }
  }
  return out.copy(stops[stops.length - 1][1]);
}
function paletteStops(cream) {
  const g = cream ? CREAM.clone() : PAL.bg.clone();
  if (cream) {
    return [[0, g], [0.08, g.clone().lerp(PAL.accent, 0.4)], [0.18, PAL.accent.clone()], [0.26, PAL.shadow.clone()],
      [0.36, PAL.mid.clone()], [0.75, PAL.mid.clone().lerp(PAL.glow, 0.5)], [1, PAL.glow.clone()]];
  }
  return [[0, g], [0.1, g.clone().lerp(PAL.shadow, 0.6)], [0.22, PAL.shadow.clone()], [0.32, PAL.accent.clone()],
    [0.48, PAL.mid.clone()], [0.8, PAL.glow.clone()], [1, PAL.glow.clone()]];
}
const fixedStops = {};
for (const [name, list] of Object.entries(MAPS)) fixedStops[name] = list.map(([p, h]) => [p, rawColor(h)]);

// The color map texture: row 0 is the map, each row above averages it
// over a wider span of B (row j covers B spans of ((j + 0.5) / H)^2), so
// the display picks the row that matches how much B changes inside a
// pixel. Hue, saturation, brightness and contrast are baked in here.
const cmapData = new Uint8Array(CMAP_W * CMAP_H * 4);
const cmapTex = new THREE.DataTexture(cmapData, CMAP_W, CMAP_H, THREE.RGBAFormat);
cmapTex.magFilter = THREE.LinearFilter;
cmapTex.minFilter = THREE.LinearFilter;
cmapTex.wrapS = THREE.MirroredRepeatWrapping;
cmapTex.wrapT = THREE.ClampToEdgeWrapping;
cmapTex.generateMipmaps = false;
const _c = new THREE.Color();
const _hsl = { h: 0, s: 0, l: 0 };
function buildColorMap(stops, adj) {
  const base = new Float32Array(CMAP_W * 3);
  for (let i = 0; i < CMAP_W; i++) {
    let t = i / (CMAP_W - 1);
    if (adj.invert) t = 1 - t;
    lerpStops(stops, t, _c);
    if (adj.hue || adj.sat) {
      _c.getHSL(_hsl);
      _hsl.h = (_hsl.h + adj.hue * 0.5 + 1) % 1;
      _hsl.s = Math.min(1, Math.max(0, _hsl.s * (1 + adj.sat)));
      _c.setHSL(_hsl.h, _hsl.s, _hsl.l);
    }
    let r = _c.r, g = _c.g, b = _c.b;
    const k = 1 + adj.con * 0.9;
    r = (r - 0.5) * k + 0.5 + adj.bright * 0.5;
    g = (g - 0.5) * k + 0.5 + adj.bright * 0.5;
    b = (b - 0.5) * k + 0.5 + adj.bright * 0.5;
    base[i * 3] = r; base[i * 3 + 1] = g; base[i * 3 + 2] = b;
  }
  // prefix sums for the box blurs
  const pre = new Float32Array((CMAP_W + 1) * 3);
  for (let i = 0; i < CMAP_W; i++) for (let c = 0; c < 3; c++) pre[(i + 1) * 3 + c] = pre[i * 3 + c] + base[i * 3 + c];
  for (let j = 0; j < CMAP_H; j++) {
    const span = ((j + 0.5) / CMAP_H) ** 2 * CMAP_W;
    const half = Math.max(0, Math.floor(span * 0.5));
    for (let i = 0; i < CMAP_W; i++) {
      const a = Math.max(0, i - half), b = Math.min(CMAP_W - 1, i + half);
      const n = b - a + 1;
      const o = (j * CMAP_W + i) * 4;
      for (let c = 0; c < 3; c++) {
        const v = (pre[(b + 1) * 3 + c] - pre[a * 3 + c]) / n;
        cmapData[o + c] = Math.max(0, Math.min(255, Math.round(v * 255)));
      }
      cmapData[o + 3] = 255;
    }
  }
  cmapTex.needsUpdate = true;
}

// ---------------------------------------------------------------- passes
const VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`;
function makePass(uniforms, fragment) {
  return new FullScreenQuad(new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: fragment }));
}

// Field map 1, once per frame at grid resolution: B's flow (in weight
// units per pair, |v| < 0.9 so every weight stays positive), the
// stencil spacing, and the second pattern's share.
const NOISE_GLSL = /* glsl */`
  float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x),
               mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y);
  }`;
// The second area's mask, shared by the map pass (which grows it) and
// the display (which outlines it, or the option under the pointer).
// Needs uMapT and NOISE_GLSL in the host shader.
const AREA_GLSL = /* glsl */`
  // Where the area sits, stop by stop: 0 nowhere, 1 the middle,
  // 2 drifting patches, 3 a ring, 4 the right side, 5 the top. Layout
  // glides between neighbors.
  float whereAt(float i, vec2 uv, vec2 p) {
    float r = length((uv - 0.5) * vec2(2.0, 1.6));
    if (i < 0.5) return 0.0;
    if (i < 1.5) return 1.0 - smoothstep(0.25, 0.9, r);
    if (i < 2.5) return smoothstep(0.45, 0.65, vnoise(p * 3.1 + vec2(0.3 * uMapT, 7.0)));
    if (i < 3.5) return 1.0 - smoothstep(0.06, 0.24, abs(r - 0.62));
    if (i < 4.5) return smoothstep(0.35, 0.65, uv.x);
    return smoothstep(0.35, 0.65, uv.y);
  }
  float varyMap(vec2 uv, vec2 p, float where) {
    float u = clamp(where, 0.0, 1.0) * 5.0;
    float i = min(floor(u), 4.0);
    // A union, not a fade: halfway between two stops both regions show
    // at full strength (a fade left each at half, and the area's pattern
    // barely registered; Alec, 2026-11-07).
    float t = u - i;
    return max(whereAt(i, uv, p) * min(1.0, 2.0 - 2.0 * t), whereAt(i + 1.0, uv, p) * min(1.0, 2.0 * t));
  }
`;
// A dropped logo (a transparent PNG, App's logo layer) as the
// pattern's shape: the pattern grows only on the logo. (A cut-out mode,
// the logo as a bare hole, read as a blank screen and then a blur;
// Alec dropped it, 2026-11-08.) Placed exactly like the logo
// layer (its size and turn), which hides while the scene uses it.
// Needs uAspect in the host shader.
const logoU = {
  tLogo: { value: null },
  uLogoAspect: { value: 1 },
  uLogoScale: { value: 0.4 },
  uLogoAngle: { value: 0 },
  uLogoBox: { value: new THREE.Vector4(0, 0, 1, 1) },  // the opaque part's box in the picture (x, y, w, h)
};
const LOGO_GLSL = /* glsl */`
  uniform sampler2D tLogo;
  uniform float uLogoAspect, uLogoScale, uLogoAngle;
  uniform vec4 uLogoBox;
  float logoAt(vec2 uv) {
    vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);
    float c = cos(-uLogoAngle), s = sin(-uLogoAngle);
    p = mat2(c, -s, s, c) * p / uLogoScale;
    p.x /= uLogoAspect;
    vec2 l = p + 0.5;
    if (l.x <= 0.0 || l.x >= 1.0 || l.y <= 0.0 || l.y >= 1.0) return 0.0;
    return smoothstep(0.3, 0.7, texture2D(tLogo, uLogoBox.xy + l * uLogoBox.zw).a);
  }
`;
// The opaque part's box in a logo picture, in texture uv (y up), so
// the padding a logo file carries does not shrink the shape (Alec's
// logo used half its canvas). A picture with no readable pixels (a 3D
// emblem's render) keeps the whole frame.
function logoBox() { // vjw: the 2D-canvas readback of a logo picture stripped (a DOM canvas); no logo reaches
  return new THREE.Vector4(0, 0, 1, 1); // this scene in our host (ctx.logo stays null), so the whole frame is the box
}
const map1U = {
  uAspect: { value: 1 },
  uZoneSize: { value: 1 },
  uMapT: { value: 0 },
  uFlowT: { value: 0 },
  uFlowGain: { value: 1 },
  uFlowA: { value: new THREE.Vector4() },   // radial, rotate, swirl, bubble
  uFlowB: { value: new THREE.Vector4() },   // ring, vortex, vertical, drift
  uWhere: { value: 0 },
  uLogoFill: { value: 0 },               // 1 while the pattern fills a logo
  uImp: { value: Array.from({ length: IMP_N }, () => new THREE.Vector4(0.5, 0.5, 0.1, 0)) },
};
const map1Pass = makePass(map1U, /* glsl */`
  #define N ${IMP_N}
  uniform float uAspect, uZoneSize, uMapT, uFlowT, uFlowGain, uWhere, uLogoFill;
  uniform vec4 uFlowA, uFlowB;
  uniform vec4 uImp[N];
  varying vec2 vUv;
  ${NOISE_GLSL}
  ${AREA_GLSL}
  vec2 rot90(vec2 v) { return vec2(-v.y, v.x); }
  float psi(vec2 p) {
    return sin(p.x * 3.1 + uFlowT) * sin(p.y * 2.7 - uFlowT * 0.8)
         + 0.5 * sin((p.x + p.y) * 5.3 + uFlowT * 1.3);
  }
  void main() {
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
    float r = length(p);
    vec2 dir = p / max(r, 1e-4);
    vec2 v = vec2(0.0);
    // radial: speed grows with distance, so the outflow is even across
    // the frame (a unit-speed field drains the middle, divergence 1/r)
    v += uFlowA.x * p * 2.2;
    v += uFlowA.y * rot90(p) * 2.2;                                     // rotate
    const float e = 0.01;
    v += uFlowA.z * vec2(psi(p + vec2(0.0, e)) - psi(p - vec2(0.0, e)),
                         psi(p - vec2(e, 0.0)) - psi(p + vec2(e, 0.0))) / (2.0 * e) * 0.35; // swirl
    vec2 cell = fract(p * 3.0 + 0.5) - 0.5;
    v += uFlowA.w * cell / max(length(cell), 0.05) * smoothstep(0.0, 0.12, length(cell));   // bubble
    v += uFlowB.x * dir * clamp((0.3 - r) * 6.0, -1.0, 1.0);           // ring
    v += uFlowB.y * rot90(dir) * exp(-r * r / 0.05);                    // vortex
    v += uFlowB.z * vec2(0.0, 1.0);                                     // vertical
    v += uFlowB.w * vec2(psi(p + vec2(0.0, e)) - psi(p - vec2(0.0, e)),
                         psi(p - vec2(e, 0.0)) - psi(p + vec2(e, 0.0))) / (2.0 * e) * 0.12; // music drift
    v *= uFlowGain;
    // Kick impulses keep their own strength: a hit should shove the
    // pattern visibly even when the steady flow is off.
    for (int i = 0; i < N; i++) {
      vec4 im = uImp[i];
      if (im.w <= 0.0) continue;
      vec2 d = p - (im.xy - 0.5) * vec2(uAspect, 1.0);
      vec2 dn = d / im.z;
      v += dn * exp(-dot(dn, dn)) * im.w;
    }
    // A filled logo is the area: the second area's bigger shapes would
    // not fit its strokes and broke a thin logo into blobs (Alec,
    // 2026-11-08, with where on its default, the middle).
    float zone = varyMap(vUv, p, uWhere) * (1.0 - uLogoFill);
    float s = 1.0 + zone * uZoneSize * (${S_MAX.toFixed(1)} - 1.0);
    v /= s;
    float vl = length(v);
    if (vl > 0.9) v *= 0.9 / vl;
    gl_FragColor = vec4(v, s, zone);
  }`);

// Field map 2: B's orientation as a doubled-angle vector (x trades
// weight between the x and y pairs, y between the two diagonals),
// and the spread mask's kill add.
const map2U = {
  uAspect: { value: 1 },
  uMapT: { value: 0 },
  uOrA: { value: new THREE.Vector4() },   // radial, circles, swirl, bubble
  uOrB: { value: 0 },                     // linear
  uMaskR: { value: 9 },
  uLogo: { value: 0 },                    // 1 while the pattern grows in a logo
  ...logoU,
};
const map2Pass = makePass(map2U, /* glsl */`
  uniform float uAspect, uMapT, uOrB, uMaskR, uLogo;
  uniform vec4 uOrA;
  varying vec2 vUv;
  ${LOGO_GLSL}
  vec2 dbl(float a) { return vec2(cos(2.0 * a), sin(2.0 * a)); }
  void main() {
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
    float r = length(p);
    float a = atan(p.y, p.x);
    float near = smoothstep(0.0, 0.06, r);
    vec2 o = vec2(0.0);
    o += uOrA.x * dbl(a) * near;                       // radial
    o += uOrA.y * dbl(a + 1.5707963) * near;           // circles
    o += uOrA.z * dbl(a + 0.7853982) * near;           // swirl
    vec2 cell = fract(p * 3.0 + 0.5) - 0.5;
    o += uOrA.w * dbl(atan(cell.y, cell.x)) * smoothstep(0.0, 0.08, length(cell)); // bubble
    o += uOrB * vec2(-1.0, 0.0);                       // linear: + vertical, - horizontal
    float ol = length(o);
    if (ol > 0.95) o *= 0.95 / ol;
    float rm = length((vUv - 0.5) * 2.0);
    float kAdd = 0.03 * smoothstep(uMaskR * 0.88, uMaskR * 1.12, rm);
    // The logo replaces the spread disc.
    if (uLogo > 0.5) kAdd = 0.05 * (1.0 - logoAt(vUv));
    // A diffusion tensor D0 + a (n n^T - I/2): the x/y pairs carry its
    // cos 2θ part and the diagonals its sin 2θ part at HALF the weight
    // (a diagonal pair moves D_xy twice as hard as a side pair moves
    // D_xx - D_yy). Unbalanced, circles came out rounded squares. The
    // diagonal weight caps the amplitude, so every weight stays positive.
    const float AMP = ${(2 * W_DIAG).toFixed(3)};
    gl_FragColor = vec4(o.x * AMP, o.y * AMP * 0.5, kAdd, 0.0);
  }`);

// One Gray-Scott step.
const simU = {
  tField: { value: null },
  tMap1: { value: null },
  tMap2: { value: null },
  uTexel: { value: new THREE.Vector2() },
  uKF: { value: new THREE.Vector4(0.062, 0.0545, 0.062, 0.0545) },
};
const simPass = makePass(simU, /* glsl */`
  uniform sampler2D tField, tMap1, tMap2;
  uniform vec2 uTexel;
  uniform vec4 uKF;
  varying vec2 vUv;
  const float WS = ${W_SIDE.toFixed(3)}, WD = ${W_DIAG.toFixed(3)};
  void main() {
    vec4 m1 = texture2D(tMap1, vUv);
    vec4 m2 = texture2D(tMap2, vUv);
    float s = max(m1.z, 1.0);
    float ang = ${TILT.toFixed(3)} * (s - 1.0);
    vec2 ex = vec2(cos(ang), sin(ang)) * s * uTexel;
    vec2 ey = vec2(-sin(ang), cos(ang)) * s * uTexel;
    vec2 e1 = (ex + ey) * 0.94, e2 = (ey - ex) * 0.94;
    vec2 c = texture2D(tField, vUv).rg;
    vec2 px = texture2D(tField, vUv + ex).rg, mx = texture2D(tField, vUv - ex).rg;
    vec2 py = texture2D(tField, vUv + ey).rg, my = texture2D(tField, vUv - ey).rg;
    vec2 p1 = texture2D(tField, vUv + e1).rg, m1n = texture2D(tField, vUv - e1).rg;
    vec2 p2 = texture2D(tField, vUv + e2).rg, m2n = texture2D(tField, vUv - e2).rg;
    float lapA = WS * (px.r + mx.r + py.r + my.r) + WD * (p1.r + m1n.r + p2.r + m2n.r) - c.r;
    // B: oriented pair weights, tilted by the flow (more from upstream).
    float wx = WS + m2.x, wy = WS - m2.x, w1 = WD + m2.y, w2 = WD - m2.y;
    vec2 v = m1.xy;
    float cx = v.x, cy = v.y, c1 = (v.x + v.y) * 0.7071, c2 = (v.y - v.x) * 0.7071;
    float lapB = wx * ((1.0 - cx) * px.g + (1.0 + cx) * mx.g)
               + wy * ((1.0 - cy) * py.g + (1.0 + cy) * my.g)
               + w1 * ((1.0 - c1) * p1.g + (1.0 + c1) * m1n.g)
               + w2 * ((1.0 - c2) * p2.g + (1.0 + c2) * m2n.g) - c.g;
    float rs = 1.0 - 0.05 * (s - 1.0);
    float R = ${REACT.toFixed(2)} * rs * rs;
    float k = mix(uKF.x, uKF.z, m1.w) + m2.z;
    float f = mix(uKF.y, uKF.w, m1.w);
    float abb = c.r * c.g * c.g;
    float A = c.r + lapA + R * (-abb + f * (1.0 - c.r));
    float B = c.g + 0.5 * lapB + R * (abb - (k + f) * c.g);
    A = clamp(A, 0.0, 1.0);
    B = clamp(B, 0.0, 1.0);
    if (!(A == A) || !(B == B)) { A = 1.0; B = 0.0; }
    gl_FragColor = vec4(A, B, 0.0, 1.0);
  }`);

// Pack for the display: B averaged over the last two steps and its
// gradient (central differences, scaled by the local spacing so a big
// lobe lights like a small one).
const packU = {
  tA: { value: null }, tB: { value: null }, tMap1: { value: null },
  uTexel: { value: new THREE.Vector2() },
  uTexScale: { value: 1 },
};
// Edge sharpness follows on-screen size. A big shape, from a coarse
// scale or the second area's size (stencil spacing s), scales its whole
// profile, so its edge ramp spans more pixels and it read blurry beside
// small shapes (Alec, 2026-11-07: "all big shapes" should look as sharp).
// The pack pass works out how many times larger than the default (3 CSS
// pixels a texel, spacing 1) the pattern is drawn here and stores a
// sharpen amount in x (A was unused there); the display steepens the
// interpolated B by it, so the edge can be sharper than a texel.
const packPass = makePass(packU, /* glsl */`
  uniform sampler2D tA, tB, tMap1;
  uniform vec2 uTexel;
  uniform float uTexScale;
  varying vec2 vUv;
  float b(vec2 uv) { return 0.5 * (texture2D(tA, uv).g + texture2D(tB, uv).g); }
  void main() {
    float s = max(texture2D(tMap1, vUv).z, 1.0);
    float k = 0.85 * clamp((s * uTexScale - 1.0) / 2.0, 0.0, 1.0);
    float gx = b(vUv - vec2(uTexel.x, 0.0)) - b(vUv + vec2(uTexel.x, 0.0));
    float gy = b(vUv - vec2(0.0, uTexel.y)) - b(vUv + vec2(0.0, uTexel.y));
    gl_FragColor = vec4(k, b(vUv), gx * s, gy * s);
  }`);

// Seed stamp: adds B (and eats A) in up to four gaussian pips; a
// negative amount clears B instead (the clear button).
const stampU = {
  tField: { value: null },
  uAspect: { value: 1 },
  uPips: { value: Array.from({ length: SEED_N }, () => new THREE.Vector4(0, 0, 0, 0)) },
  uLogoSeed: { value: 0 },
  ...logoU,
};
const stampPass = makePass(stampU, /* glsl */`
  #define N ${SEED_N}
  uniform sampler2D tField;
  uniform float uAspect, uLogoSeed;
  uniform vec4 uPips[N];
  varying vec2 vUv;
  ${LOGO_GLSL}
  void main() {
    vec2 c = texture2D(tField, vUv).rg;
    // Sow the logo: a sparse sprinkle of dots over its opaque part. A
    // dense one (a third of a fine grid) used up the A and starved the
    // inside, so only the edges grew.
    if (uLogoSeed > 0.0) {
      vec2 gp = vUv * vec2(uAspect, 1.0) * 26.0;
      vec2 q = floor(gp);
      float h = fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453);
      float dot1 = 1.0 - smoothstep(0.2, 0.3, length(fract(gp) - 0.5));
      float g = step(0.75, h) * dot1 * logoAt(vUv) * uLogoSeed;
      c.g = min(1.0, c.g + g);
      c.r = max(0.0, c.r - g * 0.5);
    }
    for (int i = 0; i < N; i++) {
      vec4 p = uPips[i];
      if (p.w <= 0.0) continue;
      vec2 d = (vUv - p.xy) * vec2(uAspect, 1.0);
      float g = exp(-dot(d, d) / (p.z * p.z)) * p.w;
      c.g = min(1.0, c.g + g);
      c.r = max(0.0, c.r - g * 0.5);
    }
    gl_FragColor = vec4(c, 0.0, 1.0);
  }`);
const resetPass = makePass({}, /* glsl */`
  void main() { gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); }`);
const copyU = { tSrc: { value: null } };
const copyPass = makePass(copyU, /* glsl */`
  uniform sampler2D tSrc;
  varying vec2 vUv;
  void main() { gl_FragColor = texture2D(tSrc, vUv); }`);

// ------------------------------------------------------------- display
const displayU = {
  tPack: { value: null },
  tCmap: { value: cmapTex },
  uSize: { value: new THREE.Vector2(1, 1) },
  uAAd: { value: new THREE.Vector2(0.1, 0.1) },
  uGain: { value: 1 },
  uEmboss: { value: 1 },
  uFreq: { value: 1 },
  uPhase: { value: 0 },
  uBScale: { value: 2.2 },
  uLight: { value: new THREE.Vector3(0, 0.7071, 0.7071) },
  uSpec: { value: 0.6 },
  uShowArea: { value: 0 },
  uAreaWhere: { value: 0 },
  uAspect: { value: 1 },
  uMapT: { value: 0 },
};
const quad = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.ShaderMaterial({
    uniforms: displayU,
    depthWrite: false,
    depthTest: false,
    vertexShader: VERT,
    fragmentShader: /* glsl */`
      uniform sampler2D tPack, tCmap;
      uniform vec2 uSize, uAAd;
      uniform float uGain, uEmboss, uFreq, uPhase, uSpec, uBScale, uShowArea, uAreaWhere, uAspect, uMapT;
      ${NOISE_GLSL}
      ${AREA_GLSL}
      uniform vec3 uLight;
      varying vec2 vUv;
      // Cubic B-spline in four bilinear fetches (texel coordinates in,
      // packed A, B, gradient out).
      vec4 bspline(vec2 st) {
        st -= 0.5;
        vec2 i = floor(st), f = st - i;
        vec2 f2 = f * f, f3 = f2 * f;
        vec2 w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0;
        vec2 w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
        vec2 w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0;
        vec2 w3 = f3 / 6.0;
        vec2 g0 = w0 + w1, g1 = w2 + w3;
        vec2 h0 = (i - 0.5 + w1 / g0) / uSize;
        vec2 h1 = (i + 1.5 + w3 / g1) / uSize;
        return g0.y * (g0.x * texture2D(tPack, h0) + g1.x * texture2D(tPack, vec2(h1.x, h0.y)))
             + g1.y * (g0.x * texture2D(tPack, vec2(h0.x, h1.y)) + g1.x * texture2D(tPack, h1));
      }
      // Steepen B around the rim level (0.3 of the live peak, where every
      // map draws its line) with a two-sided power of gain G: the level
      // stays put, so shapes keep their size, and the bands on either
      // side narrow. G = 1 is the identity.
      float sharp(float b, float G) {
        if (G <= 1.001) return b;
        float pk = 1.0 / uBScale, t = b / pk, u = clamp(t, 0.0, 1.0);
        const float C = 0.3;
        // The rim side takes the full gain; the crown side a third of it,
        // so the body keeps its rounded shading and color.
        float Gu = 1.0 + (G - 1.0) * 0.3;
        float f = u < C ? C * pow(u / C, G) : 1.0 - (1.0 - C) * pow((1.0 - u) / (1.0 - C), Gu);
        return (f + max(t - 1.0, 0.0)) * pk;
      }
      vec3 light(vec3 col, vec2 g) {
        vec3 n = normalize(vec3(g * uGain, 0.2));
        float dif = max(0.0, dot(n, uLight));
        float rz = max(0.0, 2.0 * dif * n.z - uLight.z);
        return col * (0.6 * dif + 0.5) + uSpec * pow(rz, 10.0);
      }
      void main() {
        vec2 st = vUv * uSize;
        // The center is a cubic B-spline (smooth normals); the four AA
        // corners are plain bilinear reads, enough to measure how far B
        // spreads inside the pixel, which picks the blurred map row.
        vec4 s0 = bspline(st);
        vec4 s1 = texture2D(tPack, (st + uAAd) / uSize), s2 = texture2D(tPack, (st - uAAd) / uSize);
        vec4 s3 = texture2D(tPack, (st + vec2(uAAd.x, -uAAd.y)) / uSize);
        vec4 s4 = texture2D(tPack, (st - vec2(uAAd.x, -uAAd.y)) / uSize);
        // Color reads B steepened by the full gain, so rims and bands stay
        // thin on big shapes; light takes a gentler gain, so crowns keep
        // their round gloss instead of flattening into mesas.
        float G = 1.0 + 2.0 * s0.x, Gl = 1.0 + s0.x;
        float b0 = sharp(s0.y, G);
        float b1 = sharp(s1.y, G), b2 = sharp(s2.y, G), b3 = sharp(s3.y, G), b4 = sharp(s4.y, G);
        float bmin = min(min(min(min(b0, b1), b2), b3), b4);
        float bmax = max(max(max(max(b0, b1), b2), b3), b4);
        // The slope steepens with B: chain rule on the packed gradient.
        float slope = Gl > 1.001 ? (sharp(s0.y + 0.004, Gl) - sharp(max(s0.y - 0.004, 0.0), Gl)) / (s0.y + 0.004 - max(s0.y - 0.004, 0.0)) : 1.0;
        float x = (bmin + bmax) * 0.5 * uBScale * uFreq + uPhase;
        float y = sqrt(max(bmax - bmin, 0.0) * uBScale * uFreq) + 0.5 / ${CMAP_H.toFixed(1)};
        vec3 col = texture2D(tCmap, vec2(x, y)).rgb;
        // Light from the spline sample only: bilinear corners would print
        // their facets into the highlights.
        vec3 lit = light(col, s0.zw * slope);
        vec3 outc = clamp(mix(col, lit, uEmboss), 0.0, 1.0);
        // While a second area row moves (or an option is under the
        // pointer, showing that option), the rest of the frame goes gray
        // and dark and a white line with a dark halo traces the edge, so
        // the slider shows where it acts on any map. Dimming alone did
        // nothing on a dark ground (Alec, 2026-11-07).
        if (uShowArea > 0.0) {
          float w = varyMap(vUv, (vUv - 0.5) * vec2(uAspect, 1.0), uAreaWhere);
          float out1 = 1.0 - smoothstep(0.35, 0.65, w);
          vec3 gray = vec3(dot(outc, vec3(0.299, 0.587, 0.114)));
          outc = mix(outc, gray * 0.28, 0.9 * uShowArea * out1);
          float px = abs(w - 0.5) / max(length(vec2(dFdx(w), dFdy(w))), 1e-4);
          float halo = 1.0 - smoothstep(3.0, 5.0, px), core = 1.0 - smoothstep(1.2, 2.2, px);
          outc = mix(outc, vec3(0.0), 0.7 * halo * uShowArea);
          outc = mix(outc, vec3(1.0), core * uShowArea);
        }
        gl_FragColor = vec4(outc, 1.0);
      }`,
  })
);
scene.add(quad);

// ------------------------------------------------------------- targets
let fieldA = null, fieldB = null, map1T = null, map2T = null, packT = null;
let probeT = null, debugT = null;
let simW = 0, simH = 0, aspect = 1, cssPerTexel = 6;
let needSeed = true;
let floatOk = false;
let lastRebuild = -1;

function renderTarget(w, h, type, format = THREE.RGBAFormat) {
  return new THREE.WebGLRenderTarget(w, h, {
    type, format,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
    depthBuffer: false,
  });
}
function makeField(renderer, w, h) {
  floatOk = !!(renderer.capabilities.isWebGL2
    && renderer.extensions.get('EXT_color_buffer_float')
    && renderer.extensions.get('OES_texture_float_linear'));
  return renderTarget(w, h, floatOk ? THREE.FloatType : THREE.HalfFloatType, THREE.RGFormat);
}
function run(pass, target) {
  ctx.renderer.setRenderTarget(target);
  pass.render(ctx.renderer);
}

// Scale sets the grid: CSS pixels per texel, 1 to 9 (3 at the middle,
// the RD Tool's default on a 2x display, where its canvas runs at
// device pixels and its default grid is 6 of them a cell). A change rebuilds the grid at most every
// 0.12 s and copies the field across, so the pattern zooms and then
// re-forms at its new size.
function ensureSim(renderer, fill, t) {
  const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
  const pr = renderer.getPixelRatio() || 1;
  aspect = buf.x > 0 && buf.y > 0 ? buf.x / buf.y : 16 / 9;
  const cssW = Math.max(160, buf.x / pr), cssH = Math.max(90, buf.y / pr);
  const px = 3 * Math.pow(3, (fill - 0.5) * 2);
  let cols = Math.max(48, Math.min(1400, Math.round(cssW / px)));
  // A grid moves at most 1.25x per rebuild, so a fast swipe zooms in
  // steps. One big jump either missed the thin worms of a fine grid or,
  // taking the strongest cell, smeared a dense pattern solid; both left
  // the field black (Alec, 2026-11-07: scale "just goes blank").
  if (fieldA) cols = Math.round(clamp(cols, simW / 1.25, simW * 1.25));
  const rows = Math.max(27, Math.round(cols * cssH / cssW));
  if (fieldA && Math.abs(cols - simW) <= Math.max(2, simW * 0.04) && Math.abs(rows - simH) <= Math.max(2, simH * 0.04)) return;
  if (fieldA && t - lastRebuild < 0.06) return;
  lastRebuild = t;
  cssPerTexel = cssW / cols;
  const oldA = fieldA, oldB = fieldB;
  simW = cols; simH = rows;
  fieldA = makeField(renderer, simW, simH);
  fieldB = makeField(renderer, simW, simH);
  for (const tgt of [map1T, map2T, packT, debugT]) if (tgt) tgt.dispose();
  map1T = renderTarget(simW, simH, THREE.HalfFloatType);
  map2T = renderTarget(simW, simH, THREE.HalfFloatType);
  packT = renderTarget(simW, simH, THREE.HalfFloatType);
  debugT = null;
  if (oldA) {
    copyU.tSrc.value = oldA.texture;
    run(copyPass, fieldA);
    copyU.tSrc.value = oldB.texture;
    run(copyPass, fieldB);
    oldA.dispose();
    oldB.dispose();
    // Re-form at the new size quickly, even at slow speeds; a small step
    // gets a small burst, or a slow drag lurches at every rebuild.
    burstLeft = Math.max(burstLeft, Math.round(clamp(Math.abs(Math.log(oldA.width / simW)) * 80, 2, 20)));
  } else {
    needSeed = true;
  }
}

const mix = (a, b, x) => a + (b - a) * x;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function maskRadius(spread, energy) {
  return spread >= 0.98 ? 9 : mix(0.22, 1.5, spread) * (0.92 + 0.14 * energy);
}

// ------------------------------------------------------------- state
let energyE = 0.4, energySlow = 0.4, subE = 0, highsE = 0;
let flowT = 0, mapT = 0, lightA = 0, impAngle = 0;
let stepAcc = 0, stepsLast = 0, burstLeft = 0, stepScale = 1;
let govern = 0.5;                    // share of the texel budget this GPU holds
let dtE = 1 / 60;
let lastAccent = -10, lastSeed = -10;
let probeAt = -10, probeMeanB = 0.1, deadProbes = 0;
let bPeak = 0.45, bPeakE = 0.45;
let painted = 0;
let areaFlashAt = -1e9;                // wall clock of the last second area row move
let areaHover = null;                  // where-value of the option under the pointer
let lastRegrow = 0, lastClear = 0;
let logoLive = 0, lastLogoKey = '', logoSeed = false, logoTexId = ''; // logo mode in use, what it was last frame, a sowing due
let cmapKey = '', cmapAge = 0;
let kfLive = [0.062, 0.0545, 0.062, 0.0545];
const pips = [];
const imps = Array.from({ length: IMP_N }, () => ({ x: 0.5, y: 0.5, r: 0.1, amt: 0, decay: 3 }));
let impNext = 0;

function scatter(n, amt, spread) {
  const full = spread >= 0.98;
  const rr = Math.min(0.5, maskRadius(spread, 0.5) * 0.5 * 0.85);
  for (let i = 0; i < n; i++) {
    let x, y;
    if (full) { x = 0.04 + 0.92 * Math.random(); y = 0.04 + 0.92 * Math.random(); }
    else {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * rr;
      x = clamp(0.5 + Math.cos(a) * d, 0.04, 0.96);
      y = clamp(0.5 + Math.sin(a) * d, 0.04, 0.96);
    }
    pips.push({ x, y, r: 0.02, amt });
  }
}
// A regrow: one seed at the center plus a sprinkle, then a short burst
// of extra steps so a loaded look fills in seconds.
function regrow(P) {
  pips.length = 0;
  pips.push({ x: 0.5, y: 0.5, r: 0.03, amt: 0.9 });
  scatter(Math.round(4 + 14 * P.density), 0.8, P.density);
  if (logoLive === 1) logoSeed = true;
  burstLeft = 90;
}
function applyStamps() {
  if (!pips.length && !logoSeed) return;
  const batch = pips.splice(0, SEED_N);
  for (let i = 0; i < SEED_N; i++) {
    const u = stampU.uPips.value[i];
    const p = batch[i];
    if (p) u.set(p.x, p.y, p.r, p.amt);
    else u.set(0, 0, 0, 0);
  }
  stampU.tField.value = fieldA.texture;
  stampU.uAspect.value = aspect;
  stampU.uLogoSeed.value = logoSeed ? 0.85 : 0;
  logoSeed = false;
  run(stampPass, fieldB);
  [fieldA, fieldB] = [fieldB, fieldA];
}
function probe(t) {
  if (t - probeAt < 1.5) return;
  probeAt = t;
  if (!probeT) probeT = renderTarget(32, 18, THREE.FloatType);
  copyU.tSrc.value = fieldA.texture;
  run(copyPass, probeT);
  const px = new Float32Array(32 * 18 * 4);
  ctx.renderer.readRenderTargetPixels(probeT, 0, 0, 32, 18, px);
  let sum = 0, peak = 0;
  for (let i = 1; i < px.length; i += 4) { sum += px[i]; if (px[i] > peak) peak = px[i]; }
  probeMeanB = sum / (32 * 18);
  // The color map spans 0 to this peak (a coarse sample reads crowns a
  // little low, hence the 0.92).
  if (peak > 0.12) bPeak = peak / 0.92;
  deadProbes = probeMeanB < 0.003 ? deadProbes + 1 : 0;
}

// Motion is two morphing pairs of our own. current picks the shape of
// the stream and push sets how hard (negative runs it backwards);
// grain picks which way the forms line up and grip how firmly. Each
// stop is a blend of the engine's flow and orientation fields.
//                       radial rotate swirl bubble ring vortex vertical
const CURRENTS = [['eddies', [0, 0, 1, 0, 0, 0, 0]],
  ['whirlpool', [-0.3, 0.45, 0, 0, 0, 0.8, 0]],
  ['bloom', [0.4, 0, 0.3, 0, 0, 0, 0]],
  ['cells', [0, 0, 0.3, 0.45, 0, 0, 0]],
  ['rain', [0, 0, 0.35, 0, 0, 0, -0.8]]];
//                     radial circles swirl bubble linear
const GRAINS = [['rings', [0, 1, 0, 0, 0]],
  ['spiral', [0, 0, 1, 0, 0]],
  ['rays', [1, 0, 0, 0, 0]],
  ['cells', [0, 0, 0, 1, 0]],
  ['lines', [0, 0, 0, 0, 1]]];
const AREA_AT = ['off', 'middle', 'patches', 'ring', 'right', 'top'];
const LOGO_AT = ['off', 'on'];
const morphStops = (stops, x) => {
  const n = stops.length - 1, u = clamp(x, 0, 1) * n;
  const i = Math.min(n - 1, Math.floor(u)), f = u - i;
  return stops[i][1].map((v, j) => v + (stops[i + 1][1][j] - v) * f);
};
const stopName = (names, x) => names[Math.round(clamp(x, 0, 1) * (names.length - 1))];

const PARAMS = {
  mode: 'match palette', speed: 0.5, shape: 0.2, complexity: 0.6, density: 1, fill: 0.5, contrast: 0.75,
  body: 0, zoneSize: 1, zonePattern: 0,
  current: 0, push: 0, grain: 0, grip: 0,
  hue: 0, sat: 0, bands: 0, invert: false, cream: false,
  logo: 0,
  regrowN: 0, clearN: 0,
};
const EXTRA_KEYS = Object.keys(PARAMS).filter((k) => !['mode', 'speed', 'shape', 'complexity', 'density', 'fill', 'contrast'].includes(k));

return { // vjw: was `export default {`
  name: 'morphogen 2.0',
  scene,
  camera,
  bloom: { strength: 0.12, gain: 0.05, kick: 0.04 },
  grain: 0,
  pixelBudget: 3.7,
  modes: MODES,
  params: { ...PARAMS },
  extraKeys: EXTRA_KEYS,
  paramLabels: { '*': { shape: 'second area', complexity: 'pattern', fill: 'scale', density: 'spread', contrast: 'relief' } },
  paramHints: {
    speed: 'how fast the chemistry runs: 150 to 15000 steps a second',
    complexity: 'which shapes grow: spots, worms, a lone worm, coral, fat limbs, holes',
    shape: 'where the second area sits: nowhere, the middle, drifting patches, a ring, the right side, the top',
    fill: 'the size of every shape (the grid: 1 to 9 pixels a cell)',
    density: 'how much of the frame the pattern may fill: a disc in the middle, or everything',
    contrast: 'the embossed light, flat color map to full relief',
  },
  // shape (the second area lane, M14) sits in the second area folder with the two
  // rows that say what the area does, not up here on its own.
  paramOrder: ['speed', 'complexity', 'fill', 'density', 'contrast'],

  // vjw: buildPanel(folder, ...) stripped: the donor console's DOM rows (elements, click/pointer
  // listeners, ctx.pickLogo's file picker). Its sliders kept as data, for vs3/host.ts paramInputs (our panel's
  // inputs, so the factory presets that set them come in): key, min, max, label, its folder. Left out: the logo
  // chips (no logo here) and the regrow / clear buttons (counters).
  panelRows: [
    ['body', -1, 1, 'body'],
    ['shape', 0, 1, 'where', 'second area'], ['zoneSize', 0, 1, 'size', 'second area'], ['zonePattern', -1, 1, 'pattern', 'second area'],
    ['current', 0, 1, 'current', 'current'], ['push', -1, 1, 'strength', 'current'],
    ['grain', 0, 1, 'grain', 'grain'], ['grip', 0, 1, 'strength', 'grain'],
    ['hue', -1, 1, 'hue', 'color'], ['sat', -1, 1, 'saturation', 'color'], ['bands', 0, 1, 'bands', 'color'],
  ],

  // main.js: a logo just landed (a drop in this window). Use it.
  onLogo() {
    const P = this.params;
    if (!P.logo) { P.logo = 1; if (this._send) this._send({ 'x.logo': 1 }); }
  },
  // main.js hides the logo layer in this scene whenever a logo is
  // loaded: here a logo is a shape for the pattern, and with the row
  // off the plain pattern shows, not the layer (Alec, 2026-11-08).
  takesLogo() { return !!(ctx.logo && ctx.logo.uHasLogo.value > 0.5); },

  // randomize scene: the shared dice roll the main sliders; these are
  // the scene's own rows, kept to ranges that stay full and pretty.
  rollExtras(R, chance) {
    const P = this.params;
    // The shared roll can land spread near zero, a speck on bare ground.
    P.density = R(0.45, 1);
    P.body = R(-0.25, 0.25);
    P.current = R(0, 1);
    P.push = chance(0.65) ? (chance(0.5) ? -1 : 1) * R(0.3, 1) : 0;
    P.grain = R(0, 1);
    P.grip = chance(0.6) ? R(0.4, 1) : 0;
    P.zoneSize = chance(0.6) ? R(0.3, 1) : 0;
    P.zonePattern = chance(0.5) ? R(-0.6, 0.6) : 0;
    P.bands = chance(0.25) ? R(0.1, 0.5) : 0;
    // Regrow, like a preset load. The old field carried into new
    // chemistry often died out with no audio to sow it again (Alec,
    // 2026-11-02: randomize kept landing on blank screens).
    needSeed = true;
  },

  update(s, dt, t) {
    if (!ctx.renderer) return;
    const P = this.params;
    const h = Math.min(dt, 0.05);
    // Presets and the other window move the morphs too; keep their names true.
    if (this._panelSync) this._panelSync();
    ensureSim(ctx.renderer, P.fill, t);
    // Looks saved with the old cream toggle open on the cream mode.
    if (P.cream) { if (P.mode === 'match palette') P.mode = 'palette on cream'; P.cream = false; }
    const fixed = MODES.indexOf(P.mode) >= FIXED_FROM;
    this.bloom.gain = fixed ? 0 : 0.05;
    this.bloom.kick = fixed ? 0 : 0.04;

    // The logo: in use only while one is loaded. Taking one up (or a new
    // one) sows it, so the shape fills in seconds.
    const L = ctx.logo;
    logoLive = L && L.uHasLogo.value > 0.5 && L.tLogo.value ? Math.round(clamp(P.logo, 0, 1)) : 0;
    if (logoLive) {
      logoU.tLogo.value = L.tLogo.value;
      if (L.tLogo.value.uuid !== logoTexId) {
        logoTexId = L.tLogo.value.uuid;
        logoU.uLogoBox.value.copy(logoBox(L.tLogo.value.image));
      }
      // Twice the layer's size (at the layer's own 40% of the frame the
      // logo held one worm, not a pattern), trimmed to its opaque part
      // and fit inside the frame so a wide wordmark keeps its ends.
      const bx = logoU.uLogoBox.value;
      const la = L.uLogoAspect.value * bx.z / bx.w;
      logoU.uLogoAspect.value = la;
      logoU.uLogoScale.value = Math.min(L.uScale.value * 2, 0.85, 0.92 * aspect / la);
      logoU.uLogoAngle.value = L.uAngle.value;
    }
    const logoKey = logoLive ? logoLive + ':' + L.tLogo.value.uuid : '';
    if (logoKey !== lastLogoKey) {
      // Off again: the field outside the logo died, so regrow it whole.
      if (!logoKey && lastLogoKey) needSeed = true;
      lastLogoKey = logoKey;
      if (logoLive === 1) { logoSeed = true; burstLeft = Math.max(burstLeft, 60); }
    }
    map2U.uLogo.value = logoLive;
    map1U.uLogoFill.value = logoLive === 1 ? 1 : 0;

    // Buttons from any window: regrow, clear.
    if (P.regrowN !== lastRegrow) { lastRegrow = P.regrowN; needSeed = true; }
    let clearNow = false;
    if (P.clearN !== lastClear) { lastClear = P.clearN; clearNow = true; }
    if (needSeed || clearNow) {
      run(resetPass, fieldA);
      run(resetPass, fieldB);
      pips.length = 0;
      if (needSeed) regrow(P);
      needSeed = false;
      lastSeed = t;
      deadProbes = clearNow ? -1e9 : 0; // a cleared field waits for paint
    }

    // pattern walks the curated path; body slides the point across the
    // kill axis (fatter to the right, sparser to the left).
    const xy1 = pathXY(P.complexity), xy2 = pathXY(clamp(P.complexity + P.zonePattern, 0, 1));
    energyE += (s.energy - energyE) * (1 - Math.exp(-h * 2.2));
    energySlow += (s.energy - energySlow) * (1 - Math.exp(-h * 0.25));
    // The fat side is shorter: past about a third of the way the field
    // floods solid (coverage 1.00 at the old full range).
    const bodyShift = (b) => (b > 0 ? 0.3 : 0.55) * b;
    const [k1, f1] = this._forceKF || mapKF(clamp(xy1[0] - bodyShift(P.body), -1, 1), xy1[1]);
    const [k2, f2] = mapKF(clamp(xy2[0] - bodyShift(P.body), -1, 1), xy2[1]);
    // A section's energy slides the feed a little: a drop fattens the
    // field over seconds, a breakdown thins it.
    const fNudge = 0.0008 * (2 * energySlow - 1);
    const kr = 1 - Math.exp(-h * 4);
    const nudge = this._forceKF ? 0 : fNudge;
    const tgt = [k1, f1 + nudge, k2, f2 + nudge];
    for (let i = 0; i < 4; i++) kfLive[i] += (tgt[i] - kfLive[i]) * kr;

    // Kicks: a bubble of flow on the golden angle, by how hard it hit.
    if (s.onKick > 0) {
      const accent = s.onKick > 0.55 && t - lastAccent > 2.8;
      if (accent) lastAccent = t;
      impAngle += 2.399963;
      const rr = 0.12 + 0.28 * Math.sqrt(Math.random());
      const im = imps[impNext];
      impNext = (impNext + 1) % IMP_N;
      im.x = clamp(0.5 + Math.cos(impAngle) * rr / aspect, 0.1, 0.9);
      im.y = clamp(0.5 + Math.sin(impAngle) * rr, 0.1, 0.9);
      im.r = 0.06 + 0.05 * Math.random();
      im.amt = (accent ? 1.0 : 0.45 + 0.4 * Math.min(1, s.onKick)) * 0.9;
      im.decay = accent ? 1.6 : 3.2;
      if (accent && P.density > 0.3 && P.clearN === lastClear) {
        pips.push({ x: im.x, y: im.y, r: 0.025, amt: 0.6 });
        lastSeed = t;
      }
    }
    for (const im of imps) im.amt *= Math.exp(-h * im.decay);

    if (scenePointer.held && scenePointer.ndc) {
      pips.push({ x: scenePointer.ndc.x * 0.5 + 0.5, y: scenePointer.ndc.y * 0.5 + 0.5, r: 0.014, amt: 0.6 });
      lastSeed = t;
      painted++;
      if (deadProbes < 0) deadProbes = 0;
    }
    probe(t);
    // A field that died right after a scale change regrows at once,
    // not after the usual six seconds of black.
    const justRebuilt = t - lastRebuild < 4 && lastRebuild > lastSeed;
    if (deadProbes >= 3 && t - lastSeed > 6 || deadProbes >= 1 && justRebuilt) { regrow(P); lastSeed = t; deadProbes = 0; }

    // Steps: per second, set by speed (100x across the slider) and the
    // music (silence 65%), capped by a texel budget per frame. A slow
    // GPU halves the budget rather than dropping frames.
    // The governor: frames running long (under 50 fps) shrink the step
    // budget fast, frames with room (over 58 fps, which a 60 Hz display
    // shows as exactly 60) grow it slowly. Any GPU settles where it holds
    // its frame rate; the chemistry slows instead of the picture.
    dtE += (Math.min(dt, 0.1) - dtE) * (1 - Math.exp(-h * 2));
    if (dtE > 1 / 50) govern *= Math.exp(-h * 1.5);
    else if (dtE < 1 / 58) govern *= Math.exp(h * 0.3);
    govern = clamp(govern, 0.04, 1);
    stepScale = govern;
    const perSec = STEPS_PER_SEC * Math.pow(10, (P.speed - 0.5) * 2) * (0.65 + 0.45 * energyE);
    const cap = Math.max(1, Math.min(MAX_STEPS, Math.floor(TEXEL_STEP_BUDGET * govern / (simW * simH))));
    stepAcc = Math.min(stepAcc + perSec * clamp(dt, 1 / 240, 1 / 30), cap + 1);
    let steps = Math.min(cap, Math.floor(stepAcc));
    stepAcc -= steps;
    if (burstLeft > 0) { burstLeft--; steps = Math.min(cap, steps + 40); }

    flowT += h * 0.07 * drastic(P.speed);
    mapT += h * 0.012 * drastic(P.speed);
    // Flow is set in screen terms: a finer grid needs more texels per
    // step to move as fast on screen (the RD Tool scales the same way).
    // A slow speed runs fewer steps, so the same per-step flow barely
    // moves anything (Alec, speed 7: "current and push don't seem to do
    // anything"). Below the default the flow per step grows to hold its
    // pace on screen, up to 5x (the weights cap keeps it stable).
    const slowComp = clamp(Math.pow(10, -(P.speed - 0.5) * 2), 1, 5);
    const flowGain = Math.pow(3 / cssPerTexel, 0.8) * 0.14 * slowComp;

    map1U.uAspect.value = aspect;
    map1U.uZoneSize.value = P.zoneSize;
    map1U.uMapT.value = mapT;
    map1U.uFlowT.value = flowT;
    map1U.uFlowGain.value = flowGain;
    const fl = morphStops(CURRENTS, P.current).map((v) => v * P.push);
    // Pulling inward drains the frame faster than it regrows (a sink at
    // full push leaves one knot in the middle), so the inward side of
    // the radial and cell flows is capped short of the outward side.
    fl[0] = clamp(fl[0], -0.18, 0.45);
    fl[3] = clamp(fl[3], -0.15, 0.45);
    map1U.uFlowA.value.set(fl[0], fl[1], fl[2], fl[3]);
    map1U.uFlowB.value.set(fl[4], fl[5], fl[6], 0.25 + 0.75 * energyE);
    map1U.uWhere.value = P.shape;
    for (let i = 0; i < IMP_N; i++) {
      const im = imps[i];
      map1U.uImp.value[i].set(im.x, im.y, im.r, im.amt > 0.01 ? im.amt : 0);
    }
    run(map1Pass, map1T);
    map2U.uAspect.value = aspect;
    map2U.uMapT.value = mapT;
    const or = morphStops(GRAINS, P.grain).map((v) => v * P.grip);
    map2U.uOrA.value.set(or[0], or[1], or[2], or[3]);
    map2U.uOrB.value = or[4];
    map2U.uMaskR.value = maskRadius(P.density, energyE);
    run(map2Pass, map2T);

    applyStamps();
    simU.tMap1.value = map1T.texture;
    simU.tMap2.value = map2T.texture;
    simU.uTexel.value.set(1 / simW, 1 / simH);
    simU.uKF.value.set(kfLive[0], kfLive[1], kfLive[2], kfLive[3]);
    for (let i = 0; i < steps; i++) {
      simU.tField.value = fieldA.texture;
      run(simPass, fieldB);
      [fieldA, fieldB] = [fieldB, fieldA];
    }
    stepsLast = steps;
    packU.tA.value = fieldA.texture;
    packU.tB.value = fieldB.texture;
    packU.tMap1.value = map1T.texture;
    packU.uTexel.value.set(1 / simW, 1 / simH);
    packU.uTexScale.value = cssPerTexel / 3;
    run(packPass, packT);
    ctx.renderer.setRenderTarget(null);

    // Color map: rebuilt when its inputs change (match palette also
    // every few frames, since the palette morphs in place).
    const modeName = MODES.includes(P.mode) ? P.mode : 'match palette';
    const adj = { hue: P.hue, sat: P.sat, bright: 0, con: 0, invert: !!P.invert };
    const key = [modeName, adj.hue, adj.sat, adj.invert].join();
    cmapAge++;
    if (key !== cmapKey || (onPalette(modeName) && cmapAge > 6)) {
      cmapKey = key; cmapAge = 0;
      buildColorMap(onPalette(modeName) ? paletteStops(modeName === 'palette on cream') : fixedStops[modeName], adj);
    }

    // Light from the top, drifting a little so the gloss slides.
    lightA += h * 0.05 * drastic(P.speed);
    const la = Math.PI / 2 + 0.25 * Math.sin(lightA);
    displayU.uLight.value.set(Math.cos(la) * 0.7071, Math.sin(la) * 0.7071, 0.7071);
    subE += (s.sub - subE) * (1 - Math.exp(-h * 3));
    highsE += (s.highs - highsE) * (1 - Math.exp(-h * 6));
    const buf = ctx.renderer.getDrawingBufferSize(new THREE.Vector2());
    displayU.tPack.value = packT.texture;
    displayU.uSize.value.set(simW, simH);
    // AA corners at 0.49 of a screen pixel, in grid texels.
    displayU.uAAd.value.set(0.49 * simW / Math.max(1, buf.x), 0.49 * simH / Math.max(1, buf.y));
    displayU.uEmboss.value = Math.min(1, P.contrast / 0.15);
    displayU.uGain.value = mix(0.4, 1.4, P.contrast) * (1 + 0.12 * subE);
    displayU.uSpec.value = 0.55 + 0.15 * highsE;
    bPeakE += (bPeak - bPeakE) * (1 - Math.exp(-h * 1.5));
    displayU.uBScale.value = 1 / Math.max(0.15, bPeakE);
    displayU.uFreq.value = 1 + P.bands * 5;
    displayU.uPhase.value = 0;
    // Hovering an option shows that option's area; otherwise full for
    // 1.5 s after a second area row moves, then fades out.
    const since = (performance.now() - areaFlashAt) / 1000;
    const hover = areaHover;
    displayU.uAreaWhere.value = hover !== null ? hover : P.shape;
    displayU.uShowArea.value = hover !== null ? (hover > 0 ? 1 : 0) : P.shape > 0.02 ? clamp(2.5 - since, 0, 1) : 0;
    displayU.uAspect.value = aspect;
    displayU.uMapT.value = mapT;
  },
  faithful() {
    const P = this.params;
    return MODES.indexOf(P.mode) >= FIXED_FROM;
  },
  resize() { /* ensureSim follows the drawing buffer each frame */ },
  debugField() {
    if (!fieldA || !ctx.renderer) return null;
    if (!floatOk) return { halfFloat: true };
    const w = simW, hgt = simH, n = w * hgt;
    if (!debugT) debugT = renderTarget(w, hgt, THREE.FloatType);
    copyU.tSrc.value = fieldA.texture;
    run(copyPass, debugT);
    ctx.renderer.setRenderTarget(null);
    const px = new Float32Array(n * 4);
    ctx.renderer.readRenderTargetPixels(debugT, 0, 0, w, hgt, px);
    let nan = 0, cov = 0, sumB = 0, maxB = 0;
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const A = px[j], B = px[j + 1];
      if (A !== A || B !== B) { nan++; continue; }
      sumB += B;
      if (B > 0.2) cov++;
      if (B > maxB) maxB = B;
    }
    // Stripe period along the middle row: median gap between upward
    // crossings of half the peak.
    const row = Math.floor(hgt / 2), thr = maxB * 0.5, ups = [];
    for (let x = 1; x < w; x++) {
      const b0 = px[(row * w + x - 1) * 4 + 1], b1 = px[(row * w + x) * 4 + 1];
      if (b0 < thr && b1 >= thr) ups.push(x);
    }
    const gaps = ups.slice(1).map((v, i) => v - ups[i]).sort((a, b) => a - b);
    const period = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
    return {
      simW: w, simH: hgt, cssPerTexel: +cssPerTexel.toFixed(2), nan, coverage: cov / n, meanB: sumB / n, maxB, period,
      kf: kfLive.map((v) => +v.toFixed(5)), stepsLast, dtE: +dtE.toFixed(4), stepScale: +stepScale.toFixed(2),
      imps: imps.map((im) => +im.amt.toFixed(3)), probeMeanB, painted,
    };
  },
  presetApplied() { needSeed = true; },
  _reseed() { needSeed = true; },
  _forceKF: null,
  _mapKF: mapKF,
  _kfToXY: kfToXY,
};
} // vjw: the factory
