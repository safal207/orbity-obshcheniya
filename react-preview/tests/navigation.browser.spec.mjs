import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
// The legacy course is browser ESM inside a CommonJS package. Load its exact
// checked-in bytes as ESM for Node; do not reclassify production files or copy data.
const courseSource = readFileSync(new URL('../../dist/course.js', import.meta.url), 'utf8');
const { lessons, missions } = await import(`data:text/javascript;base64,${Buffer.from(courseSource).toString('base64')}`);
import { GUIDED } from '../navigation.mjs';
const KEY = 'orbity-dialoga-progress-v1';
const empty = () => ({ completed: {}, answers: {}, notes: {}, review: {}, missionSteps: {}, focusModule: null, currentLessonId: null, guidedFlow: null });
const read = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);
async function seed(page, state) {
  await page.goto('/'); await page.evaluate(({ key, state }) => localStorage.setItem(key, JSON.stringify(state)), { key: KEY, state });
}
async function begin(page, topic) {
  await page.goto('/#start'); await page.locator(`[data-topic=${topic}]`).click();
  await expect(page).toHaveURL(new RegExp(`#guided/${topic}$`));
  await expect(page.locator('.lesson-top')).toContainText('ВОПРОС 1/3');
}
async function answer(page, topic, step, english = false) {
  const lesson = lessons.find((l) => l.id === GUIDED[topic][step]);
  await page.locator('.choice').nth(lesson.quiz.correct[0]).click();
  await page.getByRole('button', { name: english ? 'Check answer' : 'Проверить ответ', exact: true }).click();
}
async function holdLock(page) {
  await page.evaluate((key) => {
    window.lockReady = false;
    navigator.locks.request(key, () => { window.lockReady = true; return new Promise((r) => { window.releaseTestLock = r; }); });
  }, KEY);
  await expect.poll(() => page.evaluate(() => window.lockReady)).toBe(true);
}
for (const topic of Object.keys(GUIDED)) {
  test(`guided ${topic}: all three questions, explanation and phrase without lesson XP`, async ({ page }) => {
    await begin(page, topic);
    for (let step = 0; step < 3; step++) {
      await answer(page, topic, step);
      await expect(page.locator('.feedback.success')).toBeVisible();
      expect((await read(page)).guidedFlow).toEqual({ topic, step: step + 1 });
      expect((await read(page)).completed).toEqual({}); expect((await read(page)).answers).toEqual({});
      await expect(page.getByTestId('xp')).toContainText('0 XP');
      await page.locator('.feedback.success summary').click();
      await expect(page.locator('.feedback.success blockquote')).toBeVisible();
      await expect(page.locator('textarea')).toBeVisible();
      await page.getByRole('button', { name: step < 2 ? 'Следующий вопрос' : 'Посмотреть результат', exact: true }).click();
    }
    await expect(page.getByRole('heading', { name: 'Хорошее начало.' })).toBeVisible();
    await page.reload(); await expect(page.getByRole('heading', { name: 'Хорошее начало.' })).toBeVisible();
    await page.getByRole('button', { name: 'Продолжить тему', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`#lesson/${topic}-1$`));
    expect((await read(page)).guidedFlow).toBeNull(); expect((await read(page)).completed).toEqual({});
  });
}
test('guided resume survives root reload and RU/EN; a forged URL cannot skip', async ({ page }) => {
  await begin(page, 'listening'); await answer(page, 'listening', 0);
  await expect(page.locator('.feedback.success')).toBeVisible();
  await page.goto('/'); await expect(page.getByTestId('resume-label')).toContainText('2/3');
  await page.getByTestId('resume').click(); await expect(page.locator('.lesson-top')).toContainText('ВОПРОС 2/3');
  await page.getByRole('button', { name: 'Switch to English' }).click();
  await expect(page.locator('.lesson-top')).toContainText('QUESTION 2/3');
  await page.reload(); await expect(page.locator('.lesson-top')).toContainText('QUESTION 2/3');
  await page.goto('/#guided/2'); await expect(page.locator('.lesson-top')).toContainText('ВОПРОС 2/3');
  expect((await read(page)).guidedFlow.step).toBe(1);
});
test('wrong guided answer does not advance or complete a lesson', async ({ page }) => {
  await begin(page, 'needs'); const before = await read(page);
  const lesson = lessons.find((l) => l.id === GUIDED.needs[0]);
  const wrong = lesson.quiz.choices.findIndex((_, i) => !lesson.quiz.correct.includes(i));
  await page.locator('.choice').nth(wrong).click(); await page.getByRole('button', { name: 'Проверить ответ', exact: true }).click();
  await expect(page.locator('.feedback.retry')).toBeVisible(); expect(await read(page)).toEqual(before);
});
test('held real Web Lock prevents early guided success', async ({ page }) => {
  await begin(page, 'needs'); const before = await read(page); await holdLock(page);
  await answer(page, 'needs', 0);
  await expect(page.getByRole('button', { name: 'Сохраняем…', exact: true })).toBeDisabled();
  await expect(page.locator('.feedback.success')).toHaveCount(0); expect(await read(page)).toEqual(before);
  await page.evaluate(() => window.releaseTestLock());
  await expect(page.locator('.feedback.success')).toBeVisible(); expect((await read(page)).guidedFlow.step).toBe(1);
});
test('failed guided persistence keeps cursor, five maps and XP unchanged', async ({ page }) => {
  await begin(page, 'needs'); const before = await read(page);
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('Synthetic guided write fault'); }; });
  await answer(page, 'needs', 0);
  await expect(page.getByRole('alert')).toContainText('Не удалось');
  await expect(page.locator('.feedback.success')).toHaveCount(0); expect(await read(page)).toEqual(before);
  await expect(page.getByTestId('xp')).toContainText('0 XP');
});
test('queued old answer cannot advance a topic changed in another tab', async ({ context, page }) => {
  await begin(page, 'listening'); const second = await context.newPage(); await second.goto('/#start');
  await holdLock(second); await second.locator('[data-topic=conflict]').click();
  await expect(second.locator('[data-topic=conflict]')).toBeDisabled();
  await answer(page, 'listening', 0);
  await expect(page.getByRole('button', { name: 'Сохраняем…', exact: true })).toBeDisabled();
  await second.evaluate(() => window.releaseTestLock());
  await expect(second).toHaveURL(/#guided\/conflict$/);
  await expect(page.getByRole('alert')).toContainText('Тема или данные изменились');
  await expect(page.locator('.feedback.success')).toHaveCount(0);
  expect((await read(page)).guidedFlow).toEqual({ topic: 'conflict', step: 0 });
  expect((await read(page)).completed).toEqual({});
});
test('legacy review, module, mission and about links stay useful in React', async ({ page }) => {
  const state = { ...empty(), completed: { 'map-1': 1000 }, review: { 'map-1': 1 } };
  await seed(page, state);

  await page.goto('/#review');
  await expect(page.locator('.lesson-top')).toContainText('ПРАКТИКА');
  expect((await read(page)).completed).toEqual({ 'map-1': 1000 });

  await page.goto('/#module/needs');
  await expect(page.locator('#unit')).toHaveValue('needs');

  const mission = missions[0];
  await page.goto(`/#mission/${mission.id}`);
  await expect(page.locator(`#mission-${mission.id}`)).toBeFocused();

  await page.goto('/#about');
  await expect(page.getByRole('heading', { name: 'О подходе' })).toBeVisible();
  expect((await read(page)).completed).toEqual({ 'map-1': 1000 });
});

test('saved legacy lesson and module resume without erasing any progress maps', async ({ page }) => {
  const state = { ...empty(), currentLessonId: 'needs-2', focusModule: 'needs', notes: { 'map-1': 'KEEP THIS NOTE' }, completed: { 'map-1': 1000 } };
  await seed(page, state); await page.goto('/');
  await expect(page.locator('#unit')).toHaveValue('needs'); await page.getByTestId('resume').click();
  await expect(page).toHaveURL(/#lesson\/needs-2$/); expect(await read(page)).toEqual(state);
});
test('lesson screens survive reload and Back/Forward; direct URL wins over bookmark', async ({ page }) => {
  const state = { ...empty(), currentLessonId: 'needs-2', focusModule: 'needs' };
  await seed(page, state); await page.goto('/#lesson/map-1');
  await expect(page.locator('.lesson-top')).toContainText('ШАГ 1/3'); expect(await read(page)).toEqual(state);
  await page.getByRole('button', { name: 'Попробуем' }).click(); await expect(page).toHaveURL(/#lesson\/map-1\/1$/);
  await page.getByRole('button', { name: 'Проверить понимание' }).click(); await expect(page).toHaveURL(/#lesson\/map-1\/2$/);
  await page.reload(); await expect(page.locator('.lesson-top')).toContainText('ШАГ 3/3');
  await page.goBack(); await expect(page.locator('.lesson-top')).toContainText('ШАГ 2/3');
  await page.goForward(); await expect(page.locator('.lesson-top')).toContainText('ШАГ 3/3');
  await expect(page.locator('.choice[aria-pressed=true]')).toHaveCount(0);
  expect((await read(page)).completed).toEqual({}); await expect(page.getByTestId('xp')).toContainText('0 XP');
});
test('failed bookmark save leaves path and storage unchanged', async ({ page }) => {
  await page.goto('/'); await expect(page.getByTestId('resume')).toBeEnabled();
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('Synthetic navigation fault'); }; });
  await page.getByTestId('resume').click(); await expect(page.getByRole('alert')).toContainText('Не удалось');
  await expect(page.locator('.path-stop')).toHaveCount(4); expect(await read(page)).toBeNull();
});
for (const width of [320, 390]) {
  test(`guided entry fits ${width}px in both languages with focus`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/#start'); await expect(page.locator('#page-title')).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`topics-${width}.png`), fullPage: true });
    await page.locator('[data-topic=conflict]').click(); await expect(page.locator('.lesson-top')).toContainText('ВОПРОС 1/3');
    await expect(page.locator('#page-title')).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Switch to English' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`guided-en-${width}.png`), fullPage: true });
  });
}
