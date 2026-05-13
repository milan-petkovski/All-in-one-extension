import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    minify: true,
    cssMinify: true,
    reportCompressedSize: false,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        404: resolve(__dirname, '404.html'),
        azurirano: resolve(__dirname, 'azurirano.html'),
        hvala: resolve(__dirname, 'hvala.html'),
        obrisano: resolve(__dirname, 'obrisano.html'),
        privacy: resolve(__dirname, 'privacy.html')
      }
    }
  },
  server: {
    port: 3000,
    open: true
  }
});
