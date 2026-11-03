import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: { include: ['fft.js'] }, // the dep scanner doesn't crawl worklet imports (plan S1.2)
  test: { environment: 'node', include: ['src/**/*.test.ts'], testTimeout: 20_000 }, // synthetic-audio tests take ≤ 2.6 s idle, up to ~4× that on a loaded machine; the 5 s default flaked
})
