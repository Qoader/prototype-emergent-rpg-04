import { planNavigation } from './pathfinding';
import { advanceMovement, createMovement } from './movement';
import type { Point, TileReader, WorldMap } from './types';
import { acceptsPointer, tilePointFromPointer } from './input';

export type PointerInput = {
  clientX: number;
  clientY: number;
  pointerType: string;
  button: number;
  rect: { left: number; top: number };
  camera: { x: number; y: number };
};

/** Gameplay state boundary used by the renderer and by integration tests. */
export function createGameController(map: WorldMap, tiles?: TileReader) {
  const movement = createMovement(map.spawn);

  const requestDestination = (requested: Point) => {
    const plan = planNavigation(tiles ?? map, movement.tile, requested);
    if (!plan) return null;
    movement.route = plan.route;
    movement.destination = plan.destination;
    return plan.destination;
  };

  const pointerDown = (input: PointerInput) => {
    if (!acceptsPointer(input.pointerType, input.button)) return null;
    return requestDestination(tilePointFromPointer(input));
  };

  const tick = (deltaSeconds: number) => advanceMovement(movement, deltaSeconds);

  return { movement, pointerDown, requestDestination, tick };
}

export type GameController = ReturnType<typeof createGameController>;
