// Copied from donor/vs3/visual_kit/src/lib/laser-rig.js (the friends' engine, used with permission, 2026-11-19).
// vjw: verbatim.
// A deterministic virtual laser rig inside a concert room. Distances are
// metres: x across the room, y up from the floor, +z from the stage toward
// the sound booth. Every scan sample is one straight projector ray that ends
// on a room surface. No renderer or browser dependency, so a future stage
// application can host the same rig.

// Slider stops, in slider order. Neighbors morph into each other, so the
// order is part of the look: each step changes one idea at a time.
export const LASER_PATTERNS = Object.freeze([
  'beams', 'fan', 'cross', 'lattice', 'wave', 'chase', 'spiral', 'cone', 'tunnel', 'sky', 'star',
]);
// The beam slider's four stops: a needle, a fat beam, the scanned sheet
// that joins neighbors along the pattern, and hollow tubes.
export const LASER_FORMS = Object.freeze(['needle', 'thick', 'sheet', 'tube']);
// The colors slider's stops: the whole rig in one color, or every beam its
// own, walking across each fan.
export const LASER_COLORS = Object.freeze(['one', 'palette', 'rainbow', 'sunset', 'ice', 'toxic', 'rgb']);
// The first look: twelve projectors (every one with its housing in view;
// the booth and back-wall four fire from behind the camera), a dense fan
// of beams in rainbow, thick haze, the chase alternating and auto
// movement on. Alec tuned toward this on 2026-11-07.
export const LASER_DEFAULTS = Object.freeze({
  pattern: 0, form: 0.08, rig: 0.71, complexity: 0.9, formation: 0.65,
  shape: 0.5, fill: 0.55, tilt: 0.25, phase: 0, movement: 0.5, speed: 0.4,
  color: 0.5, contrast: 0.85, density: 0.65, room: 0.45, screen: 0,
  colors: 0.3333333333333333, wall: 0.5, chase: 0.75, // rainbow: stop 2 of 0..6
  edge: 0.5, strips: 0.5,
});
export const LASER_KEYS = Object.freeze(Object.keys(LASER_DEFAULTS));

export const LASER_ROOM = Object.freeze({
  min: Object.freeze([-17, 0, -19]), max: Object.freeze([17, 12.5, 27]),
  stage: Object.freeze({ halfWidth: 12, top: 1.4, front: -11 }),
  crowd: Object.freeze({ halfWidth: 15.2, front: -10, back: 12.8, head: 1.75 }),
  camera: Object.freeze({ position: Object.freeze([0, 4.0, 18.5]), target: Object.freeze([0, 7.0, -12]), fov: 60 }),
});
// Hit surface ids, in the order the stage view shades them.
export const LASER_SURFACES = Object.freeze(['air', 'floor', 'crowd', 'stage', 'ceiling', 'left', 'right', 'back', 'rear']);

const TAU = Math.PI * 2;
const SKY_Y = 5.6; // liquid sky plane height as it passes the booth
// Beams cross the crowd and the booth no lower than this, a few metres
// over the heads, the way show rigs zone their beams above the audience.
const SAFE_Y = 5.4;
export const LASER_SAFE_HEIGHT = SAFE_Y;

// Mounts come in mirrored pairs, in the order the lasers slider adds them:
// three pairs on the stage lip, two on the overhead truss, the front of
// the side walls, the booth roof firing back at the stage, then the rear
// of the side walls. side: signed position along its row (formation aims
// by it, and the negative member of each pair mirrors its pattern).
// pitch: the mount's resting vertical aim. reach: distance across the room
// along its aim, used to level the liquid sky. Side-wall patterns turn a
// quarter, so their fans open up and down and face the booth instead of
// stacking edge-on. The two walls sit a little apart in depth so a level
// beam and its mirror never share a line from the booth.
const MOUNT_SPECS = [
  [[-1.7, 2.2, -11.6], [0, 0, 1], -0.2, 0, 30], [[1.7, 2.2, -11.6], [0, 0, 1], 0.2, 0, 30],
  [[-5.1, 2.2, -11.6], [0, 0, 1], -0.6, 1, 30], [[5.1, 2.2, -11.6], [0, 0, 1], 0.6, 1, 30],
  [[-8.5, 2.2, -11.6], [0, 0, 1], -1, 0, 30], [[8.5, 2.2, -11.6], [0, 0, 1], 1, 0, 30],
  [[-4, 10.1, -12.6], [0, -0.3, 1], -0.4, 1, 30], [[4, 10.1, -12.6], [0, -0.3, 1], 0.4, 1, 30],
  [[-10, 10.1, -12.6], [0, -0.3, 1], -1, 0, 30], [[10, 10.1, -12.6], [0, -0.3, 1], 1, 0, 30],
  [[-16.6, 9.6, -3.8], [1, -0.06, 0], 0.5, 0, 33], [[16.6, 9.6, -2.2], [-1, -0.06, 0], -0.5, 0, 33],
  [[-5.5, 7.4, 16.4], [0, -0.22, -1], 0.6, 1, 28], [[5.5, 7.4, 16.4], [0, -0.22, -1], -0.6, 1, 28],
  [[-16.6, 9.6, 7.2], [1, -0.06, 0], -0.5, 1, 33], [[16.6, 9.6, 8.8], [-1, -0.06, 0], 0.5, 1, 33],
];
const norm3 = (v) => { const n = Math.hypot(v[0], v[1], v[2]); return [v[0] / n, v[1] / n, v[2] / n]; };
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const LASER_PROJECTORS = Object.freeze(MOUNT_SPECS.map(([origin, aim, side, alt, reach], i) => {
  const roll = Math.abs(aim[0]) > 0.5 ? 1 : 0;
  const forward = norm3(aim);
  const right = norm3(cross3([0, 1, 0], forward));
  const up = cross3(forward, right);
  return Object.freeze({
    index: i, pair: i >> 1, origin: Object.freeze([...origin]), forward: Object.freeze(forward),
    right: Object.freeze(right), up: Object.freeze(up), side, alt, reach, roll,
    pitch: forward[1] / Math.hypot(forward[0], forward[2]),
  });
}));
export const LASER_PAIRS = LASER_PROJECTORS.length / 2;

