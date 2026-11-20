import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import type { IncomingMessage } from 'node:http'
import { join } from 'node:path'
import type { Plugin, WebSocketClient } from 'vite'
import { defineConfig } from 'vitest/config'
import { checkExport, checkPush, localOrigin, safeName, SHADER_MAX, writeShader } from './src/shaderfile.ts'

/** Dev only: web/scene-marks.json, the editor list's marks and stars (library.ts), for the lead to act on. GET reads it (`null`
 *  when absent), POST writes it: a JSON object only, so a stray request cannot leave something the app cannot read. */
const sceneMarks: Plugin = {
  name: 'scene-marks',
  apply: 'serve',
  configureServer(server) {
    const file = join(server.config.root, 'scene-marks.json')
    server.middlewares.use('/__marks', (req, res) => {
      const done = (code: number, text = '') => {
        res.statusCode = code
        res.end(text)
      }
      if (req.method !== 'POST') {
        readFile(file, 'utf8').then((t) => done(200, t), (e: NodeJS.ErrnoException) => (e.code === 'ENOENT' ? done(200, 'null') : done(500, String(e))))
        return
      }
      let body = ''
      req.on('data', (c: Buffer) => (body += c))
      req.on('end', () => {
        try {
          const m: unknown = JSON.parse(body)
          if (!m || typeof m !== 'object' || Array.isArray(m)) throw new Error('not an object')
        } catch (e) {
          return done(400, String(e))
        }
        writeFile(file, body).then(() => done(204), (e: unknown) => done(500, String(e)))
      })
    })
  },
}

/** A request's JSON body, at most `max` chars. */
const jsonBody = (req: IncomingMessage, max: number) =>
  new Promise<unknown>((ok, no) => {
    let s = ''
    req.setEncoding('utf8')
    req.on('data', (c: string) => {
      if ((s += c).length <= max) return
      no(new Error(`the body is over ${max} chars`))
      req.destroy()
    })
    req.on('end', () => {
      try {
        ok(JSON.parse(s))
      } catch (e) {
        no(e)
      }
    })
  })
type Answer = { ok: boolean; error?: string; [k: string]: unknown }

/** Dev only: the AI channel (docs/ai-shader-guide.md; user 2026-11-20, variant 1: Claude Code live-codes the user's open G
 *  editor). The open editor (Shader.tsx) announces itself over the HMR socket and answers the asks: `push` compiles the
 *  code as if typed and answers its errors and a still (a PNG data URL, written here into scratchpad/ai/stills/), `state`
 *  the field's code. Exports go into web/user-shaders/ (git-ignored). GLSL text only, never run here; JSON bodies only and
 *  no other site's page (localOrigin): a page elsewhere could send a simple POST without a CORS preflight. */
