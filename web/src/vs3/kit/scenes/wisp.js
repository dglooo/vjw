// Copied from donor/vs3/visual_kit/src/scenes/wisp.js (the friends' engine, used with permission, 2026-11-19).
// vjw: wrapped in a factory (one scene object per layer); nothing else changed. agents/guides/guide_vs3_port.md
// Scene: Wisp — a bright wanderer made of particles, in a world made
// of particles. Rebuilt with Alec from his fuzzy-creature reference
// (v1 fur ball scrapped; v2 dust world kept and reworked). The four
// design calls, made together 2026-08-16: an ambient dust field
// fills the frame from the first second, everything churns slowly
// forever, particles draw as speed-stretched streaks, and the head
// throws occasional arcing chains of glowing beads.
//
// One million particles (1024x1024 state texture, RG pos, B age,
// A life), three roles by hash: 32% AMBIENT (permanent grains,
// wrapped back into frame when they stray), 10% CORE (a loose knot
// of grains spring-bound to the head — the "ball" IS particles, per
// Alec's v2 note, brightest at its heart, lit by the beat), and the
// rest SHED (reborn as spray at the head, living tens of seconds so
// flight history piles into billowing clouds).
//
// Perf architecture (v3, after Alec's framerate note): the flow
// field is evaluated ONCE per particle per frame in a velocity
// pre-pass; the sim integrates that texture and the draw shader
// just fetches it (the v2 draw re-evaluated the field per vertex,
// 3M evals per frame; now 1M). pixelBudget caps the internal
// resolution — a soft additive glow scene downscales invisibly, and
// fullscreen retina was paying ~5 MP of additive line fill.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { PAL, drastic, scenePointer, particleSprite } from '../lib/common.js';
import { ctx } from '../lib/context.js';
export default function create() { // vjw

const scene = new THREE.Scene();
scene.background = PAL.bg;
// Nominal camera: every material maps world to clip directly (the
// fluid/signal idiom). World: y in [-1, 1], x in [-aspect, aspect].
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
camera.position.set(0, 0, 9);

const PART_DIM = 1024;         // 1,048,576 particles
const AMB_T = 0.4;             // role row thresholds: below = ambient,
const CORE_T = 0.5;            // between = core knot, above = shed
const GOLDEN = 2.399963;
// Accent gate (hard-won in v1, keep): per-band peak normalization
// saturates every kick of a steady groove to onset 1.0, so a bare
// threshold dashes on the rest timer like a metronome. A dash needs
// a kick that beats the decaying reference of recent kicks; steady
// grooves settle to the fallback cadence, always on a kick frame.
const DASH_REST = 3.2, DASH_THR = 0.55, DASH_FALLBACK = 8;
const ACCENT_OVER = 1.18;
const ACCENT_REF_DECAY = 0.08;

const HASH2 = /* glsl */`
  vec2 hash2(vec2 p) {
    return fract(sin(vec2(dot(p, vec2(127.1, 311.7)),
                          dot(p, vec2(269.5, 183.3)))) * 43758.5453);
  }`;
// Role split by texture ROW (uv.y), shared by every pass. Row ranges
// instead of a hash so the JS geometry builder and the GLSL agree
// EXACTLY (a hash mirrored in JS doubles flips borderline texels).
// Ambient rows draw as cheap points; shed and core rows draw as
// streak lines (GL_LINES vertex cost is the draw budget: measured
// ~5 ms for 2M line verts, resolution independent).
const GUARD_T = 0.59375;       // rows 512..607: guard hairs (96k long strands)
const ROLE_GLSL = /* glsl */`
  vec2 roleOf(vec2 uv) { // x = ambient flag, y = core flag
    return vec2(step(uv.y, ${AMB_T.toFixed(2)}),
                step(${AMB_T.toFixed(2)}, uv.y) * step(uv.y, ${CORE_T.toFixed(2)}));
  }`;

// The one flow field. Two slow whole-frame churn octaves keep every
// laid cloud folding forever; a fine octave adds the filament
// frizz; a mostly-tangential vortex around the head stirs the dust
// it flies through (a strong radial term swept a clean black ring
// in the v2 look check). The vortex is age-gated for shed spray:
// ungated, a parked head circularized its spray into a hard
// doughnut; gated, fresh spray radiates like a dandelion and the
// vortex winds it into spiral arms a second later. Core grains
// spring to a per-grain home radius and follow the head, a LOOSE
// knot, with the beat bristling them outward. chainVel in JS must
// track churn() if this changes (the beads ride the same weather).
const FIELD_GLSL = /* glsl */`
  uniform vec2 uHead, uHeadVel;
  uniform float uOrb, uChurn, uFine, uFineF, uBurstV, uFieldT, uBristle;
  vec2 churn(vec2 p, float t) {
    return vec2(
      sin(p.y * 2.3 + t * 0.31) + 0.55 * cos(p.x * 3.1 - t * 0.23)
        + 0.35 * sin(p.y * 5.1 - t * 0.17),
      sin(p.x * 2.1 - t * 0.27) + 0.55 * cos(p.y * 2.9 + t * 0.19)
        + 0.35 * cos(p.x * 4.7 + t * 0.13));
  }
  vec2 fineTurb(vec2 p, float f, float t) {
    return vec2(
      sin(p.y * 11.0 * f + t * 1.7) + 0.6 * cos(p.x * 17.0 * f - t * 1.3),
      sin(p.x * 13.0 * f - t * 1.5) + 0.6 * cos(p.y * 15.0 * f + t * 1.1));
  }
  // stir = the momentum field sampled at p (the fluid feel, v5): the
  // head's swept path and the kicks inject velocity there, it
  // diffuses and decays, and everything rides it. The old analytic
  // head vortex is GONE: it read as pulling dust into a slow orbit
  // where Alec wants stirring.
  vec2 wispVel(vec2 p, float age, float amb, float core, vec2 sd, vec2 stir) {
    vec2 v = churn(p * (1.0 + sd.y * 0.08), uFieldT) * uChurn;
    v += fineTurb(p, uFineF, uFieldT + sd.x * 7.9) * uFine;
    v += stir * mix(1.0, 0.35, core);
    vec2 d = p - uHead;
    float r = length(d) + 1e-4;
    vec2 n = d / r;
    // The knot: spring to a per-grain shell, ride with the head,
    // extra jitter so it stays loose, beat bristles it outward.
    // No coherent spin: the reference head is a dandelion of radial
    // filaments, and a spinning knot read as a hurricane (Alec, v3).
    float homeR = uOrb * (0.15 + 1.3 * sd.x);
    v += (n * (homeR - r) * 14.0 + uHeadVel * 0.95
        + fineTurb(p * 3.0, 1.0, uFieldT * 1.9 + sd.y * 11.0) * 0.05
        + n * uBristle * exp(-r * r / (uOrb * uOrb * 4.0))) * core;
    // Fresh shed spray: radial burst inheriting head motion, decay
    // varied per grain so the radii spread.
    float fresh = exp(-age * (0.9 + sd.y * 1.1)) * (1.0 - amb) * (1.0 - core);
    v += (n * (0.5 + sd.x * 0.9) * uBurstV + uHeadVel * 0.75) * fresh;
    return v;
  }`;

const VERT_FSQ = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`;

function makePass(u, frag) {
  return new FullScreenQuad(new THREE.ShaderMaterial({
    uniforms: u, vertexShader: VERT_FSQ, fragmentShader: frag,
  }));
}

// -------------------------------------------------------- stir field
// The fluid heart (v5, Alec's call: reactions should work like the
// fluid scene, the mouse stirs the medium). A coarse RG velocity
// texture with MOMENTUM: the head's swept capsule splats its
// velocity in (the pelt brush idiom), kicks press radial impulses,
// then the field diffuses and decays, so a pass of the cursor keeps
// swirling after it is gone. Every particle samples it.
const STIR_W = 256, STIR_H = 144;
const stirDecayU = {
  tStir: { value: null },
  uTexel: { value: new THREE.Vector2(1 / STIR_W, 1 / STIR_H) },
  uDt: { value: 1 / 60 },
};
const stirDecayPass = makePass(stirDecayU, /* glsl */`
  uniform sampler2D tStir;
  uniform vec2 uTexel;
  uniform float uDt;
  varying vec2 vUv;
  void main() {
    vec2 s = texture2D(tStir, vUv).xy;
    vec2 avg = texture2D(tStir, vUv + vec2(uTexel.x, 0.0)).xy
             + texture2D(tStir, vUv - vec2(uTexel.x, 0.0)).xy
             + texture2D(tStir, vUv + vec2(0.0, uTexel.y)).xy
             + texture2D(tStir, vUv - vec2(0.0, uTexel.y)).xy;
    vec2 v = mix(s, avg * 0.25, 0.22);
    v *= exp(-uDt * 1.3);
    float m = length(v);
    if (m > 3.0) v *= 3.0 / m;
    if (!(dot(v, v) < 1e9)) v = vec2(0.0);
    gl_FragColor = vec4(v, 0.0, 0.0);
  }`);
const stirSplatU = {
  tStir: { value: null },
  uWorldR: { value: new THREE.Vector2(1, 1) },
  uSegA: { value: new THREE.Vector2() },
  uSegB: { value: new THREE.Vector2() },
  uSegDir: { value: new THREE.Vector2() },
  uSplatR: { value: 0.16 },
  uPress: { value: new THREE.Vector4(0, 0, 0, 0.3) }, // xy pos, z amt, w radius
};
const stirSplatPass = makePass(stirSplatU, /* glsl */`
  uniform sampler2D tStir;
  uniform vec2 uWorldR, uSegA, uSegB, uSegDir;
  uniform vec4 uPress;
  uniform float uSplatR;
  varying vec2 vUv;
  void main() {
    vec2 v = texture2D(tStir, vUv).xy;
    vec2 w = (vUv * 2.0 - 1.0) * uWorldR;
    vec2 ab = uSegB - uSegA;
    float h = clamp(dot(w - uSegA, ab) / max(dot(ab, ab), 1e-5), 0.0, 1.0);
    vec2 d = w - (uSegA + ab * h);
    // Dipole stroke: forward push in the core, gentle RETURN flow at
    // the flanks, so a pass sheds curls that fold matter back into
    // the wake instead of plowing a bare channel (first stir check).
    float q = dot(d, d) / (uSplatR * uSplatR);
    v += uSegDir * exp(-q) * (1.0 - 1.4 * q);
    vec2 dp = w - uPress.xy;
    float rp = length(dp);
    v += (dp / max(rp, 0.05)) * uPress.z * exp(-rp * rp / (uPress.w * uPress.w));
    float m = length(v);
    if (m > 3.0) v *= 3.0 / m;
    gl_FragColor = vec4(v, 0.0, 0.0);
  }`);
const stirZeroPass = makePass({}, /* glsl */`
  void main() { gl_FragColor = vec4(0.0); }`);

// ------------------------------------------------- velocity pre-pass
// One field evaluation per particle per frame, written to a texture
// the sim and the draw both read. The draw shader used to evaluate
// the field per VERTEX (3M evals a frame); this pass is why v3 runs.
const velU = {
  tState: { value: null }, tStir: { value: null },
  uAspect: { value: 1 },
  uHead: { value: new THREE.Vector2() },
  uHeadVel: { value: new THREE.Vector2() },
  uOrb: { value: 0.1 }, uChir: { value: 1 },
  uChurn: { value: 0.02 }, uFine: { value: 0.01 }, uFineF: { value: 1 },
  uBurstV: { value: 0.35 }, uFieldT: { value: 0 }, uBristle: { value: 0 },
};
const velPass = makePass(velU, /* glsl */`
  uniform sampler2D tState, tStir;
  uniform float uAspect;
  varying vec2 vUv;
  ${HASH2}
  ${ROLE_GLSL}
  ${FIELD_GLSL}
  void main() {
    vec4 st = texture2D(tState, vUv);
    vec2 sd = hash2(vUv * 61.3);
    vec2 role = roleOf(vUv);
    vec2 suv = clamp(st.xy / vec2(uAspect, 1.0) * 0.5 + 0.5, 0.0, 1.0);
    vec2 stir = texture2D(tStir, suv).xy;
    gl_FragColor = vec4(wispVel(st.xy, st.z, role.x, role.y, sd, stir), 0.0, 0.0);
  }`);

// ----------------------------------------------------------- state sim
const simU = {
  tState: { value: null }, tVel: { value: null },
  uDt: { value: 0 }, uTime: { value: 0 }, uAspect: { value: 1 },
  uLifeMul: { value: 1 }, uPuff: { value: 0 },
  uHead: velU.uHead, uOrb: velU.uOrb,
};
const simPass = makePass(simU, /* glsl */`
  uniform sampler2D tState, tVel;
  uniform float uDt, uTime, uAspect, uLifeMul, uPuff;
  uniform vec2 uHead;
  uniform float uOrb;
  varying vec2 vUv;
  ${HASH2}
  ${ROLE_GLSL}
  void main() {
    vec4 st = texture2D(tState, vUv);
    vec2 p = st.xy + texture2D(tVel, vUv).xy * uDt;
    float age = st.z + uDt;
    float life = st.w;
    vec2 role = roleOf(vUv);
    // Kick puff: recycle a slice of the OLDEST shed dust into fresh
    // spray at the head, so hits erupt without growing the budget.
    if (uPuff > 0.0 && role.x < 0.5 && role.y < 0.5 && age > 4.0
        && hash2(vUv * 57.3 + fract(uTime * 0.61) * 31.0).x < uPuff) {
      age = life + 1.0;
    }
    bool ok = p.x == p.x && p.y == p.y;
    bool inB = ok && abs(p.x) <= uAspect * 1.15 && abs(p.y) <= 1.15;
    if (role.x > 0.5) {
      // Ambient dust is permanent: wrap strays to a fresh spot.
      if (!inB) {
        vec2 h = hash2(vUv * 913.7 + fract(uTime * 0.37) * 41.0);
        p = (h - 0.5) * 2.0 * vec2(uAspect, 1.0);
        age = 10.0;
      }
      life = 1e5;
    } else if (role.y > 0.5) {
      // Core grains never die; a stray (or a NaN) snaps back to the
      // knot.
      vec2 dh = p - uHead;
      if (!inB || dot(dh, dh) > 0.36) {
        vec2 h = hash2(vUv * 913.7 + fract(uTime * 0.37) * 41.0);
        p = uHead + (h - 0.5) * uOrb;
        age = 10.0;
      }
      life = 1e5;
    } else if (!(age <= life) || !inB) {
      // Shed matter reborn as spray at the head.
      vec2 h1 = hash2(vUv * 913.7 + fract(uTime * 0.37) * 41.0);
      vec2 h2 = hash2(vUv * 471.3 + fract(uTime * 0.73) * 23.0);
      float sr = uOrb * (0.15 + 0.85 * h1.x * h1.x);
      float sa = h1.y * 6.2832;
      p = uHead + vec2(cos(sa), sin(sa)) * sr;
      age = 0.0;
      life = mix(6.0, 45.0, h2.x * h2.x) * uLifeMul;
    }
    gl_FragColor = vec4(p, age, life);
  }`);

// Seed: ambient everywhere, core at the head, shed scattered deep
// into life, so the world starts full and laying fresh matter at once.
const seedU = { uAspect: { value: 1 } };
const seedPass = makePass(seedU, /* glsl */`
  uniform float uAspect;
  varying vec2 vUv;
  ${HASH2}
  ${ROLE_GLSL}
  void main() {
    vec2 h = hash2(vUv * 501.3);
    vec2 h2 = hash2(vUv * 97.7);
    vec2 role = roleOf(vUv);
    vec2 p = (h - 0.5) * 2.0 * vec2(uAspect, 1.0);
    if (role.y > 0.5) p *= 0.1;
    float life = role.x + role.y > 0.5 ? 1e5 : mix(6.0, 45.0, h2.x * h2.x);
    float age = role.x + role.y > 0.5 ? 10.0 : life * (0.2 + 0.75 * h2.y);
    gl_FragColor = vec4(p, age, life);
  }`);

let stA = null, stB = null, velT = null, stirA = null, stirB = null, simIsFloat = false;
function ensureSim(renderer) {
  if (stA) return;
  const type = (renderer.capabilities.isWebGL2 &&
    renderer.extensions.get('EXT_color_buffer_float'))
    ? THREE.FloatType : THREE.HalfFloatType;
  simIsFloat = type === THREE.FloatType;
  const mk = (t) => new THREE.WebGLRenderTarget(PART_DIM, PART_DIM, {
    type: t,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
  });
  stA = mk(type); stB = mk(type);
  velT = mk(THREE.HalfFloatType); // velocities are small; half is plenty
  const mkStir = () => new THREE.WebGLRenderTarget(STIR_W, STIR_H, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
  });
  stirA = mkStir(); stirB = mkStir();
  run(stirZeroPass, stirA);
  run(stirZeroPass, stirB);
  seedU.uAspect.value = aspect;
  run(seedPass, stA);
}
function run(pass, target) {
  ctx.renderer.setRenderTarget(target);
  pass.render(ctx.renderer);
}

// ------------------------------------------------------------- streaks
// Every particle is one speed-stretched hairline: fast = a tiny
// streak along its motion, slow = a dot. A streak spreads its light
// over more pixels, so alpha divides by drawn length. The vertex
// shader only fetches two textures; the field lives in the pre-pass.
const COLOR_GLSL = /* glsl */`
  uniform vec2 uHeadC2;
  uniform float uOrbC2, uPulse;
  uniform vec3 uBg, uShadow, uMid, uAccent, uGlow;
  // Fur lighting (v6, from the approved mock): brightness follows how
  // much a hair faces the lamp at the head, falling off with
  // distance. Tips catch light, bodies fall dark, and the trail
  // masses read as shaded volumes instead of flat glow.
  float faceLight(vec2 p, vec2 dir) {
    vec2 dl = uHeadC2 - p;
    float d = length(dl) + 1e-3;
    float face = max(0.0, dot(dir, dl / d));
    float fall = exp(-d * 1.4);
    // Near the lamp everything is lit regardless of facing (fresh
    // spray moves AWAY from the lamp and face-shading blacked out
    // exactly the fur that should glow brightest, first v6 check).
    face = mix(face, 1.0, fall * fall);
    return (0.3 + 0.7 * face) * (0.35 + 0.65 * fall);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u2 = f * f * (3.0 - 2.0 * f);
    float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453);
    float b = fract(sin(dot(i + vec2(1, 0), vec2(127.1, 311.7))) * 43758.5453);
    float c = fract(sin(dot(i + vec2(0, 1), vec2(127.1, 311.7))) * 43758.5453);
    float d2 = fract(sin(dot(i + vec2(1, 1), vec2(127.1, 311.7))) * 43758.5453);
    return mix(mix(a, b, u2.x), mix(c, d2, u2.x), u2.y);
  }
  vec3 wispColor(vec2 p, float h, float lit) {
    vec2 d = p - uHeadC2;
    float r2 = dot(d, d);
    vec3 body = h < 0.62 ? mix(uShadow, uMid, h * 1.45)
              : (h < 0.9 ? uMid : uAccent);
    // The lantern: a tight hot pool around the knot plus a broad
    // soft wash, both pumped by the beat.
    float pool = exp(-r2 / (uOrbC2 * uOrbC2 * 16.0));
    float wash = exp(-r2 / (uOrbC2 * uOrbC2 * 140.0));
    vec3 lant = uGlow * pool * (0.35 + 1.1 * uPulse)
              + mix(uMid, uGlow, 0.5) * wash * (0.1 + 0.4 * uPulse);
    return body + lant * lit;
  }`;
const drawU = {
  tState: { value: null }, tVel: { value: null },
  uAspect: { value: 1 },
  uStreak: { value: 0.04 }, uGamma: { value: 1 },
  uLevel: { value: 0.8 }, uPulse: { value: 0 }, uSparkle: { value: 0 },
  uAmbA: { value: 0.85 }, uAlphaK: { value: 0.24 },
  uGuardLen: { value: 0.22 }, uGuardA: { value: 0.55 },
  uCurl: { value: 1.4 }, uFieldT2: velU.uFieldT,
  uChir: velU.uChir,
  uHeadC2: velU.uHead, uOrbC2: velU.uOrb,
  uBg: { value: PAL.bg }, uShadow: { value: PAL.shadow },
  uMid: { value: PAL.mid }, uAccent: { value: PAL.accent },
  uGlow: { value: PAL.glow },
};
const streakMat = new THREE.ShaderMaterial({
  uniforms: drawU,
  transparent: true, depthWrite: false, depthTest: false,
  blending: THREE.AdditiveBlending,
  vertexShader: /* glsl */`
    attribute vec2 aUv;
    attribute float aEnd;
    uniform sampler2D tState, tVel;
    uniform float uAspect, uStreak, uGamma, uLevel, uSparkle, uAmbA, uAlphaK, uChir;
    varying vec3 vC;
    varying float vA;
    ${HASH2}
    ${ROLE_GLSL}
    ${COLOR_GLSL}
    void main() {
      vec4 st = texture2D(tState, aUv);
      vec2 v = texture2D(tVel, aUv).xy;
      vec2 sd = hash2(aUv * 61.3);
      vec2 role = roleOf(aUv);
      float age = st.z, life = st.w;
      float sp = length(v);
      vec2 dir = sp > 1e-5 ? v / sp : vec2(0.0, 1.0);
      // Core hairs lie RADIAL with a per-grain curl at the tip: the
      // dandelion radiance of the reference head. Everything else
      // lies along its motion.
      vec2 dr2 = st.xy - uHeadC2;
      vec2 nr = dr2 / (length(dr2) + 1e-4);
      dir = normalize(mix(dir, nr, role.y * 0.85) + vec2(1e-5));
      float len = uStreak * clamp(sp * 2.4, 0.12, 1.7) * (0.6 + 0.4 * sd.x)
                * (1.0 - role.y * 0.45);
      vec2 hook = vec2(-dir.y, dir.x) * uChir * 0.4 * (sd.y - 0.25)
                * (1.0 + role.y * 1.6);
      vec2 p = st.xy - (dir + hook * aEnd) * len * aEnd;
      // Shed matter pops in over 0.15 s, dims gently with age (old
      // clouds go faint, never gone), dissolves over the last fifth
      // of life. Ambient is a steady floor of REAL per-grain alpha:
      // lone grains never stack, so each needs weight to read.
      // Core grains are the bright knot, pumped by the beat.
      float win = smoothstep(0.0, 0.15, age) * (1.0 - smoothstep(life * 0.8, life, age));
      float fadeAge = 1.0 / (1.0 + age * 0.02);
      float spark = uSparkle * step(0.982, fract(sd.x * 51.7));
      // This geometry holds shed and core rows only; ambient rows
      // live in the points layer.
      // Per-grain brightness lottery: most grains dim, a scatter of
      // hot ones, so the field reads varied instead of uniform.
      float lotto = 0.65 + 1.6 * pow(fract(sd.x * 31.7), 5.0);
      float aBase = win * fadeAge * (1.0 - role.y) * lotto
                  + (0.95 + 0.45 * uPulse) * role.y;
      // Fur lighting: underfur shades with the lamp like the guard
      // hairs. The knot is exempt (it IS the lamp).
      float lit2 = mix(faceLight(st.xy, dir), 1.0, role.y);
      aBase *= 0.45 + 1.0 * lit2;
      aBase *= uLevel * (1.0 - aEnd * 0.6);
      aBase /= 1.0 + len * 26.0;
      vA = pow(clamp(aBase, 0.0, 1.3), uGamma) * uAlphaK * (1.0 + spark * 5.0);
      float lit = 1.0 - role.x * 0.45;
      vC = wispColor(st.xy, fract(sd.x * 7.13), lit);
      gl_Position = vec4(p.x / uAspect, p.y, 0.0, 1.0);
    }`,
  fragmentShader: /* glsl */`
    varying vec3 vC;
    varying float vA;
    void main() { gl_FragColor = vec4(vC * vA, vA); }`,
});
// Row map: [0, AMB_ROWS) ambient points, [AMB_ROWS, CORE_END) core,
// [CORE_END, GUARD_END) guard hairs, the rest underfur streaks.
const AMB_ROWS = Math.round(PART_DIM * AMB_T);
const CORE_END = Math.round(PART_DIM * CORE_T);
const GUARD_END = Math.round(PART_DIM * GUARD_T);
const streakGeo = new THREE.BufferGeometry();
{
  const rows = (CORE_END - AMB_ROWS) + (PART_DIM - GUARD_END);
  const n = PART_DIM * rows;
  const uvA = new Float32Array(n * 2 * 2);
  const endA = new Float32Array(n * 2);
  const pos = new Float32Array(n * 2 * 3); // required attr, unused
  let k = 0;
  for (let y = AMB_ROWS; y < PART_DIM; y++) {
    if (y >= CORE_END && y < GUARD_END) continue; // guard rows draw long
    for (let x = 0; x < PART_DIM; x++) {
      const u = (x + 0.5) / PART_DIM, v = (y + 0.5) / PART_DIM;
      for (let e = 0; e < 2; e++, k++) {
        uvA[k * 2] = u; uvA[k * 2 + 1] = v;
        endA[k] = e;
      }
    }
  }
  streakGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  streakGeo.setAttribute('aUv', new THREE.BufferAttribute(uvA, 2));
  streakGeo.setAttribute('aEnd', new THREE.BufferAttribute(endA, 1));
}
const streaks = new THREE.LineSegments(streakGeo, streakMat);
streaks.frustumCulled = false;
scene.add(streaks);

// ---------------------------------------------------------- guard hairs
// The reference's long flowing curls (v6, from the approved mock):
// 96k strands, each a closed-form constant-curvature ARC leaving its
// particle along the live flow direction, so stirring combs them and
// they need no per-vertex field walk. Curvature comes from a smooth
// value noise of WORLD position, so neighboring hairs share their
// curl and form locks and cowlicks; a sinus wobble adds the flick at
// the tip. Lit by faceLight like everything else.
const GUARD_SEG = 6;
const guardMat = new THREE.ShaderMaterial({
  uniforms: drawU,
  transparent: true, depthWrite: false, depthTest: false,
  blending: THREE.AdditiveBlending,
  vertexShader: /* glsl */`
    attribute vec2 aUv;
    attribute float aT;
    uniform sampler2D tState, tVel;
    uniform float uAspect, uGamma, uLevel, uAlphaK, uGuardLen, uGuardA, uCurl, uFieldT2;
    varying vec3 vC;
    varying float vA;
    ${HASH2}
    ${COLOR_GLSL}
    void main() {
      vec4 st = texture2D(tState, aUv);
      vec2 vel = texture2D(tVel, aUv).xy;
      vec2 sd = hash2(aUv * 61.3);
      float age = st.z, life = st.w;
      float sp = length(vel);
      float a0 = sp > 1e-5 ? atan(vel.y, vel.x) : sd.x * 6.2832;
      a0 += (sd.y - 0.5) * 0.7;
      // Lock-forming curl: smooth noise of world position, shared by
      // neighbors, slowly evolving.
      float kv = (vnoise(st.xy * 2.6 + uFieldT2 * 0.06) - 0.5)
               * uCurl * (0.7 + 0.6 * fract(sd.x * 13.7));
      float len = uGuardLen * (0.45 + 0.55 * sd.x) * min(1.0, age * 1.2);
      // Arc position, closed form: integral of the rotating tangent.
      float kk = kv * 6.2832;
      float at2 = a0 + kk * aT;
      vec2 walk = abs(kk) > 1e-3
        ? vec2(sin(at2) - sin(a0), cos(a0) - cos(at2)) / kk
        : vec2(cos(a0), sin(a0)) * aT;
      vec2 p = st.xy - walk * len;
      // Tip flick: perpendicular sinus growing along the hair.
      vec2 tang = vec2(cos(at2), sin(at2));
      p += vec2(-tang.y, tang.x) * sin(aT * 9.0 + sd.y * 40.0) * len * 0.06 * aT;
      float win = smoothstep(0.0, 0.2, age) * (1.0 - smoothstep(life * 0.8, life, age));
      float fadeAge = 1.0 / (1.0 + age * 0.015);
      float lit = faceLight(p, tang);
      float lotto = 0.55 + 1.2 * pow(fract(sd.x * 31.7), 4.0);
      float aBase = win * fadeAge * lotto * uGuardA * uLevel
                  * (1.0 - aT * 0.65) * (0.35 + 0.85 * lit);
      vA = pow(clamp(aBase, 0.0, 1.2), uGamma) * uAlphaK * 2.2;
      vC = wispColor(p, 0.35 + 0.6 * fract(sd.x * 7.13), 0.5 + 0.7 * lit);
      gl_Position = vec4(p.x / uAspect, p.y, 0.0, 1.0);
    }`,
  fragmentShader: /* glsl */`
    varying vec3 vC;
    varying float vA;
    void main() { gl_FragColor = vec4(vC * vA, vA); }`,
});
const guardGeo = new THREE.BufferGeometry();
{
  const n = PART_DIM * (GUARD_END - CORE_END);
  const vPer = GUARD_SEG * 2;
  const uvA = new Float32Array(n * vPer * 2);
  const tA = new Float32Array(n * vPer);
  const pos = new Float32Array(n * vPer * 3); // required attr, unused
  let k = 0;
  for (let y = CORE_END; y < GUARD_END; y++) {
    for (let x = 0; x < PART_DIM; x++) {
      const u = (x + 0.5) / PART_DIM, v = (y + 0.5) / PART_DIM;
      for (let s = 0; s < GUARD_SEG; s++) {
        for (let e = 0; e < 2; e++, k++) {
          uvA[k * 2] = u; uvA[k * 2 + 1] = v;
          tA[k] = (s + e) / GUARD_SEG;
        }
      }
    }
  }
  guardGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  guardGeo.setAttribute('aUv', new THREE.BufferAttribute(uvA, 2));
  guardGeo.setAttribute('aT', new THREE.BufferAttribute(tA, 1));
}
const guards = new THREE.LineSegments(guardGeo, guardMat);
guards.frustumCulled = false;
scene.add(guards);

// Ambient rows as 1-vertex points: a third of the population at a
// sixth of the line-draw's vertex cost.
const ambMat = new THREE.ShaderMaterial({
  uniforms: drawU,
  transparent: true, depthWrite: false, depthTest: false,
  blending: THREE.AdditiveBlending,
  vertexShader: /* glsl */`
    uniform sampler2D tState;
    uniform float uAspect, uGamma, uLevel, uAmbA, uAlphaK;
    varying vec3 vC;
    varying float vA;
    ${HASH2}
    ${COLOR_GLSL}
    void main() {
      vec2 luv = position.xy;
      vec4 st = texture2D(tState, luv);
      vec2 sd = hash2(luv * 61.3);
      // Same brightness lottery as the streaks: the far field carries
      // scattered hot grains among the dim powder. The body hash is
      // remapped toward the bright palette slots: shadow-slot grains
      // read as black at 1 px and the edges went dark (Alec wants the
      // frame filled edge to edge).
      float lotto = 0.65 + 1.6 * pow(fract(sd.x * 31.7), 5.0);
      // A small slice of the far field draws as big soft bokeh discs
      // (the out-of-focus depth layer from the reference).
      float bokeh = step(0.93, fract(sd.y * 23.1));
      float aBase = uAmbA * uLevel * lotto * mix(1.0, 0.28, bokeh);
      vA = pow(clamp(aBase, 0.0, 1.3), uGamma) * uAlphaK;
      vC = wispColor(st.xy, 0.5 + 0.48 * fract(sd.x * 7.13), 0.85);
      gl_PointSize = mix(1.0 + 1.4 * sd.y, 6.0 + 9.0 * sd.x, bokeh);
      gl_Position = vec4(st.x / uAspect, st.y, 0.0, 1.0);
    }`,
  fragmentShader: /* glsl */`
    varying vec3 vC;
    varying float vA;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      float a = vA * smoothstep(0.5, 0.18, d);
      gl_FragColor = vec4(vC * a, a);
    }`,
});
const ambGeo = new THREE.BufferGeometry();
{
  const n = PART_DIM * AMB_ROWS;
  const lookup = new Float32Array(n * 3);
  let i = 0;
  for (let y = 0; y < AMB_ROWS; y++) {
    for (let x = 0; x < PART_DIM; x++, i += 3) {
      lookup[i] = (x + 0.5) / PART_DIM;
      lookup[i + 1] = (y + 0.5) / PART_DIM;
    }
  }
  ambGeo.setAttribute('position', new THREE.BufferAttribute(lookup, 3));
}
const ambPoints = new THREE.Points(ambGeo, ambMat);
ambPoints.frustumCulled = false;
scene.add(ambPoints);

// --------------------------------------------------------- bead chains
// The signature garnish from the stills: strings of glowing dots
// arcing along mass edges. A small CPU pool; each chain is born at
// the head aiming outward with a curl, and every bead rides the SAME
// churn weather as the dust (chainVel mirrors churn() in the field
// GLSL; keep them in lockstep). Drawn as glow sprites, head bright,
// tail small and dim, the whole chain fading out over its life.
const CHAINS = 5, BEADS = 28;
const chainPool = []; // { beads: Vector2[], birth, life, gain }
const chainGeo = new THREE.BufferGeometry();
{
  const n = CHAINS * BEADS;
  chainGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  chainGeo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(n), 1));
  chainGeo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(n), 1));
  chainGeo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
}
const chainU = { uMap: { value: null }, uAspect: { value: 1 } };
const chainMat = new THREE.ShaderMaterial({
  uniforms: chainU,
  transparent: true, depthWrite: false, depthTest: false,
  blending: THREE.AdditiveBlending,
  vertexShader: /* glsl */`
    attribute float aSize;
    attribute float aAlpha;
    attribute vec3 aColor;
    uniform float uAspect;
    varying float vA;
    varying vec3 vC;
    void main() {
      vA = aAlpha;
      vC = aColor;
      gl_PointSize = aSize;
      gl_Position = vec4(position.x / uAspect, position.y, 0.0, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D uMap;
    varying float vA;
    varying vec3 vC;
    void main() {
      float a = texture2D(uMap, gl_PointCoord).a * vA;
      gl_FragColor = vec4(vC * a, a);
    }`,
});
chainMat.uniforms.uMap.value = particleSprite();
const chains = new THREE.Points(chainGeo, chainMat);
chains.frustumCulled = false;
chains.renderOrder = 1;
scene.add(chains);

// JS mirror of the shader churn (beads ride the dust's weather).
function churnJS(px, py, t, out) {
  out[0] = Math.sin(py * 2.3 + t * 0.31) + 0.55 * Math.cos(px * 3.1 - t * 0.23)
         + 0.35 * Math.sin(py * 5.1 - t * 0.17);
  out[1] = Math.sin(px * 2.1 - t * 0.27) + 0.55 * Math.cos(py * 2.9 + t * 0.19)
         + 0.35 * Math.cos(px * 4.7 + t * 0.13);
}
const _cv = [0, 0];

function spawnChain(t, strength) {
  if (chainPool.length >= CHAINS) chainPool.shift();
  const ang = chainAngle += GOLDEN;
  const curl = (Math.random() < 0.5 ? -1 : 1) * (0.9 + Math.random() * 1.4);
  const beads = [];
  const arcR = 0.1 + 0.1 * Math.random();
  for (let b = 0; b < BEADS; b++) {
    const s = b / (BEADS - 1);
    const a = ang + s * curl;
    const r = arcR + s * (0.55 + strength * 0.3);
    beads.push(new THREE.Vector2(
      head.x + Math.cos(a) * r,
      head.y + Math.sin(a) * r));
  }
  chainPool.push({ beads, birth: t, life: 7 + Math.random() * 5, gain: 0.7 + strength * 0.5 });
}

// ---------------------------------------------------------------- core
// A small hot nucleus only — the ball itself is the particle knot.
const coreU = {
  uHeadC: { value: new THREE.Vector2() },
  uAspect: { value: 1 }, uCoreR: { value: 0.1 },
  uPulse: { value: 0 }, uLevel: { value: 1 },
  uMid: { value: PAL.mid }, uGlow: { value: PAL.glow },
};
const coreMat = new THREE.ShaderMaterial({
  uniforms: coreU,
  transparent: true, depthWrite: false, depthTest: false,
  blending: THREE.AdditiveBlending,
  vertexShader: /* glsl */`
    uniform vec2 uHeadC;
    uniform float uAspect, uCoreR;
    varying vec2 vL;
    void main() {
      vL = position.xy;
      vec2 p = uHeadC + position.xy * uCoreR * 2.2;
      gl_Position = vec4(p.x / uAspect, p.y, 0.0, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform float uPulse, uLevel;
    uniform vec3 uMid, uGlow;
    varying vec2 vL;
    void main() {
      float r = length(vL) * 2.2;
      float heart = exp(-r * r * 30.0) * (0.22 + 0.5 * uPulse);
      float halo = exp(-r * r * 3.0) * (0.03 + 0.14 * uPulse);
      vec3 col = uGlow * heart + mix(uMid, uGlow, 0.5) * halo;
      gl_FragColor = vec4(col * uLevel, 1.0);
    }`,
});
const core = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), coreMat);
core.frustumCulled = false;
core.renderOrder = 2;
scene.add(core);

// ---------------------------------------------------------------- state
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const head = new THREE.Vector2(0, 0);
const prevHead = new THREE.Vector2(0, 0);
const headVel = new THREE.Vector2(0, 0);
let aspect = 1;
// Cruising-agent motion (v3, after Alec's feel note on v2: the
// sine-target chase read stop-start and mechanical). The head always
// carries momentum: a heading steered by slow meander, soft edge
// avoidance, and the pointer; speed is a cruise that breathes with
// the song. Dashes are forward swerves — a heading kick plus a speed
// boost — so a dart banks out of the current motion instead of
// teleporting sideways.
let heading = Math.random() * 6.2832;
let cruiseV = 0;
let dashBoost = 0;
let swerveSign = 1;
let wanderT = Math.random() * 40;
let chainAngle = Math.random() * 6.2832;
let lastDash = -10;
let accentRef = 0.5;
let chir = 1, chirTgt = 1;
let pulse = 0, pulseTgt = 0, sparkle = 0, puff = 0;
let energyE = 0.4, subE = 0, midsE = 0.2;
let holdE = 0;
let fieldT = 0;

return { // vjw: was `export default {`
  name: 'wisp',
  scene,
  camera,
  bloom: { strength: 0.4, gain: 0.45 },
  // Soft additive glow tolerates downscale invisibly; fullscreen
  // retina was paying ~5 MP of additive line fill (Alec's framerate
  // note, v2).
  pixelBudget: 2.2,
  paramLabels: { '*': { shape: 'roam', complexity: 'detail', density: 'trail', fill: 'size' } },
  params: { speed: 0.5, shape: 0.75, complexity: 0.6, density: 0.7, fill: 0.5, contrast: 0.5 },
  update(s, dt, t) {
    if (!ctx.renderer) return;
    const P = this.params;
    const spF = drastic(P.speed);
    ensureSim(ctx.renderer);

    // --- audio -------------------------------------------------------
    energyE += (s.energy - energyE) * (1 - Math.exp(-dt * 2.2));
    subE += (s.sub - subE) * (1 - Math.exp(-dt * 3));
    midsE += (s.mids - midsE) * (1 - Math.exp(-dt * 1.4));
    // Lantern: two-stage attack (~0.1 s pop-in), drains faster than a
    // beat so boosts never plateau (the fract lesson).
    if (s.onKick) pulseTgt = Math.min(1.5, pulseTgt + s.onKick);
    pulseTgt += -pulseTgt * (1 - Math.exp(-dt * 3.5));
    pulse += (pulseTgt - pulse) * (1 - Math.exp(-dt * 18));
    if (s.onHigh) sparkle = Math.min(1.4, sparkle + s.onHigh * 0.9);
    sparkle += -sparkle * (1 - Math.exp(-dt * 3.2));
    // QA tap: recent kick strengths against the accent reference.
    if (s.onKick) {
      (this._kicks || (this._kicks = [])).push([+t.toFixed(2), +s.onKick.toFixed(3), +accentRef.toFixed(3)]);
      if (this._kicks.length > 400) this._kicks.shift();
    }

    // Every kick: light pulse plus a puff of recycled spray.
    puff = 0;
    if (s.onKick > 0.1) puff = 0.02 + 0.03 * s.onKick;

    // Accent-gated DASH with the recent-kick reference gate.
    let dashed = false;
    if (s.onKick > 0) {
      const standsOut = s.onKick > DASH_THR && s.onKick > accentRef * ACCENT_OVER;
      if (t - lastDash > DASH_REST
          && (standsOut || t - lastDash > DASH_FALLBACK)) {
        lastDash = t;
        dashed = true;
        swerveSign = -swerveSign;
        heading += swerveSign * (0.7 + Math.random() * 0.5);
        dashBoost += (0.55 + 0.35 * s.onKick) * spF;
        puff = Math.max(puff, 0.1 + 0.08 * s.onKick);
        chirTgt = -chirTgt;
        spawnChain(t, s.onKick);
      }
      accentRef += (s.onKick - accentRef) * 0.35;
    }
    accentRef *= Math.exp(-dt * ACCENT_REF_DECAY);
    dashBoost *= Math.exp(-dt * 2.0);
    chir += (chirTgt - chir) * (1 - Math.exp(-dt * 1.6));

    // --- head motion: the cruising agent -----------------------------
    const roam = 0.1 + 0.85 * P.shape;
    const bx = Math.max(0.2, roam * aspect * 0.9);
    const by = Math.max(0.18, roam * 0.9);
    wanderT += dt * spF * 0.55;
    // Meander: the heading drifts on two incommensurate sines.
    let desired = heading + Math.sin(wanderT * 0.83 + 2.1) * 0.9
                          + Math.sin(wanderT * 0.47) * 1.3;
    let turnRate = 2.2;
    // Soft bounds: look half a second ahead; outside the roam box the
    // steer aims home, harder the farther out.
    const ax = head.x + Math.cos(heading) * cruiseV * 0.5;
    const ay = head.y + Math.sin(heading) * cruiseV * 0.5;
    const over = Math.max(Math.abs(ax) / bx, Math.abs(ay) / by);
    if (over > 1) {
      desired = Math.atan2(-head.y, -head.x);
      turnRate = 2.2 + 3.5 * Math.min(over - 1, 1);
    }
    const alive = scenePointer.ndc && performance.now() - scenePointer.lastMove < 4000;
    holdE += ((alive && scenePointer.held ? 1 : 0) - holdE) * (1 - Math.exp(-dt * 6));
    if (alive) {
      // LOCKED to the cursor (Alec, v3: the lazy chase killed the
      // particle reactions). A ~35 ms ease is imperceptible as lag
      // but keeps spawn continuity; the real mouse velocity feeds
      // the field, so a flick whips the spray.
      const tx = clamp(scenePointer.ndc.x * aspect, -aspect * 0.95, aspect * 0.95);
      const ty = clamp(scenePointer.ndc.y, -0.95, 0.95);
      const px = head.x, py = head.y;
      const k = 1 - Math.exp(-dt * 28);
      head.x += (tx - head.x) * k;
      head.y += (ty - head.y) * k;
      if (dt > 0) {
        headVel.x += ((head.x - px) / dt - headVel.x) * k;
        headVel.y += ((head.y - py) / dt - headVel.y) * k;
      }
      cruiseV = headVel.length();
      if (cruiseV > 0.05) heading = Math.atan2(headVel.y, headVel.x);
    } else {
      let speedTgt = 0.2 * spF * (0.7 + 0.5 * energyE);
      speedTgt *= 1 - holdE * 0.7;
      let dh = desired - heading;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      heading += clamp(dh, -turnRate * dt, turnRate * dt);
      cruiseV += (speedTgt + dashBoost - cruiseV) * (1 - Math.exp(-dt * 3));
      headVel.set(Math.cos(heading), Math.sin(heading)).multiplyScalar(cruiseV);
      head.x = clamp(head.x + headVel.x * dt, -aspect * 0.95, aspect * 0.95);
      head.y = clamp(head.y + headVel.y * dt, -0.95, 0.95);
    }

    // --- params → field ----------------------------------------------
    const orb = (0.05 + 0.11 * P.fill) * (1 + subE * 0.15) * (1 - holdE * 0.35);
    velU.uHead.value.copy(head);
    velU.uHeadVel.value.copy(headVel);
    velU.uOrb.value = orb;
    velU.uChir.value = chir;
    velU.uChurn.value = 0.014 * (0.55 + 1.45 * midsE) * spF;
    velU.uFine.value = (0.005 + 0.028 * P.complexity) * spF;
    velU.uFineF.value = 0.6 + 2.0 * P.complexity;
    // Slow spray: a fast burst transits the near-head zone in a
    // blink and leaves a dark density gap between knot and fur rim.
    velU.uBurstV.value = 0.16 + 0.14 * P.fill;
    velU.uBristle.value = pulse * 0.28 * spF;
    fieldT += dt * spF;
    velU.uFieldT.value = fieldT;
    simU.uLifeMul.value = 0.3 + 2.2 * P.density * P.density;
    simU.uPuff.value = puff;
    simU.uDt.value = dt;
    simU.uTime.value = t;
    simU.uAspect.value = aspect;

    // --- stir the medium ---------------------------------------------
    // Decay + diffuse every frame; the head's swept capsule splats
    // its velocity in whenever it moves (mouse OR cruise: the
    // wanderer stirs its own medium), and kicks press a radial
    // impulse. Saturating strength so flicks dig without blowing up.
    stirDecayU.uDt.value = dt;
    stirDecayU.tStir.value = stirA.texture;
    run(stirDecayPass, stirB);
    [stirA, stirB] = [stirB, stirA];
    const stirSp = headVel.length();
    let press = 0;
    if (s.onKick > 0.1) press = (0.35 + 0.65 * s.onKick) * 0.9;
    if (dashed) press = Math.max(press, 1.2);
    if (stirSp > 0.02 || press > 0) {
      const amt = 1.3 * (stirSp / (stirSp + 1.2)) * clamp(dt * 60, 0, 2);
      stirSplatU.uWorldR.value.set(aspect, 1);
      stirSplatU.uSegA.value.copy(prevHead);
      stirSplatU.uSegB.value.copy(head);
      if (stirSp > 0.02) {
        stirSplatU.uSegDir.value.copy(headVel).multiplyScalar(amt / stirSp);
      } else {
        stirSplatU.uSegDir.value.set(0, 0);
      }
      stirSplatU.uSplatR.value = 0.09 + orb * 0.7;
      stirSplatU.uPress.value.set(head.x, head.y, press * clamp(dt * 60, 0, 2), 0.22 + orb);
      stirSplatU.tStir.value = stirA.texture;
      run(stirSplatPass, stirB);
      [stirA, stirB] = [stirB, stirA];
    }
    prevHead.copy(head);

    // --- step the state: field once, then integrate ------------------
    velU.tState.value = stA.texture;
    velU.tStir.value = stirA.texture;
    velU.uAspect.value = aspect;
    run(velPass, velT);
    simU.tState.value = stA.texture;
    simU.tVel.value = velT.texture;
    run(simPass, stB);
    [stA, stB] = [stB, stA];
    ctx.renderer.setRenderTarget(null);

    // --- draw --------------------------------------------------------
    drawU.tState.value = stA.texture;
    drawU.tVel.value = velT.texture;
    drawU.uAspect.value = aspect;
    drawU.uPulse.value = pulse;
    drawU.uLevel.value = 0.6 + 0.8 * energyE;
    drawU.uGamma.value = 0.6 + 0.9 * (1 - P.contrast);
    drawU.uStreak.value = 0.03 + 0.055 * P.fill;
    drawU.uGuardLen.value = 0.12 + 0.24 * P.fill;
    drawU.uGuardA.value = 0.55;
    drawU.uCurl.value = 0.7 + 2.2 * P.complexity;
    drawU.uSparkle.value = sparkle * (0.4 + 0.6 * s.highs);
    // Ambient grains sit alone (no additive stacking), so each needs
    // real alpha to read as the fine dust floor of the reference.
    drawU.uAmbA.value = 0.85 + 0.35 * P.density;

    // --- bead chains -------------------------------------------------
    const cPos = chainGeo.attributes.position.array;
    const cSize = chainGeo.attributes.aSize.array;
    const cAlpha = chainGeo.attributes.aAlpha.array;
    const cCol = chainGeo.attributes.aColor.array;
    const churnAmp = velU.uChurn.value;
    let bi = 0;
    for (let c = 0; c < CHAINS; c++) {
      const ch = chainPool[c];
      if (!ch) { for (let b = 0; b < BEADS; b++, bi++) cAlpha[bi] = 0; continue; }
      const age = t - ch.birth;
      if (age > ch.life) { for (let b = 0; b < BEADS; b++, bi++) cAlpha[bi] = 0; continue; }
      const fade = Math.min(1, age / 0.4) * (1 - Math.max(0, (age - ch.life * 0.7) / (ch.life * 0.3)));
      for (let b = 0; b < BEADS; b++, bi++) {
        const bp = ch.beads[b];
        churnJS(bp.x, bp.y, fieldT, _cv);
        bp.x += _cv[0] * churnAmp * dt;
        bp.y += _cv[1] * churnAmp * dt;
        const sTail = b / (BEADS - 1);
        cPos[bi * 3] = bp.x; cPos[bi * 3 + 1] = bp.y; cPos[bi * 3 + 2] = 0;
        // Bokeh beads: bigger and softer than v5, the out-of-focus
        // chains from the reference.
        cSize[bi] = (11 - sTail * 6) * (0.8 + 0.4 * P.fill);
        cAlpha[bi] = fade * ch.gain * (1 - sTail * 0.55) * (0.25 + 0.3 * energyE);
        const col = sTail < 0.35 ? PAL.glow : PAL.accent;
        cCol[bi * 3] = col.r; cCol[bi * 3 + 1] = col.g; cCol[bi * 3 + 2] = col.b;
      }
    }
    chainGeo.attributes.position.needsUpdate = true;
    chainGeo.attributes.aSize.needsUpdate = true;
    chainGeo.attributes.aAlpha.needsUpdate = true;
    chainGeo.attributes.aColor.needsUpdate = true;
    chainU.uAspect.value = aspect;

    coreU.uHeadC.value.copy(head);
    coreU.uAspect.value = aspect;
    coreU.uCoreR.value = orb * (0.9 + holdE * 0.2);
    coreU.uPulse.value = pulse;
    coreU.uLevel.value = (0.5 + 0.8 * energyE) * (1 + holdE * 0.5);
  },
  resize(w, h) {
    aspect = w / h;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  },
  // QA hooks (verification doctrine: numbers, never screenshots).
  debugWisp() {
    if (!stA || !ctx.renderer) return null;
    if (!simIsFloat) return { halfFloat: true };
    const n = PART_DIM * PART_DIM;
    const px = new Float32Array(n * 4);
    ctx.renderer.readRenderTargetPixels(stA, 0, 0, PART_DIM, PART_DIM, px);
    let nan = 0, oob = 0, permanent = 0, fresh = 0, ageSum = 0, shedN = 0;
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const x = px[j], y = px[j + 1], age = px[j + 2], life = px[j + 3];
      if (x !== x || y !== y || age !== age || life !== life) { nan++; continue; }
      if (Math.abs(x) > aspect * 1.25 || Math.abs(y) > 1.25) oob++;
      if (life > 9e4) permanent++;
      else { shedN++; if (age < 1.5) fresh++; ageSum += age; }
    }
    return {
      nan, oob, permanent, shed: shedN, fresh,
      meanShedAge: shedN ? ageSum / shedN : 0,
      chains: chainPool.length,
      head: { x: head.x, y: head.y },
      headSpeed: headVel.length(),
      heading, cruiseV, chir, lastDash, pulse,
      orb: velU.uOrb.value,
    };
  },
  probeHead() {
    return {
      x: head.x, y: head.y, vx: headVel.x, vy: headVel.y,
      heading, cruiseV, dashBoost, chir, pulse, lastDash, accentRef,
      chains: chainPool.length,
    };
  },
};
} // vjw: the factory
