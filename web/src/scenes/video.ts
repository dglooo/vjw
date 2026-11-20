// Video (backlog 8, user 2026-11-20): one of the user's clips (clips.ts) as a layer, looped and muted: the music drives
// the picture, never the clip's sound. The clip plays in this instance's own hidden <video> (camera.ts hiddenVideo),
// made at its first clip. A new frame (requestVideoFrameCallback; each draw where that is missing) is uploaded at the
// next draw by camera.ts's copy rule (copyFrame), so an unchanged frame is never uploaded again. Not drawn for IDLE ms
// (a cached scene off stage, a muted layer), the clip pauses; the next draw plays it on.
// `speed` is the playbackRate (bindable: motion only). ⚡ `jump` is an event that seeks forward to a seeded random
// point (jumpTime): a hard cut is a luma step, so its binding is flash-gated (≤ 3 onsets/s). `fit` cover / contain,
// `x`, `y`, `zoom`: fitXf. A user's clip may strobe: live.ts runs this layer under the toy limiter (post.ts toyLimit),
// which leaves a clip with steady light as it is. No clip, or one not in the library: a hint («drop a clip»). A tile
// plays nothing: it shows the hint with the clip's name.
// Straight alpha under normal (as native/text): an alpha webm lies over the layers below; premultiplied else.
import { createTexture } from 'twgl.js'
import { copyFrame, hiddenVideo } from '../camera/camera'
import { clips } from '../clips'
import type { Input } from '../fx/types'
import { fullscreenProgram } from '../gl/engine'
import type { NativeDef } from '../gl/scene'

const IDLE = 500 // knob: ms without a draw after which the clip pauses
const RATE = 0.02 // knob: the smallest speed change passed on to the playbackRate (a bound speed moves every frame)
const [HINT_W, HINT_H] = [960, 540] // px: the hint's raster
const NONE = [0, 0, 2, 2] // an xf that maps the whole stage outside the picture: a transparent frame

/** The clip: its file name in the library (clips.ts), '' none. The panel shows a select over the library (ui/Clips.tsx). */
export const CLIP: Input = { name: 'clip', type: 'text', default: '', bindable: false }
export const inputs: Input[] = [
  CLIP,
  { name: 'speed', type: 'float', min: 0.1, max: 4, default: 1 }, // the playbackRate: motion only
  { name: 'jump', type: 'event' }, // ⚡ a seek to a random point: a hard cut, so its binding is flash-gated
  { name: 'fit', type: 'long', values: [0, 1], labels: ['cover', 'contain'], default: 0, bindable: false },
  { name: 'x', type: 'float', min: 0, max: 1, default: 0.5 }, // the picture's centre on the stage
  { name: 'y', type: 'float', min: 0, max: 1, default: 0.5 }, // 0 the bottom
  { name: 'zoom', type: 'float', min: 0.25, max: 4, default: 1 },
]

/** clipUv from stageUv (xf.ts's space: [0,1]², y down): clipUv = stageUv · xf.xy + xf.zw. Cover fills the stage and crops
 *  the surplus; contain shows the whole clip with bars beside it (uv outside [0,1]: transparent). `zoom` scales the
 *  picture about its centre, which `x`, `y` place on the stage (0..1, y 0 the bottom). Cover, centred, zoom 1 is xf.ts's
 *  coverFit, unmirrored. */
export function fitXf(sw: number, sh: number, cw: number, ch: number, contain: boolean, x: number, y: number, zoom: number): [number, number, number, number] {
  const s = (contain ? Math.min : Math.max)(sw / cw, sh / ch) * zoom // stage px per clip px
  const ax = sw / (s * cw) // clip uv per stage uv
  const ay = sh / (s * ch)
  return [ax, ay, 0.5 - x * ax, 0.5 - (1 - y) * ay]
}

/** The `n`-th jump's seek target from `at` s in a clip of `d` s: forward by 20–80 % of the clip (always a visible cut),
 *  wrapped. Seeded by `n` (bind.ts's `random` hash), never Math.random. */
export function jumpTime(at: number, d: number, n: number) {
  const h = Math.sin(n * 12.9898) * 43758.5453
  return (at + d * (0.2 + 0.6 * (h - Math.floor(h)))) % d
}

