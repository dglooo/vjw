import { useEffect, useReducer, useRef, useState, useSyncExternalStore, type ButtonHTMLAttributes, type ComponentProps, type KeyboardEvent, type PointerEvent } from 'react'
import { director, meter, setEditor, setShader, settings } from '../app'
import { allowDevices, player, selectDevice, start, togglePlay } from '../audio/input'
import { FLOOR } from '../audio/meter'
import { allowCameras, selectCamera, setVideo } from '../camera/camera'
import { panel } from '../gl/live'
import { library } from '../library'
import { badge } from '../quality'
import { showText } from '../scenes/text'
import { clock, store, type UiSnapshot } from '../store'
import { Analysis } from './Analysis'
import { AutoChip } from './Autopilot'
import { audioSummary, inputLabel, press } from './bar'
import { Bpm } from './Bpm'
import { AllowClips, ClipsFolder } from './Clips'
import { Midi } from './Midi'
import { Icon, Pop } from './Pop'
import { Presets } from './Presets'
import { SetMenu } from './SetList'
import { AudioMenu } from './SourcesTab'
import './overlay.css'

const HIDE_MS = 2500 // knob: the bar fades this long after the last mouse move or key press
const dbfs = (x: number) => Math.max(-60, 20 * Math.log10(x)) // ?debug meters: RMS → dBFS, floor −60
const num = (x: number | null) => (x === null || Number.isNaN(x) ? '–' : x.toFixed(1))
const CLIPPING = 'Input clipping: lower the mixer gain'
// plan_camera S1.4: a failed pick's text by its DOMException name; any other name reads "Camera unavailable".
// ⚠️ G9: the Windows path is unverified (the user confirms it at the CP2 close).
const CAM_FAIL = new Map([
  ['NotAllowedError', 'Allow the camera in Chrome (the lock icon) and in the OS privacy settings: macOS System Settings → Privacy & Security → Camera; Windows Settings → Privacy & security → Camera'],
  ['NotReadableError', 'Camera in use by another app'],
  ['NotFoundError', 'No camera found: connect one and choose Camera… again'],
])
/** The camera's trouble: a failed pick, else the mask host's failure while a source plays; '' when all is well. */
const camLine = (s: UiSnapshot) =>
  s.camFail
    ? (CAM_FAIL.get(s.camFail) ?? `Camera unavailable (${s.camFail}): choose another`)
    : s.camLive && s.camError
      ? s.camError.startsWith('Model missing')
        ? s.camError
        : `Camera mask stopped (${s.camError}), retrying`
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
/** A focused control eats the hotkeys (app.ts skips keys aimed at a field, and Space presses a focused button), and
 *  Chrome focuses a clicked button: a click lets go of it. A text field and a select keep it (typing, picking). */
const release = (e: PointerEvent) => {
  const t = e.target
  if (t instanceof HTMLSelectElement || (t instanceof HTMLInputElement && t.type !== 'range')) return
  ;(document.activeElement as HTMLElement | null)?.blur()
}
/** Space or Enter on a button reached by Tab presses that button only: app.ts's Space (the hold) waits. */
const own = (e: KeyboardEvent) => {
  if ((e.code === 'Space' || e.code === 'Enter') && e.target instanceof HTMLButtonElement) e.stopPropagation()
}

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
      <button className="icon" title="Play / pause · P" aria-label={player.paused ? 'Play' : 'Pause'} onClick={togglePlay}>
        <Icon name={player.paused ? 'play' : 'pause'} />
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

/** A tool: its icon, its name (hidden on a narrow screen, the icon left) and its key. */
function Tool({ icon, label, k, className = 'tool', ...b }: { icon: ComponentProps<typeof Icon>['name']; label: string; k: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={className} aria-keyshortcuts={k} {...b}>
      <Icon name={icon} />
      <span className="label">{label}</span>
      <kbd>{k}</kbd>
    </button>
  )
}

