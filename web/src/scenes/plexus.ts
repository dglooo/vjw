// TD plexus (plan_td_wave2.md S2.3, design answer 7): N CPU nodes drift on slow orbits and each connects to every
// other within `dist` with a line — the closer the pair, the brighter. The positions would live in a GPU TF buffer
// (as the swarm's), but a per-frame readback is a sync stall; at CPU N = 400 the grid-hash neighbour search stays
// < 0.1 ms (the design's estimate, measured at the S2.3 gate). The LINES + POINTS are re-uploaded per frame (one
// DYNAMIC_DRAW buffer, the used prefix only), additive over black through the shared bloom and tone map.
// Look: TD plexus lines (POP/glsladvancedPOP ex8: a line for each pair of points closer than uDist; studied,
// rewritten). No third-party code: bloom is gl/bloom.ts, the tone map is particles' COMPOSITE_FS.
import { createProgramInfo, setUniforms, type ProgramInfo } from 'twgl.js'
import { createBloom } from '../gl/bloom'
import { fullscreenProgram, renderTarget } from '../gl/engine'
import type { NativeDef } from '../gl/scene'
import { COMPOSITE_FS } from './particles'

const N = 400 // knob: node count (the design's < 0.1 ms CPU budget)
/** The plexus's node count: N on the stage, N/10 for a `size` (a tile, 2b S3.2 — swarmN's ×.1 precedent). */
export const plexusN = (size?: readonly [number, number]) => (size ? N / 10 : N)
const MARGIN = 0.9 // knob: the homes' spread, × the half-frame
const RAD = [0.12, 0.42] // knob: per-node orbit radii, scene units
const OM = [0.15, 0.5] // knob: per-node orbit angular speeds at drift 1, rad/s (either way round)
const LINE = 0.5 // knob: a zero-distance pair's brightness (overlaps add; the tone map caps)
const NODE = 0.9 // knob: a node's brightness
const GLOW = 2 // knob: the bloom strength (the swarm's)
const TAU = 6.2831853
const hash = (x: number) => { const s = Math.sin(x) * 43758.5453; return s - Math.floor(s) } // deterministic per id (reproducible stills)

/** The grid-hash neighbour search (the unit-tested seam): every pair (i, j), i < j, whose scene distance is ≤ dist,
 *  via a head/next cell list at cell = dist — a pair within dist sits in the same or an adjacent cell, so the 3×3
 *  scan is exact (no misses, no duplicates). `pos`: xy in scene units (x over ±aspect, y over ±1; isotropic on the
 *  screen, as the swarm's). `out` holds at most n(n−1)/2 pairs (out[2k] = i, out[2k+1] = j); returns the count.
 *  ponytail: head/next are small per-call arrays (≤ ~13 KB at the doc's minimum dist); a persistent scratch if the GC shows. */
export function plexusPairs(pos: Float32Array, n: number, dist: number, aspect: number, out: Int32Array): number {
  const d2 = dist * dist
  const cols = Math.max(1, Math.ceil((2 * aspect) / dist))
  const rows = Math.max(1, Math.ceil(2 / dist))
  const head = new Int32Array(cols * rows).fill(-1)
  const next = new Int32Array(n).fill(-1)
  for (let i = 0; i < n; i++) {
    const cx = Math.min(cols - 1, Math.max(0, Math.floor((pos[2 * i] + aspect) / dist)))
    const cy = Math.min(rows - 1, Math.max(0, Math.floor((pos[2 * i + 1] + 1) / dist)))
    const c = cy * cols + cx
    next[i] = head[c]
    head[c] = i
  }
  let count = 0
  for (let i = 0; i < n; i++) {
    const xi = pos[2 * i], yi = pos[2 * i + 1]
    const cx = Math.min(cols - 1, Math.max(0, Math.floor((xi + aspect) / dist)))
    const cy = Math.min(rows - 1, Math.max(0, Math.floor((yi + 1) / dist)))
    const x0 = Math.max(0, cx - 1), x1 = Math.min(cols - 1, cx + 1)
    const y0 = Math.max(0, cy - 1), y1 = Math.min(rows - 1, cy + 1)
    for (let gy = y0; gy <= y1; gy++)
      for (let gx = x0; gx <= x1; gx++)
        for (let j = head[gy * cols + gx]; j !== -1; j = next[j]) {
          if (j <= i) continue
          const dx = pos[2 * j] - xi, dy = pos[2 * j + 1] - yi
          if (dx * dx + dy * dy <= d2) { out[2 * count] = i; out[2 * count + 1] = j; count++ }
        }
  }
  return count
}

