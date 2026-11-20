// The remote AI relay (deploy/ai-relay.mjs) on an ephemeral port: the token, the size caps, one editor at a time, and
// each ask paired with its answer by id. Here, not beside the relay: the gate (npm test) runs src/ only.
import { afterEach, expect, test, vi } from 'vitest'
// @ts-expect-error -- a plain .mjs (the server copies one file), so no types: its exports are `any` here
import { PUSH_MAX, relay, RESULT_MAX } from '../../deploy/ai-relay.mjs'

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

/** The CLI's call: JSON in (a string goes as it is), the token as a bearer header. */
const call = (path: string, { token = TOKEN, body }: { token?: string; body?: unknown } = {}) =>
  fetch(base + path, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(body !== undefined && { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }),
  })

/** A G editor on the event stream (the token as EventSource sends it, in the query, or as a header): the asks and the
 *  named events as they come, and `ended` once the stream closes. */
async function editor(how: 'query' | 'header' = 'query') {
  const r = await fetch(`${base}events${how === 'query' ? `?token=${TOKEN}` : ''}`, { headers: how === 'header' ? { authorization: `Bearer ${TOKEN}` } : {} })
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
  return { status: r.status, type: r.headers.get('content-type'), asks, named, ended }
}

test('the token: required at start (24+ chars), then on every call; ?token= only on the event stream', async () => {
  expect(() => relay({ token: 'too-short' })).toThrow(/24 or more/)
  expect(() => relay({})).toThrow(/VJW_AI_TOKEN/)
  await start()
  for (const token of ['', 'x', `${TOKEN}x`, TOKEN.slice(0, -1)]) expect((await call('state', { token })).status).toBe(401)
  expect((await call('shader', { token: 'nope', body: { code: CODE } })).status).toBe(401)
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
  expect(await (await call('state')).json()).toMatchObject({ ok: false, error: expect.stringMatching(/^no G editor open/) })
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

test('one editor at a time: a new one replaces the old, which hears so and closes', async () => {
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
