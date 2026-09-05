import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Production builds use same-origin `/api` and `/media` (Caddy).
// Dev server proxies those paths to the API. Optional VITE_API_BASE is unused
// while the client calls root-absolute `/api/...` paths.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/media': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
