// Copied from donor/vs3/visual_kit/src/scenes/locus.js (the friends' engine, used with permission, 2026-11-19).
// vjw: wrapped in a factory (one scene object per layer); nothing else changed. agents/guides/guide_vs3_port.md
// Scene: locus (working title). A swarm of glowing particles that holds
// hand-built math formations and flies from one to the next. 34
// formations along the formation slider, grouped: pure math (the Aizawa
// attractor, the Hopf fibration, a torus knot, a turning 4D tesseract, a
// spherical harmonic, a Lissajous shell, a Chladni plate), sacred
// geometry (Kepler's nested Platonic solids, a merkaba, the flower of
// life, Metatron's cube, a Sri Yantra, a Sierpinski tetrahedron, a
// vortex torus), growing things (a lotus, a seashell, a fractal tree, a
// double helix), creatures (a jellyfish, a butterfly, two koi, a whale,
// a manta ray, an octopus, a dragon) and the cosmos (an aurora, a ringed
// planet, a solar system, a black hole, a pulsar, a nebula, a spiral
// galaxy, a deep field, the cosmic web). Alec's 2026-10-11 vote cut the
// Lorenz and Thomas attractors, the Klein bottle, the gyroid, the
// sunflower and the phoenix (git history has them).
//
// The slider snaps to its stops and the HUD names the one it is on. It
// picks the formation and nothing else does: the music never changes it. When the pick changes, the swarm flies there on its own,
// peeling off in order along its strands, arcing round on the way and
// settling into the new shape (Alec 2026-10-10: the particles should
// move to the new formation).
//
// The music moves light and motion. Energy lights the swarm, mids stream
// it along its own paths (and pace the formations that animate
// themselves: the jellyfish pulse, the tesseract turn, the tree in the
// wind), sub breathes it outward, highs make it shimmer and sparkle, and
// each kick gives a small push. An accent (a 0.55 hit after a 3.2 s
// rest, 8 s fallback) surges the stream forward and rolls a ring of
// light out through the swarm. Nothing re-poses or blows apart on a beat.
//
// How it runs: every formation is a function of a particle's fixed
// coordinates (a golden-ratio strand position, an R2 pair and a hash, all
// from its index) and the formation's own clock, evaluated on the GPU.
// The only state is each particle's offset from its target and that
// offset's velocity, in a float texture pair simulated in one pass: a
// damped spring pulls the offset home, so a held formation is exact and
// a new pick becomes a flight. The attractors are integrated once on the
// CPU into 65,536-step orbits in a float texture. No per-frame JS
// touches a particle.
//
// Drag turns the swarm and the angle holds on release; it turns slowly
// on its own with speed. Shift+Space settles a dragged tilt home.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { PAL, drastic, scenePointer } from '../lib/common.js';
import { ctx } from '../lib/context.js';
export default function create() { // vjw

const scene = new THREE.Scene();
scene.background = PAL.bg;
const FOV = 38;
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 60);
camera.position.set(0, 0, 3.8);

// ---------------------------------------------------------- taste knobs
const SW = 1024, SH = 512;    // state texture: one texel a particle
const N_MAX = SW * SH;        // 524,288 particles at the top of the slider
const N_REF = 1 << 17;        // the count the light and size are tuned at
// Formations by shader id (the order they were built in), with the name
// the panel and the HUD show.
const NAMES = [
  'aizawa attractor', 'hopf fibration', 'torus knot', 'tesseract', 'seashell', 'dna helix',
  'fractal tree', 'sierpinski', 'chladni plate', 'spherical harmonic', 'lissajous shell',
  'spiral galaxy', 'ringed planet', 'black hole', 'jellyfish', 'aurora', 'butterfly', 'whale',
  'koi', 'flower of life', 'platonic solids', 'merkaba', 'vortex torus', 'solar system',
  'cosmic web', 'deep field', 'metatron\'s cube', 'sri yantra', 'lotus', 'manta ray', 'octopus',
  'dragon', 'nebula', 'pulsar'];
// Slider order, grouped: pure math, sacred geometry, growing things,
// creatures, the cosmos.
const ORDER = [
  0, 1, 2, 3, 9, 10, 8,
  20, 21, 19, 26, 27, 7, 22,
  28, 4, 6, 5,
  14, 16, 18, 17, 29, 30, 31,
  15, 12, 23, 13, 33, 32, 11, 25, 24];
// Each formation's own thickness (world units), how much of the scatter
// slider it takes (flat and fine-lined ones blur first), and its light,
// set so all of them sit near one frame brightness (a lone knot
// concentrates its particles, a shell spreads them thin). By shader id.
const THICK = [
  0.014, 0.008, 0.03, 0.016, 0.008, 0.026, 0.012, 0.006, 0.006, 0.014, 0.014, 0.0, 0.004, 0.006,
  0.01, 0.012, 0.008, 0.01, 0.006, 0.006, 0.008, 0.008, 0.008, 0.004, 0.006, 0.004,
  0.004, 0.004, 0.008, 0.008, 0.01, 0.01, 0.012, 0.006];
const SCAT = [
  1, 0.7, 1, 0.8, 1, 1, 0.8, 0.6, 0.45, 1, 1, 1, 0.25, 0.6, 1, 1, 0.7, 1, 0.8, 0.5, 0.6, 0.6, 0.8,
  0.4, 0.8, 0.6,
  0.4, 0.4, 0.7, 0.7, 0.8, 0.8, 1, 0.6];
const LIGHT = [
  2.6, 1.6, 0.8, 1.0, 1.4, 0.85, 1.2, 1.0, 1.2, 1.8, 1.25, 1.0, 1.7, 1.3, 1.2, 1.5, 1.3, 1.3, 1.4,
  1.2, 1.0, 1.1, 1.2, 1.4, 1.4, 1.4, 1.2, 1.2, 1.6, 1.2, 1.2, 0.6, 1.2, 1.2];
const FLOW = 0.2;             // world units a second along the paths, speed 0.5, mids at rest
const SPIN = 0.06;            // rad a second the swarm turns on its own at speed 0.5
const BASE_PITCH = 0.22;      // resting tilt toward the camera
const SIZE = 0.0056;          // particle diameter in world units at N_REF
const MIN_PX = 1.25;          // smaller points keep their light and stop shimmering
const GAIN = 0.5;             // light per particle at N_REF, full energy
const FIT = 1.2;              // half-extent the formation keeps in frame at zoom 0.5
// the flight between formations
const SPRING = 14;            // pull home (1/s^2)
const DAMP = 2 * 0.8 * Math.sqrt(SPRING); // a touch under critical: a soft overshoot as it arrives
const VMAX = 2.4;             // top flight speed, world units a second
const SWIRL = 3.0;            // how hard a far particle arcs round its own axis
const STAGGER = 0.9;          // s from the first particle leaving to the last
const PICK_DWELL = 0.15;      // s the slider rests on a formation before the swarm goes
const ACCENT_HIT = 0.55, ACCENT_REST = 3.2, ACCENT_FALLBACK = 8;

// ---------------------------------------------------------- attractors
// One orbit per attractor, TRAJ steps, rows TROWS each in one texture.
const TW = 1024, TROWS = 64, TRAJ = TW * TROWS;
const ATTRACTORS = [
  { // Aizawa: a sphere pierced by a spout along its axis, axis up
    f: (x, y, z, o) => {
      const a = 0.95, b = 0.7, c = 0.6, d = 3.5, e = 0.25, g = 0.1;
      o[0] = (z - b) * x - d * y;
      o[1] = d * x + (z - b) * y;
      o[2] = c + a * z - (z * z * z) / 3 - (x * x + y * y) * (1 + e * z) + g * z * x * x * x;
    },
    p0: [0.1, 0, 0], h: 0.004, sub: 1, burn: 12000,
    orient: (x, y, z, o) => { o[0] = x; o[1] = z; o[2] = y; },
  },
];

function rk4(f, p, h, k) {
  const [k1, k2, k3, k4, q] = k;
  f(p[0], p[1], p[2], k1);
  for (let j = 0; j < 3; j++) q[j] = p[j] + k1[j] * h / 2;
  f(q[0], q[1], q[2], k2);
  for (let j = 0; j < 3; j++) q[j] = p[j] + k2[j] * h / 2;
  f(q[0], q[1], q[2], k3);
  for (let j = 0; j < 3; j++) q[j] = p[j] + k3[j] * h;
  f(q[0], q[1], q[2], k4);
  for (let j = 0; j < 3; j++) p[j] += (h / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]);
}

// Integrates one attractor into data rows [row0, row0 + TROWS): xyz
// centered and scaled so 99.5% of the orbit sits inside radius 1, w the
// local speed (0 slow, 1 fast), which colors the swarm. Returns the
// orbit's length in those units, which paces the stream.
function integrate(A, data, row0) {
  const k = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const p = A.p0.slice();
  const o = [0, 0, 0];
  for (let i = 0; i < A.burn; i++) rk4(A.f, p, A.h, k);
  const base = row0 * TW * 4;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < TRAJ; i++) {
    for (let j = 0; j < A.sub; j++) rk4(A.f, p, A.h, k);
    A.orient(p[0], p[1], p[2], o);
    for (let j = 0; j < 3; j++) {
      data[base + i * 4 + j] = o[j];
      if (o[j] < lo[j]) lo[j] = o[j];
      if (o[j] > hi[j]) hi[j] = o[j];
    }
  }
  const c = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  const rad = new Float32Array(TRAJ);
  for (let i = 0; i < TRAJ; i++) {
    const b = base + i * 4;
    data[b] -= c[0]; data[b + 1] -= c[1]; data[b + 2] -= c[2];
    rad[i] = Math.hypot(data[b], data[b + 1], data[b + 2]);
  }
  const sorted = rad.slice().sort();
  const sc = 1 / sorted[Math.floor(TRAJ * 0.995)];
  const spd = new Float32Array(TRAJ);
  let len = 0;
  for (let i = 0; i < TRAJ; i++) {
    const b = base + i * 4;
    data[b] *= sc; data[b + 1] *= sc; data[b + 2] *= sc;
  }
  for (let i = 0; i < TRAJ; i++) {
    const b = base + i * 4, n = base + ((i + 1) % TRAJ) * 4;
    const d = Math.hypot(data[n] - data[b], data[n + 1] - data[b + 1], data[n + 2] - data[b + 2]);
    spd[i] = d;
    if (i < TRAJ - 1) len += d;
  }
  const sp = spd.slice().sort();
  const lo5 = sp[Math.floor(TRAJ * 0.05)], hi95 = sp[Math.floor(TRAJ * 0.95)];
  // Where the orbit crowds (the slow turns near a fixed point, the
  // spout) additive light piles into a white blot. A coarse grid
  // counts samples per cell and dims the crowded cells toward the
  // typical one, so every part of the attractor shows its threads.
  const G = 40, cell = new Uint32Array(G * G * G);
  const ci = (b) => {
    const g = (v) => Math.min(G - 1, Math.max(0, Math.floor((v + 1.1) / 2.2 * G)));
    return g(data[b]) + G * (g(data[b + 1]) + G * g(data[b + 2]));
  };
  for (let i = 0; i < TRAJ; i++) cell[ci(base + i * 4)]++;
  const occ = Array.from(cell).filter((n) => n > 0).sort((x, y) => x - y);
  const ref = occ[Math.floor(occ.length * 0.7)];
  // w packs the speed tone (0..63, whole part) and the crowd weight
  // (fraction): the shader reads both from the nearer sample
  for (let i = 0; i < TRAJ; i++) {
    const b = base + i * 4;
    const tone = Math.min(1, Math.max(0, (spd[i] - lo5) / (hi95 - lo5)));
    const wgt = Math.min(0.999, Math.max(0.12, Math.pow(ref / cell[ci(b)], 0.65)));
    data[b + 3] = Math.round(tone * 63) + wgt;
  }
  return len;
}

