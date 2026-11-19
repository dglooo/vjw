import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

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
  plugins: [react(), sceneMarks],
  // The segmentation worker is classic (plan_camera S0.2, G1): MediaPipe's loader importScripts the self-hosted
  // wasm glue from public/, which a module worker can't do — Vite dev rewrites its import() fallback with ?import
  // and the dev server refuses to transform /public files.
  worker: { format: 'iife' },
  // The dep scanner doesn't crawl worklet imports (plan S1.2) nor the copied vs3 scenes (vs3/kit/): a bare import
  // found at runtime re-optimizes and fails that scene's first load with a 504 (guide_vs3_port.md § 3).
  optimizeDeps: { include: ['fft.js', 'three/examples/jsm/postprocessing/Pass.js', 'three/examples/jsm/libs/fflate.module.js', 'three/examples/jsm/utils/BufferGeometryUtils.js'] },
  test: { environment: 'node', include: ['src/**/*.test.ts'], testTimeout: 20_000 }, // synthetic-audio tests take ≤ 2.6 s idle, up to ~4× that on a loaded machine; the 5 s default flaked
})
