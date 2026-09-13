import { describe, expect, it } from 'vitest';
import { createBattle } from './battle/engine';
import { createCombatant } from './battle/rules';
import { createWorldBattleRegistry } from './worldBattles';

describe('world battle registry', () => {
  it('keeps one battle per tile and one membership per actor', () => {
    const registry = createWorldBattleRegistry();
    const first = registry.create({ col: 2, row: 3 }, createBattle('goblin-a'));
    const duplicate = registry.create({ col: 2, row: 3 }, createBattle('goblin-b'));
    expect(duplicate.id).toBe(first.id);
    expect(registry.queue(first.id, { id: 'adventurer-a', kind: 'adventurer', approachEdge: 'west', arrivalStep: 1 })).toBe(true);
    expect(registry.queue(first.id, { id: 'adventurer-a', kind: 'adventurer', approachEdge: 'west', arrivalStep: 2 })).toBe(false);
    expect(registry.summaries()).toHaveLength(1);
    registry.remove(first.id);
    expect(registry.membership('adventurer-a')).toBeUndefined();
  });

  it('projects stable living representatives, preferring an adventurer over player', () => {
    const registry = createWorldBattleRegistry();
    const battle = createBattle([
      createCombatant('player', 'player', { col: 2, row: 4 }),
      createCombatant('adventurer-first', 'player', { col: 2, row: 4 }, 'adventurer'),
      createCombatant('adventurer-second', 'player', { col: 2, row: 4 }, 'adventurer'),
      createCombatant('goblin-first', 'goblin', { col: 6, row: 4 }),
      createCombatant('goblin-second', 'goblin', { col: 6, row: 4 })
    ]);
    registry.create({ col: 2, row: 3 }, battle);
    expect(registry.summaries()[0]).toMatchObject({
      adventurers: 2,
      goblins: 2,
      representatives: {
        allied: { id: 'adventurer-first', kind: 'adventurer' },
        opposing: { id: 'goblin-first', kind: 'goblin' }
      },
      clashing: true
    });
    battle.combatants['adventurer-first']!.hp = 0;
    battle.combatants['goblin-first']!.hp = 0;
    expect(registry.summaries()[0]?.representatives).toEqual({
      allied: { id: 'adventurer-second', kind: 'adventurer' },
      opposing: { id: 'goblin-second', kind: 'goblin' }
    });
  });

  it('falls back to the player and excludes unadmitted reinforcements', () => {
    const registry = createWorldBattleRegistry();
    const value = registry.create({ col: 2, row: 3 }, createBattle('goblin'));
    registry.queue(value.id, { id: 'adventurer-waiting', kind: 'adventurer', approachEdge: 'west', arrivalStep: 2 });
    const summary = registry.summaries()[0]!;
    expect(summary.representatives.allied).toEqual({ id: 'player', kind: 'player' });
    expect(summary.adventurers).toBe(0);
    value.battle.combatants.player.hp = 0;
    expect(registry.summaries()[0]).toMatchObject({
      representatives: { allied: null, opposing: { id: 'goblin', kind: 'goblin' } },
      clashing: false
    });
  });

  it('stops clashing as soon as a battle has an outcome or finished phase', () => {
    const registry = createWorldBattleRegistry();
    const value = registry.create({ col: 2, row: 3 }, createBattle('goblin'));
    value.battle.outcome = 'victory';
    expect(registry.summaries()[0]?.clashing).toBe(false);
    value.battle.outcome = null;
    value.battle.phase = 'finished';
    expect(registry.summaries()[0]?.clashing).toBe(false);
  });
});
