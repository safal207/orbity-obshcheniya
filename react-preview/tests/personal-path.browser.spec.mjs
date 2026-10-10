import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const KEY = 'orbity-personal-path-v1';
const COURSE_KEY = 'orbity-dialoga-progress-v1';
const NOW = Date.parse('2026-10-10T12:00:00Z');
const DAY = 86400000;
const course = {
  completed: { 'map-1': 1000 }, answers: { 'map-1': 1 },
  notes: { 'map-1': 'KEEP · original course note' }, review: { 'map-1': 2000 },
  missionSteps: { 'listen-ten': [true, false, true] },
  focusModule: 'needs', currentLessonId: 'needs-1', guidedFlow: { topic: 'needs', step: 1 },
};
const courseRaw = JSON.stringify(course);
const raw = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const saved = async (page) => JSON.parse(await raw(page));
const preservedCourse = async (page) => expect(await page.evaluate((key) => localStorage.getItem(key), COURSE_KEY)).toBe(courseRaw);
const registered = (count = 0) => ({
  version: 1, revision: count + 1,
  profile: { address: 'neutral', goal: 'needs', startedAt: NOW - 8 * DAY, baseline: 2 },
  sessions: Array.from({ length: count }, (_, index) => ({
    index, completedAt: NOW - (count - index) * DAY,
    phrase: `SYNTHETIC saved personal phrase ${index + 1}`,
    plan: `Plan for practice ${index + 1}`, reflection: null,
  })),
});

async function configure(page) {
  await page.clock.setFixedTime(new Date(NOW));
  await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
}

async function open(page, lang, initial = null) {
  await configure(page);
  await page.goto(`/?lang=${lang}#about`);
  await page.evaluate(({ key, courseKey, courseRaw, initial }) => {
    localStorage.setItem(courseKey, courseRaw);
    if (initial !== null) localStorage.setItem(key, JSON.stringify(initial));
  }, { key: KEY, courseKey: COURSE_KEY, courseRaw, initial });
  await page.goto(`/?lang=${lang}#today`);
  // Hash-only navigation does not remount the store or emit a same-tab storage event.
  await page.reload();
}

async function fillPractice(page, phrase = 'Could you listen to me for ten minutes?', plan = 'Try during a calm conversation this evening.') {
  await page.getByTestId('daily-phrase').fill(phrase);
  await page.getByTestId('daily-plan').fill(plan);
  return { phrase, plan };
}

async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function accessible(page) {
  const violations = (await new AxeBuilder({ page }).analyze()).violations;
  expect(violations.filter((violation) => ['serious', 'critical'].includes(violation.impact))).toEqual([]);
}

