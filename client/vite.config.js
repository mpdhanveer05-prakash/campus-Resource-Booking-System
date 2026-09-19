import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Keeps browser requests same-origin: the app only ever calls relative /api
    // URLs, and this proxy forwards them to the Express API in development.
    // The deployed reverse proxy performs the equivalent routing.
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
