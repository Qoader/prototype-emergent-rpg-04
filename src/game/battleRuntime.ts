import { Application, Container, Graphics } from 'pixi.js';
import { createGoblinSprite, createPlayerSprite } from './playerSprite';
import { drawCapturedTileAppearance } from './tileIllustration';
import type { Tile } from './types';
import type { BattleState } from './battle/types';
import {
  animationFrame,
  combatantPose,
  spriteFootPosition,
  BATTLE_SCALE,
  BATTLE_TILE_SIZE,
  BATTLE_RENDER_PADDING,
  battleSurfacePixelSize,
  EMPTY_BATTLE_OVERLAY,
  type BattleOverlayState
} from './battleRendering';

/** Rendering-only tactical view. It intentionally consumes snapshots, never rules. */
export type BattleRuntimeOptions = {
  onError?: (error: unknown) => void;
  onReady?: () => void;
  /** Internal seam for deterministic lifecycle tests. */
  applicationFactory?: () => Application;
};
export type BattleRuntime = {
  init: Promise<void>;
  update: (state: BattleState, overlay?: BattleOverlayState) => void;
  destroy: () => void;
};
type RuntimePhase = 'initializing' | 'ready' | 'failed' | 'disposed';

/** Owns a Pixi application whose initialization is asynchronous. */
export function createBattleRuntime(
  host: HTMLElement,
  options: BattleRuntimeOptions = {}
): BattleRuntime {
  const app = (options.applicationFactory ?? (() => new Application()))();
  const stage = new Container();
  let phase: RuntimePhase = 'initializing';
  let initialized = false;
  let destroyed = false;
  let errorReported = false;
  let latestState: BattleState | undefined;
  let latestOverlay: BattleOverlayState = EMPTY_BATTLE_OVERLAY;
  let player: ReturnType<typeof createPlayerSprite> | undefined;
  let goblin: ReturnType<typeof createGoblinSprite> | undefined;
  let ownedCanvas: HTMLCanvasElement | undefined;
  let readyNotified = false;

  const reportError = (error: unknown) => {
    if (errorReported) return;
    errorReported = true;
    try {
      options.onError?.(error);
    } catch {
      /* diagnostics must not break lifecycle cleanup */
    }
  };
  const destroyInitializedApplication = () => {
    if (!initialized || destroyed) return;
    destroyed = true;
    // The map application remains alive while a battle is mounted/unmounted.
    // Releasing Pixi's process-wide batches here invalidates the map renderer.
    try {
      app.destroy({ removeView: true, releaseGlobalResources: false }, { children: true });
    } catch (error) {
      reportError(error);
    }
    player = undefined;
    goblin = undefined;
    const canvas = ownedCanvas;
    ownedCanvas = undefined;
    try {
      canvas?.remove();
    } catch (error) {
      reportError(error);
    }
  };
  const draw = (state: BattleState, overlay: BattleOverlayState = EMPTY_BATTLE_OVERLAY) => {
    if (phase !== 'ready' || !player || !goblin) return;
    try {
      const cell = BATTLE_TILE_SIZE;
      // Board-local drawing stays independent of its protective surface margin.
      stage.position.set(BATTLE_RENDER_PADDING, BATTLE_RENDER_PADDING);
      const surface = battleSurfacePixelSize(state);
      app.renderer.resize(surface.width, surface.height);
      const drawGrid = (graphics: Graphics) => {
        graphics
          .clear()
          .rect(0, 0, cell * state.width, cell * state.height)
          .fill({ color: '#000000', alpha: 0 });
        const captured = state.scene?.appearance.tile as Tile | undefined;
        if (!captured) {
          graphics.rect(0, 0, cell * state.width, cell * state.height).fill({ color: '#263b45' });
          return;
        }
        const appearance = state.scene!.appearance;
        for (let row = 0; row < state.height; row++)
          for (let col = 0; col < state.width; col++)
            drawCapturedTileAppearance(graphics, appearance, { col, row });
      };
      const background = stage.children.find((child) => child.label === 'battle-grid') as
        Graphics | undefined;
      if (!background) {
        const grid = new Graphics();
        grid.label = 'battle-grid';
        drawGrid(grid);
        stage.addChildAt(grid, 0);
      } else drawGrid(background);
      const gridLines = stage.children.find((child) => child.label === 'battle-grid-lines') as
        Graphics | undefined;
      const drawGridLines = (graphics: Graphics) => {
        graphics.clear();
        const width = cell * state.width;
        const height = cell * state.height;
        for (let col = 1; col < state.width; col++) graphics.rect(col * cell, 0, 1, height);
        for (let row = 1; row < state.height; row++) graphics.rect(0, row * cell, width, 1);
        graphics.fill({ color: '#536b58', alpha: 1 });
      };
      if (!gridLines) {
        const lines = new Graphics();
        lines.label = 'battle-grid-lines';
        drawGridLines(lines);
        stage.addChildAt(lines, 1);
      } else drawGridLines(gridLines);
      const targets = stage.children.find((child) => child.label === 'battle-targets') as
        Graphics | undefined;
      const drawCellBorder = (graphics: Graphics, point: { col: number; row: number }, color: string, inset = 0) => {
        const x = point.col * cell + inset;
        const y = point.row * cell + inset;
        const size = cell - inset * 2;
        const thickness = 2;
        graphics.rect(x, y, size, thickness).rect(x, y + size - thickness, size, thickness)
          .rect(x, y + thickness, thickness, size - thickness * 2)
          .rect(x + size - thickness, y + thickness, thickness, size - thickness * 2)
          .fill({ color, alpha: 1 });
      };
      const drawTargets = (graphics: Graphics) => {
        graphics.clear();
        for (const point of overlay.movementTargets) drawCellBorder(graphics, point, '#57b86b');
        // Red is last so it remains meaningful if a future ruleset permits overlap.
        for (const point of overlay.attackTargets) drawCellBorder(graphics, point, '#e36559');
      };
      if (!targets) {
        const targetLayer = new Graphics();
        targetLayer.label = 'battle-targets';
        drawTargets(targetLayer);
        stage.addChildAt(targetLayer, 2);
      } else drawTargets(targets);
      const focus = stage.children.find((child) => child.label === 'battle-focus') as Graphics | undefined;
      const drawFocus = (graphics: Graphics) => {
        graphics.clear();
        if (overlay.keyboardFocus) drawCellBorder(graphics, overlay.keyboardFocus, '#ffffff', 4);
      };
      if (!focus) {
        const focusLayer = new Graphics();
        focusLayer.label = 'battle-focus';
        drawFocus(focusLayer);
        stage.addChildAt(focusLayer, 3);
      } else drawFocus(focus);
      const border = stage.children.find((child) => child.label === 'battle-border') as
        Graphics | undefined;
      const drawBorder = (graphics: Graphics) => {
        const width = cell * state.width;
        const height = cell * state.height;
        graphics
          .clear()
          .rect(0, 0, width, 2)
          .rect(0, height - 2, width, 2)
          .rect(0, 0, 2, height)
          .rect(width - 2, 0, 2, height)
          .fill({ color: '#d4b56a' });
      };
      if (!border) {
        const outline = new Graphics();
        outline.label = 'battle-border';
        drawBorder(outline);
        // Characters already exist in the stage; keep the border below them.
        stage.addChildAt(outline, 4);
      } else drawBorder(border);
      const actor = state.combatants.player;
      const enemy = Object.values(state.combatants).find(
        (combatant) => combatant.side === 'goblin'
      );
      if (actor) {
        const actorPose = combatantPose(state, actor);
        player.view.visible = actor.hp > 0;
        player.view.scale.set(BATTLE_SCALE);
        const foot = spriteFootPosition(actorPose);
        player.view.position.set(foot.x, foot.y);
        player.setFrame(
          actorPose.moving ? 'walk' : 'idle',
          actorPose.facing,
          animationFrame(actorPose)
        );
      } else player.view.visible = false;
      if (enemy) {
        const goblinPose = combatantPose(state, enemy);
        goblin.view.visible = enemy.hp > 0;
        goblin.view.scale.set(BATTLE_SCALE);
        const foot = spriteFootPosition(goblinPose);
        goblin.view.position.set(foot.x, foot.y);
        goblin.setFrame(
          goblinPose.moving ? 'walk' : 'idle',
          goblinPose.facing,
          animationFrame(goblinPose)
        );
      } else goblin.view.visible = false;
      app.render();
      if (!readyNotified) {
        readyNotified = true;
        options.onReady?.();
      }
    } catch (error) {
      phase = 'failed';
      reportError(error);
      destroyInitializedApplication();
    }
  };
  const init = Promise.resolve()
    .then(() =>
      app.init({ backgroundAlpha: 0, antialias: false, autoStart: false, resolution: 1, resizeTo: host })
    )
    .then(() => {
      initialized = true;
      try {
        // Save the view before destruction can clear the renderer. Cleanup
        // must only remove the canvas created by this runtime, since the host
        // may contain another renderer at the same time.
        ownedCanvas = app.canvas;
        if (phase === 'disposed') {
          destroyInitializedApplication();
          return;
        }
        player = createPlayerSprite();
        goblin = createGoblinSprite();
        app.stage.addChild(stage);
        stage.addChild(player.view, goblin.view);
        host.appendChild(app.canvas);
        phase = 'ready';
        if (latestState) draw(latestState, latestOverlay);
      } catch (error) {
        phase = 'failed';
        reportError(error);
        destroyInitializedApplication();
      }
    })
    .catch((error: unknown) => {
      // A component that has already unmounted no longer has a user-visible
      // battle-art surface. The rejection is still observed, but must not
      // produce a late error update against a replacement component.
      if (phase === 'disposed') return;
      phase = 'failed';
      reportError(error);
    });
  const update = (state: BattleState, overlay: BattleOverlayState = EMPTY_BATTLE_OVERLAY) => {
    if (phase === 'disposed' || phase === 'failed') return;
    latestState = state;
    latestOverlay = overlay;
    if (phase === 'ready') draw(state, overlay);
  };
  const destroy = () => {
    if (phase === 'disposed') return;
    phase = 'disposed';
    latestState = undefined;
    latestOverlay = EMPTY_BATTLE_OVERLAY;
    if (initialized) destroyInitializedApplication();
  };
  return { init, update, destroy };
}
