// The autopilot (design S3), pure: while the (c) phase is confident it switches on bar lines, otherwise on time.
// `now` is seconds. `update` returns the same Shot object every frame.
import type { Sync } from './audio/sync'
import type { SceneId } from './doc'

export interface Shot { from: SceneId; to: SceneId | null; mix: number }
export interface Director { update(now: number, sync: Sync): Shot; next(): void; prev(): void; setHold(on: boolean): void }
export interface DirectorOpts {
  barsPerShot: number // confident: switch this many bars after the last switch, on a bar line …
  barsTransition: number // … fading over this many bars (←/→ too)
  confidentTheta: number // knob (Q4 default ⚠️): confident = sync.confidence ≥ θ …
  confidentBars: number // … held for this many bars
  fallbackSeconds: number // otherwise: switch this many seconds after the last switch …
  fallbackTransition: number // … fading over this many seconds (←/→ too)
}

const DEFAULTS: DirectorOpts = {
  barsPerShot: 16, barsTransition: 1, confidentTheta: 0.6, confidentBars: 2, fallbackSeconds: 30, fallbackTransition: 2,
}

export function createDirector(playlist: readonly SceneId[], opts?: Partial<DirectorOpts>): Director {
  const o = { ...DEFAULTS, ...opts }
  const shot: Shot = { from: playlist[0], to: null, mix: 0 }
  let cur = 0 // playlist index of the current scene: the incoming one during a fade
  let hold = false
  let step = 0 // ←/→ presses, applied on the next update
  let last: { now: number; bar: number } | null = null // the previous update
  let switchedAt = 0 // time of the last switch (the time rule) …
  let switchedBar = 0 // … and its bar (the bar rule)
  let sureSince: number | null = null // the bar where confidence ≥ θ began

  /** Fades to the scene `by` steps away. Mid-fade, the incoming scene becomes current at once. */
  function begin(by: number, mix: number, at: number, bar: number) {
    if (shot.to) shot.from = shot.to
    cur = (((cur + by) % playlist.length) + playlist.length) % playlist.length
    shot.to = playlist[cur]
    shot.mix = Math.min(1, mix)
    switchedAt = at
    switchedBar = bar
  }

  return {
    update(now, sync) {
      const { bar } = sync
      if (!last) {
        last = { now, bar }
        switchedAt = now
        switchedBar = Math.floor(bar)
      }
      sureSince = sync.confidence < o.confidentTheta ? null : (sureSince ?? bar)
      const sure = sureSince !== null && bar - sureSince >= o.confidentBars
      const line = Math.floor(bar)
      switchedBar = Math.min(switchedBar, line) // the bar count jumped back (a sync reset): count from here

      if (shot.to) {
        // Bars while confident (locked to the grid), seconds otherwise: a backward bar jump never rewinds the fade,
        // and a fade begun on bars still finishes if the confidence drops.
        shot.mix += sure ? Math.max(0, bar - last.bar) / o.barsTransition : (now - last.now) / o.fallbackTransition
        if (shot.mix >= 1) {
          shot.from = shot.to
          shot.to = null
          shot.mix = 0
        }
      }

      if (step) {
        begin(step, 0, now, line)
        step = 0
      } else if (!shot.to && !hold) {
        if (sure) {
          // On the first frame past the bar line, already faded by the part of the bar that has passed.
          if (line > Math.floor(last.bar) && line - switchedBar >= o.barsPerShot) begin(1, (bar - line) / o.barsTransition, now, line)
        } else if (now - switchedAt >= o.fallbackSeconds) {
          const at = Math.max(switchedAt + o.fallbackSeconds, last.now) // on time; when overdue (after a lock), from now
          begin(1, (now - at) / o.fallbackTransition, at, line)
        }
      }
      last.now = now
      last.bar = bar
      return shot
    },
    next() {
      step++
    },
    prev() {
      step--
    },
    setHold(on) {
      hold = on
    },
  }
}