// closed: the scan path returns to its start (cone, tunnel, star).
// lo..hi: beams per projector across the beams slider.
const PATTERN = [
  { closed: false, lo: 1, hi: 13 },  // beams
  { closed: false, lo: 3, hi: 33 },  // fan
  { closed: false, lo: 2, hi: 24 },  // cross
  { closed: false, lo: 3, hi: 21 },  // lattice
  { closed: false, lo: 4, hi: 40 },  // wave
  { closed: false, lo: 5, hi: 29 },  // chase
  { closed: false, lo: 6, hi: 40 },  // spiral
  { closed: true, lo: 6, hi: 48 },   // cone
  { closed: true, lo: 8, hi: 56 },   // tunnel
  { closed: false, lo: 6, hi: 44 },  // sky
  { closed: true, lo: 8, hi: 48 },   // star
];
export const LASER_MAX_BEAMS = 56; // per projector
const FOOT = 10; // sub-rays across one beam's scanned footprint
const MAX_CENTERS = LASER_PROJECTORS.length * LASER_MAX_BEAMS;

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const finite = (v, fallback) => typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const mix = (a, b, f) => a + (b - a) * f;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const fract = (x) => x - Math.floor(x);
const hash = (i, p) => fract(Math.sin(i * 12.9898 + p * 78.233) * 43758.5453);

export function sanitizeLaserParams(input = {}) {
  const p = {};
  for (const [k, v] of Object.entries(LASER_DEFAULTS)) p[k] = clamp(finite(input?.[k], v));
  return p;
}

export const laserMotionRate = (speed) => 0.12 * Math.pow(4, (clamp(finite(speed, 0.5)) - 0.5) * 2);

// Each pattern holds across the middle of its slider zone and morphs to
// its neighbor across the rest, so automation can hit a pure look.
export function laserPatternAt(value) {
  const s = clamp(finite(value, 0)) * (LASER_PATTERNS.length - 1);
  const a = Math.min(LASER_PATTERNS.length - 2, Math.floor(s));
  return { a, b: a + 1, t: smooth(0.2, 0.8, s - a) };
}
// Colors hold across the middle of each stop and cross to the next, the
// way patterns do.
export function laserColorsAt(value) {
  const s = clamp(finite(value, 0)) * (LASER_COLORS.length - 1);
  const a = Math.min(LASER_COLORS.length - 2, Math.floor(s));
  return { a, b: a + 1, t: smooth(0.2, 0.8, s - a) };
}
// Auto movement's moves, in the order the music walks through them. Each
// gives every projector a pan, a lift and a scissor (mirrored pairs
// crossing) at clock c, scaled by the movement amount:
//   eight    the whole rig in a figure-eight, pairs scissoring
//   wave     a ripple running across the rig, each projector a beat late
//   scissor  mirrored pairs crossing in and out while the rig breathes
//   circle   every projector circles, neighbors in opposite directions
//   swarm    every projector on its own path, a crowd sweep
export const LASER_MOVES = Object.freeze(['eight', 'wave', 'scissor', 'circle', 'swarm']);
function moveAt(move, c, mount, out) {
  const side = mount.side, alt = mount.alt ? Math.PI : 0;
  switch (LASER_MOVES[move]) {
    case 'wave': {
      const w = c - 2.2 * side - 0.9 * mount.pair;
      out[0] = 0.32 * Math.sin(w); out[1] = 0.2 * Math.sin(w + 1.2); out[2] = 0; break;
    }
    case 'scissor':
      out[0] = 0.08 * Math.sin(c); out[1] = 0.1 * Math.sin(2 * c); out[2] = 0.62 * Math.sin(c); break;
    case 'circle':
      out[0] = 0.34 * Math.cos(c + alt); out[1] = 0.19 * Math.sin(c + alt); out[2] = 0; break;
    case 'swarm': {
      const h = mount.index * 2.399;
      out[0] = 0.46 * Math.sin(c + h); out[1] = 0.2 * Math.sin(2 * c + h * 1.3); out[2] = 0; break;
    }
    default: // eight
      out[0] = 0.55 * Math.sin(c); out[1] = 0.12 * Math.sin(2 * c + 0.6); out[2] = 0.28 * Math.cos(c);
  }
  return out;
}
const MOVE_A = [0, 0, 0], MOVE_B = [0, 0, 0];

