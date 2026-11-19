// Copied from donor/vs3/visual_kit/src/scenes/visage.js (the friends' engine, used with permission, 2026-11-19).
// vjw: wrapped in a factory (one scene object per layer), the frond texture kept above it, the head loaded from our
// static copy /vs3/visage/ (web/public/vs3/), the blob Worker of the SDF fallback stripped. agents/guides/guide_vs3_port.md
// Scene: visage, a carved head that is alive. A sculpted face floats in
// the dark, skin engraved with glowing ornament that keeps flowing, eyes
// that look around and blink, fronds curling out of the crown with
// mushrooms riding them. Drag it to turn and tilt it; the angle holds
// when you let go.
import * as THREE from 'three';
import { PAL, drastic, scenePointer } from '../lib/common.js';
import { NOISE_GLSL } from '../lib/noise-glsl.js';

// vjw: moved here from below: the fronds' texture, ABOVE the factory, so every layer shares one texture (the host
// frees geometries and materials, no textures). A layer writes it in update() and draws at once (vs3/host.ts).
const FR_S = 40;
const FR_ROWS = 256;
const FR_RING = 7;
const frData = new Float32Array((FR_S + 1) * FR_ROWS * 4);
const frTex = new THREE.DataTexture(frData, FR_S + 1, FR_ROWS, THREE.RGBAFormat, THREE.FloatType);
frTex.minFilter = frTex.magFilter = THREE.NearestFilter;
frTex.needsUpdate = true;

export default function create() { // vjw

const scene = new THREE.Scene();
scene.background = PAL.bg;
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
camera.position.set(0, 0, 7);

// ---------------------------------------------------------------- the head
// A signed distance field sculpted from ellipsoids, capsules and cones,
// polygonized once into a half mesh (x >= 0) with narrow-band surface
// nets; the other half is the same mesh mirrored. Half because the face
// opens down the middle. Every function below is self-contained so the
// whole set can be shipped to a worker as source.
// Units: chin at y -1.24, crown near 0.95, face toward +z; one unit is
// about 104 mm of a real head, and the landmarks follow adult facial
// norms (nose about 42 mm wide, mouth about 54 mm, upper lip 22 mm from
// the nose base to the mouth line).
// Two parameters shape the face: F runs masculine (0) to feminine (1),
// S runs soft (0) to strong (1). The mesh is built once at the middle of
// both and morphs toward the four ends on the GPU (see vsMorph).
function vsSmin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
function vsEll(x, y, z, cx, cy, cz, rx, ry, rz) {
  const px = (x - cx) / rx, py = (y - cy) / ry, pz = (z - cz) / rz;
  const k0 = Math.sqrt(px * px + py * py + pz * pz);
  const qx = px / rx, qy = py / ry, qz = pz / rz;
  const k1 = Math.sqrt(qx * qx + qy * qy + qz * qz);
  return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(rx, ry, rz);
}
function vsCap(x, y, z, ax, ay, az, bx, by, bz, r) {
  const pax = x - ax, pay = y - ay, paz = z - az;
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const h = Math.max(0, Math.min(1,
    (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz)));
  const dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
}
// IQ's exact round cone, radius r1 at a to r2 at b.
function vsCone(x, y, z, ax, ay, az, bx, by, bz, r1, r2) {
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  const pax = x - ax, pay = y - ay, paz = z - az;
  const yv = pax * bax + pay * bay + paz * baz;
  const zv = yv - l2;
  const qx = pax * l2 - bax * yv, qy = pay * l2 - bay * yv, qz = paz * l2 - baz * yv;
  const x2 = qx * qx + qy * qy + qz * qz;
  const y2 = yv * yv * l2, z2 = zv * zv * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(zv) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(yv) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + yv * rr) * il2 - r1;
}
function vsHead(x, y, z, F, S) {
  if (F === undefined) { F = 0.5; S = 0.5; }
  x = Math.abs(x);
  const L = (a, b, t) => a + (b - a) * t;
  const sm = vsSmin;
  const sx = (a, b, k) => -vsSmin(-a, -b, k);
  const M = 1 - F;                     // how masculine
  const kS = L(1.5, 0.66, S);          // soft blends wide, strong blends tight
  const bone = L(0.5, 1.5, S);         // how far the bony landmarks stand out
  // ---- skull and face masses
  let d = vsEll(x, y, z, 0, 0.08, -0.16, 0.74, 0.86, 0.92);                    // cranium
  d = sm(d, vsEll(x, y, z, 0, 0.34, 0.28 + 0.22 * F, 0.46, 0.36, 0.3), 0.25);   // round brow of a woman
  d = sm(d, vsEll(x, y, z, 0, -0.42, 0.22, 0.7 - 0.05 * F, 0.84, 0.68), 0.3); // face mass
  d = sm(d, vsCap(x, y, z, 0.6 - 0.07 * F, -0.56, -0.18, 0.3 - 0.07 * F, -1.1 + 0.02 * F, 0.46,
    0.155 - 0.03 * F), 0.24 * kS);                                              // jaw
  d = sm(d, vsEll(x, y, z, 0.57 - 0.06 * F, -0.8, -0.14 + 0.06 * M * bone - 0.06, 0.08, 0.1, 0.08),
    0.1 * kS);                                                                  // jaw angle
  d = sm(d, vsEll(x, y, z, 0, -1.07 + 0.02 * F, 0.78, 0.26 - 0.1 * F, 0.15 - 0.02 * F, 0.16),
    0.14 * kS);                                                                 // chin
  d = sm(d, vsEll(x, y, z, 0.1, -1.1, 0.72 + 0.1 * M * bone - 0.02, 0.08, 0.07, 0.08), 0.06 * kS); // square chin
  d = sm(d, vsEll(x, y, z, 0.5 - 0.02 * F, -0.24 + 0.03 * F, 0.44 + 0.04 * bone, 0.21, 0.12, 0.17),
    0.12 * kS);                                                                 // cheekbone
  d = sm(d, vsEll(x, y, z, 0.4, -0.54 + 0.03 * F, 0.53 + 0.05 * F, 0.2, 0.17, 0.18), 0.16 * kS); // cheek
  d = sm(d, vsEll(x, y, z, 0.26, -0.6, 0.74 + 0.02 * F, 0.13, 0.12, 0.1), 0.08 * kS); // cheek pad
  // the muzzle: the jaws' curve under the mouth, then the skin masses the
  // lips sit on (upper lip over the teeth, lower lip over the chin)
  d = sm(d, vsEll(x, y, z, 0, -0.82, 0.68, 0.36, 0.28, 0.3), 0.14 * kS);      // muzzle
  d = sm(d, vsEll(x, y, z, 0, -0.7, 0.83, 0.25, 0.13, 0.13), 0.1 * kS);       // upper lip mass
  d = sm(d, vsEll(x, y, z, 0, -0.9, 0.8, 0.21, 0.1, 0.12), 0.1 * kS);        // lower lip mass
  d = sm(d, vsEll(x, y, z, 0.25, 0.04, 0.63 + 0.06 * M * bone, 0.28, 0.1 - 0.02 * F, 0.13),
    0.12 * kS);                                                                 // brow
  d = sm(d, vsEll(x, y, z, 0, 0.0, 0.69 + 0.06 * M * bone, 0.12, 0.09, 0.08), 0.1 * kS); // glabella
  d = sx(d, -vsEll(x, y, z, 0.31, -0.135, 0.8, 0.185 + 0.012 * F, 0.1 + 0.01 * F, 0.15),
    0.06 * kS);                                                                 // socket: an almond
  // ---- nose: root, bridge, a tip of two domes, wings set off by a crease,
  // nostrils underneath. Wide and heavy on a man, narrow and lifted on a
  // woman.
  if (x < 0.4 && y > -0.8 && y < 0.2 && z > 0.5) {
    const nw = L(1.14, 0.8, F), ns = L(1.07, 0.86, F);
    const lift = 0.02 * F;
    d = sm(d, vsCone(x / nw * 0.86, y, z, 0, -0.02, 0.78, 0, -0.44 + lift, 1.0, 0.048 * ns, 0.07 * ns),
      0.06 * kS);                                                               // bridge
    d = sm(d, Math.hypot(x - 0.03 * nw, y + 0.5 - lift, z - 1.03 + 0.01 * F) - 0.07 * ns,
      0.035 * kS);                                                              // tip domes
    d = sm(d, vsCap(x, y, z, 0, -0.52 + lift, 1.02 - 0.01 * F, 0, -0.588, 0.912, 0.032 * ns),
      0.035 * kS);                                                              // columella
    d = sm(d, vsEll(x, y, z, 0.135 * nw, -0.555, 0.895, 0.068 * nw, 0.06 * ns, 0.075 * ns),
      0.045 * kS);                                                              // wing
    const cr = 0.005 + 0.009 * S;
    d = sx(d, -vsCap(x, y, z, 0.19 * nw + 0.012, -0.5, 0.872, 0.205 * nw + 0.012, -0.56, 0.862, cr), 0.014);
    d = sx(d, -vsCap(x, y, z, 0.205 * nw + 0.012, -0.56, 0.862, 0.18 * nw + 0.01, -0.615, 0.885, cr), 0.014);
    // nostril, turned along the line from the tip to the wing
    const qx = x - 0.062 * nw, qz = z - 0.972;
    const rx = qx * 0.866 + qz * 0.5, rz = -qx * 0.5 + qz * 0.866;
    d = sx(d, -vsEll(rx, y, rz, 0, -0.598, 0, 0.038 * nw, 0.017, 0.045 * ns), 0.015);
  }
  // ---- mouth: bent round the dental arch (the corners sit back), a
  // philtrum of two ridges and a dimple, an upper lip of three masses
  // under a cupid's bow, a two-lobed lower lip, a crisp mouth line,
  // corners tucked in, the crease under the lower lip.
  if (x < 0.46 && y > -1.06 && y < -0.52 && z > 0.62) {
    const lf = L(0.85, 1.28, F), mw = L(1.05, 0.9, F);
    const zb = z + 0.7 * x * x;
    d = sm(d, vsCap(x, y, zb, 0.028, -0.607, 0.935, 0.046 * mw, -0.708, 0.972, 0.014), 0.02 * kS); // philtral ridge
    d = sx(d, -vsEll(x, y, zb, 0, -0.655, 0.962, 0.018, 0.045, 0.012), 0.015 * kS); // philtrum dimple
    // Lips are swept ellipses: at each x a rounded cross-section whose
    // centre and radii follow the mouth, full in the middle and tapering
    // to a point at the corners, so they roll like real lips instead of
    // reading as two sausages. The upper lip carries the cupid's bow
    // (two peaks either side of a dip) and the tubercle under it; the
    // lower lip is two lobes with a soft groove between.
    const W = 0.255 * mw;                               // half mouth width
    const u = Math.min(1, x / W), taper = Math.sqrt(Math.max(0, 1 - u * u));
    const over = Math.max(0, x - W);
    const bow = Math.exp(-(((x - 0.05 * mw) / 0.026) ** 2));
    const mid = Math.exp(-((x / 0.03) ** 2));
    // upper lip
    const uyc = -0.768 - 0.038 * u * u + 0.006 * bow;
    const uzc = 0.958 - 0.03 * u * u;
    const ury = (0.032 * lf) * taper + 0.005 + 0.008 * bow - 0.004 * mid;
    const urz = (0.036 * lf) * taper + 0.006 + 0.008 * mid;
    const ue = Math.hypot((y - uyc) / ury, (zb - uzc) / urz);
    const lipU = Math.hypot((ue - 1) * Math.min(ury, urz), over);
    // lower lip
    const lyc = -0.862 + 0.046 * u * u - 0.006 * (lf - 1);
    const lzc = 0.95 - 0.034 * u * u;
    const lry = (0.042 * lf) * taper + 0.005;
    const lrz = (0.04 * lf) * taper * (1 - 0.1 * mid) + 0.006;
    const le = Math.hypot((y - lyc) / lry, (zb - lzc) / lrz);
    const lipL = Math.hypot((le - 1) * Math.min(lry, lrz), over);
    d = sm(d, lipU, 0.02 * kS);
    d = sm(d, lipL, 0.02 * kS);
    d = sx(d, -vsEll(x, y + 0.12 * x * x, zb, 0, -0.814, 0.975, 0.25 * mw, 0.006, 0.04), 0.008); // mouth line
    d = sx(d, -(Math.hypot(x - 0.255 * mw, y + 0.818, zb - 0.9) - 0.018), 0.015);             // corner
    d = sm(d, vsEll(x, y, zb, 0.29 * mw, -0.822, 0.86, 0.05, 0.06, 0.05), 0.04 * kS);         // modiolus
    d = sx(d, -vsEll(x, y, zb, 0, -0.95, 0.965, 0.12, 0.016 * (0.6 + 0.6 * S), 0.04), 0.035 * kS); // under-lip crease
    // smile folds, only when the face is strong
    const fr = 0.003 + 0.011 * S;
    d = sx(d, -vsCap(x, y, z, 0.2, -0.63, 0.875, 0.275, -0.84, 0.845, fr), 0.03);
  }
  // ---- ear, leaning back: a rim around a bowl, the bowl low and forward
  if (x > 0.6) {
    const ey = (y + 0.26) * 0.97 - (z + 0.14) * 0.24, ez = (y + 0.26) * 0.24 + (z + 0.14) * 0.97;
    d = sm(d, vsEll(x, ey, ez, 0.79, 0, 0, 0.06, 0.27, 0.15), 0.05);
    d = sx(d, -vsEll(x, ey, ez, 0.835, 0.03, -0.01, 0.032, 0.19, 0.095), 0.025);
    d = sx(d, -vsEll(x, ey, ez, 0.83, -0.07, 0.05, 0.04, 0.07, 0.05), 0.03);
  }
  d = sm(d, vsCone(x, y, z, 0, -0.72, -0.2, 0, -1.8, -0.11, 0.45, 0.4), 0.3);    // neck, closed above the grid floor
  return d;
}

