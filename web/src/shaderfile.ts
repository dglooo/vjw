// A shader as a file on the user's disk (user 2026-11-20): `<name>.glsl`, a header over the code (name, author, date,
// the source scene), as the shader editor's Export downloads it and the dev AI channel (vite.config.ts) writes it into
// web/user-shaders/; Import reads either back. Also the channel's request checks. Pure and import-free: vite.config.ts
// runs it in Node, Shader.tsx in the page.

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
