import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: '/kitchen-mgr/',
  build: {
    outDir: path.resolve(__dirname, '../kitchen-mgr'),
    emptyDir: true
  },
  server: {
    port: 3003,
    proxy: {
      '/api': { target: 'http://localhost:4004', changeOrigin: true }
    }
  }
});
