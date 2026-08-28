import { describe, expect, it } from 'vitest';
import { findPath, resolveDestination } from './pathfinding';
import type { Tile, WorldMap } from './types';

const makeMap = (rows: string[]): WorldMap => ({ width: rows[0].length, height: rows.length, spawn: { col: 0, row: 0 }, tiles: rows.flatMap((line, row) => [...line].map((char, col) => ({ col, row, kind: char === '#' ? 'rock' : 'grass', walkable: char !== '#' } as Tile))) });
describe('pathfinding', () => {
  it('routes diagonally', () => expect(findPath(makeMap(['...', '...', '...']), { col: 0, row: 0 }, { col: 2, row: 2 })).toEqual([{ col: 1, row: 1 }, { col: 2, row: 2 }]));
  it('does not cut blocked corners', () => expect(findPath(makeMap(['.#', '#.']), { col: 0, row: 0 }, { col: 1, row: 1 })).toBeNull());
  it('resolves blocked targets', () => expect(resolveDestination(makeMap(['...', '.#.', '...']), { col: 0, row: 0 }, { col: 1, row: 1 })).not.toEqual({ col: 1, row: 1 }));
});
