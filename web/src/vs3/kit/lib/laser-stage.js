// Copied from donor/vs3/visual_kit/src/lib/laser-stage.js (the friends' engine, used with permission, 2026-11-19).
// vjw: the plants load from our static copy /vs3/lasers/ (web/public/vs3/). The LED wall draws no other scene: ctx.scenes
// stays empty (lib/context.js) and the screen param stays at its default, off.
// The laser rig in a venue, seen from the sound booth. laser-rig.js decides
// where every ray goes; this view draws the room, the crowd, the lit haze,
// the beams, the scanned sheets and where the light hits.
import * as THREE from 'three';
import { PAL } from './common.js';
import { ctx } from './context.js';
import {
  LaserRig, LASER_DEFAULTS, LASER_KEYS, LASER_PROJECTORS, LASER_ROOM, LASER_MAX_BEAMS,
  laserMotionRate, laserPatternName, laserFormName, laserProjectorPower, laserBeamCount,
  laserColorsAt, laserColorsName, LASER_COLORS as LASER_COLORS_LIST, laserChaseName, LASER_MOVES,
} from './laser-rig.js';

const TAU = Math.PI * 2;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
// Screen grid of light the haze scatters, rebuilt on the CPU each frame.
const GW = 64, GH = 36;
// Taste knobs, in one place.
const TASTE = {
  spring: 14,        // slider follow rate, rad/s (critically damped)
  patternJump: 0.15, // a pattern move larger than this morphs directly
  patternMorph: 0.45, // seconds for a direct pattern morph
  glowGain: 0.2,     // lit haze around and behind the beams
  ambient: 0.025,    // room light per unit of laser power
  surfaceGain: 0.13,  // scanned sheet brightness
  traceGain: 0.5,    // sheet lines on walls and ceiling
  hitGain: 1.6,      // beam spots on walls and ceiling
  bounce: 0.07,      // crowd bounce on the kick, metres
  flare: 10,         // aperture flare when a beam aims at the booth
  air: 0.0035,       // even haze scatter per unit of laser power
  wall: 1.3,         // LED wall brightness at the middle of its slider
  screenGlow: 0.35,  // how much the LED wall lights the haze
  screenLight: 0.9,  // how much it lights the stage in front of it
  strip: 0.55,       // LED strips on the stage lip and DJ booth
  ringKick: 1.2,     // how hard a kick pushes the wall's rings outward
  colorWalk: 0.11,   // hue step between projector pairs in a multicolor stop
  colorsFade: 0.4,   // seconds to cross between two colors stops
  edge: 4,           // LED edge light brightness at the middle of its slider
  wallLogo: 2.2,     // the emblem's size on the wall, times its size on the frame
  edgeGlow: 2,       // how much the edge lights light the haze around them
  chaseKick: 0.18,   // kick onset that steps the chase
  chaseRest: 0.2,    // shortest gap between two chase steps, seconds
  chaseQuiet: 2.0,   // with no kick for this long, the chase steps on its own…
  chaseIdle: 0.5,    // …this often, until the next kick
  chaseGlide: 0.06,  // seconds a step takes to land
  chaseFade: 0.3,    // seconds to cross between two chase stops
  pump: 0.55,        // how far the music lifts beam brightness (0 holds it)
  moveQuiet: 0.55,   // auto movement's pace in silence, times the speed slider
  moveDrive: 0.9,    // how much the track's energy adds to that pace
  movePush: 0.45,    // cycles per second a full kick adds, fading in moveSettle
  moveSettle: 0.14,  // seconds a kick's push takes to fade
  moveRest: 15,      // seconds each move plays (about 8 bars at 128 BPM)
  kickTurn: 0.02,    // with auto movement up, how far one kick turns the pattern (cycles)
  kickTurnGlide: 0.09, // seconds the turn takes to land
  breakKeep: 0.3,    // share of beams lit in a breakdown
  breakLow: 0.18,    // section energy below this is a breakdown…
  breakHigh: 0.42,   // …and above this the full rig
  sectionFall: 3.5,  // seconds the section level takes to fall (a breakdown builds slowly)
  sectionRise: 0.25, // seconds it takes to rise (a drop hits at once)
  moveFade: 1.6,     // seconds to cross from one move to the next
};

// Multicolor stops: cyclic gradients a beam samples by its place across
// its fan. Laser sources are pure, so these run fully saturated.
const hex = (h) => new THREE.Color(h);
const GRADIENTS = {
  sunset: [hex('#ff1e00'), hex('#ff7a00'), hex('#ff0f70'), hex('#8a18ff')],
  ice: [hex('#e8fbff'), hex('#36e6ff'), hex('#1a6dff'), hex('#5b3dff')],
  toxic: [hex('#c8ff00'), hex('#1eff4a'), hex('#00ffc8'), hex('#f0ff3a')],
};
const RGB = [hex('#ff0000'), hex('#00ff20'), hex('#0038ff')];
const fract = (x) => x - Math.floor(x);
function sampleCycle(stops, t, out) {
  const s = fract(t) * stops.length, i = Math.floor(s), f = s - i;
  return out.copy(stops[i % stops.length]).lerp(stops[(i + 1) % stops.length], f * f * (3 - 2 * f));
}

// Baked haze clouds: two octaves of value noise on a lattice that wraps,
// so the volume tiles. period: lattice cells across the volume.
const HAZE_TEX = Object.freeze({ size: 64, sizeY: 32, period: 8, periodY: 4 });
// Additive light, finite and bounded: many beams stack in one pixel, and
// a half-float buffer turns an overflow into Inf, then NaN.
const SAFE_GLSL = /* glsl */`
  vec3 safeLight(vec3 c) {
    if (any(isnan(c)) || any(isinf(c))) return vec3(0.0);
    return clamp(c, 0.0, 48.0);
  }
`;
const HAZE_GLSL = /* glsl */`
  uniform float uHaze, uPhase, uTime;
  uniform vec3 uColor;
  uniform highp sampler3D uHazeTex;
  float hazeAt(vec3 p) {
    // Haze hangs in slow clouds a few metres across and drifts on its own,
    // so a straight beam brightens and thins along its length. It changes
    // how much light scatters, never where the beam goes. The clouds are
    // a tiling noise volume baked once, one lookup per pixel.
    vec3 q = p * vec3(0.16, 0.16, 0.16) / vec3(${HAZE_TEX.period}.0, ${HAZE_TEX.periodY}.0, ${HAZE_TEX.period}.0)
      + vec3(0.05, 0.018, 0.03) * uTime / vec3(${HAZE_TEX.period}.0, ${HAZE_TEX.periodY}.0, ${HAZE_TEX.period}.0);
    return 0.4 + 1.05 * texture(uHazeTex, q).r;
  }
  float scatterAmount() { return 0.035 + pow(uHaze, 1.15) * 1.75; }
  ${SAFE_GLSL}
`;
const GLOW_GLSL = /* glsl */`
  uniform sampler2D uGlow;
  uniform float uGlowScale;
  uniform float uAir, uScreenGlowScale;
  uniform vec3 uScreenColor;
  vec3 airGlow(vec4 clip) {
    vec2 uv = clamp(clip.xy / clip.w * 0.5 + 0.5, 0.0, 1.0);
    vec4 g = texture2D(uGlow, uv);
    // Light around the beams in their own colors, the faint even scatter
    // of the whole rig, and the LED wall's own light in the haze.
    // The even scatter thins toward the floor: the beams fly over the
    // crowd, so the air the crowd stands in stays darker than the air
    // the beams cross.
    float veil = mix(0.2, 1.0, smoothstep(0.08, 0.6, uv.y));
    return g.rgb * g.rgb * uGlowScale + uColor * uAir * veil + uScreenColor * (g.a * g.a * uScreenGlowScale);
  }
`;

function flatHaze() {
  const tex = new THREE.Data3DTexture(new Uint8Array([128]), 1, 1, 1);
  tex.format = THREE.RedFormat; tex.type = THREE.UnsignedByteType; tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}
