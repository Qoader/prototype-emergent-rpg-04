import { describe, expect, it } from 'vitest';
import { createAuthoredTileEditor } from './authoredTiles';
import { createCountries, placeSettlements } from './settlements';
import { createTerrainSampler } from './terrain';
import { createMap, createWorld } from './worldGeneration';
import { MAP_HEIGHT, MAP_WIDTH } from './worldConstants';
import { tileKey } from './worldCoordinates';
import { generateRoutePoints } from './routes';
import { tileAt } from './worldTiles';
import { realmSettlementPlans } from './worldConfig';

const fingerprint = (seed: number) => {
  const world = createWorld(seed);
  const settlements = (world.settlements ?? []).map((s) => ({ ...s, gates: [...s.gates].sort((a, b) => a.id.localeCompare(b.id)) }));
  const overlays = [...(world.overlays?.entries() ?? [])].sort(([a], [b]) => a.localeCompare(b));
  const terrainPoints = [
    { col: 80, row: 100 }, { col: 480, row: 700 }, { col: 900, row: 1300 },
    { col: 1320, row: 100 }, { col: 1720, row: 1300 },
    { col: 0, row: 1024 }, { col: 2, row: 1024 }, { col: 2047, row: 1024 }, { col: 1024, row: 0 }, { col: 1024, row: 2047 }
  ];
  const terrain = terrainPoints.map((point) => ({ point, tile: tileAt(world, point) }));
  const routePairs = [
    [{ col: 10, row: 20 }, { col: 70, row: 80 }],
    [{ col: 400, row: 400 }, { col: 900, row: 1200 }],
    [{ col: 1500, row: 1700 }, { col: 1800, row: 300 }]
  ] as const;
  const routes = routePairs.map(([a, b]) => generateRoutePoints(seed, a, b));
  const canonical = JSON.stringify({
    countries: world.countries,
    settlements,
    roads: world.roads,
    features: world.features,
    spawn: world.spawn,
    overlays,
    terrain,
    routes
  });
  let hash = 2166136261;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
};

describe('world-generation module contracts', () => {
  it('samples terrain deterministically without an authored overlay', () => {
    const countries = createCountries();
    const context = { seed: 424242, width: MAP_WIDTH, height: MAP_HEIGHT, countries };
    const first = createTerrainSampler(context);
    const second = createTerrainSampler(context);
    expect(first.baseTile({ col: 1000, row: 1000 })).toEqual(second.baseTile({ col: 1000, row: 1000 }));
    expect(first.baseTile({ col: 0, row: 1000 }).kind).toBe('water');
    expect(first.baseTile({ col: MAP_WIDTH - 1, row: MAP_HEIGHT - 1 }).kind).toBe('water');
  });

  it('merges, replaces, and removes authored tiles while falling back to terrain', () => {
    const terrain = createTerrainSampler({ seed: 1, width: MAP_WIDTH, height: MAP_HEIGHT, countries: createCountries() });
    const editor = createAuthoredTileEditor(terrain);
    const point = { col: 1000, row: 1000 };
    const base = terrain.baseTile(point);
    editor.put(point, { kind: 'road', walkable: true });
    editor.put(point, { settlementId: 'test' });
    expect(editor.get(point)).toEqual({ ...base, kind: 'road', walkable: true, settlementId: 'test' });
    editor.remove(point);
    expect(editor.get(point)).toBeUndefined();
    expect(tileKey(point)).toBe('1000,1000');
  });

  it('keeps settlement order and footprint clearing stable', () => {
    const countries = createCountries();
    const terrain = createTerrainSampler({ seed: 7331, width: MAP_WIDTH, height: MAP_HEIGHT, countries });
    const editor = createAuthoredTileEditor(terrain);
    const settlements = placeSettlements(editor, countries);
    expect(settlements[0]?.name).toBe('Highcourt');
    expect(settlements.some((s) => s.name === 'Sunspire')).toBe(true);
    for (const settlement of settlements.slice(0, 3)) {
      expect(editor.get({ col: settlement.col, row: settlement.row })?.settlementId).toBe(settlement.id);
      expect(editor.get({ col: settlement.col, row: settlement.row })?.kind).toBe('grass');
    }
  });

  it('keeps the compatibility and orchestration entrypoints equivalent', () => {
    expect(createMap(1)).toEqual(createWorld(1));
    expect(createMap(7331)).toEqual(createWorld(7331));
  }, 120000);

  it('uses an explicit fifth-realm extra-city configuration', () => {
    expect(realmSettlementPlans[4]?.extraCity).toBe('Sunspire');
    expect(realmSettlementPlans[4]?.cities).toEqual(['Willowgate', 'Amberfield']);
  });

  it.each([
    [1, 'd107b09e'],
    [7331, '3502a660'],
    [424242, '6e0a1a11']
  ])('matches canonical deterministic fingerprint for seed %s', (seed, expected) => {
    expect(fingerprint(seed)).toBe(expected);
  }, 120000);
});
