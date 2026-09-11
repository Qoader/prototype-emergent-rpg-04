import { applyBattleCommand } from './engine';
import { distance, search } from './grid';
import type { BattleCommand, BattleState } from './types';
export const chooseGoblinCommand = (state: BattleState): BattleCommand => {
  const actor = state.combatants[state.activeId]!;
  const foes = Object.values(state.combatants).filter((c) => c.hp > 0 && c.side !== actor.side).sort((a, b) => a.id.localeCompare(b.id));
  const adjacent = foes.find((foe) => distance(actor.position, foe.position) === 1);
  if (actor.ap > 0 && adjacent) return { kind: 'attack', actorId: actor.id, targetId: adjacent.id };
  if (actor.mp <= 0) return { kind: 'end-turn', actorId: actor.id };
  const cells = search(state, actor.id);
  let best: { point: { col: number; row: number }; distance: number; foe: string } | undefined;
  for (const foe of foes) for (const goal of [{ col: foe.position.col, row: foe.position.row - 1 }, { col: foe.position.col + 1, row: foe.position.row }, { col: foe.position.col, row: foe.position.row + 1 }, { col: foe.position.col - 1, row: foe.position.row }]) {
    const candidate = cells.get(`${goal.col},${goal.row}`);
    if (candidate && (!best || candidate.distance < best.distance || (candidate.distance === best.distance && (foe.id < best.foe || (foe.id === best.foe && (candidate.point.row < best.point.row || candidate.point.row === best.point.row && candidate.point.col < best.point.col)))))) best = { point: candidate.point, distance: candidate.distance, foe: foe.id };
  }
  if (best && best.distance > 0) { let current = cells.get(`${best.point.col},${best.point.row}`)!; const path = [best.point]; while (current.previous) { current = cells.get(current.previous)!; path.unshift(current.point); } return { kind: 'move', actorId: actor.id, destination: path[Math.min(actor.mp, path.length - 1)]! }; }
  return { kind: 'end-turn', actorId: actor.id };
};
export const runGoblinTurn = (state: BattleState): BattleState => {
  let current = state;
  while (!current.outcome && current.combatants[current.activeId]?.control === 'ai') {
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
