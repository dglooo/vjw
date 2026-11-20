// The autopilot (design S3), pure: while the (c) phase is confident it switches on bar lines, otherwise on time.
// `now` is seconds. `update` returns the same Shot object every frame. An armed set (setlist.ts) plays its cues in
// place of the playlist, each for its own bars; ←/→ step through them.
import type { Sync } from './audio/sync'
import type { SceneId } from './doc'
import type { Cue } from './setlist'

export interface Shot { from: SceneId; to: SceneId | null; mix: number }
export interface Director {
  update(now: number, sync: Sync): Shot; next(): void; prev(): void; setHold(on: boolean): void
  setPlaylist(ids: readonly SceneId[]): void; peek(): SceneId // peek = the autopilot's next id
  cut(id: SceneId): void // to `id` at once, no fade (the panel's Save as); an armed set keeps its place
  /** A set's cues in place of the playlist, faded to from the first at the next update; the armed set again (an edit:
   *  the same cue objects) keeps the cue on stage. Null or none: back to the playlist, the scene on stage playing on. */
  arm(cues: readonly Cue[] | null): void
  /** The armed set's cue on stage (the incoming one during a fade), its index and the bars left in it (Infinity: a
   *  hold); not `sure`, timed at cueBpm. Null: no set armed. */
  cue(): { index: number; of: Cue; left: number; sure: boolean } | null
}
export interface DirectorOpts {
  barsPerShot: number // confident: switch this many bars after the last switch, on a bar line …
  barsTransition: number // … fading over this many bars (←/→ too)
  confidentTheta: number // knob (Q4 default ⚠️): confident = sync.confidence ≥ θ …
  confidentBars: number // … held for this many bars
  fallbackSeconds: number // otherwise: switch this many seconds after the last switch …
  fallbackTransition: number // … fading over this many seconds (←/→ too)
  /** A scene cut to off the playlist holds this slot (its place in the list, library.slot), so one step on lands on
   *  playlist[slot]; undefined, or no `slot`: the slot it cut from. */
  slot?: (id: SceneId) => number | undefined
  cueBpm: number // knob: an armed set's cue, while unsure, lasts its bars at this tempo (the user's DnB), not fallbackSeconds
}

const DEFAULTS: DirectorOpts = {
  barsPerShot: 16, barsTransition: 1, confidentTheta: 0.6, confidentBars: 2, fallbackSeconds: 30, fallbackTransition: 2, cueBpm: 174,
}

export function createDirector(playlist: readonly SceneId[], opts?: Partial<DirectorOpts>): Director {
  const o = { ...DEFAULTS, ...opts }
  const shot: Shot = { from: playlist[0], to: null, mix: 0 }
  let cur = 0 // playlist index of the current scene (the incoming one during a fade), or the slot it left (setPlaylist)
  let hold = false
  let step = 0 // ←/→ presses, applied on the next update
  let last: { now: number; bar: number } | null = null // the previous update
  let switchedAt = 0 // time of the last switch (the time rule) …
  let switchedBar = 0 // … and its bar (the bar rule)
  let sureSince: number | null = null // the bar where confidence ≥ θ began
  let sure = false // the bar rule holds (as of the last update)
  let cues: readonly Cue[] | null = null // the armed set's: `playlist` holds their scenes and `cur` the cue on stage
  let saved = playlist // the library's playlist while a set plays
  let enter = false // arm(): fade to cue `cur` at the next update
  let stand = false // a cut scene stands in for the armed set's cue on stage: one step on is the next cue

  /** The playlist index `by` steps from the current scene. If it left the playlist, the scene that followed it now
   *  holds its slot `cur`, so one step on lands there. */
  function away(by: number) {
    const n = playlist.length
    const gone = by > 0 && !stand && playlist[cur] !== (shot.to ?? shot.from)
    return (((cur + by - (gone ? 1 : 0)) % n) + n) % n
  }

  /** Fades to playlist[to]. Mid-fade, the incoming scene becomes current at once. */
  function begin(to: number, mix: number, at: number, bar: number) {
    if (shot.to) shot.from = shot.to
    cur = to
    stand = false
    shot.to = playlist[cur]
    shot.mix = Math.min(1, mix)
    switchedAt = at
    switchedBar = bar
  }

  /** The shot's length in bars: the cue's (a hold never ends), else barsPerShot. */
  function length() {
    const b = cues?.[cur].bars
    return b === undefined ? o.barsPerShot : b === 'hold' ? Infinity : b
  }

  /** The playlist `ids`. The shot (a fade too) plays on. A dropped current scene keeps its slot, clamped: the next switch
   *  continues there. ponytail: by index, so a scene off the playlist that a change before it shifts lands one off; ask
   *  opts.slot here too if that shows (bench.ts's own playlists would then need a slot of their own). */
  function relist(ids: readonly SceneId[]) {
    const i = ids.indexOf(shot.to ?? shot.from)
    cur = i < 0 ? Math.min(cur, ids.length) : i
    playlist = ids
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
      sure = sureSince !== null && bar - sureSince >= o.confidentBars
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

      if (step || enter) {
        begin(enter ? cur : away(step), 0, now, line)
        step = 0
        enter = false
      } else if (!shot.to && !hold) {
        const n = length()
        const secs = cues ? (n * 240) / o.cueBpm : o.fallbackSeconds // a bar: 4 beats of 60 / bpm s
        if (sure) {
          // On the first frame past the bar line, already faded by the part of the bar that has passed.
          if (line > Math.floor(last.bar) && line - switchedBar >= n) begin(away(1), (bar - line) / o.barsTransition, now, line)
        } else if (now - switchedAt >= secs) {
          const at = Math.max(switchedAt + secs, last.now) // on time; when overdue (after a lock), from now
          begin(away(1), (now - at) / o.fallbackTransition, at, line)
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
    setPlaylist(ids) {
      if (cues) saved = ids // a set plays: the playlist waits for the disarm
      else relist(ids)
    },
    peek() {
      return playlist[away(1)]
    },
    cut(id) {
      shot.from = id
      shot.to = null
      shot.mix = 0
      const i = playlist.indexOf(id)
      if (cues) stand = true // an armed set keeps its place
      else cur = i >= 0 ? i : (o.slot?.(id) ?? cur) // off the playlist: its slot, else the one it cut from; the next switch lands there
      last = null // the autopilot counts from the next update, as after a switch
    },
    arm(next) {
      if (!next?.length) {
        if (cues) relist(saved)
        cues = null
        enter = stand = false
        return
      }
      if (cues) {
        // An edit of the armed set: the cue on stage by identity; gone (an edit makes a new one), its place: the edited
        // one, else the cue after a deleted one, which one step on then lands on (away), past the end the first
        const i = next.indexOf(cues[cur])
        cur = i < 0 ? cur % next.length : i
        if (i < 0) stand = false // a scene standing in for a deleted cue: one step on is the cue after it
      } else {
        saved = playlist
        cur = 0
        enter = true
      }
      cues = next
      playlist = next.map((c) => c.scene)
    },
    cue() {
      if (!cues) return null
      const n = length()
      const left = !last ? n : sure ? n - (Math.floor(last.bar) - switchedBar) : Math.ceil(n - ((last.now - switchedAt) * o.cueBpm) / 240)
      return { index: cur, of: cues[cur], left: Math.max(0, left), sure }
    },
  }
}
