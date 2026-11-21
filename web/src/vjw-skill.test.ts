// The vjw-shader skill's CLI (deploy/skill/vjw-shader/scripts/vjw.mjs) on a fake fetch: its arguments, what it sends, and
// its error messages. Here, not beside the script: the gate (npm test) runs src/ only.
import { afterAll, beforeAll, expect, test } from 'vitest'
// @ts-expect-error -- a plain .mjs (the skill ships one script, no types), so its exports are `any` here
import { main, USAGE } from '../../deploy/skill/vjw-shader/scripts/vjw.mjs'

// the app tsconfig has no node types (presets.test.ts): node:fs and node:os by name, typed by hand
interface Fs {
  mkdtempSync(prefix: string): string
  readFileSync(path: string): Uint8Array
  rmSync(path: string, opts: { recursive: true; force: true }): void
  writeFileSync(path: string, text: string): void
}
const ids = { fs: 'node:fs', os: 'node:os' }
const CODE = 'void mainImage(out vec4 fragColor, in vec2 fragCoord) { fragColor = vec4(1.0); }'
const SITE = 'https://example.test/vjw' // no default: the site's address comes from its owner (VJW_URL)
let fs: Fs
let dir = ''
let glsl = ''
beforeAll(async () => {
  fs = (await import(/* @vite-ignore */ ids.fs)) as Fs
  const { tmpdir } = (await import(/* @vite-ignore */ ids.os)) as { tmpdir(): string }
  dir = fs.mkdtempSync(`${tmpdir()}/vjw-skill-`)
  glsl = `${dir}/rings.glsl`
  fs.writeFileSync(glsl, CODE)
})
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

type Reply = Response | ((url: string) => Response)
/** One run on a fake fetch: `reply` answers every call (a function that throws = no network). */
async function run(args: string[], reply: Reply = Response.json({ ok: true }), env: Record<string, string> = { VJW_URL: SITE, VJW_AI_TOKEN: 'tok-0123' }) {
  const lines: string[] = []
  const calls: { url: string; init: RequestInit }[] = []
  const fetch = async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return typeof reply === 'function' ? reply(url) : reply
  }
  const code = await main(args, { env, fetch, log: (l: string) => lines.push(l) })
  return { code, out: lines.join('\n'), calls, body: calls[0] && JSON.parse(String(calls[0].init.body ?? 'null')) }
}

test('arguments: usage, the site, the token, the room, and what each command sends', async () => {
  for (const args of [[], ['push'], ['export'], ['list'], ['--no-still', 'push']]) expect(await run(args)).toMatchObject({ code: 2, out: USAGE, calls: [] })
  const noSite = 'error: set VJW_URL to the site address from the site owner (export VJW_URL=https://<host>/<path>)'
  for (const env of [{}, { VJW_AI_TOKEN: 'tok-0123', VJW_URL: ' ' }] as Record<string, string>[]) expect(await run(['state'], undefined, env)).toMatchObject({ code: 2, out: noSite, calls: [] })
  expect(await run(['guide'], undefined, {})).toMatchObject({ code: 2, out: noSite, calls: [] })
  expect(await run(['state'], undefined, { VJW_URL: SITE })).toMatchObject({ code: 2, out: expect.stringContaining('set VJW_AI_TOKEN'), calls: [] })

  const env = { VJW_AI_TOKEN: ' tok-0123\n', VJW_URL: 'https://example.test/site/', VJW_ROOM: ' x7k2p\n' }
  const push = await run(['push', glsl, '--no-still', 'Rings'], Response.json({ ok: true, errors: [], status: 'Playing' }), env)
  expect(push).toMatchObject({ code: 0, out: 'Playing', body: { code: CODE, name: 'Rings', still: false } })
  expect(push.calls[0].url).toBe('https://example.test/site/__ai/shader')
  expect(push.calls[0].init).toMatchObject({ method: 'POST', headers: { authorization: 'Bearer tok-0123', 'x-vjw-room': 'x7k2p', 'content-type': 'application/json' } })

  const shot = await run(['push', glsl], Response.json({ ok: true, errors: [], status: 'Playing', png: `data:image/png;base64,${btoa('a png')}` }))
  expect(shot.calls[0].url).toBe(`${SITE}/__ai/shader`)
  expect(shot.body).toEqual({ code: CODE }) // the still by default
  expect(shot.calls[0].init.headers).toMatchObject({ 'x-vjw-room': 'main' }) // no VJW_ROOM: main, the relay's room before rooms
  expect(shot.out).toBe(`Playing\nstill: ${dir}/rings.png`) // beside the shader, for the agent to open
  expect(new TextDecoder().decode(fs.readFileSync(`${dir}/rings.png`))).toBe('a png')

  const ex = await run(['export', 'Neon tunnel'], Response.json({ ok: true, file: 'Neon tunnel.glsl', status: "Downloaded in the user's browser" }))
  expect(ex).toMatchObject({ code: 0, out: "exported: Neon tunnel.glsl\nDownloaded in the user's browser", body: { name: 'Neon tunnel' } })
  const state = await run(['state'], Response.json({ ok: true, code: 'x', errors: [], author: 'user' }))
  expect([state.code, JSON.parse(state.out).author, state.calls[0].init.method]).toEqual([0, 'user', undefined])
  const guide = await run(['guide'], new Response('# AI shader guide'), { VJW_URL: SITE }) // public: no token needed, none sent
  expect(guide).toMatchObject({ code: 0, out: '# AI shader guide' })
  expect(guide.calls[0].init.headers).toEqual({})
})

