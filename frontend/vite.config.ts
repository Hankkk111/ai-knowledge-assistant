import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Backend that `npm run dev` proxies API calls to (the Express server from
// `npm run dev` in the repo root). Override with API_PROXY_TARGET.
const apiProxyTarget = process.env.API_PROXY_TARGET || 'http://localhost:3000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/chat': apiProxyTarget,
      '/health': apiProxyTarget,
    },
  },
})
