// Copied from donor/vs3/visual_kit/src/lib/model-scans.js (the friends' engine, used with permission, 2026-11-19).
// vjw: the scan URL is our static path /vs3/models/ (web/public/vs3/). The scans are not copied there yet: the scene's
// default model is the math knot and nothing in our app picks a scan.
// The mesh built-ins of the limitless 3d scene: a human skull, a
// marble bust and a complete hand, all public domain models (sources and
// terms in vendor/models/LICENSE.txt), cut down and packed by
// tools/build_limitless_models.mjs. A scan arrives by fetch the first
// time it is picked, so where the math shapes are instant these are a
// promise; the scene keeps showing what it has until one lands.
//
// Color stays on the palette the same way as the math shapes: every
// scan's surface carries userData.lfxPal, and the scene keeps it on the
// current palette every frame.
import * as THREE from 'three';
import { unzlibSync } from 'three/examples/jsm/libs/fflate.module.js';

export const SCANS = ['skull', 'bust', 'hand'];
// Refresh changed geometry in existing installations without changing preset ids.
const REVISIONS = { skull: '20260927', hand: '20260927' };

// Each scan's surface: the skull is bone, the bust polished marble, the
// hand a cast of palette-colored metal.
const LOOKS = {
  skull: () => {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.05, roughness: 0.55 });
    m.userData.lfxPal = { slot: 'glow', mix: 0.22 };
    return m;
  },
  bust: () => {
    const m = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, metalness: 0, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.12,
    });
    m.userData.lfxPal = { slot: 'mid', mix: 0.1 };
    return m;
  },
  hand: () => {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.6, roughness: 0.32 });
    m.userData.lfxPal = { slot: 'accent', mix: 0.45 };
    return m;
  },
};

// The packed file to an indexed geometry (the format is described at
// the top of the build tool): positions quantized to 16 bits over the
// model's box and delta coded in first-use order, triangle indices as
// distances back from the next new vertex.
export function decodeScan(buf) {
  const raw = unzlibSync(new Uint8Array(buf));
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const magic = String.fromCharCode(raw[0], raw[1], raw[2], raw[3]);
  if (magic !== 'LM3D' || dv.getUint32(4, true) !== 1) throw new Error('not a limitless 3d scan');
  const V = dv.getUint32(8, true), T = dv.getUint32(12, true);
  const lo = [0, 1, 2].map((k) => dv.getFloat32(16 + k * 4, true));
  const span = [0, 1, 2].map((k) => (dv.getFloat32(28 + k * 4, true) - lo[k]) / 65535);
  const pos = new Float32Array(V * 3);
  let o = 40;
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < V; i++, o += 6) {
    x = (x + dv.getUint16(o, true)) & 0xffff;
    y = (y + dv.getUint16(o + 2, true)) & 0xffff;
    z = (z + dv.getUint16(o + 4, true)) & 0xffff;
    pos[i * 3] = lo[0] + x * span[0];
    pos[i * 3 + 1] = lo[1] + y * span[1];
    pos[i * 3 + 2] = lo[2] + z * span[2];
  }
  if (o % 4) o += 4 - (o % 4);
  const wide = V > 65535;
  const idx = wide ? new Uint32Array(T * 3) : new Uint16Array(T * 3);
  let next = 0;
  for (let i = 0; i < T * 3; i++) {
    const c = wide ? dv.getUint32(o, true) : dv.getUint16(o, true);
    o += wide ? 4 : 2;
    idx[i] = c === 0 ? next++ : next - c;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  return g;
}

// Fetched on first pick, never at import: a session that never picks a
// scan never downloads one. Two addresses, the visage idiom: the
// homepage hero bundles modules somewhere else, and the page's own base
// finds the renderer folder there.
const pending = new Map();
export function loadScan(name) {
  if (!SCANS.includes(name)) return Promise.reject(new Error(`no scan called ${name}`));
  if (pending.has(name)) return pending.get(name);
  const urls = [`/vs3/models/${name}.lm3d${REVISIONS[name] ? `?v=${REVISIONS[name]}` : ''}`]; // vjw: our static path, was import.meta.url + document.baseURI
  const tryAt = (i) => fetch(urls[i])
    .then((r) => { if (!r.ok) throw new Error(`${name} ${r.status}`); return r.arrayBuffer(); })
    .catch((e) => {
      if (i + 1 < urls.length && urls[i + 1] !== urls[i]) return tryAt(i + 1);
      throw e;
    });
  const p = tryAt(0).then((buf) => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(decodeScan(buf), LOOKS[name]()));
    return g;
  });
  // A failed fetch may be retried by a later pick.
  p.catch(() => pending.delete(name));
  pending.set(name, p);
  return p;
}
