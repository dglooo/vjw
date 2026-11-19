// Copied from donor/vs3/visual_kit/src/lib/vesica-geometry.js (the friends' engine, used with permission, 2026-11-19).
// vjw: verbatim (pure geometry, no imports); used by scenes/vesica.js.
// Figures for the vesica scene: the classic compass and straightedge
// drawings of sacred geometry, as strokes in construction order. Pure
// math with no three.js, so tools/qa_vesica.mjs can hold every figure to
// its canonical definition (19 circles and 36 arcs for the flower of
// life, 13 circles and 78 lines for Metatron's cube, regular solids with
// equal edges).
//
// The 2D figures live in lattice units: every circle has radius 1 and
// the lattice spacing is 1, so neighbouring circles pass through each
// other's centres. One lattice axis points straight up, which stands a
// petal upright at the top of the flower the way the canonical drawings
// do.
//
// A stroke is an arc or a segment in object space:
//   arc: c centre, u and v the radius-scaled axes of its plane, drawn
//        from angle a0 through sweep (radians, toward v)
//   seg: c the start, u the vector to the end
// group: construction step. The scene draws one group per trigger, in
//        ascending order, and erases them in descending order. Each
//        build stage keeps the previous stage's groups in front and
//        appends its own, so drawing back down always undoes the
//        newest work first.
// layer: 0 the figure, 1 a figure drawn under it (dimmer), 2 frame rings
// body:  which transform carries it. 0 the figure plane, 1 and 2 the two
//        tetrahedra, 3 a solid's shared frame, 4 the screen
// bill:  a sphere outline: its centre rides the body, its plane faces
//        the viewer
// style: null, or [chalk, ink, glow] weights for strokes that belong to
//        a style's frame ornament
// key:   identity across rebuilds, so a stroke drawn at one build stage
//        stays drawn at the next

const TAU = Math.PI * 2;
const SQ3 = Math.sqrt(3);
const E1 = [0, 1];
const E2 = [SQ3 / 2, 0.5];

export const MODES = ['flower', 'metatron', 'merkaba', 'equilibrium', 'torus', 'golden', 'grid'];

// Build stages per mode. The middle detent (complexity 0.5) is the
// canonical drawing in every mode, so the scene's default shows the
// proper figure whichever mode is picked.
export const STAGES = {
  flower: ['vesica', 'seed', 'flower', 'grand', 'field'],
  metatron: ['fruit', 'cube', 'metatron', 'in flower', 'nested'],
  merkaba: ['tetrahedron', 'star', 'cube'],
  equilibrium: ['cuboctahedron', 'equilibrium', 'spheres'],
  torus: ['six', 'twelve', 'torus', 'dense', 'veil'],
  golden: ['rectangles', 'icosahedron', 'compound'],
  grid: ['core', 'grid', 'spheres'],
};

export function stageIndex(mode, complexity) {
  const n = (STAGES[mode] || STAGES.flower).length;
  const c = Math.min(1, Math.max(0, Number.isFinite(complexity) ? complexity : 0.5));
  return Math.round(c * (n - 1));
}

export const lattice = (i, j) => [E1[0] * i + E2[0] * j, E1[1] * i + E2[1] * j];
export const hexRing = (i, j) => Math.max(Math.abs(i), Math.abs(j), Math.abs(i + j));

// Clockwise from straight up, in whole-degree-safe radians 0..TAU.
function bearing(x, y) {
  let a = Math.atan2(x, y);
  if (a < 0) a += TAU;
  const deg = Math.round(a * 180 / Math.PI * 1e6) / 1e6;
  return (deg % 360) * Math.PI / 180;
}
const sectorOf = (x, y) => Math.floor(bearing(x, y) / (Math.PI / 3) + 1e-6) % 6;

