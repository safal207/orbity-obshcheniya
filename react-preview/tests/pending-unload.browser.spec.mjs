import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const KEY = 'orbity-dialoga-progress-v1';
const source = readFileSync(new URL('../../dist/course.js', import.meta.url), 'utf8');
const { lessons } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const correct = lessons.find((lesson) => lesson.id === 'needs-1').quiz.correct[0];
const raw = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const saved = (step = 0) => ({ completed: { 'map-1': 1000 }, answers: { 'map-1': 1 },
  notes: { 'map-1': 'KEEP · synthetic note' }, review: { 'map-1': 2000 },
  missionSteps: { 'listen-ten': [true, false, true] }, focusModule: 'needs',
  currentLessonId: 'needs-1', guidedFlow: { topic: 'needs', step } });
async function setup(page, context, lang) {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/?lang=${lang}#guided/needs`);
  await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: KEY, value: saved() });
  await page.reload();
  await expect(page.locator('.lesson-top')).toContainText('1/3');
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    window.exitGuardDocument = 'original-document';
    window.exitGuardWrites = 0;
    Storage.prototype.setItem = function (k, value) {
      if (this === localStorage && k === key && (window.rejectExitGuardWrite ||
          JSON.parse(value).notes['map-1'] === 'UNSAVED LOCAL DRAFT')) {
        throw new DOMException('Synthetic write rejection', 'QuotaExceededError');
      }
      const result = original.call(this, k, value);
      if (this === localStorage && k === key) window.exitGuardWrites++;
      return result;
    };
  }, KEY);
  const holder = await context.newPage();
  await holder.goto(`/?lang=${lang === 'ru' ? 'en' : 'ru'}#path`);
  await expect(holder.locator('#unit')).toBeEnabled();
  return holder;
}
async function hold(holder) {
  await holder.evaluate((key) => {
    window.exitGuardLockReady = false;
    navigator.locks.request(key, () => {
      window.exitGuardLockReady = true;
      return new Promise((resolve) => { window.releaseExitGuardLock = resolve; });
    });
  }, KEY);
  await expect.poll(() => holder.evaluate(() => window.exitGuardLockReady)).toBe(true);
}
const release = (holder) => holder.evaluate(() => window.releaseExitGuardLock?.());
async function answer(page, lang) {
  await page.locator('.choice').nth(correct).click();
  await page.getByRole('button', { name: lang === 'ru' ? 'Проверить ответ' : 'Check answer', exact: true }).click();
  expect(await page.evaluate(() => navigator.userActivation.hasBeenActive)).toBe(true);
}
async function stay(page, method, info) {
  // Observe a native browser dialog, not a dispatched/synthetic beforeunload event.
  const observed = page.waitForEvent('dialog', { timeout: 2000 }).then(async (dialog) => {
    const type = dialog.type(); await dialog.dismiss(); return type;
  }, () => 'NO_NATIVE_DIALOG');
  if (method === 'close') await page.close({ runBeforeUnload: true });
  else await page.evaluate(() => { setTimeout(() => location.reload(), 0); });
  const type = await observed;
  await info.attach(`native-${method}-dialog`, { body: JSON.stringify({ type, decision: 'stay' }), contentType: 'application/json' });
  expect(type).toBe('beforeunload');
  expect(page.isClosed()).toBe(false);
  expect(await page.evaluate(() => window.exitGuardDocument)).toBe('original-document');
}
async function cleanExit(page, method) {
  const unexpected = [];
  const onDialog = async (dialog) => { unexpected.push(dialog.type()); await dialog.dismiss(); };
  page.on('dialog', onDialog);
  try {
    if (method === 'close') {
      await Promise.all([page.waitForEvent('close', { timeout: 3000 }), page.close({ runBeforeUnload: true })]);
    } else await page.reload({ timeout: 5000 });
    expect(unexpected).toEqual([]);
  } finally { page.off('dialog', onDialog); }
}

