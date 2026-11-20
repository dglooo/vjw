// Audio input (design S2): one AudioContext; the line-in or file source feeds a fan-out hub.
// Module-level singletons, never created in Effects (design S1).
import { isClip } from '../clips'
import { pickSaved, store, type UiSnapshot } from '../store'
import type { Hit } from './drums'
import { rms } from './energy'
import type { Onset } from './onset'
import type { WorkletIn, WorkletMsg } from './onset.worklet'
import onsetWorklet from './onset.worklet.ts?worker&url' // bundled plain-JS chunk (plan S1.2, R5b)

const SAVED_KEY = 'vjw.device'
const DEBUG = location.search.includes('debug')
const ODF_KEEP = 64 // ≈3 s of 'odf' batches: app.ts drains them each frame, the cap bounds a stalled (hidden) tab

export const ctx = new AudioContext({ latencyHint: 'interactive' })
const hub = ctx.createGain() // the current source connects here
export const analyser = new AnalyserNode(ctx, { fftSize: 1024, smoothingTimeConstant: 0 }) // (i) → (a) energy
const split = ctx.createChannelSplitter(2) // S0.2: always on → the per-channel analysers (waveLR + the ?debug meters)
export const analyserL = new AnalyserNode(ctx, { fftSize: 1024, smoothingTimeConstant: 0 }) // (i) channel 0
export const analyserR = new AnalyserNode(ctx, { fftSize: 1024, smoothingTimeConstant: 0 }) // (i) channel 1
export const analyser2k = new AnalyserNode(ctx, { fftSize: 2048, smoothingTimeConstant: 0 }) // (i) the vs3 core's (audio/vs3.ts): the kit feeder's size
export const analyser4k = new AnalyserNode(ctx, { fftSize: 4096, smoothingTimeConstant: 0 }) // (i) the melodic layer's (audio/melody.ts): 11.7 Hz bins
export const recDest = ctx.createMediaStreamDestination() // (iii) REC audio track, S4.3
const recDelay = ctx.createDelay() // (iii) a file's REC audio waits like its onsets (T1), set in setSource
hub.connect(analyser)
hub.connect(analyser2k)
hub.connect(analyser4k)
hub.connect(split)
split.connect(analyserL, 0)
split.connect(analyserR, 1)
hub.connect(recDelay).connect(recDest)

export const onsetQueue: Onset[] = [] // (b) drained by app.ts each frame
export const hitQueue: Hit[] = [] // kick/snare/hats, drained by app.ts like the onsets (S1.4)
export const odfQueue: Extract<WorkletMsg, { kind: 'odf' }>[] = [] // (c) drained by app.ts each frame
export const featQueue: Extract<WorkletMsg, { kind: 'feat' }>[] = [] // (b) worklet feat batches, drained by app.ts each frame

let port: MessagePort | null = null // set when the worklet loads
let pendingConfig: WorkletIn | null = null
/** S2.5: the app's config → the worklet. The module loads in a promise, so a config sent before it is kept and
 *  posted at .then(): only the latest one — the worklet's `rev <= applied` rule (analysis.ts) makes that safe. */
export function configure(c: WorkletIn) {
  if (port) port.postMessage(c)
  else pendingConfig = c
}

// (ii) the onset worklet: hub → node, no outputs. addModule works on a suspended context, so it loads at import.
ctx.audioWorklet.addModule(onsetWorklet).then(
  () => {
    const worklet = new AudioWorkletNode(ctx, 'onset', { numberOfOutputs: 0 })
    if (pendingConfig) worklet.port.postMessage(pendingConfig)
    port = worklet.port
    worklet.onprocessorerror = (e) => console.error('onset worklet', e)
    worklet.port.onmessage = ({ data }: MessageEvent<WorkletMsg>) => {
      if (data.kind === 'odf') {
        if (odfQueue.push(data) > ODF_KEEP) odfQueue.shift()
        return
      }
      if (data.kind === 'feat') {
        if (featQueue.push(data) > ODF_KEEP) featQueue.shift()
        return
      }
      if (data.kind === 'hit') {
        hitQueue.push(data) // a hit has t and strength too: without this it would type-check as an onset
        return
      }
      onsetQueue.push(data)
      if (DEBUG) console.info('onset', data.t.toFixed(3), data.strength.toFixed(2))
    }
    hub.connect(worklet)
  },
  (e) => console.error('onset worklet', e),
)

/** One reusable file player, not in the DOM. The overlay's transport drives it; app.ts hears its seeks and resumes. */
export const player = new Audio()
const playerNode = ctx.createMediaElementSource(player)
playerNode.connect(ctx.destination) // files are heard; line-in is not monitored (design S2)
/** Play / pause. Callers check that the source is a file: on line-in the player holds the last file, still audible. */
export const togglePlay = () => (player.paused ? void player.play() : player.pause())

