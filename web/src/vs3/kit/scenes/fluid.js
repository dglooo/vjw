// Copied from donor/vs3/visual_kit/src/scenes/fluid.js (the friends' engine, used with permission, 2026-11-19).
// vjw: wrapped in a factory (one scene object per layer); nothing else changed. agents/guides/guide_vs3_port.md
// Scene: Fluid — real Navier-Stokes ink. A GPU Eulerian simulation
// (semi-Lagrangian advection, Jacobi pressure projection, vorticity
// confinement — the classic stable-fluids recipe): kicks inject dye and
// an outward velocity impulse at a spot that orbits the frame on the
// golden angle, so consecutive hits never land in the same place;
// highs add small sparkle splats; quiet passages get weak dye-less
// swirls so the ink keeps breathing. Everything else is physics.
//
// Riding the sim: a quarter-million-point particle cloud (512x512
// position+velocity float texture, ping-pong update pass) whose points
// drag toward the fluid velocity field each frame, layered additively
// over the dye. A small set of authored attractors (orbit, twin poles,
// ring, sine ribbon) pulls the cloud into deliberate shapes while the
// fluid keeps it organic; accented kicks snap to a new configuration
// (gated like relic's rebuilds), eased so the cloud reshapes instead of
// teleporting. DENSITY crossfades dye against cloud, FILL sets point
// size, COMPLEXITY sets attractor pull (and vorticity, as before).
//
// Velocity lives in "world" units (uv - 0.5 scaled by aspect) so splats
// stay circular on any window. Sim grid is proportional to the drawing
// buffer (square texels): velocity ~192 tall, dye ~640 tall.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { PAL, drastic } from '../lib/common.js';
import { ctx } from '../lib/context.js';
export default function create() { // vjw

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// ------------------------------------------------------------ display
const displayUniforms = {
  tDye: { value: null },
  uEnergy: { value: 0.6 },
  uContrast: { value: 0.5 },
  uDyeMix: { value: 1 },
  uShadow: { value: PAL.shadow },
  uBg: { value: PAL.bg },
};
const quad = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.ShaderMaterial({
    uniforms: displayUniforms,
    depthWrite: false,
    depthTest: false,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tDye;
      uniform float uEnergy, uContrast, uDyeMix;
      uniform vec3 uShadow, uBg;
      varying vec2 vUv;
      void main() {
        vec3 dye = texture2D(tDye, vUv).rgb;
        vec3 col = uBg * 0.35 + uShadow * 0.1 + dye * uDyeMix;
        col *= 0.45 + 0.75 * uEnergy;
        vec3 hi = col * col * (3.0 - 2.0 * col);
        vec3 lo = pow(max(col, 0.0), vec3(0.75));
        col = mix(col, hi, max(0.0, uContrast - 0.5) * 1.5);
        col = mix(col, lo, max(0.0, 0.5 - uContrast) * 1.5);
        float r = length(vUv - 0.5);
        col *= 1.0 - 0.25 * smoothstep(0.4, 0.9, r);
        gl_FragColor = vec4(col, 1.0);
      }`,
  })
);
scene.add(quad);

// ------------------------------------------------------------- sim passes
const VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`;

function makePass(uniforms, fragment) {
  return new FullScreenQuad(new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: fragment,
  }));
}

// Advection — semi-Lagrangian backtrace with hardware bilinear taps.
const advectU = {
  tVel: { value: null }, tSrc: { value: null },
  uDt: { value: 0 }, uDiss: { value: 1 }, uAspect: { value: 1 },
};
const advectPass = makePass(advectU, /* glsl */`
  uniform sampler2D tVel, tSrc;
  uniform float uDt, uDiss, uAspect;
  varying vec2 vUv;
  void main() {
    vec2 vel = texture2D(tVel, vUv).xy;
    vec2 coord = vUv - uDt * vel * vec2(1.0 / uAspect, 1.0);
    gl_FragColor = vec4(texture2D(tSrc, coord).rgb * uDiss, 1.0);
  }`);

// Splat — gaussian injection into velocity or dye.
const splatU = {
  tSrc: { value: null },
  uPoint: { value: new THREE.Vector2() },
  uValue: { value: new THREE.Vector3() },
  uRadius: { value: 0.1 }, uAspect: { value: 1 },
};
const splatPass = makePass(splatU, /* glsl */`
  uniform sampler2D tSrc;
  uniform vec2 uPoint;
  uniform vec3 uValue;
  uniform float uRadius, uAspect;
  varying vec2 vUv;
  void main() {
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
    vec2 d = p - uPoint;
    float g = exp(-dot(d, d) / (uRadius * uRadius));
    vec3 base = texture2D(tSrc, vUv).rgb;
    gl_FragColor = vec4(clamp(base + uValue * g, -8.0, 8.0), 1.0);
  }`);

// Curl (scalar vorticity) of the velocity field.
const curlU = { tVel: { value: null }, uTexel: { value: new THREE.Vector2() } };
const curlPass = makePass(curlU, /* glsl */`
  uniform sampler2D tVel;
  uniform vec2 uTexel;
  varying vec2 vUv;
  void main() {
    float L = texture2D(tVel, vUv - vec2(uTexel.x, 0.0)).y;
    float R = texture2D(tVel, vUv + vec2(uTexel.x, 0.0)).y;
    float B = texture2D(tVel, vUv - vec2(0.0, uTexel.y)).x;
    float T = texture2D(tVel, vUv + vec2(0.0, uTexel.y)).x;
    gl_FragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
  }`);

// Vorticity confinement — push velocity toward local rotation centers:
// this is what makes the ink billow instead of dissolving into mush.
const vortU = {
  tVel: { value: null }, tCurl: { value: null },
  uEps: { value: 10 }, uDt: { value: 0 }, uTexel: { value: new THREE.Vector2() },
};
const vortPass = makePass(vortU, /* glsl */`
  uniform sampler2D tVel, tCurl;
  uniform float uEps, uDt;
  uniform vec2 uTexel;
  varying vec2 vUv;
  void main() {
    float L = texture2D(tCurl, vUv - vec2(uTexel.x, 0.0)).x;
    float R = texture2D(tCurl, vUv + vec2(uTexel.x, 0.0)).x;
    float B = texture2D(tCurl, vUv - vec2(0.0, uTexel.y)).x;
    float T = texture2D(tCurl, vUv + vec2(0.0, uTexel.y)).x;
    float c = texture2D(tCurl, vUv).x;
    vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
    force /= length(force) + 1e-4;
    force *= uEps * c * vec2(1.0, -1.0);
    vec2 vel = texture2D(tVel, vUv).xy + force * uDt;
    gl_FragColor = vec4(clamp(vel, -8.0, 8.0), 0.0, 1.0);
  }`);

// Divergence of velocity (with closed-boundary reflection).
const divU = { tVel: { value: null }, uTexel: { value: new THREE.Vector2() } };
const divPass = makePass(divU, /* glsl */`
  uniform sampler2D tVel;
  uniform vec2 uTexel;
  varying vec2 vUv;
  void main() {
    float L = texture2D(tVel, vUv - vec2(uTexel.x, 0.0)).x;
    float R = texture2D(tVel, vUv + vec2(uTexel.x, 0.0)).x;
    float B = texture2D(tVel, vUv - vec2(0.0, uTexel.y)).y;
    float T = texture2D(tVel, vUv + vec2(0.0, uTexel.y)).y;
    vec2 c = texture2D(tVel, vUv).xy;
    if (vUv.x - uTexel.x < 0.0) L = -c.x;
    if (vUv.x + uTexel.x > 1.0) R = -c.x;
    if (vUv.y - uTexel.y < 0.0) B = -c.y;
    if (vUv.y + uTexel.y > 1.0) T = -c.y;
    gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
  }`);

// Jacobi pressure relaxation.
const jacobiU = {
  tPressure: { value: null }, tDiv: { value: null },
  uTexel: { value: new THREE.Vector2() },
};
const jacobiPass = makePass(jacobiU, /* glsl */`
  uniform sampler2D tPressure, tDiv;
  uniform vec2 uTexel;
  varying vec2 vUv;
  void main() {
    float L = texture2D(tPressure, vUv - vec2(uTexel.x, 0.0)).x;
    float R = texture2D(tPressure, vUv + vec2(uTexel.x, 0.0)).x;
    float B = texture2D(tPressure, vUv - vec2(0.0, uTexel.y)).x;
    float T = texture2D(tPressure, vUv + vec2(0.0, uTexel.y)).x;
    float div = texture2D(tDiv, vUv).x;
    gl_FragColor = vec4((L + R + B + T - div) * 0.25, 0.0, 0.0, 1.0);
  }`);

// Subtract the pressure gradient — the projection that keeps it a fluid.
const gradU = {
  tPressure: { value: null }, tVel: { value: null },
  uTexel: { value: new THREE.Vector2() },
};
const gradPass = makePass(gradU, /* glsl */`
  uniform sampler2D tPressure, tVel;
  uniform vec2 uTexel;
  varying vec2 vUv;
  void main() {
    float L = texture2D(tPressure, vUv - vec2(uTexel.x, 0.0)).x;
    float R = texture2D(tPressure, vUv + vec2(uTexel.x, 0.0)).x;
    float B = texture2D(tPressure, vUv - vec2(0.0, uTexel.y)).x;
    float T = texture2D(tPressure, vUv + vec2(0.0, uTexel.y)).x;
    vec2 vel = texture2D(tVel, vUv).xy - 0.5 * vec2(R - L, T - B);
    gl_FragColor = vec4(vel, 0.0, 1.0);
  }`);

// ------------------------------------------------------------- particles
// 512x512 = 262,144 particles. RGBA float texel = position xy (world
// units, same space as the velocity field) + velocity zw. NearestFilter,
// each particle owns exactly one texel.
const PART_DIM = 512;
const HASH2 = /* glsl */`
  vec2 hash2(vec2 p) {
    return fract(sin(vec2(dot(p, vec2(127.1, 311.7)),
                          dot(p, vec2(269.5, 183.3)))) * 43758.5453);
  }`;

// Authored attractor force fields. cfg selects the shape, A packs the
// anchors: xy = center, z = swirl / radius / amplitude, w = phase.
// Spring toward the shape (force ~ distance, capped) so particles
// oscillate around it under drag instead of pinning to a point.
const ATTR_GLSL = /* glsl */`
  vec2 attrForce(float cfg, vec4 A, vec2 p) {
    if (cfg < 0.5) { // orbit: pull to a center plus tangential swirl
      vec2 d = A.xy - p;
      float r = length(d) + 1e-4;
      vec2 n = d / r;
      return n * min(r, 0.5) * 2.2 + vec2(-n.y, n.x) * A.z;
    } else if (cfg < 1.5) { // twin poles, mirrored through the origin
      vec2 d1 = A.xy - p;
      vec2 d2 = -A.xy - p;
      float r1 = length(d1) + 1e-4, r2 = length(d2) + 1e-4;
      return ((d1 / r1) * min(r1, 0.4) + (d2 / r2) * min(r2, 0.4)) * 2.0;
    } else if (cfg < 2.5) { // ring: pull to a circle of radius A.z
      vec2 d = p - A.xy;
      float r = length(d) + 1e-4;
      vec2 n = d / r;
      return -n * clamp(r - A.z, -0.6, 0.6) * 2.8 + vec2(-n.y, n.x) * 0.35;
    }
    // sine ribbon across the frame, slow lateral wind
    float yc = A.y + A.z * sin(p.x * 6.5 + A.w);
    return vec2(0.14, -clamp(p.y - yc, -0.6, 0.6) * 2.8);
  }`;

// Seed pass — scatter over the frame, tiny random velocities.
const partInitU = { uAspect: { value: 1 } };
const partInitPass = makePass(partInitU, /* glsl */`
  uniform float uAspect;
  varying vec2 vUv;
  ${HASH2}
  void main() {
    vec2 h = hash2(vUv * 501.3);
    vec2 h2 = hash2(vUv * 97.7 + 3.1);
    gl_FragColor = vec4((h - 0.5) * vec2(uAspect, 1.0) * 0.92, (h2 - 0.5) * 0.2);
  }`);

// Update pass — drag toward the fluid velocity (inertia keeps the cloud
// silky where raw advection reads twitchy), add the eased attractor
// force, integrate, respawn strays. Clamps mirror the sim's ±8.
const partU = {
  tPos: { value: null }, tVel: { value: null },
  uDt: { value: 0 }, uAspect: { value: 1 }, uTime: { value: 0 },
  uPull: { value: 0 }, uKick: { value: 0 }, uMorph: { value: 1 },
  uCfgA: { value: 0 }, uCfgB: { value: 0 },
  uAnchorA: { value: new THREE.Vector4() },
  uAnchorB: { value: new THREE.Vector4() },
  uBurst: { value: new THREE.Vector4() }, // xy point, z reseed fraction, w radius
};
const partPass = makePass(partU, /* glsl */`
  uniform sampler2D tPos, tVel;
  uniform float uDt, uAspect, uTime, uPull, uKick, uMorph, uCfgA, uCfgB;
  uniform vec4 uAnchorA, uAnchorB, uBurst;
  varying vec2 vUv;
  ${HASH2}
  ${ATTR_GLSL}
  void main() {
    vec4 st = texture2D(tPos, vUv);
    vec2 p = st.xy, v = st.zw;
    vec2 fuv = clamp(p * vec2(1.0 / uAspect, 1.0) + 0.5, 0.0, 1.0);
    vec2 fv = texture2D(tVel, fuv).xy;
    v += (fv - v) * (1.0 - exp(-uDt * 3.0));
    float m = uMorph * uMorph * (3.0 - 2.0 * uMorph);
    // per-particle anchor jitter gives the shapes a soft cross-section:
    // without it the whole cloud collapses onto a needle-thin curve
    vec2 pj = p - (hash2(vUv * 17.9) - 0.5) * 0.22;
    vec2 force = mix(attrForce(uCfgA, uAnchorA, pj),
                     attrForce(uCfgB, uAnchorB, pj), m);
    v += force * uPull * (1.0 + uKick * 0.8) * uDt;
    v = clamp(v, vec2(-8.0), vec2(8.0));
    p += v * uDt;
    // negated in-bounds test so NaN also lands in the respawn branch
    vec2 hb = vec2(uAspect * 0.5, 0.5);
    if (!(abs(p.x) <= hb.x + 0.08) || !(abs(p.y) <= hb.y + 0.08)) {
      p = (hash2(vUv * 913.7 + uTime) - 0.5) * 2.0 * hb * 0.95;
      v = vec2(0.0);
    }
    if (uBurst.z > 0.0 && hash2(vUv * 57.3 + uTime).x < uBurst.z) {
      vec2 j = (hash2(vUv * 771.1 + uTime) - 0.5) * uBurst.w * 2.0;
      p = uBurst.xy + j;
      v = j * 6.0;
    }
    gl_FragColor = vec4(p, v);
  }`);

// Draw pass — additive points, position fetched from the state texture.
// Per-particle palette slot by hash (mid-heavy, glow rare); speed pushes
// color toward glow; local dye tints so the cloud carries the ink hues.
const pointsU = {
  tPos: { value: null }, tDye: { value: null },
  uAspect: { value: 1 }, uSize: { value: 2 }, uGain: { value: 0 },
  uMid: { value: PAL.mid }, uAccent: { value: PAL.accent }, uGlow: { value: PAL.glow },
};
const pointsMat = new THREE.ShaderMaterial({
  uniforms: pointsU,
  transparent: true,
  depthWrite: false,
  depthTest: false,
  blending: THREE.AdditiveBlending,
  vertexShader: /* glsl */`
    uniform sampler2D tPos;
    uniform float uAspect, uSize;
    varying vec2 vSeed;
    varying vec2 vFuv;
    varying float vSpeed;
    ${HASH2}
    void main() {
      vec2 luv = position.xy;
      vec4 st = texture2D(tPos, luv);
      vSeed = luv;
      vFuv = clamp(st.xy * vec2(1.0 / uAspect, 1.0) + 0.5, 0.0, 1.0);
      vSpeed = length(st.zw);
      gl_Position = vec4(st.x * 2.0 / uAspect, st.y * 2.0, 0.0, 1.0);
      gl_PointSize = max(1.0, uSize * (0.6 + 0.8 * hash2(luv * 41.3).x));
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDye;
    uniform float uGain;
    uniform vec3 uMid, uAccent, uGlow;
    varying vec2 vSeed;
    varying vec2 vFuv;
    varying float vSpeed;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      float a = smoothstep(0.5, 0.12, d);
      float h = fract(sin(dot(vSeed, vec2(127.1, 311.7))) * 43758.5453);
      vec3 base = h < 0.55 ? uMid : (h < 0.85 ? uAccent : uGlow);
      vec3 col = mix(base, uGlow, min(1.0, vSpeed * 0.5));
      col += texture2D(tDye, vFuv).rgb * 0.5;
      gl_FragColor = vec4(col * (a * uGain * (0.35 + min(1.4, vSpeed) * 0.8)), 1.0);
    }`,
});
const pointsGeo = new THREE.BufferGeometry();
{
  const lookup = new Float32Array(PART_DIM * PART_DIM * 3);
  for (let y = 0, i = 0; y < PART_DIM; y++) {
    for (let x = 0; x < PART_DIM; x++, i += 3) {
      lookup[i] = (x + 0.5) / PART_DIM;
      lookup[i + 1] = (y + 0.5) / PART_DIM;
    }
  }
  pointsGeo.setAttribute('position', new THREE.BufferAttribute(lookup, 3));
}
const points = new THREE.Points(pointsGeo, pointsMat);
points.frustumCulled = false;
points.renderOrder = 1;
points.visible = false; // stays hidden until the first update fills tPos
scene.add(points);

// ------------------------------------------------------------- targets
let velA = null, velB = null, dyeA = null, dyeB = null, prA = null, prB = null, divT = null;
let aspect = 1;

function makeTarget(w, h) {
  return new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false, // sim passes are fullscreen quads
  });
}

