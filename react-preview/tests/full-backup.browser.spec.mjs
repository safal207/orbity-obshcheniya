import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const COURSE = 'orbity-dialoga-progress-v1';
const PERSONAL = 'orbity-personal-path-v1';
const NOW = Date.parse('2026-10-28T12:00:00Z');
const empty = () => ({ completed: {}, answers: {}, notes: {}, review: {}, missionSteps: {}, focusModule: null, currentLessonId: null, guidedFlow: null });
const course = () => ({ ...empty(), notes: { 'map-1': 'SYNTHETIC original course note' }, focusModule: 'needs' });
const personal = (count = 1) => ({ version: 1, revision: 4,
  profile: { address: 'neutral', goal: 'needs', startedAt: NOW - 86400000, baseline: 2 },
  sessions: count ? [{ index: 0, completedAt: NOW, phrase: 'SYNTHETIC: can we talk after dinner?', plan: 'A quiet moment tonight',
    reflection: { outcome: 'difficult', note: 'SYNTHETIC: I will try a shorter phrase.' } }] : [] });
const full = () => ({ version: 2, savedAt: new Date(NOW).toISOString(), course: { ...course(), version: 1 }, personal: personal() });
const upload = value => ({ name: 'synthetic-backup.json', mimeType: 'application/json', buffer: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)) });
const raw = page => page.evaluate(({ COURSE, PERSONAL }) => [localStorage.getItem(COURSE), localStorage.getItem(PERSONAL)], { COURSE, PERSONAL });
async function seed(page, lang, savedCourse = course(), savedPersonal = personal()) {
  await page.clock.setFixedTime(new Date(NOW));
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto(`/?lang=${lang}#progress`);
  await page.evaluate(({ COURSE, PERSONAL, savedCourse, savedPersonal }) => {
    localStorage.setItem(COURSE, JSON.stringify(savedCourse));
    localStorage.setItem(PERSONAL, JSON.stringify(savedPersonal));
  }, { COURSE, PERSONAL, savedCourse, savedPersonal });
  await page.reload();
}

