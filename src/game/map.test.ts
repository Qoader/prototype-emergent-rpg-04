import { describe, expect, it } from 'vitest';
import { createMap } from './map';
import { findPath } from './pathfinding';

describe('heroic fantasy world generation', () => {
  it('is deterministic and creates five complete realms', () => {
    const first = createMap();
    const second = createMap();
    expect(first).toEqual(second);
    expect(first.countries).toHaveLength(5);
    for (const country of first.countries ?? []) {
      const places = first.settlements?.filter((place) => place.countryId === country.id) ?? [];
      expect(places.filter((place) => place.kind === 'capital')).toHaveLength(1);
      expect(places.filter((place) => place.kind === 'city').length).toBeGreaterThanOrEqual(2);
      expect(places.filter((place) => place.kind === 'village')).toHaveLength(6);
    }
  });

  it('starts in a village with a traversable route to a city', () => {
    const map = createMap();
    const start = map.settlements?.find((place) => place.col === map.spawn.col && place.row === map.spawn.row);
    const city = map.settlements?.find((place) => place.countryId === start?.countryId && place.kind === 'city');
    expect(start?.kind).toBe('village');
    expect(city).toBeDefined();
    expect(findPath(map, map.spawn, city!)).not.toBeNull();
  });

  it('links every capital into the road network and marks frontiers', () => {
    const map = createMap();
    const capitals = map.settlements?.filter((place) => place.kind === 'capital') ?? [];
    for (const capital of capitals) expect(findPath(map, map.spawn, capital)).not.toBeNull();
    expect(map.features?.filter((feature) => feature.kind === 'gate')).toHaveLength(4);
  });

  it('never generates a two-tile-wide route block', () => {
    for (const seed of [1, 7331, 424242]) {
      const map = createMap(seed);
      const isRoute = (col: number, row: number) => {
        const tile = map.tiles[row * map.width + col];
        return tile.kind === 'road' || tile.kind === 'bridge';
      };
      for (let row = 0; row < map.height - 1; row += 1) for (let col = 0; col < map.width - 1; col += 1) {
        expect(isRoute(col, row) && isRoute(col + 1, row) && isRoute(col, row + 1) && isRoute(col + 1, row + 1)).toBe(false);
      }
    }
  }, 30000);

  it('generates explorable house clusters with walkable settlement centers', () => {
    const map = createMap();
    for (const settlement of map.settlements ?? []) {
      const tiles = map.tiles.filter((tile) => tile.settlementId === settlement.id);
      const houses = tiles.filter((tile) => tile.kind === 'house');
      expect(houses.length).toBeGreaterThan(0);
      expect(houses.every((tile) => !tile.walkable)).toBe(true);
      expect(map.tiles[settlement.row * map.width + settlement.col].walkable).toBe(true);
      expect(settlement.bounds.left).toBeGreaterThanOrEqual(3);
      expect(settlement.bounds.right).toBeLessThan(map.width - 3);
      expect(settlement.bounds.top).toBeGreaterThanOrEqual(3);
      expect(settlement.bounds.bottom).toBeLessThan(map.height - 3);
    }
  });
});