// Surface nets on a hierarchical narrow band: only cells the surface can
// cross are ever evaluated, and only surface cells are ever visited
// after that (a sparse map, never a dense cell array). Returns
// positions, field-gradient normals, a per-vertex ambient occlusion
// term, and indices. The x = lo[0] column is the open midline rim; it
// snaps onto the mirror plane so the halves meet exactly when closed.
function vsNets(lo, h, n) {
  const f = vsHead;
  const nx = n[0], ny = n[1], nz = n[2];
  const val = new Float32Array(nx * ny * nz).fill(NaN);
  const at = (i, j, k) => {
    const g = i + nx * (j + ny * k);
    let v = val[g];
    if (v !== v) { v = f(lo[0] + i * h, lo[1] + j * h, lo[2] + k * h); val[g] = v; }
    return v;
  };
  let S = 8;
  let cells = [];
  for (let k = 0; k + S < nz; k += S) for (let j = 0; j + S < ny; j += S)
    for (let i = 0; i + S < nx; i += S) cells.push(i, j, k);
  const surf = [];
  for (;;) {
    const next = [];
    const band = S * h * 0.866 * 1.5;
    for (let c = 0; c < cells.length; c += 3) {
      const i = cells[c], j = cells[c + 1], k = cells[c + 2];
      let m = 1e9, neg = false, pos = false;
      for (let e = 0; e < 8; e++) {
        const v = at(i + (e & 1) * S, j + ((e >> 1) & 1) * S, k + (e >> 2) * S);
        m = Math.min(m, Math.abs(v));
        if (v < 0) neg = true; else pos = true;
      }
      if (S === 1) { if (neg && pos) surf.push(i, j, k); continue; }
      if (!(neg && pos) && m > band) continue;
      const s = S >> 1;
      for (let e = 0; e < 8; e++) next.push(i + (e & 1) * s, j + ((e >> 1) & 1) * s, k + (e >> 2) * s);
    }
    if (S === 1) break;
    S >>= 1;
    cells = next;
  }
  const key = (i, j, k) => i + nx * (j + ny * k);
  const vmap = new Map();
  const pos = [];
  const E = [0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7];
  const cv = new Float32Array(8);
  for (let c = 0; c < surf.length; c += 3) {
    const i = surf[c], j = surf[c + 1], k = surf[c + 2];
    for (let e = 0; e < 8; e++) cv[e] = val[(i + (e & 1)) + nx * ((j + ((e >> 1) & 1)) + ny * (k + (e >> 2)))];
    let sx = 0, sy = 0, sz = 0, cnt = 0;
    for (let q = 0; q < 24; q += 2) {
      const a = E[q], b = E[q + 1];
      const va = cv[a], vb = cv[b];
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      sx += (a & 1) + ((b & 1) - (a & 1)) * t;
      sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
      sz += (a >> 2) + ((b >> 2) - (a >> 2)) * t;
      cnt++;
    }
    vmap.set(key(i, j, k), pos.length / 3);
    pos.push(i === 0 ? lo[0] : lo[0] + (i + sx / cnt) * h,
      lo[1] + (j + sy / cnt) * h, lo[2] + (k + sz / cnt) * h);
  }
  const idx = [];
  const V = (i, j, k) => { const v = vmap.get(key(i, j, k)); return v === undefined ? -1 : v; };
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d);
  };
  // every sign-changing grid edge belongs to exactly one surface cell as
  // that cell's edge from its min corner, so visiting surface cells emits
  // each quad once
  for (let c = 0; c < surf.length; c += 3) {
    const i = surf[c], j = surf[c + 1], k = surf[c + 2];
    const g = i + nx * (j + ny * k);
    const v0 = val[g] < 0;
    if (v0 !== (val[g + 1] < 0)) quad(V(i, j - 1, k - 1), V(i, j, k - 1), V(i, j, k), V(i, j - 1, k), !v0);
    if (i === 0) continue;
    if (v0 !== (val[g + nx] < 0)) quad(V(i - 1, j, k - 1), V(i - 1, j, k), V(i, j, k), V(i, j, k - 1), !v0);
    if (v0 !== (val[g + nx * ny] < 0)) quad(V(i - 1, j - 1, k), V(i, j - 1, k), V(i, j, k), V(i - 1, j, k), !v0);
  }
  const nv = pos.length / 3;
  const P = new Float32Array(pos);
  const N = new Float32Array(nv * 3);
  const AO = new Float32Array(nv);
  const e = h * 0.35;
  for (let v = 0; v < nv; v++) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    const a = f(x + e, y - e, z - e), b = f(x - e, y - e, z + e);
    const c = f(x - e, y + e, z - e), d = f(x + e, y + e, z + e);
    let gx = a - b - c + d;
    const gy = -a - b + c + d, gz = -a + b - c + d;
    if (x <= lo[0] + 1e-6) gx = 0;
    const l = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
    const ux = gx / l, uy = gy / l, uz = gz / l;
    N[v * 3] = ux; N[v * 3 + 1] = uy; N[v * 3 + 2] = uz;
    // IQ-style occlusion: how far short of the probe height the field
    // falls along the normal. Deep in the sockets and under the nose it
    // falls short fast.
    let occ = 0, w = 1;
    for (let s = 1; s <= 5; s++) {
      const hh = 0.03 + 0.07 * s;
      occ += w * (hh - f(x + ux * hh, y + uy * hh, z + uz * hh));
      w *= 0.62;
    }
    AO[v] = Math.max(0, Math.min(1, 1 - 1.6 * occ));
  }
  return { pos: P, nrm: N, ao: AO, idx: new Uint32Array(idx) };
}

// Morph targets for the two face knobs. For each vertex of the neutral
// mesh, walk along its normal to where the surface sits at each end of
// each knob (masculine, feminine, soft, strong) and keep that distance
// and the normal there. The GPU blends them, so the knobs morph
// smoothly at any speed. Vertices a knob never moves cost one field
// read.
function vsMorph(m, h) {
  const nv = m.pos.length / 3;
  const P = m.pos, N = m.nrm;
  const ends = [[0, 0.5], [1, 0.5], [0.5, 0], [0.5, 1]];
  const disp = new Float32Array(nv * 4);
  const tn = new Int8Array(nv * 12);
  const e = h * 0.35;
  for (let v = 0; v < nv; v++) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    const nx = N[v * 3], ny = N[v * 3 + 1], nz = N[v * 3 + 2];
    for (let q = 0; q < 4; q++) {
      const F = ends[q][0], S = ends[q][1];
      let t = 0, gx = nx, gy = ny, gz = nz;
      const f0 = vsHead(x, y, z, F, S);
      if (Math.abs(f0) > 2e-5) {
        t = -f0;
        for (let it = 0; it < 3; it++) {
          t = Math.max(-0.2, Math.min(0.2, t));
          const g = vsHead(x + nx * t, y + ny * t, z + nz * t, F, S);
          if (Math.abs(g) < 1e-5) break;
          t -= g;
        }
        t = Math.max(-0.2, Math.min(0.2, t));
        const px = x + nx * t, py = y + ny * t, pz = z + nz * t;
        const a = vsHead(px + e, py - e, pz - e, F, S), b = vsHead(px - e, py - e, pz + e, F, S);
        const c = vsHead(px - e, py + e, pz - e, F, S), d = vsHead(px + e, py + e, pz + e, F, S);
        gx = a - b - c + d; gy = -a - b + c + d; gz = -a + b - c + d;
        if (x <= 1e-6) gx = 0;
        const l = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
        gx /= l; gy /= l; gz /= l;
      }
      disp[v * 4 + q] = t;
      tn[v * 12 + q * 3] = Math.round(gx * 127);
      tn[v * 12 + q * 3 + 1] = Math.round(gy * 127);
      tn[v * 12 + q * 3 + 2] = Math.round(gz * 127);
    }
  }
  return { disp, tn };
}

// Each half hangs on a hinge this far behind the SDF origin (the back of
// the skull), so an accent can swing the face open like doors.
const HINGE_Z = -0.95;
// A blink closes past shut and the eyeball tucks back a little while the
// lids are down (real eyes do): the model's blink was made on its resting
// face, and at the knob ends (feminine, soft) the lids stopped short and
// the eye showed under them when the head tipped up. Ray-cast over seven
// views at every knob corner: covered at 1.3 and 0.02, with no fold.
const BLINK_OVER = 1.3, EYE_TUCK = 0.02;

// Grid over the half head. Counts are 8k+1 so the coarse level tiles.
const NET_H = 0.0115; // ~1.2 mm of a real head: the lips get ten cells
const NET_LO = [0, -2.25, -1.2];
const NET_N = [
  Math.ceil(0.95 / NET_H / 8) * 8 + 1,
  Math.ceil(3.37 / NET_H / 8) * 8 + 1,
  Math.ceil(2.4 / NET_H / 8) * 8 + 1,
];

// The build runs in a worker when the platform allows (the page never
// pays for it); anything that cannot make a blob worker (Node QA, a
// locked-down webview) builds synchronously on first use instead.
let meshData = null;
let meshPending = false;
let wantSync = false;
// The sculpted head: the ICT FaceKit light model (USC ICT, MIT license,
// notice in vendor/visage/), converted by tools/build_visage_head.mjs into
// one binary: the right half with its normals, baked occlusion, and the
// morph deltas for the face knobs, the blink and wide eyes. The SDF head
// above stays as the fallback when the file cannot load.
let icData = null;
function parseHeadBin(buf) {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x48475356) throw new Error('not a visage head');
  const hl = dv.getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hl)));
  const base = 8 + hl;
  const T = { Float32Array, Int8Array, Uint8Array, Uint16Array, Int16Array };
  const out = { header };
  for (const b of header.blocks) {
    let a = new T[b.type](buf, base + b.offset, b.length);
    // 16-bit blocks carry their scale: positions and morph deltas
    if (b.q) { const f = new Float32Array(a.length); for (let i = 0; i < a.length; i++) f[i] = a[i] * b.q; a = f; }
    out[b.name] = a;
  }
  return out;
}
function startSdfBuild() {
  wantSync = true; // vjw: the blob Worker (this file's functions as source, postMessage) stripped: the donor's no-worker path, a synchronous build in the next update
}
// Loaded on the scene's first frame, never at import: a session that
// never visits visage never downloads its head. Two addresses, because
// the homepage hero bundles this module somewhere else; the page's own
// base finds the renderer folder there.
let headAsked = false;
function ensureHead() {
  if (headAsked) return;
  headAsked = true;
  if (typeof fetch !== 'function' || typeof location === 'undefined') { startSdfBuild(); return; }
  meshPending = true;
  const urls = [import.meta.env.BASE_URL + 'vs3/visage/head.bin']; // vjw: our static copy, was import.meta.url + document.baseURI
  const tryAt = (i) => fetch(urls[i])
    .then((r) => { if (!r.ok) throw new Error('head ' + r.status); return r.arrayBuffer(); })
    .then((buf) => { icData = parseHeadBin(buf); meshPending = false; })
    .catch(() => {
      if (i + 1 < urls.length && urls[i + 1] !== urls[i]) return tryAt(i + 1);
      meshPending = false;
      startSdfBuild();
      return null;
    });
  tryAt(0);
}

// --------------------------------------------------------------- materials
const uniforms = {
  uTime: { value: 0 },
  uFlow: { value: 0 },       // ornament drift (speed-scaled time)
  uFreq: { value: 1.6 },     // ornament noise frequency (complexity)
  uBands: { value: 5.0 },    // contour count (complexity)
  uSharp: { value: 3.0 },    // motif territory sharpness (1 = soft blends)
  uSeed: { value: 0 },       // contour phase: accents slide the rings
  uGlow: { value: 0.5 },     // groove light (energy)
  uKick: { value: 0 },
  uHighs: { value: 0 },
  uOpen: { value: 0 },
  uContrast: { value: 0.5 },
  uClay: { value: 0 },        // QA: plain sculpt, no ornament
  uSpirit: { value: 0 },
  uMorph: { value: new THREE.Vector4() },
  uKnob: { value: new THREE.Vector2() },
  uLid: { value: new THREE.Vector2() },
  uNsc: { value: 2 },
  uIct: { value: 0 },
  uKeyDir: { value: new THREE.Vector3(-0.55, 0.6, 0.75).normalize() },
  uFillDir: { value: new THREE.Vector3(0.1, -1.0, 0.45).normalize() },
  uRimDir: { value: new THREE.Vector3(0.35, 0.45, -1.0).normalize() },
  uColBg: { value: PAL.bg },
  uColShadow: { value: PAL.shadow },
  uColMid: { value: PAL.mid },
  uColAccent: { value: PAL.accent },
  uColGlow: { value: PAL.glow },
};

const PAL_GLSL = /* glsl */`
  uniform vec3 uColBg, uColShadow, uColMid, uColAccent, uColGlow;
  uniform float uContrast;
  vec3 grade(vec3 c) {
    float g = 0.7 + uContrast * 0.9;
    return pow(max(c, 0.0), vec3(g));
  }`;

