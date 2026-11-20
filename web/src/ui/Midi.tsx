import { useEffect, useSyncExternalStore } from 'react'
import { live, panel } from '../gl/live'
import { library } from '../library'
import { createMidi, KEYS, paramId, type Control, type Target } from '../midi'
import { store } from '../store'

/** The app's MIDI (midi.ts). The mappings live in library.ts (vjw.midi, the dev mirror, the build's bake). A knob sets
 *  its input on the scene on stage through the panel, as the slider does, and moves the slider if one is shown; a pad
 *  presses its hotkey (app.ts), so it does what the key does, on the editor screens too. */
const midi = createMidi(
  { load: library.midi, save: library.setMidi },
  {
    scene: () => store.getSnapshot().edited,
    param(t, v) {
      const l = live(t.scene).doc.layers[t.layer]
      if (!l || (typeof t.node === 'number' && !l.fx[t.node])) return // its node went (a structural edit): the knob waits
      panel.setValue({ layer: t.layer, node: t.node }, t.input, v)
      const el = document.querySelector<HTMLInputElement>(`[data-midi="${CSS.escape(paramId(t))}"]`)
      if (el) el.value = String(v)
    },
    key: (code) => dispatchEvent(new KeyboardEvent('keydown', { code })),
  },
)
library.onChange(midi.load) // the dev mirror's mappings come back after a browser data wipe (library.load)

// Learn mode: a click on a slider Panel.tsx tagged (data-midi, in E and L) arms it instead of moving it; Esc ends learn.
addEventListener(
  'pointerdown',
  (e) => {
    const el = midi.get().learn && e.target instanceof Element ? e.target.closest<HTMLInputElement>('[data-midi]') : null
    if (!el) return
    e.preventDefault()
    e.stopPropagation()
    const [layer, node, ...input] = el.dataset.midi!.split('/')
    const { edited, sceneName } = store.getSnapshot()
    const name = el.closest('.row')?.firstElementChild?.textContent ?? input.join('/')
    midi.arm({ kind: 'param', scene: edited, layer: +layer, node: /^\d+$/.test(node) ? +node : (node as 'gen' | 'layer'), input: input.join('/'), lo: +el.min, hi: +el.max, label: `${name} · ${sceneName}` })
  },
  true,
)
addEventListener(
  'keydown',
  (e) => {
    if (e.code !== 'Escape' || !midi.get().learn) return
    e.stopPropagation() // before app.ts: Esc ends learn and leaves the panel open
    midi.setLearn(false)
  },
  true,
)

const ctlText = (c: Control) => `${c.kind === 'cc' ? 'CC' : 'pad'} ${c.num} · ch ${c.ch}`
const targetText = (t: Target) => (t.kind === 'key' ? KEYS[t.code] : t.label)

/** The top bar's MIDI menu: on / off (the permission prompt, on the first on only), the inputs, learn with the pad
 *  actions, and the mappings (delete, clear all). Its summary names the armed target, so the menu can close while a
 *  slider in E or L is learnt. */
export function Midi() {
  const s = useSyncExternalStore(midi.onChange, midi.get)
  useEffect(() => void document.documentElement.classList.toggle('midi-learn', s.learn), [s.learn])
  return (
    <details className="midi" onPointerUp={() => (document.activeElement as HTMLElement | null)?.blur()}>
      <summary>{!s.on ? 'MIDI' : s.learn ? (s.armed ? `learn: ${targetText(s.armed)}…` : 'MIDI learn') : `MIDI · ${s.inputs.join(', ') || 'no device'}`}</summary>
      <div className="menu">
        <span className="line">
          <button aria-pressed={s.on} onClick={() => (s.on ? midi.stop() : void midi.start(() => navigator.requestMIDIAccess()))}>
            {s.on ? 'MIDI on' : 'MIDI off'}
          </button>
          <button aria-pressed={s.learn} disabled={!s.on} onClick={() => midi.setLearn(!s.learn)}>
            learn
          </button>
        </span>
        {s.error && <p className="err">{s.error}</p>}
        {s.learn && (
          <>
            <p className="hint">{s.armed ? (s.armed.kind === 'param' ? 'move a knob or a fader' : 'hit a pad') : 'click a slider in E or L, or an action · Esc ends'}</p>
            <span className="line actions">
              {Object.entries(KEYS).map(([code, label]) => (
                <button key={code} className={s.armed?.kind === 'key' && s.armed.code === code ? 'on' : undefined} onClick={() => midi.arm({ kind: 'key', code })}>
                  {label}
                </button>
              ))}
            </span>
          </>
        )}
        {s.maps.map((m, i) => (
          <span key={i} className="line map">
            {ctlText(m.ctl)} → {targetText(m.target)}
            <button aria-label="Delete mapping" onClick={() => midi.remove(i)}>
              ×
            </button>
          </span>
        ))}
        {s.maps.length > 0 && <button onClick={() => midi.clear()}>clear all</button>}
      </div>
    </details>
  )
}
