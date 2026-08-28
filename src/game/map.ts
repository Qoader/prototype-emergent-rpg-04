import type { Point, Tile, TileKind, WorldMap } from './types';

export const TILE_SIZE = 32;
export const MAP_WIDTH = 48;
export const MAP_HEIGHT = 36;
const blocked = new Set<TileKind>(['water', 'rock']);

export function createMap(seed = 7331): WorldMap {
  const tiles: Tile[] = []; let state = seed >>> 0;
  const random = () => { state = (1664525 * state + 1013904223) >>> 0; return state / 0x100000000; };
  for (let row = 0; row < MAP_HEIGHT; row += 1) for (let col = 0; col < MAP_WIDTH; col += 1) {
    const edge = col < 2 || row < 2 || col >= MAP_WIDTH - 2 || row >= MAP_HEIGHT - 2;
    const roll = random(); const kind: TileKind = edge ? 'water' : roll < 0.08 ? 'rock' : roll < 0.18 ? 'water' : roll < 0.4 ? 'flower' : 'grass';
    tiles.push({ col, row, kind, walkable: !blocked.has(kind) });
  }
  const spawn = { col: 4, row: 4 };
  for (let row = spawn.row - 2; row <= spawn.row + 2; row += 1) for (let col = spawn.col - 2; col <= spawn.col + 2; col += 1) {
    const tile = tiles[row * MAP_WIDTH + col]; tile.kind = 'grass'; tile.walkable = true;
  }
  return { width: MAP_WIDTH, height: MAP_HEIGHT, tiles, spawn };
}

export function tileAt(map: WorldMap, point: Point): Tile | undefined { return point.col >= 0 && point.row >= 0 && point.col < map.width && point.row < map.height ? map.tiles[point.row * map.width + point.col] : undefined; }
export function clampPoint(map: WorldMap, point: Point): Point { return { col: Math.max(0, Math.min(map.width - 1, point.col)), row: Math.max(0, Math.min(map.height - 1, point.row)) }; }
