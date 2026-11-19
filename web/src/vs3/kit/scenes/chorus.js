// Copied from donor/vs3/visual_kit/src/scenes/chorus.js (the friends' engine, used with permission, 2026-11-19).
// vjw: wrapped in a factory (one scene object per layer), the frond texture kept above it, the head loaded from our
// static copy /vs3/visage/ (web/public/vs3/). agents/guides/guide_vs3_port.md
// Scene: chorus, twenty carved heads rigged to look around together.
// One slider carries the crowd through four arrangements: a choir on
// risers, a ball of masks, a spiral totem, and a hall that flows past
// the camera. Heads and eyes share one gaze (the cursor, when it moves),
// each head on its own lag, and every face blinks on its own clock. The
// arrangement belongs to the slider alone and never reacts to the music;
// the carving and the eyes glow with it. Drag turns the whole crowd.
import * as THREE from 'three';
import { PAL, drastic, scenePointer } from '../lib/common.js';
import { NOISE_GLSL } from '../lib/noise-glsl.js';

// vjw: moved here from below: the crowd size and the crowns' frond texture, ABOVE the factory, so every layer shares
// one texture (the host frees geometries and materials, no textures). A layer writes it in update() and draws at
// once (vs3/host.ts), so two layers never read each other's crowns.
const N = 20;
const FR_S = 24, FR_RING = 6, FR_MAIN = 6, FR_KIDS = 2;
const FR_PER = FR_MAIN * (1 + FR_KIDS);
const FR_ROWS = N * FR_PER;
const MU_PER = 5, MU_MAX = N * MU_PER, MU_SCALE = 2.6;
const frData = new Float32Array((FR_S + 1) * FR_ROWS * 4);
const frTex = new THREE.DataTexture(frData, FR_S + 1, FR_ROWS, THREE.RGBAFormat, THREE.FloatType);
frTex.minFilter = frTex.magFilter = THREE.NearestFilter;
frTex.needsUpdate = true;

export default function create() { // vjw

const scene = new THREE.Scene();
scene.background = PAL.bg;
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 400);
camera.position.set(0, 0, 14);

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- the head
// The same ICT FaceKit head as visage (vendor/visage, MIT notice there),
// built unsubdivided for a crowd: head_lo.bin, 7K vertices a half, a
// quarter of visage's close-up head. Fetched on the scene's first frame,
// from the module-relative address and then the page base (the homepage
// hero bundles scene modules elsewhere), with visage's head as a last
// resort.
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
    if (b.q) { const f = new Float32Array(a.length); for (let i = 0; i < a.length; i++) f[i] = a[i] * b.q; a = f; }
    out[b.name] = a;
  }
  return out;
}
let icData = null, headAsked = false;
const HEAD_RETRY_MS = 10000;
function ensureHead() {
  if (headAsked) return;
  headAsked = true;
  if (typeof fetch !== 'function') return;
  const urls = [import.meta.env.BASE_URL + 'vs3/visage/head_lo.bin', import.meta.env.BASE_URL + 'vs3/visage/head.bin']; // vjw: our static copies, was import.meta.url + document.baseURI
  // Every source failing (a dropped connection, a phone waking from
  // sleep) used to leave the scene blank for the session. Ask again
  // after a pause; update() calls ensureHead every frame.
  const retry = () => { if (typeof setTimeout === 'function') setTimeout(() => { if (!icData) headAsked = false; }, HEAD_RETRY_MS); };
  const tryAt = (i) => fetch(urls[i])
    .then((r) => { if (!r.ok) throw new Error('head ' + r.status); return r.arrayBuffer(); })
    .then((buf) => { icData = parseHeadBin(buf); })
    .catch(() => (i + 1 < urls.length ? tryAt(i + 1) : retry()));
  tryAt(0);
}

