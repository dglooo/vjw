// Copied from donor/vs3/visual_kit/src/scenes/citadel.js (the friends' engine, used with permission, 2026-11-19).
// vjw: wrapped in a factory (one scene object per layer); nothing else changed. agents/guides/guide_vs3_port.md
// Scene: citadel — raymarched Mandelbox lattice, true-3D architecture
// (relic's sibling). Kicks morph the fold scale (a random
// walk, eased), so every hit rebuilds the lattice into a new building.
import * as THREE from 'three';
import { PAL, drastic } from '../lib/common.js';
export default function create() { // vjw

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const uniforms = {
  uAspect: { value: 1 },
  uYaw: { value: 0 },
  uPitch: { value: 0.25 },
  uRadius: { value: 4.2 },
  uScale: { value: 2.7 },
  uFoldLim: { value: 1 },
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
      uniform float uAspect, uYaw, uPitch, uRadius, uScale, uEps, uFoldLim;
      uniform float uKick, uHighs, uEnergy, uContrast;
      uniform vec3 uColBg, uColShadow, uColMid, uColAccent, uColGlow;
      varying vec2 vUv;

      mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

      // Mandelbox distance estimate (boxfold ±uFoldLim, spherefold 0.25/1.0).
      // trap.x = closest orbit r² (cavity depth), trap.y counts how hard
      // the box fold worked — it lights the lattice edges.
      float map(vec3 p, out vec2 trap) {
        vec3 z = p;
        float dr = 1.0;
        trap = vec2(1e3, 0.0);
        for (int i = 0; i < 9; i++) {
          vec3 zc = clamp(z, -uFoldLim, uFoldLim) * 2.0 - z;
          trap.y += step(1e-4, dot(zc - z, zc - z));
          z = zc;
          float r2 = dot(z, z);
          trap.x = min(trap.x, r2);
          if (r2 < 0.25) { z *= 4.0; dr *= 4.0; }
          else if (r2 < 1.0) { z /= r2; dr /= r2; }
          z = z * uScale + p;
          dr = dr * abs(uScale) + 1.0;
        }
        return length(z) / abs(dr);
      }
      float mapD(vec3 p) { vec2 t; return map(p, t); }

      void main() {
        vec2 uv = (vUv - 0.5) * 2.0 * vec2(uAspect, 1.0);

        float cp = cos(uPitch), sp = sin(uPitch);
        vec3 ro = vec3(cp * cos(uYaw), sp, cp * sin(uYaw)) * uRadius;
        vec3 fw = normalize(-ro);
        vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
        vec3 up = cross(fw, rt);
        vec3 rd = normalize(fw * 1.7 + uv.x * rt + uv.y * up);
        // Fixed tilt keeps the lattice's axis planes off the screen axes
        // (the dead-center cut line Alec flagged).
        ro.yz = rot(0.37) * ro.yz; rd.yz = rot(0.37) * rd.yz;
        ro.xy = rot(0.26) * ro.xy; rd.xy = rot(0.26) * rd.xy;

        float tMax = uRadius + 6.0;
        float t = 0.0;
        vec2 trap;
        float d = 1e3;
        float steps = 0.0;
        bool hit = false;
        for (int i = 0; i < 80; i++) {
          vec3 pos = ro + rd * t;
          d = map(pos, trap);
          if (d < uEps * t) { hit = true; break; }
          t += d * 0.9;
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

          float ao = clamp(1.0 - steps / 80.0 * 1.1, 0.0, 1.0);
          ao = ao * ao * (3.0 - 2.0 * ao);

          vec3 L = normalize(vec3(0.5, 0.8, 0.3));
          float dif = max(dot(n, L), 0.0);
          float bak = max(dot(n, -L), 0.0) * 0.2;
          // Headlamp: the key light cannot reach the interior corridors,
          // so the camera carries its own fill.
          float hl = max(dot(n, -rd), 0.0) * 0.35;
          float rim = pow(1.0 - max(dot(n, -rd), 0.0), 2.4);
          float spe = pow(max(dot(reflect(-L, n), -rd), 0.0), 24.0);

          // Palette zones: shadow body → mid in the deep cavities,
          // accent on the hard-folded lattice edges, glow on light+kick.
          float cav = smoothstep(0.0, 1.0, trap.x);
          vec3 base = mix(uColMid, uColShadow * 0.75, cav);
          float edges = smoothstep(4.0, 8.0, trap.y);
          base = mix(base, uColAccent, edges * (0.3 + 0.35 * uHighs));
          col = base * (0.28 + 0.9 * dif + hl) * ao + base * bak;
          col += uColGlow * spe * (0.3 + 0.6 * uHighs) * ao;
          col += uColAccent * rim * 0.22;
          col += uColGlow * uKick * 0.28 * (rim + spe);
          col = mix(col, bg, smoothstep(tMax * 0.5, tMax, t));
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
let sc = 2.7;
let scTarget = 2.7;
let lastJump = -1e9;
let tiltS = 0;
// Slow-smoothed signals: like relic, this scene is a smooth flight
// (Alec 2026-07-11) — MOTION follows the music on phrase timescales,
// LIGHT stays live. tau ~1.7-2.5 s.
let midsS = 0;
let subS = 0;
let enS = 0.5;

return { // vjw: was `export default {`
  name: 'citadel',
  scene,
  camera,
  trails: false,
  // The heaviest scene by far (a Mandelbox lattice fills the frame, so
  // nearly every ray runs the full march + normal). Cap the internal
  // render at ~1.3 MP: the engine solves the scale that holds this budget
  // on the live display, so it stays near 60 on a Retina 16" (~0.41) and
  // crisp on a lower-res monitor (~0.6–0.9) off the same GPU. Bloom + the
  // faceted surface hide the softening. Taste/perf knob — raise for
  // crisper, lower for faster.
  pixelBudget: 1.3,
  edgeAA: true,  // level-set silhouette: the engine FXAA pass smooths it
  bloom: { strength: 0.22, gain: 0.3 },
  params: { speed: 0.5, shape: 0.5, complexity: 0.5, density: 0.5, fill: 0.5, tilt: 0.5, contrast: 0.5 },
  // density reads as "fold" in the panel: box fold reach, 0.5 = classic.
  paramLabels: { '*': { density: 'fold' } },
  update(s, dt, t) {
    const P = this.params;
    const spd = drastic(P.speed);

    midsS += (s.mids - midsS) * (1 - Math.exp(-dt * 0.5));
    subS += (s.sub - subS) * (1 - Math.exp(-dt * 0.6));
    enS += (s.energy - enS) * (1 - Math.exp(-dt * 2.5));

    yaw += dt * 0.09 * spd * (1 + midsS * 0.9);

    // ACCENTED kicks rewrite the fold scale: the entire lattice rebuilds
    // into a different architecture. Gated like relic (strength
    // threshold + minimum rest, Alec 2026-07-11): rebuilds are events,
    // not a metronome. Quiet grooves still evolve on the long fallback.
    const center = 2.05 + P.shape * 1.3;
    if (s.onKick && t - lastJump > 3.2 && (s.onKick > 0.55 || t - lastJump > 8)) {
      lastJump = t;
      scTarget += (Math.random() * 2 - 1) * (0.2 + 0.25 * s.onKick);
      const lo = center - 0.35, hi = center + 0.35;
      if (scTarget < lo) scTarget = lo + (lo - scTarget);
      if (scTarget > hi) scTarget = hi - (scTarget - hi);
      scTarget = Math.min(hi, Math.max(lo, scTarget));
    }
    scTarget += (center - scTarget) * (1 - Math.exp(-dt * 0.08));
    // Glacial morph (tau ~2 s): accents redirect the metamorphosis
    // mid-flight; the lattice never snaps.
    sc += (scTarget - sc) * (1 - Math.exp(-dt * 0.5));

    // Asymmetric sweep: past ~1.1 the box fold degenerates into smooth
    // perforated spheres and the bound estimate below stops holding, so
    // the open direction stays mild and the dense direction goes hard.
    const flim = 1.0 - (P.density - 0.5) * (P.density > 0.5 ? 0.7 : 0.24);
    uniforms.uScale.value = sc;
    uniforms.uFoldLim.value = flim;
    uniforms.uYaw.value = yaw;
    // TILT cranes the whole view (Alec 2026-07-19): bipolar, 0.5 = level,
    // ends swing +-0.85 rad on top of the auto bob. Smoothed (tau 0.2 s);
    // the clamp stays short of the lookAt pole at pi/2.
    tiltS += ((P.tilt - 0.5) * 1.7 - tiltS) * (1 - Math.exp(-dt * 5));
    const pitch = 0.3 + tiltS + Math.sin(t * 0.05 * spd) * 0.26;
    uniforms.uPitch.value = Math.max(-1.3, Math.min(1.3, pitch));
    // Frame against the bounding radius at the SLIDER-SET center, never
    // the live kick-walked scale: the camera must hold still while kicks
    // rebuild the architecture inside it. Tying the frame to the walking
    // scale made every kick lurch the camera (Alec: "the whole thing
    // seizes"). flim and center only move when the user moves a slider,
    // so this still keeps fill meaningful across the fold sweep.
    const bound = flim * 2 * (center + 1) / Math.max(center - 1, 0.8);
    uniforms.uRadius.value = bound * (1.55 - P.fill * 1.05)
      - subS * 0.3 * (bound / 4.35);
    uniforms.uEps.value = 0.0032 - P.complexity * 0.0022;
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
