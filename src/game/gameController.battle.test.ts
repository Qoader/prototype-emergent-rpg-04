import { describe, expect, it } from 'vitest';
import { createGameController } from './gameController';
import type { WorldMap } from './types';
import { createBattleFixture } from './e2eBattleFixture';
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
  it('advances a fixed three seconds and admits nearby reinforcements at a turn boundary', () => {
    const c = createGameController(map);
    c.tick(1 / 60);
    // The other nest goblins begin adjacent and cover their one-tile route
    // during the first 180 fixed steps.
    expect(c.dispatchBattle({ kind: 'end-turn', actorId: 'player' })).toBe(true);
    expect(c.battle?.log.some((event) => event.kind === 'combatant-joined')).toBe(true);
    expect(c.battle?.combatants['goblin-n-1']?.eligibleFromRound).toBe(2);
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
});
