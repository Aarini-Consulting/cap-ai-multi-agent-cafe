import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: '/grievance-mgr/',
  build: {
    outDir: path.resolve(__dirname, '../grievance-mgr'),
    emptyDir: true
  },
  server: {
    port: 3002,
    proxy: {
      '/api': { target: 'http://localhost:4004', changeOrigin: true }
    }
  }
});
