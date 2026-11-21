import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react'
import { settings, src } from '../app'
import { pickToPatch } from '../audio/settings'
import { PRESETS, type PresetId } from '../audio/presets'
import { PHASES, sourceGroups } from '../bind'
import { store } from '../store'

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

const ANALYSER_HINT = 'ours: our detectors drive every scene. vs2: the donor-style core (visual system 2) drives the syn_* inputs. vs3: the vs3 scenes hear through the friends\' vs3 analyser (kick, onsets, levels, spectrum); every other scene as ours. off · A: no reaction, every scene plays its own look on a steady idle signal (levels at their middle, no hits, no beat grid), a bound input at its slider value; A turns the mode before back on. A hit\'s light stays flash-gated in every mode.'
/** The analyser pick (plan_audio_donor_mode S3.3; 'vs3', audio/vs3.ts): on this tab and in the top bar's audio popover
 *  (AudioMenu), one setting, so the two stay in step. app.ts ramps src.donorMix toward 'donor' in 2 s; 'vs3' switches
 *  the vs3 scenes at once. */
export function AnalyserSelect() {
  const a = useSyncExternalStore(settings.onChange, () => settings.get().analyser)
  return (
    <select
      aria-label="Analyser"
      title={ANALYSER_HINT}
      value={a}
      onChange={(e) => {
        e.currentTarget.blur() // a focused select would eat hotkeys as type-ahead
        settings.patch({ analyser: e.currentTarget.value as typeof a })
      }}
    >
      <option value="ours">ours</option>
      <option value="donor">vs2</option>
      <option value="vs3">vs3</option>
      <option value="off">off</option>
    </select>
  )
}

/** The genre pick (`auto` or a preset id), from the top bar's audio popover and this tab's select: one write through
 *  pickToPatch, and both show `pick ?? 'auto'`, so the two stay in step (SourcesTab.test.ts). */
const pickGenre = (value: string) => settings.patch(pickToPatch('picker', value, settings.get(), store.getSnapshot().style.detected))

const GENRE_HINT = 'The analyser profile per genre (the Sources tab preset): its tempo range and kick/snare knobs. auto follows the detected genre (dnb, dubstep or techno); psy and house are hand picks. A scene with its own genre (E panel) puts its kick/snare knobs and bands in force while it is on stage (the tempo range stays auto\'s); a pick here wins over it.'
const SENS_HINT = 'Kick and snare detector sensitivity for the genre profile: low = fewer hits (thresholds × 1.15), mid = the profile as tuned, high = more hits (× 0.87), more false ones too. A hit\'s light stays flash-gated.'
const ANALYSERS = [['ours', 'ours'], ['donor', 'vs2'], ['vs3', 'vs3'], ['off', 'off']] as const

/** One setting as a row of one-click buttons, the current one pressed. */
function Seg<V extends string>({ label, hint, value, options, set }: { label: string; hint: string; value: V; options: readonly (readonly [V, string])[]; set: (v: V) => void }) {
  return (
    <div className="seg" role="group" aria-label={label} title={hint}>
      <span>{label}</span>
      {options.map(([v, text]) => (
        <button key={v} aria-pressed={v === value} onClick={() => set(v)}>
          {text}
        </button>
      ))}
    </div>
  )
}

/** The top bar's audio popover (user 2026-11-21): the analyser, the genre profile (under auto, the detected genre) and
 *  the detector sensitivity (settings.ts workletBands scales the active preset's kick and snare thresholds), one write
 *  path each with this tab, so the two stay in step. Genre and sensitivity hide while the analyser is off: no scene
 *  hears them then. */
export function AudioMenu() {
  const s = useSyncExternalStore(settings.onChange, settings.get)
  const detected = useSyncExternalStore(store.subscribe, () => store.getSnapshot().style.detected)
  const scene = useSyncExternalStore(store.subscribe, () => store.getSnapshot().sceneGenre)
  return (
    <>
      <Seg label="Analyser" hint={ANALYSER_HINT} value={s.analyser} options={ANALYSERS} set={(analyser) => settings.patch({ analyser })} />
      {s.analyser !== 'off' && (
        <>
          <Seg
            label="Genre"
            hint={GENRE_HINT}
            value={s.pick ?? 'auto'}
            options={[['auto', scene ? `scene: ${scene}` : s.auto && detected ? `auto · ${detected}` : 'auto'], ...(Object.keys(PRESETS) as PresetId[]).map((id) => [id, id] as const)]}
            set={pickGenre}
          />
          <Seg
            label="Sensitivity"
            hint={SENS_HINT}
            value={s.sensitivity ?? 'mid'}
            options={[['low', 'low'], ['mid', 'mid'], ['high', 'high']]}
            set={(v) => settings.patch({ sensitivity: v === 'mid' ? undefined : v })} // mid = no field
          />
        </>
      )}
    </>
  )
}

