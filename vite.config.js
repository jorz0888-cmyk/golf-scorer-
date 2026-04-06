import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync } from 'fs'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-og',
      closeBundle() {
        try { copyFileSync('og-image.png', 'dist/og-image.png'); } catch {}
      }
    }
  ],
})
