import { describe, expect, it } from 'vitest';
import { createAdventurerSimulation } from './adventurers';
import type { Settlement, Tile, TileReader, WorldMap } from './types';

const settlement = (id: string, col: number): Settlement => ({
  id,
  name: id,
  kind: 'village',
  countryId: 'realm',
  col,
  row: 1,
  radius: 1,
  bounds: { left: col - 1, right: col + 1, top: 0, bottom: 2 },
  gates: []
});

function world(roads: WorldMap['roads'] = [{ id: 'a-b', settlementIds: ['a', 'b'] }]): {
  map: WorldMap;
  reader: TileReader;
} {
  const settlements = [settlement('a', 1), settlement('b', 5)];
  const tiles: Tile[] = Array.from({ length: 21 }, (_, index) => ({
    col: index % 7,
    row: Math.floor(index / 7),
    kind: index % 7 === 3 ? 'road' : 'grass',
    walkable: true
  }));
  const map: WorldMap = { width: 7, height: 3, seed: 7331, spawn: { col: 1, row: 1 }, tiles, settlements, roads };
  return { map, reader: { width: map.width, height: map.height, getTile: (point) => tiles.find((tile) => tile.col === point.col && tile.row === point.row) } };
}

describe('adventurer simulation', () => {
  it('creates one stable traveler for every settlement', () => {
    const { map, reader } = world();
    const simulation = createAdventurerSimulation(map, reader);
    expect(simulation.snapshots().map((npc) => npc.id)).toEqual(['adventurer-a', 'adventurer-b']);
  });

  it('travels only to direct road neighbors and records the journey', () => {
    const { map, reader } = world();
    const simulation = createAdventurerSimulation(map, reader);
    let travelers: ReturnType<typeof simulation.snapshots> = [];
    for (let step = 0; step < 800 && !travelers.length; step += 1) {
      simulation.tick(0.1);
      travelers = simulation.snapshots().filter((npc) => npc.phase === 'traveling');
    }
    expect(travelers.length).toBeGreaterThan(0);
    for (const npc of travelers) {
      expect(npc.destinationSettlementId).toBe(npc.previousSettlementId === 'a' ? 'b' : 'a');
      expect(npc.currentSettlementId).toBeNull();
    }
  });

  it('keeps isolated adventurers in their settlement', () => {
    const { map, reader } = world([]);
    const simulation = createAdventurerSimulation(map, reader);
    for (let step = 0; step < 1000; step += 1) simulation.tick(0.1);
    expect(simulation.snapshots().every((npc) => npc.phase !== 'traveling' && npc.currentSettlementId !== null)).toBe(true);
  });
  it('uses west for an adventurer on the encounter and returns arrived allies to their settlement', () => {
    const { map, reader } = world();
    const simulation = createAdventurerSimulation(map, reader);
    simulation.respondToBattle({ col: 1, row: 1 }, { col: 1, row: 1 });
    expect(simulation.battleResponses().find((item) => item.id === 'adventurer-a')).toMatchObject({ arrived: true, approachEdge: 'west' });
    simulation.clearBattleResponses();
    expect(simulation.snapshots().find((npc) => npc.id === 'adventurer-a')!.phase).toBe('returning');
  });

  it('throttles failed adventurer response route searches to the decision cadence', () => {
    const { map, reader } = world();
    let reads = 0;
    const counted = { ...reader, getTile: (point: { col: number; row: number }) => { reads += 1; const tile = reader.getTile(point); return point.col === 3 && point.row === 1 ? { ...tile!, walkable: false } : tile; } };
    const simulation = createAdventurerSimulation(map, counted);
    simulation.respondToBattle({ col: 3, row: 1 }, { col: 1, row: 1 });
    const first = reads;
    for (let i = 0; i < 10; i += 1) simulation.respondToBattle({ col: 3, row: 1 }, { col: 1, row: 1 });
    expect(reads - first).toBeLessThan(10);
  });
});