// The chase slider's stops: every beam on, or the beams of each fan
// taking turns, one step per kick.
export const LASER_CHASES = Object.freeze(['off', 'sweep', 'bounce', 'alternate', 'fill']);
export function laserChaseAt(value) {
  const s = clamp(finite(value, 0)) * (LASER_CHASES.length - 1);
  const a = Math.min(LASER_CHASES.length - 2, Math.floor(s));
  return { a, b: a + 1, t: smooth(0.2, 0.8, s - a) };
}
export const laserChaseName = (v) => LASER_CHASES[Math.round(clamp(finite(v, 0)) * (LASER_CHASES.length - 1))];
// Steps in one pass of a sweep, bounce or fill.
const CHASE_STEPS = 6;
// How lit beam i of n is at chase position pos (whole steps; the fraction
// is the move to the next one). Lit beams run at full power, the rest go
// dark, with soft edges so a step glides instead of popping.
function chaseStopGain(stop, i, n, pos) {
  const u = (i + 0.5) / Math.max(n, 1);
  const lit = (d, w) => 1 - smooth(w * 0.5, w * 0.5 + 0.12, d);
  switch (LASER_CHASES[stop]) {
    case 'sweep': {
      // A run of beams travels across the fan, wrapping round.
      const h = fract((pos + 0.5) / CHASE_STEPS), d = Math.abs(fract(u - h + 0.5) - 0.5);
      return lit(d, 1 / CHASE_STEPS + 0.05);
    }
    case 'bounce': {
      // Out from the center to the edges, then back in.
      const k = fract(pos / (2 * CHASE_STEPS)) * 2, h = (k < 1 ? k : 2 - k) * (1 + 1 / CHASE_STEPS) - 0.5 / CHASE_STEPS;
      return lit(Math.abs(Math.abs(u - 0.5) * 2 - h), 2 / CHASE_STEPS);
    }
    case 'alternate': {
      // Odd beams, then even beams.
      const f = fract(pos / 2) * 2, on = i % 2 === 0 ? 1 : 0;
      const e = smooth(0, 1, f < 1 ? f : f - 1);
      return f < 1 ? mix(on, 1 - on, e) : mix(1 - on, on, e);
    }
    case 'fill': {
      // The fan fills one step at a time, then empties the same way.
      const k = fract(pos / (2 * CHASE_STEPS)) * 2 * CHASE_STEPS, edge = (k < CHASE_STEPS ? k + 1 : k + 1 - CHASE_STEPS) / CHASE_STEPS;
      const g = 1 - smooth(edge - 0.06, edge + 0.06, u);
      return k < CHASE_STEPS ? g : 1 - g;
    }
    default: return 1;
  }
}
function chaseGain(value, i, n, pos) {
  const z = laserChaseAt(value);
  const a = chaseStopGain(z.a, i, n, pos);
  return z.t > 0 ? mix(a, chaseStopGain(z.b, i, n, pos), z.t) : a;
}
export const laserColorsName = (v) => LASER_COLORS[Math.round(clamp(finite(v, 0)) * (LASER_COLORS.length - 1))];
// The beam slider: thickness grows, then gives way to the scanned sheet,
// which then curls into tubes.
export function laserFormAt(value) {
  const f = clamp(finite(value, 0));
  return {
    thick: f < 0.3 ? smooth(0, 0.3, f) : 1 - smooth(0.3, 0.55, f),
    stretch: smooth(0.32, 0.66, f),
    tube: smooth(0.7, 0.98, f),
  };
}
// What a pattern or beam type slider position shows, for the panel.
// Beams per projector for a pattern and beams slider position.
export function laserBeamCount(pattern, complexity) {
  const z = laserPatternAt(pattern), c = clamp(finite(complexity, 0));
  return Math.max(1, mix(mix(PATTERN[z.a].lo, PATTERN[z.a].hi, c), mix(PATTERN[z.b].lo, PATTERN[z.b].hi, c), z.t));
}
// The nearest stop names a position, so the label never grows mid-morph.
export function laserPatternName(value) {
  const z = laserPatternAt(value);
  return LASER_PATTERNS[z.t < 0.5 ? z.a : z.b];
}
export function laserFormName(value) {
  const f = clamp(finite(value, 0));
  return f < 0.15 ? 'needle' : f < 0.46 ? 'thick' : f < 0.84 ? 'sheet' : 'tube';
}
// Mirrored pairs fade in one after another. Each count holds across the
// middle of its slider zone, like the pattern stops.
export function laserProjectorPower(rig, index) {
  const s = clamp(finite(rig, 0)) * (LASER_PAIRS - 1);
  const k = Math.min(LASER_PAIRS - 2, Math.floor(s));
  return clamp(1 + k + smooth(0.25, 0.75, s - k) - (index >> 1));
}

// A rectangular scan is the same physical operation as a circular one:
// the scanner samples a closed angular path, then light travels straight.
function rectangularScan(q) {
  const u = fract(q) * 4;
  if (u < 1) return [mix(-1, 1, u), 1];
  if (u < 2) return [1, mix(1, -1, u - 1)];
  if (u < 3) return [mix(1, -1, u - 2), -1];
  return [-1, mix(-1, 1, u - 3)];
}

