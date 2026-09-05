import { planNavigation } from './pathfinding';
import { advanceMovement, createMovement } from './movement';
import type { Point, TileReader, WorldMap } from './types';
import { acceptsPointer, tilePointFromPointer } from './input';
import { createAdventurerSimulation } from './adventurers';
import { tileAt } from './map';
import { createGoblinSimulation, type GoblinTarget } from './goblins';

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
  const reader = tiles ?? { width: map.width, height: map.height, getTile: (point: Point) => tileAt(map, point) };
  const adventurers = createAdventurerSimulation(map, reader);
  const goblins = createGoblinSimulation({ seed: map.seed, nests: map.goblinNests ?? [], tiles: reader, settlements: map.settlements });

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

  const tick = (deltaSeconds: number) => {
    advanceMovement(movement, deltaSeconds);
    adventurers.tick(deltaSeconds);
    const targets: GoblinTarget[] = [{ id: 'player', kind: 'player', tile: movement.tile, position: { ...movement.position } }, ...adventurers.snapshots().map((npc) => ({ id: npc.id, kind: 'adventurer' as const, tile: npc.tile, position: npc.position }))];
    goblins.tick(deltaSeconds, targets);
  };

  return { movement, pointerDown, requestDestination, tick, adventurers, goblins };
}

export type GameController = ReturnType<typeof createGameController>;