// Length of each formation's flow path in world units: flow 1 carries a
// particle this far, so FLOW / length is its pace. The attractors
// measure their own orbits at build; the closed forms are measured here
// from the same curves the shader draws.
function curveLength(fn, n = 20000) {
  let len = 0, prev = fn(0);
  for (let i = 1; i <= n; i++) {
    const p = fn(i / n);
    len += Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]);
    prev = p;
  }
  return len;
}
const TAU = Math.PI * 2;
const KNOT_P = 3, KNOT_Q = 7;
const knotAt = (s) => {
  const t = s * TAU, rr = 0.66 + 0.27 * Math.cos(KNOT_Q * t);
  return [rr * Math.cos(KNOT_P * t), rr * Math.sin(KNOT_P * t), 0.27 * Math.sin(KNOT_Q * t)];
};
const LJ = [9, 11, 13];
const lissAt = (s) => {
  const t = s * TAU;
  const x = Math.sin(LJ[0] * t + 0.6), y = Math.sin(LJ[1] * t), z = Math.sin(LJ[2] * t + 1.3);
  const l = Math.max(1e-4, Math.hypot(x, y, z));
  return [0.95 * x / l, 0.95 * y / l, 0.95 * z / l];
};
const HELIX_R = 0.4, HELIX_TURNS = 3.2, HELIX_LEN = 2.5;

// Flow paces. flow 1 carries a formation's particles this far (world
// units), or for the ones that animate themselves, through one full
// cycle (a tesseract turn, a jellyfish pulse, a gust of wind), so
// FLOW / PATH is its pace. The attractors measure their orbits at build.
const PATH = [
  0, 3.0, curveLength(knotAt), 7.0, 3.0, TAU * HELIX_R, 1.6, 3.0, 3.0, TAU * 2.2,
  curveLength(lissAt), 2.6, 1.0, 1.5, 0.9, 2.4, 0.6, 2.4, 3.2, 4.0, 30.0, 8.0, 6.0, 1.0, 1.2, 20.0,
  3.0, 25.0, 2.5, 1.2, 1.5, 1.5, 2.0, 2.0];
const NF = NAMES.length;

