import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const KEY = 'orbity-dialoga-progress-v1';
const raw = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const saved = (focusModule) => ({
  completed: { 'map-1': 1000 }, answers: { 'map-1': 1 },
  notes: { 'map-1': 'SYNTHETIC KEEP · сохранить' }, review: { 'map-1': 2000 },
  missionSteps: { 'listen-ten': [true, false, true] }, focusModule,
  currentLessonId: 'needs-1', guidedFlow: { topic: 'needs', step: 1 },
});
async function seed(page, lang, focusModule) {
  await page.goto(`/?lang=${lang}#path`);
  await page.evaluate(({ key, state }) => localStorage.setItem(key, JSON.stringify(state)),
    { key: KEY, state: saved(focusModule) });
  await page.reload();
  await expect(page.locator('#unit')).toHaveValue(focusModule ?? 'map');
  // Count even byte-identical writes: route navigation must be strictly read-only.
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    window.pathReturnWrites = 0;
    window.pathReturnEvents = 0;
    addEventListener('storage', (event) => { if (event.key === key) window.pathReturnEvents++; });
    Storage.prototype.setItem = function (k, value) {
      if (this === localStorage && k === key) window.pathReturnWrites++;
      return original.call(this, k, value);
    };
  }, KEY);
}
async function openTemporaryOrbit(page) {
  await page.evaluate(() => { location.hash = 'module/needs'; });
  await expect(page).toHaveURL(/#module\/needs$/);
  await expect(page.locator('#unit')).toHaveValue('needs');
}
async function returnToPath(page, lang) {
  const button = page.getByRole('button', { name: lang === 'ru' ? 'Маршрут' : 'Learn', exact: true });
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#path$/);
}
async function assertReadOnly(page, expected) {
  expect(await raw(page)).toBe(expected);
  expect(await page.evaluate(() => window.pathReturnWrites)).toBe(0);
}

for (const lang of ['ru', 'en']) {
  for (const preference of ['conflict', null]) {
    test(`path return ${lang} ${preference ?? 'default'}: temporary orbit, history and reload preserve saved data at 320px`, async ({ page }, info) => {
      await page.setViewportSize({ width: 320, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await seed(page, lang, preference);
      const before = await raw(page);
      const expectedOrbit = preference ?? 'map';
      await openTemporaryOrbit(page);
      await assertReadOnly(page, before);
      await returnToPath(page, lang);
      await expect(page.locator('#unit')).toHaveValue(expectedOrbit);
      await expect(page.locator('#page-title')).toBeFocused();
      await expect(page.getByTestId('xp')).toContainText('20 XP');
      await expect(page.locator('#unit option')).toHaveCount(8);
      await expect(page.locator('.path-stop')).toHaveCount(4);
      await assertReadOnly(page, before);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const violations = (await new AxeBuilder({ page }).analyze()).violations;
      expect(violations.filter((v) => ['serious', 'critical'].includes(v.impact))).toEqual([]);
      await page.screenshot({ path: info.outputPath(`path-return-${lang}-${preference ?? 'default'}-320.png`), fullPage: true });

      await page.goBack();
      await expect(page).toHaveURL(/#module\/needs$/);
      await expect(page.locator('#unit')).toHaveValue('needs');
      await page.goBack();
      await expect(page).toHaveURL(/#path$/);
      await expect(page.locator('#unit')).toHaveValue(expectedOrbit);
      await page.goForward();
      await expect(page.locator('#unit')).toHaveValue('needs');
      await page.goForward();
      await expect(page).toHaveURL(/#path$/);
      await expect(page.locator('#unit')).toHaveValue(expectedOrbit);
      await assertReadOnly(page, before);
      await page.reload();
      await expect(page.locator('#unit')).toHaveValue(expectedOrbit);
      expect(await raw(page)).toBe(before);
      // Restoring the displayed orbit must not replace the saved guided cursor.
      await page.getByTestId('resume').click();
      await expect(page).toHaveURL(/#guided\/needs$/);
      await expect(page.locator('.lesson-top')).toContainText('2/3');
      expect(await raw(page)).toBe(before);
    });
  }

  test(`path return ${lang}: another tab cannot move the active orbit, but return reads its saved choice`, async ({ page, context }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await seed(page, lang, 'conflict');
    const second = await context.newPage();
    await second.goto(`/?lang=${lang === 'ru' ? 'en' : 'ru'}#path`);
    await expect(second.locator('#unit')).toHaveValue('conflict');
    await second.locator('#unit').selectOption('listening');
    await expect(second.locator('#unit')).toHaveValue('listening');
    await expect.poll(() => page.evaluate(() => window.pathReturnEvents)).toBeGreaterThan(0);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(page.locator('#unit')).toHaveValue('conflict');
    const expected = JSON.stringify(saved('listening'));
    await assertReadOnly(page, expected);
    await openTemporaryOrbit(page);
    await returnToPath(page, lang);
    await expect(page.locator('#unit')).toHaveValue('listening');
    await expect(second.locator('#unit')).toHaveValue('listening');
    await assertReadOnly(page, expected);
    await page.reload();
    await expect(page.locator('#unit')).toHaveValue('listening');
    expect(await raw(page)).toBe(expected);
  });
}
