import { useEffect, useRef, useSyncExternalStore } from 'react'
import { history, settings } from '../app'
import { BUILD, L, range, xAt } from '../audio/history'
import { player } from '../audio/input'
import { PRESETS } from '../audio/presets'
import { activePreset } from '../audio/settings'
import { FONT, INK, INK2, PALETTE, SURFACE } from '../scenes/calib'
import { clock, store } from '../store'

// The analysis screen (user 2026-11-21, «экран анализа»: what the system hears in a track). A Canvas2D timeline of the
// last 30 s from app.ts `history`, a row per signal: the drums as ticks, the low end and the melody as levels, the
// pitch class as blocks, the beat grid behind every row (a line per beat, a heavier numbered one per bar), the
// arrangement's sections; under it, with a file, the whole track (a click seeks there). Its own rAF at ≤ 30 draws per s,
// only while open: closed, nothing of it runs but app.ts's record. No GL: the stage plays on behind it untouched.
// Colours: the calibration view's validated dark palette (dataviz reference), in slot order per strip; text in ink.
const SPAN = 30 // s on the timeline
const FPS = 30 // draws per s, at most
const GUTTER = 120 // px: each row's label and live value
const PAD = 8
const GAP = 10 // px between two strips
const AXIS = 16 // px over the rows: the time labels
const OVERVIEW = 56 // px: the whole track
const NOTES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
const [C1, C2, C3, C4] = PALETTE.map(([r, g, b]) => `rgb(${r} ${g} ${b})`)

type Kind = 'tick' | 'level' | 'pitch' | 'grid' | 'arrange'
/** `strip`: a new strip starts here (a gap above). `h`: its share of the height. */
const ROWS: readonly { label: string; lane: number; kind: Kind; h: number; color: string; strip?: true }[] = [
  { label: 'kick', lane: L.kick, kind: 'tick', h: 18, color: C1 },
  { label: 'snare', lane: L.snare, kind: 'tick', h: 18, color: C2 },
  { label: 'hats', lane: L.hats, kind: 'tick', h: 18, color: C3 },
  { label: '⚡ flash', lane: L.flash, kind: 'tick', h: 14, color: C4 },
  { label: 'sub', lane: L.sub, kind: 'level', h: 30, color: C1, strip: true },
  { label: 'reese', lane: L.reese, kind: 'level', h: 30, color: C2 },
  { label: 'energy', lane: L.energy, kind: 'level', h: 30, color: C3 },
  { label: 'tonal', lane: L.tonal, kind: 'level', h: 26, color: C1, strip: true },
  { label: 'pitch', lane: L.pitch, kind: 'pitch', h: 20, color: INK },
  { label: 'voice', lane: L.voice, kind: 'level', h: 26, color: C2 },
  { label: 'grid', lane: L.confidence, kind: 'grid', h: 40, color: C1, strip: true },
  { label: 'arrange', lane: L.build, kind: 'arrange', h: 40, color: C1, strip: true },
]
const UNITS = ROWS.reduce((a, r) => a + r.h, 0)
const STRIPS = ROWS.filter((r) => r.strip).length

let ov: { y: number; h: number } | null = null // the overview as last drawn: a click's target