const aiChannel: Plugin = {
  name: 'ai-channel',
  apply: 'serve',
  configureServer(server) {
    const root = server.config.root
    const dir = join(root, 'user-shaders')
    const stills = join(root, '..', 'scratchpad', 'ai', 'stills') // ponytail: never pruned (≈ 100 KB a push); prune if a long session weighs
    let editor: WebSocketClient | null = null // the page whose G editor opened last
    const waiting = new Map<number, (a: Answer) => void>()
    let asks = 0
    server.ws.on('vjw:ai-editor', (open: boolean, client) => {
      if (open) editor = client
      else if (editor === client) editor = null
    })
    server.ws.on('vjw:ai-reply', (a: Answer & { id: number }) => waiting.get(a.id)?.(a))
    /** One ask to the open editor: its answer, or why none came. */
    const ask = (what: 'push' | 'state', data = {}) =>
      new Promise<Answer>((done) => {
        if (!editor || editor.socket.readyState !== editor.socket.OPEN) return done({ ok: false, error: 'no G editor open' })
        const id = ++asks
        const end = (a: Answer) => (clearTimeout(t), waiting.delete(id), done(a))
        const t = setTimeout(() => end({ ok: false, error: 'the G editor did not answer in 10 s' }), 10_000)
        waiting.set(id, end)
        editor.send('vjw:ai', { id, what, ...data })
      })
    server.middlewares.use('/__ai', (req, res) => {
      const send = (status: number, body: unknown, type = 'application/json') => {
        res.statusCode = status
        res.setHeader('content-type', `${type}; charset=utf-8`)
        res.end(typeof body === 'string' ? body : JSON.stringify(body))
      }
      const fail = (status: number, error: string) => send(status, { ok: false, error })
      if (!localOrigin(req.headers.origin)) return fail(403, 'only from this machine')
      const url = new URL(req.url ?? '/', 'http://localhost')
      const route = `${req.method} ${url.pathname}`
      const handle = async () => {
        if (route === 'GET /guide') return send(200, await readFile(join(root, '..', 'docs', 'ai-shader-guide.md'), 'utf8'), 'text/markdown')
        if (route === 'GET /state') return send(200, await ask('state'))
        if (route === 'GET /list') {
          const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith('.glsl'))
          const at = await Promise.all(files.map(async (f) => (await stat(join(dir, f))).mtimeMs))
          return send(200, { ok: true, files: files.map((f, i) => [at[i], f] as const).sort((a, b) => b[0] - a[0]).map(([, f]) => f) }) // newest first
        }
        if (route === 'GET /file') {
          const f = url.searchParams.get('name') ?? ''
          const stem = f.endsWith('.glsl') ? f.slice(0, -5) : ''
          if (!stem || safeName(stem) !== stem) return fail(400, 'name: a file from GET /__ai/list')
          const text = await readFile(join(dir, f), 'utf8').catch(() => null)
          return text === null ? fail(404, `no ${f}`) : send(200, text, 'text/plain')
        }
        if (req.method !== 'POST' || (route !== 'POST /shader' && route !== 'POST /export')) return fail(404, `no ${route}: see GET /__ai/guide`)
        if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') return fail(415, 'send JSON (content-type: application/json)')
        let body: unknown
        try {
          body = await jsonBody(req, 4 * SHADER_MAX) // JSON escapes: up to ~2x the code
        } catch (e) {
          return fail(400, (e as Error).message)
        }
        if (route === 'POST /shader') {
          const p = checkPush(body)
          if (typeof p === 'string') return fail(400, p)
          const { png, ...a } = await ask('push', p)
          if (typeof png === 'string' && png.startsWith('data:image/png;base64,')) {
            await mkdir(stills, { recursive: true })
            a.still = join(stills, `still-${Date.now()}.png`)
            await writeFile(a.still as string, Buffer.from(png.slice('data:image/png;base64,'.length), 'base64'))
          }
          return send(200, a)
        }
        const e = checkExport(body)
        if (typeof e === 'string') return fail(400, e)
        const file = join(dir, `${e.file}.glsl`)
        if (!e.overwrite && (await stat(file).catch(() => null))) return fail(409, `${e.file}.glsl exists: export with overwrite`)
        const s = await ask('state')
        if (!s.ok) return send(200, s)
        const c = checkPush({ code: s.code })
        if (typeof c === 'string') return fail(400, `the editor's ${c}`)
        await mkdir(dir, { recursive: true })
        await writeFile(file, writeShader(c.code, { name: e.name, author: s.author === 'user' ? 'user' : 'AI', date: new Date().toISOString(), source: typeof s.source === 'string' ? s.source : undefined }))
        return send(200, { ok: true, file })
      }
      handle().catch((e: unknown) => fail(500, String(e)))
    })
  },
}

/** A build's default marks and stars (library.ts createLibrary `baked`, user 2026-11-20): web/scene-marks.json, the dev
 *  mirror of the user's curation, as a JSON expression; `null` without one (git-ignored: a fresh clone, CI). */
function marks() {
  try {
    return JSON.stringify(JSON.parse(readFileSync(new URL('./scene-marks.json', import.meta.url), 'utf8')))
  } catch {
    return 'null'
  }
}

// https://vite.dev/config/
export default defineConfig({
  define: { __VJW_MARKS__: marks() },
  // The deploy's secret sub-path (deploy/README.md): VJW_BASE=/<slug>/ npm run build. Code reaches public/ through
  // import.meta.env.BASE_URL, never a bare '/'.
  base: process.env.VJW_BASE || '/',
  plugins: [react(), sceneMarks, aiChannel],
  // The segmentation worker is classic (plan_camera S0.2, G1): MediaPipe's loader importScripts the self-hosted
  // wasm glue from public/, which a module worker can't do — Vite dev rewrites its import() fallback with ?import
  // and the dev server refuses to transform /public files.
  worker: { format: 'iife' },
  // The dep scanner doesn't crawl worklet imports (plan S1.2) nor the copied vs3 scenes (vs3/kit/): a bare import
  // found at runtime re-optimizes and fails that scene's first load with a 504 (guide_vs3_port.md § 3).
  optimizeDeps: { include: ['fft.js', 'three/examples/jsm/postprocessing/Pass.js', 'three/examples/jsm/libs/fflate.module.js', 'three/examples/jsm/utils/BufferGeometryUtils.js'] },
  test: { environment: 'node', include: ['src/**/*.test.ts'], testTimeout: 20_000 }, // synthetic-audio tests take ≤ 2.6 s idle, up to ~4× that on a loaded machine; the 5 s default flaked
})
