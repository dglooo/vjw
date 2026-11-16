// Calibration (user 2026-11-17, Tier S): what the analyser hears, one tile per source, to judge by eye whether it reads
// the track right. The tiles are bind.ts sourceGroups() minus the camera and the bands, a row per group, so a new source
// shows up by itself. A tile: its label, the live value, a shape, and the last 4 s of the source over the beat grid (a
// thin line per beat, a heavier one per bar, opacity = the grid's confidence). The shape is driven through the binding
// chain (bind.ts evaluate()), so a tile's attack / release are a binding's: it moves as a bound parameter would, and
// the phases (beat, bar, lfo) read as a binding's falling saw. A smoothed tile also draws that level as a thin ink
// line over its history. Header: tempo, the beat in the bar, the grid's confidence, the detected genre, the HUD input
// meter.
// Per tile the panel edits shape, attack, release, colour and size: plain inputs under the tile's name (Input.group), so
// they live in the scene doc. The detectors are not touched: this is the view.
// Canvas2D for the text, then one texture upload (milkdrop's copy()): no GL of its own. No light input: every mark is
// local to its tile on a dark stage (I-FL1 measured at the scene's ship).
// Colours: the dataviz reference palette's dark steps and ink, validated on the tile surface (neighbours CVD ΔE ≥ 8.4).
// Each tile is its own labelled chart, so the eight hues repeat across rows.
// ponytail: the whole stage is redrawn and uploaded every frame; if a 4K fixed-quality stage ever bills too much, cap
// the canvas (copy() scales it) or move the shapes to a shader and upload the text at 10 Hz.
import { FLOOR, meter } from '../audio/meter'
import { PRESETS } from '../audio/presets'
import { evaluate, sourceGroups, type Binding, type BindState, type Sources } from '../bind'
import type { Input } from '../fx/types'
import type { NativeDef } from '../gl/scene'
import { copy } from '../milkdrop/native'
import { store } from '../store'

const HZ = 60 // history samples per s
const N = 4 * HZ // … of the last 4 s
const TEXT = 0.1 // s between value-text updates: each shows the peak since the last, so a hit between two is not lost
const PHASES = ['beat', 'bar', 'lfo'] // counts, not levels: read through a binding's saw (1 on the beat, falling)
const SHAPES = ['pulse', 'meter', 'ring', 'flash', 'line']
const [PULSE, METER, RING, FLASH, LINE] = [0, 1, 2, 3, 4]
/** A tile's first shape, where the meter is not the clearest. */
const FIRST: Record<string, number> = { kick: PULSE, snare: FLASH, hats: RING, drop: FLASH, onset: PULSE, beat: FLASH, bar: RING, wobble: LINE, lfo: LINE }
const PALETTE = [[57, 135, 229], [217, 89, 38], [25, 158, 112], [201, 133, 0], [213, 81, 129], [12, 163, 12], [144, 133, 233], [230, 103, 103]]
const [PAGE, SURFACE, INK, INK2, BASE] = ['#070707', '#141413', '#f0efec', '#c3c2b7', '#383835']
const [GOOD, WARNING, CRITICAL] = ['#0ca30c', '#fab219', '#d03b3b'] // the input meter: under −6 dBFS, to −3, over (the HUD's)
const FONT = 'ui-monospace, Menlo, monospace' // fixed-width: a changing value does not shift
const NONE: Sources = {}

/** The tiles, a row per source group (bind.ts): every source but the camera's and the bands. */
export const ROWS: readonly (readonly string[])[] = sourceGroups().filter((g) => g.label !== 'camera' && g.label !== 'band').map((g) => g.ids)
// Row j starts 3 hues on, so neighbours in a row are neighbours in the palette and a source appended to a group repaints nothing.
const TILES = ROWS.flatMap((ids, j) => ids.map((id, i) => ({ id, rgb: PALETTE[(3 * j + i) % PALETTE.length], shape: `${id}Shape`, attack: `${id}Attack`, release: `${id}Release`, color: `${id}Color`, size: `${id}Size` })))

/** Five inputs per tile, folded under its name in the panel. Unbound on purpose: the view shows the source, not a mix. */
export const inputs: Input[] = TILES.flatMap((t) => [
  { name: t.shape, group: t.id, label: 'shape', type: 'long', values: SHAPES.map((_, i) => i), labels: SHAPES, default: FIRST[t.id] ?? METER, bindable: false },
  { name: t.attack, group: t.id, label: 'attack s', type: 'float', min: 0, max: 0.5, default: 0, bindable: false }, // 0 = at once: the source as it is
  { name: t.release, group: t.id, label: 'release s', type: 'float', min: 0, max: 2, default: 0, bindable: false },
  { name: t.color, group: t.id, label: 'colour', type: 'color', default: [...t.rgb.map((x) => x / 255), 1] }, // alpha = the tile's brightness
  { name: t.size, group: t.id, label: 'size', type: 'float', min: 0.2, max: 1, default: 0.9, bindable: false }, // 1 = the shape's whole area
])

