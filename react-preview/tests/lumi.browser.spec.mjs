import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';

const KEY = 'orbity-dialoga-progress-v1';
const source = readFileSync(new URL('../../dist/course.js', import.meta.url), 'utf8');
const { lessons, missions } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const raw = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const serious = async (page) => (await new AxeBuilder({ page }).analyze()).violations
  .filter((v) => ['serious', 'critical'].includes(v.impact));
const fits = async (page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

for (const width of [320, 390, 768, 1280]) {
  test(`Lumi path: RU/EN, loaded art, reduced motion and layout at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    const companion = page.locator('.hero [data-testid=lumi-companion]');
    await expect(companion).toContainText('Луми');
    const portrait = companion.locator('[data-lumi-mood=idle]');
    await expect(portrait).toHaveAttribute('aria-hidden', 'true');
    await expect(portrait.locator('img')).toHaveAttribute('alt', '');
    await expect.poll(() => portrait.locator('img').evaluate((im) => im.complete && im.naturalWidth === 576)).toBe(true);
    await expect(page.locator('#unit option')).toHaveCount(8);
    await expect(page.locator('.path-stop')).toHaveCount(4);
    const before = await raw(page);
    await fits(page);
    if ([320, 1280].includes(width)) expect(await serious(page)).toEqual([]);
    await page.screenshot({ path: info.outputPath(`lumi-path-ru-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Switch to English' }).click();
    await expect(companion).toContainText('Lumi');
    await expect(companion).toContainText('at your own pace');
    expect(await raw(page)).toBe(before); // Rendering and localization are read-only.
    await fits(page);
    if ([320, 1280].includes(width)) expect(await serious(page)).toEqual([]);
    await page.screenshot({ path: info.outputPath(`lumi-path-en-${width}.png`), fullPage: true });
    await page.getByTestId('resume').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#page-title')).toBeFocused();
    await expect(page).toHaveURL(/#lesson\//);
    expect(errors).toEqual([]);
  });
}

for (const lang of ['ru', 'en']) {
  test(`Lumi lesson ${lang}: support on a wrong answer or failed save, joy only after retry persists`, async ({ page }, info) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    // Establish the full-lesson bookmark through the UI before testing save feedback.
    await page.goto(`/?lang=${lang}#lesson/map-1`);
    await page.getByRole('button', { name: lang === 'ru' ? 'Попробуем' : 'Let’s try it' }).click();
    await page.getByRole('button', { name: lang === 'ru' ? 'Проверить понимание' : 'Check understanding' }).click();
    const choice = page.locator('.choice');
    await expect(choice.first()).toBeEnabled();
    const before = await raw(page);
    const check = page.getByRole('button', { name: lang === 'ru' ? 'Проверить ответ' : 'Check answer', exact: true });
    await choice.nth(0).click(); await check.click();
    await expect(page.locator('.feedback.retry [data-lumi-mood=support]')).toBeVisible();
    expect(await raw(page)).toBe(before);
    await fits(page);
    expect(await serious(page)).toEqual([]);
    await page.screenshot({ path: info.outputPath(`lumi-retry-${lang}-320.png`), fullPage: true });

    await page.evaluate((key) => {
      const original = Storage.prototype.setItem;
      window.restoreLumiTestStorage = () => { Storage.prototype.setItem = original; };
      window.lumiRejectedWrites = 0;
      Storage.prototype.setItem = function (k, value) {
        if (this === localStorage && k === key) {
          window.lumiRejectedWrites++;
          throw new DOMException('Synthetic Lumi save rejection', 'QuotaExceededError');
        }
        return original.call(this, k, value);
      };
    }, KEY);
    await choice.nth(1).click(); await check.click();
    await expect(page.locator('.alert [data-lumi-mood=support]')).toBeVisible();
    await expect(page.locator('[data-lumi-mood=success]')).toHaveCount(0);
    expect(await raw(page)).toBe(before);
    expect(await page.evaluate(() => window.lumiRejectedWrites)).toBe(1);
    await fits(page);
    await page.evaluate(() => window.restoreLumiTestStorage());
    await check.click();
    const happy = page.locator('.feedback.success [data-lumi-mood=success]');
    await expect(happy).toBeVisible();
    await expect(happy).toHaveCSS('animation-name', 'none');
    const saved = JSON.parse(await raw(page));
    expect(saved.completed['map-1']).toBeTruthy();
    await expect(page.getByTestId('xp')).toContainText('20 XP');
    await fits(page);
    expect(await serious(page)).toEqual([]);
    await page.screenshot({ path: info.outputPath(`lumi-success-${lang}-320.png`), fullPage: true });
    await page.goto(`/?lang=${lang}#progress`);
    await expect(page.getByTestId('lumi-companion')).toContainText(lang === 'ru' ? 'Пауза' : 'Breaks');
    expect(await raw(page)).toBe(JSON.stringify(saved));
    await fits(page);
    await page.screenshot({ path: info.outputPath(`lumi-progress-${lang}-320.png`), fullPage: true });
  });
}

