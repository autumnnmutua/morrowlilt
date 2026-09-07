import { cloudflare } from '@cloudflare/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    react(),
    cloudflare({
      ...(process.env.CLOUDFLARE_DEPLOY_CONFIG
        ? { configPath: process.env.CLOUDFLARE_DEPLOY_CONFIG }
        : {}),
      ...(process.env.MORROWLILT_PERSIST_PATH
        ? { persistState: { path: process.env.MORROWLILT_PERSIST_PATH } }
        : {}),
    }),
  ],
})
