import { test, expect } from '@playwright/test';

test('loads and accepts a destination input', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByTestId('game-canvas')).toBeVisible();
  await expect(page.getByTestId('player-status')).toHaveCount(0);
  const canvas = page.getByTestId('game-canvas');
  if (testInfo.project.use.hasTouch) {
    await canvas.tap({ position: { x: 250, y: 400 } });
  } else {
    await canvas.click({ position: { x: 250, y: 400 } });
  }
  await expect(page.getByTestId('player-status')).toHaveCount(0);
});

test.describe('deterministic tactical battle fixture', () => {
  test('renders a reactive battle and supports keyboard movement', async ({ page }) => {
    await page.goto('/?battle-fixture');
    await expect(page.getByRole('region', { name: 'Tactical battle' })).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/Player HP/)).toBeVisible();
    const cell = page.getByRole('gridcell', { name: '1, 3, player' }); await expect(cell).toHaveAttribute('tabindex', '0'); await cell.focus(); await page.keyboard.press('ArrowUp'); await expect(page.locator(':focus')).toHaveAttribute('aria-label', '1, 2'); await page.keyboard.press('Enter');
    await expect(page.getByText(/MP 2/)).toBeVisible();
  });
  test('supports narrow layout', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 }); await page.goto('/?battle-fixture');
    await expect(page.getByRole('region', { name: 'Tactical battle' })).toBeVisible({ timeout: 8000 });
    await expect(page.locator('.battle')).toHaveCSS('overflow', 'auto');
  });
  test('wins through real movement and attack controls, then continues', async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (error) => pageErrors.push(error));
    await page.goto('/?battle-fixture-solo'); await expect(page.getByRole('region', { name: 'Tactical battle' })).toBeVisible({ timeout: 8000 });
    await page.getByRole('gridcell', { name: '4, 3' }).click(); await page.getByRole('button', { name: 'Attack' }).click();
    await page.getByRole('button', { name: 'End Turn' }).click(); await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Attack' }).click(); await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click(); await expect(page.getByRole('region', { name: 'Tactical battle' })).toHaveCount(0);
    await expect(page.locator('canvas')).toHaveCount(1);
    const gameCanvas = page.getByTestId('game-canvas');
    await expect(gameCanvas).toBeVisible();
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    const bounds = await gameCanvas.boundingBox();
    expect(bounds?.width ?? 0).toBeGreaterThan(0);
    expect(bounds?.height ?? 0).toBeGreaterThan(0);
    expect(pageErrors).toEqual([]);
  });
  test('returns to the map and completes a second encounter', async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (error) => pageErrors.push(error));
    await page.goto('/?battle-fixture');
    const winEncounter = async () => {
      await expect(page.getByRole('region', { name: 'Tactical battle' })).toBeVisible({ timeout: 8000 });
      await page.getByRole('gridcell', { name: '4, 3' }).click();
      await page.getByRole('button', { name: 'Attack' }).click();
      await page.getByRole('button', { name: 'End Turn' }).click();
      await expect(page.getByRole('button', { name: 'Attack' })).toBeEnabled({ timeout: 5000 });
      await page.getByRole('button', { name: 'Attack' }).click();
      await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(page.getByTestId('game-canvas')).toBeVisible();
    };
    await winEncounter();
    await expect(page.getByRole('region', { name: 'Tactical battle' })).toBeVisible({ timeout: 3000 });
    await winEncounter();
    await expect(page.getByRole('region', { name: 'Tactical battle' })).toBeVisible({ timeout: 3000 });
    await expect(page.locator('canvas')).toHaveCount(1);
    expect(pageErrors).toEqual([]);
  });
  test('survives repeated encounters in the generated world', async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (error) => pageErrors.push(error));
    await page.goto('/?battle-stability');
    const canvas = page.getByTestId('game-canvas');
    const winEncounter = async (expectStart = true) => {
      if (expectStart) await expect(page.getByRole('region', { name: 'Tactical battle' })).toBeVisible({ timeout: 10000 });
      await page.getByRole('gridcell', { name: '4, 3' }).click();
      await expect(page.getByRole('button', { name: 'Attack' })).toBeEnabled({ timeout: 5000 });
      await page.getByRole('button', { name: 'Attack' }).click();
      await expect(page.getByRole('button', { name: 'End Turn' })).toBeEnabled({ timeout: 5000 });
      await page.getByRole('button', { name: 'End Turn' }).click();
      await expect(page.getByRole('button', { name: 'Attack' })).toBeEnabled({ timeout: 5000 });
      await page.getByRole('button', { name: 'Attack' }).click();
      await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(canvas).toBeVisible();
      await expect(page.locator('canvas')).toHaveCount(1);
      await canvas.click({ position: { x: 100, y: 100 } });
    };
    await winEncounter();
    await expect(page.getByRole('region', { name: 'Tactical battle' })).toHaveCount(0);
    await expect(canvas).toBeVisible();
    await canvas.click({ position: { x: 100, y: 100 } });
    await page.evaluate(() => (window as typeof globalThis & { __startBattleStabilityEncounter?: (index: number) => void }).__startBattleStabilityEncounter?.(1));
    await winEncounter(false);
    await expect(page.getByRole('region', { name: 'Tactical battle' })).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });
  test('loses through real turns and respawns at settlement', async ({ page }) => {
    await page.goto('/?battle-fixture-defeat'); await expect(page.getByRole('region', { name: 'Tactical battle' })).toBeVisible({ timeout: 8000 });
    for (let i=0;i<5;i++) { const end=page.getByRole('button', { name:'End Turn' }); if (await end.isEnabled()) { await end.click(); await page.waitForTimeout(300); } }
    await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible({ timeout: 3000 }); await page.getByRole('button', { name:'Continue' }).click(); await expect(page.getByRole('region', { name:'Tactical battle' })).toHaveCount(0);
  });
  test('supports touch cell interaction and repeated cleanup', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.use.hasTouch, 'tap requires a touch project');
    await page.goto('/?battle-fixture'); const cell=page.getByRole('gridcell', { name:'4, 3' }); await expect(cell).toBeVisible({ timeout:8000 }); await cell.tap(); await page.getByRole('button', { name:'Attack' }).tap(); await page.getByRole('button', { name:'End Turn' }).tap(); await page.waitForTimeout(300); await page.getByRole('button', { name:'Attack' }).tap(); await page.getByRole('button', { name:'Continue' }).tap(); await expect(page.getByRole('region', { name:'Tactical battle' })).toBeVisible({ timeout:3000 });
  });
});

test('mobile startup reaches the canvas without a reload', async ({ page }) => {
  const started = Date.now();
  let navigations = 0;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations += 1;
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('game-canvas')).toBeVisible({ timeout: 8000 });
  await expect(page.getByTestId('player-status')).toHaveCount(0);
  expect(Date.now() - started).toBeLessThan(8000);
  expect(navigations).toBe(1);
});

test('reports and cleans up a lost map rendering context', async ({ page }) => {
  await page.goto('/');
  const canvas = page.getByTestId('game-canvas');
  await expect(canvas).toBeVisible({ timeout: 8000 });
  const prevented = await canvas.evaluate((element) => {
    const event = new Event('webglcontextlost', { cancelable: true });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(true);
  await expect(page.getByTestId('player-status')).toContainText('Unable to load the map renderer');
  await expect(page.locator('canvas')).toHaveCount(0);
});
