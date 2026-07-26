import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            lib: {
              entry: 'electron/main.ts',
              formats: ['cjs'],
            },
            rollupOptions: {
              external: ['screenshot-desktop', 'tesseract.js', 'electron', 'electron/main'],
              output: {
                entryFileNames: 'main.js',
                format: 'cjs',
              },
            },
          },
        },
      },
      preload: {
        input: 'electron/preload.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              output: {
                entryFileNames: 'preload.js',
                format: 'cjs',
              },
            },
          },
        },
      },
      renderer: {},
    }),
  ],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        overlay: path.resolve(__dirname, 'overlay.html'),
        region: path.resolve(__dirname, 'region.html'),
        mask: path.resolve(__dirname, 'mask.html'),
        pet: path.resolve(__dirname, 'pet.html'),
      },
    },
  },
  server: {
    port: 5173,
  },
})