// The stored right half plus its mirror, one geometry for every head.
function fullHead(d) {
  const nv = d.header.nv, nt = d.header.nt;
  const dup = (a, c, mx) => {
    const o = new a.constructor(a.length * 2);
    o.set(a);
    for (let i = 0; i < nv; i++) for (let k = 0; k < c; k++) o[(nv + i) * c + k] = mx && k === 0 ? -a[i * c + k] : a[i * c + k];
    return o;
  };
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(dup(d.pos, 3, true), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(dup(d.nrm, 3, true), 3, true));
  g.setAttribute('aAo', new THREE.BufferAttribute(dup(d.ao, 1, false), 1, true));
  g.setAttribute('aDF', new THREE.BufferAttribute(dup(d.dFem, 3, true), 3));
  g.setAttribute('aNF', new THREE.BufferAttribute(dup(d.nFem, 3, true), 3, true));
  g.setAttribute('aDS', new THREE.BufferAttribute(dup(d.dStrong, 3, true), 3));
  g.setAttribute('aNS', new THREE.BufferAttribute(dup(d.nStrong, 3, true), 3, true));
  g.setAttribute('aBlink', new THREE.BufferAttribute(dup(d.dBlink, 3, true), 3));
  const idx = new Uint16Array(nt * 6);
  idx.set(d.idx);
  for (let t = 0; t < nt; t++) {
    idx[(nt + t) * 3] = nv + d.idx[t * 3];
    idx[(nt + t) * 3 + 1] = nv + d.idx[t * 3 + 2];
    idx[(nt + t) * 3 + 2] = nv + d.idx[t * 3 + 1];
  }
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

// --------------------------------------------------------------- materials
const PAL_GLSL = /* glsl */`
  uniform vec3 uColBg, uColShadow, uColMid, uColAccent, uColGlow;
  uniform float uContrast;
  vec3 grade(vec3 c) {
    float g = 0.7 + uContrast * 0.9;
    return pow(max(c, 0.0), vec3(g));
  }`;
const uniforms = {
  uTime: { value: 0 },
  uFlow: { value: 0 },       // ornament drift (speed-scaled time)
  uFreq: { value: 1.6 },     // ornament noise frequency
  uBands: { value: 40 },     // contour count (detail)
  uSharp: { value: 3.0 },    // motif territory sharpness (visage's value)
  uGlow: { value: 0.5 },     // groove light (energy)
  uKick: { value: 0 },
  uContrast: { value: 0.5 },
  uClay: { value: 0 },       // QA: plain sculpt, no carving
  uNsc: { value: 2 },
  uFog: { value: new THREE.Vector2(40, 90) },
  // cuts, object space: below the jaw (y) and behind the ears (z). The
  // ball wears masks, the totem drops the necks.
  uTrim: { value: new THREE.Vector2(-2.5, -1.2) },
  uKeyDir: { value: new THREE.Vector3(-0.55, 0.6, 0.75).normalize() },
  uFillDir: { value: new THREE.Vector3(0.1, -1.0, 0.45).normalize() },
  uRimDir: { value: new THREE.Vector3(0.35, 0.45, -1.0).normalize() },
  uColBg: { value: PAL.bg },
  uColShadow: { value: PAL.shadow },
  uColMid: { value: PAL.mid },
  uColAccent: { value: PAL.accent },
  uColGlow: { value: PAL.glow },
};

// The skin is visage's: phasor scrollwork carved into the rest pose
// (rings round the eyes, spirals on temples and cheeks, chevrons down the
// nose, bars on the chin), lips, ears and eyelids clean. Each head gets
// its own phase (the seed) and its own shade of the palette's mid.
const skinMat = new THREE.ShaderMaterial({
  uniforms,
  vertexShader: /* glsl */`
    attribute float aAo;
    attribute vec3 aDF, aNF, aDS, aNS, aBlink;
    attribute vec4 iFace; // face knob, features knob, blink, seed
    uniform float uNsc;
    uniform vec2 uTrim;
    varying vec3 vObj, vN, vW;
    varying float vAo, vLid, vSeed;
    void main() {
      vLid = smoothstep(0.0015, 0.012, length(aBlink));
      vec3 p = position + aDF * iFace.x + aDS * iFace.y + aBlink * (iFace.z * 1.3);
      vec3 n = normal + (aNF * iFace.x + aNS * iFace.y) * uNsc;
      // a cut folds everything past its plane flat onto the plane, so the
      // head ends in a sealed cap (no discard: early depth stays on)
      p.y = max(p.y, uTrim.x);
      p.z = max(p.z, uTrim.y);
      vObj = position;
      vAo = aAo;
      vSeed = iFace.w;
      vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
      vW = w.xyz;
      vN = normalize(mat3(modelMatrix * instanceMatrix) * normalize(n));
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: /* glsl */`
    precision highp float;
    ${NOISE_GLSL}
    ${PAL_GLSL}
    uniform float uTime, uFlow, uFreq, uBands, uSharp, uGlow, uKick, uClay;
    uniform vec2 uFog, uTrim;
    uniform vec3 uKeyDir, uFillDir, uRimDir;
    varying vec3 vObj, vN, vW;
    varying float vAo, vLid, vSeed;
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
    vec3 chevron(vec3 p, vec3 c, vec3 r, float k, float wk) {
      vec3 d = (p - c) / r;
      float w = exp(-uSharp * dot(d, d)) * pow(wk, uSharp);
      float ph = k * (p.y - 0.6 * abs(p.x));
      return w * vec3(cos(ph), sin(ph), 1.0);
    }
    vec3 vbars(vec3 p, vec3 c, float sig, float k) {
      vec3 d = p - c;
      float w = exp(-uSharp * dot(d, d) / (sig * sig));
      float ph = k * abs(p.x);
      return w * vec3(cos(ph), sin(ph), 1.0);
    }
    // one side's motifs, summed with the mirror image (midline motifs at
    // half weight), as visage does it
    vec3 side(vec3 p) {
      float kr = uBands, ks = uBands * 0.16, sp = uFlow * 0.6;
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
    vec2 ornament(vec3 p) {
      vec3 A = side(p) + side(vec3(-p.x, p.y, p.z));
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
      float fog = smoothstep(uFog.x, uFog.y, length(vW - cameraPosition));
      // the cut cap and the inside of the shell: dark, carved wood
      if (!gl_FrontFacing || vObj.y < uTrim.x || vObj.z < uTrim.y) {
        gl_FragColor = vec4(grade(mix(uColShadow * 0.22, uColBg, fog)), 1.0);
        return;
      }
      vec3 N = normalize(vN);
      vec3 V = normalize(cameraPosition - vW);
      vec2 om = ornament(vObj);
      float s = cos(om.x - vSeed * 6.2831853);
      float fw = fwidth(s) * 1.1 + 1e-4;
      float coh = smoothstep(0.22, 0.55, om.y);
      vec3 q = vec3(abs(vObj.x), vObj.y, vObj.z);
      float ears = (1.0 - smoothstep(0.85, 1.15, length((q - vec3(0.78, -0.3, -0.26)) / vec3(0.14, 0.33, 0.2))))
        * smoothstep(0.62, 0.68, q.x);
      float my = q.y + 0.815 + 0.25 * q.x * q.x;
      float lips = (1.0 - smoothstep(0.85, 1.1, length(vec2(q.x / 0.255, my / 0.115))))
        * smoothstep(0.78, 0.86, q.z);
      float clean = max(max(ears, lips), vLid);
      float dens = 1.0 - smoothstep(0.3, 0.85, fw);
      float carve = coh * (1.0 - clean) * dens * (1.0 - uClay);
      float line = smoothstep(0.9 - fw, 0.9 + fw, s) * carve;
      float halo = smoothstep(0.62 - fw, 0.62 + fw, s) * carve - line;
      vec3 Nb = bump(N, vW, (line + halo * 0.35) * 0.004);

      float ao = mix(0.25, 1.0, vAo);
      float key = clamp((dot(Nb, uKeyDir) + 0.25) / 1.25, 0.0, 1.0);
      float fill = clamp(dot(Nb, uFillDir), 0.0, 1.0);
      float fres = pow(1.0 - clamp(dot(Nb, V), 0.0, 1.0), 3.0);
      float rim = fres * clamp(dot(N, uRimDir) + 0.6, 0.0, 1.0);
      float spec = pow(clamp(dot(reflect(-uKeyDir, Nb), V), 0.0, 1.0), 16.0);
      float mott = snoise(vObj * 7.0 + vSeed * 13.0) * 0.5 + 0.5;
      // every face its own shade of the palette's mid
      vec3 tone = mix(uColMid, mix(uColShadow, uColAccent, 0.35), 0.28 * fract(vSeed * 7.13));
      vec3 base = mix(tone, uColShadow, 0.18 * mott * (1.0 - uClay));
      vec3 skin = mix(uColShadow * 0.6, base, smoothstep(0.0, 0.85, key * ao));
      skin = mix(skin, uColGlow, smoothstep(0.7, 1.0, key * ao) * 0.22);
      skin += uColAccent * fill * 0.3 * ao;
      skin += uColGlow * spec * 0.13 * ao;
      skin += mix(uColAccent, uColGlow, 0.4) * rim * 0.7;
      if (uClay < 0.5) {
        float lit0 = smoothstep(0.0, 0.85, key * ao);
        skin = mix(skin, mix(uColShadow, uColMid, 0.35 + 0.4 * lit0), lips * 0.7);
        skin = mix(skin, uColShadow * 0.3, halo * 0.55);
        float run = 0.5 + 0.5 * sin(om.x * 2.0 - uTime * 2.2);
        float lit = uGlow * (0.3 + 0.7 * run) + uKick;
        skin = mix(skin, mix(uColAccent, uColGlow, run * 0.6) * (0.25 + 0.75 * lit), line * 0.85);
      }
      gl_FragColor = vec4(grade(mix(skin, uColBg, fog)), 1.0);
    }`,
});

// Eyes: visage's, instanced, each one dimmed by its own head's blink.
const eyeUniforms = {
  uTime: uniforms.uTime,
  uPupil: { value: 0.18 },
  uIris: { value: 0.52 },
  uFlare: { value: 0.5 },
  uKeyDir: uniforms.uKeyDir,
  uContrast: uniforms.uContrast,
  uFog: uniforms.uFog,
  uColBg: { value: PAL.bg },
  uColShadow: { value: PAL.shadow },
  uColMid: { value: PAL.mid },
  uColAccent: { value: PAL.accent },
  uColGlow: { value: PAL.glow },
};
const eyeMat = new THREE.ShaderMaterial({
  uniforms: eyeUniforms,
  vertexShader: /* glsl */`
    attribute float iShut;
    varying vec3 vL, vN, vW;
    varying float vShut;
    void main() {
      vL = position;
      vShut = iShut;
      vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
      vW = w.xyz;
      vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: /* glsl */`
    precision highp float;
    ${NOISE_GLSL}
    ${PAL_GLSL}
    uniform float uTime, uPupil, uIris, uFlare;
    uniform vec2 uFog;
    uniform vec3 uKeyDir;
    varying vec3 vL, vN, vW;
    varying float vShut;
    void main() {
      vec3 L = normalize(vL);
      float a = acos(clamp(L.z, -1.0, 1.0));
      float az = atan(L.y, L.x);
      float aw = fwidth(a) + 1e-4;
      float iris = 1.0 - smoothstep(uIris - aw, uIris + aw, a);
      float pupil = 1.0 - smoothstep(uPupil - aw, uPupil + aw, a);
      float r = clamp((a - uPupil) / max(uIris - uPupil, 1e-3), 0.0, 1.0);
      float fib = snoise(vec3(az * 3.0, r * 4.0, uTime * 0.15)) * 0.5 + 0.5;
      float rings = 0.5 + 0.5 * sin(r * 22.0 - uTime * 1.3);
      vec3 ic = mix(uColGlow, uColAccent, smoothstep(0.05, 0.9, r));
      ic *= 0.6 + 0.4 * fib + 0.2 * rings;
      ic *= 0.75 + uFlare;
      float limbal = smoothstep(0.72, 1.0, r) * iris;
      ic = mix(ic, uColShadow * 0.5, limbal * 0.85);
      float wrap = smoothstep(0.2, 1.3, a);
      vec3 sclera = mix(uColMid, uColGlow, 0.62) * (1.0 - 0.55 * wrap) * (0.85 - 0.25 * L.y);
      vec3 c = mix(sclera, ic, iris);
      c = mix(c, uColBg * 0.25, pupil);
      vec3 N = normalize(vN);
      vec3 V = normalize(cameraPosition - vW);
      float spec = pow(clamp(dot(reflect(-uKeyDir, N), V), 0.0, 1.0), 90.0);
      c += uColGlow * spec * 0.9;
      c *= 1.0 - 0.92 * smoothstep(0.35, 0.9, vShut);
      float fog = smoothstep(uFog.x, uFog.y, length(vW - cameraPosition));
      gl_FragColor = vec4(grade(mix(c, uColBg, fog)), 1.0);
    }`,
});

// ------------------------------------------------------------ arrangements
// Four places for the crowd, in slider order. Each gives every head a
// position, a facing and a scale, plus the camera, the cuts and the fog
// that go with it. The slider sits on one arrangement for a stretch
// around its mark and morphs between neighbours in the stretch between,
// always as a pure function of where the slider is: no spring, no clock.
const ARR = [
  // choir: four risers of five, staggered, cheeks touching
  { cam: [0, 0.9, 11], look: [0, -0.2, -1.6], trim: [-2.5, -1.2], fog: [40, 90] },
  // ball: one mask on each face of an icosahedron
  { cam: [0, 0, 12.5], look: [0, 0, 0], trim: [-1.3, -0.35], fog: [40, 90] },
  // totem: a helix of busts round a column
  { cam: [0, 0.2, 14], look: [0, 0, 0], trim: [-1.45, -1.2], fog: [40, 90] },
  // hall: two walls of heads flowing past the camera
  { cam: [0, 0.15, 9], look: [0, -0.1, -10], trim: [-2.5, -1.2], fog: [9, 24] },
];
const ICO = (() => {
  const t = (1 + Math.sqrt(5)) / 2;
  const v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
  const f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2],
    [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11],
    [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  return f.map(([a, b, c]) => new THREE.Vector3(v[a][0] + v[b][0] + v[c][0], v[a][1] + v[b][1] + v[c][1],
    v[a][2] + v[b][2] + v[c][2]).normalize());
})();
const HALL_L = 21, HALL_NEAR = 7.5; // hall loop length, and where a head leaves it
const UP = new THREE.Vector3(0, 1, 0), AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0);
const _bx = new THREE.Vector3(), _by = new THREE.Vector3(), _bz = new THREE.Vector3(), _bm = new THREE.Matrix4();
function facing(q, fwd, up) {
  _bz.copy(fwd).normalize();
  _bx.crossVectors(up, _bz);
  if (_bx.lengthSq() < 1e-6) _bx.set(1, 0, 0);
  _bx.normalize();
  _by.crossVectors(_bz, _bx);
  q.setFromRotationMatrix(_bm.makeBasis(_bx, _by, _bz));
}
const _sq = new THREE.Quaternion(), _fv = new THREE.Vector3(), _uv = new THREE.Vector3(), _pe = new THREE.Euler();
// head i in arrangement k; spin turns the ball and the totem, flow runs
// the hall
function place(k, i, spin, flow, out) {
  if (k === 0) {
    const r = Math.floor(i / 5), c = i % 5;
    out.p.set((c - 2) * 1.34 + (r % 2 ? 0.67 : 0) - 0.33, r * 1.02 - 1.55, -r * 1.1);
    facing(out.q, _fv.set(0, 0, 1), UP);
    out.s = 1;
  } else if (k === 1) {
    _sq.setFromEuler(_pe.set(0.25 * Math.sin(spin * 0.6), spin, 0, 'YXZ'));
    const n = ICO[i];
    facing(out.q, n, Math.abs(n.y) > 0.93 ? _uv.set(0, 0, -1) : UP);
    out.q.premultiply(_sq);
    out.p.copy(n).multiplyScalar(2.05).applyQuaternion(_sq);
    out.s = 1;
  } else if (k === 2) {
    const a = i * (Math.PI * 2 / 5) + (Math.floor(i / 5) % 2) * (Math.PI / 5) + spin * 1.5;
    out.p.set(Math.sin(a) * 1.25, i * 0.46 - 4.4, Math.cos(a) * 1.25);
    facing(out.q, _fv.set(Math.sin(a), 0, Math.cos(a)), UP);
    out.s = 0.92;
  } else {
    const side = i % 2 ? 1 : -1, j = Math.floor(i / 2);
    let z = -j * 2.1 + 2 + flow;
    z = HALL_NEAR - (((HALL_NEAR - z) % HALL_L) + HALL_L) % HALL_L;
    out.p.set(side * 2.1, -0.15 + (j % 2) * 0.3, z);
    facing(out.q, _fv.set(-side, 0, 0.25), UP);
    // heads grow out of the fog at the far end and shrink away beside
    // the camera, so the loop never shows its seam
    out.s = Math.min(1, Math.max(0, (HALL_NEAR - z) / 1.5)) * Math.min(1, Math.max(0, (z + HALL_L - HALL_NEAR) / 3));
  }
}

// ------------------------------------------------------------------ crowns
// Growth: visage's fiddlehead fronds and mushrooms, a small crown on each
// head. Each frond is a log spiral in its own plane, so it coils and
// uncoils without changing length. Crowns are laid out each frame in
// head space, carried into the world by that head's own matrix, and
// written into one float texture (a row per frond: texel 0 holds the
// curl-plane normal, then FR_S samples of position and radius) that one
// instanced tube draws. The fronds breathe on their own clocks; the
// music only lights their tips.
// vjw: the frond texture (and the constants that size it) moved above the factory
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Given the total turn Phi and the tip radius ratio rho, the spiral
// constant and start radius follow, and arc length stays exactly L.
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
// the point at arc length s, head space
function frondAt(f, s, out) {
  const rt = f.rt;
  const e = Math.max(1 - s / rt.kk, 1e-4);
  const phi = -Math.log(e) / rt.c;
  const r = rt.R0 * e;
  const lx = rt.ccx + r * Math.cos(phi + rt.phi0);
  const ly = rt.ccy + r * Math.sin(phi + rt.phi0);
  const sl = s / f.L;
  const lz = f.rise * s * sl + rt.sway * Math.sin(rt.swk * s - rt.swp) * sl * Math.sqrt(sl);
  return out.set(
    f.P.x + f.X.x * lx + f.Y.x * ly + f.Z.x * lz,
    f.P.y + f.X.y * lx + f.Y.y * ly + f.Z.y * lz,
    f.P.z + f.X.z * lx + f.Y.z * ly + f.Z.z * lz);
}
// Root sites on the crown, found once by casting at the resting head:
// the top and upper back of the skull, never the face, and in front of
// the ball's mask cut so no root floats off a flattened back.
const GOLD = 2.399963;
function rootSites(g) {
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(), o = new THREE.Vector3(), d = new THREE.Vector3(), c = new THREE.Vector3(0, 0.05, -0.2);
  const out = [];
  const NC = 140;
  for (let i = 0; i < NC; i++) {
    const y = 1 - (i + 0.5) / NC * 2, r = Math.sqrt(1 - y * y), a = i * GOLD;
    d.set(Math.cos(a) * r, y, Math.sin(a) * r);
    if (d.y < 0.2 || (d.z > 0.3 && d.y < 0.6)) continue;
    o.copy(c).addScaledVector(d, 3);
    ray.set(o, d.clone().negate());
    const hit = ray.intersectObject(mesh, false)[0];
    if (!hit || hit.point.z < -0.3) continue;
    const n = hit.face.normal.clone();
    if (n.dot(d) < 0) n.negate();
    out.push({ P: hit.point.clone().addScaledVector(n, -0.02), n });
  }
  return out;
}
function crownFor(i, sites) {
  const rng = mulberry32(i * 7919 + 101);
  const R = (a, b) => a + (b - a) * rng();
  const up = new THREE.Vector3(0, 1, 0);
  const order = sites.map((_, k) => k);
  for (let k = order.length - 1; k > 0; k--) { const j = Math.floor(rng() * (k + 1)); [order[k], order[j]] = [order[j], order[k]]; }
  const fr = [], mu = [];
  if (!sites.length) return { fr, mu };
  const rt = () => ({ R0: 1, c: 1, phi0: 0, ccx: 0, ccy: 0, kk: 1, lvis: 0, sway: 0, swk: 0, swp: 0 });
  for (let m = 0; m < FR_MAIN; m++) {
    const site = sites[order[m % order.length]];
    const X = site.n.clone().multiplyScalar(0.85).addScaledVector(up, 0.45)
      .add(new THREE.Vector3(R(-0.3, 0.3), R(-0.1, 0.3), R(-0.3, 0.3))).normalize();
    const H = new THREE.Vector3(R(-1, 1), R(-1, 1), R(-1, 1)).normalize();
    const Y = new THREE.Vector3().crossVectors(X, H).normalize();
    const Z = new THREE.Vector3().crossVectors(X, Y).normalize();
    fr.push({ lvl: 0, parent: -1, P: site.P.clone(), X, Y, Z, L: R(0.95, 1.85), r0: R(0.024, 0.04),
      turns: R(7, 12), rho: R(0.07, 0.12), rise: R(-0.35, 0.35), phase: R(0, 6.283), rate: R(0.25, 0.6),
      delay: R(0, 0.7), rt: rt(), g: 0 });
  }
  for (let pi = 0; pi < FR_MAIN; pi++) {
    const par = fr[pi];
    for (let k = 0; k < FR_KIDS; k++) {
      const u = 0.3 + (k + R(0, 0.7)) / FR_KIDS * 0.5;
      fr.push({ lvl: 1, parent: pi, u, side: k % 2 ? 1 : -1, rank: k,
        P: new THREE.Vector3(), X: new THREE.Vector3(), Y: new THREE.Vector3(), Z: new THREE.Vector3(),
        L: par.L * R(0.3, 0.45) * (1.1 - u * 0.5), r0: par.r0 * R(0.55, 0.7) * (1 - u * 0.5),
        turns: R(6, 12), rho: R(0.1, 0.2), rise: R(-0.3, 0.3), phase: R(0, 6.283), rate: R(0.35, 0.9),
        beta: R(0.7, 1.1), tilt: R(-0.6, 0.6), hand: rng() < 0.5 ? 1 : -1, rt: rt(), g: 0 });
    }
  }
  // three caps ride fronds, two sprout from the scalp
  for (let k = 0; k < 3; k++) {
    mu.push({ host: k * 2, u: R(0.3, 0.7), size: R(0.12, 0.24), spin: R(0, 6.283), hue: rng(), lean: R(-0.4, 0.4), phase: R(0, 6.283), at: 0.3 + k * 0.2 });
  }
  for (let k = 0; k < 2; k++) {
    const site = sites[order[(FR_MAIN + k * 3) % order.length]];
    mu.push({ host: -1, P: site.P, n: site.n, size: R(0.14, 0.3), spin: R(0, 6.283), hue: rng(), lean: 0, phase: R(0, 6.283), at: 0.15 + k * 0.4 });
  }
  return { fr, mu };
}
const _fa = new THREE.Vector3(), _fb = new THREE.Vector3(), _ft = new THREE.Vector3(), _fn = new THREE.Vector3();
const _fz = new THREE.Vector3(), _fw = new THREE.Vector3(), _nm = new THREE.Matrix3();
const _mm = new THREE.Matrix4(), _mq = new THREE.Quaternion(), _ms = new THREE.Vector3(), _md = new THREE.Vector3();
const _mq2 = new THREE.Quaternion();
// One head's crown for this frame, written from row0 on; M carries head
// space into the world, sc is the head's scale.
function layCrown(crown, t, growth, M, sc, row0, mu0) {
  _nm.getNormalMatrix(M);
  const kidGate = smooth(0.3, 0.7, growth);
  for (let j = 0; j < crown.fr.length; j++) {
    const f = crown.fr[j];
    if (f.lvl === 0) {
      f.g = Math.max(0, Math.min(1, (growth - f.delay * 0.55) / 0.45));
    } else {
      const par = crown.fr[f.parent];
      const reach = par.g * par.L - f.u * par.L;
      f.g = Math.max(0, Math.min(1, reach / (f.L * 1.3))) * kidGate;
      // hang the child off the parent at arc length u*L
      const sa = f.u * par.L;
      frondAt(par, sa, _fa);
      frondAt(par, sa + 0.01, _fb);
      _ft.subVectors(_fb, _fa).normalize();
      _fn.crossVectors(par.Z, _ft).normalize();
      f.P.copy(_fa);
      f.X.copy(_ft).multiplyScalar(Math.cos(f.beta)).addScaledVector(_fn, -f.side * Math.sin(f.beta)).normalize();
      _fz.crossVectors(f.X, par.Z);
      f.Z.copy(par.Z).multiplyScalar(Math.cos(f.tilt)).addScaledVector(_fz, Math.sin(f.tilt)).normalize();
      f.Y.crossVectors(f.Z, f.X).multiplyScalar(f.hand);
    }
    const breathe = 0.16 * Math.sin(t * f.rate + f.phase);
    frondShape(f, f.turns * Math.max(0.08, 0.57 + breathe));
    const lv = f.rt.lvis = f.L * f.g;
    f.rt.sway = f.lvl ? 0.05 : 0.08;
    f.rt.swk = 5.5 / f.L;
    f.rt.swp = t * (1.4 + f.rate) + f.phase;
    const row = (row0 + j) * (FR_S + 1) * 4;
    _fw.copy(f.Z).applyMatrix3(_nm).normalize();
    frData[row] = _fw.x; frData[row + 1] = _fw.y; frData[row + 2] = _fw.z;
    frData[row + 3] = f.lvl ? f.u : 0;
    for (let k = 0; k < FR_S; k++) {
      const sk = (k / (FR_S - 1)) * lv;
      frondAt(f, sk, _fa).applyMatrix4(M);
      const o = row + (k + 1) * 4;
      frData[o] = _fa.x; frData[o + 1] = _fa.y; frData[o + 2] = _fa.z;
      const taper = f.r0 * (1 - 0.6 * sk / f.L);
      const tip = Math.sqrt(Math.max(0, Math.min(1, (lv - sk) / (f.r0 * 2.5))));
      frData[o + 3] = lv > 1e-4 ? taper * tip * sc : 0;
    }
  }
  for (let k = 0; k < crown.mu.length; k++) {
    const m = crown.mu[k];
    let grow;
    if (m.host >= 0) {
      const f = crown.fr[m.host];
      const sa = m.u * f.L;
      grow = Math.max(0, Math.min(1, (f.g * f.L - sa) / (f.L * 0.25)));
      frondAt(f, sa, _fa);
      frondAt(f, sa + 0.01, _fb);
      _ft.subVectors(_fb, _fa).normalize();
      _fn.crossVectors(f.Z, _ft).normalize();
      _md.copy(_fn).negate().addScaledVector(f.Z, m.lean).addScaledVector(_ft, 0.35).normalize();
      _fa.addScaledVector(_md, f.r0 * 0.5);
    } else {
      grow = smooth(m.at, m.at + 0.25, growth);
      _fa.copy(m.P);
      _md.copy(m.n).addScaledVector(UP, 0.6).normalize();
    }
    grow *= smooth(m.at, m.at + 0.2, growth);
    const size = Math.max(1e-4, MU_SCALE * m.size * grow * (1 + 0.05 * Math.sin(t * 1.7 + m.phase)));
    _mq.setFromUnitVectors(UP, _md).multiply(_mq2.setFromAxisAngle(UP, m.spin));
    _mm.compose(_fa, _mq, _ms.setScalar(size)).premultiply(M);
    muMesh.setMatrixAt(mu0 + k, _mm);
    muHue.setXY(mu0 + k, m.hue, m.phase / 6.283);
  }
}
const frUniforms = {
  uFr: { value: frTex },
  uGlow: uniforms.uGlow,
  uFog: uniforms.uFog,
  uKeyDir: uniforms.uKeyDir,
  uFillDir: uniforms.uFillDir,
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
  const idx = [];
  for (let j = 0; j < FR_S; j++) {
    for (let k = 0; k <= FR_RING; k++) {
      const v = j * (FR_RING + 1) + k;
      ring[v * 2] = j;
      ring[v * 2 + 1] = (k / FR_RING) * Math.PI * 2;
      if (j < FR_S - 1 && k < FR_RING) {
        const c = v + FR_RING + 1;
        idx.push(v, c, v + 1, v + 1, c, c + 1);
      }
    }
  }
  frGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FR_S * (FR_RING + 1) * 3), 3));
  frGeo.setAttribute('aRing', new THREE.BufferAttribute(ring, 2));
  frGeo.setIndex(idx);
  const rows = new Float32Array(FR_ROWS);
  for (let i = 0; i < FR_ROWS; i++) rows[i] = i;
  frGeo.setAttribute('iRow', new THREE.InstancedBufferAttribute(rows, 1));
  frGeo.instanceCount = FR_ROWS;
}
const frMat = new THREE.ShaderMaterial({
  uniforms: frUniforms,
  vertexShader: /* glsl */`
    precision highp float;
    precision highp sampler2D;
    uniform sampler2D uFr;
    attribute vec2 aRing;
    attribute float iRow;
    varying vec3 vN, vW;
    varying float vU;
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
      vW = p;
      vN = nrm;
      vU = float(j) / ${(FR_S - 1).toFixed(1)};
      gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
    }`,
  fragmentShader: /* glsl */`
    precision highp float;
    ${PAL_GLSL}
    uniform float uGlow;
    uniform vec2 uFog;
    uniform vec3 uKeyDir, uFillDir;
    varying vec3 vN, vW;
    varying float vU;
    void main() {
      vec3 N = normalize(vN);
      vec3 V = normalize(cameraPosition - vW);
      if (dot(N, V) < 0.0) N = -N;
      float key = clamp((dot(N, uKeyDir) + 0.3) / 1.3, 0.0, 1.0);
      float fill = clamp(dot(N, uFillDir), 0.0, 1.0);
      float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.5);
      vec3 body = mix(mix(uColShadow, uColMid, 0.6), uColAccent, smoothstep(0.25, 1.0, vU));
      float spec = pow(clamp(dot(reflect(-uKeyDir, N), V), 0.0, 1.0), 24.0);
      vec3 c = body * (0.22 + 0.95 * key);
      c += uColAccent * fill * 0.2;
      c += uColGlow * spec * 0.3;
      c += mix(uColAccent, uColGlow, 0.5) * fres * 0.25;
      c *= 1.0 - smoothstep(0.75, 1.0, sin(vU * 60.0) * 0.5 + 0.5) * 0.25;
      c += uColGlow * smoothstep(0.85, 1.0, vU) * (0.15 + uGlow * 0.5);
      float fog = smoothstep(uFog.x, uFog.y, length(vW - cameraPosition));
      gl_FragColor = vec4(grade(mix(c, uColBg, fog)), 1.0);
    }`,
});
const frMesh = new THREE.Mesh(frGeo, frMat);
frMesh.frustumCulled = false;
frMesh.visible = false;
scene.add(frMesh);

