import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { GUIDED } from '../navigation.mjs';

const KEY = 'orbity-dialoga-progress-v1';
const source = readFileSync(new URL('../../dist/course.js', import.meta.url), 'utf8');
const { lessons } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const raw = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const saved = (topic, step) => ({ completed: { 'map-1': 1000 }, answers: { 'map-1': 1 },
  notes: { 'map-1': 'KEEP · synthetic note' }, review: { 'map-1': 2000 },
  missionSteps: { 'listen-ten': [true, false, true] }, focusModule: topic,
  currentLessonId: GUIDED[topic][0], guidedFlow: { topic, step } });
async function seed(page, lang, topic, step) {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/?lang=${lang}#guided/${topic}`);
  await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: KEY, value: saved(topic, step) });
  await page.reload();
  await expect(page.locator('#page-title')).toBeFocused();
}
async function chooseAgain(page, lang, topic) {
  await page.getByRole('button', { name: lang === 'ru' ? 'Маршрут' : 'Learn', exact: true }).click();
  await page.getByRole('button', { name: lang === 'ru' ? 'Выбрать ситуацию' : 'Choose a situation', exact: true }).click();
  await expect(page).toHaveURL(/#start$/);
  await page.locator(`[data-topic=${topic}]`).click();
}
async function assertStep(page, step) {
  await expect(page.locator('.lesson-top')).toContainText(`${step + 1}/3`);
  await expect(page.locator('.choice[aria-pressed=true]')).toHaveCount(0);
  await expect(page.locator('#page-title')).toBeFocused();
  await expect(page.getByTestId('xp')).toContainText('20 XP');
}
async function holdLock(page) {
  await page.evaluate((key) => {
    window.restartLockReady = false;
    navigator.locks.request(key, () => {
      window.restartLockReady = true;
      return new Promise((resolve) => { window.releaseRestartLock = resolve; });
    });
  }, KEY);
  await expect.poll(() => page.evaluate(() => window.restartLockReady)).toBe(true);
}

for (const lang of ['ru', 'en']) {
  for (const topic of Object.keys(GUIDED)) {
    test(`guided restart ${lang} ${topic}: finish three real questions, explicitly restart and reload at 320px`, async ({ page }, info) => {
      await seed(page, lang, topic, 0);
      for (let step = 0; step < GUIDED[topic].length; step++) {
        const lesson = lessons.find((item) => item.id === GUIDED[topic][step]);
        await page.locator('.choice').nth(lesson.quiz.correct[0]).click();
        await page.getByRole('button', { name: lang === 'ru' ? 'Проверить ответ' : 'Check answer', exact: true }).click();
        await expect(page.locator('.feedback.success')).toBeVisible();
        await page.getByRole('button', { name: step < 2 ? (lang === 'ru' ? 'Следующий вопрос' : 'Next question')
          : (lang === 'ru' ? 'Посмотреть результат' : 'See the result'), exact: true }).click();
      }
      const done = JSON.stringify(saved(topic, 3));
      expect(await raw(page)).toBe(done);
      await expect(page.locator('.lesson-screen progress')).toHaveAttribute('value', '3');
      // A direct result reload must not restart or change progress on its own.
      await page.reload();
      await expect(page.locator('.lesson-screen progress')).toHaveAttribute('value', '3');
      expect(await raw(page)).toBe(done);
      await chooseAgain(page, lang, topic);
      await expect(page).toHaveURL(new RegExp(`#guided/${topic}$`));
      await assertStep(page, 0);
      const restarted = JSON.stringify(saved(topic, 0));
      expect(await raw(page)).toBe(restarted);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const violations = (await new AxeBuilder({ page }).analyze()).violations;
      expect(violations.filter((v) => ['serious', 'critical'].includes(v.impact))).toEqual([]);
      await page.screenshot({ path: info.outputPath(`guided-restarted-${lang}-${topic}-320.png`), fullPage: true });
      await page.reload(); await assertStep(page, 0);
      expect(await raw(page)).toBe(restarted);
      await page.getByRole('button', { name: lang === 'ru' ? 'Switch to English' : 'Переключить на русский' }).click();
      // Language switching keeps focus on its control; only question content is restored.
      await expect(page.locator('html')).toHaveAttribute('lang', lang === 'ru' ? 'en' : 'ru');
      await expect(page.locator('.lesson-top')).toContainText('1/3');
      await expect(page.locator('.choice[aria-pressed=true]')).toHaveCount(0);
      expect(await raw(page)).toBe(restarted);
    });
  }

  for (const step of [1, 2]) {
    test(`guided restart ${lang}: incomplete step ${step + 1} resumes instead of resetting`, async ({ page }) => {
      await seed(page, lang, 'needs', step);
      const before = await raw(page);
      await chooseAgain(page, lang, 'needs');
      await assertStep(page, step);
      expect(await raw(page)).toBe(before);
      await page.reload(); await assertStep(page, step);
      expect(await raw(page)).toBe(before);
    });
  }

  test(`guided restart ${lang}: rejected write retains completion; explicit retry starts at question one`, async ({ page }) => {
    await seed(page, lang, 'needs', 3);
    const before = await raw(page);
    await page.evaluate((key) => {
      const original = Storage.prototype.setItem;
      window.restoreRestartStorage = () => { Storage.prototype.setItem = original; };
      window.restartRejectedWrites = 0;
      Storage.prototype.setItem = function (k, value) {
        if (this === localStorage && k === key) {
          window.restartRejectedWrites++;
          throw new DOMException('Synthetic restart rejection', 'QuotaExceededError');
        }
        return original.call(this, k, value);
      };
    }, KEY);
    await chooseAgain(page, lang, 'needs');
    await expect(page.getByRole('alert')).toContainText(lang === 'ru' ? 'Не удалось сохранить' : 'Storage could not be read or written');
    await expect(page).toHaveURL(/#start$/);
    expect(await raw(page)).toBe(before);
    expect(await page.evaluate(() => window.restartRejectedWrites)).toBe(1);
    await page.evaluate(() => window.restoreRestartStorage());
    await page.locator('[data-topic=needs]').click();
    await assertStep(page, 0);
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(await raw(page)).toBe(JSON.stringify(saved('needs', 0)));
  });

  test(`guided restart ${lang}: real second-tab lock defers restart and preserves an earlier queued note`, async ({ page, context }) => {
    await seed(page, lang, 'needs', 3);
    const before = await raw(page);
    const second = await context.newPage();
    const otherLang = lang === 'ru' ? 'en' : 'ru';
    await second.goto(`/?lang=${otherLang}#lesson/map-2/1`);
    await expect(second.locator('textarea')).toBeEnabled();
    await holdLock(second);
    try {
      await second.locator('textarea').fill('Queued note from other tab');
      await second.getByRole('button', { name: otherLang === 'ru' ? 'Сохранить / повторить' : 'Save / retry', exact: true }).click();
      await expect(second.locator('textarea')).toBeDisabled();
      await expect(second.locator('textarea')).toHaveValue('Queued note from other tab');
      await expect(second.locator('.save-state')).toContainText(otherLang === 'ru' ? 'Сохраняем…' : 'Saving…');
      await chooseAgain(page, lang, 'needs');
      await expect(page.locator('[data-topic=needs]')).toBeDisabled();
      await expect.poll(() => second.evaluate(async (key) =>
        (await navigator.locks.query()).pending.filter((lock) => lock.name === key).length, KEY)).toBe(2);
      await expect(page).toHaveURL(/#start$/);
      expect(await raw(page)).toBe(before);
    } finally { await second.evaluate(() => window.releaseRestartLock()); }
    // Read persistent data independently of the saving tab's status acknowledgement.
    await expect.poll(async () => JSON.parse(await raw(page)).notes['map-2']).toBe('Queued note from other tab');
    await expect(second.locator('.save-state')).toContainText(otherLang === 'ru' ? 'Сохранено на этом устройстве' : 'Saved on this device');
    await assertStep(page, 0);
    const expected = saved('needs', 0);
    expected.notes['map-2'] = 'Queued note from other tab';
    expect(await raw(page)).toBe(JSON.stringify(expected));
    expect(await raw(second)).toBe(JSON.stringify(expected));
    await expect(second).toHaveURL(/#lesson\/map-2\/1$/);
    await page.reload(); await assertStep(page, 0);
    expect(await raw(page)).toBe(JSON.stringify(expected));
    await second.reload();
    await expect(second.locator('textarea')).toHaveValue('Queued note from other tab');
    await expect(second.locator('.save-state')).toContainText(otherLang === 'ru' ? 'Сохранено на этом устройстве' : 'Saved on this device');
    expect(await raw(second)).toBe(JSON.stringify(expected));
    expect(await raw(page)).toBe(JSON.stringify(expected));
  });
}
