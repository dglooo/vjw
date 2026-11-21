import { useEffect, useSyncExternalStore } from 'react'
import { catalog } from '../fx/catalog'
import { live, panel } from '../gl/live'
import { library } from '../library'
import { createMidi, KEYS, paramId, type Control, type Target } from '../midi'
import { store } from '../store'
import { Icon, Pop } from './Pop'

/** The layers of the scene on stage; none before Start. */
function stage() {
  const id = store.getSnapshot().edited
  return id ? live(id).doc.layers : []
}

/** The app's MIDI (midi.ts). The mappings live in library.ts (vjw.midi, the dev mirror, the build's bake). A knob sets
 *  its input on the scene on stage through the panel, as the slider does, and moves the slider if one is shown; a pad
 *  presses its hotkey (app.ts), so it does what the key does, on the editor screens too. A look knob (a vs3 native's
 *  group 'look') is learnt as '*': it follows the vs3 scene on stage (midi.ts). */
const midi = createMidi(
  { load: library.midi, save: library.setMidi },
  {
    scene: () => store.getSnapshot().edited,
    layers: stage,
    param(t, v) {
      const l = stage()[t.layer] // the scene on stage: t's own, or its first vs3 native's layer for '*'
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
    const [l, n, ...rest] = el.dataset.midi!.split('/')
    const { edited, sceneName } = store.getSnapshot()
    const layer = +l, node = /^\d+$/.test(n) ? +n : (n as 'gen' | 'layer'), input = rest.join('/')
    const name = el.closest('.row')?.firstElementChild?.textContent ?? input
    const ld = stage()[layer], ref = node === 'gen' ? ld?.gen.ref : node === 'layer' ? undefined : ld?.fx[node]?.ref
    const look = !!ref && !!catalog.get(ref)?.inputs.some((x) => x.name === input && x.group === 'look') // C7: it follows the stage
    midi.arm({ kind: 'param', scene: look ? '*' : edited, layer, node, input, lo: +el.min, hi: +el.max, label: `${name} · ${look ? 'any vs3 scene' : sceneName}` })
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

/** The top bar's MIDI menu (a popover): on / off (the permission prompt, on the first on only), the inputs, learn with
 *  the pad actions, and the mappings (delete, clear all). Its button names the armed target, so the menu can close
 *  while a slider in E or L is learnt (a click there closes it). */
export function Midi() {
  const s = useSyncExternalStore(midi.onChange, midi.get)
  useEffect(() => void document.documentElement.classList.toggle('midi-learn', s.learn), [s.learn])
  const label = !s.on ? 'MIDI' : s.learn ? (s.armed ? `learn: ${targetText(s.armed)}…` : 'MIDI learn') : `MIDI · ${s.inputs.join(', ') || 'no device'}`
  return (
    <Pop
      id="pop-midi"
      className={s.on ? 'tool on' : 'tool'}
      title={label}
      label={
        <>
          <Icon name="midi" />
          <span className="label">{label}</span>
        </>
      }
    >
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
    </Pop>
  )
}
