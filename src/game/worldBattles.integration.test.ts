import { describe, expect, it } from 'vitest';
import { createGameController } from './gameController';
import { createBattle } from './battle/engine';
import { createCombatant } from './battle/rules';
import type { WorldMap } from './types';

const map: WorldMap = {
  width: 6, height: 4, spawn: { col: 1, row: 1 },
  tiles: Array.from({ length: 24 }, (_, index) => ({ col: index % 6, row: Math.floor(index / 6), kind: 'grass' as const, walkable: true }))
};
const npcBattle = (adventurer: string, goblin: string) => createBattle([
  createCombatant(adventurer, 'player', { col: 2, row: 4 }, 'adventurer'),
  createCombatant(goblin, 'goblin', { col: 6, row: 4 })
]);

describe('world battle integration', () => {
  it('lets the player enter an existing NPC battle without recreating it', () => {
    const controller = createGameController(map);
    const initial = createBattle([
      createCombatant('adventurer-a', 'player', { col: 2, row: 4 }, 'adventurer'),
      createCombatant('goblin-a', 'goblin', { col: 6, row: 4 })
    ]);
    const battle = controller.battles.create({ col: 2, row: 1 }, initial);
    controller.requestDestination({ col: 2, row: 1 });
    controller.tick(1 / 3);
    expect(controller.mode).toBe('battle');
    expect(controller.getSnapshot().selectedBattleId).toBe(battle.id);
    expect(controller.getSnapshot().playerEntry).toBe('admitted');
    expect(Object.keys(controller.battles.get(battle.id)!.battle.combatants)).toContain('player');
  });

  it('keeps distinct battles independent', () => {
    const controller = createGameController(map);
    const first = controller.battles.create({ col: 2, row: 1 }, npcBattle('adventurer-a', 'goblin-a'));
    const second = controller.battles.create({ col: 4, row: 1 }, npcBattle('adventurer-b', 'goblin-b'));
    expect(controller.getSnapshot().battles.map((battle) => battle.id)).toEqual([first.id, second.id]);
    expect(controller.battles.at({ col: 2, row: 1 })?.id).toBe(first.id);
    expect(controller.battles.at({ col: 4, row: 1 })?.id).toBe(second.id);
  });

  it('queues a solo actor that naturally reaches an existing battle tile', () => {
    const withAdventurer: WorldMap = { ...map, settlements: [{ id: 'solo', name: 'Solo', kind: 'village', countryId: 'x', col: 2, row: 1, radius: 1, bounds: { left: 1, top: 0, right: 3, bottom: 2 }, gates: [] }] };
    const controller = createGameController(withAdventurer);
    const battle = controller.battles.create({ col: 2, row: 1 }, npcBattle('other', 'goblin-a'));
    controller.tick(1 / 60);
    expect(controller.battles.membership('adventurer-solo')?.battleId).toBe(battle.id);
  });

  it('uses bounded 64-step route fields and stable nearest selection', () => {
    // A one-cell corridor folds back beside its start. The battle is within
    // the eight-tile sensing radius, while the only cardinal route is long.
    const corridor = (length: number): WorldMap => {
      const width = length + 1;
      return { width, height: 1, spawn: { col: 0, row: 0 }, tiles: Array.from({ length: width }, (_, col) => ({ col, row: 0, kind: 'grass' as const, walkable: true })), settlements: [{ id: 'walker', name: 'Walker', kind: 'village', countryId: 'x', col: 0, row: 0, radius: 0, bounds: { left: 0, top: 0, right: 0, bottom: 0 }, gates: [] }] };
    };
    const within = createGameController(corridor(64));
    const first = within.battles.create({ col: 8, row: 0 }, npcBattle('a', 'g'));
    const tied = within.battles.create({ col: 8, row: 0 }, npcBattle('b', 'h'));
    within.tick(.1);
    expect(within.battles.membership('adventurer-walker')?.battleId).toBe(first.id);
    expect(tied.id).toBe(first.id);
    const outside = createGameController(corridor(65));
    outside.battles.create({ col: 65, row: 0 }, npcBattle('a', 'g'));
    outside.tick(.1);
    expect(outside.battles.membership('adventurer-walker')).toBeUndefined();
  });

  it('breaks equal exact route distances by battle creation ID', () => {
    const tieMap: WorldMap = { width: 6, height: 3, spawn: { col: 2, row: 1 }, tiles: Array.from({ length: 18 }, (_, index) => ({ col: index % 6, row: Math.floor(index / 6), kind: 'grass' as const, walkable: true })), settlements: [{ id: 'tie', name: 'Tie', kind: 'village', countryId: 'x', col: 2, row: 1, radius: 0, bounds: { left: 2, top: 1, right: 2, bottom: 1 }, gates: [] }] };
    const controller = createGameController(tieMap);
    const first = controller.battles.create({ col: 1, row: 1 }, npcBattle('a', 'g'));
    controller.battles.create({ col: 3, row: 1 }, npcBattle('b', 'h'));
    controller.tick(.1);
    expect(controller.battles.membership('adventurer-tie')?.battleId).toBe(first.id);
  });

  it('admits a waiting reinforcement before declaring a lethal terminal result', () => {
    const controller = createGameController(map);
    controller.startBattleForTest('goblin-a');
    const battle = controller.battles.all()[0]!;
    controller.battles.queue(battle.id, { id: 'goblin-b', kind: 'goblin', approachEdge: 'east', arrivalStep: 0 });
    battle.battle.combatants.player.position = { col: 4, row: 3 };
    battle.battle.combatants['goblin-a']!.position = { col: 5, row: 3 };
    battle.battle.combatants['goblin-a']!.hp = 4;
    controller.dispatchBattle({ kind: 'attack', actorId: 'player', targetId: 'goblin-a' });
    expect(controller.mode).toBe('battle');
    expect(controller.battle?.combatants['goblin-b']).toBeDefined();
  });

  it('keeps allied combat alive after player defeat and allows player reentry', () => {
    const controller = createGameController(map);
    controller.startBattleForTest('goblin-a');
    const battle = controller.battles.all()[0]!;
    const ally = createCombatant('ally', 'player', { col: 2, row: 4 }, 'adventurer');
    battle.battle.combatants.ally = ally; battle.battle.turnOrder.push(ally.id);
    battle.battle.combatants.player.position = { col: 4, row: 3 };
    battle.battle.combatants.player.hp = 3;
    battle.battle.combatants['goblin-a']!.position = { col: 5, row: 3 };
    battle.battle.activeId = 'goblin-a';
    expect(controller.dispatchBattle({ kind: 'attack', actorId: 'goblin-a', targetId: 'player' })).toBe(true);
    expect(controller.mode).toBe('result');
    expect(controller.battles.get(battle.id)).toBeDefined();
    controller.continueFromResult();
    controller.tick(0);
    controller.tick(0);
    expect(controller.getSnapshot().playerEntry).toBe('admitted');
  });

  it('keeps another battle when a completed battle is cleaned up', () => {
    const controller = createGameController(map);
    controller.startBattleForTest('goblin-a');
    const other = controller.battles.create({ col: 4, row: 1 }, npcBattle('other-a', 'other-g'));
    const battle = controller.battles.all().find((value) => value.id !== other.id)!;
    battle.battle.combatants.player.position = { col: 4, row: 3 };
    battle.battle.combatants['goblin-a']!.position = { col: 5, row: 3 };
    battle.battle.combatants['goblin-a']!.hp = 4;
    controller.dispatchBattle({ kind: 'attack', actorId: 'player', targetId: 'goblin-a' });
    expect(controller.battles.get(other.id)).toBeDefined();
  });
});