// The visible part of the circle (cx, cy, r) inside the boundary circle
// of radius R about the origin, or null when nothing of it shows. The
// flower of life is the endless lattice clipped this way, which is where
// its 36 partial arcs come from. A full circle starts its pen on the
// side facing the origin, the way a compass starts on a point it
// already has.
export function clipCircle(cx, cy, r, R) {
  const d = Math.hypot(cx, cy);
  const EPS = 1e-9;
  if (d + r <= R + EPS) {
    return { a0: d < EPS ? Math.PI / 2 : Math.atan2(-cy, -cx), sweep: TAU, full: true };
  }
  if (d - r >= R - EPS) return null;
  const k = (R * R - d * d - r * r) / (2 * d * r);
  if (k <= -1 + 1e-7) return null; // touches the boundary at one point
  const h = Math.acos(Math.min(1, k));
  return { a0: Math.atan2(cy, cx) + h, sweep: TAU - 2 * h, full: false };
}

const r6 = (v) => Math.round(v * 1e6) / 1e6;

function arc2(x, y, r, a0, sweep, group, layer, key, extra) {
  return {
    kind: 0, c: [x, y, 0], u: [r, 0, 0], v: [0, r, 0], a0, sweep,
    group, layer, body: 0, bill: false, style: null,
    key: key || `a${layer}:${r6(x)},${r6(y)},${r6(r)},${r6(a0)},${r6(sweep)}`,
    ...extra,
  };
}
function seg2(x1, y1, x2, y2, group, layer, extra) {
  const [ax, ay, bx, by] = x1 < x2 || (x1 === x2 && y1 <= y2) ? [x1, y1, x2, y2] : [x2, y2, x1, y1];
  return {
    kind: 1, c: [x1, y1, 0], u: [x2 - x1, y2 - y1, 0], v: [0, 0, 0], a0: 0, sweep: 1,
    group, layer, body: 0, bill: false, style: null,
    key: `s${layer}:${r6(ax)},${r6(ay)},${r6(bx)},${r6(by)}`,
    ...extra,
  };
}

// Every lattice circle that shows inside R, with its hex ring and clip.
export function latticeCircles(R) {
  const out = [];
  const n = Math.ceil(R + 2);
  for (let i = -2 * n; i <= 2 * n; i++) {
    for (let j = -2 * n; j <= 2 * n; j++) {
      const [x, y] = lattice(i, j);
      if (Math.hypot(x, y) >= R + 1) continue;
      const c = clipCircle(x, y, 1, R);
      if (c) out.push({ i, j, x, y, ring: hexRing(i, j), ...c });
    }
  }
  return out;
}

// Lattice circles grouped for drawing: the centre, then ring one a
// circle at a time going clockwise from the top, then each outer ring a
// 60 degree sector at a time, so the construction sweeps round like a
// compass walking the figure.
function latticeStrokes(R, g0, layer) {
  const circles = latticeCircles(R);
  const strokes = [];
  let maxG = g0 - 1;
  for (const c of circles) {
    const sec = sectorOf(c.x, c.y);
    const g = c.ring === 0 ? g0 : c.ring === 1 ? g0 + 1 + sec : g0 + 7 + (c.ring - 2) * 6 + sec;
    maxG = Math.max(maxG, g);
    strokes.push(arc2(c.x, c.y, 1, c.a0, c.sweep, g, layer));
  }
  return { strokes, next: maxG + 1 };
}