// Scene units as the swarm's (y −1..1, x scaled by the aspect). One interleaved buffer: x y r g b per vertex — the
// nodes first, then each pair's endpoints (the colours are the nodes', scaled by the pair's proximity brightness).
const VS = `#version 300 es
in vec2 aPos;
in vec3 aCol;
out vec3 vCol;
uniform float uAspect, uSize;
void main() {
  vCol = aCol;
  gl_PointSize = uSize; // the nodes; the lines ignore it
  gl_Position = vec4(aPos.x / uAspect, aPos.y, 0.0, 1.0);
}`
const LINE_FS = `#version 300 es
precision highp float;
in vec3 vCol;
out vec4 outColor;
void main() { outColor = vec4(vCol, 1.0); }`
const NODE_FS = `#version 300 es
precision highp float;
in vec3 vCol;
out vec4 outColor;
void main() {
  float a = 1.0 - smoothstep(0.3, 0.5, length(gl_PointCoord - 0.5)); // the soft round node (particles' sprite)
  outColor = vec4(vCol * a, 1.0);
}`

const PROGOPT = { attribLocations: { aPos: 0, aCol: 1 } } // both programs on one VAO
let lineProgram: ProgramInfo | undefined // as scope's: compiled once and shared
let nodeProgram: ProgramInfo | undefined

/** Bindings (⚠ the plan marks them a lead assumption — the design names none; assigned per the 2d policy, confirm
 *  at the CP2 demo). No bass-class input, so Auto-style changes nothing. */