/** One frame of the screen, `w` × `h` CSS px. */
function draw(c: CanvasRenderingContext2D, w: number, h: number) {
  const b = history.recent
  const now = history.now
  const [i0, i1] = range(b, now, SPAN)
  const tw = w - GUTTER - PAD
  const X = (i: number) => xAt(i * b.width, now, SPAN, GUTTER, tw)
  const file = store.getSnapshot().source?.kind === 'file' ? history.track : null
  const k = (h - AXIS - PAD - STRIPS * GAP - (file ? GAP + OVERVIEW : 0)) / UNITS // the rows fill the height
  c.clearRect(0, 0, w, h)
  c.font = `12px ${FONT}`
  c.textBaseline = 'middle'
  c.fillStyle = INK2
  for (let s = 0; s <= SPAN; s += 5) {
    c.textAlign = s ? (s < SPAN ? 'center' : 'left') : 'right'
    c.fillText(s ? `−${s} s` : 'now', GUTTER + tw * (1 - s / SPAN), AXIS / 2)
  }
  let y = AXIS
  const rows = ROWS.map((r) => {
    if (r.strip) y += GAP
    const at = { ...r, y, h: r.h * k }
    y += at.h
    return at
  })
  c.fillStyle = SURFACE
  for (const r of rows) c.fillRect(GUTTER, r.y, tw, r.h)
  // The beat grid behind every row, as the analyser had it: a line per beat, a heavier one per bar, numbered in the
  // grid row. A hole (no frame in a bucket) compares with the bucket before; no grid (bpm 0) draws none.
  const top = rows[0].y
  const bottom = y
  const g = rows.find((r) => r.kind === 'grid')!
  const beats = new Path2D()
  const bars = new Path2D()
  let [pb, pr, labelled] = [NaN, NaN, -Infinity]
  c.fillStyle = INK2
  c.textAlign = 'left'
  for (let i = i0; i <= i1; i++) {
    const bpm = b.get(i, L.bpm)
    if (Number.isNaN(bpm)) continue
    if (!bpm) {
      pb = pr = NaN
      continue
    }
    const beat = Math.floor(b.get(i, L.beat))
    const bar = Math.floor(b.get(i, L.bar))
    const x = X(i)
    if (beat !== pb && !Number.isNaN(pb)) {
      beats.moveTo(x, top)
      beats.lineTo(x, bottom)
    }
    if (bar !== pr && !Number.isNaN(pr)) {
      bars.moveTo(x, top)
      bars.lineTo(x, bottom)
      if (x - labelled >= 28 && x < GUTTER + tw - 20) {
        c.fillText(String(bar + 1), x + 3, g.y + g.h - 8) // under the confidence line, which sits at the top once sure
        labelled = x
      }
    }
    pb = beat
    pr = bar
  }
  c.strokeStyle = INK
  c.lineWidth = 1
  c.globalAlpha = 0.12
  c.stroke(beats)
  c.globalAlpha = 0.4
  c.stroke(bars)
  c.globalAlpha = 1
  for (const r of rows) {
    const base = r.y + r.h
    let value = ''
    if (r.kind === 'tick') {
      c.fillStyle = r.color
      let n = 0
      for (let i = i0; i <= i1; i++)
        if (b.get(i, r.lane) > 0) {
          n++
          c.fillRect(X(i) - 1, r.y + 2, 2, r.h - 4)
        }
      value = String(n) // hits in the last 30 s
    } else if (r.kind === 'pitch') {
      // a block per run of one pitch class, its hue the class's (scenes turn pitch into hue), as bright as the run is tonal
      let [x0, pc, ton] = [NaN, -1, 0]
      const block = (x1: number) => {
        if (pc < 0) return
        c.globalAlpha = 0.3 + 0.6 * ton
        c.fillStyle = `hsl(${pc * 30} 70% 45%)`
        c.fillRect(x0, r.y + 1, x1 - x0, r.h - 2)
        c.globalAlpha = 1
        c.fillStyle = INK
        if (x1 - x0 >= 22) c.fillText(NOTES[pc], x0 + 4, r.y + r.h / 2)
      }
      for (let i = i0; i <= i1; i++) {
        const p = b.get(i, L.pitch)
        if (Number.isNaN(p)) continue
        const q = Math.round(p * 12) % 12
        if (q !== pc) {
          block(X(i))
          ;[x0, pc, ton] = [X(i), q, 0]
        }
        ton = Math.max(ton, b.get(i, L.tonal))
      }
      block(GUTTER + tw)
      value = pc < 0 ? '—' : NOTES[pc]
    } else {
      if (r.kind === 'arrange') {
        // the sections as bands (a breakdown building, a drop on to the next breakdown), each labelled at its start
        let [x0, sec] = [NaN, 0]
        const band = (x1: number) => {
          if (!sec) return
          c.fillStyle = sec === BUILD ? C1 : C2
          c.globalAlpha = 0.22
          c.fillRect(x0, r.y, x1 - x0, r.h)
          c.globalAlpha = 1
          c.fillStyle = INK2
          c.fillText(sec === BUILD ? 'build' : 'drop', x0 + 4, r.y + 8)
        }
        for (let i = i0; i <= i1; i++) {
          const s = b.get(i, L.section)
          if (Number.isNaN(s) || s === sec) continue
          band(X(i))
          ;[x0, sec] = [X(i), s]
        }
        band(GUTTER + tw)
        value = sec ? (sec === BUILD ? 'build' : 'drop') : '—'
      }
      // a level (the grid row: its confidence) as a line over a faint area, the newest at the right edge
      const line = new Path2D()
      const area = new Path2D()
      let [last, v] = [NaN, NaN] // the last point's x (NaN: none yet) and value
      for (let i = i0; i <= i1; i++) {
        const u = b.get(i, r.lane)
        if (Number.isNaN(u)) continue
        const x = X(i)
        const py = base - u * (r.h - 2)
        if (Number.isNaN(last)) {
          area.moveTo(x, base)
          line.moveTo(x, py)
        } else line.lineTo(x, py)
        area.lineTo(x, py)
        last = x
        v = u
      }
      if (!Number.isNaN(last)) {
        area.lineTo(last, base)
        c.fillStyle = c.strokeStyle = r.color
        c.globalAlpha = 0.2
        c.fill(area)
        c.globalAlpha = 0.9
        c.lineWidth = 1.5
        c.stroke(line)
        c.globalAlpha = 1
      }
      if (r.kind === 'level') value = Number.isNaN(v) ? '—' : v.toFixed(2)
      if (r.kind === 'arrange') {
        // a fired drop: a line and its confidence; the autopilot's cut (confirmed): a mark at the top
        c.fillStyle = C2
        for (let i = i0; i <= i1; i++) {
          if (b.get(i, L.fired) > 0) c.fillRect(X(i) - 1, r.y, 2, r.h)
          if (b.get(i, L.confirmed) > 0) c.fillRect(X(i) - 4, r.y, 8, 4)
        }
        c.fillStyle = INK2
        for (let i = i0; i <= i1; i++) if (b.get(i, L.fired) > 0) c.fillText(`drop ${b.get(i, L.fired).toFixed(2)}`, X(i) + 4, base - 8)
      }
    }
    // The gutter: the row's name, its live value (the grid: BPM over its confidence and lock); a swatch for identity.
    c.fillStyle = INK2
    c.textAlign = 'left'
    if (r.kind === 'grid') {
      const bpm = b.get(i1, L.bpm) || 0
      const conf = b.get(i1, L.confidence) || 0
      const lock = settings.get().bpm ? 'manual' : !bpm ? 'no grid' : store.getSnapshot().confident ? 'locked' : 'unsure'
      c.fillStyle = INK
      c.fillText(bpm ? `${bpm.toFixed(1)} BPM` : '— BPM', PAD, r.y + r.h * 0.3)
      c.fillStyle = INK2
      c.fillText(`${conf.toFixed(2)} ${lock}`, PAD, r.y + r.h * 0.72)
      continue
    }
    c.fillText(r.label, PAD + 10, r.y + r.h / 2)
    c.fillStyle = r.color
    c.fillRect(PAD, r.y + r.h / 2 - 3, 6, 6)
    c.fillStyle = INK
    c.textAlign = 'right'
    c.fillText(value, GUTTER - 8, r.y + r.h / 2)
  }
  ov = file ? { y: y + GAP, h: OVERVIEW } : null
  if (file && ov) {
    // The whole track: per pixel column its buckets' peak energy, as a bar coloured by section (none: ink, a build,
    // a drop); a fired drop as a line; the playhead. A part never heard stays empty.
    // ponytail: redrawn at the timeline's rate, ≤ 1 rect per column; cache it per bucket if it ever bills
    const { y: oy, h: oh } = ov
    c.fillStyle = SURFACE
    c.fillRect(GUTTER, oy, tw, oh)
    const cols = Math.max(1, Math.floor(tw))
    const n = file.n
    let style = -1 // the section whose colour is set
    for (let col = 0; col < cols; col++) {
      const k1 = Math.max(Math.floor(((col + 1) * n) / cols), Math.floor((col * n) / cols) + 1)
      let [e, sec, fired] = [NaN, 0, 0]
      for (let k = Math.floor((col * n) / cols); k < k1 && k < n; k++) {
        const v = file.get(k, L.energy)
        if (Number.isNaN(v)) continue
        e = Number.isNaN(e) ? v : Math.max(e, v)
        sec = Math.max(sec, file.get(k, L.section))
        fired = Math.max(fired, file.get(k, L.fired))
      }
      if (Number.isNaN(e)) continue
      const x = GUTTER + (col * tw) / cols
      if (sec !== style || fired > 0) {
        c.fillStyle = sec ? (sec === BUILD ? C1 : C2) : INK2
        c.globalAlpha = sec ? 0.9 : 0.45
        style = sec
      }
      c.fillRect(x, oy + oh - 2 - e * (oh - 4), tw / cols, e * (oh - 4) + 2)
      if (fired > 0) {
        c.globalAlpha = 1
        c.fillRect(x - 1, oy, 2, oh)
        style = -1
      }
    }
    c.globalAlpha = 1
    const d = player.duration
    if (Number.isFinite(d) && d > 0) {
      c.fillStyle = INK
      c.fillRect(GUTTER + (player.currentTime / d) * tw - 1, oy - 2, 2, oh + 4)
    }
    c.textAlign = 'left'
    c.fillStyle = INK
    c.fillText(`${clock(player.currentTime)} / ${clock(d)}`, PAD, oy + oh * 0.3)
    c.fillStyle = INK2
    c.fillText('click to seek', PAD, oy + oh * 0.72)
  }
}

