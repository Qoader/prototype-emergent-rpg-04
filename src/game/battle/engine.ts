import { BATTLE_GRID, createCombatant } from './rules';
import { occupied, reachable } from './grid';
import type { BattleCommand, BattleEvent, BattleState, BattleTransition } from './types';
import { canAttack } from './legality';
const clone = (state: BattleState): BattleState => ({
  ...state,
  combatants: Object.fromEntries(
    Object.entries(state.combatants).map(([id, c]) => [id, { ...c, position: { ...c.position } }])
  ),
  turnOrder: [...state.turnOrder],
  log: [...state.log]
});
export const createBattle = (goblinId: string, scene?: BattleState['scene']): BattleState => {
  const player = createCombatant('player', 'player', { col: 2, row: 4 });
  const goblin = createCombatant(goblinId, 'goblin', { col: 6, row: 4 });
  return {
    ...BATTLE_GRID,
    combatants: { player: player, [goblinId]: goblin },
    turnOrder: ['player', goblinId],
    activeId: 'player',
    turn: 1,
    outcome: null,
    log: [{ kind: 'turn-start', actorId: 'player', turn: 1 }],
    scene
  };
};
/** Shared turn advancement used by explicit and automatic end-turns. */
export function advanceTurn(state: BattleState, events: BattleEvent[]): void {
  const nextIndex = (state.turnOrder.indexOf(state.activeId) + 1) % state.turnOrder.length;
  state.activeId = state.turnOrder[nextIndex]!;
  state.turn += nextIndex === 0 ? 1 : 0;
  const next = state.combatants[state.activeId]!;
  next.ap = next.maxAp;
  next.mp = next.maxMp;
  events.push({ kind: 'turn-start', actorId: next.id, turn: state.turn });
}
export function applyBattleCommand(input: BattleState, command: BattleCommand): BattleTransition {
  if (input.outcome) return { state: input, error: 'Battle is finished', events: [] };
  if (command.actorId !== input.activeId)
    return { state: input, error: 'It is not that combatant’s turn', events: [] };
  const state = clone(input);
  const actor = state.combatants[command.actorId];
  if (!actor) return { state: input, error: 'Unknown actor', events: [] };
  const events: BattleEvent[] = [];
  if (command.kind === 'move') {
    const cells = reachable(state, actor.id);
    const node = cells.get(`${command.destination.col},${command.destination.row}`);
    if (!node || node.distance === 0)
      return { state: input, error: 'Destination is unreachable', events: [] };
    const path = [node.point];
    let cursor = node;
    while (cursor.previous) {
      cursor = cells.get(cursor.previous)!;
      path.unshift(cursor.point);
    }
    actor.position = { ...command.destination };
    actor.mp -= node.distance;
    events.push({
      kind: 'move',
      actorId: actor.id,
      from: { ...input.combatants[actor.id]!.position },
      to: { ...actor.position },
      cost: node.distance,
      path
    });
  } else if (command.kind === 'attack') {
    const target = state.combatants[command.targetId];
    if (!canAttack(state, actor.id, command.targetId))
      return { state: input, error: 'Target is not attackable', events: [] };
    actor.ap -= 1;
    target.hp = Math.max(0, target.hp - actor.attack);
    events.push({
      kind: 'attack',
      actorId: actor.id,
      targetId: target.id,
      damage: actor.attack,
      remainingHp: target.hp
    });
    if (target.hp === 0) {
      state.outcome = target.side === 'goblin' ? 'victory' : 'defeat';
      events.push({ kind: 'finished', outcome: state.outcome });
    }
  } else advanceTurn(state, events);
  if (command.kind !== 'end-turn' && !state.outcome && actor.ap === 0 && actor.mp === 0)
    advanceTurn(state, events);
  state.log = [...state.log, ...events].slice(-50);
  return { state, events };
}
export { occupied };
