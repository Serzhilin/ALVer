import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// VITE_ALLOWED_HOSTS — comma-separated extra hosts (e.g. your ngrok domain)
const extraHosts = process.env.VITE_ALLOWED_HOSTS
  ? process.env.VITE_ALLOWED_HOSTS.split(',').map(h => h.trim()).filter(Boolean)
  : []

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    host: true,
    allowedHosts: extraHosts.length > 0 ? extraHosts : true,
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.VITE_API_PORT || 3001}`,
        changeOrigin: true,
      },
    },
  },
})
