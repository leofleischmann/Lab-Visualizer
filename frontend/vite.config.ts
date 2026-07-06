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
});
