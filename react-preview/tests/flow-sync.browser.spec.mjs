import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';

const KEY = 'orbity-dialoga-progress-v1';
const source = readFileSync(new URL('../../dist/course.js', import.meta.url), 'utf8');
const { lessons } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const ids = ['needs-1', 'needs-2', 'needs-3'];
const raw = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const saved = (step) => ({ completed: { 'map-1': 1000 }, answers: { 'map-1': 1 },
  notes: { 'map-1': 'SYNTHETIC KEEP · сохранить' }, review: { 'map-1': 2000 },
  missionSteps: { 'listen-ten': [true, false, true] }, focusModule: 'needs',
  currentLessonId: 'needs-1', guidedFlow: { topic: 'needs', step } });
const recoveryButton = (page, lang) => page.getByRole('button', {
  name: lang === 'ru' ? 'Продолжить с сохранённого вопроса' : 'Continue from the saved question', exact: true,
});
async function instrument(page) {
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    window.flowSyncWrites = 0;
    Storage.prototype.setItem = function (k, value) {
      if (this === localStorage && k === key) window.flowSyncWrites++;
      return original.call(this, k, value);
    };
  }, KEY);
}
async function setup(page, context, lang, step) {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/?lang=${lang}#guided/needs`);
  await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: KEY, value: saved(step) });
  await page.reload();
  await expect(page.locator('.lesson-top')).toContainText(`${step + 1}/3`);
  const second = await context.newPage();
  await second.goto(`/?lang=${lang === 'ru' ? 'en' : 'ru'}#guided/needs`);
  await expect(second.locator('.lesson-top')).toContainText(`${step + 1}/3`);
  await instrument(page); await instrument(second);
  return second;
}
async function answer(page, lang, step) {
  const correct = lessons.find((lesson) => lesson.id === ids[step]).quiz.correct[0];
  await page.locator('.choice').nth(correct).click();
  await page.getByRole('button', { name: lang === 'ru' ? 'Проверить ответ' : 'Check answer', exact: true }).click();
}
async function holdLock(page) {
  await page.evaluate((key) => {
    window.flowSyncLockReady = false;
    navigator.locks.request(key, () => {
      window.flowSyncLockReady = true;
      return new Promise((resolve) => { window.releaseFlowSyncLock = resolve; });
    });
  }, KEY);
  await expect.poll(() => page.evaluate(() => window.flowSyncLockReady)).toBe(true);
}
async function assertQuestion(page, step) {
  if (step < 3) {
    await expect(page.locator('.lesson-top')).toContainText(`${step + 1}/3`);
    await expect(page.locator('.choice[aria-pressed=true]')).toHaveCount(0);
  } else {
    await expect(page.locator('.lesson-top')).toHaveCount(0);
    await expect(page.locator('.lesson-screen progress')).toHaveAttribute('value', '3');
  }
  await expect(page.locator('#page-title')).toBeFocused();
}

for (const lang of ['ru', 'en']) {
  for (const initialStep of [0, 2]) {
    test(`guided sync ${lang} step ${initialStep + 1}: real two-tab conflict is acknowledged without writing at 320px`, async ({ page, context }, info) => {
      const errors = []; page.on('pageerror', (error) => errors.push(error.message));
      const second = await setup(page, context, lang, initialStep);
      await holdLock(second);
      try {
        // Both real UI answers capture the old token while the lock is held.
        // The second tab queues first and must be the sole successful writer.
        await answer(second, lang === 'ru' ? 'en' : 'ru', initialStep);
        await expect(second.locator('.choice').first()).toBeDisabled();
        await answer(page, lang, initialStep);
        await expect(page.locator('.choice').first()).toBeDisabled();
        await expect.poll(() => second.evaluate(async (key) =>
          (await navigator.locks.query()).pending.filter((lock) => lock.name === key).length, KEY)).toBe(2);
      } finally { await second.evaluate(() => window.releaseFlowSyncLock()); }
      const alert = page.getByRole('alert');
      await expect(alert).toContainText(lang === 'ru' ? 'Тема или данные изменились' : 'The topic or data changed');
      await expect(page.locator('.feedback.success')).toHaveCount(0);
      const recover = recoveryButton(page, lang);
      await expect(recover).toBeVisible();
      const expected = JSON.stringify(saved(initialStep + 1));
      expect(await raw(page)).toBe(expected);
      expect(await second.evaluate(() => window.flowSyncWrites)).toBe(1);
      expect(await page.evaluate(() => window.flowSyncWrites)).toBe(0);
      // Receiving fresh state must not silently dismiss the conflict.
      await expect(alert).toBeVisible();
      await page.screenshot({ path: info.outputPath(`flow-conflict-${lang}-${initialStep}-320.png`), fullPage: true });
      await recover.focus(); await page.keyboard.press('Enter');
      await expect(alert).toHaveCount(0);
      await assertQuestion(page, initialStep + 1);
      expect(await raw(page)).toBe(expected);
      expect(await page.evaluate(() => window.flowSyncWrites)).toBe(0);
      expect(await second.evaluate(() => window.flowSyncWrites)).toBe(1);
      await expect(page.getByTestId('xp')).toContainText('20 XP');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const violations = (await new AxeBuilder({ page }).analyze()).violations;
      expect(violations.filter((violation) => ['serious', 'critical'].includes(violation.impact))).toEqual([]);
      await page.screenshot({ path: info.outputPath(`flow-recovered-${lang}-${initialStep}-320.png`), fullPage: true });
      await page.reload(); await assertQuestion(page, initialStep + 1);
      expect(await raw(page)).toBe(expected);
      await expect(page.getByRole('alert')).toHaveCount(0);
      // Recovery also permits the next genuine answer; only its cursor advances.
      if (initialStep === 0) {
        await answer(page, lang, 1);
        await expect(page.locator('.feedback.success')).toBeVisible();
        expect(await raw(page)).toBe(JSON.stringify(saved(2)));
      }
      expect(errors).toEqual([]);
    });
  }

  test(`guided sync ${lang}: acknowledging a saved question never hides an unrelated lock error`, async ({ page, context }) => {
    const second = await setup(page, context, lang, 0);
    await page.evaluate(() => Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined }));
    await answer(page, lang, 0);
    const alert = page.getByRole('alert');
    const message = lang === 'ru' ? 'Безопасное сохранение недоступно' : 'Safe saving is unavailable';
    await expect(alert).toContainText(message);
    await answer(second, lang === 'ru' ? 'en' : 'ru', 0);
    await expect(second.locator('.feedback.success')).toBeVisible();
    const recover = recoveryButton(page, lang);
    await expect(recover).toBeVisible();
    await recover.focus(); await page.keyboard.press('Enter');
    await assertQuestion(page, 1);
    await expect(alert).toContainText(message);
    expect(await raw(page)).toBe(JSON.stringify(saved(1)));
    expect(await page.evaluate(() => window.flowSyncWrites)).toBe(0);
    expect(await second.evaluate(() => window.flowSyncWrites)).toBe(1);
  });
}
