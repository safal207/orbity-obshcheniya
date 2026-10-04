import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const KEY = 'orbity-dialoga-progress-v1';
const raw = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
async function holdLock(page) {
  await page.evaluate((key) => {
    window.backupOrbitLockReady = false;
    navigator.locks.request(key, () => {
      window.backupOrbitLockReady = true;
      return new Promise((resolve) => { window.releaseBackupOrbitLock = resolve; });
    });
  }, KEY);
  await expect.poll(() => page.evaluate(() => window.backupOrbitLockReady)).toBe(true);
}
const releaseLock = (page) => page.evaluate(() => window.releaseBackupOrbitLock?.());
const maps = () => ({ completed: { 'map-1': 1000 }, answers: { 'map-1': 1 },
  notes: { 'map-1': 'SYNTHETIC RESTORED NOTE · восстановлено' }, review: { 'map-1': 2000 },
  missionSteps: { 'listen-ten': [true, false, true] } });
const variants = [
  ['legacy-v1', () => maps(), 'map'],
  ['explicit-null', () => ({ ...maps(), focusModule: null, currentLessonId: 'needs-1',
    guidedFlow: { topic: 'needs', step: 1 } }), 'map'],
  ['explicit-orbit', () => ({ ...maps(), focusModule: 'needs', currentLessonId: 'needs-1',
    guidedFlow: { topic: 'needs', step: 1 } }), 'needs'],
];
const upload = (backup) => ({ name: 'synthetic-backup.json', mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify({ ...backup, version: 1 })) });
const nav = (page, lang, section) => page.getByRole('button', {
  name: section === 'path' ? (lang === 'ru' ? 'Маршрут' : 'Learn') : (lang === 'ru' ? 'Прогресс' : 'Progress'), exact: true,
});
async function openFromAnotherOrbit(page, lang) {
  await page.goto(`/?lang=${lang}`);
  await expect(page.locator('#unit')).toBeEnabled();
  await page.locator('#unit').selectOption('conflict');
  await expect(page.locator('#unit')).toHaveValue('conflict');
  await nav(page, lang, 'progress').click();
  await expect(page.locator('input[type=file]')).toBeAttached();
}

for (const lang of ['ru', 'en']) {
  for (const [name, makeBackup, expectedOrbit] of variants) {
    test(`backup orbit ${lang} ${name}: restored route matches reload without an extra write`, async ({ page }, info) => {
      await page.setViewportSize({ width: 320, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await openFromAnotherOrbit(page, lang);
      const backup = makeBackup();
      const expected = JSON.stringify({ ...maps(), focusModule: null, currentLessonId: null, guidedFlow: null, ...backup });
      page.once('dialog', (dialog) => dialog.accept());
      await page.locator('input[type=file]').setInputFiles(upload(backup));
      await expect(page.locator('.notice')).toContainText(lang === 'ru' ? 'восстановлена' : 'restored');
      expect(await raw(page)).toBe(expected);
      await nav(page, lang, 'path').click();
      await expect(page.locator('#unit')).toHaveValue(expectedOrbit);
      await expect(page.getByTestId('xp')).toContainText('20 XP');
      expect(await raw(page)).toBe(expected);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (name === 'legacy-v1') {
        const violations = (await new AxeBuilder({ page }).analyze()).violations;
        expect(violations.filter((v) => ['serious', 'critical'].includes(v.impact))).toEqual([]);
        await page.screenshot({ path: info.outputPath(`backup-restored-${lang}-320.png`), fullPage: true });
      }
      await page.reload();
      await expect(page.locator('#unit')).toHaveValue(expectedOrbit);
      expect(await raw(page)).toBe(expected);
      await page.getByRole('button', { name: lang === 'ru' ? 'Switch to English' : 'Переключить на русский' }).click();
      await expect(page.locator('#unit')).toHaveValue(expectedOrbit);
      expect(await raw(page)).toBe(expected);
      if (backup.guidedFlow) {
        await page.getByTestId('resume').click();
        await expect(page).toHaveURL(/#guided\/needs$/);
        await expect(page.locator('.lesson-top')).toContainText('2/3');
        expect(await raw(page)).toBe(expected);
      }
    });
  }

  test(`backup orbit ${lang}: delayed import preserves a newer explicit module link`, async ({ page }) => {
    await openFromAnotherOrbit(page, lang);
    await holdLock(page);
    try {
      page.once('dialog', (dialog) => dialog.accept());
      await page.locator('input[type=file]').setInputFiles(upload({ ...maps(), focusModule: 'map' }));
      await expect.poll(() => page.evaluate(async (key) =>
        (await navigator.locks.query()).pending.filter((lock) => lock.name === key).length, KEY)).toBe(1);
      await page.evaluate(() => { location.hash = 'module/needs'; });
      await expect(page.locator('#unit')).toHaveValue('needs');
    } finally { await releaseLock(page); }
    await expect(page.locator('.notice')).toContainText(lang === 'ru' ? 'восстановлена' : 'restored');
    await expect(page).toHaveURL(/#module\/needs$/);
    await expect(page.locator('#unit')).toHaveValue('needs');
    expect(JSON.parse(await raw(page)).focusModule).toBe('map');
    await page.evaluate(() => { location.hash = 'path'; });
    await expect(page.locator('#unit')).toHaveValue('map');
  });

  test(`backup orbit ${lang}: cancelled and failed imports retain the previous choice and bytes`, async ({ page }) => {
    await openFromAnotherOrbit(page, lang);
    const before = await raw(page);
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.locator('input[type=file]').setInputFiles(upload(maps()));
    await expect(page.locator('input[type=file]')).toHaveValue('');
    await expect(page.locator('.notice')).toHaveCount(0);
    await nav(page, lang, 'path').click();
    await expect(page.locator('#unit')).toHaveValue('conflict');
    expect(await raw(page)).toBe(before);
    await nav(page, lang, 'progress').click();
    await page.evaluate((key) => {
      const original = Storage.prototype.setItem;
      window.backupOrbitRejectedWrites = 0;
      Storage.prototype.setItem = function (k, value) {
        if (this === localStorage && k === key) {
          window.backupOrbitRejectedWrites++;
          throw new DOMException('Synthetic backup write rejection', 'QuotaExceededError');
        }
        return original.call(this, k, value);
      };
    }, KEY);
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('input[type=file]').setInputFiles(upload(maps()));
    await expect(page.getByRole('alert')).toContainText(lang === 'ru' ? 'Не удалось сохранить' : 'Storage could not be read or written');
    await expect(page.locator('.notice')).toHaveCount(0);
    expect(await page.evaluate(() => window.backupOrbitRejectedWrites)).toBe(1);
    await nav(page, lang, 'path').click();
    await expect(page.locator('#unit')).toHaveValue('conflict');
    expect(await raw(page)).toBe(before);
  });
}