function ensureSim(renderer) {
  const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
  // A hidden pane's drawing buffer can report 0x0; 0/0 is NaN and a
  // NaN-sized target is an incomplete framebuffer.
  aspect = buf.x > 0 && buf.y > 0 ? buf.x / buf.y : 1;
  const vh = 192, vw = Math.min(768, Math.round(vh * aspect));
  const dh = 640, dw = Math.min(2048, Math.round(dh * aspect));
  if (velA && velA.width === vw && dyeA && dyeA.width === dw) return;
  for (const t of [velA, velB, dyeA, dyeB, prA, prB, divT]) t && t.dispose();
  velA = makeTarget(vw, vh); velB = makeTarget(vw, vh);
  dyeA = makeTarget(dw, dh); dyeB = makeTarget(dw, dh);
  prA = makeTarget(vw, vh); prB = makeTarget(vw, vh);
  divT = makeTarget(vw, vh);
}

function run(pass, target) {
  ctx.renderer.setRenderTarget(target);
  pass.render(ctx.renderer);
}

// Particle state targets are fixed-size (independent of the drawing
// buffer) and created once. Full float where the hardware renders to it
// (universal on the Macs we ship to): half-float position texels
// quantize to ~1 px at 1080p and the cloud shimmers.
let posA = null, posB = null;

