import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'public', // Outputs index.html directly inside public/
    emptyOutDir: false,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
});