import { useRef, useState, useSyncExternalStore } from 'react'
import { AUTO_BARS, AUTO_SECONDS, parseAutopilot, SECONDS_RANGE, type Autopilot } from '../director'
import { store } from '../store'
import { autoChip, autoTitle } from './bar'
import { Icon, Pop } from './Pop'
import { Seg } from './SourcesTab'

const KEY = 'vjw.autopilot'
try {
  store.patch({ autopilot: parseAutopilot(JSON.parse(localStorage.getItem(KEY) ?? 'null')) })
} catch {
  // no localStorage, or a corrupt value: the default
}
/** Puts `p` in force, repaired, and keeps it in vjw.autopilot (a refused write: this session only). */
function pick(p: Partial<Autopilot>) {
  const a = parseAutopilot({ ...store.getSnapshot().autopilot, ...p })
  store.patch({ autopilot: a })
  try {
    localStorage.setItem(KEY, JSON.stringify(a))
  } catch {
    // this session keeps it
  }
}

const BARS_HINT = 'Bars follow the beat grid; while the tempo is unsure they run at 174 BPM. off: no timed cut.'
const SECONDS_HINT = `Seconds run on the clock, whatever the tempo; while the beat is sure the cut waits for the next bar line. ${SECONDS_RANGE[0]}–${SECONDS_RANGE[1]} s, in steps of 5.`

/** The top bar's ⟳ chip (user 2026-11-21 «вынести на UI управление временем смены сцены»): how long the autopilot plays
 *  a playlist scene before it cuts, in bars or seconds, or off (director.ts Autopilot); the popover picks it, the
 *  current one lit. The chip reads the length (`hold` while held), its title the countdown. Kept in vjw.autopilot.
 *  The seconds field commits on Enter or blur, as Bpm.tsx's: untouched it changes nothing, Esc keeps the old value. */
export function AutoChip() {
  const s = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const a = s.autopilot
  const [text, setText] = useState<string | null>(null) // the seconds field's edit; null: untouched
  const esc = useRef(false) // Esc: the blur that follows commits nothing
  return (
    <Pop
      id="pop-auto"
      className="chip auto"
      title={autoTitle(a, s)}
      label={
        <>
          <Icon name="cycle" />
          <span>{autoChip(a, s.hold)}</span>
        </>
      }
    >
      <Seg
        label="Next scene every … bars"
        hint={BARS_HINT}
        value={a.mode === 'bars' ? String(a.bars) : a.mode}
        options={[['off', 'off'], ...AUTO_BARS.map((b) => [String(b), String(b)] as const)]}
        set={(v) => pick(v === 'off' ? { mode: 'off' } : { mode: 'bars', bars: Number(v) })}
      />
      <Seg label="… or every … seconds" hint={SECONDS_HINT} value={a.mode === 'seconds' ? String(a.seconds) : ''} options={AUTO_SECONDS.map((x) => [String(x), String(x)] as const)} set={(v) => pick({ mode: 'seconds', seconds: Number(v) })} />
      <form
        className="line"
        title={SECONDS_HINT}
        noValidate // min / max / step drive the arrows; a typed 47 or 7 commits too and parseAutopilot snaps it (45, 10)
        onSubmit={(e) => {
          e.preventDefault()
          ;(document.activeElement as HTMLElement | null)?.blur() // commits (onBlur), and the hotkeys work again
        }}
      >
        <input
          type="number"
          aria-label="Seconds"
          className={a.mode === 'seconds' ? 'on' : undefined}
          min={SECONDS_RANGE[0]}
          max={SECONDS_RANGE[1]}
          step={5}
          value={text ?? a.seconds}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.code !== 'Escape') return
            e.preventDefault() // the popover stays open: the next Esc closes it
            esc.current = true
            e.currentTarget.blur()
          }}
          onBlur={() => {
            if (!esc.current && text?.trim() && Number.isFinite(Number(text))) pick({ mode: 'seconds', seconds: Number(text) }) // empty or junk: nothing changes
            esc.current = false
            setText(null)
          }}
        />
        s
      </form>
      <p className="hint">← → and drops still switch, Space holds; an armed set plays its cues' own bars.</p>
    </Pop>
  )
}
