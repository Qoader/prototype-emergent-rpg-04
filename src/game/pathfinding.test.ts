import { describe, expect, it } from 'vitest';
import { findPath, planNavigation, reachableTiles, resolveDestination } from './pathfinding';
import type { Tile, WorldMap } from './types';

const makeMap = (rows: string[]): WorldMap => ({ width: rows[0].length, height: rows.length, spawn: { col: 0, row: 0 }, tiles: rows.flatMap((line, row) => [...line].map((char, col) => ({ col, row, kind: char === '#' ? 'rock' : 'grass', walkable: char !== '#' } as Tile))) });
describe('pathfinding', () => {
  it('returns an empty route for the current tile', () => {
    expect(findPath(makeMap(['...']), { col: 1, row: 0 }, { col: 1, row: 0 })).toEqual([]);
  });

  it('rejects blocked, disconnected, and out-of-bounds endpoints', () => {
    const map = makeMap(['.#.', '###', '...']);
    expect(findPath(map, { col: 0, row: 0 }, { col: 1, row: 0 })).toBeNull();
    expect(findPath(map, { col: 0, row: 0 }, { col: 2, row: 2 })).toBeNull();
    expect(findPath(map, { col: 0, row: 0 }, { col: 5, row: 5 })).toBeNull();
  });

  it('respects explicit search bounds', () => {
    const map = makeMap(['.....']);
    expect(findPath(map, { col: 0, row: 0 }, { col: 4, row: 0 }, { minCol: 0, maxCol: 2, minRow: 0, maxRow: 0 })).toBeNull();
    expect(reachableTiles(map, { col: 0, row: 0 }, { minCol: 0, maxCol: 2, minRow: 0, maxRow: 0 })).toEqual([
      { col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 }
    ]);
  });
  it('routes diagonally', () => expect(findPath(makeMap(['...', '...', '...']), { col: 0, row: 0 }, { col: 2, row: 2 })).toEqual([{ col: 1, row: 1 }, { col: 2, row: 2 }]));
  it('does not cut blocked corners', () => expect(findPath(makeMap(['.#', '#.']), { col: 0, row: 0 }, { col: 1, row: 1 })).toBeNull());
  it('resolves blocked targets', () => expect(resolveDestination(makeMap(['...', '.#.', '...']), { col: 0, row: 0 }, { col: 1, row: 1 })).not.toEqual({ col: 1, row: 1 }));

  it('clamps distant requests to the bounded map and chooses deterministic ties', () => {
    const map = makeMap(['.....', '.....', '.....']);
    expect(resolveDestination(map, { col: 0, row: 1 }, { col: 99, row: 99 })).toEqual({ col: 4, row: 2 });
    expect(resolveDestination(makeMap(['...', '.#.', '...']), { col: 1, row: 1 }, { col: 1, row: 1 })).toBeNull();
  });

  it('returns a route that stays within the bounded request window', () => {
    const map = makeMap(Array.from({ length: 140 }, () => '.'.repeat(140)));
    const result = planNavigation(map, { col: 70, row: 70 }, { col: 139, row: 139 });
    expect(result).not.toBeNull();
    for (const point of result!.route) {
      expect(point.col).toBeGreaterThanOrEqual(6);
      expect(point.col).toBeLessThanOrEqual(134);
      expect(point.row).toBeGreaterThanOrEqual(6);
      expect(point.row).toBeLessThanOrEqual(134);
    }
  });
});
