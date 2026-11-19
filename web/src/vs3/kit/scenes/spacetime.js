// Copied from donor/vs3/visual_kit/src/scenes/spacetime.js (the friends' engine, used with permission, 2026-11-19).
// vjw: wrapped in a factory (one scene object per layer); nothing else changed. agents/guides/guide_vs3_port.md
// Scene: spacetime — streams of neon light rays rushing one way through
// the dark, converging on an off-screen vanishing point. The whole
// field travels in ONE direction; the mode flips it (forward/reverse)
// and the flip is a physical decelerate-pause-reverse, not a cut.
// Reference: Alec's 2026-08-15 stills (diagonal rainbow streaks over
// black, hot cores, thick hero rays among fine dust).
//
// Structure: 4 parallax layers of angle-binned rays around the
// vanishing point, drawn in log-radius space so perspective compresses
// toward the point. Kicks spawn HERO rays (fat comets, the reference's
// thick pink/cyan streaks); accents re-seed the whole field through the
// rest-gated accent detector. Travel speed lives in a JS-accumulated
// phase so kick surges are frame-rate independent and drain instantly.
import * as THREE from 'three';
import { PAL, drastic } from '../lib/common.js';
export default function create() { // vjw

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const HERO_MAX = 6;

const uniforms = {
  uTime: { value: 0 },
  uAspect: { value: 1 },
  uPhase: { value: 0 },
  uDirAng: { value: Math.PI / 2 },
  uDirBlend: { value: 1 },
  uSeed: { value: 7.0 },
  uDensity: { value: 0.6 },
  uFill: { value: 0.5 },
  uComplexity: { value: 0.6 },
  uContrast: { value: 0.5 },
  uPulse: { value: 0 },
  uPulseAmp: { value: 0 },
  uKick: { value: 0 },
  uSub: { value: 0 },
  uHighs: { value: 0 },
  uEnergy: { value: 0 },
  uBg: { value: PAL.bg },
  uShadow: { value: PAL.shadow },
  uMid: { value: PAL.mid },
  uAccent: { value: PAL.accent },
  uGlow: { value: PAL.glow },
  // xyz = ray angle, streak phase offset, width mult; w = life 1→0
  // (w < 0 = empty slot).
  uHero: { value: Array.from({ length: HERO_MAX }, () => new THREE.Vector4(0, 0, 0, -1)) },
};

const quad = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uAspect, uPhase, uDirAng, uDirBlend, uSeed;
      uniform float uDensity, uFill, uComplexity, uContrast;
      uniform float uPulse, uPulseAmp;
      uniform float uKick, uSub, uHighs, uEnergy;
      uniform vec3 uBg, uShadow, uMid, uAccent, uGlow;
      uniform vec4 uHero[${HERO_MAX}];
      varying vec2 vUv;

      vec2 hash2(vec2 p) {
        return fract(sin(vec2(dot(p, vec2(127.1, 311.7)),
                              dot(p, vec2(269.5, 183.3)))) * 43758.5453);
      }

      // Per-ray neon color: anchored to the palette slots, then nudged
      // around the hue wheel by channel rotation so a stream reads as
      // many hues without leaving the palette's character. The wide
      // palettes go full spectrum here; the moody ones stay moody.
      vec3 rayColor(vec2 h) {
        vec3 c = mix(mix(uMid, uAccent, clamp(h.x * 1.7 - 0.2, 0.0, 1.0)),
                     uGlow, clamp(h.y * 1.5 - 0.6, 0.0, 1.0));
        vec2 j = hash2(h * 91.7 + 4.2);
        c = mix(c, c.gbr, j.x * 0.45);
        c = mix(c, c.brg, j.y * 0.35);
        return c;
      }

      // One parallax layer of angle-binned rays.
      vec3 layer(float ang, float r, float u, float bins, float sp,
                 float li, float gate, float thickMul) {
        float c = ang * bins / 6.2831853 + li * 7.31;
        float bin = floor(c);
        vec2 h = hash2(vec2(bin, uSeed + li * 13.7));
        if (h.x > gate) return vec3(0.0);
        vec2 h2 = hash2(vec2(bin * 1.71 + 3.1, uSeed * 0.7 + li));

        // Across-beam distance in screen units; far rays (small r) thin
        // out with the perspective.
        float binW = r * (6.2831853 / bins);
        float across = abs(fract(c) - 0.5) * binW;
        float sigma = (0.0008 + 0.0048 * h2.x * h2.x) * thickMul
                    * (0.55 + 0.45 * smoothstep(0.15, 1.1, r))
                    * (1.0 + uSub * 0.7);
        float beam = exp(-across * across / (sigma * sigma));
        // Wedge guard: when the beam is wide relative to its own bin
        // (near the vanishing point) it would light the whole wedge.
        beam *= smoothstep(0.5, 0.22, sigma / max(binW, 1e-4));

        // Along-beam comet in log-radius space, LONG tails: the
        // reference rays run most of the frame with a hot head.
        // uDirBlend mirrors the profile so the head always leads.
        float w0 = fract(u * 0.8 + h.y * 23.0 - uPhase * sp * (0.55 + 0.9 * h2.y));
        float w = mix(1.0 - w0, w0, uDirBlend);
        float len = mix(0.55, 0.97, fract(h.y * 7.7)) * (0.5 + 0.62 * uFill);
        float tail = clamp((w - (1.0 - len)) / len, 0.0, 1.0);
        // The head is the event: brightness falls off exponentially
        // behind it (bright blob, fast drop, then a long faint line),
        // like the reference, instead of an even beam.
        float behind = (1.0 - w) / max(len, 0.2);
        float falloff = mix(1.6, 4.2, fract(h2.x * 13.1));
        float along = exp(-behind * falloff) * step(0.001, tail)
                    + 0.1 * tail;

        // detail: some rays break into bead trains (the reference's
        // dotted trails). Per-ray gate widens with the slider, bead
        // count is the ray's own, and the beads ride the same w
        // coordinate so they travel with the streak.
        vec2 h3 = hash2(vec2(bin * 3.37 + 11.0, uSeed + li * 5.1));
        float dashAmt = smoothstep(0.35, 1.0, uComplexity)
                      * step(h3.x, 0.55);
        float dashN = mix(26.0, 90.0, h3.y);
        along *= mix(1.0, 0.35 + 0.65 * (0.5 + 0.5 * cos(w * dashN * 6.2831853)),
                     dashAmt * tail);

        float head = pow(smoothstep(0.955, 1.0, w), 3.0) * (0.8 + 1.4 * uHighs);

        // Rays vanish INTO the vanishing point: fade well before the
        // bins converge, or the near-point bins light whole wedges.
        float depth = smoothstep(0.42, 1.05, r);
        // Heads burn toward white; tails keep the saturated hue.
        vec3 col = rayColor(h2);
        return (col * along + mix(col, vec3(1.0), 0.15) * head) * beam * depth;
      }

      void main() {
        vec2 uv = (vUv - 0.5) * vec2(uAspect, 1.0);
        vec2 dir = vec2(cos(uDirAng), sin(uDirAng));
        vec2 vp = dir * 1.6;
        vec2 d = uv - vp;
        float r = length(d);
        float ang = atan(d.y, d.x) + 3.14159265;
        float u = log(max(r, 0.05));

        float gate = mix(0.18, 1.0, uDensity);
        float fillT = 0.55 + 0.9 * uFill;

        vec3 acc = vec3(0.0);
        acc += layer(ang, r, u, 46.0, 1.5, 0.0, gate, 1.35 * fillT);
        acc += layer(ang, r, u, 78.0, 1.05, 1.0, gate, 1.0 * fillT) * 0.85;
        acc += layer(ang, r, u, 124.0, 0.74, 2.0, gate, 0.75 * fillT)
             * (0.35 + 0.65 * uComplexity);
        acc += layer(ang, r, u, 196.0, 0.5, 3.0, gate, 0.55 * fillT)
             * 0.8 * smoothstep(0.15, 0.9, uComplexity);
        // The top half of the rays slider pours in two MORE strata of
        // fine far rays, so full density reads as a meteor storm.
        float storm = smoothstep(0.55, 1.0, uDensity);
        if (storm > 0.001) {
          acc += layer(ang, r, u, 290.0, 0.38, 4.0, gate, 0.5 * fillT) * 0.7 * storm;
          acc += layer(ang, r, u, 410.0, 0.3, 5.0, gate, 0.42 * fillT)
               * 0.55 * smoothstep(0.7, 1.0, uDensity);
          acc += layer(ang, r, u, 560.0, 0.24, 6.0, gate, 0.36 * fillT)
               * 0.45 * smoothstep(0.82, 1.0, uDensity);
        }

        // Full storm holds the same sky brightness: the additive sum is
        // renormalized as the population grows, so rays at 100 means
        // more streaks, never a washed frame.
        acc *= mix(1.05, 0.75, uDensity);

        // Kick pulse: a wave of light racing along the stream, from the
        // vanishing point outward in forward, inward in reverse.
        if (uPulseAmp > 0.001) {
          float pr = mix(0.3, 2.7, mix(1.0 - uPulse, uPulse, uDirBlend));
          float band = exp(-pow((r - pr) / 0.16, 2.0));
          acc *= 1.0 + band * uPulseAmp * 1.1;
        }

        // Hero rays: per-kick comets, thick and hot, decaying with life.
        for (int i = 0; i < ${HERO_MAX}; i++) {
          vec4 H = uHero[i];
          if (H.w < 0.0) continue;
          vec2 hd = vec2(cos(H.x), sin(H.x));
          float across = abs(d.x * hd.y - d.y * hd.x);
          float sigma = 0.006 * H.z * (1.0 + uSub * 0.5);
          float beam = exp(-across * across / (sigma * sigma));
          // Only the half-plane on the ray's side of the vanishing point.
          float side = step(0.0, dot(d, hd));
          float w0 = fract(u * 0.55 + H.y - uPhase * 1.35);
          float w = mix(1.0 - w0, w0, uDirBlend);
          float tail = clamp((w - 0.08) / 0.92, 0.0, 1.0);
          float body = exp(-(1.0 - w) * 6.5) + 0.06 * tail
                     + pow(smoothstep(0.94, 1.0, w), 2.0) * 1.2;
          vec2 hh = hash2(vec2(H.x * 17.3, H.y * 31.1));
          acc += rayColor(hh) * beam * side * body * H.w * H.w * 1.6
               * smoothstep(0.42, 0.95, r);
        }

        // Micro dust: static pinpricks that twinkle on highs.
        vec2 g = uv * 34.0;
        vec2 dh = hash2(floor(g) + uSeed);
        float dust = step(0.93, dh.x)
                   * exp(-dot(fract(g) - 0.5 - (dh - 0.5) * 0.6,
                              fract(g) - 0.5 - (dh - 0.5) * 0.6) * 60.0)
                   * (0.05 + 0.25 * uHighs * fract(dh.y * 9.0 + uTime * 0.7));
        acc += mix(uMid, uGlow, dh.y) * dust;

        // Song dynamics gate the whole field: quiet passages read calm.
        acc *= 0.35 + 1.25 * uEnergy;
        vec3 col = uBg * 0.14 + acc;

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

// JS-side state: accumulated travel phase (frame-rate independent, kick
// surges decay with the kick envelope itself), smoothed direction angle
// and forward/reverse blend, hero ray pool, accent re-seed gate.
let phase = 0;
let dirAng = Math.PI / 2;
let dirBlend = 1;
let heroAng = 0;
let accentRest = 10;
let pulseT = 1; // 0..1 travel progress of the kick light pulse
let pulseAmp = 0;
const heroes = []; // { ang, off, width, life }

return { // vjw: was `export default {`
  name: 'spacetime',
  scene,
  camera,
  bloom: { strength: 0.42, gain: 0.65 },
  modes: ['forward', 'reverse'],
  params: { mode: 'forward', speed: 0.5, shape: 0.25, complexity: 0.6, density: 0.6, fill: 0.5, contrast: 0.5 },
  paramLabels: {
    forward: { shape: 'direction', complexity: 'detail', density: 'rays', fill: 'width' },
    reverse: { shape: 'direction', complexity: 'detail', density: 'rays', fill: 'width' },
  },
  update(s, dt, t) {
    const P = this.params;

    // Direction of the stream: shape sweeps the vanishing point a full
    // turn around the screen, eased so a slider grab pans the sky.
    const target = P.shape * Math.PI * 2 + Math.PI / 2;
    let dd = target - dirAng;
    dd -= Math.round(dd / (Math.PI * 2)) * Math.PI * 2;
    dirAng += dd * (1 - Math.exp(-dt * 4));

    // Mode flip: velocity eases through zero, so the field slows,
    // hangs, and pours back the other way.
    const dirTarget = P.mode === 'reverse' ? 0 : 1;
    dirBlend += (dirTarget - dirBlend) * (1 - Math.exp(-dt * 3.2));

    phase += dt * 0.5 * drastic(P.speed) * (dirBlend * 2 - 1)
           * (0.55 + 0.45 * s.mids + 0.9 * s.kick);

    // Per-kick: spawn a hero comet on the golden angle (consecutive
    // hits never stack); strong hits spawn a second.
    if (s.onKick > 0.05) {
      // Relaunch the light pulse from the vanishing point.
      pulseT = 0;
      pulseAmp = Math.min(1, 0.35 + s.onKick * 0.75);
      const n = s.onKick > 0.7 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        heroAng += 2.399963;
        heroes.push({
          ang: dirAng + Math.PI + Math.sin(heroAng) * 0.55,
          off: Math.random(),
          width: 0.7 + s.onKick * 1.0 + Math.random() * 0.4,
          life: 1,
        });
      }
      while (heroes.length > HERO_MAX) heroes.shift();
    }
    for (let i = heroes.length - 1; i >= 0; i--) {
      heroes[i].life -= dt / 2.6;
      if (heroes[i].life <= 0) heroes.splice(i, 1);
    }
    const HU = uniforms.uHero.value;
    for (let i = 0; i < HERO_MAX; i++) {
      const h = heroes[i];
      if (h) HU[i].set(h.ang, h.off, h.width, h.life);
      else HU[i].w = -1;
    }

    // Accent gate (relic numbers): a strong hit after rest re-seeds the
    // whole field — every ray re-rolls, the stream restructures.
    accentRest += dt;
    if (s.onKick > 0.55 && accentRest > 3.2) {
      uniforms.uSeed.value = (uniforms.uSeed.value + 1.0) % 97;
      accentRest = 0;
    }

    // The pulse crosses the field in about 0.45 s and its glow drains
    // as it travels, so it lands as a wave, never a frame flash.
    pulseT = Math.min(1, pulseT + dt * 2.2);
    pulseAmp *= Math.exp(-dt * 2.8);
    uniforms.uPulse.value = pulseT;
    uniforms.uPulseAmp.value = pulseT >= 1 ? 0 : pulseAmp;

    uniforms.uTime.value = t;
    uniforms.uPhase.value = phase;
    uniforms.uDirAng.value = dirAng;
    uniforms.uDirBlend.value = dirBlend;
    uniforms.uDensity.value = P.density;
    uniforms.uFill.value = P.fill;
    uniforms.uComplexity.value = P.complexity;
    uniforms.uContrast.value = P.contrast;
    uniforms.uKick.value = s.kick;
    uniforms.uSub.value = s.sub;
    uniforms.uHighs.value = s.highs;
    uniforms.uEnergy.value = s.energy;
  },
  resize(w, h) {
    uniforms.uAspect.value = w / h;
  },
  // QA hooks: numeric state for the headless harness.
  _debug() {
    return { phase, dirAng, dirBlend, heroes: heroes.map((h) => ({ ...h })), seed: uniforms.uSeed.value };
  },
};
} // vjw: the factory
