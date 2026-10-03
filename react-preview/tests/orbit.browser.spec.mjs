import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';

const courseSource = readFileSync(new URL('../../dist/course.js', import.meta.url), 'utf8');
const { lessons, missions } = await import(`data:text/javascript;base64,${Buffer.from(courseSource).toString('base64')}`);
const KEY = 'orbity-dialoga-progress-v1';
const empty = () => ({ completed: {}, answers: {}, notes: {}, review: {}, missionSteps: {},
  focusModule: null, currentLessonId: null, guidedFlow: null });
const savedState = () => ({ ...empty(), completed: { 'map-1': 1000 },
  answers: { 'map-1': lessons[0].quiz.correct[0] }, notes: { 'map-1': 'KEEP · сохранить' },
  review: { 'map-1': 2000 }, missionSteps: { [missions[0].id]: [true, false, true] },
  focusModule: 'listening', currentLessonId: 'needs-1', guidedFlow: { topic: 'needs', step: 1 } });
const raw = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const read = async (page) => JSON.parse(await raw(page));
async function seed(page, state = savedState(), lang = 'ru', hash = 'path') {
  await page.goto('/');
  await page.evaluate(({ key, state }) => localStorage.setItem(key, JSON.stringify(state)), { key: KEY, state });
  await page.goto(`/?lang=${lang}#${hash}`);
  await expect(page.locator('#unit')).toBeEnabled();
  return state;
}
async function holdLock(page) {
  await page.evaluate((key) => {
    window.orbitLockReady = false;
    navigator.locks.request(key, () => {
      window.orbitLockReady = true;
      return new Promise((resolve) => { window.releaseOrbitLock = resolve; });
    });
  }, KEY);
  await expect.poll(() => page.evaluate(() => window.orbitLockReady)).toBe(true);
}
const releaseLock = (page) => page.evaluate(() => window.releaseOrbitLock?.());
const fits = async (page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
const serious = async (page) => (await new AxeBuilder({ page }).analyze()).violations
  .filter((v) => ['serious', 'critical'].includes(v.impact));

for (const lang of ['ru', 'en']) {
  test(`orbit ${lang}: reload and language switch preserve choice and all other saved fields at 320px`, async ({ page }, info) => {
    await page.setViewportSize({ width: 320, height: 900 });
    const initial = await seed(page, savedState(), lang);
    const picker = page.getByRole('combobox', { name: lang === 'ru' ? 'Ваша орбита' : 'Your orbit' });
    await expect(picker).toHaveValue('listening');
    await picker.selectOption('conflict');
    await expect(picker).toHaveValue('conflict'); await expect(picker).toBeEnabled();
    const expected = JSON.stringify({ ...initial, focusModule: 'conflict' });
    expect(await raw(page)).toBe(expected);
    await page.reload(); await expect(picker).toHaveValue('conflict');
    expect(await raw(page)).toBe(expected);
    await expect(page.getByTestId('xp')).toContainText('20 XP');
    await fits(page); expect(await serious(page)).toEqual([]);
    await page.screenshot({ path: info.outputPath(`orbit-restored-${lang}-320.png`), fullPage: true });
    await page.getByRole('button', { name: lang === 'ru' ? 'Switch to English' : 'Переключить на русский' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', lang === 'ru' ? 'en' : 'ru');
    await expect(page.locator('#unit')).toHaveValue('conflict');
    await page.reload(); await expect(page.locator('#unit')).toHaveValue('conflict');
    expect(await raw(page)).toBe(expected);
    // An orbit is not a request to reset the existing introduction bookmark.
    await page.getByTestId('resume').click();
    await expect(page).toHaveURL(/#guided\/needs$/);
    await expect(page.locator('.lesson-top')).toContainText('2/3');
    expect(await raw(page)).toBe(expected);
  });

  test(`orbit ${lang}: a rejected write keeps the previous selection and bytes; retry succeeds`, async ({ page }, info) => {
    await page.setViewportSize({ width: 320, height: 900 });
    const initial = await seed(page, savedState(), lang); const before = await raw(page);
    await page.evaluate((key) => {
      const original = Storage.prototype.setItem;
      window.restoreOrbitStorage = () => { Storage.prototype.setItem = original; };
      window.orbitRejectedWrites = 0;
      Storage.prototype.setItem = function (k, value) {
        if (this === localStorage && k === key) {
          window.orbitRejectedWrites++;
          throw new DOMException('Synthetic orbit write rejection', 'QuotaExceededError');
        }
        return original.call(this, k, value);
      };
    }, KEY);
    const picker = page.locator('#unit'); await picker.selectOption('conflict');
    await expect(page.getByRole('alert')).toContainText(lang === 'ru' ? 'Не удалось сохранить' : 'Storage could not be read or written');
    await expect(picker).toBeEnabled(); await expect(picker).toHaveValue('listening');
    expect(await raw(page)).toBe(before);
    expect(await page.evaluate(() => window.orbitRejectedWrites)).toBe(1);
    await fits(page); expect(await serious(page)).toEqual([]);
    await page.screenshot({ path: info.outputPath(`orbit-write-error-${lang}-320.png`), fullPage: true });
    await page.evaluate(() => window.restoreOrbitStorage());
    await picker.selectOption('conflict'); await expect(picker).toHaveValue('conflict');
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(await raw(page)).toBe(JSON.stringify({ ...initial, focusModule: 'conflict' }));
    await page.reload(); await expect(picker).toHaveValue('conflict');
  });

  test(`orbit ${lang}: explicit module links win over storage and follow a successful new choice`, async ({ page }) => {
    const initial = await seed(page, savedState(), lang, 'module/conflict');
    await expect(page.locator('#unit')).toHaveValue('conflict');
    expect(await raw(page)).toBe(JSON.stringify(initial)); // Visiting a link is read-only.
    await page.locator('#unit').selectOption('needs');
    await expect(page).toHaveURL(/#module\/needs$/);
    await page.reload(); await expect(page.locator('#unit')).toHaveValue('needs');
    expect(await raw(page)).toBe(JSON.stringify({ ...initial, focusModule: 'needs' }));
  });
}

test('orbit selection initializes empty storage without inventing progress', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#unit')).toBeEnabled();
  expect(await raw(page)).toBeNull();
  await page.locator('#unit').selectOption('conflict');
  await expect(page.locator('#unit')).toHaveValue('conflict');
  expect(await read(page)).toEqual({ ...empty(), focusModule: 'conflict' });
  await page.reload(); await expect(page.locator('#unit')).toHaveValue('conflict');
  await expect(page.getByTestId('xp')).toContainText('0 XP');
});

test('orbit choice leaves the unfinished full-lesson bookmark in control of Continue', async ({ page }) => {
  const initial = await seed(page, { ...savedState(), guidedFlow: null, currentLessonId: 'needs-2' });
  await page.locator('#unit').selectOption('conflict');
  await expect(page.locator('#unit')).toHaveValue('conflict');
  expect(await read(page)).toEqual({ ...initial, focusModule: 'conflict' });
  await page.reload(); await expect(page.locator('#unit')).toHaveValue('conflict');
  await page.getByTestId('resume').click(); await expect(page).toHaveURL(/#lesson\/needs-2$/);
});

test('queued orbit choice merges a real second-tab note save without resetting guided progress', async ({ page, context }) => {
  const initial = await seed(page); const second = await context.newPage();
  await second.goto('/?lang=en#lesson/map-2/1');
  await expect(second.locator('textarea')).toBeEnabled();
  await holdLock(page);
  try {
    await second.locator('textarea').fill('Second-tab synthetic note');
    await second.getByRole('button', { name: 'Save / retry', exact: true }).click();
    await expect(second.locator('textarea')).toBeDisabled();
    await page.locator('#unit').selectOption('conflict');
    await expect(page.locator('#unit')).toBeDisabled();
    await expect(page.locator('#unit')).toHaveValue('listening');
    await expect.poll(() => page.evaluate(async (key) => (await navigator.locks.query()).pending.filter((l) => l.name === key).length, KEY)).toBe(2);
    expect(await raw(page)).toBe(JSON.stringify(initial));
  } finally { await releaseLock(page); }
  await expect(second.locator('.save-state')).toContainText('Saved on this device');
  await expect(page.locator('#unit')).toHaveValue('conflict');
  expect(await read(page)).toEqual({ ...initial, notes: { ...initial.notes, 'map-2': 'Second-tab synthetic note' }, focusModule: 'conflict' });
  await expect(second).toHaveURL(/#lesson\/map-2\/1$/);
  await page.reload(); await expect(page.locator('#unit')).toHaveValue('conflict');
});

test('two tab choices serialize under a real lock without jumping the other active view', async ({ page, context }) => {
  const initial = await seed(page, { ...savedState(), focusModule: 'map' });
  const second = await context.newPage(); await second.goto('/?lang=en#path');
  await expect(second.locator('#unit')).toHaveValue('map'); await holdLock(page);
  try {
    await page.locator('#unit').selectOption('listening'); await expect(page.locator('#unit')).toBeDisabled();
    await second.locator('#unit').selectOption('conflict'); await expect(second.locator('#unit')).toBeDisabled();
    await expect.poll(() => page.evaluate(async (key) => (await navigator.locks.query()).pending.filter((l) => l.name === key).length, KEY)).toBe(2);
    expect(await raw(page)).toBe(JSON.stringify(initial));
  } finally { await releaseLock(page); }
  await expect(page.locator('#unit')).toHaveValue('listening');
  await expect(second.locator('#unit')).toHaveValue('conflict');
  expect(await raw(page)).toBe(JSON.stringify({ ...initial, focusModule: 'conflict' }));
  await expect(page.locator('#unit')).toHaveValue('listening');
  await page.reload(); await expect(page.locator('#unit')).toHaveValue('conflict');
});

test('a delayed orbit save cannot override a more recent explicit module navigation', async ({ page }) => {
  const initial = await seed(page); await holdLock(page);
  try {
    await page.locator('#unit').selectOption('conflict'); await expect(page.locator('#unit')).toBeDisabled();
    await page.evaluate(() => { location.hash = 'module/needs'; });
    await expect(page.locator('#unit')).toHaveValue('needs');
  } finally { await releaseLock(page); }
  await expect(page.locator('#unit')).toBeEnabled();
  await expect(page.locator('#unit')).toHaveValue('needs');
  await expect(page).toHaveURL(/#module\/needs$/);
  expect(await raw(page)).toBe(JSON.stringify({ ...initial, focusModule: 'conflict' }));
  await page.reload(); await expect(page.locator('#unit')).toHaveValue('needs');
  await page.goto('/'); await expect(page.locator('#unit')).toHaveValue('conflict');
});

test('orbit selection fails closed when real browser locks are unavailable', async ({ page }) => {
  await seed(page); const before = await raw(page);
  await page.evaluate(() => Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined }));
  await page.locator('#unit').selectOption('conflict');
  await expect(page.getByRole('alert')).toContainText('Безопасное сохранение недоступно');
  await expect(page.locator('#unit')).toHaveValue('listening');
  await expect(page.locator('#unit')).toBeEnabled(); expect(await raw(page)).toBe(before);
});

test('orbit lock timeout keeps the old choice and allows an explicit retry', async ({ page }) => {
  await seed(page); const before = await raw(page); await holdLock(page);
  try {
    await page.locator('#unit').selectOption('conflict'); await expect(page.locator('#unit')).toBeDisabled();
    // The application timeout is 5s; this assertion deliberately observes it.
    await expect(page.getByRole('alert')).toContainText('Хранилище занято другой вкладкой', { timeout: 8000 });
    await expect(page.locator('#unit')).toBeEnabled(); await expect(page.locator('#unit')).toHaveValue('listening');
    expect(await raw(page)).toBe(before);
  } finally { await releaseLock(page); }
  await page.locator('#unit').selectOption('conflict'); await expect(page.locator('#unit')).toHaveValue('conflict');
  await expect(page.getByRole('alert')).toHaveCount(0);
});
