// Copied from donor/vs3/visual_kit/src/scenes/grove.js (the friends' engine, used with permission, 2026-11-19).
// vjw: wrapped in a factory (one scene object per layer); nothing else changed. agents/guides/guide_vs3_port.md
// Scene: grove, an endless drift through a fractal forest. Real
// instanced geometry: three tree species grown by a recursive branching
// rule, a noise terrain the camera and every trunk both stand on, god
// ray blades and drifting motes in the air. The camera walks a winding
// corridor forever. The whole forest hangs on a path laid down in arc
// length: every tree is anchored to the path, so when a strong accent
// bends the route, the woods ahead swing to the new heading as one
// piece and a fresh corridor opens. Ordinary kicks only send a front of
// light racing away down the trail (the gate idiom). One mood control
// (the SHAPE lane, labeled mood) sweeps the world from misty daylight
// shafts to a dark forest lit by its own canopy.
import * as THREE from 'three';
import { PAL, drastic, scenePointer } from '../lib/common.js';
import { ctx } from '../lib/context.js';
export default function create() { // vjw

const scene = new THREE.Scene();
scene.background = PAL.bg;
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 300);
camera.position.set(0, 2.6, 0);

// Deterministic PRNG so the three species are stable across loads.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- terrain height field --------------------------------------------
// One 64x64 value lattice shared EXACTLY between JS and GLSL (the
// lattice is a texture, both sides run the same smoothstep bilinear),
// so trees and the camera stand on the very ground the shader
// displaces. Two octaves, cells 8 m and 32 m, world period 2048 m:
// rebases jump by multiples of 2048 and the terrain is invariant.
const HN = 64;
const heightLattice = new Float32Array(HN * HN);
{
  const rng = mulberry32(7211);
  for (let i = 0; i < HN * HN; i++) heightLattice[i] = rng();
}
const heightTex = new THREE.DataTexture(heightLattice, HN, HN, THREE.RedFormat, THREE.FloatType);
heightTex.magFilter = heightTex.minFilter = THREE.NearestFilter;
heightTex.needsUpdate = true;

