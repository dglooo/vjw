// Copied from donor/vs3/visual_kit/src/scenes/anemone.js (the friends' engine, used with permission, 2026-11-19).
// vjw: wrapped in a factory (one scene object per layer), the bead sprite kept above it. agents/guides/guide_vs3_port.md
// Scene: Anemone — chains of glowing bead rings pouring out of a single
// point, the whole field lying on a tilted 3D plane so depth reads
// across the frame (dots on one side hang genuinely farther away).
// Strong accents swing the plane to a new heading; every kick sends a
// pulse of light out along the chains. The source follows the mouse
// with an eased chase, and holding the mouse button pulls the whole
// stream back in, a visible inhale. Palette-anchored with a hue fan
// keyed to each chain's departure angle (the earned-spectrum look).
import * as THREE from 'three';
import { PAL, drastic, scenePointer } from '../lib/common.js';
// vjw: the bead sprite stays ABOVE the factory, so every layer shares one texture (the host frees geometries and
// materials, no textures). Its detached 2D canvas is kept, as lib/common.js particleSprite: a texture source, no I/O.
// Every bead is a small glowing RING (annulus sprite, not a filled dot) —
// that hollow-bead look is the whole signature of the scene.
let beadTex = null;
function beadSprite() {
  if (beadTex) return beadTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const img = g.createImageData(64, 64);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const dx = (x - 31.5) / 31.5, dy = (y - 31.5) / 31.5;
      const r = Math.hypot(dx, dy);
      // Bright annulus at r=0.62, soft on both flanks, faint center ember.
      const ring = Math.exp(-((r - 0.62) ** 2) / 0.016);
      const core = 0.22 * Math.exp(-(r * r) / 0.05);
      const a = Math.min(1, ring + core) * Math.max(0, 1 - (r - 0.9) * 10);
      const i = (y * 64 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.max(0, Math.min(255, a * 255));
    }
  }
  g.putImageData(img, 0, 0);
  beadTex = new THREE.CanvasTexture(c);
  return beadTex;
}

export default function create() { // vjw

const scene = new THREE.Scene();
scene.background = PAL.bg;
const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 100);
camera.position.set(0, 0, 7);

const COLOR_GLSL = /* glsl */`
  uniform vec3 uMidC; uniform vec3 uAccC; uniform vec3 uGlowC;
  uniform float uHueFan;
  vec3 hueShift(vec3 c, float a) {
    const vec3 k = vec3(0.5773503);
    float ca = cos(a);
    return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
  }
  vec3 chainColor(float u) {
    float p = fract(u) * 3.0;
    vec3 c = p < 1.0 ? mix(uMidC, uAccC, p)
           : p < 2.0 ? mix(uAccC, uGlowC, p - 1.0)
           : mix(uGlowC, uMidC, p - 2.0);
    return hueShift(c, (fract(u) - 0.5) * uHueFan);
  }
`;

const BEAD_FRAG = /* glsl */`
  uniform sampler2D uMap;
  varying float vA;
  varying vec3 vC;
  void main() {
    float a = texture2D(uMap, gl_PointCoord).a * vA;
    gl_FragColor = vec4(vC * a, a);
  }
`;

// Ambient world bend in the field's local space: the far source stays
// put, near chains sweep sideways, so the tunnel drifts around corners
// underneath the tilt.
const BEND_GLSL = /* glsl */`
  uniform vec2 uBend;
  vec3 bendP(vec3 p) {
    float q = clamp((p.z + 4.0) / 9.6, 0.0, 1.0);
    p.xy += uBend * q * q * 2.6;
    return p;
  }
`;
const SRC_Z = -3.8; // local z of the source point (chain mouths)

// --- streamers: every chain pours out of the source point ---------------
const S_STRANDS = 96;
const S_BEADS = 80;
const S_COUNT = S_STRANDS * S_BEADS;
const GOLDEN = 2.399963;
const GOLDEN_FRAC = 0.3819662; // GOLDEN / 2pi — angle as a 0..1 hue key

const sGeo = new THREE.BufferGeometry();
{
  const pos = new Float32Array(S_COUNT * 3);
  const strand = new Float32Array(S_COUNT);
  const along = new Float32Array(S_COUNT);
  const rand = new Float32Array(S_COUNT);
  let i = 0;
  for (let st = 0; st < S_STRANDS; st++) {
    const h = Math.random();
    for (let b = 0; b < S_BEADS; b++, i++) {
      strand[i] = st;
      along[i] = b / S_BEADS;
      rand[i] = h;
    }
  }
  sGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  sGeo.setAttribute('aStrand', new THREE.BufferAttribute(strand, 1));
  sGeo.setAttribute('aAlong', new THREE.BufferAttribute(along, 1));
  sGeo.setAttribute('aRand', new THREE.BufferAttribute(rand, 1));
}

