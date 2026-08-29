import { describe, expect, it } from 'vitest';
import { routeConnections } from './tileIllustration';
import type { Tile, TileKind, WorldMap } from './types';

function makeMap(rows: string[]): WorldMap {
  const tiles: Tile[] = rows.flatMap((line, row) => [...line].map((char, col) => {
    const kind: TileKind = char === 'R' ? 'road' : char === 'B' ? 'bridge' : 'grass';
    return { col, row, kind, walkable: true };
  }));
  return { width: rows[0].length, height: rows.length, tiles, spawn: { col: 0, row: 0 } };
}

describe('route connectivity', () => {
  it('connects roads and bridges cardinally, including each shape', () => {
    expect(routeConnections(makeMap(['.R.', '.R.', '...']), { col: 1, row: 1 })).toEqual({ north: true, east: false, south: false, west: false });
    expect(routeConnections(makeMap(['...', 'RRR', '...']), { col: 1, row: 1 })).toEqual({ north: false, east: true, south: false, west: true });
    expect(routeConnections(makeMap(['.R.', '.RR', '...']), { col: 1, row: 1 })).toEqual({ north: true, east: true, south: false, west: false });
    expect(routeConnections(makeMap(['.R.', 'RRR', '...']), { col: 1, row: 1 })).toEqual({ north: true, east: true, south: false, west: true });
    expect(routeConnections(makeMap(['.R.', 'RRR', '.R.']), { col: 1, row: 1 })).toEqual({ north: true, east: true, south: true, west: true });
    expect(routeConnections(makeMap(['...', 'RBR', '...']), { col: 1, row: 1 })).toEqual({ north: false, east: true, south: false, west: true });
  });

  it('ignores diagonal and out-of-bounds route tiles', () => {
    expect(routeConnections(makeMap(['R.', '.R']), { col: 1, row: 1 })).toEqual({ north: false, east: false, south: false, west: false });
    expect(routeConnections(makeMap(['R']), { col: 0, row: 0 })).toEqual({ north: false, east: false, south: false, west: false });
  });
});