for (const lang of ['ru', 'en']) {
  test(`full backup ${lang}: one downloaded file restores course and personal words after reload`, async ({ page }) => {
    await seed(page, lang);
    const before = await raw(page);
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: lang === 'ru' ? 'Скачать копию' : 'Export backup', exact: true }).click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toBe('orbity-backup-v2.json');
    const text = await readFile(await download.path(), 'utf8');
    expect(JSON.parse(text).personal).toEqual(personal());
    expect(await raw(page)).toEqual(before);
    await seed(page, lang, empty(), { ...personal(0), revision: 17 });
    let confirmation = '';
    page.once('dialog', async dialog => { confirmation = dialog.message(); await dialog.accept(); });
    await page.locator('input[type=file]').setInputFiles(upload(text));
    await expect(page.locator('.notice')).toContainText(lang === 'ru' ? 'Резервная копия восстановлена' : 'Backup restored');
    expect(confirmation).toContain(lang === 'ru' ? 'профиль, фразы, планы и наблюдения' : 'profile, phrases, plans and reflections');
    const [restoredCourse, restoredPersonal] = (await raw(page)).map(JSON.parse);
    expect(restoredCourse).toEqual(course());
    expect(restoredPersonal).toEqual({ ...personal(), revision: 18 });
    await expect(page.getByTestId('progress-phrase')).toContainText(personal().sessions[0].phrase);
    await page.reload();
    await expect(page.getByTestId('progress-reflection')).toContainText(personal().sessions[0].reflection.note);
    await page.getByRole('button', { name: lang === 'ru' ? 'Switch to English' : 'Переключить на русский', exact: true }).click();
    await expect(page.getByTestId('progress-phrase')).toContainText(personal().sessions[0].phrase);
  });

  test(`full backup ${lang}: old course files never erase personal practice and invalid personal files never ask to replace`, async ({ page }) => {
    await seed(page, lang); const beforePersonal = (await raw(page))[1];
    page.once('dialog', dialog => dialog.accept());
    await page.locator('input[type=file]').setInputFiles(upload({ ...empty(), version: 1 }));
    await expect(page.locator('.notice')).toContainText(lang === 'ru' ? 'восстановлена' : 'restored');
    expect((await raw(page))[1]).toBe(beforePersonal);
    const before = await raw(page); const bad = full(); bad.personal.sessions[0].phrase = 12;
    let dialogs = 0; page.on('dialog', async dialog => { dialogs++; await dialog.dismiss(); });
    await page.locator('input[type=file]').setInputFiles(upload(bad));
    await expect(page.getByRole('alert')).toContainText(lang === 'ru' ? 'Файл не подходит' : 'valid');
    expect(dialogs).toBe(0); expect(await raw(page)).toEqual(before);
  });

  test(`full backup ${lang}: hidden unsaved personal drafts block import and remain available`, async ({ page }) => {
    await seed(page, lang, course(), personal(0));
    await page.goto(`/?lang=${lang}#today`);
    await page.getByTestId('daily-phrase').fill('SYNTHETIC UNSAVED PERSONAL DRAFT');
    await page.getByRole('button', { name: lang === 'ru' ? 'Прогресс' : 'Progress', exact: true }).click();
    const before = await raw(page); let dialogs = 0;
    page.on('dialog', async dialog => { dialogs++; await dialog.dismiss(); });
    await page.locator('input[type=file]').setInputFiles(upload(full()));
    await expect(page.getByRole('alert')).toContainText(lang === 'ru' ? 'несохранённые' : 'unsaved');
    expect(dialogs).toBe(0); expect(await raw(page)).toEqual(before);
    await page.getByRole('button', { name: lang === 'ru' ? 'Маршрут' : 'Learn', exact: true }).click();
    await page.getByTestId('daily-start').click();
    await expect(page.getByTestId('daily-phrase')).toHaveValue('SYNTHETIC UNSAVED PERSONAL DRAFT');
  });

  test(`full backup ${lang}: a second-key write rejection rolls back course data and never announces success`, async ({ page }) => {
    await seed(page, lang, empty(), personal(0)); const before = await raw(page);
    await page.evaluate(key => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (name, value) {
        if (this === localStorage && name === key) throw new DOMException('Synthetic personal failure', 'QuotaExceededError');
        return original.call(this, name, value);
      };
    }, PERSONAL);
    page.once('dialog', dialog => dialog.accept());
    await page.locator('input[type=file]').setInputFiles(upload(full()));
    await expect(page.getByRole('alert')).toContainText(lang === 'ru' ? 'Не удалось сохранить' : 'Storage could not');
    await expect(page.locator('.notice')).toHaveCount(0);
    expect(await raw(page)).toEqual(before);
  });

  test(`full backup ${lang}: a real personal edit in another tab cancels a waiting restore`, async ({ page, context }) => {
    await seed(page, lang, empty(), personal());
    const other = await context.newPage();
    await other.goto(`/?lang=${lang}#today`);
    await page.evaluate(key => {
      window.fullBackupLockReady = false;
      navigator.locks.request(key, () => { window.fullBackupLockReady = true; return new Promise(resolve => { window.releaseFullBackupLock = resolve; }); });
    }, COURSE);
    await expect.poll(() => page.evaluate(() => window.fullBackupLockReady)).toBe(true);
    try {
      page.once('dialog', dialog => dialog.accept());
      await page.locator('input[type=file]').setInputFiles(upload(full()));
      await expect.poll(() => page.evaluate(async key => (await navigator.locks.query()).pending.filter(lock => lock.name === key).length, COURSE)).toBe(1);
      await other.locator('.personal-settings summary').click();
      await other.locator('.personal-settings').getByRole('button', { name: lang === 'ru' ? 'Для него' : 'For him', exact: true }).click();
      await expect.poll(async () => JSON.parse((await raw(other))[1]).profile.address).toBe('him');
    } finally { await page.evaluate(() => window.releaseFullBackupLock()); }
    await expect(page.getByRole('alert')).toContainText(lang === 'ru' ? 'Данные изменились' : 'Data changed');
    await expect(page.locator('.notice')).toHaveCount(0);
    const [savedCourse, savedPersonal] = (await raw(page)).map(JSON.parse);
    expect(savedCourse).toEqual(empty()); expect(savedPersonal.profile.address).toBe('him');
    expect(savedPersonal.sessions).toEqual(personal().sessions);
  });
}
