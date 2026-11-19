// Copied from donor/vs3/visual_kit/src/scenes/ingot.js (the friends' engine, used with permission, 2026-11-19).
// vjw: wrapped in a factory (one scene object per layer); nothing else changed. agents/guides/guide_vs3_port.md
// Scene: ingot — raymarched chrome sculpture, fifth of the true-3D
// family (relic grows, citadel builds, idol stares, oracle enshrines,
// ingot gleams). The reference is Alec's liquid-metal sculpture photo
// (2026-07-24): a swooping crescent of stacked polished blades with
// lens-shaped cutouts, all the color coming from what the metal
// reflects. The surface is a domain-warped anisotropic gyroid kept as
// a thin shell and carved by the crescent, so the laminae and their
// eyelet holes fall out of the level set. Chrome comes from sampling
// an analytic studio environment (palette-tinted softbox, horizon
// strip, floor bounce) along the reflected ray — the first scene where
// the material, not emission, is the show.
// Accented kicks re-aim the lamination basis and walk the key light:
// the same silhouette re-crystallizes into a new grain. Sub melts the
// metal (warp amplitude), mids drive the flow, highs tighten glints.
import * as THREE from 'three';
import { PAL, drastic } from '../lib/common.js';
export default function create() { // vjw

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const uniforms = {
  uAspect: { value: 1 },
  uYaw: { value: 0 },
  uPitch: { value: 0.18 },
  uRadius: { value: 1.9 },
  // Lamination basis: three eased Euler angles. Accents re-aim them.
  uRotA: { value: 0.3 },
  uRotB: { value: 0.7 },
  uRotC: { value: 0.1 },
  uFlowT: { value: 0 },
  uFreq: { value: 5.0 },
  uThick: { value: 0.3 },
  uWarpAmp: { value: 0.14 },
  // Crescent pose (from shape): lift = swoop height, cres = wreath to
  // crescent, edge = arc span, fat = tube radius, r0 = ring radius.
  uLift: { value: 0.4 },
  uCres: { value: 0.5 },
  uEdge: { value: -0.4 },
  uFat: { value: 0.4 },
  uR0: { value: 0.85 },
  uLightAz: { value: 1.2 },
  uCenter: { value: new THREE.Vector3(0, 0.35, 0) },
  uEps: { value: 0.0018 },
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
      uniform float uAspect, uYaw, uPitch, uRadius;
      uniform float uRotA, uRotB, uRotC, uFlowT, uFreq, uThick, uWarpAmp;
      uniform float uLift, uCres, uEdge, uFat, uR0, uLightAz, uEps;
      uniform vec3 uCenter;
      uniform float uKick, uHighs, uEnergy, uContrast;
      uniform vec3 uColBg, uColShadow, uColMid, uColAccent, uColGlow;
      varying vec2 vUv;

      mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

      // Rounded intersection: rounds the seam where blades meet the
      // crescent skin, which is what feathers the tips.
      float smax(float a, float b, float k) {
        float h = clamp(0.5 + 0.5 * (a - b) / k, 0.0, 1.0);
        return mix(b, a, h) + k * h * (1.0 - h);
      }

      // The crescent: a wavy hoop whose tube swells over an arc and
      // feathers to nothing at the tips. World-fixed; the laminae
      // re-aim inside it, so accents change the grain, not the pose.
      float bound(vec3 p) {
        float th = atan(p.z, p.x);
        vec3 q = p;
        q.y -= sin(th) * uLift;
        float ring = length(vec2(length(q.xz) - uR0, q.y));
        float m = cos(th - 1.6);
        float rad = uFat * mix(1.0, smoothstep(uEdge, 1.0, m), uCres);
        return ring - rad;
      }

      // Laminae: anisotropic gyroid shell in the (rotated, flowing)
      // basis. abs(field) - thickness = stacked blades; the holes with
      // rolled rims are the level set folding, free of charge.
      float map(vec3 p) {
        // Recenter on the crescent's live centroid (computed in JS
        // from the same pose mapping): the camera orbits the origin,
        // and without this the off-axis crescent swings around the
        // frame as yaw sweeps (Alec 2026-07-24).
        p += uCenter;
        float b = bound(p);
        // Beyond the crescent the shell can't matter; the early out
        // keeps empty-space steps big and cheap.
        if (b > 0.35) return b;
        vec3 q = p;
        q.xy = rot(uRotA) * q.xy;
        q.yz = rot(uRotB) * q.yz;
        q.zx = rot(uRotC) * q.zx;
        q += uWarpAmp * vec3(
          sin(q.y * 1.8 + uFlowT),
          sin(q.z * 1.6 - uFlowT * 0.8),
          sin(q.x * 1.7 + uFlowT * 0.6));
        q += 0.5 * uWarpAmp * sin(q.zxy * 3.4 - uFlowT * 0.5);
        vec3 g = q * uFreq;
        g.y *= 1.75;
        float gy = sin(g.x) * cos(g.y) + sin(g.y) * cos(g.z)
                 + sin(g.z) * cos(g.x);
        float shell = (abs(gy) - uThick) / (uFreq * 3.6);
        return smax(shell, b, 0.1);
      }

      // Analytic studio: a dark cyc that rises to a pale horizon, one
      // palette-tinted softbox, a horizon strip, a floor bounce. The
      // stripes are what make chrome read as chrome; their azimuthal
      // localization is what draws the long window streaks.
      vec3 env(vec3 rd) {
        float y = rd.y;
        float az = atan(rd.z, rd.x);
        vec3 c = uColBg * mix(0.05, 0.22, smoothstep(-1.0, 0.25, y));
        float key = smoothstep(0.5, 0.07, abs(y - 0.38))
                  * (0.35 + 0.65 * pow(0.5 + 0.5 * cos(az - uLightAz), 2.0));
        c += mix(vec3(1.0), uColGlow, 0.45) * key * (3.2 + 0.7 * uKick);
        float strip = smoothstep(0.16, 0.02, abs(y + 0.02));
        c += mix(vec3(1.0), uColAccent, 0.55) * strip
           * (1.0 + 0.55 * pow(0.5 + 0.5 * cos(az - uLightAz + 2.4), 2.0))
           * (1.0 + 0.8 * uHighs);
        c += mix(vec3(1.0), uColMid, 0.6)
           * smoothstep(0.5, 0.05, abs(y + 0.62)) * 0.5;
        return c;
      }

      void main() {
        vec2 uv = (vUv - 0.5) * 2.0 * vec2(uAspect, 1.0);

        float cp = cos(uPitch), sp = sin(uPitch);
        vec3 ro = vec3(cp * cos(uYaw), sp, cp * sin(uYaw)) * uRadius;
        vec3 fw = normalize(-ro);
        vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
        vec3 up = cross(fw, rt);
        vec3 rd = normalize(fw * 1.5 + uv.x * rt + uv.y * up);

        float tMax = uRadius + 4.0;
        float t = 0.02;
        float d = 1e3;
        float steps = 0.0;
        bool hit = false;
        for (int i = 0; i < 128; i++) {
          vec3 pos = ro + rd * t;
          d = map(pos);
          if (d < uEps * t) { hit = true; break; }
          // Thin shells punish overstepping (skipped blades shimmer);
          // 0.55 is the conservative factor that held in QA.
          t += d * 0.55;
          steps += 1.0;
          if (t > tMax) break;
        }

        vec3 bg = uColBg * (0.8 - 0.3 * length(uv) * 0.5);
        vec3 col = bg;
        if (hit) {
          vec3 pos = ro + rd * t;
          float h = max(uEps * t, 0.001);
          vec2 e2 = vec2(1.0, -1.0) * 0.5773 * h;
          vec3 n = normalize(
            e2.xyy * map(pos + e2.xyy) + e2.yyx * map(pos + e2.yyx) +
            e2.yxy * map(pos + e2.yxy) + e2.xxx * map(pos + e2.xxx));

          float ao = clamp(1.0 - steps / 128.0 * 1.3, 0.0, 1.0);
          ao = ao * ao * (3.0 - 2.0 * ao);

          float fres = pow(1.0 - max(dot(n, -rd), 0.0), 5.0);
          vec3 refl = reflect(rd, n);
          // Near-neutral metal tint: chrome stays silver, the palette
          // arrives through the lights, not a colormap.
          vec3 metal = mix(vec3(0.94), uColMid, 0.12);
          // AO gates the reflection (occluded pockets see less studio),
          // which is the cheap stand-in for interreflection and the
          // reason the stack reads as depth instead of foil.
          col = env(refl) * metal * (0.72 + 0.28 * fres)
              * (0.45 + 0.55 * ao);
          col += env(n) * metal * 0.09 * ao;
          vec3 L = normalize(vec3(cos(uLightAz), 0.55, sin(uLightAz)));
          float spe = pow(max(dot(refl, L), 0.0), 64.0);
          col += uColGlow * spe * (0.7 + 0.5 * uHighs) * ao;
          col = mix(col, bg, smoothstep(tMax * 0.7, tMax, t));
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

let yaw = 0.6;
let tiltS = 0;
let lastJump = -1e9;
// Basis angles ease toward re-aimed targets: velocity proportional to
// remaining distance (the fract lesson), so a re-crystallization lands
// decisively and settles without a hard stop.
const rotC = [0.3, 0.7, 0.1];
const rotT = [0.3, 0.7, 0.1];
let lightAz = 1.2;
let lightAzT = 1.2;
let flowT = 0;
// Slow-smoothed signals, the raymarcher house style: motion follows
// the music on phrase timescales, light stays live.
let midsS = 0;
let subS = 0;
let enS = 0.5;

return { // vjw: was `export default {`
  name: 'ingot',
  scene,
  camera,
  trails: false,
  // Chrome is specular detail: it wants more resolution than oracle's
  // near-black interior but the gyroid map is far cheaper per step
  // than the kleinian loop. Taste/perf knob.
  pixelBudget: 2.0,
  edgeAA: true,  // level-set silhouette: the engine FXAA pass smooths it
  bloom: { strength: 0.18, gain: 0.25 },
  params: { speed: 0.5, shape: 0.5, complexity: 0.5, density: 0.5, fill: 0.5, tilt: 0.5, contrast: 0.5 },
  // density reads as "metal" in the panel: how much metal fills the
  // form, razor foil to solid billet.
  paramLabels: { '*': { density: 'metal' } },
  _state() {
    return { rot: rotC.slice(), rotT: rotT.slice(), lastJump, lightAz, flowT,
      center: uniforms.uCenter.value.toArray() };
  },
  update(s, dt, t) {
    const P = this.params;
    const spd = drastic(P.speed);

    midsS += (s.mids - midsS) * (1 - Math.exp(-dt * 0.5));
    subS += (s.sub - subS) * (1 - Math.exp(-dt * 0.6));
    enS += (s.energy - enS) * (1 - Math.exp(-dt * 2.5));

    yaw += dt * 0.06 * spd * (1 + midsS * 0.8);
    flowT += dt * 0.35 * spd * (1 + midsS * 0.6);
    // The shader reads it as sin(... + uFlowT * 1, 0.8, 0.6, 0.5): 20π is a
    // whole number of periods of all four, so the wrap is exact and float32
    // keeps its precision on long runs.
    flowT %= 20 * Math.PI;

    // ACCENTED kicks re-crystallize: the lamination basis re-aims and
    // the key light walks, so the same crescent regrows a new grain.
    // Gated like the siblings (threshold + minimum rest, long
    // fallback): rebuilds are events, not a metronome.
    if (s.onKick && t - lastJump > 3.2 && (s.onKick > 0.55 || t - lastJump > 8)) {
      lastJump = t;
      for (let i = 0; i < 3; i++) {
        rotT[i] += (Math.random() * 2 - 1) * (0.5 + 0.7 * s.onKick);
      }
      // Golden-angle-ish walk keeps consecutive light poses apart.
      lightAzT += 2.4 * (Math.random() < 0.5 ? -1 : 1) * (0.4 + 0.4 * Math.random());
    }
    const ease = 1 - Math.exp(-dt * 2.2);
    for (let i = 0; i < 3; i++) rotC[i] += (rotT[i] - rotC[i]) * ease;
    lightAz += (lightAzT - lightAz) * (1 - Math.exp(-dt * 1.4));

    uniforms.uRotA.value = rotC[0];
    uniforms.uRotB.value = rotC[1];
    uniforms.uRotC.value = rotC[2];
    uniforms.uLightAz.value = lightAz;
    uniforms.uFlowT.value = flowT;
    uniforms.uYaw.value = yaw;
    // TILT cranes the view like the siblings: bipolar, 0.5 = level,
    // smoothed (tau 0.2 s), clamped short of the lookAt pole.
    tiltS += ((P.tilt - 0.5) * 1.7 - tiltS) * (1 - Math.exp(-dt * 5));
    // Bob stays small: with an off-axis crest, perspective weighting
    // turns camera sway into apparent frame drift (Alec 2026-07-24).
    const pitch = 0.16 + tiltS + Math.sin(t * 0.05 * spd) * 0.12;
    uniforms.uPitch.value = Math.max(-1.3, Math.min(1.3, pitch));
    uniforms.uRadius.value = (2.75 - P.fill * 2.0) - subS * 0.12;

    // shape: level wreath of blades at 0, breaking crest at 1.
    uniforms.uLift.value = 0.06 + P.shape * 0.7;
    uniforms.uCres.value = 0.15 + P.shape * 0.8;
    uniforms.uEdge.value = -1.2 + P.shape * 1.5;
    uniforms.uFat.value = 0.3 + P.shape * 0.22;
    uniforms.uR0.value = 0.98 - P.shape * 0.28;

    // Centroid of the swollen arc, tube radius squared as the weight,
    // divided by squared camera distance (projected solid angle): the
    // crescent is a banana, and without the perspective term the
    // near-camera crest projects bigger and the frame reads off
    // center as yaw orbits. Matches bound()'s pose math exactly; the
    // shader translates the field so this point sits at the origin
    // the camera stares at. Uses last frame's center for distances
    // (it moves slowly, one-frame lag is invisible).
    {
      const lift = uniforms.uLift.value, cres = uniforms.uCres.value;
      const edge = uniforms.uEdge.value, fat = uniforms.uFat.value;
      const r0 = uniforms.uR0.value;
      const pit = uniforms.uPitch.value, rad0 = uniforms.uRadius.value;
      const cx0 = Math.cos(pit) * Math.cos(yaw) * rad0;
      const cy0 = Math.sin(pit) * rad0;
      const cz0 = Math.cos(pit) * Math.sin(yaw) * rad0;
      const C = uniforms.uCenter.value;
      let sx = 0, sy = 0, sz = 0, sw = 0;
      for (let i = 0; i < 64; i++) {
        const th = (i / 64) * Math.PI * 2 - Math.PI;
        let m = (Math.cos(th - 1.6) - edge) / (1 - edge);
        m = Math.min(1, Math.max(0, m));
        m = m * m * (3 - 2 * m);
        const rad = fat * (1 + (m - 1) * cres);
        const px = Math.cos(th) * r0, py = Math.sin(th) * lift, pz = Math.sin(th) * r0;
        const dx = px - C.x - cx0, dy = py - C.y - cy0, dz = pz - C.z - cz0;
        const w = rad * rad / Math.max(0.2, dx * dx + dy * dy + dz * dz);
        sx += px * w; sy += py * w; sz += pz * w; sw += w;
      }
      const k = 1 - Math.exp(-dt * 3);
      C.x += (sx / sw - C.x) * k;
      C.y += (sy / sw - C.y) * k;
      C.z += (sz / sw - C.z) * k;
    }

    uniforms.uFreq.value = 3.0 + P.complexity * 4.5;
    uniforms.uThick.value = 0.1 + P.density * 0.5;
    // Sub melts the metal: warp amplitude swells and the laminae pour.
    uniforms.uWarpAmp.value = 0.11 + subS * 0.13;
    uniforms.uEps.value = 0.0026 - P.complexity * 0.0014;
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
