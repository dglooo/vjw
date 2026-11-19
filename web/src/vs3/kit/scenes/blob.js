// Copied from donor/vs3/visual_kit/src/scenes/blob.js (the friends' engine, used with permission, 2026-11-19).
// vjw: wrapped in a factory (one scene object per layer); nothing else changed. agents/guides/guide_vs3_port.md
// Scene: Bloom — organic noise-displaced blob with particle shell.
import * as THREE from 'three';
import { NOISE_GLSL } from '../lib/noise-glsl.js';
import { PAL, particleSprite } from '../lib/common.js';
export default function create() { // vjw

const scene = new THREE.Scene();
scene.background = PAL.bg;
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
camera.position.set(0, 0, 4.8);

const uniforms = {
  uTime: { value: 0 },
  uDisplace: { value: 0.2 },
  uKick: { value: 0 },
  uSpeed: { value: 0.3 },
  uBright: { value: 0 },
  uEnergy: { value: 0 },
  uColDeep: { value: PAL.shadow },
  uColViolet: { value: PAL.mid },
  uColTeal: { value: PAL.accent },
  uColEmber: { value: PAL.glow },
};

const blob = new THREE.Mesh(
  new THREE.IcosahedronGeometry(1.15, 96),
  new THREE.ShaderMaterial({
    uniforms,
    vertexShader: NOISE_GLSL + /* glsl */`
      uniform float uTime, uDisplace, uKick, uSpeed;
      varying float vNoise;
      varying vec3 vNormal;
      void main() {
        float t = uTime * uSpeed;
        float n = snoise(normal * 1.7 + vec3(0.0, t * 0.7, t))
                + 0.45 * snoise(normal * 4.3 - vec3(t * 1.3, 0.0, t * 0.6));
        vNoise = n;
        float d = uDisplace * n + uKick * 0.34 * (0.6 + 0.4 * n);
        vec3 p = position + normal * d;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uBright, uEnergy, uKick;
      uniform vec3 uColDeep, uColViolet, uColTeal, uColEmber;
      varying float vNoise;
      varying vec3 vNormal;
      void main() {
        float fresnel = pow(1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0))), 2.1);
        vec3 col = mix(uColDeep, uColViolet, smoothstep(-0.15, 1.25, vNoise));
        col = mix(col, uColTeal, fresnel * (0.3 + 0.5 * uBright));
        col += uColEmber * uKick * 0.25 * fresnel;
        col *= 0.3 + 0.75 * uEnergy;
        gl_FragColor = vec4(col, 1.0);
      }`,
  })
);
blob.scale.setScalar(0.85);
scene.add(blob);

const P_COUNT = 1600;
const pGeo = new THREE.BufferGeometry();
{
  const pos = new Float32Array(P_COUNT * 3);
  for (let i = 0; i < P_COUNT; i++) {
    const u = Math.random() * Math.PI * 2;
    const v = Math.acos(2 * Math.random() - 1);
    const r = 1.9 + Math.random() * 1.4;
    pos[i * 3] = r * Math.sin(v) * Math.cos(u);
    pos[i * 3 + 1] = r * Math.sin(v) * Math.sin(u);
    pos[i * 3 + 2] = r * Math.cos(v);
  }
  pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
}
const pMat = new THREE.PointsMaterial({
  color: PAL.accent, size: 0.045, transparent: true, opacity: 0.3,
  map: particleSprite(), blending: THREE.AdditiveBlending,
  depthWrite: false, sizeAttenuation: true,
});
const particles = new THREE.Points(pGeo, pMat);
scene.add(particles);

return { // vjw: was `export default {`
  name: 'bloom',
  scene,
  camera,
  trails: false,
  bloom: { strength: 0.3, gain: 0.45 },
  update(s, dt, t) {
    uniforms.uTime.value = t;
    uniforms.uDisplace.value = 0.1 + s.sub * 0.38;
    uniforms.uKick.value = s.kick;
    uniforms.uSpeed.value = 0.22 + s.mids * 0.5;
    uniforms.uBright.value = s.highs;
    uniforms.uEnergy.value = 0.25 + s.energy * 0.75;
    blob.rotation.y += dt * (0.05 + s.mids * 0.12);
    blob.rotation.z += dt * 0.017;
    particles.rotation.y -= dt * (0.02 + s.air * 0.1);
    particles.rotation.x += dt * 0.008;
    pMat.opacity = 0.12 + s.air * 0.75;
    pMat.size = 0.03 + s.highs * 0.04;
    pMat.color.copy(PAL.accent);
    camera.position.z = 4.8 - s.kick * 0.3;
  },
  resize(w, h) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  },
};
} // vjw: the factory
