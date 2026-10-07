import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';

const KEY = 'orbity-dialoga-progress-v1';
const source = readFileSync(new URL('../../dist/course.js', import.meta.url), 'utf8');
const { lessons } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const correct = lessons.find((lesson) => lesson.id === 'needs-1').quiz.correct[0];
const raw = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const initial = () => ({ completed: { 'map-1': 1000 }, answers: { 'map-1': 1 },
  notes: { 'map-1': 'KEEP · pending restore' }, review: { 'map-1': 2000 },
  missionSteps: { 'listen-ten': [true, false, true] }, focusModule: 'needs',
  currentLessonId: 'needs-1', guidedFlow: { topic: 'needs', step: 0 } });
const restored = () => ({ completed: { 'listening-1': 3000 }, answers: { 'listening-1': 0 },
  notes: { 'conflict-1': 'RESTORED · pending restore' }, review: { 'listening-1': 4000 },
  missionSteps: { 'listen-ten': [false, true, true] }, focusModule: 'conflict',
  currentLessonId: 'conflict-3', guidedFlow: { topic: 'conflict', step: 2 } });
const upload = () => ({ name: 'pending-restore.json', mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify({ ...restored(), version: 1 })) });

async function setup(page, context, lang) {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/?lang=${lang}#guided/needs`);
  await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: KEY, value: initial() });
  await page.reload();
  await expect(page.locator('.lesson-top')).toContainText('1/3');

  const holder = await context.newPage();
  await holder.goto(`/?lang=${lang === 'ru' ? 'en' : 'ru'}#path`);
  await expect(holder.locator('#unit')).toBeEnabled();
  await holder.evaluate((key) => {
    window.pendingRestoreLockReady = false;
    navigator.locks.request(key, () => {
      window.pendingRestoreLockReady = true;
      return new Promise((resolve) => { window.releasePendingRestoreLock = resolve; });
    });
  }, KEY);
  await expect.poll(() => holder.evaluate(() => window.pendingRestoreLockReady)).toBe(true);
  return holder;
}

for (const lang of ['ru', 'en']) {
  test(`pending restore ${lang}: file restore is unavailable until the queued guided write settles`, async ({ page, context }, info) => {
    const holder = await setup(page, context, lang);
    let dialogs = 0;
    page.on('dialog', async (dialog) => { dialogs++; await dialog.dismiss(); });

    try {
      await page.locator('.choice').nth(correct).click();
      await page.getByRole('button', { name: lang === 'ru' ? 'Проверить ответ' : 'Check answer', exact: true }).click();
      await expect(page.getByRole('button', { name: lang === 'ru' ? 'Сохраняем…' : 'Saving…', exact: true })).toBeDisabled();
      await page.getByRole('button', { name: lang === 'ru' ? 'Прогресс' : 'Progress', exact: true }).click();
      await expect(page).toHaveURL(/#progress$/);

      const restoreButton = page.getByRole('button', { name: lang === 'ru' ? 'Восстановить из файла' : 'Restore from file', exact: true });
      const fileInput = page.locator('input[type=file]');
      await expect(fileInput).toBeAttached();
      await page.evaluate(() => {
        const input = document.querySelector('input[type=file]');
        const original = input.click.bind(input);
        window.pendingRestorePickerCalls = 0;
        input.click = () => { window.pendingRestorePickerCalls++; return original(); };
      });
      await expect(restoreButton).toBeDisabled();
      await expect(fileInput).toBeDisabled();
      await restoreButton.evaluate((button) => button.click());
      expect(await page.evaluate(() => window.pendingRestorePickerCalls)).toBe(0);

      // Defense in depth: even a programmatic file assignment must not start import while pending.
      await fileInput.setInputFiles(upload());
      await page.waitForTimeout(50);
      expect(dialogs).toBe(0);
      await expect(fileInput).toHaveValue('');
      expect(await raw(page)).toBe(JSON.stringify(initial()));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const violations = (await new AxeBuilder({ page }).analyze()).violations;
      expect(violations.filter((v) => ['serious', 'critical'].includes(v.impact))).toEqual([]);
      await page.screenshot({ path: info.outputPath(`pending-restore-disabled-${lang}-320.png`), fullPage: true });
    } finally {
      await holder.evaluate(() => window.releasePendingRestoreLock?.());
    }

    await expect.poll(() => raw(page)).toBe(JSON.stringify({ ...initial(), guidedFlow: { topic: 'needs', step: 1 } }));
    const restoreButton = page.getByRole('button', { name: lang === 'ru' ? 'Восстановить из файла' : 'Restore from file', exact: true });
    const fileInput = page.locator('input[type=file]');
    await expect(restoreButton).toBeEnabled();
    await expect(fileInput).toBeEnabled();

    page.removeAllListeners('dialog');
    page.once('dialog', (dialog) => dialog.accept());
    await fileInput.setInputFiles(upload());
    await expect(page.locator('.notice')).toHaveText(lang === 'ru' ? 'Резервная копия восстановлена.' : 'Backup restored.');
    expect(await raw(page)).toBe(JSON.stringify(restored()));

    await page.getByRole('button', { name: lang === 'ru' ? 'Маршрут' : 'Learn', exact: true }).click();
    await expect(page.locator('#unit')).toHaveValue('conflict');
    await expect(page.getByTestId('xp')).toContainText('20 XP');
    expect(await raw(page)).toBe(JSON.stringify(restored()));

    await page.getByTestId('resume').click();
    await expect(page).toHaveURL(/#guided\/conflict$/);
    await expect(page.locator('.lesson-top')).toContainText('3/3');
    expect(await raw(page)).toBe(JSON.stringify(restored()));
    await page.screenshot({ path: info.outputPath(`pending-restore-complete-${lang}-320.png`), fullPage: true });
  });
}
