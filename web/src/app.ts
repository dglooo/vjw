// The rAF loop (Variant A): read (a) → drain (b) → (c) phase → director → engine.render. Per-frame data never goes
// through React: the store hears about scene and lock changes, and gets the badge and the BPM at most 4×/s.
import { createArrangement, shouldCut, SILENT_RMS, type ArrangeOut } from './audio/arrange'
import { createDonor, mixStep, type DonorIn } from './audio/donor'
import { BAND_COUNT, createEnergy, rms } from './audio/energy'
import { createFeatures } from './audio/features'
import { meter } from './audio/meter' // the HUD's input meter (dsp_linein_2026-11-16 fix 5): fed here, read live by the overlay
import { analyser, analyser2k, analyser4k, analyserL, analyserR, audioNow, configure, ctx, featQueue, hitQueue, inputLatency, odfQueue, onsetQueue, player, recDest, togglePlay } from './audio/input'
import { createMelody } from './audio/melody'
import { PRESETS, snapOctave, type Band, type PresetId } from './audio/presets'
import { activePreset, bandKey, createSettings, toggleAnalysis, workletBands } from './audio/settings'
import { createSync, ZERO_SYNC } from './audio/sync'
import { createTempoSource } from './audio/tempo'
import { createVs3, vs3Live } from './audio/vs3'
import { createStyle, styleIn, type StyleOut } from './audio/style'
import { type Hit } from './audio/drums'
import { analysis, createRemap, gain, idleDb, restyle, sources, type Sources } from './bind'
import { cam, camGate, camGpuMs, camMask, readCam, readMask, selectCamera, startCamera, tick as camTick } from './camera/camera'
import { presence } from './camera/smooth'
import { count as camUsers } from './camera/users'
import { createDirector } from './director'
import type { SceneId } from './doc'
import { docs } from './edit'
import { tiles } from './editor/tiles'
import type { FrameInput } from './frame'
import { catalog, transitions } from './fx/catalog'
import { gpuMs, render, scenes, setAudio, setDonorSpectrum, setOutput, setTransition, stage } from './gl/engine'
import { builds, flashOnsets, live, panel, prepare, warm } from './gl/live'
import { postFor } from './gl/post'
import { library } from './library'
import { createGovernor, nextMode, outputFor, type QualityMode } from './quality'
import { startRecording } from './recorder'
import { showText } from './scenes/text'
import { readout, type Cue } from './setlist'
import { store } from './store'
import { edits } from './undo'

const QUALITY_KEY = 'vjw.quality'
const STALE = 1 // s: older onsets are dropped on drain (a stalled or hidden tab)
const BADGE_MS = 250 // the quality badge and the BPM update at most 4×/s
const HIT_WINDOW_S = 8 // S4.3: the classifier's kick/hat counts span (design C4)
const SILENCE = 0.02 // S4.3 knob: all three levels below this = silence → the classifier freezes
// dsp_linein_2026-11-16 fix 2: the input at or under SILENT_RMS (−60 dBFS) this long, s, is a pause (a line-in's noise
// floor), and energy, features and the tempo ODF read it as digital silence, as a paused file. Not a stop in the music:
// Rumble's quiet runs last ≤ .83 s, and a restart in those just before its drops (21, 117 s) would flatten the drop's sub.
const PAUSE = 1
const CONFIDENT = 0.6 // knob (Q4 default): (c) is trusted above this, for bar lines and the overlay's BPM alike
const NUDGE_MS = 10 // `,` / `.`
const SKIP = 10 // s: the file transport's `-` / `=`
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
// The playlist is the editor list's view in the list's order (library.ts playlist, user 2026-11-19), in step with the
// library. It starts with the built-ins; the user's join once IndexedDB is read. With no camera playing, the scenes that
// need one sit out; frame() re-sets it when the camera goes live or off. A scene opened off it goes on from its place
// in the list (slot).
let playLive = cam.live // the camera state the director's playlist was made for
const playlist = () => library.playlist((playLive = cam.live))
const director = createDirector(playlist(), { confidentTheta: CONFIDENT, slot: (id) => library.slot(id, playLive) })
library.onChange(() => director.setPlaylist(playlist()))
// The set list (setlist.ts, user 2026-11-20): the armed set's cues play in place of the playlist (director.arm), each
// fading in with its own transition, preset and switches (frame()); ←/→ step through them, a time-code cue starts at its
// track time. A cue whose scene is gone (a deleted user scene, New's draft after a reload) sits out: `live` throws on an
// unknown id. An edit of the armed set re-arms it (the same cue objects: the cue on stage plays on); a set with no
// playable cue disarms.
let armedCues: readonly Cue[] | null = null
let presetDue: Pick<Cue, 'scene' | 'preset'> | null = null // the cue a fade just began (or cutTo's pick), whose preset goes on once its scene is the edited one
function rearm() {
  const i = store.getSnapshot().armedSet
  const cues = (i === null ? undefined : library.sets()[i])?.cues.filter((c) => docs.has(c.scene) || library.get(c.scene))
  armedCues = cues?.length ? cues : null
  director.arm(armedCues)
  if (!armedCues) store.patch({ armedSet: null, cue: '' })
}
/** Arms set `i` of library.sets() (its first cue fades in at once, another set armed or not), or disarms (null): the
 *  autopilot plays on from the scene on stage. */
