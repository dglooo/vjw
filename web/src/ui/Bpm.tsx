import { useRef, useState, useSyncExternalStore } from 'react'
import { settings } from '../app'
import { store } from '../store'
import { press } from './bar'
import { Icon } from './Pop'

const HINT = 'Type a BPM to hold the tempo there, with no auto-fill (a DJ mix holds a static BPM). T ×4 retaps it, [ ] halve / double it. Unlock: back to the detected BPM.'

/** The manual BPM lock (user 2026-11-20), in the top bar's audio popover: a typed BPM holds the tempo (sync.ts
 *  setManual) until Unlock clears it; Lock holds the BPM shown. Unlocked, the field shows the live auto BPM, dim while
 *  unsure; locked, the held value in the lock's amber. ½ and ×2 press [ and ] (app.ts). Stored in vjw.audio (app.ts),
 *  so a reload keeps it. Focused, the field empties (the value stays as its placeholder): leaving it untouched changes
 *  nothing, a number locks on Enter or blur, Esc lets go of the field and keeps the old value. */
export function Bpm() {
  const held = useSyncExternalStore(settings.onChange, () => settings.get().bpm)
  const bpm = useSyncExternalStore(store.subscribe, () => store.getSnapshot().bpm)
  const sure = useSyncExternalStore(store.subscribe, () => store.getSnapshot().confident)
  const [text, setText] = useState<string | null>(null) // while focused: the typed text, which the 4×/s BPM never overwrites
  const esc = useRef(false) // Esc: the blur that follows commits nothing
  const shown = (held ?? bpm) > 0 ? (held ?? bpm).toFixed(1) : ''
  return (
    <form
      className={held ? 'bpm held' : sure ? 'bpm' : 'bpm unsure'}
      title={HINT}
      onSubmit={(e) => {
        e.preventDefault()
        ;(document.activeElement as HTMLElement | null)?.blur() // commits (onBlur), and the hotkeys work again
      }}
    >
      <span>BPM</span>
      <input
        aria-label="BPM"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        placeholder={shown || '—'}
        value={text ?? shown}
        onFocus={() => setText('')}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.code !== 'Escape') return
          e.preventDefault() // the popover stays open: the next Esc closes it
          esc.current = true
          e.currentTarget.blur()
        }}
        onBlur={() => {
          const n = Number(text?.replace(',', '.'))
          if (!esc.current && text?.trim() && n > 0) settings.patch({ bpm: n }) // empty or junk: nothing changes
          esc.current = false
          setText(null)
        }}
      />
      <button type="button" title="Halve the BPM · [" onClick={() => press('BracketLeft')}>
        ½
      </button>
      <button type="button" title="Double the BPM · ]" onClick={() => press('BracketRight')}>
        ×2
      </button>
      <button type="button" aria-pressed={!!held} disabled={!held && !shown} title={held ? 'Back to the detected BPM' : 'Hold the tempo at the BPM shown'} onClick={() => settings.patch({ bpm: held ? undefined : Number(shown) })}>
        <Icon name="lock" />
        {held ? 'Unlock' : 'Lock'}
      </button>
    </form>
  )
}
