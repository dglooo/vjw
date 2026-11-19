// Copied from donor/vs3/visual_kit/src/lib/limitless3d-stage.js (the friends' engine, used with permission, 2026-11-19).
// vjw: verbatim.
// The limitless 3d stage: everything scenes/limitless3d.js runs, built
// by a factory so a second copy can serve the 3D emblem
// (lib/emblem3d.js). The scene file keeps the literal metadata and the
// full description of the modes.
import * as THREE from 'three';
import { PAL, drastic, scenePointer } from './common.js';
import { NOISE_GLSL } from './noise-glsl.js';
import { SHAPES, buildShape } from './model-shapes.js';
import { SCANS, loadScan } from './model-scans.js';
import { finishModel } from './model-load.js';
import { ctx } from './context.js';

const MODES = ['form', 'shatter', 'dust', 'hologram', 'slices', 'voxel'];
const MODE_IDX = { form: 0, shatter: 1, dust: 2, hologram: 3, slices: 4, voxel: 5 };

// ---------------------------------------------------------------- taste knobs
// Framing: the share of the half-height the model's bounding sphere
// fills, from fill 0 to fill 1.
const FRAME_LO = 0.42;
const FRAME_HI = 1.05;
const FOV = 34;
// The accent gate the hologram's scan line rides.
const HIT = 0.55;
const REST = 3.2;
// The mouse. Drag turns the model DRAG_YAW radians per unit of screen
// (the screen is two units across) and tilts it DRAG_PITCH. The tilt
// stops at PITCH_MAX. Both axes hold between gestures.
const DRAG_YAW = 2.6;
const DRAG_PITCH = 1.6;
const PITCH_MAX = 1.1;
// shatter: how far apart the shards hang at spread 0 and 1 (the slider
// runs a 1.6 power between them), and how fast they tumble (radians per
// second at neutral speed, the fastest).
const SPREAD_LO = 0.05;
const SPREAD_HI = 1.0;
const TUMBLE = 0.7;
// slices: how fast the layers turn against each other (radians per
// second at neutral speed, the fastest layer).
const SLICE_DRIFT = 0.16;
// dust: grains sampled per model (the density slider draws a share),
// their size in model units, and the light each one adds (the cloud is
// additive, and at 165K grains the model area is about four deep).
const DUST_MAX = 300000;
const DUST_MIN = 30000;
const DUST_SIZE = 0.006;
const DUST_GAIN = 0.14;
// hologram: overall light of the additive wire (both faces of every
// triangle add up, so busy models run hot).
const HOLO_GAIN = 0.32;
// voxel: grid cells across the model's diameter (complexity sweeps it),
// the most cubes drawn, the surface samples a still model is measured
// from, the vertex budget an animated one is re-measured from, and how
// many times a second that happens at neutral speed.
const VOX_LO = 10;
const VOX_HI = 48;
const VOX_MAX = 24000;
const VOX_SAMPLES = 150000;
const VOX_VERTS = 40000;
const VOX_RATE = 7;
// How much of its palette color a cube emits on its own.
const VOX_GLOW = 0.22;
// Light. Env is the palette room's reflections; key is white for shape;
// rim and sky carry palette color. Energy scales all of it.
const ENV_GAIN = 1.0;
const KEY_GAIN = 1.4;
const RIM_GAIN = 2.0;
const SKY_GAIN = 0.5;
// Models past this many triangles skip the per-face copy (it costs
// about 56 bytes a vertex); their shatter and slices tear per vertex.
const FACE_DATA_MAX = 1.2e6;
// How far a built-in leans toward the camera at rest, in radians. A
// lotus seen edge-on is a flat line; seen from above it is a flower.
const REST_PITCH = { lotus: 0.62, shell: 0.25, crystal: 0.12 };
const PITCH_DEFAULT = 0.08;

// ---------------------------------------------------------------- the factory

