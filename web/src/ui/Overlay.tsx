import { useEffect, useReducer, useRef, useState, useSyncExternalStore } from 'react'
import { meter, setEditor, setShader } from '../app'
import { allowDevices, player, selectDevice, start, togglePlay } from '../audio/input'
import { FLOOR } from '../audio/meter'
import { allowCameras, selectCamera, setVideo } from '../camera/camera'
import { badge } from '../quality'
import { Bpm } from './Bpm'
import { Midi } from './Midi'
import { showText } from '../scenes/text'
import { PresetSelect } from './Panel'
import { AnalyserSelect } from './SourcesTab'
import { clock, store, type UiSnapshot } from '../store'
import './overlay.css'

const HIDE_MS = 2500 // knob: the bar fades this long after the last mouse move or key press
const dbfs = (x: number) => Math.max(-60, 20 * Math.log10(x)) // ?debug meters: RMS → dBFS, floor −60
const num = (x: number | null) => (x === null || Number.isNaN(x) ? '–' : x.toFixed(1))
// plan_camera S1.4: a failed pick's text by its DOMException name; any other name reads "Camera unavailable".
// ⚠️ G9: the Windows path is unverified (the user confirms it at the CP2 close).
const CAM_FAIL = new Map([
  ['NotAllowedError', 'Allow the camera in Chrome (the lock icon) and in the OS privacy settings: macOS System Settings → Privacy & Security → Camera; Windows Settings → Privacy & security → Camera'],
  ['NotReadableError', 'Camera in use by another app'],
  ['NotFoundError', 'No camera found: connect one and choose Camera… again'],
])
/** The camera line: a failed pick, else the mask host's failure while a source plays, else a clip's name. */
const camLine = (s: UiSnapshot) =>
  s.camFail
    ? (CAM_FAIL.get(s.camFail) ?? `Camera unavailable (${s.camFail}): choose another`)
    : s.camLive && s.camError
      ? s.camError.startsWith('Model missing')
        ? s.camError
        : `Camera mask stopped (${s.camError}), retrying`
      : s.camera?.kind === 'file'
        ? `▶ ${s.camera.name}`
        : ''

/** The input meter (dsp_linein_2026-11-16 fix 5): app.ts `meter`'s held peak, written by one rAF loop with no React
 *  state (as the Sources tab's meters). <meter>'s low/high/optimum colour it: green under −6 dBFS, amber to −3, red. */
function Level() {
  const bar = useRef<HTMLMeterElement>(null)
  const num = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let raf = 0
    const loop = () => {
      const db = Math.round(meter.db)
      const t = `${db > 0 ? '+' : ''}${db} dBFS` // over full scale: a file's float, a resampled input's overs
      bar.current!.value = meter.db
      if (num.current!.textContent !== t) num.current!.textContent = t
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <span className="level">
      <meter ref={bar} aria-label="Input level" min={FLOOR} max={0} low={-6} high={-3} optimum={FLOOR} />
      <span ref={num} />
    </span>
  )
}

const EVENTS = ['timeupdate', 'durationchange', 'play', 'pause', 'emptied'] as const
/** A focused control eats the hotkeys (app.ts skips keys aimed at an input), and Chrome focuses a clicked button. */
const release = () => (document.activeElement as HTMLElement | null)?.blur()

/** The file transport: −10 s, play / pause, +10 s, the scrub bar and the time (keys: app.ts `-` `P` `=`). Its own
 *  render on the player's events (timeupdate ≈ 4 Hz while playing), so nothing else re-renders on the clock. */
function Transport() {
  const [, tick] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    for (const e of EVENTS) player.addEventListener(e, tick)
    return () => EVENTS.forEach((e) => player.removeEventListener(e, tick))
  }, [])
  const d = player.duration
  return (
    <>
      <button title="−10 s · −" onClick={() => (player.currentTime -= 10)}>
        −10
      </button>
      <button title="Play / pause · P" aria-label={player.paused ? 'Play' : 'Pause'} onClick={togglePlay}>
        {player.paused ? '▶' : '❚❚'}
      </button>
      <button title="+10 s · =" onClick={() => (player.currentTime += 10)}>
        +10
      </button>
      <input
        type="range"
        aria-label="Position"
        min={0}
        max={Number.isFinite(d) ? d : 0}
        step="any"
        value={player.currentTime}
        onChange={(e) => {
          player.currentTime = +e.target.value // a scrub: one seek per move
          tick() // the controlled thumb stays where it was dragged
        }}
      />
      <span className="time">
        {clock(player.currentTime)} / {clock(d)}
      </span>
    </>
  )
}

