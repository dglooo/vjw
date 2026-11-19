// Copied from donor/vs3/visual_kit/src/scenes/morphogen.js (the friends' engine, used with permission, 2026-11-19).
// vjw: wrapped in a factory (one scene object per layer); nothing else changed. agents/guides/guide_vs3_port.md
// The host makes ctx.renderer's setRenderTarget(null) and getDrawingBufferSize() mean the layer's target (vs3/host.ts).
// Scene: Morphogen — a reaction-diffusion organism (Gray-Scott) folded
// into a symmetric mark. A morphogen is Turing's word for a chemical
// that builds pattern by reacting and diffusing, which is literally
// this scene: two of them feed and kill each other on a coarse GPU
// grid, and the display thresholds the result into a crisp two-tone
// figure, a living inkblot of coral limbs, fat lobes, labyrinth veins.
// The reference reel (Karl Sims' RD tool via isosceles.vj) hand-picks
// its moments; here the sim runs live and the music drives it: energy
// sets how fast the chemistry runs, bass swells the lobes, and an
// accented kick shifts the feed/kill regime so the whole figure
// re-textures itself (structure, not flash). The fold (shape) mirrors
// the field across one or both axes, which is what turns free-growing
// liquid into a symmetric mark; Alec's pick from the reel is the
// symmetric family, so the mirror is the default. Painting with the
// mouse seeds new growth under the cursor. Named by Alec after working
// titles sigil and totem; user presets saved under those names migrate
// in applyPreset (SCENE_RENAMES).
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { PAL, drastic, scenePointer } from '../lib/common.js';
import { ctx } from '../lib/context.js';

