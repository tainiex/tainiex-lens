/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 2000,
    proxy: {
      '/api': {
        target: 'http://localhost:2020',
        changeOrigin: true,
        ws: true,
        configure: (proxy, _options) => {
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            if (proxyRes.headers['set-cookie']) {
              proxyRes.headers['set-cookie'] = proxyRes.headers['set-cookie'].map(
                (cookie) => cookie.replace(/; secure/gi, '').replace(/; SameSite=None/gi, '')
              );
            }
          });
        },
      },
      '/socket.io': {
        target: 'http://localhost:2020',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [],
  },
})
