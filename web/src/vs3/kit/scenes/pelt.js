// Copied from donor/vs3/visual_kit/src/scenes/pelt.js (the friends' engine, used with permission, 2026-11-19).
// vjw: wrapped in a factory (one scene object per layer); nothing else changed. agents/guides/guide_vs3_port.md
// Scene: Pelt — a dense field of fur you can brush with the mouse.
// ~110k instanced ribbon strands rooted on rolling mounds, every strand
// bent by one composed comb field: the base groom (a lay direction plus
// three whorls, analytic), a brush texture the mouse writes into (GPU
// ping-pong that heals back over ~15 s), and wind. The music combs it
// too: mids gust traveling waves through the nap, sub swells the mounds
// underneath, highs light sparks in the tips, an ordinary kick sends a
// ripple front expanding across the field, and an accented kick re-parts
// the whole groom — new whorls, new lay, the patch tints migrating with
// it — eased over ~2 s so the pelt visibly re-combs itself (structure,
// never flash). Inspired by groomed-fur renders: deep blue nap, magenta
// patches riding the crests, tips catching an anisotropic sheen.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { PAL, drastic, scenePointer } from '../lib/common.js';
import { ctx } from '../lib/context.js';
export default function create() { // vjw

const scene = new THREE.Scene();
scene.background = PAL.bg;
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
camera.position.set(0, 5.5, 7.5);

// Field extent (world units, XZ plane). Roots live inside this ellipse;
// the brush texture maps over its bounding rect.
const FIELD_X = 10.0, FIELD_Z = 7.0;
const MAX_STRANDS = 110000;
const SEG = 6;                 // segments per strand ribbon
const CANOPY_Y = 1.0;          // brush ray hits this plane (fur canopy)
const MAX_RIPPLES = 4;
const WHORLS = 3;
const GOLDEN = 2.399963;

// Accent gate for the re-part (the sand re-figure numbers, a gesture
// this big earns the long rest): a strong accent after a rest
// re-grooms; a weak one only qualifies after a long fallback so quiet
// tracks still evolve. A uniform hard kick at the fluid gate's numbers
// re-parted every 4 s in QA, a churn, never a gesture.
const REGROOM_REST = 6, REGROOM_THR = 0.7, REGROOM_FALLBACK = 18;

// ---------------------------------------------------------- strand mesh
// One tapered ribbon strip, instanced. position.x = side (±1),
// position.y = t along the strand (0 root, 1 tip).
const geo = new THREE.InstancedBufferGeometry();
{
  const pos = new Float32Array((SEG + 1) * 2 * 3);
  const idx = [];
  for (let l = 0; l <= SEG; l++) {
    const t = l / SEG;
    pos.set([-1, t, 0, 1, t, 0], l * 6);
    if (l < SEG) {
      const a = l * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);

  // Roots: uniform in the ellipse, hash per strand. Instances land in
  // random order, so instanceCount IS the density gate — any prefix is
  // a uniform subsample.
  const roots = new Float32Array(MAX_STRANDS * 2);
  const hash = new Float32Array(MAX_STRANDS);
  for (let i = 0; i < MAX_STRANDS; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random());
    roots[i * 2] = Math.cos(a) * r * FIELD_X;
    roots[i * 2 + 1] = Math.sin(a) * r * FIELD_Z;
    hash[i] = Math.random();
  }
  geo.setAttribute('iRoot', new THREE.InstancedBufferAttribute(roots, 2));
  geo.setAttribute('iHash', new THREE.InstancedBufferAttribute(hash, 1));
}

const uniforms = {
  uTime: { value: 0 },
  tBrush: { value: null },
  uBrushGain: { value: 1 },
  uFieldR: { value: new THREE.Vector2(FIELD_X, FIELD_Z) },
  // Base groom, two configs crossfaded by uGroomMix (the re-part morph).
  uLayA: { value: new THREE.Vector2(0.42, 0.12) },
  uLayB: { value: new THREE.Vector2(0.42, 0.12) },
  uWhorlA: { value: Array.from({ length: WHORLS }, () => new THREE.Vector4(0, 0, 0, 3)) },
  uWhorlB: { value: Array.from({ length: WHORLS }, () => new THREE.Vector4(0, 0, 0, 3)) },
  uGroomMix: { value: 1 },
  uPatchSeed: { value: new THREE.Vector2(3.7, 1.2) },
  // Wind: turbulent gust patches drifting downwind (scrolling noise,
  // never a plane wave — a plane wave rocks the field in corduroy
  // stripes and reads mechanical). uWindT1/2 are the two octave scroll
  // offsets, uAnimT the speed-slider-scaled flutter clock.
  uGustDir: { value: new THREE.Vector2(1, 0) },
  uWindT1: { value: new THREE.Vector2(0, 0) },
  uWindT2: { value: new THREE.Vector2(37.2, 11.7) },
  uGustAmp: { value: 0.2 },
  uFlutter: { value: 0.03 },
  uAnimT: { value: 0 },
  uRipple: { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -50, 0)) },
  // Look.
  uLen: { value: 1.1 },
  uWidth: { value: 0.022 },
  uCrimpF: { value: 14 },
  uCrimpA: { value: 0.05 },
  uGroundAmp: { value: 1 },
  uSparkle: { value: 0 },
  uLevel: { value: 0.8 },
  uContrast: { value: 0.5 },
  uLight: { value: new THREE.Vector3(0.4, 0.85, 0.5) },
  uBg: { value: PAL.bg },
  uShadow: { value: PAL.shadow },
  uMid: { value: PAL.mid },
  uAccent: { value: PAL.accent },
  uGlow: { value: PAL.glow },
};

