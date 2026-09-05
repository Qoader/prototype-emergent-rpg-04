import { describe, expect, it } from 'vitest';
import { createMap } from './map';
import { createGameController } from './gameController';
import type { WorldMap } from './types';

const openMap = (): WorldMap => ({
  width: 6,
  height: 6,
  spawn: { col: 1, row: 1 },
  tiles: Array.from({ length: 36 }, (_, index) => ({
    col: index % 6,
    row: Math.floor(index / 6),
    kind: 'grass' as const,
    walkable: true
  }))
});

describe('game controller integration', () => {
  it('converts canvas input into a route and advances to arrival', () => {
    const controller = createGameController(openMap());
    const destination = controller.pointerDown({
      clientX: 3 * 48 + 10,
      clientY: 1 * 48 + 10,
      pointerType: 'touch',
      button: 0,
      rect: { left: 10, top: 10 },
      camera: { x: 0, y: 0 }
    });

    expect(destination).toEqual({ col: 3, row: 1 });
    expect(controller.movement.route).toEqual([{ col: 2, row: 1 }, { col: 3, row: 1 }]);
    controller.tick(1 / 3);
    expect(controller.movement.tile).toEqual({ col: 3, row: 1 });
    expect(controller.movement.destination).toBeNull();
  });

  it('accounts for camera translation and ignores secondary mouse input', () => {
    const controller = createGameController(openMap());
    expect(controller.pointerDown({
      clientX: 200,
      clientY: 100,
      pointerType: 'mouse',
      button: 2,
      rect: { left: 0, top: 0 },
      camera: { x: -100, y: -50 }
    })).toBeNull();
    expect(controller.movement.destination).toBeNull();

    expect(controller.pointerDown({
      clientX: 100,
      clientY: 50,
      pointerType: 'mouse',
      button: 0,
      rect: { left: 0, top: 0 },
      camera: { x: -48, y: 0 }
    })).toEqual({ col: 3, row: 1 });
  });

  it('resolves a blocked request to a reachable tile and retargets mid-route', () => {
    const map = createMap(7331);
    const controller = createGameController(map);
    const first = map.spawn;
    const requested = { col: first.col + 1, row: first.row + 1 };
    const destination = controller.requestDestination(requested);
    expect(destination).not.toBeNull();
    controller.tick(0.05);
    const retarget = controller.requestDestination({ col: first.col, row: first.row });
    expect(retarget).toEqual(first);
    expect(controller.movement.route).toEqual([]);
    expect(controller.movement.destination).toEqual(first);
    controller.tick(0);
    expect(controller.movement.destination).toBeNull();
  });
});
