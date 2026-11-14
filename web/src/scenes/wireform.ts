// Wireform (plan_scenes_wave3.md S3.1, CP3): TD's parametric meshes as an additive wireframe — a 48×48 grid of
// de-indexed quads (two edges each, LINES) with corner POINTS, morphing between kinds on morphStep's staggered
// switch (the CP0 seam: shapes.ts, not forked). Kicks run a wave over the grid, the reese corkscrews it about y
// (twistPOP), a build drifts each quad out along its own normal (glslMAT's face-normal explode), and the drop
// slams the drift back in as the next surface (hold 8 bars). The buffers are CPU-refilled only at a morph — the
// mix, wave, twist and scale all run in the VS. Camera = orbitVP (S0.3), the plexus draw pipeline (additive
// lines → bloom → COMPOSITE_FS).
// Look: TD Generators/mesh (the 17-shape palette; the dump holds only the names) + Generators/superFormula 3D
// (M1 20 / M2 10) + glslMAT ex3 + twistPOP ex1 (studied, rewritten). The dump carries no formulae, so the kinds
// use the standard public definitions — Bohemian Dome (a hat profile of revolution), Steinbach Screw (the
// standard multi-start screw) and Shell (a nautilus spiral tube) are those standard constructions.
import { createProgramInfo, setUniforms, type ProgramInfo } from 'twgl.js'
import { createBloom } from '../gl/bloom'
import { fullscreenProgram, renderTarget } from '../gl/engine'
import type { NativeDef } from '../gl/scene'
import { FOCAL, orbitVP } from '../gl/view'
import { COMPOSITE_FS } from './particles'
import { morphStep, type Morph } from './shapes'

const TAU = Math.PI * 2
const GRID = 96 // knob: the stage's quad grid, G×G (the plan's 48; raised — the supershape's 200 spike tips and the
/** slimmed tubes alias at 48 rows; the lines stay ≈ free: a static buffer, back-face faded)                  */
export const wireformGrid = (size?: readonly [number, number]) => (size ? 5 : GRID) // 96 × .1 = 9.6 → 5
const FIT = 0.7 // knob: the unit-ball surface × FIT: the exploded peak (FIT·2.45·scale 1.1 ≈ 1.89) stays inside
const GLOW = 3 // knob: the bloom strength (the swarm's / creatures')
const REF_H = 1117 // the point size's reference height (creatures')
// The normal orientation: normalize(du×dv)·FLIP[k] points out of the surface, checked numerically at each kind's
// smooth probe point (the degenerate cusps fall back to the radial in fill()).
const FLIP = [-1, -1, -1, -1, 1, 1, -1]
const hash = (x: number) => { const s = Math.sin(x * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s) }

/** The surface family (the CP3 contract: ≥ 6 TD-list kinds + the 3D supershape), morphed in this order. */
export const SURFACE_KINDS = ['Elliptic Torus', 'Astroidal Ellipsoid', 'Bohemian Dome', 'Triaxial Tritorus', 'Screw', 'Shell', 'Supershape 3D']

/** The kind's point (PURE, the CP3 contract's seam): u, v ∈ [0,1] — u the closed ring parameter, v the tube /
 *  profile — every kind fits the unit ball. */