let node: AudioNode | null = null
let stream: MediaStream | null = null

function setSource(next: AudioNode, source: UiSnapshot['source'], nextStream: MediaStream | null = null) {
  stream?.getTracks().forEach((t) => t.stop())
  player.pause()
  node?.disconnect(hub)
  next.connect(hub)
  node = next
  stream = nextStream
  // A file is heard base + output latency after it is processed, and T1 shows its onsets only then: its REC audio
  // waits as long, so a take keeps the picture on the sound. Line-in is shown on arrival: no delay.
  // ponytail: read once per source. outputLatency reads 0 until the output has run ~0.3 s, so a file dropped before
  // Start, or an output-device change mid-file, keeps a stale delay until the next drop; re-read at REC start if it bites.
  recDelay.delayTime.value = source?.kind === 'file' ? ctx.baseLatency + ctx.outputLatency : 0
  store.patch({ source })
}

/** Line-in: the capture path's latency, s, as the device reports it (MediaTrackSettings.latency, absent from TS's DOM
 *  lib); 0 for a file or with no report. */
export const inputLatency = () => (stream?.getAudioTracks()[0]?.getSettings() as { latency?: number } | undefined)?.latency ?? 0

/** Audio-clock time now, s (contract: FrameInput.audioNow). */
export function audioNow() {
  const ot = ctx.getOutputTimestamp()
  return (ot.contextTime ?? 0) + (performance.now() - (ot.performanceTime ?? 0)) / 1000
}

/** Output underruns since the context started (spec §4.7): MDN AudioPlaybackStats, Chrome 146+, refreshed 1×/s while
 *  running and visible. null where the API is absent (TS's DOM lib lacks it too). */
export const underruns = () => (ctx as AudioContext & { playbackStats?: { underrunEvents: number } }).playbackStats?.underrunEvents ?? null

/** Labeled audio inputs only: labels stay empty until the user grants permission (MDN enumerateDevices). */
export async function listDevices() {
  const all = await navigator.mediaDevices.enumerateDevices()
  const devices = all.filter((d) => d.kind === 'audioinput' && d.label).map((d) => ({ id: d.deviceId, label: d.label }))
  store.patch({ devices })
  return devices
}

/** Permission prompt only; the picker then shows labeled devices. */
export async function allowDevices() {
  const ms = await navigator.mediaDevices.getUserMedia({ audio: true })
  ms.getTracks().forEach((t) => t.stop())
  await listDevices()
}

export async function selectDevice(id: string) {
  const ms = await navigator.mediaDevices.getUserMedia({
    audio: { deviceId: { exact: id }, echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2 },
  })
  console.info('input', ms.getAudioTracks()[0].getSettings()) // channel check (spec §2.1)
  setSource(ctx.createMediaStreamSource(ms), { kind: 'device', id }, ms)
  localStorage.setItem(SAVED_KEY, id)
  await listDevices()
}

/** Start button (R6: the context starts suspended): resume, then reconnect the saved device if it is still there. */
export async function start() {
  await ctx.resume()
  const saved = pickSaved(await listDevices(), localStorage.getItem(SAVED_KEY))
  if (saved) await selectDevice(saved.id)
}

document.addEventListener('dragover', (e) => e.preventDefault())
document.addEventListener('drop', (e) => {
  e.preventDefault()
  const file = e.dataTransfer?.files[0]
  if (!file || isClip(file)) return // a video file is a clip (ui/Clips.tsx), never the music
  setSource(playerNode, { kind: 'file', name: file.name })
  URL.revokeObjectURL(player.src)
  player.src = URL.createObjectURL(file)
  void player.play()
})

// ?debug: L/R meters for the spec §2.1 channel check: the always-on analyserL/R (S0.2), rms over the first 512
// samples of each, 10 Hz into the store.
if (DEBUG) {
  const bufL = new Float32Array(analyserL.frequencyBinCount) // the first 512 of the analyser's 1024 (as app.ts's wave)
  const bufR = new Float32Array(analyserR.frequencyBinCount)
  setInterval(() => {
    analyserL.getFloatTimeDomainData(bufL)
    analyserR.getFloatTimeDomainData(bufR)
    const settings = stream?.getAudioTracks()[0].getSettings() ?? null // null while a file plays
    store.patch({ debug: { l: rms(bufL), r: rms(bufR), settings, underruns: underruns() } })
  }, 100)
}

navigator.mediaDevices.addEventListener('devicechange', listDevices)
ctx.addEventListener('statechange', () => store.patch({ needsStart: ctx.state !== 'running' }))
store.patch({ needsStart: ctx.state !== 'running' })
if (ctx.state === 'running') void start() // autoplay allowed: reconnect without a click
else void listDevices()
