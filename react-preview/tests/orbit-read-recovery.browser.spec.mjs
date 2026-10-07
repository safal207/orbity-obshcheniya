import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';

const KEY = 'orbity-dialoga-progress-v1';
const load = (path) => import(`data:text/javascript;base64,${Buffer.from(readFileSync(new URL(path, import.meta.url), 'utf8')).toString('base64')}`);
const courses = { ru: await load('../../dist/course.js'), en: await load('../../dist/course.en.js') };
const raw = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const saved = (focusModule = 'listening') => ({ completed: { 'map-1': 1000 }, answers: { 'map-1': 1 },
  notes: { 'map-1': 'KEEP · synthetic reflection' }, review: { 'map-1': 2000 },
  missionSteps: { 'listen-ten': [true, false, true] }, focusModule,
  currentLessonId: 'needs-1', guidedFlow: { topic: 'needs', step: 1 } });
const again = (page, lang) => page.getByRole('button', { name: lang === 'ru' ? 'Проверить снова' : 'Check again', exact: true });
async function setup(page, context, lang, rejectWrite = false) {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/?lang=${lang}#path`);
  await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: KEY, value: saved() });
  await page.reload();
  await expect(page.locator('#unit')).toHaveValue('listening');
  const witness = await context.newPage();
  await witness.goto(`/?lang=${lang === 'ru' ? 'en' : 'ru'}#path`);
  await expect(witness.locator('#unit')).toHaveValue('listening');
  await page.evaluate(({ key, rejectWrite }) => {
    const get = Storage.prototype.getItem; const set = Storage.prototype.setItem;
    let blocked = false;
    window.orbitRecoveryWrites = 0;
    window.orbitRecoveryReadFailures = 0;
    window.orbitRecoveryWriteAttempts = 0;
    window.restoreOrbitRecoveryReads = () => { blocked = false; };
    Storage.prototype.setItem = function (k, value) {
      if (this === localStorage && k === key) {
        window.orbitRecoveryWriteAttempts++;
        if (rejectWrite) throw new DOMException('Synthetic write rejection', 'QuotaExceededError');
      }
      const result = set.call(this, k, value);
      if (this === localStorage && k === key) { window.orbitRecoveryWrites++; blocked = true; }
      return result;
    };
    Storage.prototype.getItem = function (k) {
      if (this === localStorage && k === key && blocked) {
        window.orbitRecoveryReadFailures++;
        throw new DOMException('Synthetic post-commit read failure', 'SecurityError');
      }
      return get.call(this, k);
    };
  }, { key: KEY, rejectWrite });
  return witness;
}
async function commitAndLoseRead(page, witness, lang) {
  await page.locator('#unit').selectOption('conflict');
  await expect.poll(() => page.evaluate(() => window.orbitRecoveryReadFailures)).toBeGreaterThan(0);
  await expect(page.getByRole('alert')).toContainText(lang === 'ru' ? 'Не удалось сохранить или прочитать' : 'Storage could not be read or written');
  await expect(page.locator('#unit')).toBeDisabled();
  await expect(page.locator('#unit')).toHaveValue('listening');
  expect(await raw(witness)).toBe(JSON.stringify(saved('conflict')));
  expect(await page.evaluate(() => window.orbitRecoveryWrites)).toBe(1);
}
async function checkOrbit(page, lang, id) {
  await expect(page.locator('#unit')).toHaveValue(id);
  await expect(page.locator('#unit')).toBeEnabled();
  await expect(page.locator('#unit-title')).toHaveText(courses[lang].modules.find((m) => m.id === id).title);
}
async function untouched(page, witness, expected, writes = 1) {
  expect(await raw(page)).toBe(expected);
  expect(await raw(witness)).toBe(expected);
  expect(await page.evaluate(() => window.orbitRecoveryWrites)).toBe(writes);
  expect(await page.evaluate(() => window.orbitRecoveryWriteAttempts)).toBe(1);
}

