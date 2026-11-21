import { useState, useSyncExternalStore } from 'react'
import { clips } from '../clips'
import { newLayer, newNode } from '../edit'
import { live, panel } from '../gl/live'
import { video } from '../scenes/video'
import { clock, store } from '../store'
import { Icon } from './Pop'

// The clip library's UI (clips.ts): native/video's clip row (E and L), the bar's one-click Allow, and the page's drop.
const FOLDERS = 'showDirectoryPicker' in globalThis // Chrome / Edge; elsewhere only drops
const useRev = () => useSyncExternalStore(clips.onChange, () => clips.rev)

/** native/video's `clip` row: a select over the library + none (a saved name not in it reads "missing"), then the
 *  library: the folder (pick, allow, forget), each clip's name and duration, × on a dropped one. */
export function ClipRow({ value, set }: { value: string; set: (v: string) => void }) {
  useRev()
  const [cur, pick] = useState(value) // the panel never re-renders on a value edit: the row keeps its own
  const list = clips.all()
  return (
    <>
      <label className="row">
        <span>clip</span>
        <select
          value={cur}
          onChange={(e) => {
            pick(e.target.value)
            set(e.target.value)
          }}
        >
          <option value="">none</option>
          {cur && !clips.get(cur) && <option value={cur}>{cur} (missing)</option>}
          {list.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <div className="clips">
        <ClipsFolder />
        {!list.length && <span className="hint">or drop video files here</span>}
        <ul>
          {list.map((c) => (
            <li key={c.name}>
              <span title={c.name}>{c.name}</span> {clock(c.duration)}
              {!c.folder && (
                <button className="x" aria-label={`Remove ${c.name}`} onClick={() => clips.remove(c.name)}>
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

/** The clips folder: pick one, allow the stored one again, forget it (native/video's clip row and the bar's input
 *  popover); with no folder picker (not Chrome / Edge), the drop's hint. */
export function ClipsFolder() {
  useRev()
  const folder = clips.folder()
  const ask = clips.ask()
  if (!FOLDERS) return <span className="hint">Drop video files anywhere</span>
  return (
    <>
      <button title="A folder of your clips: kept for the next visit, never uploaded" onClick={() => void clips.pick()}>
        {folder ? `Folder: ${folder}` : 'Clips folder…'}
      </button>
      {ask && <button onClick={() => void clips.allow()}>Allow «{ask}»</button>}
      {folder && (
        <button className="x" aria-label="Forget the clips folder" onClick={() => void clips.forget()}>
          ×
        </button>
      )}
    </>
  )
}

/** The bar's one click for a stored clips folder that Chrome asks about again; absent otherwise. */
export function AllowClips() {
  const ask = useSyncExternalStore(clips.onChange, clips.ask)
  return ask ? (
    <button title={`Your clips folder «${ask}» from the last visit: one click lets the app read it again`} onClick={() => void clips.allow()}>
      <Icon name="folder" />
      <span className="name">Allow clips «{ask}»</span>
    </button>
  ) : null
}

// Video files dropped anywhere (the stage, E, L) join the clips, and the first plays on the stage scene's first Video
// layer, or on a new top one (below 4 layers). Audio files stay audio/input.ts's (it skips clips).
document.addEventListener('drop', (e) => {
  const names = clips.add(e.dataTransfer?.files ?? [])
  const id = store.getSnapshot().edited
  if (!names.length || !id) return
  e.preventDefault()
  const layer = live(id).doc.layers.findIndex((l) => l.gen.ref === video.id)
  if (layer >= 0) panel.setValues({ layer, node: 'gen' }, { clip: names[0] })
  else panel.insertLayer(newLayer({ ...newNode(video.id, video.bind), values: { clip: names[0] } }))
})
