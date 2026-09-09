import { distance } from './grid';
import type { BattleState } from './types';
export function canAttack(state: Pick<BattleState, 'combatants' | 'activeId' | 'outcome'>, actorId: string, targetId: string): boolean {
  const actor = state.combatants[actorId]; const target = state.combatants[targetId];
  return Boolean(!state.outcome && state.activeId === actorId && actor && target && actor.hp > 0 && target.hp > 0 && actor.ap >= 1 && actor.side !== target.side && distance(actor.position, target.position) === 1);
}