// The ornament is phasor scrollwork: every motif (rings around the eyes,
// mouth and brow jewel; spirals on the temples, cheeks, crown, jaw and
// the back of the skull) contributes a unit phasor weighted by distance,
// and the carved lines are where the phase of the SUM crosses zero. Lines
// flow continuously from one motif into the next the way hand-cut
// scrollwork does, with a pinwheel knot wherever two motifs cancel.
// Mirrored left to right like face paint. uPhase slides every line along
// its own family (rings breathe outward, spirals wind in).
const skinMat = new THREE.ShaderMaterial({
  uniforms,
  side: THREE.DoubleSide,
  vertexShader: /* glsl */`
    attribute float aAo;
    attribute vec4 aDisp;
    attribute vec3 aN0, aN1, aN2, aN3;
    attribute vec3 aDF, aNF, aDS, aNS, aBlink, aWide;
    uniform vec4 uMorph; // SDF head: weights toward masculine, feminine, soft, strong
    uniform vec2 uKnob;  // sculpted head: feminine and strong, each -1..1
    uniform vec2 uLid;   // sculpted head: blink and wide, 0..1
    uniform float uNsc, uIct;
    varying vec3 vObj;
    varying vec3 vN;
    varying vec3 vW;
    varying float vAo;
    varying float vLid;
    void main() {
      vec3 p, n;
      // the eyelids are exactly the skin the blink moves: keep them clean
      vLid = smoothstep(0.0015, 0.012, length(aBlink));
      if (uIct > 0.5) {
        // the sculpted head: linear morph deltas for both knobs and the
        // lids, normal deltas for the knobs. The strong delta already
        // spares the lids (the builder), and the blink closes past shut
        // so the lids always meet (BLINK_OVER).
        p = position + aDF * uKnob.x + aDS * uKnob.y + aBlink * (uLid.x * ${BLINK_OVER.toFixed(2)}) + aWide * uLid.y;
        n = normal + (aNF * uKnob.x + aNS * uKnob.y) * uNsc;
      } else {
        // the SDF head: slide each vertex along its normal toward the
        // surface of each end, and blend the normals the same way
        p = position + normal * dot(aDisp, uMorph);
        n = normal + (aN0 - normal) * uMorph.x + (aN1 - normal) * uMorph.y
          + (aN2 - normal) * uMorph.z + (aN3 - normal) * uMorph.w;
      }
      // the ornament and paint read the rest pose, so they ride the skin
      // while the knobs and the blink move it
      vObj = position + vec3(0.0, 0.0, ${HINGE_Z.toFixed(3)});
      vAo = aAo;
      vec4 w = modelMatrix * vec4(p, 1.0);
      vW = w.xyz;
      vN = normalize(mat3(modelMatrix) * normalize(n));
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: /* glsl */`
    precision highp float;
    ${NOISE_GLSL}
    ${PAL_GLSL}
    uniform float uTime, uFlow, uFreq, uBands, uSeed, uGlow, uKick, uHighs, uOpen, uClay, uSpirit, uSharp;
    uniform vec3 uKeyDir, uFillDir, uRimDir;
    varying vec3 vObj;
    varying vec3 vN;
    varying vec3 vW;
    varying float vAo;
    varying float vLid;

    // Each motif returns its phasor times its weight, and the weight (z).
    // Weights are raised to uSharp: every territory stays where it was,
    // but each point belongs mostly to one motif, so where two motifs meet
    // the lines fade across a short seam instead of interfering into a
    // wide band of broken dashes.
    vec3 rings(vec3 p, vec3 c, float sig, float k) {
      vec3 d = p - c;
      float r2 = dot(d, d);
      float w = exp(-uSharp * r2 / (sig * sig));
      float ph = k * sqrt(r2);
      return w * vec3(cos(ph), sin(ph), 1.0);
    }
    vec3 spiral(vec3 p, vec3 c, vec3 n, float sig, float arms, float k, float spin) {
      vec3 d = p - c;
      float r2 = dot(d, d);
      float w = exp(-uSharp * r2 / (sig * sig));
      vec3 t1 = normalize(cross(n, vec3(0.0, 0.0, 1.0)) + vec3(0.0, 1e-4, 0.0));
      vec3 t2 = cross(n, t1);
      float th = atan(dot(d, t2), dot(d, t1) + 1e-6);
      float ph = arms * (th + spin) + k * log(max(sqrt(r2), 1e-3));
      return w * vec3(cos(ph), sin(ph), 1.0);
    }
    // chevrons down the nose: one field on the midline (|x| keeps the
    // mirror pair in phase), weighted to own the nose so the side motifs
    // never interfere into broken fragments there
    vec3 chevron(vec3 p, vec3 c, vec3 r, float k, float wk) {
      vec3 d = (p - c) / r;
      float w = exp(-uSharp * dot(d, d)) * pow(wk, uSharp);
      float ph = k * (p.y - 0.6 * abs(p.x));
      return w * vec3(cos(ph), sin(ph), 1.0);
    }
    // vertical bars for motifs on the midline (the chin): |x| keeps the
    // mirror pair in phase, and the crease at x = 0 is a line of its own
    vec3 vbars(vec3 p, vec3 c, float sig, float k) {
      vec3 d = p - c;
      float w = exp(-uSharp * dot(d, d) / (sig * sig));
      float ph = k * abs(p.x);
      return w * vec3(cos(ph), sin(ph), 1.0);
    }
    // One side's motif set. Called for the point and for its mirror image
    // and summed, so the field is symmetric AND smooth across the middle
    // (a plain abs(x) fold creases every line into a V on the midline).
    // Midline motifs count twice, so they carry half weight.
    vec3 side(vec3 p) {
      float kr = uBands;              // ring wavenumber
      float ks = uBands * 0.16;       // spiral tightness
      float sp = uFlow * 0.6;
      vec3 A = vec3(0.0);
      A += rings(p, vec3(0.31, -0.135, 0.7), 0.19, kr);
      A += rings(p, vec3(0.0, 0.36, 0.755), 0.22, kr) * 0.5;
      A += vbars(p, vec3(0.0, -1.07, 0.86), 0.17, kr * 0.9) * 0.5;
      A += chevron(p, vec3(0.0, -0.3, 0.97), vec3(0.13, 0.34, 0.24), kr * 0.75, 1.4);
      A += spiral(p, vec3(0.6, 0.26, 0.42), normalize(vec3(0.75, 0.2, 0.6)), 0.26, 2.0, ks, sp);
      A += spiral(p, vec3(0.47, -0.47, 0.64), normalize(vec3(0.5, -0.15, 0.85)), 0.19, 1.0, -ks, -sp);
      A += spiral(p, vec3(0.34, 0.8, -0.1), normalize(vec3(0.35, 0.9, -0.1)), 0.36, 3.0, ks, sp * 0.7);
      A += spiral(p, vec3(0.42, 0.04, -0.86), normalize(vec3(0.4, 0.1, -0.9)), 0.36, 2.0, -ks, sp * 0.8);
      A += spiral(p, vec3(0.56, -0.82, 0.16), normalize(vec3(0.9, -0.3, 0.3)), 0.22, 1.0, ks, -sp);
      return A;
    }
    // returns (phase, coherence)
    vec2 ornament(vec3 p) {
      vec3 A = side(p) + side(vec3(-p.x, p.y, p.z));
      // everywhere else: slow contour flow, symmetric by summing both
      // sides; quieter on the face so the features read first
      vec3 w = vec3(0.0, uFlow * 0.25, uFlow * 0.4);
      float nz = snoise(p * uFreq + w) + snoise(vec3(-p.x, p.y, p.z) * uFreq + w);
      float phn = nz * 6.2831 * 0.8 + p.y * uBands * 0.5;
      float face = smoothstep(0.35, 0.6, p.z) * smoothstep(-1.25, -1.0, p.y) * (1.0 - smoothstep(0.45, 0.6, p.y));
      float w0 = pow(0.12 * (1.0 - 0.75 * face), uSharp);
      A += w0 * vec3(cos(phn), sin(phn), 1.0);
      return vec2(atan(A.y, A.x), length(A.xy) / A.z);
    }

    vec3 bump(vec3 N, vec3 pos, float hgt) {
      vec3 sx = dFdx(pos), sy = dFdy(pos);
      vec3 r1 = cross(sy, N), r2 = cross(N, sx);
      float det = dot(sx, r1);
      vec2 dh = vec2(dFdx(hgt), dFdy(hgt));
      vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
      return normalize(abs(det) * N - grad);
    }

    void main() {
      vec3 N = normalize(vN);
      vec3 V = normalize(cameraPosition - vW);
      vec2 om = ornament(vObj);
      float s = cos(om.x - uSeed * 6.2831853);
      float fw = fwidth(s) * 1.1 + 1e-4;
      // where motifs cancel, lines fade out cleanly instead of breaking
      // into dashes
      float coh = smoothstep(0.22, 0.55, om.y);
      // Clean zones read as skin, never carving: the lips (stained) and
      // the ears (Alec 2026-09-24: the carving runs over the nose, never
      // the ears, and the nose wears the skin's own color).
      vec3 q = vec3(abs(vObj.x), vObj.y, vObj.z);
      // landmarks of the sculpted head: nasion y -0.08, nose tip -0.45,
      // nose base -0.59, mouth line -0.81, chin -1.08
      float ears = (1.0 - smoothstep(0.85, 1.15, length((q - vec3(0.78, -0.3, -0.26)) / vec3(0.14, 0.33, 0.2))))
        * smoothstep(0.62, 0.68, q.x);
      float my = q.y + 0.815 + 0.25 * q.x * q.x;
      float lips = (1.0 - smoothstep(0.85, 1.1, length(vec2(q.x / 0.255, my / 0.115))))
        * smoothstep(0.78, 0.86, q.z);
      float clean = max(max(ears, lips), vLid);
      // lines closer together than a couple of pixels fade to their mean
      // instead of breaking into blocky fragments (the bad-jpeg look)
      float dens = 1.0 - smoothstep(0.3, 0.85, fw);
      float line = smoothstep(0.9 - fw, 0.9 + fw, s) * coh * (1.0 - clean) * dens;         // the ridge
      float halo = (smoothstep(0.62 - fw, 0.62 + fw, s) * coh * (1.0 - clean) * dens) - line; // its shoulder
      if (!gl_FrontFacing) {
        // Inside of the shell, seen only while the face is open: dark
        // carved wood with the same scrollwork burning through it.
        vec3 c = uColShadow * 0.3 + mix(uColAccent, uColGlow, 0.5) * halo * 0.12;
        c = mix(c, mix(uColAccent, uColGlow, 0.5) * 0.7, line);
        gl_FragColor = vec4(grade(c * (0.35 + 0.6 * uOpen)), 1.0);
        return;
      }
      if (uSpirit > 0.5) {
        // The face inside the face: a smaller head made of light, seen
        // only through the opening. Dark body, lines and rim burning,
        // two lit eyes.
        float fr = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.0);
        vec3 q = vec3(abs(vObj.x), vObj.y, vObj.z);
        float eye = exp(-dot(q - vec3(0.31, -0.135, 0.7), q - vec3(0.31, -0.135, 0.7)) * 110.0);
        vec3 c = mix(uColMid * 0.35, uColAccent * 0.8, fr) + uColGlow * fr * fr * 0.6;
        c = mix(c, uColGlow * (1.0 + uGlow), line);
        c += uColGlow * eye * 2.6;
        gl_FragColor = vec4(grade(c * uOpen), 1.0);
        return;
      }
      float hgt = (line + halo * 0.35) * (1.0 - uClay);
      vec3 Nb = bump(N, vW, hgt * 0.004);

      float ao = mix(0.25, 1.0, vAo);
      float key = clamp((dot(Nb, uKeyDir) + 0.25) / 1.25, 0.0, 1.0);
      float fill = clamp(dot(Nb, uFillDir), 0.0, 1.0);
      float fres = pow(1.0 - clamp(dot(Nb, V), 0.0, 1.0), 3.0);
      float rim = fres * clamp(dot(N, uRimDir) + 0.6, 0.0, 1.0);
      float spec = pow(clamp(dot(reflect(-uKeyDir, Nb), V), 0.0, 1.0), 16.0);
      float mott = snoise(vObj * 7.0) * 0.5 + 0.5;

      vec3 base = mix(uColMid, uColShadow, 0.18 * mott * (1.0 - uClay));
      vec3 skin = mix(uColShadow * 0.6, base, smoothstep(0.0, 0.85, key * ao));
      skin = mix(skin, uColGlow, smoothstep(0.7, 1.0, key * ao) * 0.22);
      skin += uColAccent * fill * 0.3 * ao;
      skin += uColGlow * spec * 0.13 * ao;
      skin += mix(uColAccent, uColGlow, 0.4) * rim * 0.7;
      if (uClay < 0.5) {
        // paint: lips stained dark, a lit jewel on the brow
        float lit0 = smoothstep(0.0, 0.85, key * ao);
        skin = mix(skin, mix(uColShadow, uColMid, 0.35 + 0.4 * lit0), lips * 0.7);
        float jd = length(q - vec3(0.0, 0.36, 0.755));
        skin += uColGlow * exp(-jd * jd * 1400.0) * (0.6 + uGlow);
        // ridges: dark shoulders, luminous crests; light runs along them
        skin = mix(skin, uColShadow * 0.3, halo * 0.55);
        float run = 0.5 + 0.5 * sin(om.x * 2.0 - uTime * 2.2);
        float lit = uGlow * (0.3 + 0.7 * run) + uKick;
        vec3 lc = mix(uColAccent, uColGlow, run * 0.6);
        skin = mix(skin, lc * (0.25 + 0.75 * lit), line * 0.85);
      }
      gl_FragColor = vec4(grade(skin), 1.0);
    }`,
});

// ------------------------------------------------------------------ eyes
const eyeUniforms = {
  uTime: uniforms.uTime,
  uPupil: { value: 0.18 },
  uIris: { value: 0.52 },
  uFlare: { value: 0.5 },
  uShut: { value: 0 },
  uKeyDir: uniforms.uKeyDir,
  uContrast: uniforms.uContrast,
  uColBg: { value: PAL.bg },
  uColShadow: { value: PAL.shadow },
  uColMid: { value: PAL.mid },
  uColAccent: { value: PAL.accent },
  uColGlow: { value: PAL.glow },
};
const eyeMat = new THREE.ShaderMaterial({
  uniforms: eyeUniforms,
  vertexShader: /* glsl */`
    varying vec3 vL;
    varying vec3 vN;
    varying vec3 vW;
    void main() {
      vL = normalize(position);
      vec4 w = modelMatrix * vec4(position, 1.0);
      vW = w.xyz;
      vN = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: /* glsl */`
    precision highp float;
    ${NOISE_GLSL}
    ${PAL_GLSL}
    uniform float uTime, uPupil, uIris, uFlare, uShut;
    uniform vec3 uKeyDir;
    varying vec3 vL;
    varying vec3 vN;
    varying vec3 vW;
    void main() {
      // renormalized per pixel: the interpolated direction runs short
      // inside each triangle, and the pupil drew as a polygon up close
      vec3 L = normalize(vL);
      float a = acos(clamp(L.z, -1.0, 1.0));        // angle off the gaze axis
      float az = atan(L.y, L.x);
      float aw = fwidth(a) + 1e-4;
      float iris = 1.0 - smoothstep(uIris - aw, uIris + aw, a);
      float pupil = 1.0 - smoothstep(uPupil - aw, uPupil + aw, a);
      float r = clamp((a - uPupil) / max(uIris - uPupil, 1e-3), 0.0, 1.0);
      float fib = snoise(vec3(az * 3.0, r * 4.0, uTime * 0.15)) * 0.5 + 0.5;
      float rings = 0.5 + 0.5 * sin(r * 22.0 - uTime * 1.3);
      // a human eye: pale white, a lit iris ringed dark, a black pupil
      vec3 ic = mix(uColGlow, uColAccent, smoothstep(0.05, 0.9, r));
      ic *= 0.6 + 0.4 * fib + 0.2 * rings;
      ic *= 0.75 + uFlare;
      float limbal = smoothstep(0.72, 1.0, r) * iris;
      ic = mix(ic, uColShadow * 0.5, limbal * 0.85);
      // the white darkens toward the corners and under the lids
      float wrap = smoothstep(0.2, 1.3, a);
      vec3 sclera = mix(uColMid, uColGlow, 0.62) * (1.0 - 0.55 * wrap) * (0.85 - 0.25 * L.y);
      vec3 c = mix(sclera, ic, iris);
      c = mix(c, uColBg * 0.25, pupil);
      vec3 N = normalize(vN);
      vec3 V = normalize(cameraPosition - vW);
      float spec = pow(clamp(dot(reflect(-uKeyDir, N), V), 0.0, 1.0), 90.0);
      c += uColGlow * spec * 0.9;
      c *= 1.0 - 0.92 * smoothstep(0.35, 0.9, uShut);
      gl_FragColor = vec4(grade(c), 1.0);
    }`,
});

