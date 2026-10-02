import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const serious = (results) => results.violations
  .filter((violation) => ['serious', 'critical'].includes(violation.impact))
  .map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.map((node) => node.target),
  }));

async function scan(page, label) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(serious(results), label).toEqual([]);
}

for (const width of [320, 1280]) {
  test(`critical/serious a11y smoke across core journey at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });

    await page.goto('/');
    await expect(page.locator('.path-stop')).toHaveCount(4);
    await scan(page, 'path');

    await page.goto('/#start');
    await expect(page.getByRole('heading').first()).toBeVisible();
    await scan(page, 'guided topic picker');

    await page.locator('[data-topic=listening]').click();
    await expect(page.locator('.lesson-top')).toContainText(/ВОПРОС|QUESTION/);
    await scan(page, 'guided question');

    await page.goto('/#lesson/map-1');
    await expect(page.getByRole('heading', { name: /Метафора — не диагноз|Metaphor/ })).toBeVisible();
    await scan(page, 'lesson');

    await page.goto('/#mission/listen-ten');
    await expect(page.getByTestId('mission-detail')).toBeVisible();
    await scan(page, 'mission detail');

    await page.goto('/#progress');
    await expect(page.getByTestId('xp-total')).toBeVisible();
    await scan(page, 'progress');
  });
}
