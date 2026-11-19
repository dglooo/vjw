// Copied from donor/vs3/visual_kit/src/scenes/idol.js (the friends' engine, used with permission, 2026-11-19).
// vjw: wrapped in a factory (one scene object per layer); nothing else changed. agents/guides/guide_vs3_port.md
// Scene: idol — the third raymarcher (relic grows, citadel builds,
// idol stares back). A Mandelbox carved into an N-fold mandala: the
// sample point folds around the view axis before the box iteration, so
// the whole object is a radially symmetric carving the camera faces
// head-on. Rotation drifts inside the fold loop, so the relief morphs
// continuously; accented kicks re-seat the fold scale and click the
// carving phase a golden-angle notch, both eased.
import * as THREE from 'three';
import { PAL, drastic } from '../lib/common.js';
export default function create() { // vjw

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const uniforms = {
  uAspect: { value: 1 },
  uRadius: { value: 4.0 },
  uScale: { value: 2.4 },
  uFoldLim: { value: 1 },
  uSectors: { value: 8 },
  uPhase: { value: 0 },
  uTilt: { value: 0.35 },
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
      uniform float uAspect, uRadius, uScale, uEps, uFoldLim;
      uniform float uSectors, uPhase, uTilt;
      uniform float uKick, uHighs, uEnergy, uContrast;
      uniform vec3 uColBg, uColShadow, uColMid, uColAccent, uColGlow;
      varying vec2 vUv;

      mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

      // Mandelbox seen down its z axis through an N-fold angular mirror
      // fold. The fold happens ONCE, before iteration: every sector maps
      // into one wedge, so whatever the box iteration carves is mandala-
      // symmetric by construction. Per-iteration rotation (uPhase around
      // z, uTilt around x) is an isometry, so the distance estimate
      // stays valid while the carving morphs.
      // trap.x = closest orbit r^2 (cavity depth), trap.y = fold work
      // (lights the carved edges), trap.z = closest approach to the
      // fold axis (the mandala's radial vein lines).
      float map(vec3 p, out vec3 trap) {
        float sector = 6.2831853 / uSectors;
        // atan(0,0) is undefined (NaN on Metal) and the on-axis camera
        // marches the exact center ray through p.xy == vec2(0): one NaN
        // pixel poisons the feedback history and spreads to a black
        // frame. Nudge the radius-zero case off the singularity.
        float ang = atan(p.y, p.x + 1e-8);
        ang = abs(mod(ang, sector) - sector * 0.5);
        vec3 z = vec3(cos(ang), sin(ang), 0.0) * length(p.xy);
        z.z = p.z;
        vec3 c = z;
        float dr = 1.0;
        trap = vec3(1e3, 0.0, 1e3);
        // Hoisted: the fold rotations are uniform-angle, so build the
        // matrices once per map call instead of 18 sin/cos per call
        // (map runs ~84x per pixel: march steps + 4 normal taps).
        mat2 mp = rot(uPhase);
        mat2 mt = rot(uTilt);
        for (int i = 0; i < 9; i++) {
          z.xy = mp * z.xy;
          z.yz = mt * z.yz;
          vec3 zc = clamp(z, -uFoldLim, uFoldLim) * 2.0 - z;
          trap.y += step(1e-4, dot(zc - z, zc - z));
          z = zc;
          float r2 = dot(z, z);
          trap.x = min(trap.x, r2);
          trap.z = min(trap.z, dot(z.xy, z.xy));
          if (r2 < 0.25) { z *= 4.0; dr *= 4.0; }
          else if (r2 < 1.0) { z /= r2; dr /= r2; }
          z = z * uScale + c;
          dr = dr * abs(uScale) + 1.0;
          // Escaped orbits never fold again; bail instead of burning
          // the remaining iterations. Outside rays (most of the march)
          // escape in 2-3 folds, so this is the cheap half of the DE.
          if (dot(z, z) > 900.0) break;
        }
        return length(z) / abs(dr);
      }
      float mapD(vec3 p) { vec3 t; return map(p, t); }

      void main() {
        vec2 uv = (vUv - 0.5) * 2.0 * vec2(uAspect, 1.0);

        // Face-on and pinned: the camera sits EXACTLY on the fold axis,
        // so the mandala's core projects to dead screen center. A
        // translated sway was tried and cut (Alec: the dot drifted off
        // center — parallax against the on-axis core). The life comes
        // from the in-loop rotation drift and the tilt wobble instead.
        vec3 ro = vec3(0.0, 0.0, uRadius);
        vec3 rd = normalize(vec3(uv.x, uv.y, -1.6));

        float tMax = uRadius + 6.0;
        float t = 0.0;
        vec3 trap;
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
          // Wide normal footprint on purpose: sampling the box fold's
          // micro-detail at sub-pixel scale turns shading into sparkle
          // grain (Alec flagged it). 3x the march eps reads as carved
          // stone instead of gravel; complexity still sharpens it.
          float h = max(uEps * t * 3.0, 0.0035);
          vec2 e2 = vec2(1.0, -1.0) * 0.5773 * h;
          vec3 n = normalize(
            e2.xyy * mapD(pos + e2.xyy) + e2.yyx * mapD(pos + e2.yyx) +
            e2.yxy * mapD(pos + e2.yxy) + e2.xxx * mapD(pos + e2.xxx));

          float ao = clamp(1.0 - steps / 80.0 * 1.1, 0.0, 1.0);
          ao = ao * ao * (3.0 - 2.0 * ao);

          // Key light rides just off the camera axis so the carved
          // relief throws shadows toward the rim of the mandala.
          vec3 L = normalize(vec3(0.35, 0.55, 0.75));
          float dif = max(dot(n, L), 0.0);
          float hl = max(dot(n, -rd), 0.0) * 0.35;
          float rim = pow(1.0 - max(dot(n, -rd), 0.0), 2.4);
          float spe = pow(max(dot(reflect(-L, n), -rd), 0.0), 24.0);

          // Palette zones: shadow in the cavities, mid body, accent on
          // the fold-worked edges and the radial veins, glow on
          // specular light and kick glint.
          float cav = smoothstep(0.0, 1.0, trap.x);
          vec3 base = mix(uColMid, uColShadow * 0.75, cav);
          float edges = smoothstep(4.0, 8.0, trap.y);
          base = mix(base, uColAccent, edges * (0.3 + 0.35 * uHighs));
          float vein = 1.0 - smoothstep(0.0, 0.35, trap.z);
          base = mix(base, uColGlow, vein * 0.25);
          col = base * (0.28 + 0.9 * dif + hl) * ao;
          col += uColGlow * spe * (0.3 + 0.6 * uHighs) * ao;
          col += uColAccent * rim * 0.22;
          col += uColGlow * uKick * 0.12 * (rim + spe);
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

const GOLD = 2.399963;
let phase = 0.6;
let phaseTarget = 0.6;
let sc = 2.4;
let scTarget = 2.4;
let lastJump = -1e9;
let flip = 1;
// Slow-smoothed signals, the raymarcher house style: MOTION follows the
// music on phrase timescales, LIGHT stays live.
let midsS = 0;
let subS = 0;
let enS = 0.5;

return { // vjw: was `export default {`
  name: 'idol',
  scene,
  camera,
  trails: false,
  // Same cost class as citadel: the carving fills the frame and nearly
  // every ray runs the full march + normal. Same budget, same reasoning.
  pixelBudget: 1.3,
  edgeAA: true,  // level-set silhouette: the engine FXAA pass smooths it
  bloom: { strength: 0.22, gain: 0.3 },
  params: { speed: 0.5, shape: 0.5, complexity: 0.5, density: 0.5, fill: 0.5, contrast: 0.5 },
  // shape reads as "petals": the mandala's symmetry order.
  // density reads as "relief": box fold reach, the carving depth.
  paramLabels: { '*': { shape: 'petals', density: 'relief' } },
  update(s, dt, t) {
    const P = this.params;
    const spd = drastic(P.speed);

    midsS += (s.mids - midsS) * (1 - Math.exp(-dt * 0.5));
    subS += (s.sub - subS) * (1 - Math.exp(-dt * 0.6));
    enS += (s.energy - enS) * (1 - Math.exp(-dt * 2.5));

    // The morph: the in-loop rotation drifts, so the carving never sits
    // still. Base rate is glacial; mids lean on it. Every kick surges
    // the rotation through the punch envelope (s.kick decays in 140 ms,
    // faster than any beat period, so surges never compound into a
    // permanent rate change): the carving visibly turns WITH the hit.
    phaseTarget += dt * 0.02 * spd * (1 + midsS * 0.9) + dt * 0.55 * s.kick;

    // ACCENTED kicks re-seat the carving: the fold scale random-walks
    // (a new relief pattern) and the phase clicks a golden-angle notch
    // in alternating directions (the mandala visibly re-blooms). Gated
    // like the siblings: threshold + minimum rest, long quiet fallback.
    if (s.onKick && t - lastJump > 3.2 && (s.onKick > 0.55 || t - lastJump > 8)) {
      lastJump = t;
      scTarget += (Math.random() * 2 - 1) * (0.18 + 0.22 * s.onKick);
      scTarget = Math.min(2.75, Math.max(2.05, scTarget));
      flip = -flip;
      phaseTarget += flip * GOLD * 0.16 * (0.6 + 0.4 * s.onKick);
    }
    scTarget += (2.4 - scTarget) * (1 - Math.exp(-dt * 0.06));
    // Glacial ease (tau ~2 s): accents redirect the metamorphosis
    // mid-flight; the carving never snaps.
    sc += (scTarget - sc) * (1 - Math.exp(-dt * 0.5));
    // Phase eases faster than the scale: the accent notch should read
    // as a bloom within the hit's own beat, not a minute later.
    phase += (phaseTarget - phase) * (1 - Math.exp(-dt * 1.6));

    // Symmetry order: 4..12 petals, integer so the fold seams meet.
    uniforms.uSectors.value = 4 + Math.round(P.shape * 8);
    // Same asymmetric fold sweep as citadel: past ~1.1 the box fold
    // degenerates and the bound estimate stops holding.
    const flim = 1.0 - (P.density - 0.5) * (P.density > 0.5 ? 0.7 : 0.24);
    uniforms.uScale.value = sc;
    uniforms.uFoldLim.value = flim;
    uniforms.uPhase.value = phase;
    uniforms.uTilt.value = 0.35 + Math.sin(t * 0.03 * spd) * 0.1;
    // Frame against the slider-set geometry, never the kick-walked
    // scale (the citadel lesson: a frame tied to the walking scale
    // lurches on every accent). Sub leans the camera in gently.
    // Default framing shows the WHOLE figure: the face-on mandala read
    // is the scene's identity, macro detail is the fill-up sweep.
    const bound = flim * 2 * 3.4 / 1.4;
    // Kick breathes the camera in (a small physical lean, the kind of
    // per-kick breathe that stays); sub is the slow lean underneath.
    uniforms.uRadius.value = bound * (2.3 - P.fill * 1.5)
      - subS * 0.28 * (bound / 4.85) - s.kick * bound * 0.03;
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