const muGeo = (() => {
  const pts = [
    [0.001, 0.0], [0.075, 0.0], [0.07, 0.12], [0.06, 0.3], [0.056, 0.46], [0.066, 0.56],
    [0.16, 0.585], [0.27, 0.6], [0.31, 0.625], [0.3, 0.68], [0.26, 0.76], [0.18, 0.83],
    [0.09, 0.865], [0.001, 0.875],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, 18);
  g.computeVertexNormals();
  return g;
})();
const muHue = new THREE.InstancedBufferAttribute(new Float32Array(MU_MAX * 2), 2);
muHue.setUsage(THREE.DynamicDrawUsage);
muGeo.setAttribute('iHue', muHue);
const muMat = new THREE.ShaderMaterial({
  uniforms: {
    uGlow: uniforms.uGlow, uFog: uniforms.uFog, uKeyDir: uniforms.uKeyDir, uContrast: uniforms.uContrast,
    uColBg: { value: PAL.bg }, uColShadow: { value: PAL.shadow }, uColMid: { value: PAL.mid },
    uColAccent: { value: PAL.accent }, uColGlow: { value: PAL.glow },
  },
  vertexShader: /* glsl */`
    attribute vec2 iHue;
    varying vec3 vN, vW, vL;
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
    uniform float uGlow;
    uniform vec2 uFog;
    uniform vec3 uKeyDir;
    varying vec3 vN, vW, vL;
    varying vec2 vHue;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main() {
      vec3 N = normalize(vN);
      vec3 V = normalize(cameraPosition - vW);
      if (dot(N, V) < 0.0) N = -N;
      float key = clamp((dot(N, uKeyDir) + 0.3) / 1.3, 0.0, 1.0);
      float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.5);
      float r = length(vL.xz);
      vec3 c;
      if (vL.y < 0.575) {
        c = mix(uColShadow, mix(uColMid, uColGlow, 0.45), key * 0.8 + 0.1);
      } else if (vL.y < 0.63 && r < 0.3) {
        float lam = 0.5 + 0.5 * cos(atan(vL.z, vL.x) * 26.0);
        c = mix(uColAccent, uColGlow, lam) * (0.35 + uGlow * 0.5);
      } else {
        c = mix(uColShadow * 0.8, mix(uColMid, uColAccent, vHue.x), key);
        vec2 g = vec2(atan(vL.z, vL.x) * 2.2, vL.y * 18.0);
        vec2 f = fract(g) - 0.5;
        float h = hash(floor(g) + vHue.y * 17.0);
        float spot = (1.0 - smoothstep(0.18, 0.26, length(f))) * step(0.55, h) * step(0.66, vL.y);
        c = mix(c, uColGlow * 0.8, spot * 0.85);
      }
      c += mix(uColAccent, uColGlow, 0.5) * fres * 0.6;
      float fog = smoothstep(uFog.x, uFog.y, length(vW - cameraPosition));
      gl_FragColor = vec4(grade(mix(c, uColBg, fog)), 1.0);
    }`,
});
const muMesh = new THREE.InstancedMesh(muGeo, muMat, MU_MAX);
muMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
muMesh.frustumCulled = false;
muMesh.visible = false;
scene.add(muMesh);