const MAX_PULSES = 5;
const sUniforms = {
  uMap: { value: null },
  uTime: { value: 0 },
  uFlow: { value: 0 },
  uCurl: { value: 1.6 },       // spiral curl along a strand (shape)
  uWiggleF: { value: 9.0 },    // wave frequency along chains (complexity)
  uWiggleA: { value: 0.5 },
  uSpin: { value: 0 },
  // Pattern modes crossfade geometrically: both paths are computed and
  // mixed, so a MODE change morphs one shape into the next.
  uModeA: { value: 0 },
  uModeB: { value: 0 },
  uModeMix: { value: 1 },
  uFill: { value: 1 },
  uBead: { value: 1 },
  uBreathe: { value: 0 },
  uDensity: { value: 1 },
  uGamma: { value: 1 },
  uLevel: { value: 1 },
  uSparkle: { value: 0 },
  uBend: { value: new THREE.Vector2(0, 0) },
  // x=front pos along the flow, y=gain (eased in JS)
  uPulse: { value: Array.from({ length: MAX_PULSES }, () => new THREE.Vector2(-10, 0)) },
  uMidC: { value: PAL.mid }, uAccC: { value: PAL.accent }, uGlowC: { value: PAL.glow },
  uHueFan: { value: 2.4 },
  uColorCycles: { value: 1.6 },
};

