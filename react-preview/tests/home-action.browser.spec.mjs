import { test, expect } from '@playwright/test';

const KEY = 'orbity-dialoga-progress-v1';
const HAPTICS = 'orbity-haptics-v1';
const read = (page) => page.evaluate(({ KEY, HAPTICS }) => ({
  progress: localStorage.getItem(KEY), haptics: localStorage.getItem(HAPTICS), personal: localStorage.getItem('orbity-personal-path-v1'),
}), { KEY, HAPTICS });
const empty = () => ({ completed: {}, answers: {}, notes: {}, review: {}, missionSteps: {},
  focusModule: null, currentLessonId: null, guidedFlow: null });

for (const lang of ['ru', 'en']) {
  for (const [width, height] of [[320, 640], [390, 700], [390, 844]]) {
    test(`home ${lang} ${width}x${height}: useful first action is above navigation without scrolling`, async ({ page }, info) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(`/?lang=${lang}`);
      const help = page.getByTestId('daily-start');
      await expect(help).toBeEnabled();
      await expect(page.getByTestId('resume')).toHaveAccessibleName(lang === 'ru' ? /Начать первый урок/ : /Start your first lesson/);
      const before = await read(page);
      const geometry = await help.evaluate((button) => {
        const box = button.getBoundingClientRect();
        const nav = document.querySelector('.sidebar nav').getBoundingClientRect();
        return { top: box.top, bottom: box.bottom, navTop: nav.top, scrollY,
          unobscured: button.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)) };
      });
      expect(geometry.scrollY).toBe(0);
      expect(geometry.top).toBeGreaterThan(0);
      expect(geometry.bottom + 4).toBeLessThanOrEqual(geometry.navTop);
      expect(geometry.unobscured).toBe(true);
      const art = await page.locator('.hero .lumi-welcome').boundingBox();
      expect(art.width).toBeGreaterThanOrEqual(220);
      expect(art.width).toBeLessThanOrEqual(280.5);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`first-action-${lang}-${width}x${height}.png`) });
      await expect(page.locator('#page-title')).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(help).toBeFocused();
      // A real click at its initial coordinates cannot silently scroll a covered control into view.
      const box = await help.boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await expect(page).toHaveURL(/#today$/);
      await expect(page.getByTestId('daily-profile')).toBeVisible();
      expect(await read(page)).toEqual(before);
      await page.getByRole('button', { name: lang === 'ru' ? 'Маршрут' : 'Learn', exact: true }).click();
      await expect(page.getByTestId('lumi-route-tip')).toBeVisible();
      const returned = await help.boundingBox();
      const nav = await page.locator('.sidebar nav').boundingBox();
      expect(returned.y + returned.height + 4).toBeLessThanOrEqual(nav.y);
      expect(await page.evaluate(() => scrollY)).toBe(0);
      expect(await read(page)).toEqual(before);
    });
  }

  test(`home ${lang}: immediate help remains available independently of the daily path`, async ({ page }) => {
    await page.goto(`/?lang=${lang}`);
    const before = await read(page);
    await page.getByTestId('help-now').click();
    await expect(page).toHaveURL(/#now$/);
    await page.locator('.quick-help-choice').first().click();
    await expect(page.getByTestId('quick-help-phrase')).toBeVisible();
    expect(await read(page)).toEqual(before);
  });

  test(`home ${lang}: first lesson remains available from a fresh start`, async ({ page }) => {
    await page.goto(`/?lang=${lang}`);
    await page.getByTestId('resume').click();
    await expect(page).toHaveURL(/#lesson\/map-1$/);
    await expect(page.locator('#page-title')).toBeFocused();
    await expect(page.getByTestId('xp')).toContainText('0 XP');
  });

  for (const guided of [false, true]) {
    test(`home ${lang}: ${guided ? 'saved introduction' : 'unfinished zero-XP lesson'} still resumes without losing notes`, async ({ page }) => {
      const state = { ...empty(), notes: { 'needs-1': 'SYNTHETIC KEEP' },
        focusModule: 'needs', currentLessonId: 'needs-1',
        guidedFlow: guided ? { topic: 'needs', step: 1 } : null };
      await page.addInitScript(({ KEY, HAPTICS, state }) => {
        localStorage.setItem(KEY, JSON.stringify(state));
        localStorage.setItem(HAPTICS, 'off');
      }, { KEY, HAPTICS, state });
      await page.goto(`/?lang=${lang}`);
      const before = await read(page);
      await expect(page.getByTestId('resume')).toHaveAccessibleName(guided
        ? lang === 'ru' ? /Продолжить знакомство/ : /Continue the introduction/
        : lang === 'ru' ? /Продолжить путь/ : /Continue your journey/);
      await page.getByTestId('resume').click();
      await expect(page).toHaveURL(guided ? /#guided\/needs$/ : /#lesson\/needs-1$/);
      await expect(page.getByTestId('xp')).toContainText('0 XP');
      expect(await read(page)).toEqual(before);
    });
  }
}
