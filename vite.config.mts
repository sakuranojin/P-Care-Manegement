import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: 'client',
  plugins: [react()],
  resolve: { alias: { '@shared': here('./shared') } },
  build: { outDir: here('./dist/client'), emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000',
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
});