// ------------------------------------------------------------- the figure
// figure: the whole body's pose (turn, tilt, drag). head: shifts the SDF
// origin so the pose pivots about the middle of the skull. Each half hangs
// on a hinge at the back of the skull so the face can open like doors.
const figure = new THREE.Group();
scene.add(figure);
const head = new THREE.Group();
head.position.set(0, 0.28, 0.12);
figure.add(head);
const pivots = [new THREE.Group(), new THREE.Group()]; // [right(+x), left(-x)]
for (const p of pivots) { p.position.set(0, 0, HINGE_Z); head.add(p); }

const EYE_R = 0.14;
const EYE_C = new THREE.Vector3(0.31, -0.13, 0.6);
const eyes = [];
{
  const g = new THREE.SphereGeometry(EYE_R, 48, 32);
  for (let s = 0; s < 2; s++) {
    const m = new THREE.Mesh(g, eyeMat);
    m.position.set(s === 0 ? EYE_C.x : -EYE_C.x, EYE_C.y, EYE_C.z - HINGE_Z);
    pivots[s].add(m);
    eyes.push(m);
  }
}

// Eyelids: a cap over each eyeball that swings down to blink (the old
// animatronic trick). Skin toned, with a dark lash line on the rim.
const lidUniforms = {
  uKeyDir: uniforms.uKeyDir,
  uFillDir: uniforms.uFillDir,
  uContrast: uniforms.uContrast,
  uColBg: { value: PAL.bg },
  uColShadow: { value: PAL.shadow },
  uColMid: { value: PAL.mid },
  uColAccent: { value: PAL.accent },
  uColGlow: { value: PAL.glow },
};
const lidMat = new THREE.ShaderMaterial({
  uniforms: { ...lidUniforms, uLash: { value: 1 } },
  vertexShader: /* glsl */`
    varying vec3 vL;
    varying vec3 vN;
    varying vec3 vW;
    void main() {
      vL = position;
      vec4 w = modelMatrix * vec4(position, 1.0);
      vW = w.xyz;
      vN = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: /* glsl */`
    precision highp float;
    ${PAL_GLSL}
    uniform vec3 uKeyDir, uFillDir;
    uniform float uLash;
    varying vec3 vL;
    varying vec3 vN;
    varying vec3 vW;
    void main() {
      vec3 N = normalize(vN);
      vec3 V = normalize(cameraPosition - vW);
      float key = clamp((dot(N, uKeyDir) + 0.25) / 1.25, 0.0, 1.0);
      float fill = clamp(dot(N, uFillDir), 0.0, 1.0);
      vec3 c = mix(uColShadow * 0.6, uColMid, smoothstep(0.0, 0.85, key * 0.85));
      c += uColAccent * fill * 0.3;
      float rim = abs(vL.y) / ${(EYE_R * 1.1).toFixed(4)};
      c = mix(uColShadow * 0.15, c, 1.0 - uLash * (1.0 - smoothstep(0.02, 0.1, rim)));
      gl_FragColor = vec4(grade(c), 1.0);
    }`,
});
const lidGeo = new THREE.SphereGeometry(EYE_R * 1.1, 36, 12, 0, Math.PI * 2, 0, Math.PI / 2);
const lidMatLo = new THREE.ShaderMaterial({
  uniforms: { ...lidUniforms, uLash: { value: 0.3 } },
  vertexShader: lidMat.vertexShader,
  fragmentShader: lidMat.fragmentShader,
});
const lids = [];
for (let s = 0; s < 2; s++) {
  const up = new THREE.Mesh(lidGeo, lidMat);
  const lo = new THREE.Mesh(lidGeo, lidMatLo);
  up.position.copy(eyes[s].position);
  lo.position.copy(eyes[s].position);
  lo.rotation.z = Math.PI;
  pivots[s].add(up, lo);
  lids.push({ up, lo });
}

// ------------------------------------------------------------------ halo
// A mandala hangs behind the head like a nimbus: two petal rings turning
// against each other over a field of fine rings. It faces the camera and
// never turns with the head.
const haloUniforms = {
  uTime: uniforms.uTime,
  uRot: { value: 0 },
  uPetals: { value: 12 },
  uPulse: { value: 0 },
  uAmt: { value: 0.6 },
  uColAccent: { value: PAL.accent },
  uColGlow: { value: PAL.glow },
  uColMid: { value: PAL.mid },
};
const haloMat = new THREE.ShaderMaterial({
  uniforms: haloUniforms,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    precision highp float;
    uniform float uTime, uRot, uPetals, uPulse, uAmt;
    uniform vec3 uColAccent, uColGlow, uColMid;
    varying vec2 vUv;
    float band(float d, float w) {
      float aa = fwidth(d) * 1.2 + 1e-5;
      return 1.0 - smoothstep(w - aa, w + aa, abs(d));
    }
    void main() {
      vec2 p = (vUv - 0.5) * 2.0;
      float r = length(p);
      float a = atan(p.y, p.x);
      float n = uPetals;
      float p1 = abs(cos((a + uRot) * n * 0.5));
      float p2 = abs(cos((a - uRot * 0.7) * n));
      float l1 = band(r - (0.5 + 0.13 * p1), 0.0035);
      float l1b = band(r - (0.5 + 0.1 * p1), 0.002);
      float l2 = band(r - (0.7 + 0.05 * p2), 0.003);
      float rr = fract(r * 16.0 - uPulse);
      float fine = band(rr - 0.5, 0.035) * smoothstep(0.34, 0.42, r) * (1.0 - smoothstep(0.86, 0.98, r));
      // beads on the outer ring
      float ab = (a + uRot * 0.4) * n / 6.2831853;
      vec2 q = vec2((fract(ab) - 0.5) * 6.2831853 * 0.84 / n, r - 0.84);
      float bead = 1.0 - smoothstep(0.008, 0.013, length(q));
      float fall = smoothstep(0.24, 0.42, r) * (1.0 - smoothstep(0.88, 1.0, r));
      vec3 c = uColAccent * (l1 + l1b * 0.6) + uColGlow * (l2 * 0.8 + bead * 0.9) + uColMid * fine * 0.35;
      gl_FragColor = vec4(c * fall * uAmt, 1.0);
    }`,
});
const halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), haloMat);
halo.scale.setScalar(8.5);
halo.position.set(0, 0.45, -2.6);
halo.renderOrder = -1;
scene.add(halo);

// ---------------------------------------------------------------- orbits
// Glyph bands orbiting the head like the rings of an armillary sphere:
// each a flat band engraved with its own repeating motif (diamonds and
// dots, chevrons, beaded circles), tilted its own way, turning about its
// own axis while the axis itself precesses. They sit in world space, so
// the head turns inside them. Kicks race a spark around every band; an
// accented kick throws the axes to new tilts.
const ORB = [
  { r: 1.7, w: 0.16, type: 0, cells: 40, tilt: [0.35, 0.0, 0.25], spin: 0.21 },
  { r: 2.1, w: 0.2, type: 1, cells: 48, tilt: [-0.55, 0.9, 0.1], spin: -0.15 },
  { r: 2.55, w: 0.17, type: 2, cells: 60, tilt: [1.2, -0.5, 0.4], spin: 0.11 },
];
const orbGroup = new THREE.Group();
scene.add(orbGroup);
const orbUniforms = {
  uAmt: { value: 0.6 },
  uCellK: { value: 1 },
  uColMid: { value: PAL.mid },
  uColAccent: { value: PAL.accent },
  uColGlow: { value: PAL.glow },
};
const orbVert = /* glsl */`
  attribute vec2 aRA;
  varying vec2 vRA;
  varying vec3 vW;
  varying vec3 vN;
  void main() {
    vRA = aRA;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vN = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0));
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const orbFrag = /* glsl */`
  precision highp float;
  uniform float uAmt, uCellK, uType, uCells, uAspect, uSpark, uSparkAmt;
  uniform vec3 uColMid, uColAccent, uColGlow;
  varying vec2 vRA;
  varying vec3 vW;
  varying vec3 vN;
  float lineAt(float d, float w) {
    float aa = fwidth(d) * 1.2 + 1e-5;
    return 1.0 - smoothstep(w - aa, w + aa, abs(d));
  }
  void main() {
    float cells = floor(uCells * uCellK + 0.5);
    float u = vRA.x * cells;
    float v = vRA.y;
    vec2 c = vec2((fract(u) - 0.5) * uAspect * (uCells / cells), v - 0.5);
    float rim = lineAt(v - 0.1, 0.018) + lineAt(v - 0.9, 0.018);
    float m = 0.0, dotc = 0.0;
    if (uType < 0.5) {
      // diamonds, a dot in each, a bead between
      float dm = abs(c.x) + abs(c.y);
      m = lineAt(dm - 0.27, 0.035);
      dotc = 1.0 - smoothstep(0.05, 0.075, length(c));
      vec2 cb = vec2(c.x - sign(c.x) * 0.5 * uAspect * (uCells / cells), c.y);
      dotc += 1.0 - smoothstep(0.035, 0.055, length(cb));
    } else if (uType < 1.5) {
      // chevrons marching round, a dot row under them
      float ch = abs(c.y) * 1.3 + c.x;
      m = lineAt(fract(ch * 2.2) - 0.5, 0.08) * step(abs(c.y), 0.3);
      dotc = 1.0 - smoothstep(0.03, 0.05, length(vec2(c.x, c.y + 0.33)));
    } else {
      // beaded circles, each with a lit heart
      float r = length(c);
      m = lineAt(r - 0.26, 0.03);
      dotc = 1.0 - smoothstep(0.06, 0.09, r);
    }
    vec3 col = uColGlow * rim * 0.7 + uColAccent * m + uColGlow * dotc * 0.8;
    col += uColMid * 0.06;
    // the kick spark: a hot arc racing round the band
    float d = fract(vRA.x - uSpark);
    d = min(d, 1.0 - d);
    col += uColGlow * exp(-d * d * 900.0) * uSparkAmt * (0.4 + rim + m);
    // edge-on bands thin out instead of flaring
    vec3 V = normalize(cameraPosition - vW);
    float face = 0.35 + 0.65 * abs(dot(normalize(vN), V));
    gl_FragColor = vec4(col * uAmt * face, 1.0);
  }`;
const orbs = ORB.map((o, i) => {
  const SEG = 360;
  const pos = new Float32Array((SEG + 1) * 2 * 3);
  const ra = new Float32Array((SEG + 1) * 2 * 2);
  const idx = [];
  for (let k = 0; k <= SEG; k++) {
    const a = (k / SEG) * Math.PI * 2;
    for (let e = 0; e < 2; e++) {
      const r = o.r + (e - 0.5) * o.w;
      const v = k * 2 + e;
      pos.set([Math.cos(a) * r, Math.sin(a) * r, 0], v * 3);
      ra.set([k / SEG, e], v * 2);
    }
    if (k < SEG) { const b = k * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aRA', new THREE.BufferAttribute(ra, 2));
  g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      ...orbUniforms,
      uType: { value: o.type },
      uCells: { value: o.cells },
      // one cell's length along the band over the band's width
      uAspect: { value: (2 * Math.PI * o.r / o.cells) / o.w },
      uSpark: { value: 0 },
      uSparkAmt: { value: 0 },
    },
    vertexShader: orbVert,
    fragmentShader: orbFrag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  const pivot = new THREE.Group();
  pivot.add(mesh);
  orbGroup.add(pivot);
  return {
    o, mesh, pivot, mat,
    tilt: new THREE.Vector3(...o.tilt), tiltT: new THREE.Vector3(...o.tilt), tiltV: new THREE.Vector3(),
    spin: i * 1.7, spark: 0, sparkAmt: 0,
  };
});
const _eo = new THREE.Euler();
const ORB_K = 3.2; // tilt spring stiffness: ~2 s to land a throw
function throwOrbits(rng) {
  for (const b of orbs) {
    b.tiltT.set((rng() * 2 - 1) * 1.3, (rng() * 2 - 1) * 1.3, (rng() * 2 - 1) * 0.6);
  }
}

// ------------------------------------------------------------------ dust
// Motes in a shell around everything, palette-slot per mote, twinkling
// on the highs, drifting upward like spores.
const DUST = 1400;
const dustGeo = new THREE.BufferGeometry();
{
  const rng = mulberry32(99);
  const pos = new Float32Array(DUST * 3);
  const aux = new Float32Array(DUST * 2);
  for (let i = 0; i < DUST; i++) {
    // a slab behind the head, never between it and the camera
    const z = -1.8 - Math.pow(rng(), 0.8) * 12;
    const spread = 1 - z * 0.42;
    pos.set([(rng() * 2 - 1) * spread * 1.6, (rng() * 2 - 1) * spread, z], i * 3);
    aux.set([rng(), rng()], i * 2);
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  dustGeo.setAttribute('aAux', new THREE.BufferAttribute(aux, 2));
}
const dustUniforms = {
  uTime: uniforms.uTime,
  uRise: { value: 0 },
  uTwinkle: { value: 0 },
  uColAccent: { value: PAL.accent },
  uColGlow: { value: PAL.glow },
  uColMid: { value: PAL.mid },
};
const dust = new THREE.Points(dustGeo, new THREE.ShaderMaterial({
  uniforms: dustUniforms,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexShader: /* glsl */`
    uniform float uTime, uRise, uTwinkle;
    attribute vec2 aAux;
    varying vec3 vC;
    varying float vA;
    uniform vec3 uColAccent, uColGlow, uColMid;
    void main() {
      vec3 p = position;
      p.y = mod(p.y + uRise * (0.4 + aAux.x) + 9.0, 18.0) - 9.0;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      float tw = 0.55 + 0.45 * sin(uTime * (1.0 + aAux.y * 3.0) + aAux.x * 40.0);
      vA = (0.25 + 0.75 * tw) * (0.35 + uTwinkle * 0.65);
      vC = aAux.y < 0.5 ? uColGlow : (aAux.y < 0.8 ? uColAccent : uColMid);
      gl_PointSize = min(7.0, (1.0 + aAux.x * 2.2) * (160.0 / max(0.5, -mv.z)));
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */`
    precision highp float;
    varying vec3 vC;
    varying float vA;
    void main() {
      vec2 d = gl_PointCoord - 0.5;
      float a = exp(-dot(d, d) * 18.0) * vA;
      gl_FragColor = vec4(vC * a, 1.0);
    }`,
}));
dust.frustumCulled = false;
scene.add(dust);

