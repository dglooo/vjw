// Copied from donor/vs3/visual_kit/src/scenes/descent.js (the friends' engine, used with permission, 2026-11-19).
// vjw: wrapped in a factory (one scene object per layer); nothing else changed. agents/guides/guide_vs3_port.md
// Descent: a scale-periodic Menger blow-up, viewed toward its fixed corner.
// The sponge surrounds a trihedral room. Its ternary construction
// is identical at scales 3^k for every integer k, including negative k.
// A bounded logarithmic phase supplies the inward journey. No target search,
// finite-depth turnaround, or accumulated tiny world coordinates are used.
import * as THREE from 'three';
import { PAL } from '../lib/common.js';
import { advanceDescent } from '../lib/descent-motion.js';
export default function create() { // vjw

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const motion = { phase: 0, turns: 0, distance: 0, velocity: 0, pulse: 0 };
let carve = 0.5;
let framing = 0.5;
let complexity = 0.5;
let tilt = 0.5;
let multicolor = 1;
let energy = 0.5;
let age = 0, lastAccent = -1e9, accentCount = 0, carveOffset = 0;
const uniforms = {
  uAspect: { value: 1 }, uPhase: { value: 0 },
  uCarve: { value: 0.5 }, uFraming: { value: 0.5 },
  uComplexity: { value: 0.5 },
  uTilt: { value: 0.5 }, uMulticolor: { value: 1 },
  uEnergy: { value: 0.5 }, uHighs: { value: 0 },
  uResolution: { value: 720 },
  uBg: { value: PAL.bg }, uShadow: { value: PAL.shadow },
  uMid: { value: PAL.mid }, uAccent: { value: PAL.accent },
  uGlow: { value: PAL.glow },
};

const material = new THREE.ShaderMaterial({
  uniforms, depthWrite: false, depthTest: false,
  vertexShader: `varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    precision highp float;
    varying vec2 vUv;
    uniform float uAspect, uPhase, uCarve, uFraming, uEnergy, uHighs, uResolution;
    uniform float uComplexity, uTilt, uMulticolor;
    uniform vec3 uBg, uShadow, uMid, uAccent, uGlow;
    const float LN3 = 1.0986122886681098;

    float square(vec2 p, float h, float bevel) {
      vec2 q = abs(p) - h + bevel;
      return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - bevel;
    }
    float roundCut(float a, float b, float k) {
      float h = clamp(0.5 + 0.5 * (a - b) / k, 0.0, 1.0);
      return mix(b, a, h) + k * h * (1.0 - h);
    }

    vec3 chamberPigment(float cell) {
      // Adjacent recursion scales use different palette materials. Physical
      // cell size stays continuous when the bounded zoom phase wraps.
      float band = mod(log(cell) / LN3 + 0.35, 3.0);
      float blend = smoothstep(0.15, 0.85, fract(band));
      if (band < 1.0) return mix(vec3(0, 1, 0), vec3(0, 0, 1), blend);
      if (band < 2.0) return mix(vec3(0, 0, 1), vec3(1, 0, 0), blend);
      return mix(vec3(1, 0, 0), vec3(0, 1, 0), blend);
    }
    vec3 pigment(vec3 color) {
      // Give every material enough light to read without letting the pale
      // glow slot overpower the midtone and accent slots.
      float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));
      float peak = max(color.r, max(color.g, color.b));
      return color * min(4.0, min(0.15 / max(lum, 0.006), 0.45 / max(peak, 0.006)));
    }

    float map(vec3 p, float footprint, bool marching, bool paint, out vec4 trap) {
      // The union of three half-spaces surrounds the camera's empty octant.
      // This makes an interior with a safe approach to the common corner.
      float d = min(-p.x, min(-p.y, -p.z));
      trap = vec4(1.0, 0.0, 0.0, 0.0);
      if (paint) {
        // The three enclosing faces have distinct materials. Blend only
        // around their common corners, then let carved chambers take over.
        vec3 faces = exp(-max(-p - vec3(d), 0.0) / 0.06);
        faces /= max(dot(faces, vec3(1.0)), 0.00001);
        trap.xyz = vec3(0.80, 0.12, 0.08) * faces.x +
          vec3(0.08, 0.80, 0.12) * faces.y + vec3(0.12, 0.08, 0.80) * faces.z;
      }
      // Subtracting holes can only move material farther away. In empty
      // space the current conservative bound is enough to advance the ray.
      // Normals and occlusion use the complete field near the surface.
      if (marching && d > footprint * 4.0) return d;
      float reach = max(max(abs(p.x), abs(p.y)), max(abs(p.z), 0.00001));
      // Start at a cell larger than the point. All omitted ancestors have
      // ternary digit zero and cannot carve it. Adjacent phase representations
      // select the same physical cells on either side of the scale wrap.
      float cell = exp(uPhase + LN3 * ceil((log(reach * 3.0) - uPhase) / LN3));
      float cut = mix(0.105, 0.265, uCarve);
      // Sweep from broad chambers down to the current pixel footprint.
      // This keeps the whole knob useful at every render resolution.
      float detail = footprint * pow(max(1.0, 0.045 / footprint), 1.0 - uComplexity);
      for (int i = 0; i < 13; i++) {
        vec3 q = mod(abs(p), cell) / cell - 0.5;
        float visible = smoothstep(detail * 2.0, detail * 6.0, cell * cut);
        // Grow each new cavity from zero width. Translating a full-sized
        // cut through the wall makes most of the control feel unresponsive.
        if (visible <= 0.0) break;
        float width = cut * visible;
        float bevel = width * 0.12;
        float hole = min(square(q.xy, width, bevel),
          min(square(q.yz, width, bevel), square(q.zx, width, bevel))) * cell;
        float carving = -hole;
        float rounding = cell * 0.018 * visible + 0.000001;
        if (paint) {
          float layer = clamp(0.5 + 0.5 * (carving - d) / rounding, 0.0, 1.0);
          trap.xyz = mix(trap.xyz, chamberPigment(cell), layer);
          if (carving > d) trap.w = 1.0;
        }
        d = roundCut(d, carving, rounding);
        if (marching && d > footprint * 4.0) return d;
        cell /= 3.0;
        if (cell < footprint * 0.7) break;
      }
      return d;
    }
    float mapD(vec3 p, float eps) { vec4 tr; return map(p, eps, false, false, tr); }

    float keyShadow(vec3 p, vec3 normal, vec3 light, float eps) {
      float visibility = 1.0;
      float travel = max(0.012, eps * 6.0);
      vec3 start = p + normal * eps * 4.0;
      for (int i = 0; i < 8; i++) {
        float d = mapD(start + light * travel, eps);
        visibility = min(visibility, 8.0 * max(d, 0.0) / travel);
        if (d < eps || travel > 1.2) break;
        travel += clamp(d, 0.018, 0.3);
      }
      return clamp(visibility, 0.0, 1.0);
    }

    void main() {
      vec2 uv = (vUv - 0.5) * 2.0 * vec2(uAspect, 1.0);
      // Crane around the corner while staying inside the empty octant.
      // The centered control preserves the original camera exactly.
      float pitch = atan(0.82, length(vec2(1.0, 1.17))) + (uTilt - 0.5) * 0.86;
      vec2 horizontal = normalize(vec2(1.0, 1.17)) * cos(pitch);
      vec3 ro = -vec3(horizontal.x, sin(pitch), horizontal.y) * 3.2;
      vec3 fw = normalize(-ro);
      vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
      vec3 up = cross(rt, fw);
      float lens = mix(0.85, 2.1, uFraming);
      vec3 rd = normalize(fw * lens + rt * uv.x + up * uv.y);
      float t = 0.01;
      float steps = 0.0;
      vec4 trap;
      bool hit = false;
      float eps = 0.001;
      for (int i = 0; i < 112; i++) {
        eps = max(0.00025, t / (uResolution * lens) * 0.6);
        float d = map(ro + rd * t, eps, true, false, trap);
        if (d < eps) { hit = true; break; }
        t += d * 0.82;
        steps += 1.0;
        if (t > 48.0) break;
      }
      vec3 bg = uBg * 0.7;
      vec3 col = bg;
      if (hit) {
        vec3 pos = ro + rd * t;
        map(pos, eps, false, true, trap);
        float h = eps * 1.5;
        vec2 e = vec2(1.0, -1.0) * 0.57735027 * h;
        vec3 normal = normalize(e.xyy * mapD(pos + e.xyy, eps) +
          e.yyx * mapD(pos + e.yyx, eps) + e.yxy * mapD(pos + e.yxy, eps) +
          e.xxx * mapD(pos + e.xxx, eps));
        float ao = clamp(mapD(pos + normal * 0.045 * t, eps) / (0.045 * t), 0.0, 1.0);
        float ao2 = clamp(mapD(pos + normal * 0.12 * t, eps) / (0.12 * t), 0.0, 1.0);
        ao = mix(0.12, 1.0, pow(ao * ao2, 0.65));
        vec3 light = normalize(vec3(-0.9, -0.3, -0.55));
        float dif = max(dot(normal, light), 0.0);
        float shadow = keyShadow(pos, normal, light, eps);
        float head = max(dot(normal, -rd), 0.0);
        float rim = pow(1.0 - head, 3.5);
        float spec = pow(max(dot(reflect(-light, normal), -rd), 0.0), 36.0);
        // A side light casts shadows inside the cavities. Broad midtones
        // and a soft camera fill preserve the brighter material.
        vec3 mid = pigment(uMid);
        vec3 accent = pigment(uAccent);
        vec3 glow = pigment(uGlow);
        vec3 tonal = mix(uMid * 0.55, uAccent * 0.32, 0.15 + 0.35 * trap.w);
        vec3 base = mix(tonal, mid * trap.x + accent * trap.y + glow * trap.z, uMulticolor);
        col = base * (0.18 + 0.17 * head) * ao;
        col += base * dif * mix(0.12, 1.0, shadow) * sqrt(ao) * 1.5;
        col += uGlow * head * ao * 0.018;
        // Edges catch a neighboring material's color. Recesses retain a
        // little of the palette's shadow hue under the directional light.
        vec3 edge = mix(uAccent * 0.55,
          (accent * trap.x + glow * trap.y + mid * trap.z) * 0.9, uMulticolor);
        col += edge * rim * ao * (1.0 + shadow);
        col += uGlow * spec * shadow * ao * (0.6 + 0.25 * uHighs);
        // Grazing cavity edges carry light. A wider sample finds recesses
        // behind the current face and leaves the broad walls quiet.
        float cavity = (1.0 - ao) * head;
        col += mix(uAccent * 0.04, pigment(uShadow) * 0.08, uMulticolor) * cavity;
        col = mix(col, bg, smoothstep(14.0, 48.0, t));
      }
      col *= 0.3 + 0.9 * uEnergy;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
});
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

return { // vjw: was `export default {`
  name: 'descent', scene, camera, trails: false, pixelBudget: 1.2, edgeAA: true,
  bloom: { strength: 0.18, gain: 0.22 },
  modes: ['multicolor', 'tonal'],
  params: { mode: 'multicolor', speed: 0.5, shape: 0.5, complexity: 0.5, fill: 0.5, tilt: 0.5 },
  paramLabels: { '*': { shape: 'carve', fill: 'zoom' } },
  update(s, dt) {
    if (!(dt > 0)) return;
    const h = Math.min(dt, 0.05);
    age += h;
    advanceDescent(motion, h, this.params.speed, s.onKick);
    // Phrase accents open and close the cavities. The destination, framing,
    // and scale phase are independent of this structural response.
    if (s.onKick > 0.55 && age - lastAccent > 3.2) {
      lastAccent = age;
      carveOffset = (++accentCount % 2 ? 1 : -1) * 0.065 * s.onKick;
    }
    const target = Math.max(0, Math.min(1, this.params.shape + carveOffset));
    carve += (target - carve) * (1 - Math.exp(-h * 2.5));
    framing += (this.params.fill - framing) * (1 - Math.exp(-h * 4));
    complexity += (this.params.complexity - complexity) * (1 - Math.exp(-h * 3));
    tilt += (this.params.tilt - tilt) * (1 - Math.exp(-h * 5));
    multicolor += ((this.params.mode === 'tonal' ? 0 : 1) - multicolor) * (1 - Math.exp(-h * 6));
    energy += (s.energy - energy) * (1 - Math.exp(-h * 2));
    uniforms.uPhase.value = motion.phase;
    uniforms.uCarve.value = carve;
    uniforms.uFraming.value = framing;
    uniforms.uComplexity.value = complexity;
    uniforms.uTilt.value = tilt;
    uniforms.uMulticolor.value = multicolor;
    uniforms.uEnergy.value = energy;
    uniforms.uHighs.value = s.highs;
  },
  resize(w, h) {
    uniforms.uAspect.value = Math.max(1, w) / Math.max(1, h);
    uniforms.uResolution.value = Math.max(180, h);
  },
  debug() { return { ...motion, carve, framing, complexity, tilt, multicolor, energy, accentCount, carveOffset }; },
};
} // vjw: the factory