function latticeAt(ix, iz) {
  return heightLattice[((iz % HN + HN) % HN) * HN + ((ix % HN + HN) % HN)];
}
function valueNoise(cx, cz) {
  const ix = Math.floor(cx), iz = Math.floor(cz);
  let fx = cx - ix, fz = cz - iz;
  fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
  const a = latticeAt(ix, iz), b = latticeAt(ix + 1, iz);
  const c = latticeAt(ix, iz + 1), d = latticeAt(ix + 1, iz + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
function groundH(x, z) {
  return (valueNoise(x / 8, z / 8) - 0.5) * 2.2
       + (valueNoise(x / 32 + 17.37, z / 32 + 9.21) - 0.5) * 5.2;
}

// The lattice noise is the detail workhorse everywhere now: bark
// fissures, leaflet speckle, soil texture, and rock moss all read the
// same 64x64 table the terrain stands on.
const NOISE_GLSL = /* glsl */`
  uniform sampler2D uHeight;
  float latticeAt(vec2 i) {
    return texture2D(uHeight, (mod(i, 64.0) + 0.5) / 64.0).r;
  }
  float valueNoise(vec2 c) {
    vec2 i = floor(c), f = c - i;
    f = f * f * (3.0 - 2.0 * f);
    float a = latticeAt(i), b = latticeAt(i + vec2(1.0, 0.0));
    float cc = latticeAt(i + vec2(0.0, 1.0)), d = latticeAt(i + vec2(1.0, 1.0));
    return a + (b - a) * f.x + (cc - a) * f.y + (a - b - cc + d) * f.x * f.y;
  }
`;
const HEIGHT_GLSL = /* glsl */`
  ${NOISE_GLSL}
  float groundH(vec2 p) {
    return (valueNoise(p / 8.0) - 0.5) * 2.2
         + (valueNoise(p / 32.0 + vec2(17.37, 9.21)) - 0.5) * 5.2;
  }
`;

// ---- baked ground detail texture --------------------------------------
// A tiling 1024px material map synthesized once at load: R soil grain,
// G interior variation for the moss, B pebbles and leaf litter, A a
// height field for bump relief. Colors never live in the texture, the
// shader mixes palette slots by these masks, so palette morphs keep
// working. One tile covers 10 m.
const GT = 1024;
function bakeGroundTex() {
  const rng = mulberry32(31415);
  const makeLat = (n) => {
    const a = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) a[i] = rng();
    return { a, n };
  };
  const lat32 = makeLat(32), lat128 = makeLat(128), latV = makeLat(16);
  const vnT = (lat, u, v) => {
    const n = lat.n;
    const x = u * n, y = v * n;
    const ix = Math.floor(x), iy = Math.floor(y);
    let fx = x - ix, fy = y - iy;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const w = (i, j) => lat.a[((j % n + n) % n) * n + ((i % n + n) % n)];
    const a = w(ix, iy), b = w(ix + 1, iy), c = w(ix, iy + 1), d = w(ix + 1, iy + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  // pebbles: rounded stamps; litter: thin elongated stamps. Both wrap.
  const stones = new Float32Array(GT * GT);
  const stamp = (cx, cy, rx, ry, ang, h) => {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const R = Math.max(rx, ry);
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const u = (ca * dx + sa * dy) / rx, v = (-sa * dx + ca * dy) / ry;
        const d = u * u + v * v;
        if (d >= 1) continue;
        const i = (((cy + dy) % GT + GT) % GT) * GT + (((cx + dx) % GT + GT) % GT);
        stones[i] = Math.max(stones[i], h * Math.pow(1 - d, 1.5));
      }
    }
  };
  for (let k = 0; k < 3800; k++) {
    const r = 2 + rng() * 5;
    stamp((rng() * GT) | 0, (rng() * GT) | 0, r, r * (0.75 + rng() * 0.3), rng() * Math.PI, 0.45 + rng() * 0.55);
  }
  for (let k = 0; k < 2200; k++) {
    stamp((rng() * GT) | 0, (rng() * GT) | 0, 3.5 + rng() * 5, 1.4 + rng() * 1.2, rng() * Math.PI, 0.3 + rng() * 0.4);
  }
  const data = new Uint8Array(GT * GT * 4);
  for (let y = 0; y < GT; y++) {
    for (let x = 0; x < GT; x++) {
      const u = x / GT, v = y / GT;
      const grain = vnT(lat32, u, v) * 0.55 + vnT(lat128, u, v) * 0.45;
      const mossVar = vnT(lat32, u + 0.31, v + 0.67) * 0.6 + vnT(lat128, u + 0.11, v + 0.43) * 0.4;
      const st = Math.min(1, stones[y * GT + x] + vnT(latV, u, v) * 0.05);
      const height = Math.min(1, grain * 0.45 + st * 0.9);
      const i = (y * GT + x) * 4;
      data[i] = grain * 255; data[i + 1] = mossVar * 255;
      data[i + 2] = st * 255; data[i + 3] = height * 255;
    }
  }
  const tex = new THREE.DataTexture(data, GT, GT, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}
const groundTex = bakeGroundTex();
let anisoSet = false;

// ---- shared uniforms (one value object, every material references it)
const U = {
  uTime: { value: 0 },
  uMood: { value: 0.15 },       // 0 misty day, 1 night biolume
  uWind: { value: 0.3 },
  uWindDir: { value: new THREE.Vector2(1, 0) },
  uGrow: { value: 4.9 },        // complexity: branch generations shown
  uFillR: { value: 1 },         // fill: limb thickness
  uLeafScale: { value: 1 },     // fill: canopy size
  uGamma: { value: 1 },         // contrast curve
  uEnergy: { value: 0.3 },
  uSparkle: { value: 0 },
  uSunDir: { value: new THREE.Vector3() },
  uSunCol: { value: new THREE.Color() },
  uAmbCol: { value: new THREE.Color() },
  uFogCol: { value: new THREE.Color() },
  uFogD: { value: 0.019 },
  uGlowC: { value: PAL.glow },
  uAccC: { value: PAL.accent },
  uMidC: { value: PAL.mid },
  uShadC: { value: PAL.shadow },
  uBgC: { value: PAL.bg },
  // Light fronts racing down the trail: xyz world position, w gain.
  uPulseA: { value: new THREE.Vector4(0, 0, 0, 0) },
  uPulseB: { value: new THREE.Vector4(0, 0, 0, 0) },
  uHeight: { value: heightTex },
  uGround: { value: groundTex },
  // The worn trail: path samples around the camera, world xz.
  uTrail: { value: Array.from({ length: 9 }, () => new THREE.Vector2()) },
};

// Every surface ends in the same air: the kick fronts, the contrast
// curve, then height-thickened exponential fog.
const AIR_GLSL = /* glsl */`
  uniform vec3 uFogCol;
  uniform float uFogD, uGamma;
  uniform vec4 uPulseA, uPulseB;
  uniform vec3 uGlowC;
  float pulseGlow(vec3 wp) {
    float da = distance(wp.xz, uPulseA.xz);
    float db = distance(wp.xz, uPulseB.xz);
    return uPulseA.w * exp(-da * da / 26.0) + uPulseB.w * exp(-db * db / 26.0);
  }
  vec3 finishAir(vec3 col, vec3 wp, float dist) {
    col += uGlowC * pulseGlow(wp) * 0.42;
    col = pow(max(col, 0.0), vec3(uGamma));
    float thick = 1.0 + 0.9 * exp(-max(wp.y, 0.0) * 0.22);
    float f = 1.0 - exp(-dist * uFogD * thick);
    return mix(col, uFogCol, f);
  }
`;

// ---- tree geometry ----------------------------------------------------
// A recursive branching rule grows each species once at load: tapered
// low poly tubes for the wood, a cutout leaf cluster on every terminal
// twig. Vertices carry a growth coordinate (generation plus fraction
// along the limb) so the growth slider can prune the crown live, and a
// sway weight so wind bends tips more than trunks.
const MAXG = 5.0;
const LEAF_GROW = 4.2;

function buildSpecies(seed) {
  const rng = mulberry32(seed);
  const wood = { pos: [], nrm: [], axis: [], info: [], idx: [] };
  const leaf = { ctr: [], corner: [], info: [] };
  const up = new THREE.Vector3(0, 1, 0);
  const tmpQ = new THREE.Quaternion();

  const leanBase = 0.05 + rng() * 0.08;
  const spread = 0.55 + rng() * 0.35;      // lateral pitch of children
  const droop = 0.06 + rng() * 0.16;       // curvature per limb
  const leafSpread = 0.35 + rng() * 0.3;

  function frame(dir) {
    const a = Math.abs(dir.y) < 0.92 ? up : new THREE.Vector3(1, 0, 0);
    const u = new THREE.Vector3().crossVectors(dir, a).normalize();
    const v = new THREE.Vector3().crossVectors(dir, u).normalize();
    return [u, v];
  }

  function tube(c0, d0, len, rad, level, swayBase, phase) {
    // Three rings along a limb that curves off its heading: the droop
    // keeps the silhouette organic instead of antenna straight.
    const bendAx = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize();
    const bend = (rng() - 0.5) * 2 * droop + (level === 0 ? 0 : droop * 0.5);
    const d1 = d0.clone().applyQuaternion(tmpQ.setFromAxisAngle(bendAx, bend)).normalize();
    const d2 = d1.clone().applyQuaternion(tmpQ.setFromAxisAngle(bendAx, bend)).normalize();
    const c1 = c0.clone().addScaledVector(d0, len * 0.5);
    const c2 = c1.clone().addScaledVector(d1, len * 0.5);
    const sides = level <= 1 ? 9 : 5;
    const rings = [[c0, d0, rad], [c1, d1, rad * 0.68], [c2, d2, rad * (level >= 4 ? 0.16 : 0.42)]];
    const base = wood.pos.length / 3;
    rings.forEach(([c, d, r], ri) => {
      const [u, v] = frame(d);
      const grow = level + ri / 2;
      const amp = swayBase + Math.pow(grow / MAXG, 2) * 0.5 * (ri / 2);
      for (let sIdx = 0; sIdx <= sides; sIdx++) {
        const th = (sIdx / sides) * Math.PI * 2;
        const nx = u.clone().multiplyScalar(Math.cos(th)).addScaledVector(v, Math.sin(th));
        // Knobbly silhouette: integer harmonics of the ring angle keep
        // the wrap seam welded. The trunk foot flares into buttress
        // roots, the single strongest realism cue a tree base has.
        let rr = r * (1 + 0.07 * Math.sin(2 * th + phase * 3.1) + 0.05 * Math.sin(5 * th + phase * 1.7));
        if (level === 0 && ri === 0) rr *= 1.22 + 0.34 * Math.max(0, Math.cos(3 * th + phase));
        const p = c.clone().addScaledVector(nx, rr);
        wood.pos.push(p.x, p.y, p.z);
        wood.nrm.push(nx.x, nx.y, nx.z);
        wood.axis.push(c.x, c.y, c.z);
        wood.info.push(grow, amp, phase, 0);
      }
    });
    const stride = sides + 1;
    for (let ri = 0; ri < 2; ri++) {
      for (let sIdx = 0; sIdx < sides; sIdx++) {
        const a = base + ri * stride + sIdx;
        wood.idx.push(a, a + 1, a + stride, a + 1, a + stride + 1, a + stride);
      }
    }
    return { tip: c2, tipDir: d2 };
  }

  function leaves(tip, phase) {
    const k = 5;
    for (let i = 0; i < k; i++) {
      const off = new THREE.Vector3(rng() - 0.5, rng() * 0.7 - 0.15, rng() - 0.5)
        .normalize().multiplyScalar((0.12 + rng() * 0.4) * leafSpread * 2.2);
      const c = tip.clone().add(off);
      // Low limbs can dive, and slopes rise to meet them: no cluster
      // below head height, the canopy blobs read as glowing boulders
      // down there.
      if (c.y < 1.6) continue;
      const size = 0.24 + rng() * 0.38;
      const key = rng();
      for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]) {
        leaf.ctr.push(c.x, c.y, c.z);
        leaf.corner.push(cx, cy);
        leaf.info.push(LEAF_GROW, size, phase + i * 1.7, key);
      }
    }
  }

  function branch(origin, dir, len, rad, level, swayBase) {
    const phase = rng() * Math.PI * 2;
    const { tip, tipDir } = tube(origin, dir, len, rad, level, swayBase, phase);
    const tipSway = swayBase + Math.pow((level + 1) / MAXG, 2) * 0.5;
    if (level >= 4 || rad < 0.018) { leaves(tip, phase); return; }
    const [u, v] = frame(tipDir);
    // One leader carries the line on, laterals fan around it on golden
    // angle steps so no two limbs of a whorl stack.
    const kids = level === 0 ? 4 : (rng() < 0.4 ? 3 : 2);
    const az0 = rng() * Math.PI * 2;
    for (let i = 0; i < kids; i++) {
      const isLeader = i === 0 && level > 0;
      const t = isLeader ? 1 : (level === 0 ? 0.55 + rng() * 0.4 : 0.6 + rng() * 0.4);
      const at = origin.clone().lerp(tip, t);
      const pitch = isLeader ? 0.1 + rng() * 0.12 : spread * (0.8 + rng() * 0.5);
      const az = az0 + i * 2.399963 + rng() * 0.5;
      const axv = u.clone().multiplyScalar(Math.cos(az)).addScaledVector(v, Math.sin(az)).normalize();
      const nd = tipDir.clone()
        .applyQuaternion(tmpQ.setFromAxisAngle(axv, pitch))
        .normalize();
      // Everything reaches a little upward: pure cone trees read as
      // dead sticks, a lift toward the light reads alive. Diving limbs
      // get most of their fall taken back for the same reason.
      nd.y += 0.18;
      if (nd.y < 0) nd.y *= 0.4;
      nd.normalize();
      branch(at, nd, len * (isLeader ? 0.78 : 0.58 + rng() * 0.14),
        rad * (isLeader ? 0.68 : 0.5), level + 1, tipSway * 0.7);
    }
  }

  const trunkLen = 4.6 + rng() * 2.4;
  const lean = new THREE.Vector3((rng() - 0.5) * leanBase * 2, 1, (rng() - 0.5) * leanBase * 2).normalize();
  branch(new THREE.Vector3(0, -0.25, 0), lean, trunkLen, 0.30 + rng() * 0.08, 0, 0.02);

  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wood.pos, 3));
  wg.setAttribute('normal', new THREE.Float32BufferAttribute(wood.nrm, 3));
  wg.setAttribute('aAxis', new THREE.Float32BufferAttribute(wood.axis, 3));
  wg.setAttribute('aInfo', new THREE.Float32BufferAttribute(wood.info, 4));
  wg.setIndex(wood.idx);
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(leaf.ctr, 3));
  lg.setAttribute('aCorner', new THREE.Float32BufferAttribute(leaf.corner, 2));
  lg.setAttribute('aInfo', new THREE.Float32BufferAttribute(leaf.info, 4));
  return { wg, lg };
}

