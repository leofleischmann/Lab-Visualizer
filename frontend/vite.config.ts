/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const apiProxy = {
  '/api': {
    target: process.env.API_URL || 'http://localhost:3000',
    // Host-Header NICHT umschreiben, damit er zum Origin des Browsers passt —
    // sonst würde der CSRF-Origin-Check des Backends im Dev-Modus 403 liefern.
    changeOrigin: false,
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
  build: {
    rollupOptions: {
      output: {
        // Getrennte Vendor-Chunks: React Flow ist die mit Abstand größte
        // Abhängigkeit und ändert sich selten — so bleibt sie über App-Updates
        // hinweg im Browser-Cache.
        manualChunks: {
          reactflow: ['@xyflow/react'],
        },
      },
    },
  },
  test: {
    // jsdom, weil der Store localStorage nutzt (zuletzt geöffnetes Projekt).
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    restoreMocks: true,
  },
});
