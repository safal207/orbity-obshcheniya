import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';

const KEY = 'orbity-dialoga-progress-v1';
/** Load the exact shared course bytes without changing legacy ESM boundaries. */
const loadCourse = async (file) => import(`data:text/javascript;base64,${Buffer.from(readFileSync(new URL(file, import.meta.url), 'utf8')).toString('base64')}`);
const courses = { ru: await loadCourse('../../dist/course.js'), en: await loadCourse('../../dist/course.en.js') };
/** Read committed course bytes directly, independently of React state. */
const raw = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const neutral = 'rgb(239, 234, 255)';
const retry = 'rgb(255, 240, 215)';
const success = 'rgb(228, 241, 207)';
const fixture = {
  completed: { 'map-2': 1000 }, answers: { 'map-2': 2 }, review: { 'map-2': 2000 },
  notes: { 'map-1': 'KEEP / сохранить заметку', 'map-2': 'Keep the review note', 'needs-1': 'Моя просьба' },
  missionSteps: { 'listen-ten': [true, false, true] },
  focusModule: 'map', currentLessonId: null, guidedFlow: null,
};

/** Open one quiz mode with a saved note/mission fixture on a small phone. */
async function openQuiz(page, lang, mode) {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/?lang=${lang}#progress`);
  await page.evaluate(({ key, state }) => localStorage.setItem(key, JSON.stringify(state)), { key: KEY, state: fixture });
  await page.reload();
  if (mode === 'guided') {
    await page.goto(`/?lang=${lang}#start`);
    await page.locator('[data-topic=needs]').click();
    await expect(page).toHaveURL(/#guided\/needs$/);
    await expect(page.locator('.lesson-top')).toContainText('1/3');
  } else if (mode === 'lesson') {
    await page.goto(`/?lang=${lang}#lesson/map-1`);
    await page.getByRole('button', { name: lang === 'ru' ? 'Попробуем' : 'Let’s try it' }).click();
    await page.getByRole('button', { name: lang === 'ru' ? 'Проверить понимание' : 'Check understanding' }).click();
  } else {
    await page.goto(`/?lang=${lang}#${mode === 'review' ? 'review' : 'practice/map-1'}`);
  }
  await expect(page.locator('.choices .choice').first()).toBeEnabled();
  const id = mode === 'guided' ? 'needs-1' : mode === 'review' ? 'map-2' : 'map-1';
  const lesson = courses[lang].lessons.find((item) => item.id === id);
  return { lesson, choices: page.locator('.choices .choice'), check: page.getByRole('button', { name: lang === 'ru' ? 'Проверить ответ' : 'Check answer', exact: true }) };
}
/** Assert page width and the existing serious/critical Axe guardrail. */
async function accessibleAndFits(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const violations = (await new AxeBuilder({ page }).analyze()).violations;
  expect(violations.filter((item) => ['serious', 'critical'].includes(item.impact))).toEqual([]);
}

/** Check the natural post-answer viewport before any hover or auto-scrolling click. */
async function feedbackActionInView(page) {
  await expect(page.getByTestId('answer-feedback-title')).toBeFocused();
  const action = page.getByTestId('answer-feedback-action');
  await expect(action).toBeEnabled();
  const box = await action.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const heading = document.querySelector('[data-testid="answer-feedback-title"]').getBoundingClientRect();
    const nav = document.querySelector('.sidebar nav');
    const limit = nav && getComputedStyle(nav).position === 'fixed' ? nav.getBoundingClientRect().top : innerHeight;
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
      headingTop: heading.top, headingBottom: heading.bottom, width: innerWidth, limit,
      reachable: element === hit || element.contains(hit) };
  });
  expect(box.headingTop).toBeGreaterThanOrEqual(0);
  expect(box.headingBottom).toBeLessThanOrEqual(box.limit);
  expect(box.left).toBeGreaterThanOrEqual(0);
  expect(box.right).toBeLessThanOrEqual(box.width);
  expect(box.top).toBeGreaterThanOrEqual(0);
  expect(box.bottom).toBeLessThanOrEqual(box.limit);
  expect(box.reachable).toBe(true);
}

