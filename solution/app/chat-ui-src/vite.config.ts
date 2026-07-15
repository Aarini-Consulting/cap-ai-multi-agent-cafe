import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: '/chat-ui/',
  build: {
    outDir: path.resolve(__dirname, '../chat-ui'),
    emptyDir: true
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:4004',
        changeOrigin: true
      }
    }
  }
});
