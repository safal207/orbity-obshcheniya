import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';

const KEY = 'orbity-dialoga-progress-v1';
const source = readFileSync(new URL('../../dist/course.js', import.meta.url), 'utf8');
const { lessons } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const correct = lessons.find((lesson) => lesson.id === 'needs-1').quiz.correct[0];
const raw = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const saved = (step = 0) => ({ completed: { 'map-1': 1000 }, answers: { 'map-1': 1 },
  notes: { 'map-1': 'KEEP · synthetic reflection' }, review: { 'map-1': 2000 },
  missionSteps: { 'listen-ten': [true, false, true] }, focusModule: 'needs',
  currentLessonId: 'needs-1', guidedFlow: { topic: 'needs', step } });

async function setup(page, context, lang) {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/?lang=${lang}#guided/needs`);
  await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: KEY, value: saved() });
  await page.reload();
  await expect(page.locator('.lesson-top')).toContainText('1/3');
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    window.pendingExportWrites = 0;
    Storage.prototype.setItem = function (k, value) {
      const result = original.call(this, k, value);
      if (this === localStorage && k === key) window.pendingExportWrites++;
      return result;
    };
  }, KEY);
  const holder = await context.newPage();
  await holder.goto(`/?lang=${lang === 'ru' ? 'en' : 'ru'}#path`);
  await expect(holder.locator('#unit')).toBeEnabled();
  await holder.evaluate((key) => {
    window.pendingExportLockReady = false;
    navigator.locks.request(key, () => {
      window.pendingExportLockReady = true;
      return new Promise((resolve) => { window.releasePendingExportLock = resolve; });
    });
  }, KEY);
  await expect.poll(() => holder.evaluate(() => window.pendingExportLockReady)).toBe(true);
  return holder;
}
const release = (holder) => holder.evaluate(() => window.releasePendingExportLock?.());

for (const lang of ['ru', 'en']) {
  test(`pending export ${lang}: backup stays disabled until the queued guided write is committed`, async ({ page, context }, info) => {
    const holder = await setup(page, context, lang);
    const before = await raw(page);
    try {
      await page.locator('.choice').nth(correct).click();
      await page.getByRole('button', { name: lang === 'ru' ? 'Проверить ответ' : 'Check answer', exact: true }).click();
      await expect(page.getByRole('button', { name: lang === 'ru' ? 'Сохраняем…' : 'Saving…', exact: true })).toBeDisabled();
      await page.getByRole('button', { name: lang === 'ru' ? 'Прогресс' : 'Progress', exact: true }).click();
      await expect(page).toHaveURL(/#progress$/);
      const exportButton = page.getByRole('button', { name: lang === 'ru' ? 'Скачать копию' : 'Export backup', exact: true });
      await expect(exportButton).toBeDisabled();
      expect(await raw(page)).toBe(before);
      expect(await page.evaluate(() => window.pendingExportWrites)).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const violations = (await new AxeBuilder({ page }).analyze()).violations;
      expect(violations.filter((v) => ['serious', 'critical'].includes(v.impact))).toEqual([]);
      await page.screenshot({ path: info.outputPath(`pending-export-disabled-${lang}-320.png`), fullPage: true });
    } finally { await release(holder); }

    const expected = JSON.stringify(saved(1));
    await expect.poll(() => raw(page)).toBe(expected);
    expect(await page.evaluate(() => window.pendingExportWrites)).toBe(1);
    const exportButton = page.getByRole('button', { name: lang === 'ru' ? 'Скачать копию' : 'Export backup', exact: true });
    await expect(exportButton).toBeEnabled();

    const downloadPromise = page.waitForEvent('download');
    await exportButton.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('orbity-progress-v1.json');
    const path = await download.path();
    const parsed = JSON.parse(await readFile(path, 'utf8'));
    const { version, savedAt, ...payload } = parsed;
    expect(version).toBe(1);
    expect(Number.isFinite(Date.parse(savedAt))).toBe(true);
    expect(payload).toEqual(saved(1));
    expect(await raw(page)).toBe(expected);
    expect(await page.evaluate(() => window.pendingExportWrites)).toBe(1);
    await page.screenshot({ path: info.outputPath(`pending-export-ready-${lang}-320.png`), fullPage: true });

    await page.reload();
    await expect(page.getByTestId('xp-total')).toHaveText('20');
    expect(await raw(page)).toBe(expected);
  });
}