for (const lang of ['ru', 'en']) {
  for (const mode of ['lesson', 'practice', 'guided', 'review']) {
    test(`quiz feedback ${lang} ${mode}: neutral, retry, rejected save and saved success at 320px`, async ({ page, context }, info) => {
      const errors = []; page.on('pageerror', (error) => errors.push(error.message));
      const { lesson, choices, check } = await openQuiz(page, lang, mode);
      const before = await raw(page);
      const beforeState = JSON.parse(before);
      const xpBefore = await page.getByTestId('xp').textContent();
      const other = await context.newPage();
      await other.goto(`/?lang=${lang === 'ru' ? 'en' : 'ru'}#progress`);
      await expect(other.getByTestId('xp')).toContainText('20 XP');
      expect(await raw(other)).toBe(before);
      await page.bringToFront();

      const wrong = choices.nth(lesson.quiz.choices.findIndex((_, index) => !lesson.quiz.correct.includes(index)));
      const right = choices.nth(lesson.quiz.correct[0]);
      await wrong.focus(); await page.keyboard.press('Space');
      await expect(wrong).toBeFocused();
      await expect(wrong).toHaveAttribute('aria-pressed', 'true');
      await expect(wrong).toHaveCSS('background-color', neutral);
      await expect(wrong).toHaveCSS('border-top-style', 'solid');
      await expect(page.locator('.feedback')).toHaveCount(0);
      if (mode === 'lesson') await page.screenshot({ path: info.outputPath(`quiz-selected-${lang}-320.png`), fullPage: true });

      await check.click();
      const status = page.locator('.feedback.retry');
      await expect(status).toHaveAttribute('role', 'status');
      await expect(status).toContainText(['lesson', 'practice'].includes(mode) ? lesson.quiz.explanation : lesson.principle);
      await expect(status.getByTestId('answer-feedback-title')).toHaveText(['lesson', 'practice'].includes(mode)
        ? lang === 'ru' ? 'Хорошая попытка. Посмотрим ещё раз.' : 'Good try. Let’s look again.'
        : lang === 'ru' ? 'Попробуем другой ответ.' : 'Let’s try another answer.');
      await feedbackActionInView(page);
      await page.screenshot({ path: info.outputPath(`quiz-retry-action-${mode}-${lang}-320.png`) });
      await wrong.hover();
      await expect(wrong).toHaveCSS('background-color', retry);
      await expect(wrong).toHaveCSS('border-top-style', 'dashed');
      await expect(page.locator('.feedback.success')).toHaveCount(0);
      expect(await raw(page)).toBe(before); expect(await raw(other)).toBe(before);
      await expect(page.getByTestId('xp')).toHaveText(xpBefore);
      await accessibleAndFits(page);
      await page.screenshot({ path: info.outputPath(`quiz-wrong-${mode}-${lang}-320.png`), fullPage: true });

      // Keep PR #16's explicit retry and focus restoration, not the removed <strong> layout.
      await status.getByTestId('answer-feedback-action').click();
      await expect(choices.first()).toBeFocused();
      await expect(page.locator('.choice[aria-pressed="true"]')).toHaveCount(0);
      await expect(check).toBeDisabled();
      expect(await raw(page)).toBe(before); expect(await raw(other)).toBe(before);
      await right.click();
      await expect(status).toHaveCount(0);
      await expect(wrong).toHaveAttribute('aria-pressed', 'false');
      await expect(wrong).toHaveCSS('border-top-style', 'solid');
      await expect(right).toHaveCSS('background-color', neutral);
      // Only the progress write is rejected; reads and real Web Locks remain intact.
      await page.evaluate((key) => {
        const original = Storage.prototype.setItem;
        window.quizRejectedWrites = 0;
        window.restoreQuizStorage = () => { Storage.prototype.setItem = original; };
        Storage.prototype.setItem = function (k, value) {
          if (this === localStorage && k === key) {
            window.quizRejectedWrites++;
            throw new DOMException('Synthetic quiz save rejection', 'QuotaExceededError');
          }
          return original.call(this, k, value);
        };
      }, KEY);
      await check.click();
      await expect(page.getByRole('alert')).toBeVisible();
      await expect(check).toBeEnabled();
      expect(await page.evaluate(() => window.quizRejectedWrites)).toBe(1);
      await expect(right).toHaveCSS('background-color', neutral);
      await expect(page.locator('.feedback.success')).toHaveCount(0);
      expect(await raw(page)).toBe(before); expect(await raw(other)).toBe(before);
      await expect(page.getByTestId('xp')).toHaveText(xpBefore);

      await page.evaluate(() => window.restoreQuizStorage());
      await check.click();
      await expect(page.locator('.feedback.success')).toBeVisible();
      await feedbackActionInView(page);
      await page.screenshot({ path: info.outputPath(`quiz-success-action-${mode}-${lang}-320.png`) });
      await expect(right).toHaveCSS('background-color', success);
      await expect(right).toHaveCSS('opacity', '1');
      await expect(right).toBeDisabled();
      await accessibleAndFits(page);
      if (mode === 'lesson') await page.screenshot({ path: info.outputPath(`quiz-saved-${lang}-320.png`), fullPage: true });
      const savedBytes = await raw(page);
      const saved = JSON.parse(savedBytes);
      expect(saved.notes).toEqual(beforeState.notes);
      expect(saved.missionSteps).toEqual(beforeState.missionSteps);
      expect(saved.completed['map-2']).toBe(1000);
      const expectedXP = mode === 'lesson' ? '40 XP' : '20 XP';
      await expect(page.getByTestId('xp')).toContainText(expectedXP);
      if (mode === 'lesson') expect(saved.completed['map-1']).toBeGreaterThan(1000);
      else expect(saved.completed).toEqual(beforeState.completed);
      if (mode === 'guided') {
        expect(saved.guidedFlow).toEqual({ topic: 'needs', step: 1 });
        expect(saved.answers).toEqual(beforeState.answers);
        expect(saved.review).toEqual(beforeState.review);
      }
      await expect.poll(() => raw(other)).toBe(savedBytes);
      await expect(other.getByTestId('xp')).toContainText(expectedXP);
      await page.reload();
      await expect(page.getByTestId('xp')).toContainText(expectedXP);
      const reloaded = JSON.parse(await raw(page));
      for (const key of ['completed', 'notes', 'missionSteps', 'guidedFlow']) expect(reloaded[key]).toEqual(saved[key]);
      if (mode === 'guided') await expect(page.locator('.lesson-top')).toContainText('2/3');
      expect(errors).toEqual([]);
      await other.close();
    });
  }

  test(`quiz feedback ${lang}: retry remains understandable in forced colors at 320px`, async ({ page }, info) => {
    const { lesson, choices, check } = await openQuiz(page, lang, 'practice');
    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
    const before = await raw(page);
    const wrong = choices.nth(lesson.quiz.choices.findIndex((_, index) => !lesson.quiz.correct.includes(index)));
    await wrong.focus(); await page.keyboard.press('Space'); await check.click();
    await expect(wrong).toHaveCSS('border-top-style', 'dashed');
    await expect(page.locator('.feedback.retry')).toContainText(lesson.quiz.explanation);
    await expect(page.locator('.feedback.retry')).toHaveAttribute('role', 'status');
    await page.keyboard.press('Tab'); await wrong.focus(); await expect(wrong).toBeFocused();
    await expect(wrong).toHaveCSS('outline-style', 'solid');
    expect(await raw(page)).toBe(before);
    await accessibleAndFits(page);
    await page.screenshot({ path: info.outputPath(`quiz-forced-colors-${lang}-320.png`), fullPage: true });
  });
}
