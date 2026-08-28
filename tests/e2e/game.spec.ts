import { test, expect } from '@playwright/test';

test('loads and accepts a touch destination', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('game-canvas')).toBeVisible();
  await expect(page.getByTestId('player-status')).toContainText('Ready');
  await page.getByTestId('game-canvas').tap({ position: { x: 250, y: 400 } });
  await expect(page.getByTestId('player-status')).toContainText('Moving to');
});
