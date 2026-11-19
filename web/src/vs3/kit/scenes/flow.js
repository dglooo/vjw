// Copied from donor/vs3/visual_kit/src/scenes/flow.js (the friends' engine, used with permission, 2026-11-19).
// vjw: wrapped in a factory (one scene object per layer); nothing else changed. agents/guides/guide_vs3_port.md
// Scene: Drift — event-driven comets in a swirling flow field.
// A faint ambient field sets the space; every kick launches a burst of
// bright comets, notes and hats add smaller ones. Comets ride the field,
// leave afterimage trails, and burn out.
import * as THREE from 'three';
import { PAL, particleSprite, glowPointsMaterial, drastic } from '../lib/common.js';
export default function create() { // vjw

const scene = new THREE.Scene();
scene.background = PAL.bg;
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
camera.position.set(0, 0, 9);

const BOUND = 7;

// --- ambient dust field ------------------------------------------------
const A_COUNT = 900;
const aPos = new Float32Array(A_COUNT * 3);
for (let i = 0; i < A_COUNT; i++) {
  const u = Math.random() * Math.PI * 2;
  const v = Math.acos(2 * Math.random() - 1);
  const r = Math.cbrt(Math.random()) * BOUND * 0.9;
  aPos[i * 3] = r * Math.sin(v) * Math.cos(u);
  aPos[i * 3 + 1] = r * Math.sin(v) * Math.sin(u);
  aPos[i * 3 + 2] = r * Math.cos(v);
}
const aGeo = new THREE.BufferGeometry();
aGeo.setAttribute('position', new THREE.BufferAttribute(aPos, 3));
const aMat = new THREE.PointsMaterial({
  size: 0.06, transparent: true, opacity: 0.15, map: particleSprite(),
  blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
});
const ambient = new THREE.Points(aGeo, aMat);
scene.add(ambient);

// --- comets -------------------------------------------------------------
const C_MAX = 900;
const cPos = new Float32Array(C_MAX * 3);
const cVel = new Float32Array(C_MAX * 3);
const cBirth = new Float32Array(C_MAX);
const cLife = new Float32Array(C_MAX);
const cSize = new Float32Array(C_MAX);
const cType = new Int8Array(C_MAX);
const cAlive = new Uint8Array(C_MAX);
let cCursor = 0;

const cGeo = new THREE.BufferGeometry();
cGeo.setAttribute('position', new THREE.BufferAttribute(cPos, 3));
cGeo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(C_MAX), 1));
cGeo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(C_MAX), 1));
cGeo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(C_MAX * 3), 3));
const comets = new THREE.Points(cGeo, glowPointsMaterial());
comets.frustumCulled = false;
scene.add(comets);

const BURST = [
  { n: 40, spread: 1.8, vel: 2.6, life: 4.8, size: 1.1 },   // kick
  { n: 16, spread: 3.0, vel: 1.7, life: 3.6, size: 0.7 },   // mid
  { n: 8, spread: 3.8, vel: 3.2, life: 2.0, size: 0.4 },    // high
];

let orbitA = 0;

function burst(type, strength, t, dnF = 1, lifeF = 1) {
  const cfg = BURST[type];
  const n = Math.round(cfg.n * (0.6 + 0.6 * strength) * dnF);
  // Structured emitters instead of random scatter: kicks erupt from the
  // center, melodic hits from a slowly orbiting point, hats at the rim.
  let origin;
  if (type === 0) {
    origin = new THREE.Vector3().randomDirection().multiplyScalar(Math.random() * 0.4);
  } else if (type === 1) {
    orbitA += 2.4;
    origin = new THREE.Vector3(
      Math.cos(orbitA) * 2.3, Math.sin(orbitA * 0.6) * 1.4, Math.sin(orbitA) * 2.3);
  } else {
    origin = new THREE.Vector3().randomDirection().multiplyScalar(3.2 + Math.random() * 0.8);
  }
  for (let k = 0; k < n; k++) {
    const i = cCursor;
    cCursor = (cCursor + 1) % C_MAX;
    const dir = new THREE.Vector3().randomDirection();
    cPos[i * 3] = origin.x + dir.x * 0.08;
    cPos[i * 3 + 1] = origin.y + dir.y * 0.08;
    cPos[i * 3 + 2] = origin.z + dir.z * 0.08;
    const sp = cfg.vel * (0.4 + Math.random());
    cVel[i * 3] = dir.x * sp;
    cVel[i * 3 + 1] = dir.y * sp;
    cVel[i * 3 + 2] = dir.z * sp;
    cBirth[i] = t;
    cLife[i] = cfg.life * (0.7 + Math.random() * 0.6) * lifeF;
    cSize[i] = cfg.size * (0.7 + Math.random() * 0.6);
    cType[i] = type;
    cAlive[i] = 1;
  }
}

// Swirly analytic field — cheap stand-in for curl noise.
function field(x, y, z, t, out) {
  const s = 0.42;
  out[0] = Math.sin(y * s + t * 0.4) + 0.7 * Math.cos(z * s * 1.3 - t * 0.23);
  out[1] = Math.sin(z * s * 0.9 + t * 0.31) + 0.7 * Math.cos(x * s - t * 0.4);
  out[2] = Math.sin(x * s * 1.1 - t * 0.27) + 0.7 * Math.cos(y * s * 1.2 + t * 0.2);
}
const f = [0, 0, 0];

