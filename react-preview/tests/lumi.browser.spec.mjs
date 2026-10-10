import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';

const KEY = 'orbity-dialoga-progress-v1';
const source = readFileSync(new URL('../../dist/course.js', import.meta.url), 'utf8');
const { lessons, missions } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const raw = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);
const serious = async (page) => (await new AxeBuilder({ page }).analyze()).violations
  .filter((v) => ['serious', 'critical'].includes(v.impact));
const fits = async (page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

for (const width of [320, 390, 768, 1280]) {
  test(`Lumi path: RU/EN, loaded square poster, reduced motion and layout at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    const companion = page.locator('.hero [data-testid=lumi-companion]');
    await expect(companion).toContainText('Луми');
    const video = companion.getByTestId('lumi-welcome-video');
    await expect(video).toBeVisible();
    await expect(video).toHaveAttribute('aria-hidden', 'true');
    await expect(video).toHaveAttribute('poster', /lumi-welcome-poster.*\.jpg$/);
    await expect(video).toHaveAttribute('preload', 'none');
    expect(await video.evaluate((media) => ({ paused: media.paused, autoplay: media.autoplay })))
      .toEqual({ paused: true, autoplay: false });
    const poster = await video.evaluate((media) => new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve([image.naturalWidth, image.naturalHeight]);
      image.onerror = () => resolve(null);
      image.src = media.poster;
    }));
    expect(poster).toEqual([544, 544]);
    const frame = await video.boundingBox();
    expect(frame.width).toBeCloseTo(frame.height, 1);
    await expect(video).toHaveCSS('object-fit', 'contain');
    await expect(companion.getByTestId('lumi-welcome-toggle')).toHaveAccessibleName('Включить приветствие Луми');
    await expect(page.locator('#unit option')).toHaveCount(8);
    await expect(page.locator('.path-stop')).toHaveCount(4);
    const before = await raw(page);
    await fits(page);
    if ([320, 1280].includes(width)) expect(await serious(page)).toEqual([]);
    await page.screenshot({ path: info.outputPath(`lumi-path-ru-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Switch to English' }).click();
    await expect(companion).toContainText('Lumi');
    await expect(companion).toContainText('at your own pace');
    await expect(companion.getByTestId('lumi-welcome-toggle')).toHaveAccessibleName('Play Lumi greeting');
    expect(await raw(page)).toBe(before); // Rendering and localization are read-only.
    await fits(page);
    if ([320, 1280].includes(width)) expect(await serious(page)).toEqual([]);
    await page.screenshot({ path: info.outputPath(`lumi-path-en-${width}.png`), fullPage: true });
    await page.getByTestId('resume').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#page-title')).toBeFocused();
    await expect(page).toHaveURL(/#lesson\//);
    expect(errors).toEqual([]);
  });
}

test('Lumi greeting autoplays silently once, can pause and replay, and never changes progress', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/?lang=en');
  const video = page.getByTestId('lumi-welcome-video');
  const toggle = page.getByTestId('lumi-welcome-toggle');
  const before = await raw(page);
  await expect.poll(() => video.evaluate((media) => !media.paused && media.currentTime > 0)).toBe(true);
  expect(await video.evaluate((media) => ({
    width: media.videoWidth, height: media.videoHeight,
    muted: media.muted, inline: media.playsInline, autoplay: media.autoplay, loop: media.loop,
  }))).toEqual({ width: 544, height: 544, muted: true, inline: true, autoplay: true, loop: false });
  await expect(toggle).toHaveAccessibleName('Pause Lumi greeting');

  await toggle.click();
  expect(await video.evaluate((media) => media.paused)).toBe(true);
  await expect(toggle).toHaveAccessibleName('Play Lumi greeting');
  const pausedTime = await video.evaluate((media) => media.currentTime);
  // Observe real frames after the pause; a changed label alone is not sufficient.
  await video.evaluate(() => new Promise((resolve) => {
    let frames = 0;
    const frame = () => ++frames === 12 ? resolve() : requestAnimationFrame(frame);
    requestAnimationFrame(frame);
  }));
  expect(await video.evaluate((media) => media.currentTime)).toBe(pausedTime);

  await toggle.click();
  await expect.poll(() => video.evaluate((media) => !media.paused && media.currentTime > 0)).toBe(true);
  await video.evaluate((media) => { media.currentTime = media.duration - 0.15; });
  await expect.poll(() => video.evaluate((media) => media.ended && media.paused)).toBe(true);
  await expect(toggle).toHaveAccessibleName('Play Lumi greeting');
  await toggle.click();
  await expect.poll(() => video.evaluate((media) => !media.paused && !media.ended && media.currentTime < 2)).toBe(true);
  await toggle.click();
  expect(await raw(page)).toBe(before);
});

