import type { Point } from '../types';
import { createCombatant } from './rules';
import type { BattleCombatant, BattleEvent, BattleState } from './types';

export type BattleArrival = { id: string; kind: 'player' | 'adventurer' | 'goblin'; approachEdge: 'north' | 'east' | 'south' | 'west'; arrivalStep: number };
const key = (p: Point) => `${p.col},${p.row}`;
const edges = (state: BattleState, edge: BattleArrival['approachEdge']) => {
  const middle = (n: number) => Math.floor((n - 1) / 2);
  const raw: Point[] = edge === 'north' || edge === 'south'
    ? Array.from({ length: state.width }, (_, col) => ({ col, row: edge === 'north' ? 0 : state.height - 1 }))
    : Array.from({ length: state.height }, (_, row) => ({ col: edge === 'west' ? 0 : state.width - 1, row }));
  return raw.sort((a, b) => Math.abs((edge === 'north' || edge === 'south' ? a.col : a.row) - middle(raw.length)) - Math.abs((edge === 'north' || edge === 'south' ? b.col : b.row) - middle(raw.length)) || a.row - b.row || a.col - b.col);
};
const clockwise: Record<BattleArrival['approachEdge'], BattleArrival['approachEdge'][]> = { north: ['north', 'east', 'south', 'west'], east: ['east', 'south', 'west', 'north'], south: ['south', 'west', 'north', 'east'], west: ['west', 'north', 'east', 'south'] };
/** Mutates a cloned battle at the turn boundary; returns arrivals that could not fit. */
export function admitReinforcements(state: BattleState, arrivals: readonly BattleArrival[], events: BattleEvent[]): BattleArrival[] {
  const pending: BattleArrival[] = [];
  for (const arrival of [...arrivals].sort((a, b) => a.arrivalStep - b.arrivalStep || a.id.localeCompare(b.id))) {
    const occupied = new Set(Object.values(state.combatants).filter((c) => c.hp > 0).map((c) => key(c.position)));
    let position: Point | undefined;
    for (const edge of clockwise[arrival.approachEdge]) { position = edges(state, edge).find((p) => !occupied.has(key(p))); if (position) break; }
    if (!position) { pending.push(arrival); continue; }
    const side = arrival.kind === 'goblin' ? 'goblin' : 'player';
    const c: BattleCombatant = createCombatant(arrival.id, side, position, arrival.kind);
    c.eligibleFromRound = state.turn + 1;
    state.combatants[c.id] = c;
    state.turnOrder.push(c.id);
    events.push({ kind: 'combatant-joined', actorId: c.id, position: { ...position }, eligibleFromRound: c.eligibleFromRound });
  }
  return pending;
}
