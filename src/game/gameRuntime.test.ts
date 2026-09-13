import { Container } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBattle } from './battle/engine';
import { createCombatant } from './battle/rules';
import { createGameController } from './gameController';
import { createGameRuntime } from './gameRuntime';
import { createTileStore } from './tileStore';
import type { WorldMap } from './types';

const map: WorldMap = {
  width: 20,
  height: 20,
  spawn: { col: 4, row: 4 },
  tiles: Array.from({ length: 400 }, (_, index) => ({
    col: index % 20,
    row: Math.floor(index / 20),
    kind: 'grass' as const,
    walkable: true
  }))
};

function fakeApplication() {
  const callbacks = new Set<(ticker: { deltaMS: number }) => void>();
  const canvas = {
    dataset: {} as DOMStringMap,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 320, height: 240 })
  };
  const app = {
    stage: new Container(),
    canvas,
    init: () => Promise.resolve(),
    render: () => undefined,
    ticker: {
      add: (callback: (ticker: { deltaMS: number }) => void) => callbacks.add(callback),
      remove: (callback: (ticker: { deltaMS: number }) => void) => callbacks.delete(callback),
      start: () => undefined,
      stop: () => undefined
    },
    destroy: () => undefined
  };
  return {
    app,
    tick: (deltaMS = 16) => callbacks.forEach((callback) => callback({ deltaMS }))
  };
}

function testHost() {
  return {
    clientWidth: 320,
    clientHeight: 240,
    appendChild: (child: { parentNode?: unknown; remove?: () => void }) => {
      child.parentNode = true;
      child.remove = () => { child.parentNode = null; };
      return child;
    }
  } as unknown as HTMLElement;
}

async function settleRuntime() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function worldLayers(app: ReturnType<typeof fakeApplication>['app']) {
  const world = app.stage.children[0] as Container;
  return {
    depth: world.children[2] as Container,
    overlay: world.children[3] as Container
  };
}

function battleFighters(app: ReturnType<typeof fakeApplication>['app']) {
  return worldLayers(app).depth.children.find((child) => child.label === 'world-battle-fighters') as Container | undefined;
}

describe('world battle map projection', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { devicePixelRatio: 1 });
    vi.stubGlobal('document', { hidden: false, addEventListener: () => undefined, removeEventListener: () => undefined });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('keeps a battle world-anchored while destination movement changes', async () => {
    const controller = createGameController(map);
    controller.battles.create({ col: 5, row: 4 }, createBattle([
      createCombatant('adventurer', 'player', { col: 2, row: 4 }, 'adventurer'),
      createCombatant('goblin', 'goblin', { col: 6, row: 4 })
    ]));
    const fake = fakeApplication();
    const runtime = createGameRuntime({ host: testHost(), map, controller, tileStore: createTileStore(map), applicationFactory: () => fake.app as never });
    await settleRuntime();
    const before = battleFighters(fake.app)!;
    const beforePosition = { x: before.position.x, y: before.position.y };
    controller.requestDestination({ col: 7, row: 4 });
    fake.tick();
    expect(battleFighters(fake.app)?.position).toMatchObject(beforePosition);
    runtime.destroy();
  });

  it('hides the ordinary player while preserving the battle representative', async () => {
    const controller = createGameController(map);
    controller.battles.create({ col: 5, row: 4 }, createBattle('goblin'));
    const fake = fakeApplication();
    const runtime = createGameRuntime({ host: testHost(), map, controller, tileStore: createTileStore(map), applicationFactory: () => fake.app as never });
    await settleRuntime();
    const { depth } = worldLayers(fake.app);
    const ordinaryPlayer = depth.children.find((child) => child.label !== 'world-battle-fighters' && child.children.length > 20) as Container;
    expect(ordinaryPlayer.visible).toBe(false);
    const fighters = battleFighters(fake.app)!;
    expect(fighters.visible).toBe(true);
    expect(fighters.children).toHaveLength(2);
    runtime.destroy();
  });

  it('reconciles battle views on registry removal and viewport exit', async () => {
    const controller = createGameController(map);
    const battle = controller.battles.create({ col: 5, row: 4 }, createBattle([
      createCombatant('adventurer', 'player', { col: 2, row: 4 }, 'adventurer'),
      createCombatant('goblin', 'goblin', { col: 6, row: 4 })
    ]));
    const fake = fakeApplication();
    const runtime = createGameRuntime({ host: testHost(), map, controller, tileStore: createTileStore(map), applicationFactory: () => fake.app as never });
    await settleRuntime();
    expect(battleFighters(fake.app)).toBeDefined();
    controller.movement.tile = { col: 15, row: 15 };
    controller.movement.position = { x: 15.5, y: 15.5 };
    fake.tick();
    expect(battleFighters(fake.app)).toBeUndefined();
    controller.movement.tile = { col: 4, row: 4 };
    controller.movement.position = { x: 4.5, y: 4.5 };
    fake.tick();
    expect(battleFighters(fake.app)).toBeDefined();
    controller.battles.remove(battle.id);
    fake.tick();
    expect(battleFighters(fake.app)).toBeUndefined();
    runtime.destroy();
  });
});
