import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const loadCourse = async (file) => import(`data:text/javascript;base64,${Buffer.from(readFileSync(new URL(file, import.meta.url), 'utf8')).toString('base64')}`);
const courses = { ru: await loadCourse('../../dist/course.js'), en: await loadCourse('../../dist/course.en.js') };
const KEY = 'orbity-dialoga-progress-v1';
const empty = () => ({ completed: {}, answers: {}, notes: {}, review: {}, missionSteps: {}, focusModule: null, currentLessonId: null, guidedFlow: null });
const read = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);
const checkButton = (page, lang) => page.getByRole('button', { name: lang === 'ru' ? 'Проверить ответ' : 'Check answer', exact: true });

async function openQuestion(page, mode, lang, viewport, last = false) {
  await page.setViewportSize(viewport);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const course = courses[lang];
  const lesson = course.lessons.find((item) => item.id === (mode === 'guided' ? last ? 'needs-3' : 'needs-1' : 'map-1'));
  const initial = { ...empty(), notes: { 'map-2': 'KEEP another reflection' }, missionSteps: { 'listen-ten': [true, false, true] } };
  if (mode === 'lesson') { initial.currentLessonId = lesson.id; initial.focusModule = lesson.moduleId; }
  if (mode === 'guided') {
    initial.currentLessonId = lesson.id; initial.focusModule = 'needs';
    initial.guidedFlow = { topic: 'needs', step: last ? 2 : 0 };
  }
  if (mode === 'review') {
    initial.completed = last ? { 'map-1': 1000 } : { 'map-1': 1000, 'map-2': 1000 };
    initial.review = last ? { 'map-1': 1 } : { 'map-1': 1, 'map-2': 1 };
  }
  const hash = mode === 'guided' ? 'guided/needs' : mode === 'review' ? 'review' : `${mode}/${lesson.id}${mode === 'lesson' ? '/2' : ''}`;
  await page.goto(`/?lang=${lang}`);
  await page.evaluate(({ key, state }) => localStorage.setItem(key, JSON.stringify(state)), { key: KEY, state: initial });
  await page.goto(`/?lang=${lang}#${hash}`);
  await page.reload();
  await expect(page.locator('.choice').first()).toBeEnabled();
  return { initial, lesson, hash };
}

async function answer(page, lesson, lang, correct = true) {
  const index = correct ? lesson.quiz.correct[0] : lesson.quiz.choices.findIndex((_, candidate) => !lesson.quiz.correct.includes(candidate));
  await page.locator('.choice').nth(index).click();
  // The check itself may be reached by scrolling, as it would on a phone.
  await checkButton(page, lang).click();
}

async function visibleAction(page) {
  const title = page.getByTestId('answer-feedback-title');
  const action = page.getByTestId('answer-feedback-action');
  await expect(title).toBeFocused();
  await expect(action).toBeEnabled();
  const geometry = await action.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const heading = document.querySelector('[data-testid=answer-feedback-title]').getBoundingClientRect();
    const nav = document.querySelector('.sidebar nav');
    const limit = nav && getComputedStyle(nav).position === 'fixed' ? nav.getBoundingClientRect().top : innerHeight;
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom, headingTop: heading.top, headingBottom: heading.bottom, viewportWidth: innerWidth, limit };
  });
  expect(geometry.headingTop).toBeGreaterThanOrEqual(0);
  expect(geometry.headingBottom).toBeLessThanOrEqual(geometry.limit);
  expect(geometry.x).toBeGreaterThanOrEqual(0);
  expect(geometry.y).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.limit);
  // Unlike locator.click(), a coordinate click cannot silently scroll a lost action into view.
  return { action, click: () => page.mouse.click(geometry.x + geometry.width / 2, geometry.y + geometry.height / 2) };
}

async function assertSavedContract(page, mode, initial, lesson) {
  const saved = await read(page);
  expect(saved.notes).toEqual(initial.notes);
  expect(saved.missionSteps).toEqual(initial.missionSteps);
  if (mode === 'lesson') {
    expect(saved.completed[lesson.id]).toBeGreaterThan(0);
    await expect(page.getByTestId('xp')).toContainText('20 XP');
  } else {
    expect(saved.completed).toEqual(initial.completed);
    await expect(page.getByTestId('xp')).toContainText(mode === 'review' ? Object.keys(initial.completed).length * 20 + ' XP' : '0 XP');
  }
  if (mode === 'guided') expect(saved.guidedFlow.step).toBe(initial.guidedFlow.step + 1);
  else expect(saved.answers[lesson.id]).toBe(lesson.quiz.correct[0]);
  return saved;
}