export function surface(kind: number, u: number, v: number): [number, number, number] {
  const a = TAU * u, b = TAU * v
  switch (kind) {
    case 0: { // Elliptic Torus (TD list): R + r = 1 on xz, the elliptic (y-flattened) tube
      const R = 0.7, rx = 0.3, ry = 0.2, t = R + rx * Math.cos(b)
      return [t * Math.cos(a), ry * Math.sin(b), t * Math.sin(a)]
    }
    case 1: { // Astroidal Ellipsoid (TD list): the 3D astroid x^(2/3)+y^(2/3)+z^(2/3) = 1 (the 2D astroid's
      const th = Math.PI * (2 * v - 1) // cos³/sin³ parameterisation, cubed)
      return [Math.cos(th) ** 3 * Math.cos(a) ** 3, Math.sin(th) ** 3, Math.cos(th) ** 3 * Math.sin(a) ** 3]
    }
    case 2: { // Bohemian Dome (TD name; the standard hat profile of revolution — the dump holds no formula): the
      if (v < 0.42) { // upturned brim, then the domed crown; v 0 the rim, v 1 the apex
        const t = v / 0.42, rho = 0.92 - 0.62 * t
        return [rho * Math.cos(a), -0.30 + 0.22 * t + 0.06 * (1 - t) * (1 - t), rho * Math.sin(a)]
      }
      const t = (v - 0.42) / 0.58, rho = 0.3 * Math.cos(t * Math.PI / 2)
      return [rho * Math.cos(a), -0.08 + 0.9 * Math.sin(t * Math.PI / 2), rho * Math.sin(a)]
    }
    case 3: { // Triaxial Tritorus (TD list): the (2,3) torus-knot tube, the triaxial axes (0.95 xz, 0.85 y)
      const rad = 0.7 + 0.3 * Math.cos(3 * b) // the slim tube: the knot's waist does not fold into a tangle
      return [rad * Math.cos(2 * a), 0.38 * Math.sin(3 * b), rad * 0.95 * Math.sin(2 * a)]
    }
    case 4: { // Screw (TD's Steinbach Screw → the standard multi-start screw: the dump holds no formula): a
      const turns = 2, R = 0.42, H = 0.6, r = 0.22 // 2-turn helix tube (the turns do not overlap), the frame T̂, N, B = T̂×N
      const ph = TAU * turns * v, d = TAU * turns * R, c = Math.cos(ph), s = Math.sin(ph)
      const L = Math.hypot(d, 2 * H)
      return [
        R * c + r * (Math.cos(a) * c + Math.sin(a) * (2 * H * s) / L),
        (2 * v - 1) * H + r * Math.sin(a) * d / L,
        R * s + r * (Math.cos(a) * s - Math.sin(a) * (2 * H * c) / L),
      ]
    }
    case 5: { // Shell (TD list; the standard nautilus spiral tube): the in-plane spiral, the tube ∝ the radius
      const turns = 2, S = 0.14 + 0.6 * v, r = 0.18 * S // the turns do not overlap at the mouth
      const ph = TAU * turns * v + Math.PI, c = Math.cos(ph), s = Math.sin(ph)
      const dx = 0.6 * c - S * TAU * turns * s, dz = 0.6 * s + S * TAU * turns * c
      const L = Math.hypot(dx, dz)
      return [S * c + r * Math.cos(a) * dz / L, r * Math.sin(a), S * s - r * Math.cos(a) * dx / L]
    }
    case 6: { // Supershape 3D (TD superFormula 3D): two superformulas, M1 20 / M2 10, n 1, a = b = c = d = 1
      const m1 = 20, m2 = 10, th = Math.PI * (2 * v - 1)
      const r1 = 1 / (Math.abs(Math.cos(m1 * th / 4)) + Math.abs(Math.sin(m1 * th / 4)))
      const r2 = 1 / (Math.abs(Math.cos(m2 * a / 4)) + Math.abs(Math.sin(m2 * a / 4)))
      return [r1 * r2 * Math.cos(th) * Math.cos(a), r1 * Math.sin(th), r1 * r2 * Math.cos(th) * Math.sin(a)]
    }
    default: return [0, 0, 0]
  }
}

// aPosA / aPosB (the morph endpoints, × FIT), aNrm (the quad's outward normal, kind A), aPhase (the stagger's
// t and the explode's hash), aW (the corner's v: the wave's coordinate). Points first (the G×G corners), then
// the quads' two edges each — every grid edge exactly once, the u seam closed for every kind.
const VS = `#version 300 es
in vec3 aPosA, aPosB, aNrm;
in float aPhase, aW;
out vec3 vColor;
uniform mat4 uVP;
uniform vec3 uEye; // the orbit's eye in object space (the camera orbits the origin: gl/view.ts)
uniform float uMix, uPulse, uExplode, uTwist, uScale, uHue, uSparkle, uTime, uPx, uLit;
const float FOCAL = ${FOCAL.toFixed(9)};
vec3 hsv(float h, float s) { return mix(vec3(1.0), clamp(abs(fract(h + vec3(0.0, 2.0, 1.0) / 3.0) * 6.0 - 3.0) - 1.0, 0.0, 1.0), s); }
void main() {
  float x = clamp((uMix - aPhase) / (1.0 - aPhase), 0.0, 1.0); // the stagger (the VS twin of shapes.ts')
  float s = x * x * (3.0 - 2.0 * x);
  vec3 p = mix(aPosA, aPosB, s);
  float wave = uPulse * sin(6.28318 * (2.0 * aW - 1.5 * uTime)); // the kick's ripple runs over the grid along v
  p += aNrm * (wave + uExplode * (0.5 + aPhase)); // the build's drift, each quad along its own normal, its own share
  float t = uTwist * p.y, c = cos(t), sn = sin(t); // the reese's corkscrew about y, ∝ height (twistPOP)
  p = vec3(c * p.x - sn * p.z, p.y, sn * p.x + c * p.z);
  p *= uScale;
  vec4 pos = uVP * vec4(p, 1.0);
  gl_Position = pos;
  float near = FOCAL / max(pos.w, FOCAL / 2.0); // the 3D cue: the near side brighter (≤ 2×: no flash at an exploded rim)
  float flick = 4.0 * fract(sin((aPhase + 1.0) * 12.9898 + floor(uTime * 8.0) * 78.233) * 43758.5453) - 2.0; // 8 Hz, zero-mean
  // The back-face fade: the wave has no depth buffer (the convention), so the far side of a closed mesh would
  // add through the front as a chord web. The normal, twisted with the surface, fades the far side to a ghost.
  vec3 n2 = vec3(c * aNrm.x - sn * aNrm.z, aNrm.y, sn * aNrm.x + c * aNrm.z);
  float facing = dot(normalize(n2), normalize(uEye - p));
  vColor = hsv(uHue + 0.1 * aPhase, 0.85) * (1.0 + uSparkle * flick) * near * uLit * (0.1 + 0.9 * smoothstep(-0.4, 0.4, facing));
  gl_PointSize = max(1.0, 2.2 * uPx * near); // the corners' px (REF_H); the lines ignore it
}`
const LINE_FS = `#version 300 es
precision highp float;
in vec3 vColor;
out vec4 outColor;
void main() { outColor = vec4(vColor, 1.0); }`
const POINT_FS = `#version 300 es
precision highp float;
in vec3 vColor;
out vec4 outColor;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float a = max(0.0, 1.0 - dot(q, q));
  outColor = vec4(vColor * a * a, 1.0); // the soft round node (particles' sprite)
}`

