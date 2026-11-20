// The shader editor (user 2026-11-19, after the friends' vs3 `renderer/web/shader-editor.js`; key G or the bar button):
// a code panel docked left, the live picture beside it. Typing compiles once the keys rest; a good shader plays at
// once, a bad one lists its errors by line and the last good one keeps playing. Cmd/Ctrl+Enter runs now, Esc closes,
// and keys typed here never reach the app's shortcuts. It edits the scene on stage when its bottom layer plays a
// Shadertoy (`toy/…`, so G on a saved one opens its code again), else a new draft (edit.newShader). Star, Save and
// Save as… are the editor's (L): a saved shader is a user scene as any other. Export downloads the code as a .glsl file
// (shaderfile.ts: a header, then the code); Import, or a .glsl dropped on the panel, loads one back (user 2026-11-20).
// In dev the open editor also answers the AI channel (vite.config.ts aiChannel, docs/ai-shader-guide.md), and Import
// lists the AI's exports (web/user-shaders/).
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react'
import { director, setShader } from '../app'
import type { SceneId } from '../doc'
import * as edit from '../edit'
import { toyErrors } from '../fx/glsl'
import { fitStage, stage } from '../gl/engine'
import { live, panel } from '../gl/live'
import { download, library } from '../library'
import { readShader, safeName, writeShader } from '../shaderfile'
import { store } from '../store'
import { SceneHead, type Say } from '../ui/Panel'
import './editor.css'

