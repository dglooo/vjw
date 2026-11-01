import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react'
import { settings, src } from '../app'
import { meterGroups, pickToPatch } from '../audio/settings'
import { PRESETS, type PresetId } from '../audio/presets'
import { store } from '../store'

// The meters' sens sliders (S6.2): the meter-group sources minus `wobbleDepth` (a derived depth with no meter) and
// build/drop (features.ts reads no user sens for them).
const SENS_IDS = ['kick', 'snare', 'hats', 'sub', 'reese', 'wobble']

/** The "detected: DnB 0.8" label (S6.2): its own component so the classifier's 4×/s update never re-renders the tab. */
function Detected() {
  const detected = useSyncExternalStore(store.subscribe, () => store.getSnapshot().style.detected)
  const confidence = useSyncExternalStore(store.subscribe, () => store.getSnapshot().style.confidence)
  return <span className="detected">{detected ? `detected: ${PRESETS[detected].name} ${confidence.toFixed(2)}` : 'detected: —'}</span>
}

/** One custom-band field, by name and input type. */
const BAND_FIELDS = [
  ['name', 'name', 'text'],
  ['lo', 'from Hz', 'number'],
  ['hi', 'to Hz', 'number'],
  ['gain', 'gain', 'number'],
  ['gate', 'threshold', 'number'],
  ['attack', 'attack s', 'number'],
  ['release', 'release s', 'number'],
] as const

/** The "+ Custom band" form (S6.2): `addBand`'s error text under it, the form cleared on success. A bad number is
 * refused by the browser (type=number) or by `bandError` (a NaN fails `finite`), so the error stays in the form. */
function BandForm() {
  const [err, setErr] = useState<string | null>(null)
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const msg = settings.addBand({
      name: String(f.get('name')).trim(),
      lo: Number(f.get('lo')),
      hi: Number(f.get('hi')),
      gain: Number(f.get('gain')),
      gate: Number(f.get('gate')),
      attack: Number(f.get('attack')),
      release: Number(f.get('release')),
    })
    setErr(msg)
    if (msg === null) e.currentTarget.reset()
  }
  return (
    <form className="band-form" onSubmit={submit}>
      {BAND_FIELDS.map(([k, label, type]) => (
        <label key={k}>
          <span>{label}</span>
          {/* step=any: the default step of 1 would make 0.2 / 0.01 invalid and block the native submit */}
          <input name={k} type={type} required step="any" autoComplete="off" />
        </label>
      ))}
      <button>+ custom band</button>
      {err && <p className="err">{err}</p>}
    </form>
  )
}

/** The Sources tab (S6.1/S6.2): live meters driven by one rAF loop writing each meter's `value` directly — no React
 * state — with the C8 controls (preset picker, Auto toggle, sens sliders, custom-band form) wired to the `settings`
 * store, so they persist in `vjw.audio`. */
export function SourcesTab() {
  const s = useSyncExternalStore(settings.onChange, settings.get)
  const root = useRef<HTMLDivElement>(null)
  // The loop reads the live `src` every frame, but `els` is captured once per run: restart it when the meter *set*
  // changes (a band added or removed), not on every settings change (a sens drag re-renders but the set is the same).
  const idsKey = meterGroups(s).map((g) => g.title + g.ids.join()).join(' ')
  useEffect(() => {
    const els = root.current?.querySelectorAll<HTMLMeterElement>('[data-src]') ?? []
    let raf = 0
    const loop = () => {
      for (const el of els) el.value = src[el.dataset.src!] ?? 0
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [idsKey])
  // Read at event time, not from the render: a toggle-off must lock the preset that is active *now*.
  const detected = () => store.getSnapshot().style.detected
  const custom = (id: string) => s.custom.find((b) => b.id === id)
  return (
    <div className="sources" ref={root}>
      <div className="pick">
        <select
          aria-label="Preset"
          value={s.pick ?? 'auto'} // follow mode (Locked or not) shows "Auto"; a hand pick shows the pick
          onChange={(e) => settings.patch(pickToPatch('picker', e.currentTarget.value, s, detected()))}
        >
          <option value="auto">Auto</option>
          {(Object.keys(PRESETS) as PresetId[]).map((id) => (
            <option key={id} value={id}>
              {PRESETS[id].name}
            </option>
          ))}
        </select>
        <label className="auto">
          <input
            type="checkbox"
            checked={s.auto}
            onChange={(e) => settings.patch(pickToPatch('toggle', e.currentTarget.checked, s, detected()))}
          />
          <span>Auto-style</span>
        </label>
        <Detected />
      </div>
      {meterGroups(s).map((g) => (
        <section key={g.title} className="sgroup">
          <div className="head">
            <span>{g.title}</span>
          </div>
          {g.ids.map((id) => {
            const band = id.startsWith('u:') ? custom(id) : undefined
            return (
              <div key={id} className="row">
                <span>{band?.name ?? id}</span>
                <meter data-src={id} min={0} max={1} value={0} />
                {(band || (SENS_IDS as readonly string[]).includes(id)) && (
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.05}
                    defaultValue={s.sens[id] ?? 1}
                    aria-label={`sensitivity ${band ? band.name : id}`}
                    onInput={(e) => settings.patch({ sens: { ...s.sens, [id]: e.currentTarget.valueAsNumber } })}
                  />
                )}
                {band && (
                  <button className="x" aria-label={`Remove band ${band.name}`} onClick={() => settings.removeBand(band.id)}>
                    ×
                  </button>
                )}
              </div>
            )
          })}
        </section>
      ))}
      <BandForm />
    </div>
  )
}
