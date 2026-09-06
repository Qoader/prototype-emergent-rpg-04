import { BATTLE_GRID, createCombatant } from './rules';
import { distance, occupied, reachable } from './grid';
import type { BattleCommand, BattleEvent, BattleState, BattleTransition } from './types';
const clone = (state: BattleState): BattleState => ({ ...state, combatants: Object.fromEntries(Object.entries(state.combatants).map(([id, c]) => [id, { ...c, position: { ...c.position } }])), turnOrder: [...state.turnOrder], log: [...state.log] });
export const createBattle = (goblinId: string): BattleState => { const player = createCombatant('player', 'player', { col: 1, row: 3 }); const goblin = createCombatant(goblinId, 'goblin', { col: 5, row: 3 }); return { ...BATTLE_GRID, combatants: { player: player, [goblinId]: goblin }, turnOrder: ['player', goblinId], activeId: 'player', turn: 1, outcome: null, log: [{ kind: 'turn-start', actorId: 'player', turn: 1 }] }; };
export function applyBattleCommand(input: BattleState, command: BattleCommand): BattleTransition {
  if (input.outcome) return { state: input, error: 'Battle is finished', events: [] };
  if (command.actorId !== input.activeId) return { state: input, error: 'It is not that combatant’s turn', events: [] };
  const state = clone(input); const actor = state.combatants[command.actorId]; if (!actor) return { state: input, error: 'Unknown actor', events: [] }; const events: BattleEvent[] = [];
  if (command.kind === 'move') { const node = reachable(state, actor.id).get(`${command.destination.col},${command.destination.row}`); if (!node || node.distance === 0) return { state: input, error: 'Destination is unreachable', events: [] }; actor.position = { ...command.destination }; actor.mp -= node.distance; events.push({ kind: 'move', actorId: actor.id, from: { ...input.combatants[actor.id]!.position }, to: { ...actor.position }, cost: node.distance }); }
  else if (command.kind === 'attack') { const target = state.combatants[command.targetId]; if (!target || target.id === actor.id || target.hp <= 0 || actor.ap < 1 || distance(actor.position, target.position) !== 1) return { state: input, error: 'Target is not attackable', events: [] }; actor.ap -= 1; target.hp = Math.max(0, target.hp - actor.attack); events.push({ kind: 'attack', actorId: actor.id, targetId: target.id, damage: actor.attack, remainingHp: target.hp }); if (target.hp === 0) { state.outcome = target.side === 'goblin' ? 'victory' : 'defeat'; events.push({ kind: 'finished', outcome: state.outcome }); } }
  else { const nextIndex = (state.turnOrder.indexOf(actor.id) + 1) % state.turnOrder.length; state.activeId = state.turnOrder[nextIndex]!; state.turn += nextIndex === 0 ? 1 : 0; const next = state.combatants[state.activeId]!; next.ap = next.maxAp; next.mp = next.maxMp; events.push({ kind: 'turn-start', actorId: next.id, turn: state.turn }); }
  state.log = [...state.log, ...events].slice(-50); return { state, events };
}
export { occupied };
