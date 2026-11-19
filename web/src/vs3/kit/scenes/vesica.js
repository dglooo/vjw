// Copied from donor/vs3/visual_kit/src/scenes/vesica.js (the friends' engine, used with permission, 2026-11-19).
// vjw: wrapped in a factory (one scene object per layer); nothing else changed. agents/guides/guide_vs3_port.md
// Scene: Vesica. Sacred geometry drawn by compass to the music.
// The canonical figures (the flower of life, Metatron's cube, the
// merkaba, the vector equilibrium) come from lib/vesica-geometry.js as
// strokes in construction order. Each kick swings the compass for the
// next step: one circle, then the vesica, the seed, the whole flower.
// Once the figure is complete it holds, and kicks send a light back
// along its lines in the same order it was drawn. Silence fades the
// drawing, and the music coming back draws it fresh.
//
// Every stroke is one instance of a strip that the vertex shader bends
// along the stroke's curve and widens in screen space, so lines keep the
// same weight at any resolution and stay sharp in a 4K take. Strokes
// blend with MAX, the way ink does: where circles cross, the crossing is
// as bright as one line, never a hot spot.
//
// The style slider (the shared morph param) runs chalk -> ink -> glow:
// grainy silver pen on black, the bold print of the reference posters,
// and the gold medallion with its glow, banded border and stippled halo.
// Colour stays with the palette.
import * as THREE from 'three';
import { PAL, drastic } from '../lib/common.js';
import { ctx } from '../lib/context.js';
import { figure, latticeCircles, stageIndex } from '../lib/vesica-geometry.js';
export default function create() { // vjw

const TAU = Math.PI * 2;
const FOV = 30;
const CAM_D = 1 / Math.tan((FOV / 2) * Math.PI / 180); // z = 0 shows q in -1..1

const scene = new THREE.Scene();
scene.background = PAL.bg;
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 40);
camera.position.set(0, 0, CAM_D);
camera.lookAt(0, 0, 0);

// ---- stroke strip -------------------------------------------------------
const SEGS = 160;        // samples along a stroke (a full circle: 2.25 deg each)
const CAP = 2400;        // instance capacity
const stripGeo = new THREE.InstancedBufferGeometry();
{
  const n = SEGS + 1;
  const aS = new Float32Array(n * 2), aSide = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    aS[i * 2] = aS[i * 2 + 1] = i / SEGS;
    aSide[i * 2] = -1;
    aSide[i * 2 + 1] = 1;
  }
  const idx = [];
  for (let i = 0; i < SEGS; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  stripGeo.setIndex(idx);
  // three needs a position attribute to size the draw; the shader
  // ignores it.
  stripGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
  stripGeo.setAttribute('aS', new THREE.BufferAttribute(aS, 1));
  stripGeo.setAttribute('aSide', new THREE.BufferAttribute(aSide, 1));
}
const inst = {};
for (const [name, size] of [['iC', 3], ['iU', 3], ['iV', 3], ['iArc', 4], ['iDraw', 4], ['iCol', 4]]) {
  const a = new THREE.InstancedBufferAttribute(new Float32Array(CAP * size), size);
  a.setUsage(THREE.DynamicDrawUsage);
  stripGeo.setAttribute(name, a);
  inst[name] = a;
}
stripGeo.instanceCount = 0;

const U = {
  uAspect: { value: 1 },
  uDs: { value: 1 / SEGS },
  uHalfW: { value: 0.002 },
  uGlowR: { value: 0.01 },
  uGlow: { value: 0 },
  uPadQ: { value: 0.004 },
  uDepthK: { value: 0 },
  uGrain: { value: 1 },
  uGrainScale: { value: 1 },
  uHeadQ: { value: 0.012 },
  uHead: { value: 2.0 },
  uTailQ: { value: 0.22 },
  uTracer: { value: 2.0 },
  uHaloCol: { value: new THREE.Color() },
  uHeadCol: { value: PAL.glow },
};

