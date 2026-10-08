import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { HAPTICS_KEY } from '../haptics.mjs';

const PROGRESS_KEY = 'orbity-dialoga-progress-v1';
const raw = (page, key = PROGRESS_KEY) => page.evaluate((key) => localStorage.getItem(key), key);
const fixture = { completed: { 'map-1': 1000 }, answers: { 'map-1': 1 }, notes: { 'map-1': 'KEEP · сохранить' }, review: { 'map-1': 2000 }, missionSteps: { 'listen-ten': [true, false, true] }, focusModule: 'needs', currentLessonId: 'needs-1', guidedFlow: null };
const source = readFileSync(new URL('../../dist/course.js', import.meta.url), 'utf8');
const { lessons } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

async function instrument(page) {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    window.hapticCalls = [];
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value(pattern) {
      window.hapticCalls.push(pattern); return true;
    } });
  });
}
async function settings(page) {
  const panel = page.getByTestId('haptics-settings');
  if (!await panel.evaluate((el) => el.open)) await panel.locator('summary').click();
  return panel;
}

for (const lang of ['ru', 'en']) {
  test(`haptics settings ${lang}: explicit switch overrides reduced motion and survives reload at 320px`, async ({ page }, info) => {
    await instrument(page);
    await page.goto(`/?lang=${lang}`);
    let panel = await settings(page);
    const before = await raw(page);
    await expect(panel.getByRole('switch')).not.toBeChecked();
    expect(await raw(page, HAPTICS_KEY)).toBeNull();
    await panel.getByRole('switch').check();
    expect(await raw(page, HAPTICS_KEY)).toBe('on');
    await panel.getByTestId('haptics-test').click();
    await expect(panel.getByTestId('haptics-result')).toContainText(lang === 'ru' ? 'Браузер принял запрос' : 'browser accepted the request');
    expect(await page.evaluate(() => window.hapticCalls)).toEqual([120]);
    expect(await raw(page)).toBe(before);
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
    const violations = (await new AxeBuilder({ page }).analyze()).violations;
    expect(violations.filter((v) => ['serious', 'critical'].includes(v.impact))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`haptics-settings-${lang}-320.png`), fullPage: true });
    await panel.getByRole('switch').focus(); await page.keyboard.press('Space');
    await expect(panel.getByRole('switch')).not.toBeChecked();
    expect(await page.evaluate(() => window.hapticCalls)).toEqual([120, 0]);
    await page.reload(); panel = await settings(page);
    await expect(panel.getByRole('switch')).not.toBeChecked();
    expect(await page.evaluate(() => window.hapticCalls)).toEqual([]);
    await page.getByRole('button', { name: lang === 'ru' ? 'Switch to English' : 'Переключить на русский' }).click();
    await panel.getByTestId('haptics-test').click();
    await expect(panel.getByTestId('haptics-result')).toContainText(lang === 'ru' ? 'Turn on vibration' : 'Сначала включите');
    expect(await raw(page)).toBe(before);
    expect(await raw(page, HAPTICS_KEY)).toBe('off');
  });
}

for (const [mode, text] of [['missing', 'нет доступного API'], ['blocked', 'отклонил запрос'], ['throws', 'Не удалось отправить']]) {
  test(`haptics diagnostics: ${mode} API gives actionable feedback without touching progress`, async ({ page }) => {
    await instrument(page); await page.goto('/');
    const panel = await settings(page); await panel.getByRole('switch').check();
    await page.evaluate((mode) => {
      const value = mode === 'missing' ? undefined : mode === 'blocked' ? () => false : () => { throw new Error('host denied'); };
      Object.defineProperty(navigator, 'vibrate', { configurable: true, value });
    }, mode);
    const before = await raw(page);
    await panel.getByTestId('haptics-test').click();
    await expect(panel.getByTestId('haptics-result')).toContainText(text);
    expect(await raw(page)).toBe(before);
  });
}

