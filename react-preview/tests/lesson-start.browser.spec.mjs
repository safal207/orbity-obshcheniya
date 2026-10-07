import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const KEY = 'orbity-dialoga-progress-v1';
const raw = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const empty = () => ({ completed: {}, answers: {}, notes: {}, review: {}, missionSteps: {},
  focusModule: null, currentLessonId: null, guidedFlow: null });
const kept = () => ({ ...empty(), completed: { 'map-2': 1000 }, answers: { 'map-2': 2 },
  notes: { 'map-1': 'KEEP · synthetic reflection' }, review: { 'map-2': 2000 },
  missionSteps: { 'listen-ten': [true, false, true] } });
const beginLabel = (lang) => lang === 'ru' ? 'Начать урок с первого шага' : 'Start this lesson from step one';
const check = (page, lang) => page.getByRole('button', { name: lang === 'ru' ? 'Проверить ответ' : 'Check answer', exact: true });
async function instrument(page) {
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    window.lessonStartWrites = 0;
    window.rejectLessonStart = false;
    Storage.prototype.setItem = function (k, value) {
      if (this === localStorage && k === key) {
        if (window.rejectLessonStart) throw new DOMException('Synthetic start write rejection', 'QuotaExceededError');
        window.lessonStartWrites++;
      }
      return original.call(this, k, value);
    };
  }, KEY);
}
async function open(page, lang, state) {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/?lang=${lang}#lesson/map-1/2`);
  if (state) {
    await page.evaluate(({ key, state }) => localStorage.setItem(key, JSON.stringify(state)), { key: KEY, state });
    await page.reload();
  }
  await expect(page.locator('#page-title')).toBeFocused();
  await instrument(page);
}
async function enterFromFirstStep(page, lang) {
  await page.goto(`/?lang=${lang}#lesson/map-1`);
  await page.getByRole('button', { name: lang === 'ru' ? 'Попробуем' : 'Let’s try it' }).click();
  await expect(page.locator('textarea')).toBeEnabled();
  await page.getByRole('button', { name: lang === 'ru' ? 'Проверить понимание' : 'Check understanding' }).click();
  await expect(page.locator('.choice').first()).toBeEnabled();
}
async function answerCorrectly(page, lang) {
  await page.locator('.choice').nth(1).click();
  await check(page, lang).click();
}
async function guard(page, lang) {
  await expect(page.getByTestId('lesson-start-required')).toBeVisible();
  await expect(page.getByRole('button', { name: beginLabel(lang), exact: true })).toBeVisible();
  await expect(page.locator('.choices')).toHaveCount(0);
  await expect(page.locator('.feedback.success')).toHaveCount(0);
}

