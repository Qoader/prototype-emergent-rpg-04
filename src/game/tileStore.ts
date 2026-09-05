import { CHUNK_SIZE, tileAt, evictChunkCache } from './map';
import type { Point, Tile, TileReader, WorldMap } from './types';

/** Adapts the legacy world container to the read-only capability used by systems. */
export function createTileReader(map: WorldMap): TileReader {
  return { width: map.width, height: map.height, getTile: (point) => tileAt(map, point) };
}

export type TileStore = TileReader & {
  readonly retainChunks: (chunks: ReadonlySet<string>) => void;
  readonly clear: () => void;
};

/** Owns procedural cache policy while authored world data remains in WorldMap. */
export function createTileStore(map: WorldMap): TileStore {
  const reader = createTileReader(map);
  return {
    ...reader,
    retainChunks: (chunks) => evictChunkCache(map, chunks),
    clear: () => map.chunkCache?.clear()
  };
}

export function chunkIdFor(point: Point) {
  return `${Math.floor(point.col / CHUNK_SIZE)},${Math.floor(point.row / CHUNK_SIZE)}`;
}

export type { Tile };
