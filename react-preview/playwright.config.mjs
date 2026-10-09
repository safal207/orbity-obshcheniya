import { defineConfig } from '@playwright/test';

const browserName = process.env.PW_BROWSER || 'chromium';
const outputDir = process.env.PW_OUTPUT_DIR || 'test-results';
const htmlOutput = process.env.PW_HTML_DIR || 'playwright-report';

export default defineConfig({
  testDir: './tests', testMatch: ['browser.spec.mjs', 'navigation.browser.spec.mjs', 'accessibility.browser.spec.mjs', 'lumi.browser.spec.mjs', 'hero-lumi.browser.spec.mjs', 'home-action.browser.spec.mjs', 'quick-help-copy.browser.spec.mjs', 'quiz-feedback.browser.spec.mjs', 'haptics-settings.browser.spec.mjs', 'orbit.browser.spec.mjs', 'backup-orbit.browser.spec.mjs', 'path-return.browser.spec.mjs', 'flow-sync.browser.spec.mjs', 'guided-restart.browser.spec.mjs', 'pending-unload.browser.spec.mjs', 'lesson-start.browser.spec.mjs', 'read-after-write.browser.spec.mjs', 'orbit-read-recovery.browser.spec.mjs', 'pending-export.browser.spec.mjs', 'pending-restore.browser.spec.mjs', 'review.browser.spec.mjs', 'release-entry.browser.spec.mjs'], workers: 1, retries: 0,
  timeout: 30000, outputDir, reporter: [['list'], ['html', { open: 'never', outputFolder: htmlOutput }]],
  use: { baseURL: 'http://127.0.0.1:4173', browserName, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'npm run preview -- --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: false },
});
