// The autopilot (design S3), pure: while the (c) phase is confident it switches on bar lines, otherwise on time.
// `now` is seconds. `update` returns the same Shot object every frame. An armed set (setlist.ts) plays its cues in
// place of the playlist, each for its own bars; ←/→ step through them, a timeline click jumps on the next bar line.
// The playlist's shot length is the user's (Autopilot, the top bar's ⟳ chip).
import type { Sync } from './audio/sync'
import type { SceneId } from './doc'
import type { Cue } from './setlist'

/** The playlist's shot length (user 2026-11-21: «очень быстро щёлкается … два раза по 64 такта»): `bars` on the grid
 *  (while unsure, timed at cueBpm), `seconds` on the clock (while confident, on the next bar line), `off`: no timed
 *  switch (←/→, a cut, a drop still switch). Both lengths stay stored, whichever the mode. */
export interface Autopilot { mode: 'bars' | 'seconds' | 'off'; bars: number; seconds: number }
export const AUTO_BARS = [8, 16, 32, 64, 128]
export const AUTO_SECONDS = [30, 60, 90, 120, 180] // the quick picks; any of SECONDS_RANGE in steps of 5 is typed
export const SECONDS_RANGE = [10, 600] as const
export const AUTOPILOT: Autopilot = { mode: 'bars', bars: 128, seconds: 180 } // 128 bars: two 64s, ≈ 2:57 at 174 BPM

/** A stored or typed setting, repaired (the trust boundary): an unknown mode or a bar count off AUTO_BARS takes the
 *  default's; seconds are rounded to a step of 5 inside SECONDS_RANGE (not a number: the default's). */
export function parseAutopilot(x: unknown): Autopilot {
  const o = typeof x === 'object' && x !== null ? (x as Record<string, unknown>) : {}
  const s = o.seconds
  return {
    mode: o.mode === 'bars' || o.mode === 'seconds' || o.mode === 'off' ? o.mode : AUTOPILOT.mode,
    bars: AUTO_BARS.includes(o.bars as number) ? (o.bars as number) : AUTOPILOT.bars,
    seconds: typeof s === 'number' && Number.isFinite(s) ? Math.min(SECONDS_RANGE[1], Math.max(SECONDS_RANGE[0], Math.round(s / 5) * 5)) : AUTOPILOT.seconds,
  }
}

export interface Shot { from: SceneId; to: SceneId | null; mix: number }
export interface Director {
  update(now: number, sync: Sync): Shot; next(): void; prev(): void; setHold(on: boolean): void
  setPlaylist(ids: readonly SceneId[]): void; peek(): SceneId // peek = the autopilot's next id
  cut(id: SceneId): void // to `id` at once, no fade (the panel's Save as); an armed set keeps its place
  /** A set's cues in place of the playlist, faded to from the first at the next update; the armed set again (an edit:
   *  the same cue objects) keeps the cue on stage. Null or none: back to the playlist, the scene on stage playing on. */
  arm(cues: readonly Cue[] | null): void
  /** The armed set's cue `of` from its next bar line (the Set menu's timeline), or `now` at once (a time-code cue's
   *  track time, app.ts): a fade into it, as a step's. Its own cue on stage: none. ←/→ or an arm drop it; a cue gone from
   *  the set by then is skipped. */
  jump(of: Cue, now?: boolean): void
  /** The armed set's cue on stage (the incoming one during a fade), its index, the bars left in it (Infinity: a hold)
   *  and the bars played, fractional; not `sure`, timed at cueBpm. `jump`: the cue a jump waits to play. Null: no set
   *  armed. */
  cue(): { index: number; of: Cue; left: number; at: number; sure: boolean; jump: Cue | null } | null
  /** The switches so far (←/→, a cue, a jump, the autopilot; not a cut): each a fade, or none to the scene on stage.
   *  A new count is a new cue (app.ts: its preset and switches). */
  switches(): number
  /** The playlist's next timed switch as of the last update, whole: the bars left (bars: the grid's while confident,
   *  else at cueBpm) or the seconds left (seconds: on the clock, then the bar line while confident). Infinity: none
   *  (off, a hold, an armed set: cue() counts its cue). */
  due(): number
}
export interface DirectorOpts {
  auto: () => Autopilot // the playlist's shot length, read every update; confident, on a bar line, …
  barsTransition: number // … fading over this many bars (←/→ too)
  confidentTheta: number // knob (Q4 default ⚠️): confident = sync.confidence ≥ θ …
  confidentBars: number // … held for this many bars
  fallbackTransition: number // otherwise on time, fading over this many seconds (←/→ too)
  /** A scene cut to off the playlist holds this slot (its place in the list, library.slot), so one step on lands on
   *  playlist[slot]; undefined, or no `slot`: the slot it cut from. */
  slot?: (id: SceneId) => number | undefined
  cueBpm: number // knob: while unsure, a bar lasts 4 beats at this tempo (the user's DnB): an armed set's cue, a bars shot
}

