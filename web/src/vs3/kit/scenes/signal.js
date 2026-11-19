// Copied from donor/vs3/visual_kit/src/scenes/signal.js (the friends' engine, used with permission, 2026-11-19).
// vjw: wrapped in a factory (one scene object per layer); nothing else changed. agents/guides/guide_vs3_port.md
// Scene: Signal — the meters family (MiniMeters / Flux Analyzer
// lineage). PALETTE-TRUE, all modes: the 2026-07-08 rainbow exception
// was revoked the next day — everything draws from the 5 slots.
// Direction (Alec): this is an Ableton visualizer, users want a GOOD
// analyzer — fidelity first (real resolution, slope compensation,
// peak-hold, honest scales); the trippy layer comes from the house
// engine (trails/mirror/lens) on top of a credible instrument.
//
//   analyzer  — high-resolution spectrum (192 log bins 35 Hz–18 kHz,
//               renderer-side FFT fused with the filterbank lows —
//               s.specHi, see main.js). Gradient-filled curve with a
//               crisp edge and a falling peak-hold trace. `shape` morphs linear → mirrored →
//               radial; `complexity` sweeps smooth curve → fine bars →
//               chunky bars. Kicks freeze ghost curves.
//   waterfall — the 192-bin spectrogram extruded as terrain, palette
//               height ramp; kicks shear fault lines into the history.
//   scope     — triggered phosphor oscilloscope (rising zero-crossing
//               lock, slow autogain); `shape` mono → dual L/R →
//               circular. Kicks freeze ghost traces.
//   vector    — goniometer on mid/side axes; `shape` dots → Lissajous
//               line. Kicks freeze cloud ghosts.
//   lissajous — XY pen on raw L/R axes (90° phase = circle, mono =
//               diagonal). `shape` extrudes the pen through depth,
//               freezing slices into a turning wireframe; `speed` is
//               afterglow flat, spin extruded. Kicks tear depth faults.
import * as THREE from 'three';
import { PAL, drastic } from '../lib/common.js';
export default function create() { // vjw

const BINS = 192;  // display bins — must match main.js DISP_N
const HIST = 256;  // history ring rows; ~8.5 s at the neutral rate

// ---------------------------------------------------------------- history

const histData = new Uint8Array(BINS * HIST * 2);
const histTex = new THREE.DataTexture(histData, BINS, HIST, THREE.RGFormat, THREE.UnsignedByteType);
histTex.minFilter = THREE.LinearFilter;
histTex.magFilter = THREE.LinearFilter;
histTex.wrapS = THREE.ClampToEdgeWrapping;
histTex.wrapT = THREE.RepeatWrapping; // the ring buffer seam wraps for free
histTex.unpackAlignment = 1; // byte rows aren't 4-aligned for every BINS
histTex.needsUpdate = true;

// Live spectrum + peak-hold (BINS×2: row 0 = live, row 1 = peak-hold) —
// the analyzer reads this, 60 fps fresh regardless of the history clock.
const nowData = new Uint8Array(BINS * 2);
const nowTex = new THREE.DataTexture(nowData, BINS, 2, THREE.RedFormat, THREE.UnsignedByteType);
nowTex.minFilter = THREE.LinearFilter;
nowTex.magFilter = THREE.LinearFilter;
nowTex.wrapS = THREE.ClampToEdgeWrapping;
nowTex.unpackAlignment = 1;

const peakHold = new Float32Array(BINS); // instant attack, slow fall

let rowPtr = 0;      // next ring row to write
let totalRows = 0;   // monotonic row count (headF = totalRows + fraction)
let acc = 0;         // write-clock accumulator
let faultX = 0;      // current lateral fault offset, -1..1
let faultDir = 1;

function writeRow(spec) {
  const off = rowPtr * BINS * 2;
  const g = Math.round(Math.min(1, Math.max(-1, faultX)) * 0.5 * 255 + 127.5);
  for (let i = 0; i < BINS; i++) {
    histData[off + i * 2] = Math.min(255, Math.max(0, spec[i] * 255));
    histData[off + i * 2 + 1] = g;
  }
  rowPtr = (rowPtr + 1) % HIST;
  totalRows++;
  histTex.needsUpdate = true;
}

// ---------------------------------------------------------------- analyzer
// (Hz axis labels were tried 2026-07-09 and killed the same day: at
// fullscreen scale the canvas-texture text blew up into chunky debris.
// The 12 dB gridlines went 2026-10-16: keyers could not pull them out.)

const anaScene = new THREE.Scene();
const anaCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const anaUniforms = {
  tNow: { value: nowTex },
  tHist: { value: histTex },
  uHistN: { value: HIST },
  uBins: { value: BINS },
  uAspect: { value: 1 },
  uShape: { value: 0.35 },
  uBars: { value: 0 },
  uBarN: { value: 96 },
  uFillAmt: { value: 0.5 },
  uGamma: { value: 1.0 },
  uGhost: { value: Array.from({ length: 4 }, () => new THREE.Vector2(0, 0)) },
  uSub: { value: 0 },
  uKick: { value: 0 },
  uEnergy: { value: 0 },
  uBg: { value: PAL.bg },
  uShadow: { value: PAL.shadow },
  uMid: { value: PAL.mid },
  uAccent: { value: PAL.accent },
  uGlow: { value: PAL.glow },
};

const anaQuad = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.ShaderMaterial({
    uniforms: anaUniforms,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tNow, tHist;
      uniform float uHistN, uBins, uAspect, uShape, uBars, uBarN, uFillAmt, uGamma;
      uniform float uSub, uKick, uEnergy;
      uniform vec2 uGhost[4];
      uniform vec3 uBg, uShadow, uMid, uAccent, uGlow;
      varying vec2 vUv;

      void main() {
        vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
        // Layout morph: 0 linear → 0.5 center-mirrored → 1 radial ring.
        float mir = clamp(uShape * 2.0, 0.0, 1.0);
        float rad = clamp(uShape * 2.0 - 1.0, 0.0, 1.0);
        float fxLin = mix(vUv.x, abs(vUv.x - 0.5) * 2.0, mir);
        float fxRad = abs(atan(p.x, -p.y)) / 3.14159265;
        float ayRad = clamp((length(p) - 0.14) / 0.30, 0.0, 1.25);
        float fx = mix(fxLin, fxRad, rad);
        float ay = mix(vUv.y, ayRad, rad);

        // Everything below draws with fwidth-based anti-aliasing — the
        // reference apps read premium because every edge is CRISP; the
        // old exp-glow lines were blurry by construction.
        float px = fwidth(ay) * 1.5 + 1e-4;

        // Smooth curve + fully-snapped bars, crossfaded at DRAW level
        // (never half-lerp a sampling coordinate to its quantized self).
        float fq = (fx * (uBins - 1.0) + 0.5) / uBins;
        float svL = pow(texture2D(tNow, vec2(fq, 0.25)).r, uGamma);
        float g = fract(fx * uBarN);
        float fxB = (clamp(floor(fx * uBarN), 0.0, uBarN - 1.0) + 0.5) / uBarN;
        float fqB = (fxB * (uBins - 1.0) + 0.5) / uBins;
        // Dome the bar tops slightly — hard flat tops read cheap.
        float svB = pow(texture2D(tNow, vec2(fqB, 0.25)).r, uGamma)
          - 0.012 * pow(abs(g - 0.5) * 2.0, 2.0);
        float ex = fwidth(fx * uBarN) * 1.5 + 1e-4;
        float barMask = smoothstep(0.06 - ex, 0.06 + ex, g)
          * smoothstep(0.94 + ex, 0.94 - ex, g);
        float sv = mix(svL, svB, uBars);
        float pv = pow(texture2D(tNow, vec2(mix(fq, fqB, uBars), 0.75)).r, uGamma);

        float d = sv - ay; // >0 below the curve
        float mask = mix(1.0, barMask, uBars);

        // Frequency zones from the PALETTE (not rainbow): lows mid,
        // mids accent, highs glow — legibility without breaking color.
        vec3 zone = mix(uMid, uAccent, smoothstep(0.25, 0.6, fx));
        zone = mix(zone, uGlow, smoothstep(0.72, 0.95, fx));

        // The hottest, cleanest line in the frame: a crisp AA edge.
        float core = (1.0 - smoothstep(px, px * 2.6, abs(d))) * mask;
        float halo = exp(-abs(d) * 26.0) * 0.16 * mask;

        // Neon fill: vivid at the edge, falling away below it.
        float fill = smoothstep(-px, px, d) * mask
          * (0.16 + 0.84 * exp(-max(d, 0.0) * 3.4))
          * (0.30 + 0.55 * uFillAmt);

        // Peak-hold: one thin quiet line.
        float peak = (1.0 - smoothstep(px, px * 2.2, abs(pv - ay))) * step(0.02, pv);

        // Frozen kick ghosts — thin, dim.
        float ghost = 0.0;
        for (int i = 0; i < 4; i++) {
          if (uGhost[i].y > 0.01) {
            float gv = pow(texture2D(tHist, vec2(fq, uGhost[i].x)).r, uGamma);
            ghost += (1.0 - smoothstep(px, px * 2.4, abs(gv - ay))) * uGhost[i].y;
          }
        }

        // No gridlines: the three dB hairlines sat in the empty
        // background, where a keyer pulling the black out for a VJ mix
        // could not remove them (Marc, 2026-10-16). The curve, its fill
        // and the peak-hold carry the analyzer alone.
        vec3 col = uBg * 0.15;
        col += zone * fill;
        col += mix(zone, uGlow, 0.4) * (core * (0.6 + 0.4 * uEnergy) + halo);
        col += uAccent * peak * 0.5;
        col += uMid * ghost * 0.35;
        gl_FragColor = vec4(col, 1.0);
      }`,
    depthWrite: false,
    depthTest: false,
  })
);
anaScene.add(anaQuad);

// Ghost slots: v-coordinate of the frozen row + fading alpha.
const ghosts = Array.from({ length: 4 }, () => ({ v: 0, alpha: 0 }));
let ghostSlot = 0;

// ---------------------------------------------------------------- scope

const SCOPE_N = 512; // displayed samples (half the wire window, so the
                     // trigger always has a contiguous run to show)

// Live traces: row 0 = L, row 1 = R (triggered + autogained, 0.5 offset).
const scopeData = new Uint8Array(SCOPE_N * 2);
const scopeTex = new THREE.DataTexture(scopeData, SCOPE_N, 2, THREE.RedFormat, THREE.UnsignedByteType);
scopeTex.minFilter = THREE.LinearFilter;
scopeTex.magFilter = THREE.LinearFilter;
scopeTex.wrapS = THREE.ClampToEdgeWrapping;
scopeTex.unpackAlignment = 1;

// Kick-frozen mono ghost traces, one per row.
const scopeGhostData = new Uint8Array(SCOPE_N * 4);
const scopeGhostTex = new THREE.DataTexture(scopeGhostData, SCOPE_N, 4, THREE.RedFormat, THREE.UnsignedByteType);
scopeGhostTex.minFilter = THREE.LinearFilter;
scopeGhostTex.magFilter = THREE.LinearFilter;
scopeGhostTex.wrapS = THREE.ClampToEdgeWrapping;
scopeGhostTex.unpackAlignment = 1;

const scScene = new THREE.Scene();
const scCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const scUniforms = {
  tWave: { value: scopeTex },
  tGhost: { value: scopeGhostTex },
  uGhost: { value: Array.from({ length: 4 }, () => new THREE.Vector2(0, 0)) },
  uAspect: { value: 1 },
  uCirc: { value: 0 },   // 0 linear, 1 circular scope
  uSep: { value: 0 },    // dual-trace vertical separation
  uFocus: { value: 60 }, // beam focus: fat lava → razor phosphor
  uGamma: { value: 1 },
  uEnergy: { value: 0 },
  uSub: { value: 0 },
  uBg: { value: PAL.bg },
  uMid: { value: PAL.mid },
  uAccent: { value: PAL.accent },
  uGlow: { value: PAL.glow },
};

const scQuad = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.ShaderMaterial({
    uniforms: scUniforms,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tWave, tGhost;
      uniform vec2 uGhost[4];
      uniform float uAspect, uCirc, uSep, uFocus, uGamma, uEnergy, uSub;
      uniform vec3 uBg, uMid, uAccent, uGlow;
      varying vec2 vUv;

      float wv(float fx, float row) {
        return texture2D(tWave, vec2(fx, row)).r * 2.0 - 1.0;
      }

      void main() {
        vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
        // Both domains are smooth, so blending their distances is safe
        // (the analyzer comb lesson applies to QUANTIZED coords only).
        float fxLin = vUv.x;
        float fxCirc = (atan(p.x, -p.y) / 3.14159265 + 1.0) * 0.5;
        float fx = mix(fxLin, fxCirc, uCirc);
        float r = length(p);

        float py = fwidth(vUv.y) * 1.5 + 1e-4;
        float pr = fwidth(r) * 1.5 + 1e-4;
        float px = mix(py, pr, uCirc);

        float core = 0.0, halo = 0.0, fill = 0.0, amp = 0.0;
        for (int c = 0; c < 2; c++) {
          float row = c == 0 ? 0.25 : 0.75;
          float v = wv(fx, row);
          amp = max(amp, abs(v));
          float sgn = c == 0 ? -1.0 : 1.0;
          float cLin = 0.5 + sgn * uSep;
          float tLin = cLin + v * 0.30;
          float cCir = 0.30 + sgn * uSep * 0.4;
          float tCir = cCir + v * 0.15;
          float d = mix(vUv.y - tLin, r - tCir, uCirc);
          core += 1.0 - smoothstep(px, px * 2.6, abs(d));
          halo += exp(-abs(d) * uFocus * 0.55) * 0.30;
          // Area fill between the trace and its centerline — a hairline
          // waveform reads dead at fullscreen; the filled body is what
          // makes a scope look like a scope (the analyzer's lesson).
          float aL = min(cLin, tLin), bL = max(cLin, tLin);
          float inL = smoothstep(aL - py, aL + py, vUv.y)
            * (1.0 - smoothstep(bL - py, bL + py, vUv.y));
          float aC = min(cCir, tCir), bC = max(cCir, tCir);
          float inC = smoothstep(aC - pr, aC + pr, r)
            * (1.0 - smoothstep(bC - pr, bC + pr, r));
          fill += mix(inL, inC, uCirc) * (0.22 + 0.5 * abs(v));
        }
        fill = pow(clamp(fill, 0.0, 1.5), uGamma);

        // Frozen kick ghosts (mono rows) — thin AA lines.
        float ghost = 0.0;
        for (int i = 0; i < 4; i++) {
          if (uGhost[i].y > 0.01) {
            float gv = texture2D(tGhost, vec2(fx, uGhost[i].x)).r * 2.0 - 1.0;
            float gd = mix(vUv.y - (0.5 + gv * 0.30), r - (0.30 + gv * 0.15), uCirc);
            ghost += (1.0 - smoothstep(px, px * 2.4, abs(gd))) * uGhost[i].y;
          }
        }

        // Graticule: ONE quiet center hairline / base ring — the old
        // vertical division ticks read as debris at fullscreen (the Hz
        // label lesson again).
        float gridLin = 1.0 - smoothstep(py * 0.6, py * 1.8, abs(vUv.y - 0.5));
        float gridCirc = 1.0 - smoothstep(pr * 0.6, pr * 1.8, abs(r - 0.30));
        float grid = mix(gridLin, gridCirc, uCirc) * 0.10;

        vec3 body = mix(uMid, uAccent, clamp(amp * 1.4, 0.0, 1.0));
        vec3 col = uBg * 0.15;
        col += uMid * grid;
        col += body * fill * (0.5 + 0.5 * uEnergy);
        col += mix(body, uGlow, 0.5) * (core * (0.65 + 0.35 * uEnergy) + halo);
        col += uAccent * ghost * 0.4;
        gl_FragColor = vec4(col, 1.0);
      }`,
    depthWrite: false,
    depthTest: false,
  })
);
scScene.add(scQuad);

