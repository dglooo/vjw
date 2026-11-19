// Copied from donor/vs3/visual_kit/src/scenes/tendril.js (the friends' engine, used with permission, 2026-11-19).
// vjw: wrapped in a factory (one scene object per layer); nothing else changed. agents/guides/guide_vs3_port.md
// Scene: Tendril, glossy tubes grown from a Julia set by orbit traps.
//
// Each pixel runs z -> z^2 + c and watches its orbit pass a trap shape (a
// ring, a line, or the two axes). The first orbit step that lands within
// the tube radius of the trap claims the pixel; how far it landed from the
// trap's center line is the height across a round tube, and the analytic
// derivative dz/dpixel turns that into a surface normal. Early steps make
// the big tubes, later steps the small ones, so the fractal draws itself
// as tubes layered over finer tubes, with hairline filaments behind.
// The `deep` modes let the LAST hit win instead: small tubes on top read
// as lace. Kicks leap the seed's drift phase, so the structure reshapes on
// the beat instead of flashing.
import * as THREE from 'three';
import { PAL, drastic } from '../lib/common.js';
export default function create() { // vjw

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// Seed path, ordered so neighbors are close in c. shape 0..1 runs along
// it. The middle point is Alec's lace (2026-10-20): just outside the set,
// where the interior opens into spiral webs; 0.025 to its right the
// middle fills in solid.
const SEEDS = [
  [0.285, 0.013], [-0.4, 0.6], [-0.752, 0.1889], [-0.8, 0.156], [-0.835, -0.2321],
];
// Drift orbit radius around the seed. Near the set's edge a small move in
// c changes the picture a lot, so this stays small enough that a preset
// keeps its character while the kicks still reshape it.
const ORBIT = 0.01;
const MODES = ['ring', 'line', 'cross', 'lace', 'thorn', 'weave'];
// Trap per mode (0 ring, 1 line, 2 cross) and whether the deepest hit wins.
const TRAP = { ring: 0, line: 1, cross: 2, lace: 0, thorn: 1, weave: 2 };
const DEEP = { ring: 0, line: 0, cross: 0, lace: 1, thorn: 1, weave: 1 };

function seedAt(u, out) {
  const n = SEEDS.length - 1;
  const x = Math.max(0, Math.min(1, u)) * n;
  const i = Math.min(n - 1, Math.floor(x));
  const f = x - i;
  const p0 = SEEDS[Math.max(0, i - 1)], p1 = SEEDS[i], p2 = SEEDS[i + 1], p3 = SEEDS[Math.min(n, i + 2)];
  // Catmull-Rom, so sweeping the slider glides instead of kinking.
  const f2 = f * f, f3 = f2 * f;
  for (let k = 0; k < 2; k++) {
    out[k] = 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * f
      + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * f2
      + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * f3);
  }
  return out;
}

const uniforms = {
  uAspect: { value: 1 },
  uScale: { value: 2.2 },
  uC: { value: new THREE.Vector2(-0.8, 0.156) },
  uRing: { value: 0.6 },
  uWidth: { value: 0.1 },
  uTrap: { value: 0 },
  uDeep: { value: 0 },
  uEnergy: { value: 0 },
  uHighs: { value: 0 },
  uContrast: { value: 0.5 },
  uBg: { value: PAL.bg },
  uShadow: { value: PAL.shadow },
  uMid: { value: PAL.mid },
  uAccent: { value: PAL.accent },
  uGlow: { value: PAL.glow },
};

