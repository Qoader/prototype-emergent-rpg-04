import { applyBattleCommand } from './engine';
import { distance, reachable } from './grid';
import type { BattleCommand, BattleState } from './types';
export const chooseGoblinCommand = (state: BattleState): BattleCommand => { const goblin = state.combatants[state.activeId]!; const player = Object.values(state.combatants).find((c) => c.side === 'player')!; if (goblin.ap > 0 && distance(goblin.position, player.position) === 1) return { kind: 'attack', actorId: goblin.id, targetId: player.id }; const cells = reachable(state, goblin.id); const goals = [{ col: player.position.col, row: player.position.row - 1 }, { col: player.position.col + 1, row: player.position.row }, { col: player.position.col, row: player.position.row + 1 }, { col: player.position.col - 1, row: player.position.row }]; let best: { point: { col: number; row: number }; distance: number } | undefined; for (const goal of goals) { const candidate = cells.get(`${goal.col},${goal.row}`); if (candidate && (!best || candidate.distance < best.distance)) best = { point: candidate.point, distance: candidate.distance }; } if (best && best.distance > 0) return { kind: 'move', actorId: goblin.id, destination: best.point }; return { kind: 'end-turn', actorId: goblin.id }; };
export const runGoblinTurn = (state: BattleState): BattleState => {
  let current = state;
  while (!current.outcome && current.activeId !== 'player') {
    const command = chooseGoblinCommand(current);
    const transition = applyBattleCommand(current, command);
    if ('error' in transition) return current;
    current = transition.state;
    // An attack consumes the goblin's sole AP. Finish immediately so it
    // cannot use leftover movement after striking.
    if (command.kind === 'attack' && !current.outcome)
      current = applyBattleCommand(current, { kind: 'end-turn', actorId: command.actorId }).state;
  }
  return current;
};