for (const lang of ['ru', 'en']) {
  for (const method of ['reload', 'close']) {
    test(`pending unload ${lang} ${method}: stay retains a queued guided answer, then clean exit is possible`, async ({ page, context }, info) => {
      const holder = await setup(page, context, lang);
      const before = await raw(page);
      await hold(holder);
      try {
        await answer(page, lang);
        await expect(page.getByRole('button', { name: lang === 'ru' ? 'Сохраняем…' : 'Saving…', exact: true })).toBeDisabled();
        if (method === 'close') {
          // A same-document navigation must not lose the pending-operation guard.
          await page.getByRole('button', { name: lang === 'ru' ? 'Прогресс' : 'Progress', exact: true }).click();
          await expect(page).toHaveURL(/#progress$/);
        }
        await stay(page, method, info);
        expect(await raw(page)).toBe(before);
        expect(await page.evaluate(() => window.exitGuardWrites)).toBe(0);
      } finally { await release(holder); }
      await expect.poll(() => raw(page)).toBe(JSON.stringify(saved(1)));
      expect(await page.evaluate(() => window.exitGuardWrites)).toBe(1);
      await expect(page.getByTestId('xp')).toContainText('20 XP');
      if (method === 'reload') await expect(page.locator('.feedback.success')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`pending-saved-${lang}-${method}-320.png`), fullPage: true });
      await cleanExit(page, 'reload');
      expect(await raw(page)).toBe(JSON.stringify(saved(1)));
      await page.goto(`/?lang=${lang}#guided/needs`);
      await expect(page.locator('.lesson-top')).toContainText('2/3');
      expect(await raw(page)).toBe(JSON.stringify(saved(1)));
      await cleanExit(page, 'close');
    });
  }

  for (const failure of ['write', 'timeout']) {
    test(`pending unload ${lang} ${failure}: settled failure does not leave an eternal exit warning`, async ({ page, context }, info) => {
      const holder = await setup(page, context, lang);
      const before = await raw(page);
      if (failure === 'write') await page.evaluate(() => { window.rejectExitGuardWrite = true; });
      await hold(holder);
      try {
        await answer(page, lang);
        await stay(page, 'reload', info);
        if (failure === 'write') await release(holder);
        const message = failure === 'write'
          ? (lang === 'ru' ? 'Не удалось сохранить' : 'Storage could not be read or written')
          : (lang === 'ru' ? 'Хранилище занято другой вкладкой' : 'Another tab is using storage');
        // The timeout case observes the application's actual five-second lock timeout.
        await expect(page.getByRole('alert')).toContainText(message, { timeout: 8000 });
        expect(await raw(page)).toBe(before);
        expect(await page.evaluate(() => window.exitGuardWrites)).toBe(0);
        await cleanExit(page, 'reload');
        await expect(page.locator('.lesson-top')).toContainText('1/3');
        expect(await raw(page)).toBe(before);
      } finally { await release(holder); }
    });
  }

  test(`pending unload ${lang}: finishing an answer does not remove an unrelated note-draft guard`, async ({ page, context }, info) => {
    await setup(page, context, lang);
    await page.evaluate(() => { location.hash = 'lesson/map-1/1'; });
    await page.locator('textarea').fill('UNSAVED LOCAL DRAFT');
    await expect(page.locator('.save-state')).toContainText(lang === 'ru' ? 'Не удалось сохранить' : 'Storage could not be read or written');
    await page.evaluate(() => { location.hash = 'guided/needs'; });
    await answer(page, lang);
    await expect(page.locator('.feedback.success')).toBeVisible();
    expect(await raw(page)).toBe(JSON.stringify(saved(1)));
    await stay(page, 'reload', info);
    await page.evaluate(() => { location.hash = 'lesson/map-1/1'; });
    await expect(page.locator('textarea')).toHaveValue('UNSAVED LOCAL DRAFT');
    // Explicitly restore the saved text, removing only this synthetic local draft.
    await page.locator('textarea').fill(saved().notes['map-1']);
    await expect(page.locator('.save-state')).toContainText(lang === 'ru' ? 'Сохранено на этом устройстве' : 'Saved on this device');
    expect(await page.evaluate(() => window.exitGuardWrites)).toBe(1);
    await cleanExit(page, 'reload');
    expect(await raw(page)).toBe(JSON.stringify(saved(1)));
  });

  test(`pending unload ${lang}: the user may explicitly accept leaving despite a pending answer`, async ({ page, context }, info) => {
    const holder = await setup(page, context, lang);
    const before = await raw(page);
    await hold(holder);
    try {
      await answer(page, lang);
      const closed = page.waitForEvent('close', { timeout: 4000 }).then(() => true, () => false);
      const observed = page.waitForEvent('dialog', { timeout: 2000 }).then(async (dialog) => {
        const type = dialog.type(); await dialog.accept(); return type;
      }, () => 'NO_NATIVE_DIALOG');
      await page.close({ runBeforeUnload: true });
      const type = await observed;
      await info.attach('native-close-leave', { body: JSON.stringify({ type, decision: 'leave' }), contentType: 'application/json' });
      expect(type).toBe('beforeunload');
      expect(await closed).toBe(true);
      expect(await raw(holder)).toBe(before);
    } finally { await release(holder); }
    const reopened = await context.newPage();
    await reopened.goto(`/?lang=${lang}#guided/needs`);
    await expect(reopened.locator('.lesson-top')).toContainText('1/3');
    expect(await raw(reopened)).toBe(before);
  });
}
