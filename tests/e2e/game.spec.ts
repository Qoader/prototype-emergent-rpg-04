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

test('renders the player at the initial map position', async ({ page }) => {
  await page.goto('/');
  const canvas = page.getByTestId('game-canvas');
  await expect(canvas).toBeVisible();
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  // The camera centers the player at startup. Keep the snapshot focused on
  // the map center so unrelated viewport/UI changes do not mask this bug.
  const center = bounds!;
  const clipSize = 128;
  await expect(page).toHaveScreenshot('player-visible.png', {
    clip: {
      x: center.x + center.width / 2 - clipSize / 2,
      y: center.y + center.height / 2 - clipSize / 2,
      width: clipSize,
      height: clipSize
    },
    animations: 'disabled'
  });
});