const SWAY_GLSL = /* glsl */`
  uniform float uTime, uWind;
  uniform vec2 uWindDir;
  vec3 swayOff(vec3 wp, float amp, float phase) {
    float g = sin(uTime * 1.1 + phase + wp.x * 0.11 + wp.z * 0.07)
            + 0.5 * sin(uTime * 2.3 + phase * 1.7 + wp.z * 0.13);
    return vec3(uWindDir.x, 0.12, uWindDir.y) * (g * amp * uWind * 0.22);
  }
`;

const LIGHT_GLSL = /* glsl */`
  uniform vec3 uSunDir, uSunCol, uAmbCol;
`;

const woodMat = new THREE.ShaderMaterial({
  uniforms: U,
  vertexShader: /* glsl */`
    attribute vec3 aAxis;
    attribute vec4 aInfo;
    uniform float uGrow, uFillR;
    varying vec3 vWp, vN, vLocal;
    varying float vGrow, vGate, vHash;
    ${SWAY_GLSL}
    void main() {
      // growth prunes the crown: limbs past the front pull their
      // vertices onto the centerline and vanish, a structural change,
      // never a fade.
      float gate = clamp((uGrow - aInfo.x) / 0.7, 0.0, 1.0);
      vec3 p = mix(aAxis, position, gate * uFillR);
      vec4 wp4 = instanceMatrix * vec4(p, 1.0);
      vec4 ax4 = instanceMatrix * vec4(aAxis, 1.0);
      float hash = fract(ax4.x * 0.137 + ax4.z * 0.291);
      wp4.xyz += swayOff(ax4.xyz, aInfo.y, aInfo.z) * aInfo.x / ${MAXG.toFixed(1)};
      vWp = wp4.xyz;
      vLocal = p;
      vN = normalize(mat3(instanceMatrix) * normal);
      vGrow = aInfo.x; vGate = gate; vHash = hash;
      gl_Position = projectionMatrix * viewMatrix * wp4;
    }`,
  fragmentShader: /* glsl */`
    precision highp float;
    varying vec3 vWp, vN, vLocal;
    varying float vGrow, vGate, vHash;
    uniform vec3 uMidC, uShadC, uAccC;
    uniform float uMood, uEnergy, uTime;
    ${LIGHT_GLSL}
    ${NOISE_GLSL}
    ${AIR_GLSL}
    void main() {
      if (vGate < 0.03) discard;
      vec3 n = normalize(vN);
      float g = vGrow / ${MAXG.toFixed(1)};
      float dist = distance(vWp, cameraPosition);
      // Bark: anisotropic fissures running along the limb plus a knot
      // field, carved in object space so the detail rides the sway.
      // Strong on the trunk, gone by the twigs, faded with distance so
      // far trees never shimmer.
      float barkAmt = smoothstep(3.5, 1.0, vGrow) * smoothstep(60.0, 14.0, dist);
      float fiss = valueNoise(vec2((vLocal.x + vLocal.z) * 9.0, vLocal.y * 1.7));
      float knot = valueNoise(vLocal.xy * 5.0 + vLocal.zx * 3.0);
      float ridge = fiss * 0.7 + knot * 0.3;
      n = normalize(n + barkAmt * vec3(dFdx(ridge), dFdy(ridge), 0.0) * 6.0);
      vec3 bark = mix(uShadC, uMidC, 0.15 + 0.5 * g + 0.2 * vHash);
      bark *= 1.0 - barkAmt * 0.45 * smoothstep(0.55, 0.25, ridge);
      bark += uMidC * barkAmt * 0.12 * smoothstep(0.6, 0.9, ridge);
      float dif = max(dot(n, uSunDir), 0.0) * 0.5 + 0.5;
      float skyUp = n.y * 0.5 + 0.5;
      vec3 col = bark * (uSunCol * dif * dif + uAmbCol * (0.35 + 0.45 * skyUp));
      // Night: the deep twigs light themselves, palette accent, and the
      // glow breathes with the music instead of strobing.
      float lume = smoothstep(3.0, 4.8, vGrow) * uMood;
      col += uAccC * lume * (0.25 + 0.75 * uEnergy)
           * (0.7 + 0.3 * sin(uTime * 1.7 + vHash * 21.0));
      gl_FragColor = vec4(finishAir(col, vWp, dist), 1.0);
    }`,
});