const strokeMat = new THREE.ShaderMaterial({
  uniforms: U,
  // The strip's left side is always the stroke's +normal, so its
  // triangles wind clockwise on screen: draw both faces.
  side: THREE.DoubleSide,
  transparent: true,
  depthTest: false,
  depthWrite: false,
  blending: THREE.CustomBlending,
  blendEquation: THREE.MaxEquation,
  blendEquationAlpha: THREE.MaxEquation,
  vertexShader: /* glsl */`
    attribute float aS;
    attribute float aSide;
    attribute vec3 iC;
    attribute vec3 iU;
    attribute vec3 iV;
    attribute vec4 iArc;   // a0, sweep, kind (0 arc, 1 segment), width scale
    attribute vec4 iDraw;  // pen progress, tracer head (<0 none), brightness, length (q)
    attribute vec4 iCol;   // rgb, seed
    uniform float uAspect, uDs, uHalfW, uGlowR, uPadQ, uDepthK;
    varying float vAcross, vS, vHalfW, vQperS, vDepth;
    varying vec4 vDraw;
    varying vec4 vCol;

    vec3 strokeAt(float s) {
      if (iArc.z > 0.5) return iC + iU * s;
      float a = iArc.x + iArc.y * s;
      return iC + iU * cos(a) + iV * sin(a);
    }
    vec2 toQ(vec3 p) {
      vec4 c = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      return c.xy / c.w * vec2(uAspect, 1.0);
    }
    void main() {
      float s = aS;
      vec3 P = strokeAt(s);
      vec4 c0 = projectionMatrix * modelViewMatrix * vec4(P, 1.0);
      float sa = max(0.0, s - uDs), sb = min(1.0, s + uDs);
      vec2 d = toQ(strokeAt(sb)) - toQ(strokeAt(sa));
      float L = length(d);
      vec2 n = L > 1e-8 ? vec2(-d.y, d.x) / L : vec2(0.0, 1.0);
      float hw = uHalfW * iArc.w;
      float ext = hw + uGlowR * 3.0 + uPadQ;
      vec2 off = n * aSide * ext / vec2(uAspect, 1.0);
      gl_Position = c0 + vec4(off * c0.w, 0.0, 0.0);
      vAcross = aSide * ext;
      vS = s;
      vHalfW = hw;
      vQperS = L / max(sb - sa, 1e-6);
      vDepth = clamp(1.0 + P.z * uDepthK, 0.35, 1.3);
      vDraw = iDraw;
      vCol = iCol;
    }`,
  fragmentShader: /* glsl */`
    uniform float uGlow, uGlowR, uGrain, uGrainScale, uHeadQ, uHead, uTailQ, uTracer;
    uniform vec3 uHaloCol, uHeadCol;
    varying float vAcross, vS, vHalfW, vQperS, vDepth;
    varying vec4 vDraw;
    varying vec4 vCol;

    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }
    float vnoise2(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
                 mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    float vnoise(float x, float seed) {
      float i = floor(x), f = fract(x);
      float a = hash12(vec2(i, seed)), b = hash12(vec2(i + 1.0, seed));
      return mix(a, b, f * f * (3.0 - 2.0 * f));
    }
    void main() {
      // Coverage of the line core: exact distance with a one-pixel ramp;
      // a line thinner than a pixel dims instead of breaking up.
      float aa = max(fwidth(vAcross), 1e-6);
      float d = abs(vAcross);
      float hw = max(vHalfW, 0.5 * aa);
      float cov = clamp((hw + 0.5 * aa - d) / aa, 0.0, 1.0) * (vHalfW / hw);
      // How far behind the pen this point is, in screen units.
      float behind = (vDraw.x - vS) * vQperS;
      float paa = max(fwidth(vS) * vQperS, 1e-6);
      float drawn = clamp(behind / paa + 0.5, 0.0, 1.0);
      if (drawn <= 0.0) discard;
      float glow = uGlow * exp(-max(d - vHalfW, 0.0) / max(uGlowR, 1e-5));
      // Chalk: a fine smooth tooth (sized to a 1080p pixel and a half,
      // so a 4K take keeps the same texture) plus a slow breakup along
      // the stroke where the stick lifts.
      vec2 gp = gl_FragCoord.xy * uGrainScale / 1.5;
      float tooth = 0.65 * vnoise2(gp) + 0.35 * vnoise2(gp * 2.3 + 7.0);
      float brk = vnoise(vS * vDraw.w * 60.0, vCol.w);
      float chalk = mix(1.0, (0.4 + 0.85 * tooth) * (0.6 + 0.5 * brk), uGrain);
      // The pen head while the stroke draws, and a tracer light running
      // the finished line.
      float drawing = 1.0 - step(0.9999, vDraw.x);
      // The lights hug the line: a Gaussian two half-widths wide, gone
      // long before the strip's edge (an exponential reached the edge of
      // the wide gold strip and printed a lit rectangle).
      float soft = exp(-pow(d / (vHalfW * 2.0 + 1e-5), 2.0));
      float head = drawing * uHead * exp(-pow(max(behind, 0.0) / uHeadQ, 2.0));
      float tq = (vDraw.y - vS) * vQperS;
      float trc = 0.0;
      if (vDraw.y >= 0.0) {
        trc = tq >= 0.0 ? pow(max(0.0, 1.0 - tq / uTailQ), 2.0) : exp(-(tq / (0.4 * uHeadQ)) * (tq / (0.4 * uHeadQ)));
        trc *= uTracer;
      }
      vec3 col = vCol.rgb * cov * chalk + uHaloCol * glow;
      col += uHeadCol * (head + trc) * (cov + 0.6 * soft + 0.5 * glow * soft);
      gl_FragColor = vec4(col * vDraw.z * vDepth * drawn, 1.0);
    }`,
});
const strokes = new THREE.Mesh(stripGeo, strokeMat);
strokes.frustumCulled = false;
strokes.renderOrder = 2;
scene.add(strokes);

// ---- paper ---------------------------------------------------------------
// The chalk style's black paper: a whisper of tooth on the background.
const paperU = { uBg: { value: PAL.bg }, uPaper: { value: 0 }, uGrainScale: U.uGrainScale };
const paper = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.ShaderMaterial({
    uniforms: paperU,
    depthTest: false,
    depthWrite: false,
    vertexShader: /* glsl */`void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uBg;
      uniform float uPaper, uGrainScale;
      float hash12(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }
      void main() {
        float g = hash12(floor(gl_FragCoord.xy * uGrainScale / 1.6) + 17.0) - 0.5;
        gl_FragColor = vec4(max(uBg + g * uPaper, 0.0), 1.0);
      }`,
  }),
);
paper.frustumCulled = false;
paper.renderOrder = 0;
scene.add(paper);

// ---- stippled halo (glow style) -------------------------------------------
// The gold medallion's sunburst: dots packed just outside the frame,
// thinning outward in soft radial spokes. Positions in frame radii.
const STIP = 16000;
const stipGeo = new THREE.BufferGeometry();
{
  const p = new Float32Array(STIP * 3), q = new Float32Array(STIP * 4);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < STIP; i++) {
    const a = rnd() * TAU;
    const spoke = 0.5 + 0.5 * Math.cos(a * 41 + 2.6 * Math.sin(a * 7));
    const u = rnd();
    const reach = 0.5 * Math.pow(u, 1.7) * (0.45 + 1.1 * spoke * spoke);
    const r = 1.25 + reach;
    p[i * 3] = Math.cos(a) * r;
    p[i * 3 + 1] = Math.sin(a) * r;
    q[i * 4] = Math.pow(Math.max(0, 1 - reach / 0.85), 2) * (0.35 + 0.65 * rnd());
    q[i * 4 + 1] = rnd();
    q[i * 4 + 2] = rnd();
    q[i * 4 + 3] = r;
  }
  stipGeo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  stipGeo.setAttribute('aQ', new THREE.BufferAttribute(q, 4));
}
const stipU = {
  uR: { value: 1 },
  uPush: { value: 0 },
  uAlpha: { value: 0 },
  uSize: { value: 2 },
  uTw: { value: 0 },
  uT: { value: 0 },
  uCol: { value: new THREE.Color() },
  uCol2: { value: new THREE.Color() },
};
const stipple = new THREE.Points(stipGeo, new THREE.ShaderMaterial({
  uniforms: stipU,
  transparent: true,
  depthTest: false,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexShader: /* glsl */`
    attribute vec4 aQ;
    uniform float uR, uPush, uAlpha, uSize, uTw, uT;
    varying float vA, vMix;
    void main() {
      vec2 p = position.xy * (1.0 + uPush * (aQ.w - 1.15));
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p * uR, 0.0, 1.0);
      gl_PointSize = uSize * (0.7 + 0.6 * aQ.y);
      vA = aQ.x * uAlpha * (1.0 + uTw * sin(uT * 9.0 + aQ.z * 60.0));
      vMix = aQ.z;
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 uCol, uCol2;
    varying float vA, vMix;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      float a = smoothstep(0.5, 0.15, d) * vA;
      gl_FragColor = vec4(mix(uCol, uCol2, vMix) * a, 1.0);
    }`,
}));
stipple.frustumCulled = false;
stipple.matrixAutoUpdate = false;
stipple.renderOrder = 1;
scene.add(stipple);

