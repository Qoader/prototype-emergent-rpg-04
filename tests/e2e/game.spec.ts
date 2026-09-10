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
  test('keeps the rendered battlefield visible beneath ready interaction overlays', async ({
    page
  }) => {
    await page.goto('/?battle-fixture');
    const board = page.locator('.battle-board');
    await expect(board).toHaveClass(/ready/, { timeout: 8000 });
    const canvas = board.locator('.battle-art canvas');
    await expect(canvas).toBeVisible();
    const metrics = await board.evaluate((element) => {
      const boardBox = element.getBoundingClientRect();
      const art = element.querySelector('.battle-art')!;
      const artBox = art.getBoundingClientRect();
      const cell = element.querySelector('.grid button')!;
      const canvas = art.querySelector('canvas')!;
      return {
        boardWidth: boardBox.width,
        boardHeight: boardBox.height,
        artWidth: artBox.width,
        artHeight: artBox.height,
        cellBackground: getComputedStyle(cell).backgroundColor,
        gridZ: getComputedStyle(element.querySelector('.grid')!).zIndex,
        artZ: getComputedStyle(art).zIndex,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        renderedImageBytes: canvas.toDataURL('image/png').length
      };
    });
    expect(metrics.artWidth).toBeGreaterThanOrEqual(480);
    expect(metrics.artHeight).toBeGreaterThanOrEqual(480);
    expect(metrics.cellBackground).toContain('0.08');
    expect(Number(metrics.gridZ)).toBeGreaterThan(Number(metrics.artZ));
    expect(metrics.canvasWidth).toBeGreaterThanOrEqual(480);
    expect(metrics.canvasHeight).toBeGreaterThanOrEqual(480);
    expect(metrics.renderedImageBytes).toBeGreaterThan(1000);
  });

  test('renders a reactive battle and supports keyboard movement', async ({ page }) => {
    await page.goto('/?battle-fixture');
    await expect(page.getByRole('region', { name: 'Tactical battle' })).toBeVisible({
      timeout: 8000
    });
    await expect(page.getByText(/Player HP/)).toBeVisible();
    const cell = page.getByRole('gridcell', { name: '2, 4, player' });
    await expect(cell).toHaveAttribute('tabindex', '0');
    await cell.focus();
    await page.keyboard.press('ArrowUp');
    await expect(page.locator(':focus')).toHaveAttribute('aria-label', '2, 3');
    await page.keyboard.press('Enter');
    await expect(page.getByText(/MP 2/)).toBeVisible();
  });
  test('supports narrow layout', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/?battle-fixture');
    await expect(page.getByRole('region', { name: 'Tactical battle' })).toBeVisible({
      timeout: 8000
    });
    await expect(page.locator('.battle')).toHaveCSS('overflow', 'hidden');
  });
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 844, height: 390 }
  ]) {
    test(`keeps battle chrome inside ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/?battle-fixture-solo');
      await expect(page.getByRole('region', { name: 'Tactical battle' })).toBeVisible({
        timeout: 8000
      });
      const boxes = await page.evaluate(() =>
        [...document.querySelectorAll('.battle-header, .log, .controls button')].map((el) => {
          const r = el.getBoundingClientRect();
          return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        })
      );
      expect(boxes.length).toBeGreaterThanOrEqual(3);
      for (const box of boxes) {
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.top).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(viewport.width);
        expect(box.bottom).toBeLessThanOrEqual(viewport.height);
      }
      const overlap = await page.evaluate(() => {
        const board = document.querySelector('.battle-board')!.getBoundingClientRect();
        return [...document.querySelectorAll('.log, .controls')].some((el) => {
          const r = el.getBoundingClientRect();
          return (
            r.left < board.right &&
            r.right > board.left &&
            r.top < board.bottom &&
            r.bottom > board.top
          );
        });
      });
      expect(overlap).toBe(false);
    });
  }
  test('renders one atomic latest-action notice', async ({ page }) => {
    await page.goto('/?battle-fixture-solo');
    await expect(page.locator('[role="status"]')).toHaveCount(1);
    await expect(page.locator('.log')).toContainText('Battle begins');
    await page.getByRole('gridcell', { name: '5, 4' }).click();
    await expect(page.locator('.log')).toContainText('cost 3 MP');
    await expect(page.getByRole('button', { name: 'Attack' })).toBeEnabled({ timeout: 5000 });
    await page.getByRole('button', { name: 'Attack' }).click();
    await expect(page.locator('.log')).toContainText('damage');
  });
  test('completes the click-to-ready movement state sequence', async ({ page }) => {
    await page.clock.install();
    await page.goto('/?battle-fixture-solo');
    await expect(page.getByRole('region', { name: 'Tactical battle' })).toBeVisible({
      timeout: 8000
    });
    const attack = page.getByRole('button', { name: 'Attack' });
    const endTurn = page.getByRole('button', { name: 'End Turn' });
    await expect(page.locator('.stats span').first()).toContainText('AP 1 · MP 3');
    await page.getByRole('gridcell', { name: '5, 4' }).click();
    await Promise.all([
      expect(page.getByRole('grid')).toHaveAttribute('aria-busy', 'true'),
      expect(attack).toBeDisabled(),
      expect(endTurn).toBeDisabled()
    ]);
    await expect(page.locator('.stats span').first()).toContainText('AP 1 · MP 0');
    await page.clock.runFor(600);
    await expect(page.getByRole('grid')).toHaveAttribute('aria-busy', 'false');
    await expect(attack).toBeEnabled();
    await expect(page.locator('.stats span').first()).toContainText('AP 1 · MP 0');
  });
  test('suppresses drag release activation while moving the camera', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/?battle-fixture-solo');
    await expect(page.getByRole('region', { name: 'Tactical battle' })).toBeVisible({
      timeout: 8000
    });
    const board = page.locator('.battle-board');
    const boardContent = page.locator('.board-content');
    const beforeStyle = await boardContent.getAttribute('style');
    const beforeStats = await page.locator('.stats').innerText();
    const beforeLog = await page.locator('.log').innerText();
    const bounds = await board.boundingBox();
    expect(bounds).not.toBeNull();
    const x = bounds!.x + bounds!.width / 2;
    const y = bounds!.y + bounds!.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 48, y - 24);
    await page.mouse.up();
    await expect(boardContent).not.toHaveAttribute('style', beforeStyle!);
    expect(await page.locator('.stats').innerText()).toBe(beforeStats);
    expect(await page.locator('.log').innerText()).toBe(beforeLog);
  });
  test('keeps a single touch drag active across multiple moves and capture transfer', async ({
    page
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/?battle-fixture-solo');
    await expect(page.getByRole('region', { name: 'Tactical battle' })).toBeVisible({
      timeout: 8000
    });

    const result = await page.locator('.battle-board').evaluate(async (board) => {
      const viewport = board as HTMLElement;
      const cell = (board.querySelector('.grid button.reachable') ??
        board.querySelector('.grid button')) as HTMLButtonElement;
      // DOM-dispatched pointer events do not create a browser pointer, so stub
      // capture methods while exercising the component's event lifecycle.
      viewport.setPointerCapture = () => undefined;
      viewport.hasPointerCapture = () => false;
      const position = () => {
        const transform = new DOMMatrixReadOnly(
          getComputedStyle(board.querySelector('.board-content')!).transform
        );
        return { x: transform.m41, y: transform.m42 };
      };
      const emit = (target: Element, type: string, init: PointerEventInit) => {
        const event = new PointerEvent(type, { bubbles: true, ...init });
        if (init.isPrimary) Object.defineProperty(event, 'isPrimary', { value: true });
        target.dispatchEvent(event);
      };
      const render = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const base = { pointerId: 41, pointerType: 'touch', isPrimary: true, button: 0 };
      const probe = new PointerEvent('pointerdown', { bubbles: true, ...base });
      const eventProps = {
        pointerId: probe.pointerId,
        button: probe.button,
        isPrimary: probe.isPrimary,
        pointerType: probe.pointerType
      };
      const box = viewport.getBoundingClientRect();
      const start = { clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 };
      emit(cell, 'pointerdown', { ...base, ...start });
      const initial = position();
      emit(viewport, 'pointermove', {
        ...base,
        clientX: start.clientX - 2,
        clientY: start.clientY - 2
      });
      await render();
      const belowThreshold = position();
      emit(viewport, 'pointermove', {
        ...base,
        clientX: start.clientX - 24,
        clientY: start.clientY - 18
      });
      await render();
      const afterFirstMove = position();
      // This models the tile's implicit capture being replaced by viewport
      // capture. The bubbling event must not terminate the active gesture.
      emit(board.querySelector('.grid button')!, 'lostpointercapture', { ...base });
      // After capture transfer, the browser retargets subsequent movement to
      // the viewport that owns capture.
      emit(viewport, 'pointermove', {
        ...base,
        clientX: start.clientX - 72,
        clientY: start.clientY - 44
      });
      await render();
      const afterSecondMove = position();
      // Once the viewport itself loses capture, the gesture must terminate;
      // later moves for that pointer must not move the camera.
      emit(viewport, 'lostpointercapture', { ...base });
      emit(viewport, 'pointermove', {
        ...base,
        clientX: start.clientX - 104,
        clientY: start.clientY - 64
      });
      await render();
      const afterViewportLoss = position();
      emit(viewport, 'pointerup', {
        ...base,
        clientX: start.clientX - 72,
        clientY: start.clientY - 44
      });
      const beforeStats = document.querySelector('.stats')?.textContent;
      const beforeLog = document.querySelector('.log')?.textContent;
      emit(cell, 'click', {});
      return {
        initial,
        belowThreshold,
        afterFirstMove,
        afterSecondMove,
        afterViewportLoss,
        beforeStats,
        beforeLog,
        afterClickStats: document.querySelector('.stats')?.textContent,
        afterClickLog: document.querySelector('.log')?.textContent,
        eventProps
      };
    });

    expect(result.belowThreshold).toEqual(result.initial);
    expect(result.afterFirstMove, JSON.stringify(result)).not.toEqual(result.belowThreshold);
    expect(result.afterSecondMove.x).not.toBe(result.afterFirstMove.x);
    expect(result.afterSecondMove.y).not.toBe(result.afterFirstMove.y);
    expect(result.afterViewportLoss).toEqual(result.afterSecondMove);
    expect(result.afterClickStats).toBe(result.beforeStats);
    expect(result.afterClickLog).toBe(result.beforeLog);
  });
  test('wins through real movement and attack controls, then continues', async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (error) => pageErrors.push(error));
    await page.goto('/?battle-fixture-solo');
    await expect(page.getByRole('region', { name: 'Tactical battle' })).toBeVisible({
      timeout: 8000
    });
    const target = page.getByRole('gridcell', { name: '5, 4' });
    await expect(target).toHaveClass(/reachable/);
    await target.click();
    await expect(page.getByRole('button', { name: 'Attack' })).toBeEnabled({ timeout: 5000 });
    await page.getByRole('button', { name: 'Attack' }).click();
    await expect(page.getByRole('button', { name: 'Attack' })).toBeEnabled({ timeout: 5000 });
    await page.getByRole('button', { name: 'Attack' }).click();
    await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('region', { name: 'Tactical battle' })).toHaveCount(0);
    await expect(page.locator('canvas')).toHaveCount(1);
    const gameCanvas = page.getByTestId('game-canvas');
    await expect(gameCanvas).toBeVisible();
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    );
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
      await expect(page.getByRole('region', { name: 'Tactical battle' })).toBeVisible({
        timeout: 8000
      });
      await expect(page.getByRole('button', { name: 'End Turn' })).toBeEnabled({ timeout: 5000 });
      const targetCell = page.getByRole('gridcell', { name: '5, 4' });
      await expect(targetCell).toHaveClass(/reachable/);
      await targetCell.click();
      await expect(page.getByRole('button', { name: 'Attack' })).toBeEnabled({ timeout: 5000 });
      await page.getByRole('button', { name: 'Attack' }).click();
      await expect(page.getByRole('button', { name: 'End Turn' })).toBeEnabled({ timeout: 5000 });
      await page.getByRole('button', { name: 'End Turn' }).click();
      const attackable = page.locator('[role="gridcell"].attackable');
      await expect(attackable).toHaveCount(1, { timeout: 10000 });
      await expect(page.getByRole('button', { name: 'Attack' })).toBeEnabled({ timeout: 5000 });
      await page.getByRole('button', { name: 'Attack' }).click();
      await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(page.getByTestId('game-canvas')).toBeVisible();
    };
    await winEncounter();
    await expect(page.getByRole('region', { name: 'Tactical battle' })).toBeVisible({
      timeout: 3000
    });
    await winEncounter();
    await expect(page.getByRole('region', { name: 'Tactical battle' })).toBeVisible({
      timeout: 3000
    });
    await expect(page.locator('.battle-art canvas')).toHaveCount(1);
    await expect(page.locator('[data-testid="game-canvas"]')).toHaveCount(1);
    expect(pageErrors).toEqual([]);
  });
  test('survives repeated encounters in the generated world', async ({ page }) => {
    test.setTimeout(60000);
    const pageErrors: Error[] = [];
    page.on('pageerror', (error) => pageErrors.push(error));
    await page.goto('/?battle-stability', { waitUntil: 'domcontentloaded', timeout: 60000 });
    const canvas = page.getByTestId('game-canvas');
    const winEncounter = async (expectStart = true) => {
      if (expectStart)
        await expect(page.getByRole('region', { name: 'Tactical battle' })).toBeVisible({
          timeout: 10000
        });
      await expect(page.getByRole('button', { name: 'End Turn' })).toBeEnabled({ timeout: 5000 });
      const initialTarget = page.getByRole('gridcell', { name: '4, 4' });
      await expect(initialTarget).toHaveClass(/reachable/);
      await initialTarget.click();
      await expect(page.getByRole('button', { name: 'Attack' })).toBeEnabled({ timeout: 5000 });
      await page.getByRole('button', { name: 'Attack' }).click();
      await expect(page.getByRole('button', { name: 'Attack' })).toBeEnabled({ timeout: 5000 });
      await page.getByRole('button', { name: 'Attack' }).click();
      await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(canvas).toBeVisible();
      await expect(page.locator('canvas')).toHaveCount(1);
    };
    await winEncounter();
    await expect(page.getByRole('region', { name: 'Tactical battle' })).toHaveCount(0);
    await expect(canvas).toBeVisible();
    await page.evaluate(() =>
      (
        window as typeof globalThis & { __startBattleStabilityEncounter?: (index: number) => void }
      ).__startBattleStabilityEncounter?.(1)
    );
    await winEncounter(false);
    await expect(page.getByRole('region', { name: 'Tactical battle' })).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });
  test('loses through real turns and respawns at settlement', async ({ page }) => {
    test.setTimeout(60000);
    const pageErrors: Error[] = [];
    page.on('pageerror', (error) => pageErrors.push(error));
    await page.goto('/?battle-fixture-defeat');
    const battle = page.getByRole('region', { name: 'Tactical battle' });
    await expect(battle).toBeVisible({ timeout: 8000 });
    await expect(page.getByTestId('location-overlay')).toHaveCount(0);

    type BattleDecision = 'player-ready' | 'result-ready' | 'waiting';
    const observeDecision = async (): Promise<BattleDecision> =>
      battle.locator('button').evaluateAll((buttons) => {
        const isReady = (name: string) =>
          [...buttons].some(
            (button) =>
              button.textContent?.trim() === name &&
              !button.hasAttribute('disabled') &&
              (button as HTMLButtonElement).offsetParent !== null
          );
        if (isReady('Continue')) return 'result-ready';
        if (isReady('End Turn')) return 'player-ready';
        return 'waiting';
      });
    const waitForBattleDecision = async (): Promise<Exclude<BattleDecision, 'waiting'>> => {
      let observation: BattleDecision = 'waiting';
      await expect
        .poll(
          async () => {
            observation = await observeDecision();
            return observation !== 'waiting';
          },
          { timeout: 5000, intervals: [50, 100, 250] }
        )
        .toBe(true);
      expect(observation).toMatch(/player-ready|result-ready/);
      return observation as Exclude<BattleDecision, 'waiting'>;
    };

    let decision: Exclude<BattleDecision, 'waiting'> = 'player-ready';
    let turnsSubmitted = 0;
    for (; turnsSubmitted < 8; turnsSubmitted += 1) {
      decision = await waitForBattleDecision();
      if (decision === 'result-ready') break;
      await battle.getByRole('button', { name: 'End Turn', exact: true }).click();
    }
    if (decision !== 'result-ready') decision = await waitForBattleDecision();
    expect(decision).toBe('result-ready');
    await expect(page.getByRole('heading', { name: 'Defeat', exact: true })).toBeVisible();
    await expect(page.getByText(/Player HP 0\/12/)).toBeVisible();
    await expect(battle.getByRole('button', { name: 'End Turn', exact: true })).toHaveCount(0);
    const continueButton = battle.getByRole('button', { name: 'Continue', exact: true });
    await expect(continueButton).toBeEnabled();
    await continueButton.click();
    await expect(page.getByTestId('location-overlay')).toHaveText('Fixture Settlement · village');
    await expect(battle).toHaveCount(0);
    const canvas = page.getByTestId('game-canvas');
    await expect(canvas).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(1);
    const bounds = await canvas.boundingBox();
    expect(bounds?.width ?? 0).toBeGreaterThan(0);
    expect(bounds?.height ?? 0).toBeGreaterThan(0);
    expect(pageErrors).toEqual([]);
  });
  test('supports touch cell interaction and repeated cleanup', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.use.hasTouch, 'tap requires a touch project');
    await page.goto('/?battle-fixture');
    const cell = page.getByRole('gridcell', { name: '5, 4' });
    await expect(cell).toBeVisible({ timeout: 8000 });
    await cell.tap();
    await expect(page.getByRole('button', { name: 'Attack' })).toBeEnabled({ timeout: 5000 });
    await page.getByRole('button', { name: 'Attack' }).tap();
    await expect(page.getByRole('button', { name: 'Attack' })).toBeEnabled({ timeout: 5000 });
    await page.getByRole('button', { name: 'Attack' }).tap();
    await page.getByRole('button', { name: 'Continue' }).tap();
    await expect(page.getByRole('region', { name: 'Tactical battle' })).toBeVisible({
      timeout: 3000
    });
  });
});

test('mobile startup reaches the canvas without a reload', async ({ page }) => {
  test.setTimeout(30000);
  const started = Date.now();
  let navigations = 0;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations += 1;
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('game-canvas')).toBeVisible({ timeout: 8000 });
  await expect(page.getByTestId('player-status')).toHaveCount(0);
  expect(Date.now() - started).toBeLessThan(15000);
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
