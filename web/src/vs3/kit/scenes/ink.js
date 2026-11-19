// Copied from donor/vs3/visual_kit/src/scenes/ink.js (the friends' engine, used with permission, 2026-11-19).
// vjw: wrapped in a factory (one scene object per layer); nothing else changed. agents/guides/guide_vs3_port.md
// Scene: Ink — domain-warped fBm (Quilez technique). Flowing ink/smoke
// where sub-bass deepens the warp and kicks bloom light through the folds.
import * as THREE from 'three';
import { NOISE_GLSL } from '../lib/noise-glsl.js';
import { PAL, drastic } from '../lib/common.js';

export default function create() { // vjw
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const uniforms = {
  uPhase: { value: 0 },
  uAspect: { value: 1 },
  uKick: { value: 0 },
  uSub: { value: 0 },
  uMids: { value: 0 },
  uHighs: { value: 0 },
  uEnergy: { value: 0 },
  uShock: { value: 0 },
  uComplex: { value: 1 },
  uFill: { value: 1.5 },
  uContrast: { value: 0.5 },
  uBg: { value: PAL.bg },
  uShadow: { value: PAL.shadow },
  uMid: { value: PAL.mid },
  uAccent: { value: PAL.accent },
  uGlow: { value: PAL.glow },
};

const quad = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
    fragmentShader: NOISE_GLSL + /* glsl */`
      uniform float uPhase, uAspect, uKick, uSub, uMids, uHighs, uEnergy;
      uniform float uShock, uComplex, uFill, uContrast;
      uniform vec3 uBg, uShadow, uMid, uAccent, uGlow;
      varying vec2 vUv;

      float fbm(vec3 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * snoise(p);
          p = p * 2.03 + vec3(1.7, 9.2, 4.1);
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec2 uv = (vUv - 0.5) * vec2(uAspect, 1.0);
        float t = uPhase;

        float warp = (1.1 + uSub * 1.4) * uComplex + uShock * 1.4;
        vec3 P = vec3(uv * uFill, t);
        float q = fbm(P);
        float r = fbm(P + vec3(q * warp, q * 0.7 * uComplex, 0.35));
        float v = fbm(P + vec3(r * 1.7 * uComplex, r * 1.05, 0.21));

        vec3 col = mix(uBg, uShadow, smoothstep(-0.7, 0.4, q));
        col = mix(col, uMid, smoothstep(-0.2, 0.7, r) * (0.6 + 0.35 * uEnergy));
        col = mix(col, uAccent, smoothstep(0.22, 0.85, v) * (0.3 + 0.55 * uHighs));
        col += uGlow * (uKick * 0.5 + uEnergy * 0.1) * smoothstep(0.4, 0.95, v);

        vec3 hi = col * col * (3.0 - 2.0 * col);
        vec3 lo = pow(max(col, 0.0), vec3(0.72));
        col = mix(col, hi, max(0.0, uContrast - 0.5) * 1.6);
        col = mix(col, lo, max(0.0, 0.5 - uContrast) * 1.6);

        float rad = length(uv);
        col *= 1.0 - 0.35 * smoothstep(0.55, 1.2, rad);
        gl_FragColor = vec4(clamp(col, 0.0, 1.1), 1.0);
      }`,
    depthWrite: false,
    depthTest: false,
  })
);
scene.add(quad);

let phase = 0;
let shock = 0;

return { // vjw: was `export default {`
  name: 'ink',
  scene,
  camera,
  trails: false,
  // Ink drew every pixel, and in the Mac app's WKWebView that is GPU
  // bound on a big Retina window: 50.5 fps at 3456x2234 (7.7 MP) on an
  // M2 Pro, 60 at 5.6 MP (2026-11-02). Soft smoke loses nothing at a
  // 5 MP internal size.
  pixelBudget: 5.0,
  bloom: { strength: 0.22, gain: 0.3 },
  params: { speed: 0.5, complexity: 0.5, fill: 0.5, contrast: 0.5 },
  update(s, dt, t) {
    const P = this.params;
    phase += dt * 0.011 * (1 + s.mids * 0.5) * drastic(P.speed);
    // Kicks reorganize the whole field: a phase leap plus a warp shockwave.
    if (s.onKick) {
      phase += 0.15 * s.onKick;
      shock = Math.min(1.2, shock + 0.8 * s.onKick);
    }
    shock *= Math.exp(-dt * 2.6);
    uniforms.uPhase.value = phase;
    uniforms.uShock.value = shock;
    uniforms.uComplex.value = 0.3 + 1.5 * P.complexity;
    uniforms.uFill.value = 2.6 - 2.2 * P.fill;
    uniforms.uContrast.value = P.contrast;
    uniforms.uKick.value = s.kick;
    uniforms.uSub.value = s.sub;
    uniforms.uMids.value = s.mids;
    uniforms.uHighs.value = s.highs;
    uniforms.uEnergy.value = s.energy;
  },
  resize(w, h) {
    uniforms.uAspect.value = w / h;
  },
};
} // vjw: the factory