test('Lumi reduced-motion greeting stays still until keyboard play and stops when motion preference changes', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const video = page.getByTestId('lumi-welcome-video');
  const toggle = page.getByTestId('lumi-welcome-toggle');
  const before = await raw(page);
  expect(await video.evaluate((media) => ({ paused: media.paused, currentTime: media.currentTime, autoplay: media.autoplay })))
    .toEqual({ paused: true, currentTime: 0, autoplay: false });
  await expect(toggle).toHaveAccessibleName('Включить приветствие Луми');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => video.evaluate((media) => !media.paused && media.currentTime > 0)).toBe(true);
  await expect(toggle).toHaveAccessibleName('Приостановить приветствие Луми');
  await page.keyboard.press('Enter');
  await expect.poll(() => video.evaluate((media) => media.paused)).toBe(true);

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  if (await video.evaluate((media) => media.paused)) await toggle.click();
  await expect.poll(() => video.evaluate((media) => !media.paused)).toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => video.evaluate((media) => media.paused)).toBe(true);
  await expect(toggle).toHaveAccessibleName('Включить приветствие Луми');
  expect(await raw(page)).toBe(before);
});

for (const lang of ['ru', 'en']) {
  test(`Lumi lesson ${lang}: support on a wrong answer or failed save, joy only after retry persists`, async ({ page }, info) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    // Establish the full-lesson bookmark through the UI before testing save feedback.
    await page.goto(`/?lang=${lang}#lesson/map-1`);
    await page.getByRole('button', { name: lang === 'ru' ? 'Попробуем' : 'Let’s try it' }).click();
    await page.getByRole('button', { name: lang === 'ru' ? 'Проверить понимание' : 'Check understanding' }).click();
    const choice = page.locator('.choice');
    await expect(choice.first()).toBeEnabled();
    const before = await raw(page);
    const check = page.getByRole('button', { name: lang === 'ru' ? 'Проверить ответ' : 'Check answer', exact: true });
    await choice.nth(0).click(); await check.click();
    await expect(page.locator('.feedback.retry [data-lumi-mood=support]')).toBeVisible();
    expect(await raw(page)).toBe(before);
    await fits(page);
    expect(await serious(page)).toEqual([]);
    await page.screenshot({ path: info.outputPath(`lumi-retry-${lang}-320.png`), fullPage: true });

    await page.evaluate((key) => {
      const original = Storage.prototype.setItem;
      window.restoreLumiTestStorage = () => { Storage.prototype.setItem = original; };
      window.lumiRejectedWrites = 0;
      Storage.prototype.setItem = function (k, value) {
        if (this === localStorage && k === key) {
          window.lumiRejectedWrites++;
          throw new DOMException('Synthetic Lumi save rejection', 'QuotaExceededError');
        }
        return original.call(this, k, value);
      };
    }, KEY);
    await choice.nth(1).click(); await check.click();
    await expect(page.locator('.alert [data-lumi-mood=support]')).toBeVisible();
    await expect(page.locator('[data-lumi-mood=success]')).toHaveCount(0);
    expect(await raw(page)).toBe(before);
    expect(await page.evaluate(() => window.lumiRejectedWrites)).toBe(1);
    await fits(page);
    await page.evaluate(() => window.restoreLumiTestStorage());
    await check.click();
    const happy = page.locator('.feedback.success [data-lumi-mood=success]');
    await expect(happy).toBeVisible();
    const successVideo = happy.getByTestId('lumi-welcome-video');
    await expect(successVideo).toBeVisible();
    await expect(successVideo).toHaveAttribute('poster', /lumi-welcome-poster.*\.jpg$/);
    expect(await successVideo.evaluate((media) => ({ paused: media.paused, autoplay: media.autoplay })))
      .toEqual({ paused: true, autoplay: false });
    await expect(happy.getByTestId('lumi-welcome-toggle')).toHaveAccessibleName(lang === 'ru' ? 'Включить приветствие Луми' : 'Play Lumi greeting');
    const saved = JSON.parse(await raw(page));
    expect(saved.completed['map-1']).toBeTruthy();
    await expect(page.getByTestId('xp')).toContainText('20 XP');
    await fits(page);
    expect(await serious(page)).toEqual([]);
    await page.screenshot({ path: info.outputPath(`lumi-success-${lang}-320.png`), fullPage: true });
    await page.goto(`/?lang=${lang}#progress`);
    await expect(page.getByTestId('lumi-companion')).toContainText(lang === 'ru' ? 'Пауза' : 'Breaks');
    expect(await raw(page)).toBe(JSON.stringify(saved));
    await fits(page);
    await page.screenshot({ path: info.outputPath(`lumi-progress-${lang}-320.png`), fullPage: true });
  });
}

