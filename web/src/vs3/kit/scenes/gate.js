// Copied from donor/vs3/visual_kit/src/scenes/gate.js (the friends' engine, used with permission, 2026-11-19).
// vjw: wrapped in a factory (one scene object per layer); nothing else changed. agents/guides/guide_vs3_port.md
// Scene: gate — raymarched monumental corridor, fifth of the true-3D
// family (relic grows, citadel builds, idol stares, oracle enshrines,
// gate processes). The reference is a colossal triangular passage:
// nested A-frame arches receding toward a luminous apex, near-black
// slab walls machined with inset plates, vent slots, and long channel
// seams, all the light living in the haze and on the arch rims. The
// camera walks the corridor forever.
// SHAPE sweeps the hall itself: left of center leans the A-frame
// steeper, right of center morphs the whole passage through square
// and hexagonal into a circular tube, arches and all.
// Accented kicks re-tune the passage: the aperture of every arch steps
// to a new size and the deep-lip parity swaps sides, both eased, so a
// hit rebuilds the architecture without ever snapping. Ordinary kicks
// only launch a pulse of light racing away down the hall.
import * as THREE from 'three';
import { PAL, drastic } from '../lib/common.js';
export default function create() { // vjw

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const uniforms = {
  uAspect: { value: 1 },
  uCam: { value: new THREE.Vector3(0, -0.24, 0) },
  uYaw: { value: 0 },
  uPitch: { value: 0.06 },
  uSx: { value: 0.9 },
  uSecA: { value: 0 },
  uSecB: { value: 0 },
  uSecMix: { value: 0 },
  uCell: { value: 1.7 },
  uAp: { value: 0.78 },
  uParity: { value: 0 },
  uSeedA: { value: 3.7 },
  uSeedB: { value: 3.7 },
  uMorph: { value: 1 },
  uRepN: { value: 1024 },
  uLip: { value: 0.5 },
  uDetail: { value: 0.5 },
  uPulseZ: { value: -1e5 },
  uPulseAmt: { value: 0 },
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
      uniform float uAspect, uYaw, uPitch, uSx, uSecA, uSecB, uSecMix;
      uniform float uCell, uAp, uParity;
      uniform float uSeedA, uSeedB, uMorph, uRepN, uLip, uDetail;
      uniform float uPulseZ, uPulseAmt, uKick, uHighs, uEnergy, uContrast;
      uniform vec3 uCam, uColBg, uColShadow, uColMid, uColAccent, uColGlow;
      varying vec2 vUv;

      mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
      float hash21(vec2 q) { return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }

      // The cross-section family. Every member is an exact convex SDF
      // and the morph is a constant-weight mix of two of them, which
      // stays 1-Lipschitz, so the march keeps taking near-full steps
      // at any slider position. Sizes are area-matched so the hall
      // holds its scale as it morphs.
      float sdTri(vec2 p, float r) {
        const float k = 1.7320508;
        p.x = abs(p.x) - r;
        p.y = p.y + r / k;
        if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
        p.x -= clamp(p.x, -2.0 * r, 0.0);
        return -length(p) * sign(p.y);
      }
      float sdBox2(vec2 p, vec2 b) {
        vec2 d = abs(p) - b;
        return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
      }
      float sdHex(vec2 p, float r) {
        const vec3 k = vec3(-0.8660254, 0.5, 0.5773503);
        p = abs(p);
        p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
        p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
        return length(p) * sign(p.y);
      }
      float sdShape(vec2 p, float r, float id) {
        if (id < 0.5) return sdTri(vec2(p.x / uSx, p.y), r) * min(uSx, 1.0);
        if (id < 1.5) return sdBox2(p, vec2(r * 0.72, r * 0.66));
        if (id < 2.5) return sdHex(p, r * 0.74);
        return length(p) - r * 0.80;
      }
      float sdSection(vec2 p, float r) {
        float d = sdShape(p, r, uSecA);
        if (uSecMix > 0.001) d = mix(d, sdShape(p, r, uSecB), uSecMix);
        return d;
      }

      // Corridor solid: walls outside the tunnel section, plus per z
      // cell an arch frame biting inward to a per-cell aperture, a
      // stepped chamfer ring on its front face, and a deeper second
      // lip whose parity swaps on accents.
      // gl.x = distance to the nearest arch rim edge (haze glow),
      // gl.y = aperture SDF at the sample (rim shading on hits).
      float map(vec3 p, out vec2 gl) {
        float wall = -sdSection(p.xy, 1.0);
        float ci = floor(p.z / uCell);
        float zl = p.z - (ci + 0.5) * uCell;
        float cw = mod(ci, uRepN);
        float hA = hash21(vec2(cw, uSeedA));
        float hB = hash21(vec2(cw, uSeedB));
        float hj = mix(hA, hB, uMorph);
        float ap = uAp * (0.95 + 0.10 * hj);
        float w = uCell * (0.05 + 0.035 * hj);
        float inner = sdSection(p.xy, ap);
        float frame = max(-inner, abs(zl) - w);
        // Stepped portal profile: a thin chamfer ring just in front of
        // the face, biting slightly less deep, so every arch reads as
        // layered plate like the reference, not a flat cutout.
        float chamfer = max(-sdSection(p.xy, ap * 1.045), abs(zl + w * 1.75) - w * 0.4);
        // Deep lip: alternating cells carry a second ring set back
        // behind the face; uParity crossfades which side is deep, so
        // the swap is a morph, not a cut. Complexity fades lips in.
        float par = mod(ci, 2.0);
        float lipMix = mix(par, 1.0 - par, uParity) * uLip;
        float lap = ap * (0.995 - 0.15 * lipMix);
        float lip = max(-sdSection(p.xy, lap), abs(zl - w * 2.6) - w * 0.55);
        float d = min(min(wall, chamfer), min(frame, lip));
        gl = vec2(length(vec2(max(inner, 0.0), max(abs(zl) - w, 0.0))), inner);
        return d;
      }
      float mapD(vec3 p) { vec2 g; return map(p, g); }

      // Machined plating, shading only (the DE stays exact). Returns a
      // relief height for bump shading plus tone and emissive: big
      // recessed slabs, long vertical plates, fine tiles with rare lit
      // windows, vent slot clusters, and channel seams running the
      // length of the hall.
      float panelH(vec2 uv, float seed, out float tone, out float em) {
        tone = 1.0;
        em = 0.0;
        float h = 0.0;
        // Bevel ramps stay NARROW so panel fields are dead flat: wide
        // ramps put a height gradient across the whole plate and the
        // bump shading draws topographic moire on near faces (seen on
        // the square hall's frame bands).
        vec2 u0 = uv * 0.42 + seed;
        vec2 c0 = floor(u0);
        vec2 f0 = fract(u0);
        float h0 = hash21(c0);
        float e0 = min(min(f0.x, 1.0 - f0.x), min(f0.y, 1.0 - f0.y));
        h += smoothstep(0.02, 0.05, e0) * (0.30 + 0.45 * h0) * 0.55;
        tone *= (0.80 + 0.28 * h0) * (0.55 + 0.45 * smoothstep(0.0, 0.04, e0));
        // Long plates, stretched along the wall height like the
        // reference pillars' strip cladding.
        vec2 u1 = uv * vec2(2.6, 0.85) + seed * 1.7;
        vec2 c1 = floor(u1);
        vec2 f1 = fract(u1);
        float h1 = hash21(c1);
        float e1 = min(min(f1.x, 1.0 - f1.x), min(f1.y, 1.0 - f1.y));
        h += smoothstep(0.012, 0.035, e1) * (0.25 + 0.5 * h1) * 0.30 * uDetail;
        tone *= mix(1.0, (0.86 + 0.24 * h1) * (0.62 + 0.38 * smoothstep(0.0, 0.03, e1)), uDetail);
        // Vent slots: rare plates carry a comb of thin openings.
        float vent = step(0.86, hash21(c1 + 7.3)) * uDetail;
        float slots = vent
          * smoothstep(0.20, 0.0, abs(fract(uv.y * 16.0) - 0.5) - 0.16)
          * smoothstep(0.42, 0.30, abs(f1.x - 0.5))
          * smoothstep(0.45, 0.35, abs(f1.y - 0.5));
        h -= slots * 0.35;
        tone *= 1.0 - slots * 0.5;
        // Fine tiles + lit windows (fine scale only: a big-cell
        // emissive projects enormous near the camera and floods the
        // frame, seen in the first look pass).
        vec2 u2 = uv * 3.9 + seed * 3.1;
        vec2 c2 = floor(u2);
        vec2 f2 = fract(u2);
        float h2 = hash21(c2);
        float e2 = min(min(f2.x, 1.0 - f2.x), min(f2.y, 1.0 - f2.y));
        h += smoothstep(0.008, 0.028, e2) * h2 * 0.15 * uDetail;
        tone *= mix(1.0, (0.93 + 0.14 * h2) * (0.72 + 0.28 * smoothstep(0.0, 0.03, e2)), uDetail * 0.8);
        em = step(0.972, h2) * smoothstep(0.02, 0.10, e2);
        // Channel seams: one deep groove every few units of height,
        // running the whole length of the hall.
        float g = abs(fract(uv.y * 0.33 + 0.21) - 0.5);
        float ch = smoothstep(0.465, 0.5, g);
        h -= ch * 0.30;
        tone *= 1.0 - ch * 0.45 * uDetail;
        return h;
      }

      void main() {
        vec2 uv = (vUv - 0.5) * 2.0 * vec2(uAspect, 1.0);
        vec3 ro = uCam;
        vec3 rd = normalize(vec3(uv.x, uv.y, 1.45));
        rd.yz = rot(-uPitch) * rd.yz;
        rd.xz = rot(uYaw) * rd.xz;

        float tMax = 24.0;
        float t = 0.02;
        vec2 gl;
        float d = 1e3;
        float steps = 0.0;
        bool hit = false;
        // Haze accumulators: every arch rim sheds light into the air,
        // and kick pulses light a whole slab of corridor as they race
        // away. Both integrate along the ray, so nested arches stack
        // into the receding glow of the reference.
        float accRim = 0.0;
        float accPulse = 0.0;
        for (int i = 0; i < 96; i++) {
          vec3 pos = ro + rd * t;
          d = map(pos, gl);
          float st = max(d * 0.9, 0.004);
          accRim += exp(-gl.x * 18.0) * st;
          accPulse += exp(-abs(pos.z - uPulseZ) * (2.2 / uCell)) * st;
          if (d < 0.0016 * t) { hit = true; break; }
          t += st;
          steps += 1.0;
          if (t > tMax) break;
        }
        accRim = min(accRim, 3.0);
        accPulse = min(accPulse, 2.0) * uPulseAmt;

        // The far end: haze brightening down-corridor, peaked a touch
        // above eye line so the apex reads as the light source.
        float fw = clamp(rd.z, 0.0, 1.0);
        float apex = exp(-2.2 * abs(rd.y - 0.14));
        vec3 far = uColBg * 0.35
          + uColMid * pow(fw, 3.0) * 0.05
          + uColGlow * pow(fw, 16.0) * (0.08 + 0.16 * apex) * (0.45 + 0.55 * uEnergy);
        vec3 col = uColBg * (0.45 - 0.18 * rd.y);
        if (hit) {
          vec3 pos = ro + rd * t;
          float h = max(0.0016 * t, 0.001);
          vec2 e2 = vec2(1.0, -1.0) * 0.5773 * h;
          vec3 n = normalize(
            e2.xyy * mapD(pos + e2.xyy) + e2.yyx * mapD(pos + e2.yyx) +
            e2.yxy * mapD(pos + e2.yxy) + e2.xxx * mapD(pos + e2.xxx));

          float ao = clamp(1.0 - steps / 96.0 * 1.2, 0.0, 1.0);
          ao = ao * ao * (3.0 - 2.0 * ao);

          // Machined relief: perturb the normal from the plating
          // height field so insets, slots, and seams catch the light
          // like milled metal instead of painted texture.
          // Plating UV follows the surface orientation: floors run
          // along the hall, walls run z-by-height, and camera-facing
          // frame faces get their own x-by-y map (the wall map is
          // constant along x there and smeared the plating into
          // streaks). Bump fades with distance so far arches stay
          // crisp lines instead of shimmer.
          float em;
          float tone;
          vec3 an = abs(n);
          vec2 puv;
          float sd;
          if (an.y > 0.7) { puv = pos.xz; sd = 4.0 + sign(n.y); }
          else if (an.z > 0.6) { puv = vec2(pos.x * 1.15 + sign(n.z) * 3.3, pos.y * 1.15); sd = 8.0 + sign(n.z); }
          else { puv = vec2(pos.z, pos.y * 1.15 + sign(pos.x) * 7.7); sd = sign(pos.x) * 2.0 + 2.5; }
          float hC = panelH(puv, sd, tone, em);
          float tD, eD;
          float hX = panelH(puv + vec2(0.045, 0.0), sd, tD, eD);
          float hY = panelH(puv + vec2(0.0, 0.045), sd, tD, eD);
          vec3 t1 = normalize(an.z > 0.6 ? vec3(1.0, 0.0, 0.0) - n * n.x : vec3(0.0, 0.0, 1.0) - n * n.z);
          vec3 t2 = cross(n, t1);
          float bumpK = 2.4 * uDetail / (1.0 + t * 0.30);
          n = normalize(n - (t1 * (hX - hC) + t2 * (hY - hC)) * bumpK);

          vec3 L = normalize(vec3(0.12, 0.42, 0.90));
          float dif = max(dot(n, L), 0.0);
          float rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.2) * (0.25 + 0.75 * ao);
          float spe = pow(max(dot(reflect(-L, n), -rd), 0.0), 24.0);
          float hgt = clamp(pos.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 base = mix(uColShadow * 0.55, uColMid * 0.55, hgt * 0.6 + dif * 0.4) * tone;
          col = base * (0.16 + 0.45 * dif) * ao;
          // Arch rims carry the light: only the thin edge where the
          // aperture cuts the frame face. gl.x folds the cross-section
          // and z distances together, so the line stays crisp at any
          // viewing angle.
          float fil = exp(-gl.x * 30.0);
          // Highs keep the light alive but gently: the rim lines cover
          // real frame area, so sibling-sized swings strobe (measured
          // frameDiff p95 0.14 with offbeat hats vs 0.02 without).
          col += uColGlow * fil * (0.34 + 0.18 * uHighs) * ao;
          col += uColAccent * rim * 0.8;
          col += uColAccent * em * (0.25 + 0.35 * uHighs) * ao * smoothstep(1.2, 3.0, t);
          col += uColGlow * spe * (0.30 + 0.30 * uHighs) * ao;
          // Whisper glint: rim+fil span most of the frame, so anything
          // sibling-sized here is a full-frame flash (measured +0.24
          // mean lum on the kick frame at 0.20).
          col += uColGlow * uKick * 0.06 * (rim + fil * ao);
          col = mix(col, far, smoothstep(tMax * 0.60, tMax * 0.95, t));
        } else {
          col = mix(col, far, smoothstep(tMax * 0.45, tMax, t));
        }
        col += uColGlow * accRim * 0.03 * (0.5 + 0.5 * uEnergy);
        col += uColGlow * accPulse * 0.08;

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

// Cross-section morph nodes across the upper half of SHAPE: pure
// triangle holds the reference look at center, then square, hexagon,
// circle. Floor depth per shape feeds the camera height guard.
const SEC_FLOOR = [0.5774, 0.66, 0.74, 0.80];

let z = 0;
let ph1 = 0;
let ph2 = 0;
let ap = 0.78;
let apTarget = 0.78;
let parityT = 0;
let parity = 0;
let morph = 1;
let seedB = 3.7;
let lastAccent = -1e9;
let pulseZ = -1e5;
let pulseAmt = 0;
let camY = -0.24;
let tiltS = 0;
// Slow signals, sibling convention: motion follows the music on phrase
// timescales, light stays live.
let midsS = 0;
let subS = 0;
let enS = 0.5;

return { // vjw: was `export default {`
  name: 'gate',
  scene,
  camera,
  trails: false,
  // Per-pixel raymarch like the siblings; the corridor SDF is exact,
  // so this budget holds it comfortably. Taste/perf knob.
  pixelBudget: 1.5,
  edgeAA: true,  // level-set silhouette: the engine FXAA pass smooths it
  // Modest bloom: the corridor already feeds the pass a large area
  // glow (the far haze), so sibling-sized strengths double the frame
  // luminance (measured: bloomMul 0 dropped mean lum 0.39 to 0.15).
  bloom: { strength: 0.12, gain: 0.15 },
  params: { speed: 0.5, shape: 0.5, complexity: 0.5, density: 0.5, fill: 0.5, tilt: 0.5, contrast: 0.5 },
  // density reads as "arches" in the panel: how tightly the frames
  // stack down the corridor.
  paramLabels: { '*': { density: 'arches' } },
  update(s, dt, t) {
    const P = this.params;
    const spd = drastic(P.speed);

    midsS += (s.mids - midsS) * (1 - Math.exp(-dt * 0.5));
    subS += (s.sub - subS) * (1 - Math.exp(-dt * 0.6));
    enS += (s.energy - enS) * (1 - Math.exp(-dt * 2.5));

    const cell = 2.6 - P.density * 1.75;
    z += dt * spd * 0.5 * (0.7 + midsS * 0.6);
    ph1 += dt * 0.11 * spd;
    ph2 += dt * 0.073 * spd;

    // ACCENTED kicks rebuild the passage, gated like the siblings
    // (strength threshold + minimum rest, long fallback for quiet
    // grooves): every arch steps its aperture and the deep-lip parity
    // swaps sides. Both targets ease, so the hit lands as architecture
    // moving, never a cut.
    const center = 0.93 - P.fill * 0.31;
    if (s.onKick && t - lastAccent > 3.2 && (s.onKick > 0.55 || t - lastAccent > 8)) {
      lastAccent = t;
      apTarget += (Math.random() * 2 - 1) * (0.06 + 0.09 * s.onKick);
      const lo = Math.max(center - 0.14, 0.55), hi = center + 0.14;
      if (apTarget < lo) apTarget = lo + (lo - apTarget);
      if (apTarget > hi) apTarget = hi - (apTarget - hi);
      apTarget = Math.min(hi, Math.max(lo, apTarget));
      parityT = 1 - parityT;
      // Re-deal the per-arch variation only once the last morph has
      // landed; mid-morph reseeds would snap the corridor.
      if (morph > 0.9) {
        uniforms.uSeedA.value = seedB;
        seedB = Math.random() * 100;
        uniforms.uSeedB.value = seedB;
        morph = 0;
      }
    }
    apTarget += (center - apTarget) * (1 - Math.exp(-dt * 0.08));
    // Glacial approach like the siblings (oracle's fold runs tau ~2 s):
    // accents redirect the metamorphosis mid-flight, the hall never
    // lurches. Faster easings measured 4x the family's per-frame delta.
    ap += (apTarget - ap) * (1 - Math.exp(-dt * 0.9));
    parity += (parityT - parity) * (1 - Math.exp(-dt * 1.1));
    morph += (1 - morph) * (1 - Math.exp(-dt * 0.55));

    // Every kick launches light down the hall; it spawns at mid-depth
    // (a near spawn lights the whole close cross-section and reads as
    // a flash) and races away, draining faster than a beat.
    if (s.onKick) {
      pulseZ = z + cell * 1.5;
      pulseAmt = Math.min(1, pulseAmt + 0.22 + 0.28 * s.onKick);
    }
    pulseZ += dt * spd * 6.0;
    pulseAmt *= Math.exp(-dt * 1.9);

    // Wrap z on a hash-period boundary so float32 never degrades and
    // the corridor pattern tiles seamlessly (~45 min at neutral speed).
    const repN = Math.max(64, Math.round(2800 / cell));
    const period = repN * cell;
    if (z > period) { z -= period; pulseZ -= period; }

    // SHAPE: below center the triangle leans steeper; above center the
    // section morphs through the family with plateaus at each pure
    // shape so the detents feel like real rooms, not a blur.
    let secA = 0, secB = 0, secMix = 0, floorF = SEC_FLOOR[0];
    if (P.shape > 0.5) {
      const seg = Math.min((P.shape - 0.5) / (1 / 6), 2.9999);
      secA = Math.floor(seg);
      secB = secA + 1;
      const f = Math.max(0, Math.min(1, (seg - secA - 0.15) / 0.7));
      secMix = f * f * (3 - 2 * f);
      floorF = SEC_FLOOR[secA] + (SEC_FLOOR[secB] - SEC_FLOOR[secA]) * secMix;
    }
    const sx = P.shape <= 0.5
      ? 0.55 + P.shape * 0.70
      : 0.90 + Math.min(1, (P.shape - 0.5) * 6) * 0.10;

    // Camera: eye height rides above the tightest lip the walk can
    // reach for the current section (a clipped frame fills the screen
    // otherwise), sway shrinks as the margin does.
    const apWorst = Math.max(center - 0.14, 0.55) * 0.95 * 0.845;
    const floorY = -floorF * apWorst;
    camY += (Math.max(-0.26, floorY + 0.085) - camY) * (1 - Math.exp(-dt * 2));
    const swayX = 0.02 + Math.sin(ph1) * (0.05 + 0.03 * subS);
    const swayY = Math.sin(ph2) * 0.035;

    uniforms.uCam.value.set(swayX, camY + swayY, z);
    uniforms.uYaw.value = Math.sin(ph1 * 0.6) * 0.06;
    // TILT cranes the view, bipolar, 0.5 = level (sibling convention),
    // smoothed and clamped short of straight up.
    tiltS += ((P.tilt - 0.5) * 1.7 - tiltS) * (1 - Math.exp(-dt * 5));
    uniforms.uPitch.value = Math.max(-1.3, Math.min(1.3, 0.06 + tiltS + Math.sin(ph2 * 0.8) * 0.03));
    uniforms.uSx.value = sx;
    uniforms.uSecA.value = secA;
    uniforms.uSecB.value = secB;
    uniforms.uSecMix.value = secMix;
    uniforms.uCell.value = cell;
    uniforms.uAp.value = ap;
    uniforms.uParity.value = parity;
    uniforms.uMorph.value = morph;
    uniforms.uRepN.value = repN;
    uniforms.uLip.value = Math.min(1, Math.max(0, (P.complexity - 0.15) / 0.55));
    uniforms.uDetail.value = P.complexity;
    uniforms.uPulseZ.value = pulseZ;
    uniforms.uPulseAmt.value = pulseAmt;
    uniforms.uKick.value = s.kick * 0.6;
    uniforms.uHighs.value = s.highs;
    uniforms.uEnergy.value = enS;
    uniforms.uContrast.value = P.contrast;
  },
  resize(w, h) {
    uniforms.uAspect.value = w / h;
  },
  // Headless QA: live corridor state for numeric assertions.
  _dbg() {
    return {
      z, ap, apTarget, parity, parityT, morph, pulseAmt, camY, lastAccent,
      secA: uniforms.uSecA.value, secB: uniforms.uSecB.value, secMix: uniforms.uSecMix.value,
    };
  },
};
} // vjw: the factory
