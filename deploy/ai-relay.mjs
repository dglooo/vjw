// The remote AI relay (user 2026-11-21, for development; deploy/README.md § Remote AI): the dev server's AI channel
// (web/vite.config.ts aiChannel, docs/ai-shader-guide.md) for the published site. The lead's CLI
// (web/scripts/ai-shader.mjs) calls POST /__ai/shader, POST /__ai/export, GET /__ai/state and GET /__ai/guide; the G
// editor open in the user's browser (web/src/editor/Shader.tsx, Remote AI) listens on GET /__ai/events (server-sent
// events) and answers each ask on POST /__ai/result. Every call but the guide needs the token, `Authorization: Bearer
// <token>`; the event stream may carry it as `?token=` instead (an EventSource sends no header). It stores nothing: a
// still goes back to the CLI as a PNG data URL (none with `"still": false` or `?still=0`: a ChatGPT Action,
// docs/ai-chatgpt.md), an export downloads in the user's browser. Rooms (user 2026-11-21: friends live-code side by
// side): each editor joins a room, its code beside Connect (`?room=` on the stream), and every call names its room in
// `X-VJW-Room: <code>` or `?room=<code>`; none = `main`, as before rooms. One editor a room, the newest wins. Rooms route,
// they lock nothing: the token reaches every room. Node ≥ 20, no npm packages, 127.0.0.1 only (nginx in front):
//   VJW_AI_TOKEN=$(openssl rand -hex 24) PORT=7781 node ai-relay.mjs
import { createHash, timingSafeEqual } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'

export const PUSH_MAX = 4 * 65536 // bytes: a push's JSON (the editor's 65 536-char code limit, with its escapes)
export const RESULT_MAX = 2 * 1024 * 1024 // bytes: the editor's answer (a still, a PNG data URL)
export const ROOMS_MAX = 32 // rooms open at once, one editor each: a 33rd editor is refused (503)
const ROOM = /^[a-z0-9]{1,16}$/ // a room code, case folded (the editor's: web/src/shaderfile.ts roomCode)
const sha = (s) => createHash('sha256').update(s).digest()
/** The guide beside this file (a server copy), else in the repo's docs/. */
const guide = () =>
  readFile(new URL('ai-shader-guide.md', import.meta.url), 'utf8').catch(() => readFile(new URL('../docs/ai-shader-guide.md', import.meta.url), 'utf8').catch(() => null))

/** A request's body, a JSON object of at most `max` bytes. Over that it reads on and drops the rest, so the client
 *  still gets its 413. */
const json = (req, max) =>
  new Promise((ok, no) => {
    const parts = []
    let n = 0
    req.on('data', (c) => (n += c.length) <= max && parts.push(c))
    req.on('end', () => {
      const fail = (status, error) => no(Object.assign(new Error(error), { status }))
      if (n > max) return fail(413, `the body is over ${max} bytes`)
      try {
        const b = JSON.parse(Buffer.concat(parts).toString('utf8'))
        if (b && typeof b === 'object' && !Array.isArray(b)) return ok(b)
      } catch {
        // not JSON: the 400 below
      }
      fail(400, 'send a JSON object')
    })
  })

/** The relay: a node:http server, not listening yet. The token is its only lock (user 2026-11-21: a dev tool for
 *  himself). `wait` (ms an ask waits for the editor) and `log` (one line a request, never the token) are the tests'
 *  seams. */