/** The canvas and its loop: mounted only while the screen is open and the analysis on. */
function Timeline() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current!
    const c = cv.getContext('2d')!
    let raf = 0
    let last = -Infinity
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      if (t - last < 1000 / FPS - 4) return // ≤ 30 per s on any display (60 Hz: every other frame)
      last = t
      const k = devicePixelRatio
      const [w, h] = [cv.clientWidth, cv.clientHeight]
      if (cv.width !== Math.round(w * k) || cv.height !== Math.round(h * k)) [cv.width, cv.height] = [Math.round(w * k), Math.round(h * k)]
      c.setTransform(k, 0, 0, k, 0, 0)
      draw(c, w, h)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <canvas
      ref={ref}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        const [x, y] = [e.clientX - r.left, e.clientY - r.top]
        const d = player.duration
        if (ov && y >= ov.y && y <= ov.y + ov.h && x >= GUTTER && Number.isFinite(d)) player.currentTime = ((x - GUTTER) / (r.width - GUTTER - PAD)) * d
      }}
    />
  )
}

/** The analysis screen (key Y; Esc, Y or × closes it): closed, nothing but this one subscription. */
export function Analysis() {
  const open = useSyncExternalStore(store.subscribe, () => store.getSnapshot().analysisView)
  return open ? <Open /> : null
}

