// The remote AI relay (deploy/ai-relay.mjs) on an ephemeral port: the token, the size caps, one editor a room, the rooms,
// and each ask paired with its answer by id. Here, not beside the relay: the gate (npm test) runs src/ only.
import { afterEach, expect, test, vi } from 'vitest'
// @ts-expect-error -- a plain .mjs (the server copies one file), so no types: its exports are `any` here
import { PUSH_MAX, relay, RESULT_MAX, ROOMS_MAX } from '../../deploy/ai-relay.mjs'

const TOKEN = 'test-token-0123456789abcdef'
const CODE = 'void mainImage(out vec4 fragColor, in vec2 fragCoord) { fragColor = vec4(1.0); }'
let server: ReturnType<typeof relay> // a node:http Server
let base = ''
let logs: string[] = []

async function start(opts: { wait?: number } = {}) {
  logs = []
  server = relay({ token: TOKEN, log: (l: string) => logs.push(l), ...opts })
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
  base = `http://127.0.0.1:${server.address().port}/__ai/`
}
afterEach(() => {
  server.closeAllConnections()
  server.close()
})

/** The CLI's call: JSON in (a string goes as it is), the token as a bearer header, a room as X-VJW-Room. */
const call = (path: string, { token = TOKEN, body, room }: { token?: string; body?: unknown; room?: string } = {}) =>
  fetch(base + path, {
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(room === undefined ? {} : { 'x-vjw-room': room }) },
    ...(body !== undefined && { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }),
  })

/** A G editor on the event stream (the token and room as EventSource sends them, in the query, or as headers): the asks
 *  and the named events as they come, `ended` once the stream closes, and `close` (its tab goes). */
async function editor(how: 'query' | 'header' = 'query', room?: string) {
  const ac = new AbortController()
  const query = how === 'query' ? `?token=${TOKEN}${room ? `&room=${room}` : ''}` : ''
  const headers = how === 'header' ? { authorization: `Bearer ${TOKEN}`, ...(room ? { 'x-vjw-room': room } : {}) } : {}
  const r = await fetch(`${base}events${query}`, { headers, signal: ac.signal })
  const asks: { id: number; what: string; [k: string]: unknown }[] = []
  const named: string[] = []
  const read = r.body!.pipeThrough(new TextDecoderStream()).getReader()
  const ended = (async () => {
    let buf = ''
    for (;;) {
      const { value, done } = await read.read().catch(() => ({ value: '', done: true }))
      if (done) return
      buf += value
      for (let i; (i = buf.indexOf('\n\n')) >= 0; buf = buf.slice(i + 2)) {
        const ev = buf.slice(0, i)
        const name = /^event: (.+)$/m.exec(ev)?.[1]
        const data = /^data: (.+)$/m.exec(ev)?.[1]
        if (name) named.push(name)
        else if (data) asks.push(JSON.parse(data))
      }
    }
  })()
  return { status: r.status, type: r.headers.get('content-type'), asks, named, ended, close: () => ac.abort() }
}

test('the token: required at start (24+ chars), then on every call but the guide; ?token= only on the event stream', async () => {
  expect(() => relay({ token: 'too-short' })).toThrow(/24 or more/)
  expect(() => relay({})).toThrow(/VJW_AI_TOKEN/)
  await start()
  for (const token of ['', 'x', `${TOKEN}x`, TOKEN.slice(0, -1)]) expect((await call('state', { token })).status).toBe(401)
  expect((await call('shader', { token: 'nope', body: { code: CODE } })).status).toBe(401)
  expect((await call('export', { token: '', body: { name: 'Rings' } })).status).toBe(401)
  expect(await (await call('guide', { token: '' })).text()).toContain('# AI shader guide') // public: it holds no secret
  expect((await call('result', { token: '', body: { id: 1 } })).status).toBe(401)
  expect((await fetch(`${base}state?token=${TOKEN}`)).status).toBe(401)
  expect((await fetch(`${base}events?token=wrong-${TOKEN}`)).status).toBe(401)
  const ed = await editor('query')
  expect([ed.status, ed.type]).toEqual([200, 'text/event-stream'])
  expect((await editor('header')).status).toBe(200)
  expect(await (await call('guide')).text()).toContain('# AI shader guide')
  expect((await call('list')).status).toBe(404) // nothing is stored: no list, no file
  expect(logs.length).toBeGreaterThan(5)
  expect(logs.join('\n')).not.toContain(TOKEN) // one line a request, never the token
  expect(logs.find((l) => l.includes('GET /__ai/state 401'))).toBeTruthy()
})

test('no editor: an answer at once; a push reaches the editor and its answer goes back by id', async () => {
  await start()
  expect(await (await call('state')).json()).toMatchObject({ ok: false, error: expect.stringMatching(/^no G editor open in room main: /) })
  const ed = await editor()
  const push = call('shader', { body: { code: CODE, name: 'Rings' } }).then((r) => r.json())
  await vi.waitFor(() => expect(ed.asks).toHaveLength(1))
  const [a] = ed.asks
  expect(a).toEqual({ id: a.id, what: 'push', code: CODE, name: 'Rings' })
  const answer = { id: a.id, ok: true, errors: [], status: 'Playing', png: 'data:image/png;base64,iVBORw0KGgo=' }
  expect((await call('result', { body: answer })).status).toBe(200)
  expect(await push).toEqual(answer) // the still as base64: the CLI saves it
  expect((await call('result', { body: answer })).status).toBe(404) // answered once: nothing waits now

  const ex = call('export', { body: { name: 'Neon tunnel', id: 99, what: 'state' } }).then((r) => r.json())
  const st = call('state').then((r) => r.json())
  await vi.waitFor(() => expect(ed.asks).toHaveLength(3))
  const e = ed.asks.find((x) => x.what === 'export')! // the body cannot set the id or the ask
  const s = ed.asks.find((x) => x.what === 'state')!
  expect(e.name).toBe('Neon tunnel')
  expect(e.id).not.toBe(99)
  expect(s.id).not.toBe(e.id)
  await call('result', { body: { id: s.id, ok: true, code: CODE } }) // answered out of order: each finds its own
  await call('result', { body: { id: e.id, ok: true, file: 'Neon tunnel.glsl' } })
  expect(await ex).toMatchObject({ ok: true, file: 'Neon tunnel.glsl' })
  expect(await st).toMatchObject({ ok: true, code: CODE })
})