const scopeGhosts = Array.from({ length: 4 }, () => ({ v: 0, alpha: 0 }));
let scopeGhostSlot = 0;
let scopeTrig = 0; // last trigger index (rising zero-crossing lock)
let wavePeak = 0.1; // shared slow autogain reference (scope + vector)

// ---------------------------------------------------------------- vector

const VEC_N = 512;
const vecScene = new THREE.Scene();
const vecCam = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
const vecGroup = new THREE.Group();
vecScene.add(vecGroup);

function makeCloud(n) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  return g;
}

const vecGeo = makeCloud(VEC_N);
const vecPoints = new THREE.Points(vecGeo, new THREE.PointsMaterial({
  size: 2.5, sizeAttenuation: false, vertexColors: true, transparent: true,
  blending: THREE.AdditiveBlending, depthWrite: false,
}));
// vertexColors everywhere: the line and the ghosts share the cloud's
// per-sample colors, so culled silent samples stay dark in EVERY layer
// (a solid-color line stacked hundreds of segments deep at the origin
// was the mystery hot square).
const vecLine = new THREE.Line(vecGeo, new THREE.LineBasicMaterial({
  vertexColors: true, transparent: true, opacity: 0,
  blending: THREE.AdditiveBlending, depthWrite: false,
}));
vecGroup.add(vecPoints);
vecGroup.add(vecLine);