// The scene is built by a factory so the emblem can run its own copy
// (lib/emblem3d.js): same modes, its own model, stage and uniforms. It
// fills in target, an object carrying params (and, for the scene, the
// rest of its metadata), and returns it.
// emblem: no backdrop (the target clears to transparent), no mouse, and
// the turn comes from the emblem's spin through setTurn().
export function createLimitless3D(target, { emblem = false, pxHeight = 0 } = {}) {
  // ---------------------------------------------------------------- the stage

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.05, 60);
  // Keep the outer stage neutral. The inner group holds the chosen angle
  // and each model's resting tilt.
  const aim = new THREE.Group();
  const turntable = new THREE.Group();
  aim.add(turntable);
  scene.add(aim);

  // Backdrop: a dark palette gradient behind everything.
  const backdropU = { uIn: { value: new THREE.Color() }, uOut: { value: new THREE.Color() }, uAspect: { value: 16 / 9 } };
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: backdropU,
    depthTest: false,
    depthWrite: false,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 1.0, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uIn, uOut;
      uniform float uAspect;
      varying vec2 vUv;
      void main() {
        vec2 d = (vUv - vec2(0.5, 0.54)) * vec2(uAspect, 1.0);
        gl_FragColor = vec4(mix(uIn, uOut, smoothstep(0.0, 0.95, length(d))), 1.0);
      }`,
  }));
  backdrop.frustumCulled = false;
  backdrop.renderOrder = -1;
  scene.add(backdrop);
  backdrop.visible = !emblem;

  const sky = new THREE.HemisphereLight(0xffffff, 0x000000, SKY_GAIN);
  const key = new THREE.DirectionalLight(0xffffff, KEY_GAIN);
  key.position.set(-3, 4.5, 3.5);
  const rim = new THREE.DirectionalLight(0xffffff, RIM_GAIN);
  rim.position.set(3.5, 1.8, -4);
  scene.add(sky, key, rim);

  // The palette room: a box of palette panels, turned into reflections by
  // PMREM and rebuilt at most five times a second while a palette morphs.
  const room = new THREE.Scene();
  const roomSlots = [];
  {
    const walls = new THREE.MeshBasicMaterial({ side: THREE.BackSide, color: 0x000000 });
    room.add(new THREE.Mesh(new THREE.BoxGeometry(12, 12, 12), walls));
    roomSlots.push([walls, 'bg', 0.6]);
    const panel = (w, h, pos, slot, gain) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: 0x000000 }));
      m.position.set(...pos);
      m.lookAt(0, 0, 0);
      room.add(m);
      roomSlots.push([m.material, slot, gain]);
    };
    panel(5, 3, [-2.6, 4.2, 3.6], 'key', 4.5);
    panel(1.6, 6.5, [4.4, 1.2, -3.2], 'accent', 5);
    panel(1.3, 5.5, [-4.5, 0.4, -2.6], 'mid', 3.5);
    panel(9, 9, [0, -5.5, 0], 'shadow', 1.6);
    panel(2.2, 2.2, [3.8, 0.4, 4.2], 'glow', 2.2);
  }
  const WHITE = new THREE.Color(1, 1, 1);
  let pmrem = null;
  let envRT = null;
  let envAt = -1;
  let envBuilds = 0;
  const SLOT_KEYS = ['bg', 'shadow', 'mid', 'accent', 'glow'];
  const sigNow = new Int16Array(15);
  const sigBuilt = new Int16Array(15).fill(-1);
  function paletteMoved() {
    let moved = false;
    for (let i = 0; i < 5; i++) {
      const c = PAL[SLOT_KEYS[i]];
      const r = Math.round(c.r * 48), g = Math.round(c.g * 48), b = Math.round(c.b * 48);
      if (r !== sigBuilt[i * 3] || g !== sigBuilt[i * 3 + 1] || b !== sigBuilt[i * 3 + 2]) moved = true;
      sigNow[i * 3] = r; sigNow[i * 3 + 1] = g; sigNow[i * 3 + 2] = b;
    }
    return moved;
  }
  function refreshRoom(renderer, clock) {
    if (!paletteMoved() || (envRT && clock - envAt < 0.2 && clock >= envAt)) return;
    for (const [mat, slot, gain] of roomSlots) {
      if (slot === 'key') mat.color.copy(WHITE).lerp(PAL.glow, 0.3).multiplyScalar(gain);
      else mat.color.copy(PAL[slot]).multiplyScalar(gain);
    }
    if (!pmrem) pmrem = new THREE.PMREMGenerator(renderer);
    const next = pmrem.fromScene(room, 0.04);
    if (envRT) envRT.dispose();
    envRT = next;
    scene.environment = envRT.texture;
    sigBuilt.set(sigNow);
    envAt = clock;
    envBuilds++;
  }

  // ---------------------------------------------------------------- the patch

  // One uniform set drives every patched material, so a mode change or a
  // kick is a handful of numbers, never a recompile.
  const fx = {
    uFxMode: { value: 0 },
    uFxT: { value: 0 },
    uChrome: { value: 0 },
    uMelt: { value: 0 },
    uExplode: { value: 0 },
    uShardDist: { value: 1.3 },
    uFine: { value: 0.5 },
    uTumble: { value: 0 },
    uSliceN: { value: 10 },
    uSliceGap: { value: 0.06 },
    uSliceTwist: { value: 1.2 },
    uSliceDrift: { value: 0 },
    uSeedA: { value: 0 },
    uSeedB: { value: 0 },
    uSeedMix: { value: 0 },
    uScanY: { value: -3 },
    uWire: { value: 1.2 },
    uGlass: { value: 0.08 },
    uHoloGain: { value: 1 },
    uContrast: { value: 0.5 },
    uLightGain: { value: 1 },
    uGlowC: { value: PAL.glow },
    uAccentC: { value: PAL.accent },
    uMidC: { value: PAL.mid },
  };

  const FX_VERT_PARS = /* glsl */`
    uniform int uFxMode;
    uniform float uFxT, uMelt, uExplode, uShardDist, uFine, uTumble;
    uniform float uSliceN, uSliceGap, uSliceTwist, uSliceDrift, uSeedA, uSeedB, uSeedMix;
    #ifndef LFX_NOFACE
      attribute vec3 aCenter;
      attribute vec3 aFaceN;
      attribute vec3 aRand;
      attribute vec3 aChunk;
      attribute vec2 aBary;
    #endif
    varying vec3 vLfxW;
    varying vec3 vLfxBary;
    varying float vLfxCut;
    float lfxHash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
    vec3 lfxHash3(vec3 p) {
      return fract(sin(vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)),
        dot(p, vec3(113.5, 271.9, 124.6)))) * 43758.5453);
    }
    vec3 lfxRot(vec3 v, vec3 axis, float a) {
      float c = cos(a), s = sin(a);
      return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
    }
    float lfxSliceTurn(float k, float seed) {
      return (lfxHash(k * 7.13 + seed * 91.7) - 0.5) * 2.0;
    }
  `;

  // Replaces project_vertex. p is the vertex, c its face (or chunk)
  // center and n the face normal, all in world space.
  const FX_VERT_BODY = /* glsl */`
    vec3 lfxC = transformed;
    vec3 lfxN = normalize(transformed + 1e-4);
    vec3 lfxR = vec3(0.5);
    vec3 lfxK = transformed;
    vec3 lfxB = vec3(0.33);
    #ifndef LFX_NOFACE
      lfxC = aCenter;
      lfxN = aFaceN;
      lfxR = aRand;
      lfxK = aChunk;
      lfxB = vec3(aBary, 1.0 - aBary.x - aBary.y);
      #ifdef USE_SKINNING
        // The face centers ride the same bones as the vertex, so a shard
        // leaves the body where the body is now, not at its bind pose.
        mat4 lfxSkin = skinWeight.x * boneMatX + skinWeight.y * boneMatY
          + skinWeight.z * boneMatZ + skinWeight.w * boneMatW;
        lfxSkin = bindMatrixInverse * lfxSkin * bindMatrix;
        lfxC = (lfxSkin * vec4(aCenter, 1.0)).xyz;
        lfxK = (lfxSkin * vec4(aChunk, 1.0)).xyz;
        lfxN = normalize((lfxSkin * vec4(aFaceN, 0.0)).xyz);
      #endif
    #else
      lfxR = lfxHash3(floor(transformed * 40.0));
    #endif
    vec4 lfxW = vec4(transformed, 1.0);
    vec4 lfxCW = vec4(lfxC, 1.0);
    vec4 lfxKW = vec4(lfxK, 1.0);
    #ifdef USE_INSTANCING
      lfxW = instanceMatrix * lfxW;
      lfxCW = instanceMatrix * lfxCW;
      lfxKW = instanceMatrix * lfxKW;
    #endif
    lfxW = modelMatrix * lfxW;
    lfxCW = modelMatrix * lfxCW;
    lfxKW = modelMatrix * lfxKW;
    vec3 lfxNW = normalize(mat3(modelMatrix) * lfxN);
    vLfxCut = 0.0;

    if (uFxMode == 0 && uMelt > 0.0) {
      // form: the surface melts along its direction from the center, a
      // displacement that depends on position alone, so hard-edged models
      // never crack open along their seams.
      vec3 q = lfxW.xyz;
      float n1 = snoise(q * 2.3 + vec3(0.0, uFxT * 0.35, 0.0));
      float n2 = snoise(q * 5.1 - vec3(uFxT * 0.2));
      lfxW.xyz += normalize(q + 1e-4) * (n1 * 0.7 + n2 * 0.3) * uMelt;
    } else if (uFxMode == 1) {
      // shatter: a face flies alone once uFine passes its random, else it
      // rides with its chunk. Direction leans out along the face normal
      // and away from the center; shards shrink as they go. Their turn
      // grows with the square of the spread, so a model barely apart
      // reads as itself with cracks, and they tumble (uTumble is
      // speed-scaled time) only once they hang well apart.
      bool alone = lfxR.z < uFine;
      vec3 piv = alone ? lfxCW.xyz : lfxKW.xyz;
      vec3 seed = alone ? lfxR : lfxHash3(floor(lfxKW.xyz * 97.0));
      float e = uExplode * (0.35 + 0.65 * seed.x);
      vec3 outward = normalize(piv + 1e-4);
      vec3 dir = normalize(mix(outward, lfxNW, alone ? 0.55 : 0.2) + (seed - 0.5) * 0.7);
      vec3 axis = normalize(seed * 2.0 - 1.0 + 1e-3);
      vec3 rel = lfxW.xyz - piv;
      float spin = e * e * (1.5 + 5.0 * seed.y)
        + uTumble * (fract(seed.x * 7.31 + seed.y * 3.17) * 2.0 - 1.0) * smoothstep(0.12, 0.45, e);
      rel = lfxRot(rel, axis, spin) * mix(1.0, 0.45, clamp(e, 0.0, 1.0));
      lfxW.xyz = piv + rel + dir * e * uShardDist;
    } else if (uFxMode == 4) {
      // slices: the stack is cut by face center height, so a face never
      // stretches across a gap. Each slice sits at its own turn and keeps
      // turning at its own slow rate (uSliceDrift is speed-scaled time).
      float k = floor((lfxCW.y + 1.2) * uSliceN / 2.4);
      float turn = mix(lfxSliceTurn(k, uSeedA), lfxSliceTurn(k, uSeedB), uSeedMix) * uSliceTwist
        + uSliceDrift * lfxSliceTurn(k, 37.0);
      float c = cos(turn), s = sin(turn);
      lfxW.xz = mat2(c, -s, s, c) * lfxW.xz;
      lfxW.y += (k - uSliceN * 0.5 + 0.5) * uSliceGap;
      // how close this fragment sits to its slice's cut faces
      float f = fract((lfxCW.y + 1.2) * uSliceN / 2.4);
      vLfxCut = 1.0 - min(f, 1.0 - f) * 2.0;
    }
    vLfxW = lfxW.xyz;
    vLfxBary = lfxB;
    vec4 mvPosition = viewMatrix * lfxW;
    gl_Position = projectionMatrix * mvPosition;
  `;

  const FX_FRAG_PARS = /* glsl */`
    uniform int uFxMode;
    uniform float uChrome, uScanY, uWire, uGlass, uHoloGain, uContrast, uLightGain, uFxT;
    uniform vec3 uGlowC, uAccentC, uMidC;
    varying vec3 vLfxW;
    varying vec3 vLfxBary;
    varying float vLfxCut;
    vec3 lfxGrade(vec3 col) {
      vec3 hi = col * col * (3.0 - 2.0 * col);
      vec3 lo = pow(max(col, 0.0), vec3(0.72));
      col = mix(col, hi, max(0.0, uContrast - 0.5) * 1.6);
      return mix(col, lo, max(0.0, 0.5 - uContrast) * 1.6);
    }
    float lfxEdge() {
      vec3 w = fwidth(vLfxBary);
      vec3 a = smoothstep(vec3(0.0), w * uWire, vLfxBary);
      return 1.0 - min(min(a.x, a.y), a.z);
    }
  `;

  // After opaque_fragment. Hologram replaces the color outright (the holo
  // variant draws additive); the solid modes add their accents and grade.
  const FX_FRAG_BODY = /* glsl */`
    #ifdef LFX_HOLO
      vec3 lfxV = normalize(cameraPosition - vLfxW);
      // Where the screen derivatives run parallel (a sliver seen edge on)
      // the cross is zero and normalize() returns NaN, which the feedback
      // pass then keeps forever; such a pixel reads as pure rim instead.
      vec3 lfxX = cross(dFdx(vLfxW), dFdy(vLfxW));
      vec3 lfxNf = lfxX / max(length(lfxX), 1e-20);
      float fres = pow(max(1.0 - abs(dot(lfxNf, lfxV)), 0.0), 2.2);
      float edge = lfxEdge();
      float scan = exp(-abs(vLfxW.y - uScanY) * 14.0);
      float bands = 0.5 + 0.5 * sin(vLfxW.y * 60.0 - uFxT * 3.0);
      vec3 holo = uGlowC * edge * 0.6
        + uAccentC * fres * 0.22
        + uGlowC * scan * (0.35 + 0.6 * edge)
        + uMidC * uGlass * (0.25 + 0.2 * bands);
      gl_FragColor = vec4(lfxGrade(holo * uHoloGain * uLightGain), 1.0);
    #else
      if (uFxMode == 4) gl_FragColor.rgb += uGlowC * pow(max(vLfxCut, 0.0), 10.0) * 1.2 * uLightGain;
      gl_FragColor.rgb = lfxGrade(gl_FragColor.rgb);
    #endif
  `;

  // Patch a material. holo gives the additive hologram variant. The patch
  // only adds code around three's own chunks, so maps, skinning, morphs
  // and instancing all keep working.
  function patchMaterial(src, { holo = false, noFace = false } = {}) {
    const m = src.clone();
    if (holo) {
      m.transparent = true;
      m.blending = THREE.AdditiveBlending;
      m.depthWrite = false;
      m.side = THREE.DoubleSide;
    }
    const defs = [];
    if (holo) defs.push('#define LFX_HOLO');
    if (noFace) defs.push('#define LFX_NOFACE');
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, fx);
      shader.vertexShader = defs.join('\n') + '\n' + NOISE_GLSL + FX_VERT_PARS + shader.vertexShader
        .replace('#include <project_vertex>', FX_VERT_BODY);
      let frag = defs.join('\n') + '\n' + FX_FRAG_PARS + shader.fragmentShader;
      // form's chrome pull, on the standard family only (basic has no
      // roughness or metalness to pull).
      if (frag.includes('#include <metalnessmap_fragment>')) {
        frag = frag
          .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93), uChrome);')
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, 0.16, uChrome);')
          .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  metalnessFactor = mix(metalnessFactor, 0.95, uChrome);');
      }
      shader.fragmentShader = frag.replace('#include <opaque_fragment>', '#include <opaque_fragment>\n' + FX_FRAG_BODY);
    };
    m.customProgramCacheKey = () => `lfx${holo ? 'h' : 's'}${noFace ? 'n' : 'f'}`;
    m.needsUpdate = true;
    return m;
  }

  // ---------------------------------------------------------------- per-face data

  // From a mesh's own space to model space: the holder's parent frame,
  // where every model has radius 1. The holder itself carries the 1/r
  // scale, so its parent's frame is the one to measure in.
  function unitSpace(holder, o) {
    holder.updateMatrixWorld(true);
    const parent = holder.parent ? holder.parent.matrixWorld : new THREE.Matrix4();
    return new THREE.Matrix4().copy(parent).invert().multiply(o.matrixWorld);
  }

  // A non-indexed copy of the geometry with the per-face data the patch
  // reads. The chunks are a coarse grid over the unit model (about six
  // cells across), so a low complexity shatter breaks into big pieces.
  function faceGeometry(src, meshToModel) {
    const g = src.index ? src.toNonIndexed() : src.clone();
    const pos = g.getAttribute('position');
    const n = pos.count - (pos.count % 3);
    const center = new Float32Array(pos.count * 3);
    const faceN = new Float32Array(pos.count * 3);
    const rand = new Float32Array(pos.count * 3);
    const chunk = new Float32Array(pos.count * 3);
    const bary = new Float32Array(pos.count * 2);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), cm = new THREE.Vector3(), fn = new THREE.Vector3();
    const sums = new Map();
    const keyOf = new Int32Array(n / 3);
    const CELLS = 6;
    for (let f = 0; f < n / 3; f++) {
      a.fromBufferAttribute(pos, f * 3);
      b.fromBufferAttribute(pos, f * 3 + 1);
      c.fromBufferAttribute(pos, f * 3 + 2);
      cm.copy(a).add(b).add(c).multiplyScalar(1 / 3);
      fn.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a));
      if (fn.lengthSq() > 0) fn.normalize(); else fn.set(0, 1, 0);
      // The chunk grid runs in model space (unit radius), whatever this
      // mesh's own scale.
      const mc = cm.clone().applyMatrix4(meshToModel);
      const cx = Math.floor((mc.x + 1) * CELLS / 2), cy = Math.floor((mc.y + 1) * CELLS / 2), cz = Math.floor((mc.z + 1) * CELLS / 2);
      const k = (cx * 73856093) ^ (cy * 19349663) ^ (cz * 83492791);
      keyOf[f] = k;
      const s = sums.get(k) || { x: 0, y: 0, z: 0, n: 0 };
      s.x += cm.x; s.y += cm.y; s.z += cm.z; s.n++;
      sums.set(k, s);
      const h1 = Math.sin(f * 12.9898 + 1.7) * 43758.5453;
      const h2 = Math.sin(f * 78.233 + 4.1) * 43758.5453;
      const h3 = Math.sin(f * 39.425 + 9.3) * 43758.5453;
      for (let v = 0; v < 3; v++) {
        const i = f * 3 + v;
        center[i * 3] = cm.x; center[i * 3 + 1] = cm.y; center[i * 3 + 2] = cm.z;
        faceN[i * 3] = fn.x; faceN[i * 3 + 1] = fn.y; faceN[i * 3 + 2] = fn.z;
        rand[i * 3] = h1 - Math.floor(h1); rand[i * 3 + 1] = h2 - Math.floor(h2); rand[i * 3 + 2] = h3 - Math.floor(h3);
        bary[i * 2] = v === 0 ? 1 : 0; bary[i * 2 + 1] = v === 1 ? 1 : 0;
      }
    }
    for (let f = 0; f < n / 3; f++) {
      const s = sums.get(keyOf[f]);
      for (let v = 0; v < 3; v++) {
        const i = f * 3 + v;
        chunk[i * 3] = s.x / s.n; chunk[i * 3 + 1] = s.y / s.n; chunk[i * 3 + 2] = s.z / s.n;
      }
    }
    g.setAttribute('aCenter', new THREE.BufferAttribute(center, 3));
    g.setAttribute('aFaceN', new THREE.BufferAttribute(faceN, 3));
    g.setAttribute('aRand', new THREE.BufferAttribute(rand, 3));
    g.setAttribute('aChunk', new THREE.BufferAttribute(chunk, 3));
    g.setAttribute('aBary', new THREE.BufferAttribute(bary, 2));
    return g;
  }

  // ---------------------------------------------------------------- dust
  // Grains live on each mesh, in that mesh's own space, as its child, so
  // they ride everything the mesh does: node animation through the parent
  // chain, skinning through the mesh's own skeleton. A skinned mesh's
  // grains are a SkinnedMesh drawn as points (isMesh off, isPoints on):
  // three then binds the bones and draws gl.POINTS, and the grain shader
  // runs three's own skinning chunks. A dancing character stays a dancing
  // cloud.

  const dustU = {
    uT: { value: 0 },
    uDrift: { value: 0.2 },
    uBurst: { value: 0 },
    uFlowScale: { value: 1.6 },
    uSize: { value: 0.006 },
    uPx: { value: 1000 },
    uGlowC: fx.uGlowC,
    uAccentC: fx.uAccentC,
    uMidC: fx.uMidC,
    uLightGain: fx.uLightGain,
    uContrast: fx.uContrast,
    uHighs: { value: 0 },
    uGrain: { value: 0.1 },
  };
  const dustMaterial = new THREE.ShaderMaterial({
    uniforms: dustU,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: NOISE_GLSL + /* glsl */`
      #include <skinning_pars_vertex>
      attribute vec3 aNrm;
      attribute vec4 aRnd;
      uniform float uT, uDrift, uBurst, uFlowScale, uSize, uPx, uHighs;
      uniform vec3 uGlowC, uAccentC, uMidC;
      varying vec3 vCol;
      void main() {
        vec3 transformed = position;
        #include <skinbase_vertex>
        #include <skinning_vertex>
        // World space: the turntable sits on the origin at unit scale, so
        // this is the model's own frame, turned.
        vec4 wp = modelMatrix * vec4(transformed, 1.0);
        vec3 home = wp.xyz;
        vec3 wn = normalize(mat3(modelMatrix) * aNrm);
        vec3 q = home * uFlowScale + vec3(0.0, uT * 0.12, 0.0);
        vec3 flow = vec3(snoise(q), snoise(q + 17.1), snoise(q + 31.7));
        float d = uDrift * (0.3 + 0.7 * aRnd.x);
        wp.xyz += flow * d * 0.45;
        wp.xyz += (wn * 0.6 + normalize(home + 1e-4) * 0.4) * uBurst * (0.4 + 1.1 * aRnd.y);
        wp.xyz += wn * uHighs * 0.012 * (aRnd.z - 0.5);
        vec4 mv = viewMatrix * wp;
        gl_Position = projectionMatrix * mv;
        gl_PointSize = max(1.0, uSize * uPx * (0.55 + 0.9 * aRnd.w) / max(0.2, -mv.z));
        float h = clamp(home.y * 0.5 + 0.5, 0.0, 1.0);
        vCol = mix(mix(uMidC, uAccentC, smoothstep(0.1, 0.6, h)), uGlowC, smoothstep(0.55, 1.0, h + (aRnd.z - 0.5) * 0.4));
        vCol *= 0.8 + 0.6 * aRnd.w;
      }`,
    fragmentShader: /* glsl */`
      uniform float uLightGain, uContrast, uGrain;
      varying vec3 vCol;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r2 = dot(d, d);
        if (r2 > 0.25) discard;
        float a = smoothstep(0.25, 0.02, r2);
        vec3 col = vCol * a * uLightGain * uGrain;
        vec3 hi = col * col * (3.0 - 2.0 * col);
        col = mix(col, hi, max(0.0, uContrast - 0.5) * 1.6);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });

  // Deterministic, so a model's cloud is the same in every window.
  function lcg(seed) {
    let x = seed >>> 0 || 1;
    return () => { x = (x * 16807) % 2147483647; return (x - 1) / 2147483646; };
  }

  // Each mesh's surface in model space: cumulative triangle areas for
  // area-weighted picking, measured at rest (the bind pose for skinned
  // meshes, which is where their grains are written).
  function surfaceOf(holder, o) {
    const g = o.geometry, pos = g.getAttribute('position');
    const faces = (g.index ? g.index.count : pos.count) / 3 | 0;
    const toModel = unitSpace(holder, o);
    const cum = new Float32Array(faces);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
    let area = 0;
    const vi = (f, k) => (g.index ? g.index.getX(f * 3 + k) : f * 3 + k);
    for (let f = 0; f < faces; f++) {
      a.fromBufferAttribute(pos, vi(f, 0)).applyMatrix4(toModel);
      b.fromBufferAttribute(pos, vi(f, 1)).applyMatrix4(toModel);
      c.fromBufferAttribute(pos, vi(f, 2)).applyMatrix4(toModel);
      const ar = e1.subVectors(b, a).cross(e2.subVectors(c, a)).length() * 0.5;
      area += ar > 0 ? ar : 0;
      cum[f] = area;
    }
    return { o, g, pos, faces, cum, area, vi };
  }

  function pickFace(cum, x) {
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < x) lo = mid + 1; else hi = mid; }
    return lo;
  }

  // Grains for every mesh, shared out by surface area, each set a child of
  // its mesh. Returns the grain objects, all hidden until dust shows.
  function sampleDust(model, total) {
    const surf = model.fx.meshes.map((m) => surfaceOf(model.holder, m.o)).filter((x) => x.area > 0);
    const sum = surf.reduce((n, x) => n + x.area, 0);
    const r = lcg(7);
    const out = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), n = new THREE.Vector3();
    for (const sf of surf) {
      const count = Math.round(total * sf.area / sum);
      if (!count) continue;
      const skinned = sf.o.isSkinnedMesh && sf.g.getAttribute('skinIndex') && sf.g.getAttribute('skinWeight');
      const pos = new Float32Array(count * 3), nrm = new Float32Array(count * 3), rnd = new Float32Array(count * 4);
      const si = skinned ? new Float32Array(count * 4) : null, sw = skinned ? new Float32Array(count * 4) : null;
      const gi = skinned ? sf.g.getAttribute('skinIndex') : null, gw = skinned ? sf.g.getAttribute('skinWeight') : null;
      for (let i = 0; i < count; i++) {
        const f = pickFace(sf.cum, r() * sf.area);
        const i0 = sf.vi(f, 0), i1 = sf.vi(f, 1), i2 = sf.vi(f, 2);
        a.fromBufferAttribute(sf.pos, i0); b.fromBufferAttribute(sf.pos, i1); c.fromBufferAttribute(sf.pos, i2);
        let u = r(), v = r();
        if (u + v > 1) { u = 1 - u; v = 1 - v; }
        const w = 1 - u - v;
        pos[i * 3] = a.x * w + b.x * u + c.x * v;
        pos[i * 3 + 1] = a.y * w + b.y * u + c.y * v;
        pos[i * 3 + 2] = a.z * w + b.z * u + c.z * v;
        n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a));
        if (n.lengthSq() > 0) n.normalize(); else n.set(0, 1, 0);
        nrm[i * 3] = n.x; nrm[i * 3 + 1] = n.y; nrm[i * 3 + 2] = n.z;
        rnd[i * 4] = r(); rnd[i * 4 + 1] = r(); rnd[i * 4 + 2] = r(); rnd[i * 4 + 3] = r();
        if (skinned) {
          // The grain takes the bones of the corner it sits nearest.
          const near = w >= u && w >= v ? i0 : u >= v ? i1 : i2;
          for (let k = 0; k < 4; k++) { si[i * 4 + k] = gi.getComponent(near, k); sw[i * 4 + k] = gw.getComponent(near, k); }
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('aNrm', new THREE.BufferAttribute(nrm, 3));
      geo.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 4));
      let obj;
      if (skinned) {
        geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
        geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
        obj = new THREE.SkinnedMesh(geo, dustMaterial);
        obj.isMesh = false;
        obj.isPoints = true;
        obj.bind(sf.o.skeleton, sf.o.bindMatrix);
      } else {
        obj = new THREE.Points(geo, dustMaterial);
      }
      obj.frustumCulled = false;
      obj.visible = false;
      obj.userData.lfxGrains = count;
      sf.o.add(obj);
      out.push(obj);
    }
    return out;
  }

  // ---------------------------------------------------------------- voxel
  // The model rebuilt from palette cubes on a grid, colored by height
  // through the palette in the shader (a palette morph glides through
  // them). The cells come from points in model space: area-weighted
  // surface samples for a model that holds still, measured once; posed
  // vertices for an animated one, re-measured a few times a second.

  const voxU = {
    uPop: { value: 0 },
    uCube: { value: 0.05 },
    uGlowC: fx.uGlowC,
    uAccentC: fx.uAccentC,
    uMidC: fx.uMidC,
  };
  const voxMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.3, roughness: 0.32 });
  voxMaterial.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, voxU, { uLightGain: fx.uLightGain, uContrast: fx.uContrast });
    shader.vertexShader = /* glsl */`
      attribute vec4 aVox;
      uniform float uPop, uCube;
      uniform vec3 uGlowC, uAccentC, uMidC;
      varying vec3 vVoxCol;
    ` + shader.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed *= uCube;')
      .replace('#include <project_vertex>', /* glsl */`
        vec4 mvPosition = vec4(transformed, 1.0);
        vec3 vcen = vec3(0.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
          vcen = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        #endif
        float e = uPop * (0.3 + 0.7 * aVox.x);
        mvPosition.xyz += normalize(vcen + 1e-4) * e * 0.7 + (aVox.yzw - 0.5) * e * 0.35;
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;
        float vh = clamp(vcen.y * 0.5 + 0.5, 0.0, 1.0);
        vVoxCol = mix(mix(uMidC, uAccentC, smoothstep(0.1, 0.6, vh)), uGlowC, smoothstep(0.55, 1.0, vh + (aVox.z - 0.5) * 0.3));
      `);
    shader.fragmentShader = /* glsl */`
      #define VOX_GLOW ${VOX_GLOW.toFixed(3)}
      uniform float uLightGain, uContrast;
      varying vec3 vVoxCol;
    ` + shader.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= vVoxCol;')
      // A little of the palette color glows on its own, so cubes in the
      // shade still read as the palette and not as grey.
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vVoxCol * VOX_GLOW * uLightGain;')
      .replace('#include <opaque_fragment>', /* glsl */`#include <opaque_fragment>
        {
          vec3 col = gl_FragColor.rgb;
          vec3 hi = col * col * (3.0 - 2.0 * col);
          vec3 lo = pow(max(col, 0.0), vec3(0.72));
          col = mix(col, hi, max(0.0, uContrast - 0.5) * 1.6);
          gl_FragColor.rgb = mix(col, lo, max(0.0, 0.5 - uContrast) * 1.6);
        }`);
  };
  voxMaterial.customProgramCacheKey = () => 'lfxvox';
  const voxMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), voxMaterial, VOX_MAX);
  {
    const rv = new Float32Array(VOX_MAX * 4);
    const r = lcg(11);
    for (let i = 0; i < rv.length; i++) rv[i] = r();
    voxMesh.geometry.setAttribute('aVox', new THREE.InstancedBufferAttribute(rv, 4));
  }
  voxMesh.count = 0;
  voxMesh.frustumCulled = false;
  voxMesh.visible = false;
  turntable.add(voxMesh);

  // Points in model space to build cells from. A still model is sampled
  // over its surface once; an animated one hands back its posed vertices
  // (a stride keeps a dense mesh inside the budget).
  function voxelPoints(model, animated) {
    const f = model.fx;
    if (!animated && f.voxPts) return f.voxPts;
    const holder = model.holder;
    holder.updateMatrixWorld(true);
    const pts = [];
    const v = new THREE.Vector3();
    if (animated) {
      let total = 0;
      holder.traverse((o) => { if ((o.isMesh || o.isPoints) && o.geometry && o.geometry.getAttribute('position')) total += o.geometry.getAttribute('position').count; });
      const stride = Math.max(1, Math.ceil(total / VOX_VERTS));
      holder.traverse((o) => {
        if (!(o.isMesh || o.isPoints) || !o.geometry || !o.geometry.getAttribute('position')) return;
        if (o.userData.lfxGrains) return; // the dust sets are not the model
        const toModel = unitSpace(holder, o);
        const n = o.geometry.getAttribute('position').count;
        for (let i = 0; i < n; i += stride) {
          if (o.isMesh) o.getVertexPosition(i, v); else v.fromBufferAttribute(o.geometry.getAttribute('position'), i);
          v.applyMatrix4(toModel);
          pts.push(v.x, v.y, v.z);
        }
      });
      return new Float32Array(pts);
    }
    const surf = f.meshes.map((m) => surfaceOf(holder, m.o)).filter((x) => x.area > 0);
    const sum = surf.reduce((n, x) => n + x.area, 0);
    const r = lcg(5);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (const sf of surf) {
      const count = Math.round(VOX_SAMPLES * sf.area / sum);
      const toModel = unitSpace(holder, sf.o);
      for (let i = 0; i < count; i++) {
        const fi = pickFace(sf.cum, r() * sf.area);
        sf.o.getVertexPosition(sf.vi(fi, 0), a).applyMatrix4(toModel);
        sf.o.getVertexPosition(sf.vi(fi, 1), b).applyMatrix4(toModel);
        sf.o.getVertexPosition(sf.vi(fi, 2), c).applyMatrix4(toModel);
        let u = r(), w = r();
        if (u + w > 1) { u = 1 - u; w = 1 - w; }
        pts.push(a.x + (b.x - a.x) * u + (c.x - a.x) * w, a.y + (b.y - a.y) * u + (c.y - a.y) * w, a.z + (b.z - a.z) * u + (c.z - a.z) * w);
      }
    }
    // A points-only scan: its own points are the surface.
    holder.traverse((o) => {
      if (!o.isPoints || o.userData.lfxGrains || !o.geometry.getAttribute('position')) return;
      const toModel = unitSpace(holder, o);
      const pa = o.geometry.getAttribute('position');
      const stride = Math.max(1, Math.ceil(pa.count / VOX_SAMPLES));
      for (let i = 0; i < pa.count; i += stride) { v.fromBufferAttribute(pa, i).applyMatrix4(toModel); pts.push(v.x, v.y, v.z); }
    });
    f.voxPts = new Float32Array(pts);
    return f.voxPts;
  }

  // Quantize to the grid and place one cube per occupied cell. keep is
  // the share of cells that stay (by a hash of the cell, so the same
  // cells drop out every rebuild and nothing flickers).
  const voxDummy = new THREE.Matrix4();
  function buildVoxels(pts, res, keep) {
    const cell = 2 / res;
    const seen = new Set();
    let n = 0;
    for (let i = 0; i < pts.length && n < VOX_MAX; i += 3) {
      const ix = Math.floor((pts[i] + 1) / cell), iy = Math.floor((pts[i + 1] + 1) / cell), iz = Math.floor((pts[i + 2] + 1) / cell);
      const k = (ix * 4099 + iy) * 4099 + iz;
      if (seen.has(k)) continue;
      seen.add(k);
      const h = Math.sin(ix * 12.9898 + iy * 78.233 + iz * 37.719) * 43758.5453;
      if (h - Math.floor(h) > keep) continue;
      voxDummy.makeTranslation(-1 + (ix + 0.5) * cell, -1 + (iy + 0.5) * cell, -1 + (iz + 0.5) * cell);
      voxMesh.setMatrixAt(n++, voxDummy);
    }
    voxMesh.count = n;
    voxMesh.instanceMatrix.needsUpdate = true;
    return n;
  }

  // ---------------------------------------------------------------- the models

  let shown = null;      // the model on the turntable (built-in or dropped)
  let shownKey = '';
  let dropped = null;    // a dropped model, kept while a built-in shows
  const builtins = new Map();
  const palMats = new Set(); // patched materials that follow the palette
  // The built-ins in the order the panel lists them.
  const BUILTINS = [...SHAPES, ...SCANS];
  // The pick on the wire (PROTOCOL.md `mdl`) is a fixed id per model that
  // never moves: 1..6 the math shapes, 7 the dropped model, 8 on the scans.
  // New built-ins append.
  const WIRE_IDS = ['knot', 'crystal', 'shell', 'lotus', 'orb', 'helix', 'dropped', 'skull', 'bust', 'hand'];
  // Scans on their way or refused: name -> { at, failed }. A failed fetch
  // is tried again after SCAN_RETRY seconds of scene time, never per frame.
  const scanState = new Map();
  const SCAN_RETRY = 10;

  // Give a model its effect copies: per-face geometry and patched
  // materials for every mesh. Done once, the first time it shows.
  function prepare(model) {
    if (model.fx) return model.fx;
    const meshes = [];
    const holder = model.holder;
    const noFace = (model.stats && model.stats.tris > FACE_DATA_MAX) || false;
    const meshList = [];
    holder.traverse((o) => { if (o.isMesh) meshList.push(o); });
    for (const o of meshList) {
      const src = o.geometry;
      if (!noFace) {
        o.geometry = faceGeometry(src, unitSpace(holder, o));
        src.dispose();
      }
      const orig = Array.isArray(o.material) ? o.material : [o.material];
      const solid = orig.map((m) => patchMaterial(m, { noFace }));
      const holo = orig.map((m) => patchMaterial(m, { holo: true, noFace }));
      // Built-in tints follow the palette through their patched copies
      // (a clone carries the userData along).
      for (const c of [...solid, ...holo]) if (c.userData.lfxPal || c.userData.lfxGlow) palMats.add(c);
      o.material = Array.isArray(o.material) ? solid : solid[0];
      meshes.push({ o, solid, holo, orig });
    }
    model.fx = { meshes, dust: null, noFace, holoOn: false };
    return model.fx;
  }

  function setHolo(model, on) {
    const f = model.fx;
    if (!f || f.holoOn === on) return;
    for (const m of f.meshes) {
      const set = on ? m.holo : m.solid;
      m.o.material = Array.isArray(m.o.material) ? set : set[0];
    }
    f.holoOn = on;
  }

  function releaseFx(model) {
    const f = model.fx;
    if (!f) return;
    for (const m of f.meshes) {
      for (const x of [...m.solid, ...m.holo]) { palMats.delete(x); x.dispose(); }
      for (const x of m.orig) x.dispose();
      m.o.material = null;
    }
    for (const g of f.dust || []) { g.removeFromParent(); g.geometry.dispose(); }
    model.fx = null;
  }

  // A built-in, made on first use. A scan comes back null until its file
  // has landed.
  function builtin(name) {
    if (builtins.has(name)) return builtins.get(name);
    if (SCANS.includes(name)) {
      const st = scanState.get(name);
      if (!st || (st.failed && clock - st.at > SCAN_RETRY)) {
        scanState.set(name, { at: clock, failed: false });
        loadScan(name)
          .then((root) => { builtins.set(name, finishModel(root, { kind: 'scan', name })); scanState.delete(name); })
          .catch(() => scanState.set(name, { at: clock, failed: true }));
      }
      return null;
    }
    const shape = SHAPES.includes(name) ? name : SHAPES[0];
    if (!builtins.has(shape)) builtins.set(shape, finishModel(buildShape(shape), { kind: 'shape', name: shape }));
    return builtins.get(shape);
  }

  function show(keyName) {
    let next = keyName === 'dropped' && dropped ? dropped
      : builtin(keyName === 'dropped' || !BUILTINS.includes(keyName) ? SHAPES[0] : keyName);
    if (!next) {
      // A scan on its way: what shows stays, and update() asks again next
      // frame. With nothing on the turntable yet, the knot fills in.
      if (shown) return;
      next = builtin(SHAPES[0]);
      keyName = SHAPES[0];
    }
    if (next === shown) { shownKey = keyName; return; }
    if (shown) turntable.remove(shown.holder);
    shown = next;
    shownKey = keyName;
    prepare(shown);
    turntable.add(shown.holder);
    curMode = -1; // re-apply the mode to the new model
  }

  // ---------------------------------------------------------------- motion state

  let clock = 0;
  let curMode = -1;
  let yaw = emblem ? 0 : 0.6;
  let camTilt = 0;
  let lastHit = -1e9;
  let hits = 0;
  let scanY = -3, scanOn = false, scanBase = 0;
  let tumble = 0, sliceDrift = 0;
  let voxRes = 0, voxKeep = -1, voxModel = null, voxAt = -1, voxCount = 0, voxBuilds = 0;
  // The mouse: a held drag changes yaw and pitch; release holds the pose.
  let pitchDrag = 0;
  let lastNdc = null;
  // The angle on the wire (PROTOCOL.md `mdlyaw`, `mdlpitch`). The window
  // whose own mouse turns the model sends it; every other window glides to
  // it over ANGLE_GLIDE s, so a drag in the app turns the Output window
  // and its Spout or Syphon feed the same way, and a window that opens
  // later takes it. angleOut is set when a local gesture moved the
  // angle and main.js has not sent it yet.
  const ANGLE_GLIDE = 0.06;
  let wireYaw = null, wirePitch = null;
  let angleOut = false;
  let lastUpdateAt = -1e9;
  const wrapAngle = (a) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));
  let lastRenderMs = 0;
  const bufSize = new THREE.Vector2();

  function accent(s) {
    if (!s || !(s.onKick > HIT) || clock - lastHit <= REST) return false;
    lastHit = clock;
    hits++;
    return true;
  }

  // ---------------------------------------------------------------- the scene

  // Everything but the literal metadata (name, params, modes, labels),
  // which lives in the scene file so the site's hero build can read it
  // without running the scene (site/scripts/stage-hero-scenes.mjs).
  const members = {
    scene,
    camera,

    shapes: SHAPES,
    scans: SCANS,
    // The model list the panel offers: the built-ins, then the dropped
    // model when there is one.
    models() {
      return dropped ? [...BUILTINS, 'dropped'] : [...BUILTINS];
    },
    // The pick on the wire (PROTOCOL.md `mdl`): each model's fixed id, so
    // a number means the same model in every window and every version,
    // and the dropped model's means it whether or not the file has
    // landed yet.
    modelIndex(name) {
      return Math.max(0, WIRE_IDS.indexOf(name)) + 1;
    },
    modelAt(v) {
      const i = Math.round(Number(v)) - 1;
      if (!Number.isFinite(i)) return null;
      return WIRE_IDS[i] || null;
    },
    droppedName() { return dropped ? (dropped.name || 'your model') : null; },
    hasDropped() { return !!dropped; },
    // A dropped model replaces the last one (freed; the built-ins stay
    // cached). select switches the pick to it, which a drop does and an
    // adoption from another window leaves to the pick on the wire.
    setDropped(model, select = true) {
      const old = dropped;
      dropped = model;
      if (shown === old) shown = null;
      if (old) {
        if (old.holder.parent) old.holder.parent.remove(old.holder);
        releaseFx(old);
        old.dispose();
      }
      if (select) this.params.model = 'dropped';
      show(this.params.model);
    },
    clearDropped() {
      if (!dropped) return false;
      const old = dropped;
      dropped = null;
      if (shown === old) shown = null;
      if (old.holder.parent) old.holder.parent.remove(old.holder);
      releaseFx(old);
      old.dispose();
      if (this.params.model === 'dropped') this.params.model = SHAPES[0];
      show(this.params.model);
      return true;
    },
    droppedModel() { return dropped; },
    // The emblem's copy: its turn is the emblem's spin angle, its tilt
    // the one the emblem was grabbed to.
    setTurn(v, p = 0) { yaw = v; pitchDrag = p; },
    // The dragged angle on the wire (PROTOCOL.md `mdlyaw`, `mdlpitch`).
    // takeAngle hands main.js the angle a local gesture moved, once per
    // change: yaw wrapped to -pi..pi, pitch the dragged tilt.
    takeAngle() {
      if (!angleOut) return null;
      angleOut = false;
      return { yaw: wrapAngle(yaw), pitch: pitchDrag };
    },
    // Another window's angle, one axis at a time. A window showing the
    // scene glides to it; a joining window (snap) or one where the scene
    // is not running takes it at once.
    setAngle(axis, v, snap = false) {
      if (!Number.isFinite(v)) return;
      const at = snap || performance.now() - lastUpdateAt > 250;
      if (axis === 'yaw') {
        if (at) { yaw = v; wireYaw = null; } else wireYaw = v;
      } else if (axis === 'pitch') {
        const p = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, v));
        if (at) { pitchDrag = p; wirePitch = null; } else wirePitch = p;
      }
    },

    update(s, dt, t) {
      const P = this.params;
      if (!shown || P.model !== shownKey) show(P.model);
      const r = ctxRenderer();
      const t0 = performance.now();
      clock += dt;
      const spF = drastic(P.speed);
      const mode = MODE_IDX[P.mode] ?? 0;
      if (mode !== curMode) enterMode(mode);
      fx.uFxMode.value = mode;
      fx.uFxT.value += dt * spF;
      if (r) refreshRoom(r, clock);

      // Palette light, every frame, so a morph glides.
      sky.color.copy(PAL.glow);
      sky.groundColor.copy(PAL.shadow);
      rim.color.copy(PAL.accent);
      backdropU.uIn.value.copy(PAL.shadow).lerp(PAL.bg, 0.35).multiplyScalar(mode === 3 ? 0.25 : 0.5);
      backdropU.uOut.value.copy(PAL.bg).multiplyScalar(0.3);
      for (const m of palMats) {
        if (m.userData.lfxPal) m.color.copy(WHITE).lerp(PAL[m.userData.lfxPal.slot], m.userData.lfxPal.mix);
        if (m.userData.lfxGlow) m.emissive.copy(PAL[m.userData.lfxGlow.slot]).multiplyScalar(m.userData.lfxGlow.gain);
      }
      for (const m of (shown.tinted || [])) m.color.copy(PAL.glow);
      // Quiet passages sit dim and drops open up, like every scene.
      const gain = 0.55 + 0.75 * s.energy;
      fx.uLightGain.value = gain;
      key.intensity = KEY_GAIN * gain;
      rim.intensity = RIM_GAIN * gain;
      sky.intensity = SKY_GAIN * gain;
      scene.environmentIntensity = ENV_GAIN * gain;
      fx.uContrast.value = P.contrast;

      // Turntable, the mouse and the camera.
      const hit = accent(s);
      const ptr = scenePointer;
      // Only this window's own mouse turns the model here. A drag relayed
      // from another window arrives as that window's angle instead, which
      // counts it once and holds exactly where the drag stopped.
      const held = !emblem && !!(ptr.held && ptr.ndc && !ptr.detached && !ptr.remote);
      if (held) {
        if (lastNdc) {
          const dx = ptr.ndc.x - lastNdc.x, dy = ptr.ndc.y - lastNdc.y;
          if (dx || dy) {
            yaw += dx * DRAG_YAW;
            pitchDrag -= dy * DRAG_PITCH;
            angleOut = true;
            wireYaw = wirePitch = null; // a local drag takes over from the wire
          }
        }
        lastNdc = { x: ptr.ndc.x, y: ptr.ndc.y };
      } else lastNdc = null;
      if (!emblem && ptr.detached && pitchDrag !== 0) {
        // Shift+Space is an explicit reset; normal release never moves the model.
        pitchDrag *= Math.exp(-dt / 0.45);
        if (Math.abs(pitchDrag) < 1e-4) pitchDrag = 0;
        angleOut = true;
        wirePitch = null;
      }
      if (wireYaw !== null || wirePitch !== null) {
        // Another window's angle: glide to it, then hold it exactly.
        const k = 1 - Math.exp(-dt / ANGLE_GLIDE);
        if (wireYaw !== null) {
          const d = wrapAngle(wireYaw - yaw);
          if (Math.abs(d) < 1e-4) { yaw += d; wireYaw = null; } else yaw += d * k;
        }
        if (wirePitch !== null) {
          const d = wirePitch - pitchDrag;
          if (Math.abs(d) < 1e-4) { pitchDrag = wirePitch; wirePitch = null; } else pitchDrag += d * k;
        }
      }
      pitchDrag = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, pitchDrag));
      lastUpdateAt = performance.now();
      const rest = REST_PITCH[shownKey] ?? PITCH_DEFAULT;
      turntable.rotation.set(rest + pitchDrag, yaw, 0);
      turntable.position.y = Math.sin(t * 0.55) * 0.03 * (0.4 + s.sub);
      turntable.scale.setScalar(1 + 0.03 * s.sub);
      const tiltGoal = (P.tilt - 0.5) * 2 * 0.85;
      camTilt += (tiltGoal - camTilt) * (1 - Math.exp(-dt / 0.2));
      const frame = FRAME_LO + (FRAME_HI - FRAME_LO) * P.fill;
      const fit = Math.min(1, camera.aspect);
      const dist = 1 / (frame * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * fit);
      camera.position.set(0, Math.sin(camTilt) * dist, Math.cos(camTilt) * dist);
      camera.lookAt(0, 0, 0);
      camera.near = Math.max(0.05, dist - 4);
      camera.far = dist + 6;
      camera.updateProjectionMatrix();

      // Per mode.
      if (mode === 0) {
        fx.uChrome.value = P.shape;
        fx.uMelt.value = P.complexity * P.complexity * (0.05 + 0.1 * s.sub) * 1.6;
      } else if (mode === 1) {
        // The shards hang where spread puts them and tumble slowly; a kick
        // nudges them out a little.
        tumble += dt * TUMBLE * spF;
        // Curved, so the lower half of the slider is the cracking open and
        // the upper half the cloud.
        // The emblem's amount 0 means whole: no floor and no kick there.
        // The scene keeps its cracks at spread 0 (SPREAD_LO).
        const lo = emblem ? 0 : SPREAD_LO;
        fx.uExplode.value = lo + (SPREAD_HI - lo) * Math.pow(P.shape, 1.6) + 0.03 * s.kick * (emblem ? Math.min(1, P.shape * 4) : 1);
        fx.uShardDist.value = 1.3;
        fx.uTumble.value = tumble;
        fx.uFine.value = P.complexity;
      } else if (mode === 2) {
        dustU.uT.value += dt * spF;
        dustU.uDrift.value = 0.05 + 0.9 * P.shape + 0.25 * s.mids;
        // A kick lifts the grains a hair off the surface.
        dustU.uBurst.value = 0.05 * s.kick * (0.8 + 0.6 * P.shape);
        dustU.uFlowScale.value = 0.8 + 3.5 * P.complexity;
        dustU.uHighs.value = s.highs;
        // Grain size in model units, projected: fewer grains draw larger so
        // the shape stays closed. The emblem draws into its own fixed
        // target, so it projects against that height, never the canvas:
        // a take supersamples the canvas and blew the emblem's grains up
        // to several times their size (Alec, 2026-10-25).
        if (pxHeight) {
          dustU.uPx.value = pxHeight / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
        } else if (r) {
          r.getDrawingBufferSize(bufSize);
          dustU.uPx.value = bufSize.y / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
        }
        dustU.uSize.value = DUST_SIZE * (1.35 - 0.6 * P.density);
        // Light per grain: fewer grains each carry more, so the cloud's
        // total stays about the same across the grains slider.
        dustU.uGrain.value = DUST_GAIN * (1.6 - 1.1 * P.density);
        const share = (DUST_MIN + (DUST_MAX - DUST_MIN) * P.density) / DUST_MAX;
        for (const g of shown.fx.dust || []) g.geometry.setDrawRange(0, Math.round(g.userData.lfxGrains * share));
      } else if (mode === 3) {
        // The scan idles slowly on its own and an accent sends a fast one.
        if (hit) { scanOn = true; scanY = -1.2; }
        if (scanOn) { scanY += dt * 2.4; if (scanY > 1.3) scanOn = false; }
        else { scanBase += dt * (0.15 + 0.6 * P.shape) * spF; scanY = ((scanBase % 2.6) + 2.6) % 2.6 - 1.3; }
        fx.uScanY.value = scanY;
        fx.uWire.value = 0.6 + 2.4 * P.complexity;
        fx.uGlass.value = 0.02 + 0.35 * P.density;
        fx.uHoloGain.value = HOLO_GAIN;
      } else if (mode === 4) {
        sliceDrift += dt * SLICE_DRIFT * spF;
        fx.uSliceDrift.value = sliceDrift;
        fx.uSliceN.value = Math.round(4 + 22 * P.complexity);
        fx.uSliceGap.value = 0.12 * P.density * (0.8 + 0.4 * s.sub);
        fx.uSliceTwist.value = (0.45 + 1.8 * P.shape) * (0.85 + 0.3 * s.mids);
      }
      if (shown.mixer) shown.mixer.update(dt * spF);
      if (mode === 5) {
        // A kick nudges the cubes out a little.
        voxU.uPop.value = 0.04 * s.kick;
        const res = Math.round(VOX_LO + (VOX_HI - VOX_LO) * P.complexity);
        const keep = 0.25 + 0.75 * P.density;
        const cell = 2 / res;
        voxU.uCube.value = cell * (1 - 0.72 * P.shape);
        const animated = !!shown.mixer;
        const due = animated && (voxAt < 0 || clock - voxAt >= 1 / (VOX_RATE * Math.min(2.5, Math.max(0.4, spF))));
        if (voxModel !== shown || res !== voxRes || Math.abs(keep - voxKeep) > 1e-3 || due) {
          voxCount = buildVoxels(voxelPoints(shown, animated), res, keep);
          voxModel = shown; voxRes = res; voxKeep = keep; voxAt = clock; voxBuilds++;
        }
      }
      lastRenderMs = performance.now() - t0;
    },

    resize(w, h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      backdropU.uAspect.value = w / h;
    },

    // QA: what is on the turntable and how the effects are running.
    stats() {
      if (!shown) return null;
      const st = shown.stats || {};
      return {
        model: shownKey, name: shown.name, kind: shown.kind, tris: st.tris, points: st.points,
        meshes: st.meshes, clip: shown.clip, noFace: shown.fx ? shown.fx.noFace : null,
        dust: shown.fx && shown.fx.dust ? shown.fx.dust.reduce((n, g) => n + Math.min(g.geometry.drawRange.count, g.userData.lfxGrains), 0) : 0,
        dustSkinned: shown.fx && shown.fx.dust ? shown.fx.dust.filter((g) => g.isSkinnedMesh).length : 0,
        voxels: voxMesh.visible ? voxCount : 0, voxBuilds,
        mode: MODES[curMode], hits, scanY, envBuilds, lastRenderMs,
        melt: fx.uMelt.value, explode: fx.uExplode.value, burst: dustU.uBurst.value, pop: voxU.uPop.value, tumble, sliceDrift,
        yaw, pitch: pitchDrag, lean: [aim.rotation.y, aim.rotation.x],
        turntable: [turntable.rotation.x, turntable.rotation.y],
        dropped: dropped ? dropped.name : null, builtinsCached: [...builtins.keys()],
        scansLoading: [...scanState.entries()].filter(([, v]) => !v.failed).map(([k]) => k),
      };
    },
    // QA: the frame drawn twice, with and without the model, into a small
    // target; the pixels that differ are the model. Coverage, bounding box
    // (0..1, y up) and mean luma of the model and of the frame.
    qaRead(renderer, w = 480, h = 270) {
      if (!shown || !renderer) return null;
      const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType });
      const a = new Uint8Array(w * h * 4), b = new Uint8Array(w * h * 4);
      const prev = renderer.getRenderTarget();
      const aspect = camera.aspect;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const draw = (out) => { renderer.setRenderTarget(rt); renderer.render(scene, camera); renderer.readRenderTargetPixels(rt, 0, 0, w, h, out); };
      draw(a);
      const vis = [shown.holder.visible, voxMesh.visible];
      shown.holder.visible = false;
      voxMesh.visible = false;
      draw(b);
      shown.holder.visible = vis[0];
      voxMesh.visible = vis[1];
      renderer.setRenderTarget(prev);
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      rt.dispose();
      let n = 0, lum = 0, fl = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const l = (0.2126 * a[i] + 0.7152 * a[i + 1] + 0.0722 * a[i + 2]) / 255;
        fl += l;
        if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 9) {
          n++; lum += l;
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
      return { coverage: n / (w * h), modelLum: n ? lum / n : 0, frameLum: fl / (w * h),
        bbox: n ? [x0 / w, y0 / h, (x1 + 1) / w, (y1 + 1) / h] : null };
    },
  };

  // The composer owns the renderer; scenes reach it through the shared
  // context (lib/context.js), the melt simulation's idiom.
  function ctxRenderer() { return ctx.renderer; }

  // Show the model's own surfaces, or hide them behind its dust or its
  // voxels. Hiding goes through the materials (material.visible), since
  // the grains are the meshes' own children and a hidden mesh would hide
  // them too.
  function setSurfaces(model, on) {
    for (const m of model.fx.meshes) {
      for (const x of [...m.solid, ...m.holo]) x.visible = on;
    }
  }

  function enterMode(mode) {
    curMode = mode;
    if (!shown) return;
    const f = prepare(shown);
    setHolo(shown, mode === 3);
    // A scan that is already points (a PLY cloud) is its own dust.
    const pointsOnly = !f.meshes.length;
    if (mode === 2 && !pointsOnly && !f.dust) f.dust = sampleDust(shown, DUST_MAX);
    for (const g of f.dust || []) g.visible = mode === 2;
    setSurfaces(shown, !(mode === 2 && !pointsOnly) && mode !== 5);
    voxMesh.visible = mode === 5;
    if (mode === 5) { voxModel = null; voxAt = -1; }
    shown.holder.traverse((o) => { if (o.isPoints && !o.userData.lfxGrains) o.visible = mode !== 5; });
    fx.uExplode.value = 0;
    fx.uMelt.value = 0;
    fx.uChrome.value = 0;
  }

  return Object.assign(target, members);
}