export function armSet(i: number | null) {
  director.arm(null) // armed afresh, not as an edit of the set armed before
  store.patch({ armedSet: i, cue: '' })
  rearm()
}
library.onChange(rearm)
/** The preset browser's pick of another scene's preset (ui/Presets.tsx): a cut to that scene, as the Library's, and the
 *  preset (by name) on it once it is the edited one, as a cue's. */
export function cutTo(scene: SceneId, preset: string) {
  director.cut(scene)
  presetDue = { scene, preset }
}
const loaded = library.load().catch((e: unknown) => console.error('library', e)) // no IndexedDB: the built-ins only
// Compile-all at Start (design E2): once the audio context runs (the Start click, or at load when autoplay is allowed)
// and the library is read, every program of the playlist compiles while the loop plays on.
// plan_camera S1.4 (decision 7): the saved camera reopens at the same moment.
const warmUp = () => {
  void startCamera()
  void loaded
    .then(() => warm(library.playlist(), (n, of) => store.patch({ compiling: `compiling ${n}/${of}` })))
    .then(() => store.patch({ compiling: null }))
}
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

/** Audio-clock time of what the room hears now: a file through our speakers (audioNow); line-in live at capture, so the
 *  context's time plus the capture path's latency. Never the output's: a Bluetooth output misreports it, and it reads 0
 *  for the first ≈ 0.3 s (dsp_linein_2026-11-16 fix 4). */
const heard = (t = audioNow()) => (store.getSnapshot().source?.kind === 'file' ? t : ctx.currentTime + inputLatency())

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
/** The editor screen (2b, design S1) and the shader editor (vs3 port), one at a time, hold the autopilot the same way
 *  and close the panel, keeping the hold from before the panel or the other screen. Leaving restores it with no cut:
 *  the scene plays on until the autopilot's next switch. */
function setScreen(screen: 'editor' | 'shader', on: boolean) {
  const s = store.getSnapshot()
  if (on === s[screen]) return
  if (on && !s.panel && !s.editor && !s.shader) holdBefore = s.hold
  const hold = on || holdBefore
  director.setHold(hold)
  store.patch({ editor: on && screen === 'editor', shader: on && screen === 'shader', panel: false, hold })
}
export const setEditor = (on: boolean) => setScreen('editor', on)
export function setShader(on: boolean) {
  if (store.getSnapshot().edited) setScreen('shader', on) // before Start there is no scene to edit
}