// ------------------------------------------------------------------- motes
// Depth: a deep field of motes round the whole stage, drifting upward like
// spores. Far motes shrink and sink into the fog; near ones fade out
// before they can swell into a blot over a face. Inside the hall they
// stream past with the heads.
const MOTES = 2600;
const MOTE_Z0 = -36, MOTE_ZS = 52;
const moteGeo = new THREE.BufferGeometry();
{
  const rng = mulberry32(4242);
  const pos = new Float32Array(MOTES * 3), aux = new Float32Array(MOTES * 2);
  for (let i = 0; i < MOTES; i++) {
    pos.set([(rng() * 2 - 1) * 18, (rng() * 2 - 1) * 11, MOTE_Z0 + rng() * MOTE_ZS], i * 3);
    aux.set([rng(), rng()], i * 2);
  }
  moteGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  moteGeo.setAttribute('aAux', new THREE.BufferAttribute(aux, 2));
}
const moteUniforms = {
  uTime: uniforms.uTime,
  uRise: { value: 0 },
  uStream: { value: 0 },
  uTwinkle: { value: 0 },
  uFog: uniforms.uFog,
  uColAccent: { value: PAL.accent },
  uColGlow: { value: PAL.glow },
  uColMid: { value: PAL.mid },
};
const motes = new THREE.Points(moteGeo, new THREE.ShaderMaterial({
  uniforms: moteUniforms,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexShader: /* glsl */`
    uniform float uTime, uRise, uStream, uTwinkle;
    uniform vec2 uFog;
    uniform vec3 uColAccent, uColGlow, uColMid;
    attribute vec2 aAux;
    varying vec3 vC;
    varying float vA;
    void main() {
      vec3 p = position;
      p.y = mod(p.y + uRise * (0.4 + aAux.x) + 11.0, 22.0) - 11.0;
      p.z = mod(p.z - ${MOTE_Z0.toFixed(1)} + uStream, ${MOTE_ZS.toFixed(1)}) + ${MOTE_Z0.toFixed(1)};
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      float d = -mv.z;
      float tw = 0.55 + 0.45 * sin(uTime * (1.0 + aAux.y * 3.0) + aAux.x * 40.0);
      vA = (0.3 + 0.7 * tw) * (0.5 + uTwinkle * 0.5)
        * smoothstep(1.5, 4.0, d) * (1.0 - smoothstep(uFog.x * 0.8, uFog.y, d)) * (1.0 - 0.55 * smoothstep(8.0, 40.0, d));
      vC = aAux.y < 0.5 ? uColGlow : (aAux.y < 0.8 ? uColAccent : uColMid);
      gl_PointSize = min(7.0, (1.2 + aAux.x * 2.4) * (190.0 / max(0.5, d)));
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
motes.frustumCulled = false;
scene.add(motes);

// ------------------------------------------------------------- the crowd
const EYE_R = 0.14, EYE_BACK = 0.008, EYE_TUCK = 0.02, BLINK_OVER = 1.3;
const PIVOT = new THREE.Vector3(0, -0.3, 0.05); // heads turn about the middle of the skull
let heads = null, eyeMesh = null, iFace = null, iShut = null, hd = null;
const faces = [];
function rnd(i, k) { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); }
function build(d) {
  hd = d.header;
  const g = fullHead(d);
  iFace = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4);
  iFace.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('iFace', iFace);
  heads = new THREE.InstancedMesh(g, skinMat, N);
  heads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  heads.frustumCulled = false;
  scene.add(heads);
  const eg = new THREE.InstancedBufferGeometry().copy(new THREE.SphereGeometry(EYE_R, 28, 20));
  iShut = new THREE.InstancedBufferAttribute(new Float32Array(N * 2), 1);
  iShut.setUsage(THREE.DynamicDrawUsage);
  eg.setAttribute('iShut', iShut);
  eyeMesh = new THREE.InstancedMesh(eg, eyeMat, N * 2);
  eyeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  eyeMesh.frustumCulled = false;
  scene.add(eyeMesh);
  const sites = rootSites(g);
  for (let i = 0; i < N; i++) {
    faces.push({
      fx: rnd(i, 1) * 2 - 1, fs: rnd(i, 2) * 2 - 1, seed: rnd(i, 3),
      lag: 0.12 + rnd(i, 4) * 0.35, yaw: 0, pitch: 0,
      nextBlink: 0.5 + rnd(i, 5) * 4, blinkT0: -9,
      crown: crownFor(i, sites),
    });
  }
  frMesh.visible = muMesh.visible = true;
}

// ------------------------------------------------------------------ state
let spin = 0, flow = 0, hallFlow = 0, drift = 0;
let enS = 0, highsS = 0;
let yawDrag = 0, pitchDrag = 0, yawVel = 0, pitchVel = 0, lastNdc = null;
let nextLook = 0, qaTarget = null, qaBlink = -1, homeK = 0;
const target = new THREE.Vector3(0, 0, 8), targetT = new THREE.Vector3(0, 0, 8);
const lookOff = new THREE.Vector2();
const A = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1 };
const B = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1 };
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _qy = new THREE.Quaternion();
const _qp = new THREE.Quaternion(), _qg = new THREE.Quaternion(), _v = new THREE.Vector3(), _e = new THREE.Vector3();
const _s = new THREE.Vector3(), _m = new THREE.Matrix4(), _em = new THREE.Matrix4(), _pv = new THREE.Matrix4();
const _cp = new THREE.Vector3(), _cl = new THREE.Vector3(), _c2 = new THREE.Vector3(), _l2 = new THREE.Vector3();
const _fwd = new THREE.Vector3(), _rt = new THREE.Vector3(), _up = new THREE.Vector3();
const _eul = new THREE.Euler(), _hf = new THREE.Vector3(), _et = new THREE.Vector3();
_pv.makeTranslation(-PIVOT.x, -PIVOT.y, -PIVOT.z);

return { // vjw: was `export default {`
  name: 'chorus',
  scene,
  camera,
  // lit skin covers much of the frame, as in visage: the engine's per-kick
  // bloom surge would strobe it
  bloom: { strength: 0.3, gain: 0.35, kick: 0.04 },
  pixelBudget: 4.0,
  edgeAA: true,
  // shape reads "formation": choir, ball, totem, hall along the slider.
  // morph reads "variety": twenty copies of one face at 0, twenty
  // strangers at 1. complexity reads "detail" (the carving), fill "zoom",
  // density "growth" (bare skulls to a crown of fronds and mushrooms).
  paramLabels: { '*': { shape: 'formation', morph: 'variety', complexity: 'detail', fill: 'zoom', density: 'growth' } },
  paramOrder: ['speed', 'shape', 'fill', 'density', 'morph', 'complexity', 'contrast'],
  params: { speed: 0.5, shape: 0, fill: 0.5, density: 0.5, morph: 0.7, complexity: 0.4, contrast: 0.5 },
  update(s, dt, t) {
    ensureHead();
    if (!heads && icData) build(icData);
    if (!heads) return;
    const P = this.params;
    const spd = drastic(P.speed);
    scene.background = PAL.bg;

    // light only: the carving and the eyes follow the music, the crowd
    // does not
    enS += (s.energy - enS) * (1 - Math.exp(-dt * 2.0));
    highsS += (s.highs - highsS) * (1 - Math.exp(-dt * 6.0));
    drift += dt * 0.12 * spd;
    uniforms.uTime.value = t;
    uniforms.uFlow.value = drift;
    uniforms.uBands.value = 22 + 50 * P.complexity;
    uniforms.uGlow.value = 0.15 + enS * 0.75;
    uniforms.uKick.value = s.kick * 0.1;
    uniforms.uContrast.value = P.contrast;
    eyeUniforms.uPupil.value = 0.14 + 0.07 * (1 - enS);
    eyeUniforms.uFlare.value = 0.25 + highsS * 0.9;

    // ---- where the slider sits: arrangement k0, morphing into k1 by a
    const f = Math.min(1, Math.max(0, P.shape)) * (ARR.length - 1);
    const k0 = Math.min(ARR.length - 2, Math.floor(f));
    const a = smooth(0.2, 0.8, f - k0);
    const k1 = k0 + 1;
    const wHall = k1 === 3 ? a : 0;
    // the ball and the totem turn slowly on their own; the hall flows
    // past the camera, and stands still while it is only part-formed so
    // no head loops round in plain view
    spin += dt * 0.12 * spd;
    if (wHall > 0.999) hallFlow += dt * 1.1 * spd;

    // ---- the camera: the arrangement's own, pulled in or out by zoom
    const zoom = 1 / (0.55 + P.fill * 0.9);
    const ca = ARR[k0], cb = ARR[k1];
    _cp.fromArray(ca.cam); _cl.fromArray(ca.look);
    _c2.fromArray(cb.cam); _l2.fromArray(cb.look);
    _cp.sub(_cl).multiplyScalar(zoom).add(_cl);
    _c2.sub(_l2).multiplyScalar(zoom).add(_l2);
    camera.position.lerpVectors(_cp, _c2, a);
    _cl.lerp(_l2, a);
    camera.lookAt(_cl);
    uniforms.uTrim.value.set(ca.trim[0] + (cb.trim[0] - ca.trim[0]) * a, ca.trim[1] + (cb.trim[1] - ca.trim[1]) * a);
    uniforms.uFog.value.set(ca.fog[0] + (cb.fog[0] - ca.fog[0]) * a, ca.fog[1] + (cb.fog[1] - ca.fog[1]) * a);

    // ---- drag turns the crowd, with a throw; a pose drifts home
    const ptr = scenePointer;
    const alive = ptr.ndc && performance.now() - ptr.lastMove < 4000;
    if (ptr.held && ptr.ndc) {
      if (lastNdc) {
        const dx = ptr.ndc.x - lastNdc.x, dy = ptr.ndc.y - lastNdc.y;
        const iv = 1 / Math.max(dt, 1e-3);
        yawDrag += dx * 2.6;
        pitchDrag -= dy * 1.6;
        yawVel += (dx * 2.6 * iv - yawVel) * (1 - Math.exp(-dt * 18));
        pitchVel += (-dy * 1.6 * iv - pitchVel) * (1 - Math.exp(-dt * 18));
      }
      lastNdc = { x: ptr.ndc.x, y: ptr.ndc.y };
    } else {
      lastNdc = null;
      yawDrag += yawVel * dt;
      pitchDrag += pitchVel * dt;
      yawVel *= Math.exp(-dt * 1.4);
      pitchVel *= Math.exp(-dt * 1.4);
      yawDrag *= Math.exp(-dt / 14);
      pitchDrag *= Math.exp(-dt / 14);
    }
    pitchDrag = Math.max(-1.1, Math.min(1.1, pitchDrag));
    // Shift+Space lets go of the mouse: every head and every eye comes
    // back to the front, and a turned crowd swings home
    homeK += ((ptr.detached ? 1 : 0) - homeK) * (1 - Math.exp(-dt / 0.35));
    if (ptr.detached) {
      const k = Math.exp(-dt / 0.45);
      yawDrag *= k; pitchDrag *= k; yawVel *= k; pitchVel *= k;
    }
    // inside the hall the camera stands among the heads, so a drag there
    // would swing the walls through it
    const turn = 1 - wHall;
    _qg.setFromEuler(_eul.set(pitchDrag * turn, yawDrag * turn, 0, 'YXZ'));

    // ---- the shared gaze: somewhere around the viewer, moving in
    // saccades; a moving cursor takes it over
    camera.getWorldDirection(_fwd);
    _rt.crossVectors(_fwd, UP).normalize();
    _up.crossVectors(_rt, _fwd);
    if (t > nextLook) {
      nextLook = t + 0.9 + Math.random() * 2.4;
      lookOff.set(Math.random() * 2 - 1, Math.random() * 2 - 1);
    }
    const reach = 1 - 0.8 * wHall;
    const dist = camera.position.distanceTo(_cl);
    targetT.copy(camera.position).addScaledVector(_fwd, dist * 0.3)
      .addScaledVector(_rt, lookOff.x * 3.5 * reach).addScaledVector(_up, lookOff.y * 1.8 * reach);
    if (alive && !ptr.held) {
      _v.set(ptr.ndc.x, ptr.ndc.y, 0.5).unproject(camera).sub(camera.position).normalize();
      targetT.copy(camera.position).addScaledVector(_v, dist * 0.35);
    }
    if (qaTarget) targetT.copy(qaTarget);
    target.lerp(targetT, 1 - Math.exp(-dt * 7));

    // ---- each head: its place (a pure function of the slider), then a
    // turn toward the gaze within its neck's reach, on its own lag
    const vari = P.morph;
    const es = hd.eyeS || [1, 1];
    let ei = 0;
    for (let i = 0; i < N; i++) {
      const h = faces[i];
      place(k0, i, spin, hallFlow, A);
      place(k1, i, spin, hallFlow, B);
      _p.lerpVectors(A.p, B.p, a).applyQuaternion(_qg);
      _q.slerpQuaternions(A.q, B.q, a).premultiply(_qg);
      const sc = A.s + (B.s - A.s) * a;
      // the target in this head's own frame
      _v.copy(target).sub(_p).applyQuaternion(_qi.copy(_q).invert()).normalize();
      const yawT = Math.max(-0.75, Math.min(0.75, Math.atan2(_v.x, _v.z))) * 0.7 * (1 - homeK);
      const pitT = Math.max(-0.45, Math.min(0.45, Math.asin(Math.max(-1, Math.min(1, _v.y))))) * 0.6 * (1 - homeK);
      const k = 1 - Math.exp(-dt / h.lag);
      h.yaw += (yawT - h.yaw) * k;
      h.pitch += (-pitT - h.pitch) * k;
      _q.multiply(_qy.setFromAxisAngle(AY, h.yaw)).multiply(_qp.setFromAxisAngle(AX, h.pitch));
      _m.compose(_p, _q, _s.setScalar(sc)).multiply(_pv);
      heads.setMatrixAt(i, _m);
      layCrown(h.crown, t, P.density, _m, sc, i * FR_PER, i * MU_PER);
      // home: the eyes look straight out of the face
      _hf.set(0, 0, 1).applyQuaternion(_q);
      // blinks on its own clock
      if (t > h.nextBlink) {
        h.blinkT0 = t;
        h.nextBlink = t + (Math.random() < 0.18 ? 0.35 : 2.2 + Math.random() * 4.5);
      }
      const bp = (t - h.blinkT0) / 0.26;
      const blink = qaBlink >= 0 ? qaBlink : (bp >= 0 && bp < 1 ? Math.sin(bp * Math.PI) : 0);
      const kx = h.fx * 0.95 * vari, ks = h.fs * 0.9 * vari;
      iFace.setXYZW(i, kx, ks, blink, h.seed * vari + 0.37 * (1 - vari));
      // the eyes: this face's own eye centre and size, aimed at the gaze
      const eK = 0.93 * (kx >= 0 ? 1 + (es[1] - 1) * kx : 1 + (es[0] - 1) * -kx) * sc;
      for (const sx of [1, -1]) {
        _e.set((hd.eye[0] + hd.eyeDF[0] * kx + hd.eyeDS[0] * ks) * sx,
          hd.eye[1] + hd.eyeDF[1] * kx + hd.eyeDS[1] * ks,
          hd.eye[2] + hd.eyeDF[2] * kx + hd.eyeDS[2] * ks - EYE_BACK - EYE_TUCK * blink).applyMatrix4(_m);
        _et.copy(_e).addScaledVector(_hf, 40).lerp(target, 1 - homeK);
        _em.lookAt(_et, _e, AY).scale(_s.setScalar(eK)).setPosition(_e);
        eyeMesh.setMatrixAt(ei, _em);
        iShut.setX(ei, blink);
        ei++;
      }
    }
    frTex.needsUpdate = true;
    muMesh.instanceMatrix.needsUpdate = true;
    muHue.needsUpdate = true;
    moteUniforms.uRise.value += dt * 0.08 * spd;
    if (wHall > 0.999) moteUniforms.uStream.value += dt * 1.1 * spd;
    moteUniforms.uTwinkle.value = highsS;
    heads.instanceMatrix.needsUpdate = true;
    eyeMesh.instanceMatrix.needsUpdate = true;
    iFace.needsUpdate = true;
    iShut.needsUpdate = true;
  },
  resize(w, h) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  },
  // QA hooks
  _state: () => ({ built: !!heads, loaded: !!icData, spin, hallFlow, homeK }),
  _target(x, y, z) { qaTarget = x === null ? null : new THREE.Vector3(x, y, z); },
  _blink(v = -1) { qaBlink = v; },
  _clay(v) { uniforms.uClay.value = v; },
  // QA: every head's world position and scale (motion strips)
  _heads() {
    const out = [];
    for (let i = 0; i < N; i++) {
      heads.getMatrixAt(i, _m);
      _v.setFromMatrixPosition(_m);
      out.push([_v.x, _v.y, _v.z, _s.setFromMatrixScale(_m).x]);
    }
    return out;
  },
};
} // vjw: the factory