test('--room <code>: over VJW_ROOM, anywhere in the line; without its code, usage', async () => {
  const env = { VJW_URL: SITE, VJW_AI_TOKEN: 'tok-0123', VJW_ROOM: 'red' }
  for (const args of [['state', '--room', 'blue2'], ['--room', ' blue2 ', 'state']]) expect((await run(args, undefined, env)).calls[0].init.headers).toMatchObject({ 'x-vjw-room': 'blue2' })
  expect((await run(['state'], undefined, env)).calls[0].init.headers).toMatchObject({ 'x-vjw-room': 'red' })
  const push = await run(['push', glsl, '--room', 'blue2', 'Rings', '--no-still'], Response.json({ ok: true, errors: [], status: 'Playing' }), env)
  expect(push).toMatchObject({ code: 0, out: 'Playing', body: { code: CODE, name: 'Rings', still: false } })
  expect(push.calls[0].init.headers).toMatchObject({ 'x-vjw-room': 'blue2' })
  expect(await run(['state', '--room'], undefined, env)).toMatchObject({ code: 2, out: USAGE, calls: [] })
})

test('errors: a wrong token, no editor, GLSL errors, a missing file, no network, not the relay', async () => {
  const refused = Response.json({ ok: false, error: 'a wrong or missing token: send Authorization: Bearer <token>' }, { status: 401 })
  expect(await run(['state'], refused)).toMatchObject({ code: 1, out: 'error: the server refused the token (401): check VJW_AI_TOKEN' })
  const none = 'no G editor open in room main: the user opens the site, presses Start, then G, then Remote AI → Connect; the room code beside Connect is the one to send'
  const hint = 'hint: ask the user for the room code beside Connect (site → Start → G → Remote AI), then run again with --room <code>'
  expect(await run(['push', glsl], Response.json({ ok: false, error: none }))).toMatchObject({ code: 1, out: `error: ${none}\n${hint}` })
  const bad = Response.json({ ok: false, errors: [{ line: 3, msg: "'x' : undeclared identifier" }], status: 'The last good shader keeps playing.' })
  expect(await run(['push', glsl], bad)).toMatchObject({ code: 1, out: "line 3: 'x' : undeclared identifier\nThe last good shader keeps playing." })
  expect(await run(['push', `${dir}/nope.glsl`])).toMatchObject({ code: 2, out: `error: cannot read ${dir}/nope.glsl (ENOENT)`, calls: [] })
  const offline = () => {
    throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } })
  }
  expect(await run(['state'], offline)).toMatchObject({ code: 1, out: `error: cannot reach ${SITE}/__ai/state (ENOTFOUND): check VJW_URL` })
  const html = new Response('<html>502</html>', { status: 502, statusText: 'Bad Gateway' })
  expect(await run(['export', 'x'], html)).toMatchObject({ code: 1, out: expect.stringMatching(/^error: HTTP 502 Bad Gateway from .*__ai\/export, not the relay/) })
})
