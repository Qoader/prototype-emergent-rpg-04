import { Application, Container, Graphics } from 'pixi.js';
import { createGoblinSprite, createPlayerSprite } from './playerSprite';
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
    try { app.destroy(true, { children: true }); } catch (error) { reportError(error); }
    player = undefined;
    goblin = undefined;
  };
  const draw = (state: BattleState) => {
    if (phase !== 'ready' || !player || !goblin) return;
    try {
      const cell = Math.min(host.clientWidth / state.width, host.clientHeight / state.height);
      stage.position.set((host.clientWidth - cell * state.width) / 2, (host.clientHeight - cell * state.height) / 2);
      const drawGrid = (graphics: Graphics) => { graphics.clear().rect(0, 0, cell * state.width, cell * state.height).fill({ color: '#000000', alpha: 0 }); };
      const background = stage.children.find((child) => child.label === 'battle-grid') as Graphics | undefined;
      if (!background) { const grid = new Graphics(); grid.label = 'battle-grid'; drawGrid(grid); stage.addChildAt(grid, 0); } else drawGrid(background);
      const actor = state.combatants.player;
      const enemy = Object.values(state.combatants).find((combatant) => combatant.side === 'goblin');
      if (actor) { player.view.position.set((actor.position.col + 0.5) * cell, (actor.position.row + 1) * cell); player.setFrame('idle', 'south' as Facing, 0); }
      if (enemy) { goblin.view.position.set((enemy.position.col + 0.5) * cell, (enemy.position.row + 1) * cell); goblin.setFrame('idle', 'south' as Facing, 0); }
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