// ---- glints -------------------------------------------------------------------
// Small four-point stars where lines meet, lit by the hi-hats. Written in
// world space each frame, so they ride every body's turn.
const GLINT_CAP = 512;
const glintGeo = new THREE.BufferGeometry();
const glintPos = new THREE.BufferAttribute(new Float32Array(GLINT_CAP * 3), 3);
const glintA = new THREE.BufferAttribute(new Float32Array(GLINT_CAP), 1);
glintPos.setUsage(THREE.DynamicDrawUsage);
glintA.setUsage(THREE.DynamicDrawUsage);
glintGeo.setAttribute('position', glintPos);
glintGeo.setAttribute('aFlash', glintA);
glintGeo.setDrawRange(0, 0);
const glintU = { uSize: { value: 28 }, uCol: { value: PAL.glow } };
const glints = new THREE.Points(glintGeo, new THREE.ShaderMaterial({
  uniforms: glintU,
  transparent: true,
  depthTest: false,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexShader: /* glsl */`
    attribute float aFlash;
    uniform float uSize;
    varying float vF;
    void main() {
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = uSize * (0.55 + 0.45 * aFlash);
      vF = aFlash;
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 uCol;
    varying float vF;
    void main() {
      vec2 p = abs(gl_PointCoord - 0.5);
      // Four thin arms that taper to nothing inside the sprite, a hot
      // core and a soft halo, so it reads as a star at any size.
      float taper = 1.0 - smoothstep(0.2, 0.5, max(p.x, p.y));
      float arms = (exp(-p.x * 34.0) * exp(-p.y * 5.5) + exp(-p.y * 34.0) * exp(-p.x * 5.5)) * taper;
      float core = exp(-dot(p, p) * 220.0);
      float halo = exp(-dot(p, p) * 26.0) * 0.35;
      gl_FragColor = vec4(uCol * (arms * 1.3 + core * 1.6 + halo) * vF, 1.0);
    }`,
}));
glints.frustumCulled = false;
glints.renderOrder = 3;
scene.add(glints);

// ---- construction state ---------------------------------------------------
const st = {
  fig: null, mode: '', stage: -1,
  live: [],       // strokes of the current figure, with drawing state
  byGroup: new Map(),
  ghosts: [],     // strokes a rebuild dropped, fading out
  lastTrig: -1e9,
  traceGroup: 0,
  snap: false,
  silent: 0,
  gA: 1,
  // The scene's own clock, summed from dt. The engine's t can jump when
  // windows share their drift phase (an output window opening), and a
  // jump read as "the scene was away" wiped the drawing mid-song.
  clock: 0,
  lastT: -1,
  lastWall: -1,
  triggers: 0,
  reverses: 0,
  tracers: 0,
  resets: 0,
  // The scene's own beat estimate: the median gap between recent kicks.
  kickT: -1e9,
  gaps: [],
  beat: 0.5,
  // A hand on the draw slider: a big move catches up faster than the
  // build's own pace, until the drawing reaches it.
  prevDraw: 1,
  rush: false,
};

// A stroke's pen: prog 0..1 along it, dir +1 drawing, -1 erasing, 0 at
// rest. A group is ON once it has been told to draw and not told to
// erase.
const isOn = (s) => s.dir === 1 || (s.dir === 0 && s.prog > 0);
const groupOn = (g) => (st.byGroup.get(g) || []).some(isOn);

function strokeDur(s) {
  if (s.layer === 2 && s.style && s.style[2] === 1 && s.u[0] < 0.2) return 0.35; // rope beads
  if (s.kind === 1) return 0.5;
  return Math.max(0.3, s.sweep / TAU);
}

// A stable per-stroke seed for the chalk breakup, so the texture never
// shifts as other strokes start or finish.
function keySeed(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) % 9973) * 0.731;
}

function setFigure(mode, stage, fresh) {
  const f = figure(mode, stage);
  const old = new Map(st.live.map((s) => [s.key, s]));
  // The frame snaps to the figure's new edge (Alec, 2026-10-24: it hung
  // back while the old ring faded and the new one was drawn last): a
  // frame stroke takes over the progress of the one in its place.
  const oldFrame = new Map(st.live.filter((s) => s.frameRole).map((s) => [s.frameRole, s]));
  st.live = f.strokes.map((def) => {
    let o = fresh ? null : old.get(def.key);
    if (!o && !fresh && def.frameRole && oldFrame.has(def.frameRole) && old.has(oldFrame.get(def.frameRole).key)) o = oldFrame.get(def.frameRole);
    if (o) old.delete(o.key);
    return { ...def, prog: o ? o.prog : 0, dir: o ? o.dir : 0, tr: -1, dur: strokeDur(def), seed: keySeed(def.key) };
  });
  for (const o of old.values()) if (o.prog > 0) st.ghosts.push({ ...o, fade: 1, dir: 0 });
  st.byGroup = new Map();
  for (const x of st.live) {
    if (!st.byGroup.has(x.group)) st.byGroup.set(x.group, []);
    st.byGroup.get(x.group).push(x);
  }
  st.fig = f;
  st.mode = f.mode;
  st.stage = f.stage;
  st.traceGroup = 0;
  buildNodes();
}

