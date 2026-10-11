import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    // The API runs on :8000 in development. Proxying keeps it same-origin, so no CORS locally.
    proxy: { '/api': 'http://localhost:8000' },
  },
  build: {
    // The lazy map chunk holds MapLibre and deck.gl, about 1.5 MB before gzip; that's expected.
    chunkSizeWarningLimit: 1600,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
