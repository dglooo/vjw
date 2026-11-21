import type { Energy } from './audio/energy'
import type { Onset } from './audio/onset'
import type { Sync } from './audio/sync'

// What every scene reads each frame (frozen contract CP1 / design S8). CP1 fills energy, audioNow,
// time, dt, width, height; onsets stay [] and lastOnset null until CP2, sync stays ZERO_SYNC until CP5.
export interface FrameInput {
  energy: Energy // (a)
  onsets: readonly Onset[] // (b) fired since last frame
  lastOnset: Onset | null // envelope by age = audioNow − t
  audioNow: number // audio-clock time of what the room hears now, on the onsets' clock (heardAt), s
  sync: Sync // (c)
  time: number // s
  dt: number // s
  width: number // render target px
  height: number
}

/** FrameInput.audioNow. A file plays through our output: its clock (input.ts audioNow()). Line-in is heard in the room as
 *  it is captured, and its onsets are stamped then: the context's time plus the capture path's latency. The output's
 *  latency never enters: it plays none of the line-in, and a Bluetooth output reports 150–300 ms (dsp_linein_2026-11-16
 *  fix 4; on the output clock a line-in onset's age sat at 0, its envelope at the peak, that long). */
export const heardAt = (file: boolean, outputNow: number, currentTime: number, inputLatency: number) => (file ? outputNow : currentTime + inputLatency)
