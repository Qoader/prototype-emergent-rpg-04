import { describe, expect, it } from 'vitest';
import { createGoblinSimulation } from './goblins';
import type { GoblinNest, Tile } from './types';

const map = (kind: Tile['kind'] = 'grass') => {
  const tiles = Array.from({ length: 20 * 20 }, (_, index) => ({ col: index % 20, row: Math.floor(index / 20), kind, walkable: true }));
  return { width: 20, height: 20, getTile: (point: { col: number; row: number }) => tiles.find((tile) => tile.col === point.col && tile.row === point.row) };
};
const nest: GoblinNest = { id: 'test-nest', col: 2, row: 2, spawnTiles: [{ col: 2, row: 2 }, { col: 2, row: 3 }, { col: 3, row: 2 }] };

describe('goblin simulation', () => {
  it('spawns exactly three stable goblins and detects targets through terrain', () => {
    const simulation = createGoblinSimulation({ seed: 3, nests: [nest], tiles: map() });
    expect(simulation.snapshots()).toHaveLength(3);
    simulation.tick(0.2, [{ id: 'player', kind: 'player', tile: { col: 4, row: 2 } }]);
    expect(simulation.snapshots().some((goblin) => goblin.targetId === 'player')).toBe(true);
  });

  it('keeps roaming routes away from roads', () => {
    const readerMap = map();
    for (const tile of Array.from({ length: 20 * 20 }, (_, index) => readerMap.getTile({ col: index % 20, row: Math.floor(index / 20) })!)) if (tile.row === 1) tile.kind = 'road';
    const simulation = createGoblinSimulation({ seed: 3, nests: [nest], tiles: readerMap });
    for (let i = 0; i < 240; i += 1) simulation.tick(1 / 60);
    expect(simulation.snapshots().every((goblin) => readerMap.getTile(goblin.tile)?.kind !== 'road')).toBe(true);
  });

  it('returns home after losing a target and can finish the return', () => {
    const simulation = createGoblinSimulation({ seed: 3, nests: [nest], tiles: map() });
    const target = { id: 'player', kind: 'player' as const, tile: { col: 4, row: 2 } };
    simulation.tick(0.2, [target]);
    for (let i = 0; i < 32; i += 1) simulation.tick(0.1, [{ ...target, tile: { col: 19, row: 19 } }]);
    expect(simulation.snapshots().every((goblin) => goblin.targetId === null)).toBe(true);
    for (let i = 0; i < 100; i += 1) simulation.tick(1 / 60, []);
    expect(simulation.snapshots().some((goblin) => goblin.tile.col === nest.col && goblin.tile.row === nest.row)).toBe(true);
  });

  it('keeps breadcrumbs dense after repeated backtracking before a lost target return', () => {
    const simulation = createGoblinSimulation({ seed: 3, nests: [nest], tiles: map() });
    const target = (tile: { col: number; row: number }) => [{ id: 'adventurer', kind: 'adventurer' as const, tile }];
    simulation.tick(0.2, target({ col: 5, row: 2 }));
    for (let index = 0; index < 12; index += 1) simulation.tick(0.1, target({ col: 5, row: 2 }));
    for (let index = 0; index < 12; index += 1) simulation.tick(0.1, target({ col: 2, row: 2 }));
    for (let index = 0; index < 12; index += 1) simulation.tick(0.1, target({ col: 5, row: 2 }));

    expect(() => {
      for (let index = 0; index < 32; index += 1) simulation.tick(0.1, []);
    }).not.toThrow();
    for (let index = 0; index < 100; index += 1) simulation.tick(1 / 60, []);
    expect(simulation.snapshots().some((goblin) => goblin.tile.col === nest.col && goblin.tile.row === nest.row)).toBe(true);
  });

  it('does not replan an unchanged pursuit route on every perception interval', () => {
    let reads = 0;
    const reader = map();
    const counted = { ...reader, getTile: (point: { col: number; row: number }) => { reads += 1; return reader.getTile(point); } };
    const simulation = createGoblinSimulation({ seed: 3, nests: [nest], tiles: counted });
    const target = { id: 'player', kind: 'player' as const, tile: { col: 4, row: 2 } };
    simulation.tick(0.2, [target]);
    const afterInitialPlan = reads;
    simulation.tick(1, [target]);
    expect(reads - afterInitialPlan).toBeLessThan(120);
  });
  it('uses east for a goblin already on the encounter and throttles failed response searches', () => {
    let reads = 0;
    const base = map();
    const blocked = { ...base, getTile: (point: { col: number; row: number }) => { reads += 1; const tile = base.getTile(point); return point.col === 4 && point.row === 2 ? { ...tile!, walkable: false } : tile; } };
    const simulation = createGoblinSimulation({ seed: 3, nests: [nest], tiles: blocked });
    // First goblin is already at its encounter tile.
    simulation.respondToBattle({ col: 2, row: 2 }, { col: 2, row: 2 });
    expect(simulation.battleResponses().find((item) => item.id.endsWith('-0'))).toMatchObject({ arrived: true, approachEdge: 'east' });
    simulation.respondToBattle({ col: 4, row: 2 }, { col: 2, row: 2 });
    const first = reads;
    for (let i = 0; i < 11; i += 1) simulation.respondToBattle({ col: 4, row: 2 }, { col: 2, row: 2 });
    expect(reads - first).toBeLessThan(10);
  });

  it('returns an arrived goblin home without moving an incoming responder', () => {
    const simulation = createGoblinSimulation({ seed: 3, nests: [nest], tiles: map() });
    simulation.respondToBattle({ col: 2, row: 2 }, { col: 2, row: 2 });
    simulation.respondToBattle({ col: 8, row: 2 }, { col: 2, row: 2 });
    const incoming = simulation.snapshots().find((npc) => npc.id.endsWith('-1'))!;
    simulation.clearBattleResponses();
    expect(simulation.snapshots().find((npc) => npc.id === incoming.id)!.tile).toEqual(incoming.tile);
  });
});