test('Lumi guided joy waits for the real Web Lock and does not award lesson XP', async ({ page }) => {
  await page.goto('/#start');
  await expect(page.getByTestId('lumi-companion')).toBeVisible();
  await page.locator('[data-topic=needs]').click();
  await expect(page).toHaveURL(/#guided\/needs$/);
  const before = await raw(page);
  await page.evaluate((key) => {
    window.lumiLockReady = false;
    navigator.locks.request(key, () => {
      window.lumiLockReady = true;
      return new Promise((resolve) => { window.releaseLumiLock = resolve; });
    });
  }, KEY);
  await expect.poll(() => page.evaluate(() => window.lumiLockReady)).toBe(true);
  const lesson = lessons.find((l) => l.id === 'needs-1');
  await page.locator('.choice').nth(lesson.quiz.correct[0]).click();
  await page.getByRole('button', { name: 'Проверить ответ', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Сохраняем…', exact: true })).toBeDisabled();
  await expect(page.locator('[data-lumi-mood=success]')).toHaveCount(0);
  expect(await raw(page)).toBe(before);
  await page.evaluate(() => window.releaseLumiLock());
  const happy = page.locator('.feedback.success [data-lumi-mood=success]');
  await expect(happy).toBeVisible();
  await expect(happy.getByTestId('lumi-welcome-video')).toBeVisible();
  expect(await happy.getByTestId('lumi-welcome-video').evaluate((media) => ({ muted: media.muted, loop: media.loop })))
    .toEqual({ muted: true, loop: false });
  const saved = JSON.parse(await raw(page));
  expect(saved.guidedFlow.step).toBe(1);
  expect(saved.completed).toEqual({});
  expect(saved.notes).toEqual({});
  await expect(page.getByTestId('xp')).toContainText('0 XP');
});

test('missing greeting and portrait assets do not remove localized guidance or block a lesson', async ({ page }) => {
  await page.route(/\.(webm|mp4|jpg|webp)(?:\?.*)?$/, (route) => route.abort());
  await page.goto('/');
  const companion = page.locator('.hero [data-testid=lumi-companion]');
  await expect(companion).toContainText('Один маленький шаг');
  await expect(companion.locator('img')).toHaveCount(0);
  await expect(companion.locator('.lumi-fallback')).toBeVisible();
  await page.getByTestId('resume').click();
  await expect(page).toHaveURL(/#lesson\//);
  await expect(page.locator('#page-title')).toBeFocused();
});

test('a failed greeting falls back to the portrait and leaves lesson navigation available', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.route(/\.(webm|mp4)(?:\?.*)?$/, (route) => route.abort());
  await page.goto('/?lang=en');
  const companion = page.locator('.hero [data-testid=lumi-companion]');
  await expect(companion.getByTestId('lumi-welcome-video')).toHaveCount(0);
  await expect(companion.getByTestId('lumi-welcome-toggle')).toHaveCount(0);
  await expect(companion.locator('[data-lumi-mood=idle]')).toBeVisible();
  await expect.poll(() => companion.locator('img').evaluate((image) => image.complete && image.naturalWidth === 576)).toBe(true);
  await expect(companion).toContainText('One small step');
  const before = await raw(page);
  await page.getByTestId('resume').click();
  await expect(page).toHaveURL(/#lesson\//);
  await expect(page.locator('#page-title')).toBeFocused();
  const saved = JSON.parse(await raw(page));
  const prior = before ? JSON.parse(before) : null;
  expect(saved?.completed || {}).toEqual(prior?.completed || {});
});

test('current navigation has one semantic marker across learning and mission routes', async ({ page }) => {
  for (const [hash, label] of [
    ['path', 'Маршрут'], ['today', 'Маршрут'], ['start', 'Маршрут'], ['guided/needs', 'Маршрут'],
    ['lesson/map-1', 'Маршрут'], ['practice/map-1', 'Маршрут'], ['review', 'Маршрут'],
    [`mission/${missions[0].id}`, 'В жизни'], ['progress', 'Прогресс'],
  ]) {
    await page.goto(`/#${hash}`);
    const active = page.locator('nav [aria-current=page]');
    await expect(active).toHaveCount(1);
    await expect(active).toHaveText(new RegExp(label));
    await expect(active).toHaveClass(/active/);
  }
});


test('Lumi animates each page transition with contextual, dismissible, localized and read-only tips', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const before = await raw(page);
  await expect(page.getByTestId('lumi-route-tip')).toHaveCount(0);

  await page.getByRole('button', { name: 'В жизни', exact: true }).click();
  const tip = page.getByTestId('lumi-route-tip');
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('Лучше один маленький шаг');
  const animation = tip.getByTestId('lumi-welcome-video');
  await expect(animation).toBeVisible();
  await expect(animation).toHaveAttribute('poster', /lumi-welcome-poster.*\.jpg$/);
  expect(await animation.evaluate((media) => ({ paused: media.paused, autoplay: media.autoplay })))
    .toEqual({ paused: true, autoplay: false });
  await expect(tip.getByTestId('lumi-welcome-toggle')).toHaveAccessibleName('Включить приветствие Луми');
  expect(await raw(page)).toBe(before);

  await tip.getByRole('button', { name: 'Скрыть совет Луми' }).click();
  await expect(tip).toHaveCount(0);
  await page.getByRole('button', { name: 'Маршрут', exact: true }).click();
  await expect(tip).toBeVisible();
  await expect(tip.getByTestId('lumi-welcome-video')).toBeVisible();
  expect(await raw(page)).toBe(before);
  await page.getByRole('button', { name: 'В жизни', exact: true }).click();
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('Лучше один маленький шаг');
  await expect(tip.getByTestId('lumi-welcome-video')).toBeVisible();
  expect(await raw(page)).toBe(before);

  await page.getByRole('button', { name: 'Открыть пошагово', exact: true }).first().click();
  await expect(tip).toContainText('Пусть шаг будет добровольным');
  await expect(tip.getByTestId('lumi-welcome-video')).toBeVisible();
  expect(await raw(page)).toBe(before);

  await page.getByRole('button', { name: 'Прогресс', exact: true }).click();
  await expect(page.getByTestId('lumi-route-tip')).toContainText('след практики');
  await page.getByRole('button', { name: 'Switch to English' }).click();
  await expect(page.getByTestId('lumi-route-tip')).toContainText('trace of practice');
  await expect(tip.getByTestId('lumi-welcome-toggle')).toHaveAccessibleName('Play Lumi greeting');
  await tip.getByRole('button', { name: 'Dismiss Lumi tip' }).click();
  await expect(tip).toHaveCount(0);
  await page.getByRole('button', { name: 'Переключить на русский' }).click();
  await expect(tip).toHaveCount(0);
  expect(await raw(page)).toBe(before);
});

test('haptics: wrong and rejected lesson answers stay silent; saved completion gives a gentle double tap', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    window.__vibrations = [];
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value(pattern) {
      window.__vibrations.push(pattern);
      return true;
    } });
  });
  await page.goto('/#lesson/map-1');
  await page.getByRole('button', { name: 'Попробуем' }).click();
  await page.getByRole('button', { name: 'Проверить понимание' }).click();
  const check = page.getByRole('button', { name: 'Проверить ответ', exact: true });
  const before = await raw(page);

  await page.locator('.choice').nth(0).click();
  await check.click();
  await expect(page.locator('.feedback.retry')).toBeVisible();
  expect(await page.evaluate(() => window.__vibrations)).toEqual([]);
  expect(await raw(page)).toBe(before);

  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    window.restoreHapticStorage = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function (k, value) {
      if (this === localStorage && k === key) throw new DOMException('Synthetic haptic save failure', 'QuotaExceededError');
      return original.call(this, k, value);
    };
  }, KEY);
  await page.locator('.choice').nth(1).click();
  await check.click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(await page.evaluate(() => window.__vibrations)).toEqual([]);
  expect(await raw(page)).toBe(before);

  await page.evaluate(() => window.restoreHapticStorage());
  await check.click();
  await expect(page.locator('.feedback.success')).toBeVisible();
  expect(await page.evaluate(() => window.__vibrations)).toEqual([[28, 40, 36]]);
  expect(JSON.parse(await raw(page)).completed['map-1']).toBeTruthy();

  await page.reload();
  expect(await page.evaluate(() => window.__vibrations)).toEqual([]);
  await expect(page.getByTestId('xp')).toContainText('20 XP');
  await fits(page);
});

