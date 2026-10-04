import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: ['browser.spec.mjs', 'navigation.browser.spec.mjs', 'accessibility.browser.spec.mjs', 'lumi.browser.spec.mjs', 'orbit.browser.spec.mjs', 'backup-orbit.browser.spec.mjs', 'path-return.browser.spec.mjs'], workers: 1, retries: 0,
  timeout: 30000, reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:4173', browserName: 'chromium', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'npm run preview -- --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: false },
});