const mat = new THREE.ShaderMaterial({
  uniforms,
  vertexShader: /* glsl */`
    attribute vec2 iRoot;
    attribute float iHash;
    uniform float uTime, uBrushGain, uGroomMix, uGustAmp, uFlutter, uAnimT;
    uniform float uLen, uWidth, uCrimpF, uCrimpA, uGroundAmp, uSparkle, uLevel;
    uniform sampler2D tBrush;
    uniform vec2 uFieldR, uLayA, uLayB, uGustDir, uWindT1, uWindT2, uPatchSeed;
    uniform vec4 uWhorlA[${WHORLS}], uWhorlB[${WHORLS}];
    uniform vec4 uRipple[${MAX_RIPPLES}];
    uniform vec3 uLight, uBg, uShadow, uMid, uAccent, uGlow;
    varying vec3 vCol;
    varying float vFog;

    float hash21(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }
    // One octave of value noise + a half octave: the accent patches.
    float vnoise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      float a = mix(mix(hash21(i), hash21(i + vec2(1, 0)), u.x),
                    mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), u.x), u.y);
      return a;
    }

    // Rolling mounds; the rim falls away so the field ends in a rounded
    // silhouette instead of a clipped plane.
    float ground(vec2 q, float er) {
      float h = 0.85 * sin(q.x * 0.42 + 1.3) * cos(q.y * 0.5 - 0.7)
              + 0.45 * sin(q.x * 0.93 - 2.1) * sin(q.y * 0.77 + 0.9);
      return h * uGroundAmp - smoothstep(0.55, 1.0, er) * 2.2;
    }

    vec2 whorlField(vec4 W[${WHORLS}], vec2 q) {
      vec2 v = vec2(0.0);
      for (int i = 0; i < ${WHORLS}; i++) {
        vec2 d = q - W[i].xy;
        float r2 = dot(d, d);
        v += vec2(-d.y, d.x) * inversesqrt(r2 + 0.05)
           * W[i].z * exp(-r2 / (W[i].w * W[i].w));
      }
      return v;
    }

    void main() {
      float t = position.y;
      float side = position.x;
      vec2 q = iRoot;
      vec2 e = q / uFieldR;
      float er = dot(e, e);

      // --- the comb field: groom + brush + gust + kick ripples --------
      vec2 groomA = uLayA + whorlField(uWhorlA, q);
      vec2 groomB = uLayB + whorlField(uWhorlB, q);
      vec2 comb = mix(groomA, groomB, uGroomMix);
      vec2 buv = q / (2.0 * uFieldR) + 0.5;
      comb += texture2D(tBrush, buv).rg * uBrushGain;
      // Wind: two octaves of noise drifting downwind. Squaring the
      // large octave floors the calm stretches and lets occasional
      // swells roll through; the small octave rides inside them. Each
      // patch's direction wobbles off the mean wind so the wave fronts
      // are never parallel.
      float g1 = vnoise(q * 0.085 + uWindT1);
      float g2 = vnoise(q * 0.21 + uWindT2);
      float gustN = g1 * g1 * 0.85 + g2 * g1 * 0.4;
      float ga = (vnoise(q * 0.06 + uWindT1 * 0.6 + vec2(91.3, 17.9)) - 0.5) * 1.2;
      float gc = cos(ga), gs = sin(ga);
      vec2 gd = vec2(uGustDir.x * gc - uGustDir.y * gs,
                     uGustDir.x * gs + uGustDir.y * gc);
      comb += gd * uGustAmp * gustN;
      // Per-strand tip flutter, desynced by hash, livelier inside a
      // gust: the fine shimmer that separates fur from extruded geometry.
      float fl = sin(uAnimT * (1.6 + fract(iHash * 3.31) * 1.5) + iHash * 61.0)
               * (0.25 + 0.75 * gustN) * uFlutter;
      comb += vec2(-gd.y, gd.x) * fl;
      for (int i = 0; i < ${MAX_RIPPLES}; i++) {
        vec2 d = q - uRipple[i].xy;
        float r = length(d);
        float front = exp(-pow((r - uRipple[i].z) * 1.1, 2.0));
        comb += (d / max(r, 0.1)) * front * uRipple[i].w;
      }

      // --- the strand: root-stiff quadratic bend along the comb ------
      float L = uLen * (0.75 + 0.5 * iHash) * (1.0 - 0.4 * smoothstep(0.6, 1.0, er));
      float lean = clamp(length(comb), 0.0, 1.35);
      vec2 bd2 = comb / max(length(comb), 1e-4);
      vec3 bendDir = vec3(bd2.x, 0.0, bd2.y);
      vec3 root = vec3(q.x, ground(q, er), q.y);
      vec3 P1 = root + vec3(0.0, 0.55 * L, 0.0);
      vec3 P2 = root + (vec3(0.0, cos(lean), 0.0) + bendDir * sin(lean)) * L * 0.95;
      vec3 p = mix(mix(root, P1, t), mix(P1, P2, t), t);
      vec3 tangent = normalize(mix(P1 - root, P2 - P1, t) + vec3(0.0, 1e-4, 0.0));

      // Crimp: the wave along each strand that makes fur read combed
      // instead of extruded. Free at the tip, pinned at the root.
      float cr = sin(t * uCrimpF + iHash * 39.7
                   + uAnimT * (0.3 + 0.5 * fract(iHash * 13.1))) * uCrimpA * t * L;
      p.xz += vec2(-bd2.y, bd2.x) * cr;
      p.y += sin(t * uCrimpF * 0.7 + iHash * 71.3) * uCrimpA * 0.35 * t * L;

      float halfW = uWidth * (1.0 - 0.75 * t) * (0.8 + 0.4 * fract(iHash * 7.7));
      vec3 view = normalize(cameraPosition - p);
      vec3 wdir = normalize(cross(tangent, view) + vec3(1e-4));
      p += wdir * halfW * side;

      // --- Kajiya-Kay strand lighting, per vertex ---------------------
      vec3 Ld = normalize(uLight);
      float TdL = dot(tangent, Ld);
      float diff = sqrt(max(0.0, 1.0 - TdL * TdL));
      vec3 H = normalize(Ld + view);
      float TdH = dot(tangent, H);
      float spec = pow(sqrt(max(0.0, 1.0 - TdH * TdH)), 24.0);

      // Depth-in-fur AO: roots live in shadow, tips in light. This is
      // most of why the pelt reads dense.
      float ao = mix(0.2, 1.0, pow(t, 1.15));
      float mottle = vnoise(q * 0.33 + uPatchSeed) * 0.72
                   + vnoise(q * 0.71 - uPatchSeed * 1.31) * 0.28;
      vec3 body = mix(uShadow, uMid, 0.3 + 0.7 * diff);
      body = mix(body, uAccent, smoothstep(0.56, 0.78, mottle) * 0.75);
      vec3 col = body * ao;
      col = mix(col, uGlow, smoothstep(0.78, 1.0, t) * 0.28 * diff);
      col += uGlow * spec * (0.2 + 0.5 * t);
      float spark = uSparkle * step(0.962, fract(iHash * 51.7)) * t * t * t;
      col += uGlow * spark * 2.2;
      col *= uLevel;

      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      vFog = smoothstep(9.0, 17.0, -mv.z);
      vCol = col;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */`
    uniform float uContrast;
    uniform vec3 uBg;
    varying vec3 vCol;
    varying float vFog;
    void main() {
      vec3 col = mix(vCol, uBg, vFog * 0.7);
      vec3 hi = col * col * (3.0 - 2.0 * col);
      vec3 lo = pow(max(col, 0.0), vec3(0.72));
      col = mix(col, hi, max(0.0, uContrast - 0.5) * 1.6);
      col = mix(col, lo, max(0.0, 0.5 - uContrast) * 1.6);
      gl_FragColor = vec4(clamp(col, 0.0, 1.2), 1.0);
    }`,
});
const fur = new THREE.Mesh(geo, mat);
fur.frustumCulled = false;
scene.add(fur);

// ------------------------------------------------------ brush sim (GPU)
// The texture holds only the BRUSH DEVIATION from the groom (the groom
// itself is analytic in the strand shader), so healing is just decay
// toward zero. Diffusion rounds strokes into combed swathes.
const SIM = 192;
const VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`;

function makePass(u, frag) {
  return new FullScreenQuad(new THREE.ShaderMaterial({
    uniforms: u, vertexShader: VERT, fragmentShader: frag,
  }));
}

// rg = the set (what strands read, heals over ~15 s), ba = stroke
// velocity. Splats inject velocity and the set integrates it, so a
// stroke BLOOMS in over ~0.3 s behind the cursor and keeps creeping a
// touch after the mouse passes, combing through pile instead of
// stamping into it. Velocity drains at 7/s, integrates at 3/s: a unit
// of injected velocity leaves ~0.43 in the set.
const decayU = {
  tField: { value: null },
  uTexel: { value: new THREE.Vector2(1 / SIM, 1 / SIM) },
  uDt: { value: 1 / 60 },
};
const decayPass = makePass(decayU, /* glsl */`
  uniform sampler2D tField;
  uniform vec2 uTexel;
  uniform float uDt;
  varying vec2 vUv;
  void main() {
    vec4 s = texture2D(tField, vUv);
    vec4 avg = texture2D(tField, vUv + vec2(uTexel.x, 0.0))
             + texture2D(tField, vUv - vec2(uTexel.x, 0.0))
             + texture2D(tField, vUv + vec2(0.0, uTexel.y))
             + texture2D(tField, vUv - vec2(0.0, uTexel.y));
    vec2 x = mix(s.rg, avg.rg * 0.25, 0.24);
    vec2 v = mix(s.ba, avg.ba * 0.25, 0.15);
    // Headroom-scaled integration: the set saturates SOFTLY toward
    // 1.35 (fully combed) instead of ramming the clamp. Sustained
    // contact deepens a groove asymptotically; the 1.6 clamp below is
    // a safety, never the operating point.
    x += v * uDt * 3.0 * max(0.0, 1.0 - length(x) / 1.35);
    v *= exp(-uDt * 7.0);
    x *= exp(-uDt * 0.09);
    float mx = length(x);
    if (mx > 1.6) x *= 1.6 / mx;
    float mv = length(v);
    if (mv > 4.0) v *= 4.0 / mv;
    if (!(dot(x, x) < 1e9) || !(dot(v, v) < 1e9)) { x = vec2(0.0); v = vec2(0.0); }
    gl_FragColor = vec4(x, v);
  }`);

// The stroke is a CAPSULE from the previous eased cursor point to the
// current one, so any drag speed paints a continuous swathe (per-frame
// point splats read as a dotted line the moment the mouse moves fast).
const splatU = {
  tField: { value: null },
  uFieldR: { value: new THREE.Vector2(FIELD_X, FIELD_Z) },
  uSegA: { value: new THREE.Vector2(0, 0) },
  uSegB: { value: new THREE.Vector2(0, 0) },
  uSegDir: { value: new THREE.Vector2(0, 0) },   // dir · strength
  uSplatR: { value: 1.35 },
  uPress: { value: new THREE.Vector4(0, 0, 0, 1.5) }, // xy pos, z amt, w radius
};
const splatPass = makePass(splatU, /* glsl */`
  uniform sampler2D tField;
  uniform vec2 uFieldR, uSegA, uSegB, uSegDir;
  uniform vec4 uPress;
  uniform float uSplatR;
  varying vec2 vUv;
  void main() {
    vec4 s = texture2D(tField, vUv);
    vec2 v = s.ba;
    vec2 w = (vUv - 0.5) * 2.0 * uFieldR;
    vec2 ab = uSegB - uSegA;
    float h = clamp(dot(w - uSegA, ab) / max(dot(ab, ab), 1e-5), 0.0, 1.0);
    vec2 d = w - (uSegA + ab * h);
    v += uSegDir * exp(-dot(d, d) / (uSplatR * uSplatR));
    vec2 dp = w - uPress.xy;
    float rp = length(dp);
    v += (dp / max(rp, 0.1)) * uPress.z * exp(-rp * rp / (uPress.w * uPress.w));
    float m = length(v);
    if (m > 4.0) v *= 4.0 / m;
    gl_FragColor = vec4(s.rg, v);
  }`);

// All FOUR channels zero: velocity.y lives in alpha, and a 1.0 alpha
// clear boots the whole field with downward stroke velocity (found by
// a frame-0 strip chart: vy 0.70 everywhere before any pointer input).
const zeroPass = makePass({}, /* glsl */`
  void main() { gl_FragColor = vec4(0.0); }`);

let brushA = null, brushB = null;
let simIsFloat = false;

function ensureSim(renderer) {
  if (brushA) return;
  const type = (renderer.capabilities.isWebGL2 &&
    renderer.extensions.get('EXT_color_buffer_float'))
    ? THREE.FloatType : THREE.HalfFloatType;
  simIsFloat = type === THREE.FloatType;
  const mk = () => new THREE.WebGLRenderTarget(SIM, SIM, {
    type,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
  });
  brushA = mk(); brushB = mk();
  run(zeroPass, brushA);
  run(zeroPass, brushB);
}

function run(pass, target) {
  ctx.renderer.setRenderTarget(target);
  pass.render(ctx.renderer);
}

// ---------------------------------------------------------------- state
const mix2 = (a, b, x) => a + (b - a) * x;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

let groomAngle = 0.28;         // live lay direction (A side)
let groomAngleB = 0.28;
let whorlSeed = 0;
let lastRegroom = -10;
let patchTgt = new THREE.Vector2(3.7, 1.2);
let gustAng = 0;
let gustAmpE = 0.2;
let midsE = 0.2;
let energyE = 0.4, subE = 0, sparkle = 0;
let elev = 0.75, orbit = 0;
const ripples = [];            // { x, z, front, gain }
const tilt = { value: 0.75 };
// Eased brush point: the raw ray hit is jittery at mouse-move rate, so
// the stroke follows a smoothed point (tau ~55 ms) and its velocity.
// Silky curves come from here.
const brushPt = new THREE.Vector2();
const brushPrev = new THREE.Vector2();
const brushVel = new THREE.Vector2();
let brushValid = false;
const _v = new THREE.Vector3();
const _wp = new THREE.Vector3();
let rippleAngle = 0;

// A whorl layout: golden-angle placed, alternating chirality, sized so
// two whorls never own the same crest.
function rollWhorls(target, seed) {
  for (let i = 0; i < WHORLS; i++) {
    const a = seed + i * GOLDEN;
    const r = 0.25 + 0.4 * ((seed * 7.13 + i * 3.7) % 1);
    target[i].set(
      Math.cos(a) * r * FIELD_X,
      Math.sin(a) * r * FIELD_Z,
      (i % 2 ? -1 : 1) * (0.55 + 0.55 * ((seed * 13.7 + i) % 1)),
      2.2 + 1.6 * ((seed * 5.3 + i * 1.7) % 1),
    );
  }
}
rollWhorls(uniforms.uWhorlA.value, 0.7);
rollWhorls(uniforms.uWhorlB.value, 0.7);

function regroom(strength) {
  // Finish any in-flight morph by promoting B to A, then aim B fresh.
  const U = uniforms;
  if (U.uGroomMix.value < 1) {
    for (let i = 0; i < WHORLS; i++) U.uWhorlA.value[i].lerp(U.uWhorlB.value[i], U.uGroomMix.value);
    groomAngle = mix2(groomAngle, groomAngleB, U.uGroomMix.value);
  } else {
    for (let i = 0; i < WHORLS; i++) U.uWhorlA.value[i].copy(U.uWhorlB.value[i]);
    groomAngle = groomAngleB;
  }
  U.uLayA.value.set(Math.cos(groomAngle), Math.sin(groomAngle)).multiplyScalar(0.45);
  whorlSeed += GOLDEN;
  rollWhorls(U.uWhorlB.value, whorlSeed);
  groomAngleB = groomAngle + (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * (0.5 + strength));
  U.uLayB.value.set(Math.cos(groomAngleB), Math.sin(groomAngleB)).multiplyScalar(0.45);
  U.uGroomMix.value = 0;
  patchTgt.set(patchTgt.x + Math.cos(whorlSeed) * 0.9, patchTgt.y + Math.sin(whorlSeed) * 0.9);
}
uniforms.uLayA.value.set(Math.cos(groomAngle), Math.sin(groomAngle)).multiplyScalar(0.45);
uniforms.uLayB.value.copy(uniforms.uLayA.value);

return { // vjw: was `export default {`
  name: 'pelt',
  scene,
  camera,
  bloom: { strength: 0.22, gain: 0.25 },
  paramLabels: { '*': { shape: 'tilt', complexity: 'groom', density: 'strands', fill: 'length' } },
  params: { speed: 0.5, shape: 0.5, complexity: 0.5, density: 0.6, fill: 0.5, contrast: 0.5 },
  update(s, dt, t) {
    if (!ctx.renderer) return;
    const P = this.params;
    const spF = drastic(P.speed);
    const U = uniforms;
    ensureSim(ctx.renderer);

    // --- audio state -------------------------------------------------
    energyE += (s.energy - energyE) * (1 - Math.exp(-dt * 2.2));
    subE += (s.sub - subE) * (1 - Math.exp(-dt * 3));
    if (s.onHigh) sparkle = Math.min(1.4, sparkle + s.onHigh * 0.9);
    sparkle += -sparkle * (1 - Math.exp(-dt * 3.2));

    // Accent-gated re-part: the STRUCTURAL kick response. Ordinary
    // kicks below only ripple.
    if (s.onKick > 0 && t - lastRegroom > REGROOM_REST
        && (s.onKick > REGROOM_THR || t - lastRegroom > REGROOM_FALLBACK)) {
      lastRegroom = t;
      regroom(s.onKick);
    }
    U.uGroomMix.value = Math.min(1, U.uGroomMix.value + dt * 0.45);
    U.uPatchSeed.value.lerp(patchTgt, 1 - Math.exp(-dt * 0.9));

    // Ordinary kicks: a ripple front expanding across the pelt, placed
    // on the golden angle so consecutive hits never stack.
    if (s.onKick > 0.1) {
      rippleAngle += GOLDEN;
      const rr = 0.2 + 0.35 * ((rippleAngle * 3.7) % 1);
      // Energy scales the ripple so quiet passages stay serene.
      const rp = { x: Math.cos(rippleAngle) * rr * FIELD_X, z: Math.sin(rippleAngle) * rr * FIELD_Z, front: 0.2, gain: (0.35 + 0.65 * s.onKick) * 0.9 * (0.4 + 0.6 * energyE) };
      if (ripples.length >= MAX_RIPPLES) ripples.shift();
      ripples.push(rp);
    }
    for (let i = ripples.length - 1; i >= 0; i--) {
      ripples[i].front += dt * 4.5 * spF;
      ripples[i].gain *= Math.exp(-dt * 1.5);
      if (ripples[i].front > 16 || ripples[i].gain < 0.03) ripples.splice(i, 1);
    }
    for (let i = 0; i < MAX_RIPPLES; i++) {
      const r = ripples[i];
      if (r) U.uRipple.value[i].set(r.x, r.z, r.front, r.gain);
      else U.uRipple.value[i].set(0, 0, -50, 0);
    }

    // Wind. Direction MEANDERS (two incommensurate sines, centered) the
    // way a breeze backs and veers; the noise patches drift downwind at
    // two rates; a slow breath envelope swells and dies so the field
    // breathes even between musical phrases. Mids feed the depth on a
    // slow ease (calm is the point: the breeze answers the section, not
    // the bar).
    gustAng += dt * spF * (0.045 * Math.sin(t * 0.11) + 0.03 * Math.sin(t * 0.043 + 1.7));
    U.uGustDir.value.set(Math.cos(gustAng), Math.sin(gustAng));
    midsE += (s.mids - midsE) * (1 - Math.exp(-dt * 1.4));
    const drift = dt * spF * (0.6 + 0.8 * midsE);
    U.uWindT1.value.addScaledVector(U.uGustDir.value, drift * 0.22);
    U.uWindT2.value.addScaledVector(U.uGustDir.value, drift * 0.53);
    U.uWindT2.value.x += drift * 0.07;
    const breath = 0.5 + 0.28 * Math.sin(t * 0.067) + 0.22 * Math.sin(t * 0.029 + 2.1);
    gustAmpE += ((0.16 + 0.5 * midsE) - gustAmpE) * (1 - Math.exp(-dt * 1.4));
    U.uGustAmp.value = gustAmpE * (0.55 + 0.45 * breath);
    U.uFlutter.value = 0.028 + 0.045 * midsE;
    U.uAnimT.value += dt * spF * (0.5 + 0.4 * midsE);

    // --- the brush ---------------------------------------------------
    // Ray from the cursor to the canopy plane. The eased point trails
    // the raw hit, the stroke is the segment it swept this frame, and
    // strength follows speed on a saturating curve with NO dead zone:
    // a slow tender drag leaves a shallow groove, a flick digs. The
    // cursor also parts the fur a little just by hovering, so the pelt
    // reads your presence before you ever click.
    const alive = scenePointer.ndc && performance.now() - scenePointer.lastMove < 4000;
    let splatSet = false;
    if (alive) {
      _v.set(scenePointer.ndc.x, scenePointer.ndc.y, 0.5).unproject(camera)
        .sub(camera.position).normalize();
      const tr = (CANOPY_Y - camera.position.y) / _v.y;
      if (tr > 0) {
        _wp.copy(camera.position).addScaledVector(_v, tr);
        if (!brushValid) {
          brushPt.set(_wp.x, _wp.z);
          brushVel.set(0, 0);
        }
        brushPrev.copy(brushPt);
        const ke = 1 - Math.exp(-dt * 18);
        brushPt.x += (_wp.x - brushPt.x) * ke;
        brushPt.y += (_wp.z - brushPt.y) * ke;
        if (dt > 0) {
          brushVel.x += ((brushPt.x - brushPrev.x) / dt - brushVel.x) * ke;
          brushVel.y += ((brushPt.y - brushPrev.y) / dt - brushVel.y) * ke;
        }
        const sp = brushVel.length();
        if (brushValid && sp > 0.02) {
          // Saturating strength, dt-normalized so stroke depth per
          // second is frame-rate independent. Injected into the
          // VELOCITY channel; the set blooms in behind the cursor.
          // 0.85 puts a slow pet near 0.4 set depth and a hard flick
          // near 1.2, under the 1.6 clamp (3.4 pegged everything).
          const amt = 0.85 * (sp / (sp + 9)) * (scenePointer.held ? 1.9 : 1.0)
                    * clamp(dt * 60, 0, 2);
          splatU.uSegA.value.copy(brushPrev);
          splatU.uSegB.value.copy(brushPt);
          splatU.uSegDir.value.copy(brushVel).multiplyScalar(amt / sp);
          splatU.uSplatR.value = scenePointer.held ? 1.7 : 1.35;
          splatSet = true;
        } else {
          splatU.uSegDir.value.set(0, 0);
        }
        // Hover pressure follows cursor SPEED: a parked mouse touches
        // nothing (heal's 0.09/s loses to any sustained press, so a
        // parked hover was maintaining a full-depth pit). Holding the
        // button parks a part on purpose; release and it heals.
        const hover = 0.1 * Math.min(1, sp / 2.5);
        const press = (scenePointer.held ? 0.5 : hover) * clamp(dt * 60, 0, 2);
        splatU.uPress.value.set(brushPt.x, brushPt.y, press, scenePointer.held ? 1.6 : 1.2);
        splatSet = true;
        brushValid = true;
      }
    } else {
      brushValid = false;
    }

    decayU.uDt.value = dt;
    decayU.tField.value = brushA.texture;
    run(decayPass, brushB);
    [brushA, brushB] = [brushB, brushA];
    if (splatSet) {
      splatU.tField.value = brushA.texture;
      run(splatPass, brushB);
      [brushA, brushB] = [brushB, brushA];
      splatU.uSegDir.value.set(0, 0);
      splatU.uPress.value.z = 0;
    }
    ctx.renderer.setRenderTarget(null);
    U.tBrush.value = brushA.texture;

    // --- params → look ----------------------------------------------
    geo.instanceCount = Math.round(MAX_STRANDS * (0.18 + 0.82 * Math.pow(P.density, 0.9)));
    U.uLen.value = (0.45 + 1.3 * P.fill) * (1 + subE * 0.12);
    U.uWidth.value = 0.017 + 0.012 * P.fill;
    // Crimp frequency stays under what SEG points can draw smoothly:
    // 15 waves over 7 samples aliased into zigzag wire (seen on the
    // cobalt check frame). Low and slow reads as soft fur.
    U.uCrimpF.value = 3 + 7 * P.complexity;
    U.uCrimpA.value = 0.03 + 0.1 * P.complexity;
    U.uBrushGain.value = 1;
    U.uGroundAmp.value = 1 + subE * 0.3;
    U.uSparkle.value = sparkle * (0.4 + 0.6 * s.highs);
    U.uLevel.value = 0.55 + 0.6 * energyE;
    U.uContrast.value = P.contrast;
    U.uTime.value = t;
    U.uLight.value.set(0.4 + 0.2 * Math.sin(t * 0.07), 0.85, 0.5 + 0.2 * Math.cos(t * 0.05)).normalize();

    // --- camera: tilt slider cranes, slow orbit drifts ---------------
    const elevTgt = 0.75 + (P.shape - 0.5) * 1.0;
    elev += (elevTgt - elev) * (1 - Math.exp(-dt * 5));
    orbit = 0.22 * Math.sin(t * 0.043 * spF) + 0.13 * Math.sin(t * 0.017 + 2);
    const dist = 8.4 - subE * 0.3;
    camera.position.set(
      Math.sin(orbit) * Math.cos(elev) * dist,
      Math.sin(elev) * dist,
      Math.cos(orbit) * Math.cos(elev) * dist,
    );
    camera.lookAt(0, 0.3, 0);
  },
  resize(w, h) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  },
  // QA hooks (verification doctrine: numbers, not screenshots). Reads
  // the brush field back and reduces it, and reports groom/ripple state.
  debugPelt() {
    if (!brushA || !ctx.renderer) return null;
    if (!simIsFloat) return { halfFloat: true };
    const n = SIM * SIM;
    const px = new Float32Array(n * 4);
    ctx.renderer.readRenderTargetPixels(brushA, 0, 0, SIM, SIM, px);
    let nan = 0, sum = 0, max = 0, sumV = 0, maxV = 0;
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const x = px[j], y = px[j + 1], vx = px[j + 2], vy = px[j + 3];
      if (x !== x || y !== y || vx !== vx || vy !== vy) { nan++; continue; }
      const m = Math.hypot(x, y);
      sum += m;
      if (m > max) max = m;
      const mv = Math.hypot(vx, vy);
      sumV += mv;
      if (mv > maxV) maxV = mv;
    }
    return {
      nan, meanMag: sum / n, maxMag: max,
      meanVel: sumV / n, maxVel: maxV,
      groomMix: uniforms.uGroomMix.value,
      groomAngle, groomAngleB, lastRegroom,
      ripples: ripples.map((r) => ({ ...r })),
      gustAmp: uniforms.uGustAmp.value,
      strands: geo.instanceCount,
      elev, sparkle,
    };
  },
  // JS mirror of the shader's wind formula (same hash/vnoise math),
  // for strip-charting the gust dynamics. Must track the GLSL if the
  // wind section changes.
  probeWind(wx, wz) {
    const U = uniforms;
    const h = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
    const vn = (px, py) => {
      const ix = Math.floor(px), iy = Math.floor(py);
      const fx = px - ix, fy = py - iy;
      const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
      const a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1), d = h(ix + 1, iy + 1);
      const top = a + (b - a) * ux, bot = c + (d - c) * ux;
      return top + (bot - top) * uy;
    };
    const g1 = vn(wx * 0.085 + U.uWindT1.value.x, wz * 0.085 + U.uWindT1.value.y);
    const g2 = vn(wx * 0.21 + U.uWindT2.value.x, wz * 0.21 + U.uWindT2.value.y);
    const gustN = g1 * g1 * 0.85 + g2 * g1 * 0.4;
    const ga = (vn(wx * 0.06 + U.uWindT1.value.x * 0.6 + 91.3, wz * 0.06 + U.uWindT1.value.y * 0.6 + 17.9) - 0.5) * 1.2;
    const gc = Math.cos(ga), gs = Math.sin(ga);
    const dx = U.uGustDir.value.x * gc - U.uGustDir.value.y * gs;
    const dz = U.uGustDir.value.x * gs + U.uGustDir.value.y * gc;
    const amp = U.uGustAmp.value;
    return { gustN, gx: dx * amp * gustN, gz: dz * amp * gustN, amp };
  },
  // Point probe for per-frame strip charts: brush set + velocity at a
  // world position, one texel readback.
  probeBrush(wx, wz) {
    if (!brushA || !ctx.renderer || !simIsFloat) return null;
    const tx = clamp(Math.round((wx / (2 * FIELD_X) + 0.5) * SIM), 0, SIM - 1);
    const ty = clamp(Math.round((wz / (2 * FIELD_Z) + 0.5) * SIM), 0, SIM - 1);
    const px = new Float32Array(4);
    ctx.renderer.readRenderTargetPixels(brushA, tx, ty, 1, 1, px);
    return { x: px[0], y: px[1], vx: px[2], vy: px[3] };
  },
};
} // vjw: the factory