// Kick-frozen cloud ghosts.
const vecGhosts = Array.from({ length: 3 }, () => {
  const p = new THREE.Points(makeCloud(VEC_N), new THREE.PointsMaterial({
    size: 2.0, sizeAttenuation: false, vertexColors: true, transparent: true,
    opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  p.visible = false;
  vecGroup.add(p);
  return p;
});
let vecGhostSlot = 0;
let vecPeakY = 0.1; // display autogain: mid (vertical) extent reference
let vecPeakX = 0.05; // side (width) extent reference

// Graticule: ring + the L/R axes at ±45° — the technical garnish.
// Materials share PAL Color instances, so palette morphs track free.
{
  const ringPts = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    ringPts.push(new THREE.Vector3(Math.cos(a) * 0.62, Math.sin(a) * 0.62, 0));
  }
  const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts),
    new THREE.LineBasicMaterial({ color: PAL.mid, transparent: true, opacity: 0.22, depthWrite: false }));
  const diag = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-0.65, -0.65, 0), new THREE.Vector3(0.65, 0.65, 0),
    new THREE.Vector3(-0.65, 0.65, 0), new THREE.Vector3(0.65, -0.65, 0),
  ]), new THREE.LineBasicMaterial({ color: PAL.mid, transparent: true, opacity: 0.14, depthWrite: false }));
  vecGroup.add(ring);
  vecGroup.add(diag);
}

