// Copied from donor/vs3/visual_kit/src/lib/model-shapes.js (the friends' engine, used with permission, 2026-11-19).
// vjw: verbatim.
// The built-in models for the limitless 3d scene, built from math at
// runtime: no files to ship, no licenses to track, and each one is a
// few milliseconds to make. Every builder returns a plain group; the
// scene sends it through finishModel (lib/model-load.js) so a built-in
// lands the same size and place as a dropped file.
//
// Color stays on the palette. Most surfaces are chrome that reflects the
// palette room; the few tinted parts carry userData.lfxPal (a slot and
// how far toward it the base color sits) or userData.lfxGlow (an
// emissive slot), and the scene keeps them on the current palette every
// frame, so a palette morph glides through them too.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const SHAPES = ['knot', 'crystal', 'shell', 'lotus', 'orb', 'helix'];

// Small deterministic generator, so a built-in is the same model in
// every window and every session.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function chrome(roughness = 0.22) {
  return new THREE.MeshStandardMaterial({ color: 0xe8e8e8, metalness: 0.9, roughness });
}

// A surface tinted toward a palette slot. The scene recolors it.
function tinted(slot, mix, opts = {}) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.2, roughness: 0.4, ...opts });
  m.userData.lfxPal = { slot, mix };
  return m;
}

function glowing(slot, gain) {
  const m = new THREE.MeshStandardMaterial({ color: 0x080808, metalness: 0, roughness: 0.6 });
  m.userData.lfxGlow = { slot, gain };
  return m;
}

// A grid-sampled parametric surface: f(u, v, out) writes the point for
// u, v in 0..1. Indexed, with normals computed from the surface.
function surface(f, segU, segV) {
  const pos = new Float32Array((segU + 1) * (segV + 1) * 3);
  const uv = new Float32Array((segU + 1) * (segV + 1) * 2);
  const p = new THREE.Vector3();
  let k = 0;
  for (let i = 0; i <= segU; i++) {
    for (let j = 0; j <= segV; j++) {
      f(i / segU, j / segV, p);
      pos[k * 3] = p.x; pos[k * 3 + 1] = p.y; pos[k * 3 + 2] = p.z;
      uv[k * 2] = i / segU; uv[k * 2 + 1] = j / segV;
      k++;
    }
  }
  const idx = [];
  for (let i = 0; i < segU; i++) {
    for (let j = 0; j < segV; j++) {
      const a = i * (segV + 1) + j, b = a + segV + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- the six

// A (2,3) torus knot in chrome, the classic.
function knot() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.TorusKnotGeometry(1, 0.3, 360, 48, 2, 3), chrome()));
  return g;
}

// A quartz cluster: hexagonal points fanning out of a dark rock.
function crystal() {
  const r = rng(7);
  const up = new THREE.Vector3(0, 1, 0);
  const parts = [];
  for (let i = 0; i < 13; i++) {
    const len = 0.7 + r() * 1.5;
    const rad = 0.1 + r() * 0.16;
    const tip = rad * (1.6 + r());
    const body = new THREE.CylinderGeometry(rad, rad * 1.05, len, 6, 1);
    body.translate(0, len / 2, 0);
    const cone = new THREE.ConeGeometry(rad, tip, 6, 1);
    cone.translate(0, len + tip / 2, 0);
    const prism = mergeGeometries([body, cone]);
    prism.rotateY(r() * Math.PI);
    const theta = r() * Math.PI * 2;
    const phi = i === 0 ? 0 : 0.2 + r() * 0.8;
    const dir = new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
    prism.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir));
    parts.push(prism);
  }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(mergeGeometries(parts), new THREE.MeshPhysicalMaterial({
    color: 0xf4f4f4, metalness: 0.3, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.04, flatShading: true,
  })));
  const rock = new THREE.IcosahedronGeometry(0.5, 1);
  rock.scale(1.35, 0.42, 1.2);
  rock.translate(0, -0.05, 0);
  g.add(new THREE.Mesh(rock, tinted('shadow', 0.85, { roughness: 0.9, metalness: 0.05, flatShading: true })));
  return g;
}

// A spiral seashell (the classic parametric conch), growth ridges
// running around it, pearl toward the mid color.
function shell() {
  const TAU6 = 6 * Math.PI;
  const geo = surface((a, b, p) => {
    const u = a * TAU6;
    const v = b * Math.PI * 2;
    const eu = Math.exp(u / TAU6);
    const c2 = Math.cos(v / 2) ** 2;
    const ridge = 1 + 0.035 * Math.sin(u * 9);
    const x = 2 * (1 - eu) * Math.cos(u) * c2 * ridge;
    const y = 2 * (-1 + eu) * Math.sin(u) * c2 * ridge;
    const z = 1 - Math.exp(u / (3 * Math.PI)) - Math.sin(v) + eu * Math.sin(v);
    p.set(x, -z, y);
  }, 300, 56);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, tinted('mid', 0.35, { roughness: 0.28, metalness: 0.35, side: THREE.DoubleSide })));
  return g;
}

