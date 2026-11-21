// A shader as a file on the user's disk (user 2026-11-20): `<name>.glsl`, a header over the code (name, author, date,
// the source scene), as the shader editor's Export downloads it and the dev AI channel (vite.config.ts) writes it into
// web/user-shaders/; Import reads either back. Also the channel's request checks, the open editor's answer to an ask
// (dev, and the remote relay) and the Remote AI row's token and room. Pure and import-free: vite.config.ts runs it in
// Node, Shader.tsx in the page.

/** The channel's code limit: doc.ts CODE_MAX, a toy's (shaderfile.test.ts pins the two together). */
export const SHADER_MAX = 65536
const MAGIC = '// VeeJay Wizard shader'
const FIELD = /^\/\/ (\w+): (.*)$/

/** A file name stem: [A-Za-z0-9 _-] only (no dot, no slash: no path out of the folder), spaces squeezed, ≤ 64 chars;
 *  '' when nothing is left. */
export const safeName = (name: string) => name.replace(/[^A-Za-z0-9 _-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 64)

export interface ShaderMeta { name: string; author: 'AI' | 'user'; date: string; source?: string }
const one = (v: string) => v.replace(/[\r\n]+/g, ' ').trim().slice(0, 200) // a field stays one comment line

/** The file's text: the header (MAGIC, then one `// Key: value` line per field), a blank line, then the code without
 *  any header it had, so an export of an import never stacks two. */
export function writeShader(code: string, m: ShaderMeta) {
  const head = [MAGIC, `// Name: ${one(m.name)}`, `// Author: ${m.author}`, `// Date: ${one(m.date)}`, ...(m.source ? [`// Source: ${one(m.source)}`] : [])]
  return `${head.join('\n')}\n\n${readShader(code).code}`
}

/** A file's code and its header's fields (keys lower case); a text without our header is all code. */
export function readShader(text: string): { code: string; meta: Record<string, string> } {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const end = lines.indexOf('')
  if (lines[0] !== MAGIC || end < 0 || !lines.slice(1, end).every((l) => FIELD.test(l))) return { code: text, meta: {} }
  const meta = Object.fromEntries(lines.slice(1, end).map((l) => FIELD.exec(l)!.slice(1, 3)).map(([k, v]) => [k.toLowerCase(), v]))
  return { code: lines.slice(end + 1).join('\n'), meta }
}

const fields = (body: unknown) => (body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null)
/** Text, not a binary: no control character but tab, line feed and carriage return. */
const text = (s: string) => ![...s].some((c) => c < ' ' && c !== '\t' && c !== '\n' && c !== '\r')

/** POST /__ai/shader's JSON body: `{ code, name? }`, code GLSL text of 1 to SHADER_MAX chars. The fields, or why not. */
export function checkPush(body: unknown): { code: string; name?: string } | string {
  const b = fields(body)
  if (!b) return 'the body is not a JSON object'
  if (typeof b.code !== 'string' || !b.code.trim()) return 'code: not a non-empty string'
  if (b.code.length > SHADER_MAX) return `code: ${b.code.length} chars, at most ${SHADER_MAX}`
  if (!text(b.code)) return 'code: not plain text (control characters)'
  if (b.name !== undefined && typeof b.name !== 'string') return 'name: not a string'
  return { code: b.code, name: b.name }
}

/** POST /__ai/export's JSON body: `{ name, overwrite? }`. `file`: the name through safeName, never empty. */
export function checkExport(body: unknown): { name: string; file: string; overwrite: boolean } | string {
  const b = fields(body)
  if (!b) return 'the body is not a JSON object'
  const file = typeof b.name === 'string' ? safeName(b.name) : ''
  if (!file) return 'name: give one with letters or digits ([A-Za-z0-9 _-] are kept)'
  return { name: one(b.name as string), file, overwrite: b.overwrite === true }
}

/** A request's Origin header: none (a CLI, curl) or this machine's page. A page of another site can send a simple POST
 *  without a CORS preflight, so the channel refuses its Origin. */
export const localOrigin = (origin: string | undefined) => origin === undefined || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin)

type Reply = Record<string, unknown>
/** What the open G editor does for the channel (Shader.tsx). */
interface AskEditor {
  state(): Reply
  push(code: string, name?: string): Promise<Reply>
  export(name: string): Reply
}

/** One ask to the open editor, `{ id, what, … }`, from the dev server (its HMR socket) or the remote relay
 *  (deploy/ai-relay.mjs, its event stream), and the answer `{ …, id }`. A push and an export pass the dev server's checks
 *  here (the relay forwards them as they came). Never throws: an error is an answer too. */
export async function answerAsk(m: unknown, ed: AskEditor): Promise<Reply> {
  const b = fields(m)
  const id = b?.id
  try {
    if (b?.what === 'state') return { ...ed.state(), id }
    if (b?.what === 'push') {
      const p = checkPush(b)
      return { ...(typeof p === 'string' ? { ok: false, error: p } : await ed.push(p.code, p.name)), id }
    }
    if (b?.what === 'export') {
      const e = checkExport(b)
      return { ...(typeof e === 'string' ? { ok: false, error: e } : ed.export(e.name)), id }
    }
    return { ok: false, error: `what: push, state or export, not ${String(b?.what)}`, id }
  } catch (e) {
    return { ok: false, error: String(e), id }
  }
}

/** A room code of the remote relay (deploy/ai-relay.mjs ROOM): 1 to 16 of a–z and 0–9, case folded; null if not one. */
export const roomCode = (s: string) => {
  const r = s.trim().toLowerCase()
  return /^[a-z0-9]{1,16}$/.test(r) ? r : null
}
const ROOM_ABC = 'abcdefghjkmnpqrstuvwxyz23456789' // no 0 o 1 i l: a code read aloud or typed again stays the same
/** A new room code: 5 of ROOM_ABC (31⁵ ≈ 29 M codes; the relay holds 32 rooms). `rand` ∈ [0, 1): the tests' seam. */
export const newRoom = (rand = Math.random) => Array.from({ length: 5 }, () => ROOM_ABC[Math.floor(rand() * ROOM_ABC.length)]).join('')
/** The Remote AI row's settings, localStorage `vjw.ai` (Shader.tsx): `{ token, room }` as JSON, or a bare token (before
 *  rooms, 2026-11-21). A token without a valid room gets a new code (G connects with it at once; the caller stores it,
 *  so it is made once); no token: no room yet, the first Connect makes it. */
export function aiSettings(raw: string | null, rand = Math.random) {
  let o: Record<string, unknown> | null = null
  try {
    o = fields(JSON.parse(raw ?? ''))
  } catch {
    // a bare token, or nothing stored yet
  }
  const token = o ? (typeof o.token === 'string' ? o.token : '') : (raw ?? '')
  return { token, room: (typeof o?.room === 'string' && roomCode(o.room)) || (token ? newRoom(rand) : '') }
}