// Frame rings each style draws round a figure of radius R (body 0 in the
// plane, body 4 on screen round a solid). Chalk leaves the figure as it
// is, ink doubles the ring like the bold print references, glow adds the
// gold medallion's banded border with a rope of small circles.
export function frameStrokes(R, g0, body, ownRing) {
  const out = [];
  const ring = (rr, style, g) => out.push({
    ...arc2(0, 0, rr, Math.PI / 2, TAU, g, 2, `f${body}:${r6(rr)}`), body, style,
  });
  // Ink doubles the ring on every figure: a figure without its own
  // ring gets the inner one from ink alone.
  ring(R, ownRing ? [1, 1, 1] : [0, 1, 0], g0);
  ring(R * 1.045, [0, 1, 0], g0 + 1);
  ring(R * 1.035, [0, 0, 1], g0 + 1);
  ring(R * 1.07, [0, 0, 1], g0 + 1);
  const ROPE = 72, rc = R * 1.132, rr = R * 0.058;
  for (let k = 0; k < ROPE; k++) {
    const a = Math.PI / 2 + k * TAU / ROPE;
    out.push({
      ...arc2(rc * Math.cos(a), rc * Math.sin(a), rr, a + Math.PI, TAU, g0 + 2, 2, `r${body}:${r6(R)}:${k}`),
      body, style: [0, 0, 1],
    });
  }
  ring(R * 1.195, [0, 0, 1], g0 + 3);
  ring(R * 1.218, [0, 0, 1], g0 + 3);
  // Each stroke's place in the frame, whatever its radius, so a figure
  // that grows or shrinks carries its frame to the new edge at once.
  out.forEach((s, i) => { s.frameRole = `${body}:${i}`; });
  return { strokes: out, next: g0 + 4 };
}

function flower(stage) {
  const name = STAGES.flower[stage];
  if (name === 'vesica') {
    const strokes = [
      arc2(0, 0, 1, Math.PI / 2, TAU, 0, 0),
      arc2(0, 1, 1, -Math.PI / 2, TAU, 1, 0),
    ];
    const f = frameStrokes(1.5, 2, 0, false);
    // The frame sits on the pair's centre, not the origin.
    for (const s of f.strokes) s.c[1] += 0.5;
    return { strokes: [...strokes, ...f.strokes], R: 1.5, center: [0, 0.5], solid: false };
  }
  const R = { seed: 2, flower: 3, grand: 4, field: 6 }[name];
  if (name === 'seed') {
    // Seven whole circles: the centre, then ring one clockwise from the
    // top (the same keys the flower uses, so growing seed -> flower
    // keeps them drawn).
    const seed = [];
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        if (hexRing(i, j) > 1) continue;
        const [x, y] = lattice(i, j);
        const ring = hexRing(i, j);
        seed.push(arc2(x, y, 1, ring === 0 ? Math.PI / 2 : Math.atan2(-y, -x), TAU,
          ring === 0 ? 0 : 1 + sectorOf(x, y), 0));
      }
    }
    const f = frameStrokes(R, 7, 0, true);
    return { strokes: [...seed, ...f.strokes], R, center: [0, 0], solid: false };
  }
  const lat = latticeStrokes(R, 0, 0);
  const f = frameStrokes(R, lat.next, 0, true);
  return { strokes: [...lat.strokes, ...f.strokes], R, center: [0, 0], solid: false };
}

// The six spoke directions, clockwise from straight up. They are the
// lattice axes, so Metatron's cube sits exactly on the flower's lattice.
const SPOKES = Array.from({ length: 6 }, (_, k) => [Math.sin(k * Math.PI / 3), Math.cos(k * Math.PI / 3)]);