const ALOC = { aPosA: 0, aPosB: 1, aNrm: 2, aPhase: 3, aW: 4 } // both programs on one VAO
const OFF = [0, 12, 24, 36, 40]
const SIZES = [3, 3, 3, 1, 1]
const STRIDE = 11
let lineProgram: ProgramInfo | undefined // as plexus': compiled once and shared
let pointProgram: ProgramInfo | undefined

/** The bindings (plan § Scenes row 8, all ⚠️ assumptions until the CP3 demo): the build drifts the quads, the
 *  drop slams them into the next surface, the kick's wave, the reese's twist (Auto-style: wobble under Dubstep),
 *  the sub's breath, the snare's hue, the hats' twinkle, and the yaw's saw orbit (one turn per 25 s; the saw
 *  wraps a full turn, so the phase is continuous). pitch .06 turns and hold 8 bars are the row's statics —
 *  the built-in's values. No input brightens the frame on a hit: the wave moves points, the sparkle is zero-mean. */
export const wireform: NativeDef = {
  id: 'native/wireform', name: 'Wireform', kind: 'generator', category: 'geometry', tags: ['mesh', 'wireframe', '3d'], credit: 'VeeJay Wizard', inputs: [
    { name: 'explode', type: 'float', min: 0, max: 1, default: 0 }, // the quads' normal drift, × FIT scene units
    { name: 'pulse', type: 'float', min: 0, max: 1, default: 0 }, // the kick wave's amplitude
    { name: 'twist', type: 'float', min: 0, max: 2, default: 0 }, // the corkscrew about y, rad at the rim
    { name: 'scale', type: 'float', min: 0.5, max: 1.5, default: 1 }, // the surface's breath
    { name: 'hue', type: 'float', min: 0, max: 1, default: 0.65 }, // the base hue, turns
    { name: 'sparkle', type: 'float', min: 0, max: 1, default: 0 }, // the zero-mean twinkle
    { name: 'yaw', type: 'float', min: 0, max: 1, default: 0 }, // the orbit, turns
    { name: 'pitch', type: 'float', min: 0, max: 0.5, default: 0.06 }, // the camera's elevation, turns
    { name: 'hold', type: 'float', min: 0, max: 64, default: 0 }, // bars a surface holds before the calm morph (0: only `next`)
    { name: 'next', type: 'event' }, // the slam into the next surface
  ],
  bind: {
    explode: { source: 'build', amount: 1, attack: 1, release: 0.15, min: 0, max: 0.8 },
    next: { source: 'drop', amount: 1, attack: 0, release: 0.1, min: 0, max: 1 },
    pulse: { source: 'kick', amount: 1, attack: 0, release: 0.2, min: 0, max: 0.25 },
    twist: { source: 'reese', amount: 1, attack: 0.05, release: 0.4, min: 0, max: 1.2 },
    scale: { source: 'sub', amount: 1, attack: 0.05, release: 0.3, min: 0.85, max: 1.1 },
    hue: { source: 'snare', amount: 1, attack: 0, release: 0.3, min: 0.5, max: 0.85 },
    sparkle: { source: 'hats', amount: 1, attack: 0, release: 0.08, min: 0, max: 0.5 },
    yaw: { source: 'lfo', shape: 'saw', rate: 0.04, amount: 1, attack: 0, release: 0, min: 0, max: 1 },
  },
  create(gl, size) {
    const G = wireformGrid(size)
    const nPts = G * G // the unique corners (i, j ∈ [0, G): the u seam is closed for every kind)
    const nLines = G * G * 4 // two edges × two endpoints per quad
    const progLine = (lineProgram ??= createProgramInfo(gl, [VS, LINE_FS], { attribLocations: ALOC }))
    const progPoint = (pointProgram ??= createProgramInfo(gl, [VS, POINT_FS], { attribLocations: ALOC }))
    const composite = fullscreenProgram(COMPOSITE_FS)
    const bloom = createBloom(gl)
    const target = renderTarget(true) // hdr: the overlaps add above 8 bits before the tone map
    const nC = (G + 1) * (G + 1) // the corner grids (u = v = 1 evaluated: the v seam's row)
    const cornerA = new Float32Array(nC * 3), cornerB = new Float32Array(nC * 3)
    const qn = new Float32Array(G * G * 3) // the quads' outward normals, kind A
    const verts = new Float32Array((nPts + nLines) * STRIDE)
    const fill = (from: number, to: number) => {
      for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) {
        const o = (j * (G + 1) + i) * 3
        const pa = surface(from, i / G, j / G), pb = surface(to, i / G, j / G)
        cornerA[o] = pa[0] * FIT; cornerA[o + 1] = pa[1] * FIT; cornerA[o + 2] = pa[2] * FIT
        cornerB[o] = pb[0] * FIT; cornerB[o + 1] = pb[1] * FIT; cornerB[o + 2] = pb[2] * FIT
      }
      for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { // the quad normals: kind A, du×dv outward
        const c0 = (j * (G + 1) + i) * 3, c1 = (j * (G + 1) + i + 1) * 3, c2 = ((j + 1) * (G + 1) + i) * 3
        const du = [cornerA[c1] - cornerA[c0], cornerA[c1 + 1] - cornerA[c0 + 1], cornerA[c1 + 2] - cornerA[c0 + 2]]
        const dv = [cornerA[c2] - cornerA[c0], cornerA[c2 + 1] - cornerA[c0 + 1], cornerA[c2 + 2] - cornerA[c0 + 2]]
        const n = [du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]]
        const nl = Math.hypot(n[0], n[1], n[2])
        const o = (j * G + i) * 3
        if (nl < 1e-6) { // the cusp / pole: the radial through the quad's centroid (the astroid's spikes, the domes' apex)
          const cx = (cornerA[c0] + cornerA[c1] + cornerA[c2] + cornerA[((j + 1) * (G + 1) + i + 1) * 3]) / 4
          const cy = (cornerA[c0 + 1] + cornerA[c1 + 1] + cornerA[c2 + 1] + cornerA[((j + 1) * (G + 1) + i + 1) * 3 + 1]) / 4
          const cz = (cornerA[c0 + 2] + cornerA[c1 + 2] + cornerA[c2 + 2] + cornerA[((j + 1) * (G + 1) + i + 1) * 3 + 2]) / 4
          const cl = Math.hypot(cx, cy, cz)
          qn[o] = cl > 1e-6 ? cx / cl : 0; qn[o + 1] = cl > 1e-6 ? cy / cl : 1; qn[o + 2] = cl > 1e-6 ? cz / cl : 0
        } else { const f = FLIP[from] / nl; qn[o] = n[0] * f; qn[o + 1] = n[1] * f; qn[o + 2] = n[2] * f }
      }
      let o = 0
      for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { // the corner nodes
        const c = (j * (G + 1) + i) * 3, q = (j * G + i) * 3
        verts[o] = cornerA[c]; verts[o + 1] = cornerA[c + 1]; verts[o + 2] = cornerA[c + 2]
        verts[o + 3] = cornerB[c]; verts[o + 4] = cornerB[c + 1]; verts[o + 5] = cornerB[c + 2]
        verts[o + 6] = qn[q]; verts[o + 7] = qn[q + 1]; verts[o + 8] = qn[q + 2]
        verts[o + 9] = hash(i + (j + 1) * 71.3)
        verts[o + 10] = j / G
        o += STRIDE
      }
      for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { // the quads' two edges: the u edge, then the v edge
        const c0 = (j * (G + 1) + i) * 3, c1 = (j * (G + 1) + i + 1) * 3, c2 = ((j + 1) * (G + 1) + i) * 3
        const q = (j * G + i) * 3, ph = hash(i + j * G)
        const emit = (c: number, w: number) => {
          verts[o] = cornerA[c]; verts[o + 1] = cornerA[c + 1]; verts[o + 2] = cornerA[c + 2]
          verts[o + 3] = cornerB[c]; verts[o + 4] = cornerB[c + 1]; verts[o + 5] = cornerB[c + 2]
          verts[o + 6] = qn[q]; verts[o + 7] = qn[q + 1]; verts[o + 8] = qn[q + 2]
          verts[o + 9] = ph
          verts[o + 10] = w
          o += STRIDE
        }
        emit(c0, j / G); emit(c1, j / G)
        emit(c0, j / G); emit(c2, (j + 1) / G)
      }
    }
    const vao = gl.createVertexArray()
    const buf = gl.createBuffer()
    gl.bindVertexArray(vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, verts.byteLength, gl.DYNAMIC_DRAW)
    for (let k = 0; k < 5; k++) {
      gl.enableVertexAttribArray(k)
      gl.vertexAttribPointer(k, SIZES[k], gl.FLOAT, false, STRIDE * 4, OFF[k])
    }
    gl.bindVertexArray(null)
    fill(0, 0)
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, verts)
    let morph: Morph = { from: 0, to: 0, mix: 1, slot: NaN, dur: 1 } // opens assembled on kind 0
    let fillFrom = 0, fillTo = 0
    let held = false // the `next` rising edge, as points'/plexus'
    return {
      morphState: () => ({ ...morph }), // the bench reads the morph clock's CPU truth (plexus' nodes precedent)
      draw(f, v) {
        const dt = Math.min(f.dt, 0.05)
        const edge = !!v.next && !held
        held = !!v.next
        const m = morphStep(morph, SURFACE_KINDS.length, edge, f.sync.bar, v.hold as number, dt)
        morph = m
        if (m.from !== fillFrom || m.to !== fillTo) { // the CPU refill, at a morph only (not per frame)
          fill(m.from, m.to)
          gl.bindBuffer(gl.ARRAY_BUFFER, buf)
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, verts)
          fillFrom = m.from; fillTo = m.to
        }
        const aspect = f.width / f.height
        const out = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null // the engine's target
        target.fit(f.width, f.height)
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer)
        gl.viewport(0, 0, f.width, f.height) // the convention: explicit, not the canvas' default
        gl.clearColor(0, 0, 0, 1)
        gl.clear(gl.COLOR_BUFFER_BIT)
        gl.enable(gl.BLEND)
        gl.blendFunc(gl.ONE, gl.ONE) // additive, order-independent
        const yaw = (v.yaw as number) * TAU, pitch = (v.pitch as number) * TAU
        const U = {
          uVP: orbitVP(yaw, pitch, aspect),
          uEye: [FOCAL * Math.sin(yaw) * Math.cos(pitch), FOCAL * Math.sin(pitch), FOCAL * Math.cos(yaw) * Math.cos(pitch)],
          uMix: m.mix, uPulse: v.pulse as number, uExplode: v.explode as number,
          uTwist: v.twist as number, uScale: v.scale as number, uHue: v.hue as number,
          uSparkle: v.sparkle as number, uTime: f.time, uPx: f.height / REF_H,
        }
        gl.bindVertexArray(vao)
        gl.useProgram(progPoint.program)
        setUniforms(progPoint, { ...U, uLit: 0.9 })
        gl.drawArrays(gl.POINTS, 0, nPts)
        gl.useProgram(progLine.program)
        setUniforms(progLine, { ...U, uLit: 0.6 })
        gl.drawArrays(gl.LINES, nPts, nLines)
        gl.bindVertexArray(null) // the fullscreen passes set their own on the default VAO
        gl.disable(gl.BLEND) // as the swarm: no state into the next node
        const lit = bloom.apply(target.attachments[0], f.width, f.height, GLOW)
        gl.bindFramebuffer(gl.FRAMEBUFFER, out)
        gl.viewport(0, 0, f.width, f.height)
        composite({ uSrc: lit, uRes: [f.width, f.height] })
      },
      dispose() {
        bloom.dispose()
        gl.deleteFramebuffer(target.framebuffer)
        gl.deleteTexture(target.attachments[0])
        gl.deleteBuffer(buf)
        gl.deleteVertexArray(vao)
      },
    }
  },
}
