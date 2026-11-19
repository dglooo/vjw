// Copied from donor/vs3/visual_kit/src/scenes/kaleido.js (the friends' engine, used with permission, 2026-11-19).
// vjw: wrapped in a factory (one scene object per layer); nothing else changed. agents/guides/guide_vs3_port.md
// Scene: Threshold — kaleidoscopic kali-fractal fullscreen shader.
import * as THREE from 'three';
import { PAL, drastic } from '../lib/common.js';
export default function create() { // vjw

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const uniforms = {
  uTime: { value: 0 },
  uAspect: { value: 1 },
  uKick: { value: 0 },
  uSub: { value: 0 },
  uMids: { value: 0 },
  uHighs: { value: 0 },
  uEnergy: { value: 0 },
  uCParam: { value: new THREE.Vector2(0.78, 0.58) },
  uSharp: { value: 7 },
  uFill: { value: 1.9 },
  uContrast: { value: 0.5 },
  uColDeep: { value: PAL.shadow },
  uColViolet: { value: PAL.mid },
  uColTeal: { value: PAL.accent },
  uColEmber: { value: PAL.glow },
};

const quad = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uAspect, uKick, uSub, uMids, uHighs, uEnergy;
      uniform float uSharp, uFill, uContrast;
      uniform vec2 uCParam;
      uniform vec3 uColDeep, uColViolet, uColTeal, uColEmber;
      varying vec2 vUv;

      mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

      void main() {
        vec2 uv = (vUv - 0.5) * vec2(uAspect, 1.0);

        float seg = 6.0;
        float r = length(uv);
        float a = atan(uv.y, uv.x) + uTime * 0.02;
        a = mod(a, 6.2831853 / seg);
        a = abs(a - 3.14159265 / seg);
        vec2 p = vec2(cos(a), sin(a)) * r;

        p *= uFill - uKick * 0.35 - uSub * 0.25;
        p = rot(uTime * 0.015) * p;

        vec2 c = uCParam;

        float trap1 = 1e3;
        float trap2 = 1e3;
        for (int i = 0; i < 15; i++) {
          p = abs(p) / max(dot(p, p), 1e-4) - c;
          trap1 = min(trap1, length(p));
          trap2 = min(trap2, abs(p.x));
        }
        trap1 = clamp(trap1, 0.0, 10.0);
        trap2 = clamp(trap2, 0.0, 10.0);
        float v1 = exp(-uSharp * trap1);
        float v2 = exp(-uSharp * 2.3 * trap2);

        vec3 col = mix(uColDeep * 0.3, uColViolet * 1.15, smoothstep(0.1, 0.95, v1 * (0.5 + 0.6 * uEnergy)));
        col = mix(col, uColTeal, v2 * (1.0 - v1 * 0.5) * (0.18 + 0.4 * uHighs));
        col += uColEmber * uKick * 0.25 * v1;
        col *= (0.9 - 0.5 * smoothstep(0.35, 1.15, r)) * (0.75 + 0.55 * v1);
        vec3 hi = col * col * (3.0 - 2.0 * col);
        vec3 lo = pow(max(col, 0.0), vec3(0.72));
        col = mix(col, hi, max(0.0, uContrast - 0.5) * 1.6);
        col = mix(col, lo, max(0.0, 0.5 - uContrast) * 1.6);
        col = clamp(col, 0.0, 1.1);

        gl_FragColor = vec4(col, 1.0);
      }`,
    depthWrite: false,
    depthTest: false,
  })
);
scene.add(quad);

let th = 0;
let thTarget = 0;

return { // vjw: was `export default {`
  name: 'mandala',
  scene,
  camera,
  trails: false,
  bloom: { strength: 0.35, gain: 0.5 },
  params: { speed: 0.5, complexity: 0.5, fill: 0.5, contrast: 0.5 },
  update(s, dt, t) {
    const P = this.params;
    // Drift the fractal's shape parameter; every kick leaps it to a new
    // configuration — the whole mandala restructures on the beat.
    thTarget += dt * 0.045 * drastic(P.speed) * (1 + s.mids * 0.6);
    if (s.onKick) thTarget += (0.25 + Math.random() * 0.5) * s.onKick;
    th += (thTarget - th) * (1 - Math.exp(-dt * 5));
    uniforms.uCParam.value.set(
      0.78 + 0.10 * Math.sin(th * 0.7),
      0.58 + 0.08 * Math.cos(th * 0.53));

    uniforms.uTime.value = t;
    uniforms.uSharp.value = 3.2 + P.complexity * 9;
    uniforms.uFill.value = 2.6 - 1.4 * P.fill;
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
