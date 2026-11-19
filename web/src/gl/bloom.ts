// Dual-filter bloom, after Bjørge, "Bandwidth-Efficient Rendering" (ARM, SIGGRAPH 2015); written from the technique,
// no copied code. A thresholded 5-tap downsample into a chain of half-size targets, an 8-tap upsample back up that adds
// each wider level onto the sharper one below it, then src + strength × glow. Half-float targets where the GPU renders
// to them, so bright overlaps don't clip before the scene's tone map.
import { bindFramebufferInfo } from 'twgl.js'
import { fullscreenProgram, renderTarget } from './engine'

const THRESHOLD = 0.5 // knob: brightness (max channel) where the glow starts; brighter pixels glow with (b − threshold)
const SPREAD = 1 // knob: tap offset in source texels; wider = softer, larger glow

const HEAD = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uTexel; // 1 / source size
uniform vec2 uRes;   // target size
out vec4 outColor;
vec3 tap(vec2 uv) { return texture(uSrc, uv).rgb; }
`
// Down: the centre ×4 plus 4 diagonal taps, each bilinear tap averaging a 2×2 block; /8. Level 0 also thresholds: the
// brightest channel past THRESHOLD, or with `luma` > 0 a hard luma cut (three's LuminosityHighPassShader: Rec. 601
// weights, smoothWidth .01), as the vs3 donor's UnrealBloom (vs3/host.ts).
const DOWN = `${HEAD}
uniform float uThreshold, uLuma;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes, d = uTexel * ${SPREAD.toFixed(2)};
  vec3 c = (4.0 * tap(uv) + tap(uv + d) + tap(uv - d) + tap(uv + vec2(d.x, -d.y)) + tap(uv - vec2(d.x, -d.y))) / 8.0;
  float b = max(c.r, max(c.g, c.b));
  float k = uLuma > 0.0 ? smoothstep(uLuma, uLuma + 0.01, dot(c, vec3(0.299, 0.587, 0.114))) : max(b - uThreshold, 0.0) / max(b, 1e-4);
  outColor = vec4(c * k, 1.0);
}`
// Up: a tent over the smaller level, 4 edge taps ×1 plus 4 diagonal taps ×2; /12.
const UP = `${HEAD}
void main() {
  vec2 uv = gl_FragCoord.xy / uRes, d = uTexel * ${(SPREAD / 2).toFixed(2)};
  vec3 c = tap(uv + vec2(2.0 * d.x, 0.0)) + tap(uv - vec2(2.0 * d.x, 0.0)) + tap(uv + vec2(0.0, 2.0 * d.y)) + tap(uv - vec2(0.0, 2.0 * d.y));
  c += 2.0 * (tap(uv + d) + tap(uv - d) + tap(uv + vec2(d.x, -d.y)) + tap(uv - vec2(d.x, -d.y)));
  outColor = vec4(c / 12.0, 1.0);
}`
const COMBINE = `${HEAD}
uniform sampler2D uGlow;
uniform float uStrength;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  outColor = vec4(tap(uv) + uStrength * texture(uGlow, uv).rgb, 1.0);
}`

export function createBloom(gl: WebGL2RenderingContext, levels = 4, luma = 0) {
  const down = fullscreenProgram(DOWN)
  const up = fullscreenProgram(UP)
  const combine = fullscreenProgram(COMBINE)
  const chain = Array.from({ length: levels }, () => renderTarget(true)) // ½, ¼, ⅛ … of the source
  const out = renderTarget(true)
  return {
    /** Returns srcTex (w × h) plus strength × its glow. Leaves its own target bound: the caller re-binds its own. */
    apply(srcTex: WebGLTexture, w: number, h: number, strength: number): WebGLTexture {
      let tex = srcTex // the level being read
      let tw = w
      let th = h
      for (const [i, t] of chain.entries()) {
        t.fit(Math.max(1, w >> (i + 1)), Math.max(1, h >> (i + 1)))
        bindFramebufferInfo(gl, t)
        down({ uSrc: tex, uTexel: [1 / tw, 1 / th], uRes: [t.width, t.height], uThreshold: i ? 0 : THRESHOLD, uLuma: i ? 0 : luma })
        tex = t.attachments[0]
        tw = t.width
        th = t.height
      }
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.ONE, gl.ONE) // add the wider glow onto each sharper level
      for (let i = levels - 2; i >= 0; i--) {
        const s = chain[i + 1]
        bindFramebufferInfo(gl, chain[i])
        up({ uSrc: s.attachments[0], uTexel: [1 / s.width, 1 / s.height], uRes: [chain[i].width, chain[i].height] })
      }
      gl.disable(gl.BLEND)
      out.fit(w, h)
      bindFramebufferInfo(gl, out)
      combine({ uSrc: srcTex, uGlow: chain[0].attachments[0], uRes: [w, h], uStrength: strength / levels })
      return out.attachments[0]
    },
    /** Deletes the targets; the programs stay in the engine's cache. */
    dispose() {
      for (const t of [...chain, out]) {
        gl.deleteFramebuffer(t.framebuffer)
        gl.deleteTexture(t.attachments[0])
      }
    },
  }
}