export const plexus: NativeDef = {
  id: 'native/plexus', name: 'Plexus', kind: 'generator', category: 'geometry', tags: ['plexus', 'lines'], credit: 'VeeJay Wizard', inputs: [
    { name: 'dist', type: 'float', min: 0.05, max: 0.8, default: 0.25 }, // the connect radius, scene units
    { name: 'drift', type: 'float', min: 0, max: 1, default: 0.5 }, // the orbits' speed (0: still)
    { name: 'size', type: 'float', min: 1, max: 8, default: 3 }, // the node's px at a 1000 px tall target
    { name: 'hue', type: 'float', min: 0, max: 1, default: 0.45 }, // the base hue, turns
  ],
  bind: {
    drift: { source: 'lfo', shape: 'sine', rate: 0.05, amount: 1, attack: 0, release: 0, min: 0, max: 1 }, // a 20 s breath of drift
    dist: { source: 'sub', amount: 1, attack: 0.05, release: 0.3, min: 0.18, max: 0.45 }, // the sub widens the web
    size: { source: 'kick', amount: 1, attack: 0, release: 0.1, min: 2, max: 5 }, // a kick swells the nodes
    hue: { source: 'snare', amount: 1, attack: 0, release: 0.3, min: 0.35, max: 0.65 }, // a snare walks the colour
  },
  create(gl, size) {
    const n = plexusN(size)
    const progLine = (lineProgram ??= createProgramInfo(gl, [VS, LINE_FS], PROGOPT))
    const progNode = (nodeProgram ??= createProgramInfo(gl, [VS, NODE_FS], PROGOPT))
    const composite = fullscreenProgram(COMPOSITE_FS)
    const bloom = createBloom(gl)
    const target = renderTarget(true) // hdr: the overlaps add above 8 bits before the tone map
    // The deterministic per-node orbit (a hash of the id: no Math.random, so the stills are reproducible).
    const hx = new Float32Array(n), hy = new Float32Array(n)
    const rad = new Float32Array(n), om = new Float32Array(n), hueOff = new Float32Array(n)
    const phase = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      hx[i] = (hash(i * 1.618 + 12.9) * 2 - 1) * MARGIN
      hy[i] = (hash(i * 2.431 + 78.2) * 2 - 1) * MARGIN
      rad[i] = RAD[0] + (RAD[1] - RAD[0]) * hash(i * 3.757 + 39.4)
      om[i] = (OM[0] + (OM[1] - OM[0]) * hash(i * 5.987 + 23.1)) * (hash(i * 8.123 + 5.7) > 0.5 ? 1 : -1)
      phase[i] = TAU * hash(i * 7.139 + 61.8)
      hueOff[i] = (hash(i * 4.553 + 4.2) - 0.5) * 0.12
    }
    const pos = new Float32Array(2 * n) // scene units
    const pair = new Int32Array(n * (n - 1)) // ≤ n(n−1)/2 pairs × 2
    const verts = new Float32Array(n * n * 5) // the nodes + the worst case's 2 endpoints per pair (n + n(n−1) = n²)
    const vao = gl.createVertexArray()
    const buf = gl.createBuffer()
    gl.bindVertexArray(vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, verts.byteLength, gl.DYNAMIC_DRAW)
    const aPos = gl.getAttribLocation(progLine.program, 'aPos')
    const aCol = gl.getAttribLocation(progLine.program, 'aCol')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 20, 0)
    gl.enableVertexAttribArray(aCol)
    gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 20, 8)
    gl.bindVertexArray(null)
    return {
      draw(f, v) {
        const dt = Math.min(f.dt, 0.05)
        const aspect = f.width / f.height
        const dist = Math.max(1e-3, v.dist as number)
        const drift = v.drift as number
        // The orbit integrates its phase (drift 0 stills the web at its current phase — no jump as the lfo moves it).
        for (let i = 0; i < n; i++) {
          phase[i] += om[i] * drift * dt
          pos[2 * i] = hx[i] * aspect + rad[i] * Math.cos(phase[i])
          pos[2 * i + 1] = hy[i] + rad[i] * Math.sin(phase[i])
        }
        const k = plexusPairs(pos, n, dist, aspect, pair)
        for (let i = 0; i < n; i++) {
          const t0 = (v.hue as number) + hueOff[i], o = i * 5
          verts[o] = pos[2 * i]
          verts[o + 1] = pos[2 * i + 1]
          verts[o + 2] = (0.5 + 0.5 * Math.cos(TAU * t0)) * NODE
          verts[o + 3] = (0.5 + 0.5 * Math.cos(TAU * (t0 + 1 / 3))) * NODE
          verts[o + 4] = (0.5 + 0.5 * Math.cos(TAU * (t0 + 2 / 3))) * NODE
        }
        let o = n * 5
        for (let q = 0; q < k; q++) {
          const i = pair[2 * q], j = pair[2 * q + 1]
          const dx = pos[2 * j] - pos[2 * i], dy = pos[2 * j + 1] - pos[2 * i + 1]
          const b = (1 - Math.sqrt(dx * dx + dy * dy) / dist) * LINE // the closer, the brighter
          const ci = i * 5, cj = j * 5
          verts[o] = verts[ci]; verts[o + 1] = verts[ci + 1]
          verts[o + 2] = verts[ci + 2] * b; verts[o + 3] = verts[ci + 3] * b; verts[o + 4] = verts[ci + 4] * b
          verts[o + 5] = verts[cj]; verts[o + 6] = verts[cj + 1]
          verts[o + 7] = verts[cj + 2] * b; verts[o + 8] = verts[cj + 3] * b; verts[o + 9] = verts[cj + 4] * b
          o += 10
        }
        const out = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null // the engine's target
        target.fit(f.width, f.height)
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer)
        gl.viewport(0, 0, f.width, f.height) // as scope/particles (S2.2's drift note 3: the default viewport is the canvas')
        gl.clearColor(0, 0, 0, 1)
        gl.clear(gl.COLOR_BUFFER_BIT)
        gl.enable(gl.BLEND)
        gl.blendFunc(gl.ONE, gl.ONE) // additive, order-independent
        gl.bindBuffer(gl.ARRAY_BUFFER, buf)
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, verts.subarray(0, (n + 2 * k) * 5))
        gl.bindVertexArray(vao)
        gl.useProgram(progLine.program)
        setUniforms(progLine, { uAspect: aspect })
        gl.drawArrays(gl.LINES, n, 2 * k)
        gl.useProgram(progNode.program)
        setUniforms(progNode, { uAspect: aspect, uSize: (v.size as number) * f.height / 1000 }) // as particles' uScale
        gl.drawArrays(gl.POINTS, 0, n)
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