// Local slopes [x, y] and a power multiplier for beam i of n (n may be
// fractional) in pattern k, written for the right-hand member of a pair.
function patternPoint(out, k, i, n, a, S, mount, lift) {
  const closed = PATTERN[k].closed;
  const u = closed ? 0 : (2 * i - (n - 1)) / Math.max(n - 1, 1);
  const q = closed ? i / Math.max(n, 1) : (u + 1) / 2;
  const s = Math.abs(mount.side);
  let x = 0, y = 0, m = 1;
  switch (k) {
    case 0: {
      // Phase rocks the rake, rolling it about its aim.
      const roll = Math.sin(a) * 0.6, bx = u * S * 0.66, by = Math.abs(u) * S * 0.16;
      x = bx * Math.cos(roll) - by * Math.sin(roll); y = bx * Math.sin(roll) + by * Math.cos(roll); break;
    }
    case 1: {
      const roll = Math.sin(a) * 0.7 + s * 0.16;
      x = u * S * Math.cos(roll); y = u * S * Math.sin(roll); break;
    }
    case 2: {
      // Phase scissors the crossing diagonals open and shut.
      const k = 0.64 * Math.cos(a);
      x = u * S * 0.86; y = (u * (mount.alt ? k : -k) + 0.3) * S; break;
    }
    case 3: {
      // Each projector stacks a leaning column; the mirrored pair leans
      // the other way, and the two families cross into a net.
      const lean = Math.sin(a) * 0.35;
      const lx = mix(0.15, -0.85, q) * S, ly = u * S * 0.62;
      x = lx * Math.cos(lean) - ly * Math.sin(lean); y = lx * Math.sin(lean) + ly * Math.cos(lean); break;
    }
    case 4: x = u * S; y = Math.sin(q * TAU + a + s * 0.8) * S * 0.46; break;
    case 5: {
      // The lit run carries the power the dark beams give up.
      x = u * S * 0.92; y = (1 - u * u) * S * 0.12;
      const d = fract(q - fract(a / TAU + 0.5) + 0.5) - 0.5;
      m = (0.05 + 0.95 * Math.exp(-(d * 6) * (d * 6))) * 2.4; break;
    }
    case 6: {
      const r = S * (0.1 + 0.9 * q), th = q * TAU * 1.35 + a + mount.alt * Math.PI;
      x = Math.cos(th) * r; y = Math.sin(th) * r * 0.75; break;
    }
    case 7: x = Math.cos(q * TAU + a) * S; y = Math.sin(q * TAU + a) * S * 0.72; break;
    case 8: {
      const r = rectangularScan(q + a / TAU);
      x = r[0] * S; y = r[1] * S * 0.72; break;
    }
    case 9:
      // A near-level plane just over the crowd, rippling: liquid sky.
      x = u * S * 1.5;
      y = (SKY_Y - mount.origin[1]) / mount.reach - mount.pitch - lift * 0.85
        + Math.sin(u * Math.PI * 1.5 + a + s) * S * 0.05;
      break;
    default: {
      const th = q * TAU + a, r = S * (0.45 + 0.55 * hash(i, mount.index));
      x = Math.cos(th) * r * 1.25; y = Math.sin(th) * r * 0.9;
    }
  }
  // The negative member of a pair mirrors its partner. Wall patterns then
  // turn a quarter (the liquid sky stays level).
  const mirror = mount.side < 0 ? -1 : 1;
  x *= mirror;
  if (mount.roll && k !== 9) { const t = x; x = -y * mirror; y = t * mirror; }
  out[0] = x; out[1] = y; out[2] = m;
}

// One slider position: the pattern pair it sits between, blended.
function blendedPoint(out, tmp, z, i, n, a, S, mount, lift) {
  patternPoint(out, z.a, i, n, a, S, mount, lift);
  if (z.t > 0) {
    patternPoint(tmp, z.b, i, n, a, S, mount, lift);
    out[0] = mix(out[0], tmp[0], z.t); out[1] = mix(out[1], tmp[1], z.t); out[2] = mix(out[2], tmp[2], z.t);
  }
}

// The audience zone: a beam crossing the crowd leaves it no lower than
// SAFE_Y. Only the rise changes, so the beam keeps its heading, and the
// floor is soft, so a pattern pressed against it flattens smoothly.
// zoneVis: how much of the beam survives. A beam aimed well into the zone
// blanks, as show software does, instead of piling onto the boundary.
let zoneVis = 1;
function safeRise(ox, oy, oz, dx, dy, dz) {
  zoneVis = 1;
  const { crowd } = LASER_ROOM;
  let t0 = 0, t1 = Infinity;
  if (Math.abs(dx) > 1e-9) {
    const a = (-crowd.halfWidth - ox) / dx, b = (crowd.halfWidth - ox) / dx;
    t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b));
  } else if (Math.abs(ox) >= crowd.halfWidth) return dy;
  // The zone runs from the crowd's front to the rear wall: the booth too.
  const back = LASER_ROOM.max[2];
  if (Math.abs(dz) > 1e-9) {
    const a = (crowd.front - oz) / dz, b = (back - oz) / dz;
    t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b));
  } else if (oz <= crowd.front || oz >= back) return dy;
  if (!(t1 > t0) || !Number.isFinite(t1)) return dy;
  const floor = (SAFE_Y - oy) / t1, k = 0.03;
  zoneVis = smooth(-0.14, -0.02, dy - floor);
  return (dy + floor + Math.sqrt((dy - floor) * (dy - floor) + k * k)) / 2;
}