function resetDrawing() {
  for (const s of st.live) { s.prog = 0; s.dir = 0; s.tr = -1; }
  st.ghosts.length = 0;
  st.traceGroup = 0;
  for (const n of nodes) n.flash = 0;
  st.resets++;
}

// Style weights [chalk, ink, glow] of the current frame.
let curW = [1, 0, 0];
const shows = (s) => !s.style || s.style[0] * curW[0] + s.style[1] * curW[1] + s.style[2] * curW[2] > 0.001;

// One step of the build toward the draw target. Forward starts the
// lowest group that is not on; reverse erases the highest group that is,
// so the compass undoes its work in the order it did it. A group the
// current style does not show (another style's frame ornament) is laid
// down or lifted at once instead of spending a kick on nothing visible.
function stepBuild(dirn, fast = false) {
  const groups = st.fig.groups;
  if (dirn > 0) {
    for (const g of groups) {
      if (groupOn(g)) continue;
      const list = st.byGroup.get(g);
      if (!list.some(shows)) { for (const x of list) { x.prog = 1; x.dir = 0; } continue; }
      for (const x of list) { x.dir = 1; x.fast = fast; }
      return true;
    }
  } else {
    for (let i = groups.length - 1; i >= 0; i--) {
      const g = groups[i];
      if (!groupOn(g)) continue;
      const list = st.byGroup.get(g);
      if (!list.some(shows)) { for (const x of list) { x.prog = 0; x.dir = 0; } continue; }
      for (const x of list) { x.dir = -1; x.fast = fast; }
      return true;
    }
  }
  return false;
}

const onCount = () => st.fig.groups.reduce((n, g) => n + (groupOn(g) ? 1 : 0), 0);
const moving = () => st.live.some((x) => x.dir !== 0);
const complete = () => st.live.every((s) => s.prog >= 1);

// A figure-slider move sweeps its parts in at this fraction of the
// compass's usual time, so the change lands in a moment.
const FAST = 0.22;
// The classic (middle) stage's frame radius per mode: the one scale
// every stage of that mode is drawn at.
const canonCache = {};
const canonR = (mode) => (canonCache[mode] ??= figure(mode, stageIndex(mode, 0.5)).R);
const drawTarget = (P) => Math.round(Math.min(1, Math.max(0, Number.isFinite(P.density) ? P.density : 1)) * st.fig.groups.length);

// ---- node glints ------------------------------------------------------------
// Where the drawing's lines meet (the flower's centres, the cube's
// corners), a hi-hat lights a small star. Light only: the figure never
// moves for them.
const NODE_CAP = 512;
const nodes = [];
function buildNodes() {
  nodes.length = 0;
  const seen = new Map();
  const add = (p, body, src) => {
    const key = `${body}:${p.map((v) => v.toFixed(4)).join()}`;
    if (seen.has(key)) { seen.get(key).src.push(src); return; }
    if (nodes.length >= NODE_CAP) return;
    const n = { p: p.slice(), body, src: [src], flash: 0 };
    seen.set(key, n);
    nodes.push(n);
  };
  const R = st.fig.R;
  for (const x of st.live) {
    if (x.layer !== 0 || x.bill) continue;
    if (x.kind === 0) {
      if (Math.hypot(x.c[0], x.c[1], x.c[2]) < R - 0.5) add(x.c, x.body, x);
    } else {
      add(x.c, x.body, x);
      add([x.c[0] + x.u[0], x.c[1] + x.u[1], x.c[2] + x.u[2]], x.body, x);
    }
  }
}
const nodeLive = (n) => n.src.some((x) => x.prog >= 1);

// ---- frame transforms -----------------------------------------------------
// Each stroke's body names the transform that carries it (see
// vesica-geometry.js). Matrices are plain row-major 3x3 plus offset.
const mat = (a, b, c, d, e, f, g, h, i) => [a, b, c, d, e, f, g, h, i];
const mul = (A, B) => mat(
  A[0] * B[0] + A[1] * B[3] + A[2] * B[6], A[0] * B[1] + A[1] * B[4] + A[2] * B[7], A[0] * B[2] + A[1] * B[5] + A[2] * B[8],
  A[3] * B[0] + A[4] * B[3] + A[5] * B[6], A[3] * B[1] + A[4] * B[4] + A[5] * B[7], A[3] * B[2] + A[4] * B[5] + A[5] * B[8],
  A[6] * B[0] + A[7] * B[3] + A[8] * B[6], A[6] * B[1] + A[7] * B[4] + A[8] * B[7], A[6] * B[2] + A[7] * B[5] + A[8] * B[8]);
const rx = (a) => mat(1, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a));
const ry = (a) => mat(Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a));
const rz = (a) => mat(Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1);
const sc = (k) => mat(k, 0, 0, 0, k, 0, 0, 0, k);
const app = (M, p) => [M[0] * p[0] + M[1] * p[1] + M[2] * p[2], M[3] * p[0] + M[4] * p[1] + M[5] * p[2], M[6] * p[0] + M[7] * p[1] + M[8] * p[2]];

const motion = {
  fitR: 3, cx: 0, cy: 0.0, fill: 0.5, shape: 0, spin: 0, plane: 0,
  twist: 0, twistV: 0,
  lightE: 0, sub: 0, mids: 0, push: 0,
  aspect: 1,
};
const bodies = [null, null, null, null, null];
const bodyT = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];

