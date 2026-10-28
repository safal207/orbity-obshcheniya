import { defineConfig } from '@playwright/test';

const browserName = process.env.PW_BROWSER || 'chromium';
const outputDir = process.env.PW_OUTPUT_DIR || 'test-results';
const htmlOutput = process.env.PW_HTML_DIR || 'playwright-report';

export default defineConfig({
  testDir: './tests', testMatch: ['browser.spec.mjs', '*.browser.spec.mjs'], workers: 1, retries: 0,
  timeout: 30000, outputDir, reporter: [['list'], ['html', { open: 'never', outputFolder: htmlOutput }]],
  use: { baseURL: 'http://127.0.0.1:4173', browserName, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'npm run preview -- --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: false },
});