for (const lang of ['ru', 'en']) {
  test(`personal path ${lang}: first phone visit is read-only, profile and own phrase persist without course XP`, async ({ page }, info) => {
    await configure(page);
    await page.goto(`/?lang=${lang}`);
    const start = page.getByTestId('daily-start');
    await expect(start).toBeEnabled();
    expect(await raw(page)).toBeNull();
    expect(await page.evaluate((key) => localStorage.getItem(key), COURSE_KEY)).toBeNull();
    await expect(page.locator('#page-title')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(start).toBeFocused();
    const box = await start.boundingBox();
    const nav = await page.locator('.sidebar nav').boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(nav.y);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page).toHaveURL(/#today$/);
    await expect(page.getByTestId('daily-profile')).toBeVisible();
    await expect(page.locator('#page-title')).toBeFocused();
    expect(await raw(page)).toBeNull();
    await accessible(page);
    await page.getByTestId(`daily-address-${lang === 'ru' ? 'her' : 'him'}`).click();
    await page.getByTestId('daily-baseline-2').check();
    await page.getByTestId('daily-register').click();
    await expect(page.getByTestId('daily-phrase')).toBeVisible();
    expect((await saved(page)).profile).toEqual({ address: lang === 'ru' ? 'her' : 'him', goal: 'needs', startedAt: NOW, baseline: 2 });
    const input = await fillPractice(page);
    await page.getByTestId('daily-complete').click();
    await expect(page.getByTestId('daily-done')).toBeVisible();
    const after = await saved(page);
    expect(after.sessions).toEqual([{ index: 0, completedAt: NOW, ...input, reflection: null }]);
    expect(after.revision).toBe(2);
    await expect(page.getByTestId('daily-done')).toContainText(input.phrase);
    await expect(page.getByTestId('xp')).toContainText('0 XP');
    expect(await page.evaluate((key) => localStorage.getItem(key), COURSE_KEY)).toBeNull();
    await noOverflow(page);
    await accessible(page);
    await page.screenshot({ path: info.outputPath(`personal-first-day-${lang}-320.png`), fullPage: true });
    await page.reload();
    await expect(page.getByTestId('daily-done')).toContainText(input.phrase);
    await expect(page.getByTestId('daily-complete')).toHaveCount(0);
    expect(await saved(page)).toEqual(after);
  });

  test(`personal path ${lang}: next day continues, reflection saves, and missed days do not reset work`, async ({ page }) => {
    const initial = registered(1);
    await open(page, lang, initial);
    await expect(page.getByTestId('daily-phrase')).toBeVisible();
    await expect(page.getByTestId('daily-reflection')).toBeVisible();
    await page.getByTestId('daily-outcome-difficult').check();
    await page.getByTestId('daily-reflection-note').fill('I found a quieter moment, but asking was still difficult.');
    await page.getByTestId('daily-reflect-save').click();
    await expect.poll(async () => (await saved(page)).sessions[0].reflection).toEqual({
      outcome: 'difficult', note: 'I found a quieter moment, but asking was still difficult.',
    });
    const input = await fillPractice(page, 'Please help me with dinner tonight.', 'Ask about a suitable time first.');
    await page.getByTestId('daily-complete').click();
    await expect(page.getByTestId('daily-done')).toBeVisible();
    const after = await saved(page);
    expect(after.sessions).toHaveLength(2);
    expect(after.sessions[1]).toEqual({ index: 1, completedAt: NOW, ...input, reflection: null });
    expect(after.sessions[0].phrase).toBe(initial.sessions[0].phrase);
    await page.clock.setFixedTime(new Date(NOW + 5 * DAY));
    await page.reload();
    await expect(page.getByTestId('daily-phrase')).toBeVisible();
    expect(await saved(page)).toEqual(after);
    await page.getByTestId('daily-outcome-no-chance').check();
    await page.getByTestId('daily-reflect-save').click();
    await expect.poll(async () => (await saved(page)).sessions[1].reflection?.outcome).toBe('no-chance');
    const third = await fillPractice(page, 'Can we agree on a time to talk tomorrow?', '');
    await page.getByTestId('daily-complete').click();
    await expect(page.getByTestId('daily-done')).toBeVisible();
    expect((await saved(page)).sessions[2]).toEqual({ index: 2, completedAt: NOW + 5 * DAY, ...third, reflection: null });
    await preservedCourse(page);
  });

  test(`personal path ${lang}: weekly summary survives reload and does not restart or change the course`, async ({ page }) => {
    const initial = registered(7);
    initial.sessions[0].reflection = { outcome: 'tried', note: 'A real attempt, not a relationship score.' };
    await open(page, lang, initial);
    await expect(page.getByTestId('daily-week-summary')).toBeVisible();
    await expect(page.getByTestId('daily-complete')).toHaveCount(0);
    await expect(page.getByTestId('daily-register')).toHaveCount(0);
    await noOverflow(page);
    await accessible(page);
    expect(await saved(page)).toEqual(initial);
    await page.reload();
    await expect(page.getByTestId('daily-week-summary')).toBeVisible();
    expect(await saved(page)).toEqual(initial);
    await preservedCourse(page);
  });

  test(`personal path ${lang}: failed save keeps the draft through navigation and language change until a real retry`, async ({ page }) => {
    const initial = registered();
    await open(page, lang, initial);
    const input = await fillPractice(page, 'UNSAVED: could we divide this task together?', 'Keep this plan until the browser can save it.');
    await page.evaluate((key) => {
      const original = Storage.prototype.setItem;
      window.restorePersonalStorage = () => { Storage.prototype.setItem = original; };
      Storage.prototype.setItem = function (name, value) {
        if (this === localStorage && name === key) throw new DOMException('Synthetic personal save failure', 'QuotaExceededError');
        return original.call(this, name, value);
      };
    }, KEY);
    await page.getByTestId('daily-complete').click();
    await expect(page.getByTestId('daily-error')).toBeVisible();
    await expect(page.getByTestId('daily-done')).toHaveCount(0);
    await expect(page.getByTestId('daily-phrase')).toHaveValue(input.phrase);
    expect(await saved(page)).toEqual(initial);
    await page.getByRole('button', { name: lang === 'ru' ? 'Маршрут' : 'Learn', exact: true }).click();
    await page.getByTestId('daily-start').click();
    await expect(page.getByTestId('daily-phrase')).toHaveValue(input.phrase);
    await expect(page.getByTestId('daily-plan')).toHaveValue(input.plan);
    await page.getByRole('button', { name: lang === 'ru' ? 'Switch to English' : 'Переключить на русский', exact: true }).click();
    await expect(page.getByTestId('daily-phrase')).toHaveValue(input.phrase);
    await page.evaluate(() => window.restorePersonalStorage());
    await page.getByTestId('daily-complete').click();
    await expect(page.getByTestId('daily-done')).toBeVisible();
    expect((await saved(page)).sessions).toEqual([{ index: 0, completedAt: NOW, ...input, reflection: null }]);
    await preservedCourse(page);
  });

  test(`personal path ${lang}: two queued tabs cannot complete the same day twice or overwrite the winning phrase`, async ({ page, context }) => {
    const initial = registered();
    await open(page, lang, initial);
    const second = await context.newPage();
    await configure(second);
    await second.goto(`/?lang=${lang === 'ru' ? 'en' : 'ru'}#today`);
    const firstInput = await fillPractice(page, 'FIRST TAB: can you listen for five minutes?', 'The winning plan must persist.');
    const secondInput = await fillPractice(second, 'SECOND TAB: do not overwrite the first phrase.', 'Keep another draft separate.');
    await page.evaluate((key) => {
      window.personalLockReady = false;
      navigator.locks.request(key, () => {
        window.personalLockReady = true;
        return new Promise((resolve) => { window.releasePersonalLock = resolve; });
      });
    }, KEY);
    await expect.poll(() => page.evaluate(() => window.personalLockReady)).toBe(true);
    try {
      await page.getByTestId('daily-complete').click();
      await second.getByTestId('daily-complete').click();
      await expect(page.getByTestId('daily-complete')).toBeDisabled();
      await expect(second.getByTestId('daily-complete')).toBeDisabled();
      expect(await saved(page)).toEqual(initial);
      await expect(page.getByTestId('daily-done')).toHaveCount(0);
      await expect(second.getByTestId('daily-done')).toHaveCount(0);
    } finally {
      await page.evaluate(() => window.releasePersonalLock());
    }
    await expect(page.getByTestId('daily-done')).toBeVisible();
    await expect(second.getByTestId('daily-error')).toBeVisible();
    await expect(second.getByTestId('daily-retained-draft')).toContainText(secondInput.phrase);
    await expect(second.getByTestId('daily-retained-draft')).toContainText(secondInput.plan);
    const after = await saved(page);
    expect(after.sessions).toEqual([{ index: 0, completedAt: NOW, ...firstInput, reflection: null }]);
    expect(after.revision).toBe(initial.revision + 1);
    expect(await saved(second)).toEqual(after);
    await page.reload();
    second.once('dialog', (dialog) => dialog.accept());
    await second.reload();
    await expect(page.getByTestId('daily-done')).toContainText(firstInput.phrase);
    await expect(second.getByTestId('daily-done')).toContainText(firstInput.phrase);
    await preservedCourse(page);
    await preservedCourse(second);
  });

  test(`personal path ${lang}: corrupt personal data is preserved and does not make course progress unreadable`, async ({ page }) => {
    await open(page, lang);
    const corrupt = '{"version":1,"profile":"DO NOT ERASE"';
    await page.evaluate(({ key, corrupt }) => localStorage.setItem(key, corrupt), { key: KEY, corrupt });
    await page.reload();
    await expect(page.getByTestId('daily-error')).toBeVisible();
    await expect(page.getByTestId('daily-register')).toHaveCount(0);
    expect(await raw(page)).toBe(corrupt);
    await page.getByRole('button', { name: lang === 'ru' ? 'Маршрут' : 'Learn', exact: true }).click();
    await expect(page.getByTestId('resume')).toBeEnabled();
    await expect(page.getByTestId('xp')).toContainText('20 XP');
    await preservedCourse(page);
    expect(await raw(page)).toBe(corrupt);
  });
}

test('personal path: unavailable locks cannot create a profile or pretend it was saved', async ({ page }) => {
  await open(page, 'en');
  await page.evaluate(() => Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined }));
  await page.getByTestId('daily-register').click();
  await expect(page.getByTestId('daily-error')).toBeVisible();
  await expect(page.getByTestId('daily-profile')).toBeVisible();
  await expect(page.getByTestId('daily-phrase')).toHaveCount(0);
  expect(await raw(page)).toBeNull();
  await preservedCourse(page);
});