const DEFAULTS: DirectorOpts = {
  auto: () => AUTOPILOT, barsTransition: 1, confidentTheta: 0.6, confidentBars: 2, fallbackTransition: 2, cueBpm: 174,
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
  let jumpTo: Cue | null = null // jump(): the cue to fade to on the next bar line …
  let jumpNow = false // … or at the next update
  let switches = 0 // begin() calls
  const barS = 240 / o.cueBpm // s: a bar while unsure (4 beats of 60 / bpm s): an armed set's cue, a bars shot

  /** The playlist index `by` steps from the current scene. If it left the playlist, the scene that followed it now
   *  holds its slot `cur`, so one step on lands there. */
  function away(by: number) {
    const n = playlist.length
    const gone = by > 0 && !stand && playlist[cur] !== (shot.to ?? shot.from)
    return (((cur + by - (gone ? 1 : 0)) % n) + n) % n
  }

  /** Fades to playlist[to]. Mid-fade, the incoming scene becomes current at once. To the scene on stage then (a cue of
   *  it, a one-scene playlist): no fade, its one cached Live would draw twice a frame (skeptic C5); the shot counts
   *  afresh all the same. */
  function begin(to: number, mix: number, at: number, bar: number) {
    if (shot.to) shot.from = shot.to
    cur = to
    stand = false
    shot.to = playlist[cur] === shot.from ? null : playlist[cur]
    shot.mix = shot.to ? Math.min(1, mix) : 0
    switchedAt = at
    switchedBar = bar
    switches++
  }

  /** The shot's length in bars: the cue's (a hold never ends; nor does the cue before a time-code one, which its track
   *  time starts), else the playlist's (Infinity: off, or seconds, which update times itself). */
  function length() {
    const b = cues?.[cur].bars
    const a = o.auto()
    return b === undefined ? (a.mode === 'bars' ? a.bars : Infinity) : b === 'hold' || cues![(cur + 1) % cues!.length].time !== undefined ? Infinity : b
  }
  /** The bars played since the switch, fractional: the grid's while sure, else at cueBpm from its time. */
  const played = () => (!last ? 0 : sure ? last.bar - switchedBar : (last.now - switchedAt) / barS)
  /** The bars left of a shot `n` bars long, whole (the bar under way counts while sure). */
  const left = (n: number, at = played()) => Math.max(0, sure ? n - Math.floor(at) : Math.ceil(n - at))

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
        jumpTo = null
      } else if (jumpTo && cues) {
        // On the first frame past the cue's next bar line as its bars count (sure: the grid's, else every barS from the
        // switch), already faded by the part of it that has passed; the lock (hold) does not stop it, as ←/→.
        const k = Math.floor((now - switchedAt) / barS)
        if (jumpNow || (sure ? line > Math.floor(last.bar) : k > Math.floor((last.now - switchedAt) / barS))) {
          const j = cues.indexOf(jumpTo)
          const at = jumpNow ? now : switchedAt + k * barS
          jumpTo = null
          if (j >= 0 && (j !== cur || stand)) {
            if (sure && !jumpNow) begin(j, (bar - line) / o.barsTransition, now, line)
            else begin(j, (now - at) / o.fallbackTransition, at, line)
          }
        }
      } else if (!shot.to && !hold) {
        const a = o.auto()
        const timed = !cues && a.mode === 'seconds' // the playlist on the clock
        const n = length()
        const secs = timed ? a.seconds : n * barS
        if (sure) {
          // On the first frame past the bar line (the n-th; timed, the first once the seconds are up), already faded by
          // the part of the bar that has passed.
          if (line > Math.floor(last.bar) && (timed ? now - switchedAt >= secs : line - switchedBar >= n)) begin(away(1), (bar - line) / o.barsTransition, now, line)
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
        cues = jumpTo = null
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
        jumpTo = null
      }
      cues = next
      playlist = next.map((c) => c.scene)
    },
    jump(of, now = false) {
      jumpTo = of
      jumpNow = now
    },
    cue() {
      if (!cues) return null
      const at = played()
      return { index: cur, of: cues[cur], left: left(length(), at), at, sure, jump: jumpTo }
    },
    switches() {
      return switches
    },
    due() {
      const a = o.auto()
      if (cues || hold) return Infinity
      return a.mode === 'seconds' ? Math.max(0, Math.ceil(a.seconds - (last ? last.now - switchedAt : 0))) : left(length())
    },
  }
}
