import { findPath, resolveDestination } from './pathfinding';
import { advanceMovement, createMovement } from './movement';
import type { Point, WorldMap } from './types';
import { TILE_SIZE } from './map';

export type PointerInput = {
  clientX: number;
  clientY: number;
  pointerType: string;
  button: number;
  rect: { left: number; top: number };
  camera: { x: number; y: number };
};

/** Gameplay state boundary used by the renderer and by integration tests. */
export function createGameController(map: WorldMap) {
  const movement = createMovement(map.spawn);

  const requestDestination = (requested: Point) => {
    const destination = resolveDestination(map, movement.tile, requested);
    if (!destination) return null;
    movement.route = findPath(map, movement.tile, destination) ?? [];
    movement.destination = destination;
    return destination;
  };

  const pointerDown = (input: PointerInput) => {
    if (input.pointerType === 'mouse' && input.button !== 0) return null;
    return requestDestination({
      col: Math.floor((input.clientX - input.rect.left - input.camera.x) / TILE_SIZE),
      row: Math.floor((input.clientY - input.rect.top - input.camera.y) / TILE_SIZE)
    });
  };

  const tick = (deltaSeconds: number) => advanceMovement(movement, deltaSeconds);

  return { movement, pointerDown, requestDestination, tick };
}

export type GameController = ReturnType<typeof createGameController>;