const FS = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform vec4 uXf;
uniform float uPremul;
out vec4 outColor;
void main() {
  vec2 c = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uRes * uXf.xy + uXf.zw; // the uploaded row 0 is the top row
  vec4 t = c == clamp(c, 0.0, 1.0) ? texture(uTex, c) : vec4(0.0);
  outColor = uPremul > 0.5 ? vec4(t.rgb * t.a, t.a) : t;
}`

/** The hint into `c`: a dashed frame, `a` big, `b` small under it (fillText's maxWidth fits a long clip name). */
function hint(c: OffscreenCanvas, a: string, b: string) {
  const g = c.getContext('2d')!
  g.clearRect(0, 0, HINT_W, HINT_H)
  g.strokeStyle = 'rgba(255, 255, 255, 0.35)'
  g.lineWidth = 4
  g.setLineDash([22, 16])
  g.strokeRect(8, 8, HINT_W - 16, HINT_H - 16)
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = 'rgba(255, 255, 255, 0.85)'
  g.font = 'bold 72px system-ui, sans-serif'
  g.fillText(a, HINT_W / 2, HINT_H / 2 - 30, HINT_W - 80)
  g.fillStyle = 'rgba(255, 255, 255, 0.5)'
  g.font = '32px system-ui, sans-serif'
  g.fillText(b, HINT_W / 2, HINT_H / 2 + 50, HINT_W - 80)
}

export const video: NativeDef = {
  id: 'native/video', name: 'Video', kind: 'generator', credit: 'VeeJay Wizard', inputs, flash: ['jump'],
  alpha: 'straight', // N3 under normal: live.ts keeps the layer off the direct path (LR-7)
  bind: {
    speed: { source: 'kick', amount: 1, attack: 0.02, release: 0.3, min: 0.7, max: 1.6 }, // the kick surges the clip (edit.ts MUSIC_TIME's shape)
    jump: { source: 'bar', shape: 'square', rate: 0.25, amount: 1, attack: 0, release: 0, min: 0, max: 1 }, // ⚡ a cut on each phrase (4 bars), once the tempo is sure
  },
  create(gl, size) {
    const out = fullscreenProgram(FS)
    const tex = createTexture(gl, { minMag: gl.LINEAR, wrap: gl.CLAMP_TO_EDGE, auto: false })
    const hintTex = createTexture(gl, { minMag: gl.LINEAR, wrap: gl.CLAMP_TO_EDGE, auto: false })
    const dims = { w: 0, h: 0 } // tex's size, 0: no frame of this clip yet
    const hintDims = { w: 0, h: 0 }
    let canvas: OffscreenCanvas | null = null
    let el: HTMLVideoElement | null = null
    let rvfc = false // the element has requestVideoFrameCallback
    let cb = 0 // its pending callback
    let file: File | undefined // the clip in the element
    let url = '' // its object URL
    let want: string | null = null // the clip name the last lookup was for
    let rev = -1 // clips.rev at that lookup
    let shown = '' // the hint's text in hintTex
    let fresh = false // a frame came since the last upload
    let drawn = 0 // performance.now() of the last draw
    let jumps = 0 // jumpTime's seed
    const onFrame = () => {
      fresh = true
      if (performance.now() - drawn > IDLE) el!.pause()
      cb = el!.requestVideoFrameCallback(onFrame)
    }
    /** `next` into the element (none: the hint). The last frame stays up until the next clip's first. */
    function play(next: File | undefined) {
      file = next
      if (url) URL.revokeObjectURL(url)
      url = ''
      fresh = false
      if (!next) {
        dims.w = dims.h = 0
        if (el) {
          el.removeAttribute('src')
          el.load()
        }
        return
      }
      if (!el) {
        el = hiddenVideo()
        el.loop = true
        rvfc = 'requestVideoFrameCallback' in el
        if (rvfc) cb = el.requestVideoFrameCallback(onFrame)
      }
      el.src = url = URL.createObjectURL(next)
      el.play().catch(() => {}) // an AbortError: the next clip came first
    }
    return {
      draw(f, v, _src, _s, blend) {
        drawn = performance.now()
        const name = v.clip as string
        if (!size && (name !== want || clips.rev !== rev)) {
          ;[want, rev] = [name, clips.rev]
          const next = name ? clips.get(name)?.file : undefined
          if (next !== file) play(next)
        }
        if (el && file && !el.error) {
          const r = Math.min(16, Math.max(0.0625, v.speed as number)) // Chrome's range; outside it the setter throws
          if (Math.abs(el.playbackRate - r) >= RATE) el.playbackRate = r // the load resets it: sent again after a switch
          if (v.jump && el.duration > 0 && Number.isFinite(el.duration)) el.currentTime = jumpTime(el.currentTime, el.duration, ++jumps)
          if (el.paused) el.play().catch(() => {}) // after IDLE
          if (!rvfc) fresh = true
          if (fresh && el.readyState >= el.HAVE_CURRENT_DATA) {
            fresh = false
            copyFrame(tex, el, el.videoWidth, el.videoHeight, dims)
          }
        }
        const u = { uTex: tex, uRes: [f.width, f.height], uXf: NONE, uPremul: blend && blend !== 'normal' ? 1 : 0 }
        if (dims.w && file && !el?.error) u.uXf = fitXf(f.width, f.height, dims.w, dims.h, v.fit === 1, v.x as number, v.y as number, v.zoom as number)
        else {
          const [a, b] = !name ? ['drop a clip', 'mp4 · webm · mov'] : size ? [name, 'video clip'] : !file ? [name, 'not in the clips: drop it, or allow the clips folder'] : el?.error ? [name, 'this file does not play here'] : ['', ''] // '': loading
          if (a && `${a}\n${b}` !== shown) {
            shown = `${a}\n${b}`
            hint((canvas ??= new OffscreenCanvas(HINT_W, HINT_H)), a, b)
            copyFrame(hintTex, canvas, HINT_W, HINT_H, hintDims)
          }
          if (a) Object.assign(u, { uTex: hintTex, uXf: fitXf(f.width, f.height, HINT_W, HINT_H, true, 0.5, 0.5, 0.6) })
        }
        out(u)
      },
      dispose() {
        if (el) {
          if (rvfc) el.cancelVideoFrameCallback(cb)
          el.pause()
          el.removeAttribute('src')
          el.load()
          el.remove()
        }
        if (url) URL.revokeObjectURL(url)
        gl.deleteTexture(tex)
        gl.deleteTexture(hintTex)
      },
    }
  },
}
