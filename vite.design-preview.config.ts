import path from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  build: {
    outDir: '.tmp/design-preview',
    emptyOutDir: true,
    reportCompressedSize: false,
    rolldownOptions: {
      input: {
        logo: path.resolve(import.meta.dirname, 'logo-preview.html'),
      },
    },
  },
})