export default function create() { // vjw
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// Gray-Scott regime line, swept by the pattern slider: k held near
// 0.062 while f runs 0.030 → 0.058 keeps the whole sweep inside the
// self-sustaining band (dots → worms → dense coral); the top bend pulls
// k down slightly toward the labyrinth family. Accents walk a small
// jitter around the slider's point, clamped so no walk can land in a
// dead zone (f too high kills everything, k too low goes to chaos).
const F_LO = 0.030, F_HI = 0.058;
const K_BASE = 0.062, K_BEND = 0.0035;
const F_CLAMP = [0.027, 0.060], K_CLAMP = [0.0575, 0.0648];
const DT = 1.0;              // classic stability; speed = step count, never dt
const STEP_BASE = 9.5;       // steps per frame at speed 0.5, full energy
const STEP_CAP = 44;
// The mask edge is where the chemistry dies, so moving it is the one
// control that makes the figure GROW rather than just churn: open it and A
// re-feeds fresh ground so limbs push outward, close it and the rim erodes
// back. Held still, Gray-Scott settles and the mark just sits there.
// Growth arc. The mark starts as a seed barely on the screen and sweeps
// out to the slider's full radius, fast on the way open and slower on the
// way back, so a build reads as the figure taking the frame rather than a
// texture wobbling in place. R_SEED is how small "not spread at all" is.
const R_SEED = 0.13;
const GROW_ENERGY = 1.7, GROW_KICK = 0.8, GROW_PUNCH = 0.55;
const GROW_ATTACK = 5.5, GROW_RELEASE = 0.9;
// An accented kick collapses the mark back to its seed, and the attack
// above immediately sweeps it out again. That is the gesture: the figure
// takes the frame, gets pulled back to almost nothing, and retakes it.
// Structural, and on the same accent gate as the chemistry walk, so it
// cannot fire on every kick.
const GROW_COLLAPSE = 0.08;

// ------------------------------------------------------------- display
const displayU = {
  tField: { value: null },
  uTexel: { value: new THREE.Vector2() },
  uAspect: { value: 1 },
  uFold: { value: 1 },
  uThr: { value: 0.23 },
  uSwell: { value: 0 },
  uRim: { value: 0.1 },
  uContrast: { value: 0.5 },
  uBg: { value: PAL.bg },
  uShadow: { value: PAL.shadow },
  uMid: { value: PAL.mid },
  uAccent: { value: PAL.accent },
  uGlow: { value: PAL.glow },
};
const quad = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.ShaderMaterial({
    uniforms: displayU,
    depthWrite: false,
    depthTest: false,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tField;
      uniform vec2 uTexel;
      uniform float uAspect, uFold, uThr, uSwell, uRim, uContrast;
      uniform vec3 uBg, uShadow, uMid, uAccent, uGlow;
      varying vec2 vUv;

      // The fold IS the mark: mirroring the display across the frame
      // axes guarantees perfect symmetry no matter what the free sim
      // does. The fold line sits at the sim's center column, so the
      // figure's spine is continuous by construction.
      vec2 fold(vec2 uv) {
        if (uFold > 0.5) uv.x = 0.5 - abs(uv.x - 0.5);
        if (uFold > 1.5) uv.y = 0.5 - abs(uv.y - 0.5);
        return uv;
      }

      // 9-tap tent smooth: the sim grid is coarse on purpose (that is
      // where the fat lobes come from) and plain bilinear shows facet
      // diamonds at the threshold; the tent pass rounds the field so
      // the fwidth edge reads like cut vinyl, not upscaled pixels.
      float field(vec2 uv) {
        float s = 0.0;
        s += 4.0 * texture2D(tField, uv).g;
        s += 2.0 * texture2D(tField, uv + vec2(uTexel.x, 0.0)).g;
        s += 2.0 * texture2D(tField, uv - vec2(uTexel.x, 0.0)).g;
        s += 2.0 * texture2D(tField, uv + vec2(0.0, uTexel.y)).g;
        s += 2.0 * texture2D(tField, uv - vec2(0.0, uTexel.y)).g;
        s += texture2D(tField, uv + uTexel).g;
        s += texture2D(tField, uv - uTexel).g;
        s += texture2D(tField, uv + vec2(uTexel.x, -uTexel.y)).g;
        s += texture2D(tField, uv - vec2(uTexel.x, -uTexel.y)).g;
        return s / 16.0;
      }

      void main() {
        float B = field(fold(vUv));
        float thr = uThr - uSwell;
        float aa = max(fwidth(B) * 1.2, 0.004);
        float mask = smoothstep(thr - aa, thr + aa, B);

        // Two-tone by design: the mark in light, the void in bg. A
        // touch of interior depth keeps big lobes from reading flat
        // dead white; on pearl it stays effectively monochrome.
        float depth = smoothstep(thr, thr + 0.22, B);
        vec3 body = mix(uMid, uGlow, 0.45 + 0.55 * depth);
        vec3 col = mix(uBg, body, mask);

        // Accent rim on the contour, highs-driven and kept small: the
        // rim spans the whole figure's edge, and frame-length lines
        // strobe at gains that suit thin filaments (the gate lesson).
        float rim = 1.0 - smoothstep(0.0, 0.05 + aa * 2.0, abs(B - thr));
        col += uAccent * rim * uRim;

        vec3 hi = col * col * (3.0 - 2.0 * col);
        vec3 lo = pow(max(col, 0.0), vec3(0.72));
        col = mix(col, hi, max(0.0, uContrast - 0.5) * 1.6);
        col = mix(col, lo, max(0.0, 0.5 - uContrast) * 1.6);
        gl_FragColor = vec4(clamp(col, 0.0, 1.1), 1.0);
      }`,
  })
);
scene.add(quad);

// ------------------------------------------------------------ sim passes
const VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`;

function makePass(uniforms, fragment) {
  return new FullScreenQuad(new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: fragment,
  }));
}

// One Gray-Scott step. A in r, B in g. 9-point Laplacian (0.2 cardinal,
// 0.05 diagonal — Karl Sims' weights) for isotropy: a 5-point stencil
// grows square-biased coral. The feed mask does the border erasure:
// outside the spread radius the kill rate rises, so the figure ends in
// organically dying fingers instead of a clipped edge, and A re-feeds
// there so the pattern can grow back out when spread opens up.
const simU = {
  tField: { value: null },
  uTexel: { value: new THREE.Vector2() },
  uAspect: { value: 1 },
  uF: { value: 0.0545 }, uK: { value: 0.062 },
  uMaskR: { value: new THREE.Vector2(1, 1) },
};
const simPass = makePass(simU, /* glsl */`
  uniform sampler2D tField;
  uniform vec2 uTexel, uMaskR;
  uniform float uAspect, uF, uK;
  varying vec2 vUv;
  void main() {
    vec2 c = texture2D(tField, vUv).rg;
    vec2 lap = -c;
    lap += 0.2 * texture2D(tField, vUv + vec2(uTexel.x, 0.0)).rg;
    lap += 0.2 * texture2D(tField, vUv - vec2(uTexel.x, 0.0)).rg;
    lap += 0.2 * texture2D(tField, vUv + vec2(0.0, uTexel.y)).rg;
    lap += 0.2 * texture2D(tField, vUv - vec2(0.0, uTexel.y)).rg;
    lap += 0.05 * texture2D(tField, vUv + uTexel).rg;
    lap += 0.05 * texture2D(tField, vUv - uTexel).rg;
    lap += 0.05 * texture2D(tField, vUv + vec2(uTexel.x, -uTexel.y)).rg;
    lap += 0.05 * texture2D(tField, vUv - vec2(uTexel.x, -uTexel.y)).rg;

    vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0) / uMaskR;
    float m = dot(q, q);
    float outside = smoothstep(0.85, 1.3, m);
    float k = uK + outside * 0.022;

    float rxn = c.r * c.g * c.g;
    float A = c.r + (lap.r - rxn + uF * (1.0 - c.r)) * ${DT.toFixed(1)};
    float B = c.g + (0.5 * lap.g + rxn - (k + uF) * c.g) * ${DT.toFixed(1)};
    A = clamp(A, 0.0, 1.0);
    B = clamp(B, 0.0, 1.0);
    if (!(A == A) || !(B == B)) { A = 1.0; B = 0.0; }
    gl_FragColor = vec4(A, B, 0.0, 1.0);
  }`);

// Seed stamp — adds B (and eats A) in up to four gaussian pips.
const SEED_N = 4;
const stampU = {
  tField: { value: null },
  uAspect: { value: 1 },
  uPips: { value: Array.from({ length: SEED_N }, () => new THREE.Vector4(0, 0, 0, 0)) },
};
const stampPass = makePass(stampU, /* glsl */`
  #define N ${SEED_N}
  uniform sampler2D tField;
  uniform float uAspect;
  uniform vec4 uPips[N]; // xy pos (uv), z radius (world), w amount
  varying vec2 vUv;
  void main() {
    vec2 c = texture2D(tField, vUv).rg;
    for (int i = 0; i < N; i++) {
      vec4 p = uPips[i];
      if (p.w <= 0.0) continue;
      vec2 d = (vUv - p.xy) * vec2(uAspect, 1.0);
      float g = exp(-dot(d, d) / (p.z * p.z)) * p.w;
      c.g = min(1.0, c.g + g);
      c.r = max(0.0, c.r - g * 0.5);
    }
    gl_FragColor = vec4(c, 0.0, 1.0);
  }`);

// Reset — chemical A everywhere, no B; growth starts from the stamps.
const resetPass = makePass({}, /* glsl */`
  void main() { gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); }`);

// Rescale copy — the scale slider rebuilds the grid and this pass blits
// the old field across so the figure survives, reflowing to the new
// feature size over the next seconds (the sim re-forms stripe width
// on its own — watching it settle is half the point of the slider).
const copyU = { tSrc: { value: null } };
const copyPass = makePass(copyU, /* glsl */`
  uniform sampler2D tSrc;
  varying vec2 vUv;
  void main() { gl_FragColor = texture2D(tSrc, vUv); }`);

// ------------------------------------------------------------- targets
let fieldA = null, fieldB = null;
let simW = 0, simH = 0, aspect = 1;
let needSeed = true;

function makeTarget(renderer, w, h) {
  const type = (renderer.capabilities.isWebGL2 &&
    renderer.extensions.get('EXT_color_buffer_float'))
    ? THREE.FloatType : THREE.HalfFloatType;
  return new THREE.WebGLRenderTarget(w, h, {
    type,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
  });
}

function run(pass, target) {
  ctx.renderer.setRenderTarget(target);
  pass.render(ctx.renderer);
}

// Grid height IS the feature scale: Gray-Scott's stripe wavelength is
// fixed in texels (~11 with these constants), so fewer texels = fatter
// lobes on screen. The scale slider sweeps ~15 stripes per frame height
// up to ~47. Hysteresis keeps a slider drag from rebuilding every frame.
function ensureSim(renderer, fill) {
  const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
  // A hidden pane's drawing buffer can report 0x0; 0/0 is NaN and a
  // NaN-sized target is an incomplete framebuffer.
  aspect = buf.x > 0 && buf.y > 0 ? buf.x / buf.y : 1;
  const targetH = Math.round(mix(520, 168, fill));
  const targetW = Math.min(960, Math.round(targetH * aspect));
  if (fieldA && Math.abs(targetH - simH) < 14 && Math.abs(targetW - simW) < 20) return;
  const oldA = fieldA, oldB = fieldB;
  simH = targetH; simW = targetW;
  fieldA = makeTarget(renderer, simW, simH);
  fieldB = makeTarget(renderer, simW, simH);
  if (oldA) {
    copyU.tSrc.value = oldA.texture;
    run(copyPass, fieldA);
    oldA.dispose();
    oldB.dispose();
    // A hard downscale can starve features below the critical
    // wavelength; a couple of pips re-bloom the figure if so.
    queueSeed(2, 0.5);
  } else {
    needSeed = true;
  }
}

const mix = (a, b, x) => a + (b - a) * x;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ------------------------------------------------------------- state
let f = 0.0545, k = 0.062;         // eased live regime
let fTgt = 0.0545, kTgt = 0.062;   // slider point + accent walk
let fAcc = 0, kAcc = 0;            // accent walk offsets (targets)
let fAccE = 0, kAccE = 0;          // eased
let lastSnap = -10;
let lastSeed = -10;
let seedAngle = 0;
let stepAcc = 0;
let energyE = 0.4, subE = 0, swell = 0;
// Spread breathing: eased follower + an accent impulse that decays.
let spreadE = 0, spreadAcc = 0;   // 0 = seed, 1 = slider's full radius
let stepsLast = 0;
const pips = [];                   // queued {x, y, r, amt} in sim uv

function queueSeed(n, amt) {
  // Golden-angle placement inside the spread mask, biased toward the
  // fold spine so new limbs join the figure instead of floating loose.
  for (let i = 0; i < n; i++) {
    seedAngle += 2.399963;
    const rr = 0.12 + 0.3 * ((seedAngle * 7.13) % 1);
    pips.push({
      x: 0.5 + Math.cos(seedAngle) * rr * 0.55,
      y: 0.5 + Math.sin(seedAngle) * rr,
      r: 0.022, amt,
    });
  }
}

function applyStamps() {
  if (!pips.length) return;
  const batch = pips.splice(0, SEED_N);
  for (let i = 0; i < SEED_N; i++) {
    const u = stampU.uPips.value[i];
    const p = batch[i];
    if (p) u.set(p.x, p.y, p.r, p.amt);
    else u.set(0, 0, 0, 0);
  }
  stampU.tField.value = fieldA.texture;
  stampU.uAspect.value = aspect;
  run(stampPass, fieldB);
  [fieldA, fieldB] = [fieldB, fieldA];
}

return { // vjw: was `export default {`
  name: 'morphogen',
  scene,
  camera,
  // Large-area scene: the lit fraction of this frame is 10x a filament
  // scene's, so every bloom term shrinks with it (the gate lesson).
  // `kick` overrides the engine's global +0.35 kick-glow term, which
  // measured +0.12 mean lum here — a strobe, not a breathe. The
  // crispness comes from the fwidth edge, not glow.
  bloom: { strength: 0.14, gain: 0.06, kick: 0.05 },
  params: { speed: 0.5, shape: 0.5, complexity: 0.55, density: 0.5, fill: 0.5, contrast: 0.5 },
  paramLabels: { '*': { shape: 'fold', complexity: 'pattern', density: 'spread', fill: 'scale' } },
  update(s, dt, t) {
    if (!ctx.renderer) return;
    const P = this.params;
    // fold: free field below 1/3, bilateral mirror through the middle
    // (the default — Alec's pick from the reel is the symmetric family),
    // both axes above 2/3.
    const foldN = P.shape < 1 / 3 ? 0 : P.shape < 2 / 3 ? 1 : 2;
    ensureSim(ctx.renderer, P.fill);

    // First life: chemical bath + a spine of pips down the fold axis,
    // so the mark grows out of its own centerline like the reel.
    if (needSeed) {
      needSeed = false;
      run(resetPass, fieldA);
      run(resetPass, fieldB);
      pips.length = 0;
      for (let i = -2; i <= 2; i++) {
        pips.push({ x: 0.5, y: 0.5 + i * 0.11, r: 0.02, amt: 0.85 });
      }
      lastSeed = t;
    }

    // Pattern slider: slide along the stable regime line. Accented
    // kicks walk a jitter around the slider's point (structural: the
    // whole field re-textures as the chemistry shifts), eased so the
    // figure morphs instead of cutting. Ordinary kicks only swell.
    const c = P.complexity;
    const fBase = mix(F_LO, F_HI, c);
    const kBase = K_BASE - Math.max(0, (c - 0.7) / 0.3) * K_BEND;
    const acc = s.onKick;
    if (acc > 0 && t - lastSnap > 3.2 && (acc > 0.55 || t - lastSnap > 8)) {
      lastSnap = t;
      fAcc = (Math.random() * 2 - 1) * 0.0022;
      kAcc = (Math.random() * 2 - 1) * 0.0012;
      // Same accent gate collapses the mask to a seed; the fast attack
      // then sweeps it back out, so the re-texture and the regrowth land
      // as one gesture instead of two events.
      spreadE = GROW_COLLAPSE;
      spreadAcc = GROW_PUNCH;
      queueSeed(1 + Math.round(Math.random() + acc), 0.7);
      lastSeed = t;
    }
    // Quiet grooves and a freshly eroded field both revive from a
    // gentle fallback pip; a healthy figure just absorbs it.
    if (t - lastSeed > 25) { queueSeed(1, 0.55); lastSeed = t; }
    const ke = 1 - Math.exp(-dt * 1.1);
    fAccE += (fAcc - fAccE) * ke;
    kAccE += (kAcc - kAccE) * ke;
    fTgt = clamp(fBase + fAccE, F_CLAMP[0], F_CLAMP[1]);
    kTgt = clamp(kBase + kAccE, K_CLAMP[0], K_CLAMP[1]);
    const kr = 1 - Math.exp(-dt * 3.5);
    f += (fTgt - f) * kr;
    k += (kTgt - k) * kr;

    // Painting: while the mouse is held on the canvas, seed under the
    // cursor. The stamp lands in folded space, so painting draws
    // mirrored limbs live: the fold turns doodling into mark-making.
    if (scenePointer.held && scenePointer.ndc) {
      const px = scenePointer.ndc.x * 0.5 + 0.5;
      const py = scenePointer.ndc.y * 0.5 + 0.5;
      pips.push({ x: px, y: py, r: 0.016, amt: 0.6 });
      lastSeed = t;
    }

    // Energy runs the chemistry: loud sections boil, quiet passages
    // barely creep (calm-when-low is the product rule), and the speed
    // slider sweeps the whole thing 16x.
    energyE += (s.energy - energyE) * (1 - Math.exp(-dt * 2.2));
    const rate = STEP_BASE * drastic(P.speed)
      * (0.22 + 0.95 * energyE + s.kick * 0.45);
    stepAcc += rate * Math.min(dt, 0.05) * 60;
    let steps = Math.min(STEP_CAP, Math.floor(stepAcc));
    stepAcc = Math.min(stepAcc - steps, 2);

    // Spread: the feed mask radius. The fold picks the mask's build —
    // a tall column under a bilateral fold (the mirrored-column look),
    // a disc for the quad fold (splat-mark) and the free field.
    //
    // The radius breathes with the track. Held still, Gray-Scott settles
    // and the figure just sits there, which is what the site clips showed.
    // Moving the mask edge is what makes it visibly LIVE: opening feeds
    // fresh ground so limbs push outward, closing erodes the rim back.
    // Energy carries the slow swell, accents punch on top, and both are
    // scaled by how much room the slider left, so a deliberately tight
    // mark keeps its shape instead of ballooning.
    // Scaled on the radius, not the slider: the slider's curve is
    // quadratic, so adding to it barely moves a tight mark and shoves a
    // wide one. A proportional swing breathes the same amount whatever
    // the slider says.
    // Three timescales, so it is never merely drifting: the section
    // energy sets where the mark sits, every kick pushes the rim out a
    // little (a small breathe, which the kick rule allows), and an
    // accented kick throws it wide and lets it creep back. Energy alone
    // is a slow ramp and reads as a still picture.
    // The slider is the CEILING the growth reaches, not a fixed size.
    // Asymmetric easing is the whole effect: quick to open, reluctant to
    // close, so the sweep outward is the gesture you watch.
    spreadAcc *= Math.exp(-dt * 0.45);
    const drive = clamp((energyE - 0.12) * GROW_ENERGY
      + s.kick * GROW_KICK + spreadAcc, 0, 1);
    const kg = 1 - Math.exp(-dt * (drive > spreadE ? GROW_ATTACK : GROW_RELEASE));
    spreadE += (drive - spreadE) * kg;
    const rFull = 0.32 + 2.3 * P.density * P.density;
    const r = mix(R_SEED, rFull, clamp(spreadE, 0, 1));
    if (foldN === 1) simU.uMaskR.value.set(r * 0.6, r * 1.3);
    else simU.uMaskR.value.set(r, r);

    // Queued pips land in the VISIBLE folded region, or accent seeds
    // sprout limbs the fold never shows. Folding is idempotent, so
    // already-folded mouse pips pass through unchanged.
    if (foldN > 0) {
      for (const p of pips) {
        p.x = 0.5 - Math.abs(p.x - 0.5);
        if (foldN > 1) p.y = 0.5 - Math.abs(p.y - 0.5);
      }
    }
    applyStamps();
    simU.uTexel.value.set(1 / simW, 1 / simH);
    simU.uAspect.value = aspect;
    simU.uF.value = f;
    simU.uK.value = k;
    for (let i = 0; i < steps; i++) {
      simU.tField.value = fieldA.texture;
      run(simPass, fieldB);
      [fieldA, fieldB] = [fieldB, fieldA];
    }
    stepsLast = steps;
    ctx.renderer.setRenderTarget(null);

    // Bass fattens the mark. The swell moves the WHOLE contour at
    // once, and on fat lobes the field gradient at the threshold is
    // shallow, so a small threshold drop swells a lot of area: at
    // 0.045 the kick-frame lum delta measured +0.15 (a strobe, not a
    // breathe). Sub carries most of it slowly; the kick punch gets a
    // sliver. Structure on kicks comes from the step-rate surge and
    // the accent regime walk, not from area.
    subE += (s.sub - subE) * (1 - Math.exp(-dt * 3));
    swell = clamp(subE * 0.7 + s.kick * 0.3, 0, 1) * 0.018;

    displayU.tField.value = fieldA.texture;
    displayU.uTexel.value.set(1 / simW, 1 / simH);
    displayU.uAspect.value = aspect;
    displayU.uFold.value = foldN;
    displayU.uSwell.value = swell;
    displayU.uRim.value = 0.06 + s.highs * 0.3;
    displayU.uContrast.value = P.contrast;
  },
  resize() { /* ensureSim rebuilds from the drawing buffer each frame */ },
  // QA hooks (verification doctrine: numbers, not screenshots). Reads
  // the field back and reduces it: NaN count, B coverage inside the
  // visible fold, mean concentrations, live regime, steps this frame.
  debugField() {
    if (!fieldA || !ctx.renderer) return null;
    const w = simW, h = simH, n = w * h;
    const px = new Float32Array(n * 4);
    if (fieldA.texture.type !== THREE.FloatType) return { halfFloat: true };
    ctx.renderer.readRenderTargetPixels(fieldA, 0, 0, w, h, px);
    let nan = 0, cov = 0, sumA = 0, sumB = 0, maxB = 0;
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const A = px[j], B = px[j + 1];
      if (A !== A || B !== B) { nan++; continue; }
      sumA += A; sumB += B;
      if (B > 0.2) cov++;
      if (B > maxB) maxB = B;
    }
    return {
      simW: w, simH: h, nan,
      coverage: cov / n, meanA: sumA / n, meanB: sumB / n, maxB,
      f, k, fTgt, kTgt, stepsLast, lastSnap, lastSeed,
      fold: displayU.uFold.value,
    };
  },
  _reseed() { needSeed = true; },
};
} // vjw: the factory
