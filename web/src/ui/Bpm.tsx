import { useState, useSyncExternalStore } from 'react'
import { settings } from '../app'
import { store } from '../store'

const HINT = 'Type a BPM to hold the tempo there, with no auto-fill (a DJ mix holds a static BPM). T ×4 retaps it, [ ] halve / double it. auto: back to the detected BPM.'

/** The manual BPM lock (user 2026-11-20): a typed BPM holds the tempo (sync.ts setManual) until "auto" clears it.
 *  Unlocked, the field shows the live auto BPM, dim while unsure; locked, the held value behind a 🔒. Stored in
 *  vjw.audio (app.ts), so a reload keeps it. Focused, the field empties (the value stays as its placeholder): leaving
 *  it untouched changes nothing, a number locks on Enter or blur. */
export function Bpm() {
  const held = useSyncExternalStore(settings.onChange, () => settings.get().bpm)
  const bpm = useSyncExternalStore(store.subscribe, () => store.getSnapshot().bpm)
  const sure = useSyncExternalStore(store.subscribe, () => store.getSnapshot().confident)
  const [text, setText] = useState<string | null>(null) // while focused: the typed text, which the 4×/s BPM never overwrites
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
      <label>
        {held ? '🔒' : 'BPM'}
        <input
          aria-label="BPM"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          placeholder={shown || '—'}
          value={text ?? shown}
          onFocus={() => setText('')}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            const n = Number(text?.replace(',', '.'))
            if (text?.trim() && n > 0) settings.patch({ bpm: n }) // empty or junk: nothing changes
            setText(null)
          }}
        />
      </label>
      {held && (
        <button type="button" onClick={() => settings.patch({ bpm: undefined })}>
          auto
        </button>
      )}
    </form>
  )
}
