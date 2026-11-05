// The rAF loop (Variant A): read (a) → drain (b) → (c) phase → director → engine.render. Per-frame data never goes
// through React: the store hears about scene and lock changes, and gets the badge and the BPM at most 4×/s.
import { createArrangement, shouldCut, type ArrangeOut } from './audio/arrange'
import { BAND_COUNT, createEnergy, rms } from './audio/energy'
import { createFeatures } from './audio/features'
import { analyser, audioNow, configure, ctx, featQueue, hitQueue, odfQueue, onsetQueue, recDest } from './audio/input'
import { PRESETS, snapOctave, type Band, type PresetId } from './audio/presets'
import { activePreset, bandKey, createSettings, workletBands } from './audio/settings'
import { createSync, ZERO_SYNC } from './audio/sync'
import { createTempoSource } from './audio/tempo'
import { createStyle, styleIn, type StyleOut } from './audio/style'
import { type Hit } from './audio/drums'
import { createRemap, restyle, sources, type Sources } from './bind'
import { createDirector } from './director'
import type { FrameInput } from './frame'
import { catalog, transitions } from './fx/catalog'
import { gpuMs, render, scenes, setAudio, setOutput, setTransition, stage } from './gl/engine'
import { flashOnsets, live, prepare, warm } from './gl/live'
import { postFor } from './gl/post'
import { library } from './library'
import { createGovernor, nextMode, outputFor, type QualityMode } from './quality'
import { startRecording } from './recorder'
import { store } from './store'
import { edits } from './undo'

const QUALITY_KEY = 'vjw.quality'
const STALE = 1 // s: older onsets are dropped on drain (a stalled or hidden tab)
const BADGE_MS = 250 // the quality badge and the BPM update at most 4×/s
const HIT_WINDOW_S = 8 // S4.3: the classifier's kick/hat counts span (design C4)
const SILENCE = 0.02 // S4.3 knob: all three levels below this = silence → the classifier freezes
const CONFIDENT = 0.6 // knob (Q4 default): (c) is trusted above this, for bar lines and the overlay's BPM alike
const NUDGE_MS = 10 // `,` / `.`
const DEBUG = location.search.includes('debug')
// ?debug&preset=dnb: pick the active preset from the URL (plan S3.2, a CP6 dev hook). Deliberately not written to
// settings/localStorage — a later load without the param stays on the user's pick.
const qp = new URLSearchParams(location.search).get('preset')
const DEBUG_PRESET: PresetId | null = DEBUG && qp && Object.hasOwn(PRESETS, qp) ? (qp as PresetId) : null
const VIDEO_BPS = 12_000_000 // ≈24 Mbps real: Chrome's H.264 encodes ≈2× the request at 60 fps, 1× at 30 (measured, S4.3)

scenes.live = live
scenes.catalog = catalog
let transition = 'own/crossfade' // the fades' look (design E7): a random pick per fade, never the same twice in a row
setTransition(transition)
// The playlist is the starred scenes (design E4): built-ins first, then the user's, in step with the library. It starts
// with the built-ins; the user's join once IndexedDB is read.
const director = createDirector(library.playlist(), { confidentTheta: CONFIDENT })
library.onChange(() => director.setPlaylist(library.playlist()))
const loaded = library.load().catch((e: unknown) => console.error('library', e)) // no IndexedDB: the built-ins only
// Compile-all at Start (design E2): once the audio context runs (the Start click, or at load when autoplay is allowed)
// and the library is read, every program of the playlist compiles while the loop plays on.
const warmUp = () =>
  void loaded
    .then(() => warm(library.playlist(), (n, of) => store.patch({ compiling: `compiling ${n}/${of}` })))
    .then(() => store.patch({ compiling: null }))
if (ctx.state === 'running') warmUp()
else ctx.addEventListener('statechange', warmUp, { once: true })
const tempo = createTempoSource()
const sync = createSync(tempo)
export const governor = createGovernor()
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

let holdBefore = false // the hold when the panel or the editor opened (never both: the editor closes the panel)
/** The panel holds the autopilot while open, so the edited scene stays; closing restores the hold from before (E6). */
function setPanel(open: boolean) {
  const s = store.getSnapshot()
  if (open === s.panel) return
  if (open) holdBefore = s.hold
  const hold = open || holdBefore
  director.setHold(hold)
  store.patch({ panel: open, hold })
}
/** The editor screen (2b, design S1) holds the autopilot the same way and closes the panel, keeping the hold from
 *  before the panel. Leaving restores it with no cut: the scene plays on until the autopilot's next switch. */