export function relay({ token, wait = 20_000, log = console.log }) {
  if (typeof token !== 'string' || token.length < 24) throw new Error('set VJW_AI_TOKEN to 24 or more characters: VJW_AI_TOKEN=$(openssl rand -hex 24)')
  const key = sha(token)
  const editors = new Map() // a room → its G editor's event stream: one a room, the newest wins
  const waiting = new Map() // an ask's id → the end of its wait
  let asks = 0
  /** One ask to the room's editor: its answer, or why none came. */
  const ask = (room, what, body = {}) =>
    new Promise((done) => {
      const editor = editors.get(room)
      if (!editor) return done({ ok: false, error: `no G editor open in room ${room}: the user opens the site, presses Start, then G, then Remote AI → Connect; the room code beside Connect is the one to send` })
      const id = ++asks
      const end = (a) => (clearTimeout(t), waiting.delete(id), done(a))
      const t = setTimeout(() => end({ ok: false, error: `the G editor did not answer in ${wait / 1000} s` }), wait)
      waiting.set(id, end)
      editor.write(`data: ${JSON.stringify({ ...body, id, what })}\n\n`)
    })

  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://relay')
    const t0 = Date.now()
    const who = req.headers['x-real-ip'] ?? req.socket.remoteAddress // nginx's X-Real-IP: the client, not nginx
    res.on('close', () => log(`${new Date().toISOString()} ${who} ${req.method} ${url.pathname} ${res.statusCode} ${Date.now() - t0} ms`))
    const send = (status, body, type = 'application/json') => {
      res.writeHead(status, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store' })
      res.end(typeof body === 'string' ? body : JSON.stringify(body))
    }
    const fail = (status, error) => send(status, { ok: false, error })
    const what = /\/__ai\/(\w+)$/.exec(url.pathname)?.[1] // nginx passes /__ai/… (or /<base>/__ai/…)
    const route = `${req.method} ${what}`
    if (route === 'GET guide') {
      // public (user 2026-11-21): the guide holds no secret; every other call needs the token
      const text = await guide()
      return text === null ? fail(404, 'no guide: copy docs/ai-shader-guide.md beside ai-relay.mjs') : send(200, text, 'text/markdown')
    }
    const given = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1] ?? (route === 'GET events' ? url.searchParams.get('token') : null) ?? ''
    if (!timingSafeEqual(sha(given), key)) return fail(401, 'a wrong or missing token: send Authorization: Bearer <token>')
    const room = (req.headers['x-vjw-room'] || url.searchParams.get('room') || 'main').trim().toLowerCase() // none: main
    if (!ROOM.test(room)) return fail(400, 'a bad room code: 1 to 16 letters a–z or digits, in X-VJW-Room or ?room=')
    try {
      if (route === 'GET events') {
        if (!editors.has(room) && editors.size >= ROOMS_MAX) return fail(503, `the relay holds ${ROOMS_MAX} rooms, its most: a G editor elsewhere has to close first`)
        editors.get(room)?.end('event: replaced\ndata: {}\n\n') // the room's old tab stops: its EventSource would reconnect and take it back
        editors.set(room, res)
        res.on('close', () => editors.get(room) === res && editors.delete(room))
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', 'x-accel-buffering': 'no' })
        return void res.write(': open\n\n') // the head goes out now: the page's EventSource opens
      }
      if (route === 'POST result') {
        const a = await json(req, RESULT_MAX)
        const end = waiting.get(a.id)
        if (!end) return fail(404, `no ask ${a.id} is waiting: it timed out, or was answered`)
        end(a)
        return send(200, { ok: true })
      }
      if (route === 'POST shader' || route === 'POST export') {
        const b = await json(req, PUSH_MAX)
        const a = await ask(room, what === 'shader' ? 'push' : 'export', b) // the editor checks the fields (shaderfile.ts answerAsk)
        if (b.still === false || url.searchParams.get('still') === '0') delete a.png // a ChatGPT Action (docs/ai-chatgpt.md): its answer stays under 100 000 chars, and it cannot see a still
        return send(200, a)
      }
      if (route === 'GET state') return send(200, await ask(room, 'state'))
      fail(404, `no ${req.method} ${url.pathname}: see GET /__ai/guide`)
    } catch (e) {
      if (!res.headersSent) fail(e.status ?? 500, e.message) // a second head would throw again: a crashed relay drops the editor
    }
  })
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const port = Number(process.env.PORT || 7781)
  try {
    relay({ token: process.env.VJW_AI_TOKEN }).listen(port, '127.0.0.1', () => console.log(`ai-relay: on 127.0.0.1:${port}; nginx proxies <base>/__ai/ here`))
  } catch (e) {
    console.error(`ai-relay: ${e.message}`)
    process.exit(1)
  }
}
