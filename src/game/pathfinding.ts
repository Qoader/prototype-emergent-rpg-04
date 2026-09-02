import { clampPoint, tileAt } from './map';
import type { Point, WorldMap } from './types';

const directions = [-1, 0, 1]
  .flatMap((row) => [-1, 0, 1].map((col) => ({ col, row })))
  .filter(({ col, row }) => col || row);
const key = (p: Point) => `${p.col},${p.row}`;
const distance = (a: Point, b: Point) => Math.hypot(a.col - b.col, a.row - b.row);
function neighbors(map: WorldMap, point: Point): Point[] {
  return directions.flatMap((step) => {
    const next = { col: point.col + step.col, row: point.row + step.row };
    if (!tileAt(map, next)?.walkable) return [];
    if (
      step.col &&
      step.row &&
      (!tileAt(map, { col: point.col + step.col, row: point.row })?.walkable ||
        !tileAt(map, { col: point.col, row: point.row + step.row })?.walkable)
    )
      return [];
    return [next];
  });
}

export function reachableTiles(
  map: WorldMap,
  start: Point,
  bounds?: { minCol: number; maxCol: number; minRow: number; maxRow: number }
): Point[] {
  const queue = [start];
  const seen = new Set([key(start)]);
  const result: Point[] = [];
  let queueIndex = 0;
  while (queueIndex < queue.length) {
    const current = queue[queueIndex++]!;
    result.push(current);
    for (const next of neighbors(map, current))
      if (
        (!bounds ||
          (next.col >= bounds.minCol &&
            next.col <= bounds.maxCol &&
            next.row >= bounds.minRow &&
            next.row <= bounds.maxRow)) &&
        !seen.has(key(next))
      ) {
        seen.add(key(next));
        queue.push(next);
      }
  }
  return result;
}
export function findPath(
  map: WorldMap,
  start: Point,
  goal: Point,
  bounds?: { minCol: number; maxCol: number; minRow: number; maxRow: number }
): Point[] | null {
  if (!tileAt(map, start)?.walkable || !tileAt(map, goal)?.walkable) return null;
  const inBounds = (p: Point) =>
    !bounds ||
    (p.col >= bounds.minCol && p.col <= bounds.maxCol && p.row >= bounds.minRow && p.row <= bounds.maxRow);
  if (!inBounds(start) || !inBounds(goal)) return null;
  const open = [{ point: start, score: 0 }];
  const push = (item: { point: Point; score: number }) => { open.push(item); let i = open.length - 1; while (i) { const p = Math.floor((i - 1) / 2); if (open[p].score <= open[i].score) break; [open[p], open[i]] = [open[i], open[p]]; i = p; } };
  const pop = () => { const first = open[0]!; const last = open.pop()!; if (open.length) { open[0] = last; let i = 0; while (true) { const left = i * 2 + 1; const right = left + 1; let best = i; if (left < open.length && open[left].score < open[best].score) best = left; if (right < open.length && open[right].score < open[best].score) best = right; if (best === i) break; [open[i], open[best]] = [open[best], open[i]]; i = best; } } return first; };
  open.length = 0; push({ point: start, score: 0 });
  const came = new Map<string, Point>();
  const cost = new Map([[key(start), 0]]);
  while (open.length) {
    const current = pop().point;
    if (key(current) === key(goal)) {
      const path: Point[] = [];
      let cursor = current;
      while (key(cursor) !== key(start)) {
        path.unshift(cursor);
        cursor = came.get(key(cursor))!;
      }
      return path;
    }
    for (const next of neighbors(map, current)) {
      if (!inBounds(next)) continue;
      const step = next.col !== current.col && next.row !== current.row ? Math.SQRT2 : 1;
      const nextCost = cost.get(key(current))! + step;
      if (nextCost < (cost.get(key(next)) ?? Infinity)) {
        cost.set(key(next), nextCost);
        came.set(key(next), current);
        push({ point: next, score: nextCost + distance(next, goal) });
      }
    }
  }
  return null;
}
export function resolveDestination(map: WorldMap, start: Point, requested: Point): Point | null {
  const dx = requested.col - start.col;
  const dy = requested.row - start.row;
  const length = Math.hypot(dx, dy);
  const target = clampPoint(
    map,
    length > 64
      ? {
          col: Math.round(start.col + (dx * 64) / length),
          row: Math.round(start.row + (dy * 64) / length)
        }
      : requested
  );
  const minCol = Math.max(0, start.col - 64),
    maxCol = Math.min(map.width - 1, start.col + 64),
    minRow = Math.max(0, start.row - 64),
    maxRow = Math.min(map.height - 1, start.row + 64);
  // Keep every UI request bounded. This is important for the large world:
  // an accidental click at the opposite edge must not search millions of nodes.
  const searchBounds = { minCol, maxCol, minRow, maxRow };
  if (findPath(map, start, target, searchBounds)) return target;
  const reachable = reachableTiles(map, start, { minCol, maxCol, minRow, maxRow });
  return (
    reachable.sort(
      (a, b) => distance(a, target) - distance(b, target) || a.row - b.row || a.col - b.col
    )[0] ?? null
  );
}
