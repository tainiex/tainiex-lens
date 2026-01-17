/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
        dedupe: ['react', 'react-dom'],
    },
    plugins: [react()],
    server: {
        host: true,
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
                                cookie =>
                                    cookie
                                        .replace(/; secure/gi, '')
                                        .replace(/; SameSite=None/gi, '')
                            );
                        }
                    });
                },
            },
            '/socket.io': {
                target: 'http://localhost:2020',
                changeOrigin: true,
                ws: true,
                configure: (proxy, _options) => {
                    proxy.on('error', (err, _req, _res) => {
                        if (err.message.includes('ECONNRESET') || err.message.includes('EPIPE')) {
                            // Ignore these common socket errors during hot reload/reconnect
                            return;
                        }
                        console.error('Proxy error:', err);
                    });
                },
            },
        },
    },
    optimizeDeps: {
        include: [
            'react-syntax-highlighter',
            'react-syntax-highlighter/dist/esm/styles/prism',
            'react-syntax-highlighter/dist/esm/languages/prism/typescript',
            'react-syntax-highlighter/dist/esm/languages/prism/javascript',
            'react-syntax-highlighter/dist/esm/languages/prism/python',
            'react-syntax-highlighter/dist/esm/languages/prism/bash',
            'react-syntax-highlighter/dist/esm/languages/prism/json',
            'react-syntax-highlighter/dist/esm/languages/prism/yaml',
            'react-syntax-highlighter/dist/esm/languages/prism/markdown',
            'react-syntax-highlighter/dist/esm/languages/prism/sql',
            'react-syntax-highlighter/dist/esm/languages/prism/java',
            'react-syntax-highlighter/dist/esm/languages/prism/cpp',
            'react-syntax-highlighter/dist/esm/languages/prism/c',
            'react-syntax-highlighter/dist/esm/languages/prism/csharp',
            'react-syntax-highlighter/dist/esm/languages/prism/go',
            'react-syntax-highlighter/dist/esm/languages/prism/rust',
            'react-syntax-highlighter/dist/esm/languages/prism/css',
        ],
    },
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: [],
    },
});