const INNER_K = 0.6;
const INNER_C = new THREE.Vector3(0, -0.12, -0.05);
const innerMat = new THREE.ShaderMaterial({
  uniforms: { ...uniforms, uSpirit: { value: 1 } },
  vertexShader: skinMat.vertexShader,
  fragmentShader: skinMat.fragmentShader,
});
const inner = [];
let halves = null;
function buildHead(m) {
  const nv = m.pos.length / 3;
  const g = new THREE.BufferGeometry();
  const p = new Float32Array(m.pos);
  // vertices carry the hinge offset; the skin shader undoes it to read
  // the ornament in SDF space
  for (let v = 0; v < nv; v++) p[v * 3 + 2] -= HINGE_Z;
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.nrm, 3));
  g.setAttribute('aAo', new THREE.BufferAttribute(m.ao, 1));
  g.setAttribute('aDisp', new THREE.BufferAttribute(m.disp, 4));
  const tn = new THREE.InterleavedBuffer(m.tn, 12);
  for (let q = 0; q < 4; q++) g.setAttribute('aN' + q, new THREE.InterleavedBufferAttribute(tn, 3, q * 3, true));
  g.setIndex(new THREE.BufferAttribute(m.idx, 1));
  g.computeBoundingSphere();
  // One mesh, two halves: the left is the right mirrored by its scale
  // (three flips the winding for a mirrored transform).
  buildRootSurface(g);
  halves = [new THREE.Mesh(g, skinMat), new THREE.Mesh(g, skinMat)];
  halves[1].scale.x = -1;
  for (let s = 0; s < 2; s++) pivots[s].add(halves[s]);
  // The face inside the face: both halves again, smaller, centered in the
  // skull, drawn only while the shell is open.
  for (let s = 0; s < 2; s++) {
    const mm = new THREE.Mesh(g, innerMat);
    mm.scale.set(s ? -INNER_K : INNER_K, INNER_K, INNER_K);
    mm.position.set(0, INNER_C.y, INNER_C.z + INNER_K * HINGE_Z);
    mm.visible = false;
    head.add(mm);
    inner.push(mm);
  }
}

let ictGeo = null;
function buildHeadICT(d) {
  const nv = d.header.nv;
  const g = new THREE.BufferGeometry();
  const p = new Float32Array(d.pos);
  for (let v = 0; v < nv; v++) p[v * 3 + 2] -= HINGE_Z;
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(d.nrm, 3, true));
  g.setAttribute('aAo', new THREE.BufferAttribute(d.ao, 1, true));
  g.setAttribute('aDF', new THREE.BufferAttribute(d.dFem, 3));
  g.setAttribute('aNF', new THREE.BufferAttribute(d.nFem, 3, true));
  g.setAttribute('aDS', new THREE.BufferAttribute(d.dStrong, 3));
  g.setAttribute('aNS', new THREE.BufferAttribute(d.nStrong, 3, true));
  g.setAttribute('aBlink', new THREE.BufferAttribute(d.dBlink, 3));
  g.setAttribute('aWide', new THREE.BufferAttribute(d.dWide, 3));
  g.setIndex(new THREE.BufferAttribute(d.idx, 1));
  g.computeBoundingSphere();
  ictGeo = g;
  uniforms.uIct.value = 1;
  buildRootSurface(g);
  uniforms.uNsc.value = d.header.nsc;
  // real eyelids now: the caps retire, and the eyes sit a hair smaller
  // so the closed lids cover them
  eyeBase = 0.93;
  icHead = d.header;
  for (const l of lids) { l.up.visible = false; l.lo.visible = false; }
  halves = [new THREE.Mesh(g, skinMat), new THREE.Mesh(g, skinMat)];
  halves[1].scale.x = -1;
  for (let s = 0; s < 2; s++) pivots[s].add(halves[s]);
  for (let s = 0; s < 2; s++) {
    const mm = new THREE.Mesh(g, innerMat);
    mm.scale.set(s ? -INNER_K : INNER_K, INNER_K, INNER_K);
    mm.position.set(0, INNER_C.y, INNER_C.z + INNER_K * HINGE_Z);
    mm.visible = false;
    head.add(mm);
    inner.push(mm);
  }
}

// ------------------------------------------------------------------ fronds
// Fiddlehead fronds. Each is a logarithmic spiral in its own plane, so
// how far it coils is one number (the total turn) and a frond can unfurl
// or curl up without ever changing length. Main fronds root on the
// crown, the back of the skull and the neck; each carries smaller fronds
// on alternating sides, fern fashion. JS lays every centerline each
// frame into a float texture (one row per frond: texel 0 holds the curl
// plane normal and which hinge the frond rides, then FR_S samples of
// position and radius) and one instanced tube mesh draws them all.
// vjw: the frond texture (and the constants that size it) moved above the factory

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Root on a triangle of the rendered head. Keep its barycentric weights
// so face morphs move the roots with the skin without a raycast per frame.
let rootMesh = null, rootHalf = null;
const _ray = new THREE.Raycaster();
const _ro = new THREE.Vector3(), _rd = new THREE.Vector3();
const _rootV = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const _rootEdge = new THREE.Vector3(), _rootQ = new THREE.Quaternion();
function buildRootSurface(g) {
  rootHalf = g;
  const pos = g.attributes.position, nv = pos.count, idx = g.index.array;
  const rp = new Float32Array(nv * 6), ri = new Uint32Array(idx.length * 2);
  for (let v = 0; v < nv; v++) {
    const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v) + HINGE_Z;
    rp.set([x, y, z], v * 3);
    rp.set([-x, y, z], (nv + v) * 3);
  }
  for (let i = 0; i < idx.length; i += 3) {
    ri.set([idx[i], idx[i + 1], idx[i + 2]], i);
    ri.set([nv + idx[i], nv + idx[i + 2], nv + idx[i + 1]], idx.length + i);
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  rg.setIndex(new THREE.BufferAttribute(ri, 1));
  rg.computeBoundingSphere();
  rootMesh = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  rootMesh.updateMatrixWorld(true);
  sprout(sproutSeed);
}
function surfaceAlong(cx, cy, cz, dir, out, nrm) {
  if (rootMesh) {
    _rd.copy(dir).negate();
    _ro.set(cx, cy, cz).addScaledVector(dir, 3);
    _ray.set(_ro, _rd);
    const hit = _ray.intersectObject(rootMesh, false)[0];
    if (hit) {
      out.copy(hit.point);
      nrm.copy(hit.face.normal);
      const ids = [hit.face.a, hit.face.b, hit.face.c];
      for (let i = 0; i < 3; i++) _rootV[i].fromBufferAttribute(rootMesh.geometry.attributes.position, ids[i]);
      const weights = new THREE.Vector3();
      THREE.Triangle.getBarycoord(hit.point, ..._rootV, weights);
      const nv = rootHalf.attributes.position.count;
      return { ids: ids.map(v => v % nv), weights: weights.toArray(), side: ids[0] < nv ? 1 : -1, normal: nrm.clone() };
    }
  }
  let lo = 0, hi = 2.4;
  for (let i = 0; i < 28; i++) {
    const m = (lo + hi) * 0.5;
    if (vsHead(cx + dir.x * m, cy + dir.y * m, cz + dir.z * m) < 0) lo = m; else hi = m;
  }
  out.set(cx + dir.x * lo, cy + dir.y * lo, cz + dir.z * lo);
  const e = 0.01;
  nrm.set(
    vsHead(out.x + e, out.y, out.z) - vsHead(out.x - e, out.y, out.z),
    vsHead(out.x, out.y + e, out.z) - vsHead(out.x, out.y - e, out.z),
    vsHead(out.x, out.y, out.z + e) - vsHead(out.x, out.y, out.z - e)).normalize();
  return null;
}
function followSurface(anchor, out, nrm, inset) {
  if (!anchor) return;
  const a = rootHalf.attributes, knob = uniforms.uKnob.value, lid = uniforms.uLid.value;
  const morph = uniforms.uMorph.value;
  out.set(0, 0, 0);
  for (let i = 0; i < 3; i++) {
    const v = anchor.ids[i], p = _rootV[i].fromBufferAttribute(a.position, v);
    if (uniforms.uIct.value > 0.5) {
      // Match the skin vertex shader, including its smoothed knob values.
      _rootEdge.fromBufferAttribute(a.aDF, v); p.addScaledVector(_rootEdge, knob.x);
      _rootEdge.fromBufferAttribute(a.aDS, v); p.addScaledVector(_rootEdge, knob.y);
      _rootEdge.fromBufferAttribute(a.aBlink, v); p.addScaledVector(_rootEdge, lid.x * BLINK_OVER);
      _rootEdge.fromBufferAttribute(a.aWide, v); p.addScaledVector(_rootEdge, lid.y);
    } else {
      const disp = a.aDisp.getX(v) * morph.x + a.aDisp.getY(v) * morph.y
        + a.aDisp.getZ(v) * morph.z + a.aDisp.getW(v) * morph.w;
      _rootEdge.fromBufferAttribute(a.normal, v); p.addScaledVector(_rootEdge, disp);
    }
    p.x *= anchor.side;
    p.z += HINGE_Z;
    out.addScaledVector(p, anchor.weights[i]);
  }
  nrm.subVectors(_rootV[1], _rootV[0]).cross(_rootEdge.subVectors(_rootV[2], _rootV[0])).normalize();
  out.addScaledVector(nrm, -inset);
}

