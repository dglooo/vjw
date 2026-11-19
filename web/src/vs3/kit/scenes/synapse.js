// Copied from donor/vs3/visual_kit/src/scenes/synapse.js (the friends' engine, used with permission, 2026-11-19).
// vjw: wrapped in a factory (one scene object per layer); nothing else changed. agents/guides/guide_vs3_port.md
// Scene: Synapse — every hit adds a node to a growing constellation.
// Kicks spawn large cores near the center, mid onsets (notes/snares) spawn
// mid-size nodes, hats spawn distant motes. New nodes link to their nearest
// neighbours; everything drifts, ages, and fades — the track literally
// builds and dissolves the structure.
import * as THREE from 'three';
import { PAL, glowPointsMaterial, drastic } from '../lib/common.js';
export default function create() { // vjw

const scene = new THREE.Scene();
scene.background = PAL.bg;
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
camera.position.set(0, 0, 8.5);

const MAX_N = 400;
const MAX_SEG = 900;

// Node state
const nPos = new Float32Array(MAX_N * 3);
const nSeed = new Float32Array(MAX_N * 3);
const nBirth = new Float32Array(MAX_N);
const nLife = new Float32Array(MAX_N);
const nSize = new Float32Array(MAX_N);
const nType = new Int8Array(MAX_N);        // 0 kick, 1 mid, 2 high
const nAlive = new Uint8Array(MAX_N);
let nCursor = 0;

// Segment state (indices into node arrays)
const sA = new Int16Array(MAX_SEG);
const sB = new Int16Array(MAX_SEG);
const sBirth = new Float32Array(MAX_SEG);
const sAlive = new Uint8Array(MAX_SEG);
let sCursor = 0;

const group = new THREE.Group();
scene.add(group);

const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(nPos, 3));
pGeo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(MAX_N), 1));
pGeo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(MAX_N), 1));
pGeo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(MAX_N * 3), 3));
const points = new THREE.Points(pGeo, glowPointsMaterial());
points.frustumCulled = false;
group.add(points);

const lGeo = new THREE.BufferGeometry();
lGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_SEG * 6), 3));
lGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_SEG * 6), 3));
const lines = new THREE.LineSegments(lGeo, new THREE.LineBasicMaterial({
  vertexColors: true, transparent: true, blending: THREE.AdditiveBlending,
  depthWrite: false,
}));
lines.frustumCulled = false;
group.add(lines);

const TYPE = [
  { rMin: 0.0, rMax: 1.6, size: 2.6, life: 26, burst: 4 },
  { rMin: 1.2, rMax: 2.9, size: 1.5, life: 16, burst: 2 },
  { rMin: 2.3, rMax: 3.9, size: 0.9, life: 10, burst: 1 },
];

let lastSpawn = 0;

function spawn(type, strength, t) {
  const cfg = TYPE[type];
  const i = nCursor;
  nCursor = (nCursor + 1) % MAX_N;
  const dir = new THREE.Vector3().randomDirection();
  const r = cfg.rMin + Math.random() * (cfg.rMax - cfg.rMin);
  nPos[i * 3] = dir.x * r;
  nPos[i * 3 + 1] = dir.y * r * 0.75;
  nPos[i * 3 + 2] = dir.z * r;
  nSeed[i * 3] = Math.random() * 20;
  nSeed[i * 3 + 1] = Math.random() * 20;
  nSeed[i * 3 + 2] = Math.random() * 20;
  nBirth[i] = t;
  nLife[i] = cfg.life * (0.8 + Math.random() * 0.4);
  nSize[i] = cfg.size * (0.75 + 0.5 * strength);
  nType[i] = type;
  nAlive[i] = 1;
  lastSpawn = t;

  // Link to up to 3 nearest living nodes within reach.
  const cand = [];
  for (let j = 0; j < MAX_N; j++) {
    if (!nAlive[j] || j === i) continue;
    const dx = nPos[j * 3] - nPos[i * 3];
    const dy = nPos[j * 3 + 1] - nPos[i * 3 + 1];
    const dz = nPos[j * 3 + 2] - nPos[i * 3 + 2];
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < 3.1 * 3.1) cand.push([d2, j]);
  }
  cand.sort((a, b) => a[0] - b[0]);
  for (let k = 0; k < Math.min(4, cand.length); k++) {
    const si = sCursor;
    sCursor = (sCursor + 1) % MAX_SEG;
    sA[si] = i; sB[si] = cand[k][1]; sBirth[si] = t; sAlive[si] = 1;
  }
}