export interface Rect { x: number; y: number; w: number; h: number }
/** The tiles' rects in a w × h stage, in the rows' order: equal rows under `top`, a row's tiles equal, `gap` px between
 *  and around. */
export function layout(rows: readonly (readonly unknown[])[], w: number, h: number, gap: number, top = 0): Rect[] {
  const th = (h - top - gap * (rows.length + 1)) / rows.length
  return rows.flatMap((r, j) => {
    const tw = (w - gap * (r.length + 1)) / r.length
    return r.map((_, i) => ({ x: gap + i * (tw + gap), y: top + gap + j * (th + gap), w: tw, h: th }))
  })
}

/** The grid lines in a ring of beat (or bar) counts whose next write is `head`: `out[k]` = how many samples back from
 *  the newest a new beat starts (its count's floor differs from the sample before). Returns how many. */
export function ticks(ring: Float32Array, head: number, out: Float32Array): number {
  const n = ring.length
  let k = 0
  for (let a = 0; a < n - 1 && k < out.length; a++) {
    const i = (head - 1 - a + 2 * n) % n
    if (Math.floor(ring[i]) !== Math.floor(ring[(i - 1 + n) % n])) out[k++] = a
  }
  return k
}

/** A tile's parts, px: the header line (label left, value right), the shape's area on the left, the history right. */
function parts(r: Rect) {
  const fs = Math.min(0.14 * r.h, r.w / 11.5) // the text's px: a narrow tile shrinks it ('wobbleDepth 0.00' fits)
  const pad = 0.5 * fs
  const ay = r.y + pad + 1.4 * fs // the body's top
  const ah = r.y + r.h - pad - ay
  const aw = Math.min(0.36 * (r.w - 2 * pad), 1.3 * ah)
  return { r, font: `600 ${fs.toFixed(1)}px ${FONT}`, lx: r.x + pad, ly: r.y + pad + 0.5 * fs, vx: r.x + r.w - pad, ax: r.x + pad, ay, aw, ah, sx: r.x + 2 * pad + aw, sw: r.w - 3 * pad - aw }
}

const bind = (id: string): Binding => ({ source: id, amount: 1, attack: 0, release: 0, min: 0, max: 1, shape: PHASES.includes(id) ? 'saw' : undefined })
const byte = (x: number) => Math.min(255, Math.max(0, Math.round(x * 255))) // a doc's colour is unchecked: clamp it
const TURN = 2 * Math.PI
const STEP = 1 / (N - 1) // one history sample, as a share of the strip's width