test('Lumi guided joy waits for the real Web Lock and does not award lesson XP', async ({ page }) => {
  await page.goto('/#start');
  await expect(page.getByTestId('lumi-companion')).toBeVisible();
  await page.locator('[data-topic=needs]').click();
  await expect(page).toHaveURL(/#guided\/needs$/);
  const before = await raw(page);
  await page.evaluate((key) => {
    window.lumiLockReady = false;
    navigator.locks.request(key, () => {
      window.lumiLockReady = true;
      return new Promise((resolve) => { window.releaseLumiLock = resolve; });
    });
  }, KEY);
  await expect.poll(() => page.evaluate(() => window.lumiLockReady)).toBe(true);
  const lesson = lessons.find((l) => l.id === 'needs-1');
  await page.locator('.choice').nth(lesson.quiz.correct[0]).click();
  await page.getByRole('button', { name: 'Проверить ответ', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Сохраняем…', exact: true })).toBeDisabled();
  await expect(page.locator('[data-lumi-mood=success]')).toHaveCount(0);
  expect(await raw(page)).toBe(before);
  await page.evaluate(() => window.releaseLumiLock());
  await expect(page.locator('.feedback.success [data-lumi-mood=success]')).toBeVisible();
  const saved = JSON.parse(await raw(page));
  expect(saved.guidedFlow.step).toBe(1);
  expect(saved.completed).toEqual({});
  expect(saved.notes).toEqual({});
  await expect(page.getByTestId('xp')).toContainText('0 XP');
});

test('a missing portrait does not remove localized guidance or block a lesson', async ({ page }) => {
  await page.route('**/*.webp', (route) => route.abort());
  await page.goto('/');
  const companion = page.locator('.hero [data-testid=lumi-companion]');
  await expect(companion).toContainText('Один маленький шаг');
  await expect(companion.locator('img')).toHaveCount(0);
  await expect(companion.locator('.lumi-fallback')).toBeVisible();
  await page.getByTestId('resume').click();
  await expect(page).toHaveURL(/#lesson\//);
  await expect(page.locator('#page-title')).toBeFocused();
});

test('current navigation has one semantic marker across learning and mission routes', async ({ page }) => {
  for (const [hash, label] of [
    ['path', 'Маршрут'], ['start', 'Маршрут'], ['guided/needs', 'Маршрут'],
    ['lesson/map-1', 'Маршрут'], ['practice/map-1', 'Маршрут'], ['review', 'Маршрут'],
    [`mission/${missions[0].id}`, 'В жизни'], ['progress', 'Прогресс'],
  ]) {
    await page.goto(`/#${hash}`);
    const active = page.locator('nav [aria-current=page]');
    await expect(active).toHaveCount(1);
    await expect(active).toHaveText(new RegExp(label));
    await expect(active).toHaveClass(/active/);
  }
});