const fronds = [];      // records, parents before children
const shrooms = [];     // mushroom records
function sprout(seedN) {
  const rng = mulberry32(seedN * 7919 + 17);
  const R = (a, b) => a + (b - a) * rng();
  fronds.length = 0;
  shrooms.length = 0;
  const dir = new THREE.Vector3(), P = new THREE.Vector3(), n = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  // crown and skull: a fibonacci sphere of candidate directions, kept
  // where hair would grow (never the face)
  const cand = [];
  const NC = 160;
  for (let i = 0; i < NC; i++) {
    const y = 1 - (i + 0.5) / NC * 2;
    const r = Math.sqrt(1 - y * y);
    const a = i * GOLD + seedN * 0.37;
    dir.set(Math.cos(a) * r, y, Math.sin(a) * r);
    const face = dir.z > 0.3 && dir.y < 0.55;
    if (dir.y < -0.12 || face) continue;
    cand.push(dir.clone());
  }
  // shuffle, take the crown set
  for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
  const mains = [];
  const nCrown = 15;
  for (let i = 0; i < nCrown && i < cand.length; i++) {
    const d = cand[i];
    const anchor = surfaceAlong(0, 0.05, -0.2, d, P, n);
    const X = n.clone().multiplyScalar(0.85).add(up.clone().multiplyScalar(0.45))
      .add(new THREE.Vector3(R(-0.3, 0.3), R(-0.1, 0.3), R(-0.3, 0.3))).normalize();
    mains.push({ anchor, P: P.clone().addScaledVector(n, -0.03), X, L: R(1.8, 3.2), r0: R(0.035, 0.06), lvl: 0 });
  }
  // roots: a ring around the base of the neck, reaching down and out
  const nRoot = 8;
  for (let i = 0; i < nRoot; i++) {
    const a = (i / nRoot) * Math.PI * 2 + R(-0.2, 0.2);
    const cy = -1.7 + R(-0.12, 0.08);
    dir.set(Math.cos(a), 0, Math.sin(a));
    const anchor = surfaceAlong(0, cy, -0.12, dir, P, n);
    const X = n.clone().multiplyScalar(0.7).add(new THREE.Vector3(0, -0.8, 0))
      .add(new THREE.Vector3(R(-0.2, 0.2), R(-0.2, 0.1), R(-0.2, 0.2))).normalize();
    mains.push({ anchor, P: P.clone().addScaledVector(n, -0.03), X, L: R(1.2, 2.2), r0: R(0.04, 0.06), lvl: 0 });
  }
  for (const m of mains) {
    // curl plane: random about the growth axis
    const H = new THREE.Vector3(R(-1, 1), R(-1, 1), R(-1, 1)).normalize();
    const Y = new THREE.Vector3().crossVectors(m.X, H).normalize();
    const Z = new THREE.Vector3().crossVectors(m.X, Y).normalize();
    const f = {
      lvl: 0, parent: -1, u: 0, side: 1,
      hinge: m.anchor ? m.anchor.side : (m.P.x >= 0 ? 1 : -1),
      P: m.P, X: m.X, Y, Z, anchor: m.anchor,
      restFrame: [m.X.clone(), Y.clone(), Z.clone()],
      L: m.L, r0: m.r0, turns: R(7, 12), rho: R(0.07, 0.12),
      rise: R(-0.35, 0.35), phase: R(0, 6.283), rate: R(0.25, 0.6),
      delay: m.P.y > -1 ? Math.max(0, Math.min(1, (1.1 - m.P.y) * 0.45 + R(0, 0.25))) : R(0.2, 0.6),
      beta: 0, tilt: 0, hand: 1,
      rt: { R0: 1, c: 1, phi0: 0, ccx: 0, ccy: 0, kk: 1, lvis: 0, sway: 0, swk: 0, swp: 0 },
      Zr: new THREE.Vector3(), g: 0,
    };
    fronds.push(f);
  }
  const nMain = fronds.length;
  for (let pi = 0; pi < nMain; pi++) {
    const par = fronds[pi];
    const kids = 5;
    for (let k = 0; k < kids; k++) {
      if (fronds.length >= FR_ROWS) break;
      const u = 0.26 + (k + R(0, 0.7)) / kids * 0.58;
      fronds.push({
        lvl: 1, parent: pi, u, side: k % 2 ? 1 : -1, hinge: par.hinge, rank: (k * 3 + pi) % kids,
        P: new THREE.Vector3(), X: new THREE.Vector3(), Y: new THREE.Vector3(), Z: new THREE.Vector3(),
        L: par.L * R(0.3, 0.45) * (1.1 - u * 0.5), r0: par.r0 * R(0.55, 0.7) * (1 - u * 0.5),
        turns: R(6, 12), rho: R(0.1, 0.2), rise: R(-0.3, 0.3), phase: R(0, 6.283), rate: R(0.35, 0.9),
        delay: 0, beta: R(0.7, 1.1), tilt: R(-0.6, 0.6), hand: rng() < 0.5 ? 1 : -1,
        rt: { R0: 1, c: 1, phi0: 0, ccx: 0, ccy: 0, kk: 1, lvis: 0, sway: 0, swk: 0, swp: 0 },
        Zr: new THREE.Vector3(), g: 0,
      });
    }
  }
  // mushrooms: some ride the main fronds, a cluster sprouts from the crown
  for (let pi = 0; pi < nMain; pi++) {
    if (rng() < 0.45) continue;
    shrooms.push({ host: pi, u: R(0.25, 0.7), size: R(0.12, 0.26), spin: R(0, 6.283), hue: rng(),
      lean: R(-0.4, 0.4), phase: R(0, 6.283), P: null, n: null, hinge: fronds[pi].hinge });
  }
  const nCap = 9;
  for (let i = 0; i < nCap; i++) {
    const d = cand[(nCrown + i * 3) % cand.length];
    const anchor = surfaceAlong(0, 0.05, -0.2, d, P, n);
    shrooms.push({ host: -1, u: 0, size: R(0.14, 0.34), spin: R(0, 6.283), hue: rng(),
      anchor, lean: R(-0.3, 0.3), phase: R(0, 6.283), P: P.clone().addScaledVector(n, -0.02), n: n.clone(),
      hinge: anchor ? anchor.side : (P.x >= 0 ? 1 : -1) });
  }
}

