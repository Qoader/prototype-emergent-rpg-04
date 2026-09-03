import { test, expect } from '@playwright/test';

test('loads and accepts a touch destination', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('game-canvas')).toBeVisible();
  await expect(page.getByTestId('player-status')).toContainText('Ready');
  await page.getByTestId('game-canvas').tap({ position: { x: 250, y: 400 } });
  await expect(page.getByTestId('player-status')).toContainText('Moving to');
});

test('mobile startup reaches the canvas without a reload', async ({ page }) => {
  const started = Date.now();
  let navigations = 0;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations += 1;
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('game-canvas')).toBeVisible({ timeout: 8000 });
  await expect(page.getByTestId('player-status')).toContainText('Ready');
  expect(Date.now() - started).toBeLessThan(8000);
  expect(navigations).toBe(1);
});
