// Copied from donor/vs3/visual_kit/src/scenes/echo.js (the friends' engine, used with permission, 2026-11-19).
// vjw: wrapped in a factory (one scene object per layer); nothing else changed. agents/guides/guide_vs3_port.md
// Scene: Echo — every kick drops an expanding ring into a stacked depth
// field; notes and hats spawn smaller, faster ripples. The groove writes
// itself into space and slowly dissolves.
import * as THREE from 'three';
import { PAL, particleSprite, drastic } from '../lib/common.js';
export default function create() { // vjw

const scene = new THREE.Scene();
scene.background = PAL.bg;
const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 100);
camera.position.set(0, 0.6, 7.5);

const group = new THREE.Group();
group.rotation.x = -0.35;
scene.add(group);

const RING_GEO = new THREE.TorusGeometry(1, 0.016, 8, 160);
const MAX_R = 36;

const TYPE = [
  { start: 0.3, speed: 1.0, life: 4.2, peak: 0.5 },    // kick
  { start: 0.2, speed: 1.4, life: 3.0, peak: 0.42 },   // mid
  { start: 0.12, speed: 2.2, life: 1.4, peak: 0.35 },  // high
];

const rings = [];
for (let i = 0; i < MAX_R; i++) {
  const mat = new THREE.MeshBasicMaterial({
    transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(RING_GEO, mat);
  mesh.visible = false;
  group.add(mesh);
  rings.push({ mesh, mat, active: false, birth: 0, type: 0, strength: 0, spin: 0 });
}
let rCursor = 0;
let lastSpawn = 0;

function spawn(type, strength, t) {
  const r = rings[rCursor];
  rCursor = (rCursor + 1) % MAX_R;
  r.active = true;
  r.birth = t;
  r.type = type;
  r.strength = strength;
  r.spin = (Math.random() - 0.5) * 0.8;
  // Ellipse + strong tilt + scatter: under kaleido mirrors, perfect
  // concentric circles read as hexagrams — broken symmetry reads floral.
  r.aspect = 0.6 + Math.random() * 0.8;
  r.mesh.visible = true;
  r.mesh.position.set(
    (Math.random() - 0.5) * 3.2,
    (Math.random() - 0.5) * 1.6,
    -0.5 - Math.random() * 4.5
  );
  r.mesh.rotation.set(
    (Math.random() - 0.5) * 1.6,
    (Math.random() - 0.5) * 1.6,
    Math.random() * Math.PI
  );
  lastSpawn = t;
}

// Sparse dust behind the rings.
const D_COUNT = 350;
const dGeo = new THREE.BufferGeometry();
{
  const dp = new Float32Array(D_COUNT * 3);
  for (let i = 0; i < D_COUNT; i++) {
    dp[i * 3] = (Math.random() - 0.5) * 22;
    dp[i * 3 + 1] = (Math.random() - 0.5) * 12;
    dp[i * 3 + 2] = -4 - Math.random() * 12;
  }
  dGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
}
const dMat = new THREE.PointsMaterial({
  size: 0.04, transparent: true, opacity: 0.18, map: particleSprite(),
  blending: THREE.AdditiveBlending, depthWrite: false,
});
scene.add(new THREE.Points(dGeo, dMat));

const typeColor = () => [PAL.glow, PAL.mid, PAL.accent];

return { // vjw: was `export default {`
  name: 'echo',
  scene,
  camera,
  trails: false,
  bloom: { strength: 0.32, gain: 0.32 },
  params: { speed: 0.5, complexity: 0.5, density: 0.5, fill: 0.5, contrast: 0.5 },
  update(s, dt, t) {
    const P = this.params;
    const spF = drastic(P.speed);
    const dnF = 0.3 + 1.4 * P.density;
    const lifeF = 0.5 + 1.3 * P.density;
    const fillF = 0.6 + 0.8 * P.fill;
    const conF = 0.6 + 0.8 * P.contrast;
    if (s.onKick) for (let b = 0; b < 1 + Math.round(P.complexity * 2); b++) spawn(0, s.onKick, t);
    if (s.onMid) spawn(1, s.onMid, t);
    if (s.onHigh) for (let b = 0; b < 1 + Math.round(P.complexity); b++) spawn(2, s.onHigh, t);
    if (t - lastSpawn > 2.2 / dnF) spawn(0, 0.35, t);

    const cols = typeColor();
    for (const r of rings) {
      if (!r.active) continue;
      const cfg = TYPE[r.type];
      const age = t - r.birth;
      const life = cfg.life * lifeF;
      if (age > life) { r.active = false; r.mesh.visible = false; r.mat.opacity = 0; continue; }
      const frac = age / life;
      const sc = (cfg.start + age * cfg.speed * spF * (1 + s.sub * 0.25)) * fillF;
      r.mesh.scale.set(sc * r.aspect, sc, sc);
      r.mesh.rotation.z += r.spin * dt * spF;
      const pop = age < 0.07 ? age / 0.07 : 1;
      r.mat.opacity = Math.min(1, cfg.peak * (0.4 + 0.6 * r.strength) * pop * (1 - frac)
        * (0.55 + 0.45 * s.energy) * conF);
      r.mat.color.copy(cols[r.type]);
    }

    dMat.opacity = 0.08 + s.air * 0.3;
    dMat.color.copy(PAL.accent);
    group.rotation.z += dt * 0.02;
    group.rotation.x = -0.35 + Math.sin(t * 0.07) * 0.06;
    camera.position.z = 7.5 - s.kick * 0.45;
    camera.lookAt(0, 0, -1.5);
  },
  resize(w, h) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  },
};
} // vjw: the factory