function metatronStrokes(scale, g0, keyTag) {
  const P = [[0, 0]];
  for (let k = 0; k < 6; k++) P.push([SPOKES[k][0] * 2 * scale, SPOKES[k][1] * 2 * scale]);
  for (let k = 0; k < 6; k++) P.push([SPOKES[k][0] * 4 * scale, SPOKES[k][1] * 4 * scale]);
  const inner = (k) => 1 + ((k % 6) + 6) % 6;
  const outer = (k) => 7 + ((k % 6) + 6) % 6;
  const circles = [];
  const startA = (p) => (p[0] === 0 && p[1] === 0 ? Math.PI / 2 : Math.atan2(-p[1], -p[0]));
  circles.push(arc2(0, 0, scale, startA(P[0]), TAU, g0, 0, `${keyTag}c0`));
  for (let k = 0; k < 3; k++) {
    for (const q of [inner(k), inner(k + 3)]) circles.push(arc2(P[q][0], P[q][1], scale, startA(P[q]), TAU, g0 + 1 + k, 0, `${keyTag}c${q}`));
  }
  for (let k = 0; k < 3; k++) {
    for (const q of [outer(k), outer(k + 3)]) circles.push(arc2(P[q][0], P[q][1], scale, startA(P[q]), TAU, g0 + 4 + k, 0, `${keyTag}c${q}`));
  }
  // The 78 lines, every pair of the 13 centres, grouped so the drawing
  // reads: spokes, the two hexagons, the two hexagrams, the diameters,
  // then the remaining inner-to-outer chords one rotation at a time.
  const lines = [];
  const L = (a, b, g) => lines.push(seg2(P[a][0], P[a][1], P[b][0], P[b][1], g, 0, { key: `${keyTag}l${Math.min(a, b)}-${Math.max(a, b)}` }));
  const lg = g0 + 7;
  for (let k = 0; k < 6; k++) L(0, inner(k), lg);
  for (let k = 0; k < 6; k++) L(inner(k), outer(k), lg + 1);
  for (let k = 0; k < 6; k++) L(0, outer(k), lg + 2);
  for (let k = 0; k < 6; k++) L(inner(k), inner(k + 1), lg + 3);
  for (let k = 0; k < 6; k++) L(outer(k), outer(k + 1), lg + 4);
  for (let k = 0; k < 6; k++) L(inner(k), inner(k + 2), lg + 5);
  for (let k = 0; k < 6; k++) L(outer(k), outer(k + 2), lg + 6);
  for (let k = 0; k < 3; k++) { L(inner(k), inner(k + 3), lg + 7); L(outer(k), outer(k + 3), lg + 7); }
  for (let o = 1; o <= 5; o++) for (let k = 0; k < 6; k++) L(inner(k), outer(k + o), lg + 7 + o);
  // Which groups each build stage includes: circles only, then the cube
  // skeleton (spokes and hexagons), then all 78.
  return { P, circles, lines, next: lg + 13, skeletonEnd: lg + 5 };
}

function metatron(stage) {
  const name = STAGES.metatron[stage];
  const R = 5;
  const strokes = [];
  const m = metatronStrokes(1, 0, 'm');
  strokes.push(...m.circles);
  if (name !== 'fruit') {
    const lastG = name === 'cube' ? m.skeletonEnd - 1 : Infinity;
    strokes.push(...m.lines.filter((s) => s.group <= lastG));
  }
  let next = m.next;
  if (name === 'in flower' || name === 'nested') {
    // The flower of life under the cube, carried out to the fruit's
    // reach: the reference drawing "Metatron's cube in the flower".
    const lat = latticeStrokes(R, next, 1);
    strokes.push(...lat.strokes);
    next = lat.next;
  }
  if (name === 'nested') {
    // A half-scale cube inside: its outer centres land on the big
    // cube's inner centres.
    const n = metatronStrokes(0.5, next, 'n');
    strokes.push(...n.circles, ...n.lines);
    next = n.next;
  }
  const f = frameStrokes(R, next, 0, false);
  return { strokes: [...strokes, ...f.strokes], R, center: [0, 0], solid: false };
}

// ---- solids --------------------------------------------------------
// Unit-free object space, y up. The scene spins each body about y and
// tilts the whole solid toward the viewer by the shape slider.

const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scl3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const mid3 = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];

function seg3(a, b, group, layer, body, key) {
  return { kind: 1, c: a.slice(), u: sub3(b, a), v: [0, 0, 0], a0: 0, sweep: 1, group, layer, body, bill: false, style: null, key };
}

// Merkaba: the star tetrahedron, apex up, scaled so its base corners sit
// on radius 1. Seen down its axis it is the hexagram whose points land
// on the seed of life's centres.
export function merkabaVerts() {
  const k = 3 / (2 * Math.SQRT2); // base radius 2*sqrt(2)/3 -> 1
  const A = [[0, 1, 0]];
  for (let i = 0; i < 3; i++) {
    const a = i * TAU / 3;
    A.push([(2 * Math.SQRT2 / 3) * Math.sin(a), -1 / 3, (2 * Math.SQRT2 / 3) * Math.cos(a)]);
  }
  const As = A.map((p) => scl3(p, k));
  const Bs = As.map((p) => scl3(p, -1));
  return { A: As, B: Bs };
}

