import { defineConfig } from 'vite';
// Relative assets let reviewers serve the artifact at any subpath. This build
// is deliberately NOT wired into the production Pages publication workflow.
export default defineConfig({ base: './', build: { outDir: 'build', emptyOutDir: true } });
