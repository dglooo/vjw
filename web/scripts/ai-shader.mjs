// The AI channel's CLI (docs/ai-shader-guide.md; the channel is vite.config.ts aiChannel, dev server only): drives the
// user's open G editor from a shell.
// usage (cwd = web/):
//   node scripts/ai-shader.mjs push <file.glsl> [name]      the code into the editor: "Playing" + the still's path, or the errors by line
//   node scripts/ai-shader.mjs export <name> [--overwrite]  the editor's shader into web/user-shaders/<name>.glsl
//   node scripts/ai-shader.mjs state                        the editor's code, its last errors, author, scene (JSON)
//   node scripts/ai-shader.mjs list                         the files in web/user-shaders/, newest first (JSON)
// env VJW_URL: the dev server (default http://localhost:5173). Exit 0: ok, 1: refused (errors, no editor), 2: usage.
import { readFile } from 'node:fs/promises'

const BASE = process.env.VJW_URL ?? 'http://localhost:5173'
const [cmd, arg, more] = process.argv.slice(2)
const call = async (path, body) => {
  const r = await fetch(`${BASE}/__ai/${path}`, body && { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return r.json()
}
const out = (r) => {
  if (r.error) console.log(`error: ${r.error}`)
  process.exitCode = r.ok === false ? 1 : 0
}

if (cmd === 'push' && arg) {
  const r = await call('shader', { code: await readFile(arg, 'utf8'), name: more })
  for (const e of r.errors ?? []) console.log(e.line ? `line ${e.line}: ${e.msg}` : e.msg)
  if (r.status) console.log(r.status)
  if (r.still) console.log(`still: ${r.still}`)
  out(r)
} else if (cmd === 'export' && arg) {
  const r = await call('export', { name: arg, overwrite: more === '--overwrite' })
  if (r.file) console.log(`exported: ${r.file}`)
  out(r)
} else if (cmd === 'state' || cmd === 'list') {
  const r = await call(cmd)
  console.log(JSON.stringify(r, null, 2))
  out(r)
} else {
  console.log('usage: node scripts/ai-shader.mjs push <file.glsl> [name] | export <name> [--overwrite] | state | list')
  process.exitCode = 2
}
