// The AI channel's CLI (docs/ai-shader-guide.md): drives the user's open G editor from a shell, through the dev server
// (vite.config.ts aiChannel) or the published site's relay (deploy/ai-relay.mjs).
// usage (cwd = web/):
//   node scripts/ai-shader.mjs push <file.glsl> [name]      the code into the editor: "Playing" + the still's path, or the errors by line
//   node scripts/ai-shader.mjs export <name> [--overwrite]  the editor's shader as <name>.glsl: dev into web/user-shaders/, remote into the user's downloads
//   node scripts/ai-shader.mjs state                        the editor's code, its last errors, author, scene (JSON)
//   node scripts/ai-shader.mjs list                         the files in web/user-shaders/, newest first (JSON; dev only)
// env VJW_URL: the server (default http://localhost:5173; remote: https://<host>/<base>), VJW_AI_TOKEN: the relay's
// token (remote only), VJW_ROOM: the room code beside Connect in the user's G editor (remote only; default main). A remote
// still comes back as a PNG data URL: saved into scratchpad/ai/stills/ as dev saves it.
// Exit 0: ok, 1: refused (errors, no editor), 2: usage.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const BASE = (process.env.VJW_URL ?? 'http://localhost:5173').replace(/\/+$/, '')
const TOKEN = process.env.VJW_AI_TOKEN
const ROOM = process.env.VJW_ROOM?.trim() || 'main' // the relay's room (deploy/ai-relay.mjs); the dev server has none
const STILLS = new URL('../../scratchpad/ai/stills/', import.meta.url)
const PNG = 'data:image/png;base64,'
const [cmd, arg, more] = process.argv.slice(2)
const call = async (path, body) => {
  const headers = { ...(TOKEN && { authorization: `Bearer ${TOKEN}`, 'x-vjw-room': ROOM }), ...(body && { 'content-type': 'application/json' }) }
  const r = await fetch(`${BASE}/__ai/${path}`, { headers, ...(body && { method: 'POST', body: JSON.stringify(body) }) })
  return r.json().catch(() => ({ ok: false, error: `HTTP ${r.status} ${r.statusText}` })) // nginx's error pages are HTML
}
const out = (r) => {
  if (r.error) console.log(`error: ${r.error}`)
  process.exitCode = r.ok === false ? 1 : 0
}

if (cmd === 'push' && arg) {
  const r = await call('shader', { code: await readFile(arg, 'utf8'), name: more })
  if (typeof r.png === 'string' && r.png.startsWith(PNG)) {
    await mkdir(STILLS, { recursive: true })
    const f = new URL(`still-${Date.now()}.png`, STILLS)
    await writeFile(f, Buffer.from(r.png.slice(PNG.length), 'base64'))
    r.still = fileURLToPath(f)
  }
  for (const e of r.errors ?? []) console.log(e.line ? `line ${e.line}: ${e.msg}` : e.msg)
  if (r.status) console.log(r.status)
  if (r.still) console.log(`still: ${r.still}`)
  out(r)
} else if (cmd === 'export' && arg) {
  const r = await call('export', { name: arg, overwrite: more === '--overwrite' })
  if (r.file) console.log(`exported: ${r.file}`)
  if (r.status) console.log(r.status)
  out(r)
} else if (cmd === 'state' || cmd === 'list') {
  const r = await call(cmd)
  console.log(JSON.stringify(r, null, 2))
  out(r)
} else {
  console.log('usage: node scripts/ai-shader.mjs push <file.glsl> [name] | export <name> [--overwrite] | state | list')
  process.exitCode = 2
}