function ensureParticles(renderer) {
  if (posA) return;
  const type = (renderer.capabilities.isWebGL2 &&
    renderer.extensions.get('EXT_color_buffer_float'))
    ? THREE.FloatType : THREE.HalfFloatType;
  const make = () => new THREE.WebGLRenderTarget(PART_DIM, PART_DIM, {
    type,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
  });
  posA = make(); posB = make();
  partInitU.uAspect.value = aspect;
  run(partInitPass, posA);
}

// ------------------------------------------------------------- state
let splatAngle = 0;
let splatIx = 0;
let ambient = 0.6;
let hueTick = 0;
const _col = new THREE.Color();

// Attractor configuration state. ACCENTED kicks snap to a new shape,
// gated (strength threshold + minimum rest) per the structural-change
// rule; the shader crossfades old force field to new over ~2 s so the
// cloud reshapes deliberately. Quiet grooves still turn over on the
// long fallback. Anchors place on the golden angle like the dye splats.
let cfgA = 0, cfgB = 0, attrMorph = 1;
let lastSnap = -10;
let attrAngle = 1.7;
const anchorA = new THREE.Vector4(0, 0, 0.9, 0);
const anchorB = new THREE.Vector4(0, 0, 0.9, 0);

function snapAttractors(P) {
  cfgA = cfgB;
  anchorA.copy(anchorB);
  attrMorph = 0;
  cfgB = (cfgB + 1 + Math.floor(Math.random() * 3)) % 4;
  attrAngle += 2.399963;
  const orbit = (0.08 + 0.3 * P.shape);
  const cx = Math.cos(attrAngle) * orbit * Math.min(1, aspect * 0.6);
  const cy = Math.sin(attrAngle) * orbit * 0.7;
  // z is per-shape: orbit swirl, ring radius, ribbon amplitude
  const z = cfgB === 0 ? 0.7 + 0.9 * P.shape
    : cfgB === 2 ? 0.16 + 0.2 * P.shape
    : cfgB === 3 ? 0.08 + 0.14 * P.shape
    : 0;
  anchorB.set(cx, cy, z, Math.random() * Math.PI * 2);
}

