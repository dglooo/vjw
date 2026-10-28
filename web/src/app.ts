// The rAF loop (Variant A): read (a) → drain (b) → (c) phase → director → engine.render. Per-frame data never goes
// through React: the store hears about scene and lock changes, and gets the badge and the BPM at most 4×/s.
import { createEnergy } from './audio/energy'
import { analyser, audioNow, ctx, odfQueue, onsetQueue, recDest } from './audio/input'
import { createSync, ZERO_SYNC } from './audio/sync'
import { createTempoSource } from './audio/tempo'
import { sources, type Sources } from './bind'
import { createDirector } from './director'
import type { FrameInput } from './frame'
import { render, scenes, setOutput, stage } from './gl/engine'
import { live } from './gl/live'
import { createGovernor, nextMode, outputFor, type QualityMode } from './quality'
import { startRecording } from './recorder'
import { BUILTIN } from './scenes/builtin'
import { store } from './store'

const QUALITY_KEY = 'vjw.quality'
const STALE = 1 // s: older onsets are dropped on drain (a stalled or hidden tab)
const BADGE_MS = 250 // the quality badge and the BPM update at most 4×/s
const CONFIDENT = 0.6 // knob (Q4 default): (c) is trusted above this, for bar lines and the overlay's BPM alike
const NUDGE_MS = 10 // `,` / `.`
const DEBUG = location.search.includes('debug')
const VIDEO_BPS = 12_000_000 // ≈24 Mbps real: Chrome's H.264 encodes ≈2× the request at 60 fps, 1× at 30 (measured, S4.3)

scenes.live = live
// The playlist is the starred built-ins (design E4); spectrum, particles and glitch return as docs in CP2.
const director = createDirector(BUILTIN.filter((d) => d.star).map((d) => d.id), { confidentTheta: CONFIDENT })
const tempo = createTempoSource()
const sync = createSync(tempo)
const governor = createGovernor()
const saved = localStorage.getItem(QUALITY_KEY)
let mode: QualityMode = saved === '60-full' || saved === '30' ? saved : '60-adaptive'
let out = outputFor(mode, 0, 0)
let stopRec: (() => Promise<void>) | null = null

// Base size = clientWidth·dpr × clientHeight·dpr, measured on resize, fullscreen and DPR change (design S4). The frame
// applies it, so a change during REC waits for the stop.
function measure() {
  out = outputFor(mode, stage.clientWidth * devicePixelRatio, stage.clientHeight * devicePixelRatio) // live DPR (R1: 1.8)
}
measure()
addEventListener('resize', measure)
document.addEventListener('fullscreenchange', measure)
// A DPR change alone (window moved to another display) fires no resize: watch the current ratio, re-arm on change (MDN).
function watchDpr() {
  const onChange = () => {
    measure()
    watchDpr()
  }
  matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener('change', onChange, { once: true })
}
watchDpr()

/** Audio-clock time of what the room hears now: a file through our speakers, line-in live at capture (as T1). */
const heard = (t = audioNow()) => t + (store.getSnapshot().source?.kind === 'file' ? 0 : ctx.baseLatency + ctx.outputLatency)

// Physical keys (e.code), so they work in any layout. Modifier chords stay the browser's (Cmd+F = Find), and a focused
// picker keeps its own keys.
addEventListener('keydown', (e) => {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
  switch (e.code) {
    case 'ArrowLeft':
      director.prev()
      break
    case 'ArrowRight':
      director.next()
      break
    case 'Space': {
      const hold = !store.getSnapshot().hold
      director.setHold(hold)
      store.patch({ hold })
      break
    }
    case 'KeyT':
      sync.tap(heard())
      break
    case 'BracketLeft':
      sync.halve()
      break
    case 'BracketRight':
      sync.double()
      break
    case 'Comma':
      sync.nudge(-NUDGE_MS)
      break
    case 'Period':
      sync.nudge(NUDGE_MS)
      break
    case 'KeyB':
      sync.downbeat(heard())
      break
    case 'KeyF':
      if (document.fullscreenElement) void document.exitFullscreen()
      else void document.documentElement.requestFullscreen()
      break
    case 'KeyQ':
      if (store.getSnapshot().recording) break // the output size is frozen during REC (design S4)
      mode = nextMode(mode)
      localStorage.setItem(QUALITY_KEY, mode)
      governor.reset()
      measure()
      store.patch({ quality: mode })
      break
    case 'KeyR':
      if (stopRec) {
        void stopRec().then(() => store.patch({ recording: false })) // the size stays frozen until the file is out
        stopRec = null
      } else if (!store.getSnapshot().recording) {
        stopRec = startRecording(stage, recDest.stream.getAudioTracks()[0], VIDEO_BPS)
        store.patch({ recording: true })
      }
      break
  }
})