// ---- guides ---------------------------------------------------------------
// The faint lattice the figure is drawn on, carried out past the frame
// by the density slider. Cached per reach so it rebuilds only when the
// reach steps.
let guideKey = '';
let guideList = [];
function guides(reach, body) {
  const key = `${body}:${reach}`;
  if (key === guideKey) return guideList;
  guideKey = key;
  guideList = latticeCircles(reach + 1)
    .filter((c) => Math.hypot(c.x, c.y) < reach)
    .map((c) => ({ x: c.x, y: c.y, d: Math.hypot(c.x, c.y) }));
  return guideList;
}

// ---- instance packing -----------------------------------------------------
let count = 0;
const A = {};
for (const k of Object.keys(inst)) A[k] = inst[k].array;
const tmpCol = new THREE.Color();

function put(C, Uv, Vv, a0, sweep, kind, wScale, prog, tr, bright, lenQ, col, seed) {
  if (count >= CAP || bright <= 1e-4) return;
  const i = count++;
  A.iC.set(C, i * 3);
  A.iU.set(Uv, i * 3);
  A.iV.set(Vv, i * 3);
  A.iArc[i * 4] = a0; A.iArc[i * 4 + 1] = sweep; A.iArc[i * 4 + 2] = kind; A.iArc[i * 4 + 3] = wScale;
  A.iDraw[i * 4] = prog; A.iDraw[i * 4 + 1] = tr; A.iDraw[i * 4 + 2] = bright; A.iDraw[i * 4 + 3] = lenQ;
  A.iCol[i * 4] = col.r; A.iCol[i * 4 + 1] = col.g; A.iCol[i * 4 + 2] = col.b;
  A.iCol[i * 4 + 3] = seed || 0;
}

function putStroke(s, prog, tr, bright, wScale, col, scale) {
  const M = bodies[s.body];
  const T = bodyT[s.body];
  const C = app(M, s.c);
  C[0] += T[0]; C[1] += T[1]; C[2] += T[2];
  let Uv, Vv;
  if (s.bill) {
    const r = Math.hypot(s.u[0], s.u[1], s.u[2]) * scale;
    Uv = [r, 0, 0];
    Vv = [0, r, 0];
  } else {
    Uv = app(M, s.u);
    Vv = app(M, s.v);
  }
  const lenObj = s.kind === 1 ? Math.hypot(s.u[0], s.u[1], s.u[2]) : Math.hypot(s.u[0], s.u[1], s.u[2]) * Math.abs(s.sweep);
  put(C, Uv, Vv, s.a0, s.sweep, s.kind, wScale, prog, tr, bright, lenObj * scale, col, s.seed);
}

const styleW = (P) => {
  const m = Math.min(1, Math.max(0, P.morph));
  return [Math.max(0, 1 - 2 * m), 1 - Math.abs(2 * m - 1), Math.max(0, 2 * m - 1)];
};

const lineCol = new THREE.Color();
const underCol = new THREE.Color();
const guideCol = new THREE.Color();
const armCol = new THREE.Color();
const bufSize = new THREE.Vector2(1920, 1080);
const stipM = new THREE.Matrix4();
const stipShift = new THREE.Matrix4();

