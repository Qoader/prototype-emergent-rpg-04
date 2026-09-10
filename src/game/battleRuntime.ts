import { Application, Container, Graphics } from 'pixi.js';
import { createGoblinSprite, createPlayerSprite } from './playerSprite';
import type { PlayerSprite } from './playerSprite';
import { drawCapturedTileAppearance } from './tileIllustration';
import type { Tile } from './types';
import type { BattleState } from './battle/types';
import type { Facing } from './movement';
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
import type { BattleVisualPose } from './battleRendering';
import type { BattleCombatant } from './battle/types';

/** Rendering-only tactical view. It intentionally consumes snapshots, never rules. */
export type BattleRuntimeOptions = {
  onError?: (error: unknown) => void;
  onReady?: () => void;
  /** Internal seam for deterministic lifecycle tests. */
  applicationFactory?: () => Application;
  /** Internal seam for deterministic animation tests. */
  animationScheduler?: BattleAnimationScheduler;
};
export type BattleAnimationScheduler = {
  now: () => number;
  request: (callback: FrameRequestCallback) => number;
  cancel: (handle: number) => void;
};
export type BattleRuntime = {
  init: Promise<void>;
  update: (state: BattleState, overlay?: BattleOverlayState) => void;
  destroy: () => void;
};
type RuntimePhase = 'initializing' | 'ready' | 'failed' | 'disposed';
type CharacterAnimationState = {
  combatantId: string;
  animation: 'idle' | 'walk';
  facing: Facing;
  idleElapsedSeconds: number;
  lastSampleMs: number;
  displayedFrame: number;
};

const browserAnimationScheduler: BattleAnimationScheduler | undefined =
  typeof globalThis.requestAnimationFrame === 'function'
    ? {
        now: () => globalThis.performance.now(),
        request: (callback) => globalThis.requestAnimationFrame(callback),
        cancel: (handle) => globalThis.cancelAnimationFrame(handle)
      }
    : undefined;

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
  const animationScheduler = options.animationScheduler ?? browserAnimationScheduler;
  let animationHandle: number | undefined;
  let playerAnimation: CharacterAnimationState | undefined;
  let goblinAnimation: CharacterAnimationState | undefined;

  const stopAnimation = () => {
    if (animationHandle === undefined || !animationScheduler) return;
    animationScheduler.cancel(animationHandle);
    animationHandle = undefined;
  };

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
    stopAnimation();
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
    playerAnimation = undefined;
    goblinAnimation = undefined;
    const canvas = ownedCanvas;
    ownedCanvas = undefined;
    try {
      canvas?.remove();
    } catch (error) {
      reportError(error);
    }
  };
  const synchronizeCharacter = (
    sprite: PlayerSprite,
    combatant: BattleCombatant | undefined,
    pose: BattleVisualPose | undefined,
    resource: CharacterAnimationState | undefined,
    nowMs: number
  ): CharacterAnimationState | undefined => {
    if (!combatant || !pose || combatant.hp <= 0) {
      sprite.view.visible = false;
      return undefined;
    }
    const animation: CharacterAnimationState['animation'] = pose.moving ? 'walk' : 'idle';
    const changed =
      !resource ||
      resource.combatantId !== combatant.id ||
      resource.animation !== animation ||
      resource.facing !== pose.facing;
    const next = changed
      ? {
          combatantId: combatant.id,
          animation,
          facing: pose.facing,
          idleElapsedSeconds: 0,
          lastSampleMs: nowMs,
          displayedFrame: 0
        }
      : resource;
    sprite.view.visible = true;
    sprite.view.scale.set(BATTLE_SCALE);
    const foot = spriteFootPosition(pose);
    sprite.view.position.set(foot.x, foot.y);
    const frame = animationFrame(pose, next.idleElapsedSeconds);
    sprite.setFrame(animation, pose.facing, frame);
    next.displayedFrame = frame;
    return next;
  };
  const failPresentation = (error: unknown) => {
    if (phase === 'failed' || phase === 'disposed') return;
    phase = 'failed';
    stopAnimation();
    reportError(error);
    destroyInitializedApplication();
  };
  const advanceIdle = (
    sprite: PlayerSprite | undefined,
    resource: CharacterAnimationState | undefined,
    nowMs: number
  ) => {
    if (!sprite || !resource || resource.animation !== 'idle' || !sprite.view.visible) return false;
    const elapsed = Math.max(0, Math.min((nowMs - resource.lastSampleMs) / 1000, 0.1));
    resource.lastSampleMs = nowMs;
    resource.idleElapsedSeconds += elapsed;
    const frame = Math.floor(resource.idleElapsedSeconds * 2) % 2;
    if (frame === resource.displayedFrame) return false;
    sprite.setFrame('idle', resource.facing, frame);
    resource.displayedFrame = frame;
    return true;
  };
  const tickAnimation: FrameRequestCallback = () => {
    animationHandle = undefined;
    if (phase !== 'ready' || !latestState) return;
    try {
      const nowMs = animationScheduler!.now();
      const playerChanged = advanceIdle(player, playerAnimation, nowMs);
      const goblinChanged = advanceIdle(goblin, goblinAnimation, nowMs);
      const changed = playerChanged || goblinChanged;
      if (changed) app.render();
      ensureAnimation();
    } catch (error) {
      failPresentation(error);
    }
  };
  const ensureAnimation = () => {
    if (!animationScheduler || animationHandle !== undefined || phase !== 'ready' || !latestState)
      return;
    animationHandle = animationScheduler.request(tickAnimation);
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
      const drawCellBorder = (
        graphics: Graphics,
        point: { col: number; row: number },
        color: string,
        inset = 0
      ) => {
        const x = point.col * cell + inset;
        const y = point.row * cell + inset;
        const size = cell - inset * 2;
        const thickness = 2;
        graphics
          .rect(x, y, size, thickness)
          .rect(x, y + size - thickness, size, thickness)
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
      const focus = stage.children.find((child) => child.label === 'battle-focus') as
        Graphics | undefined;
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
      const nowMs = animationScheduler?.now() ?? 0;
      const actor = state.combatants.player;
      const enemy = Object.values(state.combatants).find(
        (combatant) => combatant.side === 'goblin'
      );
      playerAnimation = synchronizeCharacter(
        player,
        actor,
        actor ? combatantPose(state, actor) : undefined,
        playerAnimation,
        nowMs
      );
      goblinAnimation = synchronizeCharacter(
        goblin,
        enemy,
        enemy ? combatantPose(state, enemy) : undefined,
        goblinAnimation,
        nowMs
      );
      app.render();
      if (!readyNotified) {
        readyNotified = true;
        options.onReady?.();
      }
      ensureAnimation();
    } catch (error) {
      failPresentation(error);
    }
  };
  const init = Promise.resolve()
    .then(() =>
      app.init({
        backgroundAlpha: 0,
        antialias: false,
        autoStart: false,
        resolution: 1,
        resizeTo: host
      })
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
