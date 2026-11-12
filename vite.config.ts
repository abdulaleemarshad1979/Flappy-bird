import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // relative asset paths: works on any static host / Vercel root
  build: {
    chunkSizeWarningLimit: 1500, // Phaser alone is ~1.2 MB minified
    rollupOptions: {
      output: { manualChunks: (id) => (id.includes('node_modules/phaser') ? 'phaser' : undefined) },
    },
  },
});
