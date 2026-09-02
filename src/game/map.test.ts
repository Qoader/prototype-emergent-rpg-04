import { describe, expect, it } from 'vitest';
import { createMap, tileAt } from './map';
import { findPath } from './pathfinding';
import type { Tile } from './types';

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
      expect(places.filter((place) => place.kind === 'village').length).toBeLessThanOrEqual(6);
    }
  });

  it('keeps settlement bounds separated and city wall ownership intact', () => {
    for (const seed of [1, 7331, 424242]) {
      const map = createMap(seed);
      const settlements = map.settlements ?? [];
      for (let index = 0; index < settlements.length; index += 1) for (let other = 0; other < index; other += 1) {
        const a = settlements[index].bounds; const b = settlements[other].bounds;
        expect(a.left > b.right + 3 || a.right + 3 < b.left || a.top > b.bottom + 3 || a.bottom + 3 < b.top).toBe(true);
      }
      for (const settlement of settlements.filter((place) => place.kind === 'city')) {
        for (let row = settlement.bounds.top + 1; row < settlement.bounds.bottom; row += 1) for (const col of [settlement.bounds.left, settlement.bounds.right]) {
          const tile = tileAt(map, { col, row });
          expect(tile?.settlementId).toBe(settlement.id);
        }
      }
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
    const connected = new Set<string>([capitals[0]?.id]);
    while (true) {
      const before = connected.size;
      for (const road of map.roads ?? []) {
        const [a, b] = road.settlementIds;
        if (connected.has(a)) connected.add(b);
        if (connected.has(b)) connected.add(a);
      }
      if (connected.size === before) break;
    }
    for (const capital of capitals) expect(connected.has(capital.id)).toBe(true);
    expect(map.features?.filter((feature) => feature.kind === 'frontier-marker').length).toBeGreaterThan(0);
  });

  it('never generates a two-tile-wide route block', () => {
    for (const seed of [1, 7331, 424242]) {
      const map = createMap(seed);
      const isRoute = (col: number, row: number) => {
        const tile = tileAt(map, { col, row });
        return tile?.kind === 'road' || tile?.kind === 'bridge';
      };
      const candidates = [...(map.overlays?.values() ?? [])];
      for (const tile of candidates) for (const row of [tile.row - 1, tile.row]) for (const col of [tile.col - 1, tile.col]) {
        expect(isRoute(col, row) && isRoute(col + 1, row) && isRoute(col, row + 1) && isRoute(col + 1, row + 1)).toBe(false);
      }
    }
  }, 30000);

  it('derives fortified gates from actual road crossings', () => {
    for (const seed of [1, 7331, 424242]) {
      const map = createMap(seed);
      const isRoute = (col: number, row: number) => {
        const tile = tileAt(map, { col, row });
        return tile?.kind === 'road' || tile?.kind === 'bridge' || tile?.kind === 'gate';
      };
      const inside = (settlement: NonNullable<typeof map.settlements>[number], col: number, row: number) => col > settlement.bounds.left && col < settlement.bounds.right && row > settlement.bounds.top && row < settlement.bounds.bottom;
      for (const settlement of map.settlements ?? []) {
        if (settlement.kind === 'village') expect(settlement.gates).toHaveLength(0);
        const perimeterGates = settlement.gates.slice().sort((a, b) => a.row - b.row || a.col - b.col);
        for (const gate of perimeterGates) {
          expect(gate.col === settlement.bounds.left || gate.col === settlement.bounds.right || gate.row === settlement.bounds.top || gate.row === settlement.bounds.bottom).toBe(true);
          expect((gate.col === settlement.bounds.left || gate.col === settlement.bounds.right) && (gate.row === settlement.bounds.top || gate.row === settlement.bounds.bottom)).toBe(false);
          const neighbors = [{ col: gate.col + 1, row: gate.row }, { col: gate.col - 1, row: gate.row }, { col: gate.col, row: gate.row + 1 }, { col: gate.col, row: gate.row - 1 }];
          expect(neighbors.some((point) => isRoute(point.col, point.row) && inside(settlement, point.col, point.row))).toBe(true);
          expect(neighbors.some((point) => isRoute(point.col, point.row) && !inside(settlement, point.col, point.row) && !(point.col >= settlement.bounds.left && point.col <= settlement.bounds.right && point.row >= settlement.bounds.top && point.row <= settlement.bounds.bottom))).toBe(true);
          expect(gate.direction).toMatch(/^(north|east|south|west)$/);
        }
        for (let index = 1; index < perimeterGates.length; index += 1) {
          const previous = perimeterGates[index - 1]; const current = perimeterGates[index];
          expect(Math.abs(previous.col - current.col) + Math.abs(previous.row - current.row)).toBeGreaterThan(1);
        }
      }
    }
  });

  it('generates explorable house clusters with walkable settlement centers', () => {
    const map = createMap();
    for (const settlement of map.settlements ?? []) {
      const tiles: Tile[] = [];
      for (let row = settlement.bounds.top; row <= settlement.bounds.bottom; row += 1) for (let col = settlement.bounds.left; col <= settlement.bounds.right; col += 1) {
        const tile = tileAt(map, { col, row }); if (tile?.settlementId === settlement.id) tiles.push(tile);
      }
      const houses = tiles.filter((tile) => tile.kind === 'house');
      expect(houses.length).toBeGreaterThan(0);
      expect(houses.every((tile) => !tile.walkable)).toBe(true);
      expect(tileAt(map, settlement)?.walkable).toBe(true);
      expect(settlement.bounds.left).toBeGreaterThanOrEqual(3);
      expect(settlement.bounds.right).toBeLessThan(map.width - 3);
      expect(settlement.bounds.top).toBeGreaterThanOrEqual(3);
      expect(settlement.bounds.bottom).toBeLessThan(map.height - 3);
    }
  });
});