const material = new THREE.ShaderMaterial({
  uniforms,
  depthWrite: false,
  depthTest: false,
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform float uAspect, uScale, uRing, uWidth, uEnergy, uHighs, uContrast;
    uniform int uTrap, uDeep;
    uniform vec2 uC;
    uniform vec3 uBg, uShadow, uMid, uAccent, uGlow;
    varying vec2 vUv;
    const int MAXI = 96;

    vec2 cmul(vec2 a, vec2 b) { return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x); }

    vec3 shade(vec2 p, float px) {
      vec2 z = p, w = vec2(1.0, 0.0);
      float logS = 0.0;          // w is renormalized; true |w| = |w| * exp(logS)
      bool hit = false; float hu = 0.0; vec2 hg = vec2(1.0, 0.0); float hk = 0.0;
      float shadow = 1e3;        // nearest miss of an earlier tube, in its radii
      float glow = 1e9;          // nearest trap in pixels (background filaments)
      for (int k = 0; k < MAXI; k++) {
        if (k > 0) {
          float t; vec2 n;
          if (uTrap == 0) { float l = length(z); t = l - uRing; n = z / max(l, 1e-9); }
          else if (uTrap == 1) { t = z.x - uRing * 0.3; n = vec2(1.0, 0.0); }
          else if (abs(z.x) < abs(z.y)) { t = z.x; n = vec2(1.0, 0.0); }
          else { t = z.y; n = vec2(0.0, 1.0); }
          vec2 g = cmul(vec2(w.x, -w.y), n);   // d t / d pixel, up to exp(logS)
          float gl = length(g);
          float u = t / uWidth;
          glow = min(glow, abs(t) / (gl * exp(logS) * px + 1e-20));
          if (abs(u) < 1.0) {
            hit = true; hu = u; hg = g / max(gl, 1e-20); hk = float(k);
            if (uDeep == 0) break;
          } else if (uDeep == 0) {
            shadow = min(shadow, abs(u) - 1.0);
          }
        }
        w = 2.0 * cmul(z, w);
        float wl = length(w);
        if (wl > 1e8) { w /= wl; logS += log(wl); }
        z = cmul(z, z) + uC;
        if (dot(z, z) > 256.0) break;
      }

      vec3 bg = uBg * 0.6 + uAccent * exp(-glow * 0.9) * (0.4 + 0.3 * uHighs);
      if (!hit) return bg;

      float h = sqrt(max(1.0 - hu*hu, 0.0));
      vec3 N = normalize(vec3(hg * hu, h));
      vec3 L = normalize(vec3(-0.45, 0.65, 0.62));
      float dif = max(dot(N, L), 0.0);
      float spec = pow(max(dot(reflect(-L, N), vec3(0.0, 0.0, 1.0)), 0.0), 48.0);
      float rim = pow(1.0 - N.z, 2.6) * (0.55 + 0.9 * max(dot(N.xy, normalize(vec2(-0.5, 0.7))), 0.0));
      float sheen = pow(max(dot(N, normalize(vec3(-0.2, 0.9, 0.4))), 0.0), 6.0);

      vec3 col = uShadow * 0.35 + uMid * 0.12 * dif;
      col += uGlow * rim * (2.4 + 1.6 * uEnergy);
      col += uAccent * sheen * 0.3;
      col += mix(uGlow, vec3(1.0), 0.6) * spec * 1.1;
      col *= exp(-hk * 0.02);
      col *= mix(0.15, 1.0, smoothstep(0.0, 0.9, shadow));
      return mix(bg, col, smoothstep(1.0, 0.975, abs(hu)));
    }

    void main() {
      vec2 pix = (vUv - 0.5) * vec2(uAspect, 1.0) * uScale;
      vec2 dx = dFdx(pix), dy = dFdy(pix);
      float px = length(dy);
      // 2x2 supersampling: the hairline filaments shimmer without it.
      vec3 col = vec3(0.0);
      for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) {
        vec2 off = (vec2(float(i), float(j)) + 0.5) * 0.5 - 0.5;
        col += shade(pix + off.x * dx + off.y * dy, px);
      }
      col *= 0.25;
      col *= 0.45 + 0.75 * uEnergy;
      vec3 hi = col * col * (3.0 - 2.0 * col);
      vec3 lo = pow(max(col, 0.0), vec3(0.72));
      col = mix(col, hi, max(0.0, uContrast - 0.5) * 1.6);
      col = mix(col, lo, max(0.0, 0.5 - uContrast) * 1.6);
      gl_FragColor = vec4(clamp(col, 0.0, 1.4), 1.0);
    }`,
});
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

const seed = [0, 0];
let phase = 0, phaseTarget = 0;
let seedU = 0.75, width = 0.1, ring = 0.6, scale = 2.2, energy = 0;

return { // vjw: was `export default {`
  name: 'tendril', scene, camera, trails: false, pixelBudget: 1.5,
  bloom: { strength: 0.3, gain: 0.4 },
  modes: MODES,
  params: { mode: 'ring', speed: 0.5, shape: 0.75, complexity: 0.5, density: 0.5, fill: 0.5, contrast: 0.5 },
  paramLabels: {
    '*': { shape: 'seed', complexity: 'ring', density: 'width', fill: 'zoom' },
    line: { complexity: 'offset' }, thorn: { complexity: 'offset' },
    cross: { complexity: null }, weave: { complexity: null },
  },
  update(s, dt) {
    if (!(dt > 0)) return;
    const h = Math.min(dt, 0.05);
    const P = this.params;
    const ease = (k) => 1 - Math.exp(-h * k);
    // The seed orbits a small circle around its slider point. A kick leaps
    // the orbit phase and the set reshapes as the phase eases after it.
    phaseTarget += h * 0.13 * drastic(P.speed) * (1 + s.mids * 0.5);
    if (s.onKick) phaseTarget += (0.35 + Math.random() * 0.5) * s.onKick;
    phase += (phaseTarget - phase) * ease(4);
    seedU += (P.shape - seedU) * ease(3);
    seedAt(seedU, seed);
    uniforms.uC.value.set(seed[0] + ORBIT * Math.cos(phase), seed[1] + ORBIT * Math.sin(phase * 0.7));

    width += (0.1 * Math.pow(3, (P.density - 0.5) * 2) - width) * ease(5);
    ring += (1.2 * P.complexity - ring) * ease(5);
    scale += (2.2 / drastic(P.fill) - scale) * ease(4);
    energy += (s.energy - energy) * ease(3);
    uniforms.uWidth.value = width * (1 + 0.12 * s.sub);
    uniforms.uRing.value = ring;
    uniforms.uScale.value = scale;
    uniforms.uTrap.value = TRAP[P.mode] ?? 0;
    uniforms.uDeep.value = DEEP[P.mode] ?? 0;
    uniforms.uEnergy.value = energy;
    uniforms.uHighs.value = s.highs;
    uniforms.uContrast.value = P.contrast;
  },
  resize(w, h) {
    uniforms.uAspect.value = Math.max(1, w) / Math.max(1, h);
  },
  debug() { return { seed: [...seed], phase, width, ring, scale, energy }; },
};
} // vjw: the factory
