import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const COURSE = 'orbity-dialoga-progress-v1';
const PERSONAL = 'orbity-personal-path-v1';
const NOW = Date.parse('2026-10-28T12:00:00Z');
const DAY = 86400000;
const course = { completed: {}, answers: {}, notes: {}, review: {}, missionSteps: {},
  focusModule: 'conflict', currentLessonId: 'conflict-1', guidedFlow: null };
const personal = (outcomes = [null]) => ({ version: 1, revision: 10,
  profile: { address: 'neutral', goal: 'needs', startedAt: NOW - 9 * DAY, baseline: 2 },
  sessions: outcomes.map((outcome, index) => ({ index, completedAt: NOW - (outcomes.length - index - 1) * DAY,
    phrase: `SYNTHETIC personal phrase ${index + 1}: can we talk this evening?`, plan: `SYNTHETIC plan ${index + 1}`,
    reflection: outcome ? { outcome, note: `SYNTHETIC observation ${index + 1}` } : null })) });
const raw = page => page.evaluate(({ COURSE, PERSONAL }) => [localStorage.getItem(COURSE), localStorage.getItem(PERSONAL)], { COURSE, PERSONAL });

async function open(page, lang, initial, width = 320) {
  await page.clock.setFixedTime(new Date(NOW));
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/?lang=${lang}#progress`);
  await page.evaluate(({ COURSE, PERSONAL, course, initial }) => {
    localStorage.setItem(COURSE, JSON.stringify(course));
    if (initial === null) localStorage.removeItem(PERSONAL);
    else localStorage.setItem(PERSONAL, typeof initial === 'string' ? initial : JSON.stringify(initial));
  }, { COURSE, PERSONAL, course, initial });
  await page.reload();
}

for (const lang of ['ru', 'en']) {
  for (const width of [320, 1280]) {
    test(`product progress ${lang} ${width}: saved words and actual observations precede course counters`, async ({ page }, info) => {
      const initial = personal(['tried', 'difficult']);
      await open(page, lang, initial, width); const before = await raw(page);
      await expect(page.getByTestId('progress-phrase')).toHaveText(initial.sessions[1].phrase);
      await expect(page.getByTestId('progress-plan')).toContainText(initial.sessions[1].plan);
      await expect(page.getByTestId('progress-reflection')).toContainText(initial.sessions[1].reflection.note);
      await expect(page.getByTestId('outcome-tried')).toHaveText('1');
      await expect(page.getByTestId('next-practice-rehearse')).toBeVisible();
      await expect(page.getByTestId('saved-focus')).toContainText(lang === 'ru' ? 'Пауза и восстановление' : 'Pause and Repair');
      if (width === 320) {
        const phrase = await page.getByTestId('progress-phrase').boundingBox();
        const navigation = await page.locator('.sidebar nav').boundingBox();
        expect(phrase.y + phrase.height).toBeLessThanOrEqual(navigation.y);
      }
      const boxes = await Promise.all([page.getByTestId('practice-progress').boundingBox(), page.locator('.metric-grid').boundingBox()]);
      expect(boxes[0].y + boxes[0].height).toBeLessThan(boxes[1].y);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const violations = (await new AxeBuilder({ page }).analyze()).violations;
      expect(violations.filter(v => ['serious', 'critical'].includes(v.impact))).toEqual([]);
      await page.screenshot({ path: info.outputPath(`product-progress-${lang}-${width}.png`), fullPage: true });
      expect(await raw(page)).toEqual(before);
      await page.getByTestId('next-practice-rehearse').getByRole('button').first().click();
      await expect(page).toHaveURL(/#practice\/needs-1$/);
      expect(await raw(page)).toEqual(before);
    });
  }

  test(`product progress ${lang}: reflection action reaches the real form and updates the shared result`, async ({ page }) => {
    await open(page, lang, personal());
    await page.getByTestId('next-practice-reflect').getByRole('button').first().click();
    await expect(page).toHaveURL(/#today\/experience$/);
    await expect(page.locator('#daily-reflection-title-0')).toBeFocused();
    await page.getByTestId('daily-outcome-tried').check();
    await page.getByTestId('daily-reflection-note').fill('SYNTHETIC: I tried a shorter request.');
    await page.getByTestId('daily-reflect-save').click();
    await expect(page.getByTestId('daily-reflection-saved')).toContainText('SYNTHETIC: I tried a shorter request.');
    await page.getByRole('button', { name: lang === 'ru' ? 'Прогресс' : 'Progress', exact: true }).click();
    await expect(page.getByTestId('progress-reflection')).toContainText('SYNTHETIC: I tried a shorter request.');
    await expect(page.getByTestId('outcome-tried')).toHaveText('1');
    await expect(page.getByTestId('next-practice-apply')).toBeVisible();
    await expect(page.getByTestId('xp-total')).toHaveText('0');
    await page.reload();
    await expect(page.getByTestId('progress-reflection')).toContainText('SYNTHETIC: I tried a shorter request.');
  });

  test(`product progress ${lang}: first visit, completed week and unreadable data remain distinct`, async ({ page }) => {
    await open(page, lang, null); const before = await raw(page);
    await expect(page.getByTestId('practice-empty')).toBeVisible();
    await expect(page.getByTestId('next-practice-start')).toBeVisible();
    expect(await raw(page)).toEqual(before);
    const complete = personal(Array(7).fill('tried'));
    await open(page, lang, complete);
    await page.getByTestId('progress-comparison').locator('summary').click();
    await expect(page.getByTestId('progress-comparison')).toContainText(complete.sessions[0].phrase);
    await expect(page.getByTestId('progress-comparison')).toContainText(complete.sessions[6].phrase);
    await expect(page.getByTestId('next-practice-apply')).toBeVisible();
    await open(page, lang, '{corrupt personal'); const corrupt = await raw(page);
    await expect(page.getByTestId('practice-unavailable')).toBeVisible();
    await expect(page.getByTestId('practice-empty')).toHaveCount(0);
    await expect(page.getByTestId('next-practice-start')).toHaveCount(0);
    await expect(page.getByRole('button', { name: lang === 'ru' ? 'Скачать только курс' : 'Export course only', exact: true })).toBeEnabled();
    expect(await raw(page)).toEqual(corrupt);
  });

  test(`product entry ${lang}: purpose of each mode and creator information are reachable without writing`, async ({ page }) => {
    await page.goto(`/?lang=${lang}`); const before = await raw(page);
    await expect(page.locator('.entry-options')).toContainText(lang === 'ru' ? 'Около минуты' : 'About a minute');
    await expect(page.locator('.entry-options')).toContainText(lang === 'ru' ? 'три вводных вопроса' : 'three introductory questions');
    await page.locator('.footer-links a[href="#about"]').click();
    await expect(page).toHaveURL(/#about$/);
    await expect(page.locator('a[href="https://github.com/safal207"]')).toBeVisible();
    await expect(page.locator('.about-sources a')).toHaveCount(3);
    expect(await raw(page)).toEqual(before);
  });
}
