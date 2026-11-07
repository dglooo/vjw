// Stereo XY scope (plan_td_wave2.md S2.1, design answer 4): the 512-sample L/R waveform as one LINE_STRIP Lissajous
// (L→x, R→y) drawn additively into a persistent half-float trail, faded per frame by a constant blend (the swarm trick,
// points.ts L213–229 — no texture read, no ping-pong), bloomed and tone-mapped. The trail's head rotates as `rot`
// integrates, so the figure spins on the bass and the recent shapes spiral behind it. An ISF pass would SDF-test 512
// segments per pixel (design answer 4); the native line is the cheap path. The hue is baked into the line at draw time,
// so the trail keeps a colour history as snare walks the base hue.
// Look: TD xyScope (Palette/Techniques; studied, rewritten). No third-party code: bloom is gl/bloom.ts, the tone map is
// particles' COMPOSITE_FS, the fade is the engine's post-pass tint.
import { createProgramInfo, setUniforms, type ProgramInfo } from 'twgl.js'
import { createBloom } from '../gl/bloom'
import { audioTex, fullscreenProgram, renderTarget, tint } from '../gl/engine'
import type { NativeDef } from '../gl/scene'
import { COMPOSITE_FS } from './particles'

const VERTS = 512 // the waveform samples, one line vertex each (waveLR's width)
const GAIN = 2 // knob: one pass's line brightness (the additive trail sums ≈ GAIN/(1 − keep) where covered)
const GRAD = 0.2 // knob: turns of hue across the whole loop (neighbouring segments differ → the trail shows depth)

// Scene units: y −1..1, x scaled by the aspect (as the swarm's). The line comes straight from the texture: no buffer.
const VS = `#version 300 es
uniform highp sampler2D uWave; // waveLR 512×2 R8: row 0 L, row 1 R (engine.ts)
uniform float uScale, uAspect, uRot, uHue;
out float vId;
vec2 rot2(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
void main() {
  int id = gl_VertexID; // 0..511
  float x = texelFetch(uWave, ivec2(id, 0), 0).r * 2.0 - 1.0; // L → x
  float y = texelFetch(uWave, ivec2(id, 1), 0).r * 2.0 - 1.0; // R → y
  vec2 p = rot2(vec2(x, y) * uScale, uRot);
  gl_Position = vec4(p.x / uAspect, p.y, 0.0, 1.0);
  vId = float(id);
}`
const FS = `#version 300 es
precision highp float;
in float vId;
uniform float uHue, uGain;
out vec4 outColor;
vec3 palette(float t) { return 0.5 + 0.5 * cos(6.2831853 * (t + vec3(0.0, 0.33, 0.67))); }
void main() { outColor = vec4(palette(uHue + vId / ${VERTS}.0 * ${GRAD.toFixed(2)}) * uGain, 1.0); }`

let line: ProgramInfo | undefined // as the swarm's tfProgram: compiled once, shared (the engine's cache takes no texelFetch line)

/** The per-frame trail fade, frame-rate independent: `trail` is what one 60 Hz frame keeps, so a frame of `dt` s keeps
 *  trail^(dt·60). (The swarm uses a bare per-frame multiply; this one holds its length across a governor step or fps.) */
export const trailKeep = (trail: number, dt: number) => trail ** (dt * 60)

/** Bindings: D1 with the 2026-11-05 ruling (rotSpeed binds reese; Auto-style maps it to wobble in Dubstep). `width` is
 *  the glow (bloom) amount and stays static: the line is 1 px on every GPU, so thickness comes from the bloom, not lineWidth. */
export const scope: NativeDef = {
  id: 'native/scope', name: 'XY scope', kind: 'generator', category: 'geometry', tags: ['scope', 'audio'], credit: 'VeeJay Wizard', inputs: [
    { name: 'scale', type: 'float', min: 0.2, max: 2, default: 0.9 }, // the figure's size, scene units
    { name: 'rotSpeed', type: 'float', min: 0, max: 1, default: 0.3 }, // rad/s the trail head spins (1 ≈ one turn / 6 s, TD's 0.16 Hz)
    { name: 'hue', type: 'float', min: 0, max: 1, default: 0.5 }, // the base hue, turns
    { name: 'trail', type: 'float', min: 0, max: 0.99, default: 0.9 }, // what one 60 Hz frame keeps of the last
    { name: 'width', type: 'float', min: 1, max: 8, default: 4 }, // the glow, static (unbound)
  ],
  bind: {
    scale: { source: 'sub', amount: 1, attack: 0.02, release: 0.4, min: 0.65, max: 1.35 }, // the sub breathes the figure
    rotSpeed: { source: 'reese', amount: 1, attack: 0, release: 0.3, min: 0, max: 1 }, // Auto-style's one: the bass spins the trail
    hue: { source: 'snare', amount: 1, attack: 0, release: 0.3, min: 0.35, max: 0.65 }, // a snare walks the colour
    trail: { source: 'build', amount: 1, attack: 1, release: 2, min: 0.85, max: 0.97 }, // a build stretches the trail
  },
  create(gl) {
    // No `size` (as spectrum): 512 line vertices are cheap at any size, so a tile (2b S3.2) needs no shrink — the trail
    // and bloom fit() to f at draw.
    const prog = (line ??= createProgramInfo(gl, [VS, FS]))
    const composite = fullscreenProgram(COMPOSITE_FS)
    const bloom = createBloom(gl)
    const trail = renderTarget(true, true) // persistent half-float: the figure survives a governor step
    const vao = gl.createVertexArray() // empty: the line reads gl_VertexID, no attributes
    let rot = 0 // the trail head's accumulated angle
    return {
      draw(f, v) {
        const dt = Math.min(f.dt, 0.05)
        rot += (v.rotSpeed as number) * dt
        const out = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null // the engine's target
        trail.fit(f.width, f.height)
        gl.bindFramebuffer(gl.FRAMEBUFFER, trail.framebuffer)
        gl.viewport(0, 0, f.width, f.height) // ≥ the trail and every bloom level: the fullscreen passes sample their own uRes
        gl.enable(gl.BLEND)
        gl.blendFunc(gl.ZERO, gl.SRC_ALPHA) // dst × keep: the engine's post-pass fade, no texture read
        tint({ uColor: [0, 0, 0, trailKeep(v.trail as number, dt)] })
        gl.blendFunc(gl.ONE, gl.ONE) // the line adds into the trail
        gl.bindVertexArray(vao)
        gl.useProgram(prog.program)
        setUniforms(prog, { uWave: audioTex.waveLR, uScale: v.scale, uAspect: f.width / f.height, uRot: rot, uHue: v.hue, uGain: GAIN })
        gl.drawArrays(gl.LINE_STRIP, 0, VERTS)
        gl.bindVertexArray(null) // the fullscreen passes set the triangle on the default VAO
        gl.disable(gl.BLEND)
        const lit = bloom.apply(trail.attachments[0], f.width, f.height, v.width as number)
        gl.bindFramebuffer(gl.FRAMEBUFFER, out)
        gl.viewport(0, 0, f.width, f.height) // bloom left its own target bound; the tone map goes to the engine's
        composite({ uSrc: lit, uRes: [f.width, f.height] })
      },
      dispose() {
        bloom.dispose()
        gl.deleteFramebuffer(trail.framebuffer)
        gl.deleteTexture(trail.attachments[0])
        gl.deleteVertexArray(vao)
      },
    }
  },
}
