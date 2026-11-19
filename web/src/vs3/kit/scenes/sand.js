// Copied from donor/vs3/visual_kit/src/scenes/sand.js (the friends' engine, used with permission, 2026-11-19).
// vjw: wrapped in a factory (one scene object per layer); nothing else changed. agents/guides/guide_vs3_port.md
// Scene: Sand — Chladni plate figures derived from the real spectrum.
// The active plate modes are the ones whose natural frequencies sit
// nearest the loudest bins of s.specHi (192-bin analyzer), so the figure
// IS the sound: play a chord and its partials pick the pattern. The
// reference reels hand-pick their shapes; deriving them honestly is the
// whole point of this scene. Harmony changes re-pick the mode set,
// accent-gated (strength threshold + minimum rest, the citadel gate).
// Sand grains gather on the nodal lines; sub thickens the gather, highs
// shimmer the grains, kicks toss the sand. complexity is the register
// slider: it slides the figure through the mode family the way the
// classic plate videos sweep the driving tone, morphing shape to shape.
import * as THREE from 'three';
import { PAL, drastic } from '../lib/common.js';
export default function create() { // vjw

// Plate mode family. A Chladni plate's natural frequencies scale with
// m^2 + n^2 (plates are dispersive, unlike membranes). F0 anchors the
// family in the musical range so bass picks sparse bold figures and
// treble picks fine dense ones. Only SAME-PARITY pairs (both odd or
// both even): a center-driven plate excites modes symmetric about its
// center, which is why the reference photos read as figures instead of
// noise. Mixed parities break the mirror symmetry and turn the sum to
// mush (feel pass 2).
const F0 = 30;
const MMAX = 12;
const K = 10; // mode slots summed in the shader
const MODE_TABLE = [];
for (let m = 1; m <= MMAX; m++) {
  for (let n = 1; n <= m; n++) {
    if ((m ^ n) & 1) continue;
    const f = F0 * (m * m + n * n);
    MODE_TABLE.push({ m, n, f, lf: Math.log2(f) });
  }
}
// Sorted by frequency: the figure slider steps ALONG this order, one
// distinct shape per detent.
MODE_TABLE.sort((a, b) => a.f - b.f);

// Display-bin mapping — must match main.js (DISP_FMIN/DISP_FMAX/DISP_N).
const DISP_N = 192, FMIN = 35, FMAX = 18000;
const OCTAVES = Math.log2(FMAX / FMIN);
const freqToBin = (f) => Math.round((DISP_N - 1) * Math.log2(f / FMIN) / OCTAVES);
const binToFreq = (j) => FMIN * Math.pow(FMAX / FMIN, j / (DISP_N - 1));

// Mode picking ignores the bottom bins: fffb~ skirts and the 48 dB
// display floor make the sub region unreliable for peak logic, and the
// sub already has a job here (it thickens the gather). ~110 Hz up.
const LO_BIN = freqToBin(110);
const PEAK_FLOOR = 0.36; // display floor: silent bins park near 0.30
const MIN_SEP = 6;       // bins between picked peaks (~1/4 octave)
const PEAKS_MAX = 5;     // partials carried at once

function findPeaks(spec, count) {
  const peaks = [];
  for (let j = Math.max(1, LO_BIN); j < DISP_N - 1; j++) {
    const v = spec[j];
    if (v < PEAK_FLOOR || v < spec[j - 1] || v < spec[j + 1]) continue;
    peaks.push({ j, v });
  }
  peaks.sort((a, b) => b.v - a.v);
  const kept = [];
  for (const p of peaks) {
    if (kept.length >= count) break;
    if (kept.every((q) => Math.abs(q.j - p.j) >= MIN_SEP)) kept.push(p);
  }
  return kept;
}

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const uniforms = {
  uAspect: { value: 1 },
  uModes: { value: Array.from({ length: K }, () => new THREE.Vector4(1, 1, 0, 1)) },
  uPhi: { value: new Float32Array(K) },
  uInvAmp: { value: 0 },
  uAlive: { value: 0 },
  uShape: { value: 0 },
  uScale: { value: 1 },
  uThick: { value: 24 },
  uDens: { value: 0.6 },
  uJolt: { value: 0 },
  uHighs: { value: 0 },
  uEnergy: { value: 0 },
  uGrainT: { value: 0 },
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
    uniforms,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      #define K ${K}
      uniform float uAspect, uInvAmp, uAlive, uShape, uScale;
      uniform float uThick, uDens, uJolt, uHighs, uEnergy, uGrainT, uContrast;
      uniform vec4 uModes[K];
      uniform float uPhi[K];
      uniform vec3 uBg, uShadow, uMid, uAccent, uGlow;
      varying vec2 vUv;
      const float PI = 3.14159265;

      vec2 hash22(vec2 p) {
        return fract(sin(vec2(dot(p, vec2(127.1, 311.7)),
                              dot(p, vec2(269.5, 183.3)))) * 43758.5453);
      }

      void main() {
        // The plate sits LEVEL, always: it is the fixed instrument the
        // sand moves on. A slow rotation drift parked it at arbitrary
        // crooked angles when zoomed out (feel pass 5).
        vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0) * 2.0 / uScale;

        // Plate boundary: superellipse, square at shape 0, circle at 1.
        // No rim, no edge glow: the reference plates are black on black
        // and the figure just ends (feel pass 2 killed the blue band).
        float pe = mix(7.0, 2.0, uShape);
        vec2 ap = abs(p) + 1e-5;
        float pr = pow(pow(ap.x, pe) + pow(ap.y, pe), 1.0 / pe);
        float inPlate = 1.0 - smoothstep(0.985, 1.03, pr);

        // Standing wave: sum the active modes, square and circular
        // families blended by the same shape that morphs the boundary.
        float th = atan(p.y, p.x);
        vec2 p01 = p * 0.5 + 0.5;
        float u = 0.0;
        for (int i = 0; i < K; i++) {
          vec4 md = uModes[i]; // m, n, weight, sign
          if (md.z < 1e-4) continue;
          float sq = cos(md.x * PI * p01.x) * cos(md.y * PI * p01.y)
                   + md.w * cos(md.y * PI * p01.x) * cos(md.x * PI * p01.y);
          float ci = cos(md.y * (th + uPhi[i])) * cos(md.x * PI * pr);
          u += md.z * mix(sq, ci, uShape);
        }
        float un = u * uInvAmp; // rms-normalized: the figure holds its
                                // shape while a chord rings out

        // Sand gathers where the plate is still. Sub widens the gather.
        float nod = exp(-abs(un) * uThick);
        float line = pow(nod, 1.5); // spatial sharpen: ribbons, not fog

        // Dithered grain field, three scales summed: single-scale grains
        // read as dotted chains; layered sizes pile into granular sand
        // RIBBONS like the real plate (feel pass 1). Settled sand sits
        // STILL; only kicks toss it, highs barely tickle it.
        float basePop = min(0.95, line * uDens * 2.2) * (1.0 - uJolt * 0.5)
                      + uDens * (0.012 + uJolt * 0.2);
        float sand = 0.0;
        for (int L = 0; L < 3; L++) {
          float gs = L == 0 ? 58.0 : L == 1 ? 104.0 : 186.0;
          vec2 g = (p * 0.5 + 0.5) * gs;
          vec2 cell = floor(g), f = fract(g);
          vec2 h = hash22(cell + float(L) * 57.3);
          vec2 h2 = hash22(cell + 31.7 + float(L) * 57.3);
          float vibr = (0.004 + uJolt * 0.5 + uHighs * 0.03)
                     * (0.3 + 0.7 * (1.0 - nod));
          // Grain centers stay clear of the cell walls: a dot that
          // pokes past its cell gets clipped flat and reads as a
          // SQUARE (Alec's feel pass 3). fwidth softening keeps the
          // fine layers round instead of aliasing into pixels, and the
          // squared falloff makes each grain a soft speck, not a disc.
          vec2 gp = 0.5 + (h - 0.5) * 0.4
                  + vec2(sin(uGrainT * 31.0 + h.x * 41.0),
                         cos(uGrainT * 27.0 + h.y * 43.0)) * vibr;
          float keep = step(h2.x, basePop * (L == 0 ? 1.0 : 0.85));
          float d = length(f - gp);
          float rad = (0.13 + nod * 0.08) * (L == 2 ? 0.85 : 1.0);
          float aa = fwidth(d) * 1.5 + 1e-4;
          float dot_ = smoothstep(rad + aa, rad * 0.25, d);
          dot_ *= dot_;
          sand += keep * dot_ * (0.25 + 0.75 * line)
                * (L == 0 ? 1.0 : L == 1 ? 0.7 : 0.5);
        }
        sand = min(sand, 1.3);

        // Grain sparkle: highs twinkle individual grains. Color hash
        // rides its own grid so all three layers agree.
        vec2 hc = hash22(floor((p * 0.5 + 0.5) * 90.0));
        float sp = smoothstep(0.86, 1.0, sin(uGrainT * 21.0 + hc.y * 61.0) * 0.5 + 0.5)
                 * uHighs;

        // Near-black plate, bright additive sand: the figure is the
        // contrast between the two. The plate itself is barely there.
        vec3 col = uBg;
        float anti = 1.0 - exp(-abs(un) * 2.2);
        col = mix(col, uShadow, inPlate * (0.1 + anti * 0.08));
        vec3 sandCol = mix(uAccent, uGlow, 0.2 + hc.y * 0.55) * 1.3 + uGlow * sp;
        float vis = uAlive * (0.45 + 0.55 * uEnergy);
        col += sandCol * clamp(sand * inPlate * vis, 0.0, 1.0);

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

// Mode slots. Weights track the live spectrum every frame, so a partial
// fading in the music fades its nodal lines; the SET of (m,n) pairs only
// changes on an accent-gated snap or a register (complexity) move. Each
// slot remembers the analyzer bin of the peak that picked it (j): the
// mode family is quantized, so the mode's own natural frequency can sit
// bins away from the driving partial, and reading the weight there
// starves it (found by the headless QA). A dying slot fades out: it
// lost its place in the figure even though its partial may still sound.
const slots = Array.from({ length: K }, () => ({ ti: -1, j: -1, w: 0, tgt: 0, dying: false }));
let lastSnap = -100;
let lastNotch = -1;
let domI = -1; // sticky dominant slot: the figure's owner
let jolt = 0, grainT = 0, subS = 0;

// Aim the slots at a set of driving bins: nearest mode to each bin's
// frequency, then shifted `offset` steps through the frequency-sorted
// family (the figure detents; every step is a distinct shape). Snaps
// and slider clicks both land here; the difference is only the jolt
// and who updates lastSnap.
function aimModes(peaks, offset, joltAmt) {
  if (!peaks.length) return false;
  const used = new Set();
  const byMode = new Map(); // mode index -> driving peak bin
  for (const pk of peaks) {
    const lf = Math.log2(binToFreq(pk.j));
    let best = 0, bd = 1e9;
    for (let i = 0; i < MODE_TABLE.length; i++) {
      const d = Math.abs(MODE_TABLE[i].lf - lf);
      if (d < bd) { bd = d; best = i; }
    }
    if (bd >= 1.25) continue;
    let ti = Math.min(MODE_TABLE.length - 1, Math.max(0, best + offset));
    if (used.has(ti)) { // taken: walk outward to the nearest free shape
      for (let step = 1; step < MODE_TABLE.length; step++) {
        if (ti - step >= 0 && !used.has(ti - step)) { ti -= step; break; }
        if (ti + step < MODE_TABLE.length && !used.has(ti + step)) { ti += step; break; }
      }
      if (used.has(ti)) continue;
    }
    used.add(ti);
    byMode.set(ti, pk.j);
  }
  if (!byMode.size) return false;
  // Slot continuity: a mode surviving the move keeps its slot and its
  // weight (its driving bin refreshes); new modes land in freed slots at
  // zero and rise fast, which reads as a snap without a single-frame pop.
  const freed = [];
  for (let i = 0; i < K; i++) {
    const sl = slots[i];
    if (sl.ti >= 0 && byMode.has(sl.ti)) {
      sl.j = byMode.get(sl.ti);
      sl.dying = false;
      byMode.delete(sl.ti);
    } else freed.push(i);
  }
  for (const [ti, j] of byMode) {
    const i = freed.shift();
    if (i === undefined) break;
    const sl = slots[i];
    sl.ti = ti; sl.j = j; sl.w = 0; sl.tgt = 0; sl.dying = false;
    const md = uniforms.uModes.value[i];
    md.x = MODE_TABLE[ti].m;
    md.y = MODE_TABLE[ti].n;
    md.w = Math.random() < 0.5 ? -1 : 1;
    uniforms.uPhi.value[i] = Math.random() * Math.PI * 2;
  }
  // Slots that lost their mode fade out even if their partial still
  // sounds: after a move, the figure IS the new set.
  for (const i of freed) if (slots[i].ti >= 0) slots[i].dying = true;
  jolt = Math.min(1, jolt + joltAmt);
  return true;
}

function repick(spec, offset, t) {
  if (aimModes(findPeaks(spec, PEAKS_MAX), offset, 0.55)) lastSnap = t;
}

return { // vjw: was `export default {`
  name: 'sand',
  scene,
  camera,
  bloom: { strength: 0.25, gain: 0.35 },
  params: { speed: 0.5, shape: 0.5, complexity: 0.5, density: 0.5, fill: 0.5, contrast: 0.5 },
  paramLabels: { '*': { complexity: 'figure', density: 'grains' } },
  // QA hooks: the headless harness asserts these track fed spectra.
  _slots: slots,
  _table: MODE_TABLE,
  _lastSnap: () => lastSnap,
  update(s, dt, t) {
    const P = this.params;
    const spd = drastic(P.speed);
    const spec = s.specHi;
    // The figure slider is DETENTED: twelve notches, each stepping the
    // picked figure one shape through the frequency-sorted mode family
    // (neutral at the middle). Inside a notch nothing moves; crossing
    // one clicks to a genuinely different figure with a sand toss.
    // Alec wants the slider to own the shape, so the figure only
    // changes when he clicks a notch, a STRONG accent lands, or the
    // plate starves.
    const NOTCHES = 12;
    const notch = Math.round(P.complexity * NOTCHES);
    const offset = notch - NOTCHES / 2;
    if (lastNotch < 0) lastNotch = notch;

    // Accent-gated re-pick, deliberately conservative (feel pass 4:
    // "changed shapes on its own less"): only a strong accent after a
    // long rest re-reads the harmony, and slot continuity means a
    // stable chord re-picks the same figure anyway.
    const a = Math.max(s.onKick, s.onMid);
    if (a > 0 && t - lastSnap > 6 && (a > 0.8 || t - lastSnap > 20)) {
      repick(spec, offset, t);
    }

    // Figure notch clicked: re-aim the CURRENT partials at the shifted
    // family right away (a small sand toss, not a snap; lastSnap is the
    // harmony gate's business, not the slider's).
    if (notch !== lastNotch) {
      const act = [];
      for (const sl of slots) {
        if (sl.ti >= 0 && !sl.dying && sl.w > 0.02) act.push({ j: sl.j, v: 0 });
      }
      aimModes(act, offset, 0.25);
      lastNotch = notch;
    }

    // Per-frame honest weights: each active mode reads the analyzer at
    // the partial that drives it (±2 bins rides small detune; a real
    // pitch move fades the mode until the next snap re-aims it).
    let sumSq = 0;
    for (let i = 0; i < K; i++) {
      const sl = slots[i];
      if (sl.ti >= 0 && !sl.dying) {
        let v = 0;
        for (let o = -2; o <= 2; o++) {
          const jj = Math.min(DISP_N - 1, Math.max(0, sl.j + o));
          v = Math.max(v, spec ? spec[jj] : 0);
        }
        v = Math.max(0, (v - 0.32) / 0.68);
        sl.tgt = v * v;
      } else sl.tgt = 0;
      const k = sl.tgt > sl.w ? 7 : 2.2;
      sl.w += (sl.tgt - sl.w) * (1 - Math.exp(-dt * k));
    }
    // Winner-take-most display weights: a real plate is owned by its
    // dominant mode, and near-equal mode sums read as mush, not a
    // figure (Alec's first feel pass). The dominant slot is STICKY
    // (the fract lesson: an argmax only moves when a challenger BEATS
    // the incumbent): music's loudest partial flips constantly, and
    // letting each flip re-own the plate churned the figure between
    // snaps (feel pass 4). A challenger needs 1.5x the incumbent's
    // weight to take over.
    let bi = 0;
    for (let i = 1; i < K; i++) if (slots[i].w > slots[bi].w) bi = i;
    if (domI < 0 || slots[domI].ti < 0 || slots[domI].w < 1e-4
        || slots[bi].w > slots[domI].w * 2.2) domI = bi;
    const wDom = Math.max(slots[domI].w, 1e-5);
    for (let i = 0; i < K; i++) {
      const dw = Math.pow(Math.min(slots[i].w / wDom, 1), 3) * wDom;
      uniforms.uModes.value[i].z = dw;
      sumSq += dw * dw;
    }
    const rms = Math.sqrt(sumSq);
    uniforms.uInvAmp.value = 1 / Math.max(rms, 1e-5);
    uniforms.uAlive.value = Math.min(1, rms * 6);

    // A harmony change with no accent starves every active mode (their
    // partials left the spectrum). A real plate re-sands once it rings a
    // new tone: after a short starve, re-pick without an accent. This
    // also seeds the very first figure when audio appears (no-op while
    // the spectrum has no peaks, so silence keeps an empty plate).
    if (rms < 0.02 && t - lastSnap > 3) repick(spec, offset, t);

    // Small kick breathe stays ungated; the snap above is the event.
    jolt = Math.min(1, jolt + s.onKick * 0.3);
    jolt *= Math.exp(-dt * 3.2);
    subS += (s.sub - subS) * (1 - Math.exp(-dt * 3));
    grainT += dt * spd * (0.6 + s.highs * 1.2);
    // The shader reads it as sin/cos(uGrainT * 31, 27, 21): whole multiples,
    // so a 2π wrap is exact and float32 keeps its precision on long runs.
    grainT %= 2 * Math.PI;

    uniforms.uShape.value = P.shape;
    uniforms.uScale.value = 0.45 + 0.95 * P.fill;
    uniforms.uThick.value = 24 - 15 * Math.min(1, subS * 1.3);
    uniforms.uDens.value = 0.08 + Math.pow(P.density, 1.5) * 1.4;
    uniforms.uJolt.value = jolt;
    uniforms.uHighs.value = s.highs;
    uniforms.uEnergy.value = s.energy;
    uniforms.uGrainT.value = grainT;
    uniforms.uContrast.value = P.contrast;
  },
  resize(w, h) {
    uniforms.uAspect.value = w / h;
  },
};
} // vjw: the factory
