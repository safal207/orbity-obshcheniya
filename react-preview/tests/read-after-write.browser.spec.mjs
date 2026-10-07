import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const KEY = 'orbity-dialoga-progress-v1';
const raw = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const saved = (mode) => ({ completed: { 'map-2': 1000 }, answers: { 'map-2': 2 },
  notes: { 'map-1': 'KEEP · synthetic note' }, review: { 'map-2': 2000 },
  missionSteps: { 'listen-ten': [true, false, true] },
  focusModule: mode === 'guided' ? 'needs' : 'map',
  currentLessonId: mode === 'guided' ? 'needs-1' : 'map-1',
  guidedFlow: mode === 'guided' ? { topic: 'needs', step: 0 } : null });

for (const lang of ['ru', 'en']) {
  for (const mode of ['lesson', 'guided', 'practice']) {
    test(`read after write ${lang} ${mode}: keep the error and recover the committed state without another write`, async ({ page, context }, info) => {
      await page.setViewportSize({ width: 320, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const hash = mode === 'guided' ? 'guided/needs' : mode === 'lesson' ? 'lesson/map-1/2' : 'practice/map-1';
      const initial = saved(mode);
      await page.goto(`/?lang=${lang}#${hash}`);
      await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: KEY, value: initial });
      await page.reload();
      await expect(page.locator('.choice').first()).toBeEnabled();
      // A separate, unpatched tab reads what was actually committed to the shared store.
      const witness = await context.newPage();
      await witness.goto('/?lang=en#about');
      await expect(witness.locator('#page-title')).toBeVisible();
      const pageErrors = []; page.on('pageerror', (error) => pageErrors.push(error.message));
      await page.evaluate((key) => {
        const originalGet = Storage.prototype.getItem;
        const originalSet = Storage.prototype.setItem;
        let blockReads = false;
        window.postWriteWrites = 0;
        window.postWriteReadFailures = 0;
        window.restorePostWriteReads = () => { blockReads = false; };
        Storage.prototype.setItem = function (k, value) {
          const result = originalSet.call(this, k, value);
          if (this === localStorage && k === key) {
            window.postWriteWrites++;
            blockReads = true; // The real write succeeded; only subsequent reads fail.
          }
          return result;
        };
        Storage.prototype.getItem = function (k) {
          if (this === localStorage && k === key && blockReads) {
            window.postWriteReadFailures++;
            throw new DOMException('Synthetic post-write read failure', 'SecurityError');
          }
          return originalGet.call(this, k);
        };
      }, KEY);
      await page.locator('.choice').nth(1).click();
      await page.getByRole('button', { name: lang === 'ru' ? 'Проверить ответ' : 'Check answer', exact: true }).click();
      await expect.poll(() => page.evaluate(() => window.postWriteReadFailures)).toBeGreaterThan(0);
      const committed = await raw(witness);
      const actual = JSON.parse(committed);
      const expected = structuredClone(initial);
      if (mode === 'lesson') {
        expect(actual.completed['map-1']).toBeGreaterThan(0);
        expected.completed['map-1'] = actual.completed['map-1'];
        expected.answers['map-1'] = 1;
        expected.review['map-1'] = actual.completed['map-1'] + 86400000;
      } else if (mode === 'guided') expected.guidedFlow.step = 1;
      else expected.answers['map-1'] = 1;
      expect(committed).toBe(JSON.stringify(expected));
      expect(await page.evaluate(() => window.postWriteWrites)).toBe(1);

      const alert = page.getByRole('alert');
      await expect(alert).toContainText(lang === 'ru' ? 'Не удалось сохранить или прочитать' : 'Storage could not be read or written');
      await expect(page.locator('.feedback.success')).toHaveCount(0);
      await expect(page.getByTestId('xp')).toContainText('—');
      const again = page.getByRole('button', { name: lang === 'ru' ? 'Проверить снова' : 'Check again', exact: true });
      const failures = await page.evaluate(() => window.postWriteReadFailures);
      await again.click(); // Reading is still broken: the error must remain visible.
      await expect.poll(() => page.evaluate(() => window.postWriteReadFailures)).toBeGreaterThan(failures);
      await expect(alert).toBeVisible();
      await expect(page.locator('.feedback.success')).toHaveCount(0);
      expect(await raw(witness)).toBe(committed);
      expect(await page.evaluate(() => window.postWriteWrites)).toBe(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const violations = (await new AxeBuilder({ page }).analyze()).violations;
      expect(violations.filter((v) => ['serious', 'critical'].includes(v.impact))).toEqual([]);
      await page.screenshot({ path: info.outputPath(`post-write-error-${lang}-${mode}-320.png`), fullPage: true });

      await page.evaluate(() => window.restorePostWriteReads());
      await again.click();
      await expect(alert).toHaveCount(0);
      await expect(page.getByTestId('xp')).toContainText(mode === 'lesson' ? '40 XP' : '20 XP');
      expect(await raw(page)).toBe(committed);
      expect(await raw(witness)).toBe(committed);
      expect(await page.evaluate(() => window.postWriteWrites)).toBe(1);
      if (mode === 'guided') {
        await page.getByRole('button', { name: lang === 'ru' ? 'Продолжить с сохранённого вопроса' : 'Continue from the saved question', exact: true }).click();
        await expect(page.locator('.lesson-top')).toContainText('2/3');
      }
      await expect(page.locator('.feedback.success')).toHaveCount(0);
      await page.screenshot({ path: info.outputPath(`post-write-recovered-${lang}-${mode}-320.png`), fullPage: true });
      expect(await page.evaluate(() => window.postWriteWrites)).toBe(1);
      await page.reload();
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expect(page.getByTestId('xp')).toContainText(mode === 'lesson' ? '40 XP' : '20 XP');
      expect(await raw(page)).toBe(committed);
      if (mode === 'guided') await expect(page.locator('.lesson-top')).toContainText('2/3');
      expect(pageErrors).toEqual([]);
    });
  }
}