return { // vjw: was `export default {`
  name: 'vesica',
  scene,
  camera,
  bloom: { strength: 0.3, gain: 0.45 },
  modes: ['flower', 'metatron', 'merkaba', 'equilibrium', 'torus', 'golden', 'grid'],
  params: { mode: 'flower', morph: 0, speed: 0.5, shape: 0, complexity: 0.5, density: 1, fill: 0.5, contrast: 0.5, open: 0 },
  // morph is the drawing medium (chalk, ink, glow); fill reads zoom, the
  // word every scene uses for how big its subject sits (Alec, 2026-10-24).
  paramLabels: { '*': { morph: 'medium', shape: 'turn', complexity: 'figure', density: 'draw', fill: 'zoom', open: 'drawing' } },
  paramOrder: ['open', 'morph', 'density', 'speed', 'shape', 'complexity', 'fill', 'contrast'],
  // Watching the compass draw every figure could wear (Alec, 2026-10-24):
  // fully drawn shows the whole build at once and holds it through quiet
  // parts; kicks still retrace it in light. Rides the Open lane, which
  // hosts default to 0, so saved sets keep drawing on the beat.
  paramChoices: { open: { 'draws on the beat': 0, 'fully drawn': 1 } },
  // QA hooks (tools/qa_vesica.mjs and the browser harness).
  _debug() {
    const live = st.live;
    return {
      mode: st.mode, stage: st.stage, name: st.fig && st.fig.name,
      strokes: live.length, started: live.filter((s) => s.prog > 0 || s.dir !== 0).length,
      drawn: live.filter((s) => s.prog >= 1).length, complete: complete(),
      on: st.fig ? onCount() : 0, target: st.fig ? drawTarget(this.params) : 0, moving: moving(),
      groups: st.fig ? st.fig.groups.length : 0,
      ghosts: st.ghosts.length, gA: st.gA, instances: count,
      triggers: st.triggers, reverses: st.reverses, tracers: st.tracers, resets: st.resets,
      beat: st.beat, glints: glintGeo.drawRange.count,
      fitR: motion.fitR, spin: motion.spin, twist: motion.twist, plane: motion.plane,
    };
  },
  _strokes: () => st.live,
  _glintAll: (f = 1) => { for (const n of nodes) if (nodeLive(n)) n.flash = f; },
  _reset: () => resetDrawing(),
  // Where a stroke's centre (or start) sits in the world right now.
  _where: (key) => {
    const x = st.live.find((y) => y.key === key);
    if (!x || !bodies[x.body]) return null;
    const c = app(bodies[x.body], x.c), T = bodyT[x.body];
    return [c[0] + T[0], c[1] + T[1], c[2] + T[2]];
  },
  update(s, dt, t) {
    const P = this.params;
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.05);
    const spd = drastic(P.speed);
    const k = (rate) => 1 - Math.exp(-dt * rate);

    const mode = this.modes.includes(P.mode) ? P.mode : 'flower';
    const stage = stageIndex(mode, P.complexity);
    // A new mode draws from scratch while the old figure fades; a new
    // build stage keeps every stroke the two stages share.
    if (!st.fig || mode !== st.mode) setFigure(mode, stage, true);
    else if (stage !== st.stage) {
      // The figure slider answers at once: the stage's new parts sweep
      // in (or out) straight away instead of waiting for kicks.
      setFigure(mode, stage, false);
      st.snap = true;
    }
    // Back from away (another scene was live, or the window slept): a
    // fresh drawing. Away needs BOTH a second of wall time with no
    // update and the engine clock moving on, so a slow export frame
    // (wall gap, steady t) or a shared-phase jump (t jump, no wall gap)
    // keeps the drawing.
    const wall = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const away = st.lastWall >= 0 && wall - st.lastWall > 1000 && Math.abs(t - st.lastT) > 1;
    if (st.lastT < 0 || away) resetDrawing();
    st.lastT = t;
    st.lastWall = wall;
    st.clock += dt;
    const now = st.clock;
    const fig = st.fig;

    // Envelopes: light rides energy, the pen and the spin ride smoothed
    // mids, line weight breathes on the sub.
    const e = Math.max(0, s.energy || 0);
    motion.lightE += (e - motion.lightE) * k(e > motion.lightE ? 6 : 1.4);
    motion.sub += ((s.sub || 0) - motion.sub) * k(3);
    motion.mids += ((s.mids || 0) - motion.mids) * k(0.6);
    motion.push = Math.min(0.12, motion.push + (s.onKick || 0) * 0.05);
    motion.push *= Math.exp(-dt * 4);

    // Silence: three quiet seconds fade the drawing; once gone it resets
    // so the music coming back draws it fresh.
    const drawn = (P.open || 0) >= 0.5;
    if (e < 0.03 && !drawn) st.silent += dt; else st.silent = 0;
    const fading = st.silent > 3;
    st.gA += ((fading ? 0 : 1) - st.gA) * k(fading ? 1.6 : 4);
    if (fading && st.gA < 0.01) {
      if (st.live.some((x) => x.prog > 0 || x.dir !== 0)) resetDrawing();
    }

    curW = styleW(P);

    // The beat: the median of the last few kick gaps that look like a
    // pulse (0.25..1.5 s), eased so one stray onset cannot jolt the pen.
    const onK = s.onKick || 0, onM = s.onMid || 0, onH = s.onHigh || 0;
    if (onK > 0.1) {
      const gap = now - st.kickT;
      if (gap > 0.25 && gap < 1.5) {
        st.gaps.push(gap);
        if (st.gaps.length > 9) st.gaps.shift();
      }
      st.kickT = now;
    }
    if (st.gaps.length >= 3) {
      const sorted = [...st.gaps].sort((a, b) => a - b);
      st.beat += (sorted[sorted.length >> 1] - st.beat) * k(2);
    }

    // Triggers: a kick or a melodic hit swings the compass; a slow clock
    // keeps sustained music drawing when nothing hits. Each trigger moves
    // the build one step toward the draw target, forward or back.
    const target = drawTarget(P);
    const have = onCount();
    const drawNow = Number.isFinite(P.density) ? P.density : 1;
    if (Math.abs(drawNow - st.prevDraw) > 0.04) { st.rush = true; st.prevDraw = drawNow; }
    if (have === target) st.rush = false;
    const nothingYet = have === 0 && !moving();
    // Kicks own the pace when there are kicks; a melodic hit only swings
    // the compass in music with no kick for a second, so a busy snare
    // and hat line cannot double the build's speed.
    const melodic = onM > 0.4 && now - st.kickT > 1;
    let trig = (onK > 0.1 || melodic) && now - st.lastTrig > 0.16;
    if (!trig && !fading && motion.lightE > 0.06 && now - st.lastTrig > 1.4 / spd) trig = true;
    if (!trig && nothingYet && target > 0 && !fading && motion.lightE > 0.04) trig = true;
    if (st.snap || (drawn && have !== target)) {
      st.snap = false;
      for (let guard = 0; guard < 400 && onCount() !== target; guard++) {
        if (!stepBuild(target > onCount() ? 1 : -1, true)) break;
      }
    } else if (trig) {
      st.lastTrig = now;
      if (have !== target) {
        // Big builds lay more steps per kick so every build lands in
        // about the same span (some 28 kicks), and a move of the draw
        // slider catches up within about eight.
        const per = Math.max(1, Math.round(fig.groups.length / 28), st.rush ? Math.ceil(Math.abs(target - have) / 8) : 1);
        const dirn = target > have ? 1 : -1;
        let n = 0;
        for (let i = 0; i < per && onCount() !== target; i++) if (stepBuild(dirn)) n++;
        if (n) { if (dirn > 0) st.triggers++; else st.reverses++; }
      } else if (onK > 0.1 && !moving()) {
        // Settled: retrace what is drawn, one step per kick, in the
        // order it was drawn.
        const groups = fig.groups;
        for (let n = 0; n < groups.length; n++) {
          const g = groups[st.traceGroup++ % groups.length];
          const list = st.byGroup.get(g).filter((x) => x.layer !== 2 && x.prog >= 1);
          if (!list.length) continue;
          for (const x of list) x.tr = 0;
          st.tracers++;
          break;
        }
      }
    }

    // Pen and tracers advance. A full circle takes two beats at the
    // middle speed; erasing runs a little quicker than drawing.
    const Tc = 2 * st.beat / spd;
    for (const x of st.live) {
      if (x.dir > 0) {
        x.prog = Math.min(1, x.prog + dt / (Tc * x.dur * (x.fast ? FAST : 1)));
        if (x.prog >= 1) { x.dir = 0; x.fast = false; }
      } else if (x.dir < 0) {
        x.prog = Math.max(0, x.prog - dt / (Tc * x.dur * 0.7 * (x.fast ? FAST : 1)));
        if (x.prog <= 0) { x.dir = 0; x.tr = -1; x.fast = false; }
      }
      if (x.tr >= 0) {
        x.tr += dt / (Tc * x.dur * 0.8);
        if (x.tr > 1.6) x.tr = -1;
      }
    }

    // Glints: each hi-hat lights a few of the drawn meeting points.
    if (onH > 0.15 && nodes.length) {
      const live = nodes.filter(nodeLive);
      const n = Math.min(live.length, 1 + Math.floor(onH * 3));
      for (let i = 0; i < n; i++) {
        const node = live[Math.floor(Math.random() * live.length)];
        node.flash = Math.max(node.flash, 0.55 + 0.45 * onH);
      }
    }
    for (const node of nodes) node.flash *= Math.exp(-dt * 5);
    for (const g of st.ghosts) g.fade -= dt / 0.45;
    st.ghosts = st.ghosts.filter((g) => g.fade > 0);

    // Framing: the figure's frame radius maps to `size` (0.86 of the
    // half-height at the middle detent, 0.3..2.4 across the slider),
    // narrowed for portrait frames so 9:16 still fits.
    motion.fill += (P.fill - motion.fill) * k(5);
    motion.shape += (P.shape - motion.shape) * k(4);
    // The fit covers the style's frame: ink's second ring and the gold
    // border's outer band (1.22 R) stay inside the frame at the middle
    // size detent.
    const wNow = styleW(P);
    // Every stage of a mode keeps the classic stage's scale, so the
    // figure slider adds or removes parts around the same centre and
    // never zooms (it used to refit each stage to the frame, which read
    // like the size slider). Size alone zooms.
    const fitTarget = canonR(fig.mode) * (1 + 0.045 * wNow[1] + 0.22 * wNow[2]);
    motion.fitR += (fitTarget - motion.fitR) * k(3);
    motion.cx += (fig.center[0] - motion.cx) * k(3);
    motion.cy += (fig.center[1] - motion.cy) * k(3);
    const size = 0.86 * Math.pow(4, (motion.fill - 0.5) * 1.5) * Math.min(1, motion.aspect);
    const scale = size / motion.fitR;

    // Bodies. The plane tilts back by turn and spins slowly once tilted;
    // a solid stands on its axis (turn 0, seen a little from above) and
    // turns to face the viewer down that axis at turn 1. The two
    // tetrahedra of the merkaba share one spin; a kick twists them
    // apart and they spring back together.
    const tilt = motion.shape * 1.05;
    // The tilted disc turns slowly; laid flat again it settles back
    // upright, to the nearest turn its symmetry allows (sixfold once the
    // flower or the cube is complete, a half turn for the vesica), so
    // the top petal always comes home standing.
    motion.plane += dt * motion.shape * 0.12 * spd;
    if (motion.shape < 0.02) {
      const sym = complete() && fig.name !== 'vesica' && fig.sym6 ? Math.PI / 3 : fig.name === 'vesica' ? Math.PI : TAU;
      const home = Math.round(motion.plane / sym) * sym;
      motion.plane += (home - motion.plane) * k(1.2);
    }
    motion.spin += dt * 0.32 * spd * (0.6 + 0.8 * motion.mids);
    motion.twistV += (s.onKick || 0) * 4.5;
    const acc = -60 * motion.twist - 14 * motion.twistV;
    motion.twistV += acc * dt;
    motion.twist += motion.twistV * dt;
    const view = 0.28 + motion.shape * (Math.PI / 2 - 0.28);
    const S = sc(scale);
    bodies[0] = mul(S, mul(rx(-tilt), rz(-motion.plane)));
    const off = app(bodies[0], [-motion.cx, -motion.cy, 0]);
    bodyT[0] = off;
    bodies[1] = mul(S, mul(rx(view), ry(motion.spin + motion.twist)));
    bodies[2] = mul(S, mul(rx(view), ry(motion.spin - motion.twist)));
    bodies[3] = mul(S, mul(rx(view), ry(motion.spin)));
    bodies[4] = S;

    // Style: widths scale with the drawing's cell so a dense build keeps
    // its proportions; the sub swells every line a little.
    const [wC, wI, wG] = curW;
    const cell = scale;
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const hw = (wC * clamp(0.0058 * cell, 0.0011, 0.003)
      + wI * clamp(0.03 * cell, 0.0035, 0.012)
      + wG * clamp(0.0085 * cell, 0.0014, 0.0042)) * (1 + 0.3 * motion.sub);
    U.uHalfW.value = hw;
    U.uGlowR.value = Math.max(1e-4, clamp(0.018 * cell, 0.003, 0.009));
    U.uGlow.value = wG * 0.3;
    U.uGrain.value = wC + wG * 0.12;
    U.uDepthK.value = (fig.solid ? 0.55 : 0.35) / Math.max(1e-3, size);
    paperU.uPaper.value = 0.035 * wC;
    // Bloom per style: chalk keeps a soft lift, ink stays print-crisp,
    // gold glows mostly from its own halo (a heavy bloom filled the
    // flower's cells with light and lost the lines).
    this.bloom.strength = 0.22 * wC + 0.08 * wI + 0.26 * wG;
    this.bloom.gain = 0.35 * wC + 0.12 * wI + 0.3 * wG;

    if (ctx.renderer) ctx.renderer.getDrawingBufferSize(bufSize);
    const bufH = Math.max(1, bufSize.y);
    U.uGrainScale.value = 1080 / bufH;
    U.uPadQ.value = 4 / bufH;
    U.uAspect.value = motion.aspect;

    // Colour from the palette: chalk and ink draw in the glow slot, the
    // gold style leans into accent with a mid-slot halo.
    lineCol.copy(PAL.glow);
    tmpCol.copy(PAL.accent).lerp(PAL.glow, 0.35);
    lineCol.lerp(tmpCol, wG);
    underCol.copy(lineCol).lerp(PAL.accent, 0.45);
    guideCol.copy(PAL.mid).lerp(PAL.accent, 0.35);
    armCol.copy(PAL.accent);
    U.uHaloCol.value.copy(PAL.mid).lerp(PAL.accent, 0.5);

    const contrastK = 0.65 + 0.8 * P.contrast;
    const lineB = (0.38 + 0.8 * motion.lightE) * contrastK * st.gA;

    // Pack the frame.
    count = 0;
    const drawnN = st.live.filter((x) => x.prog >= 1).length;
    const doneFrac = st.live.length ? drawnN / st.live.length : 0;

    // The faint lattice under everything, carried out past the frame.
    // Contrast sets figure against ground: low contrast lays the whole
    // lattice in, high contrast leaves the figure alone on black.
    const ground = Math.pow(Math.max(0, 1 - P.contrast), 1.3);
    if (ground > 0.01) {
      const diag = Math.sqrt(motion.aspect * motion.aspect + 1) / Math.max(scale, 1e-3);
      const reach = Math.max(1, Math.min(11, Math.ceil(Math.min(fig.R * 2.4, diag + 1))));
      const body = fig.solid ? 4 : 0;
      const gB = lineB * 0.62 * ground * Math.min(1, doneFrac * 1.5);
      const fadeFrom = fig.R * 0.9;
      for (const c of guides(reach, body)) {
        const fall = 1 - Math.min(1, Math.max(0, (c.d - fadeFrom) / Math.max(0.5, reach - fadeFrom)));
        if (fall <= 0) continue;
        putStroke({ c: [c.x, c.y, 0], u: [1, 0, 0], v: [0, 1, 0], a0: Math.PI / 2, sweep: TAU, kind: 0, body, bill: false, seed: c.x * 13.1 + c.y * 7.7 + 50 },
          1, -1, gB * fall, 0.6, guideCol, scale);
      }
    }

    for (const x of st.live) {
      if (x.prog <= 0) continue;
      let b = lineB;
      let w = 1;
      let col = lineCol;
      if (x.layer === 1) { b *= 0.38; w = 0.6; col = underCol; }
      if (x.layer === 2) {
        const sw = x.style ? x.style[0] * wC + x.style[1] * wI + x.style[2] * wG : 1;
        b *= sw;
        w = x.style && x.style[2] === 1 && x.u[0] < 0.2 ? 0.8 : 1;
      }
      putStroke(x, x.prog, x.tr, b, w, col, scale);
      // The compass arm while a circle draws: a faint radius from the
      // needle to the pen.
      if (x.dir !== 0 && x.kind === 0 && !x.bill && x.layer !== 2) {
        const a = x.a0 + x.sweep * x.prog;
        const tip = [
          x.c[0] + x.u[0] * Math.cos(a) + x.v[0] * Math.sin(a),
          x.c[1] + x.u[1] * Math.cos(a) + x.v[1] * Math.sin(a),
          x.c[2] + x.u[2] * Math.cos(a) + x.v[2] * Math.sin(a),
        ];
        const ramp = Math.min(1, x.prog * 8, (1 - x.prog) * 8);
        putStroke({ kind: 1, c: x.c, u: [tip[0] - x.c[0], tip[1] - x.c[1], tip[2] - x.c[2]], v: [0, 0, 0], a0: 0, sweep: 1, body: x.body, bill: false },
          1, -1, lineB * 0.3 * ramp, 0.5, armCol, scale);
      }
    }
    for (const g of st.ghosts) {
      const sw = g.layer === 2 && g.style ? g.style[0] * wC + g.style[1] * wI + g.style[2] * wG : 1;
      putStroke(g, g.prog, -1, lineB * g.fade * sw * (g.layer === 1 ? 0.38 : 1), g.layer === 1 ? 0.6 : 1, g.layer === 1 ? underCol : lineCol, scale);
    }
    for (const k2 of Object.keys(inst)) {
      inst[k2].needsUpdate = true;
      inst[k2].clearUpdateRanges();
      inst[k2].addUpdateRange(0, count * inst[k2].itemSize);
    }
    stripGeo.instanceCount = count;

    let gn = 0;
    const gArr = glintPos.array, fArr = glintA.array;
    for (const node of nodes) {
      if (node.flash < 0.02 || gn >= GLINT_CAP) continue;
      const M = bodies[node.body], T = bodyT[node.body];
      const p = app(M, node.p);
      gArr[gn * 3] = p[0] + T[0]; gArr[gn * 3 + 1] = p[1] + T[1]; gArr[gn * 3 + 2] = p[2] + T[2];
      fArr[gn] = node.flash * st.gA * (0.6 + 0.6 * motion.lightE) * contrastK;
      gn++;
    }
    glintGeo.setDrawRange(0, gn);
    glintPos.needsUpdate = true;
    glintA.needsUpdate = true;
    glintU.uSize.value = 64 * bufH / 1080 * Math.min(1.4, Math.max(0.6, cell / 0.29));

    // The stippled halo rides the frame, shows once the frame is drawn,
    // breathes out on kicks and twinkles on the highs.
    const framePlane = fig.solid ? 4 : 0;
    const M = bodies[framePlane];
    const T = bodyT[framePlane];
    stipM.set(M[0], M[1], M[2], T[0], M[3], M[4], M[5], T[1], M[6], M[7], M[8], T[2], 0, 0, 0, 1);
    if (!fig.solid) stipM.multiply(stipShift.makeTranslation(motion.cx, motion.cy, 0));
    stipple.matrix.copy(stipM);
    stipple.matrixWorldNeedsUpdate = true;
    stipU.uR.value = fig.R;
    stipU.uPush.value = motion.push;
    stipU.uAlpha.value = wG * 1.1 * (0.5 + 0.8 * motion.lightE) * st.gA * Math.pow(doneFrac, 2);
    stipU.uSize.value = 2.6 * bufH / 1080;
    stipU.uTw.value = Math.min(1, (s.highs || 0) * 1.2);
    stipU.uT.value = now;
    stipU.uCol.value.copy(PAL.accent);
    stipU.uCol2.value.copy(PAL.mid).lerp(PAL.glow, 0.3);
    stipple.geometry.setDrawRange(0, Math.round(STIP * 0.85));
    stipple.visible = stipU.uAlpha.value > 1e-3;
  },
  resize(w, h) {
    motion.aspect = w / Math.max(1, h);
    camera.aspect = motion.aspect;
    camera.updateProjectionMatrix();
  },
};
} // vjw: the factory