function merkaba(stage) {
  const name = STAGES.merkaba[stage];
  const { A, B } = merkabaVerts();
  const strokes = [];
  const tet = (V, body, tag, g) => {
    for (let i = 1; i <= 3; i++) strokes.push(seg3(V[0], V[i], g, 0, body, `${tag}a${i}`));
    for (let i = 1; i <= 3; i++) strokes.push(seg3(V[i], V[1 + (i % 3)], g + 1, 0, body, `${tag}b${i}`));
  };
  tet(A, 1, 'A', 0);
  if (name !== 'tetrahedron') tet(B, 2, 'B', 2);
  let next = name === 'tetrahedron' ? 2 : 4;
  if (name === 'cube') {
    // The star's eight points are a cube's corners; its two tetrahedra
    // meet in an octahedron at the cube's face centres.
    const cubeEdge = len3(sub3(A[0], A[1])) / Math.SQRT2;
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        if (Math.abs(len3(sub3(A[i], B[j])) - cubeEdge) < 1e-6) {
          strokes.push(seg3(A[i], B[j], next + (A[i][1] + B[j][1] > 0 ? 0 : 1), 1, 3, `C${i}${j}`));
        }
      }
    }
    const M = [];
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) M.push(mid3(A[i], A[j]));
    const octEdge = len3(sub3(A[0], A[1])) / 2;
    for (let i = 0; i < 6; i++) {
      for (let j = i + 1; j < 6; j++) {
        if (Math.abs(len3(sub3(M[i], M[j])) - octEdge) < 1e-6) {
          strokes.push(seg3(M[i], M[j], next + 2 + (M[i][1] + M[j][1] > 0 ? 0 : 1), 0, 3, `O${i}${j}`));
        }
      }
    }
    next += 4;
  }
  const R = 1.12 * Math.max(...[...A, ...B].map(len3));
  const f = frameStrokes(R, next, 4, false);
  return { strokes: [...strokes, ...f.strokes], R, center: [0, 0], solid: true };
}

// Rows of a rotation taking (1,1,1)/sqrt3 to +y: a three-fold axis
// stands up, so a hexagonal equator lies flat and the figure seen down
// that axis lines up with the flower's lattice.
const RX = [1 / Math.SQRT2, -1 / Math.SQRT2, 0];
const RY = [1 / SQ3, 1 / SQ3, 1 / SQ3];
const RZ = [RX[1] * RY[2] - RX[2] * RY[1], RX[2] * RY[0] - RX[0] * RY[2], RX[0] * RY[1] - RX[1] * RY[0]];
const rot111 = (p) => [dot3(RX, p), dot3(RY, p), dot3(RZ, p)];

// Vector equilibrium (cuboctahedron), edge = radius = 1, turned so one
// of its four hexagonal equators lies flat: seen down that axis its
// outline is the seed of life's hexagon.
export function equilibriumVerts() {
  const raw = [];
  for (const [i, j] of [[0, 1], [0, 2], [1, 2]]) {
    for (const a of [1, -1]) for (const b of [1, -1]) {
      const p = [0, 0, 0];
      p[i] = a / Math.SQRT2;
      p[j] = b / Math.SQRT2;
      raw.push(p);
    }
  }
  const rot = rot111;
  const axes = [[1, 1, 1], [1, 1, -1], [1, -1, 1], [-1, 1, 1]].map((n) => rot(scl3(n, 1 / SQ3)));
  return { V: raw.map(rot), axes };
}

// Two unit vectors spanning the plane with normal n.
function planeBasis(n) {
  const t = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let u = [n[1] * t[2] - n[2] * t[1], n[2] * t[0] - n[0] * t[2], n[0] * t[1] - n[1] * t[0]];
  u = scl3(u, 1 / len3(u));
  const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  return [u, v];
}