const sMat = new THREE.ShaderMaterial({
  uniforms: sUniforms,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: /* glsl */`
    attribute float aStrand; attribute float aAlong; attribute float aRand;
    uniform float uTime, uFlow, uCurl, uWiggleF, uWiggleA, uSpin;
    uniform float uFill, uBead, uBreathe, uDensity, uGamma, uLevel, uSparkle;
    uniform float uColorCycles;
    uniform float uModeA, uModeB, uModeMix;
    uniform vec2 uPulse[${MAX_PULSES}];
    varying float vA; varying vec3 vC;
    ${COLOR_GLSL}
    ${BEND_GLSL}
    // One chain, four patterns. s is the flow coordinate everywhere, so
    // pulses, the inhale, and the density gate work in every mode.
    vec3 modePath(float m, float s, float ang0) {
      float wig = sin(s * uWiggleF * 6.2832 + aRand * 40.0 + uTime * 0.8);
      float fillB = uFill * (1.0 + uBreathe);
      if (m < 0.5) {
        // bloom: chains pour radially out of the source
        float ang = ang0 + s * uCurl;
        float radius = mix(0.5, 9.5, pow(s, 0.85)) * fillB;
        float z = ${SRC_Z.toFixed(1)} + (3.0 - ${SRC_Z.toFixed(1)}) * pow(s, 1.15);
        vec2 dir = vec2(cos(ang), sin(ang));
        vec2 perp = vec2(-dir.y, dir.x);
        vec3 p = vec3(dir * radius + perp * wig * uWiggleA * s * uFill, z);
        p.z += 0.4 * sin(s * uWiggleF * 3.1 + aRand * 21.0);
        return p;
      } else if (m < 1.5) {
        // vortex: winding rings, outer near, inner deep — the hole
        // becomes a funnel the beads orbit around
        float Rn = mix(0.12, 1.0, pow(fract(aRand * 5.31), 0.75)) * (1.0 - 0.3 * s);
        float turns = 1.6 + 0.8 * fract(aRand * 2.7);
        float ang = ang0 + s * 6.2832 * turns * (0.5 + 0.5 * uCurl);
        float r = Rn * 7.8 * fillB;
        float z = ${SRC_Z.toFixed(1)} + (3.0 - ${SRC_Z.toFixed(1)}) * pow(Rn, 1.1);
        vec3 p = vec3(cos(ang) * r, sin(ang) * r, z);
        p.z += wig * uWiggleA * 0.9;
        return p;
      } else if (m < 2.5) {
        // braid: a rope of chains twisting ACROSS the frame. The axis
        // lies along x on purpose: pointed at the camera the helix
        // stacks every bead into one hot blob.
        float hr = (0.5 + 1.7 * fract(aRand * 3.17)) * fillB;
        float turns = 2.0 + 1.5 * fract(aRand * 9.1);
        float ang = ang0 + s * 6.2832 * turns;
        float x = (s * 2.0 - 1.0) * 9.0;
        float y = cos(ang) * hr + wig * uWiggleA * 0.4;
        float z = ${(SRC_Z + 2.0).toFixed(1)} + sin(ang) * hr * 0.7;
        return vec3(x, y, z);
      }
      // veil: a layered curtain of chains flowing sideways past the
      // source. Depth is PER SHEET, near constant along a string —
      // per-bead depth jitter scatters the sizes and the strings
      // dissolve into confetti.
      float x = (s * 2.0 - 1.0) * 9.5;
      float yN = fract(aStrand * 0.618034) * 2.0 - 1.0;
      float y = yN * 4.2 * fillB + sin(x * 0.33 + aRand * 17.0 + uTime * 0.4) * 1.1;
      float z = ${SRC_Z.toFixed(1)} + 5.5 * fract(aRand * 7.7)
              + sin(x * 0.21 + aRand * 21.0) * 0.5;
      return vec3(x, y + wig * uWiggleA * 0.5, z);
    }
    void main() {
      // Beads flow along their strand; per-strand rate varies. uFlow runs
      // backward while the mouse is held, fract() wraps either way.
      float rate = 0.35 + 0.5 * fract(aRand * 7.13);
      float s = fract(aAlong + uFlow * rate + aRand * 3.7);
      float ang0 = aStrand * ${GOLDEN} + uSpin;
      vec3 p = (uModeA == uModeB || uModeMix >= 1.0)
        ? modePath(uModeB, s, ang0)
        : mix(modePath(uModeA, s, ang0), modePath(uModeB, s, ang0), uModeMix);
      p = bendP(p);
      // fade in at birth and out before the wrap so respawns never pop
      float win = smoothstep(0.0, 0.06, s) * (1.0 - smoothstep(0.75, 0.98, s));
      float on = step(fract(aRand * 13.7), uDensity);
      // kick pulses: bright fronts traveling out along the flow
      float boost = 0.0;
      for (int i = 0; i < ${MAX_PULSES}; i++) {
        float d = s - uPulse[i].x;
        boost += uPulse[i].y * exp(-d * d / 0.004);
      }
      float spark = uSparkle * step(0.96, fract(aRand * 51.7 + aAlong * 97.0)) * 2.0;
      float hot = 1.0 + 1.8 * step(0.94, fract(aRand * 29.3 + aAlong * 13.7));
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      // Bokeh from TRUE view distance so it holds in every mode: close
      // beads grow soft and dim, far beads run smaller and dimmer.
      float nearD = smoothstep(6.5, 3.0, -mv.z);
      float att = clamp(9.0 / max(2.0, -mv.z), 0.72, 1.25);
      vA = on * win * uLevel * (0.55 + 0.45 * s) * (1.0 - 0.65 * nearD) * (hot + boost + spark);
      vA = pow(clamp(vA * att, 0.0, 1.8), uGamma);
      // Hue keyed by departure angle, then traveling along the chain so
      // beads keep passing through the PURE palette slots — a constant
      // key parks whole strands on desaturated blend midpoints (khaki).
      vC = chainColor(fract(aStrand * ${GOLDEN_FRAC}) * uColorCycles
                    + s * 0.6 + fract(aAlong * 7.7) * 0.08);
      gl_PointSize = uBead * (0.24 + 0.56 * s + 0.5 * nearD) * (380.0 / max(0.1, -mv.z));
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: BEAD_FRAG,
});
sMat.uniforms.uMap.value = beadSprite();
const streamers = new THREE.Points(sGeo, sMat);
streamers.frustumCulled = false;
// The whole field lives in a tilted group: its plane sits oblique to
// the camera, so one side of the frame hangs deeper than the other.
const field = new THREE.Group();
field.add(streamers);
scene.add(field);

// Pointer interaction rides the shared scenePointer (lib/common.js):
// only the canvas steers, SHIFT+SPACE detaches the mouse, hold inhales.
const pointer = scenePointer;

// --- state ---------------------------------------------------------------
let flow = 0;
let flowVel = 0;
let phase = 0;
let spin = 0;
let breathe = 0;
let breatheTgt = 0;
let sparkle = 0;
let bendPhase = 0;
let lastSwing = -10;
// The plane's lean composes from three sources: the tilt slider owns
// the base (automatable, dial stays honest), the mouse pushes on top
// while it's alive, and accents tip it transiently before decaying
// back to the dial.
const tilt = new THREE.Vector2(-0.1, 0.31);    // x=rotX, y=rotY (eased)
const mouseTilt = new THREE.Vector2(0, 0);
const swing = new THREE.Vector2(0, 0);
const focus = new THREE.Vector2(0, 0);
const _srcLocal = new THREE.Vector3();
const _e = new THREE.Euler();
const pulses = []; // { pos, gain, age }

return { // vjw: was `export default {`
  name: 'anemone',
  scene,
  camera,
  bloom: { strength: 0.32, gain: 0.35 },
  // shape IS the tilt (bipolar around 0.5, ships leaning); it reads
  // "tilt" in the panel and on the device SHAPE lane while this scene
  // plays, so the lean is automatable.
  paramLabels: { '*': { shape: 'tilt' } },
  modes: ['bloom', 'vortex', 'braid', 'veil'],
  params: { mode: 'bloom', speed: 0.5, shape: 0.68, complexity: 0.5, density: 0.5, fill: 0.5, contrast: 0.5 },
  update(s, dt, t) {
    const P = this.params;
    const spF = drastic(P.speed);

    // Structural response is accent-gated (threshold + min rest): strong
    // kicks TIP the plane, an impulse that decays back to the slider's
    // baseline so an automated tilt lane never drifts from its dial.
    if (s.onKick > 0.28 && t - lastSwing > 1.8) {
      lastSwing = t;
      const side = swing.y >= 0 ? -1 : 1; // alternate the tip
      swing.x += (Math.random() * 0.06 + 0.04) * (Math.random() < 0.5 ? -1 : 1);
      swing.y += (Math.random() * 0.16 + 0.12) * side;
    }
    swing.multiplyScalar(Math.exp(-dt * 1.2));
    if (s.onKick) {
      breatheTgt = Math.min(1, breatheTgt + s.onKick * 0.7);
      if (pulses.length < MAX_PULSES) pulses.push({ pos: 0.02, gain: 0.55 + s.onKick, age: 0 });
    }
    if (s.onHigh) sparkle = Math.min(1.4, sparkle + s.onHigh * 0.9);
    breatheTgt += -breatheTgt * (1 - Math.exp(-dt * 5));
    breathe += (breatheTgt - breathe) * (1 - Math.exp(-dt * 28));
    sparkle += -sparkle * (1 - Math.exp(-dt * 3.2));

    // Pulses travel outward faster than the beads themselves.
    for (let i = pulses.length - 1; i >= 0; i--) {
      pulses[i].pos += dt * 0.55 * spF;
      pulses[i].age += dt;
      pulses[i].gain *= Math.exp(-dt * 1.1);
      if (pulses[i].pos > 1.1 || pulses[i].gain < 0.04) pulses.splice(i, 1);
    }
    const pu = sUniforms.uPulse.value;
    for (let i = 0; i < MAX_PULSES; i++) {
      // Pop-in ease: a pulse fades up over ~0.12 s so the hit reads as a
      // front departing, never a frame flash.
      if (pulses[i]) pu[i].set(pulses[i].pos, pulses[i].gain * Math.min(1, pulses[i].age / 0.12));
      else pu[i].set(-10, 0);
    }

    // The source point: mouse when it's alive, center when it isn't.
    // Fixed reference projection (never the live camera — feedback).
    let tx = 0, ty = 0;
    if (pointer.ndc && performance.now() - pointer.lastMove < 4000) {
      const dist = 7 - SRC_Z;
      const halfH = Math.tan((camera.fov * Math.PI) / 360) * dist;
      tx = THREE.MathUtils.clamp(pointer.ndc.x * halfH * camera.aspect, -5.5, 5.5);
      ty = THREE.MathUtils.clamp(pointer.ndc.y * halfH, -3.5, 3.5);
    }
    focus.x += (tx - focus.x) * (1 - Math.exp(-dt * 3.2));
    focus.y += (ty - focus.y) * (1 - Math.exp(-dt * 3.2));

    // Mouse pushes the lean too, AWAY from the cursor like an anemone
    // leaning off the current: with the source dragged to one edge, the
    // plane tips the field back across the frame instead of stacking
    // everything in the corner. Eases to zero when the mouse goes idle.
    let mty = 0, mtx = 0;
    if (pointer.ndc && performance.now() - pointer.lastMove < 4000) {
      mty = -pointer.ndc.x * 0.5;
      mtx = pointer.ndc.y * 0.28;
    }
    mouseTilt.x += (mtx - mouseTilt.x) * (1 - Math.exp(-dt * 2.5));
    mouseTilt.y += (mty - mouseTilt.y) * (1 - Math.exp(-dt * 2.5));

    // Compose the lean: slider base + mouse push + decaying accent tip.
    // Base spans -0.85..0.85 rad across the slider, with a small
    // coupled pitch so the lean reads organic, never a pure turntable.
    const lean = (P.shape - 0.5) * 2;
    const baseY = lean * 0.85;
    const baseX = lean * -0.16;
    tilt.x += (baseX + mouseTilt.x + swing.x - tilt.x) * (1 - Math.exp(-dt * 1.6));
    tilt.y += (baseY + mouseTilt.y + swing.y - tilt.y) * (1 - Math.exp(-dt * 1.6));

    // Hold the mouse and the stream INHALES: several times faster than
    // the outward drift, so the reversal is unmistakable. (The first cut
    // flipped the sign only; at drift speed a reversal is invisible.)
    const velTgt = (pointer.held ? -4.5 : 1) * 0.045 * spF * (0.55 + 0.45 * s.energy + s.sub * 0.3);
    flowVel += (velTgt - flowVel) * (1 - Math.exp(-dt * 5));
    flow += dt * flowVel;
    phase += dt * spF * (0.22 + s.mids * 0.5);
    spin += dt * spF * 0.05;
    bendPhase += dt * spF * (0.32 + 0.35 * s.mids);
    const bendX = Math.sin(bendPhase * 0.35) * 0.42 + Math.sin(bendPhase * 0.19 + 1.7) * 0.24;
    const bendY = Math.sin(bendPhase * 0.26 + 0.8) * 0.28 + Math.sin(bendPhase * 0.15 + 3.1) * 0.16;
    sUniforms.uBend.value.set(bendX, bendY);

    // Per-mode level normalization: the dense patterns park far more
    // beads near the camera than bloom, and unscaled they pin the
    // exposure servo at its washout floor. Crossfaded with the morph.
    const MODE_LEVEL = [0.85, 0.4, 0.6, 0.55];
    const mA = MODE_LEVEL[sUniforms.uModeA.value] || 1;
    const mB = MODE_LEVEL[sUniforms.uModeB.value] || 1;
    const modeLevel = mA + (mB - mA) * sUniforms.uModeMix.value;
    const level = (0.72 + 0.66 * s.energy) * modeLevel;
    const gamma = 0.6 + 0.9 * (1 - P.contrast);
    const fill = 0.55 + 0.9 * P.fill;
    const bead = 0.75 + 0.7 * P.fill;
    const dens = 0.3 + 0.7 * P.density;

    sUniforms.uTime.value = t;
    sUniforms.uFlow.value = flow;
    sUniforms.uSpin.value = spin;
    // MODE switches morph geometrically: hold the old path, ease the
    // mix to the new one.
    const mi = Math.max(0, this.modes.indexOf(P.mode));
    if (mi !== sUniforms.uModeB.value) {
      sUniforms.uModeA.value = sUniforms.uModeB.value;
      sUniforms.uModeB.value = mi;
      sUniforms.uModeMix.value = 0;
    }
    sUniforms.uModeMix.value = Math.min(1, sUniforms.uModeMix.value + dt * 0.9);

    // shape is the tilt now; curl and wave both live under complexity.
    sUniforms.uCurl.value = 0.4 + 2.6 * P.complexity;
    sUniforms.uWiggleF.value = 3 + 9 * P.complexity;
    sUniforms.uWiggleA.value = 0.15 + 0.3 * P.complexity;
    sUniforms.uBreathe.value = breathe * 0.05;
    sUniforms.uFill.value = fill;
    sUniforms.uBead.value = bead;
    sUniforms.uDensity.value = dens;
    sUniforms.uGamma.value = gamma;
    sUniforms.uLevel.value = level;
    sUniforms.uSparkle.value = sparkle;
    sUniforms.uColorCycles.value = 0.9 + 1.6 * P.complexity;

    // Tilt the field about the SOURCE point (not the group origin), so
    // the source stays pinned under the cursor while the plane leans.
    field.rotation.set(tilt.x, tilt.y, Math.sin(t * 0.05) * 0.1);
    _e.set(tilt.x, tilt.y, field.rotation.z);
    _srcLocal.set(0, 0, SRC_Z).applyEuler(_e);
    field.position.set(focus.x - _srcLocal.x, focus.y - _srcLocal.y, SRC_Z - _srcLocal.z);

    // Camera never chases the focus (chasing cancels the mouse gesture);
    // it only drifts with the ambient curve and banks into the turn.
    const orb = t * 0.03 * spF;
    camera.position.set(Math.sin(orb) * 0.5, Math.cos(orb * 0.7) * 0.35, 7 - breathe * 0.35);
    camera.up.set(Math.sin(bendX * 0.08), 1, 0).normalize();
    camera.lookAt(bendX * 0.35, bendY * 0.25, -1.0);
  },
  resize(w, h) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  },
};
} // vjw: the factory
