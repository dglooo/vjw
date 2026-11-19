import react from '@vitejs/plugin-react'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

/** Dev only: web/scene-marks.json, the editor list's marks (library.ts), for the lead to act on. GET reads it (`null`
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

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), sceneMarks],
  // The segmentation worker is classic (plan_camera S0.2, G1): MediaPipe's loader importScripts the self-hosted
  // wasm glue from public/, which a module worker can't do — Vite dev rewrites its import() fallback with ?import
  // and the dev server refuses to transform /public files.
  worker: { format: 'iife' },
  // The dep scanner doesn't crawl worklet imports (plan S1.2) nor the copied vs3 scenes (vs3/kit/): a bare import
  // found at runtime re-optimizes and fails that scene's first load with a 504 (guide_vs3_port.md § 3).
  optimizeDeps: { include: ['fft.js', 'three/examples/jsm/postprocessing/Pass.js'] },
  test: { environment: 'node', include: ['src/**/*.test.ts'], testTimeout: 20_000 }, // synthetic-audio tests take ≤ 2.6 s idle, up to ~4× that on a loaded machine; the 5 s default flaked
})