// A lotus: three rings of cupped petals around a glowing seed pod.
function lotus() {
  const petal = (L, W, cup) => surface((a, b, p) => {
    const w = W * Math.pow(Math.sin(Math.PI * Math.min(1, a * 1.02)), 0.7);
    const v = b * 2 - 1;
    p.set(v * w, cup * a * a + v * v * w * 0.45, a * L);
  }, 28, 12);
  const rings = [
    { n: 9, L: 1.0, W: 0.34, cup: 0.25, elev: 0.38, off: 0 },
    { n: 9, L: 0.86, W: 0.3, cup: 0.3, elev: 0.75, off: Math.PI / 9 },
    { n: 7, L: 0.62, W: 0.24, cup: 0.32, elev: 1.1, off: 0.2 },
  ];
  const parts = [];
  for (const rg of rings) {
    for (let i = 0; i < rg.n; i++) {
      const g = petal(rg.L, rg.W, rg.cup);
      g.rotateX(-rg.elev);
      g.rotateY(rg.off + (i / rg.n) * Math.PI * 2);
      parts.push(g);
    }
  }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(mergeGeometries(parts), tinted('accent', 0.3, {
    roughness: 0.35, metalness: 0.15, side: THREE.DoubleSide,
  })));
  const pod = new THREE.CylinderGeometry(0.2, 0.24, 0.22, 32);
  pod.translate(0, 0.12, 0);
  g.add(new THREE.Mesh(pod, glowing('glow', 1.1)));
  return g;
}

// A geodesic lattice: chrome struts and nodes around a glowing core.
function orb() {
  const ico = new THREE.IcosahedronGeometry(1, 2);
  const pa = ico.getAttribute('position');
  const keyOf = (i) => `${pa.getX(i).toFixed(4)},${pa.getY(i).toFixed(4)},${pa.getZ(i).toFixed(4)}`;
  const verts = new Map();
  const idOf = (i) => {
    const k = keyOf(i);
    if (!verts.has(k)) verts.set(k, new THREE.Vector3().fromBufferAttribute(pa, i));
    return k;
  };
  const edges = new Map();
  for (let f = 0; f < pa.count; f += 3) {
    const ids = [idOf(f), idOf(f + 1), idOf(f + 2)];
    for (let e = 0; e < 3; e++) {
      const a = ids[e], b = ids[(e + 1) % 3];
      edges.set(a < b ? `${a}|${b}` : `${b}|${a}`, [a, b]);
    }
  }
  const up = new THREE.Vector3(0, 1, 0);
  const parts = [];
  for (const [a, b] of edges.values()) {
    const va = verts.get(a), vb = verts.get(b);
    const len = va.distanceTo(vb);
    const strut = new THREE.CylinderGeometry(0.022, 0.022, len, 6, 1);
    strut.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, vb.clone().sub(va).normalize()));
    strut.translate((va.x + vb.x) / 2, (va.y + vb.y) / 2, (va.z + vb.z) / 2);
    parts.push(strut);
  }
  for (const v of verts.values()) {
    const node = new THREE.IcosahedronGeometry(0.05, 1);
    node.translate(v.x, v.y, v.z);
    parts.push(node);
  }
  // Every part must share one attribute set to merge; the struts carry
  // uvs, the nodes do not, so both are cut down to position and normal.
  for (const p of parts) for (const k of Object.keys(p.attributes)) if (k !== 'position' && k !== 'normal') p.deleteAttribute(k);
  const merged = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  const g = new THREE.Group();
  g.add(new THREE.Mesh(merged, chrome(0.18)));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.42, 48, 24), glowing('glow', 1.3)));
  return g;
}

// A double helix: two chrome strands joined by palette rungs.
function helix() {
  const turns = 2.5, R = 0.55, pitch = 0.62;
  const strand = (phase) => {
    const pts = [];
    for (let i = 0; i <= 200; i++) {
      const t = (i / 200) * turns * Math.PI * 2;
      pts.push(new THREE.Vector3(R * Math.cos(t + phase), (t / (Math.PI * 2)) * pitch, R * Math.sin(t + phase)));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 480, 0.075, 14);
  };
  const g = new THREE.Group();
  g.add(new THREE.Mesh(mergeGeometries([strand(0), strand(Math.PI)]), chrome(0.2)));
  const rungs = [];
  const up = new THREE.Vector3(0, 1, 0);
  const n = Math.round(turns * 10);
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * turns * Math.PI * 2;
    const y = (t / (Math.PI * 2)) * pitch;
    const a = new THREE.Vector3(R * Math.cos(t), y, R * Math.sin(t));
    const b = new THREE.Vector3(R * Math.cos(t + Math.PI), y, R * Math.sin(t + Math.PI));
    const rung = new THREE.CylinderGeometry(0.03, 0.03, a.distanceTo(b) * 0.92, 8, 1);
    rung.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, b.clone().sub(a).normalize()));
    rung.translate(0, y, 0);
    rungs.push(rung);
  }
  g.add(new THREE.Mesh(mergeGeometries(rungs), tinted('accent', 0.7, { roughness: 0.3, metalness: 0.4 })));
  return g;
}

const BUILDERS = { knot, crystal, shell, lotus, orb, helix };

export function buildShape(name) {
  const f = BUILDERS[name] || BUILDERS.knot;
  return f();
}