// Log spiral in the frond plane. Given the total turn Phi and the tip
// radius ratio rho, the spiral constant c and start radius R0 follow, and
// arc length stays exactly L however far it coils.
function frondShape(f, Phi) {
  const rt = f.rt;
  const c = -Math.log(f.rho) / Math.max(Phi, 0.05);
  const q = Math.sqrt(1 + c * c);
  rt.c = c;
  rt.R0 = f.L * c / (q * (1 - f.rho));
  rt.phi0 = Math.atan(1 / c) + Math.PI;
  rt.ccx = -rt.R0 * Math.cos(rt.phi0);
  rt.ccy = -rt.R0 * Math.sin(rt.phi0);
  rt.kk = rt.R0 * q / c;
}
// point at arc length s, in the frond's own frame -> world (SDF space)
function frondAt(f, s, out) {
  const rt = f.rt;
  const e = Math.max(1 - s / rt.kk, 1e-4);
  const phi = -Math.log(e) / rt.c;
  const r = rt.R0 * e;
  const lx = rt.ccx + r * Math.cos(phi + rt.phi0);
  const ly = rt.ccy + r * Math.sin(phi + rt.phi0);
  const sl = s / f.L;
  const lz = f.rise * s * sl + rt.sway * Math.sin(rt.swk * s - rt.swp) * sl * Math.sqrt(sl);
  out.set(
    f.P.x + f.X.x * lx + f.Y.x * ly + f.Z.x * lz,
    f.P.y + f.X.y * lx + f.Y.y * ly + f.Z.y * lz,
    f.P.z + f.X.z * lx + f.Y.z * ly + f.Z.z * lz);
  return out;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _t = new THREE.Vector3();
const _nn = new THREE.Vector3(), _zz = new THREE.Vector3();
let gateK = 1;
// Lay out every frond for this frame. unfurl 0 = coiled tight, 1 = open.
function layFronds(t, growth, unfurl, swayAmt, branch) {
  for (let i = 0; i < fronds.length; i++) {
    const f = fronds[i];
    if (f.lvl === 0) {
      if (f.anchor) {
        followSurface(f.anchor, f.P, _nn, 0.03);
        _rootQ.setFromUnitVectors(f.anchor.normal, _nn);
        f.X.copy(f.restFrame[0]).applyQuaternion(_rootQ);
        f.Y.copy(f.restFrame[1]).applyQuaternion(_rootQ);
        f.Z.copy(f.restFrame[2]).applyQuaternion(_rootQ);
      }
      f.g = Math.max(0, Math.min(1, (growth - f.delay * 0.55) / 0.45));
    } else {
      const par = fronds[f.parent];
      const reach = par.g * par.L - f.u * par.L;
      // complexity decides how many side fronds each frond carries; a
      // change grows them out or draws them back in, never pops
      const want = f.rank < branch ? 1 : 0;
      f.gate = (f.gate === undefined ? want : f.gate);
      f.gate += (want - f.gate) * gateK;
      f.g = Math.max(0, Math.min(1, reach / (f.L * 1.3))) * f.gate;
      // hang the child off the parent at arc length u*L, in the parent's
      // frame: out of the convex or concave side, tilted out of plane
      const sa = f.u * par.L;
      frondAt(par, sa, _a);
      frondAt(par, sa + 0.01, _b);
      _t.subVectors(_b, _a).normalize();
      _nn.crossVectors(par.Z, _t).normalize();
      f.P.copy(_a);
      f.X.copy(_t).multiplyScalar(Math.cos(f.beta)).addScaledVector(_nn, -f.side * Math.sin(f.beta)).normalize();
      _zz.crossVectors(f.X, par.Z);
      f.Z.copy(par.Z).multiplyScalar(Math.cos(f.tilt)).addScaledVector(_zz, Math.sin(f.tilt)).normalize();
      f.Y.crossVectors(f.Z, f.X).multiplyScalar(f.hand);
    }
    const breathe = 0.16 * Math.sin(t * f.rate + f.phase);
    const Phi = f.turns * Math.max(0.08, 1 - 0.78 * unfurl + breathe);
    frondShape(f, Phi);
    f.rt.lvis = f.L * f.g;
    f.rt.sway = swayAmt * (f.lvl ? 0.6 : 1);
    f.rt.swk = 5.5 / f.L;
    f.rt.swp = t * (1.4 + f.rate) + f.phase;
    // write the row
    const row = i * (FR_S + 1) * 4;
    frData[row] = f.Z.x; frData[row + 1] = f.Z.y; frData[row + 2] = f.Z.z;
    frData[row + 3] = f.hinge * (1 + (f.lvl ? f.u : 0));
    const lv = f.rt.lvis;
    for (let j = 0; j < FR_S; j++) {
      const sj = (j / (FR_S - 1)) * lv;
      frondAt(f, sj, _a);
      const o = row + (j + 1) * 4;
      frData[o] = _a.x; frData[o + 1] = _a.y; frData[o + 2] = _a.z;
      const taper = f.r0 * (1 - 0.6 * sj / f.L);
      const tip = Math.sqrt(Math.max(0, Math.min(1, (lv - sj) / (f.r0 * 2.5))));
      frData[o + 3] = lv > 1e-4 ? taper * tip : 0;
    }
  }
  frTex.needsUpdate = true;
}

const frUniforms = {
  uFr: { value: frTex },
  uPivR: { value: new THREE.Matrix4() },
  uPivL: { value: new THREE.Matrix4() },
  uTime: uniforms.uTime,
  uPulse: { value: new THREE.Vector4(-9, -9, -9, -9) }, // kick light fronts
  uGlow: uniforms.uGlow,
  uKeyDir: uniforms.uKeyDir,
  uFillDir: uniforms.uFillDir,
  uRimDir: uniforms.uRimDir,
  uContrast: uniforms.uContrast,
  uColBg: { value: PAL.bg },
  uColShadow: { value: PAL.shadow },
  uColMid: { value: PAL.mid },
  uColAccent: { value: PAL.accent },
  uColGlow: { value: PAL.glow },
};
const frGeo = new THREE.InstancedBufferGeometry();
{
  const ring = new Float32Array(FR_S * (FR_RING + 1) * 2);
  const pos = new Float32Array(FR_S * (FR_RING + 1) * 3);
  const idx = [];
  for (let j = 0; j < FR_S; j++) {
    for (let k = 0; k <= FR_RING; k++) {
      const v = j * (FR_RING + 1) + k;
      ring[v * 2] = j;
      ring[v * 2 + 1] = (k / FR_RING) * Math.PI * 2;
      if (j < FR_S - 1 && k < FR_RING) {
        const a = v, b = v + 1, c = v + FR_RING + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
  }
  frGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  frGeo.setAttribute('aRing', new THREE.BufferAttribute(ring, 2));
  frGeo.setIndex(idx);
  const rows = new Float32Array(FR_ROWS);
  for (let i = 0; i < FR_ROWS; i++) rows[i] = i;
  frGeo.setAttribute('iRow', new THREE.InstancedBufferAttribute(rows, 1));
  frGeo.instanceCount = 0;
}
const frMat = new THREE.ShaderMaterial({
  uniforms: frUniforms,
  vertexShader: /* glsl */`
    precision highp float;
    precision highp sampler2D;
    uniform sampler2D uFr;
    uniform mat4 uPivR, uPivL;
    attribute vec2 aRing;
    attribute float iRow;
    varying vec3 vN;
    varying vec3 vW;
    varying float vU;
    varying float vLvl;
    void main() {
      int j = int(aRing.x + 0.5);
      int row = int(iRow + 0.5);
      vec4 meta = texelFetch(uFr, ivec2(0, row), 0);
      vec4 c = texelFetch(uFr, ivec2(1 + j, row), 0);
      vec4 cp = texelFetch(uFr, ivec2(1 + max(j - 1, 0), row), 0);
      vec4 cn = texelFetch(uFr, ivec2(1 + min(j + 1, ${FR_S - 1}), row), 0);
      vec3 T = cn.xyz - cp.xyz;
      T = dot(T, T) > 1e-12 ? normalize(T) : vec3(0.0, 1.0, 0.0);
      vec3 N = cross(meta.xyz, T);
      N = dot(N, N) > 1e-10 ? normalize(N) : vec3(1.0, 0.0, 0.0);
      vec3 B = cross(T, N);
      vec3 nrm = cos(aRing.y) * N + sin(aRing.y) * B;
      vec3 p = c.xyz + nrm * c.w;
      mat4 piv = meta.w > 0.0 ? uPivR : uPivL;
      p = (piv * vec4(p, 1.0)).xyz;
      nrm = mat3(piv) * nrm;
      vec4 w = modelMatrix * vec4(p, 1.0);
      vW = w.xyz;
      vN = normalize(mat3(modelMatrix) * nrm);
      float attach = abs(meta.w) - 1.0;
      vU = float(j) / ${(FR_S - 1).toFixed(1)};
      vLvl = attach;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: /* glsl */`
    precision highp float;
    ${PAL_GLSL}
    uniform float uTime, uGlow;
    uniform vec4 uPulse;
    uniform vec3 uKeyDir, uFillDir, uRimDir;
    varying vec3 vN;
    varying vec3 vW;
    varying float vU;
    varying float vLvl;
    void main() {
      vec3 N = normalize(vN);
      vec3 V = normalize(cameraPosition - vW);
      if (dot(N, V) < 0.0) N = -N;
      float key = clamp((dot(N, uKeyDir) + 0.3) / 1.3, 0.0, 1.0);
      float fill = clamp(dot(N, uFillDir), 0.0, 1.0);
      float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.5);
      // along the frond: the palette's own ramp, root to tip
      float u = vU;
      vec3 body = mix(mix(uColShadow, uColMid, 0.6), uColAccent, smoothstep(0.25, 1.0, u));
      float spec = pow(clamp(dot(reflect(-uKeyDir, N), V), 0.0, 1.0), 24.0);
      vec3 c = body * (0.22 + 0.95 * key);
      c += uColAccent * fill * 0.2;
      c += uColGlow * spec * 0.3;
      c += mix(uColAccent, uColGlow, 0.5) * fres * 0.25;
      // ribs: fine bands like a fern stem
      float rib = smoothstep(0.75, 1.0, sin(u * 90.0) * 0.5 + 0.5);
      c *= 1.0 - rib * 0.25;
      // the tip glows; kick light races out from the head along every frond
      c += uColGlow * smoothstep(0.85, 1.0, u) * (0.15 + uGlow * 0.5);
      float along = u * 0.5 + vLvl * 0.5;
      float pl = 0.0;
      for (int i = 0; i < 4; i++) {
        float d = along - uPulse[i];
        pl += exp(-d * d * 180.0) * step(-0.2, uPulse[i]);
      }
      c += mix(uColAccent, uColGlow, 0.6) * pl * 0.6;
      gl_FragColor = vec4(grade(c), 1.0);
    }`,
});
const frMesh = new THREE.Mesh(frGeo, frMat);
frMesh.frustumCulled = false;
head.add(frMesh);

// --------------------------------------------------------------- mushrooms
const MU_MAX = 96;
const MU_SCALE = 3.6;
const muGeo = (() => {
  const pts = [
    [0.001, 0.0], [0.075, 0.0], [0.07, 0.12], [0.06, 0.3], [0.056, 0.46], [0.066, 0.56],
    [0.16, 0.585], [0.27, 0.6], [0.31, 0.625], [0.3, 0.68], [0.26, 0.76], [0.18, 0.83],
    [0.09, 0.865], [0.001, 0.875],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, 22);
  g.computeVertexNormals();
  return g;
})();
const muHue = new THREE.InstancedBufferAttribute(new Float32Array(MU_MAX * 2), 2);
muGeo.setAttribute('iHue', muHue);
const muUniforms = {
  uTime: uniforms.uTime,
  uKickGlow: { value: 0 },
  uKickN: { value: 0 },
  uGlow: uniforms.uGlow,
  uKeyDir: uniforms.uKeyDir,
  uFillDir: uniforms.uFillDir,
  uContrast: uniforms.uContrast,
  uColBg: { value: PAL.bg },
  uColShadow: { value: PAL.shadow },
  uColMid: { value: PAL.mid },
  uColAccent: { value: PAL.accent },
  uColGlow: { value: PAL.glow },
};
const muMat = new THREE.ShaderMaterial({
  uniforms: muUniforms,
  vertexShader: /* glsl */`
    attribute vec2 iHue;
    varying vec3 vN;
    varying vec3 vW;
    varying vec3 vL;
    varying vec2 vHue;
    void main() {
      vL = position;
      vHue = iHue;
      vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
      vW = w.xyz;
      vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: /* glsl */`
    precision highp float;
    ${PAL_GLSL}
    uniform float uTime, uKickGlow, uGlow, uKickN;
    uniform vec3 uKeyDir, uFillDir;
    varying vec3 vN;
    varying vec3 vW;
    varying vec3 vL;
    varying vec2 vHue;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main() {
      vec3 N = normalize(vN);
      vec3 V = normalize(cameraPosition - vW);
      if (dot(N, V) < 0.0) N = -N;
      float key = clamp((dot(N, uKeyDir) + 0.3) / 1.3, 0.0, 1.0);
      float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.5);
      float r = length(vL.xz);
      bool stem = vL.y < 0.575;
      bool gills = !stem && vL.y < 0.63 && r < 0.3;
      vec3 capC = mix(uColMid, uColAccent, vHue.x);
      vec3 c;
      // a kick lights one third of the caps, a different third each
      // time, so the crown ripples instead of flashing as one
      float mine = step(abs(mod(floor(vHue.y * 3.0) - uKickN, 3.0)), 0.5);
      float glowK = uKickGlow * mine;
      if (stem) {
        c = mix(uColShadow, mix(uColMid, uColGlow, 0.45), key * 0.8 + 0.1);
        c += uColGlow * glowK * 0.25 * smoothstep(0.3, 0.56, vL.y);
      } else if (gills) {
        float a = atan(vL.z, vL.x);
        float lam = 0.5 + 0.5 * cos(a * 26.0);
        c = mix(uColAccent, uColGlow, lam) * (0.35 + uGlow * 0.5 + glowK * 0.9);
      } else {
        c = mix(uColShadow * 0.8, capC, key);
        // spots on the cap
        float a = atan(vL.z, vL.x);
        vec2 g = vec2(a * 2.2, vL.y * 18.0);
        vec2 id = floor(g);
        vec2 f = fract(g) - 0.5;
        float h = hash(id + vHue.y * 17.0);
        float spot = (1.0 - smoothstep(0.18, 0.26, length(f))) * step(0.55, h) * step(0.66, vL.y);
        c = mix(c, uColGlow * (0.7 + glowK * 0.5), spot * 0.85);
      }
      c += mix(uColAccent, uColGlow, 0.5) * fres * 0.6;
      gl_FragColor = vec4(grade(c), 1.0);
    }`,
});
const muMesh = new THREE.InstancedMesh(muGeo, muMat, MU_MAX);
muMesh.frustumCulled = false;
muMesh.count = 0;
head.add(muMesh);

const _m4 = new THREE.Matrix4(), _q4 = new THREE.Quaternion(), _s4 = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0), _dir = new THREE.Vector3();
const _pivM = [new THREE.Matrix4(), new THREE.Matrix4()];
const _hingeT = new THREE.Matrix4().makeTranslation(0, 0, -HINGE_Z);
function layShrooms(t, amount) {
  let n = 0;
  const vis = Math.round(shrooms.length * amount);
  for (let i = 0; i < shrooms.length && n < MU_MAX; i++) {
    const m = shrooms[i];
    let grow;
    if (m.host >= 0) {
      const f = fronds[m.host];
      const sa = m.u * f.L;
      grow = Math.max(0, Math.min(1, (f.g * f.L - sa) / (f.L * 0.25)));
      frondAt(f, sa, _a);
      frondAt(f, sa + 0.01, _b);
      _t.subVectors(_b, _a).normalize();
      _nn.crossVectors(f.Z, _t).normalize();
      // grow out of the frond's convex side, leaning along it
      _dir.copy(_nn).negate().addScaledVector(f.Z, m.lean).addScaledVector(_t, 0.35).normalize();
      // Seat the stem inside the tube that is actually drawn. Its tip
      // tapers while growing, so a fixed root-radius offset could leave
      // a small mushroom floating beside a thin, still-growing frond.
      const sample = Math.min(FR_S - 1, sa / Math.max(f.rt.lvis, 1e-6) * (FR_S - 1));
      const j = Math.min(FR_S - 2, Math.floor(sample)), mix = sample - j;
      const o = (m.host * (FR_S + 1) + j + 1) * 4;
      _a.fromArray(frData, o); _b.fromArray(frData, o + 4);
      _a.lerp(_b, mix);
      const radius = frData[o + 3] * (1 - mix) + frData[o + 7] * mix;
      _a.addScaledVector(_dir, radius * 0.35);
    } else {
      grow = 1;
      followSurface(m.anchor, m.P, m.n, 0.02);
      _a.copy(m.P);
      _dir.copy(m.n).addScaledVector(_up, 0.6).normalize();
    }
    if (i >= vis) grow = 0;
    const sc = Math.max(1e-4, MU_SCALE * m.size * grow * (1 + 0.05 * Math.sin(t * 1.7 + m.phase)));
    _q4.setFromUnitVectors(_up, _dir);
    _q4.multiply(new THREE.Quaternion().setFromAxisAngle(_up, m.spin));
    _m4.compose(_a, _q4, _s4.set(sc, sc, sc));
    _m4.premultiply(_pivM[m.hinge > 0 ? 0 : 1]);
    muMesh.setMatrixAt(n, _m4);
    muHue.setXY(n, m.hue, m.phase / 6.283);
    n++;
  }
  muMesh.count = n;
  muMesh.instanceMatrix.needsUpdate = true;
  muHue.needsUpdate = true;
}

// ------------------------------------------------------------------ state
const GOLD = 2.399963;
let midsS = 0, subS = 0, enS = 0.3, highsS = 0;
// Motion rides twice-smoothed signals (two first-order stages, so the
// velocity itself is continuous): a single stage turns around the
// instant a kick lands and every frond twitched once per beat, measured
// as a 28x one-frame jump in tip speed.
let enA = 0.3, enM = 0.3, miA = 0, miM = 0, suA = 0, subM = 0;
let flow = 0;
let seed = 0, seedT = 0;
let lastEvent = -1e9;
let openT = 0, open = 0, openV = 0, qaOpen = 0;
// how far each door swings at open = 1 (radians)
const DOOR = 1.05;
// accents take turns: slide the carved rings, throw the orbits to new
// tilts, regrow the crown (the face opens on its own slider, never on a
// kick)
const EVENTS = ['rings', 'orbits', 'sprout'];
let evIdx = 0;
let sproutSeed = 1;
sprout(sproutSeed);
let grow = 1, growT = 1, resprout = false;
const pulses = [-9, -9, -9, -9];
let pulseIdx = 0;
let muGlow = 0;
let qaNoEvents = false;
let qaPose = null; // QA: offset the head to an exact test pose
let qaBlink = -1;  // QA: hold the lids at a blink amount
let blinkNow = 0;
let eyeBase = 1; // the sculpted head's lids close over a hair smaller eye
const EYE_BACK = 0.008;
let icHead = null; // the sculpted head's header: eye centre and eye motion per knob
let nextBlink = 2, blinkT0 = -9, stare = 0;
let haloRot = 0, haloPulse = 0;
let frameY = 0.35;
let faceF = 0.35, faceS = 0.55;
// pose
let turnS = 0, tiltS = 0;
let homeK = 0; // Shift+Space: 1 while the mouse is let go
// eyes
const gaze = new THREE.Vector2(0, 0), gazeT = new THREE.Vector2(0, 0);
let nextSaccade = 0;
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

return { // vjw: was `export default {`
  name: 'visage',
  scene,
  camera,
  // bloom.kick overrides the engine's per-kick bloom surge (0.35): lit
  // skin and a crown of caps cover a big share of the frame, and the
  // surge measured as a whole-frame strobe (the morphogen lesson).
  bloom: { strength: 0.3, gain: 0.35, kick: 0.04 },
  // Meshes, not a march, so full res is cheap: 4.2 ms at 1080p and
  // 11.5 ms at a Retina 16" (7.7 MP) on the M2 Pro. The budget caps the
  // big-display case near 7 ms (the relic number).
  pixelBudget: 4.0,
  // the renderer runs antialias off; FXAA cleans the silhouettes of the
  // head, fronds and caps
  edgeAA: true,
  // shape reads "turn": where the head faces (center = at you).
  // complexity reads "detail": the carving and the side fronds.
  // density reads "growth": bare skull to a wild crown.
  // fill reads "zoom". tilt nods the head itself.
  // open swings the face apart down the middle, 0 = closed.
  // morph reads "face": masculine at 0, feminine at 1.
  // edge reads "features": soft at 0, strong at 1.
  paramLabels: { '*': { shape: 'turn', complexity: 'detail', density: 'growth', fill: 'zoom', morph: 'face', edge: 'features' } },
  // the pose controls sit together at the top, the face knobs after
  paramOrder: ['speed', 'shape', 'tilt', 'open', 'morph', 'edge', 'fill', 'density', 'complexity', 'contrast'],
  params: { speed: 0.5, shape: 0.5, complexity: 0.5, density: 0.5, fill: 0.5, tilt: 0.5, open: 0, morph: 0.35, edge: 0.55, contrast: 0.5, eyeFollow: true },
  // Dragging edits the saved controls, within the sliders' existing ranges.
  // The engine broadcasts these values; output windows never integrate deltas.
  dragPose(dx, dy) {
    const p = this.params;
    const shape = Math.max(0, Math.min(1, p.shape + dx * 2.6 / 2.4));
    const tilt = Math.max(0, Math.min(1, p.tilt - dy * 1.6 / 1.1));
    if (shape === p.shape && tilt === p.tilt) return null;
    p.shape = shape; p.tilt = tilt;
    turnS = (shape - 0.5) * 2.4;
    tiltS = (tilt - 0.5) * 1.1;
    return { shape, tilt };
  },
  update(s, dt, t) {
    ensureHead();
    if (!halves && icData) buildHeadICT(icData);
    if (!halves) {
      if (!meshData && wantSync && !meshPending) {
        meshData = vsNets(NET_LO, NET_H, NET_N);
        Object.assign(meshData, vsMorph(meshData, NET_H));
      }
      if (meshData) buildHead(meshData);
    }
    const P = this.params;
    const spd = drastic(P.speed);

    midsS += (s.mids - midsS) * (1 - Math.exp(-dt * 0.6));
    subS += (s.sub - subS) * (1 - Math.exp(-dt * 0.8));
    enS += (s.energy - enS) * (1 - Math.exp(-dt * 2.0));
    highsS += (s.highs - highsS) * (1 - Math.exp(-dt * 6.0));
    const km = 1 - Math.exp(-dt / 0.9);
    enA += (s.energy - enA) * km; enM += (enA - enM) * km;
    miA += (s.mids - miA) * km; miM += (miA - miM) * km;
    suA += (s.sub - suA) * km; subM += (suA - subM) * km;

    flow += dt * 0.12 * spd * (1 + midsS * 0.8);

    // Accented kicks slide every carved ring one step outward from the
    // eyes and mouth (a new face drawn in the same hand), eased.
    if (!qaNoEvents && s.onKick && t - lastEvent > 3.2 && (s.onKick > 0.55 || t - lastEvent > 8)) {
      lastEvent = t;
      const ev = EVENTS[evIdx++ % EVENTS.length];
      if (ev === 'rings') seedT += 1;
      else if (ev === 'orbits') throwOrbits(Math.random);
      else { growT = 0; resprout = true; }
    }
    seed += (seedT - seed) * (1 - Math.exp(-dt * 1.8));

    // ---- pose: turn, tilt and drag own the angle. Hold it between gestures.
    turnS += (((P.shape - 0.5) * 2.4) - turnS) * (1 - Math.exp(-dt / 0.25));
    tiltS += (((P.tilt - 0.5) * 1.1) - tiltS) * (1 - Math.exp(-dt / 0.25));
    const ptr = scenePointer;
    const alive = ptr.ndc && performance.now() - ptr.lastMove < 4000;
    // Shift+Space still detaches the shared pointer. The saved pose stays put.
    homeK += ((ptr.detached ? 1 : 0) - homeK) * (1 - Math.exp(-dt / 0.35));
    _e.set(tiltS + (qaPose ? qaPose.pitch : 0), turnS + (qaPose ? qaPose.yaw : 0), 0, 'YXZ');
    figure.quaternion.setFromEuler(_e);
    figure.position.y = 0.04 * Math.sin(t * 0.31 * spd);
    const breathe = 1 + 0.012 * subS;
    figure.scale.setScalar(breathe);

    // ---- the face knobs: ease like the pose sliders, then weight the
    // four morph ends (each knob is piecewise linear about its middle)
    faceF += (P.morph - faceF) * (1 - Math.exp(-dt / 0.25));
    faceS += (P.edge - faceS) * (1 - Math.exp(-dt / 0.25));
    uniforms.uMorph.value.set(Math.max(0, 1 - 2 * faceF), Math.max(0, 2 * faceF - 1),
      Math.max(0, 1 - 2 * faceS), Math.max(0, 2 * faceS - 1));
    uniforms.uKnob.value.set(2 * faceF - 1, 2 * faceS - 1);
    // the SDF head scales its eyes with the face knob; the sculpted head's
    // eyes ride the model's own eyeball, which moves with both knobs and
    // grows or shrinks with the face knob (about 8 percent each way)
    let eyeK = (1 + 0.07 * (faceF - 0.5)) * eyeBase;
    if (icHead) {
      const kx = 2 * faceF - 1, ks = 2 * faceS - 1, e = icHead.eye, df = icHead.eyeDF, ds = icHead.eyeDS;
      const es = icHead.eyeS || [1, 1];
      eyeK = eyeBase * (kx >= 0 ? 1 + (es[1] - 1) * kx : 1 + (es[0] - 1) * -kx);
      const ex = e[0] + df[0] * kx + ds[0] * ks, ey = e[1] + df[1] * kx + ds[1] * ks;
      // a hair back: the smooth lids sit slightly inside the model's own
      // eyeball, so a full-size sphere pokes through a closed lid
      const ez = e[2] + df[2] * kx + ds[2] * ks - EYE_BACK - HINGE_Z;
      eyes[0].position.set(ex, ey, ez);
      eyes[1].position.set(-ex, ey, ez);
    }
    for (let i = 0; i < 2; i++) {
      eyes[i].scale.setScalar(eyeK);
      lids[i].up.scale.setScalar(eyeK);
      lids[i].lo.scale.setScalar(eyeK);
    }

    // ---- the face opens (hinged at the back of the skull)
    // the open slider owns the doors exactly: no spring, no breathing
    // (Alec 2026-09-24: closing from fully open lagged; it must track the
    // knob). Device automation arrives de-zippered upstream.
    openT = Math.min(1, P.open + qaOpen);
    open = openT;
    pivots[0].rotation.y = open * DOOR;
    pivots[1].rotation.y = -open * DOOR;
    pivots[0].position.x = open * 0.12;
    pivots[1].position.x = -open * 0.12;
    // the face inside rides forward out of the skull as the doors part
    for (const m of inner) {
      m.visible = open > 0.01;
      m.position.z = INNER_C.z + INNER_K * HINGE_Z + open * 0.32;
    }

    // ---- eyes: saccades, and they find the pointer when it moves
    if (t > nextSaccade) {
      nextSaccade = t + 0.8 + Math.random() * 2.6;
      gazeT.set((Math.random() * 2 - 1) * 0.45, (Math.random() * 2 - 1) * 0.25);
    }
    if (alive && !ptr.held) gazeT.set(ptr.ndc.x * 0.9, ptr.ndc.y * 0.6);
    if (!P.eyeFollow) gazeT.set(0, 0);
    gazeT.multiplyScalar(1 - homeK);
    gaze.x += (gazeT.x - gaze.x) * (1 - Math.exp(-dt * 16));
    gaze.y += (gazeT.y - gaze.y) * (1 - Math.exp(-dt * 16));
    for (let i = 0; i < 2; i++) {
      // look at a point in front of the camera plane, in world space
      _v.set(gaze.x * 3.0, gaze.y * 2.0, 0).add(camera.position);
      eyes[i].lookAt(_v);
    }
    // blinks: every few seconds, sometimes twice
    if (t > nextBlink) {
      blinkT0 = t;
      nextBlink = t + (Math.random() < 0.18 ? 0.35 : 2.2 + Math.random() * 4.5);
    }
    const bp = (t - blinkT0) / 0.26;
    const blink = qaBlink >= 0 ? qaBlink : (bp >= 0 && bp < 1 ? Math.sin(bp * Math.PI) : 0);
    blinkNow = blink;
    const wide = stare;
    for (let i = 0; i < 2; i++) {
      const upRest = -0.25 - 0.35 * wide - gaze.y * 0.25;
      const loRest = 0.5 + 0.2 * wide - gaze.y * 0.1;
      lids[i].up.rotation.x = upRest + (0.33 - upRest) * blink;
      lids[i].lo.rotation.x = loRest + (0.27 - loRest) * blink;
    }
    // the sculpted head blinks with its own lids (wide on a stare), and
    // its eyes tuck back while the lids are down (placed fresh each frame
    // above, so the offset never accumulates)
    uniforms.uLid.value.set(blink, wide * (1 - blink));
    if (icHead) for (const e of eyes) e.position.z -= EYE_TUCK * blink;
    eyeUniforms.uPupil.value = 0.14 + 0.07 * (1 - enS) + 0.04 * subM;
    eyeUniforms.uFlare.value = 0.25 + highsS * 0.9;
    // a closing lid dims the eye it covers, so no glow leaks along the seam
    eyeUniforms.uShut.value = uniforms.uIct.value > 0.5 ? blinkNow : 0;

    // ---- the crown: pivots first (fronds and mushrooms ride the hinges)
    for (let i = 0; i < 2; i++) {
      pivots[i].updateMatrix();
      _pivM[i].multiplyMatrices(pivots[i].matrix, _hingeT);
    }
    frUniforms.uPivR.value.copy(_pivM[0]);
    frUniforms.uPivL.value.copy(_pivM[1]);
    // an accent can pull the whole crown back into the skull and grow a
    // new one: retract fast, reseed at the bottom, regrow slowly
    grow += (growT - grow) * (1 - Math.exp(-dt * (growT < grow ? 5.0 : 0.7)));
    if (resprout && grow < 0.02) {
      resprout = false;
      sprout(++sproutSeed);
      growT = 1;
    }
    const lenK = 0.2 + 1.1 * P.density;
    for (const f of fronds) {
      if (f.baseL === undefined) f.baseL = f.L;
      f.L = f.baseL * lenK;
      if (f.lvl === 0) f.r0b = f.r0b || f.r0;
    }
    const G = Math.min(1, P.density * 4) * grow;
    gateK = 1 - Math.exp(-dt * 2.5);
    layFronds(t * spd, G, 0.18 + 0.7 * enM, 0.05 + 0.16 * miM, 0.4 + P.complexity * 4.6);
    frGeo.instanceCount = fronds.length;
    layShrooms(t, Math.min(1, P.density * 1.6));
    // kick light: a front races out of the skull along every frond
    if (s.onKick) { pulses[pulseIdx] = -0.12; pulseIdx = (pulseIdx + 1) % 4; }
    for (let i = 0; i < 4; i++) if (pulses[i] > -5) pulses[i] = pulses[i] > 1.4 ? -9 : pulses[i] + dt * 1.1;
    frUniforms.uPulse.value.set(pulses[0], pulses[1], pulses[2], pulses[3]);
    if (s.onKick) muUniforms.uKickN.value = (muUniforms.uKickN.value + 1) % 3;
    muGlow = Math.max(muGlow * Math.exp(-dt * 3.5), s.kick);
    muUniforms.uKickGlow.value = muGlow;

    // ---- orbits: spin with the music, precess slowly, tilts ease to
    // wherever the last accent threw them
    orbGroup.position.set(figure.position.x, figure.position.y + 0.12, 0);
    for (let i = 0; i < orbs.length; i++) {
      const b = orbs[i];
      // critically damped: a thrown band starts and lands with no snap
      _v.subVectors(b.tiltT, b.tilt).multiplyScalar(ORB_K).addScaledVector(b.tiltV, -2 * Math.sqrt(ORB_K));
      b.tiltV.addScaledVector(_v, dt);
      b.tilt.addScaledVector(b.tiltV, dt);
      b.spin += dt * b.o.spin * spd * (1 + miM * 1.2);
      const prec = t * 0.03 * spd * (i % 2 ? -1 : 1);
      _eo.set(b.tilt.x, b.tilt.y + prec, b.tilt.z, 'YXZ');
      b.pivot.quaternion.setFromEuler(_eo);
      b.mesh.rotation.z = b.spin;
      if (s.onKick) { b.spark = Math.random(); b.sparkAmt = 0.5 + 0.8 * s.onKick; }
      b.spark += dt * 0.35 * (i % 2 ? -1 : 1);
      b.sparkAmt *= Math.exp(-dt * 2.2);
      b.mat.uniforms.uSpark.value = b.spark;
      b.mat.uniforms.uSparkAmt.value = b.sparkAmt;
    }
    orbUniforms.uAmt.value = (0.7 + 0.6 * enS) * Math.min(1, P.density * 3 + 0.35);
    orbUniforms.uCellK.value = 0.7 + 0.6 * P.complexity;

    // ---- halo and dust
    haloRot += dt * 0.05 * spd * (1 + miM * 1.5);
    haloUniforms.uRot.value = haloRot;
    haloUniforms.uPetals.value = 8 + Math.round(P.complexity * 8) * 2;
    haloPulse += dt * (0.12 * spd + enM * 0.25);
    haloUniforms.uPulse.value = haloPulse;
    haloUniforms.uAmt.value = 0.18 + 0.4 * enS + 0.5 * open;
    dustUniforms.uRise.value += dt * 0.08 * spd;
    dustUniforms.uTwinkle.value = highsS;

    // ---- camera
    // a bigger crown pulls the frame up and back so the caps stay in
    const crown = Math.min(1, P.density * 1.3);
    const yFar = 0.15 + 0.45 * crown;
    const zoomIn = Math.min(1, Math.max(0, (P.fill - 0.3) / 0.7));
    const yTgt = yFar + (-0.32 - yFar) * zoomIn * zoomIn * (3 - 2 * zoomIn);
    frameY += (yTgt - frameY) * (1 - Math.exp(-dt * 1.5));
    const dist = 10.5 - P.fill * 7.0 + crown * 1.2 * (1 - P.fill);
    camera.position.set(0, frameY + 0.05, dist);
    camera.lookAt(0, frameY, 0);

    uniforms.uTime.value = t;
    uniforms.uFlow.value = flow;
    uniforms.uFreq.value = 1.2 + P.complexity * 1.5;
    uniforms.uBands.value = 60 + P.complexity * 100;
    uniforms.uSeed.value = seed;
    uniforms.uGlow.value = 0.15 + enS * 0.75;
    uniforms.uKick.value = s.kick * 0.1;
    uniforms.uHighs.value = highsS;
    uniforms.uOpen.value = open;
    uniforms.uContrast.value = P.contrast;
    scene.background = PAL.bg;
  },
  resize(w, h) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  },
  // QA hooks
  _open(v = 1) { qaOpen = v; },
  _clay(v) { uniforms.uClay.value = v; },
  _sharp(v) { uniforms.uSharp.value = v; },
  // QA: a frond's last sample (its tip), SDF space
  _tip(i = 0) { const o = i * (FR_S + 1) * 4 + FR_S * 4; return [frData[o], frData[o + 1], frData[o + 2]]; },
  _noEvents(v) { qaNoEvents = !!v; },
  _qaPose(yaw, pitch = 0) { qaPose = yaw === null ? null : { yaw, pitch }; },
  _blink(v = -1) { qaBlink = v; },
  _eyes(v = true) { for (const e of eyes) e.visible = v; },
  _eyePos: () => eyes.map((e) => e.position.toArray().map((x) => +x.toFixed(4))),
  // QA (explore build of head.bin only): pose the head as the neutral plus
  // a weighted mix of the model's identity components, on the CPU
  _idMix(ws) {
    if (!ictGeo || !icData || !icData.id0) return false;
    const nv = icData.header.nv, p = ictGeo.attributes.position.array;
    for (let v = 0; v < nv; v++) for (let k = 0; k < 3; k++) {
      let x = icData.pos[v * 3 + k];
      for (let m = 0; m < ws.length; m++) if (ws[m]) x += icData['id' + m][v * 3 + k] * ws[m];
      p[v * 3 + k] = k === 2 ? x - HINGE_Z : x;
    }
    ictGeo.attributes.position.needsUpdate = true;
    return true;
  },
  _state: () => ({ open, seed, homeK, gaze: [gaze.x, gaze.y], built: !!halves, loaded: !!icData }),
  _sig: () => ({ enS, midsS, subS, highsS, R0: fronds[0].rt.R0, c: fronds[0].rt.c, g: fronds[0].g, L: fronds[0].L }),
  // QA: the figure's pose as YXZ euler (yaw, pitch, roll) in radians
  _pose() { const e = new THREE.Euler().setFromQuaternion(figure.quaternion, 'YXZ'); return { yaw: e.y, pitch: e.x, roll: e.z, y: figure.position.y }; },
};
} // vjw: the factory