// Ray-room intersection. Returns the parameter t along (dx, dy, dz) and
// writes the surface id into hit[0].
const SURF = Object.fromEntries(LASER_SURFACES.map((s, i) => [s, i]));
function hitRoom(ox, oy, oz, dx, dy, dz, hit) {
  const { min, max, stage, crowd } = LASER_ROOM;
  let t = Infinity, id = SURF.air;
  if (dx > 1e-9) { const k = (max[0] - ox) / dx; if (k < t) { t = k; id = SURF.right; } }
  else if (dx < -1e-9) { const k = (min[0] - ox) / dx; if (k < t) { t = k; id = SURF.left; } }
  if (dz > 1e-9) { const k = (max[2] - oz) / dz; if (k < t) { t = k; id = SURF.rear; } }
  else if (dz < -1e-9) { const k = (min[2] - oz) / dz; if (k < t) { t = k; id = SURF.back; } }
  if (dy > 1e-9) { const k = (max[1] - oy) / dy; if (k < t) { t = k; id = SURF.ceiling; } }
  else if (dy < -1e-9) {
    // Downward rays end on the crowd's heads, the stage deck or the floor.
    let k = (crowd.head - oy) / dy;
    const cx = ox + dx * k, cz = oz + dz * k;
    if (oy > crowd.head && Math.abs(cx) < crowd.halfWidth && cz > crowd.front && cz < crowd.back) {
      if (k < t) { t = k; id = SURF.crowd; }
    } else {
      k = (stage.top - oy) / dy;
      const sx = ox + dx * k, sz = oz + dz * k;
      if (oy > stage.top && Math.abs(sx) < stage.halfWidth && sz < stage.front) {
        if (k < t) { t = k; id = SURF.stage; }
      } else {
        k = (min[1] - oy) / dy;
        if (k < t) { t = k; id = SURF.floor; }
      }
    }
  }
  hit[0] = id;
  return t;
}

// Preallocated sampler. sample() refills every buffer in place, so the
// renderer allocates nothing per frame.
export class LaserRig {
  constructor() {
    this.params = sanitizeLaserParams();
    // Core rays: start xyz, end xyz, power, width (display px), surface id.
    this.cores = new Float32Array(MAX_CENTERS * 3 * 9);
    // Which beam drew each core, surface triangle, trace and glow ray:
    // projector index plus the beam's place across its fan (0..1), so a
    // view can color every beam on its own.
    this.coreKey = new Float32Array(MAX_CENTERS * 3);
    this.surfKey = new Float32Array(MAX_CENTERS * FOOT);
    this.traceKey = new Float32Array(MAX_CENTERS * FOOT);
    this.glowKey = new Float32Array(MAX_CENTERS * 3);
    this.coreCount = 0;
    // Scanned surfaces: three vertices per triangle, xyz, then distance
    // from the aperture, power per radian of scan, and the scan position
    // times that distance (divided back per pixel for the strands).
    this.surfPos = new Float32Array(MAX_CENTERS * FOOT * 9);
    this.surfAux = new Float32Array(MAX_CENTERS * FOOT * 9);
    this.surfCount = 0;
    // Where scanned surfaces meet the room: start xyz, end xyz, power.
    this.traces = new Float32Array(MAX_CENTERS * FOOT * 7);
    this.traceCount = 0;
    // Light the haze carries: start xyz, end xyz, power.
    this.glow = new Float32Array(MAX_CENTERS * 3 * 7);
    this.glowCount = 0;
    // Beam centers, for tests and late-output alignment: xyz direction, power.
    this.centers = new Float32Array(MAX_CENTERS * 5);
    this.centerCount = 0;
    this.projectorPower = new Float32Array(LASER_PROJECTORS.length);
    this.totalPower = 0;
    this.phase = 0;
    this.pattern = laserPatternAt(0);
    this.form = laserFormAt(0);
    this.beamsPerProjector = 1;
    this._pts = new Float64Array(LASER_MAX_BEAMS * 3 + 6);
    this._foot = new Float64Array(FOOT * 2);
    this._hit = new Float64Array(FOOT * 5 + 10);
    this._id = [0];
    this._tmp = [0, 0, 0];
    this._tmp2 = [0, 0, 0];
    this._tmp3 = [0, 0, 0];
  }

