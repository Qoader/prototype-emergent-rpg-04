import { clampPoint, tileAt } from './map';
import type { Point, TileReader, WorldMap } from './types';
export type SearchBounds = { minCol: number; maxCol: number; minRow: number; maxRow: number };
export type NavigationResult = { destination: Point; route: Point[] };
const directions = [-1, 0, 1]
  .flatMap((row) => [-1, 0, 1].map((col) => ({ col, row })))
  .filter((step) => step.col || step.row);
const key = (point: Point) => `${point.col},${point.row}`;
const distance = (a: Point, b: Point) => Math.hypot(a.col - b.col, a.row - b.row);
const readerFor = (map: WorldMap | TileReader): TileReader =>
  'getTile' in map
    ? map
    : { width: map.width, height: map.height, getTile: (point) => tileAt(map, point) };
function inBounds(point: Point, bounds?: SearchBounds) {
  return (
    !bounds ||
    (point.col >= bounds.minCol &&
      point.col <= bounds.maxCol &&
      point.row >= bounds.minRow &&
      point.row <= bounds.maxRow)
  );
}
function neighbors(reader: TileReader, point: Point, bounds?: SearchBounds): Point[] {
  return directions.flatMap((step) => {
    const next = { col: point.col + step.col, row: point.row + step.row };
    if (!inBounds(next, bounds) || !reader.getTile(next)?.walkable) return [];
    if (
      step.col &&
      step.row &&
      (!reader.getTile({ col: point.col + step.col, row: point.row })?.walkable ||
        !reader.getTile({ col: point.col, row: point.row + step.row })?.walkable)
    )
      return [];
    return [next];
  });
}
class MinHeap<T> {
  private readonly values: T[] = [];
  constructor(private readonly compare: (a: T, b: T) => number) {}
  get size() {
    return this.values.length;
  }
  push(value: T) {
    this.values.push(value);
    this.up(this.values.length - 1);
  }
  pop() {
    const first = this.values[0];
    const last = this.values.pop();
    if (this.values.length && last) {
      this.values[0] = last;
      this.down(0);
    }
    return first;
  }
  private up(index: number) {
    while (index) {
      const parent = Math.floor((index - 1) / 2);
      if (this.compare(this.values[parent]!, this.values[index]!) <= 0) break;
      [this.values[parent], this.values[index]] = [this.values[index]!, this.values[parent]!];
      index = parent;
    }
  }
  private down(index: number) {
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let best = index;
      if (left < this.values.length && this.compare(this.values[left]!, this.values[best]!) < 0)
        best = left;
      if (right < this.values.length && this.compare(this.values[right]!, this.values[best]!) < 0)
        best = right;
      if (best === index) return;
      [this.values[index], this.values[best]] = [this.values[best]!, this.values[index]!];
      index = best;
    }
  }
}
export function reachableTiles(
  map: WorldMap | TileReader,
  start: Point,
  bounds?: SearchBounds
): Point[] {
  const reader = readerFor(map);
  if (!reader.getTile(start)?.walkable || !inBounds(start, bounds)) return [];
  const queue = [start];
  const seen = new Set([key(start)]);
  const result: Point[] = [];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    result.push(current);
    for (const next of neighbors(reader, current, bounds))
      if (!seen.has(key(next))) {
        seen.add(key(next));
        queue.push(next);
      }
  }
  return result;
}
export function findPath(
  map: WorldMap | TileReader,
  start: Point,
  goal: Point,
  bounds?: SearchBounds
): Point[] | null {
  const reader = readerFor(map);
  if (
    !reader.getTile(start)?.walkable ||
    !reader.getTile(goal)?.walkable ||
    !inBounds(start, bounds) ||
    !inBounds(goal, bounds)
  )
    return null;
  const open = new MinHeap<{ point: Point; score: number }>((a, b) => a.score - b.score);
  open.push({ point: start, score: 0 });
  const came = new Map<string, Point>();
  const cost = new Map([[key(start), 0]]);
  while (open.size) {
    const current = open.pop()!.point;
    if (key(current) === key(goal)) {
      const route: Point[] = [];
      let cursor = current;
      while (key(cursor) !== key(start)) {
        route.unshift(cursor);
        cursor = came.get(key(cursor))!;
      }
      return route;
    }
    for (const next of neighbors(reader, current, bounds)) {
      const step = next.col !== current.col && next.row !== current.row ? Math.SQRT2 : 1;
      const nextCost = cost.get(key(current))! + step;
      if (nextCost >= (cost.get(key(next)) ?? Infinity)) continue;
      cost.set(key(next), nextCost);
      came.set(key(next), current);
      open.push({ point: next, score: nextCost + distance(next, goal) });
    }
  }
  return null;
}
export function planNavigation(
  map: WorldMap | TileReader,
  start: Point,
  requested: Point
): NavigationResult | null {
  const reader = readerFor(map);
  if (!reader.getTile(start)?.walkable) return null;
  const dx = requested.col - start.col;
  const dy = requested.row - start.row;
  const length = Math.hypot(dx, dy);
  const target = clampPoint(
    reader,
    length > 64
      ? {
          col: Math.round(start.col + (dx * 64) / length),
          row: Math.round(start.row + (dy * 64) / length)
        }
      : requested
  );
  const bounds: SearchBounds = {
    minCol: Math.max(0, start.col - 64),
    maxCol: Math.min(reader.width - 1, start.col + 64),
    minRow: Math.max(0, start.row - 64),
    maxRow: Math.min(reader.height - 1, start.row + 64)
  };
  const direct = findPath(reader, start, target, bounds);
  if (direct) return { destination: target, route: direct };
  const reachable = reachableTiles(reader, start, bounds);
  const destination = reachable.sort(
    (a, b) => distance(a, target) - distance(b, target) || a.row - b.row || a.col - b.col
  )[0];
  if (!destination) return null;
  return { destination, route: findPath(reader, start, destination, bounds) ?? [] };
}
export function resolveDestination(map: WorldMap, start: Point, requested: Point): Point | null {
  return planNavigation(map, start, requested)?.destination ?? null;
}
