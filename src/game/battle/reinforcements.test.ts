import { describe, expect, it } from 'vitest';
import { createBattle } from './engine';
import { admitReinforcements } from './reinforcements';

describe('tactical reinforcements', () => {
  it('orders simultaneous arrivals, uses approach edges, and delays their turns', () => {
    const state = createBattle('first');
    const events: typeof state.log = [];
    admitReinforcements(state, [
      { id: 'g-2', kind: 'goblin', approachEdge: 'east', arrivalStep: 4 },
      { id: 'ally', kind: 'adventurer', approachEdge: 'west', arrivalStep: 2 },
      { id: 'g-1', kind: 'goblin', approachEdge: 'north', arrivalStep: 4 }
    ], events);
    expect(state.turnOrder.slice(-3)).toEqual(['ally', 'g-1', 'g-2']);
    expect(state.combatants.ally.position.col).toBe(0);
    expect(state.combatants['g-1'].position.row).toBe(0);
    expect(state.combatants['g-2'].position.col).toBe(state.width - 1);
    expect(Object.values(state.combatants).slice(-3).every((c) => c.eligibleFromRound === 2)).toBe(true);
  });

  it('queues an arrival when every perimeter cell is occupied', () => {
    const state = createBattle('first');
    let next = 0;
    for (let row = 0; row < state.height; row++) for (let col = 0; col < state.width; col++) {
      if (row && col && row < state.height - 1 && col < state.width - 1) continue;
      const id = `block-${next++}`;
      state.combatants[id] = { ...state.combatants.player!, id, position: { col, row } };
    }
    const pending = admitReinforcements(state, [{ id: 'late', kind: 'goblin', approachEdge: 'north', arrivalStep: 1 }], []);
    expect(pending.map((item) => item.id)).toEqual(['late']);
  });
});
