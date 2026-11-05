import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';

const here = p => fileURLToPath(new URL(p, import.meta.url));
export default defineConfig({
  root: here('.'),
  plugins: [react()],
  resolve: { alias: { '@studio': here('../studio/src') } },
  build: { outDir: here('dist'), emptyOutDir: true, sourcemap: false, chunkSizeWarningLimit: 1500 },
  server: { port: 5173, proxy: { '/api': { target: 'http://localhost:3001', changeOrigin: false } } },
});
