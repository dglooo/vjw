import { useEffect, useState, useSyncExternalStore } from 'react'
import { allowDevices, selectDevice, start } from '../audio/input'
import { badge } from '../quality'
import { store } from '../store'
import './overlay.css'

const HIDE_MS = 2500 // knob: the bar fades this long after the last mouse move
const dbfs = (x: number) => Math.max(-60, 20 * Math.log10(x)) // ?debug meters: RMS → dBFS, floor −60
const num = (x: number | null) => (x === null || Number.isNaN(x) ? '–' : x.toFixed(1))

/** Minimal overlay (spec §2.6). Reads the store snapshot only, never per-frame values. */
export function Overlay() {
  const s = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const [shown, setShown] = useState(true)
  const d = s.debug
  const c = s.debugSync

  useEffect(() => {
    let timer = setTimeout(() => setShown(false), HIDE_MS)
    const wake = () => {
      setShown(true)
      clearTimeout(timer)
      timer = setTimeout(() => setShown(false), HIDE_MS)
    }
    addEventListener('mousemove', wake)
    return () => {
      removeEventListener('mousemove', wake)
      clearTimeout(timer)
    }
  }, [])

  return (
    <>
      <div className={shown ? 'bar' : 'bar hidden'}>
        <select
          value={s.source?.kind === 'device' ? s.source.id : ''}
          onFocus={() => {
            if (!s.devices.length) void allowDevices() // first open: the permission prompt, then labels appear
          }}
          onChange={(e) => {
            e.target.blur() // a focused select would eat hotkeys as type-ahead
            void selectDevice(e.target.value)
          }}
        >
          <option value="" disabled>
            {s.devices.length ? 'Audio input…' : 'Allow audio input…'}
          </option>
          {s.devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
        <span className="hint">{s.source?.kind === 'file' ? `▶ ${s.source.name}` : 'Drop an audio file anywhere'}</span>
        {s.compiling && <span className="hint">{s.compiling}</span>}
        <span className="scene">{s.sceneName}</span>
        {s.bpm > 0 && <span className={s.confident ? 'bpm' : 'bpm unsure'}>BPM {s.bpm.toFixed(1)}</span>}
        {s.hold && <span className="lock">Lock</span>}
        <span className="quality">{badge(s)}</span>
        {s.recording && <span className="rec">REC</span>}
      </div>
      {d && (
        <div className="debug">
          {(['l', 'r'] as const).map((ch) => (
            <div key={ch}>
              {ch.toUpperCase()} <meter min={-60} max={0} value={dbfs(d[ch])} /> {dbfs(d[ch]).toFixed(0)} dBFS
            </div>
          ))}
          {c && (
            <div>
              beat |grid − onset| {num(c.med)} / p95 {num(c.p95)} ms · confident after {num(c.toConfident)} s · conf{' '}
              {c.confidence.toFixed(2)}
            </div>
          )}
          {c && (
            <div className="hits">
              hits kick {c.hits.kick} · snare {c.hits.snare} · hats {c.hits.hats}
            </div>
          )}
          {c && (
            <div className="hits">
              {Object.entries(c.bands).map(([id, v]) => (
                <span key={id}>
                  {id} <meter min={0} max={1} value={v} /> {v.toFixed(2)}{' '}
                </span>
              ))}
            </div>
          )}
          <pre>{JSON.stringify(d.settings, null, 1)}</pre>
        </div>
      )}
      {s.needsStart && (
        <button className="start" onClick={() => void start()}>
          Start
        </button>
      )}
    </>
  )
}
