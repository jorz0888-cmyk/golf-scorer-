import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, existsSync } from 'fs'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-pwa-assets',
      closeBundle() {
        const files = ['og-image.png', 'icon-192.png', 'icon-512.png', 'manifest.json', 'sw.js'];
        files.forEach(f => {
          try { if (existsSync(f)) copyFileSync(f, `dist/${f}`); } catch {}
        });
      }
    }
  ],
})