/** The scene's preset (gl/live.ts presetNode): its name opens the browser (W), ★ stars it (the browser's favourites).
 *  None on a scene without presets. */
function PresetChip({ browse }: { browse: boolean }) {
  const favs = useSyncExternalStore(library.onChange, library.presetFavs)
  const t = panel.presetNode()
  if (!t) return null
  const now = t.now // undefined: custom
  const fav = !!now && (favs[t.ref]?.includes(now.name) ?? false)
  return (
    <>
      <i className="sep" />
      <button className="chip preset" aria-pressed={browse} title="Presets: the looks of this scene · W · ↑ ↓ step" onClick={() => store.patch({ browse: !browse })}>
        <Icon name="grid" />
        <span className="name">{now?.name ?? 'custom'}</span>
      </button>
      <button
        className="icon star"
        aria-pressed={fav}
        disabled={!now}
        aria-label="Favourite preset"
        title={now ? `${fav ? 'Unstar' : 'Star'} «${now.name}» (★ favourites in the browser)` : 'Pick a preset to star it'}
        onClick={() => library.setPresetFav(t.ref, now!.name, !fav)}
      >
        <Icon name="star" />
      </button>
    </>
  )
}

/** The overlay (spec §2.6): the top bar's five groups, left to right: the input, the scene, the audio analysis, the
 *  tools, the status (user 2026-11-21: «покрасивее, поудобнее, user-friendly»). A chip opens its popover; every action
 *  keeps its key (app.ts) and MIDI pad. Reads the store snapshot only, never per-frame values (but Level's own loop). */
