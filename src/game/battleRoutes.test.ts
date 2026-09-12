import { describe, expect, it } from 'vitest';
import { advanceRouteField, createRouteField, routeKey } from './battleRoutes';
import type { TileReader } from './types';

const corridor = (length: number): TileReader => ({ width: length + 1, height: 1, getTile: (point) => point.row === 0 && point.col >= 0 && point.col <= length ? { col: point.col, row: point.row, kind: 'grass', walkable: true } : undefined });
describe('bounded battle route fields', () => {
  it('includes a 64-edge cardinal corridor and excludes an otherwise identical 65-edge corridor', () => {
    const at64 = createRouteField({ col: 64, row: 0 }); advanceRouteField(at64, corridor(64), 1000);
    expect(at64.distances.get(routeKey({ col: 0, row: 0 }))).toBe(64);
    const at65 = createRouteField({ col: 65, row: 0 }); advanceRouteField(at65, corridor(65), 1000);
    expect(at65.distances.has(routeKey({ col: 0, row: 0 }))).toBe(false);
  });
});