  // params: the scene's 0..1 controls. motionCycles: the free oscillator
  // position the host integrated; without it, time alone drives motion.
  // patternFrom/patternMix: a direct morph from another pattern value,
  // skipping the patterns between the two.
  // chasePos: the chase position in whole steps (the host steps it on the
  // kick); chaseFrom/chaseMix: a crossover from another chase stop.
  // move/moveFrom/moveMix: auto movement's current move (LASER_MOVES
  // index) and a crossover from the previous one.
  // keep: the share of each fan's beams lit (a breakdown thins the rig,
  // a drop fills it), a fixed scatter so the same beams stay.
  sample(input, timeSeconds = 0, { motionCycles = null, patternFrom = null, patternMix = 1, chasePos = 0, chaseFrom = null, chaseMix = 1, move = 0, moveFrom = null, moveMix = 1, keep = 1 } = {}) {
    const p = this.params = sanitizeLaserParams(input);
    const rate = laserMotionRate(p.speed);
    const cycles = motionCycles == null ? finite(timeSeconds, 0) * rate : finite(motionCycles, 0);
    const clock = p.movement === 0 ? 0 : fract(cycles) * TAU;
    // Phase turns the pattern itself (cones rotate, waves travel, the
    // chase runs). Auto movement swings the projectors on their own, the
    // way programmed moving heads do, through one of LASER_MOVES. The two
    // never act on the same thing (Alec, 2026-10-15: they used to look
    // alike).
    const angle = p.phase * TAU;
    const amount = p.movement;
    const mv = Math.min(LASER_MOVES.length - 1, Math.max(0, Math.round(finite(move, 0))));
    const mvFrom = moveFrom == null ? null : Math.min(LASER_MOVES.length - 1, Math.max(0, Math.round(finite(moveFrom, 0))));
    const mvMix = mvFrom == null ? 1 : clamp(finite(moveMix, 1));
    this.phase = fract(angle / TAU);
    const S = 0.025 + 0.63 * p.fill;
    const baseSweep = (p.shape - 0.5) * 1.25;
    const baseLift = 0.045 + 0.72 * p.tilt;
    const pat = this.pattern = laserPatternAt(p.pattern);
    const fm = patternFrom == null ? 1 : clamp(finite(patternMix, 1));
    const from = fm < 1 ? laserPatternAt(clamp(finite(patternFrom, p.pattern))) : null;
    const form = this.form = laserFormAt(p.form);
    const countAt = (z) => mix(mix(PATTERN[z.a].lo, PATTERN[z.a].hi, p.complexity),
      mix(PATTERN[z.b].lo, PATTERN[z.b].hi, p.complexity), z.t);
    const closedAt = (z) => mix(PATTERN[z.a].closed ? 1 : 0, PATTERN[z.b].closed ? 1 : 0, z.t);
    const n = Math.max(1, from ? mix(countAt(from), countAt(pat), fm) : countAt(pat));
    const N = Math.min(LASER_MAX_BEAMS, Math.ceil(n - 1e-9));
    this.beamsPerProjector = n;
    // Scanner dwell splits across strokes, so a dense scan cannot turn the
    // room white. Intensity zero is a hard blackout.
    const level = Math.pow(p.contrast, 1.45) * Math.pow(8 / n, 0.42);
    const closedness = from ? mix(closedAt(from), closedAt(pat), fm) : closedAt(pat);
    const coreWidth = 0.55 + 7.5 * Math.pow(form.thick, 1.6);
    const { stretch, tube } = form;
    const pts = this._pts, foot = this._foot, hits = this._hit, id = this._id;
    const A = this._tmp, B = this._tmp2, C = this._tmp3;
    let nc = 0, ns = 0, nt = 0, ng = 0, nb = 0, total = 0;
    const cores = this.cores, sp = this.surfPos, sa = this.surfAux, tr = this.traces, gl = this.glow, ce = this.centers;
    const ck = this.coreKey, sk = this.surfKey, tk = this.traceKey, gk = this.glowKey;
    let key = 0;

    for (const mount of LASER_PROJECTORS) {
      const pw = this.projectorPower[mount.index] = p.contrast === 0 ? 0 : laserProjectorPower(p.rig, mount.index);
      if (!(pw > 0)) continue;
      let pan = 0, swingLift = 0, scissor = 0;
      if (amount > 0) {
        moveAt(mv, clock, mount, MOVE_A);
        if (mvMix < 1) {
          moveAt(mvFrom, clock, mount, MOVE_B);
          for (let k = 0; k < 3; k++) MOVE_A[k] = mix(MOVE_B[k], MOVE_A[k], mvMix);
        }
        pan = amount * MOVE_A[0]; swingLift = amount * MOVE_A[1]; scissor = amount * MOVE_A[2];
      }
      const sweep = baseSweep + pan, lift = baseLift + swingLift;
      const heading = mount.side * (mix(0.42, -0.72, p.formation) + scissor) + sweep;
      const [ox, oy, oz] = mount.origin, F = mount.forward, R = mount.right, U = mount.up;
      // Pattern positions for this projector, blended between the two
      // neighboring patterns, in local slopes.
      for (let i = 0; i < N; i++) {
        blendedPoint(A, B, pat, i, n, angle, S, mount, lift);
        if (from) {
          blendedPoint(C, B, from, i, n, angle, S, mount, lift);
          A[0] = mix(C[0], A[0], fm); A[1] = mix(C[1], A[1], fm); A[2] = mix(C[2], A[2], fm);
        }
        pts[i * 3] = heading + A[0]; pts[i * 3 + 1] = lift + A[1]; pts[i * 3 + 2] = A[2];
      }
      const ray = (lx, ly, out, at) => {
        // World direction from local slopes, then where it meets the room.
        const dx = F[0] + R[0] * lx + U[0] * ly, dz = F[2] + R[2] * lx + U[2] * ly;
        const dy = safeRise(ox, oy, oz, dx, F[1] + R[1] * lx + U[1] * ly, dz);
        const t = hitRoom(ox, oy, oz, dx, dy, dz, id);
        out[at] = ox + dx * t; out[at + 1] = oy + dy * t; out[at + 2] = oz + dz * t; out[at + 3] = id[0];
        out[at + 4] = zoneVis;
      };
      const pushCore = (x, y, z, s, power, width) => {
        const o = nc * 9;
        cores[o] = ox; cores[o + 1] = oy; cores[o + 2] = oz;
        cores[o + 3] = x; cores[o + 4] = y; cores[o + 5] = z;
        cores[o + 6] = power; cores[o + 7] = width; cores[o + 8] = s; ck[nc] = key; nc++;
      };
      const pushGlow = (x, y, z, power) => {
        const o = ng * 7;
        gl[o] = ox; gl[o + 1] = oy; gl[o + 2] = oz; gl[o + 3] = x; gl[o + 4] = y; gl[o + 5] = z; gl[o + 6] = power; gk[ng] = key; ng++;
      };
      for (let i = 0; i < N; i++) {
        let w = clamp(n - i);
        if (keep < 1) {
          // Beam 0 always stays; the rest drop out in a golden-ratio
          // scatter, so a thin rig still spans the whole fan.
          const r = i === 0 ? 0 : fract(i * 0.6180339887);
          w *= 1 - smooth(keep - 0.08, keep + 0.08, r);
        }
        if (p.chase > 0 || chaseFrom != null) {
          const g = chaseGain(p.chase, i, n, chasePos);
          w *= chaseFrom == null || chaseMix >= 1 ? g : mix(chaseGain(chaseFrom, i, n, chasePos), g, chaseMix);
        }
        const px = pts[i * 3], py = pts[i * 3 + 1];
        key = mount.index + Math.min(0.999, i / n);
        ray(px, py, hits, 0);
        const power = level * pw * w * pts[i * 3 + 2] * hits[4];
        const beamPower = level * pw * w * pts[i * 3 + 2];
        const cx = hits[0], cy = hits[1], cz = hits[2];
        const dlen = Math.hypot(cx - ox, cy - oy, cz - oz) || 1;
        const co = nb * 5;
        ce[co] = (cx - ox) / dlen; ce[co + 1] = (cy - oy) / dlen; ce[co + 2] = (cz - oz) / dlen;
        ce[co + 3] = power; ce[co + 4] = mount.index; nb++;
        total += power;
        if (beamPower <= 0) continue;
        if (stretch <= 0) {
          if (power <= 0) continue;
          pushCore(cx, cy, cz, hits[3], power, coreWidth);
          pushGlow(cx, cy, cz, power);
          continue;
        }
        if (stretch < 1) pushCore(cx, cy, cz, hits[3], power * (1 - stretch), coreWidth);
        // Scanned footprint. Neighbors are blended through the fading last
        // beam so a sheet never jumps when a beam is added.
        const last = N - 1, wl = clamp(n - last);
        // How far the path wraps back to its start: a closed scan joins its
        // ends, an open one stops, and a morph between the two blends.
        const wrap = N > 1 ? closedness : 0;
        const at = (j) => j * 3;
        let prevX, prevY, nextX, nextY;
        if (i > 0) {
          prevX = pts[at(i - 1)]; prevY = pts[at(i - 1) + 1];
        } else {
          // Beam 0 links back through the fading last beam to the one before.
          const j = N > 2 ? last - 1 : last;
          prevX = mix(px, mix(pts[at(j)], pts[at(last)], wl), wrap);
          prevY = mix(py, mix(pts[at(j) + 1], pts[at(last) + 1], wl), wrap);
        }
        if (i < last) {
          if (i + 1 === last) {
            const fx = mix(px, pts[0], wrap), fy = mix(py, pts[1], wrap);
            nextX = mix(fx, pts[at(last)], wl); nextY = mix(fy, pts[at(last) + 1], wl);
          } else { nextX = pts[at(i + 1)]; nextY = pts[at(i + 1) + 1]; }
        } else { nextX = mix(px, pts[0], wrap); nextY = mix(py, pts[1], wrap); }
        const sx = px + stretch * ((prevX + px) / 2 - px), sy = py + stretch * ((prevY + py) / 2 - py);
        const ex = px + stretch * ((nextX + px) / 2 - px), ey = py + stretch * ((nextY + py) / 2 - py);
        // Line footprint start -> center -> end, curling to a circle.
        const gap = Math.max(Math.hypot(nextX - prevX, nextY - prevY) * 0.25, S * 0.05, 0.01);
        let L = 0;
        for (let k = 0; k < FOOT; k++) {
          const f = k / (FOOT - 1) * 2;
          const lx = f < 1 ? mix(sx, px, f) : mix(px, ex, f - 1);
          const ly = f < 1 ? mix(sy, py, f) : mix(py, ey, f - 1);
          const th = k / FOOT * TAU;
          foot[k * 2] = mix(lx, px + Math.cos(th) * gap, tube);
          foot[k * 2 + 1] = mix(ly, py + Math.sin(th) * gap, tube);
          if (k) L += Math.hypot(foot[k * 2] - foot[k * 2 - 2], foot[k * 2 + 1] - foot[k * 2 - 1]);
        }
        const closing = Math.hypot(foot[0] - foot[FOOT * 2 - 2], foot[1] - foot[FOOT * 2 - 1]) * tube;
        L += closing;
        for (let k = 0; k < FOOT; k++) ray(foot[k * 2], foot[k * 2 + 1], hits, 5 + k * 5);
        // A tube spreads its light round a whole circle; it gets a little
        // more so it reads beside a sheet.
        const surfacePower = beamPower * stretch * (1 + 1.4 * tube);
        const density = surfacePower / Math.max(L, 0.02);
        const tri = (k0, k1, wgt) => {
          const a = 5 + k0 * 5, b = 5 + (k1 % FOOT) * 5, o = ns * 9, x = ns * 9;
          const va = hits[a + 4], vb = hits[b + 4];
          if (!(va + vb > 0)) return;
          sp[o] = ox; sp[o + 1] = oy; sp[o + 2] = oz;
          sp[o + 3] = hits[a]; sp[o + 4] = hits[a + 1]; sp[o + 5] = hits[a + 2];
          sp[o + 6] = hits[b]; sp[o + 7] = hits[b + 1]; sp[o + 8] = hits[b + 2];
          const ra = Math.hypot(hits[a] - ox, hits[a + 1] - oy, hits[a + 2] - oz);
          const rb = Math.hypot(hits[b] - ox, hits[b + 1] - oy, hits[b + 2] - oz);
          sa[x] = 0; sa[x + 1] = density * wgt * (va + vb) / 2; sa[x + 2] = 0;
          sa[x + 3] = ra; sa[x + 4] = density * wgt * va; sa[x + 5] = (i * FOOT + k0) * ra;
          sa[x + 6] = rb; sa[x + 7] = density * wgt * vb; sa[x + 8] = (i * FOOT + k1) * rb;
          sk[ns] = key; ns++;
          if (hits[a + 3] === hits[b + 3] && hits[a + 3] !== SURF.crowd) {
            const t = nt * 7;
            tr[t] = hits[a]; tr[t + 1] = hits[a + 1]; tr[t + 2] = hits[a + 2];
            tr[t + 3] = hits[b]; tr[t + 4] = hits[b + 1]; tr[t + 5] = hits[b + 2];
            tr[t + 6] = density * wgt * Math.min(va, vb); tk[nt] = key; nt++;
          }
        };
        for (let k = 0; k < FOOT - 1; k++) tri(k, k + 1, 1);
        if (tube > 0) tri(FOOT - 1, FOOT, tube);
        // Galvos dwell where they turn: a partly opened sheet shows bright
        // stroke ends, a joined open sheet keeps its two outer edges.
        const turn = 2 * stretch * (1 - stretch) * (1 - tube) * 0.8;
        const outer = stretch * (1 - tube) * 0.55 * (1 - closedness);
        const s0 = 5, s1 = 5 + (FOOT - 1) * 5;
        const startPower = beamPower * hits[s0 + 4] * (turn + (i === 0 ? outer : 0));
        const endPower = beamPower * hits[s1 + 4] * (turn + (i === last || (i + 1 === last && wl < 1) ? outer * (i === last ? wl : 1 - wl) : 0));
        if (startPower > 0) pushCore(hits[s0], hits[s0 + 1], hits[s0 + 2], hits[s0 + 3], startPower, 0.55);
        if (endPower > 0) pushCore(hits[s1], hits[s1 + 1], hits[s1 + 2], hits[s1 + 3], endPower, 0.55);
        const mid = 5 + (FOOT >> 1) * 5;
        const g = beamPower / 3;
        pushGlow(hits[s0], hits[s0 + 1], hits[s0 + 2], g * hits[s0 + 4]);
        pushGlow(hits[mid], hits[mid + 1], hits[mid + 2], g * hits[mid + 4]);
        pushGlow(hits[s1], hits[s1 + 1], hits[s1 + 2], g * hits[s1 + 4]);
      }
    }
    this.coreCount = nc; this.surfCount = ns; this.traceCount = nt; this.glowCount = ng; this.centerCount = nb;
    this.totalPower = total;
    return this;
  }

  // Beam centers as plain objects, for tests and debugging only.
  beams() {
    const out = [];
    for (let i = 0; i < this.centerCount; i++) {
      const o = i * 5, projector = this.centers[o + 4];
      out.push({ projector, origin: [...LASER_PROJECTORS[projector].origin],
        direction: [this.centers[o], this.centers[o + 1], this.centers[o + 2]], power: this.centers[o + 3] });
    }
    return out;
  }
}

// One-shot sample for tests and other hosts.
export function sampleLaserRig(input = {}, timeSeconds = 0, opts = {}) {
  return new LaserRig().sample(input, timeSeconds, opts);
}