function hazeVolume() {
  const { size: N, sizeY: NY, period: P, periodY: PY } = HAZE_TEX;
  const lattice = (px, py, pz, seed) => {
    const t = new Float32Array(px * py * pz);
    let s = seed;
    for (let i = 0; i < t.length; i++) { s = (s * 16807) % 2147483647; t[i] = (s - 1) / 2147483646; }
    return (x, y, z) => t[((z % pz + pz) % pz * py + (y % py + py) % py) * px + (x % px + px) % px];
  };
  const smoothT = (f) => f * f * (3 - 2 * f);
  const octave = (px, py, pz, seed) => {
    const at = lattice(px, py, pz, seed);
    return (u, v, w) => {
      const x = u * px, y = v * py, z = w * pz;
      const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
      const fx = smoothT(x - ix), fy = smoothT(y - iy), fz = smoothT(z - iz);
      const l = (a, b, f) => a + (b - a) * f;
      return l(l(l(at(ix, iy, iz), at(ix + 1, iy, iz), fx), l(at(ix, iy + 1, iz), at(ix + 1, iy + 1, iz), fx), fy),
        l(l(at(ix, iy, iz + 1), at(ix + 1, iy, iz + 1), fx), l(at(ix, iy + 1, iz + 1), at(ix + 1, iy + 1, iz + 1), fx), fy), fz);
    };
  };
  const a = octave(P, PY, P, 11), b = octave(P * 2, PY * 2, P * 2, 29);
  const data = new Uint8Array(N * NY * N);
  for (let z = 0; z < N; z++) for (let y = 0; y < NY; y++) for (let x = 0; x < N; x++) {
    data[(z * NY + y) * N + x] = Math.round((a(x / N, y / NY, z / N) * 0.65 + b(x / N, y / NY, z / N) * 0.35) * 255);
  }
  const tex = new THREE.Data3DTexture(data, N, NY, N);
  tex.format = THREE.RedFormat; tex.type = THREE.UnsignedByteType;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

// What the LED wall plays, in screen-slider order: nothing (the wall
// stays dark until you pick something), your logo alone, the wall's own
// visuals in the lasers' colors (WALL_BASICS), or a App scene drawn
// small into a texture each frame with the same audio and palette. A
// loaded logo also sits on top of every other stop. Each scene plays one
// of its factory looks (its own sliders are out of reach from here).
// gain lifts a scene whose raw picture, before App's post chain,
// runs dark on the wall.
export const LASER_SCREENS = Object.freeze(['off', 'logo', 'rings', 'tunnel', 'bars', 'waves', 'grid', 'descent', 'ink', 'gate', 'idol', 'ingot', 'forge', 'spacetime', 'wisp', 'grove', 'visage']);
// The wall's own visuals: their kind number in the wall shader.
const WALL_BASICS = Object.freeze({ off: -1, rings: 0, tunnel: 2, bars: 3, waves: 4, grid: 5, logo: 6 });
const WALL_LOOKS = {
  descent: { look: '★ descent · recursive vault', gain: 1.4 },
  ink: { look: '★ ink \u2014 Glitched Ink', gain: 1.6 },
  gate: { look: '★ gate \u2014 processional', gain: 1.8 },
  idol: { look: '★ idol \u2014 adobe cluster', gain: 1 },
  ingot: { look: '★ ingot \u2014 chromicron', gain: 1.3 },
  forge: { look: '★ forge \u2014 torus box', gain: 1.3 },
  spacetime: { look: '★ spacetime · reverse \u2014 outward color', gain: 1.2 },
  // wisp's particle simulation costs the same at any wall size, so the
  // wall runs it at 30 frames a second.
  wisp: { look: '★ wisp \u2014 ghosts', gain: 1, hz: 30 },
  grove: { look: '★ grove \u2014 fall colors', gain: 0.9 },
  visage: { look: '★ visage \u2014 ghostly presence', gain: 1.2 },
};
export const laserScreenAt = (v) => LASER_SCREENS[Math.round(clamp(Number.isFinite(v) ? v : 0) * (LASER_SCREENS.length - 1))];
// The wall's scene target: 512 wide on a reference-speed GPU, smaller on
// a slower one (App's boot probe), never under 256.
const SCREEN_RT_WIDTH = 512;
const wallWidth = () => {
  const f = clamp(Number(ctx.gpuFactor?.()) || 1, 0.05, 1);
  return Math.max(256, Math.round(SCREEN_RT_WIDTH * Math.sqrt(f) / 16) * 16);
};
const SCREEN_FADE = 0.5; // seconds to cross between two screens

// The LED wall spans the stage behind the truss, x -11.5..11.5, y 2.2..11.4,
// facing the room at z -18.54 (the same 2.5:1 as before, made big the way
// an EDM stage is mostly screen).
// Sized from the booth (the camera never moves; the truss plane is 30.8 m
// away, the wall 37 m, so the goal post scales by 1.2 there): the wall and
// its ring of edge lights sit inside the truss with about 0.7 m of air to
// the towers and the span, and the ring's bottom bar clears the deck and
// the crowd's heads (Alec, 2026-11-08: the ring read as open at the bottom
// and tucked behind the truss).
const SCREEN = Object.freeze({ x: 14.65, y0: 2.33, y1: 10.05, z: -18.54 });

// What the LED wall shows at a point (0..1 across and up), before its
// brightness: the current screen over the one it replaces, crossing on a
// switch. A screen kind is 1 for a scene, 0 for the rings, -1 for off.
const WALL_GLSL = /* glsl */`
  uniform float uScreen, uRing, uEnergy, uScreenMix, uSceneA, uSceneB, uGainA, uGainB;
  uniform vec3 uMid, uDeep;
  uniform sampler2D uScreenTex, uScreenTexB, uWallRun, uLogo;
  uniform vec2 uScreenCrop;
  uniform vec4 uBands0, uBands1;
  uniform float uLogoOn, uLogoAspect, uLogoScale, uLogoAngle, uLogoOpacity, uLogoFlash, uLogoInvert, uLogoOwn;
  uniform vec3 uLogoTint;
  const float WALL_ASPECT = ${(SCREEN.x * 2 / (SCREEN.y1 - SCREEN.y0)).toFixed(3)};
  // A scene's raw picture, cover-fit to the wall, with a soft shoulder.
  vec3 film(sampler2D t, float gain, vec2 uv) {
    vec3 c = texture2D(t, 0.5 + (uv - 0.5) * uScreenCrop).rgb;
    return (1.0 - exp(-c * 2.2 * gain)) * 0.95;
  }
  // The lasers' colors as a run (the colors stop: one color, the palette,
  // a rainbow), so the wall's own visuals match the beams.
  vec3 run(float t) { return texture2D(uWallRun, vec2(clamp(t, 0.0, 1.0), 0.5)).rgb; }
  float band(float x) {
    float b[8] = float[8](uBands0.x, uBands0.y, uBands0.z, uBands0.w, uBands1.x, uBands1.y, uBands1.z, uBands1.w);
    float f = clamp(x, 0.0, 1.0) * 7.0;
    int i = int(min(floor(f), 6.0));
    return mix(b[i], b[i + 1], f - float(i));
  }
  // A thin bright line at distance d (in wall heights), w wide.
  float line(float d, float w) { return exp(-d * d / (w * w)); }
  vec3 rings(vec2 uv) {
    vec2 p = (uv - 0.5) * vec2(WALL_ASPECT, 1.0);
    float r = max(abs(p.x) * 0.5, abs(p.y)), k = r * 3.2 - uRing, f = fract(k);
    float ring = smoothstep(0.0, 0.04, f) * (1.0 - smoothstep(0.06, 0.32, f)) * smoothstep(0.02, 0.12, r);
    return run(fract(floor(k) * 0.13 + 0.5)) * ring * (0.55 + 0.45 * uEnergy);
  }
  // Squares rushing out of the center, each its own color.
  vec3 tunnel(vec2 uv) {
    vec2 p = (uv - 0.5) * vec2(WALL_ASPECT, 1.0);
    float d = max(abs(p.x) / (WALL_ASPECT * 0.5), abs(p.y) / 0.5);
    float k = log(max(d, 0.004)) * 2.6 - uRing * 2.0, f = fract(k);
    float sq = smoothstep(0.0, 0.03, f) * (1.0 - smoothstep(0.05, 0.16, f)) * smoothstep(0.02, 0.2, d);
    return run(fract(floor(k) * 0.17 + 0.3)) * sq * (0.6 + 0.4 * uEnergy);
  }
  // An LED spectrum: the music's bands as segmented bars, low in the
  // middle, high at the sides.
  vec3 bars(vec2 uv) {
    float m = abs(uv.x - 0.5) * 2.0, n = 36.0, bi = (floor(m * n) + 0.5) / n;
    float fx = fract(m * n), h = 0.04 + 0.9 * band(bi);
    float lit = step(0.18, fx) * step(fx, 0.82) * step(uv.y, h) * step(0.22, fract(uv.y * 40.0));
    return run(uv.y) * lit;
  }
  // Six sine lines stacked across the wall, swelling with the energy.
  vec3 waves(vec2 uv) {
    vec3 col = vec3(0.0);
    float x = uv.x * WALL_ASPECT, amp = 0.03 + 0.07 * uEnergy;
    for (int i = 0; i < 6; i++) {
      float fi = float(i), y = 0.16 + fi * 0.136 + amp * sin(x * 2.1 + uRing * 6.2832 + fi * 1.3);
      col += run(fi / 5.0) * line(uv.y - y, 0.007);
    }
    return col;
  }
  // A retro horizon: a perspective grid running toward you under a
  // glowing horizon line.
  vec3 grid(vec2 uv) {
    float h = 0.62, y = h - uv.y;
    vec3 col = run(1.0) * line(y, 0.006) * 1.4;
    if (y > 0.0) {
      // Depth rows scroll toward you; columns fan out from the center.
      float z = 0.3 / y, gz = fract(z + uRing * 2.0);
      float xs = (uv.x - 0.5) * WALL_ASPECT * z * 1.4, gx = fract(xs + 0.5);
      float w = min(fwidth(z) * 1.2, 0.4) + 0.025, wx = min(fwidth(xs) * 1.2, 0.4) + 0.025;
      float g = max(1.0 - smoothstep(0.0, w, min(gz, 1.0 - gz)), 1.0 - smoothstep(0.0, wx, min(gx, 1.0 - gx)));
      col += run(clamp(y / h, 0.0, 1.0)) * g * 1.2 * smoothstep(0.0, 0.05, y);
    }
    return col;
  }
  // The logo (App's emblem), keyed and tinted the way the emblem
  // layer does it: rgb, and its mask in a.
  vec4 logo(vec2 uv) {
    if (uLogoOn < 0.5) return vec4(0.0);
    vec2 p = (uv - 0.5) * vec2(WALL_ASPECT, 1.0);
    float c = cos(-uLogoAngle), s = sin(-uLogoAngle);
    p = mat2(c, -s, s, c) * p / uLogoScale;
    p.x /= uLogoAspect;
    vec2 luv = p + 0.5;
    if (luv.x <= 0.0 || luv.x >= 1.0 || luv.y <= 0.0 || luv.y >= 1.0) return vec4(0.0);
    vec4 tx = texture2D(uLogo, luv);
    if (any(isnan(tx))) tx = vec4(0.0);
    float lum = dot(tx.rgb, vec3(0.299, 0.587, 0.114));
    float m = smoothstep(0.08, 0.55, mix(lum, 1.0 - lum, uLogoInvert) * tx.a);
    vec2 e = smoothstep(0.0, 0.02, luv) * smoothstep(0.0, 0.02, 1.0 - luv);
    m *= e.x * e.y;
    vec3 col = uLogoOwn > 0.5 ? clamp(tx.rgb * 1.7, 0.0, 1.0) * e.x * e.y : uLogoTint * m;
    return vec4(col * uLogoOpacity + m * uLogoFlash * 0.7, m);
  }
  vec3 wallKind(float kind, sampler2D t, float gain, vec2 uv) {
    if (kind < -0.5) return vec3(0.0);
    vec3 col = kind > 5.5 ? vec3(0.0) : kind > 4.5 ? grid(uv) : kind > 3.5 ? waves(uv) : kind > 2.5 ? bars(uv)
      : kind > 1.5 ? tunnel(uv) : kind > 0.5 ? film(t, gain, uv) : rings(uv);
    // The logo over whatever plays (alone on the logo stop), screen blend.
    vec4 l = logo(uv);
    return col + (1.0 - clamp(col, 0.0, 1.0)) * clamp(l.rgb, 0.0, 1.0);
  }
  vec3 wallPicture(vec2 uv) {
    return mix(wallKind(uSceneB, uScreenTexB, uGainB, uv), wallKind(uSceneA, uScreenTex, uGainA, uv), uScreenMix);
  }
`;

// Materials: albedo rgb, then sheen (how much the surface catches the
// beams at a grazing angle: brushed aluminium high, cloth none). A show
// is black gear and black cloth; the truss is the only bare metal.
const MAT = Object.freeze({
  truss: [0.5, 0.52, 0.55, 1],
  gear: [0.045, 0.045, 0.05, 0.4],     // speakers, frames, housings, booth
  deck: [0.06, 0.06, 0.065, 0.55],     // stage deck, painted black
  floor: [0.07, 0.068, 0.075, 0.3],
  drape: [0.085, 0.075, 0.095, 0],
  ceiling: [0.05, 0.05, 0.055, 0],
  leaf: [0.05, 0.14, 0.07, 0.35],
  tape: [0, 0, 0, 0],
});

// The venue as one mesh: position, normal, material, and an emissive flag
// for the LED strips. Everything is boxes, axis-aligned or along a segment.
function roomGeometry() {
  const pos = [], nor = [], alb = [], emi = [];
  const quad = (a, b, c, d, n, albedo, e = 0) => {
    for (const v of [a, b, c, a, c, d]) { pos.push(...v); nor.push(...n); alb.push(...albedo); emi.push(e); }
  };
  const box = (x0, y0, z0, x1, y1, z1, albedo, faces = 'xXyYzZ', e = 0) => {
    if (faces.includes('X')) quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], albedo, e);
    if (faces.includes('x')) quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], albedo, e);
    if (faces.includes('Y')) quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], albedo, e);
    if (faces.includes('y')) quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], albedo, e);
    if (faces.includes('Z')) quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], albedo, e);
    if (faces.includes('z')) quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], albedo, e);
  };
  // A box around a centre on three unit axes with half sizes.
  const obox = (c, axes, h, albedo) => {
    for (let a = 0; a < 3; a++) for (const sgn of [-1, 1]) {
      const n = axes[a], b = axes[(a + 1) % 3], d = axes[(a + 2) % 3], hb = h[(a + 1) % 3], hd = h[(a + 2) % 3];
      const fc = c.map((v, k) => v + sgn * h[a] * n[k]);
      const at = (sb, sd) => fc.map((v, k) => v + sb * hb * b[k] + sd * hd * d[k]);
      quad(at(-1, -1), at(1, -1), at(1, 1), at(-1, 1), n.map((v) => v * sgn), albedo);
    }
  };
  const unit = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  // A square tube between two points: truss chords and lacing.
  const tube = (a, b, t, albedo) => {
    const u = unit(b.map((v, k) => v - a[k]));
    const v = unit(cross(u, Math.abs(u[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0])), w = cross(u, v);
    obox(a.map((x, k) => (x + b[k]) / 2), [u, v, w], [Math.hypot(...b.map((x, k) => x - a[k])) / 2, t / 2, t / 2], albedo);
  };
  // Box truss: four chords on a square section, laced in a zigzag on each face.
  const truss = (from, to, sec, along, albedo = MAT.truss) => {
    const u = unit(to.map((v, k) => v - from[k]));
    const w = unit(cross(u, Math.abs(u[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0])), v = cross(w, u);
    const len = Math.hypot(...to.map((x, k) => x - from[k])), h = sec / 2;
    const corner = (s, i, j) => from.map((x, k) => x + u[k] * s + v[k] * i * h + w[k] * j * h);
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [i, j] of corners) tube(corner(0, i, j), corner(len, i, j), 0.06, albedo);
    const n = Math.max(1, Math.round(len / along));
    for (let f = 0; f < 4; f++) {
      const [i0, j0] = corners[f], [i1, j1] = corners[(f + 1) % 4];
      for (let k = 0; k < n; k++) {
        const s0 = len * k / n, s1 = len * (k + 1) / n;
        tube(k % 2 ? corner(s0, i0, j0) : corner(s0, i1, j1), k % 2 ? corner(s1, i1, j1) : corner(s1, i0, j0), 0.035, albedo);
      }
    }
  };
  const [x0, y0, z0] = LASER_ROOM.min, [x1, y1, z1] = LASER_ROOM.max;
  const { stage } = LASER_ROOM;
  // The shell faces inward: black drapes and a black ceiling, so the rig
  // and the wall carry the room. The shader folds the side drapes.
  quad([x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0], [0, 1, 0], MAT.floor);
  quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, -1, 0], MAT.ceiling);
  quad([x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [1, 0, 0], MAT.drape);
  quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [-1, 0, 0], MAT.drape);
  quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, 1], MAT.drape);
  quad([x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [0, 0, -1], MAT.drape);
  // Stage deck (its lip carries the edge lights' bottom bar).
  box(-stage.halfWidth, 0, z0, stage.halfWidth, stage.top, stage.front, MAT.deck, 'xXYZ');
  // The LED wall's cabinets: a thin black bezel and the depth behind it
  // (the screen itself is its own mesh).
  const fx = SCREEN.x + 0.12, fy0 = SCREEN.y0 - 0.12, fy1 = SCREEN.y1 + 0.12;
  box(-fx, fy0, -18.95, fx, fy1, -18.6, MAT.gear, 'xXYy');
  box(-fx, fy0, -18.6, -SCREEN.x, fy1, -18.55, MAT.gear, 'Z'); box(SCREEN.x, fy0, -18.6, fx, fy1, -18.55, MAT.gear, 'Z');
  box(-SCREEN.x, SCREEN.y1, -18.6, SCREEN.x, fy1, -18.55, MAT.gear, 'Z'); box(-SCREEN.x, fy0, -18.6, SCREEN.x, SCREEN.y0, -18.55, MAT.gear, 'Z');
  // Box truss: a goal post. The towers stand on the floor beside the stage
  // and run up through the span's ends; corner blocks join them, base
  // plates carry them.
  const TX = 13.6, TZ = -12.6, TY = 10.3, H = 0.25;
  // The span runs past the towers into short wings the PA hangs from,
  // so the line arrays fly outside the screen instead of over it.
  const WING = 15.6, PA = 14.85;
  truss([-WING, TY, TZ], [WING, TY, TZ], 0.5, 0.5);
  for (const sx of [-TX, TX]) {
    truss([sx, 0.06, TZ], [sx, TY + H, TZ], 0.5, 0.5);
    box(sx - H - 0.04, TY - H - 0.04, TZ - H - 0.04, sx + H + 0.04, TY + H + 0.04, TZ + H + 0.04, MAT.truss);
    box(sx - 0.45, 0, TZ - 0.45, sx + 0.45, 0.06, TZ + 0.45, MAT.gear, 'xXYzZ');
  }
  // Line arrays hang in a J from the truss, the bottom boxes curling back
  // under the column so their fronts aim down at the floor; subs stack on
  // the floor. Each box has a grille face and a black cabinet.
  for (const sx of [-1, 1]) {
    let y = TY - H - 0.15, z = TZ + 0.7, tilt = 0;
    // Rigging: two chains from the span to the top box.
    for (const dx of [-0.4, 0.4]) tube([sx * PA + dx, TY - H, TZ + 0.2], [sx * PA + dx, y, z - 0.1], 0.025, MAT.gear);
    for (let i = 0; i < 12; i++) {
      tilt += (1 + i * 0.35) * Math.PI / 180;
      const down = [0, -Math.cos(tilt), -Math.sin(tilt)], back = [0, Math.sin(tilt), -Math.cos(tilt)];
      const c = [sx * PA, y + down[1] * 0.19, z + down[2] * 0.19];
      obox(c, [[1, 0, 0], down, back], [0.55, 0.175, 0.32], MAT.gear);
      y += down[1] * 0.38; z += down[2] * 0.38;
    }
    for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) {
      const bx = sx * (12.2 + c * 1.18);
      box(bx - 0.56, r * 0.78, -10.8, bx + 0.56, r * 0.78 + 0.74, -9.4, MAT.gear, 'xXYZ');
    }
  }
  // DJ booth with a strip along its top edge.
  box(-2.3, stage.top, -15.7, 2.3, 2.55, -14.4, MAT.gear, 'xXYZ');
  box(-2.3, 2.42, -14.4, 2.3, 2.5, -14.38, MAT.tape, 'Z', 0.7);
  // Projector housings at every mount, lit or not.
  for (const m of LASER_PROJECTORS) {
    const [x, y, z] = m.origin;
    box(x - 0.24, y - 0.16, z - 0.24, x + 0.24, y + 0.12, z + 0.2, MAT.gear);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aAlbedo', new THREE.Float32BufferAttribute(alb, 4));
  g.setAttribute('aEmit', new THREE.Float32BufferAttribute(emi, 1));
  return g;
}