export function Overlay() {
  const s = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const a = useSyncExternalStore(settings.onChange, settings.get)
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
  const dev = s.source?.kind === 'device' ? s.source.id : null
  const hot = s.clipHint && dev !== null // clips spread over > 1 s on line-in: the mixer's gain is too high
  const bpm = a.bpm ?? s.bpm
  return (
    <>
      <div className={shown ? 'bar top' : 'bar top hidden'} onPointerUp={release} onKeyDown={own}>
        <div className="group src" role="group" aria-label="Input">
          <Pop
            id="pop-input"
            className={s.clip ? 'chip input clipping' : 'chip input'}
            title={hot ? CLIPPING : `${inputLabel(s)}${s.clip ? ' · CLIP: a peak at full scale' : ''} · audio input, camera, clips`}
            label={
              <>
                <Icon name={s.source?.kind === 'file' ? 'note' : 'wave'} />
                <span className={hot ? 'name warn' : 'name'}>{hot ? 'Lower the mixer gain' : inputLabel(s)}</span>{' '}
                {s.source && <Level />}{' '}
                {s.source && <span className={s.clip ? 'clip on' : 'clip'}>CLIP</span>}
                {(s.camera || line) && (
                  <span className={line ? 'cam warn' : 'cam'}>
                    <Icon name="cam" />
                  </span>
                )}
              </>
            }
          >
            <h3>Audio input</h3>
            {s.devices.length ? (
              s.devices.map((x) => (
                <button key={x.id} className="opt" aria-pressed={x.id === dev} onClick={() => x.id !== dev && void selectDevice(x.id)}>
                  <Icon name="check" />
                  {x.label}
                </button>
              ))
            ) : (
              <button onClick={() => void allowDevices()}>Allow audio input…</button>
            )}
            {hot && (
              <p className="err" role="status">
                {CLIPPING}
              </p>
            )}
            <p className="hint">{s.source?.kind === 'file' ? `Playing ${s.source.name}` : 'Or drop an audio file anywhere'}</p>
            <h3>Camera</h3>
            {!s.cameras.length && <button onClick={() => void allowCameras()}>Allow camera…</button>}
            {[{ id: 'off', label: 'Off' }, ...s.cameras].map((x) => {
              const on = x.id === 'off' ? !s.camera : s.camera?.kind === 'device' && s.camera.id === x.id
              return (
                <button key={x.id} className="opt" aria-pressed={on} onClick={() => !on && void selectCamera(x.id)}>
                  <Icon name="check" />
                  {x.label}
                </button>
              )
            })}
            <button className="opt" aria-pressed={s.camera?.kind === 'file'} onClick={() => file.current?.click()}>
              <Icon name="check" />
              {s.camera?.kind === 'file' ? `Video file: ${s.camera.name}` : 'Video file…'}
            </button>
            {line && (
              <p className="err" role="status">
                {line}
              </p>
            )}
            {s.camLive && (
              // Decision 1: hides the camera picture only, the masks keep working; session-only
              <button aria-pressed={s.camVideo} onClick={() => setVideo(!s.camVideo)}>
                Camera picture {s.camVideo ? 'shown' : 'hidden'}
              </button>
            )}
            <h3>Clips</h3>
            <span className="line">
              <ClipsFolder />
            </span>
          </Pop>
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
          <AllowClips />
        </div>

        <div className="group deck" role="group" aria-label="Scene">
          <button className="icon" aria-label="Previous scene" title="Previous scene · ←" onClick={() => director.prev()}>
            <Icon name="left" />
          </button>
          <span className="name" title={s.sceneName}>
            {s.sceneName || '—'}
          </span>
          <button className="icon" aria-label="Next scene" title="Next scene · →" onClick={() => director.next()}>
            <Icon name="right" />
          </button>
          <PresetChip browse={s.browse} />
          <i className="sep" />
          <AutoChip />
          <button className="icon" aria-pressed={s.hold} aria-label="Hold the scene" title="Hold this scene: the autopilot waits · Space" onClick={() => press('Space')}>
            <Icon name="lock" />
          </button>
        </div>

        <div className="group audio" role="group" aria-label="Audio">
          <Pop
            id="pop-audio"
            className={a.analyser === 'off' ? 'chip on' : 'chip'}
            title="The analysis: analyser, genre profile, sensitivity, BPM"
            label={
              <>
                <Icon name="sliders" />
                <span className="name">{audioSummary(a, s.style.detected, s.sceneGenre)}</span>{' '}
                <span className={a.bpm ? 'bpm held' : s.confident ? 'bpm' : 'bpm unsure'}>
                  {bpm > 0 ? Math.round(bpm) : '—'} <small>BPM</small>
                  {a.bpm && <Icon name="lock" />}
                </span>
              </>
            }
          >
            <AudioMenu />
            <Bpm />
          </Pop>
        </div>

        <div className="group" role="group" aria-label="Tools">
          <SetMenu />
          <Midi />
          <Tool icon="text" label="Text" k="X" className="tool text" aria-pressed={s.text} title="Every text layer on / off · X" onClick={() => showText(!s.text)} />
          <Tool icon="chart" label="Analysis" k="Y" aria-pressed={s.analysisView} title="What the analyser heard over the last 30 s · Y" onClick={() => store.patch({ analysisView: !s.analysisView })} />
          <Tool icon="layers" label="Editor" k="L" title="The scene editor · L" onClick={() => setEditor(true)} />
          <Tool icon="code" label="Shader" k="G" title="The shader editor · G" onClick={() => setShader(true)} />
          <Tool icon="rec" label="REC" k="R" className={s.recording ? 'tool rec on' : 'tool rec'} aria-pressed={s.recording} title={s.recording ? 'Stop recording · R' : 'Record the output to a video file · R'} onClick={() => press('KeyR')} />
        </div>

        <div className="group status" title="Q cycles the quality: 60A adaptive · 60F full · 30 fps; then the render scale and the frames dropped">
          {s.compiling && <span>{s.compiling}</span>}
          <span>{badge(s)}</span>
        </div>
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
      <Presets />
      <Analysis />
      {s.needsStart && (
        <button className="start" onClick={() => void start()}>
          Start
        </button>
      )}
    </>
  )
}