function equilibrium(stage) {
  const name = STAGES.equilibrium[stage];
  const { V, axes } = equilibriumVerts();
  const strokes = [];
  // Each of the 24 edges lies in exactly one hexagonal equator: draw the
  // four hexagons one per step.
  for (let i = 0; i < 12; i++) {
    for (let j = i + 1; j < 12; j++) {
      if (Math.abs(len3(sub3(V[i], V[j])) - 1) > 1e-6) continue;
      const h = axes.findIndex((n) => Math.abs(dot3(V[i], n)) < 1e-6 && Math.abs(dot3(V[j], n)) < 1e-6);
      strokes.push(seg3(V[i], V[j], h, 0, 3, `E${i}-${j}`));
    }
  }
  let next = 4;
  if (name !== 'cuboctahedron') {
    // Twelve radial vectors, each as long as an edge: the equilibrium
    // the name is about. Then the four great circles of the hexagons.
    for (let i = 0; i < 12; i++) strokes.push(seg3([0, 0, 0], V[i], next + (V[i][1] >= 0 ? 0 : 1), 0, 3, `V${i}`));
    next += 2;
    axes.forEach((n, k) => {
      const [u, v] = planeBasis(n);
      strokes.push({ kind: 0, c: [0, 0, 0], u, v, a0: 0, sweep: TAU, group: next + k, layer: 1, body: 3, bill: false, style: null, key: `G${k}` });
    });
    next += 4;
  }
  if (name === 'spheres') {
    // Twelve spheres round one, each touching its neighbours: the
    // closest packing the vector equilibrium describes.
    const sph = (c, g, key) => strokes.push({ kind: 0, c: c.slice(), u: [0.5, 0, 0], v: [0, 0.5, 0], a0: Math.PI / 2, sweep: TAU, group: g, layer: 0, body: 3, bill: true, style: null, key });
    sph([0, 0, 0], next, 'S0');
    V.forEach((p, i) => sph(p, next + 1 + (i % 4), `S${i + 1}`));
    next += 5;
  }
  const R = 1.12 * (name === 'spheres' ? 1.5 : 1);
  const f = frameStrokes(R, next, 4, false);
  return { strokes: [...strokes, ...f.strokes], R, center: [0, 0], solid: true };
}

// The torus: circles of radius 1 whose centres walk a circle of radius 1,
// so every one passes through the middle. Six of them is the seed of
// life without its centre; turning the seed round its middle fills in
// the torus. Each circle starts its pen at the shared centre and the
// build walks round clockwise, the newer circles splitting the gaps.
export const TORUS_COUNTS = [6, 12, 24, 48, 96];
function torus(stage) {
  const N = TORUS_COUNTS[stage];
  const strokes = [];
  // Order: the six of the seed first, then each doubling fills the
  // halfway points, so every stage keeps the one before it in front.
  // A circle's level is how many doublings it took to appear.
  const L = Math.log2(N / 6);
  const twos = (k) => { let n = 0; while (k > 0 && k % 2 === 0) { k /= 2; n++; } return n; };
  const level = (k) => (k === 0 ? 0 : Math.max(0, L - twos(k)));
  const order = Array.from({ length: N }, (_, k) => k).sort((a, b) => level(a) - level(b) || a - b);
  let g = 0;
  for (const k of order) {
    const a = Math.PI / 2 - k * TAU / N; // clockwise from the top
    const cx = Math.cos(a), cy = Math.sin(a);
    strokes.push(arc2(cx, cy, 1, a + Math.PI, TAU, g++, 0, `t:${r6(cx)},${r6(cy)}`));
  }
  const R = 2;
  const f = frameStrokes(R, g, 0, true);
  return { strokes: [...strokes, ...f.strokes], R, center: [0, 0], solid: false, sym6: true };
}

