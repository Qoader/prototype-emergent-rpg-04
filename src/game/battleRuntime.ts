import { Application, Container, Graphics } from 'pixi.js';
import { createGoblinSprite, createPlayerSprite } from './playerSprite';
import { drawCapturedTileAppearance } from './tileIllustration';
import type { Tile } from './types';
import type { BattleState } from './battle/types';
import type { Facing } from './movement';

/** Rendering-only tactical view. It intentionally consumes snapshots, never rules. */
export type BattleRuntimeOptions = {
  onError?: (error: unknown) => void;
  /** Internal seam for deterministic lifecycle tests. */
  applicationFactory?: () => Application;
};
export type BattleRuntime = { init: Promise<void>; update: (state: BattleState) => void; destroy: () => void };
type RuntimePhase = 'initializing' | 'ready' | 'failed' | 'disposed';

/** Owns a Pixi application whose initialization is asynchronous. */
export function createBattleRuntime(host: HTMLElement, options: BattleRuntimeOptions = {}): BattleRuntime {
  const app = (options.applicationFactory ?? (() => new Application()))();
  const stage = new Container();
  let phase: RuntimePhase = 'initializing';
  let initialized = false;
  let destroyed = false;
  let errorReported = false;
  let latestState: BattleState | undefined;
  let player: ReturnType<typeof createPlayerSprite> | undefined;
  let goblin: ReturnType<typeof createGoblinSprite> | undefined;

  const reportError = (error: unknown) => {
    if (errorReported) return;
    errorReported = true;
    try { options.onError?.(error); } catch { /* diagnostics must not break lifecycle cleanup */ }
  };
  const destroyInitializedApplication = () => {
    if (!initialized || destroyed) return;
    destroyed = true;
    // The map application remains alive while a battle is mounted/unmounted.
    // Releasing Pixi's process-wide batches here invalidates the map renderer.
    try { app.destroy({ removeView: true, releaseGlobalResources: false }, { children: true }); } catch (error) { reportError(error); }
    player = undefined;
    goblin = undefined;
  };
  const draw = (state: BattleState) => {
    if (phase !== 'ready' || !player || !goblin) return;
    try {
      const cell = 48;
      stage.position.set(0, 0);
      const drawGrid = (graphics: Graphics) => {
        graphics.clear().rect(0, 0, cell * state.width, cell * state.height).fill({ color: '#000000', alpha: 0 });
        const captured = state.scene?.appearance.tile as Tile | undefined;
        if (!captured) { graphics.rect(0, 0, cell * state.width, cell * state.height).fill({ color: '#263b45' }); return; }
        const appearance = state.scene!.appearance;
        for (let row = 0; row < state.height; row++) for (let col = 0; col < state.width; col++) drawCapturedTileAppearance(graphics, appearance, { col, row });
      };
      const background = stage.children.find((child) => child.label === 'battle-grid') as Graphics | undefined;
      if (!background) { const grid = new Graphics(); grid.label = 'battle-grid'; drawGrid(grid); stage.addChildAt(grid, 0); } else drawGrid(background);
      const actor = state.combatants.player;
      const enemy = Object.values(state.combatants).find((combatant) => combatant.side === 'goblin');
      const pose = state.visual?.player;
      const enemyPose = enemy ? state.visual?.[enemy.id] : undefined;
      if (actor) { player.view.position.set(((pose?.x ?? actor.position.col + 0.5) * cell), ((pose?.y ?? actor.position.row + 0.5) * cell)); player.setFrame(pose?.moving ? 'walk' : 'idle', (pose?.facing ?? 'south') as Facing, pose?.moving ? Math.floor((pose?.elapsed ?? 0) * 10) % 4 : 0); }
      if (enemy) { goblin.view.position.set(((enemyPose?.x ?? enemy.position.col + 0.5) * cell), ((enemyPose?.y ?? enemy.position.row + 0.5) * cell)); goblin.setFrame(enemyPose?.moving ? 'walk' : 'idle', (enemyPose?.facing ?? 'south') as Facing, enemyPose?.moving ? Math.floor((enemyPose?.elapsed ?? 0) * 10) % 4 : 0); }
      app.render();
    } catch (error) {
      phase = 'failed'; reportError(error); destroyInitializedApplication();
    }
  };
  const init = Promise.resolve().then(() => app.init({ backgroundAlpha: 0, antialias: false, autoStart: false, resizeTo: host })).then(() => {
    initialized = true;
    if (phase === 'disposed') { destroyInitializedApplication(); return; }
    try {
      player = createPlayerSprite(); goblin = createGoblinSprite();
      app.stage.addChild(stage); stage.addChild(player.view, goblin.view); host.appendChild(app.canvas); phase = 'ready';
      if (latestState) draw(latestState);
    } catch (error) { phase = 'failed'; reportError(error); destroyInitializedApplication(); }
  }).catch((error: unknown) => {
    // A component that has already unmounted no longer has a user-visible
    // battle-art surface. The rejection is still observed, but must not
    // produce a late error update against a replacement component.
    if (phase === 'disposed') return;
    phase = 'failed';
    reportError(error);
  });
  const update = (state: BattleState) => { if (phase === 'disposed' || phase === 'failed') return; latestState = state; if (phase === 'ready') draw(state); };
  const destroy = () => { if (phase === 'disposed') return; phase = 'disposed'; latestState = undefined; if (initialized) destroyInitializedApplication(); };
  return { init, update, destroy };
}
