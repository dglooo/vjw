// MilkDrop presets as catalog natives (design_milkdrop § Variant A, C2–C4): `milk/<slug>` renders its preset on a
// pooled Butterchurn visualizer (its own WebGL2 context, on an OffscreenCanvas), then copies that frame into the bound
// target: copy path (a), design § Probe ruling.
import butterchurn, { type Visualizer } from 'butterchurn'
import { createTexture } from 'twgl.js'
import { analyser, ctx } from '../audio/input'
import { fullscreenProgram, gl } from '../gl/engine'
import type { NativeDef } from '../gl/scene'
import { PRESETS } from './presets'

const tex = createTexture(gl, { minMag: gl.LINEAR, wrap: gl.CLAMP_TO_EDGE, auto: false }) // shared: copy() uploads and draws at once
let tw = 0
let th = 0
const flip = fullscreenProgram(`#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uRes;
out vec4 outColor;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  outColor = texture(uSrc, vec2(uv.x, 1.0 - uv.y));
}`)

/** Copy paths (a)–(c) (bench.ts K1): `src` into the shared RGBA8 texture, reallocated when its size changes, then drawn
 *  Y-flipped over the bound target (w × h): a canvas uploads its top row first, and a texture's first row draws at the
 *  bottom. */
export function copy(src: OffscreenCanvas | HTMLCanvasElement | ImageBitmap, w: number, h: number) {
  gl.bindTexture(gl.TEXTURE_2D, tex)
  if (src.width === tw && src.height === th) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, src)
  else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src)
    tw = src.width
    th = src.height
  }
  flip({ uSrc: tex, uRes: [w, h] })
}

const bytes = new Uint8Array(analyser.fftSize).fill(128) // 1024, Butterchurn's window; silence until the first draw
const audioLevels = { timeByteArray: bytes, timeByteArrayL: bytes, timeByteArrayR: bytes } // our analyser is mono
const PX = { pixelRatio: 1, textureRatio: 1 } // the target's own pixels

// ponytail: uncapped pool, one Chromium context each (16 max); cap if ←/→ spam ever shows
const free: Visualizer[] = []
let made = 0 // visualizers so far, pooled or live: warm() makes the pool's 2
function make() {
  made++
  const canvas = document.createElement('canvas')
  canvas.getContext('bitmaprenderer') // Butterchurn gets no 2D context, so its frame stays in internalCanvas (S1.1 G2)
  const v = butterchurn.createVisualizer(ctx, canvas, { width: 16, height: 16, ...PX })
  v.internalCanvas.addEventListener('webglcontextlost', () => location.reload()) // as the stage, engine.ts:17
  return v
}

/** `p` into `v`, then one throwaway render that links its programs off screen. A failed load is logged and resolves
 *  false (its native stays black), never rejects. */
function load(v: Visualizer, p: (typeof PRESETS)[number]) {
  return v.loadPreset(p.preset, 0).then(
    () => {
      v.render({ audioLevels, elapsedTime: 1 / 60 })
      return true
    },
    (e) => {
      console.error(`milk/${p.slug}: ${e}`)
      return false
    },
  )
}

/** One native per shipped preset (CP2 contract). Its visualizer comes from the pool and goes back once its load settled. */
export const milkdrop: readonly NativeDef[] = PRESETS.map((p): NativeDef => ({
  id: `milk/${p.slug}`, name: p.name, kind: 'generator', category: 'feedback', credit: p.author, inputs: [],
  create() {
    const v = free.pop() ?? make()
    let ready = false
    let settled = false
    const loading = load(v, p)
      .then((ok) => (ready = ok)) // black until then
      .finally(() => (settled = true))
    return {
      draw(f) {
        if (!ready) {
          gl.clearColor(0, 0, 0, 1)
          gl.clear(gl.COLOR_BUFFER_BIT)
          return
        }
        if (v.internalCanvas.width !== f.width || v.internalCanvas.height !== f.height) v.setRendererSize(f.width, f.height, PX)
        analyser.getByteTimeDomainData(bytes)
        v.render({ audioLevels, elapsedTime: f.dt }) // its unit, G10
        copy(v.internalCanvas, f.width, f.height)
      },
      // Back at once when its load has settled: prepare() builds right after it disposes (live.ts), as does a panel remove
      // then add, and that build takes this visualizer instead of making one more. Never mid-load: two loads would race.
      dispose() {
        if (settled) free.push(v)
        else loading.then(() => free.push(v))
      },
    }
  },
  // Start (live.ts warm()): this preset loads once, so its later loads hit the caches, on either visualizer. Until the
  // pool's 2 exist (once per page), each new one takes this load, so both are past their first (it blocks ≤ 26 ms,
  // design § Probe ruling) even with one milk scene; make, load, make, load keeps the two creates apart.
  async warm() {
    do {
      const v = made < 2 ? make() : (free.pop() ?? make())
      await load(v, p)
      free.push(v)
    } while (made < 2)
  },
}))