test('personal path: short phrases cannot finish a day, and a desktop keyboard user can save a complete one', async ({ page }) => {
  await open(page, 'en', registered());
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByTestId('daily-phrase').fill('short');
  await page.getByTestId('daily-complete').click();
  await expect(page.getByTestId('daily-error')).toBeVisible();
  expect((await saved(page)).sessions).toHaveLength(0);
  const input = await fillPractice(page);
  await page.getByTestId('daily-complete').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('daily-done')).toBeVisible();
  expect((await saved(page)).sessions[0].phrase).toBe(input.phrase);
  await expect(page.locator('#page-title')).toBeFocused();
  await noOverflow(page);
  await preservedCourse(page);
});

test('personal path: an unfinished earlier reflection survives completing today and saves to its original session', async ({ page }) => {
  const initial = registered(1);
  await open(page, 'ru', initial);
  const note = 'EARLIER SESSION: I needed more time to express this request.';
  await page.getByTestId('daily-outcome-difficult').check();
  await page.getByTestId('daily-reflection-note').fill(note);
  const input = await fillPractice(page, 'TODAY: could we agree on a calm time to talk?', 'Keep today separate from yesterday.');
  await page.getByTestId('daily-complete').click();
  await expect(page.getByTestId('daily-done')).toBeVisible();
  const retained = page.getByTestId('daily-retained-reflection');
  await expect(retained).toBeVisible();
  await expect(retained.getByTestId('daily-reflection-note')).toHaveValue(note);
  await expect(retained.getByTestId('daily-outcome-difficult')).toBeChecked();
  await expect(retained.getByTestId('daily-reflect-save')).toBeDisabled();
  const afterCompletion = await saved(page);
  expect(afterCompletion.sessions).toHaveLength(2);
  expect(afterCompletion.sessions[0].reflection).toBeNull();
  expect(afterCompletion.sessions[1]).toEqual({ index: 1, completedAt: NOW, ...input, reflection: null });
  await retained.getByTestId('daily-reflection-review').click();
  await retained.getByTestId('daily-reflect-save').click();
  await expect(retained).toHaveCount(0);
  const afterReflection = await saved(page);
  expect(afterReflection.sessions[0].reflection).toEqual({ outcome: 'difficult', note });
  expect(afterReflection.sessions[0].phrase).toBe(initial.sessions[0].phrase);
  expect(afterReflection.sessions[1]).toEqual(afterCompletion.sessions[1]);
  await preservedCourse(page);
});

