import type { Point, TileReader } from './types';

export type RouteField = { frontier: Point[]; cursor: number; distances: Map<string, number>; next: Map<string, Point>; done: boolean };
export const routeKey = (point: Point) => `${point.col},${point.row}`;
export const createRouteField = (goal: Point): RouteField => ({ frontier: [{ ...goal }], cursor: 0, distances: new Map([[routeKey(goal), 0]]), next: new Map(), done: false });
/** Expands a reverse cardinal BFS no farther than maxDistance. */
export function advanceRouteField(field: RouteField, tiles: TileReader, budget: number, maxDistance = 64): number {
  const dirs = [{ col: 0, row: -1 }, { col: 1, row: 0 }, { col: 0, row: 1 }, { col: -1, row: 0 }];
  let used = 0;
  while (used < budget && field.cursor < field.frontier.length) {
    const current = field.frontier[field.cursor++]!; const distance = field.distances.get(routeKey(current))!; used++;
    if (distance >= maxDistance) continue;
    for (const dir of dirs) { const next = { col: current.col + dir.col, row: current.row + dir.row }; const key = routeKey(next); if (field.distances.has(key) || !tiles.getTile(next)?.walkable) continue; field.distances.set(key, distance + 1); field.next.set(key, current); field.frontier.push(next); }
  }
  if (field.cursor >= field.frontier.length) field.done = true;
  return used;
}
