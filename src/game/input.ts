import { TILE_SIZE } from './map';
import type { Point } from './types';

export type PointerCoordinates = {
  clientX: number;
  clientY: number;
  rect: { left: number; top: number };
  camera: { x: number; y: number };
};

/** Converts browser coordinates into logical world coordinates. */
export function tilePointFromPointer(input: PointerCoordinates): Point {
  return {
    col: Math.floor((input.clientX - input.rect.left - input.camera.x) / TILE_SIZE),
    row: Math.floor((input.clientY - input.rect.top - input.camera.y) / TILE_SIZE)
  };
}

export function acceptsPointer(pointerType: string, button: number) {
  return pointerType !== 'mouse' || button === 0;
}
