import { describe, expect, it, vi } from 'vitest';
import { createGameController, ENEMY_ACTION_DELAY_SECONDS } from './gameController';
import type { WorldMap } from './types';
import { createBattleFixture } from './e2eBattleFixture';
import { createCombatant } from './battle/rules';
const map: WorldMap = {
  width: 8,
  height: 8,
  spawn: { col: 1, row: 1 },
  tiles: Array.from({ length: 64 }, (_, i) => ({
    col: i % 8,
    row: Math.floor(i / 8),
    kind: 'grass' as const,
    walkable: true
  })),
  goblinNests: [
    {
      id: 'n',
      col: 1,
      row: 1,
      spawnTiles: [
        { col: 1, row: 1 },
        { col: 2, row: 1 },
        { col: 1, row: 2 }
      ]
    }
  ]
};
const reinforcementAndTargetMap: WorldMap = {
  width: 20,
  height: 8,
  spawn: { col: 1, row: 1 },
  tiles: Array.from({ length: 160 }, (_, i) => ({
    col: i % 20,
    row: Math.floor(i / 20),
    kind: 'grass' as const,
    walkable: true
  })),
  settlements: [
    {
      id: 'join',
      name: 'Join',
      kind: 'village',
      countryId: 'test',
      col: 7,
      row: 1,
      radius: 1,
      bounds: { left: 6, top: 0, right: 8, bottom: 2 },
      gates: []
    },
    {
      id: 'target',
      name: 'Target',
      kind: 'village',
      countryId: 'test',
      col: 10,
      row: 1,
      radius: 1,
      bounds: { left: 9, top: 0, right: 11, bottom: 2 },
      gates: []
    }
  ],
  goblinNests: [
    {
      id: 'battle',
      col: 1,
      row: 1,
      spawnTiles: [
        { col: 1, row: 1 },
        { col: 1, row: 2 },
        { col: 2, row: 2 }
      ]
    },
    {
      id: 'remote',
      col: 10,
      row: 3,
      spawnTiles: [
        { col: 10, row: 3 },
        { col: 10, row: 4 },
        { col: 11, row: 4 }
      ]
    }
  ]
};
describe('controller battle coordination', () => {
  it('publishes busy playback, rejects commands during it, then leaves active player ready to attack', () => {
    const c = createGameController(map);
    c.tick(1 / 60);
    expect(c.getSnapshot().battleBusy).toBe(false);
    expect(
      c.dispatchBattle({ kind: 'move', actorId: 'player', destination: { col: 5, row: 4 } })
    ).toBe(true);
    expect(c.getSnapshot().battleBusy).toBe(true);
    expect(c.getSnapshot().battle?.visual?.player?.moving).toBe(true);
    expect(c.dispatchBattle({ kind: 'end-turn', actorId: 'player' })).toBe(false);
    expect(c.getSnapshot().battle?.combatants.player.mp).toBe(0);
    c.tick(0.6);
    const snapshot = c.getSnapshot();
    expect(snapshot.battleBusy).toBe(false);
    expect(snapshot.battle?.visual).toBeUndefined();
    expect(snapshot.battle?.activeId).toBe('player');
    expect(snapshot.battle?.combatants.player.mp).toBe(0);
    expect(snapshot.battle?.combatants.player.ap).toBe(1);
  });
  it('starts contact and waits 0.9 seconds before exactly one AI command', () => {
    const c = createGameController(map);
    c.tick(1 / 60);
    expect(c.mode).toBe('battle');
    c.dispatchBattle({ kind: 'end-turn', actorId: 'player' });
    const before = c.battle!.combatants['goblin-n-0']!.position;
    c.tick(0.89);
    expect(c.battle!.combatants['goblin-n-0']!.position).toEqual(before);
    c.tick(0.01);
    expect(c.battle!.combatants['goblin-n-0']!.position).not.toEqual(before);
  });
  it('plays back a selected goblin AI move from its event path before accepting another command', () => {
    const c = createGameController(map);
    c.tick(1 / 60);
    expect(c.dispatchBattle({ kind: 'end-turn', actorId: 'player' })).toBe(true);

    c.tick(ENEMY_ACTION_DELAY_SECONDS);
    const started = c.getSnapshot();
    expect(started.battle?.combatants['goblin-n-0']?.position).toEqual({ col: 3, row: 4 });
    expect(started.battleBusy).toBe(true);
    expect(started.battle?.visual).toEqual({
      'goblin-n-0': { x: 6.5, y: 4.5, facing: 'south', moving: true, elapsed: 0 }
    });
    expect(c.dispatchBattle({ kind: 'end-turn', actorId: 'goblin-n-0' })).toBe(false);

    c.tick(0.25);
    expect(c.getSnapshot().battle?.visual?.['goblin-n-0']).toMatchObject({
      x: 5,
      y: 4.5,
      facing: 'west',
      moving: true
    });
    c.tick(0.25);
    expect(c.getSnapshot().battleBusy).toBe(false);
    expect(c.getSnapshot().battle?.visual).toBeUndefined();
  });
  it('plays back a selected adventurer AI move using that actor’s event path', () => {
    const c = createGameController(map);
    c.tick(1 / 60);
    const battle = c.battle!;
    battle.combatants['adventurer-test'] = createCombatant(
      'adventurer-test',
      'player',
      { col: 2, row: 4 },
      'adventurer'
    );
    battle.turnOrder.splice(1, 0, 'adventurer-test');
    expect(c.dispatchBattle({ kind: 'end-turn', actorId: 'player' })).toBe(true);
    expect(c.battle?.activeId).toBe('adventurer-test');

    c.tick(ENEMY_ACTION_DELAY_SECONDS);
    const started = c.getSnapshot();
    expect(started.battle?.combatants['adventurer-test']?.position).toEqual({ col: 5, row: 4 });
    expect(started.battleBusy).toBe(true);
    expect(started.battle?.visual).toEqual({
      'adventurer-test': { x: 2.5, y: 4.5, facing: 'south', moving: true, elapsed: 0 }
    });
  });
  it('holds a move-exhausted turn boundary until the selected actor finishes walking', () => {
    const c = createGameController(map);
    c.tick(1 / 60);
    const adventurerStep = vi.spyOn(c.adventurers, 'step');
    const goblinStep = vi.spyOn(c.goblins, 'step');
    // A move with no AP and exactly three MP emits both move and turn-ended.
    c.battle!.combatants.player.ap = 0;
    expect(
      c.dispatchBattle({ kind: 'move', actorId: 'player', destination: { col: 5, row: 4 } })
    ).toBe(true);
    expect(c.getSnapshot().battleBusy).toBe(true);
    expect(c.battle?.activeId).toBe('player');
    expect(adventurerStep).not.toHaveBeenCalled();
    expect(goblinStep).not.toHaveBeenCalled();

    c.tick(0.49);
    expect(c.battle?.activeId).toBe('player');
    expect(adventurerStep).not.toHaveBeenCalled();
    c.tick(0.02);
    expect(c.getSnapshot().battleBusy).toBe(false);
    expect(c.battle?.activeId).toBe('goblin-n-0');
    expect(adventurerStep).toHaveBeenCalledTimes(180);
    expect(goblinStep).toHaveBeenCalledTimes(180);
  });
  it('advances a fixed three seconds and admits nearby reinforcements at a turn boundary', () => {
    const c = createGameController(map);
    c.tick(1 / 60);
    const adventurerStep = vi.spyOn(c.adventurers, 'step');
    const goblinStep = vi.spyOn(c.goblins, 'step');
    // The other nest goblins begin adjacent and cover their one-tile route
    // during the first 180 fixed steps.
    expect(c.dispatchBattle({ kind: 'end-turn', actorId: 'player' })).toBe(true);
    expect(adventurerStep).toHaveBeenCalledTimes(180);
    expect(goblinStep).toHaveBeenCalledTimes(180);
    expect(adventurerStep.mock.calls.every(([delta]) => delta === 1 / 60)).toBe(true);
    expect(goblinStep.mock.calls.every(([delta]) => delta === 1 / 60)).toBe(true);
    expect(c.battle?.log.some((event) => event.kind === 'combatant-joined')).toBe(true);
    expect(c.battle?.combatants['goblin-n-1']?.eligibleFromRound).toBe(2);
  });
  it('completes player and AI turn boundaries while preserving uncommitted adventurer targets', () => {
    const c = createGameController(reinforcementAndTargetMap);
    const remoteTarget = (tile: { col: number; row: number }) => [
      { id: 'adventurer-target', kind: 'adventurer' as const, tile }
    ];
    c.goblins.tick(0.2, remoteTarget({ col: 13, row: 3 }));
    for (let index = 0; index < 12; index += 1)
      c.goblins.tick(0.1, remoteTarget({ col: 13, row: 3 }));
    for (let index = 0; index < 12; index += 1)
      c.goblins.tick(0.1, remoteTarget({ col: 10, row: 3 }));
    for (let index = 0; index < 12; index += 1)
      c.goblins.tick(0.1, remoteTarget({ col: 13, row: 3 }));

    c.startBattleForTest('goblin-battle-0');
    expect(c.dispatchBattle({ kind: 'end-turn', actorId: 'player' })).toBe(true);
    expect(
      c.battle?.log.some(
        (event) => event.kind === 'combatant-joined' && event.actorId === 'adventurer-join'
      )
    ).toBe(true);
    expect(c.goblins.snapshots().find((goblin) => goblin.id === 'goblin-remote-0')?.targetId).toBe(
      'adventurer-target'
    );

    c.battle!.combatants['goblin-battle-0']!.mp = 0;
    c.tick(ENEMY_ACTION_DELAY_SECONDS);
    expect(c.battle?.activeId).toBe('player');

    c.battle!.combatants.player.position = { col: 4, row: 3 };
    c.battle!.combatants['goblin-battle-0']!.position = { col: 5, row: 3 };
    c.battle!.combatants.player.mp = 0;
    expect(
      c.dispatchBattle({ kind: 'attack', actorId: 'player', targetId: 'goblin-battle-0' })
    ).toBe(true);
    expect(c.battle?.activeId).toBe('goblin-battle-0');
    c.battle!.combatants['goblin-battle-0']!.mp = 0;
    expect(c.dispatchBattle({ kind: 'end-turn', actorId: c.battle!.activeId })).toBe(true);
  });
  it('blocks overworld navigation while battle is active', () => {
    const c = createGameController(map);
    c.tick(1 / 60);
    expect(c.requestDestination({ col: 4, row: 4 })).toBeNull();
  });
  it('removes a victorious goblin exactly once and returns from result', () => {
    const c = createGameController(map);
    c.tick(1 / 60);
    const battle = c.battle!;
    battle.combatants.player.position = { col: 4, row: 3 };
    battle.combatants['goblin-n-0']!.position = { col: 5, row: 3 };
    battle.combatants['goblin-n-0']!.hp = 4;
    expect(c.dispatchBattle({ kind: 'attack', actorId: 'player', targetId: 'goblin-n-0' })).toBe(
      true
    );
    expect(c.mode).toBe('result');
    expect(c.goblins.snapshots().some((g) => g.id === 'goblin-n-0')).toBe(false);
    c.continueFromResult();
    expect(c.mode).toBe('exploration');
    c.continueFromResult();
    expect(c.goblins.snapshots().some((g) => g.id === 'goblin-n-0')).toBe(false);
  });
  it('freezes surviving NPCs through a player victory, result ticks, and Continue before exploration resumes', () => {
    const c = createGameController(reinforcementAndTargetMap);
    c.startBattleForTest('goblin-battle-0');
    // Bring the responding adventurer all the way to the fixed encounter
    // tile before the terminal action. This exercises the arrived-survivor
    // cleanup path, which prepares its return route without moving it.
    c.adventurers.step(2);
    const beforeAdventurers = c.adventurers.snapshots();
    const arrivedAdventurer = beforeAdventurers.find(
      (adventurer) => adventurer.id === 'adventurer-join'
    );
    expect(arrivedAdventurer?.tile).toEqual({ col: 1, row: 1 });
    expect(arrivedAdventurer?.position).toEqual({ x: 1.5, y: 1.5 });
    const beforeGoblins = c.goblins.snapshots().filter((goblin) => goblin.id !== 'goblin-battle-0');
    const adventurerStep = vi.spyOn(c.adventurers, 'step');
    const goblinStep = vi.spyOn(c.goblins, 'step');
    const battle = c.battle!;
    battle.combatants.player.position = { col: 4, row: 3 };
    battle.combatants['goblin-battle-0']!.position = { col: 5, row: 3 };
    battle.combatants['goblin-battle-0']!.hp = 4;

    expect(
      c.dispatchBattle({ kind: 'attack', actorId: 'player', targetId: 'goblin-battle-0' })
    ).toBe(true);
    expect(c.mode).toBe('result');
    expect(adventurerStep).not.toHaveBeenCalled();
    expect(goblinStep).not.toHaveBeenCalled();
    expect(
      c.adventurers.snapshots().map(({ id, tile, position }) => ({ id, tile, position }))
    ).toEqual(beforeAdventurers.map(({ id, tile, position }) => ({ id, tile, position })));
    const arrivedAfterVictory = c.adventurers
      .snapshots()
      .find((adventurer) => adventurer.id === 'adventurer-join');
    expect(arrivedAfterVictory?.tile).toEqual({ col: 1, row: 1 });
    expect(arrivedAfterVictory?.position).toEqual({ x: 1.5, y: 1.5 });
    expect(c.goblins.snapshots().map(({ id, tile, position }) => ({ id, tile, position }))).toEqual(
      beforeGoblins.map(({ id, tile, position }) => ({ id, tile, position }))
    );

    c.tick(30);
    expect(adventurerStep).not.toHaveBeenCalled();
    expect(goblinStep).not.toHaveBeenCalled();
    c.continueFromResult();
    expect(c.mode).toBe('exploration');
    expect(adventurerStep).not.toHaveBeenCalled();
    expect(goblinStep).not.toHaveBeenCalled();

    c.tick(1 / 60);
    expect(adventurerStep).toHaveBeenCalledTimes(1);
    expect(goblinStep).toHaveBeenCalledTimes(1);
    expect(adventurerStep).toHaveBeenLastCalledWith(1 / 60);
    expect(goblinStep.mock.calls.at(-1)?.[0]).toBe(1 / 60);
  });
  it('publishes one snapshot for a terminal command and one for Continue', () => {
    const c = createGameController(map);
    const snapshots: string[] = [];
    c.subscribe((snapshot) => snapshots.push(snapshot.mode));
    snapshots.length = 0;
    c.tick(1 / 60);
    snapshots.length = 0;
    const battle = c.battle!;
    battle.combatants.player.position = { col: 4, row: 3 };
    battle.combatants['goblin-n-0']!.position = { col: 5, row: 3 };
    battle.combatants['goblin-n-0']!.hp = 4;
    expect(c.dispatchBattle({ kind: 'attack', actorId: 'player', targetId: 'goblin-n-0' })).toBe(
      true
    );
    expect(snapshots).toEqual(['result']);
    c.continueFromResult();
    expect(snapshots).toEqual(['result', 'exploration']);
  });
  it('relocates a defeated player to the checkpoint', () => {
    const fixture = createBattleFixture(true, false);
    const c = createGameController(fixture);
    expect(c.checkpoints.checkpoint).toEqual({
      settlementId: 'fixture-settlement',
      tile: { col: 1, row: 1 }
    });
    c.movement.tile = { col: 4, row: 4 };
    c.movement.position = { x: 4.5, y: 4.5 };
    c.movement.route = [{ col: 5, row: 4 }];
    c.movement.destination = { col: 5, row: 4 };
    c.startBattleForTest('goblin-fixture-nest-0');
    const battle = c.battle!;
    battle.combatants.player.position = { col: 4, row: 3 };
    battle.combatants['goblin-fixture-nest-0']!.position = { col: 5, row: 3 };
    battle.combatants.player.hp = 3;
    expect(c.dispatchBattle({ kind: 'end-turn', actorId: 'player' })).toBe(true);
    c.tick(0.9);
    expect(c.mode).toBe('result');
    expect(c.battle?.outcome).toBe('defeat');
    expect(c.battle?.combatants.player.hp).toBe(0);
    expect(c.movement.tile).toEqual({ col: 1, row: 1 });
    expect(c.movement.position).toEqual({ x: 1.5, y: 1.5 });
    expect(c.movement.route).toEqual([]);
    expect(c.movement.destination).toBeNull();
    c.continueFromResult();
    expect(c.mode).toBe('exploration');
    expect(c.movement.tile).toEqual({ col: 1, row: 1 });
  });
  it('does not advance world simulation for an AI-issued defeat', () => {
    const fixture = createBattleFixture(true, false);
    const c = createGameController(fixture);
    c.startBattleForTest('goblin-fixture-nest-0');
    const battle = c.battle!;
    battle.combatants.player.position = { col: 4, row: 3 };
    battle.combatants['goblin-fixture-nest-0']!.position = { col: 5, row: 3 };
    battle.combatants.player.hp = 3;
    expect(c.dispatchBattle({ kind: 'end-turn', actorId: 'player' })).toBe(true);
    const beforeAdventurers = c.adventurers.snapshots();
    const survivingAdventurer = beforeAdventurers.find(
      (adventurer) => adventurer.id === 'adventurer-fixture-settlement'
    );
    const beforeGoblins = c.goblins.snapshots();
    const adventurerStep = vi.spyOn(c.adventurers, 'step');
    const goblinStep = vi.spyOn(c.goblins, 'step');

    c.tick(ENEMY_ACTION_DELAY_SECONDS);

    expect(c.mode).toBe('result');
    expect(c.battle?.outcome).toBe('defeat');
    expect(adventurerStep).not.toHaveBeenCalled();
    expect(goblinStep).not.toHaveBeenCalled();
    expect(
      c.adventurers.snapshots().map(({ id, tile, position }) => ({ id, tile, position }))
    ).toEqual(beforeAdventurers.map(({ id, tile, position }) => ({ id, tile, position })));
    const survivingAdventurerAfterDefeat = c.adventurers
      .snapshots()
      .find((adventurer) => adventurer.id === 'adventurer-fixture-settlement');
    expect(survivingAdventurerAfterDefeat?.tile).toEqual(survivingAdventurer?.tile);
    expect(survivingAdventurerAfterDefeat?.position).toEqual(survivingAdventurer?.position);
    expect(c.goblins.snapshots().map(({ id, tile, position }) => ({ id, tile, position }))).toEqual(
      beforeGoblins.map(({ id, tile, position }) => ({ id, tile, position }))
    );
  });
});
