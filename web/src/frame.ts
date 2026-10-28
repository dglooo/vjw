import type { Energy } from './audio/energy'
import type { Onset } from './audio/onset'
import type { Sync } from './audio/sync'

// What every scene reads each frame (frozen contract CP1 / design S8). CP1 fills energy, audioNow,
// time, dt, width, height; onsets stay [] and lastOnset null until CP2, sync stays ZERO_SYNC until CP5.
export interface FrameInput {
  energy: Energy // (a)
  onsets: readonly Onset[] // (b) fired since last frame
  lastOnset: Onset | null // envelope by age = audioNow − t
  audioNow: number // audio-clock time of this frame, s
  sync: Sync // (c)
  time: number // s
  dt: number // s
  width: number // render target px
  height: number
}