// Three golden rectangles, each square to the others: their twelve
// corners are an icosahedron's. Scaled so the corners sit on radius 1.
// The last stage adds the dual dodecahedron at the same midradius, the
// compound whose edges cross square at their midpoints.
const PHI = (1 + Math.sqrt(5)) / 2;
export function goldenVerts() {
  const k = 1 / Math.sqrt(1 + PHI * PHI);
  const rects = [
    [[1, PHI, 0], [-1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0]],
    [[0, 1, PHI], [0, -1, PHI], [0, -1, -PHI], [0, 1, -PHI]],
    [[PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1], [-PHI, 0, 1]],
  ].map((r) => r.map((p) => scl3(p, k)));
  const ico = rects.flat();
  const dod = [];
  for (const a of [1, -1]) for (const b of [1, -1]) for (const c of [1, -1]) dod.push([a, b, c]);
  for (const a of [1, -1]) for (const b of [1, -1]) {
    dod.push([0, a / PHI, b * PHI], [a / PHI, b * PHI, 0], [b * PHI, 0, a / PHI]);
  }
  return { rects, ico, dod: dod.map((p) => scl3(p, k)), k };
}

function golden(stage) {
  const name = STAGES.golden[stage];
  const { rects, ico, dod, k } = goldenVerts();
  const strokes = [];
  rects.forEach((r, i) => {
    for (let j = 0; j < 4; j++) strokes.push(seg3(r[j], r[(j + 1) % 4], i, 0, 3, `R${i}${j}`));
  });
  let next = 3;
  // Edges top to bottom, six to a step.
  const edges = (V, len, tag) => {
    const out = [];
    for (let i = 0; i < V.length; i++) {
      for (let j = i + 1; j < V.length; j++) {
        if (Math.abs(len3(sub3(V[i], V[j])) - len) < 1e-6) out.push([V[i], V[j], `${tag}${i}-${j}`]);
      }
    }
    out.sort((a, b) => (b[0][1] + b[1][1]) - (a[0][1] + a[1][1]));
    return out;
  };
  if (name !== 'rectangles') {
    const ie = edges(ico, 2 * k, 'I');
    ie.forEach(([a, b, key], i) => strokes.push(seg3(a, b, next + Math.floor(i / 6), 0, 3, key)));
    next += Math.ceil(ie.length / 6);
  }
  if (name === 'compound') {
    const de = edges(dod, (2 / PHI) * k, 'D');
    de.forEach(([a, b, key], i) => strokes.push(seg3(a, b, next + Math.floor(i / 6), 1, 3, key)));
    next += Math.ceil(de.length / 6);
  }
  const R = 1.12;
  const f = frameStrokes(R, next, 4, false);
  return { strokes: [...strokes, ...f.strokes], R, center: [0, 0], solid: true };
}

// The 64 tetrahedron grid: eight star tetrahedra whose inner points
// meet at the centre, in Fuller's isotropic vector matrix (every edge 1).
// Their eight inner tips are the vector equilibrium's eight tetrahedra,
// so the core is the equilibrium mode's figure; their eight outer tips
// sit on a cube. 63 points, 240 edges, and the edges close exactly 64
// tetrahedra. Integer lattice coordinates below; real = / sqrt 2.
export function gridGeometry() {
  const k = 1 / Math.SQRT2;
  const real = (p) => rot111(p.map((v) => v * k));
  const stars = [];
  for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sz of [1, -1]) {
    const O = [sx, sy, sz];
    const octa = [];
    for (let i = 0; i < 3; i++) for (const sgn of [1, -1]) { const v = O.slice(); v[i] += sgn; octa.push(v); }
    const tips = [];
    for (const tx of [1, -1]) for (const ty of [1, -1]) for (const tz of [1, -1]) {
      const tip = [O[0] + tx, O[1] + ty, O[2] + tz];
      tips.push({ tip, face: [[O[0] + tx, O[1], O[2]], [O[0], O[1] + ty, O[2]], [O[0], O[1], O[2] + tz]] });
    }
    stars.push({ O, octa, tips });
  }
  return { stars, real };
}

