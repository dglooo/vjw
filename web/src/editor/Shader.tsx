// The shader editor (user 2026-11-19, after the friends' vs3 `renderer/web/shader-editor.js`; key G or the bar button):
// a code panel docked left, the live picture beside it. Typing compiles once the keys rest; a good shader plays at
// once, a bad one lists its errors by line and the last good one keeps playing. Cmd/Ctrl+Enter runs now, Esc closes,
// and keys typed here never reach the app's shortcuts. It edits the scene on stage when its bottom layer plays a
// Shadertoy (`toy/…`, so G on a saved one opens its code again), else a new draft (edit.newShader). Star, Save and
// Save as… are the editor's (L): a saved shader is a user scene as any other.
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react'
import { director, setShader } from '../app'
import type { SceneId } from '../doc'
import * as edit from '../edit'
import { toyErrors } from '../fx/glsl'
import { fitStage } from '../gl/engine'
import { live, panel } from '../gl/live'
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
  const [errs, setErrs] = useState<{ line: number; msg: string }[] | null>(null) // null: nothing compiled yet
  const [note, setNote] = useState<{ text: string; err: boolean }>()
  const say: Say = (err, what, done) => setNote(err ? { text: `${what}: ${err}`, err: true } : { text: done, err: false })
  const ta = useRef<HTMLTextAreaElement>(null)
  const gutter = useRef<HTMLPreElement>(null)
  const cell = useRef<HTMLDivElement>(null)
  const timer = useRef(0) // a compile waiting for the keys to rest
  const credit = useRef(code === undefined ? '' : (doc.layers[0].gen.credit ?? '')) // an example's, or the scene's
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
    setErrs(log === null ? [] : toyErrors(log, text.split('\n').length))
  }
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
    >
      <aside className="stack">
        <header>
          <b title={doc.name}>Shader · {doc.name}</b>
          <select
            aria-label="Load an example"
            value=""
            onChange={(e) => {
              const src = EXAMPLES.get(e.target.value)!
              const t = ta.current!
              t.focus()
              t.select()
              if (!document.execCommand('insertText', false, src)) t.value = src // undoable in the field, as typing
              credit.current = creditOf(src) ?? ''
              setLines(src.split('\n').length)
              run()
            }}
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
        <SceneHead id={id} say={say} />
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