const leafMat = new THREE.ShaderMaterial({
  uniforms: U,
  vertexShader: /* glsl */`
    attribute vec2 aCorner;
    attribute vec4 aInfo;
    uniform float uGrow, uLeafScale;
    varying vec2 vC;
    varying vec3 vWp;
    varying float vKey, vHash, vGate, vPhase, vDist;
    ${SWAY_GLSL}
    void main() {
      float gate = clamp((uGrow - aInfo.x) / 0.7, 0.0, 1.0);
      vec4 wp4 = instanceMatrix * vec4(position, 1.0);
      float hash = fract(wp4.x * 0.173 + wp4.z * 0.311);
      wp4.xyz += swayOff(wp4.xyz, 0.5, aInfo.z);
      vWp = wp4.xyz; vC = aCorner; vKey = aInfo.w; vHash = hash;
      vGate = gate; vPhase = aInfo.z;
      vec4 mv = viewMatrix * wp4;
      // Clusters shrink away right at the lens: a billboard two meters
      // from the eye is a wall, not a leaf.
      float near = smoothstep(2.6, 5.5, -mv.z);
      vDist = -mv.z;
      mv.xy += aCorner * aInfo.y * uLeafScale * gate * near;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */`
    precision highp float;
    varying vec2 vC;
    varying vec3 vWp;
    varying float vKey, vHash, vGate, vPhase, vDist;
    uniform vec3 uMidC, uAccC;
    uniform float uMood, uEnergy, uSparkle, uTime;
    ${LIGHT_GLSL}
    ${NOISE_GLSL}
    ${AIR_GLSL}
    void main() {
      // Cutout foliage, hard edged so depth sorts itself and the
      // canopy reads as matter, not haze. A leaflet speckle field
      // breaks every sprite into a handful of small leaves with sky
      // holes between them; the cut bites harder toward the rim so
      // cluster edges shred instead of ending in a pancake arc.
      float ang = atan(vC.y, vC.x);
      float r = length(vC) * (1.0 + 0.22 * sin(ang * 3.0 + vPhase));
      if (r > 0.9 || vGate < 0.5 || vDist < 2.7) discard;
      vec2 lc = vC * 3.0 + vec2(vPhase * 7.7, vHash * 31.0);
      float leaflet = valueNoise(lc * 2.3) * 0.6 + valueNoise(lc * 5.1 + 13.7) * 0.4;
      float cut = 0.36 + 0.20 * smoothstep(0.45, 0.9, r);
      if (leaflet < cut) discard;
      // Interior shading: leaflet tops catch light, the cluster core
      // sits in its own shadow.
      float lshade = clamp(0.70 + 1.1 * (leaflet - cut), 0.0, 1.25);
      float occ = 0.62 + 0.38 * r;
      float top = 0.25 + 0.75 * (0.5 + 0.5 * vC.y);
      float keyJ = clamp(vKey * 0.7 + (leaflet - 0.55) * 0.5, 0.0, 1.0);
      vec3 day = mix(uMidC, uAccC, keyJ) * top;
      day *= (uSunCol * 0.9 + uAmbCol * 0.6);
      // Backlight translucency: clusters between the eye and the sun
      // glow through, the cheapest honest sunlight there is.
      vec3 vd = normalize(vWp - cameraPosition);
      day += uSunCol * pow(max(dot(vd, uSunDir), 0.0), 6.0) * 0.35 * lshade;
      day *= lshade * occ * 1.35;
      // Night canopy: about a quarter of the clusters run biolume, the
      // rest fall to embers, and the bright ones breathe slowly with
      // the music instead of strobing.
      float lit = step(0.72, fract(vKey * 7.31));
      vec3 night = mix(uAccC, uGlowC, vKey)
                 * (lit * (0.30 + 1.05 * uEnergy) * (0.65 + 0.35 * sin(uTime * 1.1 + vHash * 29.0))
                    + 0.05);
      night *= 0.6 + 0.4 * lshade;
      night += uGlowC * uSparkle * step(0.93, fract(vHash * 17.7)) * 1.5;
      vec3 col = mix(day, night, uMood);
      gl_FragColor = vec4(finishAir(col, vWp, vDist), 1.0);
    }`,
});

// ---- the forest -------------------------------------------------------
// Slots live in path space: an arc coordinate down the trail and a
// lateral offset. World transforms are recomputed from the live path
// every frame, which is what lets an accent bend swing the woods.
const SPAN = 200;          // meters of trail the forest covers
const N_SPECIES = 3;
const PER_SPECIES = 88;
const speciesGeo = [buildSpecies(101), buildSpecies(213), buildSpecies(347)];
const treeMeshes = [];
const treeSlots = [];      // per species: [{ s, x, yaw, scale, hash }]
for (let sp = 0; sp < N_SPECIES; sp++) {
  const wood = new THREE.InstancedMesh(speciesGeo[sp].wg, woodMat, PER_SPECIES);
  const leafI = new THREE.InstancedMesh(speciesGeo[sp].lg, leafMat, PER_SPECIES);
  wood.frustumCulled = leafI.frustumCulled = false;
  leafI.renderOrder = 1;
  scene.add(wood); scene.add(leafI);
  const slots = [];
  const rng = mulberry32(900 + sp);
  for (let i = 0; i < PER_SPECIES; i++) {
    const side = rng() < 0.5 ? -1 : 1;
    slots.push({
      s: ((i * N_SPECIES + sp) / (PER_SPECIES * N_SPECIES) + rng() * 0.004) * SPAN - 25,
      x: side * (3.4 + rng() * 1.8 + Math.pow(rng(), 1.6) * 30),
      yaw: rng() * Math.PI * 2,
      scale: 0.8 + rng() * 0.6,
      hash: rng(),
    });
  }
  treeSlots.push(slots);
  treeMeshes.push([wood, leafI]);
}

// ---- the path ---------------------------------------------------------
// Heading samples every 2 m. History behind the camera is frozen; the
// stretch ahead can bend. An accent eases a heading delta into a window
// 40..110 m out over about 1.6 s, so near trunks hold still and the
// far forest swings around the turn.
const DS = 2;
const AHEAD = 240, BEHIND = 40;
const NSAMP = Math.ceil((AHEAD + BEHIND) / DS) + 4;
const path = {
  s0: -BEHIND,                       // arc of sample 0
  anchor: new THREE.Vector2(0, 0),   // world pos of sample 0
  theta: new Float32Array(NSAMP),    // base heading per sample
  bendCum: new Float32Array(NSAMP),  // pending bend, cumulative
  px: new Float32Array(NSAMP),
  pz: new Float32Array(NSAMP),
  head: 0,                           // samples currently valid
  bendMix: 1,
  meanderSeed: 4.2,
};
function meanderRate(s) {
  return 0.006 * Math.sin(s * 0.011 + path.meanderSeed)
       + 0.004 * Math.sin(s * 0.0047 + path.meanderSeed * 2.7);
}
function pathAppend() {
  const i = path.head;
  const s = path.s0 + i * DS;
  path.theta[i] = (i === 0 ? 0 : path.theta[i - 1]) + meanderRate(s) * DS;
  path.bendCum[i] = i === 0 ? 0 : path.bendCum[i - 1];
  path.head++;
}
function pathShift() {
  // Advance the anchor one sample and drop the oldest. Samples this far
  // back always carry a finished (or folded) bend, so the history the
  // anchor absorbs is frozen.
  const th = path.theta[0] + path.bendCum[0] * path.bendMix;
  path.anchor.x += Math.cos(th) * DS;
  path.anchor.y += Math.sin(th) * DS;
  const n = path.head;
  for (let i = 0; i < n - 1; i++) {
    path.theta[i] = path.theta[i + 1];
    path.bendCum[i] = path.bendCum[i + 1];
  }
  path.head--; path.s0 += DS;
}
function pathIntegrate() {
  let x = path.anchor.x, z = path.anchor.y;
  for (let i = 0; i < path.head; i++) {
    path.px[i] = x; path.pz[i] = z;
    const th = path.theta[i] + path.bendCum[i] * path.bendMix;
    x += Math.cos(th) * DS; z += Math.sin(th) * DS;
  }
}
function thetaAt(s) {
  const f = (s - path.s0) / DS;
  const i = Math.max(0, Math.min(path.head - 2, Math.floor(f)));
  const t = Math.max(0, Math.min(1, f - i));
  const a = path.theta[i] + path.bendCum[i] * path.bendMix;
  const b = path.theta[i + 1] + path.bendCum[i + 1] * path.bendMix;
  return a + (b - a) * t;
}
function pathAt(s, out) {
  const f = (s - path.s0) / DS;
  const i = Math.max(0, Math.min(path.head - 2, Math.floor(f)));
  const t = Math.max(0, Math.min(1, f - i));
  out.x = path.px[i] + (path.px[i + 1] - path.px[i]) * t;
  out.z = path.pz[i] + (path.pz[i + 1] - path.pz[i]) * t;
  out.theta = thetaAt(s);
  return out;
}
function pathBend(delta, fromS) {
  // Fold whatever is still easing, then stage the new turn.
  for (let i = 0; i < path.head; i++) {
    path.theta[i] += path.bendCum[i] * path.bendMix;
    path.bendCum[i] = 0;
  }
  const sA = fromS + 40, sB = fromS + 110;
  let cum = 0;
  for (let i = 0; i < path.head; i++) {
    const s = path.s0 + i * DS;
    if (s > sA && s <= sB) {
      const w = (s - sA) / (sB - sA);
      cum += delta * (w * (1 - w) * 6) * (DS / (sB - sA));
    }
    path.bendCum[i] = cum;
  }
  path.bendMix = 0;
}

// ---- sky --------------------------------------------------------------
const skyMat = new THREE.ShaderMaterial({
  uniforms: U,
  side: THREE.BackSide, depthWrite: false,
  vertexShader: /* glsl */`
    varying vec3 vDir;
    void main() {
      vDir = position;
      vec4 mv = viewMatrix * vec4(position + cameraPosition, 1.0);
      gl_Position = (projectionMatrix * mv).xyww;
    }`,
  fragmentShader: /* glsl */`
    precision highp float;
    varying vec3 vDir;
    uniform vec3 uFogCol, uSunDir, uSunCol, uBgC, uMidC;
    uniform float uMood, uTime;
    float hash21(vec2 q) { return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }
    void main() {
      vec3 d = normalize(vDir);
      float up = clamp(d.y, 0.0, 1.0);
      vec3 zen = mix(mix(uBgC, uMidC, 0.30), uBgC * 0.55, uMood);
      vec3 col = mix(uFogCol, zen, pow(up, 0.55));
      float sun = max(dot(d, uSunDir), 0.0);
      col += uSunCol * (pow(sun, 180.0) * 3.0 + pow(sun, 7.0) * 0.32) * (1.0 - uMood);
      // Night sky: still stars on a fixed lattice, a few of them breathing.
      vec2 cell = floor(d.xz / max(d.y, 0.02) * 24.0);
      float star = step(0.987, hash21(cell)) * up;
      col += vec3(0.9) * star * uMood * (0.5 + 0.5 * sin(uTime * 0.8 + hash21(cell + 7.0) * 40.0));
      gl_FragColor = vec4(col, 1.0);
    }`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(220, 24, 12), skyMat);
sky.frustumCulled = false;
sky.renderOrder = -1;
scene.add(sky);

// ---- ground -----------------------------------------------------------
const GROUND_SEG = 100, GROUND_SIZE = 420;
const GROUND_STEP = GROUND_SIZE / GROUND_SEG;
const groundGeo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, GROUND_SEG, GROUND_SEG);
groundGeo.rotateX(-Math.PI / 2);
const groundMat = new THREE.ShaderMaterial({
  uniforms: U,
  vertexShader: /* glsl */`
    varying vec3 vWp, vN;
    ${HEIGHT_GLSL}
    void main() {
      vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
      wp.y = groundH(wp.xz);
      float e = 1.5;
      float hx = groundH(wp.xz + vec2(e, 0.0)) - groundH(wp.xz - vec2(e, 0.0));
      float hz = groundH(wp.xz + vec2(0.0, e)) - groundH(wp.xz - vec2(0.0, e));
      vN = normalize(vec3(-hx, 2.0 * e, -hz));
      vWp = wp;
      gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
    }`,
  fragmentShader: /* glsl */`
    precision highp float;
    varying vec3 vWp, vN;
    uniform vec3 uBgC, uShadC, uMidC, uAccC;
    uniform float uMood, uEnergy, uTime;
    uniform sampler2D uGround;
    uniform vec2 uTrail[9];
    ${LIGHT_GLSL}
    ${HEIGHT_GLSL}
    ${AIR_GLSL}
    void main() {
      vec3 n = normalize(vN);
      float dist = distance(vWp, cameraPosition);
      // The baked material map: one 10 m tile plus a macro read that
      // breaks the tiling. Grain, moss variation, stones, height.
      vec2 tuv = vWp.xz / 10.0;
      vec4 det = texture2D(uGround, tuv);
      vec4 mac = texture2D(uGround, tuv * 0.217 + vec2(7.31, 3.77));
      float grain = mix(det.r, mac.r, 0.35);
      float stones = det.b * (0.55 + 0.45 * mac.g);
      // Bump relief from the height channel, faded with distance so
      // the far floor stays quiet under the fog.
      float detFade = smoothstep(52.0, 10.0, dist);
      float px = 1.5 / ${GT.toFixed(1)};
      float hL = texture2D(uGround, tuv - vec2(px, 0.0)).a;
      float hR = texture2D(uGround, tuv + vec2(px, 0.0)).a;
      float hB = texture2D(uGround, tuv - vec2(0.0, px)).a;
      float hT = texture2D(uGround, tuv + vec2(0.0, px)).a;
      n = normalize(n + detFade * vec3(hL - hR, 0.0, hB - hT) * 3.2);
      // The worn trail: distance to the path polyline. Bare packed
      // dirt on the walkway, a mossy bank shouldering it.
      float dTrail = 1e6;
      for (int i = 0; i < 8; i++) {
        vec2 a = uTrail[i], b2 = uTrail[i + 1];
        vec2 ab = b2 - a, ap = vWp.xz - a;
        float ts = clamp(dot(ap, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
        dTrail = min(dTrail, length(ap - ab * ts));
      }
      float onTrail = smoothstep(3.4, 1.3, dTrail + (grain - 0.5) * 1.6);
      float bank = smoothstep(6.5, 3.2, dTrail) * (1.0 - onTrail);
      // Moss holds the world-lattice patches so the grass clumps can
      // agree with it from JS; the trail wears it away.
      float moss = smoothstep(0.5, 0.72, valueNoise(vWp.xz / 5.5 + vec2(31.7, 5.3)));
      moss = clamp(moss * (0.55 + 0.45 * det.g) + bank * 0.4, 0.0, 1.0) * (1.0 - onTrail * 0.9);
      vec3 soil = mix(uShadC, uMidC, 0.10 + 0.20 * grain);
      vec3 col = mix(soil, uMidC * (0.32 + 0.28 * det.g), moss * 0.85);
      // The walkway itself is packed warm dirt, unmistakably a path.
      vec3 dirt = mix(uMidC, uGlowC, 0.4) * (0.42 + 0.28 * grain);
      col = mix(col, dirt, onTrail * 0.6);
      col *= 0.66 + 0.55 * grain + 0.38 * stones;
      // Stones and litter catch warm light by day, wear off the trail.
      col += (uAccC * 0.5 + uGlowC * 0.5) * stones * 0.20 * (1.0 - uMood) * (1.0 - onTrail * 0.4);
      float dif = max(dot(n, uSunDir), 0.0) * 0.6 + 0.4;
      col *= (uSunCol * dif + uAmbCol * 0.75);
      // Night floor: ember specks in the moss, never on the walkway.
      float speck = step(0.965, valueNoise(vWp.xz / 1.7 + vec2(8.1, 44.2)));
      col += uAccC * speck * moss * uMood * (0.3 + 0.7 * uEnergy)
           * (0.6 + 0.4 * sin(uTime * 1.3 + grain * 50.0));
      gl_FragColor = vec4(finishAir(col, vWp, dist), 1.0);
    }`,
});
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.frustumCulled = false;
scene.add(ground);

// ---- boulders ---------------------------------------------------------
// Hash-displaced icosahedra, flat faceted, mossy on top, half sunk in
// the soil. Two variants so the field never reads as one rock stamped.
function buildRock(seed) {
  const rng = mulberry32(seed);
  const squash = new THREE.Vector3(1.15 + rng() * 0.25, 0.72 + rng() * 0.18, 1);
  const g = new THREE.IcosahedronGeometry(1, 1).toNonIndexed();
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    // Displace by a hash of the ORIGINAL vertex position: verts shared
    // across faces get the same push, so the shell stays watertight.
    const h = Math.abs(Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453) % 1;
    const rr = 0.74 + 0.5 * h;
    pos.setXYZ(i, x * rr * squash.x, y * rr * squash.y, z * rr * squash.z);
  }
  g.computeVertexNormals();
  return g;
}
const rockMat = new THREE.ShaderMaterial({
  uniforms: U,
  vertexShader: /* glsl */`
    varying vec3 vWp, vN;
    void main() {
      vec4 wp4 = instanceMatrix * vec4(position, 1.0);
      vWp = wp4.xyz;
      vN = normalize(mat3(instanceMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * wp4;
    }`,
  fragmentShader: /* glsl */`
    precision highp float;
    varying vec3 vWp, vN;
    uniform vec3 uMidC, uShadC;
    uniform float uMood;
    ${LIGHT_GLSL}
    ${NOISE_GLSL}
    ${AIR_GLSL}
    void main() {
      vec3 n = normalize(vN);
      float grain = valueNoise(vWp.xz * 2.1 + vWp.yy * 1.3);
      vec3 col = mix(uShadC, uMidC, 0.10 + 0.13 * grain);
      // Moss cap: upward faces take the palette green, but only inside
      // the same world moss patches the ground and grass agree on, and
      // dimly, a boulder is a rock wearing moss, not a bush.
      float cap = smoothstep(0.45, 0.9, n.y)
                * smoothstep(0.5, 0.72, valueNoise(vWp.xz / 5.5 + vec2(31.7, 5.3)));
      col = mix(col, uMidC * 0.30, cap * 0.55);
      float dif = max(dot(n, uSunDir), 0.0) * 0.5 + 0.5;
      col *= (uSunCol * dif * dif + uAmbCol * 0.8);
      float dist = distance(vWp, cameraPosition);
      gl_FragColor = vec4(finishAir(col, vWp, dist), 1.0);
    }`,
});
const N_ROCK = 40;
const rockMeshes = [
  new THREE.InstancedMesh(buildRock(11), rockMat, N_ROCK),
  new THREE.InstancedMesh(buildRock(23), rockMat, N_ROCK),
];
const rockSlots = [[], []];
for (let v = 0; v < 2; v++) {
  rockMeshes[v].frustumCulled = false;
  scene.add(rockMeshes[v]);
  const rng = mulberry32(4400 + v);
  for (let i = 0; i < N_ROCK; i++) {
    const side = rng() < 0.5 ? -1 : 1;
    rockSlots[v].push({
      s: ((i + rng() * 0.7) / N_ROCK) * SPAN - 25,
      x: side * (2.8 + Math.pow(rng(), 1.8) * 26),
      yaw: rng() * Math.PI * 2,
      scale: 0.22 + Math.pow(rng(), 2) * 1.5,
    });
  }
}

// ---- undergrowth ------------------------------------------------------
// Low fern shrubs: the canopy's leaflet language at ground scale.
// Blade-fan grass read as cardboard cutouts (Alec, 2026-08-16), so the
// floor cover is now camera-facing sprite clusters cut by the same
// speckle field as the tree crowns, and the two layers speak the same
// shapes. Five squashed sprites per shrub, shade-dark, clumped in the
// moss.
const tuftGeo = new THREE.BufferGeometry();
{
  const rng = mulberry32(6300);
  const ctr = [], corner = [], info = [];
  for (let k = 0; k < 5; k++) {
    const c = [(rng() - 0.5) * 0.6, 0.10 + rng() * 0.18, (rng() - 0.5) * 0.6];
    const size = 0.24 + rng() * 0.18;
    const phase = rng() * Math.PI * 2;
    const key = rng();
    const hash = rng();
    for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]) {
      ctr.push(c[0], c[1], c[2]);
      corner.push(cx, cy);
      info.push(size, phase, key, hash);
    }
  }
  tuftGeo.setAttribute('position', new THREE.Float32BufferAttribute(ctr, 3));
  tuftGeo.setAttribute('aCorner', new THREE.Float32BufferAttribute(corner, 2));
  tuftGeo.setAttribute('aInfo', new THREE.Float32BufferAttribute(info, 4));
}
const tuftMat = new THREE.ShaderMaterial({
  uniforms: U,
  vertexShader: /* glsl */`
    attribute vec2 aCorner;
    attribute vec4 aInfo;
    varying vec2 vC;
    varying vec3 vWp;
    varying float vKey, vHash, vPhase, vDist;
    ${SWAY_GLSL}
    void main() {
      vec4 wp4 = instanceMatrix * vec4(position, 1.0);
      wp4.xyz += swayOff(wp4.xyz, 0.30, aInfo.y) * (0.4 + position.y);
      vWp = wp4.xyz; vC = aCorner; vKey = aInfo.z; vPhase = aInfo.y; vHash = aInfo.w;
      float scl = length(instanceMatrix[0].xyz);
      vec4 mv = viewMatrix * wp4;
      float near = smoothstep(2.2, 4.5, -mv.z);
      vDist = -mv.z;
      // Squashed wider than tall: ground cover hugs the ground.
      mv.xy += aCorner * aInfo.x * scl * vec2(1.0, 0.62) * near;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */`
    precision highp float;
    varying vec2 vC;
    varying vec3 vWp;
    varying float vKey, vHash, vPhase, vDist;
    uniform vec3 uMidC, uShadC, uAccC;
    uniform float uMood, uEnergy, uTime;
    ${LIGHT_GLSL}
    ${NOISE_GLSL}
    ${AIR_GLSL}
    void main() {
      float ang = atan(vC.y, vC.x);
      float r = length(vC) * (1.0 + 0.2 * sin(ang * 4.0 + vPhase));
      if (r > 0.9 || vDist < 2.2) discard;
      vec2 lc = vC * 3.2 + vec2(vPhase * 9.1, vHash * 27.0);
      float leaflet = valueNoise(lc * 2.6) * 0.55 + valueNoise(lc * 5.7 + 7.9) * 0.45;
      float cut = 0.38 + 0.20 * smoothstep(0.4, 0.9, r);
      if (leaflet < cut) discard;
      float lshade = clamp(0.65 + 1.1 * (leaflet - cut), 0.0, 1.2);
      float top = 0.35 + 0.65 * (0.5 + 0.5 * vC.y);
      // Shade dwellers: darker than the canopy, lit mostly by ambient,
      // never sun-bright. The floor stays quiet under the crowns.
      vec3 day = mix(uShadC, uMidC, 0.16 + 0.24 * vKey) * top * lshade * 0.85;
      day *= (uSunCol * 0.35 + uAmbCol * 0.9);
      vec3 night = uShadC * 0.25 * lshade;
      night += uAccC * step(0.93, fract(vHash * 23.3)) * smoothstep(0.1, 0.9, vC.y)
             * (0.2 + 0.5 * uEnergy);
      vec3 col = mix(day, night, uMood);
      gl_FragColor = vec4(finishAir(col, vWp, vDist), 1.0);
    }`,
});
// Undergrowth grows in CLUMPS, not confetti: 50 clump centers, three
// shrubs each (one big, two small, tight), showing only where the
// world moss field says damp or on the trail bank, never on the
// walkway; the same lattice the ground shader reads makes the JS and
// GLSL agree about where the moss is.
const N_CLUMP = 50, PER_CLUMP = 3;
const N_TUFT = N_CLUMP * PER_CLUMP;
const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, N_TUFT);
tufts.frustumCulled = false;
scene.add(tufts);
const tuftSlots = [];
{
  const rng = mulberry32(6100);
  for (let c = 0; c < N_CLUMP; c++) {
    const side = rng() < 0.5 ? -1 : 1;
    const cs = ((c + rng() * 0.8) / N_CLUMP) * SPAN - 25;
    const cx = side * (2.6 + Math.pow(rng(), 2.0) * 10);
    for (let k = 0; k < PER_CLUMP; k++) {
      tuftSlots.push({
        s: cs + (rng() - 0.5) * 1.4,
        x: cx + (rng() - 0.5) * 1.2,
        yaw: rng() * Math.PI * 2,
        scale: k === 0 ? 0.6 + rng() * 0.35 : 0.32 + rng() * 0.22,
        hash: rng(),
      });
    }
  }
}
function mossAt(x, z) {
  const m = valueNoise(x / 5.5 + 31.7, z / 5.5 + 5.3);
  return Math.min(1, Math.max(0, (m - 0.5) / 0.22));
}

// ---- god ray blades ---------------------------------------------------
// A couple dozen translucent blades hung on the sun axis, anchored in
// path space like the trees, turned to face the camera around that
// axis every frame. Day only; at night they hand the air to the motes
// and the canopy.
const N_BEAM = 22;
const beamGeo = new THREE.PlaneGeometry(1, 1, 1, 1);
const beamMat = new THREE.ShaderMaterial({
  uniforms: U,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
  vertexShader: /* glsl */`
    varying vec2 vUvq;
    varying vec3 vWp;
    varying float vSeed;
    void main() {
      vUvq = uv;
      vec4 wp4 = instanceMatrix * vec4(position, 1.0);
      vSeed = instanceMatrix[3].x * 0.173 + instanceMatrix[3].z * 0.311;
      vWp = wp4.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp4;
    }`,
  fragmentShader: /* glsl */`
    precision highp float;
    varying vec2 vUvq;
    varying vec3 vWp;
    varying float vSeed;
    uniform vec3 uSunCol;
    uniform float uMood, uEnergy, uTime, uFogD;
    void main() {
      float across = sin(vUvq.x * 3.14159);
      float along = sin(vUvq.y * 3.14159);
      float flick = 0.55 + 0.45 * sin(uTime * 0.4 + fract(vSeed) * 40.0);
      float dist = distance(vWp, cameraPosition);
      float depth = exp(-dist * uFogD * 0.8);
      float a = across * across * along * flick
              * (1.0 - uMood) * (0.35 + 0.65 * uEnergy) * 0.5 * depth;
      gl_FragColor = vec4(uSunCol * a, a);
    }`,
});
const beams = new THREE.InstancedMesh(beamGeo, beamMat, N_BEAM);
beams.frustumCulled = false;
beams.renderOrder = 2;
scene.add(beams);
const beamSlots = [];
{
  const rng = mulberry32(5150);
  for (let i = 0; i < N_BEAM; i++) {
    beamSlots.push({
      s: rng() * SPAN, x: (rng() - 0.5) * 24,
      len: 15 + rng() * 14, w: 1.2 + rng() * 2.4,
    });
  }
}

// ---- motes ------------------------------------------------------------
// One stateless particle cloud around the camera: dust hanging in the
// shafts by day, fireflies by night. Positions wrap in a camera box in
// the vertex shader, so there is nothing to simulate or leak.
const N_MOTE = 650;
const moteGeo = new THREE.BufferGeometry();
{
  const seed = new Float32Array(N_MOTE * 4);
  const rng = mulberry32(777);
  for (let i = 0; i < N_MOTE; i++) {
    seed[i * 4] = rng(); seed[i * 4 + 1] = rng();
    seed[i * 4 + 2] = rng(); seed[i * 4 + 3] = rng();
  }
  moteGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N_MOTE * 3), 3));
  moteGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
}
const moteMat = new THREE.ShaderMaterial({
  uniforms: U,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: /* glsl */`
    attribute vec4 aSeed;
    uniform float uTime;
    varying float vHash, vDepth;
    void main() {
      const vec3 BOX = vec3(30.0, 11.0, 46.0);
      vec3 drift = vec3(0.14, 0.05 * sin(uTime * 0.5 + aSeed.x * 20.0), 0.10) * uTime;
      vec3 p = mod(aSeed.xyz * BOX + drift + aSeed.wxy * 37.0, BOX) - BOX * 0.5;
      p += cameraPosition * vec3(1.0, 0.0, 1.0);
      p.y += 4.0;
      vHash = aSeed.w;
      vec4 mv = viewMatrix * vec4(p, 1.0);
      vDepth = -mv.z;
      gl_PointSize = (3.0 + aSeed.y * 3.5) * (180.0 / max(2.0, -mv.z));
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */`
    precision highp float;
    varying float vHash, vDepth;
    uniform vec3 uGlowC, uAccC, uSunCol;
    uniform float uMood, uEnergy, uSparkle, uTime;
    void main() {
      vec2 q = gl_PointCoord - 0.5;
      float a = smoothstep(0.5, 0.1, length(q));
      float fog = exp(-vDepth * 0.03);
      // Day: all of them, faint sunlit dust. Night: a chosen few burn
      // as fireflies, the rest go out.
      float fly = step(0.86, vHash);
      float twinkle = 0.4 + 0.6 * sin(uTime * (1.5 + vHash * 2.0) + vHash * 90.0);
      // Day dust was cut on Alec's call (2026-08-16): bright specks in
      // the air read as noise. The cloud is night fireflies only now.
      float night = uMood * fly * twinkle * (0.25 + 0.75 * uEnergy) * 2.0;
      night += uMood * uSparkle * fly * 1.2;
      vec3 col = mix(uAccC, uGlowC, vHash);
      float g = a * fog * night;
      gl_FragColor = vec4(col * g, g);
    }`,
});
const motes = new THREE.Points(moteGeo, moteMat);
motes.frustumCulled = false;
motes.renderOrder = 3;
scene.add(motes);

// ---- state ------------------------------------------------------------
let camS = 0;
let camY = 2.6;
let mood = 0.15;
let wind = 0.3;
let windAng = 0.6;
let energySm = 0.3;
let sparkle = 0;
let holdSlow = 1;
let lastBend = -10;
let bendSide = 1;
let roll = 0;
const gaze = new THREE.Vector2(0, 0);
const pulses = [];   // { s, gain, age }
const _pt = { x: 0, z: 0, theta: 0 };
const _look = { x: 0, z: 0, theta: 0 };
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _pos = new THREE.Vector3();
const _scl = new THREE.Vector3();
const _axisY = new THREE.Vector3(0, 1, 0);
const _sunFwd = new THREE.Vector3();
const _side = new THREE.Vector3();
const _bx = new THREE.Vector3();
const _by = new THREE.Vector3();
const _bz = new THREE.Vector3();
const _view = new THREE.Vector3();
const _lookV = new THREE.Vector3();
const SUN_AZ = 0.9, SUN_EL = 0.38;
const _white = new THREE.Color(1, 1, 1);
const _dayFog = new THREE.Color();
const _nightFog = new THREE.Color();

// The engine clamps dt and skips dt <= 0; everything here integrates in
// time constant form, so the scene is frame rate honest.
return { // vjw: was `export default {`
  name: 'grove',
  scene,
  camera,
  bloom: { strength: 0.28, gain: 0.38 },
  // SHAPE is the mood ride (day mist to night glow); COMPLEXITY is the
  // growth front. Both automatable under their own names.
  paramLabels: { '*': { shape: 'mood', complexity: 'growth' } },
  params: { speed: 0.5, shape: 0.15, complexity: 0.55, density: 0.6, fill: 0.5, contrast: 0.5 },
  // QA probes: camera arc, live heading, bend state, pulse count.
  _qa() {
    return {
      camS, heading: thetaAt(camS), bendMix: path.bendMix,
      lastBend, pulses: pulses.length, head: path.head, mood,
    };
  },
  update(s, dt, t) {
    const P = this.params;
    const spF = drastic(P.speed);

    // --- audio state
    energySm += (s.energy - energySm) * (1 - Math.exp(-dt * 3));
    const windTgt = 0.22 + s.mids * 1.0 + s.sub * 0.35;
    wind += (windTgt - wind) * (1 - Math.exp(-dt * 1.2));
    windAng += dt * 0.05;
    if (s.onHigh) sparkle = Math.min(1.2, sparkle + s.onHigh * 0.8);
    sparkle += -sparkle * (1 - Math.exp(-dt * 3.5));

    // Ordinary kicks: a front of light races away down the trail.
    if (s.onKick && pulses.length < 2) {
      pulses.push({ s: camS + 8, gain: 0.3 + 0.55 * s.onKick, age: 0 });
    }
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      p.s += dt * (20 + 10 * spF);
      p.age += dt;
      p.gain *= Math.exp(-dt * 0.9);
      if (p.gain < 0.03 || p.s > camS + AHEAD - 20) pulses.splice(i, 1);
    }

    // Accents BEND THE PATH: gated hard (threshold plus rest) so it
    // lands on the hits that matter, alternating sides.
    if (s.onKick > 0.55 && t - lastBend > 3.2) {
      lastBend = t;
      bendSide = -bendSide;
      pathBend(bendSide * (0.5 + 0.45 * Math.random()) * (0.7 + 0.5 * s.onKick), camS);
    }
    path.bendMix = Math.min(1, path.bendMix + dt * 0.7);

    // --- drive down the path
    // Hold the mouse to ease to a stop and look around; the wind keeps
    // the forest moving while you stand.
    holdSlow += ((scenePointer.held ? 0.06 : 1) - holdSlow) * (1 - Math.exp(-dt * 2.2));
    const drift = 3.6 * spF * (0.7 + 0.3 * energySm) * holdSlow;
    camS += dt * drift;
    while (path.s0 + (path.head - 1) * DS < camS + AHEAD) pathAppend();
    while (path.s0 < camS - BEHIND) pathShift();

    // Rebase before float precision frays: the terrain period is 2048,
    // so a 2048 step is invisible everywhere.
    if (Math.abs(path.anchor.x) > 3000 || Math.abs(path.anchor.y) > 3000) {
      path.anchor.x -= Math.round(path.anchor.x / 2048) * 2048;
      path.anchor.y -= Math.round(path.anchor.y / 2048) * 2048;
    }
    pathIntegrate();

    pathAt(camS, _pt);
    const gy = groundH(_pt.x, _pt.z) + 2.55;
    camY += (gy - camY) * (1 - Math.exp(-dt * 2.5));
    const bob = Math.sin(t * 1.9 * Math.sqrt(spF)) * 0.06 * holdSlow;
    camera.position.set(_pt.x, camY + bob, _pt.z);

    // Gaze: down the trail, steered a touch by the mouse (yaw around
    // the camera, a pitch lift on top).
    let gyawT = 0, gpitchT = 0;
    if (scenePointer.ndc && performance.now() - scenePointer.lastMove < 4000) {
      gyawT = scenePointer.ndc.x * 0.6;
      gpitchT = scenePointer.ndc.y * 0.35;
    }
    gaze.x += (gyawT - gaze.x) * (1 - Math.exp(-dt * 2.2));
    gaze.y += (gpitchT - gaze.y) * (1 - Math.exp(-dt * 2.2));
    pathAt(camS + 16, _look);
    _lookV.set(_look.x - _pt.x, 0, _look.z - _pt.z)
      .applyAxisAngle(_axisY, -gaze.x);
    const lookY = groundH(_look.x, _look.z) + 2.9 + gaze.y * 6 - camera.position.y;

    // Bank into the turn: heading rate a few meters out, eased. The up
    // vector rolls about the view direction, whatever the heading.
    const turn = thetaAt(camS + 6) - thetaAt(camS);
    roll += (THREE.MathUtils.clamp(-turn * 0.9, -0.12, 0.12) - roll) * (1 - Math.exp(-dt * 1.8));
    _view.copy(_lookV).normalize();
    _side.crossVectors(_view, _axisY).normalize();
    camera.up.copy(_axisY).multiplyScalar(Math.cos(roll)).addScaledVector(_side, Math.sin(roll));
    camera.lookAt(_pt.x + _lookV.x, camera.position.y + lookY, _pt.z + _lookV.z);

    // --- world dressing
    mood += (P.shape - mood) * (1 - Math.exp(-dt * 1.4));
    U.uMood.value = mood;
    U.uTime.value = t;
    U.uWind.value = wind;
    U.uWindDir.value.set(Math.cos(windAng), Math.sin(windAng));
    U.uEnergy.value = energySm;
    U.uSparkle.value = sparkle;
    U.uGrow.value = 3.0 + 3.5 * P.complexity;
    U.uFillR.value = 0.75 + 0.55 * P.fill;
    U.uLeafScale.value = 0.45 + 1.15 * P.fill;
    U.uGamma.value = 0.75 + 0.85 * P.contrast;

    U.uSunDir.value.set(
      Math.cos(SUN_EL) * Math.cos(SUN_AZ), Math.sin(SUN_EL),
      Math.cos(SUN_EL) * Math.sin(SUN_AZ));
    U.uSunCol.value.copy(_white).lerp(PAL.glow, 0.55).multiplyScalar(1.25 * (1 - mood * 0.92));
    _dayFog.copy(PAL.bg).lerp(PAL.mid, 0.5).lerp(_white, 0.28);
    _nightFog.copy(PAL.bg).lerp(PAL.shadow, 0.3).multiplyScalar(0.75);
    U.uFogCol.value.copy(_dayFog).lerp(_nightFog, mood);
    U.uAmbCol.value.copy(U.uFogCol.value).multiplyScalar(0.5 + 0.3 * (1 - mood));
    U.uFogD.value = 0.020 - 0.006 * mood;
    scene.background = U.uFogCol.value;

    // Trail polyline for the worn-path shading, refreshed every frame
    // so it bends with the route. Anisotropy waits for the renderer.
    if (!anisoSet && ctx.renderer) {
      groundTex.anisotropy = Math.min(8, ctx.renderer.capabilities.getMaxAnisotropy());
      groundTex.needsUpdate = true;
      anisoSet = true;
    }
    for (let i = 0; i < 9; i++) {
      pathAt(camS - 10 + i * 16, _look);
      U.uTrail.value[i].set(_look.x, _look.z);
    }

    for (let pi = 0; pi < 2; pi++) {
      const u = pi === 0 ? U.uPulseA.value : U.uPulseB.value;
      const p = pulses[pi];
      if (!p) { u.set(0, 0, 0, 0); continue; }
      pathAt(p.s, _look);
      u.set(_look.x, groundH(_look.x, _look.z) + 3, _look.z,
        p.gain * Math.min(1, p.age / 0.1));
    }

    // --- forest transforms from path space
    const dens = 0.35 + 0.65 * P.density;
    for (let sp = 0; sp < N_SPECIES; sp++) {
      const slots = treeSlots[sp];
      const [wood, leafI] = treeMeshes[sp];
      for (let i = 0; i < slots.length; i++) {
        const sl = slots[i];
        while (sl.s < camS - 25) sl.s += SPAN;
        const rel = sl.s - camS;
        // Recycled trees fade up from nothing at the fog line, so the
        // forest never pops into view.
        const born = THREE.MathUtils.clamp((SPAN - 25 - rel) / 16, 0, 1);
        const gate = sl.hash < dens ? 1 : 0;
        pathAt(sl.s, _look);
        const nx = -Math.sin(_look.theta), nz = Math.cos(_look.theta);
        const wx = _look.x + nx * sl.x, wz = _look.z + nz * sl.x;
        const sc = Math.max(sl.scale * gate * born, 1e-4);
        _pos.set(wx, groundH(wx, wz) - 0.1, wz);
        _q.setFromAxisAngle(_axisY, sl.yaw);
        _scl.set(sc, sc, sc);
        _m.compose(_pos, _q, _scl);
        wood.setMatrixAt(i, _m);
        leafI.setMatrixAt(i, _m);
      }
      wood.instanceMatrix.needsUpdate = true;
      leafI.instanceMatrix.needsUpdate = true;
    }

    // --- boulders and tufts ride the same path space
    for (let v = 0; v < 2; v++) {
      const mesh = rockMeshes[v];
      const slots = rockSlots[v];
      for (let i = 0; i < slots.length; i++) {
        const sl = slots[i];
        while (sl.s < camS - 25) sl.s += SPAN;
        pathAt(sl.s, _look);
        const nx = -Math.sin(_look.theta), nz = Math.cos(_look.theta);
        const wx = _look.x + nx * sl.x, wz = _look.z + nz * sl.x;
        _pos.set(wx, groundH(wx, wz) - 0.24 * sl.scale, wz);
        _q.setFromAxisAngle(_axisY, sl.yaw);
        _scl.set(sl.scale, sl.scale, sl.scale);
        _m.compose(_pos, _q, _scl);
        mesh.setMatrixAt(i, _m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    for (let i = 0; i < tuftSlots.length; i++) {
      const sl = tuftSlots[i];
      while (sl.s < camS - 25) sl.s += SPAN;
      pathAt(sl.s, _look);
      const nx = -Math.sin(_look.theta), nz = Math.cos(_look.theta);
      const wx = _look.x + nx * sl.x, wz = _look.z + nz * sl.x;
      // Where grass belongs: the trail bank (lateral 2.4..6.5 m), or a
      // moss patch. Never the walkway.
      const lat = Math.abs(sl.x);
      const bank = lat > 2.4 && lat < 6.5;
      const grows = lat > 2.4 && (bank || mossAt(wx, wz) > 0.55);
      const sc = grows && sl.hash < dens * 1.15 ? sl.scale : 1e-4;
      _pos.set(wx, groundH(wx, wz) - 0.02, wz);
      _q.setFromAxisAngle(_axisY, sl.yaw);
      _scl.set(sc, sc, sc);
      _m.compose(_pos, _q, _scl);
      tufts.setMatrixAt(i, _m);
    }
    tufts.instanceMatrix.needsUpdate = true;

    // --- blades hang on the sun axis, faced to the camera around it
    _sunFwd.copy(U.uSunDir.value);
    camera.getWorldDirection(_view);
    _side.crossVectors(_sunFwd, _view);
    if (_side.lengthSq() < 0.05) _side.crossVectors(_sunFwd, _axisY);
    _side.normalize();
    for (let i = 0; i < N_BEAM; i++) {
      const b = beamSlots[i];
      while (b.s < camS) b.s += SPAN;
      pathAt(b.s, _look);
      const nx = -Math.sin(_look.theta), nz = Math.cos(_look.theta);
      _pos.set(_look.x + nx * b.x, 12 + (i % 5), _look.z + nz * b.x)
        .addScaledVector(_sunFwd, -b.len * 0.5);
      _bx.copy(_side).multiplyScalar(b.w);
      _by.copy(_sunFwd).multiplyScalar(b.len);
      _bz.crossVectors(_sunFwd, _side);
      _m.makeBasis(_bx, _by, _bz);
      _m.setPosition(_pos);
      beams.setMatrixAt(i, _m);
    }
    beams.instanceMatrix.needsUpdate = true;
    ground.position.set(
      Math.round(_pt.x / GROUND_STEP) * GROUND_STEP, 0,
      Math.round(_pt.z / GROUND_STEP) * GROUND_STEP);
  },
  resize(w, h) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  },
};
} // vjw: the factory
