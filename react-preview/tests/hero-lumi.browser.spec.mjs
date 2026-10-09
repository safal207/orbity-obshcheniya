import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const KEY = 'orbity-dialoga-progress-v1';
const HAPTICS = 'orbity-haptics-v1';
const read = (page) => page.evaluate(({ KEY, HAPTICS }) => ({
  progress: localStorage.getItem(KEY), haptics: localStorage.getItem(HAPTICS),
}), { KEY, HAPTICS });
const seeded = {
  completed: { 'map-1': 1000 }, answers: { 'map-1': 1 },
  notes: { 'map-1': 'KEEP · сохранить' }, review: { 'map-1': 2000 },
  missionSteps: { 'listen-ten': [true, false, true] },
  focusModule: 'needs', currentLessonId: 'needs-1',
  guidedFlow: { topic: 'needs', step: 1 },
};

for (const lang of ['ru', 'en']) {
  for (const width of [320, 390, 768, 1024, 1280, 1440]) {
    test(`large hero Lumi ${lang} ${width}px: complete frame, correct position and no progress writes`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const errors = []; page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`/?lang=${lang}`);
      await page.evaluate(({ KEY, HAPTICS, seeded }) => {
        localStorage.setItem(KEY, JSON.stringify(seeded));
        localStorage.setItem(HAPTICS, 'off');
      }, { KEY, HAPTICS, seeded });
      await page.reload();
      await expect(page.getByTestId('resume')).toBeEnabled();
      const before = await read(page);
      const hero = page.locator('.hero');
      const companion = hero.locator('.lumi-hero');
      const art = companion.locator('.lumi-welcome');
      const video = art.locator('video');
      await expect(art).toBeVisible();
      await expect(video).toHaveAttribute('poster', /\.jpg$/);
      await expect(video).toHaveCSS('object-fit', 'contain');
      expect(await video.evaluate((el) => el.muted && el.playsInline && el.paused && !el.autoplay)).toBe(true);
      expect(await video.locator('source').count()).toBe(2);
      const picture = await art.boundingBox();
      const mascot = await companion.boundingBox();
      const copy = await hero.locator(':scope > div').first().boundingBox();
      const frame = await hero.boundingBox();
      expect(picture.width).toBeGreaterThanOrEqual(220);
      expect(picture.width).toBeLessThanOrEqual(280.5);
      expect(Math.abs(picture.width - picture.height)).toBeLessThan(1);
      expect(picture.x).toBeGreaterThanOrEqual(frame.x);
      expect(picture.x + picture.width).toBeLessThanOrEqual(frame.x + frame.width);
      if (width <= 970) {
        expect(mascot.y + mascot.height).toBeLessThanOrEqual(copy.y);
        expect(Math.abs(picture.x + picture.width / 2 - (frame.x + frame.width / 2))).toBeLessThan(1);
      } else {
        expect(copy.x + copy.width).toBeLessThanOrEqual(mascot.x);
      }
      const toggle = art.getByTestId('lumi-welcome-toggle');
      await expect(toggle).toHaveAccessibleName(lang === 'ru' ? 'Включить приветствие Луми' : 'Play Lumi greeting');
      const control = await toggle.boundingBox();
      expect(control.width).toBeGreaterThanOrEqual(44);
      expect(control.height).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.getByTestId('xp')).toContainText('20 XP');
      await expect(page.getByTestId('resume-label')).toContainText('2/3');
      if ([320, 1280].includes(width)) {
        const violations = (await new AxeBuilder({ page }).analyze()).violations;
        expect(violations.filter((v) => ['serious', 'critical'].includes(v.impact))).toEqual([]);
      }
      expect(await read(page)).toEqual(before);
      // Capture the actual accepted build, not a mockup. The poster respects reduced motion.
      await hero.screenshot({ path: info.outputPath(`large-lumi-${lang}-${width}.png`) });
      if ([390, 1280].includes(width)) {
        await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({ path: info.outputPath(`home-large-lumi-${lang}-${width}.png`) });
      }
      expect(await read(page)).toEqual(before);
      expect(errors).toEqual([]);
    });
  }
}

for (const width of [320, 1280]) {
  test(`large hero Lumi ${width}px: failed video keeps a large portrait and usable learning button`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.route(/lumi-welcome.*\.(webm|mp4)/, (route) => route.abort());
    await page.goto('/');
    const portrait = page.locator('.hero .lumi-portrait');
    await expect(portrait).toBeVisible();
    const box = await portrait.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(220);
    expect(box.width).toBeLessThanOrEqual(280.5);
    expect(await read(page)).toEqual({ progress: null, haptics: null });
    await page.getByTestId('resume').focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#lesson\//);
    await expect(page.locator('#page-title')).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
