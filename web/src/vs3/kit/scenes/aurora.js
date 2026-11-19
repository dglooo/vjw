// Copied from donor/vs3/visual_kit/src/scenes/aurora.js (the friends' engine, used with permission, 2026-11-19).
// vjw: wrapped in a factory (one scene object per layer); nothing else changed. agents/guides/guide_vs3_port.md
// Scene: Veil — aurora curtains, noise-displaced translucent ribbons.
import * as THREE from 'three';
import { NOISE_GLSL } from '../lib/noise-glsl.js';
import { PAL, particleSprite } from '../lib/common.js';
export default function create() { // vjw

const scene = new THREE.Scene();
scene.background = PAL.bg;
const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
camera.position.set(0, -0.4, 8.5);

const RIBBONS = 6;
const ribbonUniforms = [];

for (let i = 0; i < RIBBONS; i++) {
  const u = {
    uTime: { value: 0 },
    uOffset: { value: i * 7.31 },
    uAmp: { value: 0.5 },
    uSpeed: { value: 0.3 },
    uGlow: { value: 0.4 },
    uShimmer: { value: 0 },
    uColA: { value: i % 2 ? PAL.accent : PAL.mid },
    uTintA: { value: i % 2 ? 0.85 : 1.0 },
    uColB: { value: i === 0 ? PAL.glow : PAL.shadow },
    uTintB: { value: i === 0 ? 0.4 : 1.0 },
  };
  ribbonUniforms.push(u);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 2.6, 220, 1),
    new THREE.ShaderMaterial({
      uniforms: u,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: NOISE_GLSL + /* glsl */`
        uniform float uTime, uOffset, uAmp, uSpeed;
        varying vec2 vUv;
        varying float vN;
        void main() {
          vUv = uv;
          float t = uTime * uSpeed + uOffset;
          float n = snoise(vec3(position.x * 0.22, t * 0.55, uOffset))
                  + 0.5 * snoise(vec3(position.x * 0.6, t * 0.8, uOffset + 3.0));
          vN = n;
          vec3 p = position;
          p.y += n * uAmp * (0.7 + 0.6 * uv.y);
          p.z += snoise(vec3(position.x * 0.15, t * 0.3, uOffset + 9.0)) * 0.8;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform float uGlow, uShimmer, uTintA, uTintB;
        uniform vec3 uColA, uColB;
        varying vec2 vUv;
        varying float vN;
        void main() {
          float edge = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
          vec3 col = mix(uColB * uTintB, uColA * uTintA, smoothstep(-0.8, 1.0, vN));
          float a = edge * uGlow * (0.5 + 0.5 * smoothstep(-1.0, 1.0, vN));
          a += uShimmer * edge * smoothstep(0.85, 1.0, fract(vN * 3.7)) * 0.1;
          gl_FragColor = vec4(col, a);
        }`,
    })
  );
  mesh.position.y = -1.4 + i * 0.62;
  mesh.position.z = -2.5 + i * 0.9;
  mesh.rotation.x = -0.12;
  scene.add(mesh);
}

// Sparse starfield behind the curtains.
const S_COUNT = 500;
const sGeo = new THREE.BufferGeometry();
{
  const sp = new Float32Array(S_COUNT * 3);
  for (let i = 0; i < S_COUNT; i++) {
    sp[i * 3] = (Math.random() - 0.5) * 30;
    sp[i * 3 + 1] = (Math.random() - 0.5) * 16;
    sp[i * 3 + 2] = -6 - Math.random() * 10;
  }
  sGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
}
const sMat = new THREE.PointsMaterial({
  color: PAL.accent, size: 0.05, transparent: true, opacity: 0.25,
  map: particleSprite(), blending: THREE.AdditiveBlending,
  depthWrite: false,
});
scene.add(new THREE.Points(sGeo, sMat));

return { // vjw: was `export default {`
  name: 'veil',
  scene,
  camera,
  trails: false,
  bloom: { strength: 0.28, gain: 0.35 },
  update(s, dt, t) {
    for (let i = 0; i < RIBBONS; i++) {
      const u = ribbonUniforms[i];
      u.uTime.value = t;
      u.uAmp.value = 0.35 + s.sub * 1.1 + s.kick * 0.35;
      u.uSpeed.value = 0.22 + s.mids * 0.6;
      u.uGlow.value = 0.13 + s.energy * 0.3 + (i % 2 ? s.highs : s.mids) * 0.13;
      u.uShimmer.value = s.air;
    }
    sMat.opacity = 0.1 + s.air * 0.4;
    sMat.color.copy(PAL.accent);
    camera.position.x = Math.sin(t * 0.04) * 1.2;
    camera.lookAt(0, 0.2, -1);
  },
  resize(w, h) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  },
};
} // vjw: the factory