/** Minimal overlay (spec §2.6). Reads the store snapshot only, never per-frame values (but Level's own loop). */
export function Overlay() {
  const s = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const [shown, setShown] = useState(true)
  const file = useRef<HTMLInputElement>(null) // "Video file…": the camera source from a clip
  const line = camLine(s)
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
    addEventListener('keydown', wake)
    return () => {
      removeEventListener('mousemove', wake)
      removeEventListener('keydown', wake)
      clearTimeout(timer)
    }
  }, [])

  // The editor screens have the whole window (2b S1) but the file transport, docked under them (user 2026-11-20)
  if (s.editor || s.shader)
    return s.source?.kind === 'file' ? (
      <div className="bar transport docked" onPointerUp={release}>
        <Transport />
      </div>
    ) : null
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
        {s.source && <Level />}
        {s.source && <span className={s.clip ? 'clip on' : 'clip'}>CLIP</span>}
        {s.clipHint && s.source?.kind === 'device' ? (
          <span className="hint warn" role="status">
            input clipping — lower the mixer gain
          </span>
        ) : (
          <span className="hint">{s.source?.kind === 'file' ? `▶ ${s.source.name}` : 'Drop an audio file anywhere'}</span>
        )}
        <select
          aria-label="Camera"
          value={s.camera?.kind === 'device' ? s.camera.id : ''}
          onFocus={() => {
            if (!s.cameras.length) void allowCameras() // first open: the permission prompt, then labels appear
          }}
          onChange={(e) => {
            e.target.blur()
            if (e.target.value === 'file') file.current?.click()
            else void selectCamera(e.target.value) // 'off' or a device id
          }}
        >
          <option value="" disabled>
            {s.cameras.length ? 'Camera…' : 'Allow camera…'}
          </option>
          <option value="off">Off</option>
          {s.cameras.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
          <option value="file">Video file…</option>
        </select>
        <input
          ref={file}
          type="file"
          accept="video/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = '' // the same clip can be picked again
            if (f) void selectCamera(f)
          }}
        />
        {line && (
          <span className="hint" role="status">
            {line}
          </span>
        )}
        {s.camLive && (
          // Decision 1: hides the camera picture only, the masks keep working; session-only
          <button aria-pressed={s.camVideo} onClick={() => setVideo(!s.camVideo)}>
            Video
          </button>
        )}
        {s.compiling && <span className="hint">{s.compiling}</span>}
        <span className="scene">{s.sceneName}</span>
        <PresetSelect />
        <AnalyserSelect />
        <Midi />
        <button aria-pressed={s.text} title="Every text layer on / off · X" onClick={() => showText(!s.text)}>
          Text
        </button>
        <button onClick={() => setEditor(true)}>Editor · L</button>
        <button onClick={() => setShader(true)}>Shader · G</button>
        <Bpm />
        {s.hold && <span className="lock">Lock</span>}
        <span className="quality">{badge(s)}</span>
        {s.recording && <span className="rec">REC</span>}
      </div>
      {s.source?.kind === 'file' && (
        // a second bar at the bottom, fading with the top one: hidden, it neither shows nor takes the pointer
        <div className={shown ? 'bar transport' : 'bar transport hidden'} onPointerUp={release}>
          <Transport />
        </div>
      )}
      {d && (
        <div className="debug">
          {(['l', 'r'] as const).map((ch) => (
            <div key={ch}>
              {ch.toUpperCase()} <meter min={-60} max={0} value={dbfs(d[ch])} /> {dbfs(d[ch]).toFixed(0)} dBFS
            </div>
          ))}
          <div>audio underruns {d.underruns ?? 'n/a'}</div>
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
