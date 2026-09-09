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
  BATTLE_TILE_SIZE
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
  update: (state: BattleState) => void;
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
  let player: ReturnType<typeof createPlayerSprite> | undefined;
  let goblin: ReturnType<typeof createGoblinSprite> | undefined;
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
    host.querySelectorAll('canvas').forEach((canvas) => canvas.remove());
  };
  const draw = (state: BattleState) => {
    if (phase !== 'ready' || !player || !goblin) return;
    try {
      const cell = BATTLE_TILE_SIZE;
      stage.position.set(0, 0);
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
      app.init({ backgroundAlpha: 0, antialias: false, autoStart: false, resizeTo: host })
    )
    .then(() => {
      initialized = true;
      if (phase === 'disposed') {
        destroyInitializedApplication();
        return;
      }
      try {
        player = createPlayerSprite();
        goblin = createGoblinSprite();
        app.stage.addChild(stage);
        stage.addChild(player.view, goblin.view);
        host.appendChild(app.canvas);
        phase = 'ready';
        if (latestState) draw(latestState);
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
  const update = (state: BattleState) => {
    if (phase === 'disposed' || phase === 'failed') return;
    latestState = state;
    if (phase === 'ready') draw(state);
  };
  const destroy = () => {
    if (phase === 'disposed') return;
    phase = 'disposed';
    latestState = undefined;
    if (initialized) destroyInitializedApplication();
    host.querySelectorAll('canvas').forEach((canvas) => canvas.remove());
  };
  return { init, update, destroy };
}