test('haptics preference syncs across two real pages without vibrating the other tab', async ({ page, context }) => {
  await instrument(page); await page.goto('/');
  const second = await context.newPage(); await instrument(second); await second.goto('/?lang=en');
  const firstPanel = await settings(page), secondPanel = await settings(second);
  expect(context.pages()).toHaveLength(2);
  await firstPanel.getByRole('switch').check();
  await expect(secondPanel.getByRole('switch')).toBeChecked();
  expect(await second.evaluate(() => window.hapticCalls)).toEqual([]);
  await secondPanel.getByRole('switch').uncheck();
  await expect(firstPanel.getByRole('switch')).not.toBeChecked();
  expect(await page.evaluate(() => window.hapticCalls)).toEqual([]);
  expect(await raw(page)).toBeNull(); expect(await raw(second)).toBeNull();
  await page.reload(); await expect((await settings(page)).getByRole('switch')).not.toBeChecked();
  expect(await raw(page, HAPTICS_KEY)).toBe('off');
});

test('preference write failure is session-only, not a false saved message', async ({ page }) => {
  await instrument(page); await page.goto('/');
  await page.evaluate(({ key, progress, fixture }) => {
    localStorage.setItem(key, 'off'); localStorage.setItem(progress, JSON.stringify(fixture));
  }, { key: HAPTICS_KEY, progress: PROGRESS_KEY, fixture });
  await page.reload(); const before = await raw(page);
  const panel = await settings(page);
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, value) {
      if (this === localStorage && k === key) throw new DOMException('Synthetic setting quota', 'QuotaExceededError');
      return original.call(this, k, value);
    };
  }, HAPTICS_KEY);
  await panel.getByRole('switch').check();
  await expect(panel.getByTestId('haptics-storage')).toContainText('только в этой вкладке');
  expect(await raw(page, HAPTICS_KEY)).toBe('off');
  await panel.getByTestId('haptics-test').click();
  expect(await page.evaluate(() => window.hapticCalls)).toEqual([120]);
  expect(await raw(page)).toBe(before);
  await page.reload(); await expect((await settings(page)).getByRole('switch')).not.toBeChecked();
  expect(await raw(page)).toBe(before);
});

test('explicit-on learning haptics still require persisted success and preserve existing data', async ({ page }) => {
  await instrument(page); await page.goto('/');
  await page.evaluate(({ key, fixture }) => localStorage.setItem(key, JSON.stringify(fixture)), { key: PROGRESS_KEY, fixture });
  await page.reload(); await (await settings(page)).getByRole('switch').check();
  await page.goto('/#start'); await page.locator('[data-topic=needs]').click();
  // Starting guided mode writes asynchronously. Wait until its own commit has
  // completed before injecting a simulated failure for the following answer.
  await expect(page).toHaveURL(/#guided\/needs$/);
  await expect(page.locator('.lesson-top')).toContainText('1/3');
  const before = await raw(page);
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    window.restoreHapticsProgress = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function (k, value) {
      if (this === localStorage && k === key) throw new DOMException('Synthetic progress quota', 'QuotaExceededError');
      return original.call(this, k, value);
    };
  }, PROGRESS_KEY);
  const answer = lessons.find((l) => l.id === 'needs-1').quiz.correct[0];
  await page.locator('.choice').nth(answer).click();
  await page.getByRole('button', { name: 'Проверить ответ', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(await page.evaluate(() => window.hapticCalls)).toEqual([]);
  expect(await raw(page)).toBe(before);
  await page.evaluate(() => window.restoreHapticsProgress());
  await page.getByRole('button', { name: 'Проверить ответ', exact: true }).click();
  await expect(page.locator('.feedback.success')).toBeVisible();
  expect(await page.evaluate(() => window.hapticCalls)).toEqual([18]);
  const saved = JSON.parse(await raw(page));
  expect(saved.guidedFlow.step).toBe(1);
  for (const key of ['completed', 'answers', 'notes', 'review', 'missionSteps']) expect(saved[key]).toEqual(fixture[key]);
  await expect(page.getByTestId('xp')).toContainText('20 XP');
  await page.reload(); expect(await page.evaluate(() => window.hapticCalls)).toEqual([]);
  await expect(page.locator('.lesson-top')).toContainText('2/3');
  await expect(page.getByTestId('xp')).toContainText('20 XP');
});

test('native API smoke: honest status without substituting navigator.vibrate', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/'); const panel = await settings(page);
  await panel.getByRole('switch').check();
  const before = await raw(page);
  await panel.getByTestId('haptics-test').click();
  await expect(panel.getByTestId('haptics-result')).not.toHaveText('');
  expect(await raw(page)).toBe(before);
  expect(errors).toEqual([]);
  // This is an API/browser check, not evidence of physical vibration in CI.
});