/** The Sources tab (S6.1/S6.2): live meters driven by one rAF loop writing each meter's `value` directly — no React
 * state — with the C8 controls (preset picker, Auto toggle, custom-band form) and, per source and per group
 * (bind.ts sourceGroups()), a gain slider and a mute (user 2026-11-17) wired to the `settings` store, so they persist
 * in `vjw.audio`. The meters show the sources after gain and mute, as every scene reads them; a count its phase. */
export function SourcesTab() {
  const s = useSyncExternalStore(settings.onChange, settings.get)
  const root = useRef<HTMLDivElement>(null)
  // The loop reads the live `src` every frame, but `els` is captured once per run: restart it when the meter *set*
  // changes (a band added or removed), not on every settings change (a gain drag re-renders but the set is the same).
  const idsKey = sourceGroups(s.custom).map((g) => g.ids.join()).join(' ')
  useEffect(() => {
    const els = root.current?.querySelectorAll<HTMLMeterElement>('[data-src]') ?? []
    let raf = 0
    const loop = () => {
      for (const el of els) {
        const v = src[el.dataset.src!] ?? 0
        el.value = PHASES.includes(el.dataset.src!) ? v % 1 : v
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [idsKey])
  // Read at event time, not from the render: a toggle-off must lock the preset that is active *now*.
  const detected = () => store.getSnapshot().style.detected
  const custom = (id: string) => s.custom.find((b) => b.id === id)
  /** Mutes (on) or unmutes `ids`; settings.patch drops the repeats. */
  const mute = (ids: readonly string[], on: boolean) => settings.patch({ mute: on ? [...s.mute, ...ids] : s.mute.filter((x) => !ids.includes(x)) })
  return (
    <div className="sources" ref={root}>
      <div className="pick">
        <select
          aria-label="Preset"
          value={s.pick ?? 'auto'} // follow mode (Locked or not) shows "Auto"; a hand pick shows the pick
          onChange={(e) => pickGenre(e.currentTarget.value)}
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
            onChange={(e) => settings.patch(pickToPatch('toggle', e.currentTarget.checked, s, detected(), store.getSnapshot().sceneGenre))}
          />
          <span>Auto-style</span>
        </label>
        <Detected />
      </div>
      <label className="row">
        <span>analyser</span>
        <AnalyserSelect />
      </label>
      {sourceGroups(s.custom).map((g) => {
        const all = g.ids.every((id) => s.mute.includes(id))
        const rows = g.ids.map((id) => {
          const band = id.startsWith('u:') ? custom(id) : undefined
          const name = band?.name ?? id
          const off = s.mute.includes(id)
          return (
            <div key={id} className={off ? 'row muted' : 'row'}>
              <span title={name}>{name}</span>
              <meter data-src={id} min={0} max={1} value={0} />
              <input
                type="range"
                min={0}
                max={2}
                step={0.05}
                defaultValue={s.sens[id] ?? 1}
                aria-label={`gain ${name}`}
                onInput={(e) => settings.patch({ sens: { ...s.sens, [id]: e.currentTarget.valueAsNumber } })}
              />
              <button className={off ? 'mute on' : 'mute'} aria-pressed={off} aria-label={`mute ${name}`} onClick={() => mute([id], !off)}>
                M
              </button>
              {band && (
                <button className="x" aria-label={`Remove band ${band.name}`} onClick={() => settings.removeBand(band.id)}>
                  ×
                </button>
              )}
            </div>
          )
        })
        return (
          <section key={g.label} className="sgroup">
            <div className="head">
              <span>{g.label}</span>
              <button className={all ? 'mute on' : 'mute'} aria-pressed={all} aria-label={`mute group ${g.label}`} title={`${all ? 'Unmute' : 'Mute'} every ${g.label} source`} onClick={() => mute(g.ids, !all)}>
                M
              </button>
            </div>
            {g.label === 'band' ? (
              <details>
                <summary>{g.ids.length} bands</summary>
                {rows}
              </details>
            ) : (
              rows
            )}
          </section>
        )
      })}
      <BandForm />
    </div>
  )
}
