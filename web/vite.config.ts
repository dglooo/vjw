import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: { include: ['fft.js'] }, // the dep scanner doesn't crawl worklet imports (plan S1.2)
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