// The stage's LED edge lights: a thin strip round the LED wall's bezel,
// facing the room. Its color runs from the bottom center (0) round to the
// top center (1), the same on both sides, so a color run is mirrored left
// to right (edgeS).
// A thin strip, about two pixels at 1080p from the booth, like a laser
// core (Alec, 2026-11-08: clean and skinny, not a fat batten).
export const EDGE = Object.freeze({ bar: 0.08, gap: 0.16 });
const edgeS = (bar, t) => (bar === 'lip' ? 0.2 * t : bar === 'side' ? 0.2 + 0.5 * t : 0.7 + 0.3 * t);
// The frame's center line: just outside the screen, on the bezel's face.
const edgeX = () => SCREEN.x + EDGE.gap + EDGE.bar / 2;
const edgeY0 = () => SCREEN.y0 - EDGE.gap - EDGE.bar / 2;
const edgeY1 = () => SCREEN.y1 + EDGE.gap + EDGE.bar / 2;
const edgeZ = () => SCREEN.z + 0.06;
function edgeGeometry() {
  // One flat panel over the whole frame and its halo, in the wall's plane;
  // the shader draws the strip from the exact distance to the outline, so
  // no mesh edge can cut it or kink it at a corner.
  const m = EDGE.bar * EDGE_HALO + 0.05, x = edgeX() + m, y0 = edgeY0() - m, y1 = edgeY1() + m, z = edgeZ();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-x, y0, z, x, y0, z, x, y1, z, -x, y1, z], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}
// The quad's half-width in bar widths: the core is the middle 1/EDGE_HALO.
const EDGE_HALO = 4;
// Points along the frame where the edge lights scatter into the haze.
const EDGE_GLOW = (() => {
  const out = [], x = edgeX(), y0 = edgeY0(), y1 = edgeY1(), z = edgeZ() + 0.4;
  for (const sx of [-1, 1]) for (let k = 0; k < 6; k++) {
    const t = (k + 0.5) / 6;
    out.push([sx * x * t, y0, z, edgeS('lip', t)]);
    out.push([sx * x, y0 + (y1 - y0) * t, z, edgeS('side', t)]);
    out.push([sx * x * (1 - t), y1, z, edgeS('top', t)]);
  }
  return out;
})();

// LED strips: thin vertical strips in the lasers' colors, four each side
// of the stage and four down each side wall toward the booth, all full
// height (a staircase of heights read as lines falling toward the stage;
// Alec, 2026-11-08). They swap on the kick, odd strips then even. Each is
// [x, y0, y1, z, plane]:
// plane 'z' faces the room from the stage, 'x' lies flat on a side wall.
const STRIPS = Object.freeze((() => {
  const out = [];
  for (const sx of [-1, 1]) {
    // Beside the stage, just in front of its edge, clear of the truss
    // tower and the PA as the booth sees them.
    for (const x of [14.5, 15.3, 16.1, 16.85]) out.push([sx * x, 0.06, 8.6, -10.4, 'z']);
    // Down the side walls, all four inside the booth's view.
    for (const z of [-8, -5, -2, 1]) out.push([sx * (LASER_ROOM.max[0] - 0.08), 1.2, 8.6, z, 'x']);
  }
  return out;
})());
function stripGeometry() {
  // One panel per strip around it, in its plane; the shader draws the
  // line from the exact distance to its segment, so the ends are clean.
  const pos = [], a = [], b = [], gain = [], idx = [], r = EDGE.bar * EDGE_HALO + 0.05;
  for (const [x, y0, y1, z, plane] of STRIPS) {
    const base = pos.length / 3;
    const c = plane === 'z'
      ? [[x - r, y0 - r, z], [x + r, y0 - r, z], [x + r, y1 + r, z], [x - r, y1 + r, z]]
      : [[x, y0 - r, z - r], [x, y0 - r, z + r], [x, y1 + r, z + r], [x, y1 + r, z - r]];
    for (const v of c) { pos.push(...v); a.push(x, y0, z); b.push(x, y1, z); gain.push(1); }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aA', new THREE.Float32BufferAttribute(a, 3));
  g.setAttribute('aB', new THREE.Float32BufferAttribute(b, 3));
  // Each strip's light this frame (the kick swap), four vertices apiece.
  g.setAttribute('aGain', new THREE.Float32BufferAttribute(gain, 1).setUsage(THREE.DynamicDrawUsage));
  g.setIndex(idx);
  return g;
}
// Where the strips scatter into the haze: three points up each one.
const STRIP_GLOW = STRIPS.flatMap(([x, y0, y1, z, plane]) => [0.2, 0.5, 0.8].map((t) => [
  plane === 'x' ? x - Math.sign(x) * 0.4 : x, y0 + (y1 - y0) * t, plane === 'z' ? z + 0.4 : z, 0.2 + 0.5 * t]));

// Deterministic crowd: heads and shoulders from behind, some hands up,
// sorted far to near once (the camera never moves) so soft edges blend.
function crowdGeometry() {
  const people = [];
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const { crowd, stage } = LASER_ROOM;
  for (let z = crowd.front + 0.3; z < crowd.back - 0.4; z += 0.68 + Math.max(0, z - 8) * 0.03) {
    for (let x = -crowd.halfWidth + 0.3; x < crowd.halfWidth - 0.3; x += 0.62 + rnd() * 0.18) {
      if (rnd() < 0.08 + Math.max(0, z - 9) * 0.035) continue;
      const arms = rnd() < 0.12 ? (rnd() < 0.5 ? 3 : rnd() < 0.5 ? 1 : 2) : 0;
      people.push([x + (rnd() - 0.5) * 0.42, 1.36 + rnd() * 0.16, z + (rnd() - 0.5) * 0.62,
        0.92 + rnd() * 0.16, 0.9 + rnd() * 0.22, arms, rnd(), rnd() * TAU]);
    }
  }
  // The DJ, behind the booth.
  people.push([0, stage.top + 1.42, -16.1, 1.05, 1.1, 1, 0.3, 0]);
  const [cx, , cz] = LASER_ROOM.camera.position;
  people.sort((a, b) => Math.hypot(b[0] - cx, b[2] - cz) - Math.hypot(a[0] - cx, a[2] - cz));
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0], 3));
  g.setIndex([0, 1, 2, 2, 1, 3]);
  g.setAttribute('aPerson', new THREE.InstancedBufferAttribute(new Float32Array(people.flatMap((p) => p.slice(0, 4))), 4));
  g.setAttribute('aStyle', new THREE.InstancedBufferAttribute(new Float32Array(people.flatMap((p) => p.slice(4))), 4));
  g.instanceCount = people.length;
  return g;
}