const typeColor = () => [PAL.glow, PAL.mid, PAL.accent];

return { // vjw: was `export default {`
  name: 'drift',
  scene,
  camera,
  trails: true,
  trailDamp: 0.95,
  bloom: { strength: 0.45, gain: 0.5 },
  params: { speed: 0.5, complexity: 0.5, density: 0.5, fill: 0.5, contrast: 0.5 },
  update(s, dt, t) {
    const P = this.params;
    const spF = drastic(P.speed);
    const cxF = 0.3 + 1.5 * P.complexity;
    const dnF = 0.3 + 1.4 * P.density;
    const lifeF = 0.5 + 1.3 * P.density;
    const fillF = 0.6 + 0.8 * P.fill;
    const conF = 0.6 + 0.8 * P.contrast;
    if (s.onKick) for (let b = 0; b < Math.round(cxF); b++) burst(0, s.onKick, t, dnF, lifeF);
    if (s.onMid) burst(1, s.onMid * cxF, t, dnF, lifeF);
    if (s.onHigh) burst(2, s.onHigh * cxF, t, dnF, lifeF);
    // Continuous trickle so the space never empties between hits.
    this._trickle = (this._trickle || 0) + dt * dnF * (0.5 + s.energy);
    if (this._trickle > 0.45) { this._trickle = 0; burst(1, 0.3, t, dnF * 0.5, lifeF); }

    // Ambient dust rides the field slowly.
    const aSpeed = (0.22 + s.mids * 0.5) * spF;
    for (let i = 0; i < A_COUNT; i++) {
      const ix = i * 3;
      field(aPos[ix], aPos[ix + 1], aPos[ix + 2], t, f);
      aPos[ix] += f[0] * aSpeed * dt;
      aPos[ix + 1] += f[1] * aSpeed * dt;
      aPos[ix + 2] += f[2] * aSpeed * dt;
      const ar2 = aPos[ix] ** 2 + aPos[ix + 1] ** 2 + aPos[ix + 2] ** 2;
      if (ar2 > BOUND * BOUND) {
        aPos[ix] *= -0.3; aPos[ix + 1] *= -0.3; aPos[ix + 2] *= -0.3;
      }
    }
    aGeo.attributes.position.needsUpdate = true;
    aMat.opacity = (0.08 + s.energy * 0.12) * dnF;
    aMat.color.copy(PAL.mid);

    // Comets: field + initial burst velocity with drag.
    const cols = typeColor();
    const size = cGeo.attributes.aSize.array;
    const alpha = cGeo.attributes.aAlpha.array;
    const colr = cGeo.attributes.aColor.array;
    const drag = Math.exp(-dt * 0.8);
    const fieldPull = (0.9 + s.mids * 1.1) * spF;
    for (let i = 0; i < C_MAX; i++) {
      if (!cAlive[i]) { alpha[i] = 0; continue; }
      const age = t - cBirth[i];
      if (age > cLife[i]) { cAlive[i] = 0; alpha[i] = 0; continue; }
      const ix = i * 3;
      field(cPos[ix], cPos[ix + 1], cPos[ix + 2], t, f);
      cVel[ix] = cVel[ix] * drag + f[0] * fieldPull * dt * 3;
      cVel[ix + 1] = cVel[ix + 1] * drag + f[1] * fieldPull * dt * 3;
      cVel[ix + 2] = cVel[ix + 2] * drag + f[2] * fieldPull * dt * 3;
      cPos[ix] += cVel[ix] * dt;
      cPos[ix + 1] += cVel[ix + 1] * dt;
      cPos[ix + 2] += cVel[ix + 2] * dt;
      const cr2 = cPos[ix] ** 2 + cPos[ix + 1] ** 2 + cPos[ix + 2] ** 2;
      if (cr2 > BOUND * BOUND * 2.6) { cAlive[i] = 0; alpha[i] = 0; continue; }
      const frac = age / cLife[i];
      const pop = age < 0.06 ? age / 0.06 : 1;
      alpha[i] = Math.min(1, pop * (1 - frac) * (0.7 + 0.3 * s.energy) * conF);
      size[i] = cSize[i] * (1 - frac * 0.45) * fillF;
      const c = cols[cType[i]];
      colr[ix] = c.r; colr[ix + 1] = c.g; colr[ix + 2] = c.b;
    }
    cGeo.attributes.position.needsUpdate = true;
    cGeo.attributes.aSize.needsUpdate = true;
    cGeo.attributes.aAlpha.needsUpdate = true;
    cGeo.attributes.aColor.needsUpdate = true;

    const orbit = t * 0.015;
    const camR = 9 / fillF;
    camera.position.set(Math.sin(orbit) * camR, Math.sin(t * 0.03) * 1.5, Math.cos(orbit) * camR);
    camera.position.multiplyScalar(1 - s.kick * 0.04);
    camera.lookAt(0, 0, 0);
  },
  resize(w, h) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  },
};
} // vjw: the factory
