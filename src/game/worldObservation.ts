import { TILE_SIZE } from './map';
import type { Point } from './types';

export type WorldViewport = { left: number; top: number; right: number; bottom: number };

/** Visibility is based on a tile's center, unlike renderer culling bounds. */
export function tileCenterInViewport(tile: Readonly<Point>, viewport: Readonly<WorldViewport>) {
  const x = (tile.col + .5) * TILE_SIZE;
  const y = (tile.row + .5) * TILE_SIZE;
  return x >= viewport.left && x < viewport.right && y >= viewport.top && y < viewport.bottom;
}

export function tileBoundsIntersectViewport(tile: Readonly<Point>, viewport: Readonly<WorldViewport>) {
  const left = tile.col * TILE_SIZE;
  const top = tile.row * TILE_SIZE;
  return left + TILE_SIZE > viewport.left && left < viewport.right && top + TILE_SIZE > viewport.top && top < viewport.bottom;
}