// ---------------------------------------------------------- geometry tables
// Small lookup rows the shader reads with texelFetch (row 0: Platonic
// edges, row 1: cosmic web clusters, row 2: its filaments, row 3:
// Metatron's cube, its 78 lines then its 13 centers).
const GEO_W = 256;
const PHI = (1 + Math.sqrt(5)) / 2;
function solidEdges(verts, scale, sid) {
  const v = verts.map((p) => { const l = Math.hypot(...p); return p.map((c) => (c / l) * scale); });
  let dmin = Infinity;
  for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) dmin = Math.min(dmin, Math.hypot(v[i][0] - v[j][0], v[i][1] - v[j][1], v[i][2] - v[j][2]));
  const out = [];
  for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) {
    if (Math.hypot(v[i][0] - v[j][0], v[i][1] - v[j][1], v[i][2] - v[j][2]) < dmin * 1.001) out.push([...v[i], sid], [...v[j], sid]);
  }
  return out;
}
const pm = (a) => a.flatMap((x) => [x, -x]).filter((x, i, arr) => x !== 0 || arr.indexOf(x) === i);
const perms = (base) => { const o = []; for (const x of pm([base[0]])) for (const y of pm([base[1]])) for (const z of pm([base[2]])) o.push([x, y, z]); return o; };
const cyc = (a) => [[a[0], a[1], a[2]], [a[1], a[2], a[0]], [a[2], a[0], a[1]]];
const SOLIDS = [
  // Kepler's order, outside in: cube, tetrahedron, dodecahedron, icosahedron, octahedron
  [perms([1, 1, 1]), 1.0],
  [[[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]], 0.9],
  [[...perms([1, 1, 1]), ...cyc([0, 1 / PHI, PHI]).flatMap((b) => perms(b))], 0.7],
  [cyc([0, 1, PHI]).flatMap((b) => perms(b)), 0.54],
  [cyc([1, 0, 0]).flatMap((b) => perms(b)), 0.4],
];
const PLATONIC = SOLIDS.flatMap(([verts, sc], sid) => solidEdges(verts, sc, sid));
const PLATONIC_EDGES = PLATONIC.length / 2;
// the cosmic web: clusters scattered through a ball (a fixed seed, so it
// is the same web every time), each joined to its three nearest
let seed = 0x5eed1234;
const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const WEB = [];
while (WEB.length < 38) {
  const p = [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1];
  if (Math.hypot(...p) < 1) WEB.push([p[0] * 1.05, p[1] * 0.85, p[2] * 1.05, 0.035 + 0.07 * rnd() ** 2]);
}
const WEB_LINKS = [];
WEB.forEach((a, i) => {
  const near = WEB.map((b, j) => [Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), j]).filter(([, j]) => j !== i).sort((x, y) => x[0] - y[0]).slice(0, 3);
  for (const [, j] of near) if (!WEB_LINKS.some(([x, y]) => (x === i && y === j) || (x === j && y === i))) WEB_LINKS.push([i, j]);
});
// Metatron's cube: the thirteen centers of the fruit of life (one in the
// middle, two rings of six, every circle radius MET_R) and every pair
const MET_R = 0.16;
const MET_C = [[0, 0]];
for (const ring of [2, 4]) for (let i = 0; i < 6; i++) {
  const a = Math.PI / 2 + (i * Math.PI) / 3;
  MET_C.push([Math.cos(a) * ring * MET_R, Math.sin(a) * ring * MET_R]);
}
const MET_LINES = [];
for (let i = 0; i < 13; i++) for (let j = i + 1; j < 13; j++) MET_LINES.push([MET_C[i], MET_C[j]]);
function geoTexture() {
  const d = new Float32Array(GEO_W * 4 * 4);
  PLATONIC.forEach((e, i) => d.set(e, i * 4));
  WEB.forEach((n, i) => d.set(n, (GEO_W + i) * 4));
  WEB_LINKS.forEach(([a, b], i) => d.set([a, b, 0, 0], (2 * GEO_W + i) * 4));
  MET_LINES.forEach(([a, b], i) => { d.set([a[0], a[1], 0, 0], (3 * GEO_W + 2 * i) * 4); d.set([b[0], b[1], 0, 0], (3 * GEO_W + 2 * i + 1) * 4); });
  MET_C.forEach((c, i) => d.set([c[0], c[1], 0, 0], (3 * GEO_W + 160 + i) * 4));
  const tex = new THREE.DataTexture(d, GEO_W, 4, THREE.RGBAFormat, THREE.FloatType);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------- shaders
const glslList = (a) => a.map((v) => v.toFixed(4)).join(', ');
const COMMON_GLSL = /* glsl */`
  const float TAU = 6.283185307;
  const float PI = 3.14159265;
  const int SW = ${SW};
  const float THICK[${NF}] = float[${NF}](${glslList(THICK)});
  const float LIGHT[${NF}] = float[${NF}](${glslList(LIGHT)});
  const float SCAT[${NF}] = float[${NF}](${glslList(SCAT)});
  uniform sampler2D uTraj, uGeo;
  uniform float uFlows[${NF}];
  uniform float uLobe, uClock, uScatter, uTurb, uTime, uBreath;

  uint pcg(uint x) {
    uint state = x * 747796405u + 2891336453u;
    uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
  }
  float u01(uint x) { return float(x >> 8u) / 16777216.0; }

  vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
  vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
  vec3 rotZ(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z); }
  vec3 rotAxis(vec3 v, vec3 a, float t) { float c = cos(t), s = sin(t); return v * c + cross(a, v) * s + a * dot(a, v) * (1.0 - c); }
  vec3 sphereDir(float a, float b) {
    float z = a * 2.0 - 1.0, r = sqrt(max(0.0, 1.0 - z * z)), ph = b * TAU;
    return vec3(r * cos(ph), z, r * sin(ph));
  }

  // A particle's fixed coordinates, all from its index: q = (golden-ratio
  // strand, R2 pair) in exact integer arithmetic, four uniform hashes,
  // a hash word for digit picks, the thickness radius and the light spread.
  struct Pt { vec3 q; vec4 h; uint hb; float jr; float r6; };
  Pt particle(int id) {
    uint i = uint(id);
    Pt P;
    P.q = vec3(float((i * 2654435769u) >> 8u), float((i * 3242174889u + 2147483648u) >> 8u),
      float((i * 2447445414u + 2147483648u) >> 8u)) / 16777216.0;
    uint a1 = pcg(i), a2 = pcg(a1 ^ 0x9e3779b9u), a3 = pcg(a2), a4 = pcg(a3), a5 = pcg(a4), a6 = pcg(a5);
    P.h = vec4(u01(a1), u01(a2), u01(a3), u01(a4));
    P.hb = pcg(a6 ^ 0x5bd1e995u);
    P.jr = pow(u01(a5), 2.2);
    P.r6 = u01(a6);
    return P;
  }

  // A point on attractor k's orbit at phase sp: xyz between the two
  // nearest steps, the speed tone in w, the crowd weight out.
  vec4 traj(int k, float sp, out float wgt) {
    float f = sp * ${TRAJ}.0;
    float fl = floor(f);
    int i0 = min(int(fl), ${TRAJ - 1});
    int i1 = i0 + 1;
    if (i1 >= ${TRAJ}) i1 = 0;
    int row = k * ${TROWS};
    vec4 a = texelFetch(uTraj, ivec2(i0 % ${TW}, row + i0 / ${TW}), 0);
    vec4 b = texelFetch(uTraj, ivec2(i1 % ${TW}, row + i1 / ${TW}), 0);
    wgt = fract(a.w);
    return vec4(mix(a.xyz, b.xyz, f - fl), floor(a.w) / 63.0);
  }

  // the dragon's spine at body position t (0 head .. 1 tail): a ripple in
  // two planes that runs down the body
  vec3 dragonSpine(float t, float ph) {
    return vec3(0.9 - 1.85 * t, 0.24 * sin(TAU * 1.6 * t - ph) * (0.35 + 0.65 * t), 0.32 * sin(TAU * 0.9 * t - ph + 1.3) * (0.3 + 0.7 * t));
  }

  // Formation k for one particle: xyz and a tone (0 dark .. 1 hot) for
  // the palette ramp. flow is the formation's own phase (0..1, wrapping).
  // fade hides particles where a stream recycles (they jump there); wgt
  // dims crowded stretches.
  vec4 formation(int k, vec3 q, vec4 h, uint hb, float flow, out float fade, out float wgt) {
    fade = 1.0;
    wgt = 1.0;
    float s = q.x, u = q.y, v = q.z;
    if (k == 0) {
      float sp = fract(s + flow);
      vec4 t = traj(0, sp, wgt);
      fade = smoothstep(0.0, 0.002, sp) * smoothstep(1.0, 0.998, sp);
      return vec4(t.xyz, 0.3 + 0.62 * t.w);
    }
    if (k == 1) {
      // Hopf fibration: the fibers over five circles of latitude on the
      // base sphere, great circles of S3 projected stereographically to
      // nested tori of linked rings; particles run round their rings
      float band = floor(u * 4.0);
      float ci = floor(fract(u * 4.0) * 16.0);
      float eta = 1.0 + band * 0.15;
      float phi0 = (ci + 0.5 * band) / 16.0 * TAU;
      float t = fract(s + flow) * TAU;
      vec4 x4 = vec4(cos(t + phi0) * sin(eta), sin(t + phi0) * sin(eta), cos(t) * cos(eta), sin(t) * cos(eta));
      vec3 p = x4.xyz / (1.0 - x4.w) / 1.75;
      // each ring its own color, stepping round the torus it lies on
      return vec4(rotZ(rotX(p, -0.9), 0.3), 0.28 + 0.66 * fract(ci / 16.0 + band * 0.27));
    }
    if (k == 2) {
      // torus knot (${KNOT_P}, ${KNOT_Q}), face on
      float t = fract(s + flow) * TAU;
      float rr = 0.66 + 0.27 * cos(${KNOT_Q}.0 * t);
      vec3 p = vec3(rr * cos(${KNOT_P}.0 * t), rr * sin(${KNOT_P}.0 * t), 0.27 * sin(${KNOT_Q}.0 * t));
      return vec4(p, 0.5 + 0.42 * cos(${KNOT_Q}.0 * t));
    }
    if (k == 3) {
      // tesseract: the 32 edges of a 4D hypercube turning in the xw
      // plane, seen in perspective from 4D, so the inner cube turns
      // inside out through the outer one
      int e = min(int(u * 32.0), 31);
      int d = e / 8, m = e - d * 8;
      int lo = m & ((1 << d) - 1);
      int v0 = ((m >> d) << (d + 1)) | lo;
      int v1 = v0 | (1 << d);
      vec4 A = vec4(float(v0 & 1), float((v0 >> 1) & 1), float((v0 >> 2) & 1), float((v0 >> 3) & 1)) * 2.0 - 1.0;
      vec4 B = vec4(float(v1 & 1), float((v1 >> 1) & 1), float((v1 >> 2) & 1), float((v1 >> 3) & 1)) * 2.0 - 1.0;
      vec4 P4 = mix(A, B, s);
      float c = cos(flow * TAU), sn = sin(flow * TAU);
      P4 = vec4(c * P4.x - sn * P4.w, P4.y, P4.z, sn * P4.x + c * P4.w);
      c = cos(0.45); sn = sin(0.45);
      P4 = vec4(P4.x, c * P4.y - sn * P4.w, P4.z, sn * P4.y + c * P4.w);
      vec3 p = P4.xyz * (1.25 / (3.0 - P4.w));
      float corner = pow(abs(s * 2.0 - 1.0), 8.0);
      return vec4(rotY(rotX(p, 0.35), 0.5), 0.42 + 0.35 * corner + 0.1 * P4.w);
    }
    if (k == 4) {
      // a seashell: a ribbed tube growing on a logarithmic spiral down a
      // conical spire; particles circle the tube
      float g = 0.16, tmax = 4.2 * TAU;
      float th = log(1.0 + u * (exp(2.0 * g * tmax) - 1.0)) / (2.0 * g);
      float e = exp(g * (th - tmax));
      float ph = fract(v + flow) * TAU;
      float rib = 1.0 + 0.06 * pow(abs(sin(th * 7.0)), 6.0);
      float a = 0.36 * e * rib, R = 0.62 * e;
      vec3 p = vec3((R + a * cos(ph)) * cos(th), 0.78 - 1.5 * pow(e, 0.8) + a * sin(ph), (R + a * cos(ph)) * sin(th));
      return vec4(p, 0.3 + 0.55 * e + 0.12 * cos(ph * 2.0));
    }
    if (k == 5) {
      // double helix with base-pair rungs, laid across the frame
      float ang = flow * TAU;
      vec3 p;
      float tone;
      if (h.x < 0.72) {
        float side = h.x < 0.36 ? 0.0 : PI;
        float a = s * ${HELIX_TURNS} * TAU + ang + side;
        p = vec3((s - 0.5) * ${HELIX_LEN}, ${HELIX_R} * cos(a), ${HELIX_R} * sin(a));
        tone = h.x < 0.36 ? 0.84 : 0.6;
      } else {
        float sx = (floor(s * 40.0) + 0.5) / 40.0;
        float a = sx * ${HELIX_TURNS} * TAU + ang;
        float w = u * 2.0 - 1.0;
        p = vec3((sx - 0.5) * ${HELIX_LEN}, 0.92 * ${HELIX_R} * w * cos(a), 0.92 * ${HELIX_R} * w * sin(a));
        tone = w < 0.0 ? 0.5 : 0.72;
      }
      fade = 1.0 - smoothstep(0.86, 1.0, abs(s - 0.5) * 2.0);
      return vec4(rotZ(p, 0.32), tone);
    }
    if (k == 6) {
      // a fractal tree: nine levels of forks turning by the golden angle,
      // swaying in its own wind. Each particle walks a random path of
      // forks to a depth weighted by how much branch the level holds.
      float pick = h.x * (pow(1.48, 9.0) - 1.0) / 0.48;
      int dep = 0;
      float acc = 1.0, wl = 1.0;
      for (int l = 0; l < 8; l++) {
        if (pick < acc) break;
        wl *= 1.48;
        acc += wl;
        dep++;
      }
      vec3 pos = vec3(0.0, -1.0, 0.0), dir = vec3(0.0, 1.0, 0.0);
      float len = 0.44, sway = sin(flow * TAU);
      for (int l = 0; l < 9; l++) {
        if (l == dep) break;
        pos += dir * len;
        float side = ((hb >> uint(l)) & 1u) == 1u ? 1.0 : -1.0;
        float ga = float(l) * 2.39996 + 0.7;
        vec3 ax = normalize(cross(dir, vec3(cos(ga), 0.0, sin(ga))) + vec3(1e-4, 0.0, 0.0));
        dir = rotAxis(dir, ax, side * 0.5);
        dir = rotZ(dir, sway * 0.035);
        len *= 0.74;
      }
      pos += dir * len * s;
      pos += sphereDir(h.y, h.z) * (0.022 * (1.0 - float(dep) / 8.0) + (dep == 8 ? 0.035 * h.w : 0.0));
      return vec4(pos + vec3(0.0, 0.12, 0.0), 0.2 + 0.75 * float(dep) / 8.0);
    }
    if (k == 7) {
      // Sierpinski tetrahedron: each particle a point of the fractal
      // picked by eleven base-4 digits of its hash; the scale ratio
      // breathes a little, so the fractal loosens and settles in its time
      float ratio = 0.5 + 0.03 * sin(flow * TAU);
      vec3 p = vec3(0.0);
      float sc = 1.0 - ratio;
      for (int l = 0; l < 11; l++) {
        uint dg = (hb >> uint(2 * l)) & 3u;
        vec3 V = dg == 0u ? vec3(1.0, 1.0, 1.0) : dg == 1u ? vec3(1.0, -1.0, -1.0) : dg == 2u ? vec3(-1.0, 1.0, -1.0) : vec3(-1.0, -1.0, 1.0);
        p += sc * V * 0.57735;
        sc *= ratio;
      }
      p = vec3((p.x - p.y) / 1.41421, (p.x + p.y + p.z) / 1.73205, (p.x + p.y - 2.0 * p.z) / 2.44949);
      float d0 = float(hb & 3u), d1 = float((hb >> 2u) & 3u);
      return vec4(p * 1.05, 0.34 + 0.13 * d0 + 0.05 * d1);
    }
    if (k == 8) {
      // a Chladni plate: sand gathered on the nodal lines of the (3, 7)
      // mode of a square plate, over a faint membrane humming in the mode
      vec2 x = vec2(u, v) * 2.0 - 1.0;
      const float n = 3.0, m = 7.0;
      if (h.x < 0.8) {
        for (int i = 0; i < 6; i++) {
          vec2 a = n * PI * x, b = m * PI * x;
          float f = cos(a.x) * cos(b.y) - cos(b.x) * cos(a.y);
          vec2 gr = PI * vec2(-n * sin(a.x) * cos(b.y) + m * sin(b.x) * cos(a.y),
            -m * cos(a.x) * sin(b.y) + n * cos(b.x) * sin(a.y));
          x -= f * gr / max(dot(gr, gr), 4.0);
        }
        x = clamp(x, -1.0, 1.0);
        return vec4(rotX(vec3(x.x, 0.0, x.y) * 0.8, 1.15), 0.62 + 0.3 * cos(length(x) * 4.0));
      }
      float A = cos(n * PI * x.x) * cos(m * PI * x.y) - cos(m * PI * x.x) * cos(n * PI * x.y);
      wgt = 0.35;
      return vec4(rotX(vec3(x.x, 0.07 * A * sin(flow * TAU * 8.0) * uLobe, x.y) * 0.8, 1.15), 0.3 + 0.2 * abs(A));
    }
    if (k == 9) {
      // spherical harmonic: a mix of Y(3,3) and Y(4,0), radius |Y|;
      // particles slide round the axis over a shape that holds still
      vec3 d = sphereDir(u, fract(v + flow));
      float y33 = d.x * (d.x * d.x - 3.0 * d.z * d.z);
      float y2 = d.y * d.y;
      float y40 = (35.0 * y2 * y2 - 30.0 * y2 + 3.0) / 8.0;
      float Y = 0.8 * y33 + 0.45 * y40;
      return vec4(d * (0.3 + 0.66 * abs(Y) * uLobe), 0.5 + 0.42 * clamp(Y * 2.0, -1.0, 1.0));
    }
    if (k == 10) {
      // Lissajous shell: a (${LJ.join(', ')}) Lissajous knot pressed onto a sphere
      float t = fract(s + flow) * TAU;
      vec3 L = vec3(sin(${LJ[0]}.0 * t + 0.6), sin(${LJ[1]}.0 * t), sin(${LJ[2]}.0 * t + 1.3));
      return vec4(L / max(1e-4, length(L)) * 0.95, 0.5 + 0.42 * sin(3.0 * t));
    }
    if (k == 11) {
      // spiral galaxy: a bulge, a faint disk, and two arms that stream
      // outward, tilted
      vec3 p;
      float tone;
      if (h.x < 0.12) {
        p = sphereDir(u, v) * 0.24 * pow(h.y, 1.7) * vec3(1.0, 0.55, 1.0);
        tone = 0.95;
      } else if (h.x < 0.28) {
        float rho = 1.15 * sqrt(u) * (0.35 + 0.65 * u);
        p = vec3(rho * cos(v * TAU), (h.y - 0.5) * 0.05, rho * sin(v * TAU));
        tone = 0.62 - 0.35 * u;
      } else {
        float arm = floor(fract(h.x * 7.13) * 2.0);
        float t = fract(u + flow);
        float rho = 0.08 + 1.08 * t;
        float g = v - 0.5;
        g = g * abs(g) * 2.0;
        float theta = arm * PI + rho * 4.6 + g * (0.7 + 0.6 * t);
        p = vec3(rho * cos(theta), (h.y - 0.5) * 0.09 * (1.0 - 0.6 * t), rho * sin(theta));
        fade = smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.78, 1.0, t));
        tone = 0.9 - 0.62 * t + 0.25 * (0.5 - abs(g));
      }
      return vec4(rotX(p, 0.38), tone);
    }
    if (k == 12) {
      // a ringed planet: a banded, slightly flattened globe turning slowly
      // inside rings that orbit at Kepler's pace, the Cassini division
      // and a thin outer gap left dark
      vec3 p;
      float tone;
      if (h.x < 0.34) {
        vec3 d = sphereDir(u, fract(v + uClock * 0.02));
        p = d * 0.42 * vec3(1.0, 0.9, 1.0);
        tone = 0.5 + 0.22 * sin(d.y * 21.0) + 0.12 * sin(d.y * 7.0 + 1.0);
      } else {
        float r = 0.62 + 0.55 * u;
        float a = v * TAU + uClock * 0.3 * pow(r, -1.5);
        p = vec3(r * cos(a), (h.y - 0.5) * 0.008, r * sin(a));
        // a faint inner ring, the bright broad one, the Cassini division,
        // the outer ring with a thin gap near its edge, fine ringlets over all
        float prof = mix(0.22, 1.0, smoothstep(0.65, 0.68, r));
        prof = mix(prof, 0.03, smoothstep(0.875, 0.885, r) * (1.0 - smoothstep(0.915, 0.925, r)));
        prof = mix(prof, 0.62, smoothstep(0.915, 0.925, r));
        float gapD = (r - 1.1) / 0.008;
        prof *= 1.0 - 0.9 * exp(-gapD * gapD);
        wgt = prof * (0.78 + 0.22 * sin(r * 160.0));
        tone = 0.42 + 0.35 * sin(r * 11.0);
      }
      return vec4(rotZ(rotX(p, 0.42), 0.2), tone);
    }
    if (k == 13) {
      // a black hole: an accretion disk spiraling in, hottest at its inner
      // edge, round a dark core rimmed by a thin photon shell, and two jets
      vec3 p;
      float tone;
      if (h.x < 0.72) {
        float t = fract(u - flow);
        float r = 0.27 + 0.88 * t;
        float a = v * TAU + 2.6 * log(r) + uClock * 0.25;
        p = vec3(r * cos(a), (h.y - 0.5) * 0.03 * r, r * sin(a));
        fade = smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.85, 1.0, t));
        tone = 1.0 - 0.75 * t;
      } else if (h.x < 0.8) {
        p = sphereDir(u, v) * 0.22;
        wgt = 0.5;
        tone = 0.95;
      } else {
        float side = h.x < 0.9 ? 1.0 : -1.0;
        float t = fract(s + flow * 2.0);
        float rad = (0.012 + 0.07 * t) * sqrt(fract(h.y * 7.7));
        p = vec3(cos(v * TAU) * rad, side * (0.1 + 1.05 * t), sin(v * TAU) * rad);
        fade = smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.7, 1.0, t));
        tone = 0.9 - 0.45 * t;
      }
      return vec4(rotZ(rotX(p, 0.32), -0.15), tone);
    }
    if (k == 15) {
      // aurora: two curtains of fine vertical rays, seen from below. Each
      // curtain folds back on itself as it runs, so the rays bunch into
      // bright fold lines that travel along it; brightest at the lower
      // edge, thinning upward, every ray its own height
      float ci = h.x < 0.62 ? 0.0 : 1.0;
      float ph = flow * TAU;
      float rays = 150.0;
      float ri = floor(u * rays);
      float xi = (ri + 0.5 + 0.3 * (h.y - 0.5)) / rays * 2.0 - 1.0;
      float rh = fract(sin(ri * 12.9898 + ci * 4.1) * 43758.5453);
      float x = xi * 1.2 + 0.2 * sin(xi * 4.0 + ph + ci * 2.0) + 0.06 * sin(xi * 11.0 - 2.0 * ph + ci);
      float t = fract(s + flow * 2.0);
      float y = -0.6 + 1.35 * t * (0.55 + 0.45 * rh);
      float z = -0.2 + ci * 0.45 + 0.24 * sin(xi * 2.6 + ci * 1.3 - ph) + 0.4 * xi * xi;
      fade = smoothstep(0.0, 0.03, t) * (1.0 - smoothstep(0.45, 1.0, t)) * (1.0 - smoothstep(0.86, 1.0, abs(xi)));
      wgt = 0.55 + 0.9 * pow(fract(sin(ri * 78.233 + ci) * 43758.5453), 3.0);
      return vec4(rotX(vec3(x, y, z), 0.35), 0.9 - 0.7 * t + 0.06 * ci);
    }
    if (k == 16) {
      // a butterfly: wings traced by Fay's butterfly curve, filled and
      // edged, beating on its own clock; a slim body and two antennae
      float ph = flow * TAU;
      float flap = 0.55 * sin(ph) + 0.45;
      vec3 p;
      float tone;
      if (h.x < 0.86) {
        float th = v * TAU;
        float r = exp(cos(th)) - 2.0 * cos(4.0 * th) - pow(sin(th / 12.0), 5.0);
        float f = h.y < 0.25 ? 1.0 : sqrt(u);
        vec2 w = vec2(sin(th), cos(th)) * r * f;
        float side = w.x < 0.0 ? -1.0 : 1.0;
        p = vec3(side * abs(w.x) * cos(flap), w.y, abs(w.x) * sin(flap));
        tone = h.y < 0.25 ? 0.95 : 0.32 + 0.5 * (0.5 + 0.5 * cos(f * abs(r) * 4.5));
      } else if (h.x < 0.95) {
        p = vec3(0.0, mix(-1.3, 1.5, s), 0.0) + sphereDir(u, v) * 0.13 * sin(PI * s);
        tone = 0.6;
      } else {
        float side = h.y < 0.5 ? -1.0 : 1.0;
        p = vec3(side * 0.75 * s, 1.5 + 1.3 * s, 0.25 * s * s);
        tone = 0.8;
      }
      return vec4(rotX(p * 0.3 + vec3(0.0, -0.2, 0.0), -0.45), tone);
    }
    if (k == 17) {
      // a humpback whale gliding: a long body that flexes through to its
      // flukes, long pectoral fins rowing slowly, grooves under the jaw
      float ph = flow * TAU;
      vec3 p;
      float tone;
      if (h.x < 0.74) {
        float t = u;
        float girth = 0.25 * pow(max(sin(PI * pow(t, 0.6)), 0.0), 0.85) * (1.0 - 0.6 * smoothstep(0.65, 1.0, t)) + 0.01;
        float ang = v * TAU;
        float y = 0.07 * sin(t * 3.0 - ph) * t * t;
        p = vec3(1.1 - 2.2 * t, y + girth * 0.8 * cos(ang), girth * sin(ang));
        float belly = smoothstep(0.2, -0.6, cos(ang)) * (1.0 - smoothstep(0.35, 0.5, t));
        tone = 0.38 + 0.25 * (0.5 + 0.5 * cos(ang)) + belly * 0.35 * step(0.0, sin(ang * 26.0));
      } else if (h.x < 0.88) {
        float sp = u * 2.0 - 1.0, ch = s;
        float y = 0.07 * sin(3.0 - ph), tilt = 0.21 * cos(3.0 - ph);
        float back = abs(sp) * 0.16 + ch * 0.17 * (1.0 - 0.6 * abs(sp));
        p = vec3(-1.12 - back, y - back * tilt * 3.0, sp * 0.46);
        tone = 0.5 + 0.35 * ch;
      } else {
        float side = h.y < 0.5 ? -1.0 : 1.0;
        float a = s, w = u;
        vec3 q = vec3(-a * 0.3 - w * 0.09 * (1.0 - 0.7 * a), -a * 0.2 + 0.22 * sin(ph + a * 1.2) * a, side * (0.12 + a * 0.68));
        p = vec3(0.55, -0.1, 0.0) + q;
        tone = 0.72;
      }
      return vec4(rotY(rotX(p, 0.12), -0.5), tone);
    }
    if (k == 18) {
      // two koi circling each other in a pond, seen from above: bodies
      // that bend along the circle and ripple to the tail, fanned tails
      // and fins, patched coats
      float fishI = h.x < 0.5 ? 0.0 : 1.0;
      float ph = flow * TAU;
      float hy = fract(h.y * 9.1);
      float R = 0.6;
      float a0 = ph + fishI * PI;
      float t = hy < 0.78 ? s : (hy < 0.92 ? 1.0 : 0.25);
      float a = a0 - t * 1.5;
      vec3 tang = vec3(-sin(a), 0.0, cos(a)), nrm = vec3(cos(a), 0.0, sin(a));
      vec3 c = vec3(R * cos(a), 0.0, R * sin(a)) + nrm * 0.05 * sin(t * 7.0 - ph * 6.0) * t;
      vec3 p;
      float tone;
      if (hy < 0.78) {
        float girth = 0.12 * pow(max(sin(PI * pow(t, 0.55)), 0.0), 0.8) + 0.005;
        float ang = u * TAU;
        p = c + nrm * girth * cos(ang) + vec3(0.0, girth * 0.7 * sin(ang), 0.0);
        float coat = sin(t * 11.0 + fishI * 3.0) * sin(ang * 2.0 + t * 4.0 + fishI);
        tone = coat > 0.15 ? 0.95 : 0.42;
      } else if (hy < 0.92) {
        float sp = u * 2.0 - 1.0, ch = fract(h.z * 3.3);
        p = c + tang * ch * 0.24 + nrm * sp * 0.14 * ch * (1.0 + 0.3 * sin(ph * 6.0 + sp));
        tone = 0.7;
      } else {
        float side = u < 0.5 ? -1.0 : 1.0, ch = fract(h.z * 3.3);
        p = c + nrm * side * (0.1 + 0.11 * ch) + tang * 0.07 * ch - vec3(0.0, 0.01, 0.0);
        tone = 0.65;
      }
      return vec4(rotX(p, 0.9), tone);
    }
    if (k == 19) {
      // the flower of life: nineteen circles on a hexagonal lattice, each
      // through its neighbors' centers, inside two bounding rings, laid on
      // a shallow dome; light runs round every circle
      float r = 0.29;
      float ci = floor(u * 21.0);
      vec2 c = vec2(0.0);
      float rad = r;
      if (ci < 1.0) c = vec2(0.0);
      else if (ci < 7.0) { float a = (ci - 1.0) * PI / 3.0; c = vec2(cos(a), sin(a)) * r; }
      else if (ci < 13.0) { float a = (ci - 7.0) * PI / 3.0; c = vec2(cos(a), sin(a)) * 2.0 * r; }
      else if (ci < 19.0) { float a = (ci - 13.0) * PI / 3.0 + PI / 6.0; c = vec2(cos(a), sin(a)) * 1.7320508 * r; }
      else rad = 3.0 * r + (ci - 19.0) * 0.035;
      float t = fract(s + flow) * TAU;
      vec2 q = c + vec2(cos(t), sin(t)) * rad;
      vec3 p = vec3(q.x, q.y, 0.22 * (1.0 - dot(q, q) / 0.81));
      return vec4(rotX(p, -0.3), ci < 19.0 ? 0.45 + 0.5 * (0.5 + 0.5 * cos(t * 3.0 + ci)) : 0.9);
    }
    if (k == 20) {
      // the five Platonic solids nested as in Kepler's model, cube
      // outside, then tetrahedron, dodecahedron, icosahedron, octahedron,
      // each turning on its own axis
      int e = min(int(u * ${PLATONIC_EDGES}.0), ${PLATONIC_EDGES - 1});
      vec4 A = texelFetch(uGeo, ivec2(e * 2, 0), 0), B = texelFetch(uGeo, ivec2(e * 2 + 1, 0), 0);
      int sid = int(A.w + 0.5);
      vec3 ax = sid == 0 ? vec3(0.0, 1.0, 0.0) : sid == 1 ? vec3(0.7071, 0.7071, 0.0) : sid == 2 ? vec3(0.0, 0.7071, 0.7071) : sid == 3 ? vec3(0.7071, 0.0, 0.7071) : vec3(0.5774);
      float turns = sid == 0 ? 1.0 : sid == 1 ? -2.0 : sid == 2 ? 3.0 : sid == 3 ? -4.0 : 5.0;
      vec3 p = rotAxis(mix(A.xyz, B.xyz, s), ax, flow * TAU * turns);
      return vec4(p, 0.3 + 0.13 * float(sid) + 0.3 * pow(abs(s * 2.0 - 1.0), 10.0));
    }
    if (k == 21) {
      // a merkaba: two interlocked tetrahedra turning against each other,
      // edges bright, faces a faint veil, inside an equatorial ring
      float dir = h.x < 0.5 ? 1.0 : -1.0;
      float hy = fract(h.y * 7.7);
      vec3 V[4] = vec3[4](vec3(0.0, 1.0, 0.0), vec3(0.9428, -0.3333, 0.0), vec3(-0.4714, -0.3333, 0.8165), vec3(-0.4714, -0.3333, -0.8165));
      for (int i = 0; i < 4; i++) V[i].y *= dir;
      vec3 p;
      float tone;
      if (hy < 0.7) {
        int e = min(int(u * 6.0), 5);
        int a = e < 3 ? 0 : e - 2, b = e < 3 ? e + 1 : (e == 5 ? 1 : e - 1);
        p = mix(V[a], V[b], s);
        tone = 0.55 + 0.4 * pow(abs(s * 2.0 - 1.0), 8.0);
      } else if (hy < 0.92) {
        const ivec3 FACE[4] = ivec3[4](ivec3(0, 1, 2), ivec3(0, 2, 3), ivec3(0, 3, 1), ivec3(1, 2, 3));
        ivec3 f = FACE[min(int(u * 4.0), 3)];
        float r1 = sqrt(s), r2 = v;
        p = V[f.x] * (1.0 - r1) + V[f.y] * r1 * (1.0 - r2) + V[f.z] * r1 * r2;
        wgt = 0.3;
        tone = 0.4;
      } else {
        float t = v * TAU;
        p = vec3(cos(t), 0.0, sin(t)) * 0.98;
        tone = 0.85;
      }
      return vec4(rotY(p, dir * flow * TAU) * 0.95, tone + 0.05 * dir);
    }
    if (k == 22) {
      // a vortex torus: forty field lines winding round a fat torus,
      // pouring through its narrow hole, particles streaming along them
      float li = floor(u * 40.0);
      float t = fract(s + flow);
      float phi = li / 40.0 * TAU + t * TAU;
      float th = li * 0.618 * TAU + t * TAU * 6.0;
      vec3 p = vec3((0.6 + 0.38 * cos(th)) * cos(phi), 0.38 * sin(th), (0.6 + 0.38 * cos(th)) * sin(phi));
      return vec4(rotX(p, 0.38), 0.35 + 0.6 * (0.5 - 0.5 * cos(th)));
    }
    if (k == 23) {
      // a solar system: a sun, eight planets on gently tilted orbits at
      // Kepler's pace, faint orbit rings, a belt of rocks, and rings round
      // the sixth
      const float ORB[8] = float[8](0.22, 0.3, 0.39, 0.48, 0.72, 0.88, 1.02, 1.15);
      const float PSZ[8] = float[8](0.018, 0.028, 0.03, 0.022, 0.07, 0.06, 0.042, 0.04);
      vec3 p;
      float tone;
      int pi_ = min(int(fract(h.x * 9.7) * 8.0), 7);
      float R = ORB[pi_], inc = (float(pi_) * 0.37 - 1.2) * 0.04;
      float ang = float(pi_) * 2.39996 + uClock * 0.8 * pow(R, -1.5);
      if (h.x < 0.12) {
        p = sphereDir(u, v) * 0.11 * pow(h.y, 0.33);
        tone = 1.0;
        inc = 0.0;
      } else if (h.x < 0.45) {
        float a = v * TAU;
        p = vec3(R * cos(a), 0.0, R * sin(a));
        wgt = 0.35;
        tone = 0.4;
      } else if (h.x < 0.53) {
        float rb = 0.56 + 0.1 * u, a = v * TAU + uClock * 0.8 * pow(rb, -1.5);
        p = vec3(rb * cos(a), (h.y - 0.5) * 0.03, rb * sin(a));
        wgt = 0.6;
        tone = 0.5;
        inc = 0.0;
      } else {
        vec3 c = vec3(R * cos(ang), 0.0, R * sin(ang));
        p = c + sphereDir(u, v) * PSZ[pi_] * pow(h.y, 0.33);
        if (pi_ == 5 && h.z < 0.4) {
          float rr = PSZ[5] * (1.6 + 0.9 * u), a = v * TAU;
          p = c + rotX(vec3(rr * cos(a), 0.0, rr * sin(a)), 0.4);
        }
        tone = 0.45 + 0.07 * float(pi_);
      }
      return vec4(rotX(rotX(p, inc), 0.42), tone);
    }
    if (k == 24) {
      // the cosmic web: clusters joined by filaments with voids between;
      // matter streams along the filaments into the clusters
      vec3 p;
      float tone;
      if (h.x < 0.68) {
        int e = min(int(u * ${WEB_LINKS.length}.0), ${WEB_LINKS.length - 1});
        vec4 E = texelFetch(uGeo, ivec2(e, 2), 0);
        vec3 A = texelFetch(uGeo, ivec2(int(E.x + 0.5), 1), 0).xyz, B = texelFetch(uGeo, ivec2(int(E.y + 0.5), 1), 0).xyz;
        float t = fract(s + flow);
        float tt = h.y < 0.5 ? t : 1.0 - t;
        p = mix(A, B, tt) + sphereDir(h.z, h.w) * (0.012 + 0.025 * sin(PI * tt)) * pow(fract(h.y * 7.1), 1.5);
        fade = smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.9, 1.0, t));
        tone = 0.4 + 0.25 * (1.0 - sin(PI * tt));
      } else if (h.x < 0.93) {
        vec4 N = texelFetch(uGeo, ivec2(min(int(u * ${WEB.length}.0), ${WEB.length - 1}), 1), 0);
        p = N.xyz + sphereDir(v, h.y) * N.w * pow(h.z, 1.4);
        tone = 0.92;
      } else {
        p = sphereDir(u, v) * pow(h.y, 0.33) * 1.05;
        wgt = 0.25;
        tone = 0.3;
      }
      return vec4(p, tone);
    }
    if (k == 25) {
      // a deep field: thirty small galaxies, spirals and ellipticals, each
      // at its own tilt and size, scattered through the dark and turning
      float gi = floor(h.x * 30.0);
      vec3 g = fract(sin(vec3(gi * 12.9898, gi * 78.233, gi * 37.719)) * 43758.5453);
      vec3 c = (g * 2.0 - 1.0) * vec3(1.1, 0.7, 0.8);
      float size = 0.06 + 0.16 * pow(fract(g.x * 7.3 + g.y), 2.0);
      vec3 n = sphereDir(fract(g.y * 5.1), fract(g.z * 3.7));
      vec3 q;
      if (fract(g.z * 9.1) < 0.65) {
        float arm = h.y < 0.5 ? 0.0 : PI;
        float rho = size * (0.1 + 0.9 * u);
        float th = arm + u * 4.0 + (v - 0.5) * 0.8 + flow * TAU * (fract(g.x * 3.0) < 0.5 ? 1.0 : -1.0);
        q = vec3(rho * cos(th), (h.z - 0.5) * 0.04 * size, rho * sin(th));
        if (fract(h.y * 5.3) < 0.2) q = sphereDir(u, v) * size * 0.25 * pow(fract(h.z * 3.1), 1.5);
      } else {
        q = sphereDir(u, v) * size * 0.8 * pow(h.y, 1.6) * vec3(1.0, 0.6 + 0.4 * g.x, 1.0);
      }
      q = rotAxis(q, normalize(cross(vec3(0.0, 1.0, 0.0), n) + vec3(1e-4, 0.0, 0.0)), acos(clamp(n.y, -1.0, 1.0)));
      return vec4(c + q, 0.3 + 0.65 * fract(g.x * 3.7 + g.z) * (0.6 + 0.4 * (1.0 - length(q) / size)));
    }
    if (k == 26) {
      // Metatron's cube: the thirteen circles of the fruit of life and the
      // 78 lines joining every center to every other, on a shallow dome;
      // light runs round the circles and along the lines
      vec2 q;
      float tone;
      if (h.x < 0.6) {
        int e = min(int(u * 78.0), 77);
        vec2 A = texelFetch(uGeo, ivec2(e * 2, 3), 0).xy, B = texelFetch(uGeo, ivec2(e * 2 + 1, 3), 0).xy;
        float t = fract(s + flow);
        q = mix(A, B, t);
        fade = smoothstep(0.0, 0.04, t) * (1.0 - smoothstep(0.96, 1.0, t));
        wgt = 1.1;
        tone = 0.45 + 0.35 * length(A - B);
      } else {
        vec2 c = texelFetch(uGeo, ivec2(160 + min(int(u * 13.0), 12), 3), 0).xy;
        float t = fract(s + flow) * TAU;
        q = c + vec2(cos(t), sin(t)) * ${MET_R};
        wgt = 0.8;
        tone = 0.85;
      }
      return vec4(rotX(vec3(q, 0.2 * (1.0 - dot(q, q) / 0.8)), -0.3), tone);
    }
    if (k == 27) {
      // a Sri Yantra: four upward and five downward triangles interlocked
      // round the central point, two rings of lotus petals (eight and
      // sixteen), circles, and the square enclosure, turning slowly
      const vec3 TRI[9] = vec3[9](vec3(1.0, -0.56, 0.83), vec3(-1.0, 0.62, 0.785), vec3(0.72, -0.34, 0.62),
        vec3(-0.78, 0.4, 0.66), vec3(0.48, -0.18, 0.44), vec3(-0.56, 0.24, 0.5), vec3(0.3, -0.06, 0.3),
        vec3(-0.36, 0.12, 0.36), vec3(-0.2, 0.03, 0.2));
      vec2 q;
      float tone;
      if (h.x < 0.42) {
        vec3 T = TRI[min(int(h.y * 9.0), 8)];
        vec2 a = vec2(0.0, T.x), b = vec2(-T.z, T.y), c = vec2(T.z, T.y);
        float e = u * 3.0;
        q = e < 1.0 ? mix(a, b, e) : e < 2.0 ? mix(b, c, e - 1.0) : mix(c, a, e - 2.0);
        tone = 0.55 + 0.4 * step(0.0, T.x);
      } else if (h.x < 0.72) {
        float n = h.y < 0.4 ? 8.0 : 16.0;
        float r0 = n < 9.0 ? 1.06 : 1.26, r1 = n < 9.0 ? 1.24 : 1.42;
        float th = s * TAU;
        float r = r0 + (r1 - r0) * abs(cos(n * th * 0.5));
        if (fract(h.z * 3.1) < 0.3) r = r0;
        q = vec2(cos(th), sin(th)) * r;
        tone = n < 9.0 ? 0.75 : 0.6;
      } else if (h.x < 0.82) {
        float rr = h.y < 0.5 ? 1.0 : 1.04;
        q = vec2(cos(s * TAU), sin(s * TAU)) * rr;
        tone = 0.5;
      } else if (h.x < 0.98) {
        float half_ = 1.52 + floor(h.y * 3.0) * 0.06;
        float e = u * 4.0, f = fract(e) * 2.0 - 1.0;
        int sd = int(e);
        q = sd == 0 ? vec2(f, -1.0) : sd == 1 ? vec2(1.0, f) : sd == 2 ? vec2(-f, 1.0) : vec2(-1.0, -f);
        q *= half_;
        tone = 0.4;
      } else {
        q = (vec2(u, v) - 0.5) * 0.05;
        tone = 1.0;
      }
      q = vec2(cos(flow * TAU) * q.x - sin(flow * TAU) * q.y, sin(flow * TAU) * q.x + cos(flow * TAU) * q.y) * 0.62;
      return vec4(rotX(vec3(q, 0.15 * (1.0 - dot(q, q) / 1.0)), -0.25), tone);
    }
    if (k == 28) {
      // a lotus: three whorls of cupped petals round a seed pod, opening
      // and closing on its own slow breath, on a floating leaf
      float ph = flow * TAU;
      float open = 0.5 + 0.5 * sin(ph);
      vec3 p;
      float tone;
      if (h.x < 0.74) {
        float layer = floor(h.y * 3.0);
        float a = (floor(u * 8.0) + 0.5 * layer + 0.5) / 8.0 * TAU;
        float t = s, w = v * 2.0 - 1.0;
        float len = 0.62 - 0.1 * layer;
        float elev = (0.22 + 0.32 * layer) * (1.0 - 0.3 * open) + 0.12;
        vec3 dirOut = vec3(cos(a), 0.0, sin(a)), side = vec3(-sin(a), 0.0, cos(a));
        float along = t * len;
        vec3 c = dirOut * along * cos(elev) + vec3(0.0, along * sin(elev) + 0.1 * t * t, 0.0) - dirOut * 0.05 * t * t;
        vec3 nrm = vec3(0.0, cos(elev), 0.0) - dirOut * sin(elev);
        float width = 0.21 * sin(PI * pow(t, 0.75)) * (1.0 - 0.12 * layer);
        p = c + side * w * width + nrm * 0.05 * w * w;
        tone = 0.42 + 0.45 * t - 0.06 * layer;
      } else if (h.x < 0.84) {
        float rr = 0.12 * sqrt(u);
        p = vec3(cos(v * TAU) * rr, 0.13 + 0.02 * step(0.85, fract(sin(floor(u * 40.0) * 12.9898 + floor(v * 9.0)) * 43758.5)), sin(v * TAU) * rr);
        if (h.y < 0.4) { float t = s; p = vec3(cos(v * TAU) * (0.06 + 0.06 * t), 0.13 * t, sin(v * TAU) * (0.06 + 0.06 * t)); }
        tone = 0.95;
      } else {
        float th = v * TAU * 0.95 + 0.1;
        float rr = 0.95 * sqrt(u);
        p = vec3(cos(th) * rr, -0.04 + 0.05 * rr * rr, sin(th) * rr);
        wgt = 0.45;
        tone = 0.3 + 0.15 * step(0.92, fract(th * 9.0 / TAU * 2.0));
      }
      return vec4(rotX(p * 1.55 - vec3(0.0, 0.3, 0.0), 0.4), tone);
    }
    if (k == 29) {
      // a manta ray: a broad diamond of a body whose wings beat in a wave
      // running out to their tips, cephalic fins in front, a thin tail
      float ph = flow * TAU;
      vec3 p;
      float tone;
      if (h.x < 0.88) {
        float sp = u * 2.0 - 1.0, as = abs(sp);
        float chord = 0.95 * (1.0 - pow(as, 1.6)) + 0.04;
        float z = 0.42 - 0.35 * as - chord * s;
        float y = 0.22 * sin(ph - as * 2.2) * pow(as, 1.4) - 0.05 * s * (1.0 - as);
        p = vec3(sp * 1.05, y, z);
        float spot = step(0.86, fract(sin(floor(sp * 14.0) * 7.1 + floor(s * 9.0) * 3.3) * 43758.5));
        tone = 0.35 + 0.4 * (1.0 - as) + 0.2 * spot;
      } else if (h.x < 0.95) {
        float sd = h.y < 0.5 ? -1.0 : 1.0, t = s;
        p = vec3(sd * (0.12 + 0.03 * cos(t * 5.0)), -0.03 - 0.06 * t + 0.03 * sin(t * 5.0), 0.42 + 0.14 * t);
        tone = 0.7;
      } else {
        float t = s;
        p = vec3(0.02 * sin(t * 6.0 - ph), 0.04 * sin(t * 4.0 - ph), -0.53 - t * 0.75);
        tone = 0.6;
      }
      return vec4(rotY(rotX(p, 0.95), 0.2), tone);
    }
    if (k == 30) {
      // an octopus: a mantle that swells on its own breath, two eyes, and
      // eight arms that reach out, droop and curl at their tips, each
      // waving a beat after the last
      float ph = flow * TAU;
      vec3 p;
      float tone;
      if (h.x < 0.3) {
        vec3 d = sphereDir(u, v);
        p = d * vec3(0.26, 0.36, 0.26) * (1.0 + 0.08 * sin(ph)) + vec3(0.0, 0.42, 0.0);
        p.z -= 0.08 * max(d.y, 0.0);
        tone = 0.45 + 0.35 * (0.5 + 0.5 * d.y);
      } else if (h.x < 0.36) {
        float sd = h.y < 0.5 ? -1.0 : 1.0;
        p = vec3(sd * 0.17, 0.22, 0.13) + sphereDir(u, v) * 0.035;
        tone = 1.0;
      } else {
        float ai = floor(fract(h.x * 11.3) * 8.0);
        float t = s;
        float wave = sin(ph - t * 4.0 + ai * 0.8);
        float ang = (ai + 0.5) / 8.0 * TAU + 0.25 * wave * t;
        vec3 dir = vec3(cos(ang), 0.0, sin(ang));
        vec3 c = dir * (0.15 + 0.85 * t) + vec3(0.0, 0.12 - 0.55 * t + 0.35 * t * t + 0.12 * wave * t, 0.0);
        float curl = smoothstep(0.65, 1.0, t);
        c += (vec3(0.0, sin(curl * 4.0), 0.0) - dir * (1.0 - cos(curl * 4.0))) * 0.1 * curl;
        p = c + sphereDir(u, v) * (0.07 * (1.0 - 0.85 * t) + 0.006);
        tone = 0.4 + 0.3 * (1.0 - t) + 0.25 * step(0.6, fract(t * 26.0)) * step(0.3, -sphereDir(u, v).y);
      }
      return vec4(rotX(p - vec3(0.0, 0.1, 0.0), 0.25), tone);
    }
    if (k == 31) {
      // a serpent dragon swimming through the air: a long scaled body that
      // ripples in two planes, a ridge of spines, a horned head and two
      // whiskers trailing from the snout
      float ph = flow * TAU;
      vec3 p;
      float tone;
      float t = h.x < 0.82 ? s : 0.0;
      vec3 c = dragonSpine(t, ph);
      vec3 tng = normalize(dragonSpine(t + 0.01, ph) - c);
      vec3 sideV = normalize(cross(tng, vec3(0.0, 1.0, 0.0)));
      vec3 up = cross(sideV, tng);
      float r = 0.075 * (1.0 - 0.75 * t) + 0.012;
      if (h.x < 0.7) {
        float ang = u * TAU;
        p = c + (sideV * cos(ang) + up * sin(ang)) * r;
        tone = 0.4 + 0.3 * (0.5 + 0.5 * sin(ang)) + 0.2 * step(0.5, fract(t * 40.0 + ang / TAU));
      } else if (h.x < 0.82) {
        float spike = 1.0 - fract(t * 36.0);
        p = c + up * (r + (0.06 * (1.0 - 0.7 * t) + 0.01) * spike * u);
        tone = 0.85;
      } else {
        vec3 fwd = -tng;
        if (h.x < 0.88) {
          // a long snout over an open jaw
          vec3 d = sphereDir(u, v);
          float lower = h.y < 0.3 ? 1.0 : 0.0;
          p = c + fwd * (0.16 + d.x * 0.22) + up * (d.y * 0.075 * (1.0 - 0.3 * d.x) - lower * (0.06 + 0.04 * max(d.x, 0.0))) + sideV * d.z * 0.1 * (1.0 - 0.35 * d.x);
          tone = 0.82;
        } else if (h.x < 0.93) {
          // antlers sweeping back, each with a tine
          float sd = h.y < 0.5 ? -1.0 : 1.0;
          float tine = fract(h.z * 5.3) < 0.3 ? 1.0 : 0.0;
          p = c + fwd * (0.04 - 0.34 * s) + up * (0.08 + 0.2 * s - 0.08 * s * s) + sideV * sd * (0.05 + 0.08 * s);
          p += tine * (up * 0.1 * s + fwd * 0.05 * s);
          tone = 1.0;
        } else {
          // whiskers trailing and waving from the snout
          float sd = h.y < 0.5 ? -1.0 : 1.0;
          p = c + fwd * (0.32 - 0.8 * s) + sideV * sd * (0.07 + 0.28 * s) + up * (-0.04 + 0.14 * sin(s * 5.0 - ph * 2.0) * s);
          tone = 0.95;
        }
      }
      return vec4(p, tone);
    }
    if (k == 32) {
      // a bipolar nebula: a hot central star, a dense ring round its
      // waist, and two lobes of gas blown out above and below, streaked
      // with filaments, the gas streaming outward along them
      vec3 p;
      float tone;
      if (h.x < 0.06) {
        p = sphereDir(u, v) * 0.04 * pow(h.y, 0.3);
        tone = 1.0;
      } else if (h.x < 0.26) {
        float a = v * TAU + flow * TAU, r = 0.24 + 0.05 * (h.y - 0.5);
        p = vec3(r * cos(a), (h.z - 0.5) * 0.05, r * sin(a));
        tone = 0.85;
      } else {
        float side = h.x < 0.63 ? 1.0 : -1.0;
        float t = fract(u + flow);
        float ang = v * TAU;
        float rad = mix(0.24, 0.05, t * t) + 0.3 * sin(PI * pow(t, 0.8));
        p = vec3(cos(ang) * rad, side * t, sin(ang) * rad);
        fade = smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.82, 1.0, t));
        wgt = 0.6 + 0.6 * pow(0.5 + 0.5 * sin(ang * 23.0 + t * 5.0), 4.0);
        tone = 0.75 - 0.45 * t + 0.1 * side;
      }
      return vec4(rotZ(rotX(p, 0.3), 0.35), tone);
    }
    if (k == 33) {
      // a pulsar: a neutron star turning fast inside its magnetic field,
      // closed field loops tipped off the spin axis, two beams sweeping
      // round like a lighthouse, particles streaming out along them
      vec3 p;
      float tone;
      if (h.x < 0.08) {
        p = sphereDir(u, v) * 0.07;
        tone = 1.0;
      } else if (h.x < 0.7) {
        float L = 0.35 + 0.65 * floor(h.y * 5.0) / 4.0;
        float az = floor(u * 10.0) / 10.0 * TAU;
        float th = 0.08 + (PI - 0.16) * fract(s + flow * 2.0);
        float r = L * sin(th) * sin(th);
        p = vec3(r * sin(th) * cos(az), r * cos(th), r * sin(th) * sin(az));
        fade = smoothstep(0.08, 0.3, th) * (1.0 - smoothstep(PI - 0.3, PI - 0.08, th));
        tone = 0.4 + 0.4 * (1.0 - L);
      } else {
        float side = h.x < 0.85 ? 1.0 : -1.0;
        float t = fract(s + flow * 4.0);
        float rad = (0.01 + 0.09 * t) * sqrt(h.y);
        p = vec3(rad * cos(v * TAU), side * (0.08 + 1.05 * t), rad * sin(v * TAU));
        fade = smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.6, 1.0, t));
        tone = 0.95 - 0.4 * t;
      }
      return vec4(rotX(rotY(rotZ(p, 0.55), flow * TAU), 0.2), tone);
    }
    // a jellyfish: a bell that contracts on its own pulse, tentacles that
    // trail and wave from the rim, and four frilled arms from the center
    float ph = flow * TAU;
    float pulse = pow(0.5 + 0.5 * sin(ph), 3.0);
    float top = 0.55, rimPsi = 1.45;
    float R = 0.56 * (1.0 - 0.15 * pulse), H = 0.4 * (1.0 + 0.1 * pulse);
    vec3 p;
    float tone;
    if (h.x < 0.42) {
      float psi = acos(1.0 - u * (1.0 - cos(rimPsi)));
      float phi = v * TAU;
      float rr = R * sin(psi) * (1.0 + 0.04 * sin(phi * 8.0) * smoothstep(0.8, rimPsi, psi));
      p = vec3(rr * cos(phi), top + H * (cos(psi) - 1.0), rr * sin(phi));
      if (h.y < 0.3) p = vec3(p.x * 0.86, p.y - 0.05, p.z * 0.86);
      tone = 0.55 + 0.35 * cos(psi * 1.8);
    } else if (h.x < 0.84) {
      float ti = floor(fract(h.x * 13.1) * 24.0);
      float phi = (ti + 0.5) / 24.0 * TAU;
      float a = s;
      float r0 = R * sin(rimPsi) * (1.0 - 0.45 * a);
      float wave = sin(a * 8.0 - ph + ti * 0.7) * 0.08 * a;
      float tw = phi + 0.35 * a * sin(ph - a * 3.0 + ti);
      p = vec3((r0 + wave) * cos(tw), top + H * (cos(rimPsi) - 1.0) - a * 1.45, (r0 + wave) * sin(tw));
      fade = 1.0 - smoothstep(0.8, 1.0, a);
      tone = 0.75 - 0.4 * a;
    } else {
      float ai = floor(fract(h.x * 7.7) * 4.0);
      float a = s;
      float ang = ai * PI * 0.5 + a * 2.2 + 0.3 * sin(ph - a * 4.0);
      vec3 c = vec3(cos(ang) * (0.05 + 0.1 * a), top - H * 0.6 - a * 0.95, sin(ang) * (0.05 + 0.1 * a));
      float fr = (u * 2.0 - 1.0) * (0.04 + 0.09 * a) * (1.0 + 0.35 * sin(a * 28.0 + ph));
      p = c + vec3(cos(ang + 1.5708), 0.0, sin(ang + 1.5708)) * fr;
      tone = 0.88 - 0.3 * a;
    }
    return vec4(p + vec3(0.0, 0.2, 0.0), tone);
  }

  // Where formation k puts this particle right now: the formation, its
  // thickness ball, the shimmer, the breath. lit is its light weight.
  vec4 place(int k, Pt P, out float fade, out float lit) {
    float wgt;
    vec4 F = formation(k, P.q, P.h, P.hb, uFlows[k], fade, wgt);
    vec3 p = F.xyz + sphereDir(P.h.z, P.h.w) * P.jr * (THICK[k] + uScatter * SCAT[k]);
    // shimmer: a divergence-free ABC field with a short wavelength, so it
    // stirs the threads locally and never shoves the swarm as one block
    vec3 w = p * 9.0 + vec3(uTime * 0.9, uTime * 0.7, uTime * 0.55);
    p += vec3(sin(w.z) + cos(w.y), sin(w.x) + cos(w.z), sin(w.y) + cos(w.x)) * uTurb * SCAT[k];
    lit = wgt * LIGHT[k];
    return vec4(p * uBreath, F.w);
  }
`;

// One pass a frame over the state pair: (offset xyz, formation it
// follows) and (offset velocity). A pick change hands each particle to the
// new formation when its turn in the stagger comes: its offset takes up
// the gap so it stays put, then the spring flies it home.
const SIM_FRAG = /* glsl */`
  precision highp float;
  precision highp int;
  uniform sampler2D tState0, tState1;
  uniform int uKCur;
  uniform float uSwitchT, uStagger, uDt, uInit, uSpring, uDamp, uVmax, uSwirl;
  layout(location = 0) out vec4 gState0;
  layout(location = 1) out vec4 gState1;
  ${COMMON_GLSL}
  void main() {
    ivec2 tc = ivec2(gl_FragCoord.xy);
    if (uInit > 0.5) {
      gState0 = vec4(0.0, 0.0, 0.0, float(uKCur));
      gState1 = vec4(0.0);
      return;
    }
    int id = tc.y * SW + tc.x;
    vec4 S0 = texelFetch(tState0, tc, 0), S1 = texelFetch(tState1, tc, 0);
    vec3 o = S0.xyz, ov = S1.xyz;
    int k = int(S0.w + 0.5);
    Pt P = particle(id);
    if (k != uKCur && uSwitchT >= (0.85 * P.q.x + 0.15 * P.h.y) * uStagger) {
      float f0, l0, f1, l1;
      o += place(k, P, f0, l0).xyz - place(uKCur, P, f1, l1).xyz;
      k = uKCur;
    }
    // a damped spring home, and while far, an arc round the particle's own
    // mostly-vertical axis, so the swarm wheels across like a flock
    float d = length(o);
    vec3 axis = normalize(vec3(0.0, 1.0, 0.0) + 0.7 * sphereDir(P.h.w, P.h.z));
    ov += (-uSpring * o - uDamp * ov + cross(axis, o) * uSwirl * smoothstep(0.02, 0.5, d)) * uDt;
    float sp = length(ov);
    if (sp > uVmax) ov *= uVmax / sp;
    o += ov * uDt;
    if (dot(o, o) < 1e-10 && dot(ov, ov) < 1e-8) { o = vec3(0.0); ov = vec3(0.0); }
    gState0 = vec4(o, float(k));
    gState1 = vec4(ov, 0.0);
  }
`;

const VERT = /* glsl */`
  precision highp float;
  precision highp int;
  uniform sampler2D tState0, tState1;
  uniform float uRingT, uRingAmp, uVmax;
  uniform float uGain, uSize, uPx, uMinPx, uContrast, uSpark, uSparkSeed, uDepth;
  uniform vec3 uShadow, uMid, uAccent, uGlow;
  varying vec3 vCol;
  #ifdef CAPTURE
  varying vec4 vCap;
  #endif
  ${COMMON_GLSL}

  vec3 ramp(float t) {
    t = clamp(t, 0.0, 1.0);
    if (t < 0.3) return mix(uShadow, uMid, t / 0.3);
    if (t < 0.68) return mix(uMid, uAccent, (t - 0.3) / 0.38);
    return mix(uAccent, uGlow, (t - 0.68) / 0.32);
  }

  void main() {
    // position.x carries the particle's index (exact in float32)
    int id = int(position.x + 0.5);
    ivec2 tc = ivec2(id % SW, id / SW);
    vec4 S0 = texelFetch(tState0, tc, 0), S1 = texelFetch(tState1, tc, 0);
    int k = int(S0.w + 0.5);
    Pt P = particle(id);
    float fade, lit;
    vec4 T = place(k, P, fade, lit);
    vec3 p = T.xyz + S0.xyz;
    // in flight a particle leans a little toward a shared bright tone and
    // settles into its new formation's colors as it arrives; its light
    // eases toward an even level, so the old formation's light does not
    // jump to the new one's on release
    float fl = smoothstep(0.03, 0.4, length(S0.xyz));
    float tone = mix(T.w, 0.8, 0.25 * fl);
    lit = mix(lit, 1.1, 0.7 * fl);

    // accent ring: a shell of light rolling outward, with a small push
    float ring = 0.0;
    if (uRingAmp > 0.001) {
      float rl = length(p);
      float dd = rl - (0.18 + uRingT * 1.3);
      ring = exp(-dd * dd * 70.0) * uRingAmp;
      p += p / max(rl, 1e-3) * ring * 0.035;
    }

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float depth = max(0.05, -mv.z);
    float px = uSize * uPx / depth;

    // contrast spreads the light: a few bright particles over many dim
    // ones at the top, an even glow at the bottom (the mean holds)
    float a = uGain * fade * lit * pow(P.r6, uContrast) * (uContrast + 1.0);
    a *= 1.0 + 0.2 * min(1.0, length(S1.xyz) / uVmax);
    // highs light a scattered handful of particles at a time
    float sp = step(1.0 - uSpark, fract(P.h.y * 61.7 + P.h.z * 13.1 + uSparkSeed));
    tone = mix(tone, 1.0, sp);
    a *= 1.0 + 2.5 * sp + 3.0 * ring;
    px *= 1.0 + 0.5 * sp;
    // the far side sits back in the dark
    a *= 1.0 - uDepth * smoothstep(-1.0, 1.1, -mv.z - length(cameraPosition));
    if (px < uMinPx) { float q = px / uMinPx; a *= q * q; px = uMinPx; }
    gl_PointSize = px;
    vCol = mix(ramp(tone), uGlow, min(1.0, ring)) * a;

    #ifdef CAPTURE
    vCap = vec4((modelMatrix * vec4(p, 1.0)).xyz, fade);
    vec2 cell = (vec2(float(id % CAP_W), float(id / CAP_W)) + 0.5) / float(CAP_W);
    gl_Position = vec4(cell * 2.0 - 1.0, 0.0, 1.0);
    gl_PointSize = 1.0;
    #endif
  }
`;

const FRAG = /* glsl */`
  precision highp float;
  varying vec3 vCol;
  #ifdef CAPTURE
  varying vec4 vCap;
  #endif
  void main() {
    #ifdef CAPTURE
    gl_FragColor = vCap;
    #else
    vec2 d = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(d, d);
    if (r2 > 1.0) discard;
    float f = 1.0 - r2;
    gl_FragColor = vec4(vCol * f * f, 1.0);
    #endif
  }
`;

// Formation inputs, shared by reference between the sim and the draw so
// both place a particle in exactly the same spot.
const formU = {
  uTraj: { value: null }, uGeo: { value: null },
  uFlows: { value: new Float32Array(NF) },
  uLobe: { value: 1 }, uClock: { value: 0 }, uScatter: { value: 0.02 }, uTurb: { value: 0.004 },
  uTime: { value: 0 }, uBreath: { value: 1 },
};
const simU = {
  ...formU,
  tState0: { value: null }, tState1: { value: null },
  uKCur: { value: 0 }, uSwitchT: { value: 99 }, uStagger: { value: STAGGER }, uDt: { value: 0 }, uInit: { value: 0 },
  uSpring: { value: SPRING }, uDamp: { value: DAMP }, uVmax: { value: VMAX }, uSwirl: { value: SWIRL },
};
const uniforms = {
  ...formU,
  tState0: { value: null }, tState1: { value: null },
  uRingT: { value: 0 }, uRingAmp: { value: 0 }, uVmax: simU.uVmax,
  uGain: { value: GAIN }, uSize: { value: SIZE }, uPx: { value: 1000 }, uMinPx: { value: MIN_PX },
  uContrast: { value: 1 }, uSpark: { value: 0 }, uSparkSeed: { value: 0 }, uDepth: { value: 0.55 },
  uShadow: { value: PAL.shadow }, uMid: { value: PAL.mid }, uAccent: { value: PAL.accent }, uGlow: { value: PAL.glow },
};

// ---------------------------------------------------------- build (lazy)
// Built on the scene's first frame so a boot that never visits it pays
// nothing: three integrated orbits, the state pair (2 x 2 float targets,
// 32 MB) and a 2 MB index buffer.
let points = null, geo = null, trajTex = null, stA = null, stB = null, simQuad = null;
function build(k) {
  const data = new Float32Array(TW * TROWS * ATTRACTORS.length * 4);
  ATTRACTORS.forEach((A, i) => { PATH[i] = integrate(A, data, i * TROWS); });
  trajTex = new THREE.DataTexture(data, TW, TROWS * ATTRACTORS.length, THREE.RGBAFormat, THREE.FloatType);
  trajTex.minFilter = trajTex.magFilter = THREE.NearestFilter;
  trajTex.needsUpdate = true;
  formU.uTraj.value = trajTex;
  formU.uGeo.value = geoTexture();

  const r = ctx.renderer;
  const type = r.extensions.get('EXT_color_buffer_float') ? THREE.FloatType : THREE.HalfFloatType;
  const make = () => new THREE.WebGLRenderTarget(SW, SH, {
    count: 2, type, format: THREE.RGBAFormat, depthBuffer: false,
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
  });
  stA = make();
  stB = make();
  simQuad = new FullScreenQuad(new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: simU,
    vertexShader: 'void main() { gl_Position = vec4(position, 1.0); }',
    fragmentShader: SIM_FRAG,
  }));
  simU.uKCur.value = k;
  simU.uInit.value = 1;
  r.setRenderTarget(stA);
  simQuad.render(r);
  r.setRenderTarget(null);
  simU.uInit.value = 0;

  const ids = new Float32Array(N_MAX);
  for (let i = 0; i < N_MAX; i++) ids[i] = i;
  geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(ids, 1));
  // position holds indices, not points: a fixed bound keeps three from
  // measuring one out of them
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2);
  geo.setDrawRange(0, N_REF);
  points = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  }));
  points.frustumCulled = false;
  scene.add(points);
}