/** Its header: the detected genre, the active audio preset with how it was chosen, the sensitivity and the analyser. */
function Open() {
  const s = useSyncExternalStore(settings.onChange, settings.get)
  const detected = useSyncExternalStore(store.subscribe, () => store.getSnapshot().style.detected)
  const conf = useSyncExternalStore(store.subscribe, () => store.getSnapshot().style.confidence)
  const close = () => store.patch({ analysisView: false })
  return (
    <div className="analysis" role="dialog" aria-label="Analysis" onPointerUp={(e) => e.target instanceof HTMLButtonElement && e.target.blur()}>
      <header>
        <span className="name">Analysis</span>
        <span>detected {detected ? `${PRESETS[detected].name} ${conf.toFixed(2)}` : '—'}</span>
        <span>
          preset {PRESETS[activePreset(s, detected)].name} ({s.pick ? 'picked' : s.auto ? 'auto' : 'auto off'})
        </span>
        <span>sens {s.sensitivity ?? 'mid'}</span>
        <span>analyser {s.analyser === 'donor' ? 'vs2' : s.analyser}</span>
        <button aria-label="Close" title="Close · Esc / Y" onClick={close}>
          ×
        </button>
      </header>
      {s.analyser === 'off' ? (
        <p className="off">
          Analysis off · A turns it back on
          <br />
          every scene plays its own look on a steady idle signal
        </p>
      ) : (
        <Timeline />
      )}
    </div>
  )
}
