import { test, expect } from '@playwright/test';
const KEY = 'orbity-dialoga-progress-v1';
const empty = () => ({ completed: {}, answers: {}, notes: {}, review: {}, missionSteps: {}, focusModule: null, currentLessonId: null, guidedFlow: null });
const read = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);
async function openNote(page, id, english = false) {
  await page.goto(`${english ? '/?lang=en' : '/'}#lesson/${id}`);
  await page.getByRole('button', { name: english ? 'Let’s try it' : 'Попробуем', exact: false }).click();
  const note = page.locator('textarea');
  // Enter the note screen before injecting a note-write fault or holding a lock.
  // A click is not evidence that asynchronous bookmark persistence has finished.
  await expect(note).toBeVisible();
  await expect(note).toBeEnabled();
  return note;
}
async function quiz(page, id) {
  await page.goto(`/#lesson/${id}`);
  await page.getByRole('button', { name: 'Попробуем' }).click();
  await page.getByRole('button', { name: 'Проверить понимание' }).click();
  await expect(page.locator('.choice').first()).toBeVisible();
  await expect(page.locator('.choice').first()).toBeEnabled();
}

for (const width of [320, 390, 768, 1280]) {
  test(`path and lesson fit ${width}px with keyboard focus and reduced motion`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    if (width <= 700) {
      await expect(page.locator('.mobile-count')).toBeVisible();
      await expect(page.locator('.lesson-count')).toBeHidden();
      await expect(page.getByTestId('xp')).toContainText('0 XP · 0/32');
    }
    await expect(page.locator('.path-stop')).toHaveCount(4);
    await expect(page.locator('#unit option')).toHaveCount(8);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`path-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: /Метафора — не диагноз/ }).click();
    await expect(page.locator('#page-title')).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`lesson-${width}.png`), fullPage: true });
    expect(errors).toEqual([]);
  });
}

test('full lessons persist once; wrong answers and practice do not award completion', async ({ page }) => {
  await quiz(page, 'map-1');
  await page.locator('.choice').nth(0).click(); await page.getByRole('button', { name: 'Проверить ответ' }).click();
  await expect(page.locator('.feedback.retry')).toBeVisible();
  await expect(page.getByTestId('xp')).toContainText('0 XP');
  await page.locator('.choice').nth(1).click(); await page.getByRole('button', { name: 'Проверить ответ' }).click();
  await expect(page.getByRole('heading', { name: 'Урок завершён!' })).toBeVisible();
  await expect(page.getByTestId('xp')).toContainText('20 XP');
  const first = (await read(page)).completed['map-1'];
  await quiz(page, 'map-1');
  await expect(page.locator('.choice[aria-pressed="true"]')).toHaveCount(0);
  await page.locator('.choice').nth(1).click(); await page.getByRole('button', { name: 'Проверить ответ' }).click();
  await expect(page.getByRole('heading', { name: 'Урок завершён!' })).toBeVisible();
  expect((await read(page)).completed['map-1']).toBe(first);
  await expect(page.getByTestId('xp')).toContainText('20 XP');
  await page.goto('/#practice/map-2');
  await page.locator('.choice').nth(2).click(); await page.getByRole('button', { name: 'Проверить ответ' }).click();
  await expect(page.getByRole('heading', { name: 'Практика сохранена!' })).toBeVisible();
  expect((await read(page)).completed['map-2']).toBeUndefined();
  await expect(page.getByTestId('xp')).toContainText('20 XP');
});

test('storage write failure cannot display lesson success or increase XP', async ({ page }) => {
  await quiz(page, 'map-1');
  const before = await read(page); // Navigating has saved a bookmark, not completion.
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Test quota fault', 'QuotaExceededError'); }; });
  await page.locator('.choice').nth(1).click(); await page.getByRole('button', { name: 'Проверить ответ' }).click();
  await expect(page.getByRole('alert')).toContainText('Не удалось');
  await expect(page.locator('.feedback.success')).toHaveCount(0);
  await expect(page.getByTestId('xp')).toContainText('0 XP');
  expect(await read(page)).toEqual(before);
});

test('failed note draft survives RU/EN and SPA navigation; import is blocked', async ({ page }) => {
  const note = await openNote(page, 'map-1');
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('Test write fault'); }; });
  await note.fill('UNSAVED SYNTHETIC REFLECTION');
  await expect(page.locator('.save-state')).toContainText('Не удалось');
  await page.getByRole('button', { name: 'Switch to English' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(note).toHaveValue('UNSAVED SYNTHETIC REFLECTION');
  await page.getByRole('button', { name: 'Progress', exact: true }).click();
  await page.locator('details.card summary').click();
  await expect(page.locator('textarea')).toHaveValue('UNSAVED SYNTHETIC REFLECTION');
  const file = { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...empty(), version: 1 })) };
  let confirmations = 0; page.on('dialog', async (d) => { confirmations++; await d.dismiss(); });
  await page.locator('input[type=file]').setInputFiles(file);
  await expect(page.getByRole('alert')).toContainText('unsaved notes');
  expect(confirmations).toBe(0);
});

test('2000-character note survives autosave, RU/EN and reload at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  const note = await openNote(page, 'map-1');
  const value = ('Длинная заметка · useful reflection · 0123456789\n').repeat(60).slice(0, 2000);
  expect(value.length).toBe(2000);

  await note.fill(value);
  await expect(page.locator('.save-state')).toContainText('Сохранено');
  expect((await read(page)).notes['map-1']).toBe(value);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.getByRole('button', { name: 'Switch to English' }).click();
  await expect(note).toHaveValue(value);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.reload();
  await expect(page.locator('textarea')).toHaveValue(value);
  expect((await read(page)).notes['map-1']).toBe(value);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('two RU/EN tabs retain independent note edits', async ({ context, page }) => {
  const second = await context.newPage();
  const a = await openNote(page, 'map-1');
  const b = await openNote(second, 'listening-1', true);
  await a.fill('RU TAB SYNTHETIC NOTE'); await b.fill('EN TAB SYNTHETIC NOTE');
  await expect(page.locator('.save-state')).toContainText('Сохранено');
  await expect(second.locator('.save-state')).toContainText('Saved on this device');
  const result = await read(page);
  expect(result.notes['map-1']).toBe('RU TAB SYNTHETIC NOTE');
  expect(result.notes['listening-1']).toBe('EN TAB SYNTHETIC NOTE');
});

test('same-note conflict retains losing draft without overwriting the winning tab', async ({ context, page }) => {
  const second = await context.newPage();
  const a = await openNote(page, 'map-1'); const b = await openNote(second, 'map-1', true);
  await page.evaluate((key) => {
    window.lockReady = false;
    navigator.locks.request(key, () => { window.lockReady = true; return new Promise((resolve) => { window.releaseTestLock = resolve; }); });
  }, KEY);
  await expect.poll(() => page.evaluate(() => window.lockReady)).toBe(true);
  await a.fill('FIRST DRAFT'); await expect(page.locator('.save-state')).toContainText('Сохраняем');
  await b.fill('SECOND DRAFT'); await expect(second.locator('.save-state')).toContainText('Saving');
  await page.evaluate(() => window.releaseTestLock());
  await expect(page.locator('.save-state')).toContainText('Сохранено');
  await expect(second.locator('.save-state')).toContainText('Another tab changed');
  await expect(b).toHaveValue('SECOND DRAFT');
  expect((await read(second)).notes['map-1']).toBe('FIRST DRAFT');
});

test('invalid import is rejected before confirmation; valid backup repairs corruption', async ({ page }) => {
  await page.goto('/'); await page.evaluate((key) => localStorage.setItem(key, '{broken'), KEY);
  await page.reload(); await page.getByRole('button', { name: 'Прогресс', exact: true }).click();
  await expect(page.getByTestId('xp')).toContainText('—');
  let confirmations = 0; page.on('dialog', async (d) => { confirmations++; await d.accept(); });
  await page.locator('input[type=file]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('[]') });
  await expect(page.getByRole('alert')).toContainText('Файл не подходит');
  expect(confirmations).toBe(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe('{broken');
  const restored = { ...empty(), notes: { 'map-1': 'RESTORED SYNTHETIC NOTE' }, version: 1 };
  await page.locator('input[type=file]').setInputFiles({ name: 'valid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(restored)) });
  await expect(page.locator('.notice')).toContainText('восстановлена');
  expect(confirmations).toBe(1);
  expect((await read(page)).notes['map-1']).toBe('RESTORED SYNTHETIC NOTE');
});

test('mission checkbox is saved and shared with English without completing lessons', async ({ page }) => {
  await page.goto('/#missions');
  // A controlled checkbox acknowledges persistence, not the transient click.
  // Hold the real origin lock to prove no successful UI state appears early.
  await page.evaluate((key) => {
    window.lockReady = false;
    navigator.locks.request(key, () => { window.lockReady = true; return new Promise((resolve) => { window.releaseTestLock = resolve; }); });
  }, KEY);
  await expect.poll(() => page.evaluate(() => window.lockReady)).toBe(true);
  const checkbox = page.locator('.mission-step input').first();
  await checkbox.click();
  await expect(checkbox).toBeDisabled();
  await expect(checkbox).not.toBeChecked();
  expect(await read(page)).toBeNull();
  await page.evaluate(() => window.releaseTestLock());
  await expect.poll(async () => (await read(page))?.missionSteps?.['listen-ten']?.[0]).toBe(true);
  await expect(checkbox).toBeChecked();
  await page.getByRole('button', { name: 'Switch to English' }).click();
  await expect(page.locator('.mission-step input').first()).toBeChecked();
  expect((await read(page)).missionSteps['listen-ten'][0]).toBe(true);
  await expect(page.getByTestId('xp')).toContainText('0 XP');
});


test('failed mission persistence leaves checkbox and stored progress unchanged', async ({ page }) => {
  await page.goto('/#missions');
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('Test mission write fault'); }; });
  await page.locator('.mission-step input').first().click();
  await expect(page.getByRole('alert')).toContainText('Не удалось');
  await expect(page.locator('.mission-step input').first()).not.toBeChecked();
  expect(await read(page)).toBeNull();
  await expect(page.getByTestId('xp')).toContainText('0 XP');
});

test('missing Web Locks fails closed without successful completion', async ({ page }) => {
  await quiz(page, 'map-1');
  const before = await read(page); // The bookmark is allowed; false completion is not.
  await page.evaluate(() => Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined }));
  await page.locator('.choice').nth(1).click();
  await page.getByRole('button', { name: 'Проверить ответ' }).click();
  await expect(page.getByRole('alert')).toContainText('Web Locks');
  await expect(page.locator('.feedback.success')).toHaveCount(0);
  expect(await read(page)).toEqual(before);
  await expect(page.getByTestId('xp')).toContainText('0 XP');
});


test('exported backup round-trips exact saved state through RU/EN UI', async ({ page }) => {
  const source = {
    ...empty(),
    completed: { 'map-1': 1000 },
    answers: { 'map-1': 1 },
    notes: { 'map-1': 'ROUNDTRIP SYNTHETIC NOTE' },
    review: { 'map-1': 2000 },
    missionSteps: { 'listen-ten': [true, false, false] },
    focusModule: 'needs',
    currentLessonId: 'needs-1',
    guidedFlow: { topic: 'needs', step: 1 },
  };

  // Seed one complete valid v1 state, then exercise only the real export/import UI.
  await page.goto('/');
  await page.evaluate(({ key, state }) => localStorage.setItem(key, JSON.stringify(state)), { key: KEY, state: source });
  await page.reload();
  await page.getByRole('button', { name: 'Прогресс', exact: true }).click();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Скачать копию', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('orbity-progress-v1.json');
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const exportedRaw = Buffer.concat(chunks).toString('utf8');
  const exported = JSON.parse(exportedRaw);
  expect(exported.version).toBe(1);
  expect(Number.isFinite(Date.parse(exported.savedAt))).toBe(true);
  const { version, savedAt, ...exportedState } = exported;
  expect(exportedState).toEqual(source);
  await expect(page.locator('.notice')).toContainText('Экспортирован сохранённый прогресс');

  // Replace storage with a different valid state so restore must actually write.
  await page.evaluate(({ key, state }) => localStorage.setItem(key, JSON.stringify(state)), { key: KEY, state: empty() });
  await page.reload();
  expect(await read(page)).toEqual(empty());

  let confirmation = '';
  page.once('dialog', async (dialog) => {
    confirmation = dialog.message();
    await dialog.accept();
  });
  await page.locator('input[type=file]').setInputFiles({
    name: download.suggestedFilename(),
    mimeType: 'application/json',
    buffer: Buffer.from(exportedRaw),
  });
  await expect(page.locator('.notice')).toContainText('Резервная копия восстановлена');
  expect(confirmation).toContain('Заменить сохранённый прогресс');
  expect(await read(page)).toEqual(source);

  // RU and EN must observe the same restored maps and continuation cursor.
  await page.getByRole('button', { name: 'Маршрут', exact: true }).click();
  await expect(page.getByTestId('resume-label')).toContainText('Сохранён вопрос 2/3');
  await page.getByRole('button', { name: 'Switch to English' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByTestId('resume-label')).toContainText('Saved question 2/3');
  expect(await read(page)).toEqual(source);

  await page.getByTestId('resume').click();
  await expect(page).toHaveURL(/#guided\/needs$/);
  await expect(page.locator('.lesson-top')).toContainText('QUESTION 2/3');
  await page.reload();
  expect(await read(page)).toEqual(source);
  expect((await read(page)).missionSteps['listen-ten']).toEqual([true, false, false]);
  expect((await read(page)).notes['map-1']).toBe('ROUNDTRIP SYNTHETIC NOTE');
  expect((await read(page)).completed).toEqual({ 'map-1': 1000 });
  expect((await read(page)).currentLessonId).toBe('needs-1');
  expect((await read(page)).guidedFlow).toEqual({ topic: 'needs', step: 1 });
});
