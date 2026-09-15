import { describe, expect, it, vi } from 'vitest';
import { createMap } from './map';
import { createGameController } from './gameController';
import type { WorldMap } from './types';
import { createBattleFixture } from './e2eBattleFixture';
import { createTileStore } from './tileStore';

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
  it('requires an open inventory session and drops at the completed next tile', () => {
    const controller = createGameController(openMap());
    controller.requestDestination({ col: 3, row: 1 });
    expect(controller.openInventory()).toBe(true);
    expect(controller.dropItem('ration', 1)).toMatchObject({ ok: false });
    controller.tick(0.01);
    expect(controller.movement.tile).toEqual({ col: 2, row: 1 });
    expect(controller.dropItem('ration', 1)).toMatchObject({ ok: true });
    expect(controller.groundAt({ col: 2, row: 1 })).toEqual([{ id: 'ration', quantity: 1 }]);
    controller.closeInventory();
    expect(controller.dropItem('ration', 1)).toMatchObject({ ok: false });
  });
  it('allows manual NPC drops at the actor tile and rejects committed battle members', () => {
    const controller = createGameController(createBattleFixture(false, false));
    const id = 'goblin-fixture-nest-0';
    const before = controller.goblins.snapshots().find((actor) => actor.id === id)!;
    expect(controller.dropActorItem(id, 'ration', 1)).toMatchObject({ ok: true });
    expect(controller.groundAt(before.tile)).toEqual([{ id: 'ration', quantity: 1 }]);
    controller.startBattleForTest(id);
    expect(controller.dropActorItem(id, 'ration', 1)).toMatchObject({ ok: false });
  });
  it('keeps session ground when terrain chunk caches are evicted', () => {
    const map = openMap();
    const tiles = createTileStore(map);
    const controller = createGameController(map, tiles);
    controller.openInventory();
    expect(controller.dropItem('ration', 1)).toMatchObject({ ok: true });
    tiles.retainChunks(new Set());
    tiles.clear();
    expect(controller.groundAt(map.spawn)).toEqual([{ id: 'ration', quantity: 1 }]);
  });
  it('retains player gear after an actual defeat and respawn', () => {
    const c = createGameController(createBattleFixture(true, false));
    const before = c.inventory();
    c.startBattleForTest('goblin-fixture-nest-0');
    const battle = c.battle!;
    battle.combatants.player.position = { col: 4, row: 3 };
    battle.combatants['goblin-fixture-nest-0']!.position = { col: 5, row: 3 };
    battle.combatants.player.hp = 3;
    c.dispatchBattle({ kind: 'end-turn', actorId: 'player' });
    c.tick(0.9);
    expect(c.mode).toBe('result');
    c.continueFromResult();
    expect(c.inventory()).toEqual(before);
  });
  it('drops NPC loot only once when a lethal transition is revisited', () => {
    const c = createGameController(createBattleFixture(false, false));
    c.startBattleForTest('goblin-fixture-nest-0');
    const battle = c.battle!;
    battle.combatants.player.position = { col: 4, row: 3 };
    battle.combatants['goblin-fixture-nest-0']!.position = { col: 5, row: 3 };
    battle.combatants['goblin-fixture-nest-0']!.hp = 1;
    expect(
      c.dispatchBattle({ kind: 'attack', actorId: 'player', targetId: 'goblin-fixture-nest-0' })
    ).toBe(true);
    const loot = c.groundAt({ col: 1, row: 1 });
    c.tick(0);
    expect(c.groundAt({ col: 1, row: 1 })).toEqual(loot);
  });
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
    expect(controller.movement.route).toEqual([
      { col: 2, row: 1 },
      { col: 3, row: 1 }
    ]);
    controller.tick(1 / 3);
    expect(controller.movement.tile).toEqual({ col: 3, row: 1 });
    expect(controller.movement.destination).toBeNull();
  });

  it('searches stationary ground with an injected random source and locks exploration until closed', () => {
    const controller = createGameController(openMap(), undefined, { random: () => 0 });
    controller.openInventory();
    controller.dropItem('ration', 1);
    controller.closeInventory();
    controller.pointerDown({
      clientX: 58,
      clientY: 58,
      pointerType: 'mouse',
      button: 0,
      rect: { left: 0, top: 0 },
      camera: { x: 0, y: 0 }
    });
    expect(controller.getSnapshot().interaction.kind).toBe('menu');
    expect(controller.startSearch()).toBe(true);
    expect(controller.requestDestination({ col: 2, row: 1 })).toBeNull();
    expect(controller.openInventory()).toBe(false);
    controller.tick(5);
    expect(controller.getSnapshot().interaction).toMatchObject({
      kind: 'results',
      found: [{ id: 'ration', quantity: 1 }]
    });
    expect(controller.takeFoundItem('ration', 1)).toMatchObject({ ok: true });
    expect(controller.groundAt({ col: 1, row: 1 })).toEqual([]);
    expect(controller.getSnapshot().interaction).toMatchObject({
      kind: 'results',
      found: [],
      foundAny: true
    });
    expect(controller.closeInteraction()).toBe(true);
  });

  it('dismisses tile actions and starts navigation when another tile is clicked', () => {
    const controller = createGameController(openMap());
    controller.pointerDown({
      clientX: 58,
      clientY: 58,
      pointerType: 'mouse',
      button: 0,
      rect: { left: 0, top: 0 },
      camera: { x: 0, y: 0 }
    });
    expect(controller.getSnapshot().interaction.kind).toBe('menu');
    expect(
      controller.pointerDown({
        clientX: 2 * 48 + 10,
        clientY: 1 * 48 + 10,
        pointerType: 'mouse',
        button: 0,
        rect: { left: 0, top: 0 },
        camera: { x: 0, y: 0 }
      })
    ).toEqual({ col: 2, row: 1 });
    expect(controller.getSnapshot().interaction.kind).toBe('none');
    expect(controller.movement.route).toEqual([{ col: 2, row: 1 }]);
  });

  it('lets a same-step encounter interrupt search before discovery rolls', () => {
    const random = vi.fn(() => 0);
    const controller = createGameController(createBattleFixture(false, true), undefined, {
      random
    });
    controller.pointerDown({
      clientX: 58,
      clientY: 58,
      pointerType: 'mouse',
      button: 0,
      rect: { left: 0, top: 0 },
      camera: { x: 0, y: 0 }
    });
    controller.startSearch();
    controller.tick(5);
    expect(controller.mode).toBe('battle');
    expect(controller.getSnapshot().interaction).toEqual({ kind: 'none' });
    expect(random).not.toHaveBeenCalled();
  });

  it('accounts for camera translation and ignores secondary mouse input', () => {
    const controller = createGameController(openMap());
    expect(
      controller.pointerDown({
        clientX: 200,
        clientY: 100,
        pointerType: 'mouse',
        button: 2,
        rect: { left: 0, top: 0 },
        camera: { x: -100, y: -50 }
      })
    ).toBeNull();
    expect(controller.movement.destination).toBeNull();

    expect(
      controller.pointerDown({
        clientX: 100,
        clientY: 50,
        pointerType: 'mouse',
        button: 0,
        rect: { left: 0, top: 0 },
        camera: { x: -48, y: 0 }
      })
    ).toEqual({ col: 3, row: 1 });
  });

  // Measured on the supported Node 24 runner: worst-case route resolution is
  // CPU-bound and can exceed Vitest's five-second default.
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
  }, 30000);
});
