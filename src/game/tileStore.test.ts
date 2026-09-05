import { describe, expect, it } from 'vitest';
import { createMap } from './map';
import { createTileStore } from './tileStore';

describe('tile store', () => {
  it('exposes stable reads and releases procedural chunks', () => {
    const map = createMap(424242);
    const store = createTileStore(map);
    const point = { col: 1000, row: 1000 };
    const first = store.getTile(point);
    expect(store.getTile(point)).toBe(first);
    store.retainChunks(new Set());
    expect(store.getTile(point)).toEqual(first);
    store.clear();
    expect(store.getTile(point)).toEqual(first);
  });
});