for (const lang of ['ru', 'en']) {
  for (const newerChoice of [false, true]) {
    test(`orbit read recovery ${lang} ${newerChoice ? 'latest-other-tab' : 'own-commit'}: Check again restores saved orbit without replay at 320px`, async ({ page, context }, info) => {
      const witness = await setup(page, context, lang);
      const errors = []; page.on('pageerror', (error) => errors.push(error.message));
      await commitAndLoseRead(page, witness, lang);
      const failures = await page.evaluate(() => window.orbitRecoveryReadFailures);
      await again(page, lang).click();
      await expect.poll(() => page.evaluate(() => window.orbitRecoveryReadFailures)).toBeGreaterThan(failures);
      await expect(page.getByRole('alert')).toBeVisible();
      await expect(page.locator('#unit')).toBeDisabled();
      expect(await page.evaluate(() => window.orbitRecoveryWrites)).toBe(1);
      const target = newerChoice ? 'needs' : 'conflict';
      if (newerChoice) {
        await witness.locator('#unit').selectOption(target);
        await expect(witness.locator('#unit')).toHaveValue(target);
      } else {
        // An unrelated storage event must not jump the other tab's active orbit.
        await expect(witness.locator('#unit')).toHaveValue('listening');
      }
      const expected = JSON.stringify(saved(target));
      expect(await raw(witness)).toBe(expected);
      await page.evaluate(() => window.restoreOrbitRecoveryReads());
      await again(page, lang).focus(); await page.keyboard.press('Enter');
      await expect(page.getByRole('alert')).toHaveCount(0);
      await checkOrbit(page, lang, target);
      await expect(page.getByTestId('xp')).toContainText('20 XP');
      await untouched(page, witness, expected);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const violations = (await new AxeBuilder({ page }).analyze()).violations;
      expect(violations.filter((v) => ['serious', 'critical'].includes(v.impact))).toEqual([]);
      await page.screenshot({ path: info.outputPath(`orbit-read-recovered-${lang}-${target}-320.png`), fullPage: true });
      await page.getByRole('button', { name: lang === 'ru' ? 'Switch to English' : 'Переключить на русский' }).click();
      await checkOrbit(page, lang === 'ru' ? 'en' : 'ru', target);
      await untouched(page, witness, expected);
      await page.reload(); await checkOrbit(page, lang === 'ru' ? 'en' : 'ru', target);
      expect(await raw(page)).toBe(expected);
      await witness.reload(); await expect(witness.locator('#unit')).toHaveValue(target);
      expect(await raw(witness)).toBe(expected);
      await page.getByTestId('resume').click();
      await expect(page).toHaveURL(/#guided\/needs$/);
      await expect(page.locator('.lesson-top')).toContainText('2/3');
      expect(await raw(page)).toBe(expected);
      expect(errors).toEqual([]);
    });
  }

  test(`orbit read recovery ${lang}: a newer explicit link retains precedence until returning to the path`, async ({ page, context }) => {
    const witness = await setup(page, context, lang);
    await commitAndLoseRead(page, witness, lang);
    await page.evaluate(() => { location.hash = 'module/needs'; });
    await expect(page.locator('#unit')).toHaveValue('needs');
    await page.evaluate(() => window.restoreOrbitRecoveryReads());
    await again(page, lang).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page).toHaveURL(/#module\/needs$/);
    await checkOrbit(page, lang, 'needs');
    const expected = JSON.stringify(saved('conflict'));
    await untouched(page, witness, expected);
    await page.getByRole('button', { name: lang === 'ru' ? 'Маршрут' : 'Learn', exact: true }).click();
    await checkOrbit(page, lang, 'conflict');
    await untouched(page, witness, expected);
  });

  test(`orbit read recovery ${lang}: a rejected write must not schedule recovery of another tab's preference`, async ({ page, context }) => {
    const witness = await setup(page, context, lang, true);
    await page.locator('#unit').selectOption('conflict');
    await expect(page.getByRole('alert')).toBeVisible();
    await checkOrbit(page, lang, 'listening');
    expect(await raw(page)).toBe(JSON.stringify(saved()));
    expect(await page.evaluate(() => window.orbitRecoveryWrites)).toBe(0);
    await witness.locator('#unit').selectOption('needs');
    await expect(witness.locator('#unit')).toHaveValue('needs');
    await again(page, lang).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await checkOrbit(page, lang, 'listening');
    await untouched(page, witness, JSON.stringify(saved('needs')), 0);
  });
}