// ---------------------------------------------------------------- lissajous
// XY pen on RAW axes: L is x, R is y — no mid/side rotation, so the
// classic Lissajous contracts hold and make numeric QA assertions
// (identical channels = the exact diagonal, 90° phase = a perfect
// circle). One isotropic autogain for both axes: split references
// would stretch the figure and the geometry would lie.

const LIS_N = 512;      // pen samples per slice (max drawRange)
const LIS_SLICES = 56;  // frozen-slice ring
const LIS_DZ = 0.17;    // depth per slice step (slice clock is fixed
                        // 30 Hz: depth IS time, speed spins instead)

const lisScene = new THREE.Scene();
const lisCam = new THREE.PerspectiveCamera(40, 1, 0.1, 60);
const lisGroup = new THREE.Group();
lisScene.add(lisGroup);
// Spin pivot: the figure rotates about the CENTER of the visible depth
// window, not the pen plane — pivoting at z=0 swung the deep end wide
// and the whole sculpture wandered off frame (seen in preview, not QA).
const lisSpin = new THREE.Group();
lisGroup.add(lisSpin);

const lisPen = new THREE.Line(makeCloud(LIS_N), new THREE.LineBasicMaterial({
  vertexColors: true, transparent: true,
  blending: THREE.AdditiveBlending, depthWrite: false,
}));
lisPen.name = 'lisPen';
lisPen.frustumCulled = false; // buffers mutate; a zero-seeded bound would cull
lisSpin.add(lisPen);

const lisSlices = Array.from({ length: LIS_SLICES }, () => {
  const line = new THREE.Line(makeCloud(LIS_N), new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  line.name = 'lisSlice';
  line.visible = false;
  line.frustumCulled = false;
  lisSpin.add(line);
  return { line, z: -1e9, hot: 0 };
});
let lisSlot = 0;
let lisHeadZ = 0;   // monotonic pen depth; slices park at their birth z
let lisGap = 0;     // kick fault: extra depth torn in before the next slice
let lisHot = 0;     // next slice written runs hot (kick marker)
let lisAcc = 0;     // slice clock accumulator
let lisPeak = 0.05; // isotropic RMS reference (vector's lesson: RMS, not peak)

// Graticule: square aperture + center cross at the pen plane. Shares
// PAL instances so palette morphs track; fades as the figure extrudes.
const lisGratMats = [];
{
  const frame = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-0.66, -0.66, 0), new THREE.Vector3(0.66, -0.66, 0),
    new THREE.Vector3(0.66, 0.66, 0), new THREE.Vector3(-0.66, 0.66, 0),
  ]), new THREE.LineBasicMaterial({ color: PAL.mid, transparent: true, opacity: 0.20, depthWrite: false }));
  const cross = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-0.60, 0, 0), new THREE.Vector3(0.60, 0, 0),
    new THREE.Vector3(0, -0.60, 0), new THREE.Vector3(0, 0.60, 0),
  ]), new THREE.LineBasicMaterial({ color: PAL.mid, transparent: true, opacity: 0.12, depthWrite: false }));
  lisGratMats.push({ m: frame.material, base: 0.20 }, { m: cross.material, base: 0.12 });
  lisGroup.add(frame);
  lisGroup.add(cross);
}

// ---------------------------------------------------------------- waterfall

const wfScene = new THREE.Scene();
wfScene.background = PAL.bg;
const wfCam = new THREE.PerspectiveCamera(60, 1, 0.1, 100);

const wfUniforms = {
  tHist: { value: histTex },
  uHeadF: { value: 0 },
  uHistN: { value: HIST },
  uBins: { value: BINS },
  uDepth: { value: 160 },
  uAmp: { value: 2 },
  uGamma: { value: 1 },
  uShear: { value: 3.5 },
  uTerrace: { value: 0.5 },
  uHighs: { value: 0 },
  uEnergy: { value: 0 },
  uContrast: { value: 0.5 },
  uBg: { value: PAL.bg },
  uShadow: { value: PAL.shadow },
  uAccent: { value: PAL.accent },
  uMid: { value: PAL.mid },
  uGlow: { value: PAL.glow },
};

const wfMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(30, 22, 160, 220),
  new THREE.ShaderMaterial({
    uniforms: wfUniforms,
    vertexShader: /* glsl */`
      uniform sampler2D tHist;
      uniform float uHeadF, uHistN, uBins, uDepth, uAmp, uGamma, uShear, uTerrace;
      varying vec3 vWorld;
      varying float vH, vFar, vFreq;
      varying vec2 vGrid;
      void main() {
        // uv.y 0 = near edge = now; rows recede into the past. The ring
        // seam never shows because uDepth stays well under uHistN.
        float rowsBack = uv.y * uDepth;
        float vCoord = (uHeadF - 1.0 - rowsBack + 0.5) / uHistN; // Repeat wraps
        // Terraced frequency axis: snap to coarse pseudo-bins as
        // complexity rises (192 real bins are too fine to read as steps).
        float fqS = (uv.x * (uBins - 1.0) + 0.5) / uBins;
        float fqQ = (floor(uv.x * 48.0) + 0.5) / 48.0;
        fqQ = (fqQ * (uBins - 1.0) + 0.5) / uBins;
        vec2 hx = texture2D(tHist, vec2(mix(fqS, fqQ, uTerrace), vCoord)).rg;
        // Re-expand the dB display range: the 48 dB window parks even
        // quiet bins well above 0, so subtract the floor or valleys
        // never descend and the terrain reads as a plateau.
        float h = pow(clamp((hx.r - 0.30) / 0.70, 0.0, 1.0), uGamma);
        // Terrain display tilt: real mixes are low-heavy even after
        // slope comp, piling the whole landscape onto the bass side —
        // rebalance so the high end gets visible geography too.
        h *= 0.72 + 0.72 * uv.x;
        h = mix(h, floor(h * 8.0 + 0.5) / 8.0, uTerrace * 0.7);
        vec3 p = position;
        p.x += (hx.g - 0.5) * 2.0 * uShear; // kick fault lines, from history
        p.z += h * uAmp;
        vH = h;
        vFar = uv.y;
        vFreq = uv.x; // pre-shear bin coordinate — hue = frequency zone
        // Holo-mesh coordinates: frequency lines fixed, time lines
        // riding the history so the grid scrolls WITH the terrain.
        vGrid = vec2(uv.x * 32.0, (uHeadF - 1.0 - rowsBack) / 8.0);
        vec4 world = modelMatrix * vec4(p, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */`
      uniform float uHighs, uEnergy, uContrast;
      uniform vec3 uBg, uShadow, uAccent, uMid, uGlow;
      varying vec3 vWorld;
      varying float vH, vFar, vFreq;
      varying vec2 vGrid;
      void main() {
        // Hue = frequency zone, the SAME palette slots as the analyzer
        // (lows mid → mids accent → highs glow), so low vs high reads
        // identically across modes; HEIGHT drives brightness only.
        // Ramp thresholds match the REAL vH distribution (typical music
        // sits 0.1..0.6 post floor-subtract — a 0..1-tuned ramp parks
        // everything in shadow and the frame goes black).
        vec3 zone = mix(uMid, uAccent, smoothstep(0.25, 0.6, vFreq));
        zone = mix(zone, uGlow, smoothstep(0.72, 0.95, vFreq));
        vec3 col = mix(uBg * 0.5, uShadow, smoothstep(0.0, 0.15, vH));
        col = mix(col, zone, smoothstep(0.12, 0.55, vH));
        col = mix(col, uGlow, smoothstep(0.82, 1.0, vH));

        // Faceted lighting from screen-space derivatives — enough
        // contrast that ridge fronts shade, not so much they vanish.
        vec3 N = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        if (N.y < 0.0) N = -N;
        float diff = clamp(dot(N, normalize(vec3(0.35, 0.8, 0.45))), 0.0, 1.0);
        col *= 0.3 + 0.9 * diff;

        // Holo-mesh: a luminous wire grid flowing over the surface —
        // brightens on the ridges, whispers in the valleys.
        vec2 gw = fwidth(vGrid) * 1.2 + 1e-4;
        vec2 gf = abs(fract(vGrid) - 0.5);
        float gridm = max(
          1.0 - smoothstep(gw.x * 0.6, gw.x * 1.8, 0.5 - gf.x),
          1.0 - smoothstep(gw.y * 0.6, gw.y * 1.8, 0.5 - gf.y));
        col += (uMid * 0.35 + uGlow * vH * 0.9) * gridm * (0.10 + 0.18 * vH);

        col += uGlow * smoothstep(0.6, 0.95, vH) * (0.15 + 0.6 * uHighs);
        col *= 0.45 + 0.75 * uEnergy;

        vec3 hi = col * col * (3.0 - 2.0 * col);
        vec3 lo = pow(max(col, 0.0), vec3(0.72));
        col = mix(col, hi, max(0.0, uContrast - 0.5) * 1.6);
        col = mix(col, lo, max(0.0, 0.5 - uContrast) * 1.6);

        col = mix(col, uBg, smoothstep(0.62, 0.98, vFar));
        gl_FragColor = vec4(col, 1.0);
      }`,
  })
);
wfMesh.rotation.x = -Math.PI / 2;
wfMesh.position.set(0, 0, -3);
wfMesh.frustumCulled = false;
wfScene.add(wfMesh);

// ---------------------------------------------------------------- scene

const EMPTY_HI = new Float32Array(BINS);

return { // vjw: was `export default {`
  name: 'signal',
  scene: anaScene,
  camera: anaCam,
  bloom: { strength: 0.3, gain: 0.4 },
  modes: ['analyzer', 'waterfall', 'scope', 'vector', 'lissajous'],
  // shape 0 = linear layout: an analyzer boots reading left to right
  // like SPAN or MiniMeters (Alec 2026-07-11); mirrored and radial
  // stay on the slider.
  params: { mode: 'analyzer', speed: 0.5, shape: 0, complexity: 0.6, density: 0.5, fill: 0.5, contrast: 0.55 },
  // Panel display labels per mode (null = the slider does nothing in
  // that mode, so the panel hides it — Alec: "complexity, when it
  // actually does something").
  paramLabels: {
    analyzer:  { speed: 'history rate', shape: 'layout', complexity: 'bars', density: 'ghost hold', fill: 'fill', contrast: 'range' },
    waterfall: { speed: 'scroll', shape: 'camera tilt', complexity: 'terrace', density: 'depth', fill: 'height', contrast: 'range' },
    scope:     { speed: null, shape: 'mono · dual · ring', complexity: 'beam focus', density: 'ghost hold', fill: 'gain', contrast: 'beam curve' },
    vector:    { speed: null, shape: 'dots → line', complexity: 'points', density: 'ghost hold', fill: 'size', contrast: null },
    lissajous: { speed: 'glow · spin', shape: 'flat → depth', complexity: 'pen detail', density: 'depth', fill: 'gain', contrast: null },
  },
  update(s, dt, t) {
    const P = this.params;
    const spec = s.specHi || EMPTY_HI;
    const wave = s.wave;

    // Live spectrum + peak-hold → the BINS×2 texture the analyzer reads.
    for (let i = 0; i < BINS; i++) {
      peakHold[i] = Math.max(peakHold[i] - dt * 0.10, spec[i]);
      nowData[i] = Math.min(255, Math.max(0, spec[i] * 255));
      nowData[BINS + i] = Math.min(255, Math.max(0, peakHold[i] * 255));
    }
    nowTex.needsUpdate = true;

    // Shared slow autogain reference for the waveform modes.
    if (wave) {
      let pk = 0;
      for (let i = 0; i < 1024; i += 4) {
        pk = Math.max(pk, Math.abs((wave.l[i] + wave.r[i]) * 0.5));
      }
      wavePeak = Math.max(wavePeak * Math.exp(-dt / 6), pk, 0.05);
    }

    // Kick: shear a fault into everything written from now on, and
    // freeze a ghost of this instant (forced row write so the ghost is
    // exact even when the history clock runs slow). Every mode freezes
    // its own kind of ghost — that's the family's identity.
    if (s.onKick) {
      faultDir = -faultDir;
      faultX = Math.min(1, Math.max(-1, faultX + faultDir * (0.35 + 0.5 * s.onKick)));
      writeRow(spec);
      if (P.mode === 'scope' && wave) {
        const slot = scopeGhostSlot++ % 4;
        const gain = 0.45 / wavePeak * (0.35 + 1.3 * P.fill);
        for (let i = 0; i < SCOPE_N; i++) {
          const m = (wave.l[scopeTrig + i] + wave.r[scopeTrig + i]) * 0.5 * gain;
          scopeGhostData[slot * SCOPE_N + i] =
            Math.min(255, Math.max(0, (m * 0.5 + 0.5) * 255));
        }
        scopeGhostTex.needsUpdate = true;
        scopeGhosts[slot].v = (slot + 0.5) / 4;
        scopeGhosts[slot].alpha = Math.min(1, 0.5 + 0.6 * s.onKick);
      } else if (P.mode === 'vector' && wave) {
        const gh = vecGhosts[vecGhostSlot++ % 3];
        gh.geometry.attributes.position.copy(vecGeo.attributes.position);
        gh.geometry.attributes.position.needsUpdate = true;
        gh.geometry.attributes.color.copy(vecGeo.attributes.color);
        gh.geometry.attributes.color.needsUpdate = true;
        gh.geometry.setDrawRange(0, vecGeo.drawRange.count);
        gh.material.opacity = Math.min(0.9, 0.4 + 0.5 * s.onKick);
        gh.visible = true;
      } else if (P.mode === 'lissajous' && wave) {
        // Kick fault: a gap torn into the extrusion depth, and the
        // next slice written runs hot — waterfall's fault line,
        // translated to the pen. Structure, never a flash.
        lisGap = Math.min(LIS_DZ * 6, lisGap + LIS_DZ * (2.0 + 2.5 * s.onKick));
        lisHot = Math.min(1, 0.5 + 0.6 * s.onKick);
      } else {
        const g = ghosts[ghostSlot++ % 4];
        g.v = (((rowPtr - 1 + HIST) % HIST) + 0.5) / HIST;
        g.alpha = Math.min(1, 0.5 + 0.6 * s.onKick);
      }
    }
    faultX *= Math.exp(-dt * 0.2); // faults relax between kicks

    // History write clock — the scene's tempo. speed sweeps 7.5..120 Hz.
    const stepT = 1 / (30 * drastic(P.speed));
    acc += dt;
    let guard = 0;
    while (acc >= stepT && guard++ < 6) { acc -= stepT; writeRow(spec); }
    if (guard >= 6) acc = 0;

    const ghostLife = 0.4 + 2.4 * P.density; // seconds-ish of ghost persistence
    for (let i = 0; i < 4; i++) {
      const g = ghosts[i];
      g.alpha *= Math.exp(-dt * (1.6 / ghostLife));
      anaUniforms.uGhost.value[i].set(g.v, g.alpha);
      const sg = scopeGhosts[i];
      sg.alpha *= Math.exp(-dt * (1.6 / ghostLife));
      scUniforms.uGhost.value[i].set(sg.v, sg.alpha);
    }
    for (const gh of vecGhosts) {
      gh.material.opacity *= Math.exp(-dt * (1.6 / ghostLife));
      if (gh.material.opacity < 0.02) gh.visible = false;
    }

    const gamma = 1.9 - 1.3 * P.contrast;

    if (P.mode === 'waterfall') {
      this.scene = wfScene;
      this.camera = wfCam;
      wfUniforms.uHeadF.value = totalRows + acc / stepT;
      wfUniforms.uDepth.value = 60 + 180 * P.density;
      wfUniforms.uAmp.value = (0.8 + 2.6 * P.fill) * (0.75 + s.sub * 0.5);
      wfUniforms.uGamma.value = gamma;
      wfUniforms.uTerrace.value = P.complexity;
      wfUniforms.uHighs.value = s.highs;
      wfUniforms.uEnergy.value = s.energy;
      wfUniforms.uContrast.value = P.contrast;
      // shape: 0 = low skim over the surface, 1 = straight down — a
      // classic scrolling 2D spectrogram.
      const down = P.shape;
      wfCam.position.set(
        Math.sin(t * 0.17) * (1 - down) * 1.2,
        3.2 + 10.0 * down + s.kick * 0.3,
        7.5 - 5.5 * down);
      wfCam.lookAt(Math.sin(t * 0.13) * (1 - down) * 1.5, -1.2 * (1 - down), -6 + 1.5 * down);
      // Terrain reads badly through kaleido folds; trails baseline drops
      // so the geometry stays crisp (TRAILS macro still sweeps it).
      this.fxHint = { mirror: 0, persist: 0.35 };
      return;
    }
    if (P.mode === 'scope' && wave) {
      this.scene = scScene;
      this.camera = scCam;
      this.fxHint = null; // phosphor trails ARE the scope afterglow
      const gain = 0.45 / wavePeak * (0.35 + 1.3 * P.fill);
      // Trigger: the rising zero-crossing NEAREST the previous lock —
      // first-crossing triggering hops between candidates on complex
      // music and the trace churns instead of holding.
      let best = -1, bestDist = 1e9;
      for (let i = 1; i < SCOPE_N; i++) {
        const a = wave.l[i - 1] + wave.r[i - 1];
        const b = wave.l[i] + wave.r[i];
        if (a < 0 && b >= 0) {
          const dd = Math.abs(i - scopeTrig);
          if (dd < bestDist) { bestDist = dd; best = i; }
        }
      }
      if (best >= 0) scopeTrig = best;
      else if (scopeTrig >= SCOPE_N) scopeTrig = 0;
      for (let i = 0; i < SCOPE_N; i++) {
        const j = scopeTrig + i;
        scopeData[i] = Math.min(255, Math.max(0, (wave.l[j] * gain * 0.5 + 0.5) * 255));
        scopeData[SCOPE_N + i] = Math.min(255, Math.max(0, (wave.r[j] * gain * 0.5 + 0.5) * 255));
      }
      scopeTex.needsUpdate = true;
      // shape: overlaid mono → split dual-trace → circular scope.
      scUniforms.uSep.value = P.shape < 0.5 ? P.shape * 0.3 : (1 - P.shape) * 0.3;
      scUniforms.uCirc.value = Math.min(1, Math.max(0, P.shape * 2 - 1));
      scUniforms.uFocus.value = 25 + 130 * P.complexity; // beam focus
      scUniforms.uGamma.value = gamma;
      scUniforms.uEnergy.value = s.energy;
      scUniforms.uSub.value = s.sub;
      return;
    }
    if (P.mode === 'vector' && wave) {
      this.scene = vecScene;
      this.camera = vecCam;
      this.fxHint = { persist: 0.55 }; // the cloud needs its comet trails
      // Display autogain (Alec: "vector just doesn't fill the screen",
      // twice). RMS-based references, NOT peak — peak normalization let
      // one kick transient pin the scale for seconds, so everything
      // between kicks rendered microscopic on real music. RMS×2.6 puts
      // typical content at the ring and lets transients overshoot it
      // (which looks dramatic, not wrong). Width (side) still gets the
      // soft-boost exponent so mono stays a line, not a fake blob.
      let sumY = 0, sumX = 0;
      for (let i = 0; i < 1024; i += 2) {
        const m = (wave.l[i] + wave.r[i]) * 0.7071;
        const sd = (wave.l[i] - wave.r[i]) * 0.7071;
        sumY += m * m; sumX += sd * sd;
      }
      // Reference = recent RMS itself, no overshoot factor: the cloud
      // bulk rides AT the graticule ring and transients fly past it,
      // the way Vision 4X reads. The old ×2.6 pseudo-peak parked the
      // bulk at a third of the ring and read weak at any gain, since
      // the autogain divides input gain right back out (Alec
      // 2026-07-11, "loudest song, gain maxed, still weak").
      vecPeakY = Math.max(vecPeakY * Math.exp(-dt / 4), Math.sqrt(sumY / 512), 0.02);
      vecPeakX = Math.max(vecPeakX * Math.exp(-dt / 4), Math.sqrt(sumX / 512), 0.008);
      const target = 0.34 + 0.42 * P.fill;
      const gy = target / vecPeakY;
      const gx = target / (Math.pow(vecPeakX, 0.55) * Math.pow(vecPeakY, 0.45));
      const pos = vecGeo.attributes.position.array;
      const col = vecGeo.attributes.color.array;
      const n = Math.max(2, Math.round(128 + 384 * P.complexity));
      const stride = Math.floor(1024 / n) || 1; // span the whole window
      for (let i = 0; i < n; i++) {
        const l = wave.l[i * stride];
        const r = wave.r[i * stride];
        // Goniometer axes: mid is vertical, side is horizontal — mono
        // collapses to a vertical line, anti-phase to horizontal.
        const x = (l - r) * 0.7071 * gx;
        const y = (l + r) * 0.7071 * gy;
        pos[i * 3] = x;
        pos[i * 3 + 1] = y;
        // Positions are display-normalized (~ring scale), so push the
        // color curve hot — dim specks were invisible at fullscreen.
        const amp = Math.min(1, (Math.abs(x) + Math.abs(y)) * 1.1);
        // Cull the DC pile: hundreds of near-silent samples stack
        // additively at the origin — even a small floor becomes a hot
        // blob, so silence renders as literally nothing (additive black).
        const dim = Math.min(1, Math.max(0, (amp - 0.07) * 4.5));
        const c0 = PAL.mid, c1 = PAL.glow;
        col[i * 3] = (c0.r + (c1.r - c0.r) * amp) * dim;
        col[i * 3 + 1] = (c0.g + (c1.g - c0.g) * amp) * dim;
        col[i * 3 + 2] = (c0.b + (c1.b - c0.b) * amp) * dim;
      }
      vecGeo.setDrawRange(0, n);
      vecGeo.attributes.position.needsUpdate = true;
      vecGeo.attributes.color.needsUpdate = true;
      // shape: dot cloud → connected Lissajous line. The points never
      // fully leave: LineBasicMaterial is 1px on every platform, so at
      // full line the dots stay as beads and give the beam substance.
      vecPoints.material.opacity = 1 - 0.6 * Math.max(0, P.shape * 2 - 1);
      vecPoints.material.size = 3.0 + 3.5 * (1 - P.complexity);
      vecLine.material.opacity = Math.min(1, P.shape * 2) * (0.65 + 0.35 * s.energy);
      return;
    }
    if (P.mode === 'lissajous' && wave) {
      this.scene = lisScene;
      this.camera = lisCam;
      const ext = Math.min(1, Math.max(0, P.shape));
      // speed splits by regime: flat it is the phosphor afterglow in
      // the feedback pass; extruded, depth already holds the history,
      // so the trails calm down and speed becomes spin instead.
      this.fxHint = { persist: (0.30 + 0.62 * P.speed) * (1 - ext) + 0.30 * ext };

      // One gain for both axes, referenced to the louder channel's RMS
      // (peak references let one transient pin the scale — vector's
      // hard-won lesson applies unchanged).
      let sl2 = 0, sr2 = 0;
      for (let i = 0; i < 1024; i += 2) {
        sl2 += wave.l[i] * wave.l[i];
        sr2 += wave.r[i] * wave.r[i];
      }
      const rms = Math.sqrt(Math.max(sl2, sr2) / 512);
      lisPeak = Math.max(lisPeak * Math.exp(-dt / 4), rms, 0.02);
      const gain = (0.26 + 0.38 * P.fill) / lisPeak;

      // The live pen, redrawn every frame.
      const n = Math.max(2, Math.round(96 + 416 * P.complexity));
      const stride = Math.floor(1024 / n) || 1;
      const pos = lisPen.geometry.attributes.position.array;
      const col = lisPen.geometry.attributes.color.array;
      for (let i = 0; i < n; i++) {
        const x = wave.l[i * stride] * gain;
        const y = wave.r[i * stride] * gain;
        pos[i * 3] = x;
        pos[i * 3 + 1] = y;
        pos[i * 3 + 2] = 0;
        const amp = Math.min(1, (Math.abs(x) + Math.abs(y)) * 1.1);
        // Cull the DC pile to additive black (the vector blob lesson).
        const dim = Math.min(1, Math.max(0, (amp - 0.07) * 4.5));
        const c0 = PAL.mid, c1 = PAL.glow;
        col[i * 3] = (c0.r + (c1.r - c0.r) * amp) * dim;
        col[i * 3 + 1] = (c0.g + (c1.g - c0.g) * amp) * dim;
        col[i * 3 + 2] = (c0.b + (c1.b - c0.b) * amp) * dim;
      }
      lisPen.geometry.setDrawRange(0, n);
      lisPen.geometry.attributes.position.needsUpdate = true;
      lisPen.geometry.attributes.color.needsUpdate = true;
      lisPen.material.opacity = 0.7 + 0.3 * s.energy;

      // Slice clock: freeze the pen into the ring at a fixed 30 Hz.
      lisAcc += dt;
      let guard2 = 0;
      while (lisAcc >= 1 / 30 && guard2++ < 4) {
        lisAcc -= 1 / 30;
        lisHeadZ += LIS_DZ + lisGap;
        lisGap = 0;
        const sc2 = lisSlices[lisSlot++ % LIS_SLICES];
        sc2.z = lisHeadZ;
        sc2.hot = lisHot;
        lisHot = 0;
        const g2 = sc2.line.geometry;
        g2.attributes.position.copy(lisPen.geometry.attributes.position);
        g2.attributes.color.copy(lisPen.geometry.attributes.color);
        if (sc2.hot > 0) {
          const ca = g2.attributes.color.array;
          const boost = 1 + 0.8 * sc2.hot;
          for (let i = 0; i < n * 3; i++) ca[i] = Math.min(1.4, ca[i] * boost);
        }
        g2.attributes.position.needsUpdate = true;
        g2.attributes.color.needsUpdate = true;
        g2.setDrawRange(0, n);
      }
      if (guard2 >= 4) lisAcc = 0;

      // Place the frozen slices behind the pen; opacity fades with
      // age, and only the depth regime shows them at all. Children sit
      // at depthMid - age inside the pivot group and the pivot sits at
      // -depthMid, so world placement is unchanged while the spin axis
      // runs through the middle of the figure.
      const depthMax = (10 + 44 * P.density) * LIS_DZ;
      const depthMid = depthMax * 0.5 * ext;
      lisSpin.position.z = -depthMid;
      lisPen.position.z = depthMid;
      for (const sl3 of lisSlices) {
        const age = lisHeadZ - sl3.z;
        if (age > depthMax || sl3.z < -1e8 || ext < 0.02) {
          sl3.line.visible = false;
          continue;
        }
        sl3.line.visible = true;
        sl3.line.position.z = depthMid - age;
        sl3.line.rotation.z = -age * 0.28; // helical warp down the tunnel
        const fade = Math.pow(1 - age / depthMax, 1.35);
        sl3.line.material.opacity =
          Math.min(1, ext * fade * (0.28 + 0.62 * fade) * (1 + 0.8 * sl3.hot));
      }

      // Spin only in the depth regime — a rotating flat XY reads broken.
      lisSpin.rotation.y += dt * 0.55 * drastic(P.speed) * ext;

      // Camera: head-on instrument → orbit view centered on the pivot,
      // easing back as density deepens the figure.
      const e2 = ext * ext * (3 - 2 * ext);
      lisCam.position.set(1.9 * e2, 1.15 * e2, 3.3 + 0.9 * e2 + depthMid * 0.35);
      lisCam.lookAt(0, 0, -depthMid * e2);
      for (const gm of lisGratMats) gm.m.opacity = gm.base * (1 - 0.55 * e2);
      return;
    }
    this.scene = anaScene;
    this.camera = anaCam;
    this.fxHint = null; // analyzer: feedback IS the phosphor — let it ride
    anaUniforms.uShape.value = P.shape;
    // complexity: smooth curve → fine bars → chunky bars (drastic).
    const cx = P.complexity;
    anaUniforms.uBars.value = Math.min(1, Math.max(0, (cx - 0.3) / 0.15));
    anaUniforms.uBarN.value = Math.round(120 - Math.min(1, Math.max(0, (cx - 0.45) / 0.55)) * 100);
    anaUniforms.uFillAmt.value = P.fill;
    anaUniforms.uGamma.value = gamma;
    anaUniforms.uSub.value = s.sub;
    anaUniforms.uKick.value = s.kick;
    anaUniforms.uEnergy.value = s.energy;
  },
  resize(w, h) {
    anaUniforms.uAspect.value = w / h;
    scUniforms.uAspect.value = w / h;
    vecGroup.scale.x = h / w; // keep the goniometer circle round
    wfCam.aspect = w / h;
    wfCam.updateProjectionMatrix();
    lisCam.aspect = w / h; // perspective aspect keeps the pen circle round
    lisCam.updateProjectionMatrix();
  },
};
} // vjw: the factory