test('personal path: stale queued reflection cannot overwrite another tab without explicit review', async ({ page, context }) => {
  const initial = registered(1);
  await open(page, 'en', initial);
  const second = await context.newPage();
  await configure(second);
  await second.goto('/?lang=ru#today');
  const firstNote = 'FIRST REFLECTION: I asked clearly and gave time to answer.';
  const secondNote = 'SECOND DRAFT: asking still felt difficult; retain my words.';
  await page.getByTestId('daily-outcome-tried').check();
  await page.getByTestId('daily-reflection-note').fill(firstNote);
  await second.getByTestId('daily-outcome-difficult').check();
  await second.getByTestId('daily-reflection-note').fill(secondNote);
  await page.evaluate((key) => {
    window.personalReflectionLockReady = false;
    navigator.locks.request(key, () => {
      window.personalReflectionLockReady = true;
      return new Promise((resolve) => { window.releasePersonalReflectionLock = resolve; });
    });
  }, KEY);
  await expect.poll(() => page.evaluate(() => window.personalReflectionLockReady)).toBe(true);
  try {
    await page.getByTestId('daily-reflect-save').click();
    await second.getByTestId('daily-reflect-save').click();
    await expect(page.getByTestId('daily-reflect-save')).toBeDisabled();
    await expect(second.getByTestId('daily-reflect-save')).toBeDisabled();
    expect(await saved(page)).toEqual(initial);
  } finally {
    await page.evaluate(() => window.releasePersonalReflectionLock());
  }
  await expect(page.getByTestId('daily-reflection-saved')).toContainText(firstNote);
  await expect(second.getByTestId('daily-error')).toBeVisible();
  await expect(second.getByTestId('daily-reflection-saved')).toContainText(firstNote);
  await expect(second.getByTestId('daily-reflection-note')).toHaveValue(secondNote);
  await expect(second.getByTestId('daily-reflect-save')).toBeDisabled();
  expect((await saved(page)).sessions[0].reflection).toEqual({ outcome: 'tried', note: firstNote });
  expect((await saved(second)).revision).toBe(initial.revision + 1);
  await second.getByTestId('daily-reflection-review').click();
  await expect(second.getByTestId('daily-reflection-note')).toHaveValue(secondNote);
  await second.getByTestId('daily-reflect-save').click();
  await expect(second.getByTestId('daily-reflection-saved')).toContainText(secondNote);
  const afterReview = await saved(second);
  expect(afterReview.sessions).toHaveLength(1);
  expect(afterReview.sessions[0]).toEqual({ ...initial.sessions[0], reflection: { outcome: 'difficult', note: secondNote } });
  expect(afterReview.revision).toBe(initial.revision + 2);
  await preservedCourse(page);
  await preservedCourse(second);
});