function grid(stage) {
  const name = STAGES.grid[stage];
  const { stars, real } = gridGeometry();
  const strokes = [];
  const have = new Set();
  const ik = (p) => p.join(',');
  const edge = (a, b, g, layer) => {
    const key = `G${[ik(a), ik(b)].sort().join('|')}`;
    if (have.has(key)) return false;
    have.add(key);
    strokes.push(seg3(real(a), real(b), g, layer, 3, key));
    return true;
  };
  // The core: the equilibrium's twelve radii, then its four hexagons.
  const zero = [0, 0, 0];
  const ve = [];
  for (const [i, j] of [[0, 1], [0, 2], [1, 2]]) for (const a of [1, -1]) for (const b of [1, -1]) { const p = [0, 0, 0]; p[i] = a; p[j] = b; ve.push(p); }
  ve.forEach((p) => edge(zero, p, real(p)[1] >= 0 ? 0 : 1, 0));
  const hexAxes = [[1, 1, 1], [1, 1, -1], [1, -1, 1], [-1, 1, 1]];
  for (let a = 0; a < 12; a++) {
    for (let b = a + 1; b < 12; b++) {
      const d = ve[a].reduce((sum, x, i) => sum + (x - ve[b][i]) ** 2, 0);
      if (d !== 2) continue;
      const h = hexAxes.findIndex((n) => dot3(n, ve[a]) === 0 && dot3(n, ve[b]) === 0);
      edge(ve[a], ve[b], 2 + h, 0);
    }
  }
  let next = 6;
  if (name !== 'core') {
    // Then the eight stars, top to bottom: each star's octahedron, then
    // its seven outer points.
    const order = stars.slice().sort((p, q) => real(q.O)[1] - real(p.O)[1] || Math.atan2(real(p.O)[2], real(p.O)[0]) - Math.atan2(real(q.O)[2], real(q.O)[0]));
    for (const star of order) {
      let any = false;
      for (let a = 0; a < 6; a++) {
        for (let b = a + 1; b < 6; b++) {
          const d = star.octa[a].reduce((sum, x, i) => sum + (x - star.octa[b][i]) ** 2, 0);
          if (d === 2) any = edge(star.octa[a], star.octa[b], next, 0) || any;
        }
      }
      if (any) next++;
      any = false;
      for (const { tip, face } of star.tips) for (const f of face) any = edge(tip, f, next, 0) || any;
      if (any) next++;
    }
  }
  if (name === 'spheres') {
    // A sphere at every point, radius half an edge: the closest packing
    // the matrix is built from, shell by shell.
    const seen = new Map();
    for (const st of stars) for (const p of [...st.octa, ...st.tips.map((t) => t.tip)]) seen.set(ik(p), p);
    seen.set(ik(zero), zero);
    const shells = [...new Set([...seen.values()].map((p) => dot3(p, p)))].sort((a, b) => a - b);
    for (const p of seen.values()) {
      const g = next + shells.indexOf(dot3(p, p));
      strokes.push({ kind: 0, c: real(p), u: [0.5, 0, 0], v: [0, 0.5, 0], a0: Math.PI / 2, sweep: TAU, group: g, layer: 1, body: 3, bill: true, style: null, key: `GS${ik(p)}` });
    }
    next += shells.length;
  }
  const outer = name === 'core' ? 1 : Math.sqrt(6) + (name === 'spheres' ? 0.5 : 0);
  const R = 1.12 * outer;
  const f = frameStrokes(R, next, 4, false);
  return { strokes: [...strokes, ...f.strokes], R, center: [0, 0], solid: true };
}

const BUILDERS = { flower, metatron, merkaba, equilibrium, torus, golden, grid };

export function figure(mode, stage) {
  const m = MODES.includes(mode) ? mode : 'flower';
  const n = STAGES[m].length;
  const st = Math.min(n - 1, Math.max(0, stage | 0));
  const f = BUILDERS[m](st);
  const groups = [...new Set(f.strokes.map((s) => s.group))].sort((a, b) => a - b);
  // Sixfold figures settle upright to the nearest sixth of a turn.
  const sym6 = f.sym6 || ((m === 'flower' && st > 0) || m === 'metatron');
  return { ...f, mode: m, stage: st, name: STAGES[m][st], groups, sym6 };
}
