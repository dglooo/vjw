// Copied from donor/vs3/visual_kit/src/scenes/forge.js (the friends' engine, used with permission, 2026-11-19).
// vjw: wrapped in a factory (one scene object per layer); nothing else changed. agents/guides/guide_vs3_port.md
// Scene: Forge — a nanite murmuration with technical purpose. 65k
// machined-metal shards flock in 3D on a GPU ping-pong sim (position +
// velocity textures, the fluid idiom): statistical boids via hashed
// neighbor taps, a cheap curl-ish wander field, and a wandering patrol
// focus the whole flock orbits (no mouse: the flock is autonomous,
// Alec 2026-07-24). ACCENTED kicks snap the
// flock into structure — cube frame, gimbal rings, exploded stack,
// schematic grid — which holds a beat and dissolves back to flight
// (structural change, never a flash; gated by threshold + min rest).
// Material is brushed chrome off the palette; iridescence is an EVENT:
// thin-film color blooms on assemblies and near the cursor, then
// drains with the impulse. Full-spectrum there is earned (2026-07-19
// relaxation); the resting flock stays palette-true.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { PAL, drastic } from '../lib/common.js';
import { ctx } from '../lib/context.js';
export default function create() { // vjw

const scene = new THREE.Scene();
scene.background = PAL.bg;
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
camera.position.set(0, 0, 7.2);

const DIM = 256; // 65,536 shards
const COUNT = DIM * DIM;

const VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`;

function makePass(uniforms, fragment) {
  return new FullScreenQuad(new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: fragment,
  }));
}

const HASH2 = /* glsl */`
  vec2 hash2(vec2 p) {
    return fract(sin(vec2(dot(p, vec2(127.1, 311.7)),
                          dot(p, vec2(269.5, 183.3)))) * 43758.5453);
  }`;

// Assembly targets: per-particle parametric positions for the technical
// forms an accent snaps the flock into. h = three per-particle hashes.
const ASM_GLSL = /* glsl */`
  vec3 asmTarget(float mode, vec3 h, float sc) {
    if (mode < 0.5) {
      // cube frame: 12 edges, particles strung along them
      float e = floor(h.x * 11.999);
      float axis = floor(e / 4.0);
      float s1 = mod(e, 2.0) * 2.0 - 1.0;
      float s2 = mod(floor(e / 2.0), 2.0) * 2.0 - 1.0;
      float tt = h.y * 2.0 - 1.0;
      vec3 p = axis < 0.5 ? vec3(tt, s1, s2)
             : axis < 1.5 ? vec3(s1, tt, s2) : vec3(s1, s2, tt);
      return p * 0.95 * sc;
    }
    if (mode < 1.5) {
      // gimbal: three orthogonal rings, a gyroscope frame
      float ring = floor(h.x * 2.999);
      float a = h.y * 6.2832;
      float r = (0.75 + ring * 0.25) * sc;
      vec3 p = ring < 0.5 ? vec3(cos(a), sin(a), 0.0)
             : ring < 1.5 ? vec3(cos(a), 0.0, sin(a))
             : vec3(0.0, cos(a), sin(a));
      return p * r;
    }
    if (mode < 2.5) {
      // exploded stack: five discs on the axis plus a thin core column
      if (h.z < 0.12) return vec3(0.0, (h.y * 2.0 - 1.0) * 1.25, 0.0) * sc;
      float disc = floor(h.x * 4.999);
      float a = h.y * 6.2832;
      float r = (0.45 + 0.4 * sin(disc * 2.1 + 1.0) + 0.25 * disc * 0.25) * sc;
      float y = (disc - 2.0) * 0.55 * sc;
      return vec3(cos(a) * r, y, sin(a) * r);
    }
    if (mode < 3.5) {
      // schematic grid: 9x9 wire plane held upright
      float G = 9.0;
      float horiz = step(0.5, h.z);
      float line = (floor(h.x * (G - 0.001)) + 0.5) / G * 2.0 - 1.0;
      float along = h.y * 2.0 - 1.0;
      vec2 g = mix(vec2(line, along), vec2(along, line), horiz);
      return vec3(g.x * 1.15, g.y * 1.15, 0.0) * sc;
    }
    if (mode < 4.5) {
      // trefoil knot with a tube cross-section
      float tt = h.x * 6.2832;
      vec3 p = vec3(
        sin(tt) + 2.0 * sin(2.0 * tt),
        cos(tt) - 2.0 * cos(2.0 * tt),
        -sin(3.0 * tt)) * 0.38;
      vec2 j = h.yz - 0.5;
      return (p + vec3(j.x, j.y, (h.y - 0.5)) * 0.12) * sc;
    }
    if (mode < 5.5) {
      // double helix with rungs
      float tt = h.x * 2.0 - 1.0;
      float a = tt * 9.0;
      if (h.z < 0.28) {
        float qa = floor(h.x * 10.0) / 10.0 * 18.0 - 9.0;
        float m = h.y * 2.0 - 1.0;
        return vec3(cos(qa) * m, qa / 9.0 * 1.3, sin(qa) * m) * 0.62 * sc;
      }
      float side = step(0.5, h.y) * 2.0 - 1.0;
      return vec3(cos(a) * side, tt * 1.3, sin(a) * side) * 0.62 * sc;
    }
    if (mode < 6.5) {
      // octahedron frame
      float e = floor(h.x * 11.999);
      float ax1 = floor(e / 4.0);
      float ax2 = mod(ax1 + 1.0, 3.0);
      float s1 = mod(e, 2.0) * 2.0 - 1.0;
      float s2 = mod(floor(e / 2.0), 2.0) * 2.0 - 1.0;
      vec3 v1 = ax1 < 0.5 ? vec3(s1, 0.0, 0.0)
              : ax1 < 1.5 ? vec3(0.0, s1, 0.0) : vec3(0.0, 0.0, s1);
      vec3 v2 = ax2 < 0.5 ? vec3(s2, 0.0, 0.0)
              : ax2 < 1.5 ? vec3(0.0, s2, 0.0) : vec3(0.0, 0.0, s2);
      return mix(v1, v2, h.y) * 1.25 * sc;
    }
    if (mode < 7.5) {
      // lissajous weave: 3:2:5 space curve, parallel strands
      float tt = h.x * 6.2832;
      float strand = (floor(h.z * 3.999) - 1.5) * 0.09;
      vec3 p = vec3(
        sin(3.0 * tt + 0.4) * (1.0 + strand),
        sin(2.0 * tt) * (0.9 + strand),
        sin(5.0 * tt + 1.1) * 0.55);
      return p * 1.05 * sc;
    }
    if (mode < 8.5) {
      // banded sphere: a filled shell gathered into latitude rings
      float th = h.x * 6.2832;
      float ca = h.y * 2.0 - 1.0;
      float band = (floor((ca * 0.5 + 0.5) * 9.0) + 0.5) / 9.0 * 2.0 - 1.0;
      float caq = mix(ca, band, 0.7);
      float sa = sqrt(max(0.0, 1.0 - caq * caq));
      return vec3(cos(th) * sa, caq, sin(th) * sa) * 1.1 * sc;
    }
    if (mode < 9.5) {
      // torus: a full donut surface, gathered into tube rings so the
      // fill keeps structure (uniform surfaces read as additive mush)
      float u = h.x * 6.2832;
      float v = h.y * 6.2832;
      float vq = (floor(h.y * 10.0) + 0.5) / 10.0 * 6.2832;
      v = mix(v, vq, 0.75);
      float R = 0.95, r = 0.36;
      return vec3((R + r * cos(v)) * cos(u), r * sin(v),
        (R + r * cos(v)) * sin(u)) * 1.0 * sc;
    }
    if (mode < 10.5) {
      // spiral galaxy: three log arms in a thin disc, dense core
      float arm = floor(h.z * 2.999);
      float tt = h.x;
      float ang = tt * 4.2 + arm * 2.094;
      float rad = 0.12 + tt * 1.35;
      float spread = 0.22 * (0.25 + tt);
      return vec3(
        cos(ang) * rad + (h.y - 0.5) * spread,
        (h.y - 0.5) * 0.14 * (1.0 - tt * 0.6),
        sin(ang) * rad + (fract(h.y * 7.7) - 0.5) * spread) * 1.05 * sc;
    }
    if (mode < 11.5) {
      // rounded monolith: a superellipsoid shell etched with a grid
      // (structure keeps the fill legible)
      vec3 d = vec3(h.x, h.y, h.z) * 2.0 - 1.0;
      float gy = (floor((d.y * 0.5 + 0.5) * 8.0) + 0.5) / 8.0 * 2.0 - 1.0;
      d.y = mix(d.y, gy, 0.6);
      d = normalize(d + vec3(1e-3));
      vec3 ad = abs(d) + 1e-4;
      float n4 = pow(dot(ad * ad, ad * ad), 0.25);
      return d / n4 * 0.92 * sc;
    }
    if (mode < 12.5) {
      // turbine: eight vertical fins around a hub column
      if (h.z < 0.2) {
        float a = h.y * 6.2832;
        return vec3(cos(a) * 0.16, (h.x - 0.5) * 1.7, sin(a) * 0.16) * sc;
      }
      float blade = floor(h.x * 7.999);
      float ba = blade * 0.7854;
      float rr = 0.22 + h.y * 0.95;
      float yy = (fract(h.x * 8.0) - 0.5) * (1.5 - h.y * 0.7);
      return vec3(cos(ba) * rr, yy, sin(ba) * rr) * 0.95 * sc;
    }
    if (mode < 13.5) {
      // atom: a dense nucleus inside three tilted electron rings
      if (h.z < 0.3) {
        vec3 d = normalize(vec3(h.x, h.y, fract(h.z * 9.7)) - 0.5 + 1e-3);
        return d * pow(fract(h.x * 5.3), 0.6) * 0.34 * sc;
      }
      float orb = floor((h.z - 0.3) / 0.7 * 2.999);
      float a = h.y * 6.2832;
      vec3 ring = vec3(cos(a) * 1.25, sin(a) * 0.5, 0.0);
      float ra = orb * 2.094;
      float cr = cos(ra), sr = sin(ra);
      ring.xy = mat2(cr, -sr, sr, cr) * ring.xy;
      ring.yz = mat2(cr, sr, -sr, cr) * ring.yz;
      return ring * sc;
    }
    if (mode < 14.5) {
      // tetrahedron: six edges plus shimmering faces
      float i1 = 0.0, i2 = 1.0;
      float e = floor(h.x * 5.999);
      i1 = e < 2.5 ? 0.0 : e < 4.5 ? 1.0 : 2.0;
      i2 = e < 0.5 ? 1.0 : e < 1.5 ? 2.0 : e < 2.5 ? 3.0
         : e < 3.5 ? 2.0 : e < 4.5 ? 3.0 : 3.0;
      vec3 v1 = i1 < 0.5 ? vec3(1.0, 1.0, 1.0) : i1 < 1.5 ? vec3(1.0, -1.0, -1.0) : vec3(-1.0, 1.0, -1.0);
      vec3 v2 = i2 < 0.5 ? vec3(1.0, 1.0, 1.0) : i2 < 1.5 ? vec3(1.0, -1.0, -1.0)
              : i2 < 2.5 ? vec3(-1.0, 1.0, -1.0) : vec3(-1.0, -1.0, 1.0);
      if (h.z < 0.6) return mix(v1, v2, h.y) * 0.8 * sc;
      // face sprinkle: blend a third vertex in
      vec3 v3 = vec3(-1.0, -1.0, 1.0);
      float w = fract(h.z * 7.1);
      return (mix(v1, v2, h.y) * (1.0 - w) + v3 * w) * 0.8 * sc;
    }
    if (mode < 15.5) {
      // mobius band
      float u = h.x * 6.2832;
      float w = (h.y - 0.5) * 0.55;
      float hf = u * 0.5;
      vec3 c = vec3(cos(u), 0.0, sin(u));
      vec3 dir = vec3(cos(hf) * cos(u), sin(hf), cos(hf) * sin(u));
      return (c + dir * w) * 1.0 * sc;
    }
    if (mode < 16.5) {
      // urchin: spikes on the 14 principal directions, dense at the tips
      float k = floor(h.x * 13.999);
      vec3 d;
      if (k < 5.5) {
        float ax = floor(k / 2.0);
        float sg = mod(k, 2.0) * 2.0 - 1.0;
        d = ax < 0.5 ? vec3(sg, 0.0, 0.0) : ax < 1.5 ? vec3(0.0, sg, 0.0) : vec3(0.0, 0.0, sg);
      } else {
        float c2 = k - 6.0;
        d = normalize(vec3(mod(c2, 2.0), mod(floor(c2 / 2.0), 2.0), mod(floor(c2 / 4.0), 2.0)) * 2.0 - 1.0);
      }
      float tt = pow(h.y, 0.6);
      vec3 j = (vec3(fract(h.z * 9.1), fract(h.z * 5.7), fract(h.z * 3.3)) - 0.5) * 0.2 * (1.0 - tt);
      return (d * (0.15 + tt * 1.3) + j) * sc;
    }
    if (mode < 17.5) {
      // vortex funnel: a tornado gathered into hoops, throat to mouth
      float tt = h.x;
      float tq = (floor(h.x * 12.0) + 0.5) / 12.0;
      tt = mix(tt, tq, 0.7);
      float ang = h.y * 6.2832 + tt * 7.0;
      float rad = 0.12 + pow(tt, 1.6) * 1.25;
      return vec3(cos(ang) * rad, (tt - 0.5) * 2.1, sin(ang) * rad) * 0.9 * sc;
    }
    // shield lattice: two nested banded spheres counter-quantized
    float th2 = h.x * 6.2832;
    float ca2 = h.y * 2.0 - 1.0;
    float shell = step(0.5, h.z);
    float bands = mix(6.0, 11.0, shell);
    float band2 = (floor((ca2 * 0.5 + 0.5) * bands) + 0.5) / bands * 2.0 - 1.0;
    float caq2 = mix(ca2, band2, 0.85);
    float sa2 = sqrt(max(0.0, 1.0 - caq2 * caq2));
    float rr2 = mix(0.75, 1.2, shell);
    return vec3(cos(th2) * sa2, caq2, sin(th2) * sa2) * rr2 * sc;
  }`;

// Wander field: layered sines, cheap and divergence-poor. Same family
// as aura's field; the flock only needs plausible turbulence.
const FIELD_GLSL = /* glsl */`
  vec3 wander(vec3 p, float t) {
    return vec3(
      sin(p.y * 1.9 + t * 0.7) + sin(p.z * 2.6 - t * 0.4) * 0.6,
      sin(p.z * 2.1 + t * 0.5) + sin(p.x * 2.4 + t * 0.6) * 0.6,
      sin(p.x * 2.2 - t * 0.55) + sin(p.y * 2.8 + t * 0.35) * 0.6);
  }`;

// Seed: a loose sphere shell, tiny random velocities, per-particle hash
// cached in pos.w so every pass agrees on each shard's identity.
const initPosU = {};
const initPosPass = makePass(initPosU, /* glsl */`
  varying vec2 vUv;
  ${HASH2}
  void main() {
    vec2 h = hash2(vUv * 501.3);
    vec2 h2 = hash2(vUv * 97.7 + 3.1);
    float a = h.x * 6.2832, ca = h.y * 2.0 - 1.0;
    float sa = sqrt(1.0 - ca * ca);
    float r = 1.0 + h2.x * 0.9;
    gl_FragColor = vec4(vec3(cos(a) * sa, ca, sin(a) * sa) * r, h2.y);
  }`);
const initVelU = {};
const initVelPass = makePass(initVelU, /* glsl */`
  varying vec2 vUv;
  ${HASH2}
  void main() {
    vec2 h = hash2(vUv * 771.7);
    vec2 h2 = hash2(vUv * 131.1 + 7.7);
    gl_FragColor = vec4((vec3(h, h2.x) - 0.5) * 0.4, 0.0);
  }`);

// Velocity pass — the boid brain. Statistical flocking: three hashed
// neighbor taps per frame give cohesion/alignment/separation without a
// neighborhood structure; the law of large numbers does the rest.
const velU = {
  tPos: { value: null }, tVel: { value: null },
  uDt: { value: 0 }, uTime: { value: 0 },
  uTarget: { value: new THREE.Vector3() },
  uHunt: { value: 1.2 },     // spring toward the target
  uOrbit: { value: 0.9 },    // tangential swirl around it
  uAvoidR: { value: 0.4 },   // hollow shell radius at the cursor
  uWanderAmp: { value: 0.8 },
  uFlock: { value: 1 },      // neighbor influence gain
  uSpread: { value: 1 },     // separation distance scale
  uAsm: { value: 0 },        // assembly impulse 0..1
  uAsmMode: { value: 0 },
  uAsmScale: { value: 1 },
  uAsmRot: { value: 0 },     // held forms tumble
  uAsmCtr: { value: new THREE.Vector3() }, // forms build at the cursor
  uBurst: { value: 0 },      // one-tick shatter impulse on dissolve
  uBreath: { value: 0 },     // ordinary-kick outward breath
  uVMax: { value: 2.4 }, uVMin: { value: 0.25 },
  uPlaneN: { value: new THREE.Vector3(0, 0, 1) },
  uPlaneK: { value: 9 },
};
const velPass = makePass(velU, /* glsl */`
  uniform sampler2D tPos, tVel;
  uniform float uDt, uTime, uHunt, uOrbit, uAvoidR, uWanderAmp, uFlock,
    uSpread, uAsm, uAsmMode, uAsmScale, uAsmRot, uBurst, uBreath,
    uVMax, uVMin, uPlaneK;
  uniform vec3 uTarget, uPlaneN, uAsmCtr;
  varying vec2 vUv;
  ${HASH2}
  ${ASM_GLSL}
  ${FIELD_GLSL}
  void main() {
    vec4 ps = texture2D(tPos, vUv);
    vec3 p = ps.xyz;
    vec3 v = texture2D(tVel, vUv).xyz;
    vec3 h3 = vec3(hash2(vUv * 41.3), ps.w);

    // three neighbor taps, re-hashed every ~0.4 s so pairings drift.
    // Influence is distance-gated: a random tap is usually far away,
    // and ungated cohesion over random pairs is just a spring to the
    // swarm centroid, which collapses everything into a ball. Only
    // nearby pairs align, so structure stays local: streams and bands.
    float slot = floor(uTime * 2.5);
    vec3 ali = vec3(0.0), sep = vec3(0.0);
    for (int i = 0; i < 3; i++) {
      vec2 nuv = hash2(vUv * (13.7 + float(i) * 7.3) + slot * 0.618);
      vec3 np = texture2D(tPos, nuv).xyz;
      vec3 nv = texture2D(tVel, nuv).xyz;
      vec3 d = np - p;
      float r = length(d) + 1e-4;
      float w = exp(-r * r * 4.0);
      ali += nv * w;
      sep -= d / (r * r) * step(r, 0.3 * uSpread);
    }
    vec3 acc = ali * 1.4 * uFlock + sep * 0.5;

    // hunt: spring to the target, capped; orbit swirl; hollow shell
    vec3 dT = uTarget - p;
    float rT = length(dT) + 1e-4;
    vec3 nT = dT / rT;
    acc += nT * min(rT, 1.4) * uHunt;
    // circulation around the target, but NOT laminar: per-shard orbit
    // gain varies, and a minority population counter-rotates. The two
    // streams shear against each other and the sheet boils and folds,
    // which is what separates a murmuration from a spirograph.
    vec3 tang = cross(uPlaneN, dT);
    float tl = length(tang) + 1e-4;
    float oGain = 0.45 + h3.x * 1.1;
    float oSign = h3.y < 0.18 ? -0.7 : 1.0;
    acc += (tang / tl) * uOrbit * oGain * oSign * smoothstep(3.4, 0.3, rT);
    acc -= nT * smoothstep(uAvoidR, 0.0, rT) * 9.0;

    // turbulence + soft bounds + kick breath
    // low-frequency turbulence carves wisps and bands; a second faster
    // octave at low amplitude gives the local flutter of wingbeats
    acc += wander(p * 0.45, uTime) * uWanderAmp;
    acc += wander(p * 1.7 + 31.0, uTime * 1.9) * uWanderAmp * 0.3;
    float rr = length(p);
    if (rr > 3.1) acc -= p / rr * (rr - 3.1) * 6.0;
    // the sheet is a TENDENCY, not a constraint: soft spring toward a
    // slowly banking plane keeps the edge-on drama while the flock
    // stays a thick fluttering lens instead of a paper-thin disc
    acc -= uPlaneN * dot(uPlaneN, p - uTarget) * uPlaneK;
    acc += (p / max(rr, 1e-3)) * uBreath;

    // assembly overrides: strong spring to the form, other urges damped.
    // The form tumbles while held, and it builds AT THE CURSOR, so the
    // player carries the construct around the frame.
    float af = uAsm * uAsm * (3.0 - 2.0 * uAsm);
    vec3 tgt = asmTarget(uAsmMode, h3, uAsmScale);
    float cr = cos(uAsmRot), sr = sin(uAsmRot);
    tgt.xz = mat2(cr, -sr, sr, cr) * tgt.xz;
    float cr2 = cos(uAsmRot * 0.37), sr2 = sin(uAsmRot * 0.37);
    tgt.yz = mat2(cr2, -sr2, sr2, cr2) * tgt.yz;
    tgt += uAsmCtr;
    acc = mix(acc, (tgt - p) * 26.0, af * 0.97);
    v = mix(v, v * exp(-uDt * 11.0), af); // settle crisp inside the form
    // shatter exit: one hard outward tick as the form lets go
    if (uBurst > 0.0) {
      vec3 dB = p - uAsmCtr;
      v += normalize(dB + vec3(1e-4)) * uBurst * (0.6 + h3.x * 0.9);
    }

    v += acc * uDt;
    // drag spreads the speed distribution; without it every shard
    // integrates to the clamp and the flock loses its dynamics
    v *= exp(-uDt * 1.3);
    // damp (do not kill) the off-plane velocity: full removal ironed
    // the flock into laminar rings and it stopped reading as a swarm
    float vn = dot(v, uPlaneN);
    v -= uPlaneN * vn * (1.0 - exp(-uDt * 1.2)) * (1.0 - af);
    // per-shard speed ceiling: leaders and laggards give the flock
    // depth; a uniform clamp marches everyone in lockstep
    float vCap = uVMax * (0.7 + 0.6 * h3.x);
    float sp = length(v) + 1e-5;
    float cl = clamp(sp, mix(uVMin, 0.0, af), vCap);
    v *= cl / sp;
    gl_FragColor = vec4(v, 0.0);
  }`);

// Position pass — integrate, respawn NaN or escaped strays.
const posU = {
  tPos: { value: null }, tVel: { value: null },
  uDt: { value: 0 }, uTime: { value: 0 },
};
const posPass = makePass(posU, /* glsl */`
  uniform sampler2D tPos, tVel;
  uniform float uDt, uTime;
  varying vec2 vUv;
  ${HASH2}
  void main() {
    vec4 ps = texture2D(tPos, vUv);
    vec3 p = ps.xyz + texture2D(tVel, vUv).xyz * uDt;
    // negated in-bounds test so NaN lands in the respawn branch too
    if (!(abs(p.x) < 4.0) || !(abs(p.y) < 4.0) || !(abs(p.z) < 4.0)) {
      vec2 h = hash2(vUv * 913.7 + uTime);
      vec2 h2 = hash2(vUv * 313.1 + uTime * 1.7);
      float a = h.x * 6.2832, ca = h.y * 2.0 - 1.0;
      float sa = sqrt(max(0.0, 1.0 - ca * ca));
      p = vec3(cos(a) * sa, ca, sin(a) * sa) * (1.0 + h2.x);
    }
    gl_FragColor = vec4(p, ps.w);
  }`);

// ------------------------------------------------------------- shards
// One geometry, four verts per shard: a diamond stretched along its
// velocity, faced to the camera in view space. Chrome shading off the
// palette; iridescent thin-film mixes in only on events (vIri).
const shardU = {
  tPos: { value: null }, tVel: { value: null },
  uSize: { value: 0.03 }, uVisFrac: { value: 1 },
  uGain: { value: 0.6 }, uGlint: { value: 0.5 },
  uIriAsm: { value: 0 }, uIriHunt: { value: 0 }, uAsmF: { value: 0 },
  uTarget: { value: new THREE.Vector3() },
  uTime: { value: 0 },
  uShadow: { value: PAL.shadow }, uMid: { value: PAL.mid },
  uAccent: { value: PAL.accent }, uGlow: { value: PAL.glow },
};
const shardMat = new THREE.ShaderMaterial({
  uniforms: shardU,
  transparent: true,
  depthWrite: false,
  depthTest: false,
  // DoubleSide is load-bearing: the velocity basis winds every diamond
  // the same way, and FrontSide culled the entire flock to black
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  vertexShader: /* glsl */`
    uniform sampler2D tPos, tVel;
    uniform float uSize, uVisFrac, uTime;
    uniform vec3 uTarget;
    varying vec2 vLocal;
    varying vec3 vN, vV;
    varying float vSpeed, vHash, vIri, vFade;
    void main() {
      vec2 luv = position.xy;
      float corner = position.z;
      vec4 ps = texture2D(tPos, luv);
      vec3 vel = texture2D(tVel, luv).xyz;
      vHash = ps.w;
      vSpeed = length(vel);

      vec4 pv = modelViewMatrix * vec4(ps.xyz, 1.0);
      vec3 fwd = normalize((modelViewMatrix * vec4(vel + vec3(1e-5), 0.0)).xyz);
      vec3 view = normalize(-pv.xyz);
      vec3 side = normalize(cross(fwd, view));
      vec3 nrm = normalize(cross(side, fwd));
      // per-shard fixed tilt so the flock glitters shard by shard
      float tilt = (vHash - 0.5) * 1.4;
      vN = normalize(nrm + side * tilt + fwd * (fract(vHash * 7.7) - 0.5) * 0.8);
      vV = view;

      // short chips, not streaks: the stretch was fusing the flock
      // into continuous ribbons under additive blending
      float len = uSize * (1.1 + min(vSpeed, 1.6) * 0.45);
      float wid = uSize * 0.55;
      float vis = step(fract(vHash * 13.7), uVisFrac);
      vec2 off = corner < 0.5 ? vec2(1.0, 0.0)
               : corner < 1.5 ? vec2(0.0, 1.0)
               : corner < 2.5 ? vec2(-1.0, 0.0) : vec2(0.0, -1.0);
      vLocal = off;
      pv.xyz += (fwd * off.x * len + side * off.y * wid) * vis;
      // iridescence is an event: near the hunt target it blooms
      vIri = smoothstep(1.1, 0.25, distance(ps.xyz, uTarget));
      vFade = 0.3 + 0.7 * smoothstep(-10.5, -5.2, pv.z); // depth layering
      gl_Position = projectionMatrix * pv;
    }`,
  fragmentShader: /* glsl */`
    uniform float uGain, uGlint, uIriAsm, uIriHunt, uAsmF, uTime;
    uniform vec3 uShadow, uMid, uAccent, uGlow;
    varying vec2 vLocal;
    varying vec3 vN, vV;
    varying float vSpeed, vHash, vIri, vFade;
    void main() {
      float a = 1.0 - smoothstep(0.45, 1.0, abs(vLocal.x) + abs(vLocal.y));
      vec3 L1 = normalize(vec3(0.4, 0.8, 0.6));
      vec3 L2 = normalize(vec3(-0.55, -0.25, 0.7));
      vec3 n = normalize(vN);
      // chrome: two-tone studio ramp + hard key spec + moving glint
      float lam = 0.5 + 0.5 * dot(n, L1);
      // dark metal: the body is nearly invisible, the glints ARE the
      // flock; sharp spec over per-shard random normals lights only the
      // shards aligned to the key at any instant
      vec3 col = mix(uShadow, uMid, lam) * 0.12;
      float sp1 = pow(max(dot(reflect(-vV, n), L1), 0.0), 24.0);
      float sp2 = pow(max(dot(reflect(-vV, n), L2), 0.0), 10.0);
      float wink = 0.55 + 0.45 * sin(uTime * (2.0 + vHash * 6.0) + vHash * 40.0);
      col += uGlow * sp1 * (0.8 + uGlint * 1.6) * wink + uAccent * sp2 * 0.12;
      col *= vFade;
      // the event material: thin-film ramp, assembly + hunt driven
      float iri = clamp(uIriAsm + uIriHunt * vIri, 0.0, 1.0);
      if (iri > 0.001) {
        float ph = dot(n, vV) * 1.6 + vHash * 0.35;
        vec3 film = 0.5 + 0.5 * cos(6.2832 * (ph + vec3(0.0, 0.33, 0.67)));
        col = mix(col, film * (0.35 + sp1 * 1.4 + lam * 0.5), iri * 0.8);
      }
      // speed lights the flock in flight, but an assembly must not go
      // dim just because its shards froze into place: the held form
      // stays lit while the impulse lasts
      col *= mix(0.4 + min(vSpeed, 2.0) * 0.5, 1.05, uAsmF);
      gl_FragColor = vec4(col * a * uGain, 1.0);
    }`,
});
const shardGeo = new THREE.BufferGeometry();
{
  const verts = new Float32Array(COUNT * 4 * 3);
  const idx = new Uint32Array(COUNT * 6);
  let vi = 0, ii = 0;
  for (let y = 0; y < DIM; y++) {
    for (let x = 0; x < DIM; x++) {
      const u = (x + 0.5) / DIM, v = (y + 0.5) / DIM;
      const base = vi / 3;
      for (let c = 0; c < 4; c++) {
        verts[vi++] = u; verts[vi++] = v; verts[vi++] = c;
      }
      idx[ii++] = base; idx[ii++] = base + 1; idx[ii++] = base + 2;
      idx[ii++] = base; idx[ii++] = base + 2; idx[ii++] = base + 3;
    }
  }
  shardGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  shardGeo.setIndex(new THREE.BufferAttribute(idx, 1));
}
const shards = new THREE.Mesh(shardGeo, shardMat);
shards.frustumCulled = false;
shards.visible = false; // until the first sim tick fills tPos
scene.add(shards);

// ------------------------------------------------------------- targets
let posA = null, posB = null, vlA = null, vlB = null;
function ensureSim(renderer) {
  if (posA) return;
  const type = (renderer.capabilities.isWebGL2 &&
    renderer.extensions.get('EXT_color_buffer_float'))
    ? THREE.FloatType : THREE.HalfFloatType;
  const make = () => new THREE.WebGLRenderTarget(DIM, DIM, {
    type,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
  });
  posA = make(); posB = make(); vlA = make(); vlB = make();
  run(initPosPass, posA);
  run(initVelPass, vlA);
}
function run(pass, target) {
  ctx.renderer.setRenderTarget(target);
  pass.render(ctx.renderer);
}

// ------------------------------------------------------------- state
const target = new THREE.Vector3();
const targetGoal = new THREE.Vector3();
let asm = 0;           // assembly impulse, drains so the form dissolves
let asmMode = 4;       // the form slider's detent, not a cycle
let tiltCur = 0;       // smoothed crane angle (tau 0.2 s)
let lastAsm = -10;     // accent gate: threshold + min rest
let iriAsm = 0;
let asmRot = 0;        // tumble angle of the held form
const asmCtr = new THREE.Vector3(); // where the construct builds
let burst = 0;         // one-tick shatter impulse as the form lets go
const qa = { assemblies: 0, lastMode: -1 };

return { // vjw: was `export default {`
  name: 'forge',
  scene,
  camera,
  bloom: { strength: 0.4, gain: 0.4 },
  // shape reads "form" in the panel: 18 detents, one per construct.
  // tilt is the raymarcher crane convention, bipolar around level.
  paramLabels: { '*': { shape: 'form' } },
  params: { speed: 0.5, shape: 0.25, complexity: 0.5, density: 0.7, fill: 0.5, tilt: 0.5, contrast: 0.5 },
  _qa: qa,
  _uni: { vel: velU, shard: shardU },
  update(s, dt, t) {
    if (!ctx.renderer) return;
    ensureSim(ctx.renderer);
    const P = this.params;
    const spF = drastic(P.speed);
    const conF = 0.55 + P.contrast * 0.9;
    const dtS = Math.min(dt, 1 / 30);

    // the flock patrols on its own: a slow wandering focus that the
    // mids push around faster (no mouse; Alec 2026-07-24)
    const pace = 1 + s.mids * 0.6;
    targetGoal.set(Math.sin(t * 0.13 * pace) * 1.0,
      Math.cos(t * 0.17 * pace) * 0.65, Math.sin(t * 0.09 * pace) * 0.5);
    target.lerp(targetGoal, 1 - Math.exp(-dt * 3.5));

    // STRUCTURAL kick response, accent-gated: pick the next form and
    // snap; the impulse drains slowly enough to hold about a beat.
    // Ordinary kicks stay a small outward breath.
    const asmPrev = asm;
    asm *= Math.exp(-dt * 0.55);
    iriAsm *= Math.exp(-dt * 1.6);
    // the form lets go with a bang, not a fade: one shatter tick as
    // the impulse crosses the release threshold
    burst = (asmPrev >= 0.25 && asm < 0.25) ? 2.2 : 0;
    // the form is the player's: the form slider picks the construct
    // (18 detents); moving it re-grips the flock immediately so the
    // change is visible between kicks (the sand figure convention)
    const detent = Math.min(17, Math.floor(P.shape * 18));
    if (detent !== asmMode) {
      asmMode = detent;
      asm = Math.max(asm, 0.8);
      iriAsm = Math.max(iriAsm, 0.5);
      qa.lastMode = asmMode;
    }
    // accented kicks still hammer the flock into the chosen form
    if (s.onKick > 0.6 && t - lastAsm > 1.8) {
      lastAsm = t;
      asm = 1;
      iriAsm = 0.9;
      qa.assemblies++; qa.lastMode = asmMode;
    }
    // held forms tumble; the construct stays centered
    asmRot += dt * (0.35 + s.mids * 0.4) * (asm > 0.05 ? 1 : 0);
    asmCtr.set(0, 0, 0);

    // sim tick
    velU.tPos.value = posA.texture;
    velU.tVel.value = vlA.texture;
    velU.uDt.value = dtS * spF;
    velU.uTime.value = t;
    velU.uTarget.value.copy(target);
    velU.uHunt.value = 0.45 + s.mids * 0.55;
    velU.uOrbit.value = 0.9 + s.mids * 0.9;
    velU.uAvoidR.value = 0.4;
    velU.uWanderAmp.value = (0.5 + P.complexity * 1.7) * (0.6 + s.energy * 0.8);
    velU.uFlock.value = 0.6 + P.complexity * 1.0;
    velU.uSpread.value = 0.8 + P.complexity * 1.2;
    velU.uAsm.value = asm;
    velU.uAsmMode.value = asmMode;
    velU.uAsmScale.value = 1.4;
    velU.uAsmRot.value = asmRot;
    velU.uAsmCtr.value.copy(asmCtr);
    velU.uBurst.value = burst;
    velU.uBreath.value = s.kick * 0.9;
    velU.uVMax.value = (1.2 + s.energy * 1.3) * spF;
    velU.uVMin.value = 0.22 * spF;
    // the sheet precesses; sub tips it harder
    const th = t * 0.09, ph = 1.05 + Math.sin(t * 0.047) * (0.45 + s.sub * 0.3);
    velU.uPlaneN.value.set(
      Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)).normalize();
    velU.uPlaneK.value = 2.6 * (1 - asm);
    run(velPass, vlB); [vlA, vlB] = [vlB, vlA];

    posU.tPos.value = posA.texture;
    posU.tVel.value = vlA.texture;
    posU.uDt.value = dtS * spF;
    posU.uTime.value = t;
    run(posPass, posB); [posA, posB] = [posB, posA];
    ctx.renderer.setRenderTarget(null);

    // draw
    shards.visible = true;
    shardU.tPos.value = posA.texture;
    shardU.tVel.value = vlA.texture;
    shardU.uSize.value = 0.012 + 0.026 * P.fill;
    shardU.uVisFrac.value = 0.25 + 0.5 * P.density;
    shardU.uGain.value = (0.08 + s.energy * 0.24) * conF;
    shardU.uGlint.value = 0.3 + s.highs * 1.2 + s.air * 0.6;
    shardU.uIriAsm.value = iriAsm;
    shardU.uAsmF.value = asm;
    shardU.uIriHunt.value = 0.3 + s.air * 0.4;
    shardU.uTarget.value.copy(target);
    shardU.uTime.value = t;

    // tilt: bipolar crane, level at center, smoothed like the
    // raymarchers (tau 0.2 s), clamped short of the pole
    const tTgt = (P.tilt - 0.5) * 1.7;
    tiltCur += (tTgt - tiltCur) * (1 - Math.exp(-dt / 0.2));
    const dist = 7.2 - s.kick * 0.3;
    camera.position.x = Math.sin(t * 0.05) * 0.9; // parallax sells the 3D
    camera.position.y = Math.sin(tiltCur) * dist;
    camera.position.z = Math.cos(tiltCur) * dist;
    camera.lookAt(0, 0, 0);
    scene.background = PAL.bg;
  },
  resize(w, h) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  },
  // QA: read a corner of the state textures back to the CPU.
  _readState(n = 64) {
    const px = new Float32Array(n * 4);
    const vx = new Float32Array(n * 4);
    const rows = Math.ceil(n / DIM) || 1;
    ctx.renderer.readRenderTargetPixels(posA, 0, 0, Math.min(n, DIM), rows, px);
    ctx.renderer.readRenderTargetPixels(vlA, 0, 0, Math.min(n, DIM), rows, vx);
    return { pos: px, vel: vx, target: target.toArray(), asm, asmMode };
  },
};
} // vjw: the factory
