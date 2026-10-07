import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const loadCourse = async (path) => import(`data:text/javascript;base64,${Buffer.from(readFileSync(new URL(path, import.meta.url), 'utf8')).toString('base64')}`);
const courses = { ru: await loadCourse('../../dist/course.js'), en: await loadCourse('../../dist/course.en.js') };
const KEY = 'orbity-dialoga-progress-v1';
const empty = () => ({ completed: {}, answers: {}, notes: {}, review: {}, missionSteps: {}, focusModule: null, currentLessonId: null, guidedFlow: null });
const read = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);
async function open(page, lang, state) {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto(`/?lang=${lang}`);
  await page.evaluate(({ key, state }) => localStorage.setItem(key, JSON.stringify(state)), { key: KEY, state });
  await page.goto(`/?lang=${lang}#review`);
}
async function answer(page, lesson, lang) {
  await page.locator('.choice').nth(lesson.quiz.correct[0]).click();
  await page.getByRole('button', { name: lang === 'ru' ? 'Проверить ответ' : 'Check answer', exact: true }).click();
}
async function holdLock(page) {
  await page.evaluate((key) => {
    window.reviewLockReady = false;
    navigator.locks.request(key, () => { window.reviewLockReady = true; return new Promise((resolve) => { window.releaseReviewLock = resolve; }); });
  }, KEY);
  await expect.poll(() => page.evaluate(() => window.reviewLockReady)).toBe(true);
}

