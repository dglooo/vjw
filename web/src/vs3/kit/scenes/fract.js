// Copied from donor/vs3/visual_kit/src/scenes/fract.js (the friends' engine, used with permission, 2026-11-19).
// vjw: wrapped in a factory (one scene object per layer); nothing else changed. agents/guides/guide_vs3_port.md
// Scene: Fract — an endless dive into a Julia fractal.
//
// v4 architecture — "steer at what you see":
// Previous versions computed the dive target analytically (fixed points +
// inverse-iteration walks). That function is chaotic in c — it teleports
// across branch cuts — and chasing it is what caused every jump and black
// screen. v4 deletes all of it. Instead:
//   · The camera steers toward the most detailed point WITHIN the current
//     view, found by cheap CPU sampling of escape times (like a human
//     picking where to zoom). Targets are always inside the window, and
//     camera velocity is clamped relative to the window — large moves are
//     structurally impossible.
//   · The shape (c) morphs only while SHALLOW: structural sensitivity to c
//     grows exponentially with depth (a law, not a bug). Touching shape or
//     density while deep smoothly SURFACES the view, then applies.
//   · The cycle is fully continuous, no cuts ever: morph at the surface →
//     freeze → dive 30–60 s → rise back out (a real zoom-out) → morph…
//   · Depth is capped inside float32 precision; no pullback machinery.
import * as THREE from 'three';
import { PAL, drastic } from '../lib/common.js';
export default function create() { // vjw

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const MAX_ITER = 220;

const uniforms = {
  uTime: { value: 0 },
  uAspect: { value: 1 },
  uC: { value: new THREE.Vector2(-0.4, 0.6) },
  uCenter: { value: new THREE.Vector2(0, 0) },
  uScale: { value: 1.2 },
  uResY: { value: 1080 },
  uFocus: { value: 0 },
  uFlow: { value: 0 },
  uIter: { value: 110 },
  uKick: { value: 0 },
  uHighs: { value: 0 },
  uEnergy: { value: 0 },
  uContrast: { value: 0.5 },
  uDensity: { value: 0.5 },
  uShadow: { value: PAL.shadow },
  uMid: { value: PAL.mid },
  uAccent: { value: PAL.accent },
  uGlow: { value: PAL.glow },
};

const quad = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.ShaderMaterial({
    uniforms,
    depthWrite: false,
    depthTest: false,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uAspect, uScale, uIter, uKick, uHighs, uEnergy, uContrast, uDensity, uResY, uFocus, uFlow;
      uniform vec2 uC, uCenter;
      uniform vec3 uShadow, uMid, uAccent, uGlow;
      varying vec2 vUv;

      void main() {
        vec2 uv = (vUv - 0.5) * vec2(uAspect, 1.0);
        vec2 zz = uCenter + uv * uScale;

        float trapA = 1e9;
        float trapB = 1e9;
        float n = 0.0;
        bool esc = false;
        vec2 dz = vec2(1.0, 0.0);
        for (int k = 0; k < ${MAX_ITER}; k++) {
          if (float(k) >= uIter) break;
          dz = 2.0 * vec2(zz.x * dz.x - zz.y * dz.y, zz.x * dz.y + zz.y * dz.x);
          zz = vec2(zz.x * zz.x - zz.y * zz.y, 2.0 * zz.x * zz.y) + uC;
          trapA = min(trapA, abs(zz.x * 0.707 + zz.y * 0.707));
          trapB = min(trapB, dot(zz, zz));
          if (dot(zz, zz) > 64.0) { esc = true; break; }
          n += 1.0;
        }

        float fil = exp(-trapA * 20.0);
        float core = exp(-sqrt(trapB) * 3.2);

        vec3 col;
        if (esc) {
          // Distance estimation: the coastline as a constant-screen-width
          // glowing filigree line at every depth.
          float f = n - log2(max(1.0, log2(dot(zz, zz)) * 0.5));
          float rz = length(zz);
          float de = rz * log(rz) / max(length(dz), 1e-12);
          float pxl = uScale / uResY;
          float edge = exp(-de / (pxl * mix(5.5, 2.2, uFocus)));
          float aura = exp(-de / (pxl * (40.0 + 300.0 * uDensity) * mix(1.7, 0.6, uFocus)));
          float line = pow(0.5 + 0.5 * cos(6.2831853 * (f * 0.85 - uFlow)), 3.0);
          col = uShadow * 0.25;
          col += uMid * aura * (0.12 + 0.88 * line) * 0.85;
          col += uMid * 0.08 * line * uDensity;
          col += uAccent * edge * (0.65 + 0.5 * uHighs);
          col += uGlow * edge * aura * (0.1 + uKick * 0.55);
        } else {
          float veins = fil * fil * fil;
          float bands = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(trapB * 28.0 + trapA * 15.0), 2.0);
          col = (uShadow * 0.3
              + uMid * core * 0.4 * bands
              + uAccent * veins * (0.45 + 0.4 * uHighs)
              + uGlow * veins * core * (0.3 + uKick * 0.5)) * (0.5 + 0.9 * uDensity);
          col = min(col, vec3(0.75));
        }
        col *= 0.35 + 0.85 * uEnergy;

        vec3 hi = col * col * (3.0 - 2.0 * col);
        vec3 lo = pow(max(col, 0.0), vec3(0.72));
        col = mix(col, hi, max(0.0, uContrast - 0.5) * 1.6);
        col = mix(col, lo, max(0.0, 0.5 - uContrast) * 1.6);

        float r = length(uv);
        col *= 1.0 - 0.3 * smoothstep(0.5, 1.1, r);
        gl_FragColor = vec4(clamp(col, 0.0, 1.15), 1.0);
      }`,
  })
);
scene.add(quad);

// ------------------------------------------------------------- steering

// Escape time at a point — the "how close to the set is this" probe.
function escapeN(px, py, cx, cy) {
  let x = px, y = py, n = 0;
  for (; n < MAX_ITER; n++) {
    const nx = x * x - y * y + cx;
    const ny = 2 * x * y + cy;
    x = nx; y = ny;
    if (x * x + y * y > 64) break;
  }
  return n;
}

function scoreAt(px, py, cx, cy) {
  const n = escapeN(px, py, cx, cy);
  return n >= MAX_ITER ? MAX_ITER * 0.9 : n;
}

// Scout: find the most detailed point in a region (used at the surface and
// to occasionally re-anchor). Slow-escape points score best; interior
// points score well (the coastline is adjacent).
function scout(cx, cy, centerX, centerY, radius, out) {
  let bx = out.x, by = out.y, bestScore = -1;
  for (let i = 0; i < 40; i++) {
    const px = centerX + (Math.random() * 2 - 1) * radius;
    const py = centerY + (Math.random() * 2 - 1) * radius;
    const sc = scoreAt(px, py, cx, cy);
    if (sc > bestScore) { bestScore = sc; bx = px; by = py; }
  }
  out.set(bx, by);
  return bestScore;
}

// Refine: walk the anchor INTO the set with small local probes — its
// distance to the boundary shrinks each tick, so it survives infinite
// zoom. Tiny steps only: cannot jump.
function refineAnchor(cx, cy, radius, target) {
  let bx = target.x, by = target.y;
  let best = scoreAt(bx, by, cx, cy);
  for (let i = 0; i < 20; i++) {
    const px = target.x + (Math.random() * 2 - 1) * radius;
    const py = target.y + (Math.random() * 2 - 1) * radius;
    const sc = scoreAt(px, py, cx, cy);
    if (sc > best) { best = sc; bx = px; by = py; }
  }
  target.set(bx, by);
  return best;
}

// ------------------------------------------------------------- state

const SURFACE = 0.45;      // shape morphs only above this scale
const DEPTH_FLOOR = 2.5e-4; // float32 safety — rise instead of degrading

let scale = 1.2;
let rising = false;
let surfacing = false;      // param change while deep → smooth zoom-out
let flowPhase = 0;
let focusSm = 0;
let iterSm = 110;
let fillSm = 1.1;
let diveBoost = 0;
let wander = 2.08;
let cAngle = 2.08;
const cLive = new THREE.Vector2();
const steerTarget = new THREE.Vector2(0, 0.6);
const centerSm = new THREE.Vector2(0, 0.6);
const _scoutTmp = new THREE.Vector2();
let steerClock = 0;
let scoutTick = 0;
let lastShape = null;
let lastDensityK = null;

function computeC(P, out) {
  const k = 0.9 + 0.09 * P.density;
  out.set(
    k * (Math.cos(cAngle) / 2 - Math.cos(2 * cAngle) / 4),
    k * (Math.sin(cAngle) / 2 - Math.sin(2 * cAngle) / 4));
  return k;
}

return { // vjw: was `export default {`
  name: 'fract',
  scene,
  camera,
  bloom: { strength: 0.35, gain: 0.4 },
  params: { speed: 0.5, shape: 0.33, complexity: 0.5, density: 0.5, fill: 0.5, contrast: 0.5 },
  update(s, dt, t) {
    const P = this.params;
    const spF = drastic(P.speed);
    const shallow = scale > SURFACE;

    // Shape/density changes while deep surface the view first (structural
    // sensitivity to c is exponential in depth — morphing deep = churn).
    if (lastShape === null) { lastShape = P.shape; lastDensityK = P.density; }
    if (Math.abs(P.shape - lastShape) > 0.005 || Math.abs(P.density - lastDensityK) > 0.005) {
      if (!shallow) surfacing = true;
      lastShape = P.shape; lastDensityK = P.density;
    }

    // Morph only at the surface.
    if (shallow) {
      wander += dt * 0.05 * spF;
      const target = P.shape * Math.PI * 2 + wander;
      cAngle += (target - cAngle) * (1 - Math.exp(-dt * 1.2));
      computeC(P, cLive);
      uniforms.uC.value.copy(cLive);
    }
    const cx = uniforms.uC.value.x, cy = uniforms.uC.value.y;

    // Steering. Shallow: scout the view (the structure is morphing).
    // Deep: refine the anchor into the set so it survives any depth;
    // occasionally scout for a better anchor nearby.
    steerClock += dt;
    if (steerClock > 0.25) {
      steerClock = 0;
      if (shallow) {
        scout(cx, cy, centerSm.x, centerSm.y, scale * 0.4, steerTarget);
      } else {
        refineAnchor(cx, cy, Math.max(scale * 0.1, 1e-7), steerTarget);
        if (++scoutTick % 5 === 0) {
          const cand = _scoutTmp.copy(steerTarget);
          const candScore = scout(cx, cy, centerSm.x, centerSm.y, scale * 0.35, cand);
          if (candScore > scoreAt(steerTarget.x, steerTarget.y, cx, cy) + 8) steerTarget.copy(cand);
        }
      }
    }
    // Camera glides toward the anchor, clamped per-window — smooth always.
    const anchorDist = Math.hypot(steerTarget.x - centerSm.x, steerTarget.y - centerSm.y);
    {
      const step = Math.min(anchorDist, scale * 1.1 * dt);
      if (anchorDist > 1e-16) {
        centerSm.x += ((steerTarget.x - centerSm.x) / anchorDist) * step;
        centerSm.y += ((steerTarget.y - centerSm.y) / anchorDist) * step;
      }
    }
    uniforms.uCenter.value.copy(centerSm);

    // Dive / rise cycle — fully continuous, no cuts. The dive is GATED on
    // anchor lock: descent may never outrun the camera, so zooming into
    // empty blackness is impossible at any speed.
    if (s.onKick) diveBoost = Math.min(1.5, diveBoost + 0.9 * s.onKick);
    diveBoost *= Math.exp(-dt * 1.8);
    if (scale < DEPTH_FLOOR) rising = true;
    if (scale > 1.1) { rising = false; surfacing = false; }
    const baseRate = (0.28 + s.sub * 0.15 + diveBoost * 0.5) * spF;
    const rate = (rising || surfacing) ? -baseRate * 4 : baseRate * (shallow ? 0.5 : 1);
    let proposed = scale * Math.exp(-dt * rate);
    if (!rising && !surfacing) {
      proposed = Math.max(proposed, Math.min(scale, anchorDist / 0.28));
    }
    scale = proposed;

    // Musical life through structure-safe channels.
    flowPhase += dt * (0.1 + s.mids * 0.7) * spF;
    uniforms.uFlow.value = flowPhase;

    const focusTgt = Math.min(1, Math.max(0,
      Math.log(1.2 / Math.max(scale, 1e-4)) / Math.log(1.2 / DEPTH_FLOOR)));
    focusSm += (focusTgt - focusSm) * (1 - Math.exp(-dt * 1.5));
    uniforms.uFocus.value = focusSm;

    fillSm += ((1.6 - 1.0 * P.fill) - fillSm) * (1 - Math.exp(-dt * 4));
    uniforms.uScale.value = scale * fillSm;

    const iterTgt = Math.min(MAX_ITER,
      60 + P.complexity * 60 + 30 * Math.log10(1.2 / Math.max(scale, 1e-4)));
    iterSm += (iterTgt - iterSm) * (1 - Math.exp(-dt * 1.5));
    uniforms.uIter.value = Math.round(iterSm);

    uniforms.uTime.value = t;
    uniforms.uKick.value = s.kick;
    uniforms.uHighs.value = s.highs;
    uniforms.uEnergy.value = s.energy;
    uniforms.uContrast.value = P.contrast;
    uniforms.uDensity.value = P.density;
  },
  resize(w, h) {
    uniforms.uAspect.value = w / h;
    uniforms.uResY.value = h;
  },
};
} // vjw: the factory
