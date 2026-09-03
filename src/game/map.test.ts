import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, chunkRangeForViewport, createMap, evictChunkCache, GENERATOR_VERSION, tileAt, TILE_SIZE } from './map';
import { findPath } from './pathfinding';
import type { Tile } from './types';

describe('heroic fantasy world generation', () => {
  it('selects only viewport chunks with one guard chunk', () => {
    const map = createMap();
    const range = chunkRangeForViewport(map, { x: -CHUNK_SIZE * TILE_SIZE, y: 0 }, { width: 480, height: 480 });
    expect(range).toEqual({ left: 0, top: 0, right: 2, bottom: 1 });
    const centered = chunkRangeForViewport(map, { x: -1000, y: -700 }, { width: 480, height: 480 });
    expect(centered.left).toBe(Math.max(0, Math.floor(1000 / (CHUNK_SIZE * TILE_SIZE)) - 1));
    expect(centered.top).toBe(Math.max(0, Math.floor(700 / (CHUNK_SIZE * TILE_SIZE)) - 1));
    expect(centered.right).toBe(Math.floor((1000 + 479) / (CHUNK_SIZE * TILE_SIZE)) + 1);
    expect(centered.bottom).toBe(Math.floor((700 + 479) / (CHUNK_SIZE * TILE_SIZE)) + 1);
  });

  it('evicts generated tiles outside the streamed chunk window', () => {
    const map = createMap();
    tileAt(map, { col: 0, row: 0 });
    tileAt(map, { col: CHUNK_SIZE, row: 0 });
    expect(map.chunkCache?.size).toBe(2);
    evictChunkCache(map, new Set(['0,0']));
    expect([...map.chunkCache?.keys() ?? []]).toEqual(['0,0']);
  });

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

  it('uses the full configured terrain distribution in every wilderness biome', () => {
    const expected: Record<string, Record<string, number>> = {
      highland: { rock: 0.11, hill: 0.23, forest: 0.16, grass: 0.5 },
      forest: { forest: 0.52, flower: 0.14, water: 0.06, grass: 0.28 },
      river: { water: 0.14, flower: 0.14, forest: 0.11, grass: 0.61 },
      coastal: { water: 0.18, sand: 0.1, flower: 0.14, grass: 0.58 },
      marches: { sand: 0.18, flower: 0.15, hill: 0.1, grass: 0.57 }
    };
    expect(GENERATOR_VERSION).toBe(4);
    for (const seed of [1, 7331, 424242]) {
      const map = createMap(seed);
      for (let countryIndex = 0; countryIndex < 5; countryIndex += 1) {
        const country = map.countries![countryIndex]!;
        const counts = new Map<string, number>();
        let total = 0;
        const left = Math.floor(countryIndex * map.width / 5) + 75;
        const right = left + 255;
        for (let row = 100; row < 356; row += 1) {
          for (let col = left; col <= right; col += 1) {
            const point = { col, row };
            // Authored settlement/road tiles are overlays, not wilderness.
            if (map.overlays?.has(`${col},${row}`)) continue;
            const kind = tileAt(map, point)?.kind;
            if (kind) counts.set(kind, (counts.get(kind) ?? 0) + 1);
            total += 1;
          }
        }
        expect(total).toBeGreaterThan(60000);
        for (const [kind, target] of Object.entries(expected[country.theme]!)) {
          const actual = (counts.get(kind) ?? 0) / total;
          expect(counts.get(kind) ?? 0).toBeGreaterThan(0);
          expect(actual).toBeGreaterThanOrEqual(target - 0.03);
          expect(actual).toBeLessThanOrEqual(target + 0.03);
        }
        expect([...counts.keys()].sort()).toEqual(Object.keys(expected[country.theme]!).sort());
      }
    }
  });

  it('regenerates evicted chunks deterministically and keeps world edges water', () => {
    const map = createMap(424242);
    const point = { col: 1000, row: 1000 };
    const before = tileAt(map, point);
    expect(before).toBeDefined();
    evictChunkCache(map, new Set());
    expect(tileAt(map, point)).toEqual(before);
    for (const point of [
      { col: 0, row: 1000 },
      { col: 2, row: 1000 },
      { col: 1000, row: 0 },
      { col: 1000, row: 2 },
      { col: map.width - 1, row: 1000 },
      { col: 1000, row: map.height - 1 }
    ]) {
      expect(tileAt(map, point)?.kind).toBe('water');
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
      for (const settlement of settlements.filter((place) => place.kind !== 'village')) {
        const corners = [
          { col: settlement.bounds.left, row: settlement.bounds.top },
          { col: settlement.bounds.right, row: settlement.bounds.top },
          { col: settlement.bounds.left, row: settlement.bounds.bottom },
          { col: settlement.bounds.right, row: settlement.bounds.bottom }
        ];
        for (const corner of corners) {
          const tile = tileAt(map, corner);
          expect(tile?.kind).toBe(settlement.kind === 'capital' ? 'tower' : 'wall');
          expect(tile?.walkable).toBe(false);
          expect(tile?.settlementId).toBe(settlement.id);
        }
        for (const gate of settlement.gates)
          expect(corners.some((corner) => corner.col === gate.col && corner.row === gate.row)).toBe(false);
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

  it('uses grass beneath roads and water beneath bridges', () => {
    for (const seed of [1, 7331, 424242]) {
      const map = createMap(seed);
      const routes = [...(map.overlays?.values() ?? [])].filter(
        (tile) => tile.kind === 'road' || tile.kind === 'bridge'
      );
      expect(routes.length).toBeGreaterThan(0);
      expect(routes.filter((tile) => tile.kind === 'road').every((tile) => tile.groundKind === 'grass')).toBe(true);
      expect(routes.filter((tile) => tile.kind === 'bridge').every((tile) => tile.groundKind === 'water')).toBe(true);
      expect(routes.every((tile) => tile.walkable)).toBe(true);
    }
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
          expect(tileAt(map, gate)?.kind).toBe('gate');
          expect(tileAt(map, gate)?.walkable).toBe(true);
          expect(tileAt(map, gate)?.settlementId).toBe(settlement.id);
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

  it('selects the exact eligible housing density and preserves plazas/routes', () => {
    for (const seed of [1, 7331, 424242]) {
      const map = createMap(seed);
      for (const settlement of map.settlements ?? []) {
        const plazaRadius = settlement.kind === 'capital' ? 2 : settlement.kind === 'city' ? 1 : -1;
        const route = (col: number, row: number) => {
          const kind = tileAt(map, { col, row })?.kind;
          return kind === 'road' || kind === 'bridge' || kind === 'gate';
        };
        const eligible: Tile[] = [];
        const houses: Tile[] = [];
        for (let row = settlement.bounds.top + 1; row < settlement.bounds.bottom; row++) for (let col = settlement.bounds.left + 1; col < settlement.bounds.right; col++) {
          const tile = tileAt(map, { col, row })!;
          const plaza = plazaRadius >= 0 && Math.abs(col - settlement.col) <= plazaRadius && Math.abs(row - settlement.row) <= plazaRadius;
          if (!plaza && !route(col, row) && tile.kind !== 'wall' && tile.kind !== 'tower') eligible.push(tile);
          if (tile.kind === 'house') houses.push(tile);
        }
        expect(houses).toHaveLength(Math.floor(eligible.length * 0.35));
        expect(houses.every((tile) => !tile.walkable)).toBe(true);
        for (let row = settlement.bounds.top; row <= settlement.bounds.bottom; row++) for (let col = settlement.bounds.left; col <= settlement.bounds.right; col++) {
          const tile = tileAt(map, { col, row });
          if (route(col, row)) expect(tile?.kind).not.toBe('house');
          if (plazaRadius >= 0 && Math.abs(col - settlement.col) <= plazaRadius && Math.abs(row - settlement.row) <= plazaRadius) expect(tile?.kind).not.toBe('house');
        }
      }
    }
  });

  it('keeps housing deterministic while producing route-biased, clustered layouts', () => {
    const maps = [1, 7331, 424242].map((seed) => createMap(seed));
    expect(maps[0]).toEqual(createMap(1));
    const distances: number[] = [];
    let adjacent = 0;
    let houseTotal = 0;
    for (const map of maps) for (const settlement of map.settlements ?? []) {
      const routes: Array<{ col: number; row: number }> = [];
      const houses: Tile[] = [];
      for (let row = settlement.bounds.top; row <= settlement.bounds.bottom; row++) for (let col = settlement.bounds.left; col <= settlement.bounds.right; col++) {
        const tile = tileAt(map, { col, row });
        if (tile?.kind === 'road' || tile?.kind === 'bridge' || tile?.kind === 'gate') routes.push({ col, row });
        if (tile?.kind === 'house') houses.push(tile);
      }
      if (!routes.length) continue;
      houseTotal += houses.length;
      for (const house of houses) {
        distances.push(Math.min(...routes.map((route) => Math.abs(route.col - house.col) + Math.abs(route.row - house.row))));
        if (houses.some((other) => Math.abs(other.col - house.col) + Math.abs(other.row - house.row) === 1)) adjacent++;
      }
    }
    expect(distances.reduce((sum, distance) => sum + distance, 0) / distances.length).toBeLessThan(8);
    expect(distances.some((distance) => distance >= 6)).toBe(true);
    expect(adjacent / houseTotal).toBeGreaterThan(0.35);
  });
});
