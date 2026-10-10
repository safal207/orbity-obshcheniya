import { test, expect } from '@playwright/test';
const KEY = 'orbity-dialoga-progress-v1';

for (const route of ['lesson/map-1/1', 'practice/map-2', 'review', 'module/needs', 'mission/listen-ten', 'guided-done', 'now/conflict', 'today', 'about']) {
  test(`English public entry preserves #${route} and language switching on reload`, async ({ page }) => {
    await page.goto(`/en.html#${route}`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page).toHaveTitle('Conversation Orbits');
    expect(new URL(page.url()).hash).toBe(`#${route}`);
    await expect(page.locator('.app-shell')).not.toContainText(/REACT PREVIEW|experimental React/);
    const before = await page.evaluate((key) => localStorage.getItem(key), KEY);
    await page.getByRole('button', { name: 'Переключить на русский', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    await expect(page).toHaveTitle('Орбиты общения');
    expect(new URL(page.url()).hash).toBe(`#${route}`);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    expect(new URL(page.url()).hash).toBe(`#${route}`);
    expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe(before);
  });
}
