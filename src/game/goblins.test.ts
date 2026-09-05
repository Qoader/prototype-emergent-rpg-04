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
});