const files = import.meta.glob('./shaders/*.glsl', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
/** The examples menu by name (the file stem, spaced): `new` (ours) first, then the friends' MIT / CC0 picks, each
 *  naming its source and credit in its first lines. */
const EXAMPLES = new Map(
  Object.entries(files)
    .map(([path, src]) => [path.slice('./shaders/'.length, -'.glsl'.length).replace(/-/g, ' '), src] as const)
    .sort(([a], [b]) => Number(b === 'new') - Number(a === 'new') || a.localeCompare(b)),
)
const NEW = EXAMPLES.get('new')!
const REST_MS = 700 // knob: typing compiles once the keys rest this long (the friends' value)
/** A comment's `Credit: …` in the code: the node's credit (an example's names its authors and licence). */
const creditOf = (code: string) => /^\s*\/\/.*?Credit: (.+)$/m.exec(code)?.[1].trim()
type Errs = { line: number; msg: string }[]
type Ask = { id: number; what: 'push' | 'state'; code?: string; name?: string } // the AI channel's (vite.config.ts)
const STILL_MS = 1500 // knob: the AI channel's still, this long after a good compile (the picture has moved by then)
const STILL_W = 640 // px: its width at most
/** The stage as a PNG data URL ≤ STILL_W wide, drawn in the next frame just after the app's draw: the stage keeps no
 *  drawing buffer (preserveDrawingBuffer off), so outside that frame it reads blank. */
const still = () =>
  new Promise<string>((done) =>
    requestAnimationFrame(() => {
      const k = Math.min(1, STILL_W / stage.width)
      const c = Object.assign(document.createElement('canvas'), { width: Math.round(stage.width * k), height: Math.round(stage.height * k) })
      c.getContext('2d')!.drawImage(stage, 0, 0, c.width, c.height)
      done(c.toDataURL('image/png'))
    }),
  )

export function Shader() {
  const on = useSyncExternalStore(store.subscribe, () => store.getSnapshot().shader)
  const id = useSyncExternalStore(store.subscribe, () => store.getSnapshot().edited)
  return on && id ? <Open id={id} /> : null
}

function Open({ id }: { id: SceneId }) {
  const { doc } = live(id)
  const code = edit.toyCode(doc) // undefined: no Shadertoy on stage yet (the draft lands on the next frame)
  const [first] = useState(() => code ?? NEW) // the text it opens on: the draft plays NEW too
  const [lines, setLines] = useState(() => first.split('\n').length)
  const [errs, setErrs] = useState<Errs | null>(null) // null: nothing compiled yet
  const [files, setFiles] = useState<string[]>([]) // dev: web/user-shaders/, newest first (GET /__ai/list)
  const [note, setNote] = useState<{ text: string; err: boolean }>()
  const say: Say = (err, what, done) => setNote(err ? { text: `${what}: ${err}`, err: true } : { text: done, err: false })
  const ta = useRef<HTMLTextAreaElement>(null)
  const gutter = useRef<HTMLPreElement>(null)
  const cell = useRef<HTMLDivElement>(null)
  const timer = useRef(0) // a compile waiting for the keys to rest
  const credit = useRef(code === undefined ? '' : (doc.layers[0].gen.credit ?? '')) // an example's, or the scene's
  const author = useRef<'AI' | 'user'>('user') // who changed the field last: an export's header
  const last = useRef<Errs>([]) // the last compile's errors (the AI channel's state)
  const file = useRef<HTMLInputElement>(null)
  const drafted = useRef(false)
  useLayoutEffect(() => fitStage(cell.current!), [])
  // The opening text through the ref, not defaultValue: React writes a textarea's defaultValue (its text child) after
  // every input event, and that DOM write split the field's undo into single characters and broke its redo (Chrome).
  useLayoutEffect(() => void (ta.current!.value = first), [first])
  useEffect(() => {
    // A scene that plays no Shadertoy: a new draft on stage instead, once per opening (Strict Mode runs this twice).
    if (code !== undefined || drafted.current) return
    drafted.current = true
    director.cut(edit.newShader(NEW).id)
  }, [code])
  useEffect(() => () => clearTimeout(timer.current), [])

  const run = () => {
    clearTimeout(timer.current)
    timer.current = 0
    const text = ta.current!.value
    const log = panel.setToy(text, creditOf(text) ?? credit.current)
    const e = log === null ? [] : toyErrors(log, text.split('\n').length)
    setErrs((last.current = e))
    return e
  }
  /** `src` into the field, undoable there as typing, then run: an example, an import, the AI channel's push. */
  const load = (src: string, by: 'AI' | 'user') => {
    const t = ta.current!
    t.focus()
    t.select()
    if (!document.execCommand('insertText', false, src)) t.value = src
    credit.current = creditOf(src) ?? ''
    author.current = by // after insertText: its input event says 'user'
    setLines(src.split('\n').length)
    return run()
  }
  /** A .glsl file's text (Import, a drop, the AI's folder) into the field without its header; an AI's stays the AI's. */
  const importText = (name: string, text: Promise<string>) =>
    text.then(
      (t) => {
        const { code, meta } = readShader(t)
        load(code, meta.author === 'AI' ? 'AI' : 'user')
        say(null, 'Import', `Imported ${name}`)
      },
      (e: unknown) => say(String(e), 'Import', ''),
    )
  const exportFile = () => {
    const name = safeName(doc.name) || 'shader'
    download(`${name}.glsl`, writeShader(ta.current!.value, { name: doc.name, author: author.current, date: new Date().toISOString(), source: library.get(id)?.name }), 'text/plain')
    say(null, 'Export', `Exported ${name}.glsl`)
  }
  const listFiles = () => void fetch('/__ai/list').then((r) => r.json()).then((r: { files?: string[] }) => setFiles(r.files ?? []), () => {})
  // The dev AI channel: this open editor announces itself and answers the server's asks.
  const answer = useEffectEvent(async (m: Ask) => {
    if (m.what === 'state') return { ok: true, code: ta.current!.value, errors: last.current, author: author.current, scene: doc.name, source: library.get(id)?.name }
    if (m.name && !library.get(id)) live(id).doc.name = m.name.slice(0, 200) // names the draft: Save as… offers it
    const errors = load(m.code ?? '', 'AI')
    if (errors.length) return { ok: false, errors, status: 'The last good shader keeps playing.' }
    await new Promise((ok) => setTimeout(ok, STILL_MS))
    return { ok: true, errors, status: 'Playing', png: await still() }
  })
  const opened = useEffectEvent(listFiles)
  useEffect(() => {
    const hot = import.meta.hot
    if (!hot) return
    const on = (m: Ask) => void answer(m).then((r) => hot.send('vjw:ai-reply', { id: m.id, ...r }))
    hot.on('vjw:ai', on)
    hot.send('vjw:ai-editor', true)
    opened()
    return () => {
      hot.off('vjw:ai', on)
      hot.send('vjw:ai-editor', false)
    }
  }, [])
  const close = () => {
    if (timer.current) run() // what was typed last plays on, when it compiles
    setShader(false)
  }
  const keys = (e: KeyboardEvent) => {
    e.stopPropagation() // never the app's shortcuts (app.ts), nor the editor's
    if (e.key === 'Escape') close()
    else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run()
    else if (e.key === 'Tab' && !e.shiftKey && e.target === ta.current) document.execCommand('insertText', false, '  ') // Shift+Tab still leaves
    else return
    e.preventDefault()
  }
  const bad = new Set(errs?.map((x) => x.line))
  return (
    <div
      className="shader"
      onKeyDown={keys}
      onPointerUp={(e) => {
        if (e.target instanceof HTMLButtonElement) e.target.blur() // as the editor: G and Esc stay live after a click
      }}
      onDrop={(e) => {
        const f = e.dataTransfer.files[0]
        if (!f || !/\.(glsl|frag|txt)$/i.test(f.name)) return // audio: the document's drop plays it
        e.preventDefault()
        e.stopPropagation()
        void importText(f.name, f.text())
      }}
    >
      <aside className="stack">
        <header>
          <b title={doc.name}>Shader · {doc.name}</b>
          <select
            aria-label="Load an example"
            value=""
            onChange={(e) => void load(EXAMPLES.get(e.target.value)!, 'user')}
          >
            <option value="" disabled>
              Examples…
            </option>
            {[...EXAMPLES.keys()].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <button title="Cmd/Ctrl+Enter" onClick={run}>
            Run
          </button>
          <button title="Esc · G" onClick={close}>
            Close
          </button>
        </header>
        <SceneHead id={id} say={say}>
          <button title="Download the code as a .glsl file" onClick={exportFile}>
            Export
          </button>
          <button title="Load a .glsl file (or drop one here)" onClick={() => file.current!.click()}>
            Import
          </button>
          <input
            ref={file}
            type="file"
            accept=".glsl,.frag,.txt"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = '' // the same file can come in again
              if (f) void importText(f.name, f.text())
            }}
          />
          {import.meta.env.DEV && (
            <select
              aria-label="Import an AI file"
              title="web/user-shaders/: the AI's exports"
              value=""
              onFocus={listFiles}
              onChange={(e) => void importText(e.target.value, fetch(`/__ai/file?name=${encodeURIComponent(e.target.value)}`).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`)))))}
            >
              <option value="" disabled>
                AI files…
              </option>
              {files.map((f) => (
                <option key={f} value={f}>
                  {f.slice(0, -'.glsl'.length)}
                </option>
              ))}
            </select>
          )}
        </SceneHead>
        {note && (
          <p key={note.text} className={note.err ? 'err' : 'note'} onAnimationEnd={() => setNote(undefined)}>
            {note.text}
          </p>
        )}
        <div className="code">
          <pre ref={gutter} className="gutter" aria-hidden="true">
            {Array.from({ length: lines }, (_, i) => (
              <span key={i} className={bad.has(i + 1) ? 'bad' : undefined}>
                {i + 1}
                {'\n'}
              </span>
            ))}
          </pre>
          <textarea
            ref={ta}
            aria-label="Shader code"
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoFocus
            onInput={(e) => {
              author.current = 'user'
              setLines(e.currentTarget.value.split('\n').length)
              clearTimeout(timer.current)
              timer.current = window.setTimeout(run, REST_MS)
            }}
            onScroll={(e) => (gutter.current!.scrollTop = e.currentTarget.scrollTop)}
            onBlur={() => timer.current && run()} // Save, Save as… and the menu take what was typed last
          />
        </div>
        <pre className={errs?.length ? 'status fail' : 'status'} role="status">
          {errs === null
            ? 'It plays once the keys rest · Cmd/Ctrl+Enter now · Esc closes'
            : errs.length
              ? `${errs.map((x) => (x.line ? `line ${x.line}: ${x.msg}` : x.msg)).join('\n')}\nThe last good shader keeps playing.`
              : 'Playing'}
        </pre>
      </aside>
      <div ref={cell} />
    </div>
  )
}