for (const lang of ['ru', 'en']) {
  test(`lesson start ${lang}: direct final link is read-only; explicit start, reload and completion work at 320px`, async ({ page }, info) => {
    await open(page, lang);
    await guard(page, lang);
    expect(await raw(page)).toBeNull();
    expect(await page.evaluate(() => window.lessonStartWrites)).toBe(0);
    await expect(page.getByTestId('xp')).toContainText('0 XP');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const violations = (await new AxeBuilder({ page }).analyze()).violations;
    expect(violations.filter((v) => ['serious', 'critical'].includes(v.impact))).toEqual([]);
    await page.screenshot({ path: info.outputPath(`lesson-start-required-${lang}-320.png`), fullPage: true });
    await page.reload(); await guard(page, lang); expect(await raw(page)).toBeNull();
    await page.getByRole('button', { name: beginLabel(lang), exact: true }).click();
    await expect(page).toHaveURL(/#lesson\/map-1$/);
    await expect(page.locator('.lesson-top')).toContainText('1/3');
    expect(JSON.parse(await raw(page))).toEqual({ ...empty(), focusModule: 'map', currentLessonId: 'map-1' });
    await page.getByRole('button', { name: lang === 'ru' ? 'Попробуем' : 'Let’s try it' }).click();
    await expect(page.locator('textarea')).toBeEnabled();
    await page.getByRole('button', { name: lang === 'ru' ? 'Проверить понимание' : 'Check understanding' }).click();
    await expect(page.locator('.choice').first()).toBeEnabled();
    const bookmark = await raw(page);
    await page.reload(); await expect(page.locator('.choice').first()).toBeEnabled();
    expect(await raw(page)).toBe(bookmark);
    await instrument(page);
    await answerCorrectly(page, lang);
    await expect(page.locator('.feedback.success')).toBeVisible();
    const completed = JSON.parse(await raw(page)).completed['map-1'];
    expect(completed).toBeTruthy();
    expect(await page.evaluate(() => window.lessonStartWrites)).toBe(1);
    await expect(page.getByTestId('xp')).toContainText('20 XP');
    await page.reload(); await answerCorrectly(page, lang);
    await expect(page.locator('.feedback.success')).toBeVisible();
    expect(JSON.parse(await raw(page)).completed['map-1']).toBe(completed);
    await expect(page.getByTestId('xp')).toContainText('20 XP');
  });

  for (const situation of ['other-bookmark', 'guided-bookmark']) {
    test(`lesson start ${lang} ${situation}: a foreign or guided cursor is not a full-lesson start`, async ({ page }) => {
      const state = { ...kept(), focusModule: 'needs', currentLessonId: 'needs-1',
        guidedFlow: situation === 'guided-bookmark' ? { topic: 'needs', step: 1 } : null };
      await open(page, lang, state);
      // A guided cursor may carry exactly the same lesson id as the direct link.
      if (situation === 'guided-bookmark') {
        await page.evaluate(() => { location.hash = 'lesson/needs-1/2'; });
        await expect(page).toHaveURL(/#lesson\/needs-1\/2$/);
      }
      await guard(page, lang);
      expect(await raw(page)).toBe(JSON.stringify(state));
      expect(await page.evaluate(() => window.lessonStartWrites)).toBe(0);
      await expect(page.getByTestId('xp')).toContainText('20 XP');
      await page.getByRole('button', { name: lang === 'ru' ? 'Switch to English' : 'Переключить на русский' }).click();
      await guard(page, lang === 'ru' ? 'en' : 'ru');
      await page.reload(); await guard(page, lang === 'ru' ? 'en' : 'ru');
      expect(await raw(page)).toBe(JSON.stringify(state));
    });
  }

  test(`lesson start ${lang}: rejected start cannot unlock completion; retry preserves an existing v1 note`, async ({ page }) => {
    const state = kept();
    await open(page, lang, state); await guard(page, lang);
    await page.evaluate(() => { window.rejectLessonStart = true; });
    await page.getByRole('button', { name: beginLabel(lang), exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(lang === 'ru' ? 'Не удалось сохранить' : 'Storage could not be read or written');
    await guard(page, lang);
    expect(await raw(page)).toBe(JSON.stringify(state));
    expect(await page.evaluate(() => window.lessonStartWrites)).toBe(0);
    await page.evaluate(() => { window.rejectLessonStart = false; });
    await page.getByRole('button', { name: beginLabel(lang), exact: true }).click();
    await expect(page).toHaveURL(/#lesson\/map-1$/);
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(await page.evaluate(() => window.lessonStartWrites)).toBe(1);
    expect(await raw(page)).toBe(JSON.stringify({ ...state, focusModule: 'map', currentLessonId: 'map-1' }));
    await page.getByRole('button', { name: lang === 'ru' ? 'Попробуем' : 'Let’s try it' }).click();
    await expect(page.locator('textarea')).toHaveValue(state.notes['map-1']);
  });

  test(`lesson start ${lang}: latest bookmark is checked under a real lock, not only before queuing`, async ({ page, context }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await enterFromFirstStep(page, lang); await instrument(page);
    const second = await context.newPage();
    await second.goto(`/?lang=${lang === 'ru' ? 'en' : 'ru'}#start`);
    await expect(second.locator('[data-topic=needs]')).toBeEnabled();
    await second.evaluate((key) => {
      window.lessonStartLockReady = false;
      navigator.locks.request(key, () => {
        window.lessonStartLockReady = true;
        return new Promise((resolve) => { window.releaseLessonStartLock = resolve; });
      });
    }, KEY);
    await expect.poll(() => second.evaluate(() => window.lessonStartLockReady)).toBe(true);
    try {
      await second.locator('[data-topic=needs]').click();
      await expect(second.locator('[data-topic=needs]')).toBeDisabled();
      await answerCorrectly(page, lang);
      await expect(page.locator('.choice').first()).toBeDisabled();
      await expect.poll(() => second.evaluate(async (key) =>
        (await navigator.locks.query()).pending.filter((lock) => lock.name === key).length, KEY)).toBe(2);
    } finally { await second.evaluate(() => window.releaseLessonStartLock()); }
    await expect(page.getByRole('alert')).toContainText(lang === 'ru' ? 'Начните этот урок' : 'Start this lesson');
    await guard(page, lang);
    expect(await page.evaluate(() => window.lessonStartWrites)).toBe(0);
    const expected = { ...empty(), focusModule: 'needs', currentLessonId: 'needs-1', guidedFlow: { topic: 'needs', step: 0 } };
    expect(await raw(page)).toBe(JSON.stringify(expected));
    await expect(page.getByTestId('xp')).toContainText('0 XP');
    await second.reload();
    await expect(second.locator('.lesson-top')).toContainText('1/3');
    expect(await raw(second)).toBe(JSON.stringify(expected));
  });

  test(`lesson start ${lang}: standalone practice stays available without creating completion or XP`, async ({ page }) => {
    await page.goto(`/?lang=${lang}#practice/map-1`);
    await expect(page.locator('.choice').first()).toBeEnabled();
    await expect(page.getByTestId('lesson-start-required')).toHaveCount(0);
    await answerCorrectly(page, lang);
    await expect(page.locator('.feedback.success')).toBeVisible();
    expect(JSON.parse(await raw(page))).toEqual({ ...empty(), answers: { 'map-1': 1 } });
    await expect(page.getByTestId('xp')).toContainText('0 XP');
  });
}
