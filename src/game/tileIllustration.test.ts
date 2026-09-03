import { describe, expect, it } from 'vitest';
import { Graphics } from 'pixi.js';
import { drawTileOverhang, fortificationOrientation, fortificationPalette, fortificationSectionZIndex, isOverhangingTerrain, overhangZIndex, routeConnections } from './tileIllustration';
import type { Country, Settlement, Tile, TileKind, WorldMap } from './types';

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

describe('terrain overhangs', () => {
  it('identifies only tree, rock, and mountain terrain', () => {
    expect(isOverhangingTerrain('forest')).toBe(true);
    expect(isOverhangingTerrain('rock')).toBe(true);
    expect(isOverhangingTerrain('hill')).toBe(true);
    expect(isOverhangingTerrain('grass')).toBe(false);
    expect(isOverhangingTerrain('road')).toBe(false);
  });

  it('shifts feature geometry upward by half a tile', () => {
    const graphics = new Graphics();
    drawTileOverhang(graphics, { col: 2, row: 3, kind: 'hill', walkable: false });
    expect(graphics.bounds.minY).toBe(3 * 48 - 24 + 5);
    expect(graphics.bounds.maxY).toBe(3 * 48 - 24 + 48);
  });

  it('places an owner row foreground just above the upper row boundary', () => {
    expect(overhangZIndex(3)).toBe(3 * 48 + 1);
  });

  it('places vertical gate sections on opposite sides of the player depth', () => {
    expect(fortificationSectionZIndex(3, 'upper')).toBe(3 * 48 - 1);
    expect(fortificationSectionZIndex(3, 'lower')).toBe(4 * 48 - 1);
  });

  it('keeps depth relationships stable for a player standing in the gate row', () => {
    const playerDepth = 3 * 48;
    expect(fortificationSectionZIndex(3, 'upper')).toBeLessThan(playerDepth);
    expect(playerDepth).toBeLessThan(fortificationSectionZIndex(3, 'lower'));
    expect(overhangZIndex(2)).toBeLessThan(playerDepth);
    expect(overhangZIndex(3)).toBeGreaterThan(playerDepth);
  });
});

describe('fortification context', () => {
  const country: Country = { id: 'realm-a', name: 'Alderwyn', theme: 'highland', color: '#b95747', banner: '#f0c674' };
  const settlement: Settlement = { id: 'city-a', name: 'Highcourt', kind: 'city', countryId: country.id, col: 5, row: 5, radius: 3, bounds: { left: 2, top: 2, right: 8, bottom: 8 }, gates: [{ id: 'gate-east', col: 8, row: 5, direction: 'east' }] };
  const map: WorldMap = { width: 11, height: 11, spawn: { col: 5, row: 5 }, countries: [country], settlements: [settlement], tiles: [] };

  it('resolves perimeter and corner orientations', () => {
    expect(fortificationOrientation({ col: 5, row: 2, kind: 'wall', walkable: false, settlementId: settlement.id }, map)).toBe('horizontal');
    expect(fortificationOrientation({ col: 2, row: 5, kind: 'wall', walkable: false, settlementId: settlement.id }, map)).toBe('vertical');
    expect(fortificationOrientation({ col: 2, row: 2, kind: 'wall', walkable: false, settlementId: settlement.id }, map)).toBe('corner');
    expect(fortificationOrientation({ col: 8, row: 5, kind: 'gate', walkable: true, settlementId: settlement.id }, map)).toBe('vertical');
  });

  it('infers orientation and uses neutral palette without metadata', () => {
    const tiles: Tile[] = [
      { col: 0, row: 0, kind: 'wall', walkable: false },
      { col: 0, row: 1, kind: 'wall', walkable: false },
      { col: 1, row: 1, kind: 'gate', walkable: true },
      { col: 2, row: 1, kind: 'road', walkable: true },
    ];
    const inferredMap: WorldMap = { width: 3, height: 2, spawn: { col: 2, row: 1 }, tiles };
    expect(fortificationOrientation(tiles[1], inferredMap)).toBe('vertical');
    expect(fortificationOrientation(tiles[2], inferredMap)).toBe('vertical');
    expect(fortificationPalette(tiles[2], inferredMap)).toEqual({ color: '#777b82', banner: '#ded7c5' });
  });

  it('resolves the owning realm flag colors', () => {
    expect(fortificationPalette({ col: 8, row: 5, kind: 'gate', walkable: true, settlementId: settlement.id }, map)).toEqual({ color: country.color, banner: country.banner });
  });
});