// Line instances: start xyz, end xyz, power, width, tint rgb.
const LINE_STRIDE = 11;
function lineMesh(capacity, kind, uniforms) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 0, 1, 0, 1, 1, 0], 3));
  geo.setIndex([0, 1, 2, 2, 1, 3]);
  const data = new Float32Array(capacity * LINE_STRIDE);
  const buf = new THREE.InstancedInterleavedBuffer(data, LINE_STRIDE).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aStart', new THREE.InterleavedBufferAttribute(buf, 3, 0));
  geo.setAttribute('aEnd', new THREE.InterleavedBufferAttribute(buf, 3, 3));
  geo.setAttribute('aPower', new THREE.InterleavedBufferAttribute(buf, 1, 6));
  geo.setAttribute('aWidth', new THREE.InterleavedBufferAttribute(buf, 1, 7));
  geo.setAttribute('aTint', new THREE.InterleavedBufferAttribute(buf, 3, 8));
  geo.instanceCount = 0;
  const material = new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uKind: { value: kind } },
    transparent: true, depthWrite: false, depthTest: true,
    blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: /* glsl */`
      attribute vec3 aStart, aEnd;
      attribute float aPower, aWidth;
      attribute vec3 aTint;
      uniform vec2 uResolution;
      uniform float uKind;
      varying float vAcrossW, vHaloW, vClipW, vPower, vWidth;
      varying vec3 vWorld, vStart, vTint;
      void main() {
        vTint = aTint;
        vec4 s = modelViewMatrix * vec4(aStart, 1.0);
        vec4 e = modelViewMatrix * vec4(aEnd, 1.0);
        // Rays that pass the camera end at the near plane.
        float cut = e.z > -0.11 ? clamp((-0.11 - s.z) / (e.z - s.z), 0.0, 1.0) : 1.0;
        e = mix(s, e, cut);
        vec4 cs = projectionMatrix * s, ce = projectionMatrix * e;
        vec2 line = (ce.xy / ce.w - cs.xy / cs.w) * uResolution;
        vec2 normal = vec2(-line.y, line.x) / max(length(line), 0.0001);
        vec4 clip = mix(cs, ce, position.x);
        // A halo about 12 cm across in the room: wide where the beam passes
        // close, a few pixels far away. Traces stay tight on the surface.
        float halo = uKind < 0.5 ? clamp(0.12 * projectionMatrix[1][1] * uResolution.y * 0.5 / clip.w, 2.5, 26.0) : 1.5;
        float radius = aWidth * 0.5 + halo * 2.2;
        clip.xy += normal * position.y * radius * 2.0 / uResolution * clip.w;
        gl_Position = clip;
        // Screen-linear across the ribbon, so the core stays thin.
        vAcrossW = position.y * radius * clip.w;
        vHaloW = halo * clip.w;
        vClipW = clip.w;
        vWorld = mix(aStart, mix(aStart, aEnd, cut), position.x);
        vStart = aStart;
        vPower = aPower; vWidth = aWidth;
      }
    `,
    fragmentShader: /* glsl */`
      ${HAZE_GLSL}
      uniform float uKind, uTraceGain;
      varying float vAcrossW, vHaloW, vClipW, vPower, vWidth;
      varying vec3 vWorld, vStart, vTint;
      void main() {
        float w = max(vClipW, 0.0001);
        float d = abs(vAcrossW / w), halo = vHaloW / w;
        float core = 1.0 - smoothstep(max(0.0, vWidth * 0.5 - 0.45), vWidth * 0.5 + 0.65, d);
        if (uKind > 0.5) {
          gl_FragColor = vec4(safeLight(vTint * core * vPower * uTraceGain), 1.0);
          return;
        }
        float skirt = exp(-d * d / (2.0 * halo * halo)) * (0.05 + uHaze * 0.16) * min(1.0, 4.0 / halo);
        float along = distance(vWorld, vStart);
        float extinction = exp(-along * (0.002 + uHaze * 0.012));
        float light = (core + skirt) * vPower * scatterAmount() * hazeAt(vWorld) * extinction * 2.8;
        gl_FragColor = vec4(safeLight(vTint * light), 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  return { mesh, geo, material, data, buf, capacity };
}

export function createLasersScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0, 0, 0);
  const cam = LASER_ROOM.camera;
  const camera = new THREE.PerspectiveCamera(cam.fov, 16 / 9, 0.1, 200);
  camera.position.set(...cam.position);
  camera.lookAt(...cam.target);
  camera.updateMatrixWorld();

  const glowBytes = new Uint8Array(GW * GH * 4);
  const glowTex = new THREE.DataTexture(glowBytes, GW, GH, THREE.RGBAFormat, THREE.UnsignedByteType);
  glowTex.magFilter = glowTex.minFilter = THREE.LinearFilter;
  glowTex.wrapS = glowTex.wrapT = THREE.ClampToEdgeWrapping;
  glowTex.needsUpdate = true;
  // Beam light in the haze per color channel, and the LED wall's.
  const glowAcc = [0, 1, 2].map(() => new Float32Array(GW * GH));
  const glowTmp = new Float32Array(GW * GH), screenAcc = new Float32Array(GW * GH);

  const uniforms = {
    uResolution: { value: new THREE.Vector2(1280, 720) },
    uHaze: { value: LASER_DEFAULTS.density }, uPhase: { value: 0 },
    uColor: { value: new THREE.Color() },
    uGlow: { value: glowTex }, uGlowScale: { value: 0 },
    uAmbient: { value: 0 }, uAir: { value: 0 }, uRoom: { value: LASER_DEFAULTS.room }, uFogK: { value: 0.02 },
    uSurfaceGain: { value: TASTE.surfaceGain }, uTraceGain: { value: 0 }, uHitGain: { value: 0 },
    uBounce: { value: 0 }, uTime: { value: 0 }, uShadow: { value: PAL.bg }, uStrands: { value: 0.6 },
    // A flat placeholder until the scene first shows: baking the volume
    // costs tens of milliseconds the app's startup should not pay.
    uHazeTex: { value: flatHaze() },
    uScreen: { value: 0 }, uScreenLight: { value: 0 }, uScreenColor: { value: new THREE.Color() }, uScreenGlowScale: { value: 0 },
    uStrip: { value: 0 }, uEdge: { value: 0 }, uEdgeTex: { value: null },
    // The strip's center line as a rectangle in the wall's plane: center
    // x, center y, half width, half height.
    uEdgeBox: { value: new THREE.Vector4(0, (edgeY0() + edgeY1()) / 2, edgeX(), (edgeY1() - edgeY0()) / 2) }, uRing: { value: 0 }, uEnergy: { value: 0 }, uMid: { value: PAL.mid }, uDeep: { value: PAL.shadow },
    uWallRun: { value: null }, uLogo: { value: null }, uWallTex: { value: null },
    uWallPrev: { value: null }, uWallPersist: { value: 0 }, uWallZoom: { value: 1 },
    uBands0: { value: new THREE.Vector4() }, uBands1: { value: new THREE.Vector4() },
    uLogoOn: { value: 0 }, uLogoAspect: { value: 1 }, uLogoScale: { value: 0.4 }, uLogoAngle: { value: 0 },
    uLogoOpacity: { value: 0.75 }, uLogoFlash: { value: 0 }, uLogoInvert: { value: 0 }, uLogoOwn: { value: 0 },
    uLogoTint: { value: new THREE.Color(1, 1, 1) },
    uScreenTex: { value: null }, uScreenTexB: { value: null }, uScreenMix: { value: 1 }, uScreenCrop: { value: new THREE.Vector2(1, 1) },
    uSceneA: { value: 0 }, uSceneB: { value: 0 }, uGainA: { value: 1 }, uGainB: { value: 1 },
    // App's render scale (the pixel budget governor, or a reduced
    // preview). Point sizes are in drawn pixels, so the spots and the
    // aperture glints multiply by it and keep their size on screen when
    // the frame renders smaller. 1 at full scale.
    uPointScale: { value: 1 },
  };

  // Room and stage: lit only by the lasers, fogged by the lit haze.
  const roomMaterial = new THREE.ShaderMaterial({
    uniforms, side: THREE.DoubleSide, toneMapped: false,
    vertexShader: /* glsl */`
      attribute vec4 aAlbedo;
      attribute float aEmit;
      varying vec3 vWorld, vNormal;
      varying vec4 vClip;
      varying vec4 vAlbedo;
      varying float vEmit;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz; vNormal = normalize(mat3(modelMatrix) * normal);
        vAlbedo = aAlbedo; vEmit = aEmit;
        vClip = projectionMatrix * viewMatrix * world;
        gl_Position = vClip;
      }
    `,
    fragmentShader: /* glsl */`
      ${HAZE_GLSL}
      ${GLOW_GLSL}
      uniform float uAmbient, uRoom, uFogK, uScreenLight, uStrip;
      varying vec3 vWorld, vNormal;
      varying vec4 vClip;
      varying vec4 vAlbedo;
      varying float vEmit;
      void main() {
        vec3 glow = airGlow(vClip);
        vec3 albedo = vAlbedo.rgb;
        // Drapes hang in folds: the side walls along the room, the back
        // wall across it.
        bool side = abs(vNormal.x) > 0.9 && abs(vWorld.x) > ${(LASER_ROOM.max[0] - 0.05).toFixed(2)};
        bool back = vNormal.z > 0.9 && vWorld.z < ${(LASER_ROOM.min[2] + 0.05).toFixed(2)};
        if (side || back) {
          float a = side ? vWorld.z : vWorld.x;
          float fold = sin(a * 3.1 + sin(a * 0.7) * 1.5);
          albedo *= 0.5 + 0.5 * (fold * 0.5 + 0.5);
        }
        vec3 V = normalize(cameraPosition - vWorld);
        // Sheen: bare metal and satin paint catch the beams' colored light
        // at grazing angles, which is how a truss reads in a dark room.
        float fres = pow(1.0 - max(dot(vNormal, V), 0.0), 3.0);
        float d = distance(vWorld, cameraPosition);
        float fog = 1.0 - exp(-d * uFogK);
        // Faces toward the stage catch more of the rig's light.
        float facing = 0.5 + 0.5 * max(vNormal.z, 0.0);
        // The LED wall lights whatever faces it, falling off with distance.
        vec3 toS = vec3(clamp(vWorld.x, -${SCREEN.x.toFixed(1)}, ${SCREEN.x.toFixed(1)}), clamp(vWorld.y, ${SCREEN.y0.toFixed(1)}, ${SCREEN.y1.toFixed(1)}), ${SCREEN.z.toFixed(2)}) - vWorld;
        float dS = length(toS);
        float sLight = uScreenLight * max(dot(vNormal, toS / max(dS, 0.001)), 0.0) * 9.0 / (dS * dS + 9.0);
        // Local light first: the haze glow carries each beam's own color,
        // so a surface takes the color of the beams near it; the rig's
        // mean color only fills.
        vec3 lit = albedo * (uColor * uAmbient * facing * 0.45 + glow * 1.4 + uScreenColor * sLight)
          + vAlbedo.a * fres * (glow * 2.2 + uScreenColor * sLight * 0.8 + uColor * uAmbient * 0.15);
        // LED tape: pixels about 6 cm apart.
        float px = smoothstep(0.15, 0.35, abs(fract((vWorld.x + vWorld.y) * 16.0) - 0.5) * 2.0);
        float tape = vEmit * mix(1.0, 0.35 + 0.65 * px, step(0.95, vEmit));
        vec3 col = mix(lit, glow, fog) + uColor * tape * uStrip * exp(-d * uFogK * 0.6);
        gl_FragColor = vec4(mix(glow * 0.85, col, uRoom), 1.0);
      }
    `,
  });
  const roomGeo = roomGeometry();
  const room = new THREE.Mesh(roomGeo, roomMaterial);
  room.renderOrder = 0;
  room.frustumCulled = false;
  scene.add(room);

  // The LED wall: rounded rings that travel outward in the rig's color,
  // pushed by the kick, over a deep palette gradient, with the LED grid
  // showing where it is large enough to see.
  const screenGeo = new THREE.PlaneGeometry(SCREEN.x * 2, SCREEN.y1 - SCREEN.y0);
  screenGeo.translate(0, (SCREEN.y0 + SCREEN.y1) / 2, SCREEN.z);
  const screenMaterial = new THREE.ShaderMaterial({
    uniforms, toneMapped: false,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      varying vec3 vWorld;
      varying vec4 vClip;
      void main() {
        vUv = uv; vWorld = position;
        vClip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = vClip;
      }
    `,
    fragmentShader: /* glsl */`
      ${HAZE_GLSL}
      ${GLOW_GLSL}
      ${WALL_GLSL}
      uniform float uRoom, uFogK;
      uniform sampler2D uWallTex;
      varying vec2 vUv;
      varying vec3 vWorld;
      varying vec4 vClip;
      void main() {
        vec3 col = texture2D(uWallTex, vUv).rgb;
        vec2 cell = vUv * vec2(${Math.round(SCREEN.x * 2 / 0.085)}.0, ${Math.round((SCREEN.y1 - SCREEN.y0) / 0.085)}.0), f = abs(fract(cell) - 0.5);
        float pitch = clamp(1.0 - max(fwidth(cell.x), fwidth(cell.y)) * 1.6, 0.0, 1.0);
        col *= 1.0 - pitch * 0.35 * smoothstep(0.32, 0.5, max(f.x, f.y));
        vec3 glow = airGlow(vClip);
        float d = distance(vWorld, cameraPosition);
        // An LED wall is a light source: it cuts through the haze more
        // than a lit surface does. Its brightness is its own slider, so it
        // stays up when the room goes dark.
        vec3 haze = glow * (1.0 - exp(-d * uFogK)) * 0.7;
        gl_FragColor = vec4(col * uScreen * exp(-d * uFogK * 0.3) + mix(glow * 0.85, haze, uRoom), 1.0);
      }
    `,
  });
  screenMaterial.extensions = { derivatives: true };
  const screen = new THREE.Mesh(screenGeo, screenMaterial);
  screen.renderOrder = 0;
  screen.frustumCulled = false;
  scene.add(screen);

  // The wall's picture is composited into its own small target each frame,
  // over the last frame of it: the trails and heat sliders streak and
  // kick-zoom what plays on the wall, and the stage around it stays clean.
  const wallScene = new THREE.Scene(), wallCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const wallMat = new THREE.ShaderMaterial({
    uniforms, depthTest: false, depthWrite: false, toneMapped: false,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: /* glsl */`
      ${WALL_GLSL}
      uniform sampler2D uWallPrev;
      uniform float uWallPersist, uWallZoom;
      varying vec2 vUv;
      void main() {
        vec3 col = wallPicture(vUv);
        if (uWallPersist > 0.0) {
          vec2 huv = 0.5 + (vUv - 0.5) / uWallZoom;
          vec2 e = smoothstep(0.0, 0.02, huv) * smoothstep(0.0, 0.02, 1.0 - huv);
          col = max(col, texture2D(uWallPrev, huv).rgb * uWallPersist * e.x * e.y);
        }
        if (any(isnan(col)) || any(isinf(col))) col = vec3(0.0);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  wallMat.extensions = { derivatives: true };
  wallScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), wallMat));
  const wallFb = { rt: [null, null], i: 0 };
  function compositeWall() {
    const r = ctx.renderer;
    if (!r) return;
    const w = Math.max(512, Math.round(1024 * Math.sqrt(clamp(Number(ctx.gpuFactor?.()) || 1, 0.25, 1)) / 16) * 16);
    const h = Math.round(w / (SCREEN.x * 2 / (SCREEN.y1 - SCREEN.y0)));
    for (let k = 0; k < 2; k++) {
      if (!wallFb.rt[k]) wallFb.rt[k] = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType });
      else if (wallFb.rt[k].width !== w) wallFb.rt[k].setSize(w, h);
    }
    const out = wallFb.rt[wallFb.i], prev = wallFb.rt[wallFb.i ^ 1];
    uniforms.uWallPrev.value = prev.texture;
    const was = r.getRenderTarget();
    r.setRenderTarget(out);
    r.render(wallScene, wallCam);
    r.setRenderTarget(was);
    uniforms.uWallTex.value = out.texture;
    wallFb.i ^= 1;
  }

  // The LED edge lights, in the lasers' colors: a 64-step color run along
  // the frame, refilled each frame from the colors stop.
  const EDGE_N = 64;
  const edgeBytes = new Uint8Array(EDGE_N * 4), edgeRGB = new Float32Array(EDGE_N * 3);
  const edgeTex = new THREE.DataTexture(edgeBytes, EDGE_N, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  edgeTex.magFilter = edgeTex.minFilter = THREE.LinearFilter;
  edgeTex.wrapS = edgeTex.wrapT = THREE.ClampToEdgeWrapping;
  uniforms.uEdgeTex.value = edgeTex;
  uniforms.uWallRun.value = edgeTex;
  const edgeGeo = edgeGeometry();
  const edgeMaterial = new THREE.ShaderMaterial({
    uniforms, toneMapped: false, side: THREE.DoubleSide,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      varying vec3 vWorld;
      varying vec4 vClip;
      void main() {
        vWorld = position;
        vClip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = vClip;
      }
    `,
    fragmentShader: /* glsl */`
      ${HAZE_GLSL}
      ${GLOW_GLSL}
      uniform float uEdge, uRoom, uFogK;
      uniform vec4 uEdgeBox;
      uniform sampler2D uEdgeTex;
      varying vec3 vWorld;
      varying vec4 vClip;
      void main() {
        if (uEdge <= 0.0) discard;
        // A thin LED strip: a solid antialiased core, then a faint halo
        // falling off into the haze. Brightness comes from the exact
        // distance to the frame's rectangle, not from the mesh, so every
        // corner is clean (interpolating across the mitered corner quads
        // kinked the line there).
        vec2 q = abs(vWorld.xy - uEdgeBox.xy) - uEdgeBox.zw;
        float dist = abs(length(max(q, 0.0)) + min(max(q.x, q.y), 0.0));
        float half_ = ${(EDGE.bar / 2).toFixed(3)}, reach = ${(EDGE.bar * EDGE_HALO).toFixed(3)};
        float aa = max(fwidth(dist) * 0.75, 0.002);
        float x = dist / reach;
        if (x > 1.0) discard;
        float light = 1.0 - smoothstep(half_ - aa, half_ + aa, dist)
          + exp(-x * x * 10.0) * 0.22 * (1.0 - smoothstep(0.8, 1.0, x));
        // Where along the frame this is (bottom center 0, round each side
        // to the top center 1), from the nearest edge: the color run.
        vec2 p = vWorld.xy - uEdgeBox.xy;
        float ax = abs(p.x), lo = -uEdgeBox.w, hi = uEdgeBox.w;
        float dB = abs(p.y - lo), dT = abs(p.y - hi), dS = abs(ax - uEdgeBox.z);
        float sv = dS <= min(dB, dT) ? 0.2 + 0.5 * clamp((p.y - lo) / (hi - lo), 0.0, 1.0)
          : dB < dT ? 0.2 * clamp(ax / uEdgeBox.z, 0.0, 1.0)
          : 0.7 + 0.3 * (1.0 - clamp(ax / uEdgeBox.z, 0.0, 1.0));
        vec3 c = texture2D(uEdgeTex, vec2(sv, 0.5)).rgb * uEdge * light;
        float d = distance(vWorld, cameraPosition);
        gl_FragColor = vec4(safeLight(c * exp(-d * uFogK * 0.25)), 1.0);
      }
    `,
  });
  edgeMaterial.extensions = { derivatives: true };
  const edges = new THREE.Mesh(edgeGeo, edgeMaterial);
  edges.renderOrder = 1;
  edges.frustumCulled = false;
  scene.add(edges);

  // The LED strips: the same light as the edge frame, along their own
  // segments, colored up their height the way the frame's sides are.
  const stripGeo = stripGeometry();
  const stripMaterial = new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uStrips: { value: 0 } },
    toneMapped: false, side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute vec3 aA, aB;
      attribute float aGain;
      varying vec3 vWorld, vA, vB;
      varying float vGain;
      void main() {
        vWorld = position; vA = aA; vB = aB; vGain = aGain;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      ${SAFE_GLSL}
      uniform float uStrips, uFogK;
      uniform sampler2D uEdgeTex;
      varying vec3 vWorld, vA, vB;
      varying float vGain;
      void main() {
        if (vGain < 0.002) discard;
        vec3 ab = vB - vA;
        float h = clamp(dot(vWorld - vA, ab) / dot(ab, ab), 0.0, 1.0);
        float dist = distance(vWorld, vA + ab * h);
        float half_ = ${(EDGE.bar / 2).toFixed(3)}, reach = ${(EDGE.bar * EDGE_HALO).toFixed(3)}, x = dist / reach;
        if (x > 1.0) discard;
        float aa = max(fwidth(dist) * 0.75, 0.002);
        float light = 1.0 - smoothstep(half_ - aa, half_ + aa, dist)
          + exp(-x * x * 10.0) * 0.22 * (1.0 - smoothstep(0.8, 1.0, x));
        vec3 c = texture2D(uEdgeTex, vec2(0.2 + 0.5 * h, 0.5)).rgb * uStrips * vGain * light;
        float d = distance(vWorld, cameraPosition);
        gl_FragColor = vec4(safeLight(c * exp(-d * uFogK * 0.25)), 1.0);
      }
    `,
  });
  stripMaterial.extensions = { derivatives: true };
  const strips = new THREE.Mesh(stripGeo, stripMaterial);
  strips.renderOrder = 1;
  strips.frustumCulled = false;
  scene.add(strips);

  // Plants: Poly Haven anthuriums (CC0), reduced to bare geometry and lit
  // like the rest of the room, so they read as leaf silhouettes against
  // the wall and the haze. Loaded after the scene starts; the room works
  // without them.
  const plants = new THREE.Group();
  plants.renderOrder = 0;
  scene.add(plants);
  const PLANTS = [
    [-10.6, LASER_ROOM.stage.top, -11.8, 0, 0.95, 0.4], [10.6, LASER_ROOM.stage.top, -11.8, 1, 0.95, -0.5],
    [-3.5, LASER_ROOM.stage.top, -15.2, 2, 0.75, 1.1], [3.5, LASER_ROOM.stage.top, -15.2, 3, 0.75, -1.3],
    [-6.6, LASER_ROOM.stage.top, -17.7, 1, 1.15, 2.2], [6.6, LASER_ROOM.stage.top, -17.7, 0, 1.15, -2.0],
    [-15.3, 0, -9.2, 3, 1.25, 0.7], [15.3, 0, -9.2, 2, 1.25, -0.9],
  ];
  const plantGeos = [];
  (function loadPlants() {
    if (typeof fetch !== 'function') return;
    const urls = ['/vs3/lasers/plants.bin']; // vjw: our static copy, was import.meta.url + document.baseURI
    const tryAt = (i) => fetch(urls[i])
      .then((r) => { if (!r.ok) throw new Error('plants ' + r.status); return r.arrayBuffer(); })
      .then((buf) => {
        const view = new DataView(buf);
        if (String.fromCharCode(...new Uint8Array(buf, 0, 4)) !== 'LPLT') throw new Error('plants format');
        let o = 8;
        for (let n = view.getUint32(4, true); n > 0; n--) {
          const half = [view.getFloat32(o, true), view.getFloat32(o + 4, true), view.getFloat32(o + 8, true)];
          const nv = view.getUint32(o + 12, true), ni = view.getUint32(o + 16, true);
          o += 20;
          const q = new Int16Array(buf, o, nv * 3); o += (nv * 3 + (nv * 3) % 2) * 2;
          const idx = new Uint16Array(buf, o, ni); o += (ni + ni % 2) * 2;
          const pos = new Float32Array(nv * 3);
          for (let k = 0; k < nv * 3; k++) pos[k] = q[k] / 32767 * half[k % 3];
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
          g.setIndex(new THREE.BufferAttribute(new Uint16Array(idx), 1));
          g.computeVertexNormals();
          const leaf = new Float32Array(nv * 4);
          for (let k = 0; k < nv; k++) leaf.set(MAT.leaf, k * 4);
          g.setAttribute('aAlbedo', new THREE.BufferAttribute(leaf, 4));
          g.setAttribute('aEmit', new THREE.BufferAttribute(new Float32Array(nv), 1));
          plantGeos.push(g);
        }
        for (const [x, y, z, v, sc, rot] of PLANTS) {
          const m = new THREE.Mesh(plantGeos[v % plantGeos.length], roomMaterial);
          m.position.set(x, y, z); m.scale.setScalar(sc); m.rotation.y = rot;
          m.frustumCulled = false;
          plants.add(m);
        }
      })
      .catch(() => (i + 1 < urls.length ? tryAt(i + 1) : null));
    tryAt(0);
  })();

  // The crowd in silhouette against the lit haze.
  const crowdGeo = crowdGeometry();
  const crowdMaterial = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: true, depthTest: true, toneMapped: false,
    vertexShader: /* glsl */`
      attribute vec4 aPerson; // x, shoulder height, z, height scale
      attribute vec4 aStyle;  // width scale, arms, variety, phase
      uniform float uBounce, uTime;
      varying vec2 vLocal;
      varying vec4 vClip;
      varying vec3 vWorld;
      varying vec4 vStyle;
      void main() {
        vec3 base = aPerson.xyz;
        base.y += uBounce * (0.55 + 0.45 * sin(aStyle.w + uTime * 1.7)) * (aPerson.z > -11.0 ? 1.0 : 0.2);
        vec3 toCam = cameraPosition - base; toCam.y = 0.0;
        vec3 right = normalize(vec3(toCam.z, 0.0, -toCam.x));
        float w = 0.46 * aStyle.x, h = aPerson.w;
        vec2 local = vec2(position.x * w, mix(-0.62, 0.86, position.y) * h);
        vec3 world = base + right * local.x + vec3(0.0, local.y, 0.0);
        vLocal = vec2(local.x / aStyle.x, local.y / h);
        vStyle = aStyle; vWorld = world;
        vClip = projectionMatrix * viewMatrix * vec4(world, 1.0);
        gl_Position = vClip;
      }
    `,
    fragmentShader: /* glsl */`
      ${HAZE_GLSL}
      ${GLOW_GLSL}
      uniform float uRoom, uFogK, uAmbient;
      uniform vec3 uShadow;
      varying vec2 vLocal;
      varying vec4 vClip;
      varying vec3 vWorld;
      varying vec4 vStyle;
      float box(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
      float seg(vec2 p, vec2 a, vec2 b, float r) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) - r; }
      float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
      float arm(vec2 p, float side, float v) {
        vec2 sh = vec2(0.17 * side, -0.03), el = vec2((0.27 + v * 0.06) * side, 0.27 + v * 0.05), hand = vec2((0.23 + v * 0.1) * side, 0.58 + v * 0.12);
        return min(smin(seg(p, sh, el, 0.05), seg(p, el, hand, 0.04), 0.02), length(p - hand - vec2(0.0, 0.04)) - 0.05);
      }
      void main() {
        vec2 p = vLocal;
        // From behind: head, neck, sloped shoulders, back and hanging arms.
        float lean = (vStyle.z - 0.5) * 0.05;
        vec2 hr = vec2(0.1, 0.122) * (0.95 + vStyle.z * 0.12);
        float head = (length((p - vec2(lean, 0.25)) / hr) - 1.0) * hr.x;
        float body = box(p - vec2(0.0, -0.38), vec2(0.165, 0.3), 0.12);
        body = smin(body, seg(p, vec2(-0.155, -0.05), vec2(0.155, -0.05), 0.065), 0.06);
        body = smin(body, seg(p, vec2(-0.2, -0.1), vec2(-0.215, -0.5), 0.052), 0.03);
        body = smin(body, seg(p, vec2(0.2, -0.1), vec2(0.215, -0.5), 0.052), 0.03);
        float d = smin(head, smin(seg(p, vec2(0.0, 0.0), vec2(lean * 0.6, 0.17), 0.055), body, 0.07), 0.035);
        float arms = vStyle.y;
        if (arms == 1.0 || arms == 3.0) d = smin(d, arm(p, -1.0, vStyle.z), 0.03);
        if (arms == 2.0 || arms == 3.0) d = smin(d, arm(p, 1.0, fract(vStyle.z * 7.0)), 0.03);
        float aa = fwidth(d) * 0.75 + 0.002;
        float alpha = 1.0 - smoothstep(-aa, aa, d);
        if (alpha < 0.01) discard;
        vec3 glow = airGlow(vClip);
        // Backlit: a thin rim catches the haze on the head and shoulders.
        float rim = exp(d / 0.007) * 0.22 * smoothstep(-0.25, 0.3, p.y);
        // Silhouettes: the haze between you and a head only partly veils
        // it, so the crowd stays a dark mass against the lit air.
        vec3 col = uShadow * 0.22 + uColor * uAmbient * 0.03 + glow * rim;
        float fog = 1.0 - exp(-distance(vWorld, cameraPosition) * uFogK);
        col = mix(col, glow * 0.75, fog * 0.6);
        gl_FragColor = vec4(col, alpha * smoothstep(0.0, 0.25, uRoom));
      }
    `,
  });
  crowdMaterial.extensions = { derivatives: true };
  const crowd = new THREE.Mesh(crowdGeo, crowdMaterial);
  crowd.renderOrder = 1;
  crowd.frustumCulled = false;
  scene.add(crowd);

  // Scanned surfaces: thin sheets of lit haze, brightest seen edge-on.
  const rig = new LaserRig();
  const surfGeo = new THREE.BufferGeometry();
  const surfPosAttr = new THREE.BufferAttribute(rig.surfPos, 3).setUsage(THREE.DynamicDrawUsage);
  const surfAuxAttr = new THREE.BufferAttribute(rig.surfAux, 3).setUsage(THREE.DynamicDrawUsage);
  surfGeo.setAttribute('position', surfPosAttr);
  surfGeo.setAttribute('aAux', surfAuxAttr);
  const surfTint = new Float32Array(rig.surfPos.length);
  const surfTintAttr = new THREE.BufferAttribute(surfTint, 3).setUsage(THREE.DynamicDrawUsage);
  surfGeo.setAttribute('aTint', surfTintAttr);
  surfGeo.setDrawRange(0, 0);
  const surfMaterial = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, depthTest: true,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: /* glsl */`
      attribute vec3 aAux; // distance from the aperture, power per radian, scan * distance
      attribute vec3 aTint;
      varying vec3 vWorld, vTint;
      varying float vR, vDensity, vScanR;
      void main() {
        vWorld = position; vTint = aTint; vR = aAux.x; vDensity = aAux.y; vScanR = aAux.z;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      ${HAZE_GLSL}
      uniform float uSurfaceGain, uStrands;
      varying vec3 vWorld, vTint;
      varying float vR, vDensity, vScanR;
      void main() {
        // The sheet's facing from screen derivatives. A sheet seen exactly
        // edge-on has no area on screen: its cross product is zero, and
        // normalizing that gives NaN on real GPUs (black squares under
        // trails). Edge-on is the brightest case, so it takes the cap.
        vec3 nc = cross(dFdx(vWorld), dFdy(vWorld));
        float nl = length(nc);
        vec3 v = normalize(cameraPosition - vWorld);
        float facing = nl > 1e-12 ? abs(dot(nc / nl, v)) : 0.0;
        float graze = 1.0 / max(facing, 0.15);
        float spread = 1.0 / max(vR, 1.2);
        float extinction = exp(-vR * (0.002 + uHaze * 0.012));
        // A sheet is one beam swept fast: it reads as a comb of strands
        // that crawl a little, brightest where the scanner lingers.
        float scan = vScanR / max(vR, 0.001) * 0.34 + uTime * 0.08;
        float comb = 0.5 + 0.5 * cos(6.283185 * scan);
        // Strands finer than a few pixels average out instead of shimmering.
        float fine = clamp(fwidth(scan) * 3.0, 0.0, 1.0);
        float strands = mix(1.0, mix(0.45 + 1.6 * comb * comb * comb, 1.0, fine), uStrands);
        float light = vDensity * spread * graze * strands * scatterAmount() * hazeAt(vWorld) * extinction * uSurfaceGain;
        gl_FragColor = vec4(safeLight(vTint * light), 1.0);
      }
    `,
  });
  surfMaterial.extensions = { derivatives: true };
  const surfaces = new THREE.Mesh(surfGeo, surfMaterial);
  surfaces.renderOrder = 2;
  surfaces.frustumCulled = false;
  scene.add(surfaces);

  const MAX_CENTERS = LASER_PROJECTORS.length * LASER_MAX_BEAMS;
  const traces = lineMesh(MAX_CENTERS * 10, 1, uniforms);
  traces.mesh.renderOrder = 3;
  scene.add(traces.mesh);
  const cores = lineMesh(MAX_CENTERS * 3, 0, uniforms);
  cores.mesh.renderOrder = 4;
  scene.add(cores.mesh);

  // Spots where beams hit a surface, and the lit apertures.
  const pointMaterial = (kind) => new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uKind: { value: kind } },
    transparent: true, depthWrite: false, depthTest: true,
    blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: /* glsl */`
      attribute float aPower;
      attribute vec3 aTint;
      uniform float uKind, uPointScale;
      uniform vec2 uResolution;
      varying float vPower;
      varying vec3 vTint;
      void main() {
        vTint = aTint;
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * view;
        // Spots stay about 20 cm across; apertures are a fixed glint.
        float px = projectionMatrix[1][1] * uResolution.y * 0.5 / max(-view.z, 0.1);
        gl_PointSize = (uKind < 0.5 ? clamp(0.2 * px * (0.6 + 0.4 * sqrt(aPower)), 2.0, 22.0) : clamp(0.6 * px, 8.0, 26.0)) * uPointScale;
        vPower = aPower;
      }
    `,
    fragmentShader: /* glsl */`
      ${SAFE_GLSL}
      uniform float uKind, uHitGain;
      varying float vPower;
      varying vec3 vTint;
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float r = dot(p, p);
        if (r > 1.0) discard;
        float light = uKind < 0.5
          ? (exp(-r * 9.0) * 0.9 + exp(-r * 40.0)) * vPower * uHitGain
          : (exp(-r * 60.0) * 2.4 + exp(-r * 9.0) * 0.22) * vPower;
        gl_FragColor = vec4(safeLight(vTint * light), 1.0);
      }
    `,
  });
  const dotGeo = new THREE.BufferGeometry();
  const dotPos = new Float32Array(MAX_CENTERS * 3 * 3), dotPow = new Float32Array(MAX_CENTERS * 3);
  dotGeo.setAttribute('position', new THREE.BufferAttribute(dotPos, 3).setUsage(THREE.DynamicDrawUsage));
  dotGeo.setAttribute('aPower', new THREE.BufferAttribute(dotPow, 1).setUsage(THREE.DynamicDrawUsage));
  const dotTint = new Float32Array(MAX_CENTERS * 3 * 3);
  dotGeo.setAttribute('aTint', new THREE.BufferAttribute(dotTint, 3).setUsage(THREE.DynamicDrawUsage));
  dotGeo.setDrawRange(0, 0);
  const dots = new THREE.Points(dotGeo, pointMaterial(0));
  dots.renderOrder = 5;
  dots.frustumCulled = false;
  scene.add(dots);
  const apGeo = new THREE.BufferGeometry();
  const apPow = new Float32Array(LASER_PROJECTORS.length), apFlare = new Float32Array(LASER_PROJECTORS.length);
  apGeo.setAttribute('position', new THREE.Float32BufferAttribute(LASER_PROJECTORS.flatMap((m) => [m.origin[0], m.origin[1], m.origin[2] + 0.22]), 3));
  apGeo.setAttribute('aPower', new THREE.BufferAttribute(apPow, 1).setUsage(THREE.DynamicDrawUsage));
  const apTint = new Float32Array(LASER_PROJECTORS.length * 3);
  apGeo.setAttribute('aTint', new THREE.BufferAttribute(apTint, 3).setUsage(THREE.DynamicDrawUsage));
  const apertures = new THREE.Points(apGeo, pointMaterial(1));
  apertures.renderOrder = 6;
  apertures.frustumCulled = false;
  scene.add(apertures);

  // ----------------------------------------------------------- the colors
  // Every beam gets its color from the colors stop: the whole rig in the
  // color slider's one color, or each beam its own by its place across its
  // fan, the pairs stepped apart. A colors change crosses over instead
  // of passing every stop.
  const baseColor = new THREE.Color(), tintA = new THREE.Color(), tintB = new THREE.Color(), tintC = new THREE.Color();
  const tintCache = new Float32Array(LASER_PROJECTORS.length * LASER_MAX_BEAMS * 3);
  const tintStamp = new Int32Array(LASER_PROJECTORS.length * LASER_MAX_BEAMS);
  const tintOut = [1, 1, 1];
  const colorsMix = { from: LASER_DEFAULTS.colors, to: LASER_DEFAULTS.colors, mix: 1 };
  let tintFrame = 1;
  const PALETTE_SLOTS = () => [PAL.mid, PAL.accent, PAL.glow];
  function stopColor(stop, projector, i, n, out) {
    const pair = projector >> 1, f = i / Math.max(n, 1), turn = 0;
    const t = f + pair * TASTE.colorWalk;
    switch (LASER_COLORS_LIST[stop]) {
      case 'palette': return out.copy(PALETTE_SLOTS()[(pair + turn) % 3]);
      case 'rainbow': return out.setHSL(fract(t), 1, 0.5);
      case 'rgb': return out.copy(RGB[(i + pair + turn) % 3]);
      case 'one': return out.copy(baseColor);
      default: return sampleCycle(GRADIENTS[LASER_COLORS_LIST[stop]], t, out);
    }
  }
  function colorsAt(v, projector, i, n, out) {
    const z = laserColorsAt(v);
    stopColor(z.a, projector, i, n, out);
    return z.t > 0 ? out.lerp(stopColor(z.b, projector, i, n, tintB), z.t) : out;
  }
  // A beam's color from its key (projector plus place across its fan).
  function tintOf(key) {
    const projector = Math.min(LASER_PROJECTORS.length - 1, Math.max(0, Math.floor(key)));
    const n = rig.beamsPerProjector, i = Math.min(LASER_MAX_BEAMS - 1, Math.round((key - projector) * n));
    const slot = projector * LASER_MAX_BEAMS + i;
    if (tintStamp[slot] !== tintFrame) {
      tintStamp[slot] = tintFrame;
      const e = easeInOut(colorsMix.mix);
      colorsAt(colorsMix.to, projector, i, n, tintA);
      if (e < 1) tintA.lerp(colorsAt(colorsMix.from, projector, i, n, tintC), 1 - e);
      tintCache[slot * 3] = tintA.r; tintCache[slot * 3 + 1] = tintA.g; tintCache[slot * 3 + 2] = tintA.b;
    }
    tintOut[0] = tintCache[slot * 3]; tintOut[1] = tintCache[slot * 3 + 1]; tintOut[2] = tintCache[slot * 3 + 2];
    return tintOut;
  }
  // The edge lights' color run: the same colors stop as the beams, laid
  // along the frame (palette steps through the slots, rainbow runs the
  // spectrum from the bottom center to the top center).
  function edgeColors() {
    const e = easeInOut(colorsMix.mix);
    for (let k = 0; k < EDGE_N; k++) {
      const sv = k / (EDGE_N - 1), proj = 2 * Math.floor(sv * 4.999);
      colorsAt(colorsMix.to, proj, k, EDGE_N, tintA);
      if (e < 1) tintA.lerp(colorsAt(colorsMix.from, proj, k, EDGE_N, tintC), 1 - e);
      edgeRGB[k * 3] = tintA.r; edgeRGB[k * 3 + 1] = tintA.g; edgeRGB[k * 3 + 2] = tintA.b;
      edgeBytes[k * 4] = Math.round(clamp(tintA.r) * 255); edgeBytes[k * 4 + 1] = Math.round(clamp(tintA.g) * 255);
      edgeBytes[k * 4 + 2] = Math.round(clamp(tintA.b) * 255); edgeBytes[k * 4 + 3] = 255;
    }
    edgeTex.needsUpdate = true;
  }
  function stepColors(target, step) {
    if (Math.abs(target - colorsMix.to) > 1e-6) {
      colorsMix.from = colorsMix.mix < 0.5 ? colorsMix.from : colorsMix.to;
      colorsMix.to = target; colorsMix.mix = 0;
    }
    colorsMix.mix = Math.min(1, colorsMix.mix + step / TASTE.colorsFade);
  }

  // ------------------------------------------------------------ the haze
  const viewProj = new THREE.Matrix4();
  // Multiple scattering spreads it: three binomial blurs each way, edges
  // clamped. An empty channel (the wall while it is off) skips the work.
  function blur(acc) {
    let any = false;
    for (let i = 0; i < acc.length; i++) if (acc[i] !== 0) { any = true; break; }
    if (!any) return;
    for (let pass = 0; pass < 3; pass++) {
      for (let y = 0; y < GH; y++) {
        const i = y * GW;
        for (let x = 0; x < GW; x++) {
          const a = acc[i + (x > 1 ? x - 2 : 0)], b = acc[i + (x > 0 ? x - 1 : 0)];
          const d = acc[i + (x < GW - 1 ? x + 1 : GW - 1)], e = acc[i + (x < GW - 2 ? x + 2 : GW - 1)];
          glowTmp[i + x] = (a + 4 * b + 6 * acc[i + x] + 4 * d + e) * 0.0625;
        }
      }
      for (let y = 0; y < GH; y++) {
        const a = (y > 1 ? y - 2 : 0) * GW, b = (y > 0 ? y - 1 : 0) * GW, c = y * GW;
        const d = (y < GH - 1 ? y + 1 : GH - 1) * GW, e = (y < GH - 2 ? y + 2 : GH - 1) * GW;
        for (let x = 0; x < GW; x++) {
          acc[c + x] = (glowTmp[a + x] + 4 * glowTmp[b + x] + 6 * glowTmp[c + x] + 4 * glowTmp[d + x] + glowTmp[e + x]) * 0.0625;
        }
      }
    }
  }
  // Blur channels, then store them square-root coded on one shared scale;
  // returns the scale.
  function encode(accs, channel) {
    let max = 0;
    for (const acc of accs) {
      blur(acc);
      for (let i = 0; i < acc.length; i++) if (acc[i] > max) max = acc[i];
    }
    const scale = max > 1e-9 ? max : 1;
    // Stored as a square root: the dark end needs the precision.
    accs.forEach((acc, c) => {
      for (let i = 0; i < acc.length; i++) glowBytes[i * 4 + channel + c] = Math.round(Math.sqrt(acc[i] / scale) * 255);
    });
    return max > 1e-9 ? scale : 0;
  }
  function buildGlow(level, screenLevel, edgeLevel = 0, stripLevel = 0) {
    for (const acc of glowAcc) acc.fill(0);
    screenAcc.fill(0);
    const m = viewProj.elements;
    let cr = 1, cg = 1, cb = 1;
    const splat = (x, y, z, e, acc = null) => {
      const w = m[3] * x + m[7] * y + m[11] * z + m[15];
      if (w < 0.5) return;
      const gx = ((m[0] * x + m[4] * y + m[8] * z + m[12]) / w * 0.5 + 0.5) * GW - 0.5;
      const gy = ((m[1] * x + m[5] * y + m[9] * z + m[13]) / w * 0.5 + 0.5) * GH - 0.5;
      if (gx < -2 || gx > GW + 1 || gy < -2 || gy > GH + 1) return;
      const ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
      for (let k = 0; k < 4; k++) {
        const cx = Math.min(GW - 1, Math.max(0, ix + (k & 1))), cy = Math.min(GH - 1, Math.max(0, iy + (k >> 1)));
        const at = cy * GW + cx, we = e * ((k & 1) ? fx : 1 - fx) * ((k >> 1) ? fy : 1 - fy);
        if (acc) { acc[at] += we; continue; }
        glowAcc[0][at] += we * cr; glowAcc[1][at] += we * cg; glowAcc[2][at] += we * cb;
      }
    };
    // The LED wall lights the haze in front of it.
    if (screenLevel > 0) for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) {
      splat(-SCREEN.x + (i + 0.5) / 8 * 2 * SCREEN.x, SCREEN.y0 + (j + 0.5) / 4 * (SCREEN.y1 - SCREEN.y0), SCREEN.z + 1, 1, screenAcc);
    }
    // The edge lights scatter into the haze in their own colors.
    if (stripLevel > 0) for (const [x, y, z, sv] of STRIP_GLOW) {
      const k = Math.min(EDGE_N - 1, Math.round(sv * (EDGE_N - 1))) * 3;
      cr = edgeRGB[k]; cg = edgeRGB[k + 1]; cb = edgeRGB[k + 2];
      splat(x, y, z, stripLevel * TASTE.edgeGlow * 0.5 * 0.5);
    }
    if (edgeLevel > 0) for (const [x, y, z, sv] of EDGE_GLOW) {
      const k = Math.min(EDGE_N - 1, Math.round(sv * (EDGE_N - 1))) * 3;
      cr = edgeRGB[k]; cg = edgeRGB[k + 1]; cb = edgeRGB[k + 2];
      splat(x, y, z, edgeLevel * TASTE.edgeGlow);
    }
    const g = rig.glow, steps = 14;
    const stride = Math.max(1, Math.floor(rig.glowCount / 700));
    for (let r = 0; r < rig.glowCount; r += stride) {
      const o = r * 7, power = g[o + 6] * stride;
      if (!(power > 0)) continue;
      const t = tintOf(rig.glowKey[r]);
      cr = t[0]; cg = t[1]; cb = t[2];
      const sx = g[o], sy = g[o + 1], sz = g[o + 2];
      const dx = g[o + 3] - sx, dy = g[o + 4] - sy, dz = g[o + 5] - sz;
      const len = Math.hypot(dx, dy, dz) / steps;
      for (let j = 0; j < steps; j++) {
        const f = (j + 0.5) / steps;
        const x = sx + dx * f, y = sy + dy * f, z = sz + dz * f;
        const w = m[3] * x + m[7] * y + m[11] * z + m[15];
        // Haze glow is a radiance: per stretch of screen it does not grow
        // as the beam nears the booth, so weight by screen length only.
        splat(x, y, z, power * len / Math.max(w, 6));
      }
    }
    uniforms.uGlowScale.value = encode(glowAcc, 0) * level;
    uniforms.uScreenGlowScale.value = encode([screenAcc], 3) * screenLevel * TASTE.screenGlow;
    glowTex.needsUpdate = true;
  }

  // ------------------------------------------------------ slider motion
  // Every slider glides like a moving head on a critically damped spring,
  // except intensity, which stays exact so blackouts cut on the beat.
  const SMOOTHED = LASER_KEYS.filter((k) => k !== 'contrast' && k !== 'screen' && k !== 'colors' && k !== 'chase');
  const shown = { ...LASER_DEFAULTS }, vel = Object.fromEntries(SMOOTHED.map((k) => [k, 0]));
  let lastNow = null, snapNext = true;
  // A large pattern move morphs straight to its target instead of passing
  // through every pattern on the way. A preset morph drives the same blend.
  const direct = { from: null, mix: 1, auto: false, to: 0 };
  function stepShown(target, dt) {
    if (snapNext) {
      snapNext = false;
      for (const k of LASER_KEYS) { shown[k] = target[k]; if (k in vel) vel[k] = 0; }
      return;
    }
    const w = TASTE.spring, e = Math.exp(-w * dt);
    for (const k of SMOOTHED) {
      if (k === 'pattern') continue;
      let goal = target[k];
      if (k === 'phase') goal = shown[k] + (((goal - shown[k]) % 1 + 1.5) % 1 - 0.5);
      const x0 = shown[k] - goal, v0 = vel[k], c = v0 + w * x0;
      shown[k] = goal + (x0 + c * dt) * e;
      vel[k] = (v0 - w * c * dt) * e;
      if (k === 'phase') shown[k] = ((shown[k] % 1) + 1) % 1;
    }
    shown.contrast = target.contrast;
    shown.screen = target.screen;
    shown.colors = target.colors;
    shown.chase = target.chase;
    // Pattern: the spring for nearby moves, a direct morph for big ones.
    const goal = target.pattern;
    if (direct.auto) {
      if (Math.abs(goal - direct.to) > 1e-6) {
        // Retargeted mid-morph: start again from whichever end dominates.
        direct.from = direct.mix < 0.5 ? direct.from : direct.to;
        direct.mix = 0; direct.to = goal;
      }
      direct.mix = Math.min(1, direct.mix + dt / TASTE.patternMorph);
      shown.pattern = goal; vel.pattern = 0;
      if (direct.mix >= 1) { direct.auto = false; direct.from = null; }
    } else if (direct.from == null && Math.abs(goal - shown.pattern) > TASTE.patternJump) {
      direct.auto = true; direct.from = shown.pattern; direct.to = goal; direct.mix = 0;
      shown.pattern = goal; vel.pattern = 0;
    } else if (direct.from == null) {
      const x0 = shown.pattern - goal, v0 = vel.pattern, c = v0 + w * x0;
      shown.pattern = goal + (x0 + c * dt) * e;
      vel.pattern = (v0 - w * c * dt) * e;
    } else shown.pattern = goal;
  }

  let clockAt = null, motionCycles = 0, previousRate = laserMotionRate(LASER_DEFAULTS.speed);
  // Auto movement: the kick's fading push, and which move plays.
  let movePush = 0;
  const bandEnv = new Float32Array(8);
  // The strips' kick swap: steps taken, when, and each strip's eased light.
  const swap = { steps: 0, last: -1e9, kick: -1e9, gain: new Float32Array(STRIPS.length).fill(1) };
  // Kicks turn the pattern (a phase offset gliding onto its target) and
  // the song's sections thin or fill the rig (a level that falls slowly
  // and rises at once).
  let turnTarget = 0, turnShown = 0, section = 1;
  const moves = { cur: 0, from: 0, mix: 1, snap: false };
  let kickEnv = 0, ring = 0, ringVel = 0, energyEnv = 0, hazeBaked = false, wallCut = false;
  // The chase: whole steps taken (stepped on the kick, gated), the shown
  // position gliding onto it, and a crossover between chase stops.
  const chase = { steps: 0, pos: 0, last: -1e9, kick: -1e9, kicks: 0, from: LASER_DEFAULTS.chase, to: LASER_DEFAULTS.chase, mix: 1 };
  // The LED wall: two small targets, so a switch crosses from the old
  // screen to the new one. slot holds the current screen's target.
  const wall = { cur: null, prev: null, mix: 1, slot: 0, rt: [null, null], drew: [false, false], wait: [0, 0], on: 0 };
  // A wall stop's kind in the shader: its own visual, the scene it drew,
  // or rings when a scene could not draw.
  const wallKind = (name, drew) => (name in WALL_BASICS ? WALL_BASICS[name] : drew ? 1 : 0);
  function screenTarget(i) {
    const w = wallWidth(), h = Math.max(1, Math.round(w / Math.max(0.2, camera.aspect)));
    if (!wall.rt[i]) wall.rt[i] = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType });
    else if (wall.rt[i].width !== w || wall.rt[i].height !== h) wall.rt[i].setSize(w, h);
    const aspect = SCREEN.x * 2 / (SCREEN.y1 - SCREEN.y0), rt = w / h;
    uniforms.uScreenCrop.value.set(Math.min(1, aspect / rt), Math.min(1, rt / aspect));
    return wall.rt[i];
  }
  const sceneFor = (name) => (name && !(name in WALL_BASICS)
    ? (ctx.scenes || []).find((x) => x && x.name === name && x !== api && x.scene && x.camera) : null);
  // Draws a screen scene into a target, in its wall look; its own settings
  // come back untouched. Returns whether it drew.
  function drawScreen(name, i, signals, dt, now) {
    const r = ctx.renderer, src = sceneFor(name);
    if (!src || !r) return false;
    // A scene the wall runs slower keeps its last frame in between, and
    // gets the whole elapsed time when it does run.
    const hz = WALL_LOOKS[name]?.hz;
    if (hz && wall.drew[i]) {
      wall.wait[i] += dt;
      if (wall.wait[i] < 1 / hz - 1e-3) return true;
      dt = wall.wait[i];
    }
    wall.wait[i] = 0;
    const look = ctx.factoryPresets?.[WALL_LOOKS[name]?.look]?.sceneParams?.[name];
    const own = look && src.params ? { ...src.params } : null;
    try {
      if (own) Object.assign(src.params, look);
      src.update(signals || {}, dt, now);
      const target = screenTarget(i), prev = r.getRenderTarget();
      r.setRenderTarget(target);
      r.render(src.scene, src.camera);
      r.setRenderTarget(prev);
      return true;
    } catch (e) {
      // A scene that cannot draw here leaves the rings on the wall.
      console.warn('app: lasers screen could not draw', name, e);
      return false;
    } finally {
      if (own) Object.assign(src.params, own);
    }
  }
  function stepWall(want, screenLevel, signals, dt, step, now, cut) {
    if (wall.cur === null || cut) { wall.cur = want; wall.prev = null; wall.mix = 1; wall.on = want === 'off' ? 0 : 1; }
    else if (want !== wall.cur) {
      wall.prev = wall.cur; wall.cur = want; wall.mix = 0; wall.slot ^= 1;
      wall.drew[wall.slot] = false; wall.wait[wall.slot] = 0;
    }
    wall.mix = Math.min(1, wall.mix + step / SCREEN_FADE);
    // How lit the wall is, for the light it throws on the room and haze.
    const lit = want === 'off' ? 0 : 1;
    wall.on += Math.sign(lit - wall.on) * Math.min(Math.abs(lit - wall.on), step / SCREEN_FADE);
    const a = wall.slot, b = a ^ 1;
    wall.drew[a] = screenLevel > 0 && drawScreen(wall.cur, a, signals, dt, now);
    if (wall.mix < 1 && wall.prev) wall.drew[b] = screenLevel > 0 && drawScreen(wall.prev, b, signals, dt, now);
    else wall.prev = null;
    const e = wall.mix * wall.mix * (3 - 2 * wall.mix);
    uniforms.uScreenTex.value = wall.rt[a]?.texture || null;
    uniforms.uScreenTexB.value = wall.rt[b]?.texture || wall.rt[a]?.texture || null;
    uniforms.uSceneA.value = wallKind(wall.cur, wall.drew[a]);
    uniforms.uSceneB.value = wall.prev ? wallKind(wall.prev, wall.drew[b]) : 0;
    uniforms.uGainA.value = WALL_LOOKS[wall.cur]?.gain ?? 1;
    uniforms.uGainB.value = WALL_LOOKS[wall.prev]?.gain ?? 1;
    uniforms.uScreenMix.value = wall.prev ? e : 1;
  }
  const tmpColor = new THREE.Color();
  let debug = null;
  const api = {
    name: 'main stage', scene, camera, grain: 0, taste: TASTE, wallLooks: WALL_LOOKS, cores,
    // The room is real geometry: its edges need multisampling.
    msaa: 4,
    // Trails stay in place: kick zoom and wobble would echo the stage.
    fxHint: { steady: true },
    // A loaded logo goes on the LED wall instead of over the whole frame.
    wallLogo: true,
    bloom: { strength: 0.26, gain: 0, kick: 0 },
    paramOrder: ['movement', 'speed', 'pattern', 'form', 'rig', 'complexity', 'formation', 'shape', 'fill', 'tilt', 'phase', 'chase', 'colors', 'color', 'contrast', 'density', 'room', 'edge', 'strips', 'screen', 'wall'],
    paramLabels: { '*': { movement: 'auto movement', edge: 'stage lights', strips: 'LED strips', chase: 'chase', pattern: 'pattern', form: 'type', rig: 'lasers', complexity: 'beams', shape: 'sweep', fill: 'spread', contrast: 'intensity', density: 'haze', room: 'room', screen: 'screen', colors: 'colors', wall: 'screen level' } },
    params: { ...LASER_DEFAULTS },
    // Build from scratch: the original still rig, nothing moving or
    // taking turns until you set it (the panel's button).
    scratchParams: { ...LASER_DEFAULTS, movement: 0, chase: 0 },
    // One line per slider for the panel's hover, saying what you will see.
    paramHelp: {
      pattern: 'The shape the beams make. Each stop morphs into the next.',
      form: 'What each beam is: a needle, a fat beam, a sheet that fills the pattern, or tubes.',
      rig: 'How many projectors fire: the stage first, then the truss, the side walls and the booth.',
      complexity: 'How many beams each projector draws.',
      formation: 'Turns the projectors from aiming outward to crossing inward.',
      shape: 'Pans the whole rig left and right.',
      fill: 'Opens each pattern from tight to wide.',
      tilt: 'Aims the rig up and down.',
      phase: 'Turns the pattern through its cycle: cones rotate, waves travel, the chase runs.',
      movement: 'The rig moves on its own with the music: it swings faster as the track builds, each kick pushes it, and a big hit changes the move. Zero holds the beams exactly where the sliders put them.',
      speed: 'How fast auto movement swings. Turn auto movement up to use it.',
      chase: 'The beams of each fan take turns on the kick: a run sweeping across, bouncing out from the center, odd and even, or filling up and emptying.',
      colors: 'One color for the whole rig, or every beam its own: the palette, rainbow, sunset, ice, toxic or pure RGB.',
      color: 'Moves the beams through the palette. Dimmed while colors is on a multicolor stop.',
      contrast: 'Laser brightness. Zero is a blackout.',
      density: 'How much haze hangs in the air to catch the beams.',
      room: 'Brings up the venue: the stage and the crowd.',
      screen: 'What the LED wall behind the stage plays. Off until you pick something.',
      edge: 'LED edge lights framing the stage, in the lasers\' colors. Zero turns them off.',
      strips: 'Vertical LED strips beside the stage and down the side walls, in the lasers\' colors. Zero turns them off.',
      wall: 'How bright the LED wall is, on its own, apart from the room.',
    },
    // A slider that does nothing right now shows dimmed.
    paramActive(k) {
      if (k === 'speed') return this.params.movement > 0.005;
      if (k === 'wall') return laserScreenAt(this.params.screen) !== 'off';
      // A multicolor stop sets every beam's color itself.
      if (k === 'color') return laserColorsName(this.params.colors) === 'one';
      return true;
    },
    describeParam(k, v) {
      if (k === 'pattern') return laserPatternName(v);
      if (k === 'form') return laserFormName(v);
      if (k === 'screen') return laserScreenAt(v);
      if (k === 'colors') return laserColorsName(v);
      if (k === 'chase') return laserChaseName(v);
      if (k === 'complexity') return String(Math.ceil(laserBeamCount(this.params.pattern, v) - 1e-9));
      if (k === 'speed') { const r = laserMotionRate(v) / laserMotionRate(0.5); return `${r < 0.995 ? r.toFixed(2) : r.toFixed(1)}x`; }
      if (k === 'rig') return String(Math.round(LASER_PROJECTORS.reduce((n, m) => n + laserProjectorPower(v, m.index), 0)));
      return null;
    },
    // A cut (a preset with no morph, a scene coming back) applies at once.
    snapParams() {
      snapNext = true; direct.auto = false; direct.from = null; wallCut = true;
      colorsMix.from = colorsMix.to = this.params.colors; colorsMix.mix = 1;
      chase.from = chase.to = this.params.chase; chase.mix = 1;
    },
    // A preset morph blends the pattern straight from its old value.
    presetMorph(from, to, amount) {
      // Chase, colors and screen are stops: a morph goes straight to the
      // new stop (each crosses over on its own) instead of gliding
      // through the stops between.
      if (to) for (const k of ['chase', 'colors', 'screen']) if (k in to) this.params[k] = to[k];
      if (from == null || !(amount < 1)) { if (!direct.auto) direct.from = null; return; }
      direct.auto = false; direct.from = from.pattern; direct.to = to.pattern; direct.mix = amount;
      this.params.pattern = to.pattern;
    },
    // The host relays the optional free oscillator to a late output.
    getMotionPhase() {
      return clockAt != null && this.params.movement > 0 ? ((motionCycles % 1) + 1) % 1 : null;
    },
    shiftMotionPhase(delta, clockDelta = 0) {
      if (clockAt == null || !(this.params.movement > 0) || !Number.isFinite(delta)) return;
      motionCycles = ((motionCycles + delta) % 1 + 1) % 1;
      if (Number.isFinite(clockDelta)) {
        clockAt += clockDelta;
        // A window whose clock was just corrected by a lot cuts to the
        // move the others show instead of crossfading into it.
        if (Math.abs(clockDelta) > 0.3) moves.snap = true;
      }
    },
    getDebugState() {
      if (!debug) debug = {};
      return Object.assign(debug, {
        beams: rig.beams(), phase: rig.phase, shown: { ...shown }, pattern: rig.pattern, form: rig.form,
        counts: { cores: rig.coreCount, surfaces: rig.surfCount, traces: rig.traceCount, glow: rig.glowCount },
        screen: { want: laserScreenAt(this.params.screen), cur: wall.cur, prev: wall.prev, mix: wall.mix, drew: wall.drew[wall.slot] },
        motionCycles, section, turn: turnShown, strips: { steps: swap.steps, gain: [...swap.gain] }, moves: { ...moves, name: LASER_MOVES[moves.cur] }, camera: camera.position.toArray(), direct: { ...direct }, chase: { ...chase },
        uniforms: { haze: uniforms.uHaze.value, glow: uniforms.uGlowScale.value, ambient: uniforms.uAmbient.value, color: uniforms.uColor.value.toArray() },
      });
    },
    update(signals, dt, timeSeconds = 0) {
      if (!hazeBaked) {
        hazeBaked = true;
        uniforms.uHazeTex.value.dispose();
        uniforms.uHazeTex.value = hazeVolume();
      }
      uniforms.uPointScale.value = clamp(Number(ctx.renderScale?.()) || 1, 0.05, 1);
      const now = Number.isFinite(timeSeconds) ? timeSeconds : 0;
      if (lastNow == null || now - lastNow > 0.3 || now < lastNow) snapNext = true;
      const step = clamp(lastNow == null ? 0 : now - lastNow, 0, 0.05);
      lastNow = now;
      const target = this.params;
      if (direct.from != null && !direct.auto && !(direct.mix < 1)) direct.from = null;
      const snapped = snapNext;
      stepShown(target, step);
      // Integrate only the optional free oscillator, so a speed change at a
      // late clock time cannot teleport the rig. The rate reads the exact
      // slider: integration already keeps a speed change continuous, and
      // windows that share the slider then share the motion.
      // Auto movement follows the music: its pace rises with the track's
      // energy and each kick pushes it forward a little.
      energyEnv += (Math.min(1, signals?.energy || 0) - energyEnv) * (1 - Math.exp(-step * 4));
      const onKick = signals?.onKick || 0;
      const rate = laserMotionRate(target.speed) * (TASTE.moveQuiet + TASTE.moveDrive * energyEnv);
      const elapsed = clockAt == null ? 0 : now - clockAt;
      if (!(Number.isFinite(target.movement) && target.movement > 0)) {
        clockAt = null; motionCycles = 0; movePush = 0;
      } else {
        movePush = movePush * Math.exp(-step / TASTE.moveSettle) + onKick * TASTE.movePush;
        // Which move plays is a function of the shared scene clock alone,
        // a new one every moveRest, so every window (an output screen
        // joining late included) always shows the same move.
        const slot = ((Math.floor(now / TASTE.moveRest) % LASER_MOVES.length) + LASER_MOVES.length) % LASER_MOVES.length;
        const jumped = clockAt == null || elapsed < 0 || elapsed > 0.3 || !Number.isFinite(elapsed);
        if (clockAt == null || elapsed < 0 || !Number.isFinite(elapsed)) motionCycles = (now * rate) % 1;
        else motionCycles = (motionCycles + elapsed * ((previousRate + rate) * 0.5 + movePush)) % 1;
        clockAt = now;
        if (jumped || moves.snap) { moves.cur = slot; moves.mix = 1; moves.snap = false; }
        else if (slot !== moves.cur) { moves.from = moves.cur; moves.cur = slot; moves.mix = 0; }
        moves.mix = Math.min(1, moves.mix + step / TASTE.moveFade);
      }
      previousRate = rate;
      const sampled = { ...shown };
      // The music: the chase steps on the kick (never closer than
      // chaseRest, and on its own through a quiet stretch) and the beams
      // brighten with the energy. Aim stays the sliders' alone, so an
      // automated cue plays back the same every time. Intensity zero stays a
      // blackout.
      if (snapped) { chase.from = chase.to = target.chase; chase.mix = 1; }
      if (Math.abs(target.chase - chase.to) > 1e-6) {
        chase.from = chase.mix < 0.5 ? chase.from : chase.to;
        chase.to = target.chase; chase.mix = 0;
      }
      chase.mix = Math.min(1, chase.mix + step / TASTE.chaseFade);
      if (target.chase > 0 || chase.mix < 1) {
        const since = now - chase.last;
        const hit = (signals?.onKick || 0) > TASTE.chaseKick;
        if (hit) { chase.kick = now; chase.kicks++; }
        if (since < 0 || now < chase.kick) { chase.last = now; chase.kick = Math.min(chase.kick, now); }
        else if ((hit && since >= TASTE.chaseRest)
          || (now - chase.kick >= TASTE.chaseQuiet && since >= TASTE.chaseIdle)) {
          chase.steps++; chase.last = now;
        }
        chase.pos += (chase.steps - chase.pos) * (1 - Math.exp(-step / (TASTE.chaseGlide / 3)));
        if (snapped) chase.pos = chase.steps;
      }
      sampled.contrast = clamp(shown.contrast * (1 - TASTE.pump * 0.5 + TASTE.pump * energyEnv));
      // With auto movement up, each kick turns the pattern a step: cones
      // rotate and waves travel on the beat. At zero, phase is the
      // slider's alone.
      if (target.movement > 0) {
        turnTarget += Math.min(1, onKick) * TASTE.kickTurn * Math.min(1, target.movement * 2);
        turnShown += (turnTarget - turnShown) * (1 - Math.exp(-step / (TASTE.kickTurnGlide / 3)));
        if (snapped) turnShown = turnTarget;
        sampled.phase = ((shown.phase + turnShown) % 1 + 1) % 1;
      } else { turnTarget = turnShown = 0; }
      // Sections: the energy slowly falling away is a breakdown, and the
      // rig thins to a few beams; the energy coming back is the drop, and
      // every beam returns at once. Only how many beams light, never aim.
      // Part of auto movement: at zero the rig keeps every beam.
      const sectionGoal = target.movement > 0 ? smooth01((energyEnv - TASTE.breakLow) / (TASTE.breakHigh - TASTE.breakLow)) : 1;
      section += (sectionGoal - section) * (1 - Math.exp(-step / (sectionGoal > section ? TASTE.sectionRise : TASTE.sectionFall)));
      if (snapped) section = sectionGoal;
      const keep = TASTE.breakKeep + (1 - TASTE.breakKeep) * section;
      const chaseOpts = {
        chasePos: chase.pos, chaseFrom: chase.mix < 1 ? chase.from : null, chaseMix: easeInOut(chase.mix),
        move: moves.cur, moveFrom: moves.mix < 1 ? moves.from : null, moveMix: easeInOut(moves.mix),
        keep,
      };
      if (direct.from != null) {
        rig.sample(sampled, now, { motionCycles, patternFrom: direct.from, patternMix: easeInOut(direct.mix), ...chaseOpts });
      } else rig.sample(sampled, now, { motionCycles, ...chaseOpts });
      const P = rig.params;
      uniforms.uHaze.value = P.density;
      uniforms.uPhase.value = rig.phase;
      uniforms.uTime.value = now;
      uniforms.uRoom.value = P.room;
      uniforms.uFogK.value = 0.006 + P.density * 0.03;
      const c = P.color * 2;
      baseColor.copy(c <= 1 ? PAL.mid : PAL.accent).lerp(c <= 1 ? PAL.accent : PAL.glow, c <= 1 ? c : c - 1);
      if (snapped) { colorsMix.from = colorsMix.to = target.colors; colorsMix.mix = 1; }
      stepColors(target.colors, step);
      tintFrame++;
      // Cores, then where they hit.
      const cd = cores.data, rc = rig.cores;
      let nd = 0;
      const hitVis = clamp(P.room / 0.25);
      for (let i = 0; i < rig.coreCount; i++) {
        const o = i * 9, q = i * LINE_STRIDE, t = tintOf(rig.coreKey[i]);
        for (let k = 0; k < 8; k++) cd[q + k] = rc[o + k];
        cd[q + 8] = t[0]; cd[q + 9] = t[1]; cd[q + 10] = t[2];
        if (rc[o + 8] > 0 && hitVis > 0) {
          dotPos[nd * 3] = rc[o + 3]; dotPos[nd * 3 + 1] = rc[o + 4]; dotPos[nd * 3 + 2] = rc[o + 5];
          dotTint[nd * 3] = t[0]; dotTint[nd * 3 + 1] = t[1]; dotTint[nd * 3 + 2] = t[2];
          dotPow[nd] = rc[o + 6] * (rc[o + 8] === 2 ? 0.4 : 1); nd++;
        }
      }
      // The room, the crowd's rim and the LED tape take the rig's mean
      // color, weighted by power: one color stays exact, a rainbow mixes.
      let mr = 0, mg = 0, mb = 0, mp = 0;
      for (let i = 0; i < rig.glowCount; i++) {
        const pw = rig.glow[i * 7 + 6];
        if (!(pw > 0)) continue;
        const t = tintOf(rig.glowKey[i]);
        mr += t[0] * pw; mg += t[1] * pw; mb += t[2] * pw; mp += pw;
      }
      if (mp > 1e-9) uniforms.uColor.value.setRGB(mr / mp, mg / mp, mb / mp);
      else uniforms.uColor.value.copy(baseColor);
      cores.geo.instanceCount = rig.coreCount;
      cores.buf.needsUpdate = true;
      cores.buf.addUpdateRange(0, rig.coreCount * LINE_STRIDE);
      const td = traces.data, rt = rig.traces;
      for (let i = 0; i < rig.traceCount; i++) {
        const o = i * 7, q = i * LINE_STRIDE, t = tintOf(rig.traceKey[i]);
        for (let k = 0; k < 7; k++) td[q + k] = rt[o + k];
        td[q + 7] = 1.1;
        td[q + 8] = t[0]; td[q + 9] = t[1]; td[q + 10] = t[2];
      }
      traces.geo.instanceCount = hitVis > 0 ? rig.traceCount : 0;
      traces.buf.needsUpdate = true;
      traces.buf.addUpdateRange(0, rig.traceCount * LINE_STRIDE);
      dotGeo.setDrawRange(0, nd);
      dotGeo.attributes.position.needsUpdate = true;
      dotGeo.attributes.aPower.needsUpdate = true;
      dotGeo.attributes.aTint.needsUpdate = true;
      for (let i = 0; i < rig.surfCount; i++) {
        const t = tintOf(rig.surfKey[i]);
        for (let v = 0; v < 3; v++) { const o = i * 9 + v * 3; surfTint[o] = t[0]; surfTint[o + 1] = t[1]; surfTint[o + 2] = t[2]; }
      }
      surfGeo.setDrawRange(0, rig.surfCount * 3);
      surfPosAttr.needsUpdate = true; surfAuxAttr.needsUpdate = true; surfTintAttr.needsUpdate = true;
      surfPosAttr.clearUpdateRanges(); surfAuxAttr.clearUpdateRanges(); surfTintAttr.clearUpdateRanges();
      surfPosAttr.addUpdateRange(0, rig.surfCount * 9); surfAuxAttr.addUpdateRange(0, rig.surfCount * 9);
      surfTintAttr.addUpdateRange(0, rig.surfCount * 9);
      // Apertures flare when a beam points back at the booth.
      const level = Math.pow(P.contrast, 1.45);
      apFlare.fill(0);
      const [cx, cy, cz] = LASER_ROOM.camera.position;
      for (let i = 0; i < rig.centerCount; i++) {
        const o = i * 5, m = LASER_PROJECTORS[rig.centers[o + 4]], [ox, oy, oz] = m.origin;
        const tx = cx - ox, ty = cy - oy, tz = cz - oz, tl = Math.hypot(tx, ty, tz);
        const align = (rig.centers[o] * tx + rig.centers[o + 1] * ty + rig.centers[o + 2] * tz) / tl;
        if (align > 0.985) apFlare[m.index] = Math.max(apFlare[m.index], rig.centers[o + 3] * ((align - 0.985) / 0.015) ** 3);
      }
      for (let i = 0; i < apPow.length; i++) {
        apPow[i] = rig.projectorPower[i] * level * (1 + TASTE.flare * apFlare[i]);
        const t = tintOf(i);
        apTint[i * 3] = t[0]; apTint[i * 3 + 1] = t[1]; apTint[i * 3 + 2] = t[2];
      }
      apGeo.attributes.aPower.needsUpdate = true;
      apGeo.attributes.aTint.needsUpdate = true;
      uniforms.uTraceGain.value = TASTE.traceGain * hitVis * (0.25 + 0.75 * P.density);
      uniforms.uSurfaceGain.value = TASTE.surfaceGain;
      uniforms.uHitGain.value = TASTE.hitGain * hitVis;
      // Lit haze and the room light the rig throws.
      viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      // The LED wall: its own brightness slider, apart from the room and
      // the lasers' intensity, dark while the screen is off, its rings
      // pushed outward by the kick.
      const kickOn = Math.min(1, signals?.onKick || 0);
      const wallLevel = TASTE.wall * Math.pow(clamp(target.wall) / 0.5, 1.5);
      ringVel = ringVel * Math.exp(-step / 0.3) + kickOn * TASTE.ringKick;
      ring = (ring + step * (0.12 + 0.6 * laserMotionRate(P.speed)) + ringVel * step) % 1;
      // The logo: App's emblem, shown on the wall (main.js keeps it off
      // the full frame while lasers shows, see wallLogo). Set before the
      // wall draws: drawn first, the wall bound last frame's logo, which a
      // new emblem had just disposed, and three uploaded it again with
      // nothing left to free it. Every emblem change on main stage kept
      // one more texture (2 MB at 1024x512) until reload
      // (tools/qa_soak.mjs). With no logo the wall holds none, for the
      // same reason.
      const E = ctx.emblemUniforms;
      const logoOn = !!(E && ctx.emblemOn?.());
      uniforms.uLogoOn.value = logoOn ? 1 : 0;
      uniforms.uLogo.value = logoOn ? E.tLogo.value : null;
      if (logoOn) {
        uniforms.uLogoAspect.value = E.uLogoAspect.value;
        // The emblem's size reads as a share of the frame; the wall is far
        // off, so the same slider covers more of it there.
        uniforms.uLogoScale.value = E.uScale.value * TASTE.wallLogo;
        uniforms.uLogoAngle.value = E.uAngle.value;
        uniforms.uLogoOpacity.value = E.uOpacity.value;
        uniforms.uLogoFlash.value = E.uFlash.value;
        uniforms.uLogoInvert.value = E.uInvert.value;
        uniforms.uLogoOwn.value = E.uColor.value;
        if (E.uTint.value) uniforms.uLogoTint.value.copy(E.uTint.value);
      }
      uniforms.uScreen.value = wallLevel;
      stepWall(laserScreenAt(this.params.screen), wallLevel, signals, dt || step, step, now, wallCut);
      // The wall's trails and heat follow App's trails and heat
      // sliders: trails sets how long the wall's picture lingers, heat how
      // hard a kick zooms it out of the center.
      const M = ctx.macros || {};
      const trails = clamp(Number(M.trails ?? 0.5)), heat = clamp(Number(M.heat ?? 0.5));
      uniforms.uWallPersist.value = trails > 0.01 ? (0.3 + 0.48 * trails) * smooth01(trails / 0.1) : 0;
      uniforms.uWallZoom.value = 1 + heat * (0.0015 + 0.018 * kickEnv) * (trails > 0.01 ? 1 : 0);
      compositeWall();
      wallCut = false;
      // The light the wall throws on the room and into the haze.
      const screenLevel = wallLevel * wall.on;
      uniforms.uRing.value = ring;
      uniforms.uEnergy.value = energyEnv;
      uniforms.uScreenLight.value = screenLevel * TASTE.screenLight;
      uniforms.uScreenColor.value.copy(PAL.mid).multiplyScalar(0.25).add(tmpColor.copy(uniforms.uColor.value).multiplyScalar(0.3));
      uniforms.uStrip.value = TASTE.strip * level * (0.3 + 0.7 * P.room);
      // The edge lights: their own slider, zero is off. A blackout
      // (intensity zero) takes them down with the lasers.
      const edgeLevel = TASTE.edge * Math.pow(clamp(target.edge) / 0.5, 1.5) * smooth01(target.contrast / 0.15);
      uniforms.uEdge.value = edgeLevel;
      // The color run feeds the edge lights and the wall's own visuals.
      edgeColors();
      // The music's bands for the wall's spectrum, eased so the bars
      // rise fast and fall slowly.
      const bands = signals?.bands;
      for (let k = 0; k < 8; k++) {
        const v = Math.min(1, Math.max(0, Number(bands?.[k]) || 0));
        bandEnv[k] += (v - bandEnv[k]) * (1 - Math.exp(-step * (v > bandEnv[k] ? 25 : 5)));
      }
      uniforms.uBands0.value.set(bandEnv[0], bandEnv[1], bandEnv[2], bandEnv[3]);
      uniforms.uBands1.value.set(bandEnv[4], bandEnv[5], bandEnv[6], bandEnv[7]);
      edges.visible = edgeLevel > 0;
      // The LED strips: their own slider, zero is off, down in a blackout.
      const stripLevel = TASTE.edge * Math.pow(clamp(target.strips) / 0.5, 1.5) * smooth01(target.contrast / 0.15);
      stripMaterial.uniforms.uStrips.value = stripLevel;
      strips.visible = stripLevel > 0;
      // Each kick swaps the strips, odd ones on then even ones (gated like
      // the chase, and stepping on its own after a quiet stretch). Each
      // strip eases in and out over a few frames instead of cutting.
      {
        const since = now - swap.last, hit = (signals?.onKick || 0) > TASTE.chaseKick;
        if (hit) swap.kick = now;
        if (since < 0 || now < swap.kick) { swap.last = now; swap.kick = Math.min(swap.kick, now); }
        else if ((hit && since >= TASTE.chaseRest) || (now - swap.kick >= TASTE.chaseQuiet && since >= TASTE.chaseIdle)) {
          swap.steps++; swap.last = now;
        }
        const ga = stripGeo.attributes.aGain;
        STRIPS.forEach((st, i) => {
          // Order from the stage outward on each side, so the swap mirrors.
          const k = i % 8, on = (k + swap.steps) % 2 === 0 ? 1 : 0;
          const rate = on > swap.gain[i] ? 0.03 : 0.09;
          swap.gain[i] += (on - swap.gain[i]) * (snapped ? 1 : 1 - Math.exp(-step / rate));
          for (let v = 0; v < 4; v++) ga.array[i * 4 + v] = swap.gain[i];
        });
        ga.needsUpdate = true;
      }
      buildGlow(TASTE.glowGain * Math.pow(P.density, 1.2), screenLevel * (0.5 + 0.5 * P.density), edgeLevel * Math.pow(P.density, 1.2),
        stripLevel * Math.pow(P.density, 1.2));
      let emitted = 0;
      for (let i = 0; i < rig.glowCount; i++) emitted += rig.glow[i * 7 + 6];
      uniforms.uAmbient.value = emitted * TASTE.ambient * (0.4 + 0.6 * P.density) * (0.25 + 1.5 * P.room);
      uniforms.uAir.value = emitted * TASTE.air * Math.pow(P.density, 1.3);
      // The crowd moves with the low end.
      const kick = Math.max(signals?.kick || 0, (signals?.sub || 0) * 0.8);
      kickEnv += (Math.min(1, kick) - kickEnv) * (1 - Math.exp(-step * (kick > kickEnv ? 30 : 6)));
      uniforms.uBounce.value = kickEnv * TASTE.bounce;
      crowd.visible = P.room > 0.01;
    },
    resize(w, h) {
      const width = Math.max(1, Number.isFinite(w) ? w : 1);
      const height = Math.max(1, Number.isFinite(h) ? h : 1);
      camera.aspect = width / height; camera.updateProjectionMatrix();
      uniforms.uResolution.value.set(width, height);
    },
    dispose() {
      for (const g of plantGeos) g.dispose();
      uniforms.uHazeTex.value.dispose();
      for (const t of wall.rt) t?.dispose();
      for (const t of wallFb.rt) t?.dispose();
      wallMat.dispose();
      for (const r of [roomGeo, roomMaterial, screenGeo, screenMaterial, crowdGeo, crowdMaterial, surfGeo, surfMaterial, traces.geo, traces.material,
        edgeGeo, edgeMaterial, edgeTex, stripGeo, stripMaterial, cores.geo, cores.material, dotGeo, dots.material, apGeo, apertures.material, glowTex]) r.dispose();
    },
  };
  return api;
}

const easeInOut = (x) => x * x * (3 - 2 * x);
const smooth01 = (x) => { const t = clamp(x); return t * t * (3 - 2 * t); };