for (const lang of ['ru', 'en']) {
  for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 1280, height: 800 }]) {
    for (const mode of ['lesson', 'practice', 'guided', 'review']) {
      test(`answer next step ${lang} ${mode} ${viewport.width}x${viewport.height}: result and real action stay in view without advancing`, async ({ page }) => {
        const { initial, lesson, hash } = await openQuestion(page, mode, lang, viewport);
        await answer(page, lesson, lang);
        await expect(page.locator('.answer-feedback.success')).toBeVisible();
        const next = await visibleAction(page);
        await expect(next.action).toHaveAccessibleName(mode === 'lesson' || mode === 'practice' ? lang === 'ru' ? 'Вернуться к маршруту' : 'Return to the path' : lang === 'ru' ? 'Следующий вопрос' : 'Next question');
        expect(new URL(page.url()).hash).toBe(`#${hash}`);
        await expect(page.locator('.answer-feedback')).toContainText(lesson.quiz.explanation);
        const saved = await assertSavedContract(page, mode, initial, lesson);
        await page.keyboard.press('Tab');
        await expect(next.action).toBeFocused();
        await next.click();
        if (mode === 'lesson' || mode === 'practice') await expect(page).toHaveURL(/#path$/);
        else {
          await expect(page.locator('.lesson-top')).toContainText('2/');
          await expect(page.locator('#page-title')).toBeFocused();
          await expect(page.locator('.answer-feedback')).toHaveCount(0);
        }
        expect(await read(page)).toEqual(saved);
      });
    }
  }

  for (const mode of ['guided', 'review']) {
    test(`answer next step ${lang} ${mode}: final answer offers a visible result action, not automatic navigation`, async ({ page }) => {
      const { initial, lesson, hash } = await openQuestion(page, mode, lang, { width: 320, height: 640 }, true);
      await answer(page, lesson, lang);
      const next = await visibleAction(page);
      await expect(next.action).toHaveText(lang === 'ru' ? /Посмотреть результат/ : /See the result/);
      expect(new URL(page.url()).hash).toBe(`#${hash}`);
      const saved = await assertSavedContract(page, mode, initial, lesson);
      await next.click();
      await expect(page.getByRole('heading', { name: mode === 'guided' ? lang === 'ru' ? 'Хорошее начало.' : 'A good beginning.' : lang === 'ru' ? 'Вы освежили навыки.' : 'You refreshed your skills.' })).toBeFocused();
      expect(await read(page)).toEqual(saved);
    });
  }

  for (const mode of ['lesson', 'practice', 'guided', 'review']) {
    test(`answer next step ${lang} ${mode}: wrong answer has an explicit in-view retry and returns to choice without saving`, async ({ page }) => {
      const { initial, lesson } = await openQuestion(page, mode, lang, { width: 320, height: 640 });
      await answer(page, lesson, lang, false);
      await expect(page.locator('.answer-feedback.retry')).toBeVisible();
      const retry = await visibleAction(page);
      await expect(retry.action).toHaveAccessibleName(lang === 'ru' ? 'Выбрать другой ответ' : 'Choose another answer');
      await expect(checkButton(page, lang)).toHaveCount(0);
      expect(await read(page)).toEqual(initial);
      await retry.click();
      await expect(page.locator('.choice').first()).toBeFocused();
      await expect(page.locator('.choice[aria-pressed=true]')).toHaveCount(0);
      await expect(page.locator('.answer-feedback')).toHaveCount(0);
      await expect(checkButton(page, lang)).toBeDisabled();
      expect(await read(page)).toEqual(initial);
      await answer(page, lesson, lang);
      await visibleAction(page);
      await assertSavedContract(page, mode, initial, lesson);
    });
  }

  test(`answer next step ${lang}: storage failure focuses the error, then an explicit answer retry reveals the saved action`, async ({ page }) => {
    const { initial, lesson } = await openQuestion(page, 'practice', lang, { width: 390, height: 844 });
    await page.evaluate((key) => {
      const original = Storage.prototype.setItem;
      window.restoreAnswerWrites = () => { Storage.prototype.setItem = original; };
      Storage.prototype.setItem = function (name, value) {
        if (this === localStorage && name === key) throw new DOMException('Synthetic answer write denial', 'QuotaExceededError');
        return original.call(this, name, value);
      };
    }, KEY);
    await answer(page, lesson, lang);
    await expect(page.getByRole('alert')).toBeFocused();
    await expect(page.getByRole('alert')).toContainText(lang === 'ru' ? 'Не удалось сохранить' : 'Storage could not be read or written');
    await expect(page.locator('.answer-feedback')).toHaveCount(0);
    expect(await read(page)).toEqual(initial);
    await page.evaluate(() => window.restoreAnswerWrites());
    await checkButton(page, lang).click();
    await visibleAction(page);
    await assertSavedContract(page, 'practice', initial, lesson);
  });

  for (const timeout of [false, true]) {
    test(`answer next step ${lang}: queued answer ${timeout ? 'timeout focuses error and allows retry' : 'waits for persistence before showing the next action'}`, async ({ page, context }) => {
      const { initial, lesson } = await openQuestion(page, 'guided', lang, { width: 320, height: 640 });
      const holder = await context.newPage();
      await holder.goto('/?lang=en#about');
      await holder.evaluate((key) => {
        window.answerLockReady = false;
        navigator.locks.request(key, () => { window.answerLockReady = true; return new Promise((resolve) => { window.releaseAnswerLock = resolve; }); });
      }, KEY);
      await expect.poll(() => holder.evaluate(() => window.answerLockReady)).toBe(true);
      try {
        await page.bringToFront();
        await answer(page, lesson, lang);
        await expect(page.getByRole('button', { name: lang === 'ru' ? 'Сохраняем…' : 'Saving…', exact: true })).toBeDisabled();
        await expect(page.locator('.answer-feedback')).toHaveCount(0);
        expect(await read(page)).toEqual(initial);
        if (timeout) {
          await expect(page.getByRole('alert')).toContainText(lang === 'ru' ? 'Хранилище занято другой вкладкой' : 'Another tab is using storage', { timeout: 8000 });
          await expect(page.getByRole('alert')).toBeFocused();
          await expect(page.locator('.answer-feedback')).toHaveCount(0);
          expect(await read(page)).toEqual(initial);
        }
        await holder.evaluate(() => window.releaseAnswerLock());
        if (timeout) await checkButton(page, lang).click();
        await visibleAction(page);
        await assertSavedContract(page, 'guided', initial, lesson);
      } finally { await holder.evaluate(() => window.releaseAnswerLock()); await holder.close(); }
    });
  }
}
