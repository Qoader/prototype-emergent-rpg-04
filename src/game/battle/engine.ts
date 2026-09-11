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
    phase: 'acting',
    log: [{ kind: 'turn-start', actorId: 'player', turn: 1 }],
    scene
  };
};
/** Shared turn advancement used by explicit and automatic end-turns. */
export function advanceTurn(state: BattleState, events: BattleEvent[]): void {
  let index = state.turnOrder.indexOf(state.activeId);
  for (let tries = 0; tries < state.turnOrder.length; tries += 1) {
    index = (index + 1) % state.turnOrder.length;
    if (index === 0) state.turn += 1;
    const next = state.combatants[state.turnOrder[index]!];
    if (!next || next.hp <= 0 || next.eligibleFromRound > state.turn) continue;
    state.activeId = next.id;
    next.ap = next.maxAp;
    next.mp = next.maxMp;
    state.phase = 'acting';
    events.push({ kind: 'turn-start', actorId: next.id, turn: state.turn });
    return;
  }
}
export function applyBattleCommand(input: BattleState, command: BattleCommand, options: { deferTurn?: boolean } = {}): BattleTransition {
  if (input.outcome || input.phase === 'between-turns') return { state: input, error: 'Battle is not accepting commands', events: [] };
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
      state.outcome = target.id === 'player' ? 'defeat' : Object.values(state.combatants).filter((c) => c.side === 'goblin').every((c) => c.hp === 0) ? 'victory' : null;
      if (state.outcome) {
        state.phase = 'finished';
        events.push({ kind: 'turn-ended', actorId: actor.id, turn: state.turn, reason: 'battle-finished' });
      }
      if (state.outcome) events.push({ kind: 'finished', outcome: state.outcome });
    }
  } else {
    state.phase = 'between-turns';
    events.push({ kind: 'turn-ended', actorId: actor.id, turn: state.turn, reason: 'manual' });
  }
  if (command.kind !== 'end-turn' && !state.outcome && actor.ap === 0 && actor.mp === 0) {
    state.phase = 'between-turns';
    events.push({ kind: 'turn-ended', actorId: actor.id, turn: state.turn, reason: 'exhausted' });
  }
  // Keep the pure engine convenient for standalone consumers and legacy
  // tests. The world controller opts into the explicit boundary so it can
  // advance world time before selecting the next actor.
  if (state.phase === 'between-turns' && !options.deferTurn) advanceTurn(state, events);
  state.log = [...state.log, ...events].slice(-50);
  return { state, events };
}
export { occupied };
