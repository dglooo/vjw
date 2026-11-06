import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The segmentation worker is classic (plan_camera S0.2, G1): MediaPipe's loader importScripts the self-hosted
  // wasm glue from public/, which a module worker can't do — Vite dev rewrites its import() fallback with ?import
  // and the dev server refuses to transform /public files.
  worker: { format: 'iife' },
  optimizeDeps: { include: ['fft.js'] }, // the dep scanner doesn't crawl worklet imports (plan S1.2)
  test: { environment: 'node', include: ['src/**/*.test.ts'], testTimeout: 20_000 }, // synthetic-audio tests take ≤ 2.6 s idle, up to ~4× that on a loaded machine; the 5 s default flaked
})