export const calib: NativeDef = {
  id: 'native/calib', name: 'Calibration', kind: 'generator', tags: ['audio', 'tool'], credit: 'VeeJay Wizard', inputs,
  create() {
    const cv = new OffscreenCanvas(2, 2)
    const c = cv.getContext('2d', { alpha: false })!
    // Per tile: the source as it is (`x`: a binding with no smoothing) and as drawn (`y`: the tile's attack / release),
    // their rings, the peaks since the last history sample and the last text, and the colour as CSS.
    const st = TILES.map((t) => ({ raw: bind(t.id), b: bind(t.id), sRaw: { y: 0 } as BindState, s: { y: 0 } as BindState, x: 0, y: 0, hi: 0, peak: 0, text: '', xs: new Float32Array(N), ys: new Float32Array(N), rgb: -1, css: '' }))
    const beats = new Float32Array(N) // the grid as the analyser had it at each sample
    const bars = new Float32Array(N)
    const tBeat = new Float32Array(64) // 4 s of beats up to 960 BPM
    const tBar = new Float32Array(16)
    let geo: ReturnType<typeof parts>[] = []
    let [head, acc, last, textAge] = [0, 0, NaN, TEXT]
    let [bpmText, infoText, inText, hfont] = ['', '', '', '']
    /** One set of grid lines over every tile's history; `acc` slides them between two samples. */
    const grid = (t: Float32Array, n: number, alpha: number, lw: number) => {
      c.globalAlpha = alpha
      c.lineWidth = lw
      c.beginPath()
      for (const g of geo)
        for (let k = 0; k < n; k++) {
          const x = g.sx + g.sw * (1 - (t[k] + acc) * STEP)
          c.moveTo(x, g.ay)
          c.lineTo(x, g.ay + g.ah)
        }
      c.stroke()
    }
    /** The last 4 s of `ring` as a path, oldest first: from x0 over `wd` px, `up` px above `base` at 1, ending on `now`
     *  at the right edge. */
    const trace = (ring: Float32Array, now: number, x0: number, wd: number, base: number, up: number) => {
      c.beginPath()
      for (let k = N - 2; k >= 0; k--) c.lineTo(x0 + wd * (1 - (k + acc) * STEP), base - up * ring[(head - 1 - k + 2 * N) % N])
      c.lineTo(x0 + wd, base - up * now)
    }
    return {
      draw(f, v, _src, s = NONE) {
        const { width: w, height: h } = f
        const gap = Math.round(0.012 * h)
        const top = Math.round(0.065 * h) // the header's height
        if (cv.width !== w || cv.height !== h) {
          cv.width = w
          cv.height = h
          geo = layout(ROWS, w, h, gap, top).map(parts)
          hfont = `600 ${(0.5 * top).toFixed(1)}px ${FONT}`
        }
        // Real time from the audio clock: f.dt is the layer's (its speed, the arrangement's heat). NaN at first → 0.
        const dt = Math.min(Math.max(f.audioNow - last, 0), 0.1) || 0
        last = f.audioNow
        for (let i = 0; i < st.length; i++) {
          const q = st[i]
          q.b.attack = v[TILES[i].attack] as number
          q.b.release = v[TILES[i].release] as number
          q.x = evaluate(q.raw, s, q.sRaw, dt)
          q.y = evaluate(q.b, s, q.s, dt)
          q.hi = Math.max(q.hi, q.x)
          q.peak = Math.max(q.peak, q.x)
        }
        const pushed = acc + dt * HZ >= 1
        for (acc += dt * HZ; acc >= 1; acc--) { // HZ samples per s at any frame rate; each holds the peak since the last
          for (const q of st) {
            q.xs[head] = q.hi
            q.ys[head] = q.y
          }
          beats[head] = f.sync.beat
          bars[head] = f.sync.bar
          head = (head + 1) % N
        }
        if (pushed) for (const q of st) q.hi = 0
        const { bpm, bar, confidence } = f.sync
        if ((textAge += dt) >= TEXT) {
          textAge = 0
          for (const q of st) {
            q.text = q.peak.toFixed(2)
            q.peak = 0
          }
          const g = store.getSnapshot().style
          bpmText = bpm ? `${bpm.toFixed(1)} BPM` : '— BPM'
          infoText = `grid ${confidence.toFixed(2)}   ${g.detected ? `${PRESETS[g.detected].name} ${g.confidence.toFixed(2)}` : 'genre —'}`
          inText = `in ${Math.round(meter.db)} dBFS`
        }
        const u = h / 1080 // line widths in 1080p px
        c.fillStyle = PAGE
        c.fillRect(0, 0, w, h)
        c.lineJoin = 'round' // a hit's spike grows no miter
        c.textBaseline = 'middle'
        // The header: tempo, the beat in the bar as four pips, the grid's confidence and the genre; right, the input
        // meter (the HUD's: the held peak from the floor to 0 dBFS, coloured by its headroom; CLIP while latched).
        const hf = 0.5 * top
        const hy = (gap + top) / 2
        const pip = 0.55 * hf
        const px = gap + 6 * hf // past '999.9 BPM'
        const on = bpm ? Math.floor((bar - Math.floor(bar)) * 4) : -1
        const mw = 6 * hf
        const mh = 0.3 * hf
        let font = (c.font = hfont)
        c.textAlign = 'left'
        c.fillStyle = INK
        c.fillText(bpmText, gap, hy)
        for (let k = 0; k < 4; k++) {
          c.globalAlpha = k === on ? 1 : 0.2
          c.fillRect(px + 1.5 * pip * k, hy - pip / 2, pip, pip)
        }
        c.globalAlpha = 1
        c.fillStyle = INK2
        c.fillText(infoText, px + 6.5 * pip, hy)
        c.fillStyle = BASE
        c.fillRect(w - gap - mw, hy - mh / 2, mw, mh)
        c.fillStyle = meter.db > -3 ? CRITICAL : meter.db > -6 ? WARNING : GOOD
        c.fillRect(w - gap - mw, hy - mh / 2, (mw * (meter.db - FLOOR)) / -FLOOR, mh)
        c.textAlign = 'right'
        c.fillStyle = meter.clip ? CRITICAL : INK2
        c.fillText(meter.clip ? 'CLIP' : inText, w - gap - mw - 0.6 * hf, hy)
        // The tiles' surfaces, then the beat grid behind every history as the analyser had it then (its opacity is the
        // grid's confidence now), then the histories' floors.
        c.fillStyle = SURFACE
        c.beginPath()
        for (const g of geo) c.roundRect(g.r.x, g.r.y, g.r.w, g.r.h, 6 * u)
        c.fill()
        c.strokeStyle = INK
        grid(tBeat, ticks(beats, head, tBeat), 0.16 * confidence, u)
        grid(tBar, ticks(bars, head, tBar), 0.5 * confidence, 2 * u)
        c.globalAlpha = 1
        c.strokeStyle = BASE
        c.lineWidth = u
        c.beginPath()
        for (const g of geo) {
          c.moveTo(g.sx, g.ay + g.ah)
          c.lineTo(g.sx + g.sw, g.ay + g.ah)
        }
        c.stroke()
        const { muted } = store.getSnapshot() // the Sources tab's mute: such a tile reads 0, dimmed and labelled
        for (let i = 0; i < st.length; i++) {
          const t = TILES[i]
          const q = st[i]
          const g = geo[i]
          const col = v[t.color] as readonly number[]
          const rgb = (byte(col[0]) << 16) | (byte(col[1]) << 8) | byte(col[2])
          if (rgb !== q.rgb) q.css = `#${(q.rgb = rgb).toString(16).padStart(6, '0')}`
          const off = muted.includes(t.id)
          const a = off ? 0.3 * col[3] : col[3]
          const base = g.ay + g.ah
          c.fillStyle = c.strokeStyle = q.css
          // The history: the source's last 4 s as a line over its area, the newest at the right edge.
          trace(q.xs, q.x, g.sx, g.sw, base, g.ah)
          c.globalAlpha = 0.9 * a
          c.lineWidth = 2 * u
          c.stroke()
          c.lineTo(g.sx + g.sw, base)
          c.lineTo(g.sx, base)
          c.globalAlpha = 0.2 * a
          c.fill()
          if (q.b.attack > 0 || q.b.release > 0) { // smoothed: the level as drawn, a thin ink line over the source's
            trace(q.ys, q.y, g.sx, g.sw, base, g.ah)
            c.globalAlpha = 0.8 * a
            c.strokeStyle = INK
            c.lineWidth = u
            c.stroke()
            c.strokeStyle = q.css
          }
          // The shape, at the level as drawn (`y`), within radius R of its area's centre.
          const cx = g.ax + g.aw / 2
          const cy = g.ay + g.ah / 2
          const R = ((v[t.size] as number) * Math.min(g.aw, g.ah)) / 2
          const y = q.y
          c.lineWidth = 1.5 * u
          switch (v[t.shape] as number) {
            case PULSE: // a disc that grows and brightens, inside its full-scale ring
              c.globalAlpha = 0.25 * a
              c.beginPath()
              c.arc(cx, cy, R, 0, TURN)
              c.stroke()
              c.globalAlpha = (0.12 + 0.88 * y) * a
              c.beginPath()
              c.arc(cx, cy, R * (0.2 + 0.8 * y), 0, TURN)
              c.fill()
              break
            case RING: // a ring that widens and thickens
              c.globalAlpha = (0.2 + 0.8 * y) * a
              c.lineWidth = R * (0.06 + 0.3 * y)
              c.beginPath()
              c.arc(cx, cy, R * (0.35 + 0.5 * y), 0, TURN)
              c.stroke()
              break
            case FLASH: // a square whose light is the level
              c.globalAlpha = 0.25 * a
              c.strokeRect(cx - R, cy - R, 2 * R, 2 * R)
              c.globalAlpha = y * a
              c.fillRect(cx - R, cy - R, 2 * R, 2 * R)
              break
            case LINE: // the drawn level's last 4 s: the attack / release at work, beside the source's history
              trace(q.ys, y, g.ax, g.aw, cy + R, 2 * R)
              c.globalAlpha = a
              c.lineWidth = 2 * u
              c.stroke()
              break
            default: // METER: a bar from the floor to the level, in its full-scale frame
              c.globalAlpha = 0.25 * a
              c.strokeRect(cx - 0.35 * R, cy - R, 0.7 * R, 2 * R)
              c.globalAlpha = a
              c.fillRect(cx - 0.35 * R, cy + R - 2 * R * y, 0.7 * R, 2 * R * y)
          }
          // The label and the value in ink, never in the tile's colour: the marks carry it.
          c.globalAlpha = 1
          if (g.font !== font) c.font = font = g.font
          c.textAlign = 'left'
          c.fillStyle = INK2
          c.fillText(t.id, g.lx, g.ly)
          c.textAlign = 'right'
          c.fillStyle = INK
          c.fillText(off ? 'muted' : q.text, g.vx, g.ly)
        }
        copy(cv, w, h)
      },
    }
  },
}