test('a push with "still": false or ?still=0 answers without the png (a ChatGPT Action); by default the png stays', async () => {
  await start()
  const ed = await editor()
  const png = 'data:image/png;base64,iVBORw0KGgo='
  const cases: [string, object, boolean][] = [
    ['shader', { code: CODE }, true],
    ['shader', { code: CODE, still: false }, false],
    ['shader?still=0', { code: CODE }, false],
  ]
  for (const [i, [path, body, kept]] of cases.entries()) {
    const push = call(path, { body }).then((r) => r.json())
    await vi.waitFor(() => expect(ed.asks).toHaveLength(i + 1))
    const id = ed.asks[i].id
    await call('result', { body: { id, ok: true, status: 'Playing', png } })
    expect(await push).toEqual({ id, ok: true, status: 'Playing', ...(kept && { png }) })
  }
})

test('one editor a room: a new one replaces the old, which hears so and closes', async () => {
  await start()
  const old = await editor()
  const now = await editor()
  await old.ended
  expect(old.named).toEqual(['replaced'])
  const st = call('state').then((r) => r.json())
  await vi.waitFor(() => expect(now.asks).toHaveLength(1))
  expect(old.asks).toEqual([])
  await call('result', { body: { id: now.asks[0].id, ok: true } })
  expect(await st).toEqual({ id: now.asks[0].id, ok: true })
})

test('an editor that does not answer: the call ends after `wait`', async () => {
  await start({ wait: 50 })
  await editor()
  expect(await (await call('state')).json()).toEqual({ ok: false, error: 'the G editor did not answer in 0.05 s' })
})

test('sizes: a push over PUSH_MAX and a result over RESULT_MAX are 413; not a JSON object is 400', async () => {
  await start()
  expect((await call('shader', { body: { code: 'x'.repeat(PUSH_MAX) } })).status).toBe(413)
  expect((await call('shader', { body: '[1, 2]' })).status).toBe(400)
  expect((await call('result', { body: { id: 1, png: 'x'.repeat(RESULT_MAX) } })).status).toBe(413)
  expect((await call('result', { body: { id: 1, png: 'x'.repeat(RESULT_MAX - 100) } })).status).toBe(404) // in size; nothing waits
  expect((await call('result', { body: 'not json' })).status).toBe(400)
})

test('rooms: each AI reaches its own room only; no room = main; a newer tab replaces only its own room', async () => {
  await start()
  const eds = { main: await editor(), red: await editor('query', 'red'), blue: await editor('header', 'blue') } // main: no room, as before rooms
  const answers = [call('state'), call('state', { room: 'RED' }), call('state?room=blue'), call('state', { room: 'main' })].map((p) => p.then((r) => r.json()))
  await vi.waitFor(() => expect(Object.values(eds).map((e) => e.asks.length)).toEqual([2, 1, 1]))
  for (const [scene, ed] of Object.entries(eds)) for (const a of ed.asks) await call('result', { body: { id: a.id, ok: true, scene } })
  expect((await Promise.all(answers)).map((a) => a.scene)).toEqual(['main', 'red', 'blue', 'main']) // RED: case folded

  const red2 = await editor('query', 'red')
  await eds.red.ended
  expect([eds.main.named, eds.red.named, eds.blue.named, red2.named]).toEqual([[], ['replaced'], [], []])
  const st = call('shader', { room: 'red', body: { code: CODE } }).then((r) => r.json())
  await vi.waitFor(() => expect(red2.asks).toHaveLength(1))
  await call('result', { body: { id: red2.asks[0].id, ok: true, status: 'Playing' } })
  expect(await st).toMatchObject({ ok: true, status: 'Playing' })
  expect(Object.values(eds).map((e) => e.asks.length)).toEqual([2, 1, 1]) // the other rooms heard nothing
  expect(await (await call('state', { room: 'green' })).json()).toMatchObject({ ok: false, error: expect.stringMatching(/^no G editor open in room green: /) })
})

test('room codes: a bad one is 400 after the token; at most ROOMS_MAX rooms; a closed tab frees its room', async () => {
  await start()
  for (const room of ['a%20b', '..%2Fx', 'a_b', 'x'.repeat(17), '%C3%BC']) expect((await call(`state?room=${room}`)).status, room).toBe(400)
  expect((await call('state', { room: 'a-b' })).status).toBe(400)
  expect((await call('state?room=a%20b', { token: 'nope' })).status).toBe(401) // the token first
  expect((await fetch(`${base}events?token=${TOKEN}&room=a%0Ab`)).status).toBe(400)
  const eds = []
  for (let i = 0; i < ROOMS_MAX; i++) eds.push(await editor('query', `r${i}`))
  expect(eds.every((e) => e.status === 200)).toBe(true)
  expect((await fetch(`${base}events?token=${TOKEN}&room=extra`)).status).toBe(503)
  expect((await editor('query', 'r0')).status).toBe(200) // a newer tab in an open room still joins it
  eds[1].close()
  await vi.waitFor(async () => expect((await editor('query', 'extra')).status).toBe(200))
})