for (const lang of ['ru', 'en']) {
  test(`review ${lang}: empty state never selects or saves an unfinished lesson`, async ({ page }) => {
    const state = { ...empty(), notes: { 'map-1': 'KEEP unfinished reflection' }, review: { 'map-1': 1 } };
    await open(page, lang, state);
    await expect(page.getByTestId('review-empty')).toBeVisible();
    await expect(page.getByRole('heading', { name: lang === 'ru' ? 'Сначала пройдите один урок.' : 'Complete a lesson first.' })).toBeFocused();
    await expect(page.locator('.choice')).toHaveCount(0);
    expect(await read(page)).toEqual(state);
    await expect(page.getByTestId('xp')).toContainText('0 XP');
  });

  test(`review ${lang}: stable due queue stops at four, saves reflections and finishes without XP`, async ({ page, context, browserName }) => {
    const lessons = courses[lang].lessons.slice(0, 6);
    const state = { ...empty(), completed: Object.fromEntries(lessons.map((lesson) => [lesson.id, 1000])),
      review: Object.fromEntries(lessons.map((lesson, index) => [lesson.id, index === 0 ? Date.now() + 86400000 : 1])),
      notes: { [lessons[1].id]: 'KEEP prior reflection' }, missionSteps: { 'listen-ten': [true, false, true] },
      focusModule: 'needs', currentLessonId: 'needs-1', guidedFlow: { topic: 'needs', step: 1 } };
    const queue = lessons.slice(1, 5);
    await open(page, lang, state);
    for (let position = 0; position < queue.length; position++) {
      const lesson = queue[position];
      await expect(page.locator('.lesson-top')).toContainText(`${position + 1}/4`);
      await expect(page.getByRole('heading', { name: lesson.quiz.prompt, exact: true })).toBeFocused();
      if (position === 0) {
        const wrong = lesson.quiz.choices.findIndex((_, index) => !lesson.quiz.correct.includes(index));
        await page.locator('.choice').nth(wrong).click();
        await page.getByRole('button', { name: lang === 'ru' ? 'Проверить ответ' : 'Check answer', exact: true }).click();
        await expect(page.locator('.feedback.retry')).toBeVisible();
        expect(await read(page)).toEqual(state);
      }
      const before = Date.now();
      await answer(page, lesson, lang);
      await expect(page.locator('.feedback.success')).toBeVisible();
      let saved = await read(page);
      expect(saved.answers[lesson.id]).toBe(lesson.quiz.correct[0]);
      expect(saved.review[lesson.id]).toBeGreaterThanOrEqual(before + 3 * 86400000);
      expect(saved.review[lesson.id]).toBeLessThanOrEqual(Date.now() + 3 * 86400000);
      expect(saved.completed).toEqual(state.completed);
      expect(saved.missionSteps).toEqual(state.missionSteps);
      expect(saved.focusModule).toBe(state.focusModule);
      expect(saved.currentLessonId).toBe(state.currentLessonId);
      expect(saved.guidedFlow).toEqual(state.guidedFlow);
      await expect(page.getByTestId('xp')).toContainText('120 XP');
      if (position === 0) {
        await page.locator('.result-details summary').click();
        await expect(page.locator('.result-details blockquote')).toHaveText(lesson.example);
        if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        await page.getByRole('button', { name: lang === 'ru' ? 'Скопировать пример' : 'Copy example', exact: true }).click();
        await expect(page.locator('.result-details')).toContainText(lang === 'ru' ? 'Пример скопирован.' : 'Example copied.');
        if (browserName === 'chromium') expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(lesson.example);
        await expect(page.locator('textarea')).toHaveValue('KEEP prior reflection');
        await page.locator('textarea').fill(`DURABLE review ${lang}`);
        await expect.poll(async () => (await read(page)).notes[lesson.id]).toBe(`DURABLE review ${lang}`);
        await expect(page.locator('.save-state')).toHaveText(lang === 'ru' ? 'Сохранено на этом устройстве' : 'Saved on this device');
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.getByRole('button', { name: position < 3 ? lang === 'ru' ? 'Следующий вопрос' : 'Next question' : lang === 'ru' ? 'Посмотреть результат' : 'See the result', exact: false }).click();
    }
    await expect(page.getByTestId('review-complete')).toBeVisible();
    await expect(page.getByRole('heading', { name: lang === 'ru' ? 'Вы освежили навыки.' : 'You refreshed your skills.' })).toBeFocused();
    const saved = await read(page);
    expect(Object.keys(saved.answers)).toEqual(queue.map((lesson) => lesson.id));
    expect(saved.review[lessons[0].id]).toBe(state.review[lessons[0].id]);
    expect(saved.review[lessons[5].id]).toBe(1);
    await page.reload();
    // Reload starts a fresh queue, which now contains the fifth overdue lesson.
    await expect(page.locator('.lesson-top')).toContainText('1/1');
    await expect(page.getByRole('heading', { name: lessons[5].quiz.prompt, exact: true })).toBeVisible();
    expect((await read(page)).notes[queue[0].id]).toBe(`DURABLE review ${lang}`);
  });

  test(`review ${lang}: completed lessons remain available when no review is due`, async ({ page }) => {
    const lesson = courses[lang].lessons[2];
    const state = { ...empty(), completed: { [lesson.id]: 1000 }, review: { [lesson.id]: Date.now() + 86400000 } };
    await open(page, lang, state);
    await expect(page.locator('.lesson-top')).toContainText('1/1');
    await expect(page.getByRole('heading', { name: lesson.quiz.prompt, exact: true })).toBeVisible();
    expect(await read(page)).toEqual(state);
  });

  test(`review ${lang}: failed persistence has no success or next question`, async ({ page }) => {
    const lesson = courses[lang].lessons[0];
    const state = { ...empty(), completed: { [lesson.id]: 1000 }, notes: { [lesson.id]: 'KEEP' }, review: { [lesson.id]: 1 } };
    await open(page, lang, state);
    await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('Synthetic review write rejection'); }; });
    await answer(page, lesson, lang);
    await expect(page.getByRole('alert')).toContainText(lang === 'ru' ? 'Не удалось сохранить' : 'Storage could not be read or written');
    await expect(page.locator('.feedback.success')).toHaveCount(0);
    await expect(page.getByTestId('review-complete')).toHaveCount(0);
    expect(await read(page)).toEqual(state);
    await expect(page.getByTestId('xp')).toContainText('20 XP');
  });

  test(`review ${lang}: queued answer cannot recreate progress removed in another tab`, async ({ page, context }) => {
    const lesson = courses[lang].lessons[0];
    const state = { ...empty(), completed: { [lesson.id]: 1000 }, review: { [lesson.id]: 1 } };
    await open(page, lang, state);
    const second = await context.newPage(); await second.goto('/#progress');
    await expect(second.locator('input[type=file]')).toBeAttached();
    await holdLock(second);
    const replacement = { ...empty(), notes: { [lesson.id]: 'RESTORED note' } };
    second.once('dialog', (dialog) => dialog.accept());
    await second.locator('input[type=file]').setInputFiles({ name: 'restore.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...replacement, version: 1 })) });
    await expect.poll(() => second.evaluate(async (key) => (await navigator.locks.query()).pending.filter((lock) => lock.name === key).length, KEY)).toBe(1);
    await answer(page, lesson, lang);
    await expect(page.locator('.choice').first()).toBeDisabled();
    await expect(page.locator('.feedback.success')).toHaveCount(0);
    expect(await read(page)).toEqual(state);
    await second.evaluate(() => window.releaseReviewLock());
    await expect(second.locator('.notice')).toContainText('Резервная копия восстановлена.');
    await expect(page.getByRole('alert')).toContainText(lang === 'ru' ? 'Тема или данные изменились' : 'The topic or data changed');
    await expect(page.locator('.feedback.success')).toHaveCount(0);
    expect(await read(page)).toEqual(replacement);
    await page.getByRole('button', { name: lang === 'ru' ? 'Обновить повторение' : 'Refresh review' }).click();
    await expect(page.getByTestId('review-empty')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(await read(page)).toEqual(replacement);
    await expect(page.getByTestId('xp')).toContainText('0 XP');
  });
}

for (const mode of ['lesson', 'practice']) {
  test(`${mode}: success exposes example, copy and a durable note`, async ({ page }) => {
    const lesson = courses.ru.lessons[0];
    await page.goto(`/#${mode}/${lesson.id}`);
    if (mode === 'lesson') {
      await page.getByRole('button', { name: 'Попробуем' }).click();
      await page.getByRole('button', { name: 'Проверить понимание' }).click();
    }
    await answer(page, lesson, 'ru');
    await expect(page.locator('.feedback.success')).toBeVisible();
    await page.locator('.result-details summary').click();
    await expect(page.locator('.result-details blockquote')).toHaveText(lesson.example);
    await expect(page.getByRole('button', { name: 'Скопировать пример', exact: true })).toBeVisible();
    await page.locator('textarea').fill(`DURABLE ${mode} reflection`);
    await expect.poll(async () => (await read(page)).notes[lesson.id]).toBe(`DURABLE ${mode} reflection`);
    const saved = await read(page);
    if (mode === 'practice') { expect(saved.completed).toEqual({}); await expect(page.getByTestId('xp')).toContainText('0 XP'); }
    else { expect(saved.completed[lesson.id]).toBeGreaterThan(0); await expect(page.getByTestId('xp')).toContainText('20 XP'); }
    await page.reload();
    expect((await read(page)).notes[lesson.id]).toBe(`DURABLE ${mode} reflection`);
  });
}