function simStep(dt) {
  const r = ctx.renderer;
  simU.tState0.value = stA.textures[0];
  simU.tState1.value = stA.textures[1];
  simU.uDt.value = dt;
  r.setRenderTarget(stB);
  simQuad.render(r);
  r.setRenderTarget(null);
  [stA, stB] = [stB, stA];
  uniforms.tState0.value = stA.textures[0];
  uniforms.tState1.value = stA.textures[1];
}

// ---------------------------------------------------------- state
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const flows = new Float64Array(NF);
let clock = 0, mclock = 0, flowClock = 0;
let enS = 0, midS = 0, subS = 0, hiS = 0, hiSlow = 0, kickS = 0;
let lastAccent = -1e9, accents = 0, surge = 0;
let kCur = 0, kPending = 0, pendingT = 0, switchT = 99, switches = 0;
let yaw = 0, dragYaw = 0, dragPitch = 0, lastNdc = null;
let count = N_REF, sparkT = 0, qaYaw = null;
const _buf = new THREE.Vector2();
// slider position (0..NF-1) of a shape value; ORDER maps it to a shader id
const pickOf = (shape) => Math.round(Math.min(1, Math.max(0, shape)) * (NF - 1));

const locus = {
  name: 'locus',
  scene,
  camera,
  // a filament scene: the classic per-kick bloom surge would flash it
  bloom: { strength: 0.42, gain: 0.45, kick: 0.06 },
  // shape reads "formation" (34 stops along the slider; the swarm flies
  // to the one it rests on), complexity "scatter" (a fine line of light
  // to a loose cloud), density "particles" (32K to 524K), fill "zoom"
  // speed only turns the swarm (Alec, 2026-10-24: it read as rotate),
  // so the panel names it that; the lane stays speed.
  paramLabels: { '*': { speed: 'rotate', shape: 'formation', complexity: 'scatter', density: 'particles', fill: 'zoom' } },
  paramOrder: ['speed', 'shape', 'complexity', 'density', 'fill', 'contrast'],
  params: { speed: 0.5, shape: 0, complexity: 0.3, density: 0.5, fill: 0.5, contrast: 0.5 },
  update(s, dt, t) {
    const P = this.params;
    if (!ctx.renderer) return;
    if (!points) {
      kCur = kPending = pickOf(P.shape);
      build(ORDER[kCur]);
    }
    // Streaming and the formations' own animation keep one pace, the
    // music's; rotate (speed) only turns the swarm, still at 0.
    const spd = 1;
    scene.background = PAL.bg;
    clock += dt;
    mclock += dt * spd;

    // motion rides slow signals, light rides fast ones
    enS += (s.energy - enS) * (1 - Math.exp(-dt * 4));
    midS += (s.mids - midS) * (1 - Math.exp(-dt / 1.6));
    subS += (s.sub - subS) * (1 - Math.exp(-dt / 0.3));
    hiS += (s.highs - hiS) * (1 - Math.exp(-dt * 10));
    hiSlow += (s.highs - hiSlow) * (1 - Math.exp(-dt / 0.8));
    kickS += (s.kick - kickS) * (1 - Math.exp(-dt / 0.04));

    // accent: a surge along the paths and a ring of light, gated
    if (s.onKick && clock - lastAccent > ACCENT_REST && (s.onKick > ACCENT_HIT || clock - lastAccent > ACCENT_FALLBACK)) {
      lastAccent = clock;
      accents++;
      surge = 1;
    }
    surge *= Math.exp(-dt / 0.7);
    const ringT = clock - lastAccent;
    uniforms.uRingT.value = ringT;
    // born at a radius and faded in, so it never lights the core as a ball
    uniforms.uRingAmp.value = ringT < 2.4 ? (1 - Math.exp(-ringT * 14)) * Math.exp(-ringT * 1.3) * (1 - smooth(1.8, 2.4, ringT)) : 0;

    // the formation: the slider picks it, and once the slider has rested
    // on a new one for PICK_DWELL the swarm sets off
    const pick = pickOf(P.shape);
    if (pick !== kPending) { kPending = pick; pendingT = 0; } else pendingT += dt;
    if (kPending !== kCur && pendingT >= PICK_DWELL) {
      kCur = kPending;
      switchT = 0;
      switches++;
    }
    switchT += dt;
    simU.uKCur.value = ORDER[kCur];
    simU.uSwitchT.value = switchT;

    // the stream: every formation keeps its own phase, wrapped, so a
    // long session never loses precision
    const pace = FLOW * spd * (0.35 + 1.5 * midS) * (1 + 1.6 * surge);
    for (let k = 0; k < NF; k++) {
      flows[k] = (flows[k] + dt * pace / PATH[k]) % 1;
      formU.uFlows.value[k] = flows[k];
    }
    flowClock = (flowClock + dt * pace) % 4096;
    formU.uClock.value = flowClock;

    // scatter, breathing, shimmer
    const c = P.complexity;
    formU.uScatter.value = 0.004 + 0.3 * c * c;
    formU.uBreath.value = 1 + 0.06 * subS + 0.022 * kickS;
    formU.uLobe.value = 1 + 0.35 * subS;
    formU.uTurb.value = 0.002 + 0.016 * hiSlow;
    formU.uTime.value = mclock;

    if (dt > 0) simStep(Math.min(dt, 0.05));

    // population and light
    count = Math.max(1 << 15, Math.min(N_MAX, Math.round(N_MAX * Math.pow(16, P.density - 1))));
    geo.setDrawRange(0, count);
    const rel = N_REF / count;
    uniforms.uGain.value = GAIN * (0.22 + 0.9 * enS) * Math.sqrt(rel);
    uniforms.uSize.value = SIZE * Math.pow(rel, 0.3);
    uniforms.uContrast.value = 0.25 + 2.4 * P.contrast * P.contrast;
    uniforms.uSpark.value = 0.0015 + 0.02 * hiS;
    sparkT += dt;
    if (sparkT > 0.09) { sparkT = 0; uniforms.uSparkSeed.value = Math.random(); }
    uniforms.uPx.value = ctx.renderer.getDrawingBufferSize(_buf).y / (2 * Math.tan((FOV * Math.PI) / 360));

    // turntable: turns slowly on its own, a drag turns and tilts it and
    // the angle holds on release
    if (qaYaw === null) yaw += dt * SPIN * 2 * P.speed * drastic(P.speed); else yaw = qaYaw;
    const ptr = scenePointer;
    if (ptr.held && ptr.ndc) {
      if (lastNdc) {
        dragYaw += (ptr.ndc.x - lastNdc.x) * 2.6;
        dragPitch -= (ptr.ndc.y - lastNdc.y) * 1.6;
      }
      lastNdc = { x: ptr.ndc.x, y: ptr.ndc.y };
    } else lastNdc = null;
    if (ptr.detached) dragPitch *= Math.exp(-dt / 0.45);
    dragPitch = Math.max(-1.1, Math.min(1.1, dragPitch));
    yaw %= TAU;
    points.rotation.set(BASE_PITCH + dragPitch, yaw + dragYaw, 0);

    // camera: keep FIT in frame on the narrow axis, then zoom
    const tanH = Math.tan((FOV * Math.PI) / 360);
    const dist = (FIT / (tanH * Math.min(1, camera.aspect))) / (0.55 + 0.9 * P.fill);
    camera.position.set(0, 0, dist);
    camera.lookAt(0, 0, 0);
  },
  resize(w, h) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  },

  // ---- QA hooks
  // the formations by name, in slider order
  forms: ORDER.map((i) => NAMES[i]),
  // the formation slider snaps to its stops; the HUD names the one it is
  // on (the panel label stays put so the slider never resizes)
  paramSteps: { shape: 1 / (NF - 1) },
  // The formation is picked by name from a list (Alec, 2026-10-24); the
  // value is the slider stop, so the Shape lane and presets still work.
  paramChoices: { shape: Object.fromEntries(ORDER.map((id, i) => [NAMES[id], i / (NF - 1)])) },
  hudTag() { return NAMES[ORDER[pickOf(this.params.shape)]]; },
  // QA: hold the turntable at an exact yaw (null lets it turn again)
  _qaYaw(v = null) { qaYaw = v; },
  _state: () => ({
    built: !!points, count, kCur, kPending, switchT, switches,
    flows: Array.from(flows), accents, lastAccent, clock, surge, ringAmp: uniforms.uRingAmp.value,
    yaw, dragYaw, dragPitch, breath: formU.uBreath.value, turb: formU.uTurb.value, gain: uniforms.uGain.value,
    path: PATH.slice(),
  }),
  // The flight state of the first n particles: how many follow the
  // current formation, and how far they are from their targets.
  _settle(n = 16384) {
    if (!stA) return null;
    const rows = Math.ceil(n / SW);
    const half = stA.textures[0].type === THREE.HalfFloatType;
    const buf = half ? new Uint16Array(SW * rows * 4) : new Float32Array(SW * rows * 4);
    ctx.renderer.readRenderTargetPixels(stA, 0, 0, SW, rows, buf);
    const f = half ? (x) => THREE.DataUtils.fromHalfFloat(x) : (x) => x;
    const d = [];
    let following = 0;
    for (let i = 0; i < n; i++) {
      const b = i * 4;
      d.push(Math.hypot(f(buf[b]), f(buf[b + 1]), f(buf[b + 2])));
      if (Math.round(f(buf[b + 3])) === ORDER[kCur]) following++;
    }
    d.sort((x, y) => x - y);
    return { following: following / n, median: d[n >> 1], p99: d[Math.floor(n * 0.99)], max: d[n - 1] };
  },
  // The GPU's own positions for the first n particles (world xyz, and
  // in w the recycle fade: under 0.5 the particle is hidden), drawn
  // through the same vertex shader into a float target, so motion is
  // judged from what the screen draws.
  _capture(n = 16384) {
    if (!points || !ctx.renderer) return null;
    const W = Math.ceil(Math.sqrt(n));
    const rt = new THREE.WebGLRenderTarget(W, W, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
    const mat = new THREE.ShaderMaterial({
      uniforms, vertexShader: VERT, fragmentShader: FRAG, defines: { CAPTURE: 1, CAP_W: W },
      depthWrite: false, depthTest: false, blending: THREE.NoBlending,
    });
    const g2 = new THREE.BufferGeometry();
    g2.setAttribute('position', geo.getAttribute('position'));
    g2.boundingSphere = geo.boundingSphere;
    g2.setDrawRange(0, Math.min(n, count));
    const pts = new THREE.Points(g2, mat);
    pts.frustumCulled = false;
    pts.matrixAutoUpdate = false;
    points.updateMatrixWorld();
    pts.matrixWorld.copy(points.matrixWorld);
    pts.matrix.copy(points.matrixWorld);
    const cap = new THREE.Scene();
    cap.add(pts);
    const r = ctx.renderer;
    const prevRT = r.getRenderTarget();
    const prevClear = r.getClearColor(new THREE.Color()), prevAlpha = r.getClearAlpha();
    r.setRenderTarget(rt);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(cap, camera);
    const out = new Float32Array(W * W * 4);
    r.readRenderTargetPixels(rt, 0, 0, W, W, out);
    r.setRenderTarget(prevRT);
    r.setClearColor(prevClear, prevAlpha);
    rt.dispose(); mat.dispose(); g2.dispose();
    return out.subarray(0, Math.min(n, count) * 4);
  },
};

return locus; // vjw: was `export default locus;`
} // vjw: the factory
