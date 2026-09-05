import type { Point, Tile } from './types';
import type { TerrainSampler } from './terrain';
import { tileKey } from './worldCoordinates';
export type AuthoredTileEditor = { get(point: Readonly<Point>): Tile | undefined; put(point: Readonly<Point>, patch: Partial<Tile>): void; remove(point: Readonly<Point>): void; entries(): IterableIterator<[string, Tile]> };
export const createAuthoredTileEditor = (terrain: TerrainSampler): AuthoredTileEditor => {
  const overlays = new Map<string, Tile>();
  return { get: (p) => overlays.get(tileKey(p)), put: (p, patch) => { const old = overlays.get(tileKey(p)) ?? terrain.baseTile(p); overlays.set(tileKey(p), { ...old, ...patch, col: p.col, row: p.row }); }, remove: (p) => { overlays.delete(tileKey(p)); }, entries: () => overlays.entries() };
};