const sstep = (a, b, x) => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};
const _buf = new THREE.Vector2();

function splat(vel, dye, px, py, vx, vy, radius, color, dyeAmt) {
  splatU.uPoint.value.set(px, py);
  splatU.uRadius.value = radius;
  splatU.uAspect.value = aspect;
  splatU.tSrc.value = vel[0].texture;
  splatU.uValue.value.set(vx, vy, 0);
  run(splatPass, vel[1]);
  vel.reverse();
  if (dyeAmt > 0) {
    splatU.tSrc.value = dye[0].texture;
    splatU.uValue.value.set(color.r * dyeAmt, color.g * dyeAmt, color.b * dyeAmt);
    run(splatPass, dye[1]);
    dye.reverse();
  }
}

return { // vjw: was `export default {`
  name: 'fluid',
  scene,
  camera,
  bloom: { strength: 0.4, gain: 0.45 },
  params: { speed: 0.5, shape: 0.5, complexity: 0.5, density: 0.6, fill: 0.5, contrast: 0.5 },
  update(s, dt, t) {
    if (!ctx.renderer) return;
    ensureSim(ctx.renderer);
    const P = this.params;
    const spF = drastic(P.speed);
    const dtS = Math.min(dt, 1 / 30) * spF;
    const vel = [velA, velB], dye = [dyeA, dyeB], pr = [prA, prB];
    const vTexel = new THREE.Vector2(1 / velA.width, 1 / velA.height);

    // --- advect velocity, then billow it
    advectU.tVel.value = vel[0].texture;
    advectU.tSrc.value = vel[0].texture;
    advectU.uDt.value = dtS;
    advectU.uDiss.value = Math.exp(-dtS * 0.4);
    advectU.uAspect.value = aspect;
    run(advectPass, vel[1]); vel.reverse();

    curlU.tVel.value = vel[0].texture;
    curlU.uTexel.value.copy(vTexel);
    run(curlPass, divT); // reuse divT as the curl buffer pre-divergence
    vortU.tVel.value = vel[0].texture;
    vortU.tCurl.value = divT.texture;
    vortU.uEps.value = (4 + 34 * P.complexity) * (1 + s.sub * 0.8);
    vortU.uDt.value = dtS;
    vortU.uTexel.value.copy(vTexel);
    run(vortPass, vel[1]); vel.reverse();

    // --- audio → splats. Kicks orbit the frame on the golden angle so
    // consecutive hits never stack; direction is outward + a twist.
    const radius = 0.05 + 0.13 * P.fill;
    if (s.onKick) {
      splatAngle += 2.399963;
      const orbit = 0.1 + 0.42 * P.shape;
      const px = Math.cos(splatAngle) * orbit * Math.min(1, aspect * 0.6);
      const py = Math.sin(splatAngle) * orbit * 0.7;
      const dir = Math.atan2(py, px) + (0.4 + 0.5 * P.shape);
      const mag = (1.1 + 1.6 * Math.min(1.5, s.onKick + s.kick)) * spF;
      const cols = [PAL.mid, PAL.accent, PAL.glow];
      _col.copy(cols[splatIx++ % 3]);
      splat(vel, dye, px, py, Math.cos(dir) * mag, Math.sin(dir) * mag,
        radius, _col, 0.5 + 0.4 * Math.min(1, s.onKick));
      // a pinch of the cloud reseeds at the splat — the particle twin of
      // the dye injection, small enough to read as a breathe
      partU.uBurst.value.set(px, py, 0.015 + 0.02 * Math.min(1, s.onKick), radius * 1.3);
    }
    if (s.onHigh > 0.45) {
      const hx = Math.sin(t * 37.7 + hueTick++) * 0.4 * aspect * 0.5;
      const hy = 0.18 + Math.sin(t * 53.3) * 0.22;
      _col.copy(PAL.glow);
      splat(vel, dye, hx, hy, 0, -0.35 * spF, radius * 0.4, _col, 0.22);
    }
    ambient -= dt;
    if (ambient <= 0) {
      // dye-less swirl keeps existing ink alive through quiet passages
      ambient = 0.55 + Math.random() * 0.6;
      const ax = (Math.random() - 0.5) * aspect * 0.8;
      const ay = (Math.random() - 0.5) * 0.8;
      const aa = Math.random() * Math.PI * 2;
      const am = (0.25 + s.mids * 0.9) * spF;
      splat(vel, dye, ax, ay, Math.cos(aa) * am, Math.sin(aa) * am, radius * 1.6, _col, 0);
    }

    // --- projection: divergence → 22 Jacobi sweeps → subtract gradient
    divU.tVel.value = vel[0].texture;
    divU.uTexel.value.copy(vTexel);
    run(divPass, divT);
    jacobiU.tDiv.value = divT.texture;
    jacobiU.uTexel.value.copy(vTexel);
    for (let i = 0; i < 22; i++) {
      jacobiU.tPressure.value = pr[0].texture;
      run(jacobiPass, pr[1]);
      pr.reverse();
    }
    gradU.tPressure.value = pr[0].texture;
    gradU.tVel.value = vel[0].texture;
    gradU.uTexel.value.copy(vTexel);
    run(gradPass, vel[1]); vel.reverse();

    // --- advect dye through the projected field
    advectU.tVel.value = vel[0].texture;
    advectU.tSrc.value = dye[0].texture;
    advectU.uDt.value = dtS;
    advectU.uDiss.value = Math.exp(-dtS * (1.5 - 1.42 * P.density));
    run(advectPass, dye[1]); dye.reverse();

    // --- particle cloud rides the projected field
    ensureParticles(ctx.renderer);
    if (s.onKick && t - lastSnap > 3.2 && (s.onKick > 0.55 || t - lastSnap > 8)) {
      lastSnap = t;
      snapAttractors(P);
    }
    attrMorph = Math.min(1, attrMorph + dt * 0.55);
    const pos = [posA, posB];
    partU.tPos.value = pos[0].texture;
    partU.tVel.value = vel[0].texture;
    partU.uDt.value = dtS;
    partU.uAspect.value = aspect;
    partU.uTime.value = t % 977; // hash seed churn, kept small for float precision
    partU.uPull.value = P.complexity * P.complexity * 4.0;
    partU.uKick.value = s.kick;
    partU.uMorph.value = attrMorph;
    partU.uCfgA.value = cfgA;
    partU.uCfgB.value = cfgB;
    partU.uAnchorA.value.copy(anchorA);
    partU.uAnchorB.value.copy(anchorB);
    run(partPass, pos[1]); pos.reverse();
    partU.uBurst.value.set(0, 0, 0, 0); // burst reseeds for one frame only
    [posA, posB] = pos;

    ctx.renderer.setRenderTarget(null);
    [velA, velB] = vel; [dyeA, dyeB] = dye; [prA, prB] = pr;

    // DENSITY crossfades ink against cloud: full dye at 0, cloud
    // dominant with a dye ghost at 1, both alive through the middle.
    const dyeMix = 1 - 0.9 * sstep(0.25, 1.0, P.density);
    const partGain = sstep(0.05, 0.75, P.density) * (0.3 + 0.7 * s.energy) * 0.16;
    displayUniforms.tDye.value = dyeA.texture;
    displayUniforms.uEnergy.value = s.energy;
    displayUniforms.uContrast.value = P.contrast;
    displayUniforms.uDyeMix.value = dyeMix;
    pointsU.tPos.value = posA.texture;
    pointsU.tDye.value = dyeA.texture;
    pointsU.uAspect.value = aspect;
    pointsU.uSize.value = (0.6 + 2.6 * P.fill) *
      Math.max(0.5, ctx.renderer.getDrawingBufferSize(_buf).y / 1080);
    pointsU.uGain.value = partGain;
    points.visible = partGain > 0.001;
  },
  resize() { /* ensureSim rebuilds from the drawing buffer each frame */ },
  // QA: read the particle state texture back and reduce to numbers
  // (verification doctrine: judge motion from distributions, not eyes).
  debugParticles() {
    if (!posA || !ctx.renderer) return null;
    if (posA.texture.type !== THREE.FloatType) return { halfFloat: true };
    const n = PART_DIM * PART_DIM;
    const px = new Float32Array(n * 4);
    ctx.renderer.readRenderTargetPixels(posA, 0, 0, PART_DIM, PART_DIM, px);
    let nan = 0, oob = 0, sx = 0, sy = 0, sxx = 0, syy = 0;
    const speeds = new Float32Array(n);
    const hbx = aspect * 0.5 + 0.09;
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const x = px[j], y = px[j + 1], vx = px[j + 2], vy = px[j + 3];
      if (x !== x || y !== y || vx !== vx || vy !== vy) { nan++; continue; }
      if (Math.abs(x) > hbx || Math.abs(y) > 0.59) oob++;
      sx += x; sy += y; sxx += x * x; syy += y * y;
      speeds[i] = Math.hypot(vx, vy);
    }
    speeds.sort();
    const q = (p) => speeds[Math.min(n - 1, Math.floor(p * n))];
    let mean = 0;
    for (let i = 0; i < n; i++) mean += speeds[i];
    return {
      n, nan, oob, cx: sx / n, cy: sy / n,
      sdx: Math.sqrt(Math.max(0, sxx / n - (sx / n) ** 2)),
      sdy: Math.sqrt(Math.max(0, syy / n - (sy / n) ** 2)),
      speed: { mean: mean / n, p50: q(0.5), p95: q(0.95), max: speeds[n - 1] },
      attr: { cfgA, cfgB, morph: attrMorph, lastSnap },
    };
  },
};
} // vjw: the factory