function nodeAlpha(i, t) {
  // nBirth is a Float32Array: the stored birth time can round UP past the
  // float64 t that wrote it, so a fresh node can read age < 0 in its own
  // spawn frame. Treating that as dead killed it permanently (the alpha
  // loop clears nAlive): ~half of all spawn bursts on a real clock, and
  // ALL of them on a zero-jitter QA clock, whose 0.5 s beat grid is an
  // exact power-of-two multiple of the float32 ULP, freezing the rounding
  // direction. Clamp to zero: age 0 is simply the start of the pop-in.
  const age = Math.max(0, t - nBirth[i]);
  if (age > nLife[i]) return 0;
  const pop = age < 0.25 ? 0.55 + 0.45 * (age / 0.25) : 1.0;
  const fade = 1.0 - Math.max(0, (age - nLife[i] * 0.7) / (nLife[i] * 0.3));
  return pop * fade;
}

const typeColor = () => [PAL.glow, PAL.mid, PAL.accent];

return { // vjw: was `export default {`
  name: 'synapse',
  scene,
  camera,
  trails: false,
  bloom: { strength: 0.5, gain: 0.45 },
  params: { speed: 0.5, complexity: 0.5, fill: 0.5, contrast: 0.5 },
  update(s, dt, t) {
    const P = this.params;
    const spF = drastic(P.speed);
    const conF = 0.6 + 0.8 * P.contrast;
    // Each hit spawns a small burst of nodes — complexity builds fast.
    for (let type = 0; type < 3; type++) {
      const hit = [s.onKick, s.onMid, s.onHigh][type];
      if (hit) {
        const n = Math.max(1, Math.round(TYPE[type].burst * (0.3 + 1.7 * P.complexity)));
        for (let b = 0; b < n; b++) spawn(type, hit, t);
      }
    }
    // Never let the scene sit empty during silence.
    if (t - lastSpawn > 1.2) spawn(1, 0.5, t);

    const cols = typeColor();
    const size = pGeo.attributes.aSize.array;
    const alpha = pGeo.attributes.aAlpha.array;
    const colr = pGeo.attributes.aColor.array;
    for (let i = 0; i < MAX_N; i++) {
      if (!nAlive[i]) { alpha[i] = 0; continue; }
      const a = nodeAlpha(i, t);
      if (a <= 0) { nAlive[i] = 0; alpha[i] = 0; continue; }
      // Organic wander, breathing with the mids.
      const w = dt * (0.14 + 0.3 * s.mids) * spF;
      nPos[i * 3] += Math.sin(t * 0.5 + nSeed[i * 3]) * w;
      nPos[i * 3 + 1] += Math.sin(t * 0.43 + nSeed[i * 3 + 1]) * w * 0.85;
      nPos[i * 3 + 2] += Math.sin(t * 0.37 + nSeed[i * 3 + 2]) * w;
      alpha[i] = Math.min(1.2, a * (0.8 + 0.2 * s.energy) * (nType[i] === 0 ? 1.0 : 0.9) * conF);
      size[i] = nSize[i] * (1 + (nType[i] === 0 ? s.kick * 0.8 : s.highs * 0.25));
      const c = cols[nType[i]];
      colr[i * 3] = c.r; colr[i * 3 + 1] = c.g; colr[i * 3 + 2] = c.b;
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.aSize.needsUpdate = true;
    pGeo.attributes.aAlpha.needsUpdate = true;
    pGeo.attributes.aColor.needsUpdate = true;

    const lp = lGeo.attributes.position.array;
    const lc = lGeo.attributes.color.array;
    for (let i = 0; i < MAX_SEG; i++) {
      let a = 0;
      if (sAlive[i]) {
        const na = sA[i], nb = sB[i];
        if (!nAlive[na] || !nAlive[nb]) { sAlive[i] = 0; }
        else {
          const age = t - sBirth[i];
          const flash = age < 0.35 ? 2.4 - age * 3.5 : 1.0;
          a = Math.min(nodeAlpha(na, t), nodeAlpha(nb, t)) * flash * 0.75
            * (0.65 + 0.35 * s.energy);
          for (let k = 0; k < 3; k++) {
            lp[i * 6 + k] = nPos[na * 3 + k];
            lp[i * 6 + 3 + k] = nPos[nb * 3 + k];
          }
        }
      }
      const c = PAL.mid;
      for (let v = 0; v < 2; v++) {
        lc[i * 6 + v * 3] = c.r * a;
        lc[i * 6 + v * 3 + 1] = c.g * a;
        lc[i * 6 + v * 3 + 2] = c.b * a;
      }
    }
    lGeo.attributes.position.needsUpdate = true;
    lGeo.attributes.color.needsUpdate = true;

    group.rotation.y += dt * (0.09 + s.mids * 0.08) * spF;
    group.rotation.x = Math.sin(t * 0.08) * 0.15;
    camera.position.z = (8.5 - s.kick * 0.4) / (0.6 + 0.8 * P.fill);
  },
  resize(w, h) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  },
};
} // vjw: the factory