const energy = createEnergy(ctx.sampleRate, analyser.fftSize)
const magDb = new Float32Array(analyser.frequencyBinCount).fill(-Infinity) // silence until the first read
const f: FrameInput = {
  energy: energy.update(magDb, 60), onsets: [], lastOnset: null, audioNow: 0, sync: ZERO_SYNC,
  time: 0, dt: 0, width: 0, height: 0,
}
const src: Sources = {} // binding sources, refilled every frame
let last = 0
let scale = 0 // the applied internal scale
let tick = 0
let badgeAt = -Infinity
// ?debug (c) metrics (S5.4): each onset's distance to the grid before it corrects it, and time to confident.
const offsets: number[] = [] // ms, the last 64 onsets within ±⅛ beat
let lastHeard = 0
let locked = false // the previous frame had a grid
let firstOnset: number | null = null // the first onset since the grid was last gone
let toConfident: number | null = null

function frame(now: number) {
  requestAnimationFrame(frame)
  if (out.everyOtherFrame && tick++ % 2) return // 30: every other rAF; a skipped one does no work
  const start = performance.now()
  const s = mode === '60-adaptive' ? governor.scale : 1
  // Frozen during REC: resizing the canvas mid-recording corrupts the MP4 (S1.2). A change waits for the stop.
  if (!store.getSnapshot().recording && (stage.width !== out.w || stage.height !== out.h || s !== scale)) {
    setOutput(out.w, out.h, s)
    scale = s
  }
  f.dt = last ? (now - last) / 1000 : 0
  last = now
  analyser.getFloatFrequencyData(magDb)
  f.energy = energy.update(magDb, 1 / f.dt) // first frame: dt 0 → fps ∞ → averages hold
  f.audioNow = audioNow()
  // T1: a file is heard through our speakers ≈ the output latency after the worklet stamps its onset, so a file's
  // onsets wait in the queue until audible. Line-in is heard live in the room: its onsets apply on arrival.
  const held = store.getSnapshot().source?.kind === 'file' ? onsetQueue.findIndex((o) => o.t > f.audioNow) : -1
  f.onsets = onsetQueue.splice(0, held < 0 ? onsetQueue.length : held).filter((o) => f.audioNow - o.t < STALE)
  f.lastOnset = f.onsets.at(-1) ?? f.lastOnset
  const t = heard(f.audioNow)
  const { beat: b0, bpm: bpm0 } = f.sync // last frame's grid, before this frame's onsets correct it
  for (const b of odfQueue.splice(0)) tempo.pushOdf(b.values, b.t0, b.hop)
  for (const o of f.onsets) {
    if (DEBUG && bpm0) {
      const x = b0 + ((o.t - lastHeard) * bpm0) / 60
      const d = Math.abs(x - Math.round(x))
      if (d <= 1 / 8 && offsets.push((d * 60000) / bpm0) > 64) offsets.shift()
    }
    tempo.push(o)
    sync.feed(o)
  }
  f.sync = sync.at(t)
  lastHeard = t
  if (DEBUG) {
    if (!f.sync.bpm) {
      if (locked) firstOnset = toConfident = null
      firstOnset ??= f.onsets[0]?.t ?? null
    } else if (toConfident === null && firstOnset !== null && f.sync.confidence >= CONFIDENT) toConfident = t - firstOnset
    locked = f.sync.bpm > 0
  }
  f.time = now / 1000
  const shot = director.update(f.time, f.sync) // rAF's now is on the performance.now() clock
  render(shot, f, sources(f, src)) // sets f.width/height to the internal size
  const name = live(shot.to ?? shot.from).doc.name // the incoming scene as soon as a fade starts
  if (name !== store.getSnapshot().sceneName) store.patch({ sceneName: name })
  governor.frame(now, performance.now() - start) // fed only on rendered frames
  if (now - badgeAt >= BADGE_MS) {
    badgeAt = now
    const bpm = Math.round(f.sync.bpm * 10) / 10
    store.patch({ quality: mode, scale, drops: governor.drops, bpm, confident: f.sync.confidence >= CONFIDENT })
    if (DEBUG) {
      const o = offsets.slice().sort((a, b) => a - b)
      const med = o[o.length >> 1] ?? NaN
      store.patch({ debugSync: { med, p95: o[Math.floor(o.length * 0.95)] ?? NaN, toConfident, confidence: f.sync.confidence } })
    }
  }
}
requestAnimationFrame(frame)
