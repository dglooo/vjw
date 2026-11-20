// Text (backlog 6, user 2026-11-20): one line over the layers below — a custom text, the playing file's title or the
// DJ name. Canvas 2D draws it into an offscreen canvas, one channel per part (r fill, g outline, b glow = both
// blurred), uploaded only when the text, font, raster size or outline change, never per frame. A fullscreen pass places
// it: position, size (fitted to 92 % of the frame's width), rotation, colours, the glow, `pulse` (scale) and `glitch`
// (slices jump, the channels split). Both are motion: they move the text's light, add none.
// Light on a hit only through ⚡ `hit` (flashGate ≤ 3/s, WCAG 2.3.1; I-FL1): the glow flares, the fill lifts.
// Straight alpha under normal (as native/model, N3): the text lies over the layers below; premultiplied else.
import { TEXT_MAX } from '../doc'
import type { Input, Value } from '../fx/types'
import { fullscreenProgram } from '../gl/engine'
import { heatStep } from '../gl/post'
import type { NativeDef } from '../gl/scene'
import { store } from '../store'

/** [label, CSS weight, CSS family]: system stacks that Mac and Windows both carry; no network font at runtime. */
const FONTS = [
  ['Helvetica', 'bold', '"Helvetica Neue", Helvetica, Arial, sans-serif'],
  ['Arial Black', '900', '"Arial Black", "Arial Bold", Gadget, sans-serif'],
  ['Impact', 'normal', 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif'],
  ['Georgia', 'bold', 'Georgia, "Times New Roman", serif'],
  ['Futura', 'bold', 'Futura, "Century Gothic", "Trebuchet MS", sans-serif'],
  ['Mono', 'bold', 'Menlo, Consolas, "Courier New", monospace'],
] as const
const GLOW = 0.08 // knob: the glow's blur σ, of the em
const PAD = 3 * GLOW // the raster's margin around the ink, of the em (+ the outline): the blur's 3σ
const STEP = 32 // px: the raster's em in steps, so a governor scale step redraws it once
const MAX_PX = 768 // px: the raster's em at most (a .3 DJ name 2234 px tall: 670 px, drawn 1:1)
const MAX_W = 4096 // px: the raster's width at most; a longer line rasterises smaller (the mipmaps minify it)
const FIT = 0.92 // the ink's width on screen at most, of the frame's

/** The DJ name's row: one app-wide setting (`dj`), never a node value; the panel edits `dj` through it. */
export const DJ: Input = { name: 'dj', type: 'text', label: 'DJ name (all)', bindable: false }
/** Look knobs; size, outline and the strings shape the raster, so no binding drives them. */
export const inputs: Input[] = [
  { name: 'source', type: 'long', values: [0, 1, 2], labels: ['custom', 'track title', 'DJ name'], default: 0, bindable: false },
  { name: 'text', type: 'text', default: 'VEEJAY WIZARD', bindable: false }, // source custom
  DJ,
  { name: 'font', type: 'long', values: FONTS.map((_, i) => i), labels: FONTS.map((x) => x[0]), default: 0, bindable: false },
  { name: 'size', type: 'float', min: 0.02, max: 0.5, default: 0.12, bindable: false }, // the em, of the frame's height
  { name: 'x', type: 'float', min: 0, max: 1, default: 0.5 },
  { name: 'y', type: 'float', min: 0, max: 1, default: 0.5 }, // 0 the bottom
  { name: 'rotation', type: 'float', min: -180, max: 180, default: 0 }, // degrees, counter-clockwise
  { name: 'color', type: 'color', default: [1, 1, 1, 1] }, // the fill; alpha 0: the outline alone
  { name: 'accent', type: 'color', label: 'line + glow', default: [1, 0.2, 0.6, 1] },
  { name: 'outline', type: 'float', min: 0, max: 0.15, default: 0, bindable: false }, // its width, of the em
  { name: 'glow', type: 'float', min: 0, max: 2, default: 0.5, bindable: false }, // light: a beat lifts it through ⚡ hit only
  { name: 'pulse', type: 'float', min: 0, max: 0.5, default: 0 }, // the scale's add: motion
  { name: 'glitch', type: 'float', min: 0, max: 1, default: 0 }, // motion
  { name: 'hit', type: 'float', min: 0, max: 1, default: 0 }, // ⚡ the kick's light: the one input that adds light on a hit
]

const DJ_KEY = 'vjw.dj'
/** The DJ name (source "DJ name"): one app-wide setting, kept in localStorage `vjw.dj`. */
export const dj = {
  name: globalThis.localStorage?.getItem(DJ_KEY) ?? 'DJ NAME',
  set(s: string) {
    dj.name = s
    globalThis.localStorage?.setItem(DJ_KEY, s)
  },
}

const SHOW_KEY = 'vjw.text'
/** The app-wide text switch (user 2026-11-20 «текст надо уметь отключать»; key X, the bar's Text, a MIDI pad): off,
 *  every native/text layer is hidden, so live.ts skips it (no draw, no cost) and the rest of the scene plays on. Kept
 *  in localStorage `vjw.text`, default on; the store shows it. */
export function showText(on: boolean) {
  store.patch({ text: on })
  globalThis.localStorage?.setItem(SHOW_KEY, on ? '1' : '0')
}
store.patch({ text: globalThis.localStorage?.getItem(SHOW_KEY) !== '0' })

/** A file name as a title: no extension. A store slug (no space: `1-Kanine-Feel-The-Vibrat-EW6MXW.flac`) also loses
 *  its track number and download code, and its dashes read as spaces, a run of them as " - ". Pure. */
export function cleanTitle(file: string) {
  const s = file.replace(/\.[a-z0-9]{2,5}$/i, '')
  if (/\s/.test(s)) return s.trim()
  return s.replace(/^\d{1,3}-/, '').replace(/-+[A-Z0-9]{6}$/, '').replace(/[-_]+/g, (d) => (d.length > 1 ? ' - ' : ' ')).trim()
}

let file = '' // the last file name read, and its title: one per app, as the player
let title = ''
/** What a node shows now: its own text, the playing file's title ('' on line-in) or the DJ name. */
function shown(v: Readonly<Record<string, Value>>) {
  if (v.source === 1) {
    const s = store.getSnapshot().source
    const name = s?.kind === 'file' ? s.name : ''
    if (name !== file) title = cleanTitle((file = name))
    return title
  }
  return (v.source === 2 ? dj.name : String(v.text ?? '')).slice(0, TEXT_MAX)
}

/** Draws `text` into `c` over opaque black (each channel its own coverage: nothing to un-premultiply at the upload):
 *  r the fill, g the outline, b the glow. Returns the em drawn and the ink's width, px. */
function raster(c: OffscreenCanvas, text: string, font: number, want: number, outline: number): [number, number] {
  const [, weight, family] = FONTS[font] ?? FONTS[0]
  const x = c.getContext('2d')!
  const o = Math.max(0, outline)
  let px = want
  x.font = `${weight} ${px}px ${family}`
  let m = x.measureText(text)
  const w = m.actualBoundingBoxLeft + m.actualBoundingBoxRight
  if (w + 2 * (PAD + o) * px > MAX_W) {
    px = Math.max(8, Math.floor(MAX_W / (w / px + 2 * (PAD + o))))
    x.font = `${weight} ${px}px ${family}`
    m = x.measureText(text)
  }
  const pad = Math.ceil((PAD + o) * px)
  c.width = Math.ceil(m.actualBoundingBoxLeft + m.actualBoundingBoxRight) + 2 * pad
  c.height = Math.ceil(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) + 2 * pad
  x.font = `${weight} ${px}px ${family}` // a resize resets the context
  x.fillStyle = '#000'
  x.fillRect(0, 0, c.width, c.height)
  x.globalCompositeOperation = 'lighter' // pure channels add apart
  x.lineJoin = 'round'
  x.lineWidth = 2 * o * px // centred on the outline: its outer half shows
  const [ox, oy] = [pad + m.actualBoundingBoxLeft, pad + m.actualBoundingBoxAscent]
  x.filter = `blur(${GLOW * px}px)`
  x.fillStyle = x.strokeStyle = '#00f'
  x.fillText(text, ox, oy)
  if (o) x.strokeText(text, ox, oy)
  x.filter = 'none'
  x.strokeStyle = '#0f0'
  if (o) x.strokeText(text, ox, oy)
  x.fillStyle = '#f00'
  x.fillText(text, ox, oy)
  return [px, Math.max(1, c.width - 2 * pad)]
}

const FS = `#version 300 es
precision highp float;
uniform sampler2D uTex; // the raster: r fill, g outline, b glow
uniform vec2 uRes;
uniform vec2 uPos;      // the text's centre, of the frame (y up)
uniform vec2 uHalf;     // the raster's half size on screen, px
uniform float uRot;     // rad, counter-clockwise
uniform vec4 uColor;    // the fill
uniform vec4 uAccent;   // the outline and the glow
uniform float uGlow;
uniform float uHot;     // ⚡ input hit, gated by live.ts (flashGate), its rise slewed (heatStep): the light
uniform float uGlitch;
uniform float uSeed;    // a new glitch pattern every 50 ms of audio time
uniform float uPremul;  // 1: every blend but normal (N3)
out vec4 outColor;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// The text at raster point q, premultiplied: the glow, the outline over it, the fill on top. Off the raster: nothing
// (sampled anyway, so the mip level's derivatives stay defined).
vec4 look(vec2 q) {
  vec3 t = texture(uTex, q).rgb * float(q == clamp(q, 0.0, 1.0));
  vec4 c = vec4(uAccent.rgb, 1.0) * (1.0 - exp(-2.0 * t.b * uGlow * (1.0 + 1.5 * uHot))) * uAccent.a; // a soft knee, no slab
  float line = t.g * uAccent.a;
  c = vec4(uAccent.rgb, 1.0) * line + c * (1.0 - line);
  float fill = t.r * uColor.a;
  return vec4(min(vec3(1.0), uColor.rgb * (1.0 + 0.5 * uHot)), 1.0) * fill + c * (1.0 - fill);
}

void main() {
  vec2 p = gl_FragCoord.xy - uPos * uRes;
  float cs = cos(uRot), sn = sin(uRot);
  p = mat2(cs, -sn, sn, cs) * p; // into the text's frame
  vec2 q = vec2(0.5 + 0.5 * p.x / uHalf.x, 0.5 - 0.5 * p.y / uHalf.y); // the canvas' rows run down
  vec4 c;
  if (uGlitch > 0.0) {
    // Slices jump sideways, the channels split: the text's light moves, none is added.
    float band = floor(q.y * 14.0);
    if (hash(vec2(band, uSeed)) < 0.5 * uGlitch) q.x += (hash(vec2(uSeed, band)) - 0.5) * 0.3 * uGlitch;
    vec2 d = vec2(0.012 * uGlitch, 0.0);
    vec4 r = look(q + d), g = look(q), b = look(q - d);
    c = vec4(r.r, g.g, b.b, max(max(r.a, g.a), b.a));
  } else c = look(q);
  outColor = uPremul > 0.5 ? c : vec4(c.rgb / max(c.a, 1e-4), c.a);
}`

export const text: NativeDef = {
  id: 'native/text', name: 'Text', kind: 'generator', credit: 'VeeJay Wizard', inputs, flash: ['hit'],
  alpha: 'straight', // N3 under normal: live.ts keeps the layer off the direct path, so layer 0 reads d·a (LR-7)
  create(gl) {
    const draw = fullscreenProgram(FS)
    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    const c = new OffscreenCanvas(1, 1)
    let [drawn, px, ink, hot] = ['', 1, 1, 0] // drawn: the raster's key
    return {
      draw(f, v, _src, _s, blend) {
        const s = shown(v)
        const size = v.size as number
        const want = Math.min(MAX_PX, Math.max(STEP, Math.ceil((size * f.height) / STEP) * STEP))
        const key = `${v.font as number}|${want}|${v.outline as number}|${s}`
        if (key !== drawn) {
          drawn = key
          ;[px, ink] = raster(c, s, v.font as number, want, v.outline as number)
          gl.bindTexture(gl.TEXTURE_2D, tex)
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c)
          gl.generateMipmap(gl.TEXTURE_2D)
        }
        hot = heatStep(hot, v.hit as number, f.dt)
        const em = Math.min(size * f.height, (FIT * f.width * px) / ink) // the em on screen, px
        const k = (em / px) * (1 + (v.pulse as number))
        draw({
          uTex: tex, uRes: [f.width, f.height], uPos: [v.x, v.y], uHalf: [0.5 * c.width * k, 0.5 * c.height * k],
          uRot: ((v.rotation as number) * Math.PI) / 180, uColor: v.color, uAccent: v.accent, uGlow: v.glow, uHot: hot,
          uGlitch: Math.max(0, v.glitch as number), uSeed: Math.floor(f.audioNow * 20) % 1000, uPremul: blend && blend !== 'normal' ? 1 : 0,
        })
      },
      dispose() {
        gl.deleteTexture(tex)
      },
      hidden: () => !store.getSnapshot().text,
    }
  },
}
