// Copied from donor/vs3/visual_kit/src/scenes/relic.js (the friends' engine, used with permission, 2026-11-19).
// vjw: wrapped in a factory (one scene object per layer); nothing else changed. agents/guides/guide_vs3_port.md
// Scene: relic — raymarched Mandelbulb, one of the family's two true-3D
// scenes (citadel is the other). Kicks morph the bulb's power (a random
// walk, eased), so every hit physically regrows the whole structure.
import * as THREE from 'three';
import { PAL, drastic } from '../lib/common.js';

export default function create() { // vjw
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const uniforms = {
  uAspect: { value: 1 },
  uYaw: { value: 0 },
  uPitch: { value: 0.2 },
  uRadius: { value: 2.6 },
  uPower: { value: 8 },
  uPhase: { value: 0 },
  uFold: { value: 0 },
  uEps: { value: 0.002 },
  uKick: { value: 0 },
  uHighs: { value: 0 },
  uEnergy: { value: 0.5 },
  uContrast: { value: 0.5 },
  uColBg: { value: PAL.bg },
  uColShadow: { value: PAL.shadow },
  uColMid: { value: PAL.mid },
  uColAccent: { value: PAL.accent },
  uColGlow: { value: PAL.glow },
};

const quad = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform float uAspect, uYaw, uPitch, uRadius, uPower, uPhase, uEps, uFold;
      uniform float uKick, uHighs, uEnergy, uContrast;
      uniform vec3 uColBg, uColShadow, uColMid, uColAccent, uColGlow;
      varying vec2 vUv;

      mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

      // Mandelbulb distance estimate. trap.x = closest orbit approach to
      // the origin (cavity depth), trap.y = closest approach to the y=0
      // plane (equatorial banding) — the two palette zones.
      float map(vec3 p, out vec2 trap) {
        vec3 z = p;
        float dr = 1.0;
        float r = length(z);
        trap = vec2(1e3);
        for (int i = 0; i < 8; i++) {
          r = length(z);
          if (r > 2.0) break;
          // FOLD: a per-iteration twist against the bulb's own axis makes
          // the growth spiral in on itself (isometric, so the DE holds).
          z.xz = rot(uFold) * z.xz;
          trap.x = min(trap.x, r);
          trap.y = min(trap.y, abs(z.y));
          float theta = acos(clamp(z.z / max(r, 1e-6), -1.0, 1.0));
          float phi = atan(z.y, z.x) + uPhase;
          dr = pow(r, uPower - 1.0) * uPower * dr + 1.0;
          float zr = pow(r, uPower);
          theta *= uPower;
          phi *= uPower;
          z = zr * vec3(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta)) + p;
        }
        return 0.5 * log(max(r, 1e-6)) * r / dr;
      }
      float mapD(vec3 p) { vec2 t; return map(p, t); }

      void main() {
        vec2 uv = (vUv - 0.5) * 2.0 * vec2(uAspect, 1.0);

        float cp = cos(uPitch), sp = sin(uPitch);
        vec3 ro = vec3(cp * cos(uYaw), sp, cp * sin(uYaw)) * uRadius;
        vec3 fw = normalize(-ro);
        vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
        vec3 up = cross(fw, rt);
        vec3 rd = normalize(fw * 1.9 + uv.x * rt + uv.y * up);
        // Fixed tilt keeps the bulb's equatorial crease off the screen
        // axes (the dead-center cut line Alec flagged).
        ro.yz = rot(0.42) * ro.yz; rd.yz = rot(0.42) * rd.yz;
        ro.xy = rot(0.31) * ro.xy; rd.xy = rot(0.31) * rd.xy;

        float tMax = uRadius + 3.0;
        float t = max(uRadius - 1.6, 0.0);
        vec2 trap;
        float d = 1e3;
        float steps = 0.0;
        bool hit = false;
        for (int i = 0; i < 72; i++) {
          vec3 pos = ro + rd * t;
          d = map(pos, trap);
          if (d < uEps * t) { hit = true; break; }
          t += d * 0.85;
          steps += 1.0;
          if (t > tMax) break;
        }

        vec3 bg = uColBg * (1.15 - 0.4 * length(uv) * 0.5);
        vec3 col = bg;
        if (hit) {
          vec3 pos = ro + rd * t;
          float h = max(uEps * t, 0.0012);
          vec2 e2 = vec2(1.0, -1.0) * 0.5773 * h;
          vec3 n = normalize(
            e2.xyy * mapD(pos + e2.xyy) + e2.yyx * mapD(pos + e2.yyx) +
            e2.yxy * mapD(pos + e2.yxy) + e2.xxx * mapD(pos + e2.xxx));

          // Iteration-count AO: crevices take more steps to reach.
          float ao = clamp(1.0 - steps / 72.0 * 1.35, 0.0, 1.0);
          ao = ao * ao * (3.0 - 2.0 * ao);

          vec3 L = normalize(vec3(0.55, 0.75, 0.35));
          float dif = max(dot(n, L), 0.0);
          float bak = max(dot(n, -L), 0.0) * 0.22;
          float rim = pow(1.0 - max(dot(n, -rd), 0.0), 2.4);
          float spe = pow(max(dot(reflect(-L, n), -rd), 0.0), 28.0);

          // Palette zones: shadow body → mid where orbits dive deep,
          // accent banding near the equatorial trap, glow on light + kick.
          float cav = smoothstep(0.0, 0.9, trap.x);
          vec3 base = mix(uColShadow * 0.7, uColMid, cav);
          base = mix(base, uColAccent, smoothstep(0.25, 0.0, trap.y) * 0.45);
          col = base * (0.18 + 0.95 * dif) * ao + base * bak;
          col += uColGlow * spe * (0.35 + 0.65 * uHighs) * ao;
          col += uColAccent * rim * 0.25;
          col += uColGlow * uKick * 0.3 * (rim + spe);
          col = mix(col, bg, smoothstep(tMax * 0.55, tMax, t));
        }

        col *= 0.35 + 0.85 * uEnergy;
        vec3 hi = col * col * (3.0 - 2.0 * col);
        vec3 lo = pow(max(col, 0.0), vec3(0.72));
        col = mix(col, hi, max(0.0, uContrast - 0.5) * 1.6);
        col = mix(col, lo, max(0.0, 0.5 - uContrast) * 1.6);
        gl_FragColor = vec4(clamp(col, 0.0, 1.1), 1.0);
      }`,
    depthWrite: false,
    depthTest: false,
  })
);
scene.add(quad);

let yaw = 0;
let pw = 8;
let pwTarget = 8;
let phase = 0;
let lastJump = -1e9;
let tiltS = 0;
// Slow-smoothed signals: this scene is a smooth flight through an
// impossible shape (Alec 2026-07-11), so MOTION follows the music on
// phrase timescales while LIGHT stays live. tau ~1.7-2.5 s.
let midsS = 0;
let subS = 0;
let enS = 0.5;

return { // vjw: was `export default {`
  name: 'relic',
  scene,
  camera,
  trails: false,
  // Raymarched per physical pixel. Cap the internal render at ~4 MP: the
  // engine solves the scale that holds this budget on the live display
  // (full res up to 4 MP, ~0.72 on a Retina 16"). Bloom + the smooth bulb
  // surface hide the softening. Taste/perf knob — raise for crisper,
  // lower for faster.
  pixelBudget: 4.0,
  edgeAA: true,  // level-set silhouette: the engine FXAA pass smooths it
  bloom: { strength: 0.22, gain: 0.3 },
  params: { speed: 0.5, shape: 0.5, complexity: 0.5, density: 0.5, fill: 0.5, tilt: 0.5, contrast: 0.5 },
  // density reads as "fold" in the panel: bipolar twist, 0.5 = classic bulb.
  paramLabels: { '*': { density: 'fold' } },
  update(s, dt, t) {
    const P = this.params;
    const spd = drastic(P.speed);

    midsS += (s.mids - midsS) * (1 - Math.exp(-dt * 0.5));
    subS += (s.sub - subS) * (1 - Math.exp(-dt * 0.6));
    enS += (s.energy - enS) * (1 - Math.exp(-dt * 2.5));

    yaw += dt * 0.1 * spd * (1 + midsS * 0.9);
    phase += dt * 0.02 * spd;

    // ACCENTED kicks rewrite the fold: power takes a random-walk jump
    // inside the sweet range, eased so the whole bulb visibly regrows.
    // Gated (strength threshold + minimum rest) because a rebuild every
    // beat reads samey within a bar (Alec 2026-07-11); rare rebuilds
    // land as events. Quiet grooves still evolve on the long fallback.
    const center = 4.6 + P.shape * 4.6;
    if (s.onKick && t - lastJump > 3.2 && (s.onKick > 0.55 || t - lastJump > 8)) {
      lastJump = t;
      pwTarget += (Math.random() * 2 - 1) * (0.7 + 0.9 * s.onKick);
      const lo = center - 1.4, hi = center + 1.4;
      if (pwTarget < lo) pwTarget = lo + (lo - pwTarget);
      if (pwTarget > hi) pwTarget = hi - (pwTarget - hi);
      pwTarget = Math.min(hi, Math.max(lo, pwTarget));
    }
    pwTarget += (center - pwTarget) * (1 - Math.exp(-dt * 0.08));
    // Glacial morph (tau ~1.8 s): an accent redirects the metamorphosis
    // mid-flight; the structure never snaps.
    pw += (pwTarget - pw) * (1 - Math.exp(-dt * 0.55));

    uniforms.uPower.value = pw;
    uniforms.uPhase.value = phase;
    uniforms.uFold.value = (P.density - 0.5) * 1.1;
    uniforms.uYaw.value = yaw;
    // TILT cranes the whole view (Alec 2026-07-19, found riding the speed
    // dial): bipolar, 0.5 = level, ends swing +-0.85 rad on top of the
    // auto bob. Smoothed (tau 0.2 s) so a slider sweep reads as a camera
    // gesture; the clamp stays short of the lookAt pole at pi/2.
    tiltS += ((P.tilt - 0.5) * 1.7 - tiltS) * (1 - Math.exp(-dt * 5));
    const pitch = 0.3 + tiltS + Math.sin(t * 0.06 * spd) * 0.28;
    uniforms.uPitch.value = Math.max(-1.3, Math.min(1.3, pitch));
    uniforms.uRadius.value = (4.4 - P.fill * 2.9) - subS * 0.2;
    uniforms.uEps.value = 0.0035 - P.complexity * 0.0024;
    uniforms.uKick.value = s.kick * 0.5; // light-only glint, no motion
    uniforms.uHighs.value = s.highs;
    uniforms.uEnergy.value = enS;
    uniforms.uContrast.value = P.contrast;
  },
  resize(w, h) {
    uniforms.uAspect.value = w / h;
  },
};
} // vjw: the factory
