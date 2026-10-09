import { test, expect } from '@playwright/test';

const KEY = 'orbity-dialoga-progress-v1';
const HAPTICS = 'orbity-haptics-v1';
const progress = {
  completed: { 'map-1': 1000 }, answers: { 'map-1': 1 },
  notes: { 'map-1': 'KEEP · сохранить' }, review: { 'map-1': 2000 },
  missionSteps: { 'listen-ten': [true, false, true] },
  focusModule: 'needs', currentLessonId: 'needs-1',
  guidedFlow: { topic: 'needs', step: 1 },
};
const words = {
  ru: { copy: 'Скопировать фразу', copying: 'Копируем…', copied: 'Фраза скопирована.', failed: 'Не удалось скопировать автоматически.', select: 'Выделить фразу' },
  en: { copy: 'Copy phrase', copying: 'Copying…', copied: 'Phrase copied.', failed: 'Could not copy automatically.', select: 'Select phrase' },
};

async function open(page, lang, mode) {
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(({ KEY, HAPTICS, progress, mode }) => {
    localStorage.setItem(KEY, JSON.stringify(progress));
    localStorage.setItem(HAPTICS, 'on');
    window.storageWrites = []; window.vibrations = []; window.clipboardWrites = [];
    for (const method of ['setItem', 'removeItem', 'clear']) {
      const original = Storage.prototype[method];
      Storage.prototype[method] = function (...args) {
        window.storageWrites.push([method, ...args]);
        return original.apply(this, args);
      };
    }
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: (...args) => { window.vibrations.push(args); return true; } });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: mode === 'unavailable' ? undefined : {
        writeText: (text) => {
          window.clipboardWrites.push(text);
          if (mode === 'rejected') return Promise.reject(new DOMException('Synthetic clipboard denial', 'NotAllowedError'));
          if (mode === 'pending') return new Promise((resolve, reject) => {
            window.completeClipboard = (fail = false) => fail ? reject(new DOMException('Synthetic late denial', 'NotAllowedError')) : resolve();
          });
          return Promise.resolve();
        },
      },
    });
  }, { KEY, HAPTICS, progress, mode });
  await page.goto(`/?lang=${lang}#now/conflict`);
  await expect(page.getByTestId('quick-help-phrase')).toBeVisible();
  return errors;
}

async function unchanged(page, errors) {
  expect(await page.evaluate(({ KEY, HAPTICS }) => ({
    progress: localStorage.getItem(KEY), haptics: localStorage.getItem(HAPTICS),
    writes: window.storageWrites, vibrations: window.vibrations,
  }), { KEY, HAPTICS })).toEqual({ progress: JSON.stringify(progress), haptics: 'on', writes: [], vibrations: [] });
  expect(errors).toEqual([]);
}

for (const lang of ['ru', 'en']) {
  const text = words[lang];
  test(`quick help ${lang}: copy waits for clipboard success and preserves saved data`, async ({ page }) => {
    const errors = await open(page, lang, 'pending');
    const phrase = await page.getByTestId('quick-help-phrase').innerText();
    await page.getByRole('button', { name: text.copy, exact: true }).click();
    await expect(page.getByRole('button', { name: text.copying, exact: true })).toBeDisabled();
    await expect(page.getByTestId('quick-help-copy-status')).not.toContainText(text.copied);
    expect(await page.evaluate(() => window.clipboardWrites)).toEqual([phrase]);
    await page.evaluate(() => window.completeClipboard());
    await expect(page.getByTestId('quick-help-copy-status')).toHaveText(text.copied);
    await expect(page.getByRole('button', { name: text.copy, exact: true })).toBeEnabled();
    await unchanged(page, errors);
  });

  for (const mode of ['rejected', 'unavailable']) {
    test(`quick help ${lang}: ${mode} clipboard offers honest feedback and selectable phrase`, async ({ page }) => {
      const errors = await open(page, lang, mode);
      const phrase = await page.getByTestId('quick-help-phrase').innerText();
      await page.getByRole('button', { name: text.copy, exact: true }).click();
      await expect(page.getByTestId('quick-help-copy-status')).toContainText(text.failed);
      await expect(page.getByTestId('quick-help-copy-status')).not.toContainText(text.copied);
      const select = page.getByRole('button', { name: text.select, exact: true });
      await select.focus(); await page.keyboard.press('Enter');
      await expect(page.getByTestId('quick-help-phrase')).toBeFocused();
      expect(await page.evaluate(() => getSelection().toString())).toBe(phrase);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await unchanged(page, errors);
    });
  }
}

test('quick help clears copy feedback when scenario or language changes', async ({ page }) => {
  const errors = await open(page, 'ru', 'success');
  await page.getByRole('button', { name: words.ru.copy, exact: true }).click();
  await expect(page.getByTestId('quick-help-copy-status')).toHaveText(words.ru.copied);
  await page.getByRole('button', { name: /Другая ситуация/ }).click();
  await page.getByRole('button', { name: /Хочу извиниться/ }).click();
  await expect(page.getByTestId('quick-help-copy-status')).toHaveCount(0);
  await page.getByRole('button', { name: words.ru.copy, exact: true }).click();
  await expect(page.getByTestId('quick-help-copy-status')).toHaveText(words.ru.copied);
  await page.getByRole('button', { name: 'Switch to English', exact: true }).click();
  await expect(page.getByTestId('quick-help-copy-status')).toHaveCount(0);
  await expect(page.getByRole('button', { name: words.en.copy, exact: true })).toBeEnabled();
  await unchanged(page, errors);
});

for (const change of ['scenario', 'language']) {
  for (const fail of [false, true]) {
    test(`quick help ignores late ${fail ? 'failure' : 'success'} after ${change} change`, async ({ page }) => {
      const errors = await open(page, 'ru', 'pending');
      await page.getByRole('button', { name: words.ru.copy, exact: true }).click();
      if (change === 'scenario') {
        await page.getByRole('button', { name: /Другая ситуация/ }).click();
        await page.getByRole('button', { name: /Хочу извиниться/ }).click();
      } else await page.getByRole('button', { name: 'Switch to English', exact: true }).click();
      await page.evaluate(async (fail) => {
        window.completeClipboard(fail);
        await new Promise(requestAnimationFrame);
      }, fail);
      await expect(page.getByTestId('quick-help-copy-status')).toHaveCount(0);
      await expect(page.getByRole('button', { name: words[change === 'language' ? 'en' : 'ru'].copy, exact: true })).toBeEnabled();
      await unchanged(page, errors);
    });
  }
}
