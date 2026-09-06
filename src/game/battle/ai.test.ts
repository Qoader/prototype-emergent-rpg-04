import { describe, expect, it } from 'vitest';
import { chooseGoblinCommand } from './ai';
import { applyBattleCommand, createBattle } from './engine';
describe('goblin tactical AI', () => {
  it('advances toward a distant player using a partial shortest path', () => {
    let state = createBattle('g'); state = applyBattleCommand(state, { kind:'end-turn', actorId:'player' }).state;
    expect(chooseGoblinCommand(state)).toEqual({ kind: 'move', actorId: 'g', destination: { col: 2, row: 3 } });
  });
  it('attacks when adjacent before considering movement', () => {
    let state = createBattle('g'); state.combatants.g.position = { col: 2, row: 3 }; state = applyBattleCommand(state, { kind:'end-turn', actorId:'player' }).state;
    expect(chooseGoblinCommand(state)).toEqual({ kind: 'attack', actorId: 'g', targetId: 'player' });
  });
});