test('haptics: guided questions respect reduced motion, then tap after committed steps with no XP', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    window.__vibrations = [];
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value(pattern) {
      window.__vibrations.push(pattern);
      return true;
    } });
  });
  await page.goto('/#start');
  await page.locator('[data-topic=needs]').click();

  const check = page.getByRole('button', { name: 'Проверить ответ', exact: true });
  const first = lessons.find((lesson) => lesson.id === 'needs-1');
  await page.locator('.choice').nth(first.quiz.correct[0]).click();
  await check.click();
  await expect(page.locator('.feedback.success')).toBeVisible();
  expect(await page.evaluate(() => window.__vibrations)).toEqual([]);
  expect(JSON.parse(await raw(page)).guidedFlow.step).toBe(1);

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('button', { name: 'Следующий вопрос', exact: true }).click();
  const second = lessons.find((lesson) => lesson.id === 'needs-2');
  await page.locator('.choice').nth(second.quiz.correct[0]).click();
  await check.click();
  await expect(page.locator('.feedback.success')).toBeVisible();
  expect(await page.evaluate(() => window.__vibrations)).toEqual([18]);
  expect(JSON.parse(await raw(page)).guidedFlow.step).toBe(2);

  await page.getByRole('button', { name: 'Следующий вопрос', exact: true }).click();
  const third = lessons.find((lesson) => lesson.id === 'needs-3');
  await page.locator('.choice').nth(third.quiz.correct[0]).click();
  await check.click();
  await expect(page.locator('.feedback.success')).toBeVisible();
  expect(await page.evaluate(() => window.__vibrations)).toEqual([18, [28, 40, 36]]);
  expect(JSON.parse(await raw(page)).guidedFlow.step).toBe(3);
  await expect(page.getByTestId('xp')).toContainText('0 XP');
  await fits(page);
});
