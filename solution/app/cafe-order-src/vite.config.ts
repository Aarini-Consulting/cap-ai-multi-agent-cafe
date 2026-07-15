import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: '/cafe-order/',
  build: {
    outDir: path.resolve(__dirname, '../cafe-order'),
    emptyDir: true
  },
  server: {
    port: 3001,
    proxy: {
      '/api': { target: 'http://localhost:4004', changeOrigin: true }
    }
  }
});
