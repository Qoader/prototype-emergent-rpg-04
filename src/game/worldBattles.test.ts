import { describe, expect, it } from 'vitest';
import { createBattle } from './battle/engine';
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
});
