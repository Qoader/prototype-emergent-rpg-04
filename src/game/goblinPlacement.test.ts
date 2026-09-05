import { describe, expect, it } from 'vitest';
import { placeGoblinNests } from './goblinPlacement';
import type { Settlement, Tile } from './types';

const settlement: Settlement = { id: 'settlement-a', name: 'A', kind: 'village', countryId: 'realm', col: 50, row: 50, radius: 2, bounds: { left: 48, top: 48, right: 52, bottom: 52 }, gates: [] };
const reader = { width: 128, height: 128, getTile: (point: { col: number; row: number }): Tile => ({ ...point, kind: 'grass', walkable: true }) };
const editor = { get: (point: { col: number; row: number }) => reader.getTile(point), put: () => undefined, remove: () => undefined, entries: function* () { yield* []; } };

describe('goblin nest placement', () => {
  it('is deterministic and creates three connected spawn tiles per nest', () => {
    const first = placeGoblinNests(editor, [settlement], reader, 7331);
    const second = placeGoblinNests(editor, [settlement], reader, 7331);
    expect(first).toEqual(second);
    expect(first).toHaveLength(3);
    for (const nest of first) {
      expect(nest.spawnTiles).toHaveLength(3);
      expect(nest.spawnTiles.every((point) => Math.hypot(point.col - nest.col, point.row - nest.row) <= 2)).toBe(true);
      expect(nest.spawnTiles.every((point) => Math.hypot(Math.max(48 - point.col, 0, point.col - 52), Math.max(48 - point.row, 0, point.row - 52)) >= 20)).toBe(true);
    }
  });
});
