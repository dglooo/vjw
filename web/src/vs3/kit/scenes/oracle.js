// Copied from donor/vs3/visual_kit/src/scenes/oracle.js (the friends' engine, used with permission, 2026-11-19).
// vjw: wrapped in a factory (one scene object per layer); nothing else changed. agents/guides/guide_vs3_port.md
// Scene: oracle — raymarched pseudo-kleinian chamber, third of the
// true-3D family (relic grows, citadel builds, oracle enshrines). The
// reference is the splitiz reel look: a near-black machine temple where
// all the light lives on the edges — palette rim light, glowing bead
// filaments where the fold tubes run, spiral rosettes from a
// per-iteration twist. Accented kicks morph the fold cell (a random
// walk, eased), so every hit rebuilds the chamber around you.
import * as THREE from 'three';
import { PAL, drastic } from '../lib/common.js';
export default function create() { // vjw

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const uniforms = {
  uAspect: { value: 1 },
  uYaw: { value: 0 },
  uPitch: { value: 0.2 },
  uRadius: { value: 1.6 },
  uCsxz: { value: 0.82 },
  uCsy: { value: 0.9 },
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
      uniform float uAspect, uYaw, uPitch, uRadius, uCsxz, uCsy, uFold, uEps;
      uniform float uKick, uHighs, uEnergy, uContrast;
      uniform vec3 uColBg, uColShadow, uColMid, uColAccent, uColGlow;
      varying vec2 vUv;

      mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

      // Pseudo-kleinian distance estimate: box fold + sphere inversion.
      // FOLD adds a per-iteration xy twist (isometric, the DE holds) —
      // it spirals the tube work into the rosettes of the reference.
      // trap.x = closest orbit approach (cavity depth), trap.y = closest
      // approach to the fold tube axis — the bead-filament glow.
      float map(vec3 p, out vec2 trap) {
        vec3 z = p;
        vec3 cs = vec3(uCsxz, uCsy, uCsxz);
        float dr = 1.0;
        trap = vec2(1e3);
        for (int i = 0; i < 7; i++) {
          z = 2.0 * clamp(z, -cs, cs) - z;
          z.xy = rot(uFold) * z.xy;
          float r2 = max(dot(z, z), 1e-6);
          trap.x = min(trap.x, r2);
          float k = max(0.72 / r2, 1.0);
          z *= k;
          dr *= k;
          trap.y = min(trap.y, length(z.xy));
        }
        float rxy = length(z.xy);
        return 0.7 * max(rxy - 0.92, abs(rxy * z.z) / max(length(z), 1e-6)) / dr;
      }
      float mapD(vec3 p) { vec2 t; return map(p, t); }

      void main() {
        vec2 uv = (vUv - 0.5) * 2.0 * vec2(uAspect, 1.0);

        float cp = cos(uPitch), sp = sin(uPitch);
        vec3 ro = vec3(cp * cos(uYaw), sp, cp * sin(uYaw)) * uRadius;
        vec3 fw = normalize(-ro);
        vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
        vec3 up = cross(fw, rt);
        vec3 rd = normalize(fw * 1.5 + uv.x * rt + uv.y * up);
        // Fixed tilt keeps the fold planes off the screen axes (the
        // dead-center cut line Alec flagged on the siblings).
        ro.yz = rot(0.34) * ro.yz; rd.yz = rot(0.34) * rd.yz;
        ro.xy = rot(0.23) * ro.xy; rd.xy = rot(0.23) * rd.xy;

        float tMax = uRadius + 5.0;
        // Near clip (the relic trick): when the orbit carries the camera
        // against a fold-cell wall, that one surface swallows the frame
        // as a giant flat slab. Culling the first 0.3 units sees through
        // the touching wall into the chamber instead.
        float t = 0.3;
        vec2 trap;
        float d = 1e3;
        float steps = 0.0;
        bool hit = false;
        for (int i = 0; i < 84; i++) {
          vec3 pos = ro + rd * t;
          d = map(pos, trap);
          if (d < uEps * t) { hit = true; break; }
          // Conservative step: kleinian DEs overshoot near the
          // inversion sphere; 0.75 keeps thin tubes from being skipped.
          t += d * 0.75;
          steps += 1.0;
          if (t > tMax) break;
        }

        vec3 bg = uColBg * (0.9 - 0.35 * length(uv) * 0.5);
        vec3 col = bg;
        if (hit) {
          vec3 pos = ro + rd * t;
          float h = max(uEps * t, 0.0012);
          vec2 e2 = vec2(1.0, -1.0) * 0.5773 * h;
          vec3 n = normalize(
            e2.xyy * mapD(pos + e2.xyy) + e2.yyx * mapD(pos + e2.yyx) +
            e2.yxy * mapD(pos + e2.yxy) + e2.xxx * mapD(pos + e2.xxx));

          float ao = clamp(1.0 - steps / 84.0 * 1.25, 0.0, 1.0);
          ao = ao * ao * (3.0 - 2.0 * ao);

          // The reference look is rim-dominant: the body stays near
          // black and the palette lives on edges and filaments. Diffuse
          // is a whisper, not the key.
          vec3 L = normalize(vec3(0.4, 0.7, 0.45));
          float dif = max(dot(n, L), 0.0);
          // Tight fresnel, AO-GATED: glancing near-miss pockets have low
          // ao, and ungated rim there floods the frame with fog (first
          // tuning pass washed out at lum 0.55; the reference sits dark).
          float rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.2) * (0.25 + 0.75 * ao);
          float spe = pow(max(dot(reflect(-L, n), -rd), 0.0), 32.0);

          float cav = smoothstep(0.0, 1.2, trap.x);
          vec3 base = mix(uColShadow * 0.5, uColMid * 0.6, cav);
          // Machined engraving: contour bands of the orbit traps. The
          // big flat fold-cell walls carry no filaments and only rim at
          // the silhouette, so without this they read as solid cutouts
          // (Alec 2026-07-19); banding the traps carves them like the
          // reel's circuitry, and it is free (no extra map calls).
          float eng = sin(trap.x * 42.0) * sin(trap.y * 13.0 + trap.x * 17.0);
          eng = smoothstep(-0.3, 0.9, eng);
          base *= 0.65 + 0.65 * eng;
          // Headlamp: camera-facing fill so a wall spanning the frame
          // shades across its span instead of sitting at one value.
          float hl = max(dot(n, -rd), 0.0) * 0.25;
          col = base * (0.22 + 0.5 * dif + hl) * ao;
          col += uColAccent * eng * 0.05 * ao;
          // Bead filaments: orbits that hug the tube axis light up like
          // the dotted chains in the reel.
          float fil = smoothstep(0.2, 0.02, trap.y);
          col += uColGlow * fil * (0.3 + 0.6 * uHighs) * ao;
          col += uColAccent * rim * 0.75;
          col += uColGlow * spe * (0.3 + 0.6 * uHighs) * ao;
          col += uColGlow * uKick * 0.35 * (rim + fil * ao);
          // Late fog: hits land around half of tMax, an earlier fog
          // start hazed the whole structure (lum sat at 0.02 with the
          // exposure servo pinned).
          col = mix(col, bg, smoothstep(tMax * 0.62, tMax, t));
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
let csy = 0.9;
let csyTarget = 0.9;
let lastJump = -1e9;
let tiltS = 0;
// Slow-smoothed signals: like the siblings, this scene is a smooth
// drift through an impossible interior — MOTION follows the music on
// phrase timescales, LIGHT stays live. tau ~1.7-2.5 s.
let midsS = 0;
let subS = 0;
let enS = 0.5;

return { // vjw: was `export default {`
  name: 'oracle',
  scene,
  camera,
  trails: false,
  // Raymarched per physical pixel, interior scenes fill every ray. Cap
  // between relic (4.0) and citadel (1.3); the near-black field and
  // bloom hide the softening. Taste/perf knob.
  pixelBudget: 1.5,
  edgeAA: true,  // level-set silhouette: the engine FXAA pass smooths it
  bloom: { strength: 0.22, gain: 0.3 },
  params: { speed: 0.5, shape: 0.5, complexity: 0.5, density: 0.5, fill: 0.5, tilt: 0.5, contrast: 0.5 },
  // density reads as "fold" in the panel: bipolar spiral twist, 0.5 =
  // straight tube work (the siblings' convention).
  paramLabels: { '*': { density: 'fold' } },
  update(s, dt, t) {
    const P = this.params;
    const spd = drastic(P.speed);

    midsS += (s.mids - midsS) * (1 - Math.exp(-dt * 0.5));
    subS += (s.sub - subS) * (1 - Math.exp(-dt * 0.6));
    enS += (s.energy - enS) * (1 - Math.exp(-dt * 2.5));

    yaw += dt * 0.07 * spd * (1 + midsS * 0.9);

    // ACCENTED kicks rewrite the fold cell: the chamber rebuilds into a
    // different temple. Gated like the siblings (strength threshold +
    // minimum rest): rebuilds are events, not a metronome. Quiet grooves
    // still evolve on the long fallback.
    const center = 0.74 + P.shape * 0.34;
    if (s.onKick && t - lastJump > 3.2 && (s.onKick > 0.55 || t - lastJump > 8)) {
      lastJump = t;
      csyTarget += (Math.random() * 2 - 1) * (0.09 + 0.11 * s.onKick);
      const lo = center - 0.16, hi = center + 0.16;
      if (csyTarget < lo) csyTarget = lo + (lo - csyTarget);
      if (csyTarget > hi) csyTarget = hi - (csyTarget - hi);
      csyTarget = Math.min(hi, Math.max(lo, csyTarget));
    }
    csyTarget += (center - csyTarget) * (1 - Math.exp(-dt * 0.08));
    // Glacial morph (tau ~2 s): accents redirect the metamorphosis
    // mid-flight; the chamber never snaps.
    csy += (csyTarget - csy) * (1 - Math.exp(-dt * 0.5));

    uniforms.uCsxz.value = 0.68 + P.shape * 0.22;
    uniforms.uCsy.value = csy;
    uniforms.uFold.value = (P.density - 0.5) * 0.6;
    uniforms.uYaw.value = yaw;
    // TILT cranes the whole view (Alec 2026-07-19): bipolar, 0.5 = level,
    // ends swing +-0.85 rad on top of the auto bob. Smoothed (tau 0.2 s);
    // the clamp stays short of the lookAt pole at pi/2.
    tiltS += ((P.tilt - 0.5) * 1.7 - tiltS) * (1 - Math.exp(-dt * 5));
    const pitch = 0.22 + tiltS + Math.sin(t * 0.05 * spd) * 0.24;
    uniforms.uPitch.value = Math.max(-1.3, Math.min(1.3, pitch));
    uniforms.uRadius.value = (2.2 - P.fill * 1.7) - subS * 0.15;
    uniforms.uEps.value = 0.0032 - P.complexity * 0.0024;
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
