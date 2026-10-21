import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/uploads': 'http://127.0.0.1:3000',
    },
  },
  build: {
    target: 'es2022',
    cssCodeSplit: false,
  },
  test: {
    environment: 'happy-dom',
    include: ['tests/unit/**/*.test.js'],
  },
});