test('personal path: a read failure leaves phrase and reflection usable and restores both drafts after retry', async ({ page }) => {
  const initial = registered(1);
  await open(page, 'en', initial);
  const input = await fillPractice(page, 'RECOVER MY PHRASE: can we share this work?', 'RECOVER MY PLAN: ask this evening.');
  const note = 'RECOVER MY REFLECTION: I noticed how hard it was to ask.';
  await page.getByTestId('daily-outcome-difficult').check();
  await page.getByTestId('daily-reflection-note').fill(note);
  await page.evaluate((key) => {
    const original = Storage.prototype.getItem;
    window.restorePersonalRead = () => { Storage.prototype.getItem = original; };
    Storage.prototype.getItem = function (name) {
      if (this === localStorage && name === key) throw new DOMException('Synthetic personal read failure', 'SecurityError');
      return original.call(this, name);
    };
    dispatchEvent(new StorageEvent('storage', { key, storageArea: localStorage }));
  }, KEY);
  await expect(page.getByTestId('daily-error')).toBeVisible();
  const recovery = page.getByTestId('daily-draft-recovery');
  await expect(recovery).toBeVisible();
  await expect(recovery.getByTestId('daily-recovery-phrase')).toContainText(input.phrase);
  await expect(recovery.getByTestId('daily-recovery-phrase')).toContainText(input.plan);
  await expect(recovery.getByTestId('daily-recovery-reflection')).toContainText(note);
  await expect(page.getByTestId('daily-register')).toHaveCount(0);
  await expect(page.getByTestId('daily-complete')).toHaveCount(0);
  await expect(recovery.locator('textarea')).toHaveCount(0);
  await preservedCourse(page);
  await page.evaluate(() => window.restorePersonalRead());
  expect(await saved(page)).toEqual(initial);
  await page.getByRole('button', { name: 'Read data again', exact: true }).click();
  await expect(recovery).toHaveCount(0);
  await expect(page.getByTestId('daily-phrase')).toHaveValue(input.phrase);
  await expect(page.getByTestId('daily-plan')).toHaveValue(input.plan);
  await expect(page.getByTestId('daily-reflection-note')).toHaveValue(note);
  await expect(page.getByTestId('daily-outcome-difficult')).toBeChecked();
  expect(await saved(page)).toEqual(initial);
  await preservedCourse(page);
});
