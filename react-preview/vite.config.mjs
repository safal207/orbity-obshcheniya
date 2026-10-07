import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Relative assets work at the repository's Pages subpath and in review artifacts.
// Keep both public HTML entry points, including bookmarked English hash routes.
export default defineConfig({
  base: './',
  build: {
    outDir: 'build', emptyOutDir: true,
    rolldownOptions: {
      input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        en: fileURLToPath(new URL('./en.html', import.meta.url)),
      },
    },
  },
});