export function setEditor(on: boolean) {
  const s = store.getSnapshot()
  if (on === s.editor) return
  if (on && !s.panel) holdBefore = s.hold
  const hold = on || holdBefore
  director.setHold(hold)
  store.patch({ editor: on, panel: false, hold })
}

// Physical keys (e.code), so they work in any layout. Modifier chords stay the browser's (Cmd+F = Find), and a focused
// picker or text field keeps its own keys.
addEventListener('keydown', (e) => {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return
  if (store.getSnapshot().editor && e.code !== 'KeyL') return // nothing cuts away from the edited scene (2b S1)
  switch (e.code) {
    case 'KeyL':
      setEditor(!store.getSnapshot().editor)
      break
    case 'KeyE':
      setPanel(!store.getSnapshot().panel)
      break
    case 'Escape':
      setPanel(false)
      break
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
      if (DEBUG) {
        dropAt = f.time // ?debug: one force-flash (a fresh drop → postFor's flash peaks), no cut
        break
      }
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
const wave = new Float32Array(analyser.frequencyBinCount) // the first 512 samples of the analyser's 1024
const f: FrameInput = {
  energy: energy.update(magDb, 60), onsets: [], lastOnset: null, audioNow: 0, sync: ZERO_SYNC,
  time: 0, dt: 0, width: 0, height: 0,
}
const src: Sources = {} // binding sources, refilled every frame
const features = createFeatures() // kick/snare/hats envelopes from the worklet's hits (S1.4)
const settings = createSettings(localStorage, ctx.sampleRate) // vjw.audio: the user's sens, the preset pick
const hits = { kick: 0, snare: 0, hats: 0 } // ?debug: hits drained per drum, printed by the overlay
if (DEBUG) Object.assign(window, { __src: src, __settings: settings, __flash: flashOnsets }) // ?debug: the live binding sources, settings and the flash budget's onsets, for DevTools and browser checks

/** S2.5: the worklet's config. Sent only when the band list (ids + Hz, drums too) really changed — a sens or auto
 * toggle must not re-send, and a re-send restarts the drum detectors (analysis.ts). `rev` grows per send; the worklet
 * ignores a `rev <= applied`. */
let rev = 0
let sent = ''
function sendConfig() {
  const b = workletBands(settings.get(), null)
  const key = bandKey(b)
  if (key === sent) return
  sent = key
  configure({ kind: 'config', rev: ++rev, drums: b.drums, bands: b.bands })
}
sendConfig() // start: the first config wakes the band bank (one drum restart blip, contract 3)
settings.onChange(sendConfig) // custom-band edits and preset switches; sens/auto leave the key untouched
// S4.3: the classifier runs every frame; its pick drives the active preset, the tempo band and the Auto-style remap.
const style = createStyle()
// S5.3: the arrangement detector (build/drop/heat) runs every frame; its output drives the post pass, the frame's
// heat speed, and the drop cut. `dropAt` = seconds since the last confident drop (-Infinity = none yet).
const arrangement = createArrangement()
let arrangeOut: ArrangeOut = { build: 0, drop: 0, heat: 0, sparse: false, fired: null }
let dropAt = -Infinity
// energy.ts's 30 Hz–16 kHz log grid: the first band at/above 4 kHz; `high` = the sum of those bands (S5.3).
const highStart = Math.ceil((BAND_COUNT * Math.log(4000 / 30)) / Math.log(16000 / 30))
let styleOut: StyleOut = { detected: null, scores: { dnb: 0, dubstep: 0, techno: 0 }, confidence: 0 } // before the first update: __style reads it
const remap = createRemap() // the 2 s crossfade of the Auto-style map (design C5)
const styledOut: Sources = {} // restyle's output, allocated once
const hits8: Hit[] = [] // recent hits, newest last: the classifier's 8 s kick/hat counts
if (DEBUG) Object.assign(window, { __styled: styledOut, __style: () => styleOut }) // ?debug: the styled overlay and detection (S4.3)
let last = 0
let scale = 0 // the applied internal scale
let tick = 0
let badgeAt = -Infinity
let lastBand: Band | null = null // the last tempo range applied (S3.2): a band change sets it, and only then snaps
let fadingTo: string | null = null // the previous frame's shot.to: a new id starts a fade
// ?debug (c) metrics (S5.4): each onset's distance to the grid before it corrects it, and time to confident.
const offsets: number[] = [] // ms, the last 64 onsets within ±⅛ beat
let lastHeard = 0
let locked = false // the previous frame had a grid
let firstOnset: number | null = null // the first onset since the grid was last gone
let toConfident: number | null = null

/** T1: a file is heard through our speakers ≈ the output latency after the worklet stamps its onset, so a file's
 *  onsets (and hits) wait in the queue until audible. Line-in is heard live in the room: they apply on arrival. */
function drain<T extends { t: number }>(q: T[]): T[] {
  const held = store.getSnapshot().source?.kind === 'file' ? q.findIndex((o) => o.t > f.audioNow) : -1
  return q.splice(0, held < 0 ? q.length : held).filter((o) => f.audioNow - o.t < STALE)
}

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
  f.time = now / 1000 // the monotonic seconds clock (rAF's now): the arrangement's `now`
  analyser.getFloatFrequencyData(magDb)
  analyser.getFloatTimeDomainData(wave)
  setAudio(magDb, wave)
  f.energy = energy.update(magDb, 1 / f.dt) // first frame: dt 0 → fps ∞ → averages hold
  f.audioNow = audioNow()
  f.onsets = drain(onsetQueue)
  f.lastOnset = f.onsets.at(-1) ?? f.lastOnset
  let kickThisFrame = false
  for (const h of drain(hitQueue)) {
    features.hit(h)
    if (DEBUG) hits[h.drum]++
    hits8.push(h) // S4.3: the classifier's 8 s kick/hat window (newest last)
    if (h.drum === 'kick') kickThisFrame = true // S5.3: a kick was drained this frame
  }
  // S2.4: work the feat batches through every hop up to the heard time (a file's audioNow, line-in the newest) before
  // fill() reads the sustained sources and the u:* bands.
  for (const m of featQueue.splice(0)) features.push(m)
  features.at(store.getSnapshot().source?.kind === 'file' ? f.audioNow : Infinity)
  // S4.3: the classifier runs every frame; its pick (or a manual pick) sets the active preset, which drives the tempo
  // band (S3.2) and the band configs (features.fill). f.sync here is the previous frame's grid — fine for a smoothed score.
  const st = settings.get()
  const cutoff = f.audioNow - HIT_WINDOW_S
  while (hits8.length && hits8[0].t <= cutoff) hits8.shift()
  let kick8 = 0
  let hat8 = 0
  for (const h of hits8) if (h.drum === 'kick') kick8++; else if (h.drum === 'hats') hat8++
  const eb = f.energy.bands
  let total = 0
  for (let i = 0; i < eb.length; i++) total += eb[i]
  const [fdn, fdu, fte] = tempo.families([PRESETS.dnb.bpm!, PRESETS.dubstep.bpm!, PRESETS.techno.bpm!]) // the genres always have a band
  const lvl = f.energy.level
  // S5.3: the arrangement runs every frame (before style.update, so its freeze can hold through a breakdown: those
  // lack drums). low = the kick-gated sustained bass (bands.ts `held`), high = the log grid's ≥ 4 kHz bands,
  // total = the frame's RMS (the −60 dBFS silence floor lives in arrange.ts).
  let high = 0
  for (let i = highStart; i < BAND_COUNT; i++) high += eb[i]
  arrangeOut = arrangement.update({ low: features.raw.sub + features.raw.reese, high, total: rms(wave), kick: kickThisFrame, beat: f.sync.confidence >= 0.3 ? f.sync.beat : null, now: f.time })
  const freeze = (lvl.bass < SILENCE && lvl.mid < SILENCE && lvl.treb < SILENCE) || arrangeOut.sparse
  styleOut = style.update(styleIn({ kick8, hat8, bpm: f.sync.bpm, confidence: f.sync.confidence, wobble: features.raw.wobbleDepth, bass: total > 0 ? (features.raw.sub + features.raw.reese) / total : 0, families: { dnb: fdn, dubstep: fdu, techno: fte }, freeze }), now / 1000)
  // A manual pick (incl. the ?preset= dev hook) locks the classifier; else Auto follows `detected`.
  const active = activePreset(DEBUG_PRESET ? { ...st, pick: DEBUG_PRESET } : st, styleOut.detected)
  // S3.2: the active preset's band drives the tempo range; a change snaps the running grid one octave toward it.
  const band = PRESETS[active].bpm
  if (band !== lastBand) {
    lastBand = band
    tempo.setRange(band)
    const g = f.sync.bpm
    if (band && g) {
      const snap = snapOctave(g, band)
      if (snap === 'double') sync.double()
      else if (snap === 'halve') sync.halve()
    }
  }
  features.fill(src, f.dt, st, PRESETS[active])
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
  const shot = director.update(f.time, f.sync) // rAF's now is on the performance.now() clock
  if (shot.to && shot.to !== fadingTo) {
    const others = transitions.filter((id) => id !== transition) // empty with one transition: it stays
    if (others.length) setTransition((transition = others[Math.floor(Math.random() * others.length)]))
  }
  fadingTo = shot.to
  // Between fades: the next scene built, the others freed (E2). The editor holds, so no next scene (a ring costs 62 MB).
  if (!shot.to) prepare(store.getSnapshot().editor ? [shot.from] : [shot.from, director.peek()])
  // S4.3: Auto-style. The built-ins' bindings are remapped through the active preset's map with a 2 s crossfade;
  // Auto off (or Default) is a fade back to {} — their own sources.
  const [rmFrom, rmTo, rmW] = remap.frame(st.auto ? PRESETS[active].map : {}, f.dt)
  const styled = restyle(src, rmFrom, rmTo, rmW, styledOut)
  src.build = arrangeOut.build // S5.3: expose the arrangement as binding sources (the UI lists them in S6.3)
  src.drop = arrangeOut.drop
  f.dt *= 1 + 0.5 * arrangeOut.heat // heat speeds the frame; fill and remap above used the unscaled dt (recomputed next frame)
  if (arrangeOut.fired !== null) dropAt = f.time
  if (shouldCut(arrangeOut.fired, store.getSnapshot().hold)) director.cut(director.peek()) // a confident drop cuts, unless LOCK/panel
  // S5.3: the live heat post pass (postFor at rest = identity: the engine skips it).
  const post = postFor(arrangeOut.heat, dropAt > 0 ? f.time - dropAt : Infinity, f.sync.beat, f.sync.bpm, f.sync.confidence)
  render(shot, f, sources(f, src), styled, post) // sets f.width/height to the internal size
  const id = shot.to ?? shot.from // the incoming scene as soon as a fade starts: the name shown, the scene edited
  const { doc, errors } = live(id)
  const snap = store.getSnapshot()
  if (id !== snap.edited) edits.clear() // undo is per edited scene (design S3): open, Save as, the autopilot
  if (doc.name !== snap.sceneName || id !== snap.edited) store.patch({ sceneName: doc.name, edited: id })
  governor.frame(now, performance.now() - start) // fed only on rendered frames
  if (now - badgeAt >= BADGE_MS) {
    badgeAt = now
    const bpm = Math.round(f.sync.bpm * 10) / 10
    const ms = gpuMs.get(id)
    const prev = store.getSnapshot().nodeErrors
    store.patch({
      quality: mode, scale, drops: governor.drops, bpm, confident: f.sync.confidence >= CONFIDENT,
      gpuMs: ms === undefined ? null : Math.round(ms * 10) / 10, // the panel's GPU hint
      nodeErrors: errors.join('\n') === prev.join('\n') ? prev : [...errors], // a new array only when they changed
      style: { detected: styleOut.detected, confidence: styleOut.confidence }, // S4.3: the badge reads it at 4×/s
    })
    if (DEBUG) {
      const o = offsets.slice().sort((a, b) => a - b)
      const med = o[o.length >> 1] ?? NaN
      const p95 = o[Math.floor(o.length * 0.95)] ?? NaN
      // ?debug meters: sub, reese, wobble and the u:* custom bands as fill() left them in src (rounded, so a quiet
      // track does not churn the snapshot 4×/s).
      const bands: Record<string, number> = {}
      for (const id of ['sub', 'reese', 'wobble', ...settings.get().custom.map((b) => b.id)]) bands[id] = Math.round(src[id] * 1000) / 1000
      store.patch({ debugSync: { med, p95, toConfident, confidence: f.sync.confidence, hits: { ...hits }, bands } })
    }
  }
}
requestAnimationFrame(frame)
export { director, src, settings } // ?bench drives the autopilot (bench.ts); the Sources tab reads `src`/`settings` live (S6.1)
