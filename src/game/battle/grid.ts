import type { Point } from '../types';
import type { BattleState } from './types';
const same = (a: Point, b: Point) => a.col === b.col && a.row === b.row;
const key = (p: Point) => `${p.col},${p.row}`;
const neighbors = (p: Point): Point[] => [{ col: p.col, row: p.row - 1 }, { col: p.col + 1, row: p.row }, { col: p.col, row: p.row + 1 }, { col: p.col - 1, row: p.row }];
export const inBounds = (state: Pick<BattleState, 'width' | 'height'>, p: Point) => p.col >= 0 && p.row >= 0 && p.col < state.width && p.row < state.height;
export const occupied = (state: BattleState, p: Point, ignoreId?: string) => Object.values(state.combatants).some((c) => c.id !== ignoreId && c.hp > 0 && same(c.position, p));
export function reachable(state: BattleState, actorId: string): Map<string, { point: Point; distance: number; previous?: string }> {
  const actor = state.combatants[actorId]; const result = new Map<string, { point: Point; distance: number; previous?: string }>();
  if (!actor) return result;
  const start = key(actor.position); result.set(start, { point: { ...actor.position }, distance: 0 }); const queue = [actor.position];
  while (queue.length) { const current = queue.shift()!; const currentNode = result.get(key(current))!; if (currentNode.distance >= actor.mp) continue;
    for (const next of neighbors(current)) { const k = key(next); if (!inBounds(state, next) || occupied(state, next, actorId) || result.has(k)) continue; result.set(k, { point: next, distance: currentNode.distance + 1, previous: key(current) }); queue.push(next); }
  }
  return result;
}
/** Unbounded BFS used by tactical AI planning. */
export function search(state: BattleState, actorId: string) {
  const actor = state.combatants[actorId];
  const result = new Map<string, { point: Point; distance: number; previous?: string }>();
  if (!actor) return result;
  const start = key(actor.position); result.set(start, { point: { ...actor.position }, distance: 0 });
  const queue: Point[] = [actor.position]; let head = 0;
  while (head < queue.length) {
    const current = queue[head++]!; const node = result.get(key(current))!;
    for (const next of neighbors(current)) {
      const k = key(next); if (!inBounds(state, next) || occupied(state, next, actorId) || result.has(k)) continue;
      result.set(k, { point: { ...next }, distance: node.distance + 1, previous: key(current) }); queue.push(next);
    }
  }
  return result;
}
export const distance = (a: Point, b: Point) => Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