// Physical keys (e.code), so they work in any layout. Modifier chords stay the browser's (Cmd+F = Find), and a focused
// picker or text field keeps its own keys.
addEventListener('keydown', (e) => {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return
  // Nothing cuts away from the edited scene (2b S1): on the editor screens only L, G and Esc
  const { editor, shader } = store.getSnapshot()
  if ((editor || shader) && e.code !== 'KeyL' && e.code !== 'KeyG' && e.code !== 'Escape') return
  switch (e.code) {
    case 'KeyL':
      setEditor(!store.getSnapshot().editor)
      break
    case 'KeyG':
      e.preventDefault() // no text from this keystroke: the shader editor's code field takes the focus as it opens
      setShader(!store.getSnapshot().shader)
      break
    case 'KeyE':
      setPanel(!store.getSnapshot().panel)
      break
    case 'Escape':
      setPanel(false)
      setShader(false)
      store.patch({ browse: false })
      break
    case 'KeyW': // the preset browser (ui/Presets.tsx): Q, the donor's key for theirs, is the quality's here
      store.patch({ browse: !store.getSnapshot().browse })
      break
    case 'ArrowLeft':
      director.prev()
      break
    case 'ArrowRight':
      director.next()
      break
    case 'ArrowUp': // the edited scene's presets (presets.ts): ←/→ the scenes, ↑/↓ the looks of one
    case 'ArrowDown':
      e.preventDefault()
      panel.stepPreset(e.code === 'ArrowDown' ? 1 : -1)
      break
    case 'Space': {
      const hold = !store.getSnapshot().hold
      director.setHold(hold)
      store.patch({ hold })
      break
    }
    case 'KeyT':
      sync.tap(heard())
      keepManual()
      break
    case 'BracketLeft':
      sync.halve()
      keepManual()
      break
    case 'BracketRight':
      sync.double()
      keepManual()
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
    case 'KeyX': // every native/text layer on / off (scenes/text.ts)
      showText(!store.getSnapshot().text)
      break
    case 'KeyA': // the analysis off / back on (settings.ts toggleAnalysis)
      settings.patch(toggleAnalysis(settings.get()))
      break
    case 'KeyP': // the file transport (the overlay's buttons do the same)
      if (store.getSnapshot().source?.kind === 'file') togglePlay()
      break
    case 'Minus':
    case 'Equal':
      if (store.getSnapshot().source?.kind === 'file') player.currentTime += e.code === 'Equal' ? SKIP : -SKIP // the element clamps to the track
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
const waveL = new Float32Array(analyserL.frequencyBinCount) // S0.2: the per-channel waves (first 512 of each analyser's 1024)
const waveR = new Float32Array(analyserR.frequencyBinCount)
const f: FrameInput = {
  energy: energy.update(magDb, 60), onsets: [], lastOnset: null, audioNow: 0, sync: ZERO_SYNC,
  time: 0, dt: 0, width: 0, height: 0,
}
const src: Sources = {} // binding sources, refilled every frame
// The analysis off (settings.analyser 'off', user 2026-11-21): the scenes hear a steady idle signal. Their frame is f's
// clock and size with the idle spectrum's energy at its running average (level, att 1), no onset and no grid; the audio
// textures carry that spectrum and a flat waveform; the post pass rests. The analysis runs on: a turn back on is instant.
const IDLE_DB = Float32Array.from({ length: analyser.frequencyBinCount }, (_, k) => idleDb((k * ctx.sampleRate) / analyser.fftSize))
const AVERAGE = { bass: 1, mid: 1, treb: 1 }
const IDLE_FRAME = { energy: { bands: createEnergy(ctx.sampleRate, analyser.fftSize).update(IDLE_DB, 60).bands, level: AVERAGE, att: AVERAGE }, onsets: [], lastOnset: null, sync: ZERO_SYNC }
const idle: FrameInput = { ...f }
const FLAT = new Float32Array(analyser.frequencyBinCount) // a waveform at 0
const REST = { gain: 1, flash: 0 } // postFor at rest
const features = createFeatures() // kick/snare/hats envelopes from the worklet's hits (S1.4)
const settings = createSettings(localStorage, ctx.sampleRate) // vjw.audio: the user's sens, the preset pick
// The manual BPM lock (user 2026-11-20): the stored BPM holds the grid's tempo until cleared (sync.ts setManual).
// T, [ and ] move a held one in the sync; it is stored back, so a reload keeps it.
const applyManual = () => sync.setManual(settings.get().bpm ?? 0)
applyManual()
settings.onChange(applyManual)
function keepManual() {
  const bpm = sync.manual()
  if (bpm && bpm !== settings.get().bpm) settings.patch({ bpm })
}
// plan_audio_donor_mode S1.4: the donor-style core runs warm in every mode (spec R4) and writes its syn_* sources into
// src each frame; src.donorMix (0 ours … 1 donor) ramps toward the stored mode in 2 s. Nothing reads them before CP2.
const donor = createDonor(ctx.sampleRate, analyser.fftSize)
const donorIn: DonorIn = { beat: 0, bpm: 0, confidence: 0, kick: false, fired: false, build: 0, peakDb: -Infinity, silent: true } // refilled per frame
let donorMix = settings.get().analyser === 'donor' ? 1 : 0 // a stored donor mode starts at full mix
let donorTarget = donorMix // the previous frame's target: a 0 → 1 turn seeds the core's beat count
const vs3 = createVs3(ctx.sampleRate, analyser2k.fftSize) // the vs3 core (audio/vs3.ts), warm in every mode like the donor's
const mag2k = new Float32Array(analyser2k.frequencyBinCount) // its bins, dB
const melody = createMelody(ctx.sampleRate, analyser4k.fftSize) // tonal, pitch, voice (dsp_genre_melodic §6), every mode
const mag4k = new Float32Array(analyser4k.frequencyBinCount)
const hits = { kick: 0, snare: 0, hats: 0 } // ?debug: hits drained per drum, printed by the overlay
if (DEBUG) Object.assign(window, { __src: src, __settings: settings, __flash: flashOnsets, __transition: () => transition }) // ?debug: the live binding sources, settings, the flash budget's onsets and the fades' transition, for DevTools and browser checks
// plan_camera CP1 (S1.2b): the camera's harness hooks — mask users, SegmentWorker constructions, frames posted to a
// host; also on the probe and bench pages (their harnesses read it, camGpuMs under ?bench)
if (DEBUG || /camprobe|bench/.test(location.search))
  Object.assign(window, { __cam: { cam, users: camUsers, hosts: () => camMask.hosts, frames: () => camMask.frames, builds, readCam, readMask, select: selectCamera, gpuMs: camGpuMs } })

/** S2.5: the worklet's config for the active preset (T1: frame() moves `configured` to it, picked or detected). Sent
 * only when it really changed (ids + Hz, drums and knobs too) — a sens or auto toggle must not re-send. `rev` grows
 * per send; the worklet ignores a `rev <= applied`. */
let rev = 0
let sent = ''
let configured: PresetId = 'default'
function sendConfig() {
  const b = workletBands(settings.get(), configured)
  const key = bandKey(b)
  if (key === sent) return
  sent = key
  configure({ kind: 'config', rev: ++rev, ...b })
}
sendConfig() // start: the first config wakes the band bank (one drum restart blip, contract 3)
settings.onChange(sendConfig) // custom-band edits, preset and sensitivity switches; sens/auto leave the key untouched
const muted = () => store.patch({ muted: settings.get().mute }) // the Calibration tiles dim a muted source
muted()
settings.onChange(muted)
// S4.3: the classifier runs every frame; its pick drives the active preset, the tempo band and the Auto-style remap.
const style = createStyle()
// S5.3: the arrangement detector (build/drop/heat) runs every frame; its output drives the post pass, the frame's
// heat speed, and the drop cut. `dropAt` = seconds since the last confident drop (-Infinity = none yet).
const arrangement = createArrangement()
let arrangeOut: ArrangeOut = { build: 0, drop: 0, heat: 0, energy: 0, sparse: false, fired: null, confirmed: null }
let dropAt = -Infinity
// The file transport: a seek or a resume moves the music's phase under the grid, not its tempo. The tempo source drops
// the onsets before it (and settles its ODF), the grid hides and re-anchors on the first confident reading at its tempo.
// A seek also lands in another section of the track: the arrangement restarts its section for a second (arrange.ts
// SEEK). A pause needs nothing: the paused element feeds digital silence, so PAUSE reads it as on line-in.
const regrid = () => {
  tempo.seek(ctx.currentTime) // the worklet's clock, which stamps the ODF and the onsets
  sync.seek()
}
player.addEventListener('play', regrid)
player.addEventListener('seeked', () => {
  regrid()
  arrangement.seek(performance.now() / 1000) // f.time's clock
})
// energy.ts's 30 Hz–16 kHz log grid: the first band at/above 4 kHz; `high` = the sum of those bands (S5.3).
const highStart = Math.ceil((BAND_COUNT * Math.log(4000 / 30)) / Math.log(16000 / 30))
let styleOut: StyleOut = { detected: null, scores: { dnb: 0, dubstep: 0, techno: 0 }, confidence: 0 } // before the first update: __style reads it
const remap = createRemap() // the 2 s crossfade of the Auto-style map (design C5)
const styledOut: Sources = {} // restyle's output, allocated once
const hits8: Hit[] = [] // recent hits, newest last: the classifier's 8 s kick/hat counts
if (DEBUG) Object.assign(window, { __styled: styledOut, __style: () => styleOut }) // ?debug: the styled overlay and detection (S4.3)
let last = 0
let quietFor = 0 // s the input has sat at or under SILENT_RMS (PAUSE)
let scale = 0 // the applied internal scale
let tick = 0
let badgeAt = -Infinity
let lastBand: Band | null = null // the last tempo range applied (S3.2): a band change sets it, and only then snaps
let fadingTo: string | null = null // the previous frame's shot.to: a new id starts a fade
let trackAt = -1 // the previous frame's file time, s (no file: -1), for the time-code cues
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
  analyserL.getFloatTimeDomainData(waveL)
  analyserR.getFloatTimeDomainData(waveR)
  const off = settings.get().analyser === 'off'
  if (off) setAudio(IDLE_DB, FLAT, FLAT, FLAT)
  else setAudio(magDb, wave, waveL, waveR)
  const frameRms = rms(wave) // arrange's `total`
  // ponytail: the first 512 of each analyser's 1024 samples, ≈ 64 % of a 60 fps frame's (32 % at 30): a lone over can
  // slip by, a clipping feed cannot. Read all 1024 if a single over must light CLIP.
  meter.update(waveL, waveR, f.time)
  quietFor = frameRms <= SILENT_RMS ? quietFor + f.dt : 0
  const paused = quietFor >= PAUSE
  f.energy = energy.update(magDb, 1 / f.dt, paused) // first frame: dt 0 → fps ∞ → averages hold
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
  features.at(store.getSnapshot().source?.kind === 'file' ? f.audioNow : Infinity, paused)
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
  const [fdn, fdu, fte] = tempo.families([PRESETS.dnb.bpm!, PRESETS.dubstep.bpm!, PRESETS.techno.bpm!], sync.manual()) // the genres always have a band; a manual BPM is their evidence
  const lvl = f.energy.level
  // S5.3: the arrangement runs every frame (before style.update, so its freeze can hold through a breakdown: those
  // lack drums). low = the kick-gated sustained bass (bands.ts `held`; sub alone under a 4/4 preset, as `cuts` the
  // previous frame's preset's), high = the log grid's ≥ 4 kHz bands, total = the frame's RMS (the −60 dBFS silence floor
  // lives in arrange.ts), cuts = the previous frame's preset's.
  let high = 0
  for (let i = highStart; i < BAND_COUNT; i++) high += eb[i]
  arrangeOut = arrangement.update({ low: PRESETS[configured].low === 'sub' ? features.raw.sub : features.raw.sub + features.raw.reese, high, total: frameRms, kick: kickThisFrame, beat: f.sync.confidence >= 0.3 ? f.sync.beat : null, cuts: PRESETS[configured].cuts !== false, now: f.time })
  const freeze = (lvl.bass < SILENCE && lvl.mid < SILENCE && lvl.treb < SILENCE) || arrangeOut.sparse
  styleOut = style.update(styleIn({ kick8, hat8, bpm: f.sync.bpm, confidence: f.sync.confidence, wobble: features.raw.wobbleDepth, bass: total > 0 ? (features.raw.sub + features.raw.reese) / total : 0, families: { dnb: fdn, dubstep: fdu, techno: fte }, freeze }), now / 1000)
  // A manual pick (incl. the ?preset= dev hook) locks the classifier; else Auto follows `detected`.
  const active = activePreset(DEBUG_PRESET ? { ...st, pick: DEBUG_PRESET } : st, styleOut.detected)
  if (active !== configured) {
    configured = active
    sendConfig() // T1: Dubstep's floors and reese band follow Auto too
  }
  // S3.2: the active preset's band drives the tempo range; a change snaps the running grid one octave toward it. A
  // manual BPM skips both until cleared, so a band change made meanwhile applies then.
  const band = PRESETS[active].bpm
  if (band !== lastBand && !sync.manual()) {
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
  // paused: silent ODF, so the tempo's start settle (tempo.ts) arms on a line-in's noise floor too (its ODF is level-free)
  for (const b of odfQueue.splice(0)) tempo.pushOdf(paused ? b.values.fill(0) : b.values, b.t0, b.hop)
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
  if (cam.live !== playLive) director.setPlaylist(playlist()) // the camera scenes join or leave the rotation
  // A time-code cue (setlist.ts `time`): the playing file crossing its track time (a seek forward too) starts it at once
  const tt = store.getSnapshot().source?.kind === 'file' ? player.currentTime : -1
  const timed = tt > trackAt && armedCues?.findLast((c) => c.time !== undefined && trackAt < c.time && c.time <= tt)
  if (timed) director.jump(timed, true)
  trackAt = tt
  const shot = director.update(f.time, f.sync) // rAF's now is on the performance.now() clock
  if (shot.to && shot.to !== fadingTo) {
    const cue = director.cue()?.of // an armed set: the cue this fade begins
    const others = transitions.filter((id) => id !== transition) // empty with one transition: it stays
    if (cue?.transition && transitions.includes(cue.transition)) setTransition((transition = cue.transition))
    else if (others.length) setTransition((transition = others[Math.floor(Math.random() * others.length)]))
    presetDue = cue?.preset ? cue : null
    if (cue?.text !== undefined) showText(cue.text) // its switches (setlist.ts), as X and A would; absent: as they are
    if (cue?.analysis !== undefined && cue.analysis === (settings.get().analyser === 'off')) settings.patch(toggleAnalysis(settings.get()))
  }
  fadingTo = shot.to
  // Between fades: the next scene built, the others freed (E2). The editor holds, so no next scene (a ring costs 62 MB).
  if (!shot.to) prepare(store.getSnapshot().editor ? [shot.from] : [shot.from, director.peek()])
  // S4.3: Auto-style. The built-ins' bindings are remapped through the active preset's map with a 2 s crossfade;
  // Auto off (or Default) is a fade back to {} — their own sources.
  const [rmFrom, rmTo, rmW] = remap.frame(st.auto ? PRESETS[active].map : {}, f.dt)
  src.build = arrangeOut.build // S5.3: expose the arrangement as binding sources (the UI lists them in S6.3)
  src.drop = arrangeOut.drop
  src.energy = arrangeOut.energy // P2: the section level (dsp_formula_review_2026-11-17)
  camTick(now) // plan_camera S1.2b (D1): the camera host's life + its GL (upload, EMA, ref), before render() and presence
  src.presence = presence(camGate.area) // S1.1 (design D3): the gate's held area — stable through flood/strobe; rests at 0 with no camera
  // S1.4 (donor mode): the core on this frame's grid, kick, arrangement, held peak and the instant silence test (G1, not
  // PAUSE's 1 s), then the mix; both on the unscaled dt. A turn to donor counts the core's beats on from our grid's.
  const donorOn = (off ? st.resume : st.analyser) === 'donor' ? 1 : 0 // Off holds the mix it returns to
  if (donorOn > donorTarget) donor.seedBeat(Math.floor(f.sync.beat))
  donorTarget = donorOn
  donorIn.beat = f.sync.beat
  donorIn.bpm = f.sync.bpm
  donorIn.confidence = f.sync.confidence
  donorIn.kick = kickThisFrame
  donorIn.fired = arrangeOut.fired !== null
  donorIn.build = arrangeOut.build
  donorIn.peakDb = meter.db
  donorIn.silent = frameRms <= SILENT_RMS
  donor.update(magDb, wave, f.dt, donorIn, src)
  analyser2k.getFloatFrequencyData(mag2k)
  vs3.update(mag2k, f.dt)
  vs3Live.s = st.analyser === 'vs3' ? vs3.out : null // the vs3 scenes hear it (vs3/host.ts, gl/engine.ts); the rest as ours
  analyser4k.getFloatFrequencyData(mag4k)
  const mel = melody.update(mag4k, f.dt, paused)
  src.tonal = mel.tonal
  src.voice = mel.voice
  if (!off) src.pitch = mel.pitch // Off holds the key colour where it was (gain() leaves it)
  src.donorMix = donorMix = mixStep(donorMix, donorOn, f.dt)
  if (donorMix > 0) setDonorSpectrum(donor.spectrum) // S3.2: syn_Spectrum's donor half at this frame's mix; ours uploads nothing
  if (!off) f.dt *= 1 + 0.5 * arrangeOut.heat // heat speeds the frame; fill and remap above used the unscaled dt (recomputed next frame)
  if (arrangeOut.fired !== null) dropAt = f.time
  // A confident drop cuts once confirmed (0.5 s on, D3′), unless LOCK/panel, or an armed set: its cues hold the bars
  if (!armedCues && !off && shouldCut(arrangeOut.confirmed, store.getSnapshot().hold)) director.cut(director.peek())
  // S5.3: the live heat post pass (postFor at rest = identity: the engine skips it).
  const post = off ? REST : postFor(arrangeOut.heat, dropAt > 0 ? f.time - dropAt : Infinity, f.sync.beat, f.sync.bpm, f.sync.confidence)
  sources(f, src)
  gain(src, st) // the Sources tab's gain and mute, on every source once all are in, before anything reads them; off: all 0
  const styled = restyle(src, rmFrom, rmTo, rmW, styledOut) // after gain(): the built-ins read the muted sources too
  analysis.off = off // every binding bypassed: a bound input reads its stored value (live.ts)
  const fs = off ? Object.assign(idle, f, IDLE_FRAME) : f // what the scenes read
  if (store.getSnapshot().editor) tiles.frame(fs, src) // the library's bake (2b S3.3), its GPU work ahead of this frame's
  const id = shot.to ?? shot.from // the incoming scene as soon as a fade starts: the name shown, the scene edited
  const { doc, errors } = live(id)
  const snap = store.getSnapshot()
  if (id !== snap.edited) edits.clear() // undo is per edited scene (design S3): open, Save as, the autopilot
  if (doc.name !== snap.sceneName || id !== snap.edited) store.patch({ sceneName: doc.name, edited: id })
  if (presetDue?.scene === id) {
    // the cue's preset (presets.ts, by name) onto its scene, as the preset picker would; one gone since: none. Before
    // the render, so the scene's first frame is the preset's. It glides on the scene on stage (a cue of the same
    // scene); one coming in starts at it (the donor's rule: the scene change is the transition).
    const { preset } = presetDue
    const t = panel.presetNode()
    const p = t?.list.find((x) => x.name === preset)
    if (t && p) panel.setValues(t.path, p.values, id === snap.edited)
    presetDue = null
  }
  render(shot, fs, src, styled, post) // sets fs.width/height to the internal size
  governor.frame(now, performance.now() - start, gpuMs.get(id)) // fed only on rendered frames; GPU3D N4: + the scene's GL ms
  if (now - badgeAt >= BADGE_MS) {
    badgeAt = now
    const bpm = Math.round(f.sync.bpm * 10) / 10
    const ms = gpuMs.get(id)
    const prev = store.getSnapshot().nodeErrors
    const c = director.cue()
    const set = c && library.sets()[store.getSnapshot().armedSet ?? -1]?.cues // its numbering, the cues sitting out too
    store.patch({
      quality: mode, scale, drops: governor.drops, bpm, confident: f.sync.confidence >= CONFIDENT,
      gpuMs: ms === undefined ? null : Math.round(ms * 10) / 10, // the panel's GPU hint
      nodeErrors: errors.join('\n') === prev.join('\n') ? prev : [...errors], // a new array only when they changed
      style: { detected: styleOut.detected, confidence: styleOut.confidence }, // S4.3: the badge reads it at 4×/s
      clip: meter.clip, // the input meter's CLIP light and hint (latched 1.5 s, so 4×/s never misses one)
      clipHint: meter.hint,
      cue: c && set ? readout(set.indexOf(c.of), set.length, c.left, c.sure) : '',
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
export { director, meter, src, settings } // ?bench drives the autopilot (bench.ts); the Sources tab reads `src`/`settings` live (S6.1), the overlay `meter`
