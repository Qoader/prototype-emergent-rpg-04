import { Application, Container, Graphics } from 'pixi.js';
import { createGoblinSprite, createPlayerSprite } from './playerSprite';
import type { BattleState } from './battle/types';
import type { Facing } from './movement';

/** Rendering-only tactical view. It intentionally consumes snapshots, never rules. */
export function createBattleRuntime(host: HTMLElement) {
  const app = new Application(); const stage = new Container(); const player = createPlayerSprite(); const goblin = createGoblinSprite();
  let disposed = false; let ready = false;
  const init = app.init({ backgroundAlpha: 0, antialias: false, resizeTo: host }).then(() => { if (disposed) { app.destroy(true, { children: true }); return; } ready = true; host.appendChild(app.canvas); app.stage.addChild(stage); stage.addChild(player.view, goblin.view); });
  const update = (state: BattleState) => { if (!ready) return; const cell = Math.min(host.clientWidth / state.width, host.clientHeight / state.height); stage.position.set((host.clientWidth - cell * state.width) / 2, (host.clientHeight - cell * state.height) / 2); const draw = (g: Graphics) => { g.clear().rect(0, 0, cell * state.width, cell * state.height).fill({ color: '#000000', alpha: 0 }); }; const background = stage.children.find((child) => child.label === 'battle-grid') as Graphics | undefined; if (!background) { const grid = new Graphics(); grid.label = 'battle-grid'; draw(grid); stage.addChildAt(grid, 0); } else draw(background); const p = state.combatants.player; const enemy = Object.values(state.combatants).find((c) => c.side === 'goblin'); if (p) { player.view.position.set((p.position.col + .5) * cell, (p.position.row + 1) * cell); player.setFrame('idle', 'south' as Facing, 0); } if (enemy) { goblin.view.position.set((enemy.position.col + .5) * cell, (enemy.position.row + 1) * cell); goblin.setFrame('idle', 'south' as Facing, 0); } };
  const destroy = () => { if (disposed) return; disposed = true; app.destroy(true, { children: true }); };
  return { init, update, destroy };
}
